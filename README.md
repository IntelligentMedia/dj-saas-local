
# 🎧 DJ SaaS Platform

A full-featured **Software-as-a-Service platform** for live DJ performances, pub bookings, and real-time audio broadcasting. Built with React, Node.js/Express, MySQL, Three.js, Web Audio API, and WebRTC.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Docker Deployment](#docker-deployment)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Test Accounts](#test-accounts)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Area | Highlights |
|------|-----------|
| **DJ Mixer** | Dual-deck mixing, 3-band EQ, crossfader curves, BPM sync, FX chain (reverb, delay, filter, flanger, distortion), sampler pads, mix recorder |
| **Music Library** | Cloud-tracked catalog with full-text search, genre/BPM/energy filters, favorites, playlists, play history |
| **3D Visualizer** | Three.js stage with DJ avatar, animated crowd, club lights, lasers, pyro effects, metaverse mode, globe mode |
| **Live Broadcast** | WebRTC peer-to-peer audio streaming via Socket.IO signaling + LiveKit integration |
| **Hand Tracking** | MediaPipe hand-gesture control for mixer (experimental) |
| **Booking System** | Pub-to-DJ bookings with scheduling, confirmation, live sessions, and session ratings |
| **Billing & Payments** | Subscription plans, DJ hourly rates, payment gateway config, real-time earnings, platform commissions |
| **Admin Panel** | User CRUD, DJ approval, role management (RBAC), subscription plan editor, landing-page CMS, payment settings, audit log |
| **Employee Roles** | Admin, SysAdmin, Accountant, Support, Sales, Marketing — each with configurable permissions |
| **Auth** | JWT access + refresh tokens, bcrypt passwords, rate-limited login |

---

## Architecture

```
┌──────────────┐   HTTP/WS    ┌──────────────┐     SQL      ┌───────────┐
│   React SPA  │ ◄──────────► │  Express API  │ ◄──────────► │   MySQL   │
│  (Vite 5)    │   :5173      │  + Socket.IO  │   :4000      │  (XAMPP)  │
│              │              │  + Helmet     │              │  21 tables│
└──────┬───────┘              └──────┬────────┘              └───────────┘
       │                             │
  Three.js 3D               WebRTC Signaling
  Web Audio API              LiveKit Tokens
  MediaPipe Hands            Rate Limiting
```

---

## Tech Stack

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express 4.18 with Helmet, CORS, rate limiting
- **Database:** MySQL 8 / MariaDB 10 (via mysql2)
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **Real-time:** Socket.IO 4.8 for WebRTC signaling & live chat
- **Streaming:** LiveKit Server SDK for broadcast rooms

### Frontend
- **UI:** React 18.2 with React Router 7
- **Build:** Vite 5 with @vitejs/plugin-react and code-splitting
- **State:** Zustand 5
- **3D:** Three.js 0.161 (stage, avatar, crowd, lighting engines)
- **Audio:** Web Audio API (dual-deck graph with FX chain)
- **Hand Tracking:** MediaPipe Hands + Camera Utils
- **Real-time:** Socket.IO Client + LiveKit Client

### DevOps
- **Containers:** Docker + Docker Compose (API, Frontend/nginx, MySQL)
- **CI:** GitHub Actions (lint → build → docker)
- **Linting:** ESLint + Prettier
- **Security:** Helmet, body size limits, graceful shutdown, global error handler

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | LTS recommended |
| npm | 10+ | Comes with Node |
| MySQL | 8+ | Or XAMPP/MariaDB |
| Git | 2+ | |

---

## Getting Started

### 1. Clone & configure

```bash
git clone <your-repo-url> dj-saas
cd dj-saas
cp api/.env.example api/.env      # edit DB credentials & secrets
cp frontend/.env.example frontend/.env
```

### 2. Import database

```bash
mysql -u root < xampp_schema.sql
```

### 3. Install & run

```bash
# Terminal 1 — API
cd api && npm install && npm start
# → http://localhost:4000/health

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

---

## Docker Deployment

```bash
docker compose up --build -d
# Frontend → http://localhost
# API      → http://localhost:4000
# MySQL    → localhost:3306
```

---

## API Reference

> 97 endpoints across 11 route files. All under `http://localhost:4000`.

| Prefix | Routes | Description |
|--------|--------|-------------|
| `/auth` | 5 | Login, register, refresh token, logout, current user |
| `/admin` | 17 | User management, stats, plans, roles, payment settings, landing CMS |
| `/rooms` | 8 | Broadcast rooms — CRUD, toggle live, join/leave |
| `/livekit` | 2 | LiveKit token generation, server info |
| `/activation` | 4 | Timed access codes for stream windows |
| `/bookings` | 7 | Pub↔DJ bookings, session start/stop |
| `/billing` | 2 | Run billing cycle, real-time earnings |
| `/payments` | 9 | Subscription plans, DJ rates, transactions, booking payments |
| `/music` | 20 | Track catalog, streaming proxy, playlists, favorites |
| `/profile` | 15 | User profile, play history, ratings, DJ settings |
| `/ai` | 5 | AI lineup, room director, crowd energy, load prediction |
| `/infra` | 12 | Infrastructure tokens (cluster, geo, mesh, WebRTC, healing) |
| `/health` | 1 | Health-check endpoint |

---

## Project Structure

```
dj-saas-local/
├── api/
│   ├── server.js           # Express + Socket.IO entry point
│   ├── db.js               # MySQL connection pool
│   ├── middleware/
│   │   └── auth.js         # JWT verify + RBAC (can, hasRole, staffOnly)
│   ├── routes/             # 11 route modules (97 endpoints)
│   │   ├── admin.js        ├── ai.js
│   │   ├── auth.js         ├── billing.js
│   │   ├── bookings.js     ├── activation.js
│   │   ├── infrastructure.js ├── livekit.js
│   │   ├── music-library.js  ├── payments.js
│   │   ├── profile.js      └── rooms.js
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── vite.config.js      # Vite + React plugin + proxy + code-splitting
│   ├── src/
│   │   ├── main.jsx        # Entry — StrictMode + ErrorBoundary
│   │   ├── App.jsx          # Router + Mixer persistence
│   │   ├── pages/          # 12 page components
│   │   ├── components/     # 12 reusable components
│   │   ├── engine/         # 6 modules (audio, avatar, crowd, lighting, stage)
│   │   ├── store/          # Zustand stores (djStore, toastStore)
│   │   ├── styles/         # CSS files
│   │   └── utils/          # Helpers (api.js, formatters, etc.)
│   ├── Dockerfile          # Multi-stage build (Vite → nginx)
│   ├── nginx.conf
│   └── .env.example
├── docker-compose.yml      # 3 services: api, frontend, db
├── xampp_schema.sql        # Complete schema (21 tables + seed data)
├── .github/workflows/ci.yml
├── .eslintrc configs       # Per-project ESLint
├── .prettierrc
└── .gitignore
```

---

## Test Accounts

| Username | Password | Role |
|----------|----------|------|
| `admin` | `1234` | Administrator |
| `dj1` | `1234` | DJ |
| `pub1` | `1234` | Pub / Listener |

---

## Contributing

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Follow the ESLint + Prettier config
3. Write tests for new API endpoints
4. Submit a PR against `main`

---

## License

MIT
