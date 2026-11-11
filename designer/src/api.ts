import type { Design, DesignSummary } from './types';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'member';
  superadmin: boolean;
  businessId: number;
}
export interface SessionInfo {
  authed: boolean;
  setupNeeded?: boolean;
  user?: SessionUser;
  business?: { id: number; name: string };
}
export interface TeamMember {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'member';
  is_superadmin: boolean;
  disabled: boolean;
  last_login_at: number | null;
}
export interface BusinessRow {
  id: number;
  name: string;
  user_count: number;
  created_at: number;
}

/** Plain-language messages for the server's error codes. */
export const ERROR_TEXT: Record<string, string> = {
  wrong_password: 'That email and password don’t match.',
  too_many_attempts: 'Too many tries. Wait 15 minutes and try again.',
  wrong_setup_password: 'That setup password doesn’t match SHARED_PASSWORD in the server settings.',
  bad_email: 'Enter a valid email address.',
  password_too_short: 'Passwords need at least 8 characters.',
  email_taken: 'Someone already has an account with that email.',
  business_name_required: 'Enter the business name.',
  cannot_change_own_access: 'You can’t remove your own admin access or disable yourself.',
  already_set_up: 'This install is already set up. Sign in instead.'
};
export const errorText = (err: unknown) =>
  (err instanceof ApiError && ERROR_TEXT[err.code]) || 'Something went wrong. Try again.';

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
  session: () => request<SessionInfo>('/api/session'),
  login: (email: string, password: string) =>
    request<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  setup: (body: { sharedPassword: string; businessName: string; name: string; email: string; password: string }) =>
    request<{ ok: true }>('/api/setup', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>('/api/account/password', { method: 'POST', body: JSON.stringify({ current, next }) }),

  team: () => request<TeamMember[]>('/api/team'),
  addTeamMember: (body: { email: string; name: string; password: string; role: 'admin' | 'member' }) =>
    request<{ id: number }>('/api/team', { method: 'POST', body: JSON.stringify(body) }),
  updateTeamMember: (id: number, body: Partial<{ name: string; role: 'admin' | 'member'; disabled: boolean; password: string }>) =>
    request<{ ok: true }>(`/api/team/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  businesses: () => request<BusinessRow[]>('/api/businesses'),
  createBusiness: (body: { name: string; adminEmail?: string; adminName?: string; adminPassword?: string }) =>
    request<{ id: number }>('/api/businesses', { method: 'POST', body: JSON.stringify(body) }),
  renameBusiness: (id: number, name: string) =>
    request<{ ok: true }>(`/api/businesses/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  switchBusiness: (id: number) => request<{ ok: true }>(`/api/businesses/${id}/switch`, { method: 'POST' }),
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

  upload: async (dataUrl: string) =>
    (await request<{ url: string }>('/api/uploads', { method: 'POST', body: JSON.stringify({ dataUrl }) })).url,

  photoSearch: (q: string) =>
    request<{ photos: { id: number; alt: string; small: string; medium: string }[] }>(
      `/api/photo-search?q=${encodeURIComponent(q)}`
    )
};
