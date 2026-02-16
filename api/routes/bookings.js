const express = require("express");
const db = require("../db");
const { auth, djOnly, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ─── Bookings (from booking-scheduler) ───

// GET /bookings — list all bookings
router.get("/", auth, (req, res) => {
  db.query(
    `SELECT b.*, u1.username as dj_name, u2.username as pub_name 
     FROM bookings b 
     LEFT JOIN users u1 ON b.dj_id = u1.id 
     LEFT JOIN users u2 ON b.pub_id = u2.id 
     ORDER BY b.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows || []);
    }
  );
});

// POST /bookings — create a booking (pub books a DJ)
router.post("/", auth, (req, res) => {
  const { dj_id, hours, scheduled_start } = req.body;
  const pub_id = req.user.id;

  if (!dj_id || !hours) return res.status(400).json({ error: "dj_id and hours required" });

  // Get DJ's hourly rate
  db.query("SELECT hourly_rate FROM users WHERE id=? AND role='dj'", [dj_id], (err, djRows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    const rate = djRows?.[0]?.hourly_rate || 50;

    const start = scheduled_start ? new Date(scheduled_start) : new Date();
    const end = new Date(start.getTime() + hours * 3600000);

    db.query(
      "INSERT INTO bookings(dj_id,pub_id,hours,rate,status,scheduled_start,scheduled_end) VALUES(?,?,?,?,'pending',?,?)",
      [dj_id, pub_id, hours, rate, start, end],
      (err) => {
        if (err) return res.status(500).json({ error: "Booking failed" });
        res.json({ ok: true, message: "Booking created", rate });
      }
    );
  });
});

// POST /bookings/:id/confirm — confirm a booking (admin/dj)
router.post("/:id/confirm", auth, (req, res) => {
  db.query("UPDATE bookings SET status='confirmed' WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Confirm failed" });
    res.json({ ok: true });
  });
});

// POST /bookings/:id/cancel — cancel a booking
router.post("/:id/cancel", auth, (req, res) => {
  db.query("UPDATE bookings SET status='cancelled', active=0 WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Cancel failed" });
    res.json({ ok: true });
  });
});

// ─── Sessions (from auto-session-timer) ───

// GET /bookings/sessions — list all sessions
router.get("/sessions", auth, (req, res) => {
  db.query(
    `SELECT s.*, u.username as dj_name 
     FROM sessions s 
     LEFT JOIN users u ON s.dj_id = u.id 
     ORDER BY s.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows || []);
    }
  );
});

// POST /bookings/sessions/start — DJ manually starts a LIVE session
router.post("/sessions/start", auth, (req, res) => {
  const djId = req.user.id;
  const now = new Date();

  // Check if already in active session
  db.query("SELECT * FROM sessions WHERE dj_id=? AND active=1", [djId], (err, existing) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (existing && existing.length > 0) {
      return res.json({ ok: true, session: existing[0], message: "Already in active session" });
    }

    // Check for a confirmed/active booking to link
    db.query(
      "SELECT * FROM bookings WHERE dj_id=? AND (status='active' OR status='confirmed') ORDER BY scheduled_start ASC LIMIT 1",
      [djId],
      (err, bookings) => {
        if (err) return res.status(500).json({ error: "DB error" });

        const bookingId = bookings && bookings.length > 0 ? bookings[0].id : null;

        // If there's a booking, activate it
        if (bookingId) {
          db.query("UPDATE bookings SET status='active', active=1 WHERE id=?", [bookingId]);
        }

        db.query(
          "INSERT INTO sessions(booking_id, dj_id, active, started_at) VALUES(?,?,1,?)",
          [bookingId, djId, now],
          (err, result) => {
            if (err) return res.status(500).json({ error: "Failed to start session" });

            const session = {
              id: result.insertId,
              booking_id: bookingId,
              dj_id: djId,
              active: 1,
              started_at: now,
            };

            // Fetch linked booking details if any
            if (bookingId) {
              db.query(
                `SELECT b.*, u.username as pub_name 
                 FROM bookings b LEFT JOIN users u ON b.pub_id=u.id WHERE b.id=?`,
                [bookingId],
                (err, bRows) => {
                  session.booking = bRows && bRows[0] ? bRows[0] : null;
                  res.json({ ok: true, session });
                }
              );
            } else {
              res.json({ ok: true, session });
            }
          }
        );
      }
    );
  });
});

// POST /bookings/sessions/stop — DJ ends their LIVE session
router.post("/sessions/stop", auth, (req, res) => {
  const djId = req.user.id;
  const now = new Date();

  db.query("SELECT * FROM sessions WHERE dj_id=? AND active=1", [djId], (err, sessions) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!sessions || sessions.length === 0) {
      return res.json({ ok: true, message: "No active session" });
    }

    const session = sessions[0];
    const startedAt = new Date(session.started_at);
    const durationMin = Math.round((now - startedAt) / 60000);

    db.query("UPDATE sessions SET active=0, ended_at=? WHERE id=?", [now, session.id], (err) => {
      if (err) return res.status(500).json({ error: "Failed to stop session" });

      // Also deactivate linked booking if any
      if (session.booking_id) {
        db.query("UPDATE bookings SET status='completed', active=0 WHERE id=?", [session.booking_id]);
      }

      res.json({ ok: true, duration_minutes: durationMin, session_id: session.id });
    });
  });
});

