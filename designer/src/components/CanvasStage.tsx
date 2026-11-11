import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Transformer, Line } from 'react-konva';
import type Konva from 'konva';
import { useEditor, useEffectiveZoom } from '../store';
import ElementNode from './ElementNode';
import TextEditorOverlay from './TextEditorOverlay';
import type { DesignElement, ElementDraft } from '../types';
import { stageRegistry } from '../stageRegistry';

const PAD = 60;
const SNAP_PX = 6;

interface Guide {
  orientation: 'v' | 'h';
  pos: number;
}

export interface DropPayload {
  elements: ElementDraft[];
}

export default function CanvasStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const contentRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragGroup = useRef<{ id: string; others: { node: Konva.Node; x: number; y: number }[]; startX: number; startY: number } | null>(null);

  const design = useEditor((s) => s.design);
  const pageIndex = useEditor((s) => s.pageIndex);
  const selectedIds = useEditor((s) => s.selectedIds);
  const editingTextId = useEditor((s) => s.editingTextId);
  const zoom = useEffectiveZoom();
  const { select, toggleSelect, updateElements, setEditingText, setFitZoom, addElements, setTextHeight } = useEditor.getState();

  const page = design.pages[pageIndex];
  const pageW = design.width * zoom;
  const pageH = design.height * zoom;
  const stageW = Math.max(viewport.w, pageW + PAD * 2);
  const stageH = Math.max(viewport.h, pageH + PAD * 2);
  const offX = (stageW - pageW) / 2;
  const offY = (stageH - pageH) / 2;

  // Track the visible area so "fit" zoom always shows the whole page.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setViewport({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fit = Math.min((viewport.w - PAD * 2) / design.width, (viewport.h - PAD * 2) / design.height);
    setFitZoom(Math.max(0.05, Math.min(fit, 2)));
  }, [viewport, design.width, design.height, setFitZoom]);

  useEffect(() => {
    stageRegistry.set(stageRef.current, contentRef.current, { offX, offY, zoom });
  });

  // Web fonts load on first use; remount text once they arrive so it measures correctly.
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    const bump = () => setFontsTick((t) => t + 1);
    document.fonts?.ready.then(bump);
    document.fonts?.addEventListener('loadingdone', bump);
    return () => document.fonts?.removeEventListener('loadingdone', bump);
  }, []);

  const elementsById = useMemo(() => new Map(page.elements.map((e) => [e.id, e])), [page.elements]);

  // Attach the transformer to whatever is selected and unlocked.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selectedIds
      .filter((id) => !elementsById.get(id)?.locked && id !== editingTextId)
      .map((id) => stage.findOne('#' + id))
      .filter(Boolean) as Konva.Node[];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, elementsById, editingTextId, zoom, fontsTick]);

  const selectedTypes = selectedIds.map((id) => elementsById.get(id)?.type);
  const single = selectedIds.length === 1 ? elementsById.get(selectedIds[0]) : undefined;
  const anchors =
    single?.type === 'line'
      ? ['middle-left', 'middle-right']
      : single?.type === 'text'
        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']
        : undefined;
  const keepRatio = selectedTypes.length > 1 || single?.type === 'text' || single?.type === 'image';

  const toPage = useCallback(
    (stageX: number, stageY: number) => ({ x: (stageX - offX) / zoom, y: (stageY - offY) / zoom }),
    [offX, offY, zoom]
  );

  /* ---------- selection ---------- */
  const handleSelect = (el: DesignElement) => (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    const shift = 'shiftKey' in e.evt && (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
    if (shift) toggleSelect(el.id);
    else if (!selectedIds.includes(el.id)) select([el.id]);
  };

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target.getParent()?.className === 'Transformer') return;
    const pos = stageRef.current!.getPointerPosition();
    if (!pos) return;
    const shift = 'shiftKey' in e.evt && e.evt.shiftKey;
    if (!shift) select([]);
    const p = toPage(pos.x, pos.y);
    setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const onStageMouseMove = () => {
    if (!marquee) return;
    const pos = stageRef.current!.getPointerPosition();
    if (!pos) return;
    const p = toPage(pos.x, pos.y);
    setMarquee({ ...marquee, x2: p.x, y2: p.y });
  };

  const onStageMouseUp = () => {
    if (!marquee) return;
    const x1 = Math.min(marquee.x1, marquee.x2);
    const x2 = Math.max(marquee.x1, marquee.x2);
    const y1 = Math.min(marquee.y1, marquee.y2);
    const y2 = Math.max(marquee.y1, marquee.y2);
    setMarquee(null);
    if (x2 - x1 < 3 && y2 - y1 < 3) return;
    const hit = page.elements.filter((el) => {
      const r = boxOf(el);
      return r.x < x2 && r.x + r.w > x1 && r.y < y2 && r.y + r.h > y1;
    });
    const current = useEditor.getState().selectedIds;
    select(Array.from(new Set([...current, ...hit.map((h) => h.id)])));
  };

  const boxOf = (el: DesignElement) => {
    const node = stageRef.current?.findOne('#' + el.id);
    if (node && contentRef.current) {
      const r = node.getClientRect({ relativeTo: contentRef.current as unknown as Konva.Container, skipStroke: true });
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return { x: el.x, y: el.y, w: el.width, h: el.height };
  };

  /* ---------- dragging with snapping ---------- */
  const onDragStart = (el: DesignElement) => (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current!;
    let ids = useEditor.getState().selectedIds;
    if (!ids.includes(el.id)) {
      ids = [el.id];
      select(ids);
    }
    dragGroup.current = {
      id: el.id,
      startX: e.target.x(),
      startY: e.target.y(),
      others: ids
        .filter((id) => id !== el.id && !elementsById.get(id)?.locked)
        .map((id) => stage.findOne('#' + id))
        .filter(Boolean)
        .map((node) => ({ node: node as Konva.Node, x: (node as Konva.Node).x(), y: (node as Konva.Node).y() }))
    };
  };

  const onDragMove = (el: DesignElement) => (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const layer = contentRef.current!;
    const group = dragGroup.current;
    const moving = new Set([el.id, ...(group?.others.map((o) => o.node.id()) ?? [])]);

    const box = node.getClientRect({ relativeTo: layer as unknown as Konva.Container, skipStroke: true });
    const threshold = SNAP_PX / zoom;
    const vTargets = [0, design.width / 2, design.width];
    const hTargets = [0, design.height / 2, design.height];
    for (const other of page.elements) {
      if (moving.has(other.id)) continue;
      const r = boxOf(other);
      vTargets.push(r.x, r.x + r.w / 2, r.x + r.w);
      hTargets.push(r.y, r.y + r.h / 2, r.y + r.h);
    }
    const snap = (edges: number[], targets: number[]) => {
      let best: { diff: number; pos: number } | null = null;
      for (const edge of edges)
        for (const t of targets) {
          const diff = t - edge;
          if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { diff, pos: t };
        }
      return best;
    };
    const sv = snap([box.x, box.x + box.width / 2, box.x + box.width], vTargets);
    const sh = snap([box.y, box.y + box.height / 2, box.y + box.height], hTargets);
    if (sv) node.x(node.x() + sv.diff);
    if (sh) node.y(node.y() + sh.diff);
    const next: Guide[] = [];
    if (sv) next.push({ orientation: 'v', pos: sv.pos });
    if (sh) next.push({ orientation: 'h', pos: sh.pos });
    setGuides(next);

    if (group) {
      const dx = node.x() - group.startX;
      const dy = node.y() - group.startY;
      for (const o of group.others) o.node.position({ x: o.x + dx, y: o.y + dy });
    }
  };

  const onDragEnd = (el: DesignElement) => (e: Konva.KonvaEventObject<DragEvent>) => {
    setGuides([]);
    const group = dragGroup.current;
    dragGroup.current = null;
    const moves = new Map<string, { x: number; y: number }>([[el.id, { x: e.target.x(), y: e.target.y() }]]);
    group?.others.forEach((o) => moves.set(o.node.id(), { x: o.node.x(), y: o.node.y() }));
    updateElements([...moves.keys()], (cur) => moves.get(cur.id)!);
  };

  /* ---------- resize / rotate ---------- */
  const onTransform = () => {
    const tr = trRef.current!;
    const anchor = tr.getActiveAnchor() || '';
    for (const node of tr.nodes()) {
      const el = elementsById.get(node.id());
      if (el?.type !== 'text') continue;
      // Side handles reflow text (change its width) instead of stretching letters.
      if (anchor === 'middle-left' || anchor === 'middle-right') {
        const text = (node as Konva.Group).findOne('.body') as Konva.Text;
        text.width(Math.max(20, text.width() * node.scaleX()));
        node.scaleX(1);
      }
    }
  };

  const onTransformEnd = () => {
    const tr = trRef.current!;
    const patches = new Map<string, Partial<DesignElement>>();
    for (const node of tr.nodes()) {
      const el = elementsById.get(node.id());
      if (!el) continue;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scale({ x: 1, y: 1 });
      const base = { x: node.x(), y: node.y(), rotation: node.rotation() };
      if (el.type === 'text') {
        const text = (node as Konva.Group).findOne('.body') as Konva.Text;
        const s = Math.abs(sy - 1) > 0.001 ? sy : 1;
        patches.set(el.id, {
          ...base,
          width: text.width() * (s === 1 ? 1 : sx),
          fontSize: Math.max(4, Math.round(el.fontSize * s * 10) / 10),
          letterSpacing: el.letterSpacing * s
        });
      } else if (el.type === 'line') {
        patches.set(el.id, { ...base, width: Math.max(4, el.width * sx) });
      } else {
        patches.set(el.id, { ...base, width: Math.max(4, el.width * sx), height: Math.max(4, el.height * sy) });
      }
    }
    updateElements([...patches.keys()], (cur) => patches.get(cur.id)!);
  };

  /* ---------- drop from sidebar ---------- */
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-ad-element');
    if (!raw) return;
    e.preventDefault();
    stageRef.current!.setPointersPositions(e.nativeEvent);
    const pos = stageRef.current!.getPointerPosition();
    const payload = JSON.parse(raw) as DropPayload;
    addElements(payload.elements, pos ? toPage(pos.x, pos.y) : undefined);
  };

  const editingEl = editingTextId ? elementsById.get(editingTextId) : undefined;

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-ad-element')) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        onMouseDown={onStageMouseDown}
        onTouchStart={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onTouchMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onTouchEnd={onStageMouseUp}
      >
        <Layer ref={contentRef} x={offX} y={offY} scaleX={zoom} scaleY={zoom}>
          <Rect
            name="page-bg"
            width={design.width}
            height={design.height}
            fill={page.background}
            shadowColor="rgba(15,23,42,0.18)"
            shadowBlur={24 / zoom}
            shadowOffsetY={4 / zoom}
            listening={false}
          />
          {page.elements.map((el) => (
            <ElementNode
              key={el.type === 'text' ? `${el.id}-${fontsTick}` : el.id}
              el={el}
              hidden={el.id === editingTextId}
              draggable={!el.locked}
              onSelect={handleSelect(el)}
              onDblClick={() => {
                if (el.type === 'text' && !el.locked) {
                  select([el.id]);
                  setEditingText(el.id);
                }
              }}
              onDragStart={onDragStart(el)}
              onDragMove={onDragMove(el)}
              onDragEnd={onDragEnd(el)}
              onTextMeasured={setTextHeight}
            />
          ))}
        </Layer>
        <Layer x={offX} y={offY} scaleX={zoom} scaleY={zoom} name="overlay">
          {/* Dim anything that hangs off the page so people can see what will be cut off. */}
          <Rect x={-offX / zoom} y={-offY / zoom} width={stageW / zoom} height={offY / zoom} fill="#eef0f4" opacity={0.85} listening={false} />
          <Rect x={-offX / zoom} y={design.height} width={stageW / zoom} height={offY / zoom} fill="#eef0f4" opacity={0.85} listening={false} />
          <Rect x={-offX / zoom} y={0} width={offX / zoom} height={design.height} fill="#eef0f4" opacity={0.85} listening={false} />
          <Rect x={design.width} y={0} width={offX / zoom} height={design.height} fill="#eef0f4" opacity={0.85} listening={false} />
          {guides.map((g, i) =>
            g.orientation === 'v' ? (
              <Line key={i} points={[g.pos, -offY / zoom, g.pos, (stageH - offY) / zoom]} stroke="#e11d8f" strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} listening={false} />
            ) : (
              <Line key={i} points={[-offX / zoom, g.pos, (stageW - offX) / zoom, g.pos]} stroke="#e11d8f" strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} listening={false} />
            )
          )}
          {marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="rgba(99,102,241,0.12)"
              stroke="#6366f1"
              strokeWidth={1 / zoom}
              listening={false}
            />
          )}
        </Layer>
        <Layer>
          <Transformer
            ref={trRef}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
            keepRatio={keepRatio}
            enabledAnchors={anchors}
            ignoreStroke
            flipEnabled={false}
            anchorSize={10}
            anchorCornerRadius={5}
            anchorStroke="#6d28d9"
            borderStroke="#7c3aed"
            borderStrokeWidth={1.5}
            rotateAnchorOffset={28}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 2 ? oldBox : newBox)}
            onTransform={onTransform}
            onTransformEnd={onTransformEnd}
          />
        </Layer>
      </Stage>
      {editingEl && editingEl.type === 'text' && (
        <TextEditorOverlay el={editingEl} zoom={zoom} offX={offX} offY={offY} />
      )}
    </div>
  );
}
