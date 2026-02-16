/**
 * Audio Engine — Centralized WebAudio master bus
 *
 * Creates a single AudioContext shared across the app.
 * Provides: master gain, per-deck gains, crossfader, analyser,
 * MediaStreamDestination for LiveKit broadcast.
 */

let _ctx = null;
let _masterGain = null;
let _analyser = null;
let _streamDest = null;
const _deckGains = {}; // { A: GainNode, B: GainNode, ... }
const _deckSources = {}; // { A: MediaElementSourceNode, ... }

// ── FX Chain State ──
const _fx = {
  reverb:  { node: null, wet: null, dry: null, enabled: false, amount: 0.3, decay: 2.0 },
  delay:   { node: null, wet: null, dry: null, feedback: null, enabled: false, amount: 0.3, time: 0.375 },
  filter:  { node: null, enabled: false, type: "lowpass", frequency: 1000, resonance: 1 },
  flanger: { lfo: null, delayNode: null, wet: null, dry: null, enabled: false, amount: 0.5, rate: 0.5, depth: 0.003 },
};
let _fxInput = null;   // GainNode — receives master signal before FX
let _fxOutput = null;  // GainNode — merged FX output → analyser
let _fxInitialized = false;

// ── Crossfader Curve ──
let _crossfaderCurve = "smooth"; // "linear" | "smooth" | "cut"

/**
 * Get or create the shared AudioContext
 */
export function getAudioContext() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    _ctx = new AC();
  }
  return _ctx;
}

/**
 * Resume audio context (must call from user gesture)
 */
export async function resumeAudio() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

/**
 * Get the master analyser (creates if needed)
 */
export function getMasterAnalyser() {
  if (_analyser) return _analyser;
  const ctx = getAudioContext();
  _analyser = ctx.createAnalyser();
  _analyser.fftSize = 256;

  // Connect master gain → analyser → speakers
  getMasterGain().connect(_analyser);
  _analyser.connect(ctx.destination);

  return _analyser;
}

/**
 * Get the master gain node
 */
export function getMasterGain() {
  if (_masterGain) return _masterGain;
  const ctx = getAudioContext();
  _masterGain = ctx.createGain();
  _masterGain.gain.value = 1.0;
  return _masterGain;
}

/**
 * Get the MediaStreamDestination for broadcasting (LiveKit)
 */
export function getStreamDestination() {
  if (_streamDest) return _streamDest;
  const ctx = getAudioContext();
  _streamDest = ctx.createMediaStreamDestination();
  // Tap from master analyser → broadcast stream
  getMasterAnalyser().connect(_streamDest);
  return _streamDest;
}

/**
 * Connect a deck's <audio> element to the master bus through a per-deck gain
 * Returns { gain, analyser, low, mid, high } for per-deck control
 */
export function connectDeck(name, audioElement) {
  const ctx = getAudioContext();

  // Avoid double-connect
  if (_deckSources[name]) return _deckGains[name];

  const source = ctx.createMediaElementSource(audioElement);
  _deckSources[name] = source;

  // Per-deck 3-band EQ
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf"; low.frequency.value = 200;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 1;

  const high = ctx.createBiquadFilter();
  high.type = "highshelf"; high.frequency.value = 3000;

  // Per-deck gain (for crossfader)
  const gain = ctx.createGain();
  gain.gain.value = name === "A" || name === "C" ? 0.5 : 0.5;

  // Per-deck analyser (for waveform/BPM)
  const deckAnalyser = ctx.createAnalyser();
  deckAnalyser.fftSize = 256;

  // Chain: source → low → mid → high → gain → deckAnalyser → masterGain
  source.connect(low).connect(mid).connect(high).connect(gain).connect(deckAnalyser).connect(getMasterGain());

  // Ensure master → analyser → speakers + stream is connected
  getMasterAnalyser();

  const deckNode = { gain, analyser: deckAnalyser, low, mid, high, source };
  _deckGains[name] = deckNode;

  return deckNode;
}

/**
 * Get a deck's nodes (gain, analyser, EQ)
 */
export function getDeck(name) {
  return _deckGains[name] || null;
}

/**
 * Set crossfader curve type: "linear" | "smooth" | "cut"
 */
export function setCrossfaderCurve(curve) {
  _crossfaderCurve = curve;
}

/**
 * Get current crossfader curve type
 */
export function getCrossfaderCurve() {
  return _crossfaderCurve;
}

/**
 * Apply crossfader value (0 = full A, 100 = full B)
 * Applies the selected curve type for gain distribution.
 */
