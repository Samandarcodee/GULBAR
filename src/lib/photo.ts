export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size > 20 * 1024 * 1024) throw new Error('20 MB dan kichik rasm tanlang.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error('Rasm ochilmadi. JPG, PNG yoki WebP formatida tanlang.'); }
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Rasmni tayyorlab bo‘lmadi.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 1024 * 1024) return blob;
    }
    throw new Error('Rasm juda katta. Kichikroq rasm tanlang.');
  } finally { URL.revokeObjectURL(url); }
}
