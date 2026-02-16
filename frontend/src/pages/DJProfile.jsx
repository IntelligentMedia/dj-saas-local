import React, { useState, useEffect } from "react";
import { apiFetch } from "../utils/api";
import useDJStore from "../store/djStore";
import { toast } from "../store/toastStore";

export default function DJProfile() {
  const currentDJ = useDJStore((s) => s.currentDJ);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [activeTab, setActiveTab] = useState("overview"); // overview | history | setlists
  const [history, setHistory] = useState([]);
  const [historyStats, setHistoryStats] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [setlists, setSetlists] = useState([]);
  const [selectedSetlist, setSelectedSetlist] = useState(null);
  const [setlistTracks, setSetlistTracks] = useState([]);

  // DJ Ratings
  const [ratings, setRatings] = useState([]);
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingTotal, setRatingTotal] = useState(0);

  useEffect(() => {
    loadProfile();
    loadRatings();
  }, []);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
    if (activeTab === "setlists") loadSetlists();
  }, [activeTab, historyPage]);

  const loadProfile = async () => {
    try {
      const data = await apiFetch("/profile");
      setProfile(data);
      setNewName(data.user?.username || "");
    } catch (e) {
      console.error("Profile load error:", e);
    }
    setLoading(false);
  };

  const loadHistory = async () => {
    try {
      const [data, stats] = await Promise.all([
        apiFetch(`/profile/history?page=${historyPage}&limit=25`),
        apiFetch("/profile/history/stats"),
      ]);
      setHistory(data.history || []);
      setHistoryPages(data.pagination?.pages || 1);
      setHistoryStats(stats);
    } catch (e) {
      console.error("History load error:", e);
    }
  };

  const loadSetlists = async () => {
    try {
      const data = await apiFetch("/profile/setlists");
      setSetlists(data.setlists || []);
    } catch (e) {
      console.error("Setlists load error:", e);
    }
  };

  const loadRatings = async () => {
    try {
      const data = await apiFetch("/profile");
      if (data.user?.id) {
        const rData = await apiFetch(`/profile/ratings/${data.user.id}`);
        setRatings(rData.ratings || []);
        setRatingAvg(parseFloat(rData.average) || 0);
        setRatingTotal(rData.total || 0);
      }
    } catch (e) {
      console.error("Ratings load error:", e);
    }
  };

  const viewSetlist = async (sessionId) => {
    try {
      const data = await apiFetch(`/profile/setlists/${sessionId}`);
      setSelectedSetlist(data);
      setSetlistTracks(data.tracks || []);
    } catch (e) {
      console.error("Setlist detail error:", e);
    }
  };

  const handleSave = async () => {
    try {
      await apiFetch("/profile", {
        method: "PUT",
        body: JSON.stringify({ username: newName }),
      });
      setEditing(false);
      loadProfile();
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  // ── Export Setlist to clipboard as formatted text ──
  const exportSetlist = () => {
    if (!selectedSetlist || !setlistTracks.length) return;
    const sessionDate = selectedSetlist.session?.started_at
      ? new Date(selectedSetlist.session.started_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "Unknown date";
    const venue = selectedSetlist.session?.pub_name || "No venue";
    let text = `🎧 DJ Set List — ${sessionDate}\n`;
    text += `📍 ${venue}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    setlistTracks.forEach((t, i) => {
      const time = t.played_at
        ? new Date(t.played_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
      text += `${String(i + 1).padStart(2, " ")}. ${t.track_title} — ${t.track_artist || "Unknown"}`;
      if (t.genre) text += ` [${t.genre}]`;
      if (t.bpm) text += ` (${t.bpm} BPM)`;
      if (time) text += `  @ ${time}`;
      text += ` (Deck ${t.deck_name || "?"})`;
      text += `\n`;
    });
    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Total: ${setlistTracks.length} tracks\n`;
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Setlist copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy setlist");
    });
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  };

  const fmtDuration = (min) => {
    if (!min) return "0m";
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="page-spinner"><div className="spinner-ring" /><span>Loading profile…</span></div>
      </div>
    );
  }

  if (!profile) {
    return <div className="profile-page"><p className="listener-status">Failed to load profile</p></div>;
  }

  const { user, stats, top_genres, recent_sessions } = profile;

  return (
    <div className="profile-page">
      <h1 className="page-title">👤 DJ Profile</h1>

      {/* ── Identity Card ── */}
      <div className="profile-card">
        <div className="profile-avatar">
          {user.username?.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="profile-info">
          {editing ? (
            <div className="profile-edit-row">
              <input
                type="text" value={newName} onChange={e => setNewName(e.target.value)}
                className="profile-name-input" maxLength={30}
              />
              <button className="deck-btn" onClick={handleSave}>Save</button>
              <button className="deck-btn" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          ) : (
            <h2 className="profile-name">
              {user.username}
              <button className="profile-edit-btn" onClick={() => setEditing(true)}>✏️</button>
            </h2>
          )}
          <div className="profile-meta">
            <span className="profile-role">{
              {dj:"🎧 DJ", pub:"👤 Listener", admin:"⚡ Admin", sysadmin:"🔧 Sys Admin", accountant:"📊 Accountant", support:"🎗️ Support", sales:"💼 Sales", marketing:"📣 Marketing"}[user.role] || user.role
            }</span>
            <span className="profile-since">Member since {fmtDate(user.member_since)}</span>
          </div>
        </div>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="profile-tabs">
        <button className={`profile-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}>📊 Overview</button>
        <button className={`profile-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}>🎵 Play History</button>
        <button className={`profile-tab ${activeTab === "setlists" ? "active" : ""}`}
          onClick={() => { setActiveTab("setlists"); setSelectedSetlist(null); }}>📋 Set Lists</button>
      </div>

      {activeTab === "overview" && (<>
      {/* ── Stats Grid ── */}
      <div className="profile-stats-grid">
        <div className="profile-stat-card">
          <span className="psc-value">{stats.total_sessions}</span>
          <span className="psc-label">Total Sessions</span>
        </div>
        <div className="profile-stat-card">
          <span className="psc-value">{stats.total_hours}h</span>
          <span className="psc-label">Hours Played</span>
        </div>
        <div className="profile-stat-card">
          <span className="psc-value">${stats.total_earned}</span>
          <span className="psc-label">Total Earned</span>
        </div>
        <div className="profile-stat-card">
          <span className="psc-value">{stats.total_bookings}</span>
          <span className="psc-label">Bookings</span>
        </div>
        <div className="profile-stat-card accent">
          <span className="psc-value">{stats.upcoming_bookings}</span>
          <span className="psc-label">Upcoming</span>
        </div>
        <div className="profile-stat-card accent">
          <span className="psc-value">{stats.completed_sessions}</span>
          <span className="psc-label">Completed</span>
        </div>
      </div>

      {/* ── Top Genres ── */}
      {top_genres.length > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">🎵 Top Genres</h3>
          <div className="profile-genres">
            {top_genres.map((g, i) => (
              <div key={i} className="genre-pill">
                <span className="genre-name">{g.genre}</span>
                <span className="genre-count">{g.count} tracks</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ratings Section ── */}
      <div className="profile-section">
        <h3 className="profile-section-title">⭐ Session Ratings</h3>
        <div className="profile-stats-grid" style={{ marginBottom: 12 }}>
          <div className="profile-stat-card accent">
            <span className="psc-value">{ratingAvg ? ratingAvg.toFixed(1) : "—"}</span>
            <span className="psc-label">Average Rating</span>
          </div>
          <div className="profile-stat-card">
            <span className="psc-value">{ratingTotal}</span>
            <span className="psc-label">Total Reviews</span>
          </div>
          <div className="profile-stat-card">
            <span className="psc-value">{"★".repeat(Math.round(ratingAvg))}{"☆".repeat(5 - Math.round(ratingAvg))}</span>
            <span className="psc-label">Star Rating</span>
          </div>
        </div>
        {ratings.length > 0 ? (
          <div className="ratings-list">
            {ratings.slice(0, 10).map((r, i) => (
              <div key={i} className="rating-card">
                <div className="rating-card-header">
                  <span className="rating-stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <span className="rating-date">{fmtDate(r.created_at)}</span>
                </div>
                {r.comment && <p className="rating-comment">{r.comment}</p>}
                <span className="rating-author">— {r.username || "Listener"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "#666", textAlign: "center", padding: 12 }}>No ratings yet. Listeners can rate your sessions!</p>
        )}
      </div>

      {/* ── Recent Sessions ── */}
      {recent_sessions.length > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">📅 Recent Sessions</h3>
          <div className="profile-sessions-list">
            {recent_sessions.map((s) => (
              <div key={s.id} className="profile-session-row">
                <span className={`psr-status ${s.active ? "live" : "done"}`}>
                  {s.active ? "🔴 LIVE" : "✅"}
                </span>
                <span className="psr-date">{fmtDate(s.started_at)}</span>
                <span className="psr-venue">{s.pub_name || "—"}</span>
                <span className="psr-duration">{fmtDuration(s.duration_minutes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </>)}

      {/* ── Play History Tab ── */}
      {activeTab === "history" && (
        <div className="profile-section">
          {historyStats && (
            <div className="profile-stats-grid" style={{ marginBottom: 16 }}>
              <div className="profile-stat-card">
                <span className="psc-value">{historyStats.total_plays}</span>
                <span className="psc-label">Tracks Played</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{historyStats.unique_tracks}</span>
                <span className="psc-label">Unique Tracks</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{historyStats.unique_artists}</span>
                <span className="psc-label">Artists</span>
              </div>
              <div className="profile-stat-card accent">
                <span className="psc-value">{historyStats.total_hours}h</span>
                <span className="psc-label">Total Listening</span>
              </div>
            </div>
          )}

          {history.length === 0 ? (
            <p style={{ color: "#666", textAlign: "center", padding: 20 }}>No play history yet. Load tracks in the Mixer to start logging!</p>
          ) : (
            <div className="play-history-list">
              <div className="ph-header">
                <span className="ph-col ph-title-col">Track</span>
                <span className="ph-col ph-artist-col">Artist</span>
                <span className="ph-col ph-genre-col">Genre</span>
                <span className="ph-col ph-deck-col">Deck</span>
                <span className="ph-col ph-date-col">Played</span>
              </div>
              {history.map((h) => (
                <div key={h.id} className="ph-row">
                  <span className="ph-col ph-title-col">{h.track_title}</span>
                  <span className="ph-col ph-artist-col">{h.track_artist}</span>
                  <span className="ph-col ph-genre-col"><span className="genre-tag">{h.genre || "—"}</span></span>
                  <span className="ph-col ph-deck-col">{h.deck_name || "—"}</span>
                  <span className="ph-col ph-date-col">{fmtDate(h.played_at)}</span>
                </div>
              ))}
            </div>
          )}

          {historyPages > 1 && (
            <div className="ml-pagination" style={{ marginTop: 12 }}>
              <button className="ml-page-btn" disabled={historyPage <= 1} onClick={() => setHistoryPage(1)}>«</button>
              <button className="ml-page-btn" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}>‹</button>
              <span className="ml-page-info">{historyPage} / {historyPages}</span>
              <button className="ml-page-btn" disabled={historyPage >= historyPages} onClick={() => setHistoryPage(p => p + 1)}>›</button>
              <button className="ml-page-btn" disabled={historyPage >= historyPages} onClick={() => setHistoryPage(historyPages)}>»</button>
            </div>
          )}
        </div>
      )}

      {/* ── Setlists Tab ── */}
      {activeTab === "setlists" && (
        <div className="profile-section">
          {!selectedSetlist ? (
            <>
              <h3 className="profile-section-title">📋 Session Set Lists</h3>
              {setlists.length === 0 ? (
                <p style={{ color: "#666", textAlign: "center", padding: 20 }}>
                  No sessions with tracks logged yet. Play tracks during a live session to build set lists!
                </p>
              ) : (
                <div className="setlist-list">
                  {setlists.map(s => (
                    <div key={s.session_id} className="setlist-row" onClick={() => viewSetlist(s.session_id)}>
                      <span className={`setlist-status ${s.active ? "live" : "done"}`}>
                        {s.active ? "🔴 LIVE" : "✅"}
                      </span>
                      <span className="setlist-date">{fmtDate(s.started_at)}</span>
                      <span className="setlist-venue">{s.pub_name || "No venue"}</span>
                      <span className="setlist-duration">{fmtDuration(s.duration_min)}</span>
                      <span className="setlist-count">{s.track_count} tracks</span>
                      <span className="setlist-arrow">→</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="setlist-detail-header">
                <button className="deck-btn" onClick={() => setSelectedSetlist(null)}>← Back to Set Lists</button>
                <h3 className="profile-section-title">
                  Set List — {fmtDate(selectedSetlist.session?.started_at)} ({setlistTracks.length} tracks)
                </h3>
                <button className="deck-btn export-setlist-btn" onClick={exportSetlist} title="Copy setlist to clipboard">
                  📋 Export
                </button>
              </div>
              {setlistTracks.length === 0 ? (
                <p style={{ color: "#666", textAlign: "center", padding: 20 }}>No tracks logged for this session.</p>
              ) : (
                <div className="setlist-tracks">
                  <div className="setlist-track-header">
                    <span className="stl-col stl-num">#</span>
                    <span className="stl-col stl-title">Track</span>
                    <span className="stl-col stl-artist">Artist</span>
                    <span className="stl-col stl-genre">Genre</span>
                    <span className="stl-col stl-bpm">BPM</span>
                    <span className="stl-col stl-deck">Deck</span>
                    <span className="stl-col stl-time">Time</span>
                  </div>
                  {setlistTracks.map((t, i) => (
                    <div key={i} className="setlist-track-row">
                      <span className="stl-col stl-num">{i + 1}</span>
                      <span className="stl-col stl-title">{t.track_title}</span>
                      <span className="stl-col stl-artist">{t.track_artist}</span>
                      <span className="stl-col stl-genre"><span className="genre-tag">{t.genre || "—"}</span></span>
                      <span className="stl-col stl-bpm">{t.bpm || "—"}</span>
                      <span className="stl-col stl-deck">{t.deck_name || "—"}</span>
                      <span className="stl-col stl-time">
                        {t.played_at ? new Date(t.played_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
