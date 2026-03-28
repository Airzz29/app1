const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cookieParser = require('cookie-parser');
const bodyParser = require('express').urlencoded;

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_ROOT = IS_PROD ? '/var/data' : __dirname;
const DB_PATH = path.join(DATA_ROOT, 'data.sqlite');
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(DATA_ROOT, 'uploads')));

// Body parser
app.use(bodyParser({ extended: false }));
app.use(cookieParser());

// Uploads (images)
const uploadsDir = path.join(DATA_ROOT, 'uploads');
const receiptsDir = path.join(uploadsDir, 'receipts');

if (!fs.existsSync(DATA_ROOT)) {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});
const upload = multer({ storage });

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, receiptsDir),
  filename: (_req, file, cb) => {
    const base = file.originalname.replace(/\s+/g, '_');
    const safeName = base.replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      path.extname(file.originalname).toLowerCase() === '.pdf';
    if (!isPdf) {
      return cb(null, false);
    }
    cb(null, true);
  },
});

// SQLite setup
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS hauls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      genre TEXT,
      item_count INTEGER,
      duration_days INTEGER,
      cost REAL,
      cover_image TEXT,
      profile_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      haul_id INTEGER NOT NULL,
      item_name TEXT,
      platform TEXT,
      sold_price REAL,
      item_cost REAL,
      image_path TEXT,
      buyer_name TEXT,
      selling_account TEXT,
      tracking_code TEXT,
      profile_id INTEGER,
      sold_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (haul_id) REFERENCES hauls(id) ON DELETE CASCADE
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      profile_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      what_to_buy TEXT,
      target_date TEXT,
      details TEXT,
      profile_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  );

  // Best-effort migrations for existing databases
  db.run('ALTER TABLE hauls ADD COLUMN cover_image TEXT', () => {});
  db.run('ALTER TABLE hauls ADD COLUMN tracking_number TEXT', () => {});
  db.run('ALTER TABLE hauls ADD COLUMN tracking_added_at TEXT', () => {});
  db.run('ALTER TABLE hauls ADD COLUMN tracking_finished_at TEXT', () => {});
  db.run('ALTER TABLE sales ADD COLUMN image_path TEXT', () => {});
  db.run('ALTER TABLE sales ADD COLUMN buyer_name TEXT', () => {});
  db.run('ALTER TABLE sales ADD COLUMN selling_account TEXT', () => {});
  db.run('ALTER TABLE sales ADD COLUMN tracking_code TEXT', () => {});
  db.run('ALTER TABLE hauls ADD COLUMN profile_id INTEGER', () => {});
  db.run('ALTER TABLE sales ADD COLUMN profile_id INTEGER', () => {});
  db.run('ALTER TABLE todos ADD COLUMN profile_id INTEGER', () => {});
  db.run('ALTER TABLE plans ADD COLUMN profile_id INTEGER', () => {});

  db.run(
    `CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT,
      order_ref TEXT,
      description TEXT,
      status TEXT DEFAULT 'open',
      due_at TEXT,
      profile_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  );
  db.run('ALTER TABLE issues ADD COLUMN profile_id INTEGER', () => {});

  db.run(
    `CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE,
      name TEXT NOT NULL,
      password TEXT NOT NULL
    )`,
  );

  db.run(
    'INSERT OR IGNORE INTO profiles (id, slug, name, password) VALUES (1, "beric", "Beric", "beric101")',
  );
  db.run(
    'INSERT OR IGNORE INTO profiles (id, slug, name, password) VALUES (2, "ayaan", "Ayaan", "291177")',
  );

  // Ensure passwords are updated to the desired values even if rows already existed
  db.run(
    'UPDATE profiles SET password = "beric101" WHERE id = 1 OR slug = "beric"',
  );
  db.run(
    'UPDATE profiles SET password = "291177" WHERE id = 2 OR slug = "ayaan"',
  );

  // Assign existing records to profile 2 (Ayaan) by default if they are missing
  db.run('UPDATE hauls SET profile_id = 2 WHERE profile_id IS NULL', () => {});
  db.run('UPDATE sales SET profile_id = 2 WHERE profile_id IS NULL', () => {});
  db.run('UPDATE todos SET profile_id = 2 WHERE profile_id IS NULL', () => {});
  db.run('UPDATE plans SET profile_id = 2 WHERE profile_id IS NULL', () => {});
  db.run('UPDATE issues SET profile_id = 2 WHERE profile_id IS NULL', () => {});

  db.run(
    `CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      brand TEXT,
      title TEXT NOT NULL,
      original_filename TEXT,
      stored_filename TEXT NOT NULL,
      path TEXT NOT NULL,
      size_bytes INTEGER,
      uploaded_at TEXT DEFAULT (datetime('now'))
    )`,
  );

  db.run(
    'CREATE INDEX IF NOT EXISTS idx_receipts_profile ON receipts(profile_id)',
  );
  db.run(
    'CREATE INDEX IF NOT EXISTS idx_receipts_profile_brand_title ON receipts(profile_id, brand, title)',
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      related_haul_id INTEGER,
      related_item_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  );

  db.run(
    'CREATE INDEX IF NOT EXISTS idx_wallet_profile ON wallet_transactions(profile_id)',
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS shared_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      created_by INTEGER NOT NULL,
      last_edited_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES profiles(id),
      FOREIGN KEY (last_edited_by) REFERENCES profiles(id)
    )`,
  );
  db.run(
    'CREATE INDEX IF NOT EXISTS idx_shared_notes_updated ON shared_notes(updated_at)',
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS upcoming_hauls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      tracking_number TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  );
  db.run(
    'CREATE INDEX IF NOT EXISTS idx_upcoming_hauls_profile ON upcoming_hauls(profile_id)',
  );
});

