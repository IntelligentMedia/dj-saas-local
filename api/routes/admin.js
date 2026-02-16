const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { auth, adminOnly, staffOnly, can, STAFF_ROLES, ALL_ROLES } = require("../middleware/auth");

const router = express.Router();

// GET /admin/me — return current user's permissions for frontend rendering
router.get("/me", auth, staffOnly, (req, res) => {
  const role = req.user.role;
  const perms = {};
  for (const [key, roles] of Object.entries(require("../middleware/auth").PERMISSIONS)) {
    perms[key] = roles.includes(role);
  }
  res.json({ role, permissions: perms });
});

// Get all users (admin, sysadmin, support)
router.get("/users", auth, can("users"), (req, res) => {
  db.query("SELECT id, username, role, approved, created_at FROM users", (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

// Create user (admin, sysadmin only)
router.post("/create-user", auth, adminOnly, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const hash = await bcrypt.hash(password, 10);
  db.query("INSERT INTO users(username,password,role,approved) VALUES(?,?,?,1)",
    [username, hash, role || "pub"],
    (err) => {
      if (err) return res.status(500).json({ error: "Creation failed" });
      res.json({ ok: true });
    });
});

// Delete user (admin, sysadmin only)
router.delete("/delete-user/:id", auth, adminOnly, (req, res) => {
  db.query("DELETE FROM users WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ ok: true });
  });
});

// Approve DJ (admin, sysadmin, support)
router.post("/approve/:id", auth, can("users"), (req, res) => {
  db.query("UPDATE users SET approved=1 WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Approval failed" });
    res.json({ ok: true });
  });
});

// Platform stats (admin, sysadmin)
router.get("/stats", auth, can("stats"), (req, res) => {
  const stats = {};
  db.query("SELECT COUNT(*) as count FROM users WHERE role='dj'", (err, r) => {
    stats.djs = r ? r[0].count : 0;
    db.query("SELECT COUNT(*) as count FROM users WHERE role='pub'", (err, r) => {
      stats.pubs = r ? r[0].count : 0;
      db.query("SELECT COUNT(*) as count FROM users WHERE role IN ('accountant','support','sales','marketing','sysadmin')", (err, r) => {
        stats.employees = r ? r[0].count : 0;
        db.query("SELECT * FROM rooms WHERE is_live=1", (err, rooms) => {
          stats.rooms = rooms || [];
          stats.totalRooms = rooms ? rooms.length : 0;
          res.json(stats);
        });
      });
    });
  });
});

// ═══════════════════════════════════════════════
// PAYMENT METHOD SETTINGS
// ═══════════════════════════════════════════════

// Auto-create payment_settings table
db.query(`CREATE TABLE IF NOT EXISTS payment_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`);

// Seed defaults — uses INSERT IGNORE so existing keys are never overwritten
{
  const defaults = [
    ["platform_fee_percent", "20"],
    ["currency", "USD"],
    ["min_payout_amount", "25"],
    ["payout_schedule", "weekly"],
    ["accepted_methods", JSON.stringify(["credit_card", "debit_card", "paypal", "bank_transfer"])],
    ["tax_rate", "0"],
    ["invoice_prefix", "DJSAAS"],
    ["auto_process_payments", "false"],
    // ── Stripe ──
    ["stripe_enabled", "false"],
    ["stripe_mode", "sandbox"],
    ["stripe_live_public_key", ""],
    ["stripe_live_secret_key", ""],
    ["stripe_sandbox_public_key", ""],
    ["stripe_sandbox_secret_key", ""],
    ["stripe_webhook_secret", ""],
    // ── PayPal ──
    ["paypal_enabled", "false"],
    ["paypal_mode", "sandbox"],
    ["paypal_live_client_id", ""],
    ["paypal_live_secret", ""],
    ["paypal_sandbox_client_id", ""],
    ["paypal_sandbox_secret", ""],
    ["paypal_webhook_id", ""],
    // ── Square ──
    ["square_enabled", "false"],
    ["square_mode", "sandbox"],
    ["square_live_app_id", ""],
    ["square_live_access_token", ""],
    ["square_sandbox_app_id", ""],
    ["square_sandbox_access_token", ""],
    ["square_location_id", ""],
    // ── Bank Transfer ──
    ["bank_transfer_enabled", "true"],
    ["bank_name", ""],
    ["bank_account_name", ""],
    ["bank_account_number", ""],
    ["bank_routing_number", ""],
    ["bank_swift_code", ""],
    ["bank_iban", ""],
    // ── Cash ──
    ["cash_enabled", "true"],
    // ── Crypto ──
    ["crypto_enabled", "false"],
    ["crypto_wallet_address", ""],
    ["crypto_network", "ethereum"],
    ["crypto_accepted_coins", JSON.stringify(["BTC", "ETH", "USDT"])],
  ];
  defaults.forEach(([k, v]) => {
    db.query("INSERT IGNORE INTO payment_settings(setting_key,setting_value) VALUES(?,?)", [k, v]);
  });
}

