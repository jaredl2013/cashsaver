import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useEditor } from '../store';
import { exportImage, exportPdf } from '../exporter';
import type { SessionInfo } from '../api';

interface Props {
  session: SessionInfo;
  onOpenTeam: () => void;
  onOpenDesigns: () => void;
  onSave: () => void;
  onLogout: () => void;
}

function useOutsideClose(open: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, setOpen]);
  return ref;
}

export default function TopBar({ session, onOpenTeam, onOpenDesigns, onSave, onLogout }: Props) {
  const name = useEditor((s) => s.design.name);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const dirty = useEditor((s) => s.dirty);
  const saving = useEditor((s) => s.saving);
  const hasId = useEditor((s) => !!s.design.id);
  const [draftName, setDraftName] = useState(name);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const exportRef = useOutsideClose(exportOpen, setExportOpen);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useOutsideClose(accountOpen, setAccountOpen);
  const user = session.user!;
  const canManage = user.superadmin || user.role === 'admin';
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  useEffect(() => setDraftName(name), [name]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setExportOpen(false);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      alert('Export failed. If you used a photo from another website, try uploading it instead.');
    } finally {
      setBusy('');
    }
  };

  const status = saving ? 'Saving…' : dirty ? 'Unsaved changes' : hasId ? 'All changes saved' : '';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor" />
            <path d="M9 22l5-12h4l5 12h-3.6l-1-2.6h-4.8l-1 2.6zM14.7 16.6h2.6L16 13z" fill="#fff" />
          </svg>
        </span>
        <span className="brand-name">Ad Designer</span>
      </div>
      <button className="top-btn" onClick={onOpenDesigns}>
        <Icon name="folder" /> Designs
      </button>
      <div className="top-sep" />
      <button className="top-btn icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
        <Icon name="undo" />
      </button>
      <button className="top-btn icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
        <Icon name="redo" />
      </button>
      <span className="save-status">{status}</span>

      <input
        className="name-input"
        value={draftName}
        aria-label="Design name"
        onChange={(e) => setDraftName(e.target.value)}
        onBlur={() => draftName.trim() && draftName !== name && useEditor.getState().setName(draftName.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />

      <div className="top-right">
        <a className="top-btn subtle" href="/classic" title="Open the original weekly flyer builder">
          Classic builder
        </a>
        <button className="top-btn" onClick={onSave} disabled={saving}>
          Save
        </button>
        <div className="pop-wrap" ref={exportRef}>
          <button className="top-btn primary" onClick={() => setExportOpen(!exportOpen)} disabled={!!busy}>
            <Icon name="download" /> {busy || 'Download'}
          </button>
          {exportOpen && (
            <div className="popover menu right">
              <button onClick={() => run('Exporting…', () => exportImage('png', 2))}>
                <strong>PNG</strong>
                <small>Best for social posts and screens</small>
              </button>
              <button onClick={() => run('Exporting…', () => exportImage('jpg', 2))}>
                <strong>JPG</strong>
                <small>Smaller file for email and texting</small>
              </button>
              <button onClick={() => run('Building PDF…', exportPdf)}>
                <strong>PDF (print)</strong>
                <small>300 DPI, true page size, all pages</small>
              </button>
            </div>
          )}
        </div>
        <div className="pop-wrap" ref={accountRef}>
          <button className="account-btn" title={`${user.name || user.email} · ${session.business?.name ?? ''}`} onClick={() => setAccountOpen(!accountOpen)}>
            <span className="biz-name">{session.business?.name}</span>
            <span className="avatar">{initials}</span>
          </button>
          {accountOpen && (
            <div className="popover menu right">
              <div className="menu-head">
                <strong>{user.name || user.email}</strong>
                <small>
                  {user.email} · {user.superadmin ? 'Install owner' : user.role === 'admin' ? 'Admin' : 'Member'}
                </small>
              </div>
              <button onClick={() => { setAccountOpen(false); onOpenTeam(); }}>
                <strong>{canManage ? (user.superadmin ? 'Team & businesses' : 'Team') : 'My account'}</strong>
                <small>{canManage ? 'Add people, reset passwords' : 'Change your password'}</small>
              </button>
              <button onClick={onLogout}>
                <strong>Sign out</strong>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
