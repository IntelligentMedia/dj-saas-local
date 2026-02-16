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
 * PubListener — Audience / Pub-owner listen page (WebRTC)
 *
 * Flow:
 *   1. Enter activation code → validated by API
 *   2. Join Socket.IO room as "listener"
 *   3. Emit "listener-request" → server tells DJ to create a peer connection
 *   4. DJ sends WebRTC offer → listener answers → ICE → real audio streams P2P
 *   5. Pipe received audio into Web Audio analyser → drive 3D visuals
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
  const [audioActive, setAudioActive] = useState(false);

  const pcRef = useRef(null);         // RTCPeerConnection
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

  // ── Song Request ──
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestArtist, setRequestArtist] = useState("");
  const [requestSent, setRequestSent] = useState(false);

  const roomId = "dj-room";
  const djIdRef = useRef(null); // for rating

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
          dj_id: djIdRef.current || null,
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
      setReactions((prev) => [...prev.slice(-20), { id, emoji, from }]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3000);
    };

    const handleParticipants = ({ count, dj }) => {
      setListeners(count);
      if (dj) setDjName(dj);
    };

    // Fetch DJ id from live rooms for ratings
    apiFetch("/rooms/live")
      .then((rooms) => {
        if (rooms?.length > 0 && rooms[0].dj_id) {
          djIdRef.current = rooms[0].dj_id;
        }
      })
      .catch(() => {});

    socket.on("energy", handleEnergy);
    socket.on("reaction", handleReaction);
    socket.on("participants", handleParticipants);

    return () => {
      socket.off("energy", handleEnergy);
      socket.off("reaction", handleReaction);
      socket.off("participants", handleParticipants);
    };
  }, []);

  // ── WebRTC signaling handlers ──
  useEffect(() => {
    const socket = getSocket();

    // DJ sends us an offer
    const onOffer = async ({ djId, offer }) => {
      console.log("[Listener] Received WebRTC offer from DJ");
      setStatus("Connecting to DJ's audio stream...");

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      pcRef.current = pc;

      // When we receive the DJ's audio track
      pc.ontrack = (e) => {
        console.log("[Listener] Received audio track from DJ!");
        const stream = e.streams[0] || new MediaStream([e.track]);

        // Play the audio through speakers
        const audioEl = document.createElement("audio");
        audioEl.srcObject = stream;
        audioEl.autoplay = true;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
        audioEl.play().catch(() => {});

        // Create Web Audio analyser for 3D visuals
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") ctx.resume();

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        // Don't connect analyser to destination — audioEl already plays the sound
        analyserRef.current = analyser;
        setAudioActive(true);
        setStatus("Receiving DJ's live audio!");
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("webrtc-ice", { targetId: djId, candidate: e.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          setStatus("Connected — listening to DJ's live mix!");
        }
        if (state === "disconnected" || state === "failed") {
          setStatus("Connection lost — DJ may have stopped broadcasting.");
          setAudioActive(false);
        }
      };

      // Set remote offer, create answer, send back
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { djId, answer: pc.localDescription });
    };

    const onIce = ({ fromId, candidate }) => {
      if (pcRef.current) {
        pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    };

    const onDjOffline = () => {
      setStatus("DJ has gone offline.");
      setAudioActive(false);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };

    const onNoDj = ({ message }) => {
      setStatus(message || "No DJ is currently live. Wait for a DJ to start broadcasting.");
    };

    socket.on("webrtc-offer", onOffer);
    socket.on("webrtc-ice", onIce);
    socket.on("dj-offline", onDjOffline);
    socket.on("no-dj", onNoDj);

    // If DJ goes live while we're already connected
    socket.on("dj-live", ({ dj }) => {
      setDjName(dj);
      setStatus(`DJ ${dj} is live! Requesting stream...`);
      // Auto-request connection
      if (connected) {
        socket.emit("listener-request", { roomId });
      }
    });

    return () => {
      socket.off("webrtc-offer", onOffer);
      socket.off("webrtc-ice", onIce);
      socket.off("dj-offline", onDjOffline);
      socket.off("no-dj", onNoDj);
      socket.off("dj-live");
    };
  }, [connected]);

  // ── Connect: validate activation code then request stream ──
  const handleConnect = async () => {
    if (!activationCode.trim()) {
      setStatus("Enter your activation code");
      return;
    }
    setStatus("Validating code...");

    try {
      const valRes = await apiFetch("/activation/validate", {
        method: "POST",
        body: JSON.stringify({ code: activationCode.trim() }),
      });

      if (!valRes || valRes.error) {
        setStatus(valRes?.error || "Invalid activation code");
        return;
      }

      setStatus("Code valid! Joining room...");

      // Join Socket.IO room as listener
      const identity = "listener-" + Date.now();
      joinRoom(roomId, identity, "listener");

      setConnected(true);
      setStatus("Connected to room — requesting DJ's audio stream...");

      // Request WebRTC stream from DJ
      const socket = getSocket();
      socket.emit("listener-request", { roomId });
    } catch (e) {
      setStatus("Connection error: " + e.message);
    }
  };

  // ── Quick-connect without activation code (for testing) ──
  const handleQuickConnect = () => {
    const identity = "listener-" + Date.now();
    joinRoom(roomId, identity, "listener");
    setConnected(true);
    setStatus("Connected to room — requesting DJ's audio stream...");

    const socket = getSocket();
    socket.emit("listener-request", { roomId });
  };

  const handleDisconnect = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    // Remove any audio elements we appended
    document.querySelectorAll("audio[autoplay]").forEach((el) => el.remove());
    setConnected(false);
    setAudioActive(false);
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
    const crowdAvatars = createCrowd(scene, 30);
    const metaAvatars = createMetaAvatars(scene);
    const pyroState = createPyro(scene);

    camera.position.set(0, 3, 10);
    camera.lookAt(0, 1, 0);

    let lastEnergy = 0,
      mouseX = 0;
    let currentMode = "stage";

    const handleMouse = (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    };
    window.addEventListener("mousemove", handleMouse);

    switchSceneMode(currentMode, {
      avatar: avatarParts.avatar,
      deckA: stage.deckA,
      deckB: stage.deckB,
      gridHelper: stage.gridHelper,
      clubLights,
      lasers,
      crowdAvatars,
      metaAvatars,
      globe: stage.globe,
      djNode: stage.djNode,
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
      animateCamera(camera, {
        energy: energyVal,
        pyroActive: pyroState.active,
        mouseX,
        currentMode,
      });

      renderer.render(scene, camera);
    }
    animate();

    container._switchMode = (m) => {
      currentMode = m;
      switchSceneMode(m, {
        avatar: avatarParts.avatar,
        deckA: stage.deckA,
        deckB: stage.deckB,
        gridHelper: stage.gridHelper,
        clubLights,
        lasers,
        crowdAvatars,
        metaAvatars,
        globe: stage.globe,
        djNode: stage.djNode,
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
          <button className="deck-btn" onClick={handleQuickConnect} style={{ marginTop: 12, opacity: 0.7 }}>
            ⚡ Quick Connect (no code)
          </button>
          {status && <p className="listener-status">{status}</p>}
        </div>
      ) : (
        <>
          {/* Live Info Bar */}
          <div className="listener-live-bar">
            <span className="live-dot">🔴</span>
            <span className="live-label">LISTENING</span>
            {djName && <span className="listener-dj">DJ: {djName}</span>}
            <span className="listener-count">👥 {listeners} connected</span>
            <span
              className="listener-energy-badge"
              style={{
                background: energy > 0.6 ? "#ff3300" : energy > 0.3 ? "#ff9800" : "#00f0ff",
              }}
            >
              Energy: {Math.round(energy * 100)}%
            </span>
            {audioActive && <span className="audio-badge">🔊 Live Audio</span>}
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
            {["🔥", "❤️", "🎵", "🙌", "💃", "🎉"].map((emoji) => (
              <button key={emoji} className="reaction-btn" onClick={() => emitReaction(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
          {reactions.length > 0 && (
            <div className="reactions-float">
              {reactions.map((r) => (
                <span key={r.id} className="floating-reaction">
                  {r.emoji}
                </span>
              ))}
            </div>
          )}

          {/* Rate This Session */}
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
                      {[1, 2, 3, 4, 5].map((star) => (
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
                      onChange={(e) => setRatingComment(e.target.value)}
                      maxLength={200}
                    />
                    <div className="rating-actions">
                      <button className="deck-btn" onClick={submitRating} disabled={!myRating}>
                        Submit Rating
                      </button>
                      <button className="deck-btn" onClick={() => setShowRating(false)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rating-thanks">
                    <span className="rating-thanks-stars">
                      {"★".repeat(myRating)}
                      {"☆".repeat(5 - myRating)}
                    </span>
                    <p>Thanks for your rating!</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Song Request */}
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
                      onChange={(e) => setRequestTitle(e.target.value)}
                      maxLength={100}
                    />
                    <input
                      type="text"
                      className="request-input"
                      placeholder="Artist (optional)..."
                      value={requestArtist}
                      onChange={(e) => setRequestArtist(e.target.value)}
                      maxLength={100}
                    />
                    <div className="request-actions">
                      <button className="deck-btn" onClick={sendSongRequest} disabled={!requestTitle.trim()}>
                        Send Request
                      </button>
                      <button className="deck-btn" onClick={() => setShowRequestForm(false)}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mode buttons */}
          <div className="viz-mode-buttons" style={{ padding: "8px 20px" }}>
            <button className={`deck-btn ${mode === "stage" ? "active" : ""}`} onClick={() => switchModeBtn("stage")}>
              🎤 Stage
            </button>
            <button className={`deck-btn ${mode === "metaverse" ? "active" : ""}`} onClick={() => switchModeBtn("metaverse")}>
              🌐 Metaverse
            </button>
            <button className={`deck-btn ${mode === "globe" ? "active" : ""}`} onClick={() => switchModeBtn("globe")}>
              🌍 Pulse Globe
            </button>
          </div>

          {status && (
            <p className="listener-status" style={{ padding: "0 20px" }}>
              {status}
            </p>
          )}

          {/* 3D Canvas */}
          <div ref={mountRef} className="viz-canvas listener-canvas" />

          {/* Live Chat */}
          <LiveChat />
        </>
      )}
    </div>
  );
}