// GET /admin/payment-settings (admin, sysadmin, accountant)
router.get("/payment-settings", auth, can("payment_settings"), (req, res) => {
  db.query("SELECT * FROM payment_settings ORDER BY setting_key", (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    const settings = {};
    (rows || []).forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json(settings);
  });
});

// PUT /admin/payment-settings (admin, sysadmin, accountant)
router.put("/payment-settings", auth, can("payment_settings"), (req, res) => {
  const entries = Object.entries(req.body);
  if (entries.length === 0) return res.status(400).json({ error: "No settings provided" });

  let done = 0;
  let errors = 0;
  entries.forEach(([key, value]) => {
    db.query(
      "INSERT INTO payment_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=?",
      [key, String(value), String(value)],
      (err) => {
        if (err) errors++;
        done++;
        if (done === entries.length) {
          if (errors) return res.status(500).json({ error: `${errors} setting(s) failed to update` });
          res.json({ ok: true, updated: entries.length });
        }
      }
    );
  });
});

// ── Subscription Plan CRUD ──

// GET /admin/plans (admin, sysadmin, sales)
router.get("/plans", auth, can("plans"), (req, res) => {
  db.query("SELECT * FROM subscription_plans ORDER BY price ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows || []);
  });
});

// POST /admin/plans (admin, sysadmin, sales)
router.post("/plans", auth, can("plans"), (req, res) => {
  const { name, price, max_hours_per_month, max_bookings_per_month, commission_rate, features } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: "name and price required" });
  db.query(
    "INSERT INTO subscription_plans(name,price,max_hours_per_month,max_bookings_per_month,commission_rate,features,enabled) VALUES(?,?,?,?,?,?,1)",
    [name, price, max_hours_per_month || 0, max_bookings_per_month || 0, commission_rate || 20, features || ""],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Create failed" });
      res.json({ ok: true, id: result.insertId });
    }
  );
});

// PUT /admin/plans/:id (admin, sysadmin, sales)
router.put("/plans/:id", auth, can("plans"), (req, res) => {
  const { name, price, max_hours_per_month, max_bookings_per_month, commission_rate, features } = req.body;
  db.query(
    "UPDATE subscription_plans SET name=?, price=?, max_hours_per_month=?, max_bookings_per_month=?, commission_rate=?, features=? WHERE id=?",
    [name, price, max_hours_per_month, max_bookings_per_month, commission_rate, features, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ ok: true });
    }
  );
});

// PATCH /admin/plans/:id/toggle (admin, sysadmin, sales)
router.patch("/plans/:id/toggle", auth, can("plans"), (req, res) => {
  db.query("UPDATE subscription_plans SET enabled = NOT enabled WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Toggle failed" });
    res.json({ ok: true });
  });
});

// DELETE /admin/plans/:id (admin, sysadmin only)
router.delete("/plans/:id", auth, adminOnly, (req, res) => {
  db.query("DELETE FROM subscription_plans WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ ok: true });
  });
});

// GET /admin/payment-summary (admin, sysadmin, accountant)
router.get("/payment-summary", auth, can("payment_summary"), (req, res) => {
  const queries = {
    totalRevenue: "SELECT IFNULL(SUM(amount),0) as v FROM payments WHERE type='booking_payment' AND status='completed'",
    totalPlatformFees: "SELECT IFNULL(SUM(amount),0) as v FROM payments WHERE type='platform_fee' AND status='completed'",
    totalDjPayouts: "SELECT IFNULL(SUM(amount),0) as v FROM payments WHERE type='dj_payout' AND status='completed'",
    totalSubscriptions: "SELECT IFNULL(SUM(amount),0) as v FROM payments WHERE type='subscription' AND status='completed'",
    totalTransactions: "SELECT COUNT(*) as v FROM payments",
    pendingPayments: "SELECT COUNT(*) as v FROM payments WHERE status='pending'",
    recentTransactions: null,
  };

  const results = {};
  const keys = Object.keys(queries).filter(k => queries[k]);
  let done = 0;

  keys.forEach(key => {
    db.query(queries[key], (err, rows) => {
      results[key] = rows?.[0]?.v || 0;
      done++;
      if (done === keys.length) {
        // Get recent 20 transactions
        db.query(
          `SELECT p.*, u1.username as payer_name, u2.username as payee_name
           FROM payments p
           LEFT JOIN users u1 ON p.payer_id = u1.id
           LEFT JOIN users u2 ON p.payee_id = u2.id
           ORDER BY p.created_at DESC LIMIT 20`,
          (err2, txns) => {
            results.recentTransactions = txns || [];
            results.netPlatformIncome = Number(results.totalPlatformFees) + Number(results.totalSubscriptions);
            res.json(results);
          }
        );
      }
    });
  });
});

// ═══════════════════════════════════════════════
// LANDING PAGE CONTENT MANAGEMENT
// ═══════════════════════════════════════════════

// GET /admin/landing — public: get all landing content (no auth needed for landing page)
router.get("/landing", (req, res) => {
  db.query("SELECT section_key, content_type, content FROM landing_content", (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    const data = {};
    (rows || []).forEach(r => {
      if (r.content_type === "json") {
        try { data[r.section_key] = JSON.parse(r.content); } catch { data[r.section_key] = r.content; }
      } else {
        data[r.section_key] = r.content || "";
      }
    });
    res.json(data);
  });
});

