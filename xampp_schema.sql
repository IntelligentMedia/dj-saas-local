
CREATE DATABASE IF NOT EXISTS dj_saas;
USE dj_saas;

-- Users: DJs, Pubs, Admins
CREATE TABLE IF NOT EXISTS users(
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('dj','pub','admin') DEFAULT 'pub',
  approved BOOLEAN DEFAULT 0,
  hourly_rate DECIMAL(10,2) DEFAULT 50.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms / broadcast channels
CREATE TABLE IF NOT EXISTS rooms(
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  dj_id INT,
  is_live BOOLEAN DEFAULT 0,
  listeners INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(dj_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Activation codes (timed access windows)
CREATE TABLE IF NOT EXISTS activation_codes(
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions (auto-managed DJ sessions)
CREATE TABLE IF NOT EXISTS sessions(
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT,
  dj_id INT,
  active BOOLEAN DEFAULT 0,
  started_at DATETIME,
  ended_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(dj_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Bookings (pub books a DJ for hours)
CREATE TABLE IF NOT EXISTS bookings(
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
  FOREIGN KEY(dj_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(pub_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed data (password = "1234" hashed with bcrypt)
INSERT IGNORE INTO users(username,password,role,approved) VALUES
('admin','$2a$10$CqBuW5q5QF3ozZM2qA16j.0IDfpkkQkDYMf7Q0OeQ/PoKW/KeTMse','admin',1),
('dj1','$2a$10$CqBuW5q5QF3ozZM2qA16j.0IDfpkkQkDYMf7Q0OeQ/PoKW/KeTMse','dj',1),
('pub1','$2a$10$CqBuW5q5QF3ozZM2qA16j.0IDfpkkQkDYMf7Q0OeQ/PoKW/KeTMse','pub',1);

INSERT IGNORE INTO rooms(name,dj_id,is_live,listeners) VALUES
('house-room',2,1,24),
('techno-room',2,0,0),
('lounge-room',2,0,0);

-- Seed activation codes (24-hour window from now)
INSERT IGNORE INTO activation_codes(code,start_time,end_time) VALUES
('DEMO-CODE-2024', NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR));

-- Seed a booking
INSERT IGNORE INTO bookings(dj_id,pub_id,hours,rate,status,active,scheduled_start,scheduled_end) VALUES
(2,3,2,50.00,'active',1,NOW(),DATE_ADD(NOW(), INTERVAL 2 HOUR));

-- Seed a session for the booking
INSERT IGNORE INTO sessions(booking_id,dj_id,active,started_at) VALUES
(1,2,1,NOW());

-- ═══════════════════════════════════════════════
-- SUBSCRIPTION PLANS (pub monthly plans)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscription_plans(
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  max_hours_per_month INT DEFAULT 0,
  max_bookings_per_month INT DEFAULT 0,
  commission_rate DECIMAL(5,2) DEFAULT 20.00,
  features TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DJ subscriptions (DJs subscribe to plans, pubs are free)
CREATE TABLE IF NOT EXISTS dj_subscriptions(
  id INT AUTO_INCREMENT PRIMARY KEY,
  dj_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('active','cancelled','expired','trial') DEFAULT 'trial',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(dj_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
);

-- Payment transactions (ledger for all money movement)
CREATE TABLE IF NOT EXISTS payments(
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT,
  payer_id INT,
  payee_id INT,
  type ENUM('booking_payment','platform_fee','dj_payout','subscription','refund') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description VARCHAR(255),
  status ENUM('pending','completed','failed','refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  FOREIGN KEY(payer_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(payee_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed subscription plans
INSERT IGNORE INTO subscription_plans(id,name,price,max_hours_per_month,max_bookings_per_month,commission_rate,features) VALUES
(1,'Free Trial',0.00,4,2,25.00,'2 bookings/month, 4 hours max, 25% commission'),
(2,'Starter',49.99,20,10,20.00,'10 bookings/month, 20 hours, 20% commission'),
(3,'Pro',149.99,60,30,15.00,'30 bookings/month, 60 hours, 15% commission, priority DJs'),
(4,'Enterprise',399.99,0,0,10.00,'Unlimited bookings & hours, 10% commission, dedicated support');

-- Give dj1 a Starter subscription
INSERT IGNORE INTO dj_subscriptions(id,dj_id,plan_id,status,started_at,expires_at) VALUES
(1,2,2,'active',NOW(),DATE_ADD(NOW(), INTERVAL 30 DAY));

-- Seed some payment records
INSERT IGNORE INTO payments(id,booking_id,payer_id,payee_id,type,amount,description,status) VALUES
(1,1,3,NULL,'booking_payment',100.00,'Booking #1: dj1 x 2hrs @ $50/hr','completed'),
(2,1,NULL,NULL,'platform_fee',20.00,'Platform fee 20% on booking #1','completed'),
(3,1,NULL,2,'dj_payout',80.00,'DJ payout for booking #1','completed');

-- Seed an active session
INSERT IGNORE INTO sessions(booking_id,dj_id,active,started_at) VALUES
(1,2,1,NOW());
