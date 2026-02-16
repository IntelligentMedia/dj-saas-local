const express = require("express");
const db = require("../db");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

// POST /activation/activate — validate activation code within time window
router.post("/activate", auth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Activation code required" });

  db.query("SELECT * FROM activation_codes", (err, codes) => {
    if (err) return res.status(500).json({ error: "DB error" });

    const now = new Date();
    const valid = (codes || []).find(c =>
      c.code === code && now >= new Date(c.start_time) && now <= new Date(c.end_time)
    );

    if (!valid) return res.status(403).json({ error: "Invalid or expired activation code" });

    res.json({ ok: true, message: "Activation code valid", code: valid.code, expires: valid.end_time });
  });
});

// GET /activation/stream-access — triple-gated stream access check
// Checks: 1) DJ approved, 2) active session, 3) valid activation code in time window
router.get("/stream-access", auth, (req, res) => {
  const checks = { approved: false, activeSession: false, validActivation: false };

  // Check 1: DJ must be approved (or non-DJ roles pass)
  if (req.user.role !== "dj") {
    checks.approved = true;
  } else {
    db.query("SELECT approved FROM users WHERE id=?", [req.user.id], (err, rows) => {
      if (rows && rows[0]) checks.approved = !!rows[0].approved;
    });
  }

  // Check 2: Active session exists
  db.query("SELECT * FROM sessions WHERE active=1", (err, sessions) => {
    checks.activeSession = sessions && sessions.length > 0;

    // Check 3: Valid activation code
    db.query("SELECT * FROM activation_codes", (err, codes) => {
      const now = new Date();
      checks.validActivation = (codes || []).some(c =>
        now >= new Date(c.start_time) && now <= new Date(c.end_time)
      );

      // If user is DJ, check approved status from DB
      if (req.user.role === "dj") {
        db.query("SELECT approved FROM users WHERE id=?", [req.user.id], (err, rows) => {
          checks.approved = rows && rows[0] ? !!rows[0].approved : false;

          const granted = checks.approved && checks.activeSession && checks.validActivation;
          res.json({ granted, checks });
        });
      } else {
        checks.approved = true;
        const granted = checks.approved && checks.activeSession && checks.validActivation;
        res.json({ granted, checks });
      }
    });
  });
});

// GET /activation/codes — list all codes (admin)
router.get("/codes", auth, adminOnly, (req, res) => {
  db.query("SELECT * FROM activation_codes ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows || []);
  });
});

// POST /activation/codes — create new activation code (admin)
router.post("/codes", auth, adminOnly, (req, res) => {
  const { code, start_time, end_time } = req.body;
  if (!code || !start_time || !end_time) return res.status(400).json({ error: "code, start_time, end_time required" });

  db.query("INSERT INTO activation_codes(code,start_time,end_time) VALUES(?,?,?)",
    [code, start_time, end_time],
    (err) => {
      if (err) return res.status(500).json({ error: "Creation failed" });
      res.json({ ok: true });
    });
});

module.exports = router;
