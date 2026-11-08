import type { ElementDraft, LineElement, ShapeElement, TextElement } from './types';

/** Design units are CSS pixels at 96 DPI, so print sizes convert cleanly. */
export interface SizePreset {
  label: string;
  group: 'Print' | 'Social' | 'Web';
  width: number;
  height: number;
  hint: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { label: 'Flyer (Letter)', group: 'Print', width: 816, height: 1056, hint: '8.5 × 11 in' },
  { label: 'Sales paper (Tabloid)', group: 'Print', width: 1056, height: 1632, hint: '11 × 17 in' },
  { label: 'Half-page ad', group: 'Print', width: 816, height: 528, hint: '8.5 × 5.5 in' },
  { label: 'Poster', group: 'Print', width: 1728, height: 2592, hint: '18 × 27 in' },
  { label: 'Postcard', group: 'Print', width: 576, height: 384, hint: '6 × 4 in' },
  { label: 'Square post', group: 'Social', width: 1080, height: 1080, hint: '1080 × 1080 px' },
  { label: 'Portrait post', group: 'Social', width: 1080, height: 1350, hint: '1080 × 1350 px' },
  { label: 'Story', group: 'Social', width: 1080, height: 1920, hint: '1080 × 1920 px' },
  { label: 'Facebook cover', group: 'Social', width: 1640, height: 624, hint: '1640 × 624 px' },
  { label: 'Web banner', group: 'Web', width: 1456, height: 180, hint: '728 × 90 @2x' },
  { label: 'Display ad', group: 'Web', width: 600, height: 500, hint: '300 × 250 @2x' }
];

export const FONTS = [
  'Inter',
  'Poppins',
  'Montserrat',
  'Oswald',
  'Anton',
  'Bebas Neue',
  'Archivo Black',
  'Playfair Display',
  'Roboto Slab',
  'Lobster',
  'Pacifico',
  'Caveat',
  'Arial',
  'Georgia',
  'Times New Roman'
];

export const SWATCHES = [
  '#000000', '#3f3f46', '#a1a1aa', '#ffffff',
  '#dc2626', '#f97316', '#facc15', '#16a34a',
  '#0d9488', '#2563eb', '#7c3aed', '#db2777',
  '#7f1d1d', '#14532d', '#1e3a8a', '#fef3c7'
];

const baseText: Omit<TextElement, 'text' | 'fontSize' | 'width' | 'height'> = {
  id: '',
  type: 'text',
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  fontFamily: 'Inter',
  fontStyle: 'normal',
  textDecoration: '',
  fill: '#111111',
  align: 'center',
  lineHeight: 1.15,
  letterSpacing: 0
};

export function textDraft(partial: Partial<TextElement> & { text: string; fontSize: number }): TextElement {
  const width = partial.width ?? Math.max(160, Math.round(partial.text.length * partial.fontSize * 0.55));
  return { ...baseText, height: partial.fontSize * 1.2, ...partial, width };
}

export interface ComboPreset {
  label: string;
  preview?: string;
  elements: ElementDraft[];
}

export const TEXT_PRESETS: ComboPreset[] = [
  { label: 'Add a heading', elements: [textDraft({ text: 'Add a heading', fontSize: 64, fontStyle: 'bold', fontFamily: 'Montserrat', width: 560 })] },
  { label: 'Add a subheading', elements: [textDraft({ text: 'Add a subheading', fontSize: 36, fontStyle: '600', fontFamily: 'Poppins', width: 420 })] },
  { label: 'Add body text', elements: [textDraft({ text: 'Add a little bit of body text', fontSize: 22, width: 380 })] }
];

export const TEXT_COMBOS: ComboPreset[] = [
  {
    label: 'Big sale',
    elements: [
      textDraft({ text: 'BIG', fontSize: 64, fontFamily: 'Anton', fill: '#111111', width: 360, y: 0 }),
      textDraft({ text: 'SALE', fontSize: 140, fontFamily: 'Anton', fill: '#dc2626', width: 360, y: 64, lineHeight: 1 }),
      textDraft({ text: 'THIS WEEK ONLY', fontSize: 26, fontFamily: 'Oswald', fill: '#111111', letterSpacing: 6, width: 360, y: 212 })
    ]
  },
  {
    label: 'Percent off',
    elements: [
      textDraft({ text: '50%', fontSize: 150, fontFamily: 'Archivo Black', fill: '#2563eb', width: 380, y: 0, lineHeight: 1 }),
      textDraft({ text: 'OFF EVERYTHING', fontSize: 34, fontFamily: 'Montserrat', fontStyle: '900', fill: '#111111', width: 380, y: 152 })
    ]
  },
  {
    label: 'Grand opening',
    elements: [
      textDraft({ text: 'Grand', fontSize: 72, fontFamily: 'Lobster', fill: '#7c3aed', width: 420, y: 0 }),
      textDraft({ text: 'OPENING', fontSize: 80, fontFamily: 'Bebas Neue', fill: '#111111', letterSpacing: 8, width: 420, y: 76 })
    ]
  },
  {
    label: 'Fresh deals',
    elements: [
      textDraft({ text: 'Fresh deals', fontSize: 60, fontFamily: 'Pacifico', fill: '#16a34a', width: 420, y: 0 }),
      textDraft({ text: 'Prices good Wed–Tue', fontSize: 24, fontFamily: 'Poppins', fill: '#3f3f46', width: 420, y: 98 })
    ]
  },
  {
    label: 'Price tag',
    elements: [
      textDraft({ text: '$', fontSize: 48, fontFamily: 'Archivo Black', fill: '#dc2626', width: 40, x: 0, y: 12, align: 'right' }),
      textDraft({ text: '4', fontSize: 130, fontFamily: 'Archivo Black', fill: '#dc2626', width: 90, x: 40, y: 0, lineHeight: 1 }),
      textDraft({ text: '99', fontSize: 48, fontFamily: 'Archivo Black', fill: '#dc2626', width: 70, x: 132, y: 12, align: 'left' }),
      textDraft({ text: 'per lb', fontSize: 20, fontFamily: 'Inter', fill: '#3f3f46', width: 70, x: 132, y: 70, align: 'left' })
    ]
  }
];