// Helpers
function getAllHauls(profileId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM hauls WHERE profile_id = ? ORDER BY created_at DESC',
      [profileId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function getAllSales(profileId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM sales WHERE profile_id = ?',
      [profileId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function getTodos(profileId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM todos WHERE profile_id = ? ORDER BY completed ASC, created_at DESC',
      [profileId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function createTodo(text, profileId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'INSERT INTO todos (text, completed, profile_id) VALUES (?, 0, ?)',
    );
    stmt.run(text.trim(), profileId, function onRun(err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
    stmt.finalize();
  });
}

function toggleTodo(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT completed FROM todos WHERE id = ?', [id], (err, row) => {
      if (err || !row) return resolve();
      const next = row.completed ? 0 : 1;
      const stmt = db.prepare('UPDATE todos SET completed = ? WHERE id = ?');
      stmt.run(next, id, (updateErr) => {
        if (updateErr) return reject(updateErr);
        resolve();
      });
      stmt.finalize();
    });
  });
}

function deleteTodo(id) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    stmt.run(id, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function getUpcomingHauls(profileId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM upcoming_hauls WHERE profile_id = ? ORDER BY created_at DESC',
      [profileId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function createUpcomingHaul({ trackingNumber, notes, profileId }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'INSERT INTO upcoming_hauls (tracking_number, notes, profile_id) VALUES (?, ?, ?)',
    );
    stmt.run(
      trackingNumber ? String(trackingNumber).trim() : null,
      notes ? String(notes).trim() : null,
      profileId,
      function onRun(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      },
    );
    stmt.finalize();
  });
}

function deleteUpcomingHaulForProfile(id, profileId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'DELETE FROM upcoming_hauls WHERE id = ? AND profile_id = ?',
    );
    stmt.run(id, profileId, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function getPlans(profileId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM plans WHERE profile_id = ? ORDER BY target_date IS NULL, target_date ASC, created_at DESC',
      [profileId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function getPlanByIdForProfile(planId, profileId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM plans WHERE id = ? AND profile_id = ?',
      [planId, profileId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      },
    );
  });
}

function createPlan({ title, whatToBuy, targetDate, details, profileId }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'INSERT INTO plans (title, what_to_buy, target_date, details, profile_id) VALUES (?, ?, ?, ?, ?)',
    );
    stmt.run(
      title.trim(),
      whatToBuy ? whatToBuy.trim() : null,
      targetDate || null,
      details ? details.trim() : null,
      profileId,
      function onRun(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      },
    );
    stmt.finalize();
  });
}

function updatePlanForProfile(planId, profileId, { title, whatToBuy, targetDate, details }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `UPDATE plans
       SET title = ?, what_to_buy = ?, target_date = ?, details = ?
       WHERE id = ? AND profile_id = ?`,
    );
    stmt.run(
      title.trim(),
      whatToBuy ? String(whatToBuy) : null,
      targetDate || null,
      details ? String(details) : null,
      planId,
      profileId,
      (err) => {
        if (err) return reject(err);
        resolve();
      },
    );
    stmt.finalize();
  });
}

function deletePlan(id) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('DELETE FROM plans WHERE id = ?');
    stmt.run(id, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function getAllIssues(profileId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM issues WHERE profile_id = ? ORDER BY status = "resolved", due_at IS NULL, due_at ASC, created_at DESC',
      [profileId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function createIssue({ platform, orderRef, description, dueAt, profileId }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'INSERT INTO issues (platform, order_ref, description, status, due_at, profile_id) VALUES (?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      platform ? platform.trim() : null,
      orderRef ? orderRef.trim() : null,
      description ? description.trim() : null,
      'open',
      dueAt || null,
      profileId,
      function onRun(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      },
    );
    stmt.finalize();
  });
}

function resolveIssue(id) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'UPDATE issues SET status = "resolved" WHERE id = ?',
    );
    stmt.run(id, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function getRecentSalesWithHaul(limit, profileId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT s.*, h.name AS haul_name
       FROM sales s
       JOIN hauls h ON h.id = s.haul_id
       WHERE h.profile_id = ?
       ORDER BY s.sold_at DESC
       LIMIT ?`,
      [profileId, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function getAllProfiles() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM profiles ORDER BY id ASC', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function getProfileById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM profiles WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getProfileIdFromRequest(req) {
  const raw = req.cookies && req.cookies.profileId;
  const parsed = parseInt(raw, 10);
  if (!raw || Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

// Shared notes (visible to both profiles; no profile_id filter)
function getSharedNotes() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT n.*,
        creator.name AS created_by_name,
        editor.name AS last_edited_by_name
       FROM shared_notes n
       LEFT JOIN profiles creator ON creator.id = n.created_by
       LEFT JOIN profiles editor ON editor.id = n.last_edited_by
       ORDER BY n.updated_at DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function getMostRecentSharedNote() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT n.*,
        creator.name AS created_by_name,
        editor.name AS last_edited_by_name
       FROM shared_notes n
       LEFT JOIN profiles creator ON creator.id = n.created_by
       LEFT JOIN profiles editor ON editor.id = n.last_edited_by
       ORDER BY n.updated_at DESC
       LIMIT 1`,
      [],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      },
    );
  });
}

function createSharedNote({ title, body, profileId }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `INSERT INTO shared_notes (title, body, created_by, last_edited_by)
       VALUES (?, ?, ?, ?)`,
    );
    stmt.run(
      title ? title.trim() : 'Untitled',
      body ? body.trim() : null,
      profileId,
      profileId,
      function onRun(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      },
    );
    stmt.finalize();
  });
}

