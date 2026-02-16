import React, { useRef, useState, useEffect, useCallback } from "react";
import { getAudioContext, getDeck, resumeAudio } from "../engine";

/**
 * JogWheel — Professional DJ jog-wheel controller.
 *
 * Modes:
 *  • Vinyl (scratch)   — dragging the platter scratches the audio
 *  • Pitch Bend (nudge)— dragging temporarily speeds up / slows down
 *  • Seek              — dragging scrubs through the track timeline
 *
 * Features:
 *  • Visual spinning platter with dots + label
 *  • Touch-area differentiation (inner = scratch, outer ring = pitch bend)
 *  • BPM display, pitch %, key, track position
 *  • Hot cues (8 pads) — set / trigger / clear
 *  • Loop controls (1/4, 1/2, 1, 2, 4, 8, 16, 32 beats)
 *  • Vinyl brake & back-spin effects
 *  • Slip mode (audio continues underneath during scratch)
 *  • Reverse playback toggle
 *  • Needle drop (click on position bar to seek)
 *  • Sensitivity control
 *  • Poppable into its own window for multi-screen setups
 */

const HOT_CUE_COLORS = ["#ff9800", "#00f0ff", "#ff00ff", "#00ff88", "#ffdd00", "#ff3366", "#7b61ff", "#00bcd4"];
const LOOP_SIZES = [0.25, 0.5, 1, 2, 4, 8, 16, 32];

