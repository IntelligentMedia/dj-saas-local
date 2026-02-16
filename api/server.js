
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { SECRET } = require("./middleware/auth");

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
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },  // allow audio proxy
  contentSecurityPolicy: false,                             // frontend handles CSP
}));
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

// ── Socket.IO authentication middleware ──
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    const payload = jwt.verify(token, SECRET);
    socket.data.user = payload;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

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

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ──
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err.stack || err);
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === "production" ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
});

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

  // ═══════════════════════════════════════════════════
  //  WebRTC Signaling — DJ audio broadcast to listeners
  // ═══════════════════════════════════════════════════

  // DJ goes live  → store DJ socket, notify listeners
  socket.on("dj-go-live", ({ roomId }) => {
    if (!rooms[roomId]) rooms[roomId] = { dj: null, listeners: new Map() };
    rooms[roomId].dj = { socketId: socket.id, identity: socket.data?.identity };
    socket.to(roomId).emit("dj-live", { dj: socket.data?.identity });
    console.log(`[WebRTC] DJ ${socket.data?.identity} went live in ${roomId}`);
  });

  // DJ stops broadcast
  socket.on("dj-stop-live", ({ roomId }) => {
    if (rooms[roomId]?.dj?.socketId === socket.id) {
      rooms[roomId].dj = null;
    }
    socket.to(roomId).emit("dj-offline");
    console.log(`[WebRTC] DJ ${socket.data?.identity} stopped in ${roomId}`);
  });

  // Listener requests a connection to DJ
  socket.on("listener-request", ({ roomId }) => {
    const room = rooms[roomId];
    if (room?.dj) {
      // Tell the DJ that this listener wants audio
      io.to(room.dj.socketId).emit("listener-joined", {
        listenerId: socket.id,
        identity: socket.data?.identity,
      });
      console.log(`[WebRTC] Listener ${socket.data?.identity} requesting stream from DJ in ${roomId}`);
    } else {
      socket.emit("no-dj", { message: "No DJ is live in this room" });
    }
  });

  // WebRTC offer from DJ → specific listener
  socket.on("webrtc-offer", ({ listenerId, offer }) => {
    io.to(listenerId).emit("webrtc-offer", {
      djId: socket.id,
      offer,
    });
  });

  // WebRTC answer from listener → DJ
  socket.on("webrtc-answer", ({ djId, answer }) => {
    io.to(djId).emit("webrtc-answer", {
      listenerId: socket.id,
      answer,
    });
  });

  // ICE candidates (bidirectional relay)
  socket.on("webrtc-ice", ({ targetId, candidate }) => {
    io.to(targetId).emit("webrtc-ice", {
      fromId: socket.id,
      candidate,
    });
  });

  // ── Disconnect ──
  socket.on("disconnect", () => {
    const { roomId, identity } = socket.data || {};
    if (roomId && rooms[roomId]) {
      rooms[roomId].listeners.delete(socket.id);
      if (rooms[roomId].dj?.socketId === socket.id) {
        rooms[roomId].dj = null;
        // Notify listeners that DJ disconnected
        io.to(roomId).emit("dj-offline");
      }

      io.to(roomId).emit("participants", {
        count: rooms[roomId].listeners.size,
        dj: rooms[roomId].dj?.identity || null,
      });

      // Notify DJ that this listener left (so DJ can close peer connection)
      if (rooms[roomId]?.dj) {
        io.to(rooms[roomId].dj.socketId).emit("listener-left", { listenerId: socket.id });
      }

      // Cleanup empty rooms
      if (rooms[roomId].listeners.size === 0) delete rooms[roomId];
    }
    console.log(`[Socket.IO] Disconnected: ${socket.id} (${identity || "unknown"})`);
  });
});

// ── Graceful shutdown ──
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully…`);
  io.close();
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => { console.error("Forced shutdown after timeout"); process.exit(1); }, 10000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ── Catch uncaught errors (prevent silent crashes) ──
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`DJ SaaS Unified API v4.0.0 running on port ${PORT} (HTTP + Socket.IO)`));
