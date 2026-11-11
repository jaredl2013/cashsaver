import type { DesignElement, ImageElement, ShapeElement, TextElement } from './types';
import { textDraft } from './presets';
import { uid } from './store';

/** A row from the shared product catalog (/api/products). */
export interface Product {
  name_key: string;
  display_name: string;
  description?: string;
  category?: string;
  img: string | null;
  price: string;
  unit: string;
  unit_custom?: string;
}

export type TileStyle = 'classic' | 'bold' | 'clean';

export const TILE_STYLES: { id: TileStyle; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'bold', label: 'Bold' },
  { id: 'clean', label: 'Clean' }
];

export function unitLabel(p: Product) {
  const u = p.unit === 'other' ? p.unit_custom || '' : p.unit || '';
  if (!u) return '';
  return u === 'each' || u === 'ea.' ? 'each' : `per ${u.replace(/\.$/, '')}`;
}

export function priceParts(price: string) {
  const n = Number(price);
  if (!Number.isFinite(n)) return { dollars: price, cents: '' };
  const [d, c] = n.toFixed(2).split('.');
  return { dollars: d, cents: c };
}

export function formatPrice(p: Product) {
  const { dollars, cents } = priceParts(p.price);
  return `$${dollars}.${cents}`;
}

const STYLE = {
  classic: { card: '#ffffff', border: '#e5e7eb', name: '#111111', price: '#dc2626', unit: '#52525b', badge: null as string | null, priceText: '#dc2626' },
  bold: { card: '#ffffff', border: '#111111', name: '#111111', price: '#facc15', unit: '#111111', badge: '#facc15', priceText: '#dc2626' },
  clean: { card: 'transparent', border: 'transparent', name: '#1f2937', price: '#1f2937', unit: '#6b7280', badge: null, priceText: '#16a34a' }
};

/**
 * Build the elements for one product tile filling the box (x, y, w, h):
 * photo on top, name underneath, and a big split price ($4⁹⁹) at the bottom.
 */
export function buildProductTile(p: Product, box: { x: number; y: number; w: number; h: number }, style: TileStyle = 'classic'): DesignElement[] {
  const s = STYLE[style];
  const { x, y, w, h } = box;
  const pad = Math.max(6, Math.round(Math.min(w, h) * 0.05));
  const groupId = uid();
  const out: DesignElement[] = [];
  const base = { rotation: 0, opacity: 1, groupId };

  if (s.card !== 'transparent' || s.border !== 'transparent') {
    const card: ShapeElement = {
      ...base, id: uid(), type: 'rect', x, y, width: w, height: h,
      fill: s.card, stroke: s.border, strokeWidth: style === 'bold' ? Math.max(2, w * 0.012) : 1.5, cornerRadius: Math.min(w, h) * 0.04
    };
    out.push(card);
  }

  const priceH = h * 0.24;
  const nameH = h * 0.16;
  const imgH = h - priceH - nameH - pad * 3;
  const imgW = w - pad * 2;

  if (p.img && imgH > 10) {
    const img: ImageElement = { ...base, id: uid(), type: 'image', x: x + pad, y: y + pad, width: imgW, height: imgH, src: p.img, fit: 'contain', cornerRadius: Math.min(imgW, imgH) * 0.03 };
    out.push(img);
  }

  const nameSize = Math.max(8, Math.min(nameH * 0.42, w * 0.075));
  const name: TextElement = {
    ...textDraft({ text: p.display_name, fontSize: nameSize, fontFamily: 'Poppins', fontStyle: '600', fill: s.name, width: w - pad * 2, lineHeight: 1.1 }),
    ...base, id: uid(), x: x + pad, y: y + pad + Math.max(imgH, 0) + pad * 0.6
  };
  out.push(name);

  const { dollars, cents } = priceParts(p.price);
  const big = Math.max(10, Math.min(priceH * 0.9, w * 0.28));
  const small = big * 0.42;
  const priceY = y + h - pad - priceH + (priceH - big) / 2;
  // Rough measurement so the split price stays centered. Leave slack: Konva drops a word
  // that's wider than its box instead of overflowing it.
  const dollarW = Math.max(1, dollars.length) * big * 0.82 + big * 0.1;
  const sideW = Math.max(small * 2.6, big * 0.75);
  const totalW = small * 0.7 + dollarW + sideW;
  let cursor = x + (w - totalW) / 2;

  if (s.badge) {
    const badge: ShapeElement = {
      ...base, id: uid(), type: 'rect', x: x + pad, y: y + h - pad - priceH, width: w - pad * 2, height: priceH,
      fill: s.badge, stroke: '#000000', strokeWidth: 0, cornerRadius: priceH * 0.2
    };
    out.push(badge);
  }

  const priceFont = 'Archivo Black';
  out.push({
    ...textDraft({ text: '$', fontSize: small, fontFamily: priceFont, fill: s.priceText, width: small * 0.7, align: 'right', lineHeight: 1 }),
    ...base, id: uid(), x: cursor, y: priceY + big * 0.08
  });
  cursor += small * 0.7;
  out.push({
    ...textDraft({ text: dollars, fontSize: big, fontFamily: priceFont, fill: s.priceText, width: dollarW, align: 'center', lineHeight: 1 }),
    ...base, id: uid(), x: cursor, y: priceY
  });
  cursor += dollarW;
  out.push({
    ...textDraft({ text: cents, fontSize: small, fontFamily: priceFont, fill: s.priceText, width: sideW, align: 'left', lineHeight: 1 }),
    ...base, id: uid(), x: cursor, y: priceY + big * 0.08
  });
  const unit = unitLabel(p);
  if (unit) {
    out.push({
      ...textDraft({ text: unit, fontSize: small * 0.62, fontFamily: 'Inter', fontStyle: '600', fill: s.unit, width: sideW, align: 'left', lineHeight: 1 }),
      ...base, id: uid(), x: cursor, y: priceY + big * 0.08 + small * 1.1
    });
  }
  return out;
}

export interface GridOptions {
  columns: number;
  rows: number;
  /** Top area to leave free for a header, as a fraction of page height. */
  headerFraction: number;
  style: TileStyle;
}

/** Lay products out in a grid, page after page, starting with the current one. */
export function layoutProductPages(products: Product[], page: { width: number; height: number }, opts: GridOptions): DesignElement[][] {
  const margin = Math.round(Math.min(page.width, page.height) * 0.045);
  const gap = Math.round(margin * 0.5);
  const top = margin + page.height * opts.headerFraction;
  const cellW = (page.width - margin * 2 - gap * (opts.columns - 1)) / opts.columns;
  const cellH = (page.height - top - margin - gap * (opts.rows - 1)) / opts.rows;
  const perPage = opts.columns * opts.rows;
  const pages: DesignElement[][] = [];
  products.forEach((p, i) => {
    const pageNo = Math.floor(i / perPage);
    const slot = i % perPage;
    const col = slot % opts.columns;
    const row = Math.floor(slot / opts.columns);
    (pages[pageNo] ||= []).push(
      ...buildProductTile(p, { x: margin + col * (cellW + gap), y: top + row * (cellH + gap), w: cellW, h: cellH }, opts.style)
    );
  });
  return pages;
}
