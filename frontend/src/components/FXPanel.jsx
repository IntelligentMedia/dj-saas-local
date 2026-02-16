import React, { useState, useCallback } from "react";
import { setFXEnabled, setFXParam, getFXState } from "../engine";

const FILTER_TYPES = ["lowpass", "highpass", "bandpass", "notch"];

export default function FXPanel() {
  const [fx, setFx] = useState(() => getFXState());

  const refresh = () => setFx(getFXState());

  const toggle = useCallback((name) => {
    const next = !fx[name].enabled;
    setFXEnabled(name, next);
    refresh();
  }, [fx]);

  const param = useCallback((name, key, value) => {
    setFXParam(name, key, value);
    refresh();
  }, []);

  return (
    <div className="fx-panel">
      <h3 className="fx-panel-title">🎛️ FX Processor</h3>

      <div className="fx-rack">
        {/* ── REVERB ── */}
        <div className={`fx-unit ${fx.reverb.enabled ? "active" : ""}`}>
          <div className="fx-unit-header">
            <button className="fx-toggle" onClick={() => toggle("reverb")}>
              {fx.reverb.enabled ? "🟢" : "⚫"} Reverb
            </button>
          </div>
          <div className="fx-knobs">
            <div className="fx-knob">
              <label>Mix</label>
              <input type="range" min="0" max="100" value={Math.round(fx.reverb.amount * 100)}
                onChange={e => param("reverb", "amount", e.target.value / 100)} />
              <span>{Math.round(fx.reverb.amount * 100)}%</span>
            </div>
            <div className="fx-knob">
              <label>Decay</label>
              <input type="range" min="5" max="50" value={Math.round(fx.reverb.decay * 10)}
                onChange={e => param("reverb", "decay", e.target.value / 10)} />
              <span>{fx.reverb.decay.toFixed(1)}s</span>
            </div>
          </div>
        </div>

        {/* ── DELAY ── */}
        <div className={`fx-unit ${fx.delay.enabled ? "active" : ""}`}>
          <div className="fx-unit-header">
            <button className="fx-toggle" onClick={() => toggle("delay")}>
              {fx.delay.enabled ? "🟢" : "⚫"} Delay
            </button>
          </div>
          <div className="fx-knobs">
            <div className="fx-knob">
              <label>Mix</label>
              <input type="range" min="0" max="100" value={Math.round(fx.delay.amount * 100)}
                onChange={e => param("delay", "amount", e.target.value / 100)} />
              <span>{Math.round(fx.delay.amount * 100)}%</span>
            </div>
            <div className="fx-knob">
              <label>Time</label>
              <input type="range" min="50" max="1000" step="25" value={Math.round(fx.delay.time * 1000)}
                onChange={e => param("delay", "time", e.target.value / 1000)} />
              <span>{Math.round(fx.delay.time * 1000)}ms</span>
            </div>
          </div>
        </div>

        {/* ── FILTER ── */}
        <div className={`fx-unit ${fx.filter.enabled ? "active" : ""}`}>
          <div className="fx-unit-header">
            <button className="fx-toggle" onClick={() => toggle("filter")}>
              {fx.filter.enabled ? "🟢" : "⚫"} Filter
            </button>
          </div>
          <div className="fx-knobs">
            <div className="fx-knob">
              <label>Type</label>
              <select className="fx-select" value={fx.filter.type}
                onChange={e => param("filter", "type", e.target.value)}>
                {FILTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fx-knob">
              <label>Freq</label>
              <input type="range" min="20" max="20000" value={fx.filter.frequency}
                onChange={e => param("filter", "frequency", Number(e.target.value))} />
              <span>{fx.filter.frequency >= 1000 ? (fx.filter.frequency / 1000).toFixed(1) + "k" : fx.filter.frequency}Hz</span>
            </div>
            <div className="fx-knob">
              <label>Reso</label>
              <input type="range" min="1" max="30" value={Math.round(fx.filter.resonance)}
                onChange={e => param("filter", "resonance", Number(e.target.value))} />
              <span>Q{Math.round(fx.filter.resonance)}</span>
            </div>
          </div>
        </div>

        {/* ── FLANGER ── */}
        <div className={`fx-unit ${fx.flanger.enabled ? "active" : ""}`}>
          <div className="fx-unit-header">
            <button className="fx-toggle" onClick={() => toggle("flanger")}>
              {fx.flanger.enabled ? "🟢" : "⚫"} Flanger
            </button>
          </div>
          <div className="fx-knobs">
            <div className="fx-knob">
              <label>Mix</label>
              <input type="range" min="0" max="100" value={Math.round(fx.flanger.amount * 100)}
                onChange={e => param("flanger", "amount", e.target.value / 100)} />
              <span>{Math.round(fx.flanger.amount * 100)}%</span>
            </div>
            <div className="fx-knob">
              <label>Rate</label>
              <input type="range" min="1" max="100" value={Math.round(fx.flanger.rate * 10)}
                onChange={e => param("flanger", "rate", e.target.value / 10)} />
              <span>{fx.flanger.rate.toFixed(1)}Hz</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
