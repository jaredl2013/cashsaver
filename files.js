// Image storage on disk instead of base64 inside database rows.
//
// Images are content-addressed (sha256 of the bytes), so saving the same picture
// twice stores it once, and a URL never changes meaning. They are served from
// /uploads/<hash>.<ext> to logged-in users only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]));
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/;
const UPLOAD_URL_RE = /\/uploads\/([0-9a-f]{64}\.(?:png|jpg|webp|gif))/g;
const FILE_NAME_RE = /^[0-9a-f]{64}\.(png|jpg|webp|gif)$/;

function createFileStore(dataDir) {
  const dir = path.join(dataDir, 'uploads');
  fs.mkdirSync(dir, { recursive: true });

  /** Store bytes and return the public path. */
  function saveBuffer(buf, mime) {
    const ext = EXT_BY_MIME[mime];
    if (!ext) throw new Error('unsupported_image_type');
    const name = `${crypto.createHash('sha256').update(buf).digest('hex')}.${ext}`;
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, file);
    }
    return `/uploads/${name}`;
  }

  /** If value is an image data URL, write it to disk and return its /uploads path. */
  function externalize(value) {
    if (typeof value !== 'string' || !value.startsWith('data:image/')) return value;
    const m = DATA_URL_RE.exec(value);
    if (!m) return value;
    return saveBuffer(Buffer.from(m[2], 'base64'), m[1]);
  }

  /** Move every embedded image in a designer document out to files. */
  function externalizeDesign(design) {
    for (const page of design.pages || []) {
      for (const el of page.elements || []) {
        if (el && el.type === 'image') el.src = externalize(el.src);
      }
    }
    return design;
  }

  /** Every /uploads file name mentioned anywhere in a string. */
  function referencedNames(text) {
    const names = new Set();
    if (typeof text !== 'string') return names;
    for (const m of text.matchAll(UPLOAD_URL_RE)) names.add(m[1]);
    return names;
  }

  function readAsBase64(name) {
    if (!FILE_NAME_RE.test(name)) return null;
    try {
      return fs.readFileSync(path.join(dir, name)).toString('base64');
    } catch {
      return null;
    }
  }

  /** Restore a file from a backup, checking its contents still match its name. */
  function writeFromBackup(name, base64) {
    const m = FILE_NAME_RE.exec(name);
    if (!m || typeof base64 !== 'string') return false;
    const buf = Buffer.from(base64, 'base64');
    const saved = saveBuffer(buf, MIME_BY_EXT[m[1]]);
    return saved === `/uploads/${name}`;
  }

  return { dir, saveBuffer, externalize, externalizeDesign, referencedNames, readAsBase64, writeFromBackup, FILE_NAME_RE };
}

module.exports = { createFileStore };
