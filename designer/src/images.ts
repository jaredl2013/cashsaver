import { useEffect, useState } from 'react';

const cache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit && hit.complete && hit.naturalWidth) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      cache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });
}

export function useImage(src: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(() => (src && cache.get(src)) || null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadImage(src).then((i) => alive && setImg(i)).catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [src]);
  return img;
}

/** Shrink a picture so designs stay small enough to save and load quickly. */
export function downscale(img: HTMLImageElement, maxDim = 1600): string {
  const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * ratio);
  const h = Math.round(img.naturalHeight * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  // PNG keeps transparency for logos and cut-outs; photos compress much better as JPEG.
  const hasAlpha = (() => {
    try {
      const data = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < data.length; i += 4 * 97) if (data[i] < 250) return true;
    } catch {
      /* tainted canvas: fall through */
    }
    return false;
  })();
  return hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
}

export function readFileAsImage(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const img = await loadImage(String(reader.result));
        const src = downscale(img);
        const scaled = await loadImage(src);
        resolve({ src, width: scaled.naturalWidth, height: scaled.naturalHeight });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Copy a remote photo into the design so exports never depend on the photo host. */
export async function remoteToDataUrl(url: string): Promise<{ src: string; width: number; height: number }> {
  const img = await loadImage(url);
  try {
    const src = downscale(img);
    return { src, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return { src: url, width: img.naturalWidth, height: img.naturalHeight };
  }
}
