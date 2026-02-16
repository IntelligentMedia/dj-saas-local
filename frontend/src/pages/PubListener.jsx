import React, { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import useDJStore from "../store/djStore";
import {
  createAvatar, animateAvatar, createMetaAvatars, animateMetaAvatars,
  createCrowd, animateCrowd,
  createClubLights, animateClubLights, createLasers, animateLasers,
  createPyro, checkPyroTrigger, animatePyro,
  createStage, animateStage, switchMode as switchSceneMode, animateCamera,
} from "../engine";
import { apiFetch, api, getUser } from "../utils/api";
import { joinRoom, emitReaction, emitSongRequest, getSocket } from "../utils/socket";
import LiveChat from "../components/LiveChat";

/**
 * PubListener — Audience / Pub-owner listen-only page
 *
 * Flow:
 *   1. Enter activation code
 *   2. Backend validates → returns LiveKit token + room name
 *   3. Connect to LiveKit room as subscriber (listen-only)
 *   4. Pipe remote DJ audio into web audio analyser
 *   5. Drive the same 3D engine visuals (crowd, pyro, lights)
 */
export default function PubListener() {
  const mountRef = useRef(null);
  const [activationCode, setActivationCode] = useState("");
  const [status, setStatus] = useState("");
  const [connected, setConnected] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [djName, setDjName] = useState("");
  const [mode, setMode] = useState("stage");
  const [listeners, setListeners] = useState(0);

  const roomRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animFrameRef = useRef(null);
  const [reactions, setReactions] = useState([]);

  const setAudioEnergy = useDJStore((s) => s.setAudioEnergy);
  const nowPlaying = useDJStore((s) => s.nowPlaying);

  // ── Session Rating ──
  const [showRating, setShowRating] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [djRatingAvg, setDjRatingAvg] = useState(null);

  // ── Song Request ──
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestArtist, setRequestArtist] = useState("");
  const [requestSent, setRequestSent] = useState(false);

  const sendSongRequest = () => {
    if (!requestTitle.trim()) return;
    emitSongRequest(requestTitle.trim(), requestArtist.trim(), "");
    setRequestSent(true);
    setRequestTitle("");
    setRequestArtist("");
    setTimeout(() => setRequestSent(false), 3000);
  };

  const submitRating = async () => {
    if (!myRating) return;
    try {
      await apiFetch("/profile/ratings", {
        method: "POST",
        body: JSON.stringify({
          dj_id: roomRef.current?.djId || null,
          rating: myRating,
          comment: ratingComment.trim() || null,
        }),
      });
      setRatingSubmitted(true);
    } catch (e) {
      console.warn("Rating submit failed:", e);
    }
  };

  // ── Socket.IO: receive energy + reactions from DJ ──
  useEffect(() => {
    const socket = getSocket();

    const handleEnergy = ({ value }) => {
      setEnergy(value);
      setAudioEnergy(value);
    };

    const handleReaction = ({ emoji, from }) => {
      const id = Date.now() + Math.random();
      setReactions(prev => [...prev.slice(-20), { id, emoji, from }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
    };

    const handleParticipants = ({ count, dj }) => {
      setListeners(count);
      if (dj) setDjName(dj);
    };

    // Fetch DJ id from live rooms to associate ratings
    apiFetch("/rooms/live").then(rooms => {
      if (rooms?.length > 0 && rooms[0].dj_id) {
        if (!roomRef.current) roomRef.current = {};
        roomRef.current.djId = rooms[0].dj_id;
      }
    }).catch(() => {});

    socket.on("energy", handleEnergy);
    socket.on("reaction", handleReaction);
    socket.on("participants", handleParticipants);

    return () => {
      socket.off("energy", handleEnergy);
      socket.off("reaction", handleReaction);
      socket.off("participants", handleParticipants);
    };
  }, []);

  // ── Step 1: Validate activation code → get LiveKit token ──
  const handleConnect = async () => {
    if (!activationCode.trim()) {
      setStatus("Enter your activation code");
      return;
    }
    setStatus("Validating code...");

    try {
      // Validate the activation code
      const valRes = await apiFetch("/activation/validate", {
        method: "POST",
        body: JSON.stringify({ code: activationCode.trim() }),
      });

      if (!valRes || valRes.error) {
        setStatus(valRes?.error || "Invalid activation code");
        return;
      }

      setStatus("Code valid! Requesting LiveKit token...");

      // Get LiveKit token for the room as a listener
      const tokenRes = await api(`/livekit/token?room=dj-room&identity=listener-${Date.now()}`);
      if (!tokenRes.ok) {
        setStatus("Failed to get broadcast token");
        return;
      }
      const tokenData = await tokenRes.json();

      setStatus("Connecting to DJ stream...");

      // ── Step 2: Connect to LiveKit room ──
      try {
        const { Room, RoomEvent, Track } = await import("livekit-client");

        const room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.Connected, () => {
          setConnected(true);
          setStatus("Connected — listening to DJ!");
          setListeners(room.participants.size);
        });

        room.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          setStatus("Disconnected");
        });

        room.on(RoomEvent.ParticipantConnected, () => {
          setListeners(room.participants.size);
        });

        room.on(RoomEvent.ParticipantDisconnected, () => {
          setListeners(room.participants.size);
        });

        // ── Step 3: When DJ's audio track arrives, pipe into analyser ──
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          if (track.kind === Track.Kind.Audio) {
            setDjName(participant.identity || "DJ");

            // Attach audio to DOM
            const audioEl = track.attach();
            document.body.appendChild(audioEl);
            audioEl.style.display = "none";

            // Create web audio analyser
            const AC = window.AudioContext || window.webkitAudioContext;
            const ctx = new AC();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;
          }
        });

        await room.connect(tokenData.url, tokenData.token);
      } catch (e) {
        if (e.message?.includes("livekit-client")) {
          setStatus("livekit-client not installed — using demo mode");
          startDemoMode();
        } else {
          setStatus("LiveKit error: " + e.message);
        }
      }
    } catch (e) {
      setStatus("Connection error: " + e.message);
      // Fallback: start demo mode so the page is usable without LiveKit
      startDemoMode();
    }
  };

  // ── Demo mode: rich synthetic audio for testing without LiveKit ──
  const startDemoMode = () => {
    setConnected(true);
    setDjName("Demo DJ");
    setStatus("Demo mode — synthetic audio drives visuals");

    // Join Socket.IO room as listener
    joinRoom("dj-room", "listener-" + Date.now(), "listener");

    // Create rich oscillator bank for a visible spectrum
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const mixGain = ctx.createGain();
    mixGain.gain.value = 1.0;
    mixGain.connect(analyser);
    // Don't connect to destination (silent)

    const oscNodes = [];
    // Bass
    [40, 80, 120].forEach(f => {
      const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.3;
      osc.connect(g).connect(mixGain); osc.start(); oscNodes.push(osc);
    });
    // Mids
    [300, 600, 1000, 1500].forEach(f => {
      const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.12;
      osc.connect(g).connect(mixGain); osc.start(); oscNodes.push(osc);
    });
    // Highs
    [3000, 5000].forEach(f => {
      const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.06;
      osc.connect(g).connect(mixGain); osc.start(); oscNodes.push(osc);
    });
    // LFO for rhythmic pulsing
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 2.2;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.4;
    lfo.connect(lfoG).connect(mixGain.gain); lfo.start(); oscNodes.push(lfo);

    analyserRef.current = analyser;
    // Store for cleanup
    roomRef.current = { _demo: true, _oscNodes: oscNodes };
  };

  const handleDisconnect = () => {
    if (roomRef.current) {
      // Cleanup demo oscillators if in demo mode
      if (roomRef.current._demo && roomRef.current._oscNodes) {
        roomRef.current._oscNodes.forEach(n => { try { n.stop(); } catch {} });
      } else if (roomRef.current.disconnect) {
        roomRef.current.disconnect();
      }
      roomRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setConnected(false);
    setDjName("");
    setStatus("Disconnected");
  };

  // ── 3D Scene — same engine used by Visualizer.jsx ──
  useEffect(() => {
    if (!connected) return;
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const avatarParts = createAvatar(scene);
    const stage = createStage(scene);
    const clubLights = createClubLights(scene);
    const lasers = createLasers(scene);
    const crowdAvatars = createCrowd(scene, 30); // more crowd for pub feel
    const metaAvatars = createMetaAvatars(scene);
    const pyroState = createPyro(scene);

    camera.position.set(0, 3, 10);
    camera.lookAt(0, 1, 0);

    let lastEnergy = 0, mouseX = 0;
    let currentMode = "stage";

    const handleMouse = (e) => { mouseX = (e.clientX / window.innerWidth - 0.5) * 2; };
    window.addEventListener("mousemove", handleMouse);

    // Initial mode setup
    switchSceneMode(currentMode, {
      avatar: avatarParts.avatar, deckA: stage.deckA, deckB: stage.deckB,
      gridHelper: stage.gridHelper, clubLights, lasers, crowdAvatars,
      metaAvatars, globe: stage.globe, djNode: stage.djNode,
    });

    const dataArray = analyserRef.current
      ? new Uint8Array(analyserRef.current.frequencyBinCount)
      : new Uint8Array(128);

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      let avg = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        avg = sum / dataArray.length;
      }

      const energyVal = avg / 255;
      const combinedEnergy = Math.min(1, energyVal + 0.05);

      // Update React state periodically (not every frame)
      if (Math.abs(energyVal - lastEnergy) > 0.02) {
        setEnergy(energyVal);
        setAudioEnergy(energyVal);
      }

      checkPyroTrigger(pyroState, energyVal, lastEnergy);
      lastEnergy = energyVal;
      animatePyro(pyroState);

      animateAvatar(avatarParts, energyVal, 0.5);
      animateStage(stage, energyVal, currentMode);
      animateClubLights(clubLights, energyVal);
      animateLasers(lasers, energyVal);
      animateCrowd(crowdAvatars, combinedEnergy);
      animateMetaAvatars(metaAvatars);
      animateCamera(camera, { energy: energyVal, pyroActive: pyroState.active, mouseX, currentMode });

      renderer.render(scene, camera);
    }
    animate();

    // Expose mode switcher
    container._switchMode = (m) => {
      currentMode = m;
      switchSceneMode(m, {
        avatar: avatarParts.avatar, deckA: stage.deckA, deckB: stage.deckB,
        gridHelper: stage.gridHelper, clubLights, lasers, crowdAvatars,
        metaAvatars, globe: stage.globe, djNode: stage.djNode,
      });
    };

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("resize", handleResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [connected]);

  const switchModeBtn = (m) => {
    setMode(m);
    mountRef.current?._switchMode?.(m);
  };

  return (
    <div className="pub-listener-page">
      <h1 className="page-title">🎧 Pub Listener</h1>

      {!connected ? (
        <div className="listener-connect-panel">
          <p className="listener-intro">
            Enter your activation code to connect to a live DJ session and experience
            the performance with synchronized 3D visuals, pyro effects, and crowd energy.
          </p>
          <div className="listener-code-input">
            <input
              type="text"
              placeholder="Enter activation code..."
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              className="activation-input"
              maxLength={20}
            />
            <button className="deck-btn connect-btn" onClick={handleConnect}>
              🔌 Connect
            </button>
          </div>
          <button className="deck-btn demo-btn" onClick={startDemoMode} style={{ marginTop: 12 }}>
            🎬 Demo Mode (no code needed)
          </button>
          {status && <p className="listener-status">{status}</p>}
        </div>
      ) : (
        <>
          {/* Live Info Bar */}
          <div className="listener-live-bar">
            <span className="live-dot">🔴</span>
            <span className="live-label">LISTENING</span>
            <span className="listener-dj">DJ: {djName}</span>
            <span className="listener-count">👥 {listeners} connected</span>
            <span className="listener-energy-badge" style={{
              background: energy > 0.6 ? "#ff3300" : energy > 0.3 ? "#ff9800" : "#00f0ff"
            }}>
              Energy: {Math.round(energy * 100)}%
            </span>
            <button className="deck-btn disconnect-btn" onClick={handleDisconnect}>
              ⏹ Disconnect
            </button>
          </div>

          {/* Now Playing */}
          {nowPlaying && (
            <div className="listener-now-playing">
              <span className="lnp-icon">🎵</span>
              <div className="lnp-info">
                <span className="lnp-title">{nowPlaying.title || "Unknown"}</span>
                <span className="lnp-artist">{nowPlaying.artist || ""}</span>
              </div>
              {nowPlaying.bpm && <span className="lnp-bpm">{nowPlaying.bpm} BPM</span>}
              {nowPlaying.genre && <span className="lnp-genre">{nowPlaying.genre}</span>}
              <span className="lnp-deck">Deck {nowPlaying.deck}</span>
            </div>
          )}

          {/* Emoji Reactions */}
          <div className="listener-reactions-bar">
            {["🔥", "❤️", "🎵", "🙌", "💃", "🎉"].map(emoji => (
              <button key={emoji} className="reaction-btn" onClick={() => emitReaction(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
          {reactions.length > 0 && (
            <div className="reactions-float">
              {reactions.map(r => (
                <span key={r.id} className="floating-reaction">{r.emoji}</span>
              ))}
            </div>
          )}

          {/* ═══ Rate This Session ═══ */}
          <div className="listener-rating-section">
            {!showRating ? (
              <button className="deck-btn rate-session-btn" onClick={() => setShowRating(true)}>
                ⭐ Rate This Session
              </button>
            ) : (
              <div className="rating-widget">
                <h4 className="rating-title">Rate {djName || "the DJ"}</h4>
                {!ratingSubmitted ? (
                  <>
                    <div className="star-row">
                      {[1, 2, 3, 4, 5].map(star => (
                        <span
                          key={star}
                          className={`star ${star <= (ratingHover || myRating) ? "filled" : ""}`}
                          onMouseEnter={() => setRatingHover(star)}
                          onMouseLeave={() => setRatingHover(0)}
                          onClick={() => setMyRating(star)}
                        >
                          ★
                        </span>
                      ))}
                      <span className="star-label">
                        {myRating > 0 ? ["", "Poor", "Fair", "Good", "Great", "Amazing"][myRating] : ""}
                      </span>
                    </div>
                    <input
                      type="text"
                      className="rating-comment-input"
                      placeholder="Optional comment..."
                      value={ratingComment}
                      onChange={e => setRatingComment(e.target.value)}
                      maxLength={200}
                    />
                    <div className="rating-actions">
                      <button className="deck-btn" onClick={submitRating} disabled={!myRating}>
                        Submit Rating
                      </button>
                      <button className="deck-btn" onClick={() => setShowRating(false)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className="rating-thanks">
                    <span className="rating-thanks-stars">{"★".repeat(myRating)}{"☆".repeat(5 - myRating)}</span>
                    <p>Thanks for your rating!</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══ Song Request ═══ */}
          <div className="listener-request-section">
            {!showRequestForm ? (
              <button className="deck-btn request-song-btn" onClick={() => setShowRequestForm(true)}>
                🎵 Request a Song
              </button>
            ) : (
              <div className="song-request-form">
                <h4 className="request-title">🎵 Request a Song</h4>
                {requestSent ? (
                  <p className="request-sent-msg">✅ Request sent to the DJ!</p>
                ) : (
                  <>
                    <input
                      type="text"
                      className="request-input"
                      placeholder="Song title..."
                      value={requestTitle}
                      onChange={e => setRequestTitle(e.target.value)}
                      maxLength={100}
                    />
                    <input
                      type="text"
                      className="request-input"
                      placeholder="Artist (optional)..."
                      value={requestArtist}
                      onChange={e => setRequestArtist(e.target.value)}
                      maxLength={100}
                    />
                    <div className="request-actions">
                      <button className="deck-btn" onClick={sendSongRequest} disabled={!requestTitle.trim()}>
                        Send Request
                      </button>
                      <button className="deck-btn" onClick={() => setShowRequestForm(false)}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mode buttons */}
          <div className="viz-mode-buttons" style={{ padding: "8px 20px" }}>
            <button className={`deck-btn ${mode === "stage" ? "active" : ""}`} onClick={() => switchModeBtn("stage")}>🎤 Stage</button>
            <button className={`deck-btn ${mode === "metaverse" ? "active" : ""}`} onClick={() => switchModeBtn("metaverse")}>🌐 Metaverse</button>
            <button className={`deck-btn ${mode === "globe" ? "active" : ""}`} onClick={() => switchModeBtn("globe")}>🌍 Pulse Globe</button>
          </div>

          {status && <p className="listener-status" style={{ padding: "0 20px" }}>{status}</p>}

          {/* 3D Canvas */}
          <div ref={mountRef} className="viz-canvas listener-canvas" />

          {/* Live Chat */}
          <LiveChat />
        </>
      )}
    </div>
  );
}