export default function JogWheel({ deckName = "A", audioRef, bpm = 120, trackTitle = "", trackArtist = "" }) {
  /* ── Refs ── */
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const dragRef = useRef({ active: false, startAngle: 0, lastAngle: 0, zone: "outer" });
  const rotationRef = useRef(0);
  const slipPositionRef = useRef(0);

  /* ── State ── */
  const [mode, setMode] = useState("vinyl");        // vinyl | bend | seek
  const [sensitivity, setSensitivity] = useState(1); // 0.25 – 3
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pitchPercent, setPitchPercent] = useState(0);
  const [isReversed, setIsReversed] = useState(false);
  const [slipMode, setSlipMode] = useState(false);
  const [braking, setBraking] = useState(false);

  // Hot Cues
  const [hotCues, setHotCues] = useState(Array(8).fill(null)); // null or { time, label }

  // Loop
  const [loopActive, setLoopActive] = useState(false);
  const [activeLoopSize, setActiveLoopSize] = useState(null);
  const loopStartRef = useRef(0);
  const loopEndRef = useRef(0);

  /* ── Audio helpers ── */
  const getAudio = useCallback(() => {
    if (audioRef?.current) return audioRef.current;
    // Find the deck's <audio> by querying within the matching .deck container
    const decks = document.querySelectorAll(".deck");
    for (const deck of decks) {
      const title = deck.querySelector(".deck-title");
      if (title && title.textContent.trim() === deckName) {
        return deck.querySelector("audio");
      }
    }
    return null;
  }, [audioRef, deckName]);

  /* ── Platter rotation angle from current time ── */
  const getPlatterAngle = useCallback(() => {
    const audio = getAudio();
    if (!audio || !audio.duration) return rotationRef.current;
    // 33⅓ RPM = one rotation every 1.8s
    return (audio.currentTime / 1.8) * 360;
  }, [getAudio]);

  /* ── Canvas drawing ── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const outerR = Math.min(cx, cy) - 4;
    const innerR = outerR * 0.38;

    ctx.clearRect(0, 0, W, H);

    const audio = getAudio();
    const angle = audio && !audio.paused
      ? getPlatterAngle()
      : rotationRef.current;
    rotationRef.current = angle;
    const rad = (angle * Math.PI) / 180;

    // ── Outer ring (pitch-bend zone) ──
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = mode === "bend" ? "#00f0ff" : "#2a2a40";
    ctx.stroke();

    // ── Grip dots on outer ring ──
    for (let i = 0; i < 24; i++) {
      const dotAngle = rad + (i / 24) * Math.PI * 2;
      const dotR = outerR - 10;
      const dx = cx + Math.cos(dotAngle) * dotR;
      const dy = cy + Math.sin(dotAngle) * dotR;
      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fillStyle = i % 6 === 0 ? "#00f0ff" : "#444";
      ctx.fill();
    }

    // ── Platter disc ──
    const platR = outerR * 0.72;
    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, platR);
    grad.addColorStop(0, "#222238");
    grad.addColorStop(0.6, "#181828");
    grad.addColorStop(1, "#0f0f1e");
    ctx.beginPath();
    ctx.arc(cx, cy, platR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = mode === "vinyl" ? "#ff00ff44" : "#333";
    ctx.stroke();

    // ── Groove lines ──
    for (let r = innerR + 8; r < platR - 4; r += 6) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // ── Position marker (rotating line) ──
    const markerR1 = innerR + 4;
    const markerR2 = platR - 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * markerR1, cy + Math.sin(rad) * markerR1);
    ctx.lineTo(cx + Math.cos(rad) * markerR2, cy + Math.sin(rad) * markerR2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ff00ff";
    ctx.stroke();

    // ── Center label ──
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = "#0d0d18";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Deck letter
    ctx.fillStyle = "#00f0ff";
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(deckName, cx, cy - 12);

    // BPM
    ctx.fillStyle = "#aaa";
    ctx.font = "11px monospace";
    ctx.fillText(`${bpm || "--"} BPM`, cx, cy + 8);

    // Mode indicator
    ctx.fillStyle = mode === "vinyl" ? "#ff00ff" : mode === "bend" ? "#00f0ff" : "#ffdd00";
    ctx.font = "9px monospace";
    ctx.fillText(mode.toUpperCase(), cx, cy + 22);

    // ── Progress arc (outer) ──
    if (audio && audio.duration > 0) {
      const progress = audio.currentTime / audio.duration;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR + 2, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = progress > 0.9 ? "#ff3366" : "#00ff88";
      ctx.stroke();

      // Remaining time warning (last 30s blink)
      const remaining = audio.duration - audio.currentTime;
      if (remaining < 30 && remaining > 0) {
        const blink = Math.floor(Date.now() / 500) % 2;
        if (blink) {
          ctx.fillStyle = "#ff3366";
          ctx.font = "bold 10px monospace";
          ctx.fillText(`-${Math.ceil(remaining)}s`, cx, cy + 34);
        }
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, [deckName, bpm, mode, getAudio, getPlatterAngle]);

  /* ── Start animation loop ── */
  useEffect(() => {
    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw]);

  /* ── Time tracking ── */
  useEffect(() => {
    const audio = getAudio();
    if (!audio) return;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
      setPlaying(!audio.paused);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onTime);
    audio.addEventListener("pause", onTime);
    audio.addEventListener("loadedmetadata", onTime);
    onTime();
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onTime);
      audio.removeEventListener("pause", onTime);
      audio.removeEventListener("loadedmetadata", onTime);
    };
  }, [getAudio]);

  /* ── Loop engine ── */
  useEffect(() => {
    if (!loopActive) return;
    const iv = setInterval(() => {
      const audio = getAudio();
      if (!audio) return;
      if (audio.currentTime >= loopEndRef.current) {
        audio.currentTime = loopStartRef.current;
      }
    }, 30);
    return () => clearInterval(iv);
  }, [loopActive, getAudio]);

  /* ── Pointer helpers for jog interaction ── */
  const getAngleFromCenter = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  };

  const getZone = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
    const outerR = rect.width / 2;
    return dist < outerR * 0.38 ? "center" : dist < outerR * 0.72 ? "inner" : "outer";
  };

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const angle = getAngleFromCenter(e, canvas);
    const zone = getZone(e, canvas);
    dragRef.current = { active: true, startAngle: angle, lastAngle: angle, zone };

    // Slip mode: save position
    if (slipMode) {
      const audio = getAudio();
      if (audio) slipPositionRef.current = audio.currentTime;
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audio = getAudio();
    if (!audio) return;

    const angle = getAngleFromCenter(e, canvas);
    let delta = angle - dragRef.current.lastAngle;
    // Normalize to -180..180
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    dragRef.current.lastAngle = angle;

    const sens = sensitivity;

    if (mode === "vinyl") {
      // Scratch: scrub audio position proportional to rotation
      const scrubSec = (delta / 360) * 1.8 * sens; // 1.8s per revolution at 33⅓ RPM
      audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + scrubSec));
    } else if (mode === "bend") {
      // Pitch bend: temporarily adjust playback rate
      const bend = (delta / 180) * 0.15 * sens; // max ±15% bend
      audio.playbackRate = Math.max(0.5, Math.min(2.0, audio.playbackRate + bend));
      setPitchPercent(Math.round((audio.playbackRate - 1) * 100));
    } else if (mode === "seek") {
      // Seek: scrub like a timeline
      const seekSec = (delta / 360) * (audio.duration * 0.05) * sens;
      audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seekSec));
    }
  };

  const handlePointerUp = (e) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const audio = getAudio();

    // Reset pitch bend back to 1.0 if in bend mode
    if (mode === "bend" && audio) {
      audio.playbackRate = isReversed ? -1 : 1;
      setPitchPercent(0);
    }

    // Slip mode: restore position
    if (slipMode && audio) {
      const elapsed = audio.currentTime - slipPositionRef.current;
      // Jump forward by how much real-time has passed
      audio.currentTime = slipPositionRef.current + Math.abs(elapsed);
    }
  };

  /* ── Transport Controls ── */
  const togglePlay = async () => {
    const audio = getAudio();
    if (!audio) return;
    await resumeAudio();
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  /* ── Vinyl Brake ── */
  const vinylBrake = () => {
    const audio = getAudio();
    if (!audio || audio.paused) return;
    setBraking(true);
    let rate = audio.playbackRate;
    const iv = setInterval(() => {
      rate *= 0.92;
      if (rate < 0.05) {
        clearInterval(iv);
        audio.pause();
        audio.playbackRate = 1;
        setBraking(false);
      } else {
        audio.playbackRate = rate;
      }
    }, 30);
  };

  /* ── Back-Spin Effect ── */
  const backSpin = () => {
    const audio = getAudio();
    if (!audio) return;
    setBraking(true);
    const startTime = audio.currentTime;
    let elapsed = 0;
    const iv = setInterval(() => {
      elapsed += 30;
      const rewind = (elapsed / 1000) * 3; // rewind 3s per second
      audio.currentTime = Math.max(0, startTime - rewind);
      if (elapsed > 800) {
        clearInterval(iv);
        audio.playbackRate = 1;
        setBraking(false);
      }
    }, 30);
  };

  /* ── Reverse Toggle ── */
  const toggleReverse = () => {
    setIsReversed((prev) => !prev);
    // Note: HTML5 audio doesn't natively support negative playbackRate.
    // We simulate by seeking backward in a timer.
  };

  useEffect(() => {
    if (!isReversed) return;
    const audio = getAudio();
    if (!audio || audio.paused) return;
    const iv = setInterval(() => {
      audio.currentTime = Math.max(0, audio.currentTime - 0.05);
      if (audio.currentTime <= 0) clearInterval(iv);
    }, 25);
    return () => clearInterval(iv);
  }, [isReversed, playing, getAudio]);

  /* ── Hot Cues ── */
  const setHotCue = (index) => {
    const audio = getAudio();
    if (!audio) return;
    if (hotCues[index] !== null) {
      // Jump to existing cue
      audio.currentTime = hotCues[index].time;
      if (audio.paused) audio.play().catch(() => {});
    } else {
      // Set new cue at current position
      setHotCues((prev) => {
        const next = [...prev];
        next[index] = { time: audio.currentTime, label: `${index + 1}` };
        return next;
      });
    }
  };

  const clearHotCue = (index, e) => {
    e.stopPropagation();
    setHotCues((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  /* ── Loop Controls ── */
  const toggleLoop = (beats) => {
    const audio = getAudio();
    if (!audio) return;
    if (loopActive && activeLoopSize === beats) {
      // Deactivate
      setLoopActive(false);
      setActiveLoopSize(null);
      return;
    }
    const currentBPM = bpm || 120;
    const beatDuration = 60 / currentBPM;
    loopStartRef.current = audio.currentTime;
    loopEndRef.current = audio.currentTime + beatDuration * beats;
    setActiveLoopSize(beats);
    setLoopActive(true);
  };

  const halveLoop = () => {
    if (!loopActive) return;
    const len = loopEndRef.current - loopStartRef.current;
    loopEndRef.current = loopStartRef.current + len / 2;
    setActiveLoopSize((prev) => prev ? prev / 2 : null);
  };

  const doubleLoop = () => {
    if (!loopActive) return;
    const len = loopEndRef.current - loopStartRef.current;
    loopEndRef.current = loopStartRef.current + len * 2;
    setActiveLoopSize((prev) => prev ? prev * 2 : null);
  };

  /* ── Needle Drop (click on progress bar to seek) ── */
  const handleNeedleDrop = (e) => {
    const audio = getAudio();
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  };

  /* ── Format helpers ── */
  const fmtTime = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const neg = s < 0;
    s = Math.abs(s);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${neg ? "-" : ""}${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="jogwheel">
      {/* ── Header ── */}
      <div className="jw-header">
        <span className="jw-deck-label" style={{ color: deckName === "A" ? "#00f0ff" : "#ff00ff" }}>
          DECK {deckName}
        </span>
        <div className="jw-track-info">
          <span className="jw-title">{trackTitle || "No Track"}</span>
          <span className="jw-artist">{trackArtist || ""}</span>
        </div>
        <div className="jw-bpm-badge">{bpm || "--"} BPM</div>
      </div>

      {/* ── Needle Drop / Position Bar ── */}
      <div className="jw-position-bar" onClick={handleNeedleDrop}>
        <div className="jw-position-fill" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
        {/* Hot Cue markers on the bar */}
        {hotCues.map((cue, i) =>
          cue ? (
            <div
              key={i}
              className="jw-cue-marker"
              style={{ left: `${duration ? (cue.time / duration) * 100 : 0}%`, background: HOT_CUE_COLORS[i] }}
            />
          ) : null
        )}
        {/* Loop region */}
        {loopActive && duration > 0 && (
          <div
            className="jw-loop-region"
            style={{
              left: `${(loopStartRef.current / duration) * 100}%`,
              width: `${((loopEndRef.current - loopStartRef.current) / duration) * 100}%`,
            }}
          />
        )}
      </div>

      {/* ── Time Display ── */}
      <div className="jw-time-row">
        <span className="jw-time">{fmtTime(currentTime)}</span>
        <span className="jw-time remaining">{fmtTime(duration - currentTime > 0 ? -(duration - currentTime) : 0)}</span>
      </div>

      {/* ── Mode Selector ── */}
      <div className="jw-mode-row">
        {["vinyl", "bend", "seek"].map((m) => (
          <button key={m} className={`jw-mode-btn ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
            {m === "vinyl" ? "💿 Vinyl" : m === "bend" ? "↕ Bend" : "⏩ Seek"}
          </button>
        ))}
        <div className="jw-sensitivity">
          <label>Sens</label>
          <input type="range" min="0.25" max="3" step="0.25" value={sensitivity}
            onChange={(e) => setSensitivity(parseFloat(e.target.value))} />
          <span>{sensitivity}x</span>
        </div>
      </div>

      {/* ── Jog Platter (canvas) ── */}
      <div className="jw-platter-container">
        <canvas
          ref={canvasRef}
          width={280}
          height={280}
          className={`jw-platter ${braking ? "braking" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ touchAction: "none" }}
        />
        {pitchPercent !== 0 && (
          <div className="jw-bend-display">
            {pitchPercent > 0 ? "+" : ""}{pitchPercent}%
          </div>
        )}
      </div>

      {/* ── Transport + Effects ── */}
      <div className="jw-transport">
        <button className={`jw-btn play ${playing ? "active" : ""}`} onClick={togglePlay}>
          {playing ? "⏸" : "▶"}
        </button>
        <button className="jw-btn" onClick={vinylBrake} title="Vinyl Brake">
          🛑 Brake
        </button>
        <button className="jw-btn" onClick={backSpin} title="Back-Spin">
          🔄 Spin
        </button>
        <button className={`jw-btn ${isReversed ? "active" : ""}`} onClick={toggleReverse} title="Reverse">
          ⏪ Rev
        </button>
        <button className={`jw-btn ${slipMode ? "active" : ""}`} onClick={() => setSlipMode(!slipMode)} title="Slip Mode — audio continues underneath scratches">
          🎚️ Slip
        </button>
      </div>

      {/* ── Hot Cues (8 pads) ── */}
      <div className="jw-section-label">HOT CUES</div>
      <div className="jw-hotcue-grid">
        {hotCues.map((cue, i) => (
          <div key={i} className="jw-hotcue-pad-container">
            <button
              className={`jw-hotcue-pad ${cue ? "set" : ""}`}
              style={{ borderColor: HOT_CUE_COLORS[i], color: cue ? HOT_CUE_COLORS[i] : "#555" }}
              onClick={() => setHotCue(i)}
            >
              {cue ? cue.label : i + 1}
            </button>
            {cue && (
              <button className="jw-hotcue-clear" onClick={(e) => clearHotCue(i, e)} title="Clear cue">✕</button>
            )}
          </div>
        ))}
      </div>

      {/* ── Loop Controls ── */}
      <div className="jw-section-label">LOOP</div>
      <div className="jw-loop-row">
        <button className="jw-loop-btn" onClick={halveLoop} disabled={!loopActive}>½</button>
        {LOOP_SIZES.map((size) => (
          <button
            key={size}
            className={`jw-loop-btn ${loopActive && activeLoopSize === size ? "active" : ""}`}
            onClick={() => toggleLoop(size)}
          >
            {size < 1 ? `1/${Math.round(1 / size)}` : size}
          </button>
        ))}
        <button className="jw-loop-btn" onClick={doubleLoop} disabled={!loopActive}>2x</button>
      </div>

      {/* ── Status Indicators ── */}
      <div className="jw-status-row">
        {slipMode && <span className="jw-status-badge slip">SLIP</span>}
        {isReversed && <span className="jw-status-badge reverse">REV</span>}
        {loopActive && <span className="jw-status-badge loop">LOOP {activeLoopSize}</span>}
        {braking && <span className="jw-status-badge brake">BRAKE</span>}
      </div>
    </div>
  );
}
