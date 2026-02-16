const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "DJ_SAAS_UNIFIED_SECRET";

// ── Role constants ──
const STAFF_ROLES = ["admin", "sysadmin", "accountant", "support", "sales", "marketing"];
const ALL_ROLES   = ["dj", "pub", ...STAFF_ROLES];

// ── Permission map: which roles can access which sections ──
const PERMISSIONS = {
  users:           ["admin", "sysadmin", "support"],
  stats:           ["admin", "sysadmin"],
  payment_settings:["admin", "sysadmin", "accountant"],
  payment_summary: ["admin", "sysadmin", "accountant"],
  plans:           ["admin", "sysadmin", "sales"],
  billing:         ["admin", "sysadmin", "accountant"],
  landing:         ["admin", "sysadmin", "marketing"],
  music:           ["admin", "sysadmin"],
  activation:      ["admin", "sysadmin"],
  bookings_admin:  ["admin", "sysadmin", "support"],
  dj_features:     ["dj", "admin", "sysadmin"],
};

// ── Core auth — verifies JWT (header or ?token= query param for media) ──
function auth(req, res, next) {
  const header = req.headers.authorization;
  const raw = header ? header.split(" ")[1] : req.query.token;
  if (!raw) return res.sendStatus(401);
  try {
    req.user = jwt.verify(raw, SECRET);
    next();
  } catch {
    res.sendStatus(403);
  }
}

// ── Legacy: admin or sysadmin ──
function adminOnly(req, res, next) {
  if (req.user.role !== "admin" && req.user.role !== "sysadmin") return res.sendStatus(403);
  next();
}

// ── Legacy: dj, admin, or sysadmin ──
function djOnly(req, res, next) {
  if (!["dj", "admin", "sysadmin"].includes(req.user.role)) return res.sendStatus(403);
  next();
}

// ── Any staff member (not dj/pub) ──
function staffOnly(req, res, next) {
  if (!STAFF_ROLES.includes(req.user.role)) return res.sendStatus(403);
  next();
}

// ── Flexible: allow specific roles ──
function hasRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  };
}

// ── Permission-based: check PERMISSIONS map ──
function can(permission) {
  return (req, res, next) => {
    const allowed = PERMISSIONS[permission] || [];
    if (!allowed.includes(req.user.role)) return res.sendStatus(403);
    next();
  };
}

module.exports = { auth, adminOnly, djOnly, staffOnly, hasRole, can, SECRET, STAFF_ROLES, ALL_ROLES, PERMISSIONS };
