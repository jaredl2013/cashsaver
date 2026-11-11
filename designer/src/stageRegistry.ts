import type Konva from 'konva';

/** Lets export/thumbnail code reach the live Konva stage without prop drilling. */
let stage: Konva.Stage | null = null;
let content: Konva.Layer | null = null;
let view = { offX: 0, offY: 0, zoom: 1 };

export const stageRegistry = {
  set(s: Konva.Stage | null, c: Konva.Layer | null, v: typeof view) {
    stage = s;
    content = c;
    view = v;
  },
  get: () => ({ stage, content, view })
};
