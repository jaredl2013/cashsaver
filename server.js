const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: process.env.CASH_SAVER_CONFIG || path.join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const db = require('./db');
const { version: APP_VERSION } = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;
const SHARED_PASSWORD = process.env.SHARED_PASSWORD || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-too';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || SHARED_PASSWORD;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const UPDATE_MANIFEST_URL = process.env.UPDATE_MANIFEST_URL || 'https://raw.githubusercontent.com/jaredl2013/cashsaver/main/release/update.json';

// ---- Kill switch / licensing (optional — blank LICENSE_SERVER_URL disables it entirely) ----
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || '';
const LICENSE_KEY = process.env.LICENSE_KEY || '';
const LICENSE_GRACE_HOURS = parseFloat(process.env.LICENSE_GRACE_HOURS || '168'); // 7 days default
const LICENSE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-check every 6 hours

// ---- Optional email (internal reminder AND subscriber email broadcast) ----
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const REMINDER_TO = (process.env.REMINDER_TO || '').split(',').map(s => s.trim()).filter(Boolean);

// ---- Optional SMS/MMS broadcast via Twilio ----
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
// Only needed if you want the picture included in texts (MMS) — requires this server to be
// reachable from the internet (e.g. through your Cloudflare tunnel), since Twilio has to fetch
// the image from a public URL. Leave blank and texts still send fine, just without the picture.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

