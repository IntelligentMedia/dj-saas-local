-- ═══════════════════════════════════════════════════════════
--  DJ SaaS — Complete Database Schema
--  MySQL 5.7+ / MariaDB 10.3+
--  Last updated: 2026-02-16
-- ═══════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS dj_saas;
USE dj_saas;

-- ─── Users (DJs, Pubs, Staff) ─────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('dj','pub','admin','accountant','support','sales','marketing','sysadmin') DEFAULT 'pub',
  approved BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hourly_rate DECIMAL(10,2) DEFAULT 50.00,
  bio TEXT DEFAULT NULL,
  genres VARCHAR(255) DEFAULT NULL,
  social_links TEXT DEFAULT NULL,
  avatar_url VARCHAR(500) DEFAULT NULL,
  UNIQUE KEY idx_email (email)
);

-- ─── Refresh Tokens (JWT rotation) ───────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(512) UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_token (token),
  KEY idx_user (user_id),
  KEY idx_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Audit Log (admin actions, security events) ─────────
CREATE TABLE IF NOT EXISTS audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) DEFAULT NULL,
  target_id INT DEFAULT NULL,
  details TEXT DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_user (user_id),
  KEY idx_audit_action (action),
  KEY idx_audit_time (created_at)
);

-- ─── Rooms / Broadcast Channels ──────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  dj_id INT,
  is_live BOOLEAN DEFAULT 0,
  listeners INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dj_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── Activation Codes (timed access windows) ─────────────
