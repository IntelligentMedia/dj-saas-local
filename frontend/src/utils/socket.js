import { io } from "socket.io-client";
import useDJStore from "../store/djStore";

const SOCKET_URL = "http://localhost:4000";

let socket = null;

/**
 * Get or create the singleton Socket.IO connection.
 */
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });

    // ── Incoming events → update Zustand store ──
    socket.on("crossfader", ({ value }) => {
      useDJStore.getState().setCrossfader(value);
    });

    socket.on("energy", ({ value }) => {
      useDJStore.getState().setAudioEnergy(value);
    });

    socket.on("participants", ({ count, dj }) => {
      useDJStore.getState().setRoomState({ listeners: count });
      if (dj) useDJStore.getState().setRoomState({ djName: dj });
    });

    socket.on("chat", (msg) => {
      useDJStore.getState().addChatMessage(msg);
    });

    socket.on("now-playing", (data) => {
      useDJStore.getState().setNowPlaying(data);
    });

    socket.on("connect", () => {
      useDJStore.getState().setConnected(true);
      console.log("[Socket.IO] Connected:", socket.id);
    });

    socket.on("disconnect", () => {
      useDJStore.getState().setConnected(false);
      console.log("[Socket.IO] Disconnected");
    });
  }
  return socket;
}

/**
 * Connect to a room as a DJ or listener.
 */
export function joinRoom(roomId, identity, role = "listener") {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit("join-room", { roomId, identity, role });
  useDJStore.getState().setRoomState({ roomId, isLive: true });
}

/**
 * Send crossfader position to other participants.
 */
export function emitCrossfader(value) {
  socket?.emit("crossfader", { value });
}

/**
 * Send gesture data.
 */
export function emitGesture(type, x, y) {
  socket?.emit("gesture", { type, x, y });
}

/**
 * Send avatar position (metaverse mode).
 */
export function emitAvatarMove(position, rotation) {
  socket?.emit("avatar-move", { position, rotation });
}

/**
 * Send audio energy level.
 */
export function emitEnergy(value) {
  socket?.emit("energy", { value });
}

/**
 * Send emoji reaction.
 */
export function emitReaction(emoji) {
  socket?.emit("reaction", { emoji });
}

/**
 * Send chat message.
 */
export function emitChat(message) {
  socket?.emit("chat", { message });
}

/**
 * Broadcast now-playing track info to listeners.
 */
export function emitNowPlaying(trackMeta) {
  socket?.emit("now-playing", trackMeta);
}

/**
 * Send a song request (listener → DJ).
 */
export function emitSongRequest(title, artist, message) {
  socket?.emit("song-request", { title, artist, message });
}

/**
 * Respond to a song request (DJ → room).
 */
export function emitRequestResponse(requestId, status) {
  socket?.emit("request-response", { requestId, status });
}

/**
 * Disconnect and cleanup.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  useDJStore.getState().setConnected(false);
  useDJStore.getState().setRoomState({ roomId: null, isLive: false, listeners: 0 });
}