// GET /bookings/sessions/my-active — get current DJ's active session + booking info
router.get("/sessions/my-active", auth, (req, res) => {
  const djId = req.user.id;
  db.query(
    `SELECT s.*, u.username as dj_name,
            b.scheduled_start, b.scheduled_end, b.hours, b.rate,
            b.status as booking_status, pub.username as pub_name
     FROM sessions s
     LEFT JOIN users u ON s.dj_id = u.id
     LEFT JOIN bookings b ON s.booking_id = b.id
     LEFT JOIN users pub ON b.pub_id = pub.id
     WHERE s.dj_id=? AND s.active=1
     LIMIT 1`,
    [djId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows && rows[0] ? rows[0] : null);
    }
  );
});

// GET /bookings/sessions/history — session history for the current DJ (or all for admin)
router.get("/sessions/history", auth, (req, res) => {
  const isAdmin = req.user.role === "admin";
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  const where = isAdmin ? "" : "WHERE s.dj_id = ?";
  const params = isAdmin ? [limit, offset] : [req.user.id, limit, offset];

  db.query(
    `SELECT s.id, s.dj_id, s.active, s.started_at, s.ended_at,
            u.username as dj_name,
            b.hours as booked_hours, b.rate,
            pub.username as pub_name,
            TIMESTAMPDIFF(MINUTE, s.started_at, COALESCE(s.ended_at, NOW())) as duration_minutes,
            ROUND(TIMESTAMPDIFF(MINUTE, s.started_at, COALESCE(s.ended_at, NOW())) / 60.0 * COALESCE(b.rate, 50), 2) as earned
     FROM sessions s
     LEFT JOIN users u ON s.dj_id = u.id
     LEFT JOIN bookings b ON s.booking_id = b.id
     LEFT JOIN users pub ON b.pub_id = pub.id
     ${where}
     ORDER BY s.started_at DESC
     LIMIT ? OFFSET ?`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });

      // Also return summary stats
      const sessions = rows || [];
      const completed = sessions.filter(s => !s.active);
      const totalMinutes = completed.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
      const totalEarned = completed.reduce((sum, s) => sum + (parseFloat(s.earned) || 0), 0);

      res.json({
        sessions,
        stats: {
          total: sessions.length,
          completed: completed.length,
          active: sessions.filter(s => s.active).length,
          total_minutes: totalMinutes,
          total_hours: Math.round(totalMinutes / 60 * 10) / 10,
          total_earned: Math.round(totalEarned * 100) / 100,
          avg_duration_min: completed.length > 0 ? Math.round(totalMinutes / completed.length) : 0,
        }
      });
    }
  );
});

// Auto-session timer — checks bookings and auto-activates/deactivates sessions
// Runs every 30 seconds on the server
let sessionTimerRunning = false;

function startSessionTimer() {
  if (sessionTimerRunning) return;
  sessionTimerRunning = true;

  setInterval(() => {
    const now = new Date();

    // Auto-activate: find confirmed bookings within their scheduled time
    db.query(
      "SELECT * FROM bookings WHERE status='confirmed' AND scheduled_start <= ? AND scheduled_end >= ?",
      [now, now],
      (err, bookings) => {
        if (err || !bookings) return;

        bookings.forEach(b => {
          // Activate booking
          db.query("UPDATE bookings SET status='active', active=1 WHERE id=?", [b.id]);

          // Create or activate session
          db.query("SELECT * FROM sessions WHERE booking_id=?", [b.id], (err, sessions) => {
            if (!sessions || sessions.length === 0) {
              db.query("INSERT INTO sessions(booking_id,dj_id,active,started_at) VALUES(?,?,1,?)",
                [b.id, b.dj_id, now]);
            } else {
              db.query("UPDATE sessions SET active=1 WHERE booking_id=?", [b.id]);
            }
          });
        });
      }
    );

    // Auto-deactivate: find active bookings past their end time
    db.query(
      "SELECT * FROM bookings WHERE status='active' AND scheduled_end < ?",
      [now],
      (err, bookings) => {
        if (err || !bookings) return;

        bookings.forEach(b => {
          db.query("UPDATE bookings SET status='completed', active=0 WHERE id=?", [b.id]);
          db.query("UPDATE sessions SET active=0, ended_at=? WHERE booking_id=?", [now, b.id]);
        });
      }
    );
  }, 30000); // every 30 seconds
}

// Start the timer when module loads
startSessionTimer();

module.exports = router;
