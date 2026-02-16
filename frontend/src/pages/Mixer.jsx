import React, { useState, useRef, useCallback, useEffect } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { apiFetch, getToken } from "../utils/api";
import useDJStore from "../store/djStore";
import { toast } from "../store/toastStore";
import { setCrossfader as setAudioCrossfader, getMasterGain, setCrossfaderCurve, getCrossfaderCurve } from "../engine";
import { joinRoom, emitCrossfader, emitEnergy, emitNowPlaying, emitRequestResponse, getSocket, disconnectSocket } from "../utils/socket";
import Deck from "../components/Deck";
import FXPanel from "../components/FXPanel";
import LiveChat from "../components/LiveChat";
import MixRecorder from "../components/MixRecorder";
import MusicLibrary from "../components/MusicLibrary";
import PlaylistBuilder from "../components/PlaylistBuilder";
import TrackQueue from "../components/TrackQueue";
import SamplerPad from "../components/SamplerPad";
import JogWheel from "../components/JogWheel";

export default function Mixer({ mode = "classic", onBack }) {
  // ── Zustand global state ──
  const cross = useDJStore((s) => s.crossfader);
  const setCross = useDJStore((s) => s.setCrossfader);
  const setSession = useDJStore((s) => s.setSession);
  const listenerCount = useDJStore((s) => s.roomState.listeners);
  const isConnected = useDJStore((s) => s.isConnected);

  const [aiActive, setAiActive] = useState(false);
  const [gestureMode, setGestureMode] = useState(mode === "video");
  const [webcamMode, setWebcamMode] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [autoPlaying, setAutoPlaying] = useState(mode === "auto");
  const aiTimerRef = useRef(null);
  const autoTimerRef = useRef(null);
  const gestureRef = useRef(false);
  const videoRef = useRef(null);
  const webcamCamRef = useRef(null);
  const crossRef = useRef(cross);

  // ── LIVE Session + Countdown ──
  const [liveSession, setLiveSession] = useState(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [countdownSec, setCountdownSec] = useState(null);
  const sessionStartedRef = useRef(false);

  // ── Master Volume ──
  const [masterVol, setMasterVol] = useState(100);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Fullscreen + Multi-screen ──
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mixerPageRef = useRef(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      mixerPageRef.current?.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Listen for external fullscreen changes (e.g. Escape key)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Pop-out panels into separate windows for multi-screen
  const popOutPanel = useCallback((panelId, title, width = 500, height = 600) => {
    const left = window.screenX + window.outerWidth;
    const top = window.screenY;
    const popup = window.open("", `dj-${panelId}`, `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if (!popup) { toast.error("Pop-up blocked! Allow pop-ups for multi-screen."); return; }

    // Build a styled container in the popup
    popup.document.title = `DJ SaaS — ${title}`;
    popup.document.body.innerHTML = "";
    popup.document.body.style.cssText = "margin:0;padding:0;background:#0a0a12;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;";

    // Clone the panel content
    const sourceEl = document.querySelector(`[data-panel='${panelId}']`);
    if (!sourceEl) { toast.error(`Panel "${panelId}" not found. Open it first!`); popup.close(); return; }

    // Copy all stylesheets
    Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).forEach(s => {
      popup.document.head.appendChild(s.cloneNode(true));
    });

    const wrapper = popup.document.createElement("div");
    wrapper.style.cssText = "padding:12px;";
    wrapper.innerHTML = sourceEl.outerHTML;
    popup.document.body.appendChild(wrapper);

    toast.success(`"${title}" popped out to new window`);
  }, []);

  // ── BPM Sync + Crossfader Curve ──
  const [deckBpms, setDeckBpms] = useState({ A: null, B: null, C: null, D: null });
  const [deckRates, setDeckRates] = useState({ A: 1, B: 1, C: 1, D: 1 });
  const [crossCurve, setCrossCurve] = useState("smooth");

  // ── Auto-mix Transition Style ──
  const [transitionStyle, setTransitionStyle] = useState("smooth"); // smooth | cut | echo | backspin

  // ── Deck Mute / Solo ──
  const [deckMutes, setDeckMutes] = useState({ A: false, B: false, C: false, D: false });
  const [deckSolos, setDeckSolos] = useState({ A: false, B: false, C: false, D: false });

  const toggleMute = (deck) => {
    setDeckMutes(prev => ({ ...prev, [deck]: !prev[deck] }));
  };

  const toggleSolo = (deck) => {
    setDeckSolos(prev => ({ ...prev, [deck]: !prev[deck] }));
  };

  // A deck is effectively muted if explicitly muted, or if any OTHER deck is solo'd and this one isn't
  const isEffectivelyMuted = (deck) => {
    if (deckMutes[deck]) return true;
    const anySolo = Object.values(deckSolos).some(Boolean);
    if (anySolo && !deckSolos[deck]) return true;
    return false;
  };

  // ── Cloud Music Library + Playlists ──
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState("browse"); // browse | playlists
  const [loadTarget, setLoadTarget] = useState("A"); // which deck to load into
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);

  const TRACKS = [
    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  ];

  const [trackA, setTrackA] = useState(TRACKS[0]);
  const [trackB, setTrackB] = useState(TRACKS[1]);
  const [trackC, setTrackC] = useState(TRACKS[2]);
  const [trackD, setTrackD] = useState(TRACKS[3]);

  // Track metadata (title, artist, bpm) per deck
  const [trackMeta, setTrackMeta] = useState({
    A: { title: "SoundHelix Song 1", artist: "SoundHelix" },
    B: { title: "SoundHelix Song 2", artist: "SoundHelix" },
    C: { title: "SoundHelix Song 3", artist: "SoundHelix" },
    D: { title: "SoundHelix Song 4", artist: "SoundHelix" },
  });

  const deckSetters = { A: setTrackA, B: setTrackB, C: setTrackC, D: setTrackD };
  const deckSrcs = { A: trackA, B: trackB, C: trackC, D: trackD };

  // ── Auto-queue state ──
  const [queue, setQueue] = useState([]);  // queue items: track objects or URLs
  const [autoQueue, setAutoQueue] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  const [showSampler, setShowSampler] = useState(false);
  const [showJogWheels, setShowJogWheels] = useState(false);
  const jogPopupRef = useRef(null);
  const lastLoadedDeck = useRef(null);

  // ── Pro mode deck layer switching (A/C on left, B/D on right) ──
  const [leftDeck, setLeftDeck] = useState("A");
  const [rightDeck, setRightDeck] = useState("B");

  // ── Pop out Jog Wheels into a separate window for multi-screen ──
  const popOutJogWheels = useCallback(() => {
    // Close existing popup if open
    if (jogPopupRef.current && !jogPopupRef.current.closed) {
      jogPopupRef.current.focus();
      return;
    }

    const left = window.screenX + window.outerWidth;
    const top = window.screenY;
    const width = mode === "pro" ? 1380 : 720;
    const popup = window.open("", "dj-jogwheels", `width=${width},height=${780},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if (!popup) { toast.error("Pop-up blocked! Allow pop-ups for multi-screen jog wheels."); return; }
    jogPopupRef.current = popup;

    popup.document.title = "DJ SaaS — Jog Wheels";
    popup.document.head.innerHTML = "";
    popup.document.body.innerHTML = "";
    popup.document.body.style.cssText = "margin:0;padding:0;background:#06080f;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;";

    // Copy stylesheets
    Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).forEach(s => {
      popup.document.head.appendChild(s.cloneNode(true));
    });

    // Create a React root in the popup for live jog wheels
    const container = popup.document.createElement("div");
    container.className = "jogwheel-popup";
    popup.document.body.appendChild(container);

    // Import ReactDOM to render into the popup
    import("react-dom/client").then(({ createRoot }) => {
      const decks = mode === "pro" ? ["A", "B", "C", "D"] : ["A", "B"];
      const root = createRoot(container);

      const renderJogs = () => {
        const meta = { ...trackMeta };
        const bpms = { ...deckBpms };
        root.render(
          React.createElement("div", { className: "jogwheel-popup" },
            decks.map(d => React.createElement(JogWheel, {
              key: d,
              deckName: d,
              bpm: bpms[d] || 120,
              trackTitle: meta[d]?.title || "",
              trackArtist: meta[d]?.artist || "",
            }))
          )
        );
      };

      renderJogs();

      // Re-render periodically to keep BPM and track info synced
      const iv = setInterval(() => {
        if (popup.closed) { clearInterval(iv); return; }
        renderJogs();
      }, 1000);

      popup.addEventListener("beforeunload", () => {
        clearInterval(iv);
        root.unmount();
        jogPopupRef.current = null;
      });
    });

    toast.success("Jog Wheels popped out to new window — drag to your second screen!");
  }, [mode, trackMeta, deckBpms]);

  // Clean up jog popup on unmount
  useEffect(() => {
    return () => {
      if (jogPopupRef.current && !jogPopupRef.current.closed) {
        jogPopupRef.current.close();
      }
    };
  }, []);

  // ── Song Requests (from listeners) ──
  const [songRequests, setSongRequests] = useState([]);
  const [showRequests, setShowRequests] = useState(false);

  // Queue management
  const addToQueue = (track) => {
    const item = track.stream_url
      ? { url: track.stream_url, title: track.title, artist: track.artist, genre: track.genre, bpm: track.bpm }
      : track;
    setQueue(prev => [...prev, item]);
    toast.info(`"${track.title || "Track"}" added to queue`);
  };

  const removeFromQueue = (idx) => { setQueue(prev => prev.filter((_, i) => i !== idx)); };
  const reorderQueue = (newQueue) => setQueue(newQueue);
  const clearQueue = () => setQueue([]);

  // When a deck's track ends, auto-load next from queue or cycle TRACKS
  const handleTrackEnd = useCallback((deckName) => {
    if (!autoQueue) return;
    const nextItem = queue.length > 0 ? queue[0] : null;
    const setter = deckSetters[deckName];
    if (!setter) return;

    if (nextItem) {
      const url = typeof nextItem === "object" ? nextItem.url : nextItem;
      setter(url);
      if (typeof nextItem === "object" && nextItem.title) {
        setTrackMeta(prev => ({ ...prev, [deckName]: { title: nextItem.title, artist: nextItem.artist, genre: nextItem.genre, bpm: nextItem.bpm } }));
      }
      setQueue(prev => prev.slice(1));
    } else {
      // Cycle through TRACKS list
      const current = { A: trackA, B: trackB, C: trackC, D: trackD }[deckName];
      const idx = TRACKS.indexOf(current);
      const next = TRACKS[(idx + 1) % TRACKS.length];
      setter(next);
    }
    lastLoadedDeck.current = deckName;
  }, [autoQueue, queue, trackA, trackB, trackC, trackD]);

  // Load a cloud track into the target deck
  const handleLoadTrack = (track) => {
    const setter = deckSetters[loadTarget];
    if (setter && track.stream_url) {
      setter(track.stream_url);
      const meta = { title: track.title, artist: track.artist, genre: track.genre, bpm: track.bpm };
      setTrackMeta(prev => ({ ...prev, [loadTarget]: meta }));
      toast.info(`Loaded "${track.title}" → Deck ${loadTarget}`);

      // Broadcast now-playing to listeners
      emitNowPlaying({ deck: loadTarget, ...meta });

      // Log play history
      apiFetch("/profile/history", {
        method: "POST",
        body: JSON.stringify({
          session_id: liveSession?.id || null,
          track_id: track.id || null,
          track_title: track.title,
          track_artist: track.artist,
          deck_name: loadTarget,
          duration_sec: track.duration_sec || 0,
        }),
      }).catch(() => {});
    }
  };

  // Load entire playlist: first track → deck, rest → queue
  const handleLoadPlaylist = async (tracks) => {
    if (!tracks || tracks.length === 0) return;
    clearQueue();

    // Fetch stream URLs for all tracks in parallel
    const enriched = await Promise.all(
      tracks.map(async (t) => {
        try {
          const data = await apiFetch(`/music/tracks/${t.id}/stream`);
          // Append JWT token so <audio> element can authenticate to the proxy
          const sep = data.stream_url.includes("?") ? "&" : "?";
          const authedUrl = `${data.stream_url}${sep}token=${getToken()}`;
          return { ...t, stream_url: authedUrl };
        } catch { return null; }
      })
    );
    const valid = enriched.filter(Boolean);
    if (valid.length === 0) { toast.error("Could not load any tracks"); return; }

    // Load first track to current deck
    handleLoadTrack(valid[0]);

    // Add remaining tracks to queue
    if (valid.length > 1) {
      const queueItems = valid.slice(1).map(t => ({
        url: t.stream_url,
        title: t.title,
        artist: t.artist,
        genre: t.genre,
        bpm: t.bpm,
      }));
      setQueue(queueItems);
      setShowQueue(true);
      toast.info(`Playlist loaded: 1 track on Deck ${loadTarget}, ${queueItems.length} queued`);
    }
  };

  // Add-to-playlist flow
  const handleAddToPlaylist = async (track) => {
    setAddToPlaylistTrack(track);
    try {
      const pls = await apiFetch("/music/playlists");
      setUserPlaylists(Array.isArray(pls) ? pls : []);
    } catch {}
    setShowPlaylistPicker(true);
  };

  const confirmAddToPlaylist = async (playlistId) => {
    if (!addToPlaylistTrack) return;
    try {
      await apiFetch(`/music/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ track_id: addToPlaylistTrack.id }),
      });
    } catch (e) { console.error(e); }
    setShowPlaylistPicker(false);
    setAddToPlaylistTrack(null);
  };

  const MODE_TITLES = {
    classic: "🎛️ Classic Decks",
    video: "🎬 Video DJ",
    auto: "🤖 Auto Playlist",
    pro: "⚡ Advanced Pro Layout",
  };

  // ── Start LIVE session on mount, stop on unmount ──
  useEffect(() => {
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;

    const startSession = async () => {
      try {
        const data = await apiFetch("/bookings/sessions/start", { method: "POST" });
        if (data?.session) {
          setLiveSession(data.session);
          setSession(data.session);
          toast.success("LIVE session started");
        }
      } catch (e) { console.warn("Session start failed:", e); }
    };
    startSession();

    return () => {
      // Stop session when leaving mixer
      apiFetch("/bookings/sessions/stop", { method: "POST" }).catch(() => {});
      disconnectSocket();
    };
  }, []);

  // ── Join Socket.IO room as DJ ──
  useEffect(() => {
    const user = useDJStore.getState().currentDJ;
    const identity = user?.username || "dj-" + Date.now();
    joinRoom("dj-room", identity, "dj");
  }, []);

  // ── Listen for song requests from listeners ──
  useEffect(() => {
    const socket = getSocket();

    const handleRequest = (request) => {
      setSongRequests(prev => [...prev.slice(-30), request]);
      // Notification toast
      toast.info(`🎵 Song request: "${request.title}"${request.artist ? ` by ${request.artist}` : ""}`);
      // Play notification sound
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(g).connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      } catch (_) {}
    };

    socket.on("song-request", handleRequest);
    return () => { socket.off("song-request", handleRequest); };
  }, []);

  // ── Poll active session info ──
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await apiFetch("/bookings/sessions/my-active");
        if (s) setLiveSession(s);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => clearInterval(iv);
  }, []);

  // ── Session elapsed timer (ticks every second) ──
  useEffect(() => {
    if (!liveSession?.started_at) return;

    const tick = () => {
      const started = new Date(liveSession.started_at).getTime();
      const now = Date.now();
      setSessionElapsed(Math.floor((now - started) / 1000));

      // Countdown: if there's a booked end time
      if (liveSession.scheduled_end) {
        const end = new Date(liveSession.scheduled_end).getTime();
        const remain = Math.max(0, Math.floor((end - now) / 1000));
        setCountdownSec(remain);
      } else {
        setCountdownSec(null);
      }
    };

    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [liveSession]);

  const fmtTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };

  const handleBack = async () => {
    try { await apiFetch("/bookings/sessions/stop", { method: "POST" }); } catch {}
    if (onBack) onBack();
  };

  const updateCross = (value) => {
    setCross(value);
    setAudioCrossfader(value);
    emitCrossfader(value);
  };

  const updateMasterVol = (v) => {
    setMasterVol(v);
    try { getMasterGain().gain.value = v / 100; } catch {}
  };

  // ── BPM Detection callback from Deck ──
  const handleBpmDetect = useCallback((deckName, detectedBpm) => {
    setDeckBpms(prev => ({ ...prev, [deckName]: detectedBpm }));
  }, []);

  // ── Beat Phase Meter: compute sync quality between A and B ──
  const getPhaseSync = () => {
    const bpmA = deckBpms.A;
    const bpmB = deckBpms.B;
    if (!bpmA || !bpmB) return { percent: 0, label: "—", color: "#555" };
    const ratio = Math.min(bpmA, bpmB) / Math.max(bpmA, bpmB);
    const rateA = deckRates.A;
    const rateB = deckRates.B;
    const effectiveA = bpmA * rateA;
    const effectiveB = bpmB * rateB;
    const effectiveRatio = Math.min(effectiveA, effectiveB) / Math.max(effectiveA, effectiveB);
    const percent = Math.round(effectiveRatio * 100);
    let label, color;
    if (percent >= 99) { label = "LOCKED"; color = "#00ff88"; }
    else if (percent >= 95) { label = "Close"; color = "#88ff00"; }
    else if (percent >= 90) { label = "Near"; color = "#ffdd00"; }
    else if (percent >= 80) { label = "Off"; color = "#ff9800"; }
    else { label = "Far"; color = "#ff3366"; }
    return { percent, label, color, effectiveA: Math.round(effectiveA), effectiveB: Math.round(effectiveB) };
  };

  // ── BPM Sync: match deck B's tempo to deck A ──
  const syncBpm = useCallback((target = "B") => {
    const src = target === "B" || target === "D" ? "A" : "B";
    const srcBpm = deckBpms[src];
    const tgtBpm = deckBpms[target];
    if (!srcBpm || !tgtBpm || srcBpm === tgtBpm) return;
    const rate = srcBpm / tgtBpm;
    // Clamp to reasonable range 0.5x – 2.0x
    const clamped = Math.max(0.5, Math.min(2.0, rate));
    setDeckRates(prev => ({ ...prev, [target]: clamped }));
    toast.info(`Deck ${target} synced → ${srcBpm} BPM (${(clamped * 100).toFixed(0)}% speed)`);
  }, [deckBpms]);

  const resetSync = (deckName) => {
    setDeckRates(prev => ({ ...prev, [deckName]: 1 }));
  };

  // ── Crossfader Curve Change ──
  const handleCurveChange = (curve) => {
    setCrossCurve(curve);
    setCrossfaderCurve(curve);
    toast.info(`Crossfader curve: ${curve}`);
  };

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKey = (e) => {
      // Don't capture when typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

      switch (e.key) {
        case "ArrowLeft":  updateCross(Math.max(0, crossRef.current - 5)); break;
        case "ArrowRight": updateCross(Math.min(100, crossRef.current + 5)); break;
        case "ArrowUp":    updateMasterVol(Math.min(100, masterVol + 5)); break;
        case "ArrowDown":  updateMasterVol(Math.max(0, masterVol - 5)); break;
        case " ":          e.preventDefault(); aiCrossfade(); break; // Space = AI crossfade
        case "q":          setAutoQueue(prev => !prev); break;
        case "g":          setGestureMode(prev => !prev); break;
        case "l":          setLibraryOpen(prev => !prev); break;
        case "j":          setShowJogWheels(prev => !prev); break;
        case "?":          setShowShortcuts(prev => !prev); break;
        default: break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [masterVol]);

  // ── Gesture Control (from gesture-control-mixer) ──
  useEffect(() => {
    if (!gestureMode) return;

    let dragging = false;
    const onDown = () => { dragging = true; };
    const onUp = () => { dragging = false; };
    const onMove = (e) => {
      if (!dragging || !gestureRef.current) return;
      const x = e.clientX / window.innerWidth;
      const val = Math.round(x * 100);
      updateCross(Math.max(0, Math.min(100, val)));
      setCross(Math.max(0, Math.min(100, val)));
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
    };
  }, [gestureMode]);

  useEffect(() => { gestureRef.current = gestureMode; }, [gestureMode]);
  useEffect(() => { crossRef.current = cross; }, [cross]);

  // ── Webcam Hand Tracking (from webcam-handtracking-mixer) ──
  useEffect(() => {
    if (!webcamMode) {
      // Cleanup when turning off
      if (webcamCamRef.current) {
        webcamCamRef.current.stop();
        webcamCamRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      setHandDetected(false);
      return;
    }

    let alive = true;

    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results) => {
      if (!alive) return;
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setHandDetected(true);
        const hand = results.multiHandLandmarks[0];
        // Index finger tip = landmark 8, x goes 0→1 (mirrored: left of frame = right hand side)
        const x = hand[8].x;
        const val = Math.round(x * 100);
        const clamped = Math.max(0, Math.min(100, val));
        updateCross(clamped);
        setCross(clamped);
      } else {
        setHandDetected(false);
      }
    });

    const startCamera = async () => {
      try {
        const cam = new Camera(videoRef.current, {
          onFrame: async () => {
            if (alive) await hands.send({ image: videoRef.current });
          },
          width: 320,
          height: 240,
        });
        webcamCamRef.current = cam;
        cam.start();
      } catch (err) {
        console.error("Webcam hand tracking failed:", err);
        setWebcamMode(false);
      }
    };

    startCamera();

    return () => {
      alive = false;
      if (webcamCamRef.current) {
        webcamCamRef.current.stop();
        webcamCamRef.current = null;
      }
      hands.close();
    };
  }, [webcamMode]);

  // ── Auto Playlist Mode — auto crossfade every 30 seconds ──
  useEffect(() => {
    if (mode !== "auto" || !autoPlaying) return;

    const autoFade = () => {
      if (aiActive) return;
      setAiActive(true);
      const startVal = crossRef.current;
      const targetVal = startVal < 50 ? 100 : 0;

      if (transitionStyle === "cut") {
        // Hard cut — instant switch
        updateCross(targetVal);
        setCross(targetVal);
        setAiActive(false);
        return;
      }

      const duration = transitionStyle === "backspin" ? 3000 : 5000;
      const steps = 100;
      const stepTime = duration / steps;
      let step = 0;

      const timer = setInterval(() => {
        step++;
        const progress = step / steps;
        let eased;
        if (transitionStyle === "echo") {
          // Staircase with pauses (echo-fade effect)
          const stair = Math.floor(progress * 5) / 5;
          const sub = (progress * 5) % 1;
          eased = stair + (sub > 0.5 ? (sub - 0.5) * 2 : 0) * 0.2;
        } else if (transitionStyle === "backspin") {
          // Quick pull-back then snap
          eased = progress < 0.3
            ? -0.15 * Math.sin(progress / 0.3 * Math.PI)
            : (progress - 0.3) / 0.7;
        } else {
          // smooth ease-in-out
          eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        }
        const val = Math.round(startVal + (targetVal - startVal) * Math.max(0, Math.min(1, eased)));
        updateCross(val);
        setCross(val);
        if (step >= steps) {
          clearInterval(timer);
          updateCross(targetVal);
          setCross(targetVal);
          setAiActive(false);
        }
      }, stepTime);
    };

    const interval = setInterval(autoFade, 30000);
    const firstFade = setTimeout(autoFade, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(firstFade);
    };
  }, [mode, autoPlaying, transitionStyle]);

  // AI Smart Crossfade — gradually transitions from current position to opposite deck over ~5 seconds
  const aiCrossfade = useCallback(() => {
    if (aiActive) return;
    setAiActive(true);

    const startVal = cross;
    const targetVal = startVal < 50 ? 100 : 0; // go to opposite deck
    const duration = 5000; // 5 seconds
    const steps = 100;
    const stepTime = duration / steps;
    let step = 0;

    aiTimerRef.current = setInterval(() => {
      step++;
      const progress = step / steps;
      // Smooth ease-in-out curve
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const val = Math.round(startVal + (targetVal - startVal) * eased);

      updateCross(val);
      setCross(val);

      if (step >= steps) {
        clearInterval(aiTimerRef.current);
        setAiActive(false);
      }
    }, stepTime);
  }, [cross, aiActive]);

  const stopAiCrossfade = () => {
    if (aiTimerRef.current) clearInterval(aiTimerRef.current);
    setAiActive(false);
  };

  return (
    <div ref={mixerPageRef} className={`mixer-page mixer-mode-${mode}${isFullscreen ? " fullscreen" : ""}`}>
      {/* ═══ LIVE Session Bar ═══ */}
      <div className={`live-session-bar ${countdownSec !== null && countdownSec < 600 ? "warning" : ""}`}>
        <span className="live-dot">🔴</span>
        <span className="live-label">LIVE</span>
        <span className="live-elapsed">{fmtTime(sessionElapsed)}</span>
        {liveSession?.pub_name && <span className="live-venue">@ {liveSession.pub_name}</span>}
        <span className="live-listeners" title="Connected listeners">
          {isConnected ? "🟢" : "🔴"} 👥 {listenerCount || 0}
        </span>
        {countdownSec !== null && (
          <span className={`live-countdown ${countdownSec < 600 ? "urgent" : ""}`}>
            ⏱ {fmtTime(countdownSec)} remaining
          </span>
        )}
        {liveSession?.rate && (
          <span className="live-rate">${liveSession.rate}/hr</span>
        )}
      </div>

      {/* ═══ Now Playing Bar ═══ */}
      <div className="now-playing-bar">
        <div className="now-playing-deck">
          <span className="npd-label">A</span>
          <span className="npd-title">{trackMeta.A?.title || "—"}</span>
          <span className="npd-artist">{trackMeta.A?.artist || ""}</span>
          {trackMeta.A?.bpm && <span className="npd-bpm">{trackMeta.A.bpm} BPM</span>}
        </div>
        {(mode === "pro") && (
          <div className="now-playing-deck">
            <span className="npd-label">C</span>
            <span className="npd-title">{trackMeta.C?.title || "—"}</span>
            <span className="npd-artist">{trackMeta.C?.artist || ""}</span>
          </div>
        )}
        <div className="now-playing-vs">⚡</div>
        <div className="now-playing-deck">
          <span className="npd-label">B</span>
          <span className="npd-title">{trackMeta.B?.title || "—"}</span>
          <span className="npd-artist">{trackMeta.B?.artist || ""}</span>
          {trackMeta.B?.bpm && <span className="npd-bpm">{trackMeta.B.bpm} BPM</span>}
        </div>
        {(mode === "pro") && (
          <div className="now-playing-deck">
            <span className="npd-label">D</span>
            <span className="npd-title">{trackMeta.D?.title || "—"}</span>
            <span className="npd-artist">{trackMeta.D?.artist || ""}</span>
          </div>
        )}
      </div>

      <div className="mixer-header">
        {onBack && <button className="deck-btn back-btn" onClick={handleBack}>← Dashboard</button>}
        <h1 className="page-title">{MODE_TITLES[mode] || "🎚️ DJ Mixer"}</h1>
        {mode === "auto" && (
          <button
            className={`deck-btn ${autoPlaying ? "active" : ""}`}
            onClick={() => setAutoPlaying(!autoPlaying)}
          >
            {autoPlaying ? "⏸ Pause Auto" : "▶ Auto Mix"}
          </button>
        )}
        {mode === "auto" && (
          <div className="transition-style-picker">
            {["smooth", "cut", "echo", "backspin"].map(s => (
              <button key={s} className={`ts-btn ${transitionStyle === s ? "active" : ""}`}
                onClick={() => setTransitionStyle(s)}>
                {s === "smooth" ? "〰️" : s === "cut" ? "✂️" : s === "echo" ? "🔊" : "🔄"} {s}
              </button>
            ))}
          </div>
        )}
        <button
          className={`deck-btn library-toggle-btn ${libraryOpen ? "active" : ""}`}
          onClick={() => setLibraryOpen(!libraryOpen)}
        >
          {libraryOpen ? "✕ Close Library" : "☁️ Music Library"}
        </button>
        <button className={`deck-btn fullscreen-btn ${isFullscreen ? "active" : ""}`} onClick={toggleFullscreen}
          title="Toggle fullscreen (F)">
          {isFullscreen ? "⬜ Exit Fullscreen" : "⛶ Fullscreen"}
        </button>
        <button className="deck-btn popout-btn" onClick={() => popOutPanel("fx-panel", "FX Panel", 400, 350)}
          title="Pop out FX panel to separate window">🪟 Pop FX</button>
        <button className="deck-btn popout-btn" onClick={() => popOutPanel("chat-panel", "Live Chat", 400, 500)}
          title="Pop out chat to separate window">🪟 Pop Chat</button>
        <button className="deck-btn popout-btn" onClick={() => popOutPanel("queue-panel", "Track Queue", 400, 500)}
          title="Pop out queue to separate window">🪟 Pop Queue</button>
      </div>

      {/* ═══ Cloud Music Library Panel ═══ */}
      {libraryOpen && (
        <div className="mixer-library-panel">
          <div className="mlp-tabs">
            <button className={`mlp-tab ${libraryTab === "browse" ? "active" : ""}`}
              onClick={() => setLibraryTab("browse")}>🎵 Browse</button>
            <button className={`mlp-tab ${libraryTab === "playlists" ? "active" : ""}`}
              onClick={() => setLibraryTab("playlists")}>📋 Playlists</button>
            <div className="mlp-deck-target">
              Load to Deck:
              {(mode === "pro" ? ["A","B","C","D"] : ["A","B"]).map(d => (
                <button key={d}
                  className={`mlp-deck-btn ${loadTarget === d ? "active" : ""}`}
                  onClick={() => setLoadTarget(d)}>{d}</button>
              ))}
            </div>
          </div>
          {libraryTab === "browse" && (
            <MusicLibrary
              compact
              onLoadTrack={handleLoadTrack}
              onAddToPlaylist={handleAddToPlaylist}
              onAddToQueue={addToQueue}
            />
          )}
          {libraryTab === "playlists" && (
            <PlaylistBuilder
              onLoadTrack={handleLoadTrack}
              onLoadPlaylist={handleLoadPlaylist}
            />
          )}
        </div>
      )}

      {/* Playlist picker modal */}
      {showPlaylistPicker && (
        <div className="playlist-picker-overlay" onClick={() => setShowPlaylistPicker(false)}>
          <div className="playlist-picker-modal" onClick={e => e.stopPropagation()}>
            <h3>Add "{addToPlaylistTrack?.title}" to playlist</h3>
            {userPlaylists.length === 0 && <p>No playlists. Create one first!</p>}
            {userPlaylists.map(pl => (
              <button key={pl.id} className="playlist-picker-item"
                onClick={() => confirmAddToPlaylist(pl.id)}>
                {pl.name} ({pl.track_count} tracks)
              </button>
            ))}
            <button className="deck-btn" style={{marginTop: 12}} onClick={() => setShowPlaylistPicker(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Webcam feed — always mounted so MediaPipe Camera can attach; hidden when off */}
      <video ref={videoRef} autoPlay muted playsInline style={{ display: "none" }} />

      {/* Webcam hand tracking overlay (Video DJ + explicit toggle) */}
      {webcamMode && (
        <div className="webcam-container">
          <canvas id="webcam-mirror" width="320" height="240" className="webcam-feed" />
          <div className="webcam-status">
            {handDetected
              ? "✋ Hand detected — move index finger left/right"
              : "👀 Waiting for hand..."}
          </div>
        </div>
      )}

      {/* ═══ CLASSIC: 2 Decks ═══ */}
      {(mode === "classic" || mode === "auto") && (
        <div className="decks-container">
          <Deck name="A" audioSrc={trackA} onTrackEnd={() => handleTrackEnd("A")} onBpmDetect={handleBpmDetect} playbackRate={deckRates.A} trackTitle={trackMeta.A?.title} trackArtist={trackMeta.A?.artist} isMuted={isEffectivelyMuted("A")} isSolo={deckSolos.A} onToggleMute={() => toggleMute("A")} onToggleSolo={() => toggleSolo("A")} />
          <Deck name="B" audioSrc={trackB} onTrackEnd={() => handleTrackEnd("B")} onBpmDetect={handleBpmDetect} playbackRate={deckRates.B} trackTitle={trackMeta.B?.title} trackArtist={trackMeta.B?.artist} isMuted={isEffectivelyMuted("B")} isSolo={deckSolos.B} onToggleMute={() => toggleMute("B")} onToggleSolo={() => toggleSolo("B")} />
        </div>
      )}

      {/* ═══ VIDEO DJ: 2 Decks + Video Controls ═══ */}
      {mode === "video" && (
        <>
          <div className="decks-container">
            <Deck name="A" audioSrc={trackA} onTrackEnd={() => handleTrackEnd("A")} onBpmDetect={handleBpmDetect} playbackRate={deckRates.A} trackTitle={trackMeta.A?.title} trackArtist={trackMeta.A?.artist} isMuted={isEffectivelyMuted("A")} isSolo={deckSolos.A} onToggleMute={() => toggleMute("A")} onToggleSolo={() => toggleSolo("A")} />
            <Deck name="B" audioSrc={trackB} onTrackEnd={() => handleTrackEnd("B")} onBpmDetect={handleBpmDetect} playbackRate={deckRates.B} trackTitle={trackMeta.B?.title} trackArtist={trackMeta.B?.artist} isMuted={isEffectivelyMuted("B")} isSolo={deckSolos.B} onToggleMute={() => toggleMute("B")} onToggleSolo={() => toggleSolo("B")} />
          </div>
          <div className="video-controls-panel">
            <h3 className="video-panel-title">🎥 Video Controls</h3>
            <div className="video-fx-grid">
              <button className="deck-btn" onClick={() => setWebcamMode(!webcamMode)}>
                {webcamMode ? "📹 Webcam ON" : "📹 Enable Webcam"}
              </button>
              <button className={`deck-btn ${gestureMode ? "active" : ""}`}
                onClick={() => { setGestureMode(!gestureMode); if (webcamMode) setWebcamMode(false); }}>
                {gestureMode ? "✋ Gesture ON" : "✋ Gesture Mode"}
              </button>
              <select className="track-select" onChange={e => setTrackA(e.target.value)} value={trackA}>
                {TRACKS.map((t, i) => <option key={i} value={t}>Track {i + 1}</option>)}
              </select>
              <select className="track-select" onChange={e => setTrackB(e.target.value)} value={trackB}>
                {TRACKS.map((t, i) => <option key={i} value={t}>Track {i + 1}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {/* ═══ PRO: Hardware Controller Layout (Pioneer-style) ═══ */}
      {mode === "pro" && (
        <div className="hw-controller">
          {/* ── Top Screen: Waveforms + Deck Info ── */}
          <div className="hw-screen">
            <div className="hw-screen-half">
              {["A", "C"].map(d => (
                <div key={d} style={{ display: leftDeck === d ? "block" : "none" }}>
                  <Deck name={d} audioSrc={deckSrcs[d]} onTrackEnd={() => handleTrackEnd(d)} onBpmDetect={handleBpmDetect} playbackRate={deckRates[d]} trackTitle={trackMeta[d]?.title} trackArtist={trackMeta[d]?.artist} isMuted={isEffectivelyMuted(d)} isSolo={deckSolos[d]} onToggleMute={() => toggleMute(d)} onToggleSolo={() => toggleSolo(d)} />
                </div>
              ))}
            </div>
            <div className="hw-screen-half">
              {["B", "D"].map(d => (
                <div key={d} style={{ display: rightDeck === d ? "block" : "none" }}>
                  <Deck name={d} audioSrc={deckSrcs[d]} onTrackEnd={() => handleTrackEnd(d)} onBpmDetect={handleBpmDetect} playbackRate={deckRates[d]} trackTitle={trackMeta[d]?.title} trackArtist={trackMeta[d]?.artist} isMuted={isEffectivelyMuted(d)} isSolo={deckSolos[d]} onToggleMute={() => toggleMute(d)} onToggleSolo={() => toggleSolo(d)} />
                </div>
              ))}
            </div>
          </div>

          {/* ── Left Deck Unit: Layer select + Jog Wheel ── */}
          <div className="hw-deck-unit hw-deck-left">
            <div className="hw-layer-buttons">
              <button className={`hw-layer-btn ${leftDeck === "A" ? "active" : ""}`} onClick={() => setLeftDeck("A")}>DECK A</button>
              <button className={`hw-layer-btn ${leftDeck === "C" ? "active" : ""}`} onClick={() => setLeftDeck("C")}>DECK C</button>
            </div>
            <JogWheel deckName={leftDeck} bpm={deckBpms[leftDeck] || 120} trackTitle={trackMeta[leftDeck]?.title || ""} trackArtist={trackMeta[leftDeck]?.artist || ""} />
          </div>

          {/* ── Center Mixer Strip ── */}
          <div className="hw-mixer-center">
            {/* FX */}
            <div className="hw-fx-section" data-panel="fx-panel">
              <FXPanel />
            </div>

            {/* Master Volume */}
            <div className="hw-master-section">
              <span className="hw-label">MASTER</span>
              <input type="range" min="0" max="100" value={masterVol}
                onChange={e => updateMasterVol(Number(e.target.value))}
                className="hw-master-fader" />
              <span className="hw-vol-value">{masterVol}%</span>
            </div>

            {/* BPM Sync */}
            <div className="hw-bpm-section">
              <span className="hw-label">BPM SYNC</span>
              <div className="hw-bpm-display">
                <span className="hw-bpm-val">{deckBpms[leftDeck] || "--"}</span>
                <span className="hw-bpm-sep">⚡</span>
                <span className="hw-bpm-val">{deckBpms[rightDeck] || "--"}</span>
              </div>
              <div className="hw-sync-btns">
                <button className="hw-btn" onClick={() => syncBpm(rightDeck)} disabled={!deckBpms[leftDeck] || !deckBpms[rightDeck]}>SYNC →</button>
                <button className="hw-btn" onClick={() => syncBpm(leftDeck)} disabled={!deckBpms[leftDeck] || !deckBpms[rightDeck]}>← SYNC</button>
              </div>
              {(deckRates[leftDeck] !== 1 || deckRates[rightDeck] !== 1) && (
                <button className="hw-btn" style={{width:"100%"}} onClick={() => { resetSync(leftDeck); resetSync(rightDeck); }}>RESET</button>
              )}
            </div>

            {/* Beat Phase */}
            {(() => {
              const phase = getPhaseSync();
              return (
                <div className="hw-phase">
                  <div className="hw-phase-bar">
                    <div className="hw-phase-fill" style={{ width: `${phase.percent}%`, background: phase.color }} />
                  </div>
                  <span className="hw-phase-text" style={{ color: phase.color }}>{phase.label}</span>
                </div>
              );
            })()}

            {/* Crossfader Curve */}
            <div className="hw-curve-section">
              <span className="hw-label">CURVE</span>
              <div className="hw-curve-btns">
                {["smooth", "linear", "cut"].map(c => (
                  <button key={c} className={`hw-curve-btn ${crossCurve === c ? "active" : ""}`}
                    onClick={() => handleCurveChange(c)}>
                    {c === "smooth" ? "~" : c === "linear" ? "/" : "▌"}
                  </button>
                ))}
              </div>
            </div>

            {/* Crossfader */}
            <div className="hw-crossfader-section">
              <span className="hw-label">CROSSFADER</span>
              <div className="hw-xfader-track">
                <span className="hw-xf-label">{leftDeck}</span>
                <input type="range" min="0" max="100" value={cross}
                  onChange={e => updateCross(Number(e.target.value))}
                  className="hw-crossfader" />
                <span className="hw-xf-label">{rightDeck}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="hw-actions">
              <button className={`hw-btn ${aiActive ? "active" : ""}`}
                onClick={aiActive ? stopAiCrossfade : aiCrossfade}>
                {aiActive ? "⏹ STOP" : "🤖 AI MIX"}
              </button>
              <button className={`hw-btn ${autoQueue ? "active" : ""}`}
                onClick={() => setAutoQueue(!autoQueue)}>
                {autoQueue ? "🔁 ON" : "🔁 OFF"}
              </button>
            </div>

            {/* Panel Toggles */}
            <div className="hw-toggles">
              <button className={`hw-btn ${showQueue ? "active" : ""}`} onClick={() => setShowQueue(!showQueue)}>
                📋 {queue.length > 0 ? `(${queue.length})` : ""}
              </button>
              <button className={`hw-btn ${showSampler ? "active" : ""}`} onClick={() => setShowSampler(!showSampler)}>
                🎹
              </button>
              <button className={`hw-btn ${showRequests ? "active" : ""}`} onClick={() => setShowRequests(!showRequests)}>
                🎵 {songRequests.length > 0 ? `(${songRequests.length})` : ""}
              </button>
            </div>
          </div>

          {/* ── Right Deck Unit: Layer select + Jog Wheel ── */}
          <div className="hw-deck-unit hw-deck-right">
            <div className="hw-layer-buttons">
              <button className={`hw-layer-btn ${rightDeck === "B" ? "active" : ""}`} onClick={() => setRightDeck("B")}>DECK B</button>
              <button className={`hw-layer-btn ${rightDeck === "D" ? "active" : ""}`} onClick={() => setRightDeck("D")}>DECK D</button>
            </div>
            <JogWheel deckName={rightDeck} bpm={deckBpms[rightDeck] || 120} trackTitle={trackMeta[rightDeck]?.title || ""} trackArtist={trackMeta[rightDeck]?.artist || ""} />
          </div>
        </div>
      )}

      {/* ═══ Crossfader (non-pro modes — pro uses hardware layout) ═══ */}
      {mode !== "pro" && <div className="crossfader-section">
        <h3>🎛️ Crossfader</h3>
        <div className="crossfader-labels">
          <span>A</span>
          <input
            type="range"
            min="0"
            max="100"
            value={cross}
            onChange={e => updateCross(Number(e.target.value))}
            className="crossfader"
          />
          <span>B</span>
        </div>

        <div className="ai-crossfade-section">
          <button
            className={`deck-btn ai-crossfade-btn ${aiActive ? "active" : ""}`}
            onClick={aiActive ? stopAiCrossfade : aiCrossfade}
          >
            {aiActive ? "⏹ Stop AI Crossfade" : "🤖 AI Smart Crossfade"}
          </button>
          <button
            className={`deck-btn ${autoQueue ? "active" : ""}`}
            onClick={() => setAutoQueue(!autoQueue)}
          >
            {autoQueue ? "🔁 Auto-Queue ON" : "🔁 Auto-Queue"}
          </button>
          <button
            className={`deck-btn ${showQueue ? "active" : ""}`}
            onClick={() => setShowQueue(!showQueue)}
          >
            📋 Queue {queue.length > 0 ? `(${queue.length})` : ""}
          </button>
          <button
            className={`deck-btn ${showSampler ? "active" : ""}`}
            onClick={() => setShowSampler(!showSampler)}
          >
            🎹 Sampler
          </button>
          <button
            className={`deck-btn ${showJogWheels ? "active" : ""}`}
            onClick={() => setShowJogWheels(!showJogWheels)}
          >
            💿 Jog Wheels
          </button>
          <button
            className="deck-btn"
            onClick={popOutJogWheels}
            title="Pop out jog wheels for multi-screen"
          >
            🖥️ Pop Out Jogs
          </button>
          <button
            className={`deck-btn ${showRequests ? "active" : ""}`}
            onClick={() => setShowRequests(!showRequests)}
          >
            🎵 Requests {songRequests.length > 0 ? `(${songRequests.length})` : ""}
          </button>
          {mode !== "video" && (
            <button
              className={`deck-btn ${gestureMode ? "active" : ""}`}
              onClick={() => { setGestureMode(!gestureMode); if (webcamMode) setWebcamMode(false); }}
            >
              {gestureMode ? "✋ Gesture ON" : "✋ Gesture Control"}
            </button>
          )}
          {mode !== "video" && (
            <button
              className={`deck-btn ${webcamMode ? "active" : ""}`}
              onClick={() => { setWebcamMode(!webcamMode); if (gestureMode) setGestureMode(false); }}
            >
              {webcamMode ? "📹 Webcam ON" : "📹 Hand Tracking"}
            </button>
          )}
          {aiActive && <span className="ai-status">Transitioning to Deck {cross < 50 ? "B" : "A"}...</span>}
          {gestureMode && <span className="ai-status">Drag mouse left/right to control crossfader</span>}
          {webcamMode && <span className="ai-status">{handDetected ? "Index finger controlling crossfader" : "Show your hand to the camera..."}</span>}
          {mode === "auto" && autoPlaying && <span className="ai-status">🤖 Auto-mix active — crossfade every 30s</span>}
        </div>

        {/* Master Volume */}
        <div className="master-volume-section">
          <label className="master-vol-label">🔊 Master: {masterVol}%</label>
          <input type="range" min="0" max="100" value={masterVol}
            onChange={e => updateMasterVol(Number(e.target.value))}
            className="master-volume-slider" />
        </div>

        {/* BPM Sync + Crossfader Curve */}
        <div className="mixer-sync-bar">
          <div className="bpm-sync-section">
            <span className="sync-label">🔄 BPM Sync</span>
            <span className="sync-bpm-display">A: {deckBpms.A || "--"}</span>
            <span className="sync-bpm-display">B: {deckBpms.B || "--"}</span>
            <button className="deck-btn small-sync-btn" onClick={() => syncBpm("B")} disabled={!deckBpms.A || !deckBpms.B}>
              Sync B→A
            </button>
            <button className="deck-btn small-sync-btn" onClick={() => syncBpm("A")} disabled={!deckBpms.A || !deckBpms.B}>
              Sync A→B
            </button>
            {(deckRates.A !== 1 || deckRates.B !== 1) && (
              <button className="deck-btn small-sync-btn" onClick={() => { resetSync("A"); resetSync("B"); }}>
                Reset
              </button>
            )}
          </div>

          {/* Beat Phase Meter */}
          {(() => {
            const phase = getPhaseSync();
            return (
              <div className="beat-phase-meter">
                <span className="bpm-label">⚡ Phase</span>
                <div className="phase-bar-track">
                  <div className="phase-bar-fill" style={{ width: `${phase.percent}%`, background: phase.color }} />
                </div>
                <span className="phase-percent" style={{ color: phase.color }}>{phase.percent}%</span>
                <span className="phase-label" style={{ color: phase.color }}>{phase.label}</span>
                {phase.effectiveA && (
                  <span className="phase-effective">A:{phase.effectiveA} B:{phase.effectiveB}</span>
                )}
              </div>
            );
          })()}

          <div className="curve-section">
            <span className="sync-label">📈 Curve</span>
            {["smooth", "linear", "cut"].map(c => (
              <button key={c} className={`deck-btn curve-btn ${crossCurve === c ? "active" : ""}`}
                onClick={() => handleCurveChange(c)}>
                {c === "smooth" ? "~" : c === "linear" ? "/" : "▌"}
                <span className="curve-btn-label">{c}</span>
              </button>
            ))}
          </div>
        </div>
      </div>}

      {/* ═══ Track Queue Panel ═══ */}
      {showQueue && (
        <div data-panel="queue-panel">
          <TrackQueue
            queue={queue}
            onRemove={removeFromQueue}
            onReorder={reorderQueue}
            onClear={clearQueue}
          />
        </div>
      )}

      {/* ═══ Sampler Pad ═══ */}
      {showSampler && <SamplerPad />}

      {/* ═══ Inline Jog Wheels ═══ */}
      {showJogWheels && (
        <div className="jw-inline-row" data-panel="jogwheels-panel">
          {(mode === "pro" ? ["A", "B", "C", "D"] : ["A", "B"]).map(d => (
            <JogWheel
              key={d}
              deckName={d}
              bpm={deckBpms[d] || 120}
              trackTitle={trackMeta[d]?.title || ""}
              trackArtist={trackMeta[d]?.artist || ""}
            />
          ))}
        </div>
      )}

      {/* ═══ Song Requests Panel ═══ */}
      {showRequests && (
        <div className="song-requests-panel">
          <div className="srp-header">
            <h3>🎵 Song Requests</h3>
            {songRequests.length > 0 && (
              <button className="deck-btn small-btn" onClick={() => setSongRequests([])}>Clear All</button>
            )}
          </div>
          {songRequests.length === 0 ? (
            <p className="srp-empty">No requests yet. Listeners can request songs from the PubListener page.</p>
          ) : (
            <div className="srp-list">
              {songRequests.map((r) => (
                <div key={r.id} className="srp-item">
                  <div className="srp-info">
                    <span className="srp-song">{r.title}</span>
                    {r.artist && <span className="srp-artist">{r.artist}</span>}
                    <span className="srp-from">from {r.from}</span>
                  </div>
                  <div className="srp-actions">
                    <button className="deck-btn small-btn srp-accept" onClick={() => {
                      emitRequestResponse(r.id, "accepted");
                      setSongRequests(prev => prev.filter(x => x.id !== r.id));
                      toast.info(`Accepted: "${r.title}"`);
                    }}>✓</button>
                    <button className="deck-btn small-btn srp-dismiss" onClick={() => {
                      emitRequestResponse(r.id, "dismissed");
                      setSongRequests(prev => prev.filter(x => x.id !== r.id));
                    }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Recorder + Chat ═══ */}
      <div className="mixer-bottom-bar">
        <MixRecorder />
        <div data-panel="chat-panel"><LiveChat /></div>
      </div>

      {/* Keyboard shortcuts help */}
      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
            <h3>⌨️ Keyboard Shortcuts</h3>
            <div className="shortcut-grid">
              <span className="shortcut-key">← / →</span><span>Crossfader left/right</span>
              <span className="shortcut-key">↑ / ↓</span><span>Master volume up/down</span>
              <span className="shortcut-key">Space</span><span>AI Smart Crossfade</span>
              <span className="shortcut-key">Q</span><span>Toggle Auto-Queue</span>
              <span className="shortcut-key">G</span><span>Toggle Gesture Mode</span>
              <span className="shortcut-key">L</span><span>Toggle Music Library</span>
              <span className="shortcut-key">J</span><span>Toggle Jog Wheels</span>
              <span className="shortcut-key">?</span><span>Show/hide this help</span>
              <span className="shortcut-key">F</span><span>Toggle fullscreen</span>
            </div>
            <button className="deck-btn" style={{marginTop: 12}} onClick={() => setShowShortcuts(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
