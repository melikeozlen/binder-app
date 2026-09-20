// FNV-1a 32-bit (hex). server/lib/hash.js ile birebir aynı algoritma.
// Güvenlik amaçlı değil; yalnızca sync için içerik farkı tespiti.
export function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// Anahtar sırasından bağımsız deterministik JSON (Postgres JSONB anahtarları yeniden sıralar)
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return value === undefined ? 'null' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const parts = [];
  for (const key of keys) {
    if (value[key] === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${stableStringify(value[key])}`);
  }
  return `{${parts.join(',')}}`;
}
