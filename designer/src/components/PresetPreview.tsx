import type { CSSProperties } from 'react';
import type { ElementDraft } from '../types';

function starPoints(n: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 50 : 50 * inner;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}

/** A lightweight HTML/SVG thumbnail of a preset, so the sidebar doesn't need extra canvases. */
export default function PresetPreview({ elements, box = 96 }: { elements: ElementDraft[]; box?: number }) {
  const minX = Math.min(...elements.map((e) => e.x));
  const minY = Math.min(...elements.map((e) => e.y));
  const w = Math.max(...elements.map((e) => e.x + e.width)) - minX;
  const h = Math.max(...elements.map((e) => e.y + Math.max(e.height, e.type === 'line' ? 8 : 1))) - minY;
  const s = Math.min(box / w, box / h) * 0.9;

  return (
    <div className="preset-preview" style={{ width: w * s, height: h * s }}>
      {elements.map((el, i) => {
        const style: CSSProperties = {
          position: 'absolute',
          left: (el.x - minX) * s,
          top: (el.y - minY) * s,
          width: el.width * s,
          height: el.height * s,
          transform: `rotate(${el.rotation}deg)`,
          opacity: el.opacity
        };
        switch (el.type) {
          case 'text': {
            const weight = /\d{3}/.exec(el.fontStyle)?.[0] ?? (el.fontStyle.includes('bold') ? 700 : 400);
            return (
              <div
                key={i}
                style={{
                  ...style,
                  height: 'auto',
                  fontFamily: el.fontFamily,
                  fontSize: el.fontSize * s,
                  fontWeight: weight,
                  color: el.fill,
                  textAlign: el.align,
                  lineHeight: el.lineHeight,
                  letterSpacing: el.letterSpacing * s,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {el.text}
              </div>
            );
          }
          case 'rect':
            return (
              <div
                key={i}
                style={{
                  ...style,
                  background: el.fill,
                  border: el.strokeWidth ? `${Math.max(1, el.strokeWidth * s)}px solid ${el.stroke}` : undefined,
                  borderRadius: (el.cornerRadius || 0) * s,
                  boxSizing: 'border-box'
                }}
              />
            );
          case 'ellipse':
            return (
              <div
                key={i}
                style={{
                  ...style,
                  background: el.fill,
                  border: el.strokeWidth ? `${Math.max(1, el.strokeWidth * s)}px solid ${el.stroke}` : undefined,
                  borderRadius: '50%',
                  boxSizing: 'border-box'
                }}
              />
            );
          case 'star':
            return (
              <svg key={i} style={style} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points={starPoints(el.numPoints || 5, el.innerRatio ?? 0.5)} fill={el.fill} />
              </svg>
            );
          case 'line':
            return (
              <div
                key={i}
                style={{
                  ...style,
                  height: 0,
                  top: (el.y - minY) * s + 4,
                  borderTop: `${Math.max(2, el.strokeWidth * s)}px ${el.dash ? 'dashed' : 'solid'} ${el.stroke}`
                }}
              />
            );
          case 'image':
            return <img key={i} src={el.src} style={{ ...style, objectFit: 'cover' }} alt="" />;
        }
      })}
    </div>
  );
}
