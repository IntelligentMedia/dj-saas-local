import React, { useRef, useState, useCallback } from "react";
import { getAudioContext, resumeAudio, getMasterGain } from "../engine";

/**
 * SamplerPad — Quick-fire sound effect trigger grid
 *
 * Provides 8 sample pads with built-in sounds generated via WebAudio synthesis.
 * Each pad can be triggered with a click or keyboard shortcut (1-8).
 * Volume per-pad + master sampler volume.
 */

const SAMPLES = [
  { id: "airhorn",  label: "📯 Air Horn",   key: "1", color: "#ff3300" },
  { id: "rewind",   label: "⏪ Rewind",     key: "2", color: "#00f0ff" },
  { id: "siren",    label: "🚨 Siren",      key: "3", color: "#ff00ff" },
  { id: "scratch",  label: "💿 Scratch",    key: "4", color: "#ffaa00" },
  { id: "drop",     label: "💥 Drop",       key: "5", color: "#00ff88" },
  { id: "laser",    label: "⚡ Laser",      key: "6", color: "#7b61ff" },
  { id: "clap",     label: "👏 Clap",       key: "7", color: "#ff6699" },
  { id: "riser",    label: "🔺 Riser",      key: "8", color: "#ffdd00" },
];

// Synthesize sound effects using WebAudio API (no external files needed)
function playSynthSample(ctx, masterGain, sampleId, volume = 0.7) {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(masterGain);

  switch (sampleId) {
    case "airhorn": {
      // Brassy sustained horn
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = "sawtooth"; osc1.frequency.setValueAtTime(440, now);
      osc2.type = "sawtooth"; osc2.frequency.setValueAtTime(443, now); // slight detune
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(1, now + 0.05);
      env.gain.setValueAtTime(1, now + 0.6);
      env.gain.linearRampToValueAtTime(0, now + 0.8);
      osc1.connect(env); osc2.connect(env); env.connect(gain);
      osc1.start(now); osc2.start(now);
      osc1.stop(now + 0.8); osc2.stop(now + 0.8);
      break;
    }
    case "rewind": {
      // Descending pitch sweep
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(2000, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.6);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.7);
      osc.connect(gain);
      osc.start(now); osc.stop(now + 0.7);
      break;
    }
    case "siren": {
      // Up-down sweep
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.4);
      osc.frequency.linearRampToValueAtTime(400, now + 0.8);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.9);
      osc.connect(gain);
      osc.start(now); osc.stop(now + 0.9);
      break;
    }
    case "scratch": {
      // Noise burst with pitch modulation
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.sin(i / bufferSize * Math.PI);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(1.5, now);
      source.playbackRate.linearRampToValueAtTime(0.3, now + 0.15);
      source.playbackRate.linearRampToValueAtTime(2.0, now + 0.3);
      gain.gain.setValueAtTime(volume * 0.6, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.35);
      source.connect(gain);
      source.start(now); source.stop(now + 0.35);
      break;
    }
    case "drop": {
      // Low frequency boom + impact
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
      const env = ctx.createGain();
      env.gain.setValueAtTime(1, now);
      env.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc.connect(env); env.connect(gain);
      // Add noise impact
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const nData = nBuf.getChannelData(0);
      for (let i = 0; i < nData.length; i++) nData[i] = (Math.random() * 2 - 1) * (1 - i / nData.length);
      const ns = ctx.createBufferSource(); ns.buffer = nBuf;
      const ng = ctx.createGain(); ng.gain.value = volume * 0.5;
      ns.connect(ng); ng.connect(gain);
      osc.start(now); osc.stop(now + 0.6);
      ns.start(now); ns.stop(now + 0.1);
      break;
    }
    case "laser": {
      // High to low sweep
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(3000, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
      gain.gain.setValueAtTime(volume * 0.4, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.35);
      osc.connect(gain);
      osc.start(now); osc.stop(now + 0.35);
      break;
    }
    case "clap": {
      // Multi-layered noise bursts for clap
      for (let n = 0; n < 3; n++) {
        const delay = n * 0.015;
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource(); src.buffer = buf;
        // Bandpass for snappy clap sound
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 2000; bp.Q.value = 1.5;
        const eg = ctx.createGain();
        eg.gain.setValueAtTime(volume * 0.6, now + delay);
        eg.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.08);
        src.connect(bp).connect(eg).connect(gain);
        src.start(now + delay); src.stop(now + delay + 0.08);
      }
      break;
    }
    case "riser": {
      // Rising sweep to build tension
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(4000, now + 1.5);
      const flt = ctx.createBiquadFilter();
      flt.type = "lowpass"; flt.frequency.setValueAtTime(500, now);
      flt.frequency.exponentialRampToValueAtTime(8000, now + 1.5);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 1.2);
      gain.gain.linearRampToValueAtTime(0, now + 1.6);
      osc.connect(flt).connect(gain);
      osc.start(now); osc.stop(now + 1.6);
      break;
    }
  }
}

export default function SamplerPad() {
  const [samplerVol, setSamplerVol] = useState(70);
  const [activePad, setActivePad] = useState(null);
  const activeTimers = useRef({});

  const triggerSample = useCallback((sample) => {
    const ctx = getAudioContext();
    resumeAudio();
    playSynthSample(ctx, getMasterGain(), sample.id, samplerVol / 100);

    // Visual feedback
    setActivePad(sample.id);
    if (activeTimers.current[sample.id]) clearTimeout(activeTimers.current[sample.id]);
    activeTimers.current[sample.id] = setTimeout(() => setActivePad(null), 300);
  }, [samplerVol]);

  // Keyboard shortcuts 1-8
  React.useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      const sample = SAMPLES.find(s => s.key === e.key);
      if (sample) {
        e.preventDefault();
        triggerSample(sample);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [triggerSample]);

  return (
    <div className="sampler-pad">
      <div className="sampler-header">
        <span className="sampler-title">🎹 Sampler</span>
        <div className="sampler-vol">
          <label>Vol: {samplerVol}%</label>
          <input type="range" min="0" max="100" value={samplerVol}
            onChange={e => setSamplerVol(Number(e.target.value))} />
        </div>
      </div>
      <div className="sampler-grid">
        {SAMPLES.map(s => (
          <button
            key={s.id}
            className={`sampler-btn ${activePad === s.id ? "active" : ""}`}
            style={{ "--pad-color": s.color }}
            onClick={() => triggerSample(s)}
            title={`${s.label} (${s.key})`}
          >
            <span className="sampler-btn-label">{s.label}</span>
            <span className="sampler-btn-key">{s.key}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
