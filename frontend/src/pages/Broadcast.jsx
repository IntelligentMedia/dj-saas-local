import React, { useState, useRef, useEffect } from "react";
import { api, getUser } from "../utils/api";
import useDJStore from "../store/djStore";
import { getStreamDestination, getMasterAnalyser, resumeAudio } from "../engine";
import { joinRoom, emitEnergy } from "../utils/socket";

export default function Broadcast() {
  const user = getUser();
  const canvasRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [status, setStatus] = useState("");
  const [energy, setEnergy] = useState(0);
  const [listeners, setListeners] = useState(0);
  const [demoMode, setDemoMode] = useState(false);

  const isDJ = user?.role === "dj" || user?.role === "admin";
  const roomRef = useRef(null);

  const setAudioEnergy = useDJStore((s) => s.setAudioEnergy);

  // ── Join Socket.IO room on mount ──
  useEffect(() => {
    const identity = user?.username || "broadcaster-" + Date.now();
    joinRoom("dj-room", identity, "dj");
  }, []);

  // ── Draw audio energy from master analyser ──
  useEffect(() => {
    let running = true;

    const draw = () => {
      if (!running) return;
      requestAnimationFrame(draw);

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

        // Emit energy over Socket.IO every few frames
        if (Math.random() < 0.1) emitEnergy(avg);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const canvasCtx = canvas.getContext("2d");

        canvasCtx.fillStyle = "#0a0a12";
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          const r = dataArray[i] + 25;
          const g = 250 - dataArray[i];
          canvasCtx.fillStyle = `rgb(${r},${g},50)`;
          canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }

        // Energy meter
        canvasCtx.fillStyle = avg > 0.6 ? "#ff3300" : avg > 0.3 ? "#ff9800" : "#00f0ff";
        canvasCtx.fillRect(0, 0, canvas.width * avg, 4);
      } catch {}
    };
    draw();

    return () => { running = false; };
  }, []);

  // Request LiveKit token from API
  const requestToken = async () => {
    setStatus("Requesting token...");
    try {
      const res = await api("/livekit/token?room=dj-room");
      if (res.ok) {
        const data = await res.json();
        setTokenInfo(data);
        setStatus(data.mock ? "Mock token received (install livekit-server-sdk for real tokens)" : "Token received!");
      } else {
        setStatus("Failed to get token");
      }
    } catch (e) {
      setStatus("API error: " + e.message);
    }
  };

  // Connect to LiveKit and publish master audio stream from audioEngine
  const connectLiveKit = async () => {
    if (!tokenInfo) {
      setStatus("Get a token first!");
      return;
    }

    setStatus("Connecting to LiveKit...");

    try {
      await resumeAudio();
      const { Room, RoomEvent } = await import("livekit-client");

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.Connected, () => {
        setStatus("Connected to LiveKit room!");
        setConnected(true);
      });

      room.on(RoomEvent.Disconnected, () => {
        setStatus("Disconnected from LiveKit");
        setConnected(false);
      });

      room.on(RoomEvent.ParticipantConnected, (p) => {
        setListeners(prev => prev + 1);
        setStatus(`Listener joined: ${p.identity}`);
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        setListeners(prev => Math.max(0, prev - 1));
      });

      await room.connect(tokenInfo.url, tokenInfo.token);

      // Publish the master audio stream from audioEngine
      if (isDJ) {
        const dest = getStreamDestination();
        const stream = dest.stream;
        const audioTrack = stream.getAudioTracks()[0];

        if (audioTrack) {
          await room.localParticipant.publishTrack(audioTrack, {
            name: "dj-master-audio",
            source: "microphone",
          });
          setStatus("Broadcasting master audio to LiveKit!");
        } else {
          setStatus("No audio track — play some decks in the Mixer first!");
        }
      }
    } catch (e) {
      if (e.message?.includes("Failed to fetch") || e.message?.includes("WebSocket") || e.message?.includes("connect")) {
        setStatus("LiveKit server unreachable — starting demo broadcast mode");
        startDemoBroadcast();
      } else {
        setStatus("LiveKit error: " + e.message);
        console.error(e);
      }
    }
  };

  // Demo broadcast mode — works without a LiveKit server
  const startDemoBroadcast = () => {
    setDemoMode(true);
    setConnected(true);
    setStatus("🎧 Demo broadcast active — audio plays locally, Socket.IO syncs energy to listeners");
    // Simulate listeners joining
    const interval = setInterval(() => {
      if (!roomRef.current?._demo) { clearInterval(interval); return; }
      setListeners(prev => Math.min(prev + Math.floor(Math.random() * 2), 12));
    }, 5000);
    roomRef.current = { _demo: true, _interval: interval };
  };

  const disconnectLiveKit = () => {
    if (roomRef.current) {
      if (roomRef.current._demo) {
        clearInterval(roomRef.current._interval);
      } else {
        roomRef.current.disconnect();
      }
      roomRef.current = null;
    }
    setConnected(false);
    setDemoMode(false);
    setListeners(0);
    setStatus("Disconnected");
  };

  return (
    <div className="broadcast-page">
      <h1 className="page-title">📡 Live Broadcast</h1>

      <div className="broadcast-grid">
        {/* Audio Monitor Panel */}
        <div className="broadcast-panel">
          <h3>🎧 Master Audio Bus</h3>
          <canvas ref={canvasRef} width="400" height="100" className="broadcast-canvas" />

          <div className="energy-bar">
            <div className="energy-fill" style={{ width: `${energy * 100}%` }} />
            <span className="energy-label">Energy: {Math.round(energy * 100)}%</span>
          </div>

          <p style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
            Audio is sourced from the Mixer's master bus. Play decks in the Mixer to see activity here.
          </p>
        </div>

        {/* LiveKit Connection Panel */}
        <div className="broadcast-panel">
          <h3>📡 LiveKit Streaming</h3>

          <div className="broadcast-info">
            <div className="info-row">
              <span className="info-label">Role:</span>
              <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Can Publish:</span>
              <span style={{ color: isDJ ? "#39ff14" : "#f85149" }}>{isDJ ? "Yes" : "No (subscribe only)"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Status:</span>
              <span className={`connection-status ${connected ? "online" : ""}`}>
                {connected ? (demoMode ? "DEMO LIVE" : "LIVE") : "Offline"}
              </span>
            </div>
            {connected && (
              <div className="info-row">
                <span className="info-label">Listeners:</span>
                <span style={{ color: "#00f0ff" }}>{listeners}</span>
              </div>
            )}
          </div>

          <div className="broadcast-actions">
            <button className="deck-btn" onClick={requestToken}>
              🔑 Get Token
            </button>
            {!connected ? (
              <button
                className="deck-btn"
                onClick={connectLiveKit}
                disabled={!tokenInfo}
              >
                📡 Go Live
              </button>
            ) : (
              <button className="deck-btn active" onClick={disconnectLiveKit}>
                🔴 Stop Broadcast
              </button>
            )}
          </div>

          {tokenInfo && (
            <div className="token-info">
              <div className="info-row">
                <span className="info-label">Room:</span>
                <span>{tokenInfo.room}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Server:</span>
                <span>{tokenInfo.url}</span>
              </div>
              {tokenInfo.mock && (
                <div className="broadcast-warning">
                  ⚠️ No LiveKit server — Go Live will use demo mode.<br />
                  For real streaming: <code>docker run --rm -p 7880:7880 -p 7881:7881 -e LIVEKIT_KEYS="devkey:secret" livekit/livekit-server</code>
                </div>
              )}
            </div>
          )}

          {status && <div className="broadcast-status">{status}</div>}
        </div>
      </div>

      {/* Instructions */}
      <div className="broadcast-panel" style={{ marginTop: 16 }}>
        <h3>📘 How to Use LiveKit Streaming</h3>
        <ol className="broadcast-instructions">
          <li>Open the <strong>Mixer</strong> and play some decks to generate audio</li>
          <li>Come back here — the master bus energy monitor shows live audio</li>
          <li>Start a LiveKit server locally with Docker (or use a cloud instance)</li>
          <li>Click <strong>Get Token</strong> to request an authentication token</li>
          <li>Click <strong>Go Live</strong> to broadcast the mixer's audio to all listeners</li>
          <li>Pub owners open the <strong>Listener</strong> page to receive the stream</li>
        </ol>
      </div>
    </div>
  );
}
