import { create } from 'zustand';
import type { Design, DesignElement, ElementDraft, Page } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function blankDesign(width = 816, height = 1056, sizeLabel = 'Flyer (Letter)'): Design {
  return {
    id: null,
    name: 'Untitled design',
    width,
    height,
    sizeLabel,
    pages: [{ id: uid(), background: '#ffffff', elements: [] }]
  };
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 600;

interface HistoryEntry {
  design: Design;
  key?: string;
  at: number;
}

interface EditorState {
  design: Design;
  pageIndex: number;
  selectedIds: string[];
  editingTextId: string | null;
  zoom: number; // 0 = fit
  fitZoom: number;
  past: HistoryEntry[];
  future: Design[];
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  clipboard: DesignElement[];

  page: () => Page;
  selectedElements: () => DesignElement[];

  loadDesign: (design: Design) => void;
  setName: (name: string) => void;
  resizeDesign: (width: number, height: number, sizeLabel: string, scaleContent: boolean) => void;
  setBackground: (color: string) => void;

  addElements: (drafts: ElementDraft[], at?: { x: number; y: number }, options?: { scale?: boolean; group?: boolean }) => void;
  updateElements: (ids: string[], patch: Partial<DesignElement> | ((el: DesignElement) => Partial<DesignElement>), coalesceKey?: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  paste: () => void;
  reorder: (direction: 'up' | 'down' | 'top' | 'bottom') => void;
  align: (edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void;
  nudge: (dx: number, dy: number) => void;
  /** Record a measured text height without creating an undo step. */
  setTextHeight: (id: string, height: number) => void;
  group: () => void;
  ungroup: () => void;

  goToPage: (index: number) => void;
  addPage: (afterIndex?: number) => void;
  duplicatePage: (index: number) => void;
  deletePage: (index: number) => void;
  movePage: (from: number, to: number) => void;
  /** Append pages of elements in one undo step (used by "fill pages" layouts). */
  addElementsAcrossPages: (perPage: DesignElement[][], startPage: number) => void;

  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  setEditingText: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setFitZoom: (zoom: number) => void;

  undo: () => void;
  redo: () => void;
  markSaved: (id: string, saved: Design) => void;
  setSaving: (saving: boolean) => void;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const useEditor = create<EditorState>((set, get) => {
  /** Apply a change to the design, recording the previous state for undo. */
  const commit = (mutate: (draft: Design) => void, coalesceKey?: string) => {
    const { design, past } = get();
    const next = clone(design);
    mutate(next);
    const now = Date.now();
    const last = past[past.length - 1];
    const coalesce = coalesceKey && last && last.key === coalesceKey && now - last.at < COALESCE_MS;
    const nextPast = coalesce
      ? [...past.slice(0, -1), { ...last, at: now }]
      : [...past, { design, key: coalesceKey, at: now }].slice(-HISTORY_LIMIT);
    set({ design: next, past: nextPast, future: [], dirty: true });
  };

  const currentElements = (d: Design) => d.pages[get().pageIndex].elements;

  return {
    design: blankDesign(),
    pageIndex: 0,
    selectedIds: [],
    editingTextId: null,
    zoom: 0,
    fitZoom: 0.6,
    past: [],
    future: [],
    dirty: false,
    saving: false,
    lastSavedAt: null,
    clipboard: [],

    page: () => get().design.pages[get().pageIndex],
    selectedElements: () => {
      const ids = new Set(get().selectedIds);
      return get().page().elements.filter((el) => ids.has(el.id));
    },

    loadDesign: (design) =>
      set({ design, pageIndex: 0, selectedIds: [], editingTextId: null, past: [], future: [], dirty: false, zoom: 0 }),

    setName: (name) => {
      commit((d) => {
        d.name = name;
      });
    },

    resizeDesign: (width, height, sizeLabel, scaleContent) => {
      commit((d) => {
        if (scaleContent) {
          const sx = width / d.width;
          const sy = height / d.height;
          const s = Math.min(sx, sy);
          const offsetX = (width - d.width * s) / 2;
          const offsetY = (height - d.height * s) / 2;
          for (const page of d.pages) {
            for (const el of page.elements) {
              el.x = el.x * s + offsetX;
              el.y = el.y * s + offsetY;
              el.width *= s;
              el.height *= s;
              if (el.type === 'text') el.fontSize = Math.round(el.fontSize * s * 10) / 10;
              if ('strokeWidth' in el && el.strokeWidth) el.strokeWidth *= s;
            }
          }
        }
        d.width = width;
        d.height = height;
        d.sizeLabel = sizeLabel;
      });
      set({ zoom: 0 });
    },

    setBackground: (color) =>
      commit((d) => {
        d.pages[get().pageIndex].background = color;
      }, 'background'),

    addElements: (drafts, at, options = {}) => {
      if (!drafts.length) return;
      const { design } = get();
      const minX = Math.min(...drafts.map((e) => e.x));
      const minY = Math.min(...drafts.map((e) => e.y));
      const maxX = Math.max(...drafts.map((e) => e.x + e.width));
      const maxY = Math.max(...drafts.map((e) => e.y + Math.max(e.height, 1)));
      const groupW = maxX - minX;
      const groupH = maxY - minY;
      // Scale presets so they look right on both a postcard and a poster.
      const scale = options.scale === false ? 1 : Math.min(1.6, Math.max(0.35, Math.min(design.width, design.height) / 900));
      // Multi-part presets (badges, combos, product tiles) stay together as a group.
      const groupId = drafts.length > 1 && options.group !== false ? uid() : undefined;
      const cx = at ? at.x : design.width / 2;
      const cy = at ? at.y : design.height / 2;
      const originX = cx - (groupW * scale) / 2;
      const originY = cy - (groupH * scale) / 2;
      const added: DesignElement[] = drafts.map((draft) => {
        const el = clone(draft) as DesignElement;
        el.id = uid();
        if (groupId) el.groupId = groupId;
        el.x = originX + (draft.x - minX) * scale;
        el.y = originY + (draft.y - minY) * scale;
        el.width = draft.width * scale;
        el.height = draft.height * scale;
        if (el.type === 'text') {
          el.fontSize = Math.round(el.fontSize * scale);
          el.letterSpacing = el.letterSpacing * scale;
        }
        if ('strokeWidth' in el && el.strokeWidth) el.strokeWidth = Math.max(1, el.strokeWidth * scale);
        return el;
      });
      commit((d) => {
        currentElements(d).push(...added);
      });
      set({ selectedIds: added.map((e) => e.id) });
    },

    updateElements: (ids, patch, coalesceKey) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      commit((d) => {
        const els = currentElements(d);
        for (let i = 0; i < els.length; i++) {
          if (!idSet.has(els[i].id)) continue;
          const p = typeof patch === 'function' ? patch(els[i]) : patch;
          els[i] = { ...els[i], ...p } as DesignElement;
        }
      }, coalesceKey);
    },

    deleteSelected: () => {
      const ids = new Set(get().selectedIds);
      if (!ids.size) return;
      commit((d) => {
        const page = d.pages[get().pageIndex];
        page.elements = page.elements.filter((e) => !ids.has(e.id) || e.locked);
      });
      set({ selectedIds: [] });
    },

    duplicateSelected: () => {
      const els = get().selectedElements();
      if (!els.length) return;
      const copies = remapGroups(els.map((e) => ({ ...clone(e), id: uid(), x: e.x + 24, y: e.y + 24, locked: false })));
      commit((d) => {
        currentElements(d).push(...copies);
      });
      set({ selectedIds: copies.map((c) => c.id) });
    },

    copySelected: () => set({ clipboard: clone(get().selectedElements()) }),

    paste: () => {
      const items = get().clipboard;
      if (!items.length) return;
      const copies = remapGroups(items.map((e) => ({ ...clone(e), id: uid(), x: e.x + 24, y: e.y + 24 })));
      commit((d) => {
        currentElements(d).push(...copies);
      });
      set({ selectedIds: copies.map((c) => c.id), clipboard: copies });
    },

    reorder: (direction) => {
      const ids = new Set(get().selectedIds);
      if (!ids.size) return;
      commit((d) => {
        const page = d.pages[get().pageIndex];
        const els = page.elements;
        const picked = els.filter((e) => ids.has(e.id));
        const rest = els.filter((e) => !ids.has(e.id));
        if (direction === 'top') page.elements = [...rest, ...picked];
        else if (direction === 'bottom') page.elements = [...picked, ...rest];
        else if (direction === 'up') {
          for (let i = els.length - 2; i >= 0; i--) {
            if (ids.has(els[i].id) && !ids.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]];
          }
        } else {
          for (let i = 1; i < els.length; i++) {
            if (ids.has(els[i].id) && !ids.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]];
          }
        }
      });
    },

    align: (edge) => {
      const els = get().selectedElements();
      if (!els.length) return;
      const { width: W, height: H } = get().design;
      // A single element aligns to the page; several align to their shared bounds.
      const bounds =
        els.length === 1
          ? { x1: 0, y1: 0, x2: W, y2: H }
          : {
              x1: Math.min(...els.map((e) => e.x)),
              y1: Math.min(...els.map((e) => e.y)),
              x2: Math.max(...els.map((e) => e.x + e.width)),
              y2: Math.max(...els.map((e) => e.y + e.height))
            };
      get().updateElements(
        els.map((e) => e.id),
        (e) => {
          switch (edge) {
            case 'left': return { x: bounds.x1 };
            case 'right': return { x: bounds.x2 - e.width };
            case 'hcenter': return { x: (bounds.x1 + bounds.x2) / 2 - e.width / 2 };
            case 'top': return { y: bounds.y1 };
            case 'bottom': return { y: bounds.y2 - e.height };
            case 'vcenter': return { y: (bounds.y1 + bounds.y2) / 2 - e.height / 2 };
          }
        }
      );
    },

    nudge: (dx, dy) => {
      const ids = get().selectedElements().filter((e) => !e.locked).map((e) => e.id);
      get().updateElements(ids, (e) => ({ x: e.x + dx, y: e.y + dy }), 'nudge');
    },

    setTextHeight: (id, height) => {
      const { design, pageIndex } = get();
      const page = design.pages[pageIndex];
      const idx = page.elements.findIndex((e) => e.id === id);
      if (idx < 0) return;
      const elements = page.elements.slice();
      elements[idx] = { ...elements[idx], height };
      const pages = design.pages.slice();
      pages[pageIndex] = { ...page, elements };
      set({ design: { ...design, pages } });
    },

    group: () => {
      const ids = get().selectedIds;
      if (ids.length < 2) return;
      const groupId = uid();
      get().updateElements(ids, { groupId });
    },
    ungroup: () => {
      const ids = get().selectedIds;
      get().updateElements(ids, { groupId: undefined });
    },

    goToPage: (index) => {
      const n = get().design.pages.length;
      set({ pageIndex: Math.max(0, Math.min(n - 1, index)), selectedIds: [], editingTextId: null });
    },
    addPage: (afterIndex) => {
      const at = (afterIndex ?? get().pageIndex) + 1;
      const background = get().page().background;
      commit((d) => {
        d.pages.splice(at, 0, { id: uid(), background, elements: [] });
      });
      set({ pageIndex: at, selectedIds: [], editingTextId: null });
    },
    duplicatePage: (index) => {
      commit((d) => {
        const src = d.pages[index];
        const copy = clone(src);
        copy.id = uid();
        copy.elements = remapGroups(copy.elements.map((e) => ({ ...e, id: uid() })));
        d.pages.splice(index + 1, 0, copy);
      });
      set({ pageIndex: index + 1, selectedIds: [], editingTextId: null });
    },
    deletePage: (index) => {
      if (get().design.pages.length <= 1) return;
      commit((d) => {
        d.pages.splice(index, 1);
      });
      set({ pageIndex: Math.min(index, get().design.pages.length - 1), selectedIds: [], editingTextId: null });
    },
    movePage: (from, to) => {
      const n = get().design.pages.length;
      if (to < 0 || to >= n || from === to) return;
      commit((d) => {
        const [p] = d.pages.splice(from, 1);
        d.pages.splice(to, 0, p);
      });
      set({ pageIndex: to, selectedIds: [] });
    },
    addElementsAcrossPages: (perPage, startPage) => {
      const background = get().design.pages[startPage]?.background ?? '#ffffff';
      commit((d) => {
        perPage.forEach((els, i) => {
          const idx = startPage + i;
          if (!d.pages[idx]) d.pages.push({ id: uid(), background, elements: [] });
          d.pages[idx].elements.push(...els);
        });
      });
      set({ pageIndex: startPage, selectedIds: perPage[0]?.map((e) => e.id) ?? [], editingTextId: null });
    },

    select: (ids) => set({ selectedIds: ids, editingTextId: null }),
    toggleSelect: (id) => {
      const cur = get().selectedIds;
      set({ selectedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
    },
    setEditingText: (id) => set({ editingTextId: id }),
    setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0, zoom)) }),
    setFitZoom: (fitZoom) => set({ fitZoom }),

    undo: () => {
      const { past, design, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ design: prev.design, past: past.slice(0, -1), future: [design, ...future], dirty: true, editingTextId: null });
      pruneSelection();
    },
    redo: () => {
      const { past, design, future } = get();
      const next = future[0];
      if (!next) return;
      set({ design: next, past: [...past, { design, at: 0 }], future: future.slice(1), dirty: true, editingTextId: null });
      pruneSelection();
    },
    // Only clear "unsaved" if nothing changed while the save was in flight.
    markSaved: (id, saved) =>
      set((s) => ({
        design: { ...s.design, id },
        past: s.past.map((h) => ({ ...h, design: { ...h.design, id } })),
        dirty: s.design !== saved,
        saving: false,
        lastSavedAt: Date.now()
      })),
    setSaving: (saving) => set({ saving })
  };

  function remapGroups<T extends DesignElement>(els: T[]): T[] {
    const map = new Map<string, string>();
    return els.map((e) => {
      if (!e.groupId) return e;
      if (!map.has(e.groupId)) map.set(e.groupId, uid());
      return { ...e, groupId: map.get(e.groupId) };
    });
  }

  function pruneSelection() {
    const n = get().design.pages.length;
    if (get().pageIndex >= n) set({ pageIndex: n - 1 });
    const existing = new Set(get().page().elements.map((e) => e.id));
    set({ selectedIds: get().selectedIds.filter((id) => existing.has(id)) });
  }
});

/** The zoom actually used for rendering (0 means "fit to screen"). */
export const useEffectiveZoom = () => useEditor((s) => (s.zoom === 0 ? s.fitZoom : s.zoom));
