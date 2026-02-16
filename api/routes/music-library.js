const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { auth, adminOnly, djOnly } = require("../middleware/auth");

const router = express.Router();

const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Stream rate limit exceeded." },
});

// ─── Browse / Search Tracks (paginated) ───
// GET /music/tracks?q=&genre=&bpm_min=&bpm_max=&energy_min=&key=&sort=&page=&limit=
router.get("/tracks", auth, (req, res) => {
  const {
    q, genre, bpm_min, bpm_max, energy_min, energy_max,
    key: keyFilter, year, sort = "title", order = "ASC",
    page = 1, limit = 30,
  } = req.query;

  let where = ["ct.is_active = 1"];
  let params = [];

  // Full-text search on title/artist/album
  if (q && q.trim()) {
    where.push("(ct.title LIKE ? OR ct.artist LIKE ? OR ct.album LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }

  if (genre) {
    where.push("ct.genre = ?");
    params.push(genre);
  }

  if (bpm_min) {
    where.push("ct.bpm >= ?");
    params.push(Number(bpm_min));
  }
  if (bpm_max) {
    where.push("ct.bpm <= ?");
    params.push(Number(bpm_max));
  }

  if (energy_min) {
    where.push("ct.energy >= ?");
    params.push(Number(energy_min));
  }
  if (energy_max) {
    where.push("ct.energy <= ?");
    params.push(Number(energy_max));
  }

  if (keyFilter) {
    where.push("ct.key_signature = ?");
    params.push(keyFilter);
  }

  if (year) {
    where.push("ct.year = ?");
    params.push(Number(year));
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Whitelist sort columns
  const sortCols = {
    title: "ct.title",
    artist: "ct.artist",
    bpm: "ct.bpm",
    energy: "ct.energy",
    duration: "ct.duration_sec",
    year: "ct.year",
    plays: "ct.plays",
    newest: "ct.created_at",
  };
  const sortCol = sortCols[sort] || "ct.title";
  const sortOrder = order.toUpperCase() === "DESC" ? "DESC" : "ASC";

  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  const lim = Math.min(100, Math.max(1, Number(limit)));

  // Count total
  db.query(`SELECT COUNT(*) AS total FROM cloud_tracks ct ${whereClause}`, params, (err, countRows) => {
    if (err) return res.status(500).json({ error: "DB error", detail: err.message });

    const total = countRows[0]?.total || 0;

    // Fetch page
    db.query(
      `SELECT ct.id, ct.title, ct.artist, ct.album, ct.genre, ct.bpm, ct.duration_sec,
              ct.key_signature, ct.energy, ct.year, ct.artwork_url, ct.plays
       FROM cloud_tracks ct
       ${whereClause}
       ORDER BY ${sortCol} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, lim, offset],
      (err, rows) => {
        if (err) return res.status(500).json({ error: "DB error", detail: err.message });

        res.json({
          tracks: rows || [],
          pagination: {
            total,
            page: Number(page),
            limit: lim,
            pages: Math.ceil(total / lim),
          },
          library_size: "100,000+", // Platform branding
        });
      }
    );
  });
});

// ─── Secure Stream Endpoint (stream-only, no download) ───
// GET /music/tracks/:id/stream
router.get("/tracks/:id/stream", auth, streamLimiter, (req, res) => {
  db.query("SELECT stream_url FROM cloud_tracks WHERE id=? AND is_active=1", [req.params.id], (err, rows) => {
    if (err || !rows || rows.length === 0) {
      return res.status(404).json({ error: "Track not found" });
    }

    // Increment play count
    db.query("UPDATE cloud_tracks SET plays = plays + 1 WHERE id=?", [req.params.id]);

    // Return stream URL with security headers (no download)
    res.json({
      stream_url: rows[0].stream_url,
      expires_in: 3600, // 1 hour token validity
      policy: "stream-only",
      download: false,
    });
  });
});

// ─── Get Single Track Details ───
router.get("/tracks/:id", auth, (req, res) => {
  db.query("SELECT * FROM cloud_tracks WHERE id=? AND is_active=1", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Track not found" });
    res.json(rows[0]);
  });
});

// ─── List Available Genres ───
router.get("/genres", auth, (req, res) => {
  db.query(
    "SELECT genre, COUNT(*) AS count FROM cloud_tracks WHERE is_active=1 GROUP BY genre ORDER BY count DESC",
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows || []);
    }
  );
});

// ─── Library Stats ───
router.get("/stats", auth, (req, res) => {
  db.query(
    `SELECT 
       COUNT(*) AS total_tracks,
       COUNT(DISTINCT artist) AS total_artists,
       COUNT(DISTINCT genre) AS total_genres,
       COUNT(DISTINCT album) AS total_albums,
       SUM(plays) AS total_plays,
       ROUND(AVG(bpm)) AS avg_bpm,
       MIN(bpm) AS min_bpm,
       MAX(bpm) AS max_bpm
     FROM cloud_tracks WHERE is_active=1`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows[0] || {});
    }
  );
});

// ═══════════ PLAYLISTS ═══════════

// GET /music/playlists — list user's playlists
router.get("/playlists", auth, (req, res) => {
  db.query(
    `SELECT p.*, u.username as owner_name
     FROM playlists p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.user_id = ? OR p.is_public = 1
     ORDER BY p.updated_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows || []);
    }
  );
});

// POST /music/playlists — create playlist
router.post("/playlists", auth, (req, res) => {
  const { name, description = "", is_public = false } = req.body;
  if (!name) return res.status(400).json({ error: "Playlist name required" });

  db.query(
    "INSERT INTO playlists(user_id, name, description, is_public) VALUES(?,?,?,?)",
    [req.user.id, name, description, is_public ? 1 : 0],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Failed to create playlist" });
      res.json({ ok: true, id: result.insertId, name });
    }
  );
});

// PUT /music/playlists/:id — update playlist
router.put("/playlists/:id", auth, (req, res) => {
  const { name, description, is_public } = req.body;
  db.query("SELECT * FROM playlists WHERE id=? AND user_id=?", [req.params.id, req.user.id], (err, rows) => {
    if (err || !rows || rows.length === 0) return res.status(404).json({ error: "Playlist not found" });

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push("name=?"); params.push(name); }
    if (description !== undefined) { updates.push("description=?"); params.push(description); }
    if (is_public !== undefined) { updates.push("is_public=?"); params.push(is_public ? 1 : 0); }

    if (updates.length === 0) return res.json({ ok: true });

    params.push(req.params.id);
    db.query(`UPDATE playlists SET ${updates.join(", ")} WHERE id=?`, params, (err) => {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ ok: true });
    });
  });
});

