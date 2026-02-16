import React, { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";

const DAYS = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
  ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
];

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Dubai",
  "Australia/Sydney", "Pacific/Auckland",
];

const CROSSFADER_CURVES = [
  ["linear", "Linear"], ["logarithmic", "Logarithmic"], ["constant", "Constant Power"],
];

const EQ_PRESETS = [
  ["flat", "Flat"], ["bass_boost", "Bass Boost"], ["treble_boost", "Treble Boost"],
  ["mid_scoop", "Mid Scoop"], ["vocal_boost", "Vocal Boost"], ["club", "Club"],
];

const MIXER_MODES = [
  ["standard", "Standard"], ["performance", "Performance"], ["broadcast", "Broadcast"], ["practice", "Practice"],
];

const TRANSITION_STYLES = [
  ["smooth", "Smooth"], ["cut", "Cut"], ["echo", "Echo"], ["backspin", "Backspin"],
];

export default function DJSettings() {
  const [tab, setTab] = useState("profile");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("ok"); // ok | err
  const [loading, setLoading] = useState(true);

  // Profile
  const [profile, setProfile] = useState({ username: "", bio: "", genres: "", social_links: "", avatar_url: "", hourly_rate: 50 });
  // Audio
  const [audio, setAudio] = useState({ crossfader_curve: "linear", default_eq_preset: "flat", auto_gain: true, default_mixer_mode: "standard", bpm_sync_enabled: true, auto_mix_transition: "smooth" });
  // Notifications
  const [notif, setNotif] = useState({ notify_bookings: true, notify_requests: true, notify_chat: true, notify_sound: true });
  // Availability
  const [avail, setAvail] = useState({ days: "mon,tue,wed,thu,fri,sat,sun", start: "18:00", end: "02:00", timezone: "UTC" });
  // Password
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm_password: "" });

  const flash = (text, type = "ok") => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 3000);
  };

  const loadSettings = async () => {
    try {
      const d = await apiFetch("/profile/dj-settings");
      if (d.profile) setProfile(d.profile);
      if (d.audio) setAudio(d.audio);
      if (d.notifications) setNotif(d.notifications);
      setAvail({
        days: d.availability.days,
        start: (d.availability.start || "18:00").slice(0, 5),
        end: (d.availability.end || "02:00").slice(0, 5),
        timezone: d.availability.timezone,
      });
    } catch { flash("Failed to load settings", "err"); }
    setLoading(false);
  };

  useEffect(() => { loadSettings(); }, []);

  // ── Save handlers ──

  const saveProfile = async () => {
    try {
      await apiFetch("/profile/dj-settings/profile", { method: "PUT", body: JSON.stringify(profile) });
      flash("Profile saved ✓");
    } catch (e) { flash(e.message || "Save failed", "err"); }
  };

  const saveAudio = async () => {
    try {
      await apiFetch("/profile/dj-settings/audio", { method: "PUT", body: JSON.stringify(audio) });
      flash("Audio preferences saved ✓");
    } catch { flash("Save failed", "err"); }
  };

  const saveNotif = async () => {
    try {
      await apiFetch("/profile/dj-settings/notifications", { method: "PUT", body: JSON.stringify(notif) });
      flash("Notification settings saved ✓");
    } catch { flash("Save failed", "err"); }
  };

  const saveAvail = async () => {
    try {
      await apiFetch("/profile/dj-settings/availability", { method: "PUT", body: JSON.stringify(avail) });
      flash("Availability saved ✓");
    } catch { flash("Save failed", "err"); }
  };

  const changePassword = async () => {
    if (!pw.current_password || !pw.new_password) return flash("Fill all password fields", "err");
    if (pw.new_password !== pw.confirm_password) return flash("Passwords don't match", "err");
    if (pw.new_password.length < 4) return flash("New password must be at least 4 chars", "err");
    try {
      await apiFetch("/profile/dj-settings/password", {
        method: "PUT",
        body: JSON.stringify({ current_password: pw.current_password, new_password: pw.new_password }),
      });
      setPw({ current_password: "", new_password: "", confirm_password: "" });
      flash("Password changed ✓");
    } catch (e) { flash(e.message || "Password change failed", "err"); }
  };

  // ── Availability day toggle ──
  const toggleDay = (day) => {
    const arr = avail.days.split(",").filter(Boolean);
    const newDays = arr.includes(day) ? arr.filter(d => d !== day) : [...arr, day];
    setAvail({ ...avail, days: newDays.join(",") });
  };

  if (loading) return <div className="page-spinner"><div className="spinner-ring" /><span>Loading settings…</span></div>;

  return (
    <div className="dj-settings-page">
      <h1 className="page-title">⚙️ DJ Settings</h1>

      {msg && <div className={`djs-msg ${msgType}`}>{msg}</div>}

      {/* Tab bar */}
      <div className="djs-tabs">
        {[["profile", "👤 Profile"], ["audio", "🎛️ Audio"], ["notifications", "🔔 Notifications"], ["availability", "📅 Availability"], ["account", "🔒 Account"]].map(([k, l]) => (
          <button key={k} className={`djs-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ═══ Profile Tab ═══ */}
      {tab === "profile" && (
        <div className="djs-panel">
          <h3>👤 Profile Information</h3>

          <div className="djs-field">
            <label>Display Name</label>
            <input className="djs-input" value={profile.username}
              onChange={e => setProfile({ ...profile, username: e.target.value })} />
          </div>

          <div className="djs-field">
            <label>Bio / About</label>
            <textarea className="djs-textarea" rows={4} value={profile.bio} placeholder="Tell pubs and listeners about yourself…"
              onChange={e => setProfile({ ...profile, bio: e.target.value })} />
          </div>

          <div className="djs-field">
            <label>Genres (comma separated)</label>
            <input className="djs-input" value={profile.genres} placeholder="House, Techno, Drum & Bass, Hip-Hop"
              onChange={e => setProfile({ ...profile, genres: e.target.value })} />
          </div>

          <div className="djs-field">
            <label>Avatar URL</label>
            <input className="djs-input" value={profile.avatar_url} placeholder="https://example.com/avatar.jpg"
              onChange={e => setProfile({ ...profile, avatar_url: e.target.value })} />
            {profile.avatar_url && (
              <img src={profile.avatar_url} alt="Avatar preview" className="djs-avatar-preview" onError={e => e.target.style.display = "none"} />
            )}
          </div>

          <div className="djs-field">
            <label>Social Links (comma separated URLs)</label>
            <input className="djs-input" value={profile.social_links} placeholder="https://instagram.com/mydj, https://soundcloud.com/mydj"
              onChange={e => setProfile({ ...profile, social_links: e.target.value })} />
          </div>

          <div className="djs-field">
            <label>Hourly Rate ($)</label>
            <input className="djs-input" type="number" min={10} max={500} value={profile.hourly_rate}
              onChange={e => setProfile({ ...profile, hourly_rate: Number(e.target.value) })} />
            <span className="djs-hint">$10 – $500 per hour</span>
          </div>

          <button className="djs-save-btn" onClick={saveProfile}>💾 Save Profile</button>
        </div>
      )}

      {/* ═══ Audio Tab ═══ */}
      {tab === "audio" && (
        <div className="djs-panel">
          <h3>🎛️ Audio Preferences</h3>
          <p className="djs-subtitle">Default settings applied when you start a new mixer session.</p>

          <div className="djs-field">
            <label>Crossfader Curve</label>
            <div className="djs-option-grid">
              {CROSSFADER_CURVES.map(([v, l]) => (
                <button key={v} className={`djs-option ${audio.crossfader_curve === v ? "active" : ""}`}
                  onClick={() => setAudio({ ...audio, crossfader_curve: v })}>{l}</button>
              ))}
            </div>
          </div>

          <div className="djs-field">
            <label>Default EQ Preset</label>
            <div className="djs-option-grid">
              {EQ_PRESETS.map(([v, l]) => (
                <button key={v} className={`djs-option ${audio.default_eq_preset === v ? "active" : ""}`}
                  onClick={() => setAudio({ ...audio, default_eq_preset: v })}>{l}</button>
              ))}
            </div>
          </div>

          <div className="djs-field">
            <label>Default Mixer Mode</label>
            <div className="djs-option-grid">
              {MIXER_MODES.map(([v, l]) => (
                <button key={v} className={`djs-option ${audio.default_mixer_mode === v ? "active" : ""}`}
                  onClick={() => setAudio({ ...audio, default_mixer_mode: v })}>{l}</button>
              ))}
            </div>
          </div>

          <div className="djs-field">
            <label>Auto-Mix Transition Style</label>
            <div className="djs-option-grid">
              {TRANSITION_STYLES.map(([v, l]) => (
                <button key={v} className={`djs-option ${audio.auto_mix_transition === v ? "active" : ""}`}
                  onClick={() => setAudio({ ...audio, auto_mix_transition: v })}>{l}</button>
              ))}
            </div>
          </div>

          <div className="djs-toggles">
            <div className="djs-toggle-row">
              <span>Auto-Gain Normalization</span>
              <button className={`djs-toggle ${audio.auto_gain ? "on" : "off"}`}
                onClick={() => setAudio({ ...audio, auto_gain: !audio.auto_gain })}>
                {audio.auto_gain ? "ON" : "OFF"}
              </button>
            </div>
            <div className="djs-toggle-row">
              <span>BPM Sync</span>
              <button className={`djs-toggle ${audio.bpm_sync_enabled ? "on" : "off"}`}
                onClick={() => setAudio({ ...audio, bpm_sync_enabled: !audio.bpm_sync_enabled })}>
                {audio.bpm_sync_enabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <button className="djs-save-btn" onClick={saveAudio}>💾 Save Audio Settings</button>
        </div>
      )}

      {/* ═══ Notifications Tab ═══ */}
      {tab === "notifications" && (
        <div className="djs-panel">
          <h3>🔔 Notification Preferences</h3>

          <div className="djs-toggles">
            <div className="djs-toggle-row">
              <div>
                <span className="djs-toggle-label">📅 Booking Alerts</span>
                <span className="djs-toggle-desc">New bookings, confirmations & cancellations</span>
              </div>
              <button className={`djs-toggle ${notif.notify_bookings ? "on" : "off"}`}
                onClick={() => setNotif({ ...notif, notify_bookings: !notif.notify_bookings })}>
                {notif.notify_bookings ? "ON" : "OFF"}
              </button>
            </div>
            <div className="djs-toggle-row">
              <div>
                <span className="djs-toggle-label">🎵 Song Requests</span>
                <span className="djs-toggle-desc">When listeners request songs during your set</span>
              </div>
              <button className={`djs-toggle ${notif.notify_requests ? "on" : "off"}`}
                onClick={() => setNotif({ ...notif, notify_requests: !notif.notify_requests })}>
                {notif.notify_requests ? "ON" : "OFF"}
              </button>
            </div>
            <div className="djs-toggle-row">
              <div>
                <span className="djs-toggle-label">💬 Chat Messages</span>
                <span className="djs-toggle-desc">Live chat messages from listeners</span>
              </div>
              <button className={`djs-toggle ${notif.notify_chat ? "on" : "off"}`}
                onClick={() => setNotif({ ...notif, notify_chat: !notif.notify_chat })}>
                {notif.notify_chat ? "ON" : "OFF"}
              </button>
            </div>
            <div className="djs-toggle-row">
              <div>
                <span className="djs-toggle-label">🔊 Notification Sounds</span>
                <span className="djs-toggle-desc">Play audio chime for notifications</span>
              </div>
              <button className={`djs-toggle ${notif.notify_sound ? "on" : "off"}`}
                onClick={() => setNotif({ ...notif, notify_sound: !notif.notify_sound })}>
                {notif.notify_sound ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <button className="djs-save-btn" onClick={saveNotif}>💾 Save Notifications</button>
        </div>
      )}

      {/* ═══ Availability Tab ═══ */}
      {tab === "availability" && (
        <div className="djs-panel">
          <h3>📅 Availability Schedule</h3>
          <p className="djs-subtitle">Set when you're available for bookings. Pubs will see this when browsing DJs.</p>

          <div className="djs-field">
            <label>Available Days</label>
            <div className="djs-days-grid">
              {DAYS.map(([val, label]) => (
                <button key={val}
                  className={`djs-day ${avail.days.split(",").includes(val) ? "active" : ""}`}
                  onClick={() => toggleDay(val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="djs-time-row">
            <div className="djs-field">
              <label>Start Time</label>
              <input className="djs-input" type="time" value={avail.start}
                onChange={e => setAvail({ ...avail, start: e.target.value })} />
            </div>
            <div className="djs-field">
              <label>End Time</label>
              <input className="djs-input" type="time" value={avail.end}
                onChange={e => setAvail({ ...avail, end: e.target.value })} />
            </div>
          </div>

          <div className="djs-field">
            <label>Timezone</label>
            <select className="djs-input" value={avail.timezone}
              onChange={e => setAvail({ ...avail, timezone: e.target.value })}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
            </select>
          </div>

          <button className="djs-save-btn" onClick={saveAvail}>💾 Save Availability</button>
        </div>
      )}

      {/* ═══ Account Tab ═══ */}
      {tab === "account" && (
        <div className="djs-panel">
          <h3>🔒 Account Security</h3>

          <div className="djs-field">
            <label>Current Password</label>
            <input className="djs-input" type="password" value={pw.current_password}
              onChange={e => setPw({ ...pw, current_password: e.target.value })} />
          </div>
          <div className="djs-field">
            <label>New Password</label>
            <input className="djs-input" type="password" value={pw.new_password}
              onChange={e => setPw({ ...pw, new_password: e.target.value })} />
          </div>
          <div className="djs-field">
            <label>Confirm New Password</label>
            <input className="djs-input" type="password" value={pw.confirm_password}
              onChange={e => setPw({ ...pw, confirm_password: e.target.value })} />
          </div>

          <button className="djs-save-btn" onClick={changePassword}>🔑 Change Password</button>
        </div>
      )}
    </div>
  );
}
