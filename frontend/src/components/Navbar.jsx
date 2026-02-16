import React from "react";
import { getUser, clearToken } from "../utils/api";

export default function Navbar({ onNavigate }) {
  const user = getUser();
  const isDJ = user?.role === "dj" || user?.role === "admin" || user?.role === "sysadmin";
  const isPub = user?.role === "pub";
  const isStaff = ["admin","sysadmin","accountant","support","sales","marketing"].includes(user?.role);

  const logout = () => {
    clearToken();
    onNavigate("login");
  };

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => onNavigate(isDJ ? "dashboard" : "listener")}>
        🎧 DJ SaaS
      </div>
      <div className="nav-links">
        {isDJ && <button className="nav-btn" onClick={() => onNavigate("dashboard")}>🎧 Dashboard</button>}
        {isDJ && <button className="nav-btn" onClick={() => onNavigate("mixer")}>Mixer</button>}
        <button className="nav-btn" onClick={() => onNavigate("visualizer")}>3D Visualizer</button>
        {isDJ && <button className="nav-btn" onClick={() => onNavigate("broadcast")}>📡 Broadcast</button>}
        <button className="nav-btn" onClick={() => onNavigate("listener")}>🎧 Listener</button>
        <button className="nav-btn" onClick={() => onNavigate("bookings")}>📅 Bookings</button>
        {isDJ && <button className="nav-btn" onClick={() => onNavigate("infrastructure")}>🏗️ Infra</button>}
        {isStaff && (
          <button className="nav-btn" onClick={() => onNavigate("admin")}>🛡️ Admin</button>
        )}
        <span className="nav-user">{user?.username} ({user?.role})</span>
        <button className="nav-btn nav-profile" onClick={() => onNavigate("profile")}>👤 Profile</button>
        {isDJ && <button className="nav-btn nav-settings" onClick={() => onNavigate("settings")}>⚙️ Settings</button>}
        <button className="nav-btn nav-logout" onClick={logout}>Logout</button>
      </div>
    </nav>
  );
}
