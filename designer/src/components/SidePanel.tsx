import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import PresetPreview from './PresetPreview';
import { useEditor } from '../store';
import { BACKGROUND_SWATCHES, BADGE_PRESETS, SHAPE_PRESETS, SIZE_PRESETS, TEXT_COMBOS, TEXT_PRESETS, type ComboPreset } from '../presets';
import type { ElementDraft, ImageElement } from '../types';
import { api } from '../api';
import { readFileAsImage, remoteToDataUrl } from '../images';
import ColorInput from './ColorInput';
import { buildProductTile, formatPrice, layoutProductPages, TILE_STYLES, unitLabel, type Product, type TileStyle } from '../productTiles';

export type PanelId = 'design' | 'products' | 'elements' | 'text' | 'uploads' | 'photos' | 'layers';

const TABS: { id: PanelId; label: string; icon: string }[] = [
  { id: 'design', label: 'Design', icon: 'layout' },
  { id: 'products', label: 'Products', icon: 'tag' },
  { id: 'elements', label: 'Elements', icon: 'shapes' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'uploads', label: 'Uploads', icon: 'upload' },
  { id: 'photos', label: 'Photos', icon: 'photo' },
  { id: 'layers', label: 'Layers', icon: 'layers' }
];

function imageDraft(src: string, w: number, h: number): ElementDraft {
  const { design } = useEditor.getState();
  // Start images at about half the page so they're easy to grab and resize.
  const fit = Math.min((design.width * 0.5) / w, (design.height * 0.5) / h);
  // addElements rescales presets for page size; undo that for images, which are already page-relative.
  const presetScale = Math.min(1.6, Math.max(0.35, Math.min(design.width, design.height) / 900));
  const s = fit / presetScale;
  const el: ImageElement = { id: '', type: 'image', x: 0, y: 0, width: w * s, height: h * s, rotation: 0, opacity: 1, src };
  return el;
}

/** Click adds to the middle of the page; drag drops it where you let go. */
function Draggable({ elements, className, children, title, noScale }: { elements: ElementDraft[]; className?: string; children: React.ReactNode; title?: string; noScale?: boolean }) {
  return (
    <button
      className={className}
      title={title}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-ad-element', JSON.stringify({ elements, noScale }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => useEditor.getState().addElements(elements, undefined, { scale: !noScale })}
    >
      {children}
    </button>
  );
}

function PresetGrid({ presets, cols = 3 }: { presets: ComboPreset[]; cols?: number }) {
  return (
    <div className="preset-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {presets.map((p) => (
        <Draggable key={p.label} elements={p.elements} className="preset-tile" title={p.label}>
          <PresetPreview elements={p.elements} box={cols === 2 ? 120 : 76} />
        </Draggable>
      ))}
    </div>
  );
}

