import React, { useState, useEffect } from "react";
import { apiFetch } from "../utils/api";

export default function Infrastructure() {
  const [status, setStatus] = useState(null);
  const [aiScale, setAiScale] = useState(null);
  const [failover, setFailover] = useState(null);
  const [predictLoad, setPredictLoad] = useState(null);
  const [crowdEnergy, setCrowdEnergy] = useState(null);
  const [lineup, setLineup] = useState(null);
  const [geoResult, setGeoResult] = useState(null);
  const [meshResult, setMeshResult] = useState(null);
  const [edgeResult, setEdgeResult] = useState(null);

  const load = async () => {
    try { setStatus(await apiFetch("/infra/status")); } catch {}
    try { setFailover(await apiFetch("/ai/failover/status")); } catch {}
    try { setCrowdEnergy(await apiFetch("/ai/crowd-energy")); } catch {}
  };

  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, []);

  const runAutoscale = async () => { try { setAiScale(await apiFetch("/infra/ai-scale")); } catch {} };
  const runPredictLoad = async () => { try { setPredictLoad(await apiFetch("/ai/predict-load")); } catch {} };
  const loadLineup = async () => { try { setLineup(await apiFetch("/ai/lineup")); } catch {} };

  const runGeoRoute = async () => {
    try { setGeoResult(await apiFetch("/infra/geo-token?lat=33.8938&lng=35.5018")); } catch {}
  };
  const runMeshRoute = async () => { try { setMeshResult(await apiFetch("/infra/mesh-route")); } catch {} };
  const runEdgeRoute = async () => { try { setEdgeResult(await apiFetch("/infra/edge-route?lat=33.8938&lng=35.5018")); } catch {} };

  return (
    <div className="infra-page">
      <h1 className="page-title">🏗️ Infrastructure & AI Control</h1>

      {/* Node Status */}
      {status && (
        <div className="card">
          <h3>🖥️ Cluster Status</h3>
          <div className="earnings-grid">
            <div className="stat-card"><span className="stat-value">{status.total_nodes}</span><span className="stat-label">Total Nodes</span></div>
            <div className="stat-card"><span className="stat-value green">{status.healthy_nodes}</span><span className="stat-label">Healthy</span></div>
            <div className="stat-card"><span className="stat-value red">{status.unhealthy_nodes}</span><span className="stat-label">Unhealthy</span></div>
            <div className="stat-card"><span className="stat-value">{status.avg_load}%</span><span className="stat-label">Avg Load</span></div>
            <div className="stat-card"><span className="stat-value">{status.avg_latency}ms</span><span className="stat-label">Avg Latency</span></div>
          </div>

          <table className="data-table">
            <thead><tr><th>Node</th><th>Region</th><th>Load</th><th>Latency</th><th>Health</th></tr></thead>
            <tbody>
              {(status.nodes || []).map((n, i) => (
                <tr key={i}>
                  <td>{n.url}</td>
                  <td>{n.region}</td>
                  <td><div className="load-bar"><div className="load-fill" style={{ width: n.load + "%" }} /></div> {n.load}%</td>
                  <td>{n.latency}ms</td>
                  <td>{n.healthy ? "🟢" : "🔴"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Failover */}
      {failover && (
        <div className={`card failover-card ${failover.mode === "AI_FAILOVER" ? "failover-active" : ""}`}>
          <h3>🤖 DJ Failover Engine</h3>
          <div className="failover-status">
            <span className={`mode-badge ${failover.mode}`}>{failover.mode}</span>
            <span>{failover.message}</span>
          </div>
        </div>
      )}

      {/* Crowd Energy */}
      {crowdEnergy && (
        <div className="card">
          <h3>🔥 Crowd Energy: {crowdEnergy.crowd_energy}</h3>
          <div className="energy-bar-container">
            <div className="energy-bar" style={{ width: crowdEnergy.crowd_energy + "%" }} />
          </div>
          <p>Top DJ: {crowdEnergy.top_dj} | Genre: {crowdEnergy.recommended_genre}</p>
          <p className="ai-analysis">{crowdEnergy.ai_analysis}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="card">
        <h3>⚡ Actions</h3>
        <div className="action-buttons">
          <button className="deck-btn" onClick={runAutoscale}>🤖 AI Autoscale</button>
          <button className="deck-btn" onClick={runPredictLoad}>📈 Predict Load</button>
          <button className="deck-btn" onClick={loadLineup}>🎵 AI Lineup</button>
          <button className="deck-btn" onClick={runGeoRoute}>🌍 Geo Route</button>
          <button className="deck-btn" onClick={runMeshRoute}>🔗 Mesh Route</button>
          <button className="deck-btn" onClick={runEdgeRoute}>📡 Edge Route</button>
        </div>
      </div>

      {/* AI Autoscale Result */}
      {aiScale && (
        <div className="card">
          <h3>🤖 Autoscaler: {aiScale.action}</h3>
          <p>{aiScale.message}</p>
          <p>Nodes: {aiScale.total_nodes} | Avg Load: {aiScale.avg_load}%</p>
        </div>
      )}

      {/* Load Prediction */}
      {predictLoad && (
        <div className="card">
          <h3>📈 Load Forecast (Hour {predictLoad.current_hour})</h3>
          <div className="energy-bar-container">
            <div className="energy-bar" style={{ width: predictLoad.predicted_load + "%" }} />
          </div>
          <p>Predicted: {predictLoad.predicted_load}% — {predictLoad.recommendation}</p>
          {predictLoad.actions.map((a, i) => <p key={i} className="action-item">→ {a}</p>)}
        </div>
      )}

      {/* AI Lineup */}
      {lineup && (
        <div className="card">
          <h3>🎵 AI DJ Lineup</h3>
          <table className="data-table">
            <thead><tr><th>Time</th><th>DJ</th><th>Genre</th><th>Confidence</th></tr></thead>
            <tbody>
              {lineup.schedule.map((s, i) => (
                <tr key={i}>
                  <td>{s.time}</td>
                  <td>{s.dj}</td>
                  <td>{s.genre}</td>
                  <td>{s.confidence}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Geo/Mesh/Edge Results */}
      {geoResult && (
        <div className="card">
          <h3>🌍 Geo Route Result</h3>
          <p>Node: {geoResult.node} ({geoResult.region}) | Strategy: {geoResult.strategy}</p>
        </div>
      )}
      {meshResult && (
        <div className="card">
          <h3>🔗 Mesh Route Result</h3>
          <p>Relay: {meshResult.relay_pub} | Load: {meshResult.relay_load}</p>
        </div>
      )}
      {edgeResult && (
        <div className="card">
          <h3>📡 Edge Route Result</h3>
          <p>Mode: {edgeResult.mode} | {edgeResult.mode === "EDGE" ? edgeResult.relay : edgeResult.node}</p>
        </div>
      )}
    </div>
  );
}
