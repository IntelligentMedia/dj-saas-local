const express = require("express");
const db = require("../db");
const { auth } = require("../middleware/auth");

const router = express.Router();

let AccessToken;
try {
  AccessToken = require("livekit-server-sdk").AccessToken;
} catch (e) {
  console.warn("livekit-server-sdk not available for infrastructure routes");
}

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";

// ─── LiveKit Cluster Nodes Pool ───

let LIVEKIT_NODES = [
  { id: 1, url: "ws://localhost:7880", key: "devkey", secret: "secret", lat: 33.8938, lng: 35.5018, region: "Beirut", load: 40, latency: 40, healthy: true },
  { id: 2, url: "ws://localhost:7882", key: "devkey", secret: "secret", lat: 48.8566, lng: 2.3522, region: "Paris", load: 65, latency: 90, healthy: true },
  { id: 3, url: "ws://localhost:7884", key: "devkey", secret: "secret", lat: 40.7128, lng: -74.006, region: "New York", load: 30, latency: 120, healthy: true },
];

// Edge relay nodes
const EDGE_NODES = [
  { url: "ws://edge-beirut", lat: 33.8938, lng: 35.5018, region: "Beirut" },
  { url: "ws://edge-paris", lat: 48.8566, lng: 2.3522, region: "Paris" },
];

// Cloud fallback nodes
const CLOUD_NODES = [
  { url: "wss://cloud-node-1", region: "EU" },
  { url: "wss://cloud-node-2", region: "US" },
];

// Pub mesh relay nodes
let PUB_NODES = [
  { id: 1, name: "Pub Beirut", capacity: 5, connected: 2 },
  { id: 2, name: "Pub Paris", capacity: 5, connected: 4 },
  { id: 3, name: "Pub Dubai", capacity: 5, connected: 1 },
];

// Simulate node health/latency changes
setInterval(() => {
  LIVEKIT_NODES.forEach(n => {
    n.healthy = Math.random() > 0.2;
    n.latency = Math.floor(Math.random() * 150) + 20;
    n.load = Math.floor(Math.random() * 100);
  });
}, 5000);

// ─── Helper Functions ───

function distance(a, b) {
  return Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2));
}

function generateToken(node, userId, role, room) {
  if (!AccessToken) return "mock-infra-token-" + Date.now();
  try {
    const at = new AccessToken(node.key || LIVEKIT_API_KEY, node.secret || LIVEKIT_API_SECRET, {
      identity: "user-" + userId,
    });
    at.addGrant({ roomJoin: true, room, canPublish: role === "dj", canSubscribe: true });
    const token = at.toJwt();
    return token instanceof Promise ? "async-token" : token;
  } catch {
    return "mock-infra-token-" + Date.now();
  }
}

// ─── Cluster Load Balancer (from livekit-cluster) ───

let roundRobinIdx = 0;

router.get("/cluster-token", auth, (req, res) => {
  const node = LIVEKIT_NODES[roundRobinIdx % LIVEKIT_NODES.length];
  roundRobinIdx++;
  const token = generateToken(node, req.user.id, req.user.role, "global-broadcast-room");
  res.json({ node: node.url, region: node.region, token, strategy: "round-robin" });
});

// ─── Geo Routing (from geo-routing) ───

router.get("/geo-token", auth, (req, res) => {
  const lat = parseFloat(req.query.lat || "0");
  const lng = parseFloat(req.query.lng || "0");

  let best = LIVEKIT_NODES[0];
  let bestDist = distance({ lat, lng }, best);

  LIVEKIT_NODES.forEach(n => {
    const d = distance({ lat, lng }, n);
    if (d < bestDist) { best = n; bestDist = d; }
  });

  const token = generateToken(best, req.user.id, req.user.role, "global-broadcast-room");
  res.json({ node: best.url, region: best.region, distance: Math.round(bestDist * 100) / 100, token, strategy: "geo-nearest" });
});

// ─── Latency Failover (from latency-failover) ───