app.use(express.json({ limit: '100mb' })); // backups and flyers can carry base64 photos
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
    sameSite: 'lax'
    // secure:true should be added once this is served over HTTPS (recommended via your Cloudflare tunnel)
  }
}));

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function compareVersions(left, right) {
  const a = String(left || '0').split('.').map(v => parseInt(v, 10) || 0);
  const b = String(right || '0').split('.').map(v => parseInt(v, 10) || 0);
  const count = Math.max(a.length, b.length);
  for (let i = 0; i < count; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
}

function seedDefaultSettings() {
  const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  seed.run('adFree', 'false');
  seed.run('pexelsKey', '');
  seed.run('licenseStatus', 'active');
  seed.run('licenseLastCheck', '0');
  seed.run('licenseMessage', '');
}

/* ---------------- License check-in ("am I good?") ---------------- */
async function checkLicense() {
  if (!LICENSE_SERVER_URL || !LICENSE_KEY) return; // licensing not configured for this install — always allowed
  try {
    const url = `${LICENSE_SERVER_URL.replace(/\/$/, '')}/api/check?key=${encodeURIComponent(LICENSE_KEY)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    setSetting('licenseStatus', data.status === 'active' ? 'active' : 'disabled');
    setSetting('licenseMessage', data.message || '');
    setSetting('licenseLastCheck', Date.now());
    console.log(`[license] check-in ok — status: ${data.status}`);
  } catch (err) {
    // Couldn't reach the license server (internet down, server down, etc). Don't touch
    // licenseLastCheck — the grace period keeps things working until it's been too long.
    console.warn('[license] check-in failed:', err.message);
  }
}

function isLicensed() {
  if (!LICENSE_SERVER_URL || !LICENSE_KEY) return { licensed: true, message: '' };
  const status = getSetting('licenseStatus') || 'active';
  const lastCheck = parseInt(getSetting('licenseLastCheck') || '0', 10);
  const message = getSetting('licenseMessage') || 'This tool has been paused. Contact Lockwood IT Services to reactivate.';

  if (status === 'disabled') return { licensed: false, message };

  const graceMs = LICENSE_GRACE_HOURS * 60 * 60 * 1000;
  if (Date.now() - lastCheck > graceMs) {
    return { licensed: false, message: "Can't confirm this tool's status — check your internet connection, or contact Lockwood IT Services." };
  }
  return { licensed: true, message: '' };
}

checkLicense();
setInterval(checkLicense, LICENSE_CHECK_INTERVAL_MS);

function requireAuth(req, res, next) {
  if (!(req.session && req.session.authed)) return res.status(401).json({ error: 'not_authenticated' });
  const license = isLicensed();
  if (!license.licensed) return res.status(403).json({ error: 'license_inactive', message: license.message });
  next();
}

/* ---------------- Auth ---------------- */
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password && password === SHARED_PASSWORD) {
    req.session.authed = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'wrong_password' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/update-status', requireAuth, async (req, res) => {
  if (!UPDATE_MANIFEST_URL) return res.json({ configured: false, currentVersion: APP_VERSION, updateAvailable: false });
  if (!/^https:\/\//i.test(UPDATE_MANIFEST_URL)) return res.status(500).json({ error: 'invalid_update_url', currentVersion: APP_VERSION });
  try {
    const response = await fetch(UPDATE_MANIFEST_URL, {
      headers: { 'User-Agent': `CashSaver-Weekly-Ad-Builder/${APP_VERSION}` },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`manifest_http_${response.status}`);
    const manifest = await response.json();
    const latestVersion = String(manifest.version || '');
    const downloadUrl = String(manifest.downloadUrl || '');
    if (!/^\d+\.\d+\.\d+$/.test(latestVersion) || !/^https:\/\//i.test(downloadUrl)) throw new Error('invalid_manifest');
    res.json({
      configured: true,
      currentVersion: APP_VERSION,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, APP_VERSION) > 0,
      downloadUrl,
      releaseNotes: String(manifest.releaseNotes || '').slice(0, 1000),
      sha256: String(manifest.sha256 || '')
    });
  } catch (err) {
    res.status(502).json({ error: 'update_check_failed', currentVersion: APP_VERSION });
  }
});

app.get('/api/session', (req, res) => {
  const adFree = getSetting('adFree');
  res.json({
    authed: !!(req.session && req.session.authed),
    adFree: adFree === 'true'
  });
});

app.get('/api/license-status', (req, res) => {
  if (!(req.session && req.session.authed)) return res.status(401).json({ error: 'not_authenticated' });
  res.json(isLicensed());
});

app.post('/api/license-status/recheck', async (req, res) => {
  if (!(req.session && req.session.authed)) return res.status(401).json({ error: 'not_authenticated' });
  await checkLicense();
  res.json(isLicensed());
});

/* ---------------- Settings ---------------- */
// A key saved in-app (settings table) takes priority over the .env value, so it can be
// set from the UI without editing .env by hand; .env still works as a first-install default.
function getPexelsApiKey() {
  return getSetting('pexelsKey') || PEXELS_API_KEY;
}

app.get('/api/settings', requireAuth, (req, res) => {
  // Never return stored settings wholesale: some values may be secrets.
  res.json({
    adFree: getSetting('adFree') === 'true',
    pexelsConfigured: Boolean(getPexelsApiKey())
  });
});

app.post('/api/settings', requireAuth, (req, res) => {
  res.status(400).json({ error: 'no_editable_settings' });
});

// Admin-password gated (like ad-free) since this is an install-wide setting, not per-user.
app.post('/api/settings/pexels-key', requireAuth, (req, res) => {
  const { adminPassword, pexelsKey } = req.body || {};
  if (adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ error: 'wrong_admin_password' });
  setSetting('pexelsKey', String(pexelsKey || '').trim());
  res.json({ ok: true, pexelsConfigured: Boolean(getPexelsApiKey()) });
});

// Search is proxied through the server so the Pexels API key never reaches the browser.
app.get('/api/photo-search', requireAuth, async (req, res) => {
  const pexelsApiKey = getPexelsApiKey();
  if (!pexelsApiKey) {
    return res.status(503).json({ error: 'not_configured', message: 'Photo search is not configured.' });
  }
  const query = String(req.query.q || '').trim().slice(0, 120);
  if (!query) return res.status(400).json({ error: 'query_required' });
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12`;
    const upstream = await fetch(url, {
      headers: { Authorization: pexelsApiKey },
      signal: AbortSignal.timeout(10000)
    });
    if (!upstream.ok) {
      console.warn(`[pexels] search failed with status ${upstream.status}`);
      return res.status(502).json({ error: 'provider_error', message: 'Photo search is temporarily unavailable.' });
    }
    const data = await upstream.json();
    const photos = Array.isArray(data.photos) ? data.photos.map(photo => ({
      id: photo.id,
      alt: photo.alt || '',
      small: photo.src && photo.src.small,
      medium: photo.src && photo.src.medium
    })).filter(photo => photo.small && photo.medium) : [];
    res.json({ photos });
  } catch (err) {
    console.warn('[pexels] search request failed:', err.message);
    res.status(502).json({ error: 'provider_unreachable', message: 'Photo search is temporarily unavailable.' });
  }
});

