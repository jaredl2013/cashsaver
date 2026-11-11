import { useEffect, useRef, useState } from 'react';
import type { TextElement } from '../types';
import { useEditor } from '../store';

interface Props {
  el: TextElement;
  zoom: number;
  offX: number;
  offY: number;
}

/** An in-place textarea that sits exactly over the text being edited. */
export default function TextEditorOverlay({ el, zoom, offX, offY }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(el.text);
  const done = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Clicking elsewhere on the canvas can close the editor before blur fires; save then too.
  useEffect(() => {
    done.current = false; // React StrictMode runs this effect twice in development
    return () => {
      if (done.current) return;
      done.current = true;
      if (valueRef.current !== el.text) useEditor.getState().updateElements([el.id], { text: valueRef.current });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, []);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [value, zoom]);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const { updateElements, setEditingText } = useEditor.getState();
    if (save && value !== el.text) updateElements([el.id], { text: value });
    setEditingText(null);
  };

  const weight = /\d{3}/.exec(el.fontStyle)?.[0] ?? (el.fontStyle.includes('bold') ? '700' : '400');

  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') finish(true);
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish(true);
      }}
      style={{
        left: offX + el.x * zoom,
        top: offY + el.y * zoom,
        width: el.width * zoom,
        transform: `rotate(${el.rotation}deg)`,
        fontFamily: el.fontFamily,
        fontSize: el.fontSize * zoom,
        fontWeight: weight as React.CSSProperties['fontWeight'],
        fontStyle: el.fontStyle.includes('italic') ? 'italic' : 'normal',
        textDecoration: el.textDecoration,
        textTransform: el.uppercase ? 'uppercase' : 'none',
        color: el.fill,
        textAlign: el.align,
        lineHeight: el.lineHeight,
        letterSpacing: el.letterSpacing * zoom
      }}
    />
  );
}
