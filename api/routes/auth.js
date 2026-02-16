const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { SECRET, auth } = require("../middleware/auth");

const router = express.Router();

// ── Login ──
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  db.query("SELECT * FROM users WHERE username=?", [username], async (err, rows) => {
    if (err) {
      console.error("Login DB error:", err.message);
      return res.status(500).json({ error: "Database unavailable" });
    }

    if (!rows || rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];
    if (!user.approved) return res.status(403).json({ error: "Account not approved" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: "2h" });
    const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (SECRET + "_REFRESH");
    const refreshToken = jwt.sign({ id: user.id, username: user.username, role: user.role }, REFRESH_SECRET, { expiresIn: "7d" });

    // Store refresh token in DB (survives restarts)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    db.query("INSERT INTO refresh_tokens(user_id, token, expires_at) VALUES(?,?,?)",
      [user.id, refreshToken, expiresAt], () => {});

    res.json({ token, refreshToken, user: { id: user.id, username: user.username, role: user.role } });
  });
});

// Register
router.post("/register", async (req, res) => {
  const { username, password, email, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Invalid email format" });

  const hash = await bcrypt.hash(password, 10);
  const userRole = role === "dj" ? "dj" : "pub";

  db.query("INSERT INTO users(username,email,password,role,approved) VALUES(?,?,?,?,?)",
    [username, email || null, hash, userRole, userRole === "pub" ? 1 : 0],
    (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username taken" });
        return res.status(500).json({ error: "Registration failed" });
      }
      res.json({ ok: true, message: userRole === "dj" ? "DJ account created — awaiting approval" : "Account created" });
    });
});

// ── Refresh token — get new access token ──
router.post("/token", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });

  // Verify token exists in DB and hasn't expired
  db.query("SELECT * FROM refresh_tokens WHERE token=? AND expires_at > NOW()", [refreshToken], (err, rows) => {
    if (err || !rows || rows.length === 0) return res.status(403).json({ error: "Invalid refresh token" });

    try {
      const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (SECRET + "_REFRESH");
      const payload = jwt.verify(refreshToken, REFRESH_SECRET);
      const newToken = jwt.sign({ id: payload.id, username: payload.username, role: payload.role }, SECRET, { expiresIn: "2h" });
      res.json({ token: newToken });
    } catch {
      // Token expired or invalid — remove from DB
      db.query("DELETE FROM refresh_tokens WHERE token=?", [refreshToken], () => {});
      res.status(403).json({ error: "Expired refresh token" });
    }
  });
});

// ── Logout — invalidate refresh token ──
router.post("/logout", (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    db.query("DELETE FROM refresh_tokens WHERE token=?", [refreshToken], () => {});
  }
  res.json({ ok: true });
});

// ── Cleanup expired tokens (runs on import) ──
setInterval(() => {
  db.query("DELETE FROM refresh_tokens WHERE expires_at < NOW()", () => {});
}, 60 * 60 * 1000); // every hour

// Get current user info
router.get("/me", auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
