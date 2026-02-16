import React, { useEffect, useRef, useState, useCallback } from "react";
import { connectDeck, getDeck, getAudioContext, resumeAudio } from "../engine";

export default function Deck({ name, audioSrc, onAnalyser, onTrackEnd, onBpmDetect, playbackRate = 1, trackTitle, trackArtist, isMuted = false, isSolo = false, onToggleMute, onToggleSolo }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const sourceCreated = useRef(false);

  // Keep local refs to per-deck nodes returned by audioEngine
  const deckNodesRef = useRef(null);

  const [volume, setVolume] = useState(75);
  const [playing, setPlaying] = useState(false);

  // Pitch / tempo slider (±8%)
  const [pitch, setPitch] = useState(0);

  // EQ presets
  const EQ_PRESETS = {
    flat:      { low: 0, mid: 0, high: 0 },
    bass:      { low: 12, mid: -2, high: -4 },
    vocal:     { low: -6, mid: 8, high: 4 },
    club:      { low: 8, mid: 2, high: 6 },
    highcut:   { low: 4, mid: 0, high: -18 },
    lowcut:    { low: -18, mid: 0, high: 4 },
  };
  const [eqPreset, setEqPreset] = useState("flat");
  const [eqValues, setEqValues] = useState({ low: 0, mid: 0, high: 0 });

  // EQ Kill Switches
  const [eqKills, setEqKills] = useState({ low: false, mid: false, high: false });
  const eqBeforeKill = useRef({ low: 0, mid: 0, high: 0 });

  // Auto-gain
  const [autoGain, setAutoGain] = useState(false);
  const autoGainRef = useRef(null);

  // BPM Detection state
  const [bpm, setBpm] = useState("--");
  const bpmHistoryRef = useRef([]);
  const lastEnergyRef = useRef(0);
  const lastBeatTimeRef = useRef(0);

  // Cue Points state
  const CUE_COLORS = ["#ff9800", "#00f0ff", "#ff00ff", "#00ff88", "#ffdd00", "#ff3366", "#7b61ff", "#00bcd4"];
  const [cues, setCues] = useState([]);
  const [editingCue, setEditingCue] = useState(null);

  // Loop Controls state
  const [isLooping, setIsLooping] = useState(false);
  const [loopBeats, setLoopBeats] = useState(0);
  const loopStartRef = useRef(0);
  const loopEndRef = useRef(0);

  // Progress / time tracking
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // VU Level Meter
  const [vuLevel, setVuLevel] = useState(0);
  const [vuPeak, setVuPeak] = useState(0);
  const vuPeakDecay = useRef(0);
  const vuAnimRef = useRef(null);

  const initAudio = () => {
    if (sourceCreated.current) return;
    sourceCreated.current = true;

    // Use centralized audioEngine instead of per-deck AudioContext
    const nodes = connectDeck(name, audioRef.current);
    deckNodesRef.current = nodes;
    nodes.gain.gain.value = volume / 100;

    if (onAnalyser) onAnalyser(nodes.analyser);

    // Start VU meter animation
    startVuMeter(nodes.analyser);

    // Draw waveform + detect BPM
    drawWaveformAndDetectBPM(nodes.analyser);
  };

  // ── VU Level Meter animation ──
  const startVuMeter = (analyser) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      vuAnimRef.current = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = sum / data.length / 255;
      setVuLevel(level);
      // Peak hold with decay
      if (level > vuPeakDecay.current) {
        vuPeakDecay.current = level;
        setVuPeak(level);
      } else {
        vuPeakDecay.current = Math.max(0, vuPeakDecay.current - 0.005);
        setVuPeak(vuPeakDecay.current);
      }
    };
    tick();
  };

  const drawWaveformAndDetectBPM = (analyser) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Draw spectrum
      canvasCtx.fillStyle = "#0a0a12";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const hue = (i / bufferLength) * 120 + 160;
        canvasCtx.fillStyle = `hsl(${hue}, 100%, 60%)`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }

      // Draw cue markers on canvas
      if (audioRef.current && audioRef.current.duration) {
        const dur = audioRef.current.duration;
        const cur = audioRef.current.currentTime;
        // Playhead
        const playX = (cur / dur) * canvas.width;
        canvasCtx.strokeStyle = "#ff00ff";
        canvasCtx.lineWidth = 2;
        canvasCtx.beginPath();
        canvasCtx.moveTo(playX, 0);
        canvasCtx.lineTo(playX, canvas.height);
        canvasCtx.stroke();

        // Cue markers
        cues.forEach((c, i) => {
          const cueX = (c.time / dur) * canvas.width;
          canvasCtx.fillStyle = c.color || "#ff9800";
          canvasCtx.fillRect(cueX - 1, 0, 3, canvas.height);
          canvasCtx.fillStyle = "#fff";
          canvasCtx.font = "9px Arial";
          canvasCtx.fillText(c.label || `C${i + 1}`, cueX + 3, 10);
        });

        // Loop region overlay
        if (isLooping && loopStartRef.current < loopEndRef.current) {
          const ls = (loopStartRef.current / dur) * canvas.width;
          const le = (loopEndRef.current / dur) * canvas.width;
          canvasCtx.fillStyle = "rgba(0, 240, 255, 0.12)";
          canvasCtx.fillRect(ls, 0, le - ls, canvas.height);
          canvasCtx.strokeStyle = "#00f0ff";
          canvasCtx.lineWidth = 1;
          canvasCtx.strokeRect(ls, 0, le - ls, canvas.height);
        }
      }

      // BPM Detection — energy peak analysis
      let energy = 0;
      for (let i = 0; i < dataArray.length; i++) energy += dataArray[i];
      energy = energy / dataArray.length / 255;

      const delta = energy - lastEnergyRef.current;
      lastEnergyRef.current = energy;

      if (delta > 0.15 && energy > 0.3) {
        const now = performance.now();
        const timeSinceLast = now - lastBeatTimeRef.current;

        if (timeSinceLast > 250) { // min 250ms between beats (max 240 BPM)
          lastBeatTimeRef.current = now;

          if (timeSinceLast < 2000) { // reasonable range
            const instantBPM = 60000 / timeSinceLast;
            bpmHistoryRef.current.push(instantBPM);

            // Keep last 12 readings for smoothing
            if (bpmHistoryRef.current.length > 12) bpmHistoryRef.current.shift();

            if (bpmHistoryRef.current.length >= 4) {
              const sorted = [...bpmHistoryRef.current].sort((a, b) => a - b);
              // Remove outliers (trim 25%)
              const trimmed = sorted.slice(Math.floor(sorted.length * 0.25), Math.ceil(sorted.length * 0.75));
              const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
              const rounded = Math.round(avg);
              setBpm(rounded);
              if (onBpmDetect) onBpmDetect(name, rounded);
            }
          }
        }
      }
    }
    draw();
  };

  // Loop engine — check every 50ms if we need to loop back
  useEffect(() => {
    if (!isLooping || loopBeats === 0) return;

    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;

      if (audio.currentTime >= loopEndRef.current) {
        audio.currentTime = loopStartRef.current;
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isLooping, loopBeats]);

  // ── Playback rate control (for BPM sync + pitch)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate * (1 + pitch / 100);
    }
  }, [playbackRate, pitch]);

  const startLoop = (beats) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Use detected BPM or default 120
    const currentBPM = typeof bpm === "number" ? bpm : 120;
    const beatDuration = 60 / currentBPM;

    loopStartRef.current = audio.currentTime;
    loopEndRef.current = audio.currentTime + (beatDuration * beats);

    setLoopBeats(beats);
    setIsLooping(true);
  };

  const stopLoop = () => {
    setIsLooping(false);
    setLoopBeats(0);
  };

  const play = async () => {
    initAudio();
    await resumeAudio();               // ensure AudioContext is running
    try {
      await audioRef.current.play();
    } catch (e) {
      console.error("Deck play error:", e);
    }
    setPlaying(true);
  };

  const pause = () => {
    audioRef.current.pause();
    setPlaying(false);
  };

  const changeVolume = (v) => {
    setVolume(v);
    if (deckNodesRef.current) deckNodesRef.current.gain.gain.value = v / 100;
  };

  // ── Click-to-seek on waveform canvas ──
  const handleCanvasClick = (e) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    audio.currentTime = pct * audio.duration;
  };

  // ── Time tracking ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onTime);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onTime);
    };
  }, []);

  const changeEQ = (band, val) => {
    if (!deckNodesRef.current) return;
    const nodes = deckNodesRef.current;
    const v = parseFloat(val);
    if (band === "low") nodes.low.gain.value = v;
    else if (band === "mid") nodes.mid.gain.value = v;
    else if (band === "high") nodes.high.gain.value = v;
    setEqValues(prev => ({ ...prev, [band]: v }));
  };

  const applyEQPreset = (presetName) => {
    const p = EQ_PRESETS[presetName];
    if (!p) return;
    setEqPreset(presetName);
    setEqValues(p);
    setEqKills({ low: false, mid: false, high: false });
    if (deckNodesRef.current) {
      deckNodesRef.current.low.gain.value = p.low;
      deckNodesRef.current.mid.gain.value = p.mid;
      deckNodesRef.current.high.gain.value = p.high;
    }
  };

  // EQ Kill toggle — mute a band to -40dB or restore
  const toggleEqKill = (band) => {
    const killed = !eqKills[band];
    setEqKills(prev => ({ ...prev, [band]: killed }));
    if (!deckNodesRef.current) return;
    if (killed) {
      eqBeforeKill.current[band] = deckNodesRef.current[band].gain.value;
      deckNodesRef.current[band].gain.value = -40;
    } else {
      const restore = eqBeforeKill.current[band] ?? eqValues[band];
      deckNodesRef.current[band].gain.value = restore;
      setEqValues(prev => ({ ...prev, [band]: restore }));
    }
  };

  // Pitch slider: ±8% = playbackRate 0.92 to 1.08
  const changePitch = (val) => {
    const v = parseFloat(val);
    setPitch(v);
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate * (1 + v / 100);
    }
  };

  // Auto-gain: monitor peak and normalize
  useEffect(() => {
    if (!autoGain || !deckNodesRef.current) {
      if (autoGainRef.current) clearInterval(autoGainRef.current);
      return;
    }
    autoGainRef.current = setInterval(() => {
      const analyser = deckNodesRef.current?.analyser;
      if (!analyser) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, data[i]);
      const peakNorm = peak / 255;
      // Target ~0.8 peak
      if (peakNorm > 0.05 && deckNodesRef.current?.gain) {
        const target = 0.8 / peakNorm;
        const clamped = Math.min(Math.max(target, 0.3), 2.0);
        const current = deckNodesRef.current.gain.gain.value;
        // Smooth approach
        deckNodesRef.current.gain.gain.value = current + (clamped * (volume / 100) - current) * 0.1;
      }
    }, 200);
    return () => { if (autoGainRef.current) clearInterval(autoGainRef.current); };
  }, [autoGain, volume]);

  // ── Mute/Solo — override gain when muted ──
  useEffect(() => {
    if (!deckNodesRef.current) return;
    if (isMuted) {
      deckNodesRef.current.gain.gain.value = 0;
    } else if (!autoGain) {
      deckNodesRef.current.gain.gain.value = volume / 100;
    }
  }, [isMuted]);

  // Cue point controls
  const addCue = () => {
    if (!audioRef.current) return;
    const time = parseFloat(audioRef.current.currentTime.toFixed(2));
    const color = CUE_COLORS[cues.length % CUE_COLORS.length];
    setCues(prev => [...prev, { time, color, label: `C${prev.length + 1}` }]);
  };

  const jumpCue = (t) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = t;
    if (!playing) play();
  };

  const removeCue = (index) => {
    setCues(prev => prev.filter((_, i) => i !== index));
    setEditingCue(null);
  };

  const updateCueLabel = (index, label) => {
    setCues(prev => prev.map((c, i) => i === index ? { ...c, label } : c));
  };

  const updateCueColor = (index, color) => {
    setCues(prev => prev.map((c, i) => i === index ? { ...c, color } : c));
  };

  const fmtSec = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="deck">
      <h3 className="deck-title">{name}</h3>
      {trackTitle && (
        <div className="deck-track-info">
          <span className="dti-title">{trackTitle}</span>
          {trackArtist && <span className="dti-artist">{trackArtist}</span>}
        </div>
      )}

      {/* VU Level Meter */}
      <div className="vu-meter">
        <div className="vu-bar-track">
          <div
            className={`vu-bar-fill ${vuLevel > 0.85 ? "clip" : vuLevel > 0.6 ? "hot" : ""}`}
            style={{ width: `${vuLevel * 100}%` }}
          />
          <div className="vu-peak-marker" style={{ left: `${vuPeak * 100}%` }} />
        </div>
        <span className="vu-db">{vuLevel > 0 ? `${(20 * Math.log10(vuLevel)).toFixed(0)} dB` : "-∞"}</span>
      </div>

      <audio ref={audioRef} src={audioSrc} preload="auto" crossOrigin="anonymous"
        onEnded={() => { setPlaying(false); if (onTrackEnd) onTrackEnd(); }}
        onError={(e) => console.error(`Deck ${name} audio error:`, e.target.error)} />

      <canvas ref={canvasRef} width="300" height="80" className="waveform-canvas"
        onClick={handleCanvasClick} title="Click to seek" style={{ cursor: "pointer" }} />

      {/* Time / Progress */}
      {duration > 0 && (
        <div className="deck-time-bar">
          <span className="deck-time">{fmtSec(currentTime)}</span>
          <div className="deck-progress-track">
            <div className="deck-progress-fill" style={{ width: `${(currentTime / duration) * 100}%` }} />
          </div>
          <span className="deck-time">{fmtSec(duration)}</span>
        </div>
      )}

      <div className="deck-controls">
        <button className={`deck-btn ${playing ? "active" : ""}`} onClick={play}>▶ Play</button>
        <button className="deck-btn" onClick={pause}>⏸ Pause</button>
        {onToggleMute && (
          <button className={`deck-btn mute-btn ${isMuted ? "active" : ""}`} onClick={onToggleMute}>
            {isMuted ? "🔇 Muted" : "🔈 Mute"}
          </button>
        )}
        {onToggleSolo && (
          <button className={`deck-btn solo-btn ${isSolo ? "active" : ""}`} onClick={onToggleSolo}>
            {isSolo ? "🎧 Solo" : "🎧 Solo"}
          </button>
        )}
      </div>

      {/* BPM Display */}
      <div className="bpm-display">
        <span className="bpm-value">{bpm}</span>
        <span className="bpm-label">BPM</span>
        {playbackRate !== 1 && (
          <span className="bpm-rate">{(playbackRate * 100).toFixed(0)}%</span>
        )}
      </div>

      <div className="deck-slider">
        <label>Volume: {volume}%</label>
        <input type="range" min="0" max="100" value={volume}
          onChange={e => changeVolume(Number(e.target.value))} />
        <button className={`deck-btn small-btn auto-gain-btn ${autoGain ? "active" : ""}`}
          onClick={() => setAutoGain(!autoGain)} title="Auto-normalize volume">
          {autoGain ? "🎚️ AG ON" : "🎚️ AG"}
        </button>
      </div>

      {/* Pitch / Tempo Slider */}
      <div className="pitch-section">
        <label>Pitch: {pitch > 0 ? "+" : ""}{pitch.toFixed(1)}%</label>
        <input type="range" min="-8" max="8" step="0.1" value={pitch}
          onChange={e => changePitch(e.target.value)} className="pitch-slider" />
        {pitch !== 0 && <button className="small-btn pitch-reset" onClick={() => changePitch(0)}>Reset</button>}
      </div>

      {/* EQ Presets */}
      <div className="eq-presets">
        {Object.keys(EQ_PRESETS).map(p => (
          <button key={p} className={`eq-preset-btn ${eqPreset === p ? "active" : ""}`}
            onClick={() => applyEQPreset(p)}>
            {p === "flat" ? "⬜" : p === "bass" ? "🔊" : p === "vocal" ? "🎤" : p === "club" ? "🏠" : p === "highcut" ? "⬇" : "⬆"} {p}
          </button>
        ))}
      </div>

      <div className="eq-section">
        <div className="eq-knob">
          <label>Low</label>
          <input type="range" min="-20" max="20" value={eqValues.low}
            onChange={e => { changeEQ("low", e.target.value); setEqPreset("custom"); setEqKills(p => ({...p, low: false})); }} />
          <button className={`eq-kill-btn ${eqKills.low ? "killed" : ""}`} onClick={() => toggleEqKill("low")}>KILL</button>
        </div>
        <div className="eq-knob">
          <label>Mid</label>
          <input type="range" min="-20" max="20" value={eqValues.mid}
            onChange={e => { changeEQ("mid", e.target.value); setEqPreset("custom"); setEqKills(p => ({...p, mid: false})); }} />
          <button className={`eq-kill-btn ${eqKills.mid ? "killed" : ""}`} onClick={() => toggleEqKill("mid")}>KILL</button>
        </div>
        <div className="eq-knob">
          <label>High</label>
          <input type="range" min="-20" max="20" value={eqValues.high}
            onChange={e => { changeEQ("high", e.target.value); setEqPreset("custom"); setEqKills(p => ({...p, high: false})); }} />
          <button className={`eq-kill-btn ${eqKills.high ? "killed" : ""}`} onClick={() => toggleEqKill("high")}>KILL</button>
        </div>
      </div>

      {/* Cue Points */}
      <div className="cue-section">
        <div className="cue-header">
          <span>🎯 Cue Points</span>
          <button className="small-btn" onClick={addCue}>+ Add Cue</button>
        </div>
        {cues.length > 0 && (
          <div className="cue-list">
            {cues.map((c, i) => (
              <div key={i} className="cue-item">
                <button className="cue-jump" onClick={() => jumpCue(c.time)}
                  style={{ borderColor: c.color, color: c.color }}>
                  {c.label}
                </button>
                <span className="cue-time">{c.time}s</span>
                <button className="cue-edit" onClick={() => setEditingCue(editingCue === i ? null : i)}
                  title="Edit cue">✎</button>
                <button className="cue-remove" onClick={() => removeCue(i)}>✕</button>
                {editingCue === i && (
                  <div className="cue-edit-panel">
                    <input type="text" className="cue-label-input" value={c.label}
                      onChange={e => updateCueLabel(i, e.target.value)} maxLength={8} placeholder="Label" />
                    <div className="cue-color-row">
                      {CUE_COLORS.map(col => (
                        <button key={col} className={`cue-color-dot ${c.color === col ? "active" : ""}`}
                          style={{ background: col }} onClick={() => updateCueColor(i, col)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loop Controls */}
      <div className="loop-section">
        <span className="loop-label">🔁 Loop</span>
        <div className="loop-buttons">
          {[1, 2, 4, 8].map(b => (
            <button
              key={b}
              className={`loop-btn ${isLooping && loopBeats === b ? "active" : ""}`}
              onClick={() => isLooping && loopBeats === b ? stopLoop() : startLoop(b)}
            >
              {b}
            </button>
          ))}
          {isLooping && <button className="loop-btn stop" onClick={stopLoop}>OFF</button>}
        </div>
      </div>
    </div>
  );
}
