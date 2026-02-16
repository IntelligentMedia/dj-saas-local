const express = require("express");
const db = require("../db");
const { auth, djOnly } = require("../middleware/auth");

const router = express.Router();

// List all rooms (with live status, DJ name, listener count)
router.get("/", (req, res) => {
  db.query(
    `SELECT r.*, u.username as dj_name 
     FROM rooms r 
     LEFT JOIN users u ON r.dj_id = u.id 
     ORDER BY r.is_live DESC, r.listeners DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows);
    }
  );
});

// Get live rooms only
router.get("/live", (req, res) => {
  db.query(
    `SELECT r.*, u.username as dj_name 
     FROM rooms r 
     LEFT JOIN users u ON r.dj_id = u.id 
     WHERE r.is_live = 1
     ORDER BY r.listeners DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows);
    }
  );
});

// Get single room with details
router.get("/:id", (req, res) => {
  db.query(
    `SELECT r.*, u.username as dj_name 
     FROM rooms r 
     LEFT JOIN users u ON r.dj_id = u.id 
     WHERE r.id = ?`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!rows.length) return res.status(404).json({ error: "Room not found" });
      res.json(rows[0]);
    }
  );
});

// Create room (DJ only)
router.post("/create", auth, djOnly, (req, res) => {
  const { name, genre } = req.body;
  if (!name) return res.status(400).json({ error: "Room name required" });

  db.query("INSERT INTO rooms(name, dj_id, is_live, genre) VALUES(?,?,1,?)",
    [name, req.user.id, genre || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Room creation failed" });
      res.json({ ok: true, roomId: result.insertId });
    });
});

// Go live / stop
router.post("/:id/toggle", auth, djOnly, (req, res) => {
  db.query("UPDATE rooms SET is_live = NOT is_live WHERE id=? AND dj_id=?",
    [req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: "Toggle failed" });
      res.json({ ok: true });
    });
});

// Join room (increment listener count)
router.post("/:id/join", auth, (req, res) => {
  db.query("UPDATE rooms SET listeners = listeners + 1 WHERE id=?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: "Join failed" });
      res.json({ ok: true });
    });
});

// Leave room (decrement listener count)
router.post("/:id/leave", auth, (req, res) => {
  db.query("UPDATE rooms SET listeners = GREATEST(0, listeners - 1) WHERE id=?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: "Leave failed" });
      res.json({ ok: true });
    });
});

// Update room genre / name (DJ only)
router.put("/:id", auth, djOnly, (req, res) => {
  const { name, genre } = req.body;
  const updates = [];
  const params = [];

  if (name) { updates.push("name = ?"); params.push(name); }
  if (genre) { updates.push("genre = ?"); params.push(genre); }

  if (!updates.length) return res.status(400).json({ error: "Nothing to update" });

  params.push(req.params.id, req.user.id);
  db.query(`UPDATE rooms SET ${updates.join(", ")} WHERE id=? AND dj_id=?`, params,
    (err) => {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ ok: true });
    });
});

module.exports = router;
