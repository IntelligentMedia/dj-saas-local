import React, { useState, useRef, useEffect, useCallback } from "react";
import { getUser } from "../utils/api";
import useDJStore from "../store/djStore";
import { getStreamDestination, getMasterAnalyser, resumeAudio } from "../engine";
import { joinRoom, emitEnergy, getSocket } from "../utils/socket";

/**
 * Broadcast — DJ goes live via WebRTC (peer-to-peer audio).
 *
 * Flow:
 *   1. DJ opens page, joins Socket.IO room as "dj"
 *   2. DJ clicks "Go Live" → captures master audio bus as MediaStream
 *   3. Socket.IO signals "dj-go-live" → server notifies listeners
 *   4. When a listener connects, server sends "listener-joined" to DJ
 *   5. DJ creates RTCPeerConnection per listener, adds audio track, sends offer
 *   6. Listener answers → ICE completes → audio streams peer-to-peer
 */
export default function Broadcast() {
  const user = getUser();
  const canvasRef = useRef(null);

  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState("Ready — play some decks in the Mixer, then Go Live here.");
  const [energy, setEnergy] = useState(0);
  const [listeners, setListeners] = useState(0);
  const [listenerList, setListenerList] = useState([]);

  const isDJ = user?.role === "dj" || user?.role === "admin";
  const roomId = "dj-room";
  const peersRef = useRef(new Map());
  const streamRef = useRef(null);
  const liveRef = useRef(false);

  const setAudioEnergy = useDJStore((s) => s.setAudioEnergy);

  // ── Join Socket.IO room on mount ──
  useEffect(() => {
    const identity = user?.username || "broadcaster-" + Date.now();
    joinRoom(roomId, identity, "dj");
  }, []);

  // ── Draw master audio spectrum ──
  useEffect(() => {
    let running = true;
    let frameCount = 0;

    const draw = () => {
      if (!running) return;
      requestAnimationFrame(draw);
      frameCount++;

      try {
        const analyser = getMasterAnalyser();
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length / 255;
        setEnergy(avg);
        setAudioEnergy(avg);

        if (frameCount % 10 === 0) emitEnergy(avg);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#0a0a12";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          const r = dataArray[i] + 25;
          const g = 250 - dataArray[i];
          ctx.fillStyle = `rgb(${r},${g},50)`;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }

        ctx.fillStyle = avg > 0.6 ? "#ff3300" : avg > 0.3 ? "#ff9800" : "#00f0ff";
        ctx.fillRect(0, 0, canvas.width * avg, 4);
      } catch {}
    };
    draw();
    return () => { running = false; };
  }, []);

  // ── Create a peer connection for one listener ──
  const createPeerForListener = useCallback((listenerId, identity) => {
    if (peersRef.current.has(listenerId)) return;
    const socket = getSocket();
    const stream = streamRef.current;
    if (!stream) return;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    stream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("webrtc-ice", { targetId: listenerId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        setStatus(`🔴 LIVE — streaming to ${peersRef.current.size} listener(s)`);
      }
      if (state === "disconnected" || state === "failed" || state === "closed") {
        peersRef.current.delete(listenerId);
        setListenerList((prev) => prev.filter((l) => l.id !== listenerId));
        setListeners(peersRef.current.size);
        if (liveRef.current) {
          setStatus(`🔴 LIVE — streaming to ${peersRef.current.size} listener(s)`);
        }
      }
    };

    peersRef.current.set(listenerId, pc);
    setListenerList((prev) => [...prev, { id: listenerId, identity }]);
    setListeners(peersRef.current.size);

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit("webrtc-offer", { listenerId, offer: pc.localDescription });
      })
      .catch((err) => console.error("[WebRTC] Offer error:", err));
  }, []);

  // ── Socket.IO listeners for WebRTC signaling ──
  useEffect(() => {
    const socket = getSocket();

    const onListenerJoined = ({ listenerId, identity }) => {
      if (!liveRef.current) return;
      console.log(`[Broadcast] Listener wants stream: ${identity}`);
      createPeerForListener(listenerId, identity);
    };

    const onAnswer = ({ listenerId, answer }) => {
      const pc = peersRef.current.get(listenerId);
      if (pc && pc.signalingState === "have-local-offer") {
        pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
      }
    };

    const onIce = ({ fromId, candidate }) => {
      const pc = peersRef.current.get(fromId);
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    };

    const onListenerLeft = ({ listenerId }) => {
      const pc = peersRef.current.get(listenerId);
      if (pc) {
        pc.close();
        peersRef.current.delete(listenerId);
        setListenerList((prev) => prev.filter((l) => l.id !== listenerId));
        setListeners(peersRef.current.size);
      }
    };

    socket.on("listener-joined", onListenerJoined);
    socket.on("webrtc-answer", onAnswer);
    socket.on("webrtc-ice", onIce);
    socket.on("listener-left", onListenerLeft);

    return () => {
      socket.off("listener-joined", onListenerJoined);
      socket.off("webrtc-answer", onAnswer);
      socket.off("webrtc-ice", onIce);
      socket.off("listener-left", onListenerLeft);
    };
  }, [createPeerForListener]);

  // ── Go Live ──
  const goLive = async () => {
    if (!isDJ) {
      setStatus("Only DJs and admins can broadcast.");
      return;
    }

    setStatus("Starting broadcast...");

    try {
      await resumeAudio();

      const dest = getStreamDestination();
      const stream = dest.stream;

      if (!stream || stream.getAudioTracks().length === 0) {
        setStatus("No audio — open the Mixer and play a deck first!");
        return;
      }

      streamRef.current = stream;
      liveRef.current = true;
      setIsLive(true);

      const socket = getSocket();
      socket.emit("dj-go-live", { roomId });

      setStatus("🔴 You are LIVE! Listeners can now connect and hear your mix.");
    } catch (e) {
      setStatus("Failed to start broadcast: " + e.message);
      console.error(e);
    }
  };

  // ── Stop broadcast ──
  const stopLive = () => {
    liveRef.current = false;
    setIsLive(false);

    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setListenerList([]);
    setListeners(0);

    streamRef.current = null;

    const socket = getSocket();
    socket.emit("dj-stop-live", { roomId });

    setStatus("Broadcast stopped.");
  };

  return (
    <div className="broadcast-page">
      <h1 className="page-title">📡 Live Broadcast</h1>

      <div className="broadcast-grid">
        {/* Audio Monitor */}
        <div className="broadcast-panel">
          <h3>🎧 Master Audio Bus</h3>
          <canvas ref={canvasRef} width="400" height="100" className="broadcast-canvas" />

          <div className="energy-bar">
            <div className="energy-fill" style={{ width: `${energy * 100}%` }} />
            <span className="energy-label">Energy: {Math.round(energy * 100)}%</span>
          </div>

          <p style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
            Audio from the Mixer's master bus. Play decks in the Mixer to see activity.
          </p>
        </div>

        {/* Broadcast Controls */}
        <div className="broadcast-panel">
          <h3>📡 WebRTC Broadcast</h3>

          <div className="broadcast-info">
            <div className="info-row">
              <span className="info-label">Role:</span>
              <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Can Broadcast:</span>
              <span style={{ color: isDJ ? "#39ff14" : "#f85149" }}>{isDJ ? "Yes" : "No"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Status:</span>
              <span className={`connection-status ${isLive ? "online" : ""}`}>
                {isLive ? "🔴 LIVE" : "Offline"}
              </span>
            </div>
            {isLive && (
              <div className="info-row">
                <span className="info-label">Listeners:</span>
                <span style={{ color: "#00f0ff", fontWeight: "bold" }}>{listeners}</span>
              </div>
            )}
          </div>

          <div className="broadcast-actions">
            {!isLive ? (
              <button className="deck-btn go-live-btn" onClick={goLive} disabled={!isDJ}>
                📡 Go Live
              </button>
            ) : (
              <button className="deck-btn active stop-btn" onClick={stopLive}>
                🔴 Stop Broadcast
              </button>
            )}
          </div>

          {status && <div className="broadcast-status">{status}</div>}
        </div>
      </div>

      {/* Connected Listeners */}
      {isLive && listenerList.length > 0 && (
        <div className="broadcast-panel" style={{ marginTop: 16 }}>
          <h3>👥 Connected Listeners ({listenerList.length})</h3>
          <div className="listener-grid">
            {listenerList.map((l) => (
              <div key={l.id} className="listener-chip">
                <span style={{ fontSize: 8 }}>🟢</span> {l.identity || "Anonymous"}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="broadcast-panel" style={{ marginTop: 16 }}>
        <h3>📘 How It Works</h3>
        <ol className="broadcast-instructions">
          <li>Open the <strong>Mixer</strong> and load/play tracks on the decks</li>
          <li>Come back here — the master bus monitor shows your live audio</li>
          <li>Click <strong>Go Live</strong> to start broadcasting via WebRTC</li>
          <li>Pub owners open the <strong>Listener</strong> page and enter their activation code</li>
          <li>Your mix streams directly to them — peer-to-peer, real audio!</li>
          <li>Listeners see synchronized 3D visuals driven by your audio energy</li>
        </ol>
      </div>
    </div>
  );
}
