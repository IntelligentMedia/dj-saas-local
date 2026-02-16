
DJ SAAS PLATFORM (Unified)

Features:
- Login with JWT auth + bcrypt (MySQL)
- Role-based access: Admin, DJ, Pub
- Dual-deck DJ mixer with real Web Audio
- 3-band EQ per deck (Low/Mid/High)
- Crossfader with gain node routing
- Live frequency spectrum waveform per deck
- 3D AI DJ Avatar visualizer (Three.js)
- Mouse-orbit camera in visualizer
- Admin dashboard: platform stats, user CRUD, DJ approval
- Neon cyberpunk theme

Accounts (password: 1234):
- admin / dj1 / pub1

Run:
1. Import xampp_schema.sql into MySQL
2. cd api && npm install && npm start
3. cd frontend && npm install && npm run dev
4. Open http://localhost:5173