// separate, password-gated toggle for removing the "Made by Lockwood IT Services" credit
app.post('/api/settings/ad-free', (req, res) => {
  const { adminPassword, adFree } = req.body || {};
  if (adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ error: 'wrong_admin_password' });
  setSetting('adFree', adFree ? 'true' : 'false');
  res.json({ ok: true });
});

/* ---------------- Flyers ---------------- */
function flyerStatus(row, now) {
  if (!row.scheduled_start) return 'unscheduled';
  if (now < row.scheduled_start) return 'scheduled';
  if (row.scheduled_end && now > row.scheduled_end) return 'past';
  return 'live';
}

app.get('/api/flyers', requireAuth, (req, res) => {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT name, updated_at, scheduled_start, scheduled_end, broadcast_sent,
           (rendered_image IS NOT NULL) AS has_image
    FROM flyers WHERE deleted_at IS NULL ORDER BY updated_at DESC
  `).all();
  res.json(rows.map(r => ({ ...r, status: flyerStatus(r, now) })));
});

app.get('/api/flyers/:name', requireAuth, (req, res) => {
  const row = db.prepare('SELECT data, scheduled_start, scheduled_end FROM flyers WHERE name = ? AND deleted_at IS NULL').get(req.params.name);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const parsed = JSON.parse(row.data);
  parsed.scheduling = { start: row.scheduled_start, end: row.scheduled_end };
  res.json(parsed);
});

app.post('/api/flyers/:name', requireAuth, (req, res) => {
  const name = req.params.name;
  const body = req.body || {};
  const { renderedImage, ...toStore } = body; // don't duplicate the (possibly large) image inside `data` too
  const data = JSON.stringify(toStore);
  const scheduling = body.scheduling || {};
  const scheduledStart = scheduling.start || null;
  const scheduledEnd = scheduling.end || null;

  db.prepare(`
    INSERT INTO flyers (name, data, updated_at, scheduled_start, scheduled_end, notified, rendered_image, broadcast_sent, deleted_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, 0, NULL)
    ON CONFLICT(name) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at,
      scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end,
      rendered_image = COALESCE(excluded.rendered_image, flyers.rendered_image),
      notified = CASE WHEN flyers.scheduled_start IS excluded.scheduled_start THEN flyers.notified ELSE 0 END,
      broadcast_sent = CASE WHEN flyers.scheduled_start IS excluded.scheduled_start THEN flyers.broadcast_sent ELSE 0 END,
      deleted_at = NULL
  `).run(name, data, Date.now(), scheduledStart, scheduledEnd, renderedImage || null);

  // upsert products found in this flyer's cells so the database stays current
  const cells = body.cells || [];
  const upsert = db.prepare(`
    INSERT INTO products (name_key, display_name, description, ad_size, img, original_img, price, unit, unit_custom, updated_at, deleted_at)
    VALUES (@key, @displayName, @description, @adSize, @img, @originalImg, @price, @unit, @unitCustom, @updatedAt, NULL)
    ON CONFLICT(name_key) DO UPDATE SET
      display_name = excluded.display_name,
      description = excluded.description,
      ad_size = excluded.ad_size,
      img = COALESCE(excluded.img, products.img),
      original_img = COALESCE(excluded.original_img, products.original_img),
      price = excluded.price,
      unit = excluded.unit,
      unit_custom = excluded.unit_custom,
      updated_at = excluded.updated_at,
      deleted_at = NULL
  `);
  const tx = db.transaction((cells) => {
    for (const c of cells) {
      const nm = (c.name || '').trim();
      if (!nm || nm === 'Product Name') continue;
      const key = nm.toLowerCase();
      const price = c.price || '';
      const unit = c.unit || 'lb.';
      upsert.run({
        key,
        displayName: nm,
        description: c.size || '',
        adSize: c.adSize === 'big' ? 'big' : 'small',
        img: c.img || null,
        originalImg: c.originalImg || c.img || null,
        price,
        unit,
        unitCustom: c.unitCustom || '',
        updatedAt: Date.now()
      });
      recordPriceHistory(key, price, unit);
    }
  });
  tx(cells);

  res.json({ ok: true });
});

app.delete('/api/flyers/:name', requireAuth, (req, res) => {
  db.prepare('UPDATE flyers SET deleted_at = ? WHERE name = ?').run(Date.now(), req.params.name);
  res.json({ ok: true });
});

app.post('/api/flyers/:name/rename', requireAuth, (req, res) => {
  const oldName = req.params.name;
  const newName = String((req.body && req.body.newName) || '').trim();
  if (!newName) return res.status(400).json({ error: 'name_required' });
  if (newName === oldName) return res.json({ ok: true, name: newName });
  const clash = db.prepare('SELECT deleted_at FROM flyers WHERE name = ?').get(newName);
  if (clash) return res.status(409).json({ error: clash.deleted_at ? 'name_taken_in_trash' : 'name_taken' });
  const info = db.prepare('UPDATE flyers SET name = ? WHERE name = ? AND deleted_at IS NULL').run(newName, oldName);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, name: newName });
});

// Publicly reachable (no login) so Twilio's servers can fetch it for MMS. Only useful/reachable
// at all if this server is exposed to the internet (see PUBLIC_BASE_URL note above).
app.get('/api/public/flyer-image/:name', (req, res) => {
  const row = db.prepare('SELECT rendered_image FROM flyers WHERE name = ?').get(req.params.name);
  if (!row || !row.rendered_image) return res.status(404).send('Not found');
  const base64 = row.rendered_image.split(',')[1] || row.rendered_image;
  const buf = Buffer.from(base64, 'base64');
  res.set('Content-Type', 'image/png');
  res.send(buf);
});

/* ---------------- Product database ---------------- */
app.get('/api/products', requireAuth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const rows = q
    ? db.prepare('SELECT * FROM products WHERE deleted_at IS NULL AND name_key LIKE ? ORDER BY updated_at DESC').all(`%${q}%`)
    : db.prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY updated_at DESC').all();
  res.json(rows.map(withLastPrice));
});

app.get('/api/products/:key', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE name_key = ? AND deleted_at IS NULL').get(req.params.key.toLowerCase());
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(withLastPrice(row));
});

app.get('/api/products/:key/price-history', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT price, unit, recorded_at FROM price_history WHERE product_key = ? ORDER BY recorded_at DESC LIMIT 50')
    .all(req.params.key.toLowerCase());
  res.json(rows);
});

function normalizeProduct(body) {
  const displayName = String(body.displayName || '').trim();
  const price = String(body.price || '').trim().replace(/[^0-9.]/g, '');
  const unit = String(body.unit || 'lb.').trim();
  return {
    key: displayName.toLowerCase().replace(/\s+/g, ' '),
    displayName,
    description: String(body.description || '').trim(),
    adSize: body.adSize === 'big' ? 'big' : 'small',
    price,
    unit,
    unitCustom: unit === 'other' ? String(body.unitCustom || '').trim() : '',
    img: typeof body.img === 'string' && body.img ? body.img : null,
    originalImg: typeof body.originalImg === 'string' && body.originalImg ? body.originalImg : null,
    updatedAt: Date.now()
  };
}

const insertPriceHistory = db.prepare('INSERT INTO price_history (product_key, price, unit, recorded_at) VALUES (?, ?, ?, ?)');
// Append-only price log — one row every time a product is saved with a price, never overwritten.
function recordPriceHistory(key, price, unit) {
  if (!key || !price) return;
  insertPriceHistory.run(key, String(price), unit || null, Date.now());
}

// Most recent price this product was saved at that differs from its current price —
// gives pricing decisions context (e.g. "Last on sale: $1.99/lb — June 17").
const lastDifferentPriceStmt = db.prepare(`
  SELECT price, unit, recorded_at FROM price_history
  WHERE product_key = ? AND price != ?
  ORDER BY recorded_at DESC LIMIT 1
`);
function withLastPrice(row) {
  const last = lastDifferentPriceStmt.get(row.name_key, String(row.price));
  if (!last) return row;
  return { ...row, lastPrice: last.price, lastPriceUnit: last.unit, lastPriceAt: last.recorded_at };
}

const saveCatalogProduct = db.prepare(`
  INSERT INTO products (name_key, display_name, description, ad_size, img, original_img, price, unit, unit_custom, updated_at)
  VALUES (@key, @displayName, @description, @adSize, @img, @originalImg, @price, @unit, @unitCustom, @updatedAt)
  ON CONFLICT(name_key) DO UPDATE SET
    display_name = excluded.display_name,
    description = excluded.description,
    ad_size = excluded.ad_size,
    img = COALESCE(excluded.img, products.img),
    original_img = COALESCE(excluded.original_img, products.original_img),
    price = excluded.price,
    unit = excluded.unit,
    unit_custom = excluded.unit_custom,
    updated_at = excluded.updated_at
`);

app.post('/api/products', requireAuth, (req, res) => {
  const product = normalizeProduct(req.body || {});
  if (!product.displayName || !product.price || !Number.isFinite(Number(product.price))) {
    return res.status(400).json({ error: 'name_and_price_required' });
  }
  saveCatalogProduct.run(product);
  recordPriceHistory(product.key, product.price, product.unit);
  res.json(withLastPrice(db.prepare('SELECT * FROM products WHERE name_key = ?').get(product.key)));
});

app.post('/api/products/import', requireAuth, (req, res) => {
  const rows = Array.isArray(req.body && req.body.products) ? req.body.products : null;
  if (!rows || rows.length > 5000) return res.status(400).json({ error: 'invalid_product_list' });

  const unique = new Map();
  let skipped = 0;
  for (const row of rows) {
    const product = normalizeProduct(row || {});
    if (!product.displayName || !product.price || !Number.isFinite(Number(product.price))) {
      skipped++;
      continue;
    }
    unique.set(product.key, product); // last matching row wins
  }

  let added = 0;
  let updated = 0;
  const importProducts = db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM products WHERE name_key = ?');
    for (const product of unique.values()) {
      if (exists.get(product.key)) updated++;
      else added++;
      saveCatalogProduct.run(product);
      recordPriceHistory(product.key, product.price, product.unit);
    }
  });
  importProducts();
  res.json({ ok: true, added, updated, skipped, imported: added + updated });
});

app.put('/api/products/:key', requireAuth, (req, res) => {
  const oldKey = req.params.key.toLowerCase();
  const existing = db.prepare('SELECT * FROM products WHERE name_key = ? AND deleted_at IS NULL').get(oldKey);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const product = normalizeProduct({ ...body, img: body.img || existing.img });
  if (!product.displayName || !product.price || !Number.isFinite(Number(product.price))) {
    return res.status(400).json({ error: 'name_and_price_required' });
  }
  const update = db.transaction(() => {
    if (oldKey !== product.key) db.prepare('DELETE FROM products WHERE name_key = ?').run(oldKey);
    saveCatalogProduct.run(product);
    recordPriceHistory(product.key, product.price, product.unit);
  });
  update();
  res.json(withLastPrice(db.prepare('SELECT * FROM products WHERE name_key = ?').get(product.key)));
});

app.delete('/api/products/:key', requireAuth, (req, res) => {
  db.prepare('UPDATE products SET deleted_at = ? WHERE name_key = ?').run(Date.now(), req.params.key.toLowerCase());
  res.json({ ok: true });
});

/* ---------------- Trash (7-day undo for deleted flyers/products) ---------------- */
const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

app.get('/api/trash', requireAuth, (req, res) => {
  const flyers = db.prepare('SELECT name, updated_at, deleted_at FROM flyers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
  const products = db.prepare('SELECT name_key, display_name, price, unit, updated_at, deleted_at FROM products WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
  res.json({ flyers, products });
});

app.post('/api/trash/flyers/:name/restore', requireAuth, (req, res) => {
  const info = db.prepare('UPDATE flyers SET deleted_at = NULL WHERE name = ? AND deleted_at IS NOT NULL').run(req.params.name);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.delete('/api/trash/flyers/:name', requireAuth, (req, res) => {
  db.prepare('DELETE FROM flyers WHERE name = ? AND deleted_at IS NOT NULL').run(req.params.name);
  res.json({ ok: true });
});

app.post('/api/trash/products/:key/restore', requireAuth, (req, res) => {
  const info = db.prepare('UPDATE products SET deleted_at = NULL WHERE name_key = ? AND deleted_at IS NOT NULL').run(req.params.key.toLowerCase());
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.delete('/api/trash/products/:key', requireAuth, (req, res) => {
  db.prepare('DELETE FROM products WHERE name_key = ? AND deleted_at IS NOT NULL').run(req.params.key.toLowerCase());
  res.json({ ok: true });
});

// Anything trashed longer than the retention window is gone for good — checked hourly, which is
// plenty precise for a 7-day window.
function purgeOldTrash() {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  db.prepare('DELETE FROM flyers WHERE deleted_at IS NOT NULL AND deleted_at <= ?').run(cutoff);
  db.prepare('DELETE FROM products WHERE deleted_at IS NOT NULL AND deleted_at <= ?').run(cutoff);
}
purgeOldTrash();
setInterval(purgeOldTrash, 60 * 60 * 1000);

/* ---------------- Logical database backup / restore ---------------- */
function buildBackupObject() {
  return {
    format: 'weekly-ad-builder-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    tables: {
      flyers: db.prepare('SELECT * FROM flyers ORDER BY name').all(),
      products: db.prepare('SELECT * FROM products ORDER BY name_key').all(),
      settings: db.prepare('SELECT * FROM settings ORDER BY key').all(),
      subscribers: db.prepare('SELECT * FROM subscribers ORDER BY id').all()
    }
  };
}

app.get('/api/backup', requireAuth, (req, res) => {
  const backup = buildBackupObject();
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="cashsaver-backup-${stamp}.json"`);
  res.send(JSON.stringify(backup));
});

