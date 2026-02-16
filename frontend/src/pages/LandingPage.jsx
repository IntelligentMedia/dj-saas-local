import React, { useEffect, useState } from "react";

const API = "http://localhost:4000";

export default function LandingPage({ onGoLogin, onGoRegister }) {
  const [plans, setPlans] = useState([]);
  const [c, setC] = useState({});

  useEffect(() => {
    fetch(API + "/payments/plans").then(r => r.json()).then(d => setPlans(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(API + "/admin/landing").then(r => r.json()).then(d => setC(d || {})).catch(() => {});
  }, []);

  const j = (key, fallback = []) => {
    try { return typeof c[key] === "string" ? JSON.parse(c[key]) : (c[key] || fallback); } catch { return fallback; }
  };
  const jObj = (key) => {
    try { return typeof c[key] === "string" ? JSON.parse(c[key]) : (c[key] || {}); } catch { return {}; }
  };

  const heroStats = j("hero_stats", [
    { value: "2-Deck", label: "Mixer" }, { value: "Live", label: "Broadcasting" },
    { value: "3D", label: "Visualizer" }, { value: "Cloud", label: "Music Library" }
  ]);
  const features = j("features", [
    ["🎛️","Pro Mixer","2-deck mixer with EQ, crossfader, hot cues, loops, pitch control."],
    ["📡","Live Broadcasting","Stream sets live with real-time chat and song requests."],
    ["🌐","3D Visualizer","Three.js visuals reacting to your music in real time."],
    ["📅","Booking System","Pubs browse and book DJs directly."],
    ["☁️","Cloud Library","88+ tracks with genre filtering and instant deck loading."],
    ["🤚","Hand Tracking","MediaPipe gesture control — wave to scratch and mix."],
    ["💰","Billing & Payments","Subscriptions, escrow payments, commission tracking."],
    ["📊","DJ Dashboard","Earnings, play stats, setlist exports, and ratings."],
    ["🎚️","FX Processor","Reverb, delay, filter with real-time control."],
    ["🔊","Auto-Mix","Intelligent transitions — smooth, cut, echo, backspin."],
    ["👤","DJ Profiles","Public profile with bio, genres, ratings, history."],
    ["⚙️","Full Settings","Audio, notifications, availability, and security."],
  ].map(([icon, title, desc]) => ({ icon, title, desc })));
  const djSteps = j("how_dj_steps", [
    { title: "Sign up & set your profile", desc: "Add your bio, genres, hourly rate, and availability." },
    { title: "Go live in the mixer", desc: "Load tracks from the cloud library, mix with pro controls, and broadcast." },
    { title: "Get booked & earn", desc: "Pubs discover and book you. Track earnings, ratings, and session history." },
  ]);
  const pubSteps = j("how_pub_steps", [
    { title: "Browse & discover DJs", desc: "Find DJs by genre, rate, and ratings — no subscription needed." },
    { title: "Book & pay securely", desc: "Schedule DJs for your venue. Pay through platform escrow." },
    { title: "Listen & interact", desc: "Stream the live set, request songs, chat, and rate your DJ." },
  ]);
  const social = jObj("social_links");

  return (
    <div className="landing">
      {/* ── Navbar ── */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          {c.logo_url ? <img src={c.logo_url} alt="logo" style={{ height: 32, marginRight: 8, borderRadius: 6 }} /> : "🎧"}{" "}
          {c.logo_text || "DJ SaaS"}
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#how">How It Works</a>
          <button className="landing-login-btn" onClick={onGoLogin}>Login</button>
          <button className="landing-cta-sm" onClick={onGoRegister}>Sign Up Free</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero" style={c.hero_image_url ? { backgroundImage: `url(${c.hero_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}>
        <div className="landing-hero-glow" />
        <div className="landing-hero-content">
          <h1 className="landing-hero-title">
            {c.hero_title || "Professional DJ Platform"}<br />
            <span className="landing-accent">{c.hero_accent || "Stream. Mix. Get Booked."}</span>
          </h1>
          <p className="landing-hero-sub">
            {c.hero_subtitle || "The all-in-one SaaS platform for DJs to mix live, broadcast to listeners, manage bookings, and grow their audience — right from the browser."}
          </p>
          {c.hero_video_url && (
            <div style={{ margin: "18px auto", maxWidth: 560 }}>
              <video src={c.hero_video_url} controls style={{ width: "100%", borderRadius: 12 }} />
            </div>
          )}
          <div className="landing-hero-btns">
            <button className="landing-btn primary" onClick={onGoRegister}>Get Started Free</button>
            <button className="landing-btn secondary" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
              See Features ↓
            </button>
          </div>
          <div className="landing-hero-stats">
            {heroStats.map((s, i) => (
              <div className="lh-stat" key={i}><span className="lh-stat-val">{s.value}</span><span>{s.label}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-features" id="features">
        <h2 className="landing-section-title">{c.features_title || "Everything You Need to DJ Online"}</h2>
        <p className="landing-section-sub">{c.features_subtitle || "Professional tools built for the modern DJ workflow"}</p>
        <div className="landing-features-grid">
          {features.map((f, i) => (
            <div className="landing-feature-card" key={i}>
              <div className="lf-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="landing-pricing" id="pricing">
        <h2 className="landing-section-title">{c.pricing_title || "Simple, Transparent Pricing"}</h2>
        <p className="landing-section-sub">{c.pricing_subtitle || "Plans for DJs — Pubs use the platform completely free"}</p>
        <div className="landing-plans-grid">
          {plans.map((plan) => {
            const popular = plan.name.toLowerCase().includes("pro");
            return (
              <div key={plan.id} className={`landing-plan-card ${popular ? "popular" : ""}`}>
                {popular && <div className="lp-badge">Most Popular</div>}
                <h3 className="lp-name">{plan.name}</h3>
                <div className="lp-price">
                  <span className="lp-dollar">$</span>
                  <span className="lp-amount">{Number(plan.price).toFixed(0)}</span>
                  {plan.price > 0 && <span className="lp-period">/mo</span>}
                </div>
                <ul className="lp-features">
                  <li>✓ {plan.max_hours_per_month || "Unlimited"} hours / month</li>
                  <li>✓ {plan.max_bookings_per_month || "Unlimited"} bookings / month</li>
                  <li>✓ {plan.commission_rate}% platform commission</li>
                  {plan.features && plan.features.split(",").map((f, j) => (
                    <li key={j}>✓ {f.trim()}</li>
                  ))}
                </ul>
                <button className={`landing-btn ${popular ? "primary" : "secondary"}`} onClick={onGoRegister}>
                  {plan.price === 0 || plan.price === "0.00" ? "Start Free" : "Get Started"}
                </button>
              </div>
            );
          })}
          {plans.length === 0 && (
            <div className="landing-plan-card">
              <h3 className="lp-name">Free to Start</h3>
              <div className="lp-price"><span className="lp-dollar">$</span><span className="lp-amount">0</span></div>
              <p style={{ color: "#888", fontSize: "0.85rem" }}>Plans load from the live API</p>
              <button className="landing-btn primary" onClick={onGoRegister}>Sign Up Free</button>
            </div>
          )}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="landing-how" id="how">
        <h2 className="landing-section-title">{c.how_title || "How It Works"}</h2>
        <div className="landing-how-grid">
          <div className="landing-how-col">
            <h3 className="lh-col-title">🎧 For DJs</h3>
            <div className="landing-steps">
              {djSteps.map((s, i) => (
                <div className="landing-step" key={i}>
                  <div className="ls-num">{i + 1}</div>
                  <div><h4>{s.title}</h4><p>{s.desc}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="landing-how-col">
            <h3 className="lh-col-title">🍻 For Pubs & Venues</h3>
            <div className="landing-steps">
              {pubSteps.map((s, i) => (
                <div className="landing-step" key={i}>
                  <div className="ls-num">{i + 1}</div>
                  <div><h4>{s.title}</h4><p>{s.desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Promo Video ── */}
      {c.promo_video_url && (
        <section className="landing-promo" style={{ textAlign: "center", padding: "40px 20px" }}>
          <h2 className="landing-section-title">See It In Action</h2>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {c.promo_video_url.includes("youtube") || c.promo_video_url.includes("youtu.be") ? (
              <iframe src={c.promo_video_url.replace("watch?v=", "embed/")} style={{ width: "100%", aspectRatio: "16/9", border: "none", borderRadius: 12 }} allowFullScreen />
            ) : (
              <video src={c.promo_video_url} controls style={{ width: "100%", borderRadius: 12 }} />
            )}
          </div>
        </section>
      )}

      {/* ── Gallery ── */}
      {j("gallery_images").length > 0 && (
        <section className="landing-gallery" style={{ padding: "40px 20px" }}>
          <h2 className="landing-section-title">Gallery</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            {j("gallery_images").map((url, i) => (
              <img key={i} src={url} alt={`gallery-${i}`} style={{ height: 180, borderRadius: 10, objectFit: "cover" }} />
            ))}
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <section className="landing-cta-section">
        <h2>{c.cta_title || "Ready to Start Mixing?"}</h2>
        <p>{c.cta_subtitle || "Join the platform and take your DJ career online."}</p>
        <div className="landing-hero-btns">
          <button className="landing-btn primary" onClick={onGoRegister}>Create Free Account</button>
          <button className="landing-btn secondary" onClick={onGoLogin}>Login</button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="lf-brand">
            <span className="lf-logo">
              {c.logo_url ? <img src={c.logo_url} alt="" style={{ height: 24, marginRight: 6, borderRadius: 4, verticalAlign: "middle" }} /> : "🎧"}{" "}
              {c.logo_text || "DJ SaaS"}
            </span>
            <p>{c.footer_text || "Professional DJ streaming platform"}</p>
          </div>
          <div className="lf-links">
            <h4>Platform</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#how">How It Works</a>
          </div>
          <div className="lf-links">
            <h4>Account</h4>
            <a href="#" onClick={onGoLogin}>Login</a>
            <a href="#" onClick={onGoRegister}>Register</a>
          </div>
          <div className="lf-links">
            <h4>Contact</h4>
            {c.contact_email && <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a>}
            {c.contact_phone && <span>{c.contact_phone}</span>}
            {c.contact_address && <span>{c.contact_address}</span>}
            {Object.entries(social).filter(([, v]) => v).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noreferrer">{k.charAt(0).toUpperCase() + k.slice(1)}</a>
            ))}
          </div>
        </div>
        <div className="lf-bottom">
          {c.footer_text || "© 2026 DJ SaaS Platform. All rights reserved."}
        </div>
      </footer>
    </div>
  );
}
