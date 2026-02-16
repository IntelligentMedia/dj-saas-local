import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../utils/api";

const SORT_OPTIONS = [
  { value: "title", label: "Title A-Z" },
  { value: "artist", label: "Artist A-Z" },
  { value: "bpm", label: "BPM" },
  { value: "energy", label: "Energy" },
  { value: "plays", label: "Most Played" },
  { value: "newest", label: "Newest" },
];

const KEY_SIGNATURES = ["Am", "Bb", "Cm", "Dm", "Em", "Fm", "Gm", "Ab"];

export default function MusicLibrary({ onLoadTrack, onAddToPlaylist, onAddToQueue, compact = false }) {
  const [tracks, setTracks] = useState([]);
  const [genres, setGenres] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [favIds, setFavIds] = useState(new Set());
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  // Filters
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [bpmRange, setBpmRange] = useState([60, 200]);
  const [energyRange, setEnergyRange] = useState([1, 10]);
  const [keyFilter, setKeyFilter] = useState("");
  const [sort, setSort] = useState("title");
  const [sortOrder, setSortOrder] = useState("ASC");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = compact ? 15 : 30;

  // Expanded filter bar
  const [showFilters, setShowFilters] = useState(false);

  // Load genres on mount
  useEffect(() => {
    apiFetch("/music/genres").then(setGenres).catch(() => {});
    apiFetch("/music/stats").then(setStats).catch(() => {});
    apiFetch("/music/favorites/ids").then(d => setFavIds(new Set(d.ids || []))).catch(() => {});
  }, []);

  const toggleFav = async (trackId) => {
    const isFav = favIds.has(trackId);
    try {
      if (isFav) {
        await apiFetch(`/music/favorites/${trackId}`, { method: "DELETE" });
        setFavIds(prev => { const s = new Set(prev); s.delete(trackId); return s; });
      } else {
        await apiFetch(`/music/favorites/${trackId}`, { method: "POST" });
        setFavIds(prev => new Set(prev).add(trackId));
      }
    } catch (e) { console.error("Fav toggle failed:", e); }
  };

  // Load tracks when filters change
  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (genre) params.set("genre", genre);
      if (bpmRange[0] > 60) params.set("bpm_min", bpmRange[0]);
      if (bpmRange[1] < 200) params.set("bpm_max", bpmRange[1]);
      if (energyRange[0] > 1) params.set("energy_min", energyRange[0]);
      if (energyRange[1] < 10) params.set("energy_max", energyRange[1]);
      if (keyFilter) params.set("key", keyFilter);
      params.set("sort", sort);
      params.set("order", sortOrder);
      params.set("page", page);
      params.set("limit", limit);

      const data = await apiFetch(`/music/tracks?${params.toString()}`);
      setTracks(data.tracks || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (e) {
      console.error("Failed to load tracks:", e);
    }
    setLoading(false);
  }, [query, genre, bpmRange, energyRange, keyFilter, sort, sortOrder, page, limit]);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [query, genre, bpmRange, energyRange, keyFilter, sort, sortOrder]);

  const fmtDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const energyBar = (level) => {
    const blocks = [];
    for (let i = 1; i <= 10; i++) {
      blocks.push(
        <span key={i} className={`energy-block ${i <= level ? "filled" : ""}`}
              style={{ "--energy-hue": Math.round((level / 10) * 120) }} />
      );
    }
    return <span className="energy-bar">{blocks}</span>;
  };

  const handleStreamTrack = async (track) => {
    try {
      const data = await apiFetch(`/music/tracks/${track.id}/stream`);
      if (data.stream_url && onLoadTrack) {
        onLoadTrack({ ...track, stream_url: data.stream_url });
      }
    } catch (e) {
      console.error("Stream failed:", e);
    }
  };

  return (
    <div className={`music-library ${compact ? "compact" : ""}`}>
      {/* Header + Stats */}
      <div className="ml-header">
        <div className="ml-header-left">
          <h2 className="ml-title">☁️ Cloud Music Library</h2>
          {stats && (
            <span className="ml-stats-badge">
              {stats.total_tracks?.toLocaleString()} tracks · {stats.total_artists} artists · {stats.total_genres} genres
            </span>
          )}
        </div>
        <div className="ml-header-right">
          <span className="ml-stream-badge">🔒 Stream Only — No Downloads</span>
        </div>
      </div>

      {/* Search + Quick Filters */}
      <div className="ml-search-bar">
        <div className="ml-search-input-wrap">
          <span className="ml-search-icon">🔍</span>
          <input
            type="text"
            className="ml-search-input"
            placeholder="Search tracks, artists, albums..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && <button className="ml-search-clear" onClick={() => setQuery("")}>✕</button>}
        </div>

        <select className="ml-filter-select" value={genre} onChange={e => setGenre(e.target.value)}>
          <option value="">All Genres</option>
          {genres.map(g => (
            <option key={g.genre} value={g.genre}>{g.genre} ({g.count})</option>
          ))}
        </select>

        <select className="ml-filter-select" value={sort} onChange={e => setSort(e.target.value)}>
          {SORT_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <button className="ml-filter-btn" onClick={() => setSortOrder(o => o === "ASC" ? "DESC" : "ASC")}>
          {sortOrder === "ASC" ? "↑" : "↓"}
        </button>

        <button
          className={`ml-filter-btn ${showFilters ? "active" : ""}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          ⚙ Filters
        </button>

        <button
          className={`ml-filter-btn ${showFavsOnly ? "active" : ""}`}
          onClick={() => setShowFavsOnly(f => !f)}
          title="Show favorites only"
        >
          {showFavsOnly ? "❤️" : "🤍"} Favs
        </button>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="ml-advanced-filters">
          <div className="ml-filter-group">
            <label>BPM Range: {bpmRange[0]} - {bpmRange[1]}</label>
            <div className="ml-range-inputs">
              <input type="range" min="60" max="200" value={bpmRange[0]}
                onChange={e => setBpmRange([Number(e.target.value), bpmRange[1]])} />
              <input type="range" min="60" max="200" value={bpmRange[1]}
                onChange={e => setBpmRange([bpmRange[0], Number(e.target.value)])} />
            </div>
          </div>
          <div className="ml-filter-group">
            <label>Energy: {energyRange[0]} - {energyRange[1]}</label>
            <div className="ml-range-inputs">
              <input type="range" min="1" max="10" value={energyRange[0]}
                onChange={e => setEnergyRange([Number(e.target.value), energyRange[1]])} />
              <input type="range" min="1" max="10" value={energyRange[1]}
                onChange={e => setEnergyRange([energyRange[0], Number(e.target.value)])} />
            </div>
          </div>
          <div className="ml-filter-group">
            <label>Key</label>
            <select className="ml-filter-select" value={keyFilter} onChange={e => setKeyFilter(e.target.value)}>
              <option value="">Any Key</option>
              {KEY_SIGNATURES.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <button className="ml-filter-btn" onClick={() => {
            setBpmRange([60, 200]);
            setEnergyRange([1, 10]);
            setKeyFilter("");
            setGenre("");
            setQuery("");
          }}>
            ↺ Reset All
          </button>
        </div>
      )}

      {/* Results Count */}
      <div className="ml-results-info">
        {loading ? "Loading..." : `${total} tracks found`}
        {total > 0 && ` · Page ${page} of ${totalPages}`}
      </div>

      {/* Track List */}
      <div className="ml-track-list">
        <div className="ml-track-header">
          <span className="ml-th-fav"></span>
          <span className="ml-th-title">Title / Artist</span>
          <span className="ml-th-genre">Genre</span>
          <span className="ml-th-bpm">BPM</span>
          <span className="ml-th-key">Key</span>
          <span className="ml-th-energy">Energy</span>
          <span className="ml-th-dur">Duration</span>
          <span className="ml-th-actions">Actions</span>
        </div>

        {(showFavsOnly ? tracks.filter(t => favIds.has(t.id)) : tracks).map(track => (
          <div key={track.id} className={`ml-track-row ${favIds.has(track.id) ? "fav" : ""}`}>
            <button
              className={`ml-fav-btn ${favIds.has(track.id) ? "is-fav" : ""}`}
              onClick={() => toggleFav(track.id)}
              title={favIds.has(track.id) ? "Remove from favorites" : "Add to favorites"}
            >
              {favIds.has(track.id) ? "❤️" : "🤍"}
            </button>
            <div className="ml-track-info">
              <span className="ml-track-title">{track.title}</span>
              <span className="ml-track-artist">{track.artist}</span>
              {track.album && <span className="ml-track-album">{track.album}</span>}
            </div>
            <span className="ml-track-genre">
              <span className="genre-tag">{track.genre}</span>
            </span>
            <span className="ml-track-bpm">{track.bpm}</span>
            <span className="ml-track-key">{track.key_signature || "—"}</span>
            <span className="ml-track-energy">{energyBar(track.energy)}</span>
            <span className="ml-track-dur">{fmtDuration(track.duration_sec)}</span>
            <div className="ml-track-actions">
              <button className="ml-action-btn ml-load-btn" title="Load to Deck"
                onClick={() => handleStreamTrack(track)}>
                ▶
              </button>
              {onAddToQueue && (
                <button className="ml-action-btn ml-queue-btn" title="Add to Queue"
                  onClick={() => {
                    apiFetch(`/music/tracks/${track.id}/stream`).then(d => {
                      if (d.stream_url) onAddToQueue({ ...track, stream_url: d.stream_url });
                    }).catch(() => {});
                  }}>
                  📋
                </button>
              )}
              {onAddToPlaylist && (
                <button className="ml-action-btn ml-playlist-btn" title="Add to Playlist"
                  onClick={() => onAddToPlaylist(track)}>
                  +
                </button>
              )}
            </div>
          </div>
        ))}

        {!loading && tracks.length === 0 && (
          <div className="ml-no-results">No tracks match your filters</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ml-pagination">
          <button className="ml-page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
          <button className="ml-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
          <span className="ml-page-info">{page} / {totalPages}</span>
          <button className="ml-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          <button className="ml-page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
        </div>
      )}
    </div>
  );
}
