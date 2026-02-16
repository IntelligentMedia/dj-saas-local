import React, { useState, useRef, useCallback, useEffect } from "react";
import { getStreamDestination } from "../engine";
import { toast } from "../store/toastStore";

/**
 * MixRecorder — record the master audio bus to a downloadable file.
 * Uses MediaRecorder on the engine's MediaStreamDestination.
 */
export default function MixRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordings, setRecordings] = useState([]); // { url, name, size, duration }
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      recordings.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, []);

  const startRecording = useCallback(() => {
    try {
      const dest = getStreamDestination();
      const stream = dest.stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const duration = elapsed;
        const name = `mix-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.webm`;

        setRecordings((prev) => [
          { url, name, size: blob.size, duration },
          ...prev.slice(0, 9), // keep last 10
        ]);
      };

      recorder.start(1000); // 1s timeslice for frequent data
      recorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      toast.info("🎙️ Recording started");

      // Timer
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error("[MixRecorder] Failed to start:", err);
    }
  }, [elapsed]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecording(false);
    clearInterval(timerRef.current);
    toast.success("Recording saved!");
  }, []);

  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const fmtSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  return (
    <div className="mix-recorder">
      <div className="recorder-controls">
        {!recording ? (
          <button className="deck-btn recorder-btn" onClick={startRecording}>
            🔴 Record Mix
          </button>
        ) : (
          <button className="deck-btn recorder-btn recording" onClick={stopRecording}>
            ⏹ Stop ({fmtTime(elapsed)})
          </button>
        )}
        {recording && <span className="recorder-indicator">● REC</span>}
      </div>

      {recordings.length > 0 && (
        <div className="recorder-list">
          {recordings.map((r, i) => (
            <div key={i} className="recorder-item">
              <span className="recorder-name">{r.name}</span>
              <span className="recorder-meta">
                {fmtTime(r.duration)} · {fmtSize(r.size)}
              </span>
              <a className="deck-btn recorder-download" href={r.url} download={r.name}>
                ⬇ Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
