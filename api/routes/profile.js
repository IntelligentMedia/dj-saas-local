const express = require("express");
const db = require("../db");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /profile — get current user's profile with stats
router.get("/", auth, async (req, res) => {
  try {
    // User info
    const [users] = await db.promise().query(
      "SELECT id, username, role, approved, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!users.length) return res.status(404).json({ error: "User not found" });
    const user = users[0];

    // Session stats
    const [sessions] = await db.promise().query(
      `SELECT 
        COUNT(*) as total_sessions,
        SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) as completed_sessions,
        COALESCE(SUM(TIMESTAMPDIFF(MINUTE, started_at, COALESCE(ended_at, NOW()))), 0) as total_minutes,
        COALESCE(SUM(
          ROUND(TIMESTAMPDIFF(MINUTE, started_at, COALESCE(ended_at, NOW())) / 60.0 * COALESCE(
            (SELECT b.rate FROM bookings b WHERE b.id = sessions.booking_id), 50
          ), 2)
        ), 0) as total_earned
       FROM sessions WHERE dj_id = ?`,
      [req.user.id]
    );

    // Booking stats
    const [bookings] = await db.promise().query(
      `SELECT COUNT(*) as total_bookings,
              SUM(CASE WHEN status = 'confirmed' OR status = 'active' THEN 1 ELSE 0 END) as upcoming
       FROM bookings WHERE dj_id = ?`,
      [req.user.id]
    );

    // Top genres played (from cloud_tracks used in playlists)
    const [genres] = await db.promise().query(
      `SELECT ct.genre, COUNT(*) as cnt
       FROM playlist_tracks pt
       JOIN cloud_tracks ct ON pt.track_id = ct.id
       JOIN playlists p ON pt.playlist_id = p.id
       WHERE p.user_id = ?
       GROUP BY ct.genre ORDER BY cnt DESC LIMIT 5`,
      [req.user.id]
    );

    // Recent sessions (last 5)
    const [recentSessions] = await db.promise().query(
      `SELECT s.id, s.started_at, s.ended_at, s.active,
              TIMESTAMPDIFF(MINUTE, s.started_at, COALESCE(s.ended_at, NOW())) as duration_minutes,
              pub.username as pub_name
       FROM sessions s
       LEFT JOIN bookings b ON s.booking_id = b.id
       LEFT JOIN users pub ON b.pub_id = pub.id
       WHERE s.dj_id = ?
       ORDER BY s.started_at DESC LIMIT 5`,
      [req.user.id]
    );

    const stats = sessions[0] || {};

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        member_since: user.created_at,
      },
      stats: {
        total_sessions: stats.total_sessions || 0,
        completed_sessions: stats.completed_sessions || 0,
        total_hours: Math.round((stats.total_minutes || 0) / 60 * 10) / 10,
        total_earned: Math.round((parseFloat(stats.total_earned) || 0) * 100) / 100,
        total_bookings: bookings[0]?.total_bookings || 0,
        upcoming_bookings: bookings[0]?.upcoming || 0,
      },
      top_genres: genres.map(g => ({ genre: g.genre, count: g.cnt })),
      recent_sessions: recentSessions,
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// PUT /profile — update username
router.put("/", auth, async (req, res) => {
  const { username } = req.body;
  if (!username || username.trim().length < 2) {
    return res.status(400).json({ error: "Username must be at least 2 characters" });
  }
  try {
    await db.promise().query("UPDATE users SET username = ? WHERE id = ?", [username.trim(), req.user.id]);
    res.json({ success: true, username: username.trim() });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ─── Play History ───

// POST /profile/history — log a track play
router.post("/history", auth, (req, res) => {
  const { session_id, track_id, track_title, track_artist, deck_name, duration_sec } = req.body;
  db.query(
    `INSERT INTO play_history (user_id, session_id, track_id, track_title, track_artist, deck_name, duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, session_id || null, track_id || null, track_title || "Unknown", track_artist || "Unknown", deck_name || null, duration_sec || 0],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to log play" });
      res.json({ ok: true });
    }
  );
});

// GET /profile/history — get play history (paginated)
router.get("/history", auth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  db.query("SELECT COUNT(*) as total FROM play_history WHERE user_id = ?", [req.user.id], (err, countRows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    const total = countRows[0]?.total || 0;

    db.query(
      `SELECT ph.*, ct.genre, ct.bpm, ct.energy
       FROM play_history ph
       LEFT JOIN cloud_tracks ct ON ph.track_id = ct.id
       WHERE ph.user_id = ?
       ORDER BY ph.played_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: "DB error" });
        res.json({
          history: rows || [],
          pagination: { total, page, pages: Math.ceil(total / limit) },
        });
      }
    );
  });
});

// GET /profile/history/stats — play history summary stats
router.get("/history/stats", auth, (req, res) => {
  db.query(
    `SELECT 
       COUNT(*) as total_plays,
       COUNT(DISTINCT track_title) as unique_tracks,
       COUNT(DISTINCT track_artist) as unique_artists,
       COALESCE(SUM(duration_sec), 0) as total_seconds
     FROM play_history WHERE user_id = ?`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      const s = rows[0] || {};
      res.json({
        total_plays: s.total_plays || 0,
        unique_tracks: s.unique_tracks || 0,
        unique_artists: s.unique_artists || 0,
        total_hours: Math.round((s.total_seconds || 0) / 3600 * 10) / 10,
      });
    }
  );
});