/* ---------------- Daily automated backup to disk ---------------- */
const BACKUP_DIR = path.join(db.dataDir, 'backups');
const BACKUP_RETENTION_COUNT = 14;

function runDailyBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const filePath = path.join(BACKUP_DIR, `backup-${stamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(buildBackupObject()));

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    while (files.length > BACKUP_RETENTION_COUNT) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
    console.log(`[backup] wrote ${filePath}`);
  } catch (err) {
    console.warn('[backup] daily backup failed:', err.message);
  }
}
runDailyBackup();
setInterval(runDailyBackup, 24 * 60 * 60 * 1000);

app.post('/api/restore', requireAuth, (req, res) => {
  const backup = req.body;
  const tables = backup && backup.tables;
  if (!backup || backup.format !== 'weekly-ad-builder-backup' || backup.version !== 1 || !tables) {
    return res.status(400).json({ error: 'invalid_backup_file' });
  }
  const flyers = Array.isArray(tables.flyers) ? tables.flyers : null;
  const products = Array.isArray(tables.products) ? tables.products : null;
  const settings = Array.isArray(tables.settings) ? tables.settings : null;
  const subscribers = Array.isArray(tables.subscribers) ? tables.subscribers : null;
  if (!flyers || !products || !settings || !subscribers || flyers.length > 1000 || products.length > 10000 || settings.length > 200 || subscribers.length > 10000) {
    return res.status(400).json({ error: 'invalid_backup_tables' });
  }
  if (flyers.some(v => !v || typeof v.name !== 'string' || typeof v.data !== 'string') ||
      products.some(v => !v || typeof v.name_key !== 'string' || typeof v.display_name !== 'string') ||
      settings.some(v => !v || typeof v.key !== 'string') ||
      subscribers.some(v => !v || !['email', 'sms'].includes(v.type) || typeof v.contact !== 'string')) {
    return res.status(400).json({ error: 'invalid_backup_rows' });
  }

  const restore = db.transaction(() => {
    db.prepare('DELETE FROM flyers').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM settings').run();
    db.prepare('DELETE FROM subscribers').run();

    const insertFlyer = db.prepare(`INSERT INTO flyers
      (name, data, updated_at, scheduled_start, scheduled_end, notified, rendered_image, broadcast_sent, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const v of flyers) insertFlyer.run(v.name, v.data, Number(v.updated_at) || Date.now(), v.scheduled_start ?? null, v.scheduled_end ?? null, Number(v.notified) || 0, v.rendered_image ?? null, Number(v.broadcast_sent) || 0, v.deleted_at ?? null);

    const insertProduct = db.prepare(`INSERT INTO products
      (name_key, display_name, img, price, unit, unit_custom, updated_at, description, ad_size, original_img, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const v of products) insertProduct.run(v.name_key, v.display_name, v.img ?? null, String(v.price ?? ''), v.unit || 'lb.', v.unit_custom || '', Number(v.updated_at) || Date.now(), v.description || '', v.ad_size === 'big' ? 'big' : 'small', v.original_img ?? null, v.deleted_at ?? null);

    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const v of settings) insertSetting.run(v.key, v.value == null ? null : String(v.value));

    const insertSubscriber = db.prepare('INSERT INTO subscribers (id, type, contact, name, active, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const v of subscribers) insertSubscriber.run(Number(v.id), v.type, v.contact, v.name || '', v.active ? 1 : 0, Number(v.created_at) || Date.now());
    seedDefaultSettings();
  });

  try {
    restore();
    res.json({ ok: true, restored: { flyers: flyers.length, products: products.length, settings: settings.length, subscribers: subscribers.length } });
  } catch (err) {
    console.error('[restore] failed:', err);
    res.status(400).json({ error: 'restore_failed', message: err.message });
  }
});

/* ---------------- Subscribers (email + SMS list) ---------------- */
app.get('/api/subscribers', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all());
});

app.post('/api/subscribers', requireAuth, (req, res) => {
  const { type, contact, name } = req.body || {};
  if (!['email', 'sms'].includes(type) || !contact) return res.status(400).json({ error: 'bad_input' });
  const info = db.prepare('INSERT INTO subscribers (type, contact, name, active, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(type, contact.trim(), (name || '').trim(), Date.now());
  res.json({ id: info.lastInsertRowid });
});

// Bulk add: one per line, auto-detects email vs phone number
app.post('/api/subscribers/bulk', requireAuth, (req, res) => {
  const { lines } = req.body || {};
  if (!Array.isArray(lines)) return res.status(400).json({ error: 'bad_input' });
  const insert = db.prepare('INSERT INTO subscribers (type, contact, name, active, created_at) VALUES (?, ?, ?, 1, ?)');
  let added = 0;
  const tx = db.transaction(() => {
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const isEmail = line.includes('@');
      const digits = line.replace(/[^0-9]/g, '');
      const isPhone = !isEmail && digits.length >= 10;
      if (!isEmail && !isPhone) continue;
      insert.run(isEmail ? 'email' : 'sms', isEmail ? line : digits, '', Date.now());
      added++;
    }
  });
  tx();
  res.json({ added });
});

app.post('/api/subscribers/:id/toggle', requireAuth, (req, res) => {
  const row = db.prepare('SELECT active FROM subscribers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE subscribers SET active = ? WHERE id = ?').run(row.active ? 0 : 1, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/subscribers/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM subscribers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Email transport (internal reminders + subscriber broadcast) ---------------- */
let mailTransport = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  try {
    const nodemailer = require('nodemailer');
    mailTransport = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    console.log('[email] SMTP configured and active.');
  } catch (err) {
    console.warn('[email] nodemailer not installed — run "npm install nodemailer" to enable email.');
  }
} else {
  console.log('[email] SMTP not configured — email features are off (this is fine, they are optional).');
}

/* ---------------- SMS/MMS via Twilio (optional, costs money per message) ---------------- */
const twilioConfigured = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
if (twilioConfigured) console.log('[sms] Twilio configured and active.');
else console.log('[sms] Twilio not configured — SMS features are off (this is fine, they are optional).');

async function sendSms(to, body, mediaUrl) {
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body });
  if (mediaUrl) params.append('MediaUrl', mediaUrl);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
  return res.json();
}

/* ---------------- Broadcasting a flyer to the subscriber list ---------------- */
async function broadcastFlyer(name) {
  const flyer = db.prepare('SELECT rendered_image FROM flyers WHERE name = ?').get(name);
  if (!flyer) throw new Error('flyer not found');

  const subs = db.prepare('SELECT * FROM subscribers WHERE active = 1').all();
  const emailSubs = subs.filter(s => s.type === 'email');
  const smsSubs = subs.filter(s => s.type === 'sms');
  const results = { emailSent: 0, emailFailed: 0, smsSent: 0, smsFailed: 0 };

  if (mailTransport && emailSubs.length) {
    const attachments = flyer.rendered_image
      ? [{ filename: `${name}.png`, content: Buffer.from(flyer.rendered_image.split(',')[1] || flyer.rendered_image, 'base64') }]
      : [];
    for (const s of emailSubs) {
      try {
        await mailTransport.sendMail({
          from: SMTP_FROM,
          to: s.contact,
          subject: `This week's deals!`,
          text: `Check out this week's ad — attached as a picture.`,
          attachments
        });
        results.emailSent++;
      } catch (err) {
        console.warn(`[broadcast] email to ${s.contact} failed:`, err.message);
        results.emailFailed++;
      }
    }
  }

  if (twilioConfigured && smsSubs.length) {
    const mediaUrl = (PUBLIC_BASE_URL && flyer.rendered_image)
      ? `${PUBLIC_BASE_URL}/api/public/flyer-image/${encodeURIComponent(name)}`
      : null;
    for (const s of smsSubs) {
      try {
        await sendSms(s.contact, `This week's deals are up! ${mediaUrl ? '' : '(text us or check our page for the picture)'}`, mediaUrl);
        results.smsSent++;
      } catch (err) {
        console.warn(`[broadcast] sms to ${s.contact} failed:`, err.message);
        results.smsFailed++;
      }
    }
  }

  db.prepare('UPDATE flyers SET broadcast_sent = 1 WHERE name = ?').run(name);
  return results;
}