function updateSharedNote(id, { title, body, profileId }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `UPDATE shared_notes
       SET title = ?, body = ?, last_edited_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    );
    stmt.run(
      title ? title.trim() : 'Untitled',
      body ? body.trim() : null,
      profileId,
      id,
      (err) => {
        if (err) return reject(err);
        resolve();
      },
    );
    stmt.finalize();
  });
}

function deleteSharedNote(id) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('DELETE FROM shared_notes WHERE id = ?');
    stmt.run(id, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function createReceipt({
  profileId,
  brand,
  title,
  originalFilename,
  storedFilename,
  relativePath,
  sizeBytes,
}) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `INSERT INTO receipts (
        profile_id,
        brand,
        title,
        original_filename,
        stored_filename,
        path,
        size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      profileId,
      brand ? brand.trim() : null,
      title.trim(),
      originalFilename || null,
      storedFilename,
      relativePath,
      sizeBytes || null,
      function onRun(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      },
    );
    stmt.finalize();
  });
}

function getReceipts(profileId, searchTerm, sortKey) {
  return new Promise((resolve, reject) => {
    const params = [profileId];
    let whereClause = 'WHERE profile_id = ?';
    if (searchTerm && searchTerm.trim()) {
      whereClause += ' AND (brand LIKE ? OR title LIKE ?)';
      const like = `%${searchTerm.trim()}%`;
      params.push(like, like);
    }

    let orderBy = 'ORDER BY uploaded_at DESC';
    if (sortKey === 'name') {
      orderBy = 'ORDER BY title COLLATE NOCASE ASC';
    } else if (sortKey === 'date_asc') {
      orderBy = 'ORDER BY uploaded_at ASC';
    }

    const sql = `SELECT * FROM receipts ${whereClause} ${orderBy}`;
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function getReceiptByIdForProfile(id, profileId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM receipts WHERE id = ? AND profile_id = ?',
      [id, profileId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      },
    );
  });
}

function deleteReceiptByIdForProfile(id, profileId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'DELETE FROM receipts WHERE id = ? AND profile_id = ?',
    );
    stmt.run(id, profileId, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function createWalletTransaction({
  profileId,
  type,
  amount,
  description,
  relatedHaulId,
  relatedItemId,
}) {
  const desc =
    typeof description === 'string' && description.trim()
      ? description.trim()
      : '—';
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `INSERT INTO wallet_transactions (
        profile_id,
        type,
        amount,
        description,
        related_haul_id,
        related_item_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      profileId,
      type,
      amount,
      desc,
      relatedHaulId || null,
      relatedItemId || null,
      function onRun(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      },
    );
    stmt.finalize();
  });
}

function getWalletTransactions(profileId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM wallet_transactions WHERE profile_id = ? ORDER BY created_at DESC',
      [profileId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    );
  });
}

function computeWalletSummary(transactions, stats) {
  let balance = 0;
  let totalAdded = 0;
  let totalWithdrawn = 0;
  let totalRevenueFromSales = 0;
  let totalSpentOnHauls = 0;

  transactions.forEach((tx) => {
    const amt = tx.amount || 0;
    balance += amt;

    if (amt > 0) {
      if (tx.type === 'sale_revenue') {
        totalRevenueFromSales += amt;
      } else {
        totalAdded += amt;
      }
    } else if (amt < 0) {
      const abs = Math.abs(amt);
      if (tx.type === 'haul_purchase') {
        totalSpentOnHauls += abs;
      } else if (tx.type !== 'wallet_reset') {
        totalWithdrawn += abs;
      }
    }
  });

  const profitFromStats = stats ? stats.totalProfit : 0;

  return {
    balance,
    totalAdded,
    totalWithdrawn,
    totalRevenueFromSales,
    totalSpentOnHauls,
    profitFromStats,
  };
}

function createHaul({
  name,
  genre,
  itemCount,
  durationDays,
  cost,
  coverImage,
  trackingNumber,
  profileId,
}) {
  const hasTracking = trackingNumber && String(trackingNumber).trim();
  const trackingAddedAt = hasTracking ? new Date().toISOString() : null;
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'INSERT INTO hauls (name, genre, item_count, duration_days, cost, cover_image, tracking_number, tracking_added_at, profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      name.trim(),
      genre ? genre.trim() : null,
      itemCount || null,
      durationDays || null,
      cost || null,
      coverImage || null,
      hasTracking ? String(trackingNumber).trim() : null,
      trackingAddedAt,
      profileId || null,
      function onRun(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      },
    );
    stmt.finalize();
  });
}

function getHaulById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM hauls WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function updateHaul(id, { name, genre, itemCount, durationDays, cost, coverImage, trackingNumber, trackingAddedAt }) {
  const trackingVal = trackingNumber != null && trackingNumber !== '' ? String(trackingNumber).trim() : null;
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `UPDATE hauls
       SET name = ?, genre = ?, item_count = ?, duration_days = ?, cost = ?, cover_image = COALESCE(?, cover_image), tracking_number = ?, tracking_added_at = ?
       WHERE id = ?`,
    );
    stmt.run(
      name.trim(),
      genre ? genre.trim() : null,
      itemCount || null,
      durationDays || null,
      cost || null,
      coverImage || null,
      trackingVal,
      trackingAddedAt !== undefined ? trackingAddedAt : null,
      id,
      (err) => {
        if (err) return reject(err);
        resolve();
      },
    );
    stmt.finalize();
  });
}

function setHaulTrackingFinished(id) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('UPDATE hauls SET tracking_finished_at = ? WHERE id = ?');
    stmt.run(new Date().toISOString(), id, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function setHaulTrackingActive(id) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('UPDATE hauls SET tracking_finished_at = NULL WHERE id = ?');
    stmt.run(id, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function deleteHaul(id) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('DELETE FROM hauls WHERE id = ?');
    stmt.run(id, (err) => {
      if (err) return reject(err);
      resolve();
    });
    stmt.finalize();
  });
}

function createSale({
  haulId,
  itemName,
  platform,
  soldPrice,
  itemCost,
  imagePath,
  buyerName,
  sellingAccount,
  trackingCode,
  profileId,
}) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `INSERT INTO sales (
        haul_id,
        item_name,
        platform,
        sold_price,
        item_cost,
        image_path,
        buyer_name,
        selling_account,
        tracking_code,
        profile_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      haulId,
      itemName ? itemName.trim() : null,
      platform ? platform.trim() : null,
      soldPrice || null,
      itemCost || null,
      imagePath || null,
      buyerName ? buyerName.trim() : null,
      sellingAccount ? sellingAccount.trim() : null,
      trackingCode ? trackingCode.trim() : null,
      profileId || null,
      function onRun(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      },
    );
    stmt.finalize();
  });
}