const shape = (partial: Partial<ShapeElement> & { type: ShapeElement['type'] }): ShapeElement => ({
  id: '',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  rotation: 0,
  opacity: 1,
  fill: '#2563eb',
  stroke: '#000000',
  strokeWidth: 0,
  ...partial
});

const line = (partial: Partial<LineElement> = {}): LineElement => ({
  id: '',
  type: 'line',
  x: 0,
  y: 0,
  width: 300,
  height: 0,
  rotation: 0,
  opacity: 1,
  stroke: '#111111',
  strokeWidth: 4,
  ...partial
});

export const SHAPE_PRESETS: ComboPreset[] = [
  { label: 'Square', elements: [shape({ type: 'rect' })] },
  { label: 'Rounded', elements: [shape({ type: 'rect', cornerRadius: 28, fill: '#16a34a' })] },
  { label: 'Circle', elements: [shape({ type: 'ellipse', fill: '#f97316' })] },
  { label: 'Outline', elements: [shape({ type: 'rect', fill: 'transparent', stroke: '#111111', strokeWidth: 6 })] },
  { label: 'Star', elements: [shape({ type: 'star', numPoints: 5, innerRatio: 0.45, fill: '#facc15' })] },
  { label: 'Burst', elements: [shape({ type: 'star', numPoints: 16, innerRatio: 0.78, fill: '#dc2626' })] },
  { label: 'Banner bar', elements: [shape({ type: 'rect', width: 600, height: 90, fill: '#111111' })] },
  { label: 'Line', elements: [line()] },
  { label: 'Dashed line', elements: [line({ dash: [16, 10] })] }
];

export const BADGE_PRESETS: ComboPreset[] = [
  {
    label: 'Sale burst',
    elements: [
      shape({ type: 'star', numPoints: 18, innerRatio: 0.8, fill: '#dc2626', width: 220, height: 220 }),
      textDraft({ text: 'SALE', fontSize: 54, fontFamily: 'Anton', fill: '#ffffff', width: 220, y: 78 })
    ]
  },
  {
    label: 'New',
    elements: [
      shape({ type: 'ellipse', fill: '#16a34a', width: 160, height: 160 }),
      textDraft({ text: 'NEW!', fontSize: 44, fontFamily: 'Archivo Black', fill: '#ffffff', width: 160, y: 52 })
    ]
  },
  {
    label: 'BOGO',
    elements: [
      shape({ type: 'rect', fill: '#facc15', width: 260, height: 120, cornerRadius: 16 }),
      textDraft({ text: 'BUY 1\nGET 1 FREE', fontSize: 34, fontFamily: 'Oswald', fontStyle: 'bold', fill: '#111111', width: 260, y: 18, lineHeight: 1.05 })
    ]
  },
  {
    label: 'Limited time',
    elements: [
      shape({ type: 'rect', fill: '#111111', width: 320, height: 64, cornerRadius: 32 }),
      textDraft({ text: 'LIMITED TIME', fontSize: 28, fontFamily: 'Montserrat', fontStyle: '900', fill: '#facc15', letterSpacing: 3, width: 320, y: 16 })
    ]
  },
  {
    label: 'Price circle',
    elements: [
      shape({ type: 'ellipse', fill: '#facc15', stroke: '#dc2626', strokeWidth: 6, width: 180, height: 180 }),
      textDraft({ text: '$2.99', fontSize: 50, fontFamily: 'Archivo Black', fill: '#dc2626', width: 180, y: 58 })
    ]
  }
];

export const BACKGROUND_SWATCHES = [
  '#ffffff', '#fafaf9', '#fef3c7', '#fee2e2', '#dcfce7', '#dbeafe', '#ede9fe', '#fce7f3',
  '#111111', '#1e3a8a', '#14532d', '#7f1d1d', '#facc15', '#dc2626', '#2563eb', '#16a34a'
];
