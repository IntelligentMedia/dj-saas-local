/**
 * Toast Store — lightweight global notification state
 *
 * Usage from anywhere:
 *   import { toast } from "../store/toastStore";
 *   toast.success("Track loaded!");
 *   toast.error("Connection failed");
 *   toast.info("Recording started");
 */
import { create } from "zustand";

let _nextId = 1;

const useToastStore = create((set) => ({
  toasts: [],

  addToast: (message, type = "info", duration = 3500) => {
    const id = _nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, timestamp: Date.now() }] }));
    // Auto-remove after duration
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience helpers
export const toast = {
  success: (msg, dur) => useToastStore.getState().addToast(msg, "success", dur),
  error: (msg, dur) => useToastStore.getState().addToast(msg, "error", dur || 5000),
  info: (msg, dur) => useToastStore.getState().addToast(msg, "info", dur),
  warn: (msg, dur) => useToastStore.getState().addToast(msg, "warning", dur || 4000),
};

export default useToastStore;
