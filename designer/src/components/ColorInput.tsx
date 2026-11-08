import { useEffect, useRef, useState } from 'react';
import { SWATCHES } from '../presets';

interface Props {
  value: string;
  onChange: (color: string) => void;
  allowTransparent?: boolean;
  title?: string;
  /** Render as a text-color "A" button instead of a plain swatch. */
  variant?: 'swatch' | 'text';
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

export default function ColorInput({ value, onChange, allowTransparent, title = 'Color', variant = 'swatch' }: Props) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setHex(value), [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const transparent = value === 'transparent';

  return (
    <div className="color-input" ref={ref}>
      <button
        className={variant === 'text' ? 'icon-btn text-color' : `swatch ${transparent ? 'transparent' : ''}`}
        style={variant === 'text' ? { ['--c' as string]: value } : { background: transparent ? undefined : value }}
        title={title}
        onClick={() => setOpen(!open)}
      >
        {variant === 'text' ? 'A' : null}
      </button>
      {open && (
        <div className="popover color-pop">
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button key={c} className={`swatch ${c === value ? 'on' : ''}`} style={{ background: c }} title={c} onClick={() => onChange(c)} />
            ))}
            {allowTransparent && <button className={`swatch transparent ${transparent ? 'on' : ''}`} title="No fill" onClick={() => onChange('transparent')} />}
          </div>
          <div className="row">
            <input type="color" value={isHex(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
            <input
              className="hex"
              value={hex}
              onChange={(e) => {
                setHex(e.target.value);
                if (isHex(e.target.value)) onChange(e.target.value);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