export function setCrossfader(value) {
  const t = value / 100; // 0 → 1

  let a, b;
  switch (_crossfaderCurve) {
    case "linear":
      a = 1 - t;
      b = t;
      break;
    case "cut":
      // Fast-cut: near-instant transition in the last 10%
      a = t < 0.05 ? 1 : t > 0.95 ? 0 : 1 - t;
      b = t > 0.95 ? 1 : t < 0.05 ? 0 : t;
      // Sharpen the cut ends
      if (t < 0.1) { a = 1; b = t * 10; }
      else if (t > 0.9) { a = (1 - t) * 10; b = 1; }
      else { a = 1 - t; b = t; }
      break;
    case "smooth":
    default:
      // Equal-power / constant-power crossfade
      a = Math.cos(t * Math.PI / 2);
      b = Math.sin(t * Math.PI / 2);
      break;
  }

  if (_deckGains.A) _deckGains.A.gain.gain.value = a;
  if (_deckGains.B) _deckGains.B.gain.gain.value = b;
  // For Pro mode, C follows A, D follows B
  if (_deckGains.C) _deckGains.C.gain.gain.value = a;
  if (_deckGains.D) _deckGains.D.gain.gain.value = b;
}

/**
 * Get current master energy level (0–1)
 */
export function getEnergy() {
  const analyser = getMasterAnalyser();
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return sum / data.length / 255;
}

// ═══════════════════════════════════════════════════════════════
//  FX Processor — Reverb, Delay, Filter, Flanger
// ═══════════════════════════════════════════════════════════════

/**
 * Build an impulse response buffer for convolver reverb
 */