// Manual trigger — good for testing, or for one-off sends outside the schedule
app.post('/api/flyers/:name/send-now', requireAuth, async (req, res) => {
  try {
    const results = await broadcastFlyer(req.params.name);
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: 'send_failed', message: err.message });
  }
});

/* ---------------- Scheduled jobs: internal reminder + subscriber broadcast at go-live ---------------- */
function checkScheduledJobs() {
  const now = Date.now();

  if (mailTransport && REMINDER_TO.length) {
    const due = db.prepare('SELECT name FROM flyers WHERE scheduled_start IS NOT NULL AND scheduled_start <= ? AND notified = 0').all(now);
    for (const row of due) {
      mailTransport.sendMail({
        from: SMTP_FROM,
        to: REMINDER_TO.join(','),
        subject: `Weekly Ad Builder: "${row.name}" is now live`,
        text: `Your scheduled ad "${row.name}" just went live.`
      }).then(() => {
        db.prepare('UPDATE flyers SET notified = 1 WHERE name = ?').run(row.name);
        console.log(`[reminders] sent go-live email for "${row.name}"`);
      }).catch(err => console.warn('[reminders] failed to send email:', err.message));
    }
  }

  if ((mailTransport || twilioConfigured)) {
    const due = db.prepare('SELECT name FROM flyers WHERE scheduled_start IS NOT NULL AND scheduled_start <= ? AND broadcast_sent = 0').all(now);
    for (const row of due) {
      broadcastFlyer(row.name)
        .then(results => console.log(`[broadcast] sent "${row.name}" —`, results))
        .catch(err => console.warn(`[broadcast] failed for "${row.name}":`, err.message));
    }
  }
}
setInterval(checkScheduledJobs, 5 * 60 * 1000); // check every 5 minutes

/* ---------------- Static frontend ---------------- */
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Weekly Ad Builder running on http://localhost:${PORT}`);
  console.log(`On this network, others can reach it at http://<this-computer's-IP>:${PORT}`);
  console.log(`Find the IP with "ipconfig" (Windows) and look for IPv4 Address.`);
});
