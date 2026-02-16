const express = require("express");
const db = require("../db");
const { auth, can } = require("../middleware/auth");

const router = express.Router();

const DEFAULT_PLATFORM_FEE = 20;

// ─── Enterprise Billing (from enterprise-billing) ───

// GET /billing/run — calculate billing for all completed/active bookings
// Uses the DJ's subscription commission rate if available
router.get("/run", auth, can("billing"), (req, res) => {
  db.query(
    `SELECT b.*, u1.username as dj_name, u2.username as pub_name,
            IFNULL(sp.commission_rate, ${DEFAULT_PLATFORM_FEE}) as commission_rate,
            IFNULL(sp.name, 'No Plan') as plan_name
     FROM bookings b 
     LEFT JOIN users u1 ON b.dj_id = u1.id 
     LEFT JOIN users u2 ON b.pub_id = u2.id 
     LEFT JOIN dj_subscriptions ds ON b.dj_id = ds.dj_id AND ds.status IN ('active','trial')
     LEFT JOIN subscription_plans sp ON ds.plan_id = sp.id
     WHERE b.status IN ('active','completed')`,
    (err, bookings) => {
      if (err) return res.status(500).json({ error: "DB error" });

      const billing = (bookings || []).map(b => {
        const rate = Number(b.rate) || 50;
        const total = b.hours * rate;
        const commissionRate = Number(b.commission_rate) || DEFAULT_PLATFORM_FEE;
        const platformFee = Math.round(total * (commissionRate / 100) * 100) / 100;
        const djEarnings = Math.round((total - platformFee) * 100) / 100;
        return {
          booking_id: b.id,
          dj: b.dj_name,
          pub: b.pub_name,
          hours: b.hours,
          rate,
          total,
          commissionRate,
          plan: b.plan_name,
          platformFee,
          djEarnings,
          status: b.status
        };
      });

      const totals = {
        totalRevenue: billing.reduce((s, b) => s + b.total, 0),
        totalPlatformFees: Math.round(billing.reduce((s, b) => s + b.platformFee, 0) * 100) / 100,
        totalDjPayouts: Math.round(billing.reduce((s, b) => s + b.djEarnings, 0) * 100) / 100,
      };

      res.json({ billing, totals, defaultFeePercent: DEFAULT_PLATFORM_FEE });
    }
  );
});

// ─── Realtime Earnings (from realtime-earnings) ───

// GET /billing/realtime-earnings — calculate live session earnings based on elapsed time
router.get("/realtime-earnings", auth, can("billing"), (req, res) => {
  db.query(
    `SELECT s.*, b.rate, b.hours as booked_hours, u.username as dj_name,
            IFNULL(sp.commission_rate, ${DEFAULT_PLATFORM_FEE}) as commission_rate
     FROM sessions s 
     LEFT JOIN bookings b ON s.booking_id = b.id 
     LEFT JOIN users u ON s.dj_id = u.id
     LEFT JOIN dj_subscriptions ds ON b.dj_id = ds.dj_id AND ds.status IN ('active','trial')
     LEFT JOIN subscription_plans sp ON ds.plan_id = sp.id
     WHERE s.active=1`,
    (err, sessions) => {
      if (err) return res.status(500).json({ error: "DB error" });

      const earnings = (sessions || []).map(s => {
        const started = new Date(s.started_at);
        const now = new Date();
        const elapsedHours = (now - started) / 3600000;
        const rate = Number(s.rate) || 50;
        const earned = elapsedHours * rate;
        const commissionRate = Number(s.commission_rate) || DEFAULT_PLATFORM_FEE;
        const platformFee = earned * (commissionRate / 100);

        return {
          session_id: s.id,
          dj: s.dj_name,
          dj_id: s.dj_id,
          started_at: s.started_at,
          elapsed_minutes: Math.round(elapsedHours * 60),
          rate_per_hour: rate,
          earned_so_far: Math.round(earned * 100) / 100,
          platform_fee: Math.round(platformFee * 100) / 100,
          dj_net: Math.round((earned - platformFee) * 100) / 100,
        };
      });

      res.json({
        active_sessions: earnings.length,
        earnings,
        total_platform_revenue: Math.round(earnings.reduce((s, e) => s + e.platform_fee, 0) * 100) / 100,
      });
    }
  );
});

module.exports = router;
