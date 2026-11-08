import { useEffect, useRef } from 'react';
import { Group, Rect, Ellipse, Star, Line, Text, Image as KImage } from 'react-konva';
import type Konva from 'konva';
import type { DesignElement } from '../types';
import { useImage } from '../images';

interface Props {
  el: DesignElement;
  hidden?: boolean;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDblClick: () => void;
  onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTextMeasured: (id: string, height: number) => void;
}

export function fontStyleFor(style: string) {
  // Konva accepts "bold", "italic", "bold italic", or numeric weights like "900".
  return style || 'normal';
}

function ImageBody({ el }: { el: Extract<DesignElement, { type: 'image' }> }) {
  const img = useImage(el.src);
  if (!img) return <Rect width={el.width} height={el.height} fill="#e4e4e7" cornerRadius={el.cornerRadius} />;
  return (
    <KImage
      image={img}
      width={el.width}
      height={el.height}
      cornerRadius={el.cornerRadius}
      scaleX={el.flipX ? -1 : 1}
      scaleY={el.flipY ? -1 : 1}
      x={el.flipX ? el.width : 0}
      y={el.flipY ? el.height : 0}
    />
  );
}

export default function ElementNode({ el, hidden, draggable, onSelect, onDblClick, onDragStart, onDragMove, onDragEnd, onTextMeasured }: Props) {
  const textRef = useRef<Konva.Text>(null);

  useEffect(() => {
    if (el.type !== 'text' || !textRef.current) return;
    const h = textRef.current.height();
    if (Math.abs(h - el.height) > 0.5) onTextMeasured(el.id, h);
  });

  let body: JSX.Element;
  switch (el.type) {
    case 'text':
      body = (
        <Text
          ref={textRef}
          name="body"
          text={el.uppercase ? el.text.toUpperCase() : el.text}
          width={el.width}
          fontFamily={el.fontFamily}
          fontSize={el.fontSize}
          fontStyle={fontStyleFor(el.fontStyle)}
          textDecoration={el.textDecoration}
          fill={el.fill}
          align={el.align}
          lineHeight={el.lineHeight}
          letterSpacing={el.letterSpacing}
          stroke={el.strokeWidth ? el.stroke : undefined}
          strokeWidth={el.strokeWidth || 0}
          fillAfterStrokeEnabled
        />
      );
      break;
    case 'rect':
      body = (
        <Rect
          name="body"
          width={el.width}
          height={el.height}
          fill={el.fill}
          stroke={el.strokeWidth ? el.stroke : undefined}
          strokeWidth={el.strokeWidth}
          cornerRadius={el.cornerRadius || 0}
        />
      );
      break;
    case 'ellipse':
      body = (
        <Ellipse
          name="body"
          x={el.width / 2}
          y={el.height / 2}
          radiusX={el.width / 2}
          radiusY={el.height / 2}
          fill={el.fill}
          stroke={el.strokeWidth ? el.stroke : undefined}
          strokeWidth={el.strokeWidth}
        />
      );
      break;
    case 'star': {
      const outer = el.width / 2;
      body = (
        <Star
          name="body"
          x={el.width / 2}
          y={el.height / 2}
          numPoints={el.numPoints || 5}
          outerRadius={outer}
          innerRadius={outer * (el.innerRatio ?? 0.5)}
          scaleY={el.width ? el.height / el.width : 1}
          fill={el.fill}
          stroke={el.strokeWidth ? el.stroke : undefined}
          strokeWidth={el.strokeWidth}
          strokeScaleEnabled={false}
        />
      );
      break;
    }
    case 'line':
      body = (
        <Line
          name="body"
          points={[0, 0, el.width, 0]}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          dash={el.dash}
          lineCap="round"
          hitStrokeWidth={Math.max(20, el.strokeWidth)}
        />
      );
      break;
    case 'image':
      body = <ImageBody el={el} />;
      break;
  }

  return (
    <Group
      id={el.id}
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      opacity={el.opacity}
      visible={!hidden}
      draggable={draggable}
      onMouseDown={onSelect}
      onTouchStart={onSelect}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {body}
    </Group>
  );
}
