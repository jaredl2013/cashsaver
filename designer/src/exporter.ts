import { jsPDF } from 'jspdf';
import { stageRegistry } from './stageRegistry';
import { useEditor } from './store';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Render the current page at `scale` × its design size (1 = design pixels). */
export function renderPage(scale: number, mime: 'image/png' | 'image/jpeg' = 'image/png', quality = 0.92): string {
  const { content, view } = stageRegistry.get();
  const { design } = useEditor.getState();
  if (!content) throw new Error('canvas_not_ready');
  return content.toDataURL({
    x: view.offX,
    y: view.offY,
    width: design.width * view.zoom,
    height: design.height * view.zoom,
    pixelRatio: scale / view.zoom,
    mimeType: mime,
    quality
  });
}

async function withCleanCanvas<T>(fn: () => Promise<T>): Promise<T> {
  const { selectedIds, editingTextId, select, setEditingText, pageIndex } = useEditor.getState();
  if (editingTextId) setEditingText(null);
  select([]);
  await nextFrame();
  try {
    return await fn();
  } finally {
    useEditor.setState({ pageIndex });
    select(selectedIds);
  }
}

async function eachPage<T>(fn: (index: number) => T): Promise<T[]> {
  const { design } = useEditor.getState();
  const out: T[] = [];
  for (let i = 0; i < design.pages.length; i++) {
    useEditor.setState({ pageIndex: i });
    await nextFrame();
    out.push(fn(i));
  }
  return out;
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const safeName = (name: string) => name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'design';

export async function exportImage(kind: 'png' | 'jpg', scale: number) {
  const { design, pageIndex } = useEditor.getState();
  await withCleanCanvas(async () => {
    useEditor.setState({ pageIndex });
    const url = renderPage(scale, kind === 'png' ? 'image/png' : 'image/jpeg');
    const suffix = design.pages.length > 1 ? `-page${pageIndex + 1}` : '';
    download(url, `${safeName(design.name)}${suffix}.${kind}`);
  });
}

/** Print-ready PDF: every page at its true size in inches (96 design px = 1 inch). */
export async function exportPdf() {
  const { design } = useEditor.getState();
  await withCleanCanvas(async () => {
    const images = await eachPage(() => renderPage(300 / 96, 'image/jpeg', 0.95));
    const wIn = design.width / 96;
    const hIn = design.height / 96;
    const pdf = new jsPDF({ unit: 'in', format: [wIn, hIn], orientation: wIn > hIn ? 'landscape' : 'portrait' });
    images.forEach((img, i) => {
      if (i > 0) pdf.addPage([wIn, hIn], wIn > hIn ? 'landscape' : 'portrait');
      pdf.addImage(img, 'JPEG', 0, 0, wIn, hIn);
    });
    pdf.save(`${safeName(design.name)}.pdf`);
  });
}

/** Small preview for the "Your designs" grid. */
export function makeThumbnail(): string | null {
  try {
    const { design } = useEditor.getState();
    const scale = 360 / Math.max(design.width, design.height);
    return renderPage(scale, 'image/jpeg', 0.8);
  } catch {
    return null;
  }
}
