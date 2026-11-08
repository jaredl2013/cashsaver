import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import ColorInput from './ColorInput';
import { useEditor } from '../store';
import { FONTS } from '../presets';
import type { DesignElement, TextElement } from '../types';

function Popover({ label, title, children }: { label: React.ReactNode; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="pop-wrap" ref={ref}>
      <button className={`tool-btn ${open ? 'on' : ''}`} title={title} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && <div className="popover">{children}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <input type="number" min={min} max={max} step={step} value={Math.round(value * 100) / 100} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

const isBold = (t: TextElement) => /bold|[6-9]00/.test(t.fontStyle);
const isItalic = (t: TextElement) => t.fontStyle.includes('italic');
function withStyle(t: TextElement, bold: boolean, italic: boolean) {
  const weight = bold ? (/[6-9]00/.exec(t.fontStyle)?.[0] ?? 'bold') : '';
  return [weight, italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal';
}

export default function ContextToolbar() {
  const selectedIds = useEditor((s) => s.selectedIds);
  const elements = useEditor((s) => s.design.pages[s.pageIndex].elements);
  const store = useEditor.getState();
  const sel = elements.filter((e) => selectedIds.includes(e.id));

  if (!sel.length) {
    return (
      <div className="context-bar empty">
        <span className="muted">Click something on the page to edit it, or add elements from the left.</span>
      </div>
    );
  }

  const first = sel[0];
  const ids = sel.map((e) => e.id);
  const update = (patch: Partial<DesignElement> | ((el: DesignElement) => Partial<DesignElement>), key?: string) =>
    store.updateElements(ids, patch, key);
  const texts = sel.filter((e): e is TextElement => e.type === 'text');
  const allText = texts.length === sel.length;
  const shapes = sel.filter((e) => e.type === 'rect' || e.type === 'ellipse' || e.type === 'star');
  const allLocked = sel.every((e) => e.locked);
  const t = allText ? texts[0] : null;

  return (
    <div className="context-bar">
      {t && (
        <>
          <select className="font-select" value={t.fontFamily} style={{ fontFamily: t.fontFamily }} onChange={(e) => update({ fontFamily: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
          <div className="stepper">
            <button title="Smaller" onClick={() => update((el) => ({ fontSize: Math.max(4, Math.round((el as TextElement).fontSize - 2)) }), 'fs')}>
              <Icon name="minus" size={14} />
            </button>
            <input
              type="number"
              value={Math.round(t.fontSize)}
              min={4}
              max={1000}
              onChange={(e) => +e.target.value >= 4 && update({ fontSize: +e.target.value }, 'fs')}
            />
            <button title="Bigger" onClick={() => update((el) => ({ fontSize: Math.round((el as TextElement).fontSize + 2) }), 'fs')}>
              <Icon name="plus" size={14} />
            </button>
          </div>
          <ColorInput variant="text" title="Text color" value={t.fill} onChange={(c) => update({ fill: c }, 'fill')} />
          <button className={`tool-btn b ${isBold(t) ? 'on' : ''}`} title="Bold (Ctrl+B)" onClick={() => update((el) => ({ fontStyle: withStyle(el as TextElement, !isBold(t), isItalic(el as TextElement)) }))}>
            B
          </button>
          <button className={`tool-btn i ${isItalic(t) ? 'on' : ''}`} title="Italic (Ctrl+I)" onClick={() => update((el) => ({ fontStyle: withStyle(el as TextElement, isBold(el as TextElement), !isItalic(t)) }))}>
            I
          </button>
          <button className={`tool-btn u ${t.textDecoration === 'underline' ? 'on' : ''}`} title="Underline" onClick={() => update({ textDecoration: t.textDecoration === 'underline' ? '' : 'underline' })}>
            U
          </button>
          <button className={`tool-btn ${t.uppercase ? 'on' : ''}`} title="Uppercase" onClick={() => update({ uppercase: !t.uppercase })}>
            aA
          </button>
          <button
            className="tool-btn"
            title="Alignment"
            onClick={() => update({ align: t.align === 'left' ? 'center' : t.align === 'center' ? 'right' : 'left' })}
          >
            <Icon name={t.align === 'left' ? 'textLeft' : t.align === 'center' ? 'textCenter' : 'textRight'} />
          </button>
          <Popover title="Spacing" label="Spacing">
            <Slider label="Letter spacing" value={t.letterSpacing} min={-10} max={60} step={0.5} onChange={(v) => update({ letterSpacing: v }, 'ls')} />
            <Slider label="Line height" value={t.lineHeight} min={0.6} max={3} step={0.05} onChange={(v) => update({ lineHeight: v }, 'lh')} />
          </Popover>
          <Popover title="Outline" label="Outline">
            <div className="row">
              <span>Color</span>
              <ColorInput value={t.stroke || '#000000'} onChange={(c) => update({ stroke: c, strokeWidth: t.strokeWidth || 2 }, 'stroke')} />
            </div>
            <Slider label="Thickness" value={t.strokeWidth || 0} min={0} max={30} step={0.5} onChange={(v) => update({ strokeWidth: v, stroke: t.stroke || '#000000' }, 'sw')} />
          </Popover>
          <span className="sep" />
        </>
      )}

      {shapes.length > 0 && shapes.length === sel.length && (
        <>
          <ColorInput title="Fill" allowTransparent value={(shapes[0] as { fill: string }).fill} onChange={(c) => update({ fill: c }, 'fill')} />
          <Popover title="Border" label="Border">
            <div className="row">
              <span>Color</span>
              <ColorInput value={(shapes[0] as { stroke: string }).stroke} onChange={(c) => update({ stroke: c }, 'stroke')} />
            </div>
            <Slider label="Thickness" value={(shapes[0] as { strokeWidth: number }).strokeWidth} min={0} max={40} onChange={(v) => update({ strokeWidth: v }, 'sw')} />
            {first.type === 'rect' && (
              <Slider label="Corner rounding" value={first.cornerRadius || 0} min={0} max={Math.min(first.width, first.height) / 2} onChange={(v) => update({ cornerRadius: v }, 'cr')} />
            )}
            {first.type === 'star' && (
              <>
                <Slider label="Points" value={first.numPoints || 5} min={3} max={40} onChange={(v) => update({ numPoints: v }, 'np')} />
                <Slider label="Point depth" value={Math.round((1 - (first.innerRatio ?? 0.5)) * 100)} min={2} max={90} onChange={(v) => update({ innerRatio: 1 - v / 100 }, 'ir')} />
              </>
            )}
          </Popover>
          <span className="sep" />
        </>
      )}

      {first.type === 'line' && sel.length === 1 && (
        <>
          <ColorInput title="Line color" value={first.stroke} onChange={(c) => update({ stroke: c }, 'stroke')} />
          <Popover title="Line style" label="Style">
            <Slider label="Thickness" value={first.strokeWidth} min={1} max={60} onChange={(v) => update({ strokeWidth: v }, 'sw')} />
            <label className="check">
              <input type="checkbox" checked={!!first.dash} onChange={(e) => update({ dash: e.target.checked ? [16, 10] : undefined })} /> Dashed
            </label>
          </Popover>
          <span className="sep" />
        </>
      )}

      {first.type === 'image' && sel.length === 1 && (
        <>
          <button className="tool-btn" title="Flip horizontal" onClick={() => update({ flipX: !first.flipX })}>
            <Icon name="flipH" />
          </button>
          <button className="tool-btn" title="Flip vertical" onClick={() => update({ flipY: !first.flipY })}>
            <Icon name="flipV" />
          </button>
          <Popover title="Corners" label="Corners">
            <Slider label="Rounding" value={first.cornerRadius || 0} min={0} max={Math.min(first.width, first.height) / 2} onChange={(v) => update({ cornerRadius: v }, 'cr')} />
          </Popover>
          <span className="sep" />
        </>
      )}

      <div className="spacer" />

      <Popover title="Position" label="Position">
        <div className="pos-grid">
          <button onClick={() => store.reorder('top')}><Icon name="up" size={14} /> Bring to front</button>
          <button onClick={() => store.reorder('up')}><Icon name="up" size={14} /> Forward</button>
          <button onClick={() => store.reorder('bottom')}><Icon name="down" size={14} /> Send to back</button>
          <button onClick={() => store.reorder('down')}><Icon name="down" size={14} /> Backward</button>
        </div>
        <h4>{sel.length > 1 ? 'Align selection' : 'Align to page'}</h4>
        <div className="align-row">
          <button title="Left" onClick={() => store.align('left')}><Icon name="alignLeft" /></button>
          <button title="Center" onClick={() => store.align('hcenter')}><Icon name="alignCenterH" /></button>
          <button title="Right" onClick={() => store.align('right')}><Icon name="alignRight" /></button>
          <button title="Top" onClick={() => store.align('top')}><Icon name="alignTop" /></button>
          <button title="Middle" onClick={() => store.align('vcenter')}><Icon name="alignCenterV" /></button>
          <button title="Bottom" onClick={() => store.align('bottom')}><Icon name="alignBottom" /></button>
        </div>
      </Popover>
      <Popover title="Transparency" label={<span className="checker" />}>
        <Slider label="Transparency" value={Math.round(first.opacity * 100)} min={0} max={100} onChange={(v) => update({ opacity: v / 100 }, 'op')} />
      </Popover>
      <button className={`tool-btn ${allLocked ? 'on' : ''}`} title={allLocked ? 'Unlock' : 'Lock'} onClick={() => update({ locked: !allLocked })}>
        <Icon name={allLocked ? 'lock' : 'unlock'} />
      </button>
      <button className="tool-btn" title="Duplicate (Ctrl+D)" onClick={store.duplicateSelected}>
        <Icon name="copy" />
      </button>
      <button className="tool-btn danger" title="Delete (Del)" onClick={store.deleteSelected}>
        <Icon name="trash" />
      </button>
    </div>
  );
}
