import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { getUser, clearToken } from "../utils/api";

export default function Navbar({ onNavigate }) {
  const user = getUser();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isDJ = user?.role === "dj" || user?.role === "admin" || user?.role === "sysadmin";
  const isPub = user?.role === "pub";
  const isStaff = ["admin","sysadmin","accountant","support","sales","marketing"].includes(user?.role);

  const logout = () => {
    clearToken();
    onNavigate("login");
  };

  const go = (page) => {
    onNavigate(page);
    setMenuOpen(false);
  };

  const isActive = (page) => location.pathname === "/" + page;

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => go(isDJ ? "dashboard" : "listener")}>
        🎧 DJ SaaS
      </div>
      <button className="nav-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
        {menuOpen ? "✕" : "☰"}
      </button>
      <div className={`nav-links ${menuOpen ? "nav-open" : ""}`}>
        {isDJ && <button className={`nav-btn ${isActive("dashboard") ? "nav-active" : ""}`} onClick={() => go("dashboard")}>🎧 Dashboard</button>}
        {isDJ && <button className={`nav-btn ${isActive("mixer") ? "nav-active" : ""}`} onClick={() => go("mixer")}>🎵 Mixer</button>}
        <button className={`nav-btn ${isActive("visualizer") ? "nav-active" : ""}`} onClick={() => go("visualizer")}>🎆 3D Visualizer</button>
        {isDJ && <button className={`nav-btn ${isActive("broadcast") ? "nav-active" : ""}`} onClick={() => go("broadcast")}>📡 Broadcast</button>}
        <button className={`nav-btn ${isActive("listener") ? "nav-active" : ""}`} onClick={() => go("listener")}>🎧 Listener</button>
        <button className={`nav-btn ${isActive("bookings") ? "nav-active" : ""}`} onClick={() => go("bookings")}>📅 Bookings</button>
        {isDJ && <button className={`nav-btn ${isActive("infrastructure") ? "nav-active" : ""}`} onClick={() => go("infrastructure")}>🏗️ Infra</button>}
        {isStaff && <button className={`nav-btn ${isActive("admin") ? "nav-active" : ""}`} onClick={() => go("admin")}>🛡️ Admin</button>}
        <div className="nav-spacer" />
        <span className="nav-user">👤 {user?.username} <small>({user?.role})</small></span>
        <button className={`nav-btn nav-profile ${isActive("profile") ? "nav-active" : ""}`} onClick={() => go("profile")}>👤 Profile</button>
        {isDJ && <button className={`nav-btn nav-settings ${isActive("settings") ? "nav-active" : ""}`} onClick={() => go("settings")}>⚙️ Settings</button>}
        <button className="nav-btn nav-logout" onClick={logout}>🚪 Logout</button>
      </div>
    </nav>
  );
}
