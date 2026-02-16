import React from "react";

export default function TrackQueue({ queue, onRemove, onReorder, onClear }) {
  const moveUp = (idx) => {
    if (idx <= 0) return;
    const next = [...queue];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onReorder(next);
  };

  const moveDown = (idx) => {
    if (idx >= queue.length - 1) return;
    const next = [...queue];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onReorder(next);
  };

  const extractName = (url) => {
    try {
      const parts = url.split("/");
      const filename = decodeURIComponent(parts[parts.length - 1] || parts[parts.length - 2] || "Track");
      return filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    } catch { return "Track"; }
  };

  return (
    <div className="track-queue-panel">
      <div className="tq-header">
        <h3 className="tq-title">📋 Track Queue</h3>
        <span className="tq-count">{queue.length} tracks</span>
        {queue.length > 0 && (
          <button className="tq-clear-btn" onClick={onClear} title="Clear queue">✕ Clear</button>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="tq-empty">
          <span>Queue is empty</span>
          <span className="tq-hint">Load tracks from the library to add to queue</span>
        </div>
      ) : (
        <div className="tq-list">
          {queue.map((item, idx) => (
            <div key={idx} className="tq-item">
              <span className="tq-pos">{idx + 1}</span>
              <span className="tq-name" title={typeof item === "string" ? item : item.title}>
                {typeof item === "object" && item.title ? `${item.title} — ${item.artist || ""}` : extractName(item)}
              </span>
              <div className="tq-controls">
                <button className="tq-btn" onClick={() => moveUp(idx)} disabled={idx === 0} title="Move up">▲</button>
                <button className="tq-btn" onClick={() => moveDown(idx)} disabled={idx === queue.length - 1} title="Move down">▼</button>
                <button className="tq-btn tq-remove" onClick={() => onRemove(idx)} title="Remove">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
