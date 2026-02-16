import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:4000",
      "/admin": "http://localhost:4000",
      "/rooms": "http://localhost:4000",
      "/livekit": "http://localhost:4000",
      "/activation": "http://localhost:4000",
      "/bookings": "http://localhost:4000",
      "/billing": "http://localhost:4000",
      "/ai": "http://localhost:4000",
      "/infra": "http://localhost:4000",
      "/payments": "http://localhost:4000",
      "/music": "http://localhost:4000",
      "/health": "http://localhost:4000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-three": ["three"],
          "vendor-livekit": ["livekit-client"],
          "vendor-mediapipe": ["@mediapipe/hands", "@mediapipe/camera_utils"],
          "vendor-react": ["react", "react-dom"],
          "vendor-zustand": ["zustand"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