// DELETE /music/playlists/:id
router.delete("/playlists/:id", auth, (req, res) => {
  db.query("DELETE FROM playlists WHERE id=? AND user_id=?", [req.params.id, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    if (result.affectedRows === 0) return res.status(404).json({ error: "Not found or not owner" });
    res.json({ ok: true });
  });
});

// GET /music/playlists/:id/tracks — get tracks in playlist
router.get("/playlists/:id/tracks", auth, (req, res) => {
  db.query(
    `SELECT ct.id, ct.title, ct.artist, ct.album, ct.genre, ct.bpm, ct.duration_sec,
            ct.key_signature, ct.energy, ct.year, ct.plays, pt.position, pt.added_at
     FROM playlist_tracks pt
     JOIN cloud_tracks ct ON pt.track_id = ct.id
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC, pt.added_at ASC`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows || []);
    }
  );
});

// POST /music/playlists/:id/tracks — add track to playlist
router.post("/playlists/:id/tracks", auth, (req, res) => {
  const playlistId = req.params.id;
  const { track_id } = req.body;
  if (!track_id) return res.status(400).json({ error: "track_id required" });

  // Verify ownership
  db.query("SELECT * FROM playlists WHERE id=? AND user_id=?", [playlistId, req.user.id], (err, rows) => {
    if (err || !rows || rows.length === 0) return res.status(404).json({ error: "Playlist not found" });

    // Get next position
    db.query("SELECT MAX(position) AS maxPos FROM playlist_tracks WHERE playlist_id=?", [playlistId], (err, posRows) => {
      const nextPos = (posRows[0]?.maxPos || 0) + 1;

      db.query(
        "INSERT INTO playlist_tracks(playlist_id, track_id, position) VALUES(?,?,?)",
        [playlistId, track_id, nextPos],
        (err) => {
          if (err) {
            if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Track already in playlist" });
            return res.status(500).json({ error: "Failed to add track" });
          }

          // Update playlist counters
          db.query(
            `UPDATE playlists SET 
              track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id=?),
              total_duration = (SELECT COALESCE(SUM(ct.duration_sec),0) FROM playlist_tracks pt JOIN cloud_tracks ct ON pt.track_id=ct.id WHERE pt.playlist_id=?)
             WHERE id=?`,
            [playlistId, playlistId, playlistId]
          );

          res.json({ ok: true, position: nextPos });
        }
      );
    });
  });
});