function DesignPanel() {
  const design = useEditor((s) => s.design);
  const background = useEditor((s) => s.design.pages[s.pageIndex].background);
  const [scale, setScale] = useState(true);
  const [custom, setCustom] = useState({ w: design.width, h: design.height });
  useEffect(() => setCustom({ w: design.width, h: design.height }), [design.width, design.height]);

  return (
    <>
      <h3>Background</h3>
      <div className="swatches">
        {BACKGROUND_SWATCHES.map((c) => (
          <button key={c} className={`swatch ${background === c ? 'on' : ''}`} style={{ background: c }} title={c} onClick={() => useEditor.getState().setBackground(c)} />
        ))}
        <ColorInput value={background} onChange={(c) => useEditor.getState().setBackground(c)} />
      </div>

      <h3>Size</h3>
      <p className="muted small">
        Current: {design.sizeLabel} · {design.width} × {design.height}
      </p>
      <label className="check">
        <input type="checkbox" checked={scale} onChange={(e) => setScale(e.target.checked)} /> Scale content to fit new size
      </label>
      {(['Print', 'Social', 'Web'] as const).map((group) => (
        <div key={group}>
          <h4>{group}</h4>
          <div className="size-list">
            {SIZE_PRESETS.filter((p) => p.group === group).map((p) => (
              <button
                key={p.label}
                className={`size-item ${design.width === p.width && design.height === p.height ? 'on' : ''}`}
                onClick={() => useEditor.getState().resizeDesign(p.width, p.height, p.label, scale)}
              >
                <span className="size-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
                <span>
                  <strong>{p.label}</strong>
                  <small>{p.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <h4>Custom (pixels)</h4>
      <div className="row">
        <input type="number" min={50} max={10000} value={custom.w} onChange={(e) => setCustom({ ...custom, w: +e.target.value })} />
        <span>×</span>
        <input type="number" min={50} max={10000} value={custom.h} onChange={(e) => setCustom({ ...custom, h: +e.target.value })} />
        <button
          className="btn small"
          onClick={() => {
            if (custom.w >= 50 && custom.h >= 50 && custom.w <= 10000 && custom.h <= 10000)
              useEditor.getState().resizeDesign(Math.round(custom.w), Math.round(custom.h), 'Custom', scale);
          }}
        >
          Apply
        </button>
      </div>
    </>
  );
}

function tileDraft(p: Product, style: TileStyle) {
  const { design } = useEditor.getState();
  const w = Math.min(design.width, design.height) * 0.32;
  return buildProductTile(p, { x: 0, y: 0, w, h: w * 1.3 }, style);
}

function ProductsPanel() {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [style, setStyle] = useState<TileStyle>('classic');
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(3);
  const [header, setHeader] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => {
      fetch(`/api/products${q.trim() ? `?q=${encodeURIComponent(q.trim().toLowerCase())}` : ''}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((rows: Product[]) => {
          setProducts(rows);
          setError('');
        })
        .catch(() => setError('Could not load the product catalog.'));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q]);

  const toggle = (key: string) => setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const chosen = (products || []).filter((p) => picked.includes(p.name_key));

  const layOut = () => {
    const st = useEditor.getState();
    const { design, pageIndex } = st;
    const pages = layoutProductPages(chosen, design, { columns: cols, rows, headerFraction: header ? 0.18 : 0, style });
    // Fill the current page if it's empty, otherwise start on a fresh page after it.
    const start = design.pages[pageIndex].elements.length === 0 ? pageIndex : pageIndex + 1;
    if (start !== pageIndex) st.addPage(pageIndex);
    useEditor.getState().addElementsAcrossPages(pages, start);
    setPicked([]);
  };

  return (
    <>
      <form className="search" onSubmit={(e) => e.preventDefault()}>
        <Icon name="search" />
        <input placeholder="Search your products" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <h4>Tile style</h4>
      <div className="style-row">
        {TILE_STYLES.map((t) => (
          <button key={t.id} className={style === t.id ? 'on' : ''} onClick={() => setStyle(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="muted small">Click or drag a product to add its tile. Tick several to lay them out in a grid across pages.</p>
      {error && <p className="error small">{error}</p>}
      {products === null && !error && <p className="muted small">Loading…</p>}
      {products?.length === 0 && (
        <p className="muted small">
          No products yet. Add them in the <a href="/classic">classic builder</a>'s product database (one at a time or from Excel).
        </p>
      )}
      <div className="product-list">
        {products?.map((p) => (
          <div key={p.name_key} className={`product-row ${picked.includes(p.name_key) ? 'on' : ''}`}>
            <input type="checkbox" checked={picked.includes(p.name_key)} onChange={() => toggle(p.name_key)} aria-label={`Select ${p.display_name}`} />
            <Draggable elements={tileDraft(p, style)} className="product-main" title="Add this product's tile" noScale>
              {p.img ? <img src={p.img} alt="" /> : <span className="no-img" />}
              <span>
                <strong>{p.display_name}</strong>
                <small>{unitLabel(p) || p.category || ''}</small>
              </span>
              <span className="pr-price">{formatPrice(p)}</span>
            </Draggable>
          </div>
        ))}
      </div>
      {chosen.length > 0 && (
        <div className="sticky-actions">
          <div className="fill-box">
            <strong>{chosen.length} selected</strong>
            <div className="row">
              <label>Columns</label>
              <select value={cols} onChange={(e) => setCols(+e.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
              </select>
              <label>Rows</label>
              <select value={rows} onChange={(e) => setRows(+e.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
            <label className="check">
              <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> Leave room at the top for a headline
            </label>
            <button className="btn primary block" onClick={layOut}>
              Lay out on {Math.ceil(chosen.length / (cols * rows))} page{Math.ceil(chosen.length / (cols * rows)) > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ElementsPanel() {
  return (
    <>
      <h3>Shapes &amp; lines</h3>
      <PresetGrid presets={SHAPE_PRESETS} />
      <h3>Badges &amp; stickers</h3>
      <PresetGrid presets={BADGE_PRESETS} cols={2} />
    </>
  );
}

function TextPanel() {
  return (
    <>
      <div className="text-presets">
        {TEXT_PRESETS.map((p, i) => (
          <Draggable key={p.label} elements={p.elements} className={`text-preset t${i}`}>
            {p.label}
          </Draggable>
        ))}
      </div>
      <h3>Ready-made combos</h3>
      <PresetGrid presets={TEXT_COMBOS} cols={2} />
    </>
  );
}

interface LibraryImage {
  id: number;
  name: string;
  img: string;
}

function UploadsPanel() {
  const [items, setItems] = useState<LibraryImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    fetch('/api/image-library')
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => setItems([]));
  useEffect(() => {
    refresh();
  }, []);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const { src, width, height } = await readFileAsImage(file);
        const res = await fetch('/api/image-library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, img: src })
        });
        const saved = res.ok ? ((await res.json()) as { img?: string }) : {};
        useEditor.getState().addElements([imageDraft(saved.img || src, width, height)]);
      }
      await refresh();
    } catch {
      setError("That file couldn't be read as an image.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <button className="btn primary block" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Icon name="upload" /> {busy ? 'Uploading…' : 'Upload images'}
      </button>
      <p className="muted small">Logos, product shots and photos. They're saved here for every design.</p>
      {error && <p className="error small">{error}</p>}
      <div className="photo-grid">
        {items.map((item) => (
          <LibraryTile key={item.id} item={item} onDelete={async () => {
            await fetch(`/api/image-library/${item.id}`, { method: 'DELETE' });
            refresh();
          }} />
        ))}
      </div>
    </>
  );
}

function LibraryTile({ item, onDelete }: { item: LibraryImage; onDelete: () => void }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const draft = size ? [imageDraft(item.img, size.w, size.h)] : [];
  return (
    <div className="photo-tile">
      <Draggable elements={draft} title={item.name}>
        <img src={item.img} alt={item.name} onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
      </Draggable>
      <button className="tile-x" title="Remove from uploads" onClick={onDelete}>
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

function PhotosPanel() {
  const [q, setQ] = useState('');
  const [photos, setPhotos] = useState<{ id: number; alt: string; small: string; medium: string }[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'off'>('idle');
  const [adding, setAdding] = useState<number | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setState('loading');
    try {
      const res = await api.photoSearch(q.trim());
      setPhotos(res.photos);
      setState('idle');
    } catch (err) {
      setState((err as { status?: number }).status === 503 ? 'off' : 'error');
    }
  };

  const add = async (p: (typeof photos)[number], at?: { x: number; y: number }) => {
    setAdding(p.id);
    try {
      const { src, width, height } = await remoteToDataUrl(p.medium);
      const url = await api.upload(src).catch(() => src);
      useEditor.getState().addElements([imageDraft(url, width, height)], at);
    } finally {
      setAdding(null);
    }
  };

  return (
    <>
      <form className="search" onSubmit={search}>
        <Icon name="search" />
        <input placeholder="Search free photos (e.g. pizza, tools)" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      {state === 'loading' && <p className="muted small">Searching…</p>}
      {state === 'off' && <p className="muted small">Photo search isn't set up yet. Add a Pexels API key in the classic builder's Settings.</p>}
      {state === 'error' && <p className="error small">Photo search is unavailable right now.</p>}
      <div className="photo-grid">
        {photos.map((p) => (
          <div className="photo-tile" key={p.id}>
            <button title={p.alt} onClick={() => add(p)} disabled={adding === p.id}>
              <img src={p.small} alt={p.alt} />
            </button>
          </div>
        ))}
      </div>
      {photos.length > 0 && <p className="muted small">Photos provided by Pexels</p>}
    </>
  );
}

function describe(el: ReturnType<typeof useEditor.getState>['design']['pages'][number]['elements'][number]) {
  if (el.type === 'text') return el.text.split('\n')[0].slice(0, 28) || 'Text';
  return { rect: 'Rectangle', ellipse: 'Circle', star: 'Star', line: 'Line', image: 'Image' }[el.type];
}

function LayersPanel() {
  const elements = useEditor((s) => s.design.pages[s.pageIndex].elements);
  const selected = useEditor((s) => s.selectedIds);
  const { select, toggleSelect, updateElements } = useEditor.getState();
  const ordered = [...elements].reverse();
  if (!ordered.length) return <p className="muted small">Nothing on this page yet. Add text, shapes or photos from the other tabs.</p>;
  return (
    <ul className="layers">
      {ordered.map((el) => (
        <li key={el.id} className={selected.includes(el.id) ? 'on' : ''}>
          <button className="layer-name" onClick={(e) => (e.shiftKey ? toggleSelect(el.id) : select([el.id]))}>
            <span className={`layer-kind k-${el.type}`} />
            {describe(el)}
          </button>
          <button className="icon-btn" title={el.locked ? 'Unlock' : 'Lock'} onClick={() => updateElements([el.id], { locked: !el.locked })}>
            <Icon name={el.locked ? 'lock' : 'unlock'} size={15} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function SidePanel() {
  const [tab, setTab] = useState<PanelId | null>('elements');
  return (
    <aside className="side">
      <nav className="rail">
        {TABS.map((t) => (
          <button key={t.id} className={`rail-btn ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(tab === t.id ? null : t.id)}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {tab && (
        <section className="panel">
          <header>
            <h2>{TABS.find((t) => t.id === tab)!.label}</h2>
            <button className="icon-btn" title="Close panel" onClick={() => setTab(null)}>
              <Icon name="x" size={16} />
            </button>
          </header>
          <div className="panel-body">
            {tab === 'design' && <DesignPanel />}
            {tab === 'products' && <ProductsPanel />}
            {tab === 'elements' && <ElementsPanel />}
            {tab === 'text' && <TextPanel />}
            {tab === 'uploads' && <UploadsPanel />}
            {tab === 'photos' && <PhotosPanel />}
            {tab === 'layers' && <LayersPanel />}
          </div>
        </section>
      )}
    </aside>
  );
}
