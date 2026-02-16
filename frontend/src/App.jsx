
import React, { useState, useEffect, Suspense, lazy } from "react";
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
  const STAFF_ROLES = ["admin","sysadmin","accountant","support","sales","marketing"];
  const defaultPage = user?.role === "pub" ? "listener" : STAFF_ROLES.includes(user?.role) ? "admin" : "dashboard";
  const [page, setPage] = useState(defaultPage);
  const [authView, setAuthView] = useState("landing"); // landing | login

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
    setPage(userData?.role === "pub" ? "listener" : ["admin","sysadmin","accountant","support","sales","marketing"].includes(userData?.role) ? "admin" : "dashboard");
  };

  const handleNavigate = (p) => {
    if (p === "login") {
      clearToken();
      setUser(null);
      setCurrentDJ(null);
    }
    setPage(p);
  };

  const handleStartSession = (mode) => {
    setMixerMode(mode);
    setPage("mixer");
  };

  if (!user) {
    if (authView === "login") {
      return <Login onLogin={handleLogin} onBack={() => setAuthView("landing")} />;
    }
    return (
      <LandingPage
        onGoLogin={() => setAuthView("login")}
        onGoRegister={() => setAuthView("login")}
      />
    );
  }

  return (
    <ErrorBoundary fallbackMessage="The app encountered an error. Try reloading.">
      <div className="app">
        <Navbar onNavigate={handleNavigate} />
        <main className="main-content">
          <ErrorBoundary fallbackMessage="This page crashed. Try navigating to another page.">
            <Suspense fallback={<PageSpinner />}>
              {page === "dashboard" && <DJDashboard onStartSession={handleStartSession} />}
              {page === "mixer" && <Mixer mode={mixerMode} onBack={() => setPage("dashboard")} />}
              {page === "visualizer" && <Visualizer />}
              {page === "broadcast" && <Broadcast />}
              {page === "bookings" && <Bookings />}
              {page === "infrastructure" && <Infrastructure />}
              {page === "listener" && <PubListener />}
              {page === "profile" && <DJProfile />}
              {page === "settings" && <DJSettings />}
              {page === "admin" && ["admin","sysadmin","accountant","support","sales","marketing"].includes(user.role) && <Admin />}
            </Suspense>
          </ErrorBoundary>
        </main>
        <Toast />
      </div>
    </ErrorBoundary>
  );
}
