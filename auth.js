// Accounts: password hashing and the user/business lookups the server needs.
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const MIN_PASSWORD = 8;
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function createAccounts(db) {
  const q = {
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    byEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    business: db.prepare('SELECT * FROM businesses WHERE id = ?'),
    businesses: db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS user_count
                            FROM businesses b ORDER BY b.name COLLATE NOCASE`),
    addBusiness: db.prepare('INSERT INTO businesses (name, created_at) VALUES (?, ?)'),
    renameBusiness: db.prepare('UPDATE businesses SET name = ? WHERE id = ?'),
    addUser: db.prepare(`INSERT INTO users (email, name, password_hash, business_id, role, is_superadmin, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`),
    usersOf: db.prepare(`SELECT id, email, name, role, is_superadmin, disabled, created_at, last_login_at
                         FROM users WHERE business_id = ? ORDER BY name COLLATE NOCASE, email`),
    touchLogin: db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    update: db.prepare('UPDATE users SET name = ?, role = ?, disabled = ? WHERE id = ?')
  };

  return {
    hasUsers: () => q.userCount.get().n > 0,
    findByEmail: (email) => q.byEmail.get(normalizeEmail(email)),
    findById: (id) => q.byId.get(id),
    business: (id) => q.business.get(id),
    businesses: () => q.businesses.all(),
    createBusiness: (name) => Number(q.addBusiness.run(String(name).trim().slice(0, 120), Date.now()).lastInsertRowid),
    renameBusiness: (id, name) => q.renameBusiness.run(String(name).trim().slice(0, 120), id),
    usersOf: (businessId) => q.usersOf.all(businessId),
    touchLogin: (id) => q.touchLogin.run(Date.now(), id),
    setPassword: (id, password) => q.setPassword.run(hashPassword(password), id),
    updateUser: (id, { name, role, disabled }) => q.update.run(name, role, disabled ? 1 : 0, id),
    createUser({ email, name, password, businessId, role = 'member', superadmin = false }) {
      const info = q.addUser.run(normalizeEmail(email), String(name || '').trim().slice(0, 120), hashPassword(password),
        businessId, role === 'admin' ? 'admin' : 'member', superadmin ? 1 : 0, Date.now());
      return Number(info.lastInsertRowid);
    }
  };
}

module.exports = { hashPassword, verifyPassword, createAccounts, normalizeEmail, validEmail, MIN_PASSWORD };
