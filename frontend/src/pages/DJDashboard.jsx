import React, { useState, useEffect } from "react";
import { apiFetch, getUser } from "../utils/api";

const MIXER_MODES = [
  {
    id: "classic",
    name: "Classic Decks",
    icon: "🎛️",
    desc: "Dual turntable layout with crossfader, EQ, cue points, loop controls and waveform display",
    color: "#00f0ff",
  },
  {
    id: "video",
    name: "Video DJ",
    icon: "🎬",
    desc: "Visual mixing with camera overlay, webcam hand tracking and gesture crossfader control",
    color: "#ff00ff",
  },
  {
    id: "auto",
    name: "Auto Playlist",
    icon: "🤖",
    desc: "AI-powered automatic DJ with smart crossfade, BPM matching and predictive transitions",
    color: "#00ff88",
  },
  {
    id: "pro",
    name: "Advanced Pro Layout",
    icon: "⚡",
    desc: "Full studio layout with 4 decks, advanced EQ, effects chain, loop slicer and broadcast controls",
    color: "#ffaa00",
  },
];

export default function DJDashboard({ onStartSession }) {
  const user = getUser();
  const [session, setSession] = useState(null);
  const [booking, setBooking] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [djRate, setDjRate] = useState(null);
  const [showMixerSelect, setShowMixerSelect] = useState(false);
  const [stats, setStats] = useState({ totalSessions: 0, totalEarnings: 0, avgRating: "--" });
  const [history, setHistory] = useState([]);
  const [historyStats, setHistoryStats] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadData();
    const i = setInterval(loadData, 8000);
    return () => clearInterval(i);
  }, []);

  const loadData = async () => {
    // Active session
    try {
      const sessions = await apiFetch("/bookings/sessions");
      const active = Array.isArray(sessions) ? sessions.find(s => s.active) : null;
      setSession(active || null);
    } catch {}

    // Active booking
    try {
      const bookings = await apiFetch("/bookings");
      const arr = Array.isArray(bookings) ? bookings : [];
      const mine = arr.find(b => b.dj_id === user?.id && (b.status === "active" || b.status === "confirmed"));
      setBooking(mine || null);
    } catch {}

    // Realtime earnings
    try {
      const e = await apiFetch("/billing/realtime-earnings");
      setEarnings(e);
    } catch {}

    // DJ rate
    try {
      const r = await apiFetch("/payments/dj-rate");
      setDjRate(r.hourly_rate);
    } catch {}

    // Transaction stats
    try {
      const txns = await apiFetch("/payments/transactions");
      const arr = Array.isArray(txns) ? txns : [];
      const payouts = arr.filter(t => t.type === "dj_payout" && t.status === "completed");
      setStats({
        totalSessions: payouts.length,
        totalEarnings: payouts.reduce((s, t) => s + Number(t.amount), 0),
        avgRating: "--",
      });
    } catch {}
  };

  const loadHistory = async () => {
    try {
      const data = await apiFetch("/bookings/sessions/history?limit=50");
      if (data?.sessions) setHistory(data.sessions);
      if (data?.stats) setHistoryStats(data.stats);
    } catch {}
  };

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory]);

  const handleSelectMixer = (mode) => {
    if (onStartSession) onStartSession(mode);
  };

  const myEarning = earnings?.earnings?.find(e => e.dj_id === user?.id);

  return (
    <div className="dj-dashboard-page">
      <h1 className="page-title">🎧 DJ Dashboard</h1>

      {/* ── Status Cards ── */}
      <div className="dashboard-stats-grid">
        <div className="dash-stat-card">
          <div className="dash-stat-icon">🟢</div>
          <div className="dash-stat-value">{session ? "LIVE" : "OFFLINE"}</div>
          <div className="dash-stat-label">Session Status</div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon">💵</div>
          <div className="dash-stat-value">${djRate || 50}/hr</div>
          <div className="dash-stat-label">My Rate</div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon">🎵</div>
          <div className="dash-stat-value">{stats.totalSessions}</div>
          <div className="dash-stat-label">Total Sessions</div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon">💰</div>
          <div className="dash-stat-value">${stats.totalEarnings.toFixed(2)}</div>
          <div className="dash-stat-label">Total Earnings</div>
        </div>
      </div>

      {/* ── Live Session Info ── */}
      {session && (
        <div className="card live-session-card">
          <h3>🔴 Live Session</h3>
          <div className="live-session-details">
            <span>DJ: <strong>{session.dj_name}</strong></span>
            <span>Started: {new Date(session.started_at).toLocaleTimeString()}</span>
            {myEarning && (
              <>
                <span>Elapsed: <strong>{myEarning.elapsed_minutes} min</strong></span>
                <span>Earned: <strong className="dj-net">${myEarning.earned_so_far}</strong></span>
                <span>Net: <strong className="dj-net">${myEarning.dj_net}</strong></span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Active Booking ── */}
      {booking && (
        <div className="card">
          <h3>📋 Active Booking</h3>
          <div className="live-session-details">
            <span>Pub: <strong>{booking.pub_name}</strong></span>
            <span>Hours: <strong>{booking.hours}h</strong></span>
            <span>Rate: <strong>${booking.rate}/hr</strong></span>
            <span>Status: <strong className={`status-badge status-${booking.status}`}>{booking.status}</strong></span>
            <span>Scheduled: {new Date(booking.scheduled_start).toLocaleTimeString()} – {new Date(booking.scheduled_end).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* ── Start Session Button ── */}
      <div className="start-session-section">
        {!showMixerSelect ? (
          <button className="start-session-btn" onClick={() => setShowMixerSelect(true)}>
            <span className="start-session-icon">▶</span>
            <span className="start-session-text">Start Session</span>
            <span className="start-session-sub">Choose your mixer layout</span>
          </button>
        ) : (
          <div className="mixer-select-panel">
            <h2 className="mixer-select-title">Choose Mixer:</h2>
            <div className="mixer-modes-grid">
              {MIXER_MODES.map(m => (
                <button
                  key={m.id}
                  className="mixer-mode-card"
                  style={{ "--mode-color": m.color }}
                  onClick={() => handleSelectMixer(m.id)}
                >
                  <div className="mixer-mode-icon">{m.icon}</div>
                  <div className="mixer-mode-name">{m.name}</div>
                  <div className="mixer-mode-desc">{m.desc}</div>
                </button>
              ))}
            </div>
            <button className="deck-btn" style={{ marginTop: 16 }} onClick={() => setShowMixerSelect(false)}>
              ← Back
            </button>
          </div>
        )}
      </div>

      {/* ── Session History / Analytics ── */}
      <div className="session-history-section">
        <button className="deck-btn" onClick={() => setShowHistory(!showHistory)} style={{ marginBottom: 16 }}>
          {showHistory ? "▲ Hide Session History" : "📊 Session History & Analytics"}
        </button>

        {showHistory && (
          <div className="session-history-panel">
            {/* Summary stats */}
            {historyStats && (
              <div className="history-stats-grid">
                <div className="dash-stat-card">
                  <div className="dash-stat-icon">📊</div>
                  <div className="dash-stat-value">{historyStats.completed}</div>
                  <div className="dash-stat-label">Completed Sessions</div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-icon">⏱</div>
                  <div className="dash-stat-value">{historyStats.total_hours}h</div>
                  <div className="dash-stat-label">Total Hours</div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-icon">💵</div>
                  <div className="dash-stat-value">${historyStats.total_earned}</div>
                  <div className="dash-stat-label">Total Earned</div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-icon">⏲</div>
                  <div className="dash-stat-value">{historyStats.avg_duration_min}m</div>
                  <div className="dash-stat-label">Avg Duration</div>
                </div>
              </div>
            )}

            {/* Session list */}
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Venue</th>
                    <th>Duration</th>
                    <th>Rate</th>
                    <th>Earned</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr><td colSpan="6" style={{ textAlign: "center", opacity: 0.5 }}>No sessions yet</td></tr>
                  )}
                  {history.map(s => (
                    <tr key={s.id} className={s.active ? "active-row" : ""}>
                      <td>{new Date(s.started_at).toLocaleDateString()} {new Date(s.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      <td>{s.pub_name || "—"}</td>
                      <td>{s.duration_minutes}m</td>
                      <td>${s.rate || 50}/hr</td>
                      <td className="dj-net">${s.earned || "0.00"}</td>
                      <td>
                        <span className={`status-badge status-${s.active ? "active" : "completed"}`}>
                          {s.active ? "🔴 LIVE" : "✅ Done"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
