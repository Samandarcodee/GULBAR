export const MAX_IMAGE_BYTES = 1024 * 1024;
export const imageTableSql = `CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  content_type TEXT NOT NULL, body BLOB NOT NULL CHECK(length(body) <= 1048576), created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS images_shop ON images(shop_id);`;

// Never trust filenames or a client supplied MIME type. SVG/HTML are not served.
export function imageType(bytes) {
  if (bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES) return null;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'image/png';
  const ascii = (start, value) => [...value].every((ch,i) => bytes[start+i] === ch.charCodeAt(0));
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  return null;
}