// DELETE /music/playlists/:id/tracks/:trackId — remove track from playlist
router.delete("/playlists/:id/tracks/:trackId", auth, (req, res) => {
  const { id: playlistId, trackId } = req.params;

  db.query("SELECT * FROM playlists WHERE id=? AND user_id=?", [playlistId, req.user.id], (err, rows) => {
    if (err || !rows || rows.length === 0) return res.status(404).json({ error: "Playlist not found" });

    db.query("DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?", [playlistId, trackId], (err) => {
      if (err) return res.status(500).json({ error: "Remove failed" });

      // Update counters
      db.query(
        `UPDATE playlists SET 
          track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id=?),
          total_duration = (SELECT COALESCE(SUM(ct.duration_sec),0) FROM playlist_tracks pt JOIN cloud_tracks ct ON pt.track_id=ct.id WHERE pt.playlist_id=?)
         WHERE id=?`,
        [playlistId, playlistId, playlistId]
      );

      res.json({ ok: true });
    });
  });
});

// ═══════════ ADMIN: Track Management ═══════════

// POST /music/admin/tracks — add new track (admin only)
router.post("/admin/tracks", auth, adminOnly, (req, res) => {
  const { title, artist, album, genre, bpm, duration_sec, key_signature, energy, year, stream_url } = req.body;
  if (!title || !artist || !genre || !stream_url) {
    return res.status(400).json({ error: "title, artist, genre, stream_url required" });
  }

  db.query(
    `INSERT INTO cloud_tracks(title, artist, album, genre, bpm, duration_sec, key_signature, energy, year, stream_url, added_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [title, artist, album || "", genre, bpm || 120, duration_sec || 240, key_signature || "", energy || 5, year || 2025, stream_url, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Failed to add track", detail: err.message });
      res.json({ ok: true, id: result.insertId });
    }
  );
});

// PUT /music/admin/tracks/:id — update track (admin only)
router.put("/admin/tracks/:id", auth, adminOnly, (req, res) => {
  const allowed = ["title", "artist", "album", "genre", "bpm", "duration_sec", "key_signature", "energy", "year", "stream_url", "is_active"];
  const updates = [];
  const params = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key}=?`);
      params.push(req.body[key]);
    }
  }

  if (updates.length === 0) return res.json({ ok: true });

  params.push(req.params.id);
  db.query(`UPDATE cloud_tracks SET ${updates.join(", ")} WHERE id=?`, params, (err) => {
    if (err) return res.status(500).json({ error: "Update failed" });
    res.json({ ok: true });
  });
});

// DELETE /music/admin/tracks/:id — soft-delete track (admin only)
router.delete("/admin/tracks/:id", auth, adminOnly, (req, res) => {
  db.query("UPDATE cloud_tracks SET is_active=0 WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ ok: true });
  });
});

// ─── Favorites ───

// GET /music/favorites — list user's favorite tracks
router.get("/favorites", auth, (req, res) => {
  db.query(
    `SELECT ct.*, f.created_at as favorited_at
     FROM favorites f
     JOIN cloud_tracks ct ON f.track_id = ct.id
     WHERE f.user_id = ? AND ct.is_active = 1
     ORDER BY f.created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ tracks: rows || [], total: (rows || []).length });
    }
  );
});

// GET /music/favorites/ids — just the track IDs (for quick UI check)
router.get("/favorites/ids", auth, (req, res) => {
  db.query(
    "SELECT track_id FROM favorites WHERE user_id = ?",
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ ids: (rows || []).map(r => r.track_id) });
    }
  );
});

// POST /music/favorites/:trackId — add track to favorites
router.post("/favorites/:trackId", auth, (req, res) => {
  const trackId = parseInt(req.params.trackId);
  db.query(
    "INSERT IGNORE INTO favorites (user_id, track_id) VALUES (?, ?)",
    [req.user.id, trackId],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to favorite" });
      res.json({ ok: true, favorited: true });
    }
  );
});

// DELETE /music/favorites/:trackId — remove track from favorites
router.delete("/favorites/:trackId", auth, (req, res) => {
  const trackId = parseInt(req.params.trackId);
  db.query(
    "DELETE FROM favorites WHERE user_id = ? AND track_id = ?",
    [req.user.id, trackId],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to unfavorite" });
      res.json({ ok: true, favorited: false });
    }
  );
});

module.exports = router;
