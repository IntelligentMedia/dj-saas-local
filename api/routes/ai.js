const express = require("express");
const db = require("../db");
const { auth } = require("../middleware/auth");

const router = express.Router();

// ─── AI Lineup Scheduler (from ai-lineup-scheduler) ───

router.get("/lineup", auth, (req, res) => {
  const genres = ["House", "Techno", "Trance", "DnB", "Dubstep", "Ambient", "Hip-Hop", "Lo-Fi"];
  const schedule = [];

  for (let i = 0; i < 6; i++) {
    schedule.push({
      time: `${(20 + i) % 24}:00`,
      dj: `DJ ${String.fromCharCode(65 + i)}`,
      genre: genres[Math.floor(Math.random() * genres.length)],
      confidence: Math.round(70 + Math.random() * 30),
    });
  }

  res.json({ schedule, generated_at: new Date().toISOString() });
});

// ─── AI Room Director (from ai-room-director) ───

const GENRE_ROOMS = {
  house: "House Lounge",
  techno: "Techno Bunker",
  trance: "Trance Temple",
  dnb: "DnB Arena",
  dubstep: "Bass Cave",
  ambient: "Chill Zone",
};

router.get("/room-director", auth, (req, res) => {
  const genre = (req.query.genre || "house").toLowerCase();
  const room = GENRE_ROOMS[genre] || "Main Stage";

  res.json({
    genre,
    recommended_room: room,
    message: `AI recommends "${room}" for ${genre} genre`,
    available_genres: Object.keys(GENRE_ROOMS),
  });
});

// ─── AI Crowd Energy (from ai-crowd-energy) ───

router.get("/crowd-energy", (req, res) => {
  const score = Math.floor(Math.random() * 61) + 40; // 40-100
  const djs = ["DJ Sam", "DJ Luna", "DJ Nova", "DJ Echo"];
  const genres = ["House", "Techno", "Trance", "DnB"];

  res.json({
    crowd_energy: score,
    top_dj: djs[Math.floor(Math.random() * djs.length)],
    recommended_genre: genres[Math.floor(Math.random() * genres.length)],
    ai_analysis: score > 80 ? "Peak energy — drop the bass!" :
                 score > 60 ? "Good vibes — keep building" :
                 "Warming up — gradual build recommended",
    timestamp: new Date().toISOString(),
  });
});

// ─── Predictive Load Forecaster (from predictive-forecaster) ───

const HISTORICAL_TRAFFIC = [
  { hour: 18, load: 20 }, { hour: 19, load: 35 }, { hour: 20, load: 55 },
  { hour: 21, load: 75 }, { hour: 22, load: 90 }, { hour: 23, load: 95 },
  { hour: 0, load: 80 }, { hour: 1, load: 50 }, { hour: 2, load: 25 },
];

router.get("/predict-load", auth, (req, res) => {
  const currentHour = new Date().getHours();
  const match = HISTORICAL_TRAFFIC.find(h => h.hour === currentHour);
  const predictedLoad = match ? match.load + Math.floor(Math.random() * 20 - 10) : 50;
  const clamped = Math.max(0, Math.min(100, predictedLoad));

  const actions = [];
  if (clamped > 80) actions.push("Scale UP: Add 2 LiveKit nodes");
  if (clamped > 60) actions.push("Pre-warm edge caches");
  if (clamped < 30) actions.push("Scale DOWN: Remove idle nodes");

  res.json({
    current_hour: currentHour,
    predicted_load: clamped,
    actions,
    historical: HISTORICAL_TRAFFIC,
    recommendation: clamped > 80 ? "HIGH LOAD — auto-scale triggered" :
                    clamped > 50 ? "MODERATE — standby scaling" : "LOW — optimize costs",
  });
});

// ─── AI Failover Engine (from ai-failover-engine) ───

let djOnline = true;
const currentDJ = "DJ Sam";
const backupDJ = "AI Backup DJ";

// Simulate random DJ disconnects
setInterval(() => {
  djOnline = Math.random() > 0.3;
}, 5000);

router.get("/failover/status", (req, res) => {
  res.json({
    dj_online: djOnline,
    active_dj: djOnline ? currentDJ : backupDJ,
    mode: djOnline ? "LIVE" : "AI_FAILOVER",
    message: djOnline
      ? `🎧 ${currentDJ} is live — stream OK`
      : `⚠️ DJ disconnected — 🤖 ${backupDJ} taking over`,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