// ─── Session Setlists ───

// GET /profile/setlists — get list of sessions with track counts
router.get("/setlists", auth, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
         s.id as session_id,
         s.started_at,
         s.ended_at,
         s.active,
         TIMESTAMPDIFF(MINUTE, s.started_at, COALESCE(s.ended_at, NOW())) as duration_min,
         pub.username as pub_name,
         (SELECT COUNT(*) FROM play_history ph WHERE ph.session_id = s.id AND ph.user_id = ?) as track_count
       FROM sessions s
       LEFT JOIN bookings b ON s.booking_id = b.id
       LEFT JOIN users pub ON b.pub_id = pub.id
       WHERE s.dj_id = ?
       ORDER BY s.started_at DESC
       LIMIT 50`,
      [req.user.id, req.user.id]
    );
    res.json({ setlists: rows });
  } catch (err) {
    console.error("Setlists error:", err);
    res.status(500).json({ error: "Failed to load setlists" });
  }
});

// GET /profile/setlists/:sessionId — get tracks for a specific session
router.get("/setlists/:sessionId", auth, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;

    // Verify session belongs to user
    const [sessions] = await db.promise().query(
      "SELECT id, started_at, ended_at, active FROM sessions WHERE id = ? AND dj_id = ?",
      [sessionId, req.user.id]
    );
    if (!sessions.length) return res.status(404).json({ error: "Session not found" });
    const session = sessions[0];

    // Get tracks played in this session
    const [tracks] = await db.promise().query(
      `SELECT ph.track_title, ph.track_artist, ph.deck_name, ph.played_at, ph.duration_sec,
              ct.genre, ct.bpm, ct.energy
       FROM play_history ph
       LEFT JOIN cloud_tracks ct ON ph.track_id = ct.id
       WHERE ph.session_id = ? AND ph.user_id = ?
       ORDER BY ph.played_at ASC`,
      [sessionId, req.user.id]
    );

    res.json({
      session: {
        id: session.id,
        started_at: session.started_at,
        ended_at: session.ended_at,
        active: session.active,
      },
      tracks,
      total: tracks.length,
    });
  } catch (err) {
    console.error("Setlist detail error:", err);
    res.status(500).json({ error: "Failed to load setlist" });
  }
});

// ═══════════════════════════════════════════════════
//  Session Ratings
// ═══════════════════════════════════════════════════

// POST /profile/ratings — submit a rating for a DJ session
router.post("/ratings", auth, async (req, res) => {
  try {
    const { session_id, dj_id, rating, comment } = req.body;
    if (!dj_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "dj_id and rating (1-5) are required" });
    }

    // Create table if needed
    await db.promise().query(`
      CREATE TABLE IF NOT EXISTS session_ratings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT,
        dj_id INT NOT NULL,
        rater_id INT NOT NULL,
        rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_rating (session_id, rater_id)
      )
    `);

    // Prevent self-rating
    if (req.user.id === dj_id) {
      return res.status(400).json({ error: "Cannot rate yourself" });
    }

    // Upsert (one rating per session per rater, or one per DJ if no session)
    await db.promise().query(
      `INSERT INTO session_ratings (session_id, dj_id, rater_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
      [session_id || null, dj_id, req.user.id, rating, comment || null]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Submit rating error:", err);
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

// GET /profile/ratings/:djId — get ratings for a DJ
router.get("/ratings/:djId", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT sr.*, u.username as rater_name
       FROM session_ratings sr
       LEFT JOIN users u ON u.id = sr.rater_id
       WHERE sr.dj_id = ?
       ORDER BY sr.created_at DESC
       LIMIT 50`,
      [req.params.djId]
    );

    // Compute average
    const avg = rows.length > 0
      ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1)
      : null;

    res.json({ ratings: rows, average: avg, total: rows.length });
  } catch (err) {
    // Table might not exist yet
    res.json({ ratings: [], average: null, total: 0 });
  }
});

// ═══════════════════════════════════════════════════
//  DJ Settings
// ═══════════════════════════════════════════════════

// GET /profile/dj-settings — get DJ profile info + preferences
router.get("/dj-settings", auth, async (req, res) => {
  try {
    // Profile fields from users table
    const [users] = await db.promise().query(
      "SELECT id, username, bio, genres, social_links, avatar_url, hourly_rate FROM users WHERE id=?",
      [req.user.id]
    );
    if (!users.length) return res.status(404).json({ error: "User not found" });
    const user = users[0];

    // DJ settings (auto-create row if missing)
    let [settings] = await db.promise().query("SELECT * FROM dj_settings WHERE user_id=?", [req.user.id]);
    if (!settings.length) {
      await db.promise().query("INSERT INTO dj_settings(user_id) VALUES(?)", [req.user.id]);
      [settings] = await db.promise().query("SELECT * FROM dj_settings WHERE user_id=?", [req.user.id]);
    }
    const s = settings[0];

    res.json({
      profile: {
        username: user.username,
        bio: user.bio || "",
        genres: user.genres || "",
        social_links: user.social_links || "",
        avatar_url: user.avatar_url || "",
        hourly_rate: user.hourly_rate || 50,
      },
      audio: {
        crossfader_curve: s.crossfader_curve,
        default_eq_preset: s.default_eq_preset,
        auto_gain: !!s.auto_gain,
        default_mixer_mode: s.default_mixer_mode,
        bpm_sync_enabled: !!s.bpm_sync_enabled,
        auto_mix_transition: s.auto_mix_transition,
      },
      notifications: {
        notify_bookings: !!s.notify_bookings,
        notify_requests: !!s.notify_requests,
        notify_chat: !!s.notify_chat,
        notify_sound: !!s.notify_sound,
      },
      availability: {
        days: s.availability_days || "mon,tue,wed,thu,fri,sat,sun",
        start: s.availability_start || "18:00:00",
        end: s.availability_end || "02:00:00",
        timezone: s.timezone || "UTC",
      },
    });
  } catch (err) {
    console.error("DJ settings error:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// PUT /profile/dj-settings/profile — update DJ profile info
router.put("/dj-settings/profile", auth, async (req, res) => {
  const { username, bio, genres, social_links, avatar_url, hourly_rate } = req.body;
  try {
    const fields = [];
    const vals = [];
    if (username !== undefined) { fields.push("username=?"); vals.push(username.trim()); }
    if (bio !== undefined) { fields.push("bio=?"); vals.push(bio); }
    if (genres !== undefined) { fields.push("genres=?"); vals.push(genres); }
    if (social_links !== undefined) { fields.push("social_links=?"); vals.push(social_links); }
    if (avatar_url !== undefined) { fields.push("avatar_url=?"); vals.push(avatar_url); }
    if (hourly_rate !== undefined) {
      const rate = Number(hourly_rate);
      if (rate < 10 || rate > 500) return res.status(400).json({ error: "Rate must be $10–$500" });
      fields.push("hourly_rate=?"); vals.push(rate);
    }
    if (!fields.length) return res.status(400).json({ error: "No fields to update" });

    vals.push(req.user.id);
    await db.promise().query(`UPDATE users SET ${fields.join(",")} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username already taken" });
    res.status(500).json({ error: "Update failed" });
  }
});

