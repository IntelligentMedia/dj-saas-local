const express = require("express");
const db = require("../db");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ═══════════════════════════════════════════════
// SUBSCRIPTION PLANS
// ═══════════════════════════════════════════════

// GET /payments/plans — list all ENABLED subscription plans (public)
router.get("/plans", (req, res) => {
  db.query("SELECT * FROM subscription_plans WHERE enabled=1 ORDER BY price ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows || []);
  });
});

// POST /payments/subscribe — DJ subscribes to a plan
router.post("/subscribe", auth, (req, res) => {
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: "plan_id required" });

  db.query("SELECT * FROM subscription_plans WHERE id=?", [plan_id], (err, plans) => {
    if (err || !plans || plans.length === 0) return res.status(404).json({ error: "Plan not found" });

    const plan = plans[0];
    const expiresAt = new Date(Date.now() + 30 * 86400000); // 30 days

    // Deactivate existing subscription
    db.query("UPDATE dj_subscriptions SET status='cancelled' WHERE dj_id=? AND status IN ('active','trial')", [req.user.id], () => {
      // Create new subscription
      db.query(
        "INSERT INTO dj_subscriptions(dj_id,plan_id,status,started_at,expires_at) VALUES(?,?,'active',NOW(),?)",
        [req.user.id, plan_id, expiresAt],
        (err) => {
          if (err) return res.status(500).json({ error: "Subscribe failed" });

          // Record the subscription payment
          if (plan.price > 0) {
            db.query(
              "INSERT INTO payments(payer_id,type,amount,description,status) VALUES(?,'subscription',?,?,?)",
              [req.user.id, plan.price, `${plan.name} plan subscription (30 days)`, "completed"]
            );
          }

          res.json({ ok: true, message: `Subscribed to ${plan.name} plan`, expires: expiresAt });
        }
      );
    });
  });
});

