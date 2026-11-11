export type ElementType = 'text' | 'rect' | 'ellipse' | 'star' | 'line' | 'image';

interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  name?: string;
  /** Elements sharing a groupId select and move together. */
  groupId?: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string; // Konva style: 'normal' | 'bold' | 'italic' | 'bold italic' | '900' ...
  textDecoration: string; // '' | 'underline' | 'line-through'
  fill: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  stroke?: string;
  strokeWidth?: number;
  uppercase?: boolean;
}

export interface ShapeElement extends BaseElement {
  type: 'rect' | 'ellipse' | 'star';
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
  numPoints?: number;
  innerRatio?: number; // star inner radius / outer radius
}

export interface LineElement extends BaseElement {
  type: 'line';
  stroke: string;
  strokeWidth: number;
  dash?: number[];
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  flipX?: boolean;
  flipY?: boolean;
  cornerRadius?: number;
  /** How the picture fills its box: stretch (default), contain (whole picture) or cover (crop to fill). */
  fit?: 'stretch' | 'contain' | 'cover';
}

export type DesignElement = TextElement | ShapeElement | LineElement | ImageElement;

export interface Page {
  id: string;
  background: string;
  elements: DesignElement[];
}

export interface Design {
  id: string | null;
  name: string;
  width: number;
  height: number;
  sizeLabel: string;
  pages: Page[];
}

export interface DesignSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  thumbnail: string | null;
  updated_at: number;
}

/** Something to drop onto the page; its id is replaced when it is added. */
export type ElementDraft = DesignElement;