// PUT /admin/landing (admin, sysadmin, marketing)
router.put("/landing", auth, can("landing"), (req, res) => {
  const entries = Object.entries(req.body);
  if (entries.length === 0) return res.status(400).json({ error: "No content provided" });

  let done = 0, errors = 0;
  entries.forEach(([key, value]) => {
    const strVal = typeof value === "object" ? JSON.stringify(value) : String(value);
    const contentType = typeof value === "object" ? "json" : (key.includes("_url") || key.includes("_image") ? "url" : "text");
    db.query(
      "INSERT INTO landing_content(section_key,content_type,content) VALUES(?,?,?) ON DUPLICATE KEY UPDATE content=?, content_type=?",
      [key, contentType, strVal, strVal, contentType],
      (err) => {
        if (err) errors++;
        done++;
        if (done === entries.length) {
          if (errors) return res.status(500).json({ error: `${errors} field(s) failed` });
          res.json({ ok: true, updated: entries.length });
        }
      }
    );
  });
});

// DELETE /admin/landing/:key (admin, sysadmin, marketing)
router.delete("/landing/:key", auth, can("landing"), (req, res) => {
  db.query("DELETE FROM landing_content WHERE section_key=?", [req.params.key], (err) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ ok: true });
  });
});

// ═══════════════════════════════════════════════
// EMPLOYEE ROLE MANAGEMENT
// ═══════════════════════════════════════════════

// Auto-create role_config table
db.query(`CREATE TABLE IF NOT EXISTS role_config (
  role_name VARCHAR(30) PRIMARY KEY,
  display_name VARCHAR(60) NOT NULL,
  description TEXT,
  icon VARCHAR(10) DEFAULT '',
  color VARCHAR(20) DEFAULT '#888',
  permissions TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`);

// GET /admin/roles — list all role configs
router.get("/roles", auth, adminOnly, (req, res) => {
  db.query("SELECT * FROM role_config ORDER BY FIELD(role_name,'admin','sysadmin','accountant','support','sales','marketing')", (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    // Also count users per role
    db.query("SELECT role, COUNT(*) as count FROM users GROUP BY role", (err2, counts) => {
      const countMap = {};
      (counts || []).forEach(c => { countMap[c.role] = c.count; });
      const roles = (rows || []).map(r => ({
        ...r,
        permissions: (() => { try { return JSON.parse(r.permissions); } catch { return {}; } })(),
        user_count: countMap[r.role_name] || 0,
      }));
      res.json(roles);
    });
  });
});

// GET /admin/roles/:name — single role details
router.get("/roles/:name", auth, adminOnly, (req, res) => {
  db.query("SELECT * FROM role_config WHERE role_name=?", [req.params.name], (err, rows) => {
    if (err || !rows || !rows.length) return res.status(404).json({ error: "Role not found" });
    const r = rows[0];
    r.permissions = (() => { try { return JSON.parse(r.permissions); } catch { return {}; } })();
    // Users with this role
    db.query("SELECT id, username, approved, created_at FROM users WHERE role=?", [req.params.name], (err2, users) => {
      r.users = users || [];
      res.json(r);
    });
  });
});

// PUT /admin/roles/:name — update role config (display_name, description, color, permissions)
router.put("/roles/:name", auth, adminOnly, (req, res) => {
  const { display_name, description, color, permissions } = req.body;
  const permStr = typeof permissions === "object" ? JSON.stringify(permissions) : permissions;
  db.query(
    "UPDATE role_config SET display_name=?, description=?, color=?, permissions=? WHERE role_name=?",
    [display_name, description, color, permStr, req.params.name],
    (err) => {
      if (err) return res.status(500).json({ error: "Update failed" });
      // Also hot-reload the PERMISSIONS in auth middleware
      try {
        const authMod = require("../middleware/auth");
        const permsObj = typeof permissions === "object" ? permissions : JSON.parse(permissions);
        for (const [perm, allowed] of Object.entries(permsObj)) {
          if (!authMod.PERMISSIONS[perm]) continue;
          if (allowed && !authMod.PERMISSIONS[perm].includes(req.params.name)) {
            authMod.PERMISSIONS[perm].push(req.params.name);
          } else if (!allowed) {
            authMod.PERMISSIONS[perm] = authMod.PERMISSIONS[perm].filter(r => r !== req.params.name);
          }
        }
      } catch {}
      res.json({ ok: true });
    }
  );
});

// PUT /admin/roles/:name/change-user-role — change a user's role
router.put("/roles/change-user-role/:userId", auth, adminOnly, (req, res) => {
  const { role } = req.body;
  if (!ALL_ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
  db.query("UPDATE users SET role=? WHERE id=?", [role, req.params.userId], (err) => {
    if (err) return res.status(500).json({ error: "Update failed" });
    res.json({ ok: true });
  });
});

module.exports = router;