// GET /payments/my-subscription — get current user's active subscription
router.get("/my-subscription", auth, (req, res) => {
  db.query(
    `SELECT ds.*, sp.name as plan_name, sp.price, sp.max_hours_per_month, 
            sp.max_bookings_per_month, sp.commission_rate, sp.features
     FROM dj_subscriptions ds 
     JOIN subscription_plans sp ON ds.plan_id = sp.id 
     WHERE ds.dj_id=? AND ds.status IN ('active','trial') 
     ORDER BY ds.created_at DESC LIMIT 1`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!rows || rows.length === 0) return res.json({ subscription: null, message: "No active subscription" });

      const sub = rows[0];
      const expired = new Date(sub.expires_at) < new Date();
      if (expired) {
        db.query("UPDATE dj_subscriptions SET status='expired' WHERE id=?", [sub.id]);
        return res.json({ subscription: null, message: "Subscription expired" });
      }

      // Count this month's usage (DJ's bookings)
      db.query(
        `SELECT COUNT(*) as booking_count, IFNULL(SUM(hours),0) as total_hours 
         FROM bookings WHERE dj_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [req.user.id],
        (err2, usage) => {
          const u = usage?.[0] || { booking_count: 0, total_hours: 0 };
          res.json({
            subscription: {
              id: sub.id,
              plan: sub.plan_name,
              price: sub.price,
              commission_rate: sub.commission_rate,
              features: sub.features,
              status: sub.status,
              started_at: sub.started_at,
              expires_at: sub.expires_at,
              limits: {
                max_hours: sub.max_hours_per_month,
                max_bookings: sub.max_bookings_per_month,
                used_hours: u.total_hours,
                used_bookings: u.booking_count,
              },
            },
          });
        }
      );
    }
  );
});

// ═══════════════════════════════════════════════
// DJ RATE MANAGEMENT
// ═══════════════════════════════════════════════

// GET /payments/dj-rate — get current DJ's hourly rate
router.get("/dj-rate", auth, (req, res) => {
  db.query("SELECT hourly_rate FROM users WHERE id=?", [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ hourly_rate: rows?.[0]?.hourly_rate || 50 });
  });
});

// PUT /payments/dj-rate — DJ sets their own hourly rate
router.put("/dj-rate", auth, (req, res) => {
  const { rate } = req.body;
  if (!rate || rate < 10 || rate > 500) return res.status(400).json({ error: "Rate must be $10–$500" });

  db.query("UPDATE users SET hourly_rate=? WHERE id=?", [rate, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: "Update failed" });
    res.json({ ok: true, hourly_rate: rate });
  });
});

// GET /payments/dj-rates — list all DJs with their rates (for pub booking)
router.get("/dj-rates", auth, (req, res) => {
  db.query(
    "SELECT id, username, hourly_rate FROM users WHERE role='dj' AND approved=1 ORDER BY hourly_rate ASC",
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows || []);
    }
  );
});

// ═══════════════════════════════════════════════
// PAYMENT TRANSACTIONS
// ═══════════════════════════════════════════════

// GET /payments/transactions — payment history
router.get("/transactions", auth, (req, res) => {
  const isAdmin = req.user.role === "admin";
  const query = isAdmin
    ? `SELECT p.*, u1.username as payer_name, u2.username as payee_name 
       FROM payments p 
       LEFT JOIN users u1 ON p.payer_id = u1.id 
       LEFT JOIN users u2 ON p.payee_id = u2.id 
       ORDER BY p.created_at DESC LIMIT 100`
    : `SELECT p.*, u1.username as payer_name, u2.username as payee_name 
       FROM payments p 
       LEFT JOIN users u1 ON p.payer_id = u1.id 
       LEFT JOIN users u2 ON p.payee_id = u2.id 
       WHERE p.payer_id=? OR p.payee_id=? 
       ORDER BY p.created_at DESC LIMIT 50`;

  const params = isAdmin ? [] : [req.user.id, req.user.id];

  db.query(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows || []);
  });
});

// POST /payments/process-booking/:bookingId — process payment for a completed booking (admin/accountant only)
router.post("/process-booking/:bookingId", auth, (req, res) => {
  const allowed = ["admin", "sysadmin", "accountant"];
  if (!allowed.includes(req.user.role)) return res.status(403).json({ error: "Not authorized" });
  const bookingId = req.params.bookingId;

  db.query(
    `SELECT b.*, u1.username as dj_name, u2.username as pub_name,
            IFNULL(sp.commission_rate, 20) as commission_rate
     FROM bookings b 
     LEFT JOIN users u1 ON b.dj_id = u1.id 
     LEFT JOIN users u2 ON b.pub_id = u2.id 
     LEFT JOIN dj_subscriptions ds ON b.dj_id = ds.dj_id AND ds.status IN ('active','trial')
     LEFT JOIN subscription_plans sp ON ds.plan_id = sp.id
     WHERE b.id=?`,
    [bookingId],
    (err, bookings) => {
      if (err || !bookings || bookings.length === 0) return res.status(404).json({ error: "Booking not found" });

      const b = bookings[0];
      const total = b.hours * (b.rate || 50);
      const commissionRate = b.commission_rate || 20;
      const platformFee = total * (commissionRate / 100);
      const djPayout = total - platformFee;

      // Check if already processed
      db.query("SELECT * FROM payments WHERE booking_id=? AND type='booking_payment'", [bookingId], (err, existing) => {
        if (existing && existing.length > 0) return res.status(400).json({ error: "Already processed" });

        // Create 3 payment records: pub pays → platform takes fee → DJ gets payout
        db.query(
          "INSERT INTO payments(booking_id,payer_id,type,amount,description,status) VALUES(?,?,'booking_payment',?,?,'completed')",
          [bookingId, b.pub_id, total, `Booking #${bookingId}: ${b.dj_name} x ${b.hours}hrs @ $${b.rate}/hr`],
          () => {
            db.query(
              "INSERT INTO payments(booking_id,type,amount,description,status) VALUES(?,'platform_fee',?,?,'completed')",
              [bookingId, platformFee, `Platform fee ${commissionRate}% on booking #${bookingId}`],
              () => {
                db.query(
                  "INSERT INTO payments(booking_id,payee_id,type,amount,description,status) VALUES(?,?,'dj_payout',?,?,'completed')",
                  [bookingId, b.dj_id, djPayout, `DJ payout for booking #${bookingId}`],
                  (err) => {
                    if (err) return res.status(500).json({ error: "Payment processing failed" });
                    res.json({
                      ok: true,
                      payment: {
                        booking_id: bookingId,
                        total,
                        commission_rate: commissionRate,
                        platform_fee: platformFee,
                        dj_payout: djPayout,
                      },
                    });
                  }
                );
              }
            );
          }
        );
      });
    }
  );
});

// GET /payments/summary — admin financial overview
router.get("/summary", auth, adminOnly, (req, res) => {
  const queries = {
    totalRevenue: "SELECT IFNULL(SUM(amount),0) as v FROM payments WHERE type='booking_payment' AND status='completed'",
    totalPlatformFees: "SELECT IFNULL(SUM(amount),0) as v FROM payments WHERE type='platform_fee' AND status='completed'",
    totalDjPayouts: "SELECT IFNULL(SUM(amount),0) as v FROM payments WHERE type='dj_payout' AND status='completed'",
    totalSubscriptions: "SELECT IFNULL(SUM(amount),0) as v FROM payments WHERE type='subscription' AND status='completed'",
    activeSubscribers: "SELECT COUNT(*) as v FROM dj_subscriptions WHERE status IN ('active','trial')",
    activeDjs: "SELECT COUNT(*) as v FROM users WHERE role='dj' AND approved=1",
    activePubs: "SELECT COUNT(*) as v FROM users WHERE role='pub'",
  };

  const results = {};
  const keys = Object.keys(queries);
  let done = 0;

  keys.forEach((key) => {
    db.query(queries[key], (err, rows) => {
      results[key] = rows?.[0]?.v || 0;
      done++;
      if (done === keys.length) {
        results.netPlatformIncome = Number(results.totalPlatformFees) + Number(results.totalSubscriptions);
        res.json(results);
      }
    });
  });
});

module.exports = router;
