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

  -- Reusable decorative graphics (badges, seasonal art) for the overlay picker,
  -- saved once and reused across flyers instead of re-uploading every time.
  CREATE TABLE IF NOT EXISTS image_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    img TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// migration-safe: add scheduling + broadcast columns to flyers if this is an older database
const flyerCols = db.prepare("PRAGMA table_info(flyers)").all().map(c => c.name);
if (!flyerCols.includes('scheduled_start')) db.exec('ALTER TABLE flyers ADD COLUMN scheduled_start INTEGER');
if (!flyerCols.includes('scheduled_end')) db.exec('ALTER TABLE flyers ADD COLUMN scheduled_end INTEGER');
if (!flyerCols.includes('notified')) db.exec('ALTER TABLE flyers ADD COLUMN notified INTEGER DEFAULT 0');
if (!flyerCols.includes('rendered_image')) db.exec('ALTER TABLE flyers ADD COLUMN rendered_image TEXT');
if (!flyerCols.includes('broadcast_sent')) db.exec('ALTER TABLE flyers ADD COLUMN broadcast_sent INTEGER DEFAULT 0');

if (!flyerCols.includes('deleted_at')) db.exec('ALTER TABLE flyers ADD COLUMN deleted_at INTEGER');

const productCols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
if (!productCols.includes('description')) db.exec("ALTER TABLE products ADD COLUMN description TEXT DEFAULT ''");
if (!productCols.includes('ad_size')) db.exec("ALTER TABLE products ADD COLUMN ad_size TEXT DEFAULT 'small'");
if (!productCols.includes('original_img')) db.exec('ALTER TABLE products ADD COLUMN original_img TEXT');
if (!productCols.includes('deleted_at')) db.exec('ALTER TABLE products ADD COLUMN deleted_at INTEGER');
if (!productCols.includes('category')) db.exec("ALTER TABLE products ADD COLUMN category TEXT DEFAULT ''");

// sensible defaults if not already set
const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
seed.run('adFree', 'false');
seed.run('pexelsKey', '');
seed.run('licenseStatus', 'active');
seed.run('licenseLastCheck', '0');
seed.run('licenseMessage', '');

db.dataDir = dataDir;
// Free-form canvas designs from the Ad Designer editor. `data` holds the whole
// design document (pages + elements) as JSON so the editor can evolve without
// schema migrations; the summary columns keep the "Your designs" list fast.
db.exec(`
  CREATE TABLE IF NOT EXISTS designs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    data TEXT NOT NULL,
    thumbnail TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_designs_updated ON designs (deleted_at, updated_at);
`);


/* ---------------- Businesses and user accounts ----------------
   Every business-owned row carries business_id. Installs from before accounts
   existed get one business (id 1) that owns all of their existing data. */
db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    role TEXT NOT NULL DEFAULT 'member',      -- 'admin' | 'member' within their business
    is_superadmin INTEGER NOT NULL DEFAULT 0, -- runs the whole install: every business, settings, backups
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );
`);

const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);

if (!hasColumn('flyers', 'business_id')) {
  db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM businesses WHERE id = 1').get()) {
      db.prepare('INSERT INTO businesses (id, name, created_at) VALUES (1, ?, ?)').run('My business', Date.now());
    }
    // flyers and products are keyed by name, so the key has to become (business_id, name):
    // SQLite can't change a primary key in place, so rebuild those two tables.
    db.exec(`
      CREATE TABLE flyers_new (
        business_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        scheduled_start INTEGER,
        scheduled_end INTEGER,
        notified INTEGER DEFAULT 0,
        rendered_image TEXT,
        broadcast_sent INTEGER DEFAULT 0,
        deleted_at INTEGER,
        PRIMARY KEY (business_id, name)
      );
      INSERT INTO flyers_new (business_id, name, data, updated_at, scheduled_start, scheduled_end, notified, rendered_image, broadcast_sent, deleted_at)
        SELECT 1, name, data, updated_at, scheduled_start, scheduled_end, notified, rendered_image, broadcast_sent, deleted_at FROM flyers;
      DROP TABLE flyers;
      ALTER TABLE flyers_new RENAME TO flyers;

      CREATE TABLE products_new (
        business_id INTEGER NOT NULL DEFAULT 1,
        name_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        img TEXT,
        price TEXT,
        unit TEXT,
        unit_custom TEXT,
        updated_at INTEGER NOT NULL,
        description TEXT DEFAULT '',
        ad_size TEXT DEFAULT 'small',
        original_img TEXT,
        deleted_at INTEGER,
        category TEXT DEFAULT '',
        PRIMARY KEY (business_id, name_key)
      );
      INSERT INTO products_new (business_id, name_key, display_name, img, price, unit, unit_custom, updated_at, description, ad_size, original_img, deleted_at, category)
        SELECT 1, name_key, display_name, img, price, unit, unit_custom, updated_at, description, ad_size, original_img, deleted_at, category FROM products;
      DROP TABLE products;
      ALTER TABLE products_new RENAME TO products;

      ALTER TABLE price_history ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE subscribers ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE image_library ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE designs ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1;
    `);
  })();
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_price_history_biz ON price_history (business_id, product_key, recorded_at);
  CREATE INDEX IF NOT EXISTS idx_subscribers_biz ON subscribers (business_id);
  CREATE INDEX IF NOT EXISTS idx_image_library_biz ON image_library (business_id);
  CREATE INDEX IF NOT EXISTS idx_designs_biz ON designs (business_id, deleted_at, updated_at);
`);

module.exports = db;