function _buildImpulse(ctx, duration = 2.0, decay = 2.0) {
  const rate = ctx.sampleRate;
  const length = rate * duration;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/**
 * Initialize the FX chain (called once on first FX toggle)
 * Inserts between masterGain → analyser
 */
function _initFXChain() {
  if (_fxInitialized) return;
  _fxInitialized = true;
  const ctx = getAudioContext();

  // Disconnect master → analyser direct path (we'll route through FX)
  _masterGain.disconnect();

  _fxInput  = ctx.createGain(); _fxInput.gain.value  = 1.0;
  _fxOutput = ctx.createGain(); _fxOutput.gain.value = 1.0;

  // Master → fxInput
  _masterGain.connect(_fxInput);
  // fxOutput → analyser → destination (+ stream dest)
  _fxOutput.connect(_analyser);

  // ── Reverb (ConvolverNode) ──
  const conv = ctx.createConvolver();
  conv.buffer = _buildImpulse(ctx, 2.0, _fx.reverb.decay);
  const reverbWet = ctx.createGain(); reverbWet.gain.value = 0;
  const reverbDry = ctx.createGain(); reverbDry.gain.value = 1;
  _fxInput.connect(conv).connect(reverbWet).connect(_fxOutput);
  _fxInput.connect(reverbDry).connect(_fxOutput);
  _fx.reverb.node = conv;
  _fx.reverb.wet = reverbWet;
  _fx.reverb.dry = reverbDry;

  // ── Delay (feedback delay) ──
  const delayNode = ctx.createDelay(5.0);
  delayNode.delayTime.value = _fx.delay.time;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.4;
  const delayWet = ctx.createGain(); delayWet.gain.value = 0;
  const delayDry = ctx.createGain(); delayDry.gain.value = 1;
  _fxInput.connect(delayNode);
  delayNode.connect(delayFeedback).connect(delayNode); // feedback loop
  delayNode.connect(delayWet).connect(_fxOutput);
  _fxInput.connect(delayDry).connect(_fxOutput);
  _fx.delay.node = delayNode;
  _fx.delay.wet = delayWet;
  _fx.delay.dry = delayDry;
  _fx.delay.feedback = delayFeedback;

  // ── Filter (BiquadFilter) ──
  const filterNode = ctx.createBiquadFilter();
  filterNode.type = _fx.filter.type;
  filterNode.frequency.value = _fx.filter.frequency;
  filterNode.Q.value = _fx.filter.resonance;
  // Filter is inline — when disabled we bypass; when enabled, insert
  _fx.filter.node = filterNode;

  // ── Flanger (LFO → short delay) ──
  const flangeDelay = ctx.createDelay(0.02);
  flangeDelay.delayTime.value = 0.005;
  const flangeLFO = ctx.createOscillator();
  flangeLFO.type = "sine";
  flangeLFO.frequency.value = _fx.flanger.rate;
  const flangeDepth = ctx.createGain();
  flangeDepth.gain.value = _fx.flanger.depth;
  flangeLFO.connect(flangeDepth).connect(flangeDelay.delayTime);
  flangeLFO.start();
  const flangeWet = ctx.createGain(); flangeWet.gain.value = 0;
  const flangeDry = ctx.createGain(); flangeDry.gain.value = 1;
  _fxInput.connect(flangeDelay).connect(flangeWet).connect(_fxOutput);
  _fxInput.connect(flangeDry).connect(_fxOutput);
  _fx.flanger.lfo = flangeLFO;
  _fx.flanger.delayNode = flangeDelay;
  _fx.flanger.wet = flangeWet;
  _fx.flanger.dry = flangeDry;
  _fx.flanger.depthGain = flangeDepth;

  // Dry pass-through (default — all FX wet at 0)
  _fxInput.connect(_fxOutput);
}

/**
 * Enable/disable an FX and set its wet/dry mix
 * @param {"reverb"|"delay"|"filter"|"flanger"} name
 * @param {boolean} enabled
 */
export function setFXEnabled(name, enabled) {
  if (!_fx[name]) return;
  if (!_fxInitialized) { getMasterAnalyser(); _initFXChain(); }
  _fx[name].enabled = enabled;
  _applyFX(name);
}

/**
 * Set an FX parameter
 * @param {"reverb"|"delay"|"filter"|"flanger"} name
 * @param {string} param  — "amount", "time", "frequency", "resonance", "type", "rate", "depth", "decay"
 * @param {number|string} value
 */
export function setFXParam(name, param, value) {
  if (!_fx[name]) return;
  if (!_fxInitialized) { getMasterAnalyser(); _initFXChain(); }
  const fx = _fx[name];
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  switch (name) {
    case "reverb":
      if (param === "amount") { fx.amount = value; }
      if (param === "decay") {
        fx.decay = value;
        if (fx.node) fx.node.buffer = _buildImpulse(ctx, 2.0, value);
      }
      break;
    case "delay":
      if (param === "amount") { fx.amount = value; }
      if (param === "time" && fx.node) { fx.time = value; fx.node.delayTime.setTargetAtTime(value, now, 0.05); }
      if (param === "feedback" && fx.feedback) { fx.feedback.gain.setTargetAtTime(Math.min(value, 0.9), now, 0.05); }
      break;
    case "filter":
      if (param === "frequency" && fx.node) { fx.frequency = value; fx.node.frequency.setTargetAtTime(value, now, 0.05); }
      if (param === "resonance" && fx.node) { fx.resonance = value; fx.node.Q.setTargetAtTime(value, now, 0.05); }
      if (param === "type" && fx.node) { fx.type = value; fx.node.type = value; }
      break;
    case "flanger":
      if (param === "amount") { fx.amount = value; }
      if (param === "rate" && fx.lfo) { fx.rate = value; fx.lfo.frequency.setTargetAtTime(value, now, 0.05); }
      if (param === "depth" && fx.depthGain) { fx.depth = value; fx.depthGain.gain.setTargetAtTime(value, now, 0.05); }
      break;
  }
  if (fx.enabled) _applyFX(name);
}

/**
 * Apply current wet/dry levels for an FX
 */
function _applyFX(name) {
  const fx = _fx[name];
  if (!fx) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  if (name === "filter") {
    // Filter is special — insert/bypass in chain
    // When enabled, reconnect fxInput through filter → fxOutput
    // For simplicity we control Q: off = 0.001, on = user value
    if (fx.node) {
      if (fx.enabled) {
        fx.node.Q.setTargetAtTime(fx.resonance, now, 0.05);
        fx.node.frequency.setTargetAtTime(fx.frequency, now, 0.05);
        // Insert filter inline by disconnecting direct pass and routing through filter
        try { _fxInput.disconnect(_fxOutput); } catch {}
        _fxInput.connect(fx.node).connect(_fxOutput);
      } else {
        try { _fxInput.disconnect(fx.node); } catch {}
        _fxInput.connect(_fxOutput);
      }
    }
    return;
  }

  // Wet/dry for reverb, delay, flanger
  if (fx.wet && fx.dry) {
    if (fx.enabled) {
      fx.wet.gain.setTargetAtTime(fx.amount, now, 0.05);
      fx.dry.gain.setTargetAtTime(1 - fx.amount * 0.5, now, 0.05);
    } else {
      fx.wet.gain.setTargetAtTime(0, now, 0.05);
      fx.dry.gain.setTargetAtTime(1, now, 0.05);
    }
  }
}

/**
 * Get current FX state (for UI)
 */
export function getFXState() {
  return {
    reverb:  { enabled: _fx.reverb.enabled,  amount: _fx.reverb.amount,  decay: _fx.reverb.decay },
    delay:   { enabled: _fx.delay.enabled,   amount: _fx.delay.amount,   time: _fx.delay.time },
    filter:  { enabled: _fx.filter.enabled,  type: _fx.filter.type, frequency: _fx.filter.frequency, resonance: _fx.filter.resonance },
    flanger: { enabled: _fx.flanger.enabled, amount: _fx.flanger.amount, rate: _fx.flanger.rate, depth: _fx.flanger.depth },
  };
}

/**
 * Cleanup (call on app unmount)
 */
export function destroyAudio() {
  Object.keys(_deckSources).forEach(k => { delete _deckSources[k]; });
  Object.keys(_deckGains).forEach(k => { delete _deckGains[k]; });
  _masterGain = null;
  _analyser = null;
  _streamDest = null;
  if (_ctx) { _ctx.close(); _ctx = null; }
}
