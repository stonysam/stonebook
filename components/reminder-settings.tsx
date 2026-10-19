'use client';

import { useEffect, useState, useTransition } from 'react';
import { removePushSubscription, resetCalendarLink, savePushSubscription, sendTestPush } from '@/app/actions';
import { useToast } from './toast';

type State = 'checking' | 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on';

const keyBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const b64url = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Computer';
  const browser = /EdgA?\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os}, ${browser}`;
}

/** Turn reminders on for this phone, off again, and send a test. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>('checking');
  const [busy, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(ios && !installed ? 'ios-install' : 'unsupported');
        return;
      }
      if (!publicKey) { setState('unsupported'); return; }
      if (Notification.permission === 'denied') { setState('blocked'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [publicKey]);

  const turnOn = () => start(async () => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); return; }
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
    const r = await savePushSubscription({ endpoint: sub.endpoint, p256dh: b64url(sub.getKey('p256dh')), auth: b64url(sub.getKey('auth')), device: deviceName() });
    if (!r.ok) { toast.show(r.error); return; }
    setState('on');
    const t = await sendTestPush();
    toast.show(t.ok ? 'Reminders are on. A test is on its way.' : t.error);
  });

  const turnOff = () => start(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
    setState('off');
    toast.show('Reminders are off on this phone.');
  });

  const test = () => start(async () => { const r = await sendTestPush(); toast.show(r.ok ? (r.message ?? 'Sent.') : r.error); });

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="row">
        <strong style={{ flex: '1 1 auto' }}>Reminders on this phone</strong>
        <span className={state === 'on' ? 'badge badge-done' : 'badge badge-wait'}>{state === 'on' ? 'On' : state === 'checking' ? '…' : 'Off'}</span>
      </div>
      <span className="muted" style={{ fontSize: 14 }}>
        A summary around 7:00 of what&apos;s due for you, and a heads-up 45 minutes before a lift you&apos;re giving.
      </span>
      {state === 'off' && <button type="button" className="btn btn-primary" disabled={busy} onClick={turnOn}>{busy ? 'Turning on…' : 'Turn on reminders'}</button>}
      {state === 'on' && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" style={{ flex: '1 1 0' }} disabled={busy} onClick={test}>Send me a test</button>
          <button type="button" className="btn" style={{ flex: '1 1 0' }} disabled={busy} onClick={turnOff}>Turn off</button>
        </div>
      )}
      {state === 'ios-install' && (
        <span style={{ fontSize: 14 }}>On iPhone, reminders need Stonebook on your Home Screen first: tap Share, then &quot;Add to Home Screen&quot;, open it from there and come back here.</span>
      )}
      {state === 'blocked' && (
        <span style={{ fontSize: 14 }}>Notifications are blocked for Stonebook. Allow them in your browser&apos;s site settings (the icon left of the address), then reload.</span>
      )}
      {state === 'unsupported' && !publicKey && <span style={{ fontSize: 14 }}>Reminders are still being set up. Try again in a few minutes.</span>}
      {state === 'unsupported' && publicKey && <span style={{ fontSize: 14 }}>This browser can&apos;t show reminders. On Android use Chrome; on iPhone add Stonebook to your Home Screen.</span>}
      {toast.node}
    </div>
  );
}

/** The private calendar link: show, copy, open in a calendar app, replace. */
export function CalendarLink({ url }: { url: string | null }) {
  const [busy, start] = useTransition();
  const [asked, setAsked] = useState(false);
  const toast = useToast();
  const webcal = url?.replace(/^https?:/, 'webcal:');

  const reset = () => start(async () => {
    const r = await resetCalendarLink();
    setAsked(false);
    toast.show(r.ok ? (r.message ?? '') : r.error);
  });

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <strong>Your calendar link</strong>
      <span className="muted" style={{ fontSize: 14 }}>
        Puts your due dates, chores, activities and lifts in Google Calendar or your phone&apos;s calendar. It updates about every hour.
        Keep the link to yourself: anyone with it can see what&apos;s in it.
      </span>
      {!url && <button type="button" className="btn btn-primary" disabled={busy} onClick={reset}>Make my calendar link</button>}
      {url && (
        <>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" style={{ fontSize: 13 }} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" style={{ flex: '1 1 0' }}
              onClick={async () => { await navigator.clipboard.writeText(url); toast.show('Copied.'); }}>Copy link</button>
            <a className="btn" style={{ flex: '1 1 0' }} href={webcal}>Open in calendar app</a>
          </div>
          <details>
            <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>How to add it to Google Calendar</summary>
            <ol style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 14 }} className="stack">
              <li>Copy the link above.</li>
              <li>On a computer, open calendar.google.com. Next to &quot;Other calendars&quot; click +, then &quot;From URL&quot;.</li>
              <li>Paste the link and click &quot;Add calendar&quot;. It shows on your phone too.</li>
            </ol>
          </details>
          <button type="button" className="btn btn-text" style={{ alignSelf: 'flex-start', minHeight: 36 }} disabled={busy}
            onClick={() => (asked ? reset() : setAsked(true))}>
            {asked ? 'Tap again: the old link stops working' : 'Make a new link'}
          </button>
        </>
      )}
      {toast.node}
    </div>
  );
}
