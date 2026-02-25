'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface ApiNotification {
  id: number;
  changed_field?: string;
  new_value?: string;
  page_type?: { id: number; value: string } | string;
  field?: { id: number; value: string }[];
  created_on?: string;
  read?: boolean;
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {
      // Silently fail — bell just shows stale data
    }
  }, []);

  // Poll on mount and every 60 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const unreadCount = notifications.length;

  const handleMarkAllRead = async () => {
    if (notifications.length === 0 || marking) return;
    setMarking(true);
    try {
      const ids = notifications.map((n) => n.id);
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setNotifications([]);
      }
    } catch {
      // Silently fail
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="notification-bell-wrap" ref={ref}>
      <button
        className="notification-bell-btn"
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Notifications</span>
            {notifications.length > 0 && (
              <button
                className="notification-mark-read-btn"
                onClick={handleMarkAllRead}
                disabled={marking}
              >
                {marking ? 'Marking...' : 'Mark all read'}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="notification-empty">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="32" height="32" style={{ opacity: 0.3 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span>No notifications</span>
            </div>
          ) : (
            <div className="notification-list">
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href="/fields"
                  className="notification-item unread"
                  onClick={() => setOpen(false)}
                >
                  <div className="notification-item-msg">
                    {n.changed_field}
                    {n.new_value ? ` → ${n.new_value}` : ''}
                  </div>
                  <div className="notification-item-time">{formatTime(n.created_on)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
