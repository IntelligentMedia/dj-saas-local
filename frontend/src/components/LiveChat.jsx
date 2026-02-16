import React, { useState, useRef, useEffect } from "react";
import useDJStore from "../store/djStore";
import { emitChat } from "../utils/socket";

export default function LiveChat({ collapsed: initialCollapsed = true }) {
  const messages = useDJStore((s) => s.chatMessages);
  const currentDJ = useDJStore((s) => s.currentDJ);
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const prevCountRef = useRef(messages.length);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!collapsed && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    // Track unread when collapsed
    if (collapsed && messages.length > prevCountRef.current) {
      setUnread(prev => prev + (messages.length - prevCountRef.current));
    }
    prevCountRef.current = messages.length;
  }, [messages, collapsed]);

  // Clear unread when opening
  useEffect(() => {
    if (!collapsed) setUnread(0);
  }, [collapsed]);

  const send = () => {
    const msg = text.trim();
    if (!msg) return;
    emitChat(msg);
    setText("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const roleIcon = (role) => {
    if (role === "dj") return "🎧";
    if (role === "admin") return "⚡";
    return "👤";
  };

  return (
    <div className={`live-chat ${collapsed ? "collapsed" : "expanded"}`}>
      <button className="chat-toggle" onClick={() => setCollapsed(!collapsed)}>
        💬 Chat
        {unread > 0 && <span className="chat-unread">{unread}</span>}
      </button>

      {!collapsed && (
        <div className="chat-body">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">No messages yet — say hi!</div>
            )}
            {messages.map((m) => {
              const isMe = m.from === currentDJ?.username;
              return (
                <div key={m.id} className={`chat-msg ${isMe ? "mine" : ""} ${m.role === "dj" ? "dj-msg" : ""}`}>
                  <span className="chat-meta">
                    {roleIcon(m.role)} <strong>{m.from}</strong>
                    <span className="chat-time">{formatTime(m.timestamp)}</span>
                  </span>
                  <span className="chat-text">{m.message}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div className="chat-input-row">
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
              maxLength={500}
            />
            <button className="chat-send" onClick={send} disabled={!text.trim()}>
              ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
