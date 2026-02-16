
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const roomRoutes = require("./routes/rooms");
const livekitRoutes = require("./routes/livekit");
const activationRoutes = require("./routes/activation");
const bookingRoutes = require("./routes/bookings");
const billingRoutes = require("./routes/billing");
const aiRoutes = require("./routes/ai");
const infraRoutes = require("./routes/infrastructure");
const paymentRoutes = require("./routes/payments");
const musicRoutes = require("./routes/music-library");
const profileRoutes = require("./routes/profile");

const app = express();
const server = http.createServer(app);

// ── Socket.IO — multiplayer sync ──
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

// ── Request logger ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : "\x1b[32m";
    console.log(`${color}${req.method}\x1b[0m ${req.originalUrl} → ${status} (${ms}ms)`);
  });
  next();
});

// ── Rate limiters ──
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,                   // 500 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,                    // 20 auth attempts per 15 min
  message: { error: "Too many login attempts, please try again later." },
});

const streamLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 60,                    // 60 stream requests/min
  message: { error: "Stream rate limit exceeded." },
});

app.use(globalLimiter);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", version: "4.0.0" }));

// Routes
app.use("/auth", authLimiter, authRoutes);
app.use("/admin", adminRoutes);
app.use("/rooms", roomRoutes);
app.use("/livekit", livekitRoutes);
app.use("/activation", activationRoutes);
app.use("/bookings", bookingRoutes);
app.use("/billing", billingRoutes);
app.use("/ai", aiRoutes);
app.use("/infra", infraRoutes);
app.use("/payments", paymentRoutes);
app.use("/music", musicRoutes);
app.use("/profile", profileRoutes);

// ═══════════════════════════════════════════════════
//  Socket.IO — Real-time Multiplayer Sync
// ═══════════════════════════════════════════════════
const rooms = {}; // roomId → { dj, listeners: Map<socketId, {identity, ...}> }

io.on("connection", (socket) => {
  console.log(`[Socket.IO] Connected: ${socket.id}`);

  // ── Join Room ──
  socket.on("join-room", ({ roomId, identity, role }) => {
    socket.join(roomId);
    socket.data = { roomId, identity, role };

    if (!rooms[roomId]) rooms[roomId] = { dj: null, listeners: new Map() };

    if (role === "dj") {
      rooms[roomId].dj = { socketId: socket.id, identity };
    }
    rooms[roomId].listeners.set(socket.id, { identity, role });

    // Broadcast updated participant list
    io.to(roomId).emit("participants", {
      count: rooms[roomId].listeners.size,
      dj: rooms[roomId].dj?.identity || null,
    });

    console.log(`[Socket.IO] ${identity} (${role}) joined room ${roomId}  [${rooms[roomId].listeners.size} total]`);
  });

  // ── Crossfader Sync (DJ → listeners) ──
  socket.on("crossfader", ({ value }) => {
    const { roomId } = socket.data || {};
    if (roomId) socket.to(roomId).emit("crossfader", { value, from: socket.data.identity });
  });

  // ── Gesture / Hand Tracking Sync ──
  socket.on("gesture", ({ type, x, y }) => {
    const { roomId } = socket.data || {};
    if (roomId) socket.to(roomId).emit("gesture", { type, x, y, from: socket.data.identity });
  });

  // ── Avatar Position Sync (metaverse) ──
  socket.on("avatar-move", ({ position, rotation }) => {
    const { roomId } = socket.data || {};
    if (roomId) {
      socket.to(roomId).emit("avatar-move", {
        id: socket.id,
        identity: socket.data.identity,
        position,
        rotation,
      });
    }
  });

  // ── Audio Energy Sync (for remote visualizer) ──
  socket.on("energy", ({ value }) => {
    const { roomId } = socket.data || {};
    if (roomId) socket.to(roomId).emit("energy", { value, from: socket.data.identity });
  });

  // ── Chat Messages ──
  socket.on("chat", ({ message }) => {
    const { roomId, identity, role } = socket.data || {};
    if (roomId && message && message.trim()) {
      const msg = {
        id: Date.now() + "-" + socket.id.slice(-4),
        from: identity,
        role: role || "listener",
        message: message.trim().slice(0, 500),
        timestamp: Date.now(),
      };
      io.to(roomId).emit("chat", msg);
    }
  });

  // ── Reactions ──
  socket.on("reaction", ({ emoji }) => {
    const { roomId } = socket.data || {};
    if (roomId) io.to(roomId).emit("reaction", { emoji, from: socket.data.identity });
  });

  // ── Now Playing (DJ broadcasts current track info) ──
  socket.on("now-playing", (data) => {
    const { roomId } = socket.data || {};
    if (roomId) socket.to(roomId).emit("now-playing", { ...data, dj: socket.data.identity });
  });

  // ── Song Requests (listener → DJ) ──
  socket.on("song-request", ({ title, artist, message }) => {
    const { roomId, identity } = socket.data || {};
    if (roomId && title) {
      const request = {
        id: Date.now() + "-" + socket.id.slice(-4),
        title: (title || "").slice(0, 100),
        artist: (artist || "").slice(0, 100),
        message: (message || "").slice(0, 200),
        from: identity,
        timestamp: Date.now(),
      };
      // Send to DJ(s) in the room
      io.to(roomId).emit("song-request", request);
    }
  });

  // ── Song Request Response (DJ → listener) ──
  socket.on("request-response", ({ requestId, status }) => {
    const { roomId } = socket.data || {};
    if (roomId) {
      io.to(roomId).emit("request-response", { requestId, status, dj: socket.data.identity });
    }
  });

  // ── Disconnect ──
  socket.on("disconnect", () => {
    const { roomId, identity } = socket.data || {};
    if (roomId && rooms[roomId]) {
      rooms[roomId].listeners.delete(socket.id);
      if (rooms[roomId].dj?.socketId === socket.id) rooms[roomId].dj = null;

      io.to(roomId).emit("participants", {
        count: rooms[roomId].listeners.size,
        dj: rooms[roomId].dj?.identity || null,
      });

      // Cleanup empty rooms
      if (rooms[roomId].listeners.size === 0) delete rooms[roomId];
    }
    console.log(`[Socket.IO] Disconnected: ${socket.id} (${identity || "unknown"})`);
  });
});

server.listen(4000, () => console.log("DJ SaaS Unified API v4.0.0 running on port 4000 (HTTP + Socket.IO)"));
