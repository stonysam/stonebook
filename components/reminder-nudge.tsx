'use client';

import { useEffect, useState } from 'react';
import Link from './link';

/** A one-line nudge on Today until this phone has reminders on (or the person dismisses it). */
export function ReminderNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem('stonebook.nudge.reminders') === 'no'; } catch { /* private mode */ }
    if (dismissed || !('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission === 'denied') return;
    navigator.serviceWorker.getRegistration('/sw.js')
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setShow(!sub || Notification.permission !== 'granted'))
      .catch(() => {});
  }, []);
  if (!show) return null;
  return (
    <div className="card row dashed" style={{ minHeight: 56, gap: 8 }}>
      <Link href="/settings" className="card-link" style={{ flex: '1 1 auto', position: 'static' }}>
        <span>Get a 7:00 summary and lift reminders on this phone</span>
        <strong style={{ color: 'var(--link)', fontSize: 14 }}>Turn on reminders</strong>
      </Link>
      <button type="button" className="btn btn-text" style={{ color: 'var(--text-2)', fontWeight: 400 }} aria-label="Not now"
        onClick={() => { try { localStorage.setItem('stonebook.nudge.reminders', 'no'); } catch { /* private mode */ } setShow(false); }}>
        Not now
      </button>
    </div>
  );
}
