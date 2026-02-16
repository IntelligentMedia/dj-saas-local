const express = require("express");
const { auth, djOnly } = require("../middleware/auth");

const router = express.Router();

// LiveKit config — change for production
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://localhost:7880";

let AccessToken;
try {
  AccessToken = require("livekit-server-sdk").AccessToken;
} catch (e) {
  console.warn("livekit-server-sdk not installed — LiveKit routes will return mock tokens");
}

// GET /livekit/token — generate token for authenticated users
router.get("/token", auth, (req, res) => {
  const room = req.query.room || "dj-room";
  const canPublish = req.user.role === "dj" || req.user.role === "admin";

  // If LiveKit SDK is available, generate real token
  if (AccessToken) {
    try {
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: `${req.user.role}-${req.user.id}`,
        name: req.user.username || `user-${req.user.id}`,
      });

      at.addGrant({
        roomJoin: true,
        room: room,
        canPublish: canPublish,
        canSubscribe: true,
      });

      const token = at.toJwt();

      // Handle both sync and async toJwt
      if (token instanceof Promise) {
        token.then(t => res.json({ token: t, url: LIVEKIT_URL, room, canPublish }))
             .catch(e => res.status(500).json({ error: "Token generation failed" }));
      } else {
        res.json({ token, url: LIVEKIT_URL, room, canPublish });
      }
    } catch (e) {
      console.error("LiveKit token error:", e.message);
      res.status(500).json({ error: "Token generation failed" });
    }
  } else {
    // Mock token for development without LiveKit
    res.json({
      token: "mock-token-" + Date.now(),
      url: LIVEKIT_URL,
      room,
      canPublish,
      mock: true,
      message: "Install livekit-server-sdk for real tokens. Run: docker run --rm -p 7880:7880 -p 7881:7881 -e LIVEKIT_KEYS=\"devkey:secret\" livekit/livekit-server",
    });
  }
});

// GET /livekit/info — connection info (no auth needed for status)
router.get("/info", (req, res) => {
  res.json({
    url: LIVEKIT_URL,
    sdkInstalled: !!AccessToken,
    instructions: [
      "1. Install LiveKit server: docker run --rm -p 7880:7880 -p 7881:7881 -e LIVEKIT_KEYS=\"devkey:secret\" livekit/livekit-server",
      "2. Login as a DJ user to get a publish token",
      "3. Login as a pub user to get a subscribe-only token",
    ],
  });
});

module.exports = router;
