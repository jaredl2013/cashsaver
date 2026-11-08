import type { Design, DesignSummary } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || 'request_failed', body.message);
  return body as T;
}

export const api = {
  session: () => request<{ authed: boolean }>('/api/session'),
  login: (password: string) => request<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),

  listDesigns: () => request<DesignSummary[]>('/api/designs'),
  getDesign: (id: string) => request<Design>(`/api/designs/${encodeURIComponent(id)}`),
  createDesign: (design: Design, thumbnail: string | null) =>
    request<{ id: string }>('/api/designs', { method: 'POST', body: JSON.stringify({ design, thumbnail }) }),
  updateDesign: (id: string, design: Design, thumbnail: string | null) =>
    request<{ id: string }>(`/api/designs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ design, thumbnail })
    }),
  deleteDesign: (id: string) => request<{ ok: true }>(`/api/designs/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  photoSearch: (q: string) =>
    request<{ photos: { id: number; alt: string; small: string; medium: string }[] }>(
      `/api/photo-search?q=${encodeURIComponent(q)}`
    )
};
