const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Installed builds keep customer data outside Program Files so upgrading the
// application can never overwrite flyers, catalog photos, or settings. Local
// development keeps using the project folder unless CASH_SAVER_DATA_DIR is set.
const dataDir = process.env.CASH_SAVER_DATA_DIR
  ? path.resolve(process.env.CASH_SAVER_DATA_DIR)
  : __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS flyers (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    name_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    img TEXT,
    price TEXT,
    unit TEXT,
    unit_custom TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,        -- 'email' | 'sms'
    contact TEXT NOT NULL,
    name TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_key TEXT NOT NULL,
    price TEXT NOT NULL,
    unit TEXT,
    recorded_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history (product_key, recorded_at);
`);

// migration-safe: add scheduling + broadcast columns to flyers if this is an older database
const flyerCols = db.prepare("PRAGMA table_info(flyers)").all().map(c => c.name);
if (!flyerCols.includes('scheduled_start')) db.exec('ALTER TABLE flyers ADD COLUMN scheduled_start INTEGER');
if (!flyerCols.includes('scheduled_end')) db.exec('ALTER TABLE flyers ADD COLUMN scheduled_end INTEGER');
if (!flyerCols.includes('notified')) db.exec('ALTER TABLE flyers ADD COLUMN notified INTEGER DEFAULT 0');
if (!flyerCols.includes('rendered_image')) db.exec('ALTER TABLE flyers ADD COLUMN rendered_image TEXT');
if (!flyerCols.includes('broadcast_sent')) db.exec('ALTER TABLE flyers ADD COLUMN broadcast_sent INTEGER DEFAULT 0');

const productCols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
if (!productCols.includes('description')) db.exec("ALTER TABLE products ADD COLUMN description TEXT DEFAULT ''");
if (!productCols.includes('ad_size')) db.exec("ALTER TABLE products ADD COLUMN ad_size TEXT DEFAULT 'small'");
if (!productCols.includes('original_img')) db.exec('ALTER TABLE products ADD COLUMN original_img TEXT');

// sensible defaults if not already set
const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
seed.run('adFree', 'false');
seed.run('pexelsKey', '');
seed.run('licenseStatus', 'active');
seed.run('licenseLastCheck', '0');
seed.run('licenseMessage', '');

module.exports = db;