function buildDashboardData(hauls, sales) {
  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const last7Boundary = now - 7 * MS_PER_DAY;
  const last30Boundary = now - 30 * MS_PER_DAY;

  const haulMap = {};
  hauls.forEach((h) => {
    haulMap[h.id] = {
      ...h,
      soldCount: 0,
      revenue: 0,
      profit: 0,
    };
  });

  let itemsSoldLast30Days = 0;
  let weeklyRevenue = 0;
  let weeklyProfit = 0;
  let totalRevenue = 0;
  let totalProfit = 0;

  sales.forEach((s) => {
    const haul = haulMap[s.haul_id];
    if (!haul) {
      return;
    }
    const soldPrice = s.sold_price || 0;
    const itemCost = s.item_cost || 0;
    const profit = soldPrice - itemCost;

    haul.soldCount += 1;
    haul.revenue += soldPrice;
    haul.profit += profit;

    totalRevenue += soldPrice;
    totalProfit += profit;

    const soldAt = s.sold_at ? new Date(s.sold_at) : null;
    const ts = soldAt ? soldAt.getTime() : null;

    if (ts && ts >= last30Boundary) {
      itemsSoldLast30Days += 1;
    }
    if (ts && ts >= last7Boundary) {
      weeklyRevenue += soldPrice;
      weeklyProfit += profit;
    }
  });

  const allHaulsWithAgg = Object.values(haulMap).map((h) => {
    const totalItems = h.item_count != null ? h.item_count : null;
    const itemsLeft =
      totalItems != null ? Math.max(totalItems - h.soldCount, 0) : null;

    let endAtMs = null;
    let endAtIso = null;
    if (h.duration_days != null) {
      const createdAtMs = Date.parse(
        `${h.created_at.replace(' ', 'T')}Z`,
      );
      if (!Number.isNaN(createdAtMs)) {
        endAtMs = createdAtMs + h.duration_days * MS_PER_DAY;
        endAtIso = new Date(endAtMs).toISOString();
      }
    }

    return {
      ...h,
      totalItems,
      itemsLeft,
      endAtMs,
      endAtIso,
    };
  });

  const activeHauls = [];
  const expiredHauls = [];
  const previousHauls = [];

  allHaulsWithAgg.forEach((h) => {
    const hasItems = h.totalItems != null && h.totalItems > 0;
    const isSoldOut = hasItems && h.soldCount >= h.totalItems;
    const hasEnd = h.endAtMs != null;
    const isExpiredByTime = hasEnd && h.endAtMs <= now;

    if (isSoldOut) {
      previousHauls.push(h);
    } else if (isExpiredByTime) {
      expiredHauls.push(h);
    } else {
      activeHauls.push(h);
    }
  });

  const totalActiveHauls = activeHauls.length;
  const itemsLeftTotal = activeHauls.reduce((acc, h) => {
    if (h.itemsLeft == null) return acc;
    return acc + h.itemsLeft;
  }, 0);

  const soldCountTotal = allHaulsWithAgg.reduce(
    (acc, h) => acc + h.soldCount,
    0,
  );
  const unsoldCountTotal = allHaulsWithAgg.reduce((acc, h) => {
    if (h.totalItems == null) return acc;
    return acc + Math.max(h.totalItems - h.soldCount, 0);
  }, 0);

  const stats = {
    itemsSoldLast30Days,
    weeklyRevenue,
    weeklyProfit,
    totalRevenue,
    totalProfit,
    totalActiveHauls,
    itemsLeftTotal,
    soldCountTotal,
    unsoldCountTotal,
  };

  const finishedTrackedHauls = allHaulsWithAgg.filter((h) => h.tracking_finished_at != null);

  return { activeHauls, expiredHauls, previousHauls, stats, finishedTrackedHauls };
}

// Attach currentProfile to locals when cookie is present
app.use(async (req, res, next) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) {
    res.locals.currentProfile = null;
    return next();
  }

  try {
    const profile = await getProfileById(profileId);
    res.locals.currentProfile = profile || null;
  } catch (err) {
    res.locals.currentProfile = null;
  }

  next();
});