router.get("/smart-token", auth, (req, res) => {
  const healthy = LIVEKIT_NODES.filter(n => n.healthy);
  if (healthy.length === 0) return res.json({ error: "ALL NODES DOWN", retry: true });

  let best = healthy[0];
  healthy.forEach(n => { if (n.latency < best.latency) best = n; });

  const token = generateToken(best, req.user.id, req.user.role, "global-broadcast-room");
  res.json({ node: best.url, region: best.region, latency: best.latency, token, strategy: "lowest-latency" });
});

// ─── Self-Healing (from self-healing) ───

router.get("/healing-token", auth, (req, res) => {
  const healthy = LIVEKIT_NODES.filter(n => n.healthy);
  if (healthy.length === 0) return res.json({ error: "ALL NODES DOWN — retrying recovery", healthy_count: 0 });

  const node = healthy[Math.floor(Math.random() * healthy.length)];
  const token = generateToken(node, req.user.id, req.user.role, "global-broadcast-room");

  res.json({
    node: node.url,
    region: node.region,
    healthy_nodes: healthy.length,
    total_nodes: LIVEKIT_NODES.length,
    token,
    strategy: "self-healing",
  });
});

// ─── Hybrid Edge (from hybrid-edge) ───

router.get("/edge-route", auth, (req, res) => {
  const lat = parseFloat(req.query.lat || "0");
  const lng = parseFloat(req.query.lng || "0");

  let bestEdge = EDGE_NODES[0];
  let bestDist = distance({ lat, lng }, bestEdge);

  EDGE_NODES.forEach(n => {
    const d = distance({ lat, lng }, n);
    if (d < bestDist) { bestEdge = n; bestDist = d; }
  });

  if (bestDist < 5) {
    res.json({ mode: "EDGE", relay: bestEdge.url, region: bestEdge.region, distance: bestDist });
  } else {
    const cloud = CLOUD_NODES[Math.floor(Math.random() * CLOUD_NODES.length)];
    res.json({ mode: "CLOUD", node: cloud.url, region: cloud.region });
  }
});

// ─── Audio Mesh (from audio-mesh) ───

router.get("/mesh-route", auth, (req, res) => {
  let relay = PUB_NODES[0];
  PUB_NODES.forEach(p => {
    if (p.connected / p.capacity < relay.connected / relay.capacity) relay = p;
  });
  relay.connected = Math.min(relay.connected + 1, relay.capacity);

  res.json({
    mode: "MESH",
    relay_pub: relay.name,
    relay_load: `${relay.connected}/${relay.capacity}`,
    message: "Audio distributed via pub-to-pub mesh",
  });
});

// ─── Global Fanout (from global-fanout) ───

router.get("/global-broadcast-token", auth, (req, res) => {
  const room = "global-broadcast-room";
  const node = LIVEKIT_NODES.find(n => n.healthy) || LIVEKIT_NODES[0];
  const token = generateToken(node, req.user.id, req.user.role, room);
  res.json({ room, node: node.url, region: node.region, token, strategy: "global-fanout" });
});

// ─── Multi-Pub Room (from livekit-multipub) ───

router.get("/room-token", auth, (req, res) => {
  const room = req.query.room || "dj-room";
  const node = LIVEKIT_NODES.find(n => n.healthy) || LIVEKIT_NODES[0];
  const token = generateToken(node, req.user.id, req.user.role, room);
  res.json({ room, node: node.url, token, strategy: "multi-pub" });
});

// ─── Auto Room Routing (from auto-room-routing) ───

router.get("/auto-room-token", auth, (req, res) => {
  db.query("SELECT * FROM bookings WHERE active=1 LIMIT 1", (err, bookings) => {
    if (!bookings || bookings.length === 0) return res.json({ error: "No active booking for auto-routing" });

    const booking = bookings[0];
    const roomName = `dj-${booking.dj_id}-pub-${booking.pub_id}`;
    const node = LIVEKIT_NODES.find(n => n.healthy) || LIVEKIT_NODES[0];
    const token = generateToken(node, req.user.id, req.user.role, roomName);
    res.json({ room: roomName, node: node.url, token, strategy: "auto-room-routing" });
  });
});

