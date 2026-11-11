import { useEffect, useState } from 'react';
import Icon from './Icon';
import { api } from '../api';
import { SIZE_PRESETS } from '../presets';
import type { DesignSummary } from '../types';

interface Props {
  currentId: string | null;
  onClose: (() => void) | null;
  onOpen: (id: string) => void;
  onCreate: (width: number, height: number, label: string) => void;
}

function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(ms).toLocaleDateString();
}

export default function DesignsDialog({ currentId, onClose, onOpen, onCreate }: Props) {
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null);
  const [error, setError] = useState('');

  const refresh = () =>
    api
      .listDesigns()
      .then(setDesigns)
      .catch(() => setError('Could not load your designs.'));
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal designs-modal" role="dialog" aria-label="Designs">
        <header>
          <h2>Create a design</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} title="Close">
              <Icon name="x" />
            </button>
          )}
        </header>
        <div className="new-sizes">
          {SIZE_PRESETS.map((p) => (
            <button key={p.label} className="new-size" onClick={() => onCreate(p.width, p.height, p.label)}>
              <span className="new-size-shape">
                <span style={{ aspectRatio: `${p.width} / ${p.height}`, [p.width >= p.height ? 'width' : 'height']: '100%' }} />
              </span>
              <strong>{p.label}</strong>
              <small>{p.hint}</small>
            </button>
          ))}
        </div>

        <h2>Your designs</h2>
        {error && <p className="error">{error}</p>}
        {designs === null && !error && <p className="muted">Loading…</p>}
        {designs?.length === 0 && <p className="muted">Nothing saved yet. Pick a size above to start.</p>}
        <div className="design-grid">
          {designs?.map((d) => (
            <div key={d.id} className={`design-card ${d.id === currentId ? 'current' : ''}`}>
              <button className="design-thumb" onClick={() => onOpen(d.id)}>
                {d.thumbnail ? <img src={d.thumbnail} alt="" /> : <span className="no-thumb" style={{ aspectRatio: `${d.width} / ${d.height}` }} />}
              </button>
              <div className="design-meta">
                <div>
                  <strong title={d.name}>{d.name}</strong>
                  <small>
                    {d.width} × {d.height} · {timeAgo(d.updated_at)}
                  </small>
                </div>
                <button
                  className="icon-btn"
                  title="Delete design"
                  onClick={async () => {
                    if (!confirm(`Delete "${d.name}"?`)) return;
                    await api.deleteDesign(d.id);
                    refresh();
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