// Routes
app.get('/', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) {
    return res.redirect('/profiles');
  }

  try {
    const [hauls, sales, recentSales, todos, plans, issues, walletTxns, latestSharedNote, upcomingHauls] =
      await Promise.all([
        getAllHauls(profileId),
        getAllSales(profileId),
        getRecentSalesWithHaul(8, profileId),
        getTodos(profileId),
        getPlans(profileId),
        getAllIssues(profileId),
        getWalletTransactions(profileId),
        getMostRecentSharedNote(),
        getUpcomingHauls(profileId),
      ]);
    const { activeHauls, expiredHauls, previousHauls, stats } =
      buildDashboardData(hauls, sales);

    const walletSummary = computeWalletSummary(walletTxns, stats);
    const openIssues = issues.filter((i) => i.status !== 'resolved');

    res.render('index', {
      activeHauls,
      expiredHauls,
      previousHauls,
      stats,
      recentSales,
      todos,
      plans,
      openIssues,
      walletSummary,
      latestSharedNote,
      upcomingHauls,
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.get('/track-hauls', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  try {
    const [hauls, sales] = await Promise.all([
      getAllHauls(profileId),
      getAllSales(profileId),
    ]);
    const { activeHauls, finishedTrackedHauls } = buildDashboardData(hauls, sales);
    const activeTrackedHauls = activeHauls.filter((h) => !h.tracking_finished_at);
    res.render('track-hauls', {
      activeTrackedHauls,
      finishedTrackedHauls: finishedTrackedHauls || [],
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.post('/hauls/:id/tracking-finish', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const haulId = parseInt(req.params.id, 10);
  if (Number.isNaN(haulId)) return res.redirect('/track-hauls');
  try {
    const haul = await getHaulById(haulId);
    if (!haul || haul.profile_id !== profileId) return res.redirect('/track-hauls');
    await setHaulTrackingFinished(haulId);
  } catch (err) {
    // ignore
  }
  res.redirect('/track-hauls');
});

app.post('/hauls/:id/tracking-active', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const haulId = parseInt(req.params.id, 10);
  if (Number.isNaN(haulId)) return res.redirect('/track-hauls');
  try {
    const haul = await getHaulById(haulId);
    if (!haul || haul.profile_id !== profileId) return res.redirect('/track-hauls');
    await setHaulTrackingActive(haulId);
  } catch (err) {
    // ignore
  }
  res.redirect('/track-hauls');
});

app.post('/upcoming-hauls', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const { trackingNumber, notes } = req.body || {};
  const tn = trackingNumber != null ? String(trackingNumber).trim() : '';
  const nt = notes != null ? String(notes).trim() : '';
  if (!tn && !nt) {
    return res.redirect('/');
  }
  try {
    await createUpcomingHaul({
      trackingNumber: tn || null,
      notes: nt || null,
      profileId,
    });
  } catch (err) {
    // ignore
  }
  res.redirect('/');
});

app.post('/upcoming-hauls/:id/delete', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const id = parseInt(req.params.id, 10);
  if (!Number.isNaN(id)) {
    try {
      await deleteUpcomingHaulForProfile(id, profileId);
    } catch (err) {
      // ignore
    }
  }
  res.redirect('/');
});

app.post('/hauls', upload.single('haulImage'), async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const { haulName, genre, itemCount, durationDays, cost, trackingNumber } = req.body;

  if (!haulName || !haulName.trim()) {
    return res.redirect('/');
  }

  const parsedItemCount = itemCount ? parseInt(itemCount, 10) : null;
  const parsedDuration = durationDays ? parseInt(durationDays, 10) : null;
  const parsedCost = cost ? parseFloat(cost) : null;
  const coverImage = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const newHaulId = await createHaul({
      name: haulName,
      genre,
      itemCount: Number.isNaN(parsedItemCount) ? null : parsedItemCount,
      durationDays: Number.isNaN(parsedDuration) ? null : parsedDuration,
      cost: Number.isNaN(parsedCost) ? null : parsedCost,
      coverImage,
      trackingNumber: trackingNumber ? String(trackingNumber).trim() : null,
      profileId,
    });
    if (!Number.isNaN(parsedCost) && parsedCost && parsedCost > 0) {
      await createWalletTransaction({
        profileId,
        type: 'haul_purchase',
        amount: -parsedCost,
        description: `Haul purchase: ${haulName.trim()}`,
        relatedHaulId: newHaulId,
        relatedItemId: null,
      });
    }
  } catch (err) {
    // Swallow DB error and just redirect for now
  }

  res.redirect('/');
});

app.post('/hauls/:id/edit', upload.single('haulImage'), async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const haulId = parseInt(req.params.id, 10);
  const { haulName, genre, itemCount, durationDays, cost, trackingNumber, from } = req.body;

  if (!haulName || !haulName.trim() || Number.isNaN(haulId)) {
    return res.redirect('/');
  }

  const parsedItemCount = itemCount ? parseInt(itemCount, 10) : null;
  const parsedDuration = durationDays ? parseInt(durationDays, 10) : null;
  const parsedCost = cost ? parseFloat(cost) : null;
  const coverImage = req.file ? `/uploads/${req.file.filename}` : null;
  const newTracking = trackingNumber != null && String(trackingNumber).trim() !== '' ? String(trackingNumber).trim() : null;

  try {
    const existing = await getHaulById(haulId);
    let trackingAddedAt = null;
    if (newTracking) {
      const hadTracking = existing && existing.tracking_number && String(existing.tracking_number).trim();
      trackingAddedAt = hadTracking ? (existing.tracking_added_at || null) : new Date().toISOString();
    }
    await updateHaul(haulId, {
      name: haulName,
      genre,
      itemCount: Number.isNaN(parsedItemCount) ? null : parsedItemCount,
      durationDays: Number.isNaN(parsedDuration) ? null : parsedDuration,
      cost: Number.isNaN(parsedCost) ? null : parsedCost,
      coverImage,
      trackingNumber: newTracking,
      trackingAddedAt,
    });
  } catch (err) {
    // ignore, redirect anyway
  }

  res.redirect(from === 'track-hauls' ? '/track-hauls' : '/');
});

app.post('/hauls/:id/delete', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const haulId = parseInt(req.params.id, 10);
  if (Number.isNaN(haulId)) {
    return res.redirect('/');
  }

  try {
    await deleteHaul(haulId);
  } catch (err) {
    // ignore, redirect anyway
  }

  res.redirect('/');
});

