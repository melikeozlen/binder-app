// FNV-1a 32-bit (hex). İstemcideki src/utils/contentHash.js ile birebir aynı.
// Güvenlik amaçlı değil; yalnızca sync için içerik farkı tespiti.
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

module.exports = { fnv1a };
