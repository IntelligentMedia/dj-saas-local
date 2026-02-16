import React, { useState, useEffect } from "react";
import { apiFetch, getUser } from "../utils/api";

export default function Bookings() {
  const user = getUser();
  const [bookings, setBookings] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [billing, setBilling] = useState(null);
  const [djs, setDjs] = useState([]);
  const [newBooking, setNewBooking] = useState({ dj_id: "", hours: 1 });
  const [codes, setCodes] = useState([]);
  const [streamAccess, setStreamAccess] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [djRate, setDjRate] = useState(50);
  const [selectedDjRate, setSelectedDjRate] = useState(null);

  const load = async () => {
    try {
      const [b, s, e, bl] = await Promise.all([
        apiFetch("/bookings"),
        apiFetch("/bookings/sessions"),
        apiFetch("/billing/realtime-earnings"),
        apiFetch("/billing/run"),
      ]);
      setBookings(b); setSessions(s); setEarnings(e); setBilling(bl);
    } catch {}

    // Load DJs with rates for booking form
    if (user?.role === "admin" || user?.role === "pub") {
      try {
        const djList = await apiFetch("/payments/dj-rates");
        setDjs(djList);
      } catch {
        // Fallback: load from admin users
        try {
          const users = await apiFetch("/admin/users");
          setDjs(users.filter(u => u.role === "dj" && u.approved));
        } catch {}
      }
    }

    // Load subscription & plans
    try {
      const sub = await apiFetch("/payments/my-subscription");
      setSubscription(sub.subscription);
    } catch {}

    try { setPlans(await apiFetch("/payments/plans")); } catch {}

    // Load transactions
    try { setTransactions(await apiFetch("/payments/transactions")); } catch {}

    // DJ rate
    if (user?.role === "dj") {
      try {
        const r = await apiFetch("/payments/dj-rate");
        setDjRate(r.hourly_rate);
      } catch {}
    }

    // Load activation codes (admin)
    if (user?.role === "admin") {
      try { setCodes(await apiFetch("/activation/codes")); } catch {}
    }
  };

  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);

  const createBooking = async () => {
    if (!newBooking.dj_id) return;
    await apiFetch("/bookings", { method: "POST", body: JSON.stringify(newBooking) });
    load();
  };

  const confirmBooking = async (id) => { await apiFetch(`/bookings/${id}/confirm`, { method: "POST" }); load(); };
  const cancelBooking = async (id) => { await apiFetch(`/bookings/${id}/cancel`, { method: "POST" }); load(); };
  const processPayment = async (id) => { await apiFetch(`/payments/process-booking/${id}`, { method: "POST" }); load(); };

  const subscribeToPlan = async (planId) => {
    await apiFetch("/payments/subscribe", { method: "POST", body: JSON.stringify({ plan_id: planId }) });
    load();
  };

  const updateDjRate = async () => {
    await apiFetch("/payments/dj-rate", { method: "PUT", body: JSON.stringify({ rate: djRate }) });
    load();
  };

  const handleDjSelect = (djId) => {
    setNewBooking({ ...newBooking, dj_id: djId });
    const dj = djs.find(d => d.id === Number(djId));
    setSelectedDjRate(dj ? Number(dj.hourly_rate) : null);
  };

  const checkStreamAccess = async () => {
    try { setStreamAccess(await apiFetch("/activation/stream-access")); } catch {}
  };

  return (
    <div className="bookings-page">
      <h1 className="page-title">📅 Bookings, Payments & Subscriptions</h1>

      {/* ── DJ Rate Setting (DJ only) ── */}
      {user?.role === "dj" && (
        <div className="card">
          <h3>💵 My Hourly Rate</h3>
          <div className="booking-form">
            <span style={{color:"var(--neon-cyan)"}}>$/hr:</span>
            <input type="number" min="10" max="500" step="5" value={djRate}
              onChange={e => setDjRate(Number(e.target.value))} style={{width: 100}} />
            <button className="deck-btn" onClick={updateDjRate}>Update Rate</button>
            <span className="ai-status">Current: ${djRate}/hr</span>
          </div>
        </div>
      )}

      {/* ── DJ Subscription Plan ── */}
      {(user?.role === "dj" || user?.role === "admin") && (
        <div className="card">
          <h3>📦 My Subscription Plan</h3>
          <p style={{color:"#888",fontSize:"0.8rem",marginBottom:12}}>Your plan determines your platform commission rate and booking limits.</p>
          {subscription ? (
            <div className="subscription-active">
              <div className="earnings-grid">
                <div className="stat-card">
                  <span className="stat-value">{subscription.plan}</span>
                  <span className="stat-label">Current Plan</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">${subscription.price}/mo</span>
                  <span className="stat-label">Monthly Price</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{subscription.commission_rate}%</span>
                  <span className="stat-label">Platform Commission</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{subscription.limits.used_bookings}/{subscription.limits.max_bookings || "∞"}</span>
                  <span className="stat-label">Bookings This Month</span>
                </div>
              </div>
              <div style={{color:"#888",fontSize:"0.8rem",marginTop:8}}>
                Expires: {new Date(subscription.expires_at).toLocaleDateString()} · Features: {subscription.features}
              </div>
            </div>
          ) : (
            <p style={{color:"#ff9900"}}>⚠️ No active subscription — choose a plan below to start accepting bookings</p>
          )}

          <h4 style={{color:"var(--neon-cyan)", marginTop: 16}}>Available Plans</h4>
          <div className="plans-grid">
            {plans.map(p => (
              <div key={p.id} className={`plan-card ${subscription?.plan === p.name ? "current" : ""}`}>
                <div className="plan-name">{p.name}</div>
                <div className="plan-price">${p.price}<span>/mo</span></div>
                <div className="plan-features">{p.features}</div>
                <div className="plan-commission">{p.commission_rate}% platform fee</div>
                <button className="deck-btn" onClick={() => subscribeToPlan(p.id)}
                  disabled={subscription?.plan === p.name}>
                  {subscription?.plan === p.name ? "Current" : "Subscribe"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stream Access Check */}
      <div className="card">
        <h3>🔐 Stream Access Gate</h3>
        <button className="deck-btn" onClick={checkStreamAccess}>Check Stream Access</button>
        {streamAccess && (
          <div className={`stream-access-result ${streamAccess.granted ? "granted" : "denied"}`}>
            <strong>{streamAccess.granted ? "✅ ACCESS GRANTED" : "❌ ACCESS DENIED"}</strong>
            <div className="checks-list">
              <span className={streamAccess.checks?.approved ? "pass" : "fail"}>DJ Approved: {streamAccess.checks?.approved ? "✓" : "✗"}</span>
              <span className={streamAccess.checks?.activeSession ? "pass" : "fail"}>Active Session: {streamAccess.checks?.activeSession ? "✓" : "✗"}</span>
              <span className={streamAccess.checks?.validActivation ? "pass" : "fail"}>Activation Code: {streamAccess.checks?.validActivation ? "✓" : "✗"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Realtime Earnings */}
      {earnings && earnings.active_sessions > 0 && (
        <div className="card earnings-card">
          <h3>💰 Realtime Earnings</h3>
          <div className="earnings-grid">
            <div className="stat-card">
              <span className="stat-value">{earnings.active_sessions}</span>
              <span className="stat-label">Active Sessions</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">${earnings.total_platform_revenue}</span>
              <span className="stat-label">Platform Revenue</span>
            </div>
          </div>
          {earnings.earnings.map(e => (
            <div key={e.session_id} className="earning-row">
              <span>🎧 {e.dj}</span>
              <span>{e.elapsed_minutes}min</span>
              <span>${e.earned_so_far} earned</span>
              <span className="dj-net">${e.dj_net} net</span>
            </div>
          ))}
        </div>
      )}

      {/* Billing Summary */}
      {billing && billing.billing.length > 0 && (
        <div className="card">
          <h3>📊 Billing Summary</h3>
          <div className="earnings-grid">
            <div className="stat-card"><span className="stat-value">${billing.totals.totalRevenue}</span><span className="stat-label">Total Revenue</span></div>
            <div className="stat-card"><span className="stat-value">${billing.totals.totalPlatformFees}</span><span className="stat-label">Platform Fees</span></div>
            <div className="stat-card"><span className="stat-value">${billing.totals.totalDjPayouts}</span><span className="stat-label">DJ Payouts</span></div>
          </div>
          <table className="data-table" style={{marginTop: 10}}>
            <thead><tr><th>Booking</th><th>DJ</th><th>Rate</th><th>Hours</th><th>Commission</th><th>Total</th><th>DJ Gets</th></tr></thead>
            <tbody>
              {billing.billing.map(b => (
                <tr key={b.booking_id}>
                  <td>#{b.booking_id}</td>
                  <td>{b.dj}</td>
                  <td>${b.rate}/hr</td>
                  <td>{b.hours}h</td>
                  <td>{b.commissionRate}% ({b.plan})</td>
                  <td>${b.total}</td>
                  <td className="dj-net">${b.djEarnings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Booking */}
      {(user?.role === "pub" || user?.role === "admin") && (
        <div className="card">
          <h3>➕ Book a DJ</h3>
          <div className="booking-form">
            <select value={newBooking.dj_id} onChange={e => handleDjSelect(e.target.value)}>
              <option value="">Select DJ</option>
              {djs.map(d => <option key={d.id} value={d.id}>{d.username} — ${d.hourly_rate || 50}/hr</option>)}
            </select>
            <input type="number" min="1" max="12" value={newBooking.hours}
              onChange={e => setNewBooking({ ...newBooking, hours: Number(e.target.value) })}
              placeholder="Hours" />
            {selectedDjRate && (
              <span className="ai-status">
                Estimate: ${selectedDjRate * newBooking.hours} total
                (platform fee based on DJ's plan)
              </span>
            )}
            <button className="deck-btn" onClick={createBooking}>Book DJ</button>
          </div>
        </div>
      )}

      {/* Bookings List */}
      <div className="card">
        <h3>📋 All Bookings</h3>
        <table className="data-table">
          <thead><tr><th>ID</th><th>DJ</th><th>Pub</th><th>Hours</th><th>Rate</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {bookings.map(b => (
              <tr key={b.id}>
                <td>{b.id}</td>
                <td>{b.dj_name}</td>
                <td>{b.pub_name}</td>
                <td>{b.hours}h</td>
                <td>${b.rate}/hr</td>
                <td><span className={`status-badge status-${b.status}`}>{b.status}</span></td>
                <td>
                  {b.status === "pending" && <button className="deck-btn small" onClick={() => confirmBooking(b.id)}>✓ Confirm</button>}
                  {(b.status === "completed" || b.status === "active") && <button className="deck-btn small" onClick={() => processPayment(b.id)}>💳 Process</button>}
                  {b.status !== "cancelled" && b.status !== "completed" && <button className="deck-btn small danger" onClick={() => cancelBooking(b.id)}>✗ Cancel</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment Transactions */}
      {transactions.length > 0 && (
        <div className="card">
          <h3>💳 Payment Transactions</h3>
          <table className="data-table">
            <thead><tr><th>ID</th><th>Type</th><th>Amount</th><th>Description</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td><span className={`status-badge type-${t.type}`}>{t.type.replace(/_/g," ")}</span></td>
                  <td className={t.type === "dj_payout" ? "dj-net" : ""}>${t.amount}</td>
                  <td title={t.description}>{t.description?.substring(0,50)}</td>
                  <td><span className={`status-badge status-${t.status}`}>{t.status}</span></td>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sessions */}
      <div className="card">
        <h3>⏱ Active Sessions</h3>
        <table className="data-table">
          <thead><tr><th>ID</th><th>DJ</th><th>Active</th><th>Started</th></tr></thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.dj_name}</td>
                <td>{s.active ? "🟢 Live" : "⚫ Ended"}</td>
                <td>{s.started_at ? new Date(s.started_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Activation Codes (admin) */}
      {user?.role === "admin" && codes.length > 0 && (
        <div className="card">
          <h3>🔑 Activation Codes</h3>
          <table className="data-table">
            <thead><tr><th>Code</th><th>Start</th><th>End</th><th>Status</th></tr></thead>
            <tbody>
              {codes.map(c => {
                const now = new Date();
                const active = now >= new Date(c.start_time) && now <= new Date(c.end_time);
                return (
                  <tr key={c.id}>
                    <td>{c.code}</td>
                    <td>{new Date(c.start_time).toLocaleString()}</td>
                    <td>{new Date(c.end_time).toLocaleString()}</td>
                    <td>{active ? "🟢 Active" : "⚫ Expired"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
