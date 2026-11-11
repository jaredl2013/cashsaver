import { useEditor, useEffectiveZoom } from '../store';

export default function ZoomBar() {
  const zoom = useEffectiveZoom();
  const isFit = useEditor((s) => s.zoom === 0);
  const { setZoom } = useEditor.getState();
  return (
    <div className="zoombar">
      <input
        type="range"
        min={10}
        max={400}
        value={Math.round(zoom * 100)}
        onChange={(e) => setZoom(+e.target.value / 100)}
        aria-label="Zoom"
      />
      <span className="zoom-val">{Math.round(zoom * 100)}%</span>
      <button className={`chip ${isFit ? 'on' : ''}`} onClick={() => setZoom(0)}>
        Fit
      </button>
    </div>
  );
}
