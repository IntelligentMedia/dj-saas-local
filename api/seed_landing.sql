USE dj_saas;

CREATE TABLE IF NOT EXISTS landing_content(
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_key VARCHAR(80) NOT NULL UNIQUE,
  content_type ENUM('text','json','url') DEFAULT 'text',
  content TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO landing_content(section_key,content_type,content) VALUES
('logo_text','text','🎧 DJ SaaS'),
('logo_url','url',''),
('hero_title','text','Professional DJ Platform'),
('hero_accent','text','Stream. Mix. Get Booked.'),
('hero_subtitle','text','The all-in-one SaaS platform for DJs to mix live, broadcast to listeners, manage bookings, and grow their audience — right from the browser.'),
('hero_image_url','url',''),
('hero_video_url','url',''),
('hero_stats','json','[{"val":"2-Deck","label":"Mixer"},{"val":"Live","label":"Broadcasting"},{"val":"3D","label":"Visualizer"},{"val":"Cloud","label":"Music Library"}]'),
('features_title','text','Everything You Need to DJ Online'),
('features_subtitle','text','Professional tools built for the modern DJ workflow'),
('features','json','[{"icon":"🎛️","title":"Pro Mixer","desc":"2-deck mixer with EQ, crossfader curves, hot cues, loops, pitch control, VU meters, and kill switches."},{"icon":"📡","title":"Live Broadcasting","desc":"Stream your sets live to listeners with real-time chat, song requests, and listener count."},{"icon":"🌐","title":"3D Visualizer","desc":"Stunning Three.js-powered visuals that react to your music in real time."},{"icon":"📅","title":"Booking System","desc":"Pubs browse and book DJs directly. Manage availability, confirmations, and scheduling."},{"icon":"☁️","title":"Cloud Library","desc":"88+ tracks with genre filtering, BPM detection, favorites, and instant deck loading."},{"icon":"🤚","title":"Hand Tracking","desc":"MediaPipe-powered gesture control — wave your hands to scratch and mix."},{"icon":"💰","title":"Billing & Payments","desc":"DJ subscription plans, escrow payments, commission tracking, and automated payouts."},{"icon":"📊","title":"DJ Dashboard","desc":"Session history, earnings, play stats, setlist exports, and ratings — all in one place."},{"icon":"🎚️","title":"FX Processor","desc":"Reverb, delay, filter, and distortion with real-time parameter control."},{"icon":"🔊","title":"Auto-Mix","desc":"Intelligent auto-queue with smooth, cut, echo, and backspin transitions."},{"icon":"👤","title":"DJ Profiles","desc":"Public profile with bio, genres, social links, ratings, and session history."},{"icon":"⚙️","title":"Full Settings","desc":"Audio defaults, notification preferences, availability scheduling, and account security."}]'),
('pricing_title','text','Simple, Transparent Pricing'),
('pricing_subtitle','text','Plans for DJs — Pubs use the platform completely free'),
('how_title','text','How It Works'),
('how_dj_steps','json','[{"num":"1","title":"Sign up & set your profile","desc":"Add your bio, genres, hourly rate, and availability."},{"num":"2","title":"Go live in the mixer","desc":"Load tracks from the cloud library, mix with pro controls, and broadcast."},{"num":"3","title":"Get booked & earn","desc":"Pubs discover and book you. Track earnings, ratings, and session history."}]'),
('how_pub_steps','json','[{"num":"1","title":"Browse & discover DJs","desc":"Find DJs by genre, rate, and ratings — no subscription needed."},{"num":"2","title":"Book & pay securely","desc":"Schedule DJs for your venue. Pay through platform escrow — we handle the rest."},{"num":"3","title":"Listen & interact","desc":"Stream the live set, request songs, chat, and rate your DJ."}]'),
('cta_title','text','Ready to Start Mixing?'),
('cta_subtitle','text','Join the platform and take your DJ career online.'),
('contact_email','text',''),
('contact_phone','text',''),
('contact_address','text',''),
('social_links','json','{"twitter":"","instagram":"","facebook":"","youtube":""}'),
('footer_text','text','© 2026 DJ SaaS Platform. All rights reserved.'),
('promo_video_url','url',''),
('gallery_images','json','[]');
