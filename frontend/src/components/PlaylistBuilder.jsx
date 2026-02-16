import React, { useState, useEffect } from "react";
import { apiFetch, getToken } from "../utils/api";

export default function PlaylistBuilder({ onLoadPlaylist, onLoadTrack }) {
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [loading, setLoading] = useState(false);

  // Create playlist form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => { loadPlaylists(); }, []);

  const loadPlaylists = async () => {
    try {
      const data = await apiFetch("/music/playlists");
      setPlaylists(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Failed to load playlists:", e); }
  };

  const loadPlaylistTracks = async (id) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/music/playlists/${id}/tracks`);
      setPlaylistTracks(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    try {
      const data = await apiFetch("/music/playlists", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      if (data.ok) {
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        loadPlaylists();
      }
    } catch (e) { console.error(e); }
  };

  const deletePlaylist = async (id) => {
    try {
      await apiFetch(`/music/playlists/${id}`, { method: "DELETE" });
      if (activePlaylist?.id === id) {
        setActivePlaylist(null);
        setPlaylistTracks([]);
      }
      loadPlaylists();
    } catch (e) { console.error(e); }
  };

  const removeTrack = async (trackId) => {
    if (!activePlaylist) return;
    try {
      await apiFetch(`/music/playlists/${activePlaylist.id}/tracks/${trackId}`, { method: "DELETE" });
      loadPlaylistTracks(activePlaylist.id);
      loadPlaylists(); // refresh counters
    } catch (e) { console.error(e); }
  };

  const openPlaylist = (pl) => {
    setActivePlaylist(pl);
    loadPlaylistTracks(pl.id);
  };

  const handleStreamTrack = async (track) => {
    try {
      const data = await apiFetch(`/music/tracks/${track.id}/stream`);
      if (data.stream_url && onLoadTrack) {
        const sep = data.stream_url.includes("?") ? "&" : "?";
        const authedUrl = `${data.stream_url}${sep}token=${getToken()}`;
        onLoadTrack({ ...track, stream_url: authedUrl });
      }
    } catch (e) { console.error(e); }
  };

  const fmtDuration = (sec) => {
    if (!sec) return "0:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="playlist-builder">
      <div className="pb-header">
        <h3 className="pb-title">📋 My Playlists</h3>
        <button className="ml-action-btn" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "✕" : "+ New"}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="pb-create-form">
          <input
            className="pb-input"
            placeholder="Playlist name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createPlaylist()}
          />
          <input
            className="pb-input"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <button className="deck-btn" onClick={createPlaylist}>Create</button>
        </div>
      )}

      {/* Playlist List */}
      {!activePlaylist && (
        <div className="pb-list">
          {playlists.length === 0 && <div className="pb-empty">No playlists yet. Create one!</div>}
          {playlists.map(pl => (
            <div key={pl.id} className="pb-playlist-card" onClick={() => openPlaylist(pl)}>
              <div className="pb-pl-info">
                <span className="pb-pl-name">{pl.name}</span>
                <span className="pb-pl-meta">
                  {pl.track_count} tracks · {fmtDuration(pl.total_duration)}
                  {pl.is_public ? " · 🌐 Public" : ""}
                </span>
              </div>
              <button className="ml-action-btn danger" onClick={e => { e.stopPropagation(); deletePlaylist(pl.id); }}>
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Playlist Tracks */}
      {activePlaylist && (
        <div className="pb-active">
          <div className="pb-active-header">
            <button className="ml-action-btn" onClick={() => { setActivePlaylist(null); setPlaylistTracks([]); }}>
              ← Back
            </button>
            <div className="pb-active-info">
              <span className="pb-active-name">{activePlaylist.name}</span>
              <span className="pb-active-count">{playlistTracks.length} tracks</span>
            </div>
            {onLoadPlaylist && playlistTracks.length > 0 && (
              <button className="deck-btn" onClick={() => onLoadPlaylist(playlistTracks)}>
                ▶ Load All
              </button>
            )}
          </div>

          <div className="pb-tracks">
            {loading && <div className="pb-empty">Loading...</div>}
            {!loading && playlistTracks.length === 0 && (
              <div className="pb-empty">Empty playlist. Browse the library to add tracks!</div>
            )}
            {playlistTracks.map((t, i) => (
              <div key={t.id} className="pb-track-row">
                <span className="pb-track-num">{i + 1}</span>
                <div className="pb-track-info">
                  <span className="pb-track-title">{t.title}</span>
                  <span className="pb-track-artist">{t.artist} · {t.bpm} BPM · {t.key_signature}</span>
                </div>
                <span className="pb-track-dur">{fmtDuration(t.duration_sec)}</span>
                <div className="pb-track-actions">
                  <button className="ml-action-btn" title="Load to Deck" onClick={() => handleStreamTrack(t)}>▶</button>
                  <button className="ml-action-btn danger" title="Remove" onClick={() => removeTrack(t.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
