import { useCallback, useEffect, useRef, useState } from 'react';
import TopBar from './components/TopBar';
import SidePanel from './components/SidePanel';
import ContextToolbar from './components/ContextToolbar';
import CanvasStage from './components/CanvasStage';
import ZoomBar from './components/ZoomBar';
import DesignsDialog from './components/DesignsDialog';
import { api, ApiError } from './api';
import { blankDesign, useEditor } from './store';
import { makeThumbnail } from './exporter';

const AUTOSAVE_MS = 2000;

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api.login(password);
            onDone();
          } catch {
            setError('That password didn’t work.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Ad Designer</h1>
        <p className="muted">Make flyers, sales papers and social ads for your business.</p>
        <input type="password" autoFocus placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const hashId = () => new URLSearchParams(location.hash.slice(1)).get('d');
const setHashId = (id: string | null) => history.replaceState(null, '', id ? `#d=${id}` : location.pathname);

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [showDesigns, setShowDesigns] = useState(false);
  const [notice, setNotice] = useState('');
  const saveTimer = useRef<number>();
  const saveInFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    api.session().then((s) => setAuthed(s.authed)).catch(() => setAuthed(false));
  }, []);

  // Open the design in the URL, or ask what to make.
  useEffect(() => {
    if (!authed) return;
    const id = hashId();
    if (!id) {
      setShowDesigns(true);
      return;
    }
    api
      .getDesign(id)
      .then((d) => useEditor.getState().loadDesign(d))
      .catch(() => {
        setHashId(null);
        setShowDesigns(true);
      });
  }, [authed]);

  const save = useCallback(async () => {
    if (saveInFlight.current) await saveInFlight.current;
    const state = useEditor.getState();
    if (!state.dirty && state.design.id) return;
    const snapshot = state.design;
    state.setSaving(true);
    const task = (async () => {
      try {
        const thumb = makeThumbnail();
        const { id } = snapshot.id
          ? await api.updateDesign(snapshot.id, snapshot, thumb)
          : await api.createDesign(snapshot, thumb);
        useEditor.getState().markSaved(id, snapshot);
        setHashId(id);
      } catch (err) {
        useEditor.getState().setSaving(false);
        if (err instanceof ApiError && err.status === 401) setAuthed(false);
        else setNotice('Couldn’t save. Check your connection, then press Save.');
      }
    })();
    saveInFlight.current = task;
    await task;
    saveInFlight.current = null;
  }, []);

  // Autosave a couple of seconds after the last change.
  useEffect(
    () =>
      useEditor.subscribe((s, prev) => {
        if (s.design === prev.design || !s.dirty) return;
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(save, AUTOSAVE_MS);
      }),
    [save]
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && key === 's') {
        e.preventDefault();
        save();
      } else if (mod && key === 'd') {
        e.preventDefault();
        s.duplicateSelected();
      } else if (mod && key === 'c') {
        s.copySelected();
      } else if (mod && key === 'v') {
        s.paste();
      } else if (mod && key === 'a') {
        e.preventDefault();
        s.select(s.page().elements.filter((el) => !el.locked).map((el) => el.id));
      } else if (key === 'delete' || key === 'backspace') {
        if (s.selectedIds.length) {
          e.preventDefault();
          s.deleteSelected();
        }
      } else if (key === 'escape') {
        s.select([]);
      } else if (key === 'enter') {
        const [el] = s.selectedElements();
        if (el?.type === 'text' && s.selectedIds.length === 1 && !el.locked) {
          e.preventDefault();
          s.setEditingText(el.id);
        }
      } else if (key.startsWith('arrow') && s.selectedIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        s.nudge(dx, dy);
      } else if (mod && (key === '=' || key === '+' || key === '-' || key === '0')) {
        e.preventDefault();
        const z = s.zoom || s.fitZoom;
        s.setZoom(key === '0' ? 0 : key === '-' ? z / 1.25 : z * 1.25);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const openDesign = async (id: string) => {
    await save();
    try {
      const d = await api.getDesign(id);
      useEditor.getState().loadDesign(d);
      setHashId(id);
      setShowDesigns(false);
    } catch {
      setNotice('That design couldn’t be opened.');
    }
  };

  const createDesign = async (width: number, height: number, label: string) => {
    await save();
    useEditor.getState().loadDesign(blankDesign(width, height, label));
    setHashId(null);
    setShowDesigns(false);
  };

  if (authed === null) return <div className="boot">Loading…</div>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  return (
    <div className="app">
      <TopBar
        onOpenDesigns={() => setShowDesigns(true)}
        onSave={save}
        onLogout={async () => {
          await save();
          await api.logout();
          setAuthed(false);
        }}
      />
      <div className="workspace">
        <SidePanel />
        <main className="editor">
          <ContextToolbar />
          <CanvasStage />
          <ZoomBar />
        </main>
      </div>
      {notice && (
        <div className="toast" role="status" onClick={() => setNotice('')}>
          {notice}
        </div>
      )}
      {showDesigns && (
        <DesignsDialog
          currentId={useEditor.getState().design.id}
          onClose={hashId() || useEditor.getState().design.pages[0].elements.length ? () => setShowDesigns(false) : null}
          onOpen={openDesign}
          onCreate={createDesign}
        />
      )}
    </div>
  );
}
