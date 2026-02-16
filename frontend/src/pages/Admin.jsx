import React, { useEffect, useState } from "react";
import { api, apiFetch, getUser } from "../utils/api";
import ConfirmDialog from "../components/ConfirmDialog";

const ROLE_LABELS = {
  dj: "🎧 DJ", pub: "🍻 Pub", admin: "🛡️ Admin",
  sysadmin: "🔧 Sys Admin", accountant: "📊 Accountant",
  support: "🎗️ Support", sales: "💼 Sales", marketing: "📣 Marketing"
};

export default function Admin() {
  const currentUser = getUser();
  const [perms, setPerms] = useState(null);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("dj");
  const [msg, setMsg] = useState("");

  // Music Library Admin
  const [libStats, setLibStats] = useState(null);
  const [libTracks, setLibTracks] = useState([]);
  const [libPage, setLibPage] = useState(1);
  const [libTotal, setLibTotal] = useState(0);
  const [libPages, setLibPages] = useState(1);
  const [newTrack, setNewTrack] = useState({ title: "", artist: "", genre: "House", bpm: 120, stream_url: "" });

  const [paySettings, setPaySettings] = useState({});
  const [payPlans, setPayPlans] = useState([]);

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState(null); // { title, message, onConfirm }
  const [paySummary, setPaySummary] = useState(null);
  const [payMsg, setPayMsg] = useState("");
  const [editPlan, setEditPlan] = useState(null);
  const [planForm, setPlanForm] = useState({ name: "", price: 0, max_hours_per_month: 0, max_bookings_per_month: 0, commission_rate: 20, features: "" });
  const [payTab, setPayTab] = useState("settings"); // settings | plans | transactions

  // Landing Page Content Manager
  const [lc, setLc] = useState({});
  const [lcTab, setLcTab] = useState("branding");
  const [lcMsg, setLcMsg] = useState("");

  // Employee Role Management
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleDetail, setRoleDetail] = useState(null);
  const [roleMsg, setRoleMsg] = useState("");
  const [editingRole, setEditingRole] = useState(false);
  const [roleForm, setRoleForm] = useState({ display_name: "", description: "", color: "", permissions: {} });
  const [changeRoleUser, setChangeRoleUser] = useState(null);
  const [changeRoleTarget, setChangeRoleTarget] = useState("");

  const loadUsers = async () => {
    try {
      const res = await api("/admin/users");
      if (res.ok) setUsers(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadStats = async () => {
    try {
      const res = await api("/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    // Load permissions for current user
    apiFetch("/admin/me").then(d => setPerms(d.permissions)).catch(() => {
      // Fallback: admin sees everything
      if (currentUser?.role === "admin" || currentUser?.role === "sysadmin") {
        setPerms({ users: true, stats: true, payment_settings: true, payment_summary: true, plans: true, billing: true, landing: true, music: true, activation: true, bookings_admin: true });
      }
    });
    loadUsers();
    loadStats();
    loadLibStats();
    loadLibTracks();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { loadLibTracks(); }, [libPage]);

  // Payment settings loaders
  const loadPaySettings = async () => {
    try { const d = await apiFetch("/admin/payment-settings"); setPaySettings(d); } catch {}
  };
  const loadPayPlans = async () => {
    try { const d = await apiFetch("/admin/plans"); setPayPlans(d); } catch {}
  };
  const loadPaySummary = async () => {
    try { const d = await apiFetch("/admin/payment-summary"); setPaySummary(d); } catch {}
  };
  useEffect(() => { loadPaySettings(); loadPayPlans(); loadPaySummary(); }, []);

  // Landing content loaders
  const loadLanding = async () => {
    try { const d = await apiFetch("/admin/landing"); setLc(d); } catch {}
  };
  const saveLc = async (updates) => {
    try {
      await apiFetch("/admin/landing", { method: "PUT", body: JSON.stringify(updates) });
      setLcMsg("Saved ✓");
      loadLanding();
      setTimeout(() => setLcMsg(""), 2000);
    } catch { setLcMsg("Save failed"); }
  };
  const lcField = (key, val) => setLc(prev => ({ ...prev, [key]: val }));
  const lcJson = (key) => {
    try { return typeof lc[key] === "string" ? JSON.parse(lc[key]) : (lc[key] || []); } catch { return []; }
  };
  const lcJsonObj = (key) => {
    try { return typeof lc[key] === "string" ? JSON.parse(lc[key]) : (lc[key] || {}); } catch { return {}; }
  };
  useEffect(() => { loadLanding(); }, []);

  // Role management loaders
  const PERM_LABELS = {
    users: "👥 User Management", stats: "📊 Platform Stats", payment_settings: "⚙️ Payment Settings",
    payment_summary: "💰 Payment Summary", plans: "📋 Subscription Plans", billing: "🧾 Billing",
    landing: "🌐 Landing Page", music: "🎵 Music Library", activation: "🔑 Activation Codes",
    bookings_admin: "📅 Bookings Admin", dj_features: "🎧 DJ Features"
  };

  const loadRoles = async () => {
    try { const d = await apiFetch("/admin/roles"); setRoles(d); } catch {}
  };
  const loadRoleDetail = async (roleName) => {
    try {
      const d = await apiFetch(`/admin/roles/${roleName}`);
      setRoleDetail(d);
      setSelectedRole(roleName);
      setRoleForm({ display_name: d.display_name, description: d.description, color: d.color, permissions: d.permissions || {} });
      setEditingRole(false);
    } catch { setRoleMsg("Failed to load role"); }
  };
  const saveRole = async () => {
    try {
      await apiFetch(`/admin/roles/${selectedRole}`, { method: "PUT", body: JSON.stringify(roleForm) });
      setRoleMsg("Role updated ✓");
      setEditingRole(false);
      loadRoles();
      loadRoleDetail(selectedRole);
      setTimeout(() => setRoleMsg(""), 2500);
    } catch { setRoleMsg("Save failed"); }
  };
  const changeUserRole = async (userId, newRole) => {
    try {
      await apiFetch(`/admin/roles/change-user-role/${userId}`, { method: "PUT", body: JSON.stringify({ role: newRole }) });
      setRoleMsg("User role changed ✓");
      loadRoleDetail(selectedRole);
      loadRoles();
      loadUsers();
      setChangeRoleUser(null);
      setTimeout(() => setRoleMsg(""), 2500);
    } catch { setRoleMsg("Failed to change role"); }
  };
  useEffect(() => { if (currentUser?.role === "admin" || currentUser?.role === "sysadmin") loadRoles(); }, []);

  const savePaySettings = async (updates) => {
    try {
      await apiFetch("/admin/payment-settings", { method: "PUT", body: JSON.stringify(updates) });
      setPayMsg("Settings saved ✓");
      loadPaySettings();
      setTimeout(() => setPayMsg(""), 2000);
    } catch { setPayMsg("Save failed"); }
  };

  const togglePayMethod = (method) => {
    let methods = [];
    try { methods = JSON.parse(paySettings.accepted_methods || "[]"); } catch {}
    if (methods.includes(method)) methods = methods.filter(m => m !== method);
    else methods.push(method);
    savePaySettings({ accepted_methods: JSON.stringify(methods) });
  };

  const savePlan = async () => {
    if (!planForm.name || planForm.price === undefined) return setPayMsg("Name and price required");
    try {
      if (editPlan) {
        await apiFetch(`/admin/plans/${editPlan}`, { method: "PUT", body: JSON.stringify(planForm) });
        setPayMsg("Plan updated ✓");
      } else {
        await apiFetch("/admin/plans", { method: "POST", body: JSON.stringify(planForm) });
        setPayMsg("Plan created ✓");
      }
      setEditPlan(null);
      setPlanForm({ name: "", price: 0, max_hours_per_month: 0, max_bookings_per_month: 0, commission_rate: 20, features: "" });
      loadPayPlans();
      setTimeout(() => setPayMsg(""), 2000);
    } catch { setPayMsg("Save plan failed"); }
  };

  const deletePlan = async (id) => {
    setConfirmAction({
      title: "Delete Plan",
      message: "This will permanently remove this subscription plan. Existing subscribers won't be affected.",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await apiFetch(`/admin/plans/${id}`, { method: "DELETE" });
          loadPayPlans();
          setPayMsg("Plan deleted");
          setTimeout(() => setPayMsg(""), 2000);
        } catch { setPayMsg("Delete failed"); }
      }
    });
  };

  const togglePlan = async (id) => {
    try {
      await apiFetch(`/admin/plans/${id}/toggle`, { method: "PATCH" });
      loadPayPlans();
      setPayMsg("Plan toggled \u2713");
      setTimeout(() => setPayMsg(""), 2000);
    } catch { setPayMsg("Toggle failed"); }
  };

  const startEditPlan = (p) => {
    setEditPlan(p.id);
    setPlanForm({ name: p.name, price: p.price, max_hours_per_month: p.max_hours_per_month, max_bookings_per_month: p.max_bookings_per_month, commission_rate: p.commission_rate, features: p.features || "" });
  };

  const loadLibStats = async () => {
    try { const s = await apiFetch("/music/stats"); setLibStats(s); } catch {}
  };

  const loadLibTracks = async () => {
    try {
      const data = await apiFetch(`/music/tracks?page=${libPage}&limit=20&sort=newest&order=DESC`);
      setLibTracks(data.tracks || []);
      setLibTotal(data.pagination?.total || 0);
      setLibPages(data.pagination?.pages || 1);
    } catch {}
  };

  const addTrack = async () => {
    if (!newTrack.title || !newTrack.artist || !newTrack.stream_url) return setMsg("Fill title, artist, stream URL");
    try {
      await apiFetch("/music/admin/tracks", {
        method: "POST",
        body: JSON.stringify(newTrack),
      });
      setNewTrack({ title: "", artist: "", genre: "House", bpm: 120, stream_url: "" });
      setMsg("Track added!");
      loadLibStats();
      loadLibTracks();
    } catch { setMsg("Failed to add track"); }
  };

  const deleteTrack = async (id) => {
    setConfirmAction({
      title: "Remove Track",
      message: "This track will be permanently removed from the music library.",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await apiFetch(`/music/admin/tracks/${id}`, { method: "DELETE" });
          loadLibStats();
          loadLibTracks();
        } catch {}
      }
    });
  };

  const createUser = async () => {
    setMsg("");
    if (!newUser || !newPass) return setMsg("Fill all fields");
    const res = await api("/admin/create-user", {
      method: "POST",
      body: JSON.stringify({ username: newUser, password: newPass, role: newRole })
    });
    if (res.ok) {
      setMsg("User created");
      setNewUser(""); setNewPass("");
      loadUsers();
    } else setMsg("Failed");
  };

  const deleteUser = async (id) => {
    const targetUser = users.find(u => u.id === id);
    setConfirmAction({
      title: "Delete User",
      message: `Permanently delete user "${targetUser?.username || id}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmAction(null);
        const res = await api("/admin/delete-user/" + id, { method: "DELETE" });
        if (res.ok) loadUsers();
      }
    });
  };

  const approveUser = async (id) => {
    const res = await api("/admin/approve/" + id, { method: "POST" });
    if (res.ok) loadUsers();
  };

  return (
    <div className="admin-page">
      <h1 className="page-title">🛡️ Admin Control Center</h1>
      <p className="role-indicator">Logged in as <span className={`role-badge role-${currentUser?.role}`}>{ROLE_LABELS[currentUser?.role] || currentUser?.role}</span></p>

      {/* Stats — admin, sysadmin */}
      {perms?.stats && stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.djs}</div>
            <div className="stat-label">🎧 DJs</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.pubs}</div>
            <div className="stat-label">🍻 Pubs</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.employees || 0}</div>
            <div className="stat-label">👔 Employees</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalRooms}</div>
            <div className="stat-label">📡 Live Rooms</div>
          </div>
        </div>
      )}

      {/* Live Rooms — admin, sysadmin */}
      {perms?.stats && stats?.rooms?.length > 0 && (
        <div className="admin-section">
          <h3>📡 Live Rooms</h3>
          <div className="stream-map">
            {stats.rooms.map((r, i) => (
              <div key={i} className="stream-row">
                Room: {r.name} → Listeners: {r.listeners}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create User — admin, sysadmin only */}
      {(currentUser?.role === "admin" || currentUser?.role === "sysadmin") && (
      <div className="admin-section">
        <h3>➕ Create User</h3>
        {msg && <div className="admin-msg">{msg}</div>}
        <div className="admin-form">
          <input className="admin-input" placeholder="Username" value={newUser}
            onChange={e => setNewUser(e.target.value)} />
          <input className="admin-input" placeholder="Password" value={newPass}
            onChange={e => setNewPass(e.target.value)} />
          <select className="admin-input" value={newRole} onChange={e => setNewRole(e.target.value)}>
            <option value="dj">🎧 DJ</option>
            <option value="pub">🍻 Pub</option>
            <option value="admin">🛡️ Admin</option>
            <option value="sysadmin">🔧 System Admin</option>
            <option value="accountant">📊 Accountant</option>
            <option value="support">🎗️ Support</option>
            <option value="sales">💼 Sales</option>
            <option value="marketing">📣 Marketing</option>
          </select>
          <button className="deck-btn" onClick={createUser}>Create</button>
        </div>
      </div>
      )}

      {/* User List — admin, sysadmin, support */}
      {perms?.users && (
      <div className="admin-section">
        <h3>👥 Users ({users.length})</h3>
        <table className="admin-table">
          <thead>
            <tr><th>ID</th><th>Username</th><th>Role</th><th>Approved</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td><span className={`role-badge role-${u.role}`}>{ROLE_LABELS[u.role] || u.role}</span></td>
                <td>{u.approved ? "✅" : "⏳"}</td>
                <td>
                  {!u.approved && <button className="small-btn" onClick={() => approveUser(u.id)}>Approve</button>}
                  {(currentUser?.role === "admin" || currentUser?.role === "sysadmin") &&
                    <button className="small-btn danger" onClick={() => deleteUser(u.id)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* ══════ Employee Role Details — admin, sysadmin ══════ */}
      {(currentUser?.role === "admin" || currentUser?.role === "sysadmin") && (
      <div className="admin-section role-mgmt-section">
        <h3>👔 Employee Role Details</h3>
        {roleMsg && <div className="admin-msg">{roleMsg}</div>}

        {/* Role Cards Grid */}
        <div className="role-cards-grid">
          {roles.map(r => (
            <div key={r.role_name}
              className={`role-card ${selectedRole === r.role_name ? "selected" : ""}`}
              style={{ borderColor: r.color }}
              onClick={() => loadRoleDetail(r.role_name)}>
              <div className="role-card-header">
                <span className="role-card-icon" style={{ color: r.color }}>{ROLE_LABELS[r.role_name]?.split(" ")[0] || "👤"}</span>
                <div>
                  <h4 className="role-card-title">{r.display_name}</h4>
                  <span className="role-card-count">{r.user_count} user{r.user_count !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="role-card-perms">
                {Object.entries(r.permissions || {}).filter(([,v]) => v).length} permissions
              </div>
              <div className="role-card-color-dot" style={{ background: r.color }} />
            </div>
          ))}
        </div>

        {/* Role Detail Panel */}
        {roleDetail && selectedRole && (
          <div className="role-detail-panel" style={{ borderColor: roleDetail.color }}>
            <div className="role-detail-header">
              <div>
                <h3 style={{ color: roleDetail.color }}>{roleDetail.display_name}</h3>
                <p className="role-detail-desc">{roleDetail.description}</p>
              </div>
              <div className="role-detail-actions">
                {!editingRole ? (
                  <button className="deck-btn" onClick={() => setEditingRole(true)}>✏️ Edit Role</button>
                ) : (
                  <>
                    <button className="deck-btn" onClick={saveRole}>💾 Save</button>
                    <button className="small-btn" onClick={() => { setEditingRole(false); setRoleForm({ display_name: roleDetail.display_name, description: roleDetail.description, color: roleDetail.color, permissions: roleDetail.permissions || {} }); }}>Cancel</button>
                  </>
                )}
                <button className="small-btn" onClick={() => { setSelectedRole(null); setRoleDetail(null); setEditingRole(false); }}>✕ Close</button>
              </div>
            </div>

            {/* Edit Form */}
            {editingRole && (
              <div className="role-edit-form">
                <div className="role-edit-row">
                  <div className="djs-field">
                    <label>Display Name</label>
                    <input className="admin-input" value={roleForm.display_name}
                      onChange={e => setRoleForm({ ...roleForm, display_name: e.target.value })} />
                  </div>
                  <div className="djs-field">
                    <label>Color</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="color" value={roleForm.color} onChange={e => setRoleForm({ ...roleForm, color: e.target.value })} style={{ width: 40, height: 32, border: "none", cursor: "pointer" }} />
                      <input className="admin-input" value={roleForm.color} onChange={e => setRoleForm({ ...roleForm, color: e.target.value })} style={{ width: 100 }} />
                    </div>
                  </div>
                </div>
                <div className="djs-field">
                  <label>Description</label>
                  <textarea className="admin-input" rows={3} value={roleForm.description}
                    onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} style={{ width: "100%", resize: "vertical" }} />
                </div>
              </div>
            )}

            {/* Permissions Grid */}
            <div className="role-perms-section">
              <h4>🔐 Permissions</h4>
              <div className="role-perms-grid">
                {Object.entries(PERM_LABELS).map(([perm, label]) => {
                  const enabled = editingRole ? roleForm.permissions?.[perm] : roleDetail.permissions?.[perm];
                  const isProtected = (selectedRole === "admin" || selectedRole === "sysadmin");
                  return (
                    <div key={perm} className={`role-perm-chip ${enabled ? "on" : "off"} ${isProtected && !editingRole ? "protected" : ""}`}
                      onClick={() => {
                        if (editingRole && !isProtected) {
                          setRoleForm({ ...roleForm, permissions: { ...roleForm.permissions, [perm]: !enabled } });
                        }
                      }}
                      title={isProtected ? "Admin/SysAdmin always have full access" : (editingRole ? "Click to toggle" : "")}>
                      <span className="perm-icon">{enabled ? "✅" : "❌"}</span>
                      <span className="perm-label">{label}</span>
                    </div>
                  );
                })}
              </div>
              {(selectedRole === "admin" || selectedRole === "sysadmin") && (
                <p className="role-perm-note">🔒 Admin and System Admin roles always have full access and cannot be restricted.</p>
              )}
            </div>

            {/* Users with this Role */}
            <div className="role-users-section">
              <h4>👥 Users with this Role ({roleDetail.users?.length || 0})</h4>
              {roleDetail.users?.length > 0 ? (
                <table className="admin-table">
                  <thead>
                    <tr><th>ID</th><th>Username</th><th>Approved</th><th>Created</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {roleDetail.users.map(u => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>{u.username}</td>
                        <td>{u.approved ? "✅" : "⏳"}</td>
                        <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                        <td>
                          {changeRoleUser === u.id ? (
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <select className="admin-input" value={changeRoleTarget} onChange={e => setChangeRoleTarget(e.target.value)} style={{ width: 120, padding: "2px 4px", fontSize: "0.8rem" }}>
                                <option value="">Select role…</option>
                                {Object.entries(ROLE_LABELS).filter(([r]) => r !== selectedRole).map(([r, l]) => (
                                  <option key={r} value={r}>{l}</option>
                                ))}
                              </select>
                              <button className="small-btn" disabled={!changeRoleTarget} onClick={() => changeUserRole(u.id, changeRoleTarget)}>✓</button>
                              <button className="small-btn" onClick={() => setChangeRoleUser(null)}>✕</button>
                            </div>
                          ) : (
                            <button className="small-btn" onClick={() => { setChangeRoleUser(u.id); setChangeRoleTarget(""); }}>🔄 Change Role</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ opacity: 0.6, fontStyle: "italic" }}>No users assigned to this role yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* ══════ Music Library Management — admin, sysadmin ══════ */}
      {perms?.music && (
      <div className="admin-section">
        <h3>☁️ Cloud Music Library</h3>

        {libStats && (
          <div className="stats-grid" style={{marginBottom: 16}}>
            <div className="stat-card"><div className="stat-value">{libStats.total_tracks}</div><div className="stat-label">🎵 Tracks</div></div>
            <div className="stat-card"><div className="stat-value">{libStats.total_artists}</div><div className="stat-label">🎤 Artists</div></div>
            <div className="stat-card"><div className="stat-value">{libStats.total_genres}</div><div className="stat-label">🏷️ Genres</div></div>
            <div className="stat-card"><div className="stat-value">{libStats.total_plays || 0}</div><div className="stat-label">▶ Total Plays</div></div>
          </div>
        )}

        <h4>➕ Add Track</h4>
        <div className="admin-form" style={{flexWrap: "wrap"}}>
          <input className="admin-input" placeholder="Title" value={newTrack.title}
            onChange={e => setNewTrack({...newTrack, title: e.target.value})} />
          <input className="admin-input" placeholder="Artist" value={newTrack.artist}
            onChange={e => setNewTrack({...newTrack, artist: e.target.value})} />
          <input className="admin-input" placeholder="Genre" value={newTrack.genre}
            onChange={e => setNewTrack({...newTrack, genre: e.target.value})} />
          <input className="admin-input" type="number" placeholder="BPM" value={newTrack.bpm}
            onChange={e => setNewTrack({...newTrack, bpm: Number(e.target.value)})} style={{width: 80}} />
          <input className="admin-input" placeholder="Stream URL" value={newTrack.stream_url}
            onChange={e => setNewTrack({...newTrack, stream_url: e.target.value})} style={{flex: 2}} />
          <button className="deck-btn" onClick={addTrack}>Add Track</button>
        </div>

        <h4>🎵 Library Tracks ({libTotal})</h4>
        <table className="admin-table">
          <thead>
            <tr><th>ID</th><th>Title</th><th>Artist</th><th>Genre</th><th>BPM</th><th>Plays</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {libTracks.map(t => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{t.title}</td>
                <td>{t.artist}</td>
                <td><span className="genre-tag">{t.genre}</span></td>
                <td>{t.bpm}</td>
                <td>{t.plays}</td>
                <td><button className="small-btn danger" onClick={() => deleteTrack(t.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {libPages > 1 && (
          <div className="ml-pagination" style={{marginTop: 10}}>
            <button className="ml-page-btn" disabled={libPage <= 1} onClick={() => setLibPage(p => p - 1)}>‹ Prev</button>
            <span className="ml-page-info">{libPage} / {libPages}</span>
            <button className="ml-page-btn" disabled={libPage >= libPages} onClick={() => setLibPage(p => p + 1)}>Next ›</button>
          </div>
        )}
      </div>
      )}

      {/* ══════ Payment Method Settings — admin, sysadmin, accountant, sales ══════ */}
      {(perms?.payment_settings || perms?.plans || perms?.payment_summary) && (
      <div className="admin-section payment-settings-section">
        <h3>💳 Payment & Billing Settings</h3>
        {payMsg && <div className="admin-msg">{payMsg}</div>}

        {/* Financial Overview Cards */}
        {paySummary && (
          <div className="stats-grid" style={{marginBottom: 18}}>
            <div className="stat-card pay-stat">
              <div className="stat-value">${Number(paySummary.totalRevenue).toFixed(2)}</div>
              <div className="stat-label">💰 Total Revenue</div>
            </div>
            <div className="stat-card pay-stat">
              <div className="stat-value">${Number(paySummary.totalPlatformFees).toFixed(2)}</div>
              <div className="stat-label">🏦 Platform Fees</div>
            </div>
            <div className="stat-card pay-stat">
              <div className="stat-value">${Number(paySummary.totalDjPayouts).toFixed(2)}</div>
              <div className="stat-label">🎧 DJ Payouts</div>
            </div>
            <div className="stat-card pay-stat">
              <div className="stat-value">${Number(paySummary.totalSubscriptions).toFixed(2)}</div>
              <div className="stat-label">📋 Subscriptions</div>
            </div>
            <div className="stat-card pay-stat">
              <div className="stat-value">${Number(paySummary.netPlatformIncome).toFixed(2)}</div>
              <div className="stat-label">📈 Net Income</div>
            </div>
            <div className="stat-card pay-stat">
              <div className="stat-value">{paySummary.pendingPayments}</div>
              <div className="stat-label">⏳ Pending</div>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="pay-tabs">
          {[["settings","⚙️ Settings"],["plans","📋 Plans"],["transactions","📊 Transactions"]].map(([k,l]) => (
            <button key={k} className={`pay-tab ${payTab===k ? "active":""}`} onClick={()=>setPayTab(k)}>{l}</button>
          ))}
        </div>

        {/* ── Settings Tab ── */}
        {payTab === "settings" && (
          <div className="pay-tab-content">
            <div className="pay-settings-grid">
              {/* Platform Fee */}
              <div className="pay-setting-card">
                <h4>🏷️ Platform Fee</h4>
                <div className="pay-setting-row">
                  <label>Default Commission Rate (%)</label>
                  <input type="number" className="admin-input" min="0" max="100" step="0.5"
                    value={paySettings.platform_fee_percent || 20}
                    onChange={e => setPaySettings({...paySettings, platform_fee_percent: e.target.value})}
                    onBlur={() => savePaySettings({ platform_fee_percent: paySettings.platform_fee_percent })}
                  />
                </div>
                <div className="pay-setting-row">
                  <label>Tax Rate (%)</label>
                  <input type="number" className="admin-input" min="0" max="50" step="0.5"
                    value={paySettings.tax_rate || 0}
                    onChange={e => setPaySettings({...paySettings, tax_rate: e.target.value})}
                    onBlur={() => savePaySettings({ tax_rate: paySettings.tax_rate })}
                  />
                </div>
                <div className="pay-setting-row">
                  <label>Currency</label>
                  <select className="admin-input" value={paySettings.currency || "USD"}
                    onChange={e => { setPaySettings({...paySettings, currency: e.target.value}); savePaySettings({ currency: e.target.value }); }}>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="AUD">AUD (A$)</option>
                    <option value="CAD">CAD (C$)</option>
                  </select>
                </div>
              </div>

              {/* Payout Settings */}
              <div className="pay-setting-card">
                <h4>💸 Payout Settings</h4>
                <div className="pay-setting-row">
                  <label>Min Payout Amount ($)</label>
                  <input type="number" className="admin-input" min="0" step="5"
                    value={paySettings.min_payout_amount || 25}
                    onChange={e => setPaySettings({...paySettings, min_payout_amount: e.target.value})}
                    onBlur={() => savePaySettings({ min_payout_amount: paySettings.min_payout_amount })}
                  />
                </div>
                <div className="pay-setting-row">
                  <label>Payout Schedule</label>
                  <select className="admin-input" value={paySettings.payout_schedule || "weekly"}
                    onChange={e => { setPaySettings({...paySettings, payout_schedule: e.target.value}); savePaySettings({ payout_schedule: e.target.value }); }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="pay-setting-row">
                  <label>Invoice Prefix</label>
                  <input className="admin-input" value={paySettings.invoice_prefix || "DJSAAS"}
                    onChange={e => setPaySettings({...paySettings, invoice_prefix: e.target.value})}
                    onBlur={() => savePaySettings({ invoice_prefix: paySettings.invoice_prefix })}
                  />
                </div>
                <div className="pay-setting-row">
                  <label>Auto-Process Payments</label>
                  <button className={`pay-toggle ${paySettings.auto_process_payments === "true" ? "on" : "off"}`}
                    onClick={() => savePaySettings({ auto_process_payments: paySettings.auto_process_payments === "true" ? "false" : "true" })}>
                    {paySettings.auto_process_payments === "true" ? "ON" : "OFF"}
                  </button>
                </div>
              </div>

              {/* Accepted Payment Methods */}
              <div className="pay-setting-card full-width">
                <h4>💳 Accepted Payment Methods</h4>
                <div className="pay-methods-grid">
                  {[
                    ["credit_card", "💳 Credit Card"],
                    ["debit_card", "💳 Debit Card"],
                    ["paypal", "🅿️ PayPal"],
                    ["bank_transfer", "🏦 Bank Transfer"],
                    ["cash", "💵 Cash"],
                    ["crypto", "₿ Crypto"],
                  ].map(([key, label]) => {
                    let methods = [];
                    try { methods = JSON.parse(paySettings.accepted_methods || "[]"); } catch {}
                    const active = methods.includes(key);
                    return (
                      <button key={key} className={`pay-method-btn ${active ? "active" : ""}`} onClick={() => togglePayMethod(key)}>
                        <span className="pay-method-icon">{label.split(" ")[0]}</span>
                        <span className="pay-method-label">{label.split(" ").slice(1).join(" ")}</span>
                        <span className="pay-method-status">{active ? "✅" : "❌"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ════ Payment Gateways — Full Config ════ */}
              <div className="pay-setting-card full-width">
                <h4>🔌 Payment Gateways</h4>

                {/* ── Stripe ── */}
                <div className={`gw-card ${paySettings.stripe_enabled === "true" ? "gw-on" : ""}`}>
                  <div className="gw-header">
                    <span className="gw-icon">💳</span>
                    <span className="gw-name">Stripe</span>
                    <div className="gw-header-right">
                      <select className="gw-mode-select" value={paySettings.stripe_mode || "sandbox"}
                        onChange={e => { setPaySettings({...paySettings, stripe_mode: e.target.value}); savePaySettings({ stripe_mode: e.target.value }); }}>
                        <option value="sandbox">🧪 Sandbox</option>
                        <option value="live">🟢 Live</option>
                      </select>
                      <button className={`pay-toggle ${paySettings.stripe_enabled === "true" ? "on" : "off"}`}
                        onClick={() => savePaySettings({ stripe_enabled: paySettings.stripe_enabled === "true" ? "false" : "true" })}>
                        {paySettings.stripe_enabled === "true" ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                  <div className="gw-fields">
                    <div className="gw-env-group">
                      <span className="gw-env-label">🟢 Live Keys</span>
                      <div className="gw-field">
                        <label>Public Key</label>
                        <input className="admin-input gw-input" placeholder="pk_live_..." value={paySettings.stripe_live_public_key || ""}
                          onChange={e => setPaySettings({...paySettings, stripe_live_public_key: e.target.value})}
                          onBlur={() => savePaySettings({ stripe_live_public_key: paySettings.stripe_live_public_key || "" })} />
                      </div>
                      <div className="gw-field">
                        <label>Secret Key</label>
                        <input type="password" className="admin-input gw-input gw-secret" placeholder="sk_live_..." value={paySettings.stripe_live_secret_key || ""}
                          onChange={e => setPaySettings({...paySettings, stripe_live_secret_key: e.target.value})}
                          onBlur={() => savePaySettings({ stripe_live_secret_key: paySettings.stripe_live_secret_key || "" })} />
                      </div>
                    </div>
                    <div className="gw-env-group">
                      <span className="gw-env-label">🧪 Sandbox Keys</span>
                      <div className="gw-field">
                        <label>Public Key</label>
                        <input className="admin-input gw-input" placeholder="pk_test_..." value={paySettings.stripe_sandbox_public_key || ""}
                          onChange={e => setPaySettings({...paySettings, stripe_sandbox_public_key: e.target.value})}
                          onBlur={() => savePaySettings({ stripe_sandbox_public_key: paySettings.stripe_sandbox_public_key || "" })} />
                      </div>
                      <div className="gw-field">
                        <label>Secret Key</label>
                        <input type="password" className="admin-input gw-input gw-secret" placeholder="sk_test_..." value={paySettings.stripe_sandbox_secret_key || ""}
                          onChange={e => setPaySettings({...paySettings, stripe_sandbox_secret_key: e.target.value})}
                          onBlur={() => savePaySettings({ stripe_sandbox_secret_key: paySettings.stripe_sandbox_secret_key || "" })} />
                      </div>
                    </div>
                    <div className="gw-field">
                      <label>Webhook Secret</label>
                      <input type="password" className="admin-input gw-input gw-secret" placeholder="whsec_..." value={paySettings.stripe_webhook_secret || ""}
                        onChange={e => setPaySettings({...paySettings, stripe_webhook_secret: e.target.value})}
                        onBlur={() => savePaySettings({ stripe_webhook_secret: paySettings.stripe_webhook_secret || "" })} />
                    </div>
                  </div>
                </div>

                {/* ── PayPal ── */}
                <div className={`gw-card ${paySettings.paypal_enabled === "true" ? "gw-on" : ""}`}>
                  <div className="gw-header">
                    <span className="gw-icon">🅿️</span>
                    <span className="gw-name">PayPal</span>
                    <div className="gw-header-right">
                      <select className="gw-mode-select" value={paySettings.paypal_mode || "sandbox"}
                        onChange={e => { setPaySettings({...paySettings, paypal_mode: e.target.value}); savePaySettings({ paypal_mode: e.target.value }); }}>
                        <option value="sandbox">🧪 Sandbox</option>
                        <option value="live">🟢 Live</option>
                      </select>
                      <button className={`pay-toggle ${paySettings.paypal_enabled === "true" ? "on" : "off"}`}
                        onClick={() => savePaySettings({ paypal_enabled: paySettings.paypal_enabled === "true" ? "false" : "true" })}>
                        {paySettings.paypal_enabled === "true" ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                  <div className="gw-fields">
                    <div className="gw-env-group">
                      <span className="gw-env-label">🟢 Live Credentials</span>
                      <div className="gw-field">
                        <label>Client ID</label>
                        <input className="admin-input gw-input" placeholder="AV...live" value={paySettings.paypal_live_client_id || ""}
                          onChange={e => setPaySettings({...paySettings, paypal_live_client_id: e.target.value})}
                          onBlur={() => savePaySettings({ paypal_live_client_id: paySettings.paypal_live_client_id || "" })} />
                      </div>
                      <div className="gw-field">
                        <label>Secret</label>
                        <input type="password" className="admin-input gw-input gw-secret" placeholder="EL..." value={paySettings.paypal_live_secret || ""}
                          onChange={e => setPaySettings({...paySettings, paypal_live_secret: e.target.value})}
                          onBlur={() => savePaySettings({ paypal_live_secret: paySettings.paypal_live_secret || "" })} />
                      </div>
                    </div>
                    <div className="gw-env-group">
                      <span className="gw-env-label">🧪 Sandbox Credentials</span>
                      <div className="gw-field">
                        <label>Client ID</label>
                        <input className="admin-input gw-input" placeholder="AV...sandbox" value={paySettings.paypal_sandbox_client_id || ""}
                          onChange={e => setPaySettings({...paySettings, paypal_sandbox_client_id: e.target.value})}
                          onBlur={() => savePaySettings({ paypal_sandbox_client_id: paySettings.paypal_sandbox_client_id || "" })} />
                      </div>
                      <div className="gw-field">
                        <label>Secret</label>
                        <input type="password" className="admin-input gw-input gw-secret" placeholder="EO..." value={paySettings.paypal_sandbox_secret || ""}
                          onChange={e => setPaySettings({...paySettings, paypal_sandbox_secret: e.target.value})}
                          onBlur={() => savePaySettings({ paypal_sandbox_secret: paySettings.paypal_sandbox_secret || "" })} />
                      </div>
                    </div>
                    <div className="gw-field">
                      <label>Webhook ID</label>
                      <input className="admin-input gw-input" placeholder="WH-..." value={paySettings.paypal_webhook_id || ""}
                        onChange={e => setPaySettings({...paySettings, paypal_webhook_id: e.target.value})}
                        onBlur={() => savePaySettings({ paypal_webhook_id: paySettings.paypal_webhook_id || "" })} />
                    </div>
                  </div>
                </div>

                {/* ── Square ── */}
                <div className={`gw-card ${paySettings.square_enabled === "true" ? "gw-on" : ""}`}>
                  <div className="gw-header">
                    <span className="gw-icon">⬜</span>
                    <span className="gw-name">Square</span>
                    <div className="gw-header-right">
                      <select className="gw-mode-select" value={paySettings.square_mode || "sandbox"}
                        onChange={e => { setPaySettings({...paySettings, square_mode: e.target.value}); savePaySettings({ square_mode: e.target.value }); }}>
                        <option value="sandbox">🧪 Sandbox</option>
                        <option value="live">🟢 Live</option>
                      </select>
                      <button className={`pay-toggle ${paySettings.square_enabled === "true" ? "on" : "off"}`}
                        onClick={() => savePaySettings({ square_enabled: paySettings.square_enabled === "true" ? "false" : "true" })}>
                        {paySettings.square_enabled === "true" ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                  <div className="gw-fields">
                    <div className="gw-env-group">
                      <span className="gw-env-label">🟢 Live Credentials</span>
                      <div className="gw-field">
                        <label>Application ID</label>
                        <input className="admin-input gw-input" placeholder="sq0idp-..." value={paySettings.square_live_app_id || ""}
                          onChange={e => setPaySettings({...paySettings, square_live_app_id: e.target.value})}
                          onBlur={() => savePaySettings({ square_live_app_id: paySettings.square_live_app_id || "" })} />
                      </div>
                      <div className="gw-field">
                        <label>Access Token</label>
                        <input type="password" className="admin-input gw-input gw-secret" placeholder="EAAAl..." value={paySettings.square_live_access_token || ""}
                          onChange={e => setPaySettings({...paySettings, square_live_access_token: e.target.value})}
                          onBlur={() => savePaySettings({ square_live_access_token: paySettings.square_live_access_token || "" })} />
                      </div>
                    </div>
                    <div className="gw-env-group">
                      <span className="gw-env-label">🧪 Sandbox Credentials</span>
                      <div className="gw-field">
                        <label>Application ID</label>
                        <input className="admin-input gw-input" placeholder="sandbox-sq0idp-..." value={paySettings.square_sandbox_app_id || ""}
                          onChange={e => setPaySettings({...paySettings, square_sandbox_app_id: e.target.value})}
                          onBlur={() => savePaySettings({ square_sandbox_app_id: paySettings.square_sandbox_app_id || "" })} />
                      </div>
                      <div className="gw-field">
                        <label>Access Token</label>
                        <input type="password" className="admin-input gw-input gw-secret" placeholder="EAAAl...sandbox" value={paySettings.square_sandbox_access_token || ""}
                          onChange={e => setPaySettings({...paySettings, square_sandbox_access_token: e.target.value})}
                          onBlur={() => savePaySettings({ square_sandbox_access_token: paySettings.square_sandbox_access_token || "" })} />
                      </div>
                    </div>
                    <div className="gw-field">
                      <label>Location ID</label>
                      <input className="admin-input gw-input" placeholder="L..." value={paySettings.square_location_id || ""}
                        onChange={e => setPaySettings({...paySettings, square_location_id: e.target.value})}
                        onBlur={() => savePaySettings({ square_location_id: paySettings.square_location_id || "" })} />
                    </div>
                  </div>
                </div>

                {/* ── Bank Transfer ── */}
                <div className={`gw-card ${paySettings.bank_transfer_enabled === "true" ? "gw-on" : ""}`}>
                  <div className="gw-header">
                    <span className="gw-icon">🏦</span>
                    <span className="gw-name">Bank Transfer</span>
                    <div className="gw-header-right">
                      <button className={`pay-toggle ${paySettings.bank_transfer_enabled === "true" ? "on" : "off"}`}
                        onClick={() => savePaySettings({ bank_transfer_enabled: paySettings.bank_transfer_enabled === "true" ? "false" : "true" })}>
                        {paySettings.bank_transfer_enabled === "true" ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                  <div className="gw-fields">
                    <div className="gw-field">
                      <label>Bank Name</label>
                      <input className="admin-input gw-input" placeholder="e.g. Chase Bank" value={paySettings.bank_name || ""}
                        onChange={e => setPaySettings({...paySettings, bank_name: e.target.value})}
                        onBlur={() => savePaySettings({ bank_name: paySettings.bank_name || "" })} />
                    </div>
                    <div className="gw-field">
                      <label>Account Holder Name</label>
                      <input className="admin-input gw-input" placeholder="DJ SaaS LLC" value={paySettings.bank_account_name || ""}
                        onChange={e => setPaySettings({...paySettings, bank_account_name: e.target.value})}
                        onBlur={() => savePaySettings({ bank_account_name: paySettings.bank_account_name || "" })} />
                    </div>
                    <div className="gw-row-2">
                      <div className="gw-field">
                        <label>Account Number</label>
                        <input type="password" className="admin-input gw-input gw-secret" placeholder="••••••••" value={paySettings.bank_account_number || ""}
                          onChange={e => setPaySettings({...paySettings, bank_account_number: e.target.value})}
                          onBlur={() => savePaySettings({ bank_account_number: paySettings.bank_account_number || "" })} />
                      </div>
                      <div className="gw-field">
                        <label>Routing Number</label>
                        <input type="password" className="admin-input gw-input gw-secret" placeholder="••••••••" value={paySettings.bank_routing_number || ""}
                          onChange={e => setPaySettings({...paySettings, bank_routing_number: e.target.value})}
                          onBlur={() => savePaySettings({ bank_routing_number: paySettings.bank_routing_number || "" })} />
                      </div>
                    </div>
                    <div className="gw-row-2">
                      <div className="gw-field">
                        <label>SWIFT / BIC Code</label>
                        <input className="admin-input gw-input" placeholder="CHASUS33" value={paySettings.bank_swift_code || ""}
                          onChange={e => setPaySettings({...paySettings, bank_swift_code: e.target.value})}
                          onBlur={() => savePaySettings({ bank_swift_code: paySettings.bank_swift_code || "" })} />
                      </div>
                      <div className="gw-field">
                        <label>IBAN</label>
                        <input className="admin-input gw-input" placeholder="GB82 WEST 1234 5698 7654 32" value={paySettings.bank_iban || ""}
                          onChange={e => setPaySettings({...paySettings, bank_iban: e.target.value})}
                          onBlur={() => savePaySettings({ bank_iban: paySettings.bank_iban || "" })} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Cash ── */}
                <div className={`gw-card ${paySettings.cash_enabled === "true" ? "gw-on" : ""}`}>
                  <div className="gw-header">
                    <span className="gw-icon">💵</span>
                    <span className="gw-name">Cash</span>
                    <div className="gw-header-right">
                      <button className={`pay-toggle ${paySettings.cash_enabled === "true" ? "on" : "off"}`}
                        onClick={() => savePaySettings({ cash_enabled: paySettings.cash_enabled === "true" ? "false" : "true" })}>
                        {paySettings.cash_enabled === "true" ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                  <div className="gw-fields">
                    <p style={{fontSize: "0.8rem", opacity: 0.6, margin: "4px 0"}}>Cash payments are tracked manually. No API credentials required.</p>
                  </div>
                </div>

                {/* ── Crypto ── */}
                <div className={`gw-card ${paySettings.crypto_enabled === "true" ? "gw-on" : ""}`}>
                  <div className="gw-header">
                    <span className="gw-icon">₿</span>
                    <span className="gw-name">Cryptocurrency</span>
                    <div className="gw-header-right">
                      <button className={`pay-toggle ${paySettings.crypto_enabled === "true" ? "on" : "off"}`}
                        onClick={() => savePaySettings({ crypto_enabled: paySettings.crypto_enabled === "true" ? "false" : "true" })}>
                        {paySettings.crypto_enabled === "true" ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                  <div className="gw-fields">
                    <div className="gw-field">
                      <label>Wallet Address</label>
                      <input className="admin-input gw-input" placeholder="0x..." value={paySettings.crypto_wallet_address || ""}
                        onChange={e => setPaySettings({...paySettings, crypto_wallet_address: e.target.value})}
                        onBlur={() => savePaySettings({ crypto_wallet_address: paySettings.crypto_wallet_address || "" })} />
                    </div>
                    <div className="gw-field">
                      <label>Network</label>
                      <select className="admin-input gw-input" value={paySettings.crypto_network || "ethereum"}
                        onChange={e => { setPaySettings({...paySettings, crypto_network: e.target.value}); savePaySettings({ crypto_network: e.target.value }); }}>
                        <option value="ethereum">Ethereum</option>
                        <option value="bitcoin">Bitcoin</option>
                        <option value="polygon">Polygon</option>
                        <option value="solana">Solana</option>
                        <option value="bsc">BSC</option>
                      </select>
                    </div>
                    <div className="gw-field">
                      <label>Accepted Coins</label>
                      <input className="admin-input gw-input" placeholder="BTC, ETH, USDT"
                        value={(() => { try { return JSON.parse(paySettings.crypto_accepted_coins || "[]").join(", "); } catch { return paySettings.crypto_accepted_coins || ""; } })()}
                        onChange={e => setPaySettings({...paySettings, crypto_accepted_coins: JSON.stringify(e.target.value.split(",").map(s => s.trim()).filter(Boolean))})}
                        onBlur={() => savePaySettings({ crypto_accepted_coins: paySettings.crypto_accepted_coins || "[]" })} />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── Plans Tab ── */}
        {payTab === "plans" && (
          <div className="pay-tab-content">
            <h4>{editPlan ? "✏️ Edit Plan" : "➕ New Plan"}</h4>
            <div className="admin-form" style={{flexWrap: "wrap"}}>
              <input className="admin-input" placeholder="Plan Name" value={planForm.name}
                onChange={e => setPlanForm({...planForm, name: e.target.value})} />
              <input className="admin-input" type="number" placeholder="Price" value={planForm.price} step="0.01"
                onChange={e => setPlanForm({...planForm, price: Number(e.target.value)})} style={{width: 100}} />
              <input className="admin-input" type="number" placeholder="Max Hours/mo" value={planForm.max_hours_per_month}
                onChange={e => setPlanForm({...planForm, max_hours_per_month: Number(e.target.value)})} style={{width: 120}} />
              <input className="admin-input" type="number" placeholder="Max Bookings/mo" value={planForm.max_bookings_per_month}
                onChange={e => setPlanForm({...planForm, max_bookings_per_month: Number(e.target.value)})} style={{width: 130}} />
              <input className="admin-input" type="number" placeholder="Commission %" value={planForm.commission_rate} step="0.5"
                onChange={e => setPlanForm({...planForm, commission_rate: Number(e.target.value)})} style={{width: 110}} />
              <input className="admin-input" placeholder="Features (comma separated)" value={planForm.features}
                onChange={e => setPlanForm({...planForm, features: e.target.value})} style={{flex: 2}} />
              <button className="deck-btn" onClick={savePlan}>{editPlan ? "Update" : "Create"}</button>
              {editPlan && <button className="small-btn" onClick={() => { setEditPlan(null); setPlanForm({ name: "", price: 0, max_hours_per_month: 0, max_bookings_per_month: 0, commission_rate: 20, features: "" }); }}>Cancel</button>}
            </div>

            <h4>📋 Subscription Plans ({payPlans.length})</h4>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th><th>Name</th><th>Price</th><th>Hours/mo</th><th>Bookings/mo</th><th>Commission</th><th>Features</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payPlans.map(p => (
                  <tr key={p.id} className={editPlan === p.id ? "editing-row" : ""} style={p.enabled === 0 ? { opacity: 0.5 } : {}}>
                    <td>{p.id}</td>
                    <td><strong>{p.name}</strong></td>
                    <td className="pay-price">${Number(p.price).toFixed(2)}</td>
                    <td>{p.max_hours_per_month || "∞"}</td>
                    <td>{p.max_bookings_per_month || "∞"}</td>
                    <td>{p.commission_rate}%</td>
                    <td className="pay-features">{p.features || "—"}</td>
                    <td>
                      <button className={`pay-toggle ${p.enabled ? "on" : "off"}`} onClick={() => togglePlan(p.id)}>
                        {p.enabled ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td>
                      <button className="small-btn" onClick={() => startEditPlan(p)}>Edit</button>
                      <button className="small-btn danger" onClick={() => deletePlan(p.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Transactions Tab ── */}
        {payTab === "transactions" && paySummary && (
          <div className="pay-tab-content">
            <h4>📊 Recent Transactions ({paySummary.totalTransactions})</h4>
            <table className="admin-table">
              <thead>
                <tr><th>ID</th><th>Type</th><th>Amount</th><th>Payer</th><th>Payee</th><th>Status</th><th>Description</th><th>Date</th></tr>
              </thead>
              <tbody>
                {(paySummary.recentTransactions || []).map(t => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td><span className={`pay-type pay-type-${t.type}`}>{t.type.replace(/_/g, " ")}</span></td>
                    <td className="pay-price">${Number(t.amount).toFixed(2)}</td>
                    <td>{t.payer_name || "—"}</td>
                    <td>{t.payee_name || "—"}</td>
                    <td><span className={`pay-status pay-status-${t.status}`}>{t.status}</span></td>
                    <td className="pay-desc">{t.description || "—"}</td>
                    <td>{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {(!paySummary.recentTransactions || paySummary.recentTransactions.length === 0) && (
                  <tr><td colSpan={8} style={{textAlign: "center", opacity: 0.6}}>No transactions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* LANDING PAGE CONTENT MANAGER — admin, sysadmin, marketing */}
      {/* ═══════════════════════════════════════════════ */}
      {perms?.landing && (
      <div className="admin-section">
        <h3>🌐 Landing Page Content</h3>
        {lcMsg && <div className="admin-msg">{lcMsg}</div>}
        <div className="admin-tabs">
          {["branding","hero","features","pricing","howItWorks","cta","contact","media"].map(t => (
            <button key={t} className={`admin-tab ${lcTab === t ? "active" : ""}`} onClick={() => setLcTab(t)}>
              {t === "howItWorks" ? "How It Works" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Branding ── */}
        {lcTab === "branding" && (
          <div className="lc-panel">
            <label>Logo Text<input value={lc.logo_text || ""} onChange={e => lcField("logo_text", e.target.value)} /></label>
            <label>Logo Image URL<input value={lc.logo_url || ""} onChange={e => lcField("logo_url", e.target.value)} placeholder="https://..." /></label>
            {lc.logo_url && <img src={lc.logo_url} alt="logo preview" style={{ maxHeight: 60, marginTop: 8, borderRadius: 8 }} />}
            <label>Footer Text<input value={lc.footer_text || ""} onChange={e => lcField("footer_text", e.target.value)} /></label>
            <button className="landing-btn primary" onClick={() => saveLc({ logo_text: lc.logo_text, logo_url: lc.logo_url, footer_text: lc.footer_text })}>Save Branding</button>
          </div>
        )}

        {/* ── Hero ── */}
        {lcTab === "hero" && (
          <div className="lc-panel">
            <label>Hero Title<input value={lc.hero_title || ""} onChange={e => lcField("hero_title", e.target.value)} /></label>
            <label>Accent Line<input value={lc.hero_accent || ""} onChange={e => lcField("hero_accent", e.target.value)} /></label>
            <label>Subtitle<textarea rows={3} value={lc.hero_subtitle || ""} onChange={e => lcField("hero_subtitle", e.target.value)} /></label>
            <label>Hero Image URL<input value={lc.hero_image_url || ""} onChange={e => lcField("hero_image_url", e.target.value)} /></label>
            <label>Hero Video URL<input value={lc.hero_video_url || ""} onChange={e => lcField("hero_video_url", e.target.value)} /></label>
            <h4>Hero Stats</h4>
            {(lcJson("hero_stats")).map((s, i) => (
              <div key={i} className="lc-row">
                <input placeholder="Value" value={s.value || ""} onChange={e => {
                  const arr = [...lcJson("hero_stats")]; arr[i] = { ...arr[i], value: e.target.value }; lcField("hero_stats", arr);
                }} />
                <input placeholder="Label" value={s.label || ""} onChange={e => {
                  const arr = [...lcJson("hero_stats")]; arr[i] = { ...arr[i], label: e.target.value }; lcField("hero_stats", arr);
                }} />
                <button className="btn-danger-sm" onClick={() => { const arr = lcJson("hero_stats").filter((_, j) => j !== i); lcField("hero_stats", arr); }}>✕</button>
              </div>
            ))}
            <button className="btn-sm" onClick={() => lcField("hero_stats", [...lcJson("hero_stats"), { value: "", label: "" }])}>+ Add Stat</button>
            <button className="landing-btn primary" style={{ marginTop: 12 }} onClick={() => saveLc({
              hero_title: lc.hero_title, hero_accent: lc.hero_accent, hero_subtitle: lc.hero_subtitle,
              hero_image_url: lc.hero_image_url, hero_video_url: lc.hero_video_url, hero_stats: lc.hero_stats
            })}>Save Hero</button>
          </div>
        )}

        {/* ── Features ── */}
        {lcTab === "features" && (
          <div className="lc-panel">
            <label>Section Title<input value={lc.features_title || ""} onChange={e => lcField("features_title", e.target.value)} /></label>
            <label>Section Subtitle<input value={lc.features_subtitle || ""} onChange={e => lcField("features_subtitle", e.target.value)} /></label>
            <h4>Feature Cards</h4>
            {(lcJson("features")).map((f, i) => (
              <div key={i} className="lc-card-edit">
                <div className="lc-row">
                  <input style={{width: 60}} placeholder="Icon" value={f.icon || ""} onChange={e => {
                    const arr = [...lcJson("features")]; arr[i] = { ...arr[i], icon: e.target.value }; lcField("features", arr);
                  }} />
                  <input placeholder="Title" value={f.title || ""} onChange={e => {
                    const arr = [...lcJson("features")]; arr[i] = { ...arr[i], title: e.target.value }; lcField("features", arr);
                  }} />
                  <button className="btn-danger-sm" onClick={() => { const arr = lcJson("features").filter((_, j) => j !== i); lcField("features", arr); }}>✕</button>
                </div>
                <textarea rows={2} placeholder="Description" value={f.desc || ""} onChange={e => {
                  const arr = [...lcJson("features")]; arr[i] = { ...arr[i], desc: e.target.value }; lcField("features", arr);
                }} />
              </div>
            ))}
            <button className="btn-sm" onClick={() => lcField("features", [...lcJson("features"), { icon: "⭐", title: "", desc: "" }])}>+ Add Feature</button>
            <button className="landing-btn primary" style={{ marginTop: 12 }} onClick={() => saveLc({
              features_title: lc.features_title, features_subtitle: lc.features_subtitle, features: lc.features
            })}>Save Features</button>
          </div>
        )}

        {/* ── Pricing ── */}
        {lcTab === "pricing" && (
          <div className="lc-panel">
            <label>Section Title<input value={lc.pricing_title || ""} onChange={e => lcField("pricing_title", e.target.value)} /></label>
            <label>Section Subtitle<input value={lc.pricing_subtitle || ""} onChange={e => lcField("pricing_subtitle", e.target.value)} /></label>
            <p style={{ color: "#888", fontSize: "0.85rem", marginTop: 8 }}>💡 Pricing cards come from Subscription Plans above. Edit plan details there.</p>
            <button className="landing-btn primary" style={{ marginTop: 12 }} onClick={() => saveLc({
              pricing_title: lc.pricing_title, pricing_subtitle: lc.pricing_subtitle
            })}>Save Pricing Labels</button>
          </div>
        )}

        {/* ── How It Works ── */}
        {lcTab === "howItWorks" && (
          <div className="lc-panel">
            <label>Section Title<input value={lc.how_title || ""} onChange={e => lcField("how_title", e.target.value)} /></label>
            <h4>🎧 DJ Steps</h4>
            {(lcJson("how_dj_steps")).map((s, i) => (
              <div key={i} className="lc-card-edit">
                <div className="lc-row">
                  <span className="ls-num">{i + 1}</span>
                  <input placeholder="Title" value={s.title || ""} onChange={e => {
                    const arr = [...lcJson("how_dj_steps")]; arr[i] = { ...arr[i], title: e.target.value }; lcField("how_dj_steps", arr);
                  }} />
                  <button className="btn-danger-sm" onClick={() => { const arr = lcJson("how_dj_steps").filter((_, j) => j !== i); lcField("how_dj_steps", arr); }}>✕</button>
                </div>
                <textarea rows={2} placeholder="Description" value={s.desc || ""} onChange={e => {
                  const arr = [...lcJson("how_dj_steps")]; arr[i] = { ...arr[i], desc: e.target.value }; lcField("how_dj_steps", arr);
                }} />
              </div>
            ))}
            <button className="btn-sm" onClick={() => lcField("how_dj_steps", [...lcJson("how_dj_steps"), { title: "", desc: "" }])}>+ Add DJ Step</button>

            <h4 style={{ marginTop: 16 }}>🍻 Pub Steps</h4>
            {(lcJson("how_pub_steps")).map((s, i) => (
              <div key={i} className="lc-card-edit">
                <div className="lc-row">
                  <span className="ls-num">{i + 1}</span>
                  <input placeholder="Title" value={s.title || ""} onChange={e => {
                    const arr = [...lcJson("how_pub_steps")]; arr[i] = { ...arr[i], title: e.target.value }; lcField("how_pub_steps", arr);
                  }} />
                  <button className="btn-danger-sm" onClick={() => { const arr = lcJson("how_pub_steps").filter((_, j) => j !== i); lcField("how_pub_steps", arr); }}>✕</button>
                </div>
                <textarea rows={2} placeholder="Description" value={s.desc || ""} onChange={e => {
                  const arr = [...lcJson("how_pub_steps")]; arr[i] = { ...arr[i], desc: e.target.value }; lcField("how_pub_steps", arr);
                }} />
              </div>
            ))}
            <button className="btn-sm" onClick={() => lcField("how_pub_steps", [...lcJson("how_pub_steps"), { title: "", desc: "" }])}>+ Add Pub Step</button>
            <button className="landing-btn primary" style={{ marginTop: 12 }} onClick={() => saveLc({
              how_title: lc.how_title, how_dj_steps: lc.how_dj_steps, how_pub_steps: lc.how_pub_steps
            })}>Save How It Works</button>
          </div>
        )}

        {/* ── CTA ── */}
        {lcTab === "cta" && (
          <div className="lc-panel">
            <label>CTA Title<input value={lc.cta_title || ""} onChange={e => lcField("cta_title", e.target.value)} /></label>
            <label>CTA Subtitle<input value={lc.cta_subtitle || ""} onChange={e => lcField("cta_subtitle", e.target.value)} /></label>
            <button className="landing-btn primary" style={{ marginTop: 12 }} onClick={() => saveLc({
              cta_title: lc.cta_title, cta_subtitle: lc.cta_subtitle
            })}>Save CTA</button>
          </div>
        )}

        {/* ── Contact ── */}
        {lcTab === "contact" && (
          <div className="lc-panel">
            <label>Contact Email<input type="email" value={lc.contact_email || ""} onChange={e => lcField("contact_email", e.target.value)} /></label>
            <label>Contact Phone<input value={lc.contact_phone || ""} onChange={e => lcField("contact_phone", e.target.value)} /></label>
            <label>Address<input value={lc.contact_address || ""} onChange={e => lcField("contact_address", e.target.value)} /></label>
            <h4>Social Links</h4>
            {["twitter","instagram","facebook","youtube"].map(s => (
              <label key={s}>{s.charAt(0).toUpperCase() + s.slice(1)}
                <input value={(lcJsonObj("social_links"))[s] || ""} onChange={e => {
                  const obj = { ...lcJsonObj("social_links"), [s]: e.target.value }; lcField("social_links", obj);
                }} placeholder={`https://${s}.com/...`} />
              </label>
            ))}
            <button className="landing-btn primary" style={{ marginTop: 12 }} onClick={() => saveLc({
              contact_email: lc.contact_email, contact_phone: lc.contact_phone, contact_address: lc.contact_address, social_links: lc.social_links
            })}>Save Contact</button>
          </div>
        )}

        {/* ── Media ── */}
        {lcTab === "media" && (
          <div className="lc-panel">
            <label>Promo Video URL<input value={lc.promo_video_url || ""} onChange={e => lcField("promo_video_url", e.target.value)} placeholder="https://youtube.com/..." /></label>
            <h4>Gallery Images</h4>
            {(lcJson("gallery_images")).map((url, i) => (
              <div key={i} className="lc-row">
                <input value={url} onChange={e => {
                  const arr = [...lcJson("gallery_images")]; arr[i] = e.target.value; lcField("gallery_images", arr);
                }} placeholder="Image URL" />
                <button className="btn-danger-sm" onClick={() => { const arr = lcJson("gallery_images").filter((_, j) => j !== i); lcField("gallery_images", arr); }}>✕</button>
                {url && <img src={url} alt="" style={{ height: 40, borderRadius: 4, marginLeft: 4 }} />}
              </div>
            ))}
            <button className="btn-sm" onClick={() => lcField("gallery_images", [...lcJson("gallery_images"), ""])}>+ Add Image</button>
            <button className="landing-btn primary" style={{ marginTop: 12 }} onClick={() => saveLc({
              promo_video_url: lc.promo_video_url, gallery_images: lc.gallery_images
            })}>Save Media</button>
          </div>
        )}
      </div>
      )}

      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