// ─── WebRTC Gatekeeper (from webrtc-gatekeeper) ───

router.get("/webrtc-token", auth, (req, res) => {
  const checks = [];

  // Rule 1: DJ must be approved
  if (req.user.role === "dj" && !req.user.approved) {
    return res.json({ granted: false, reason: "DJ NOT APPROVED", checks: ["approved:FAIL"] });
  }
  checks.push("approved:PASS");

  // Rule 2: Active session
  db.query("SELECT * FROM sessions WHERE active=1", (err, sessions) => {
    if (!sessions || sessions.length === 0) {
      return res.json({ granted: false, reason: "NO ACTIVE SESSION", checks: [...checks, "session:FAIL"] });
    }
    checks.push("session:PASS");

    // Rule 3: Valid activation code
    db.query("SELECT * FROM activation_codes", (err, codes) => {
      const now = new Date();
      const valid = (codes || []).some(c => now >= new Date(c.start_time) && now <= new Date(c.end_time));

      if (!valid) {
        return res.json({ granted: false, reason: "NO VALID ACTIVATION", checks: [...checks, "activation:FAIL"] });
      }
      checks.push("activation:PASS");

      const node = LIVEKIT_NODES.find(n => n.healthy) || LIVEKIT_NODES[0];
      const token = generateToken(node, req.user.id, req.user.role, "gated-broadcast-room");
      res.json({ granted: true, token, node: node.url, checks, strategy: "webrtc-gatekeeper" });
    });
  });
});

// ─── AI Autoscaler (from ai-autoscaler) ───

router.get("/ai-scale", auth, (req, res) => {
  const avgLoad = LIVEKIT_NODES.reduce((a, b) => a + b.load, 0) / LIVEKIT_NODES.length;

  let action = "STABLE";
  let message = `System stable. Avg load ${Math.round(avgLoad)}%`;

  if (avgLoad > 70) {
    const newPort = 7900 + LIVEKIT_NODES.length;
    LIVEKIT_NODES.push({
      id: LIVEKIT_NODES.length + 1, url: `ws://localhost:${newPort}`, key: "devkey", secret: "secret",
      lat: 0, lng: 0, region: "Auto-" + LIVEKIT_NODES.length, load: 10, latency: 50, healthy: true,
    });
    action = "SCALE_UP";
    message = `High load (${Math.round(avgLoad)}%). New node launched at ws://localhost:${newPort}`;
  } else if (avgLoad < 25 && LIVEKIT_NODES.length > 3) {
    const removed = LIVEKIT_NODES.pop();
    action = "SCALE_DOWN";
    message = `Low load (${Math.round(avgLoad)}%). Node removed: ${removed.url}`;
  }

  res.json({
    action,
    message,
    avg_load: Math.round(avgLoad),
    total_nodes: LIVEKIT_NODES.length,
    nodes: LIVEKIT_NODES.map(n => ({ url: n.url, region: n.region, load: n.load, healthy: n.healthy, latency: n.latency })),
  });
});

// ─── Infrastructure Overview ───

router.get("/status", auth, (req, res) => {
  const healthy = LIVEKIT_NODES.filter(n => n.healthy).length;
  const avgLoad = Math.round(LIVEKIT_NODES.reduce((a, b) => a + b.load, 0) / LIVEKIT_NODES.length);
  const avgLatency = Math.round(LIVEKIT_NODES.reduce((a, b) => a + b.latency, 0) / LIVEKIT_NODES.length);

  res.json({
    total_nodes: LIVEKIT_NODES.length,
    healthy_nodes: healthy,
    unhealthy_nodes: LIVEKIT_NODES.length - healthy,
    avg_load: avgLoad,
    avg_latency: avgLatency,
    edge_nodes: EDGE_NODES.length,
    cloud_nodes: CLOUD_NODES.length,
    pub_relays: PUB_NODES.length,
    nodes: LIVEKIT_NODES.map(n => ({
      url: n.url, region: n.region, load: n.load,
      latency: n.latency, healthy: n.healthy,
    })),
  });
});

module.exports = router;
