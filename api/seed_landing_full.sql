USE dj_saas;

-- Full dummy data for landing_content with real placeholder images & video
UPDATE landing_content SET content = 'DJ SaaS' WHERE section_key = 'logo_text';
UPDATE landing_content SET content = 'https://picsum.photos/seed/djlogo/120/120' WHERE section_key = 'logo_url';

UPDATE landing_content SET content = 'Professional DJ Platform' WHERE section_key = 'hero_title';
UPDATE landing_content SET content = 'Stream. Mix. Get Booked.' WHERE section_key = 'hero_accent';
UPDATE landing_content SET content = 'The all-in-one SaaS platform for DJs to mix live, broadcast to listeners, manage bookings, and grow their audience — right from the browser.' WHERE section_key = 'hero_subtitle';
UPDATE landing_content SET content = 'https://picsum.photos/seed/djhero/1920/900' WHERE section_key = 'hero_image_url';
UPDATE landing_content SET content = 'https://www.youtube.com/embed/dQw4w9WgXcQ' WHERE section_key = 'hero_video_url';
UPDATE landing_content SET content = '[{"value":"2-Deck","label":"Mixer"},{"value":"Live","label":"Broadcasting"},{"value":"3D","label":"Visualizer"},{"value":"Cloud","label":"Music Library"}]' WHERE section_key = 'hero_stats';

UPDATE landing_content SET content = 'Everything You Need to DJ Online' WHERE section_key = 'features_title';
UPDATE landing_content SET content = 'Professional tools built for the modern DJ workflow' WHERE section_key = 'features_subtitle';
UPDATE landing_content SET content = '[{"icon":"🎛️","title":"Pro Mixer","desc":"2-deck mixer with EQ, crossfader curves, hot cues, loops, pitch control, VU meters, and kill switches."},{"icon":"📡","title":"Live Broadcasting","desc":"Stream your sets live to listeners with real-time chat, song requests, and listener count."},{"icon":"🌐","title":"3D Visualizer","desc":"Stunning Three.js-powered visuals that react to your music in real time."},{"icon":"📅","title":"Booking System","desc":"Pubs browse and book DJs directly. Manage availability, confirmations, and scheduling."},{"icon":"☁️","title":"Cloud Library","desc":"88+ tracks with genre filtering, BPM detection, favorites, and instant deck loading."},{"icon":"🤚","title":"Hand Tracking","desc":"MediaPipe-powered gesture control — wave your hands to scratch and mix."},{"icon":"💰","title":"Billing & Payments","desc":"DJ subscription plans, escrow payments, commission tracking, and automated payouts."},{"icon":"📊","title":"DJ Dashboard","desc":"Session history, earnings, play stats, setlist exports, and ratings — all in one place."},{"icon":"🎚️","title":"FX Processor","desc":"Reverb, delay, filter, and distortion with real-time parameter control."},{"icon":"🔊","title":"Auto-Mix","desc":"Intelligent auto-queue with smooth, cut, echo, and backspin transitions."},{"icon":"👤","title":"DJ Profiles","desc":"Public profile with bio, genres, social links, ratings, and session history."},{"icon":"⚙️","title":"Full Settings","desc":"Audio defaults, notification preferences, availability scheduling, and account security."}]' WHERE section_key = 'features';

UPDATE landing_content SET content = 'Simple, Transparent Pricing' WHERE section_key = 'pricing_title';
UPDATE landing_content SET content = 'Plans for DJs — Pubs use the platform completely free' WHERE section_key = 'pricing_subtitle';

UPDATE landing_content SET content = 'How It Works' WHERE section_key = 'how_title';
UPDATE landing_content SET content = '[{"title":"Sign up & set your profile","desc":"Add your bio, genres, hourly rate, and availability."},{"title":"Go live in the mixer","desc":"Load tracks from the cloud library, mix with pro controls, and broadcast."},{"title":"Get booked & earn","desc":"Pubs discover and book you. Track earnings, ratings, and session history."}]' WHERE section_key = 'how_dj_steps';
UPDATE landing_content SET content = '[{"title":"Browse & discover DJs","desc":"Find DJs by genre, rate, and ratings — no subscription needed."},{"title":"Book & pay securely","desc":"Schedule DJs for your venue. Pay through platform escrow — we handle the rest."},{"title":"Listen & interact","desc":"Stream the live set, request songs, chat, and rate your DJ."}]' WHERE section_key = 'how_pub_steps';

UPDATE landing_content SET content = 'Ready to Start Mixing?' WHERE section_key = 'cta_title';
UPDATE landing_content SET content = 'Join thousands of DJs already streaming, mixing, and earning on our platform.' WHERE section_key = 'cta_subtitle';

UPDATE landing_content SET content = 'hello@djsaas.io' WHERE section_key = 'contact_email';
UPDATE landing_content SET content = '+1 (555) 432-1089' WHERE section_key = 'contact_phone';
UPDATE landing_content SET content = '42 Groove Lane, Music City, CA 90210' WHERE section_key = 'contact_address';
UPDATE landing_content SET content = '{"twitter":"https://twitter.com/djsaas","instagram":"https://instagram.com/djsaas","facebook":"https://facebook.com/djsaas","youtube":"https://youtube.com/@djsaas"}' WHERE section_key = 'social_links';

UPDATE landing_content SET content = '© 2026 DJ SaaS Platform. All rights reserved. Built with ❤️ for DJs worldwide.' WHERE section_key = 'footer_text';

UPDATE landing_content SET content = 'https://www.youtube.com/embed/EngW7tLk6R8' WHERE section_key = 'promo_video_url';

UPDATE landing_content SET content = '["https://picsum.photos/seed/djgal1/600/400","https://picsum.photos/seed/djgal2/600/400","https://picsum.photos/seed/djgal3/600/400","https://picsum.photos/seed/djgal4/600/400","https://picsum.photos/seed/djgal5/600/400","https://picsum.photos/seed/djgal6/600/400"]' WHERE section_key = 'gallery_images';
