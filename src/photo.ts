/**
 * Product photos are shrunk ON THE DEVICE before they are saved: longest side 320 px, JPEG. That is roughly 15 to 40 KB,
 * so the local database, the Supabase product row and the 30-second sync all stay small even with hundreds of items.
 */
const MAX_SIDE = 320;
const MAX_BYTES = 60_000; // data-URL length budget

async function loadBitmap(file: File): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any); // honours phone camera rotation
      return { w: bmp.width, h: bmp.height, draw: (c, w, h) => c.drawImage(bmp, 0, 0, w, h) };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not a readable image.'));
      i.src = url;
    });
    return { w: img.naturalWidth, h: img.naturalHeight, draw: (c, w, h) => c.drawImage(img, 0, 0, w, h) };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

export async function fileToThumb(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const src = await loadBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(src.w, src.h));
  const w = Math.max(1, Math.round(src.w * scale));
  const h = Math.max(1, Math.round(src.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // flatten transparency (PNG) so it does not turn black as JPEG
  src.draw(ctx, w, h);
  let q = 0.78, out = canvas.toDataURL('image/jpeg', q);
  while (out.length > MAX_BYTES && q > 0.35) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q); }
  return out;
}
