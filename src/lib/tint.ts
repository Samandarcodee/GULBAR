export type Tint = { h: number; s: number };

/** Dominant hue of a photo (saturated pixels only), so every bouquet can bring its own colour to the page. */
const tintCache = new Map<string, Promise<Tint | null>>();
export function sampleTint(src: string): Promise<Tint | null> {
  const cached = tintCache.get(src);
  if (cached) return cached;
  const job = new Promise<Tint | null>(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 28, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let x = 0, y = 0, weight = 0, sat = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
          if (d < 0.12 || l < 0.15 || l > 0.9) continue;
          const s = d / (1 - Math.abs(2 * l - 1));
          const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
          const w = s * d;
          x += Math.cos(h * Math.PI / 180) * w; y += Math.sin(h * Math.PI / 180) * w; weight += w; sat += s * w;
        }
        if (!weight) { resolve(null); return; }
        resolve({ h: Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360), s: Math.round(Math.min(85, Math.max(30, sat / weight * 100))) });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  tintCache.set(src, job);
  return job;
}