app.post(
  '/hauls/:id/sales',
  upload.single('itemImage'),
  async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const haulId = parseInt(req.params.id, 10);
  if (Number.isNaN(haulId)) {
    return res.redirect('/');
  }

  const {
    itemName,
    platform,
    soldPrice,
    itemCost,
    buyerName,
    sellingAccount,
    trackingCode,
  } = req.body;
  const parsedSoldPrice = soldPrice ? parseFloat(soldPrice) : null;
  const parsedItemCost = itemCost ? parseFloat(itemCost) : null;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const saleId = await createSale({
      haulId,
      itemName,
      platform,
      soldPrice: Number.isNaN(parsedSoldPrice) ? null : parsedSoldPrice,
      itemCost: Number.isNaN(parsedItemCost) ? null : parsedItemCost,
      imagePath,
      buyerName,
      sellingAccount,
      trackingCode,
      profileId,
    });
    if (!Number.isNaN(parsedSoldPrice) && parsedSoldPrice && parsedSoldPrice > 0) {
      await createWalletTransaction({
        profileId,
        type: 'sale_revenue',
        amount: parsedSoldPrice,
        description: `Sale revenue: ${itemName && itemName.trim() ? itemName.trim() : 'Item'}`,
        relatedHaulId: haulId,
        relatedItemId: saleId,
      });
    }
  } catch (err) {
    // ignore for now
  }

  res.redirect('/');
  },
);

app.post('/todos', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.redirect('/');
  }

  try {
    await createTodo(text, profileId);
  } catch (err) {
    // ignore
  }

  res.redirect('/');
});

app.post('/todos/:id/toggle', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const todoId = parseInt(req.params.id, 10);
  if (!Number.isNaN(todoId)) {
    try {
      await toggleTodo(todoId);
    } catch (err) {
      // ignore
    }
  }
  res.redirect('/');
});

app.post('/todos/:id/delete', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const todoId = parseInt(req.params.id, 10);
  if (!Number.isNaN(todoId)) {
    try {
      await deleteTodo(todoId);
    } catch (err) {
      // ignore
    }
  }
  res.redirect('/');
});