CREATE TABLE IF NOT EXISTS activation_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Sessions (DJ mixing sessions) ───────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT,
  dj_id INT,
  active BOOLEAN DEFAULT 0,
  started_at DATETIME,
  ended_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_session_dj (dj_id),
  KEY idx_session_active (active),
  FOREIGN KEY (dj_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── Bookings (pub books a DJ) ───────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dj_id INT,
  pub_id INT,
  hours INT DEFAULT 1,
  rate DECIMAL(10,2) DEFAULT 50.00,
  status ENUM('pending','confirmed','active','completed','cancelled') DEFAULT 'pending',
  active BOOLEAN DEFAULT 0,
  scheduled_start DATETIME,
  scheduled_end DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_booking_dj (dj_id),
  KEY idx_booking_pub (pub_id),
  KEY idx_booking_status (status),
  FOREIGN KEY (dj_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (pub_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── Subscription Plans ──────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  max_hours_per_month INT DEFAULT 0,
  max_bookings_per_month INT DEFAULT 0,
  commission_rate DECIMAL(5,2) DEFAULT 20.00,
  features TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── DJ Subscriptions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS dj_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dj_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('active','cancelled','expired','trial') DEFAULT 'trial',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dj_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
);

-- ─── Payments (ledger for all money movement) ────────────
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT,
  payer_id INT,
  payee_id INT,
  type ENUM('booking_payment','platform_fee','dj_payout','subscription','refund') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description VARCHAR(255),
  status ENUM('pending','completed','failed','refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payment_booking (booking_id),
  KEY idx_payment_status (status),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (payee_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── Payment Gateway Settings ────────────────────────────
CREATE TABLE IF NOT EXISTS payment_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Cloud Tracks (music library) ────────────────────────
CREATE TABLE IF NOT EXISTS cloud_tracks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(200) NOT NULL,
  album VARCHAR(200) DEFAULT '',
  genre VARCHAR(50) NOT NULL,
  bpm INT DEFAULT 120,
  duration_sec INT DEFAULT 240,
  key_signature VARCHAR(10) DEFAULT '',
  energy INT DEFAULT 5,
  year INT DEFAULT 2024,
  artwork_url VARCHAR(500) DEFAULT '',
  stream_url VARCHAR(500) NOT NULL,
  waveform_data TEXT DEFAULT NULL,
  plays INT DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  added_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_genre (genre),
  KEY idx_bpm (bpm),
  KEY idx_artist (artist),
  KEY idx_energy (energy),
  FULLTEXT KEY idx_search (title, artist, album),
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── Playlists ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS playlists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  is_public BOOLEAN DEFAULT 0,
  track_count INT DEFAULT 0,
  total_duration INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_playlist_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Playlist Tracks (junction) ──────────────────────────
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  playlist_id INT NOT NULL,
  track_id INT NOT NULL,
  position INT DEFAULT 0,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_playlist_track (playlist_id, track_id),
  KEY track_id (track_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES cloud_tracks(id) ON DELETE CASCADE
);

-- ─── Favorites ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  track_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_fav (user_id, track_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (track_id) REFERENCES cloud_tracks(id)
);

-- ─── Play History ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS play_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_id INT DEFAULT NULL,
  track_id INT DEFAULT NULL,
  track_title VARCHAR(255) DEFAULT NULL,
  track_artist VARCHAR(255) DEFAULT NULL,
  deck_name CHAR(1) DEFAULT NULL,
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  duration_sec INT DEFAULT 0,
  KEY idx_history_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ─── DJ Settings (audio/notification preferences) ────────
CREATE TABLE IF NOT EXISTS dj_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,
  crossfader_curve VARCHAR(20) DEFAULT 'linear',
  default_eq_preset VARCHAR(30) DEFAULT 'flat',
  auto_gain BOOLEAN DEFAULT 1,
  default_mixer_mode VARCHAR(20) DEFAULT 'standard',
  bpm_sync_enabled BOOLEAN DEFAULT 1,
  auto_mix_transition VARCHAR(20) DEFAULT 'smooth',
  notify_bookings BOOLEAN DEFAULT 1,
  notify_requests BOOLEAN DEFAULT 1,
  notify_chat BOOLEAN DEFAULT 1,
  notify_sound BOOLEAN DEFAULT 1,
  availability_days VARCHAR(100) DEFAULT 'mon,tue,wed,thu,fri,sat,sun',
  availability_start TIME DEFAULT '18:00:00',
  availability_end TIME DEFAULT '02:00:00',
  timezone VARCHAR(50) DEFAULT 'UTC',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Session Ratings ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT DEFAULT NULL,
  dj_id INT NOT NULL,
  rater_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_rating (session_id, rater_id)
);

-- ─── Notifications ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT DEFAULT NULL,
  is_read BOOLEAN DEFAULT 0,
  link VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_user (user_id, is_read),
  KEY idx_notif_time (created_at)
);

-- ─── Landing Page CMS Content ────────────────────────────
CREATE TABLE IF NOT EXISTS landing_content (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_key VARCHAR(80) UNIQUE NOT NULL,
  content_type ENUM('text','json','url') DEFAULT 'text',
  content TEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Role Configuration (RBAC) ──────────────────────────
CREATE TABLE IF NOT EXISTS role_config (
  role_name VARCHAR(30) PRIMARY KEY,
  display_name VARCHAR(60) NOT NULL,
  description TEXT DEFAULT NULL,
  icon VARCHAR(10) DEFAULT '',
  color VARCHAR(20) DEFAULT '#888',
  permissions TEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


-- ═══════════════════════════════════════════════════════════
--  SEED DATA (development only — all passwords = "1234")
-- ═══════════════════════════════════════════════════════════

INSERT IGNORE INTO users(username,password,role,approved) VALUES
('admin','$2a$10$CqBuW5q5QF3ozZM2qA16j.0IDfpkkQkDYMf7Q0OeQ/PoKW/KeTMse','admin',1),
('dj1','$2a$10$CqBuW5q5QF3ozZM2qA16j.0IDfpkkQkDYMf7Q0OeQ/PoKW/KeTMse','dj',1),
('pub1','$2a$10$CqBuW5q5QF3ozZM2qA16j.0IDfpkkQkDYMf7Q0OeQ/PoKW/KeTMse','pub',1);

INSERT IGNORE INTO rooms(name,dj_id,is_live,listeners) VALUES
('house-room',2,0,0),
('techno-room',2,0,0),
('lounge-room',2,0,0);

INSERT IGNORE INTO activation_codes(code,start_time,end_time) VALUES
('DEMO-CODE-2024', NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR));

INSERT IGNORE INTO subscription_plans(id,name,price,max_hours_per_month,max_bookings_per_month,commission_rate,features) VALUES
(1,'Free Trial',0.00,4,2,25.00,'2 bookings/month, 4 hours max, 25% commission'),
(2,'Starter',49.99,20,10,20.00,'10 bookings/month, 20 hours, 20% commission'),
(3,'Pro',149.99,60,30,15.00,'30 bookings/month, 60 hours, 15% commission, priority DJs'),
(4,'Enterprise',399.99,0,0,10.00,'Unlimited bookings & hours, 10% commission, dedicated support');

INSERT IGNORE INTO role_config(role_name,display_name,description,icon,color,permissions) VALUES
('admin','Administrator','Full system access','⚡','#f44336','["*"]'),
('sysadmin','System Admin','Technical management','🔧','#e91e63','["manage_users","view_logs","manage_infra"]'),
('accountant','Accountant','Financial management','📊','#9c27b0','["view_billing","manage_payments","view_reports"]'),
('support','Support','Customer support','🎗️','#2196f3','["view_users","manage_bookings","view_logs"]'),
('sales','Sales','Sales operations','💼','#4caf50','["view_users","view_billing","view_reports"]'),
('marketing','Marketing','Marketing operations','📣','#ff9800','["view_reports","manage_landing"]'),
('dj','DJ','Music performer','🎧','#00bcd4','["mix","broadcast","manage_playlists"]'),
('pub','Listener','Audience member','👤','#607d8b','["listen","book","rate"]');
