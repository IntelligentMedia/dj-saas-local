import React, { useState } from "react";
import { api, setToken, setUser } from "../utils/api";

export default function Login({ onLogin, onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login"); // login or register
  const [regRole, setRegRole] = useState("pub");
  const [success, setSuccess] = useState("");

  const handleLogin = async () => {
    setError("");
    try {
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        onLogin(data.user);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
      }
    } catch (e) {
      setError("Connection failed — is the API running on port 4000?");
    }
  };

  const handleRegister = async () => {
    setError("");
    setSuccess("");
    try {
      const res = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, role: regRole })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || "Registered! You can now log in.");
        setMode("login");
      } else {
        setError(data.error || "Registration failed");
      }
    } catch (e) {
      setError("Connection failed");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === "login") handleLogin();
    else handleRegister();
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-logo">🎧</h1>
        <h2 className="login-title">DJ SaaS Platform</h2>

        {error && <div className="login-error">{error}</div>}
        {success && <div className="login-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <input
            className="login-input"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <input
            className="login-input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          {mode === "register" && (
            <select className="login-input" value={regRole} onChange={e => setRegRole(e.target.value)}>
              <option value="pub">Listener (Pub)</option>
              <option value="dj">DJ</option>
            </select>
          )}

          <button type="submit" className="login-btn">
            {mode === "login" ? "Login" : "Register"}
          </button>
        </form>

        <div className="login-toggle">
          {mode === "login" ? (
            <span>No account? <a href="#" onClick={() => setMode("register")}>Register</a></span>
          ) : (
            <span>Have an account? <a href="#" onClick={() => setMode("login")}>Login</a></span>
          )}
        </div>

        <div className="login-hint">Demo: admin/1234, dj1/1234, pub1/1234</div>
        {onBack && (
          <div className="login-back">
            <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>← Back to Home</a>
          </div>
        )}
      </div>
    </div>
  );
}