app.get('/planning', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  try {
    const plans = await getPlans(profileId);
    res.render('planning', { plans });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.get('/planning/:id', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const planId = parseInt(req.params.id, 10);
  if (Number.isNaN(planId)) return res.redirect('/planning');
  try {
    const plan = await getPlanByIdForProfile(planId, profileId);
    if (!plan) return res.redirect('/planning');
    res.render('plan-detail', { plan });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.get('/planning/:id/edit', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const planId = parseInt(req.params.id, 10);
  if (Number.isNaN(planId)) return res.redirect('/planning');
  try {
    const plan = await getPlanByIdForProfile(planId, profileId);
    if (!plan) return res.redirect('/planning');
    res.render('plan-edit', { plan });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.post('/planning', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const { title, whatToBuy, targetDate, details } = req.body;
  if (!title || !title.trim()) {
    return res.redirect('/planning');
  }

  try {
    await createPlan({
      title,
      whatToBuy,
      targetDate: targetDate || null,
      details,
      profileId,
    });
  } catch (err) {
    // ignore
  }

  res.redirect('/planning');
});

app.post('/planning/:id', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const planId = parseInt(req.params.id, 10);
  if (Number.isNaN(planId)) return res.redirect('/planning');
  const { title, whatToBuy, targetDate, details } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.redirect(`/planning/${planId}/edit`);
  }
  try {
    await updatePlanForProfile(planId, profileId, {
      title: String(title),
      whatToBuy: whatToBuy != null ? String(whatToBuy) : null,
      targetDate: targetDate || null,
      details: details != null ? String(details) : null,
    });
  } catch (err) {
    // ignore
  }
  res.redirect(`/planning/${planId}`);
});

app.post('/planning/:id/delete', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const planId = parseInt(req.params.id, 10);
  if (!Number.isNaN(planId)) {
    try {
      await deletePlan(planId);
    } catch (err) {
      // ignore
    }
  }
  res.redirect('/planning');
});

// Shared Notes (visible to both profiles)
app.get('/shared-notes', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  try {
    const notes = await getSharedNotes();
    res.render('shared-notes', { notes });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.post('/shared-notes', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const { title, body } = req.body;
  try {
    await createSharedNote({
      title: title || 'Untitled',
      body: body || null,
      profileId,
    });
  } catch (err) {
    // ignore
  }
  res.redirect('/shared-notes');
});

app.post('/shared-notes/:id/edit', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const noteId = parseInt(req.params.id, 10);
  const { title, body } = req.body;
  if (!Number.isNaN(noteId)) {
    try {
      await updateSharedNote(noteId, {
        title: title || 'Untitled',
        body: body || null,
        profileId,
      });
    } catch (err) {
      // ignore
    }
  }
  res.redirect('/shared-notes');
});

app.post('/shared-notes/:id/delete', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const noteId = parseInt(req.params.id, 10);
  if (!Number.isNaN(noteId)) {
    try {
      await deleteSharedNote(noteId);
    } catch (err) {
      // ignore
    }
  }
  res.redirect('/shared-notes');
});

app.get('/issues', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  try {
    const issues = await getAllIssues(profileId);
    res.render('issues', { issues });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.post('/issues', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const { platform, orderRef, description, dueAt } = req.body;
  if (!description || !description.trim()) {
    return res.redirect('/issues');
  }

  try {
    await createIssue({
      platform,
      orderRef,
      description,
      dueAt: dueAt || null,
      profileId,
    });
  } catch (err) {
    // ignore
  }

  res.redirect('/issues');
});

app.post('/issues/:id/resolve', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');
  const issueId = parseInt(req.params.id, 10);
  if (!Number.isNaN(issueId)) {
    try {
      await resolveIssue(issueId);
    } catch (err) {
      // ignore
    }
  }
  const backTo = req.query.from === 'dashboard' ? '/' : '/issues';
  res.redirect(backTo);
});

app.get('/tools', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  const { q, sort } = req.query;
  const sortKey = sort || 'date_desc';

  try {
    const receipts = await getReceipts(profileId, q, sortKey);
    res.render('tools', {
      receipts,
      query: q || '',
      sort: sortKey,
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.post(
  '/tools/upload',
  receiptUpload.single('receiptFile'),
  async (req, res) => {
    const profileId = getProfileIdFromRequest(req);
    if (!profileId) return res.redirect('/profiles');

    const { brand, title } = req.body;
    if (!title || !title.trim() || !req.file) {
      return res.redirect('/tools');
    }

    const storedFilename = req.file.filename;
    const relativePath = path.join('uploads', 'receipts', storedFilename);
    const sizeBytes = req.file.size;
    const originalFilename = req.file.originalname;

    try {
      await createReceipt({
        profileId,
        brand,
        title,
        originalFilename,
        storedFilename,
        relativePath,
        sizeBytes,
      });
    } catch (err) {
      // ignore, but keep file on disk
    }

    res.redirect('/tools');
  },
);

app.get('/tools/:id/download', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  const receiptId = parseInt(req.params.id, 10);
  if (Number.isNaN(receiptId)) {
    return res.redirect('/tools');
  }

  try {
    const receipt = await getReceiptByIdForProfile(receiptId, profileId);
    if (!receipt) {
      return res.redirect('/tools');
    }

    const fullPath = path.join(DATA_ROOT, receipt.path);
    const downloadName = receipt.original_filename || receipt.stored_filename;

    return res.download(fullPath, downloadName, (err) => {
      if (err) {
        res.redirect('/tools');
      }
    });
  } catch (err) {
    res.redirect('/tools');
  }
});

app.post('/tools/:id/delete', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  const receiptId = parseInt(req.params.id, 10);
  if (Number.isNaN(receiptId)) {
    return res.redirect('/tools');
  }

  try {
    const receipt = await getReceiptByIdForProfile(receiptId, profileId);
    if (receipt) {
      const fullPath = path.join(DATA_ROOT, receipt.path);
      fs.unlink(fullPath, () => {
        // ignore unlink errors
      });
      await deleteReceiptByIdForProfile(receiptId, profileId);
    }
  } catch (err) {
    // ignore
  }

  res.redirect('/tools');
});

app.get('/wallet', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  try {
    const [hauls, sales, walletTxns] = await Promise.all([
      getAllHauls(profileId),
      getAllSales(profileId),
      getWalletTransactions(profileId),
    ]);
    const { stats } = buildDashboardData(hauls, sales);
    const walletSummary = computeWalletSummary(walletTxns, stats);
    const walletHasStartingBalance = walletTxns.some(
      (tx) => tx.type === 'starting_balance',
    );

    res.render('wallet', {
      walletSummary,
      walletTransactions: walletTxns,
      walletHasStartingBalance,
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// API: wallet summary for current profile (used to refresh UI after bfcache/PWA navigation)
app.get('/api/wallet-summary', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.status(401).json({ error: 'not_authenticated' });

  try {
    const [hauls, sales, walletTxns] = await Promise.all([
      getAllHauls(profileId),
      getAllSales(profileId),
      getWalletTransactions(profileId),
    ]);
    const { stats } = buildDashboardData(hauls, sales);
    const walletSummary = computeWalletSummary(walletTxns, stats);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      balance: Number(walletSummary.balance || 0),
      totalAdded: Number(walletSummary.totalAdded || 0),
      totalWithdrawn: Number(walletSummary.totalWithdrawn || 0),
      totalRevenueFromSales: Number(walletSummary.totalRevenueFromSales || 0),
      totalSpentOnHauls: Number(walletSummary.totalSpentOnHauls || 0),
      profitFromStats: Number(walletSummary.profitFromStats || 0),
    });
  } catch (err) {
    return res.status(500).json({ error: 'db_error' });
  }
});

app.post('/wallet/starting', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  const amount = req.body && req.body.amount;
  const description = req.body && req.body.description;
  const parsedAmount =
    amount !== undefined && amount !== '' ? parseFloat(amount) : NaN;
  const descTrimmed = typeof description === 'string' ? description.trim() : '';

  if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
    return res.redirect('/wallet');
  }

  try {
    const walletTxns = await getWalletTransactions(profileId);
    const currentBalance = (walletTxns || []).reduce((sum, tx) => {
      return sum + (tx.amount || 0);
    }, 0);
    const desired = Number(Number(parsedAmount).toFixed(2));
    const delta = Number(Number(desired - currentBalance).toFixed(2));
    if (Math.abs(delta) < 0.01) {
      return res.redirect('/wallet');
    }

    await createWalletTransaction({
      profileId,
      type: 'starting_balance',
      amount: delta,
      description:
        descTrimmed ||
        `Set wallet balance to $${desired.toFixed(2)}`,
      relatedHaulId: null,
      relatedItemId: null,
    });
  } catch (err) {
    // continue to redirect
  }
  return res.redirect('/wallet');
});

app.post('/wallet/add', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  const amount = req.body && req.body.amount;
  const description = req.body && req.body.description;
  const parsedAmount =
    amount !== undefined && amount !== '' ? parseFloat(amount) : NaN;
  const descTrimmed = typeof description === 'string' ? description.trim() : '';

  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.redirect('/wallet');
  }

  try {
    const amt = Number(Number(parsedAmount).toFixed(2));
    await createWalletTransaction({
      profileId,
      type: 'manual_add',
      amount: amt,
      description: descTrimmed || 'Manual add',
      relatedHaulId: null,
      relatedItemId: null,
    });
  } catch (err) {
    // continue to redirect
  }
  return res.redirect('/wallet');
});

