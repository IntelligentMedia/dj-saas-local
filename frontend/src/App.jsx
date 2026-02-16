
import React, { useState, useEffect, Suspense, lazy } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { getUser, clearToken } from "./utils/api";
import useDJStore from "./store/djStore";
import Navbar from "./components/Navbar";
import ErrorBoundary from "./components/ErrorBoundary";
import Toast from "./components/Toast";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";
import "./styles/theme.css";

// ── Lazy-loaded pages — code-split per route ──
const Mixer = lazy(() => import("./pages/Mixer"));
const Visualizer = lazy(() => import("./pages/Visualizer"));
const Admin = lazy(() => import("./pages/Admin"));
const Broadcast = lazy(() => import("./pages/Broadcast"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Infrastructure = lazy(() => import("./pages/Infrastructure"));
const DJDashboard = lazy(() => import("./pages/DJDashboard"));
const PubListener = lazy(() => import("./pages/PubListener"));
const DJProfile = lazy(() => import("./pages/DJProfile"));
const DJSettings = lazy(() => import("./pages/DJSettings"));

function PageSpinner() {
  return (
    <div className="page-spinner">
      <div className="spinner-ring" />
      <span>Loading…</span>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const navigate = useNavigate();
  const location = useLocation();
  const STAFF_ROLES = ["admin","sysadmin","accountant","support","sales","marketing"];

  const mixerMode = useDJStore((s) => s.mixerMode);
  const setMixerMode = useDJStore((s) => s.setMixerMode);
  const setCurrentDJ = useDJStore((s) => s.setCurrentDJ);

  // Sync user into global store on login / mount
  useEffect(() => {
    if (user) setCurrentDJ(user);
  }, [user]);

  const handleLogin = (userData) => {
    setUser(userData);
    setCurrentDJ(userData);
    const dest = userData?.role === "pub" ? "/listener" : STAFF_ROLES.includes(userData?.role) ? "/admin" : "/dashboard";
    navigate(dest);
  };

  const handleNavigate = (p) => {
    if (p === "login") {
      clearToken();
      setUser(null);
      setCurrentDJ(null);
      navigate("/");
      return;
    }
    navigate("/" + p);
  };

  const handleStartSession = (mode) => {
    setMixerMode(mode);
    navigate("/mixer");
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} onBack={() => navigate("/")} />} />
        <Route path="*" element={
          <LandingPage
            onGoLogin={() => navigate("/login")}
            onGoRegister={() => navigate("/login")}
          />
        } />
      </Routes>
    );
  }

  return (
    <ErrorBoundary fallbackMessage="The app encountered an error. Try reloading.">
      <div className="app">
        <Navbar onNavigate={handleNavigate} />
        <main className="main-content">
          <ErrorBoundary fallbackMessage="This page crashed. Try navigating to another page.">
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                <Route path="/dashboard" element={<DJDashboard onStartSession={handleStartSession} />} />
                <Route path="/mixer" element={<Mixer mode={mixerMode} onBack={() => navigate("/dashboard")} />} />
                <Route path="/visualizer" element={<Visualizer />} />
                <Route path="/broadcast" element={<Broadcast />} />
                <Route path="/bookings" element={<Bookings />} />
                <Route path="/infrastructure" element={<Infrastructure />} />
                <Route path="/listener" element={<PubListener />} />
                <Route path="/profile" element={<DJProfile />} />
                <Route path="/settings" element={<DJSettings />} />
                <Route path="/admin" element={
                  STAFF_ROLES.includes(user.role) ? <Admin /> : <Navigate to="/dashboard" />
                } />
                <Route path="*" element={
                  <Navigate to={user.role === "pub" ? "/listener" : STAFF_ROLES.includes(user.role) ? "/admin" : "/dashboard"} />
                } />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        <Toast />
      </div>
    </ErrorBoundary>
  );
}
