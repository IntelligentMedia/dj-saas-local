import { create } from "zustand";

/**
 * DJ SaaS Global Store (Zustand)
 *
 * Single source of truth for:
 * - audioEnergy: real-time audio level 0–1
 * - crowdEnergy: polled crowd energy 0–100
 * - currentDJ: { id, username, role }
 * - roomState: { roomId, isLive, listeners, genre }
 * - lightingMode: "stage" | "metaverse" | "globe"
 * - session: active live session data
 * - mixerMode: "classic" | "video" | "auto" | "pro"
 * - crossfader: 0–100
 */
const useDJStore = create((set, get) => ({

  // ── Audio State ──
  audioEnergy: 0,
  setAudioEnergy: (v) => set({ audioEnergy: v }),

  // ── Crowd Energy (from AI endpoint) ──
  crowdEnergy: 0,
  setCrowdEnergy: (v) => set({ crowdEnergy: v }),

  // Combined energy for visual systems
  getCombinedEnergy: () => {
    const { audioEnergy, crowdEnergy } = get();
    return Math.min(1, audioEnergy + (crowdEnergy / 100) * 0.3);
  },

  // ── Current User ──
  currentDJ: null,
  setCurrentDJ: (user) => set({ currentDJ: user }),

  // ── Room State ──
  roomState: { roomId: null, isLive: false, listeners: 0, genre: "" },
  setRoomState: (room) => set({ roomState: { ...get().roomState, ...room } }),

  // ── Lighting / Viz Mode ──
  lightingMode: "stage",
  setLightingMode: (mode) => set({ lightingMode: mode }),

  // ── Active Session ──
  session: null,
  setSession: (s) => set({ session: s }),

  // ── Mixer Mode ──
  mixerMode: "classic",
  setMixerMode: (m) => set({ mixerMode: m }),

  // ── Crossfader ──
  crossfader: 50,
  setCrossfader: (v) => set({ crossfader: v }),

  // ── Connection Status ──
  isConnected: false,
  setConnected: (v) => set({ isConnected: v }),

  // ── Live Chat ──
  chatMessages: [],
  addChatMessage: (msg) => set((s) => ({
    chatMessages: [...s.chatMessages.slice(-100), msg],
  })),
  clearChat: () => set({ chatMessages: [] }),

  // ── Now Playing (broadcast from DJ) ──
  nowPlaying: null,
  setNowPlaying: (data) => set({ nowPlaying: data }),
}));

export default useDJStore;