app.post('/wallet/withdraw', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  const amount = req.body && req.body.amount;
  const description = req.body && req.body.description;
  const parsedAmount =
    amount !== undefined && amount !== '' ? parseFloat(amount) : NaN;
  const descTrimmed = typeof description === 'string' ? description.trim() : '';

  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.redirect('/wallet');
  }

  try {
    const abs = Number(Number(parsedAmount).toFixed(2));
    await createWalletTransaction({
      profileId,
      type: 'manual_withdrawal',
      amount: -abs,
      description: descTrimmed || 'Manual withdrawal',
      relatedHaulId: null,
      relatedItemId: null,
    });
  } catch (err) {
    // continue to redirect
  }
  return res.redirect('/wallet');
});

// Reset wallet to $0: balance is always computed from wallet_transactions (never stored).
// This inserts a single transaction that negates the current balance so the new sum is 0.
app.post('/wallet/reset', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  try {
    const walletTxns = await getWalletTransactions(profileId);
    const [hauls, sales] = await Promise.all([
      getAllHauls(profileId),
      getAllSales(profileId),
    ]);
    const { stats } = buildDashboardData(hauls, sales);
    const walletSummary = computeWalletSummary(walletTxns, stats);
    const currentBalance = walletSummary.balance;

    if (Math.abs(currentBalance) < 0.01) {
      return res.redirect('/wallet');
    }

    const rawDesc = req.body && req.body.description;
    const description =
      (typeof rawDesc === 'string' && rawDesc.trim()) || 'Wallet reset to $0';

    const resetAmount = -Number(Number(currentBalance).toFixed(2));

    await createWalletTransaction({
      profileId,
      type: 'wallet_reset',
      amount: resetAmount,
      description,
      relatedHaulId: null,
      relatedItemId: null,
    });
    return res.redirect('/wallet');
  } catch (err) {
    return res.redirect('/wallet');
  }
});

app.get('/hauls/:id', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  const haulId = parseInt(req.params.id, 10);
  if (Number.isNaN(haulId)) {
    return res.redirect('/');
  }

  const { q } = req.query;

  try {
    const [haulRows, sales] = await Promise.all([
      getAllHauls(profileId),
      getAllSales(profileId),
    ]);
    const haul = haulRows.find((h) => h.id === haulId);
    if (!haul) {
      return res.redirect('/');
    }

    const salesForHaul = sales.filter((s) => s.haul_id === haulId);
    const totalItems =
      haul.item_count != null ? haul.item_count : salesForHaul.length;
    const soldCount = salesForHaul.length;
    const unsoldCount =
      totalItems != null ? Math.max(totalItems - soldCount, 0) : 0;

    const totalRevenue = salesForHaul.reduce(
      (sum, s) => sum + (s.sold_price || 0),
      0,
    );
    const totalProfit = salesForHaul.reduce((sum, s) => {
      const p = (s.sold_price || 0) - (s.item_cost || 0);
      return sum + p;
    }, 0);

    let filteredSales = salesForHaul;
    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      filteredSales = salesForHaul.filter((s) => {
        const name = (s.item_name || '').toLowerCase();
        const platform = (s.platform || '').toLowerCase();
        return (
          name.indexOf(term) !== -1 || platform.indexOf(term) !== -1
        );
      });
    }

    res.render('haul-details', {
      haul,
      totalItems,
      soldCount,
      unsoldCount,
      totalRevenue,
      totalProfit,
      soldItems: filteredSales,
      query: q || '',
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.get('/sold-items', async (req, res) => {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) return res.redirect('/profiles');

  const { q, sort } = req.query;
  const sortKey = sort || 'date_desc';

  try {
    const rows = await new Promise((resolve, reject) => {
      const params = [profileId];
      let where = 'WHERE h.profile_id = ?';
      if (q && q.trim()) {
        const like = `%${q.trim()}%`;
        where +=
          ' AND (s.item_name LIKE ? OR s.platform LIKE ? OR h.name LIKE ?)';
        params.push(like, like, like);
      }
      let orderBy = 'ORDER BY s.sold_at DESC';
      if (sortKey === 'date_asc') {
        orderBy = 'ORDER BY s.sold_at ASC';
      } else if (sortKey === 'name') {
        orderBy = 'ORDER BY s.item_name COLLATE NOCASE ASC';
      }

      const sql = `
        SELECT s.*, h.name AS haul_name
        FROM sales s
        JOIN hauls h ON h.id = s.haul_id
        ${where}
        ${orderBy}
      `;
      db.all(sql, params, (err, result) => {
        if (err) return reject(err);
        resolve(result || []);
      });
    });

    res.render('sold-items', {
      sales: rows,
      query: q || '',
      sort: sortKey,
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.get('/profiles', async (req, res) => {
  try {
    const profiles = await getAllProfiles();
    res.render('profiles', { profiles });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.get('/profiles/:id/login', async (req, res) => {
  const profileId = parseInt(req.params.id, 10);
  if (Number.isNaN(profileId)) {
    return res.redirect('/profiles');
  }
  try {
    const profile = await getProfileById(profileId);
    if (!profile) {
      return res.redirect('/profiles');
    }
    res.render('profile-login', { profile, error: null });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.post('/profiles/:id/login', async (req, res) => {
  const profileId = parseInt(req.params.id, 10);
  if (Number.isNaN(profileId)) {
    return res.redirect('/profiles');
  }
  const { password } = req.body;
  try {
    const profile = await getProfileById(profileId);
    if (!profile) {
      return res.redirect('/profiles');
    }
    if (!password || password !== profile.password) {
      return res.render('profile-login', {
        profile,
        error: 'Incorrect password. Please try again.',
      });
    }

    res.cookie('profileId', String(profile.id), {
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
    });
    res.redirect('/');
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.post('/profiles/logout', (req, res) => {
  res.clearCookie('profileId');
  res.redirect('/profiles');
});

// PWA: serve manifest explicitly if needed (also covered by static middleware)
app.get('/manifest.webmanifest', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manifest.webmanifest'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Resell Haul Tracker running at http://localhost:${PORT}`);
});