// PUT /profile/dj-settings/audio — update audio preferences
router.put("/dj-settings/audio", auth, async (req, res) => {
  const { crossfader_curve, default_eq_preset, auto_gain, default_mixer_mode, bpm_sync_enabled, auto_mix_transition } = req.body;
  try {
    // Ensure row exists
    await db.promise().query("INSERT IGNORE INTO dj_settings(user_id) VALUES(?)", [req.user.id]);
    
    const fields = [];
    const vals = [];
    if (crossfader_curve !== undefined) { fields.push("crossfader_curve=?"); vals.push(crossfader_curve); }
    if (default_eq_preset !== undefined) { fields.push("default_eq_preset=?"); vals.push(default_eq_preset); }
    if (auto_gain !== undefined) { fields.push("auto_gain=?"); vals.push(auto_gain ? 1 : 0); }
    if (default_mixer_mode !== undefined) { fields.push("default_mixer_mode=?"); vals.push(default_mixer_mode); }
    if (bpm_sync_enabled !== undefined) { fields.push("bpm_sync_enabled=?"); vals.push(bpm_sync_enabled ? 1 : 0); }
    if (auto_mix_transition !== undefined) { fields.push("auto_mix_transition=?"); vals.push(auto_mix_transition); }
    if (!fields.length) return res.status(400).json({ error: "No fields" });

    vals.push(req.user.id);
    await db.promise().query(`UPDATE dj_settings SET ${fields.join(",")} WHERE user_id=?`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

// PUT /profile/dj-settings/notifications — update notification preferences
router.put("/dj-settings/notifications", auth, async (req, res) => {
  const { notify_bookings, notify_requests, notify_chat, notify_sound } = req.body;
  try {
    await db.promise().query("INSERT IGNORE INTO dj_settings(user_id) VALUES(?)", [req.user.id]);
    
    const fields = [];
    const vals = [];
    if (notify_bookings !== undefined) { fields.push("notify_bookings=?"); vals.push(notify_bookings ? 1 : 0); }
    if (notify_requests !== undefined) { fields.push("notify_requests=?"); vals.push(notify_requests ? 1 : 0); }
    if (notify_chat !== undefined) { fields.push("notify_chat=?"); vals.push(notify_chat ? 1 : 0); }
    if (notify_sound !== undefined) { fields.push("notify_sound=?"); vals.push(notify_sound ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: "No fields" });

    vals.push(req.user.id);
    await db.promise().query(`UPDATE dj_settings SET ${fields.join(",")} WHERE user_id=?`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

// PUT /profile/dj-settings/availability — update availability
router.put("/dj-settings/availability", auth, async (req, res) => {
  const { days, start, end, timezone } = req.body;
  try {
    await db.promise().query("INSERT IGNORE INTO dj_settings(user_id) VALUES(?)", [req.user.id]);
    
    const fields = [];
    const vals = [];
    if (days !== undefined) { fields.push("availability_days=?"); vals.push(days); }
    if (start !== undefined) { fields.push("availability_start=?"); vals.push(start); }
    if (end !== undefined) { fields.push("availability_end=?"); vals.push(end); }
    if (timezone !== undefined) { fields.push("timezone=?"); vals.push(timezone); }
    if (!fields.length) return res.status(400).json({ error: "No fields" });

    vals.push(req.user.id);
    await db.promise().query(`UPDATE dj_settings SET ${fields.join(",")} WHERE user_id=?`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

// PUT /profile/dj-settings/password — change password
router.put("/dj-settings/password", auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: "Both passwords required" });
  if (new_password.length < 4) return res.status(400).json({ error: "New password must be at least 4 characters" });

  try {
    const bcrypt = require("bcryptjs");
    const [users] = await db.promise().query("SELECT password FROM users WHERE id=?", [req.user.id]);
    if (!users.length) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(current_password, users[0].password);
    if (!match) return res.status(401).json({ error: "Current password incorrect" });

    const hash = await bcrypt.hash(new_password, 10);
    await db.promise().query("UPDATE users SET password=? WHERE id=?", [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Password change failed" });
  }
});

module.exports = router;
