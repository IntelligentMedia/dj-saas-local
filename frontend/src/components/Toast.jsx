import React from "react";
import useToastStore from "../store/toastStore";

const ICONS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item toast-${t.type}`} onClick={() => removeToast(t.id)}>
          <span className="toast-icon">{ICONS[t.type] || "ℹ️"}</span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
