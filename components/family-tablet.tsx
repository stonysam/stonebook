'use client';

import { useState, useTransition } from 'react';
import { setPin, startKidMode } from '@/app/actions';
import { useToast } from './toast';

function PinRow({ memberId, label, isSet }: { memberId: string; label: string; isSet: boolean }) {
  const [open, setOpen] = useState(false);
  const [pin, setPinValue] = useState('');
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <span style={{ flex: '1 1 auto' }}>{label}</span>
        <span className={isSet ? 'badge badge-done' : 'badge badge-wait'}>{isSet ? 'Set' : 'Not set'}</span>
        <button type="button" className="btn btn-text" onClick={() => setOpen(!open)}>{open ? 'Cancel' : isSet ? 'Change' : 'Set'}</button>
      </div>
      {open && (
        <form className="row" style={{ gap: 8 }} onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await setPin(memberId, pin);
            toast.show(r.ok ? (r.message ?? 'Saved.') : r.error);
            if (r.ok) { setOpen(false); setPinValue(''); }
          });
        }}>
          <input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} required
            value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} placeholder="4 digits" aria-label={`New ${label}`} style={{ flex: '1 1 auto' }} />
          <button className="btn btn-primary" disabled={busy || pin.length !== 4}>Save</button>
        </form>
      )}
      {toast.node}
    </div>
  );
}

/** Parents only: PINs, and switching this device into a child's mode. */
export function FamilyTablet({ meId, mePinSet, kids }: { meId: string; mePinSet: boolean; kids: { id: string; name: string; pinSet: boolean }[] }) {
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <div className="card stack" style={{ gap: 14 }}>
      <strong>Family tablet</strong>
      <span className="muted" style={{ fontSize: 14 }}>
        Lock a tablet to {kids.map((k) => k.name).join(' or ') || 'a child'}&apos;s chores. They tick things off with their own PIN; your PIN (or
        the other parent&apos;s) gets the tablet back. The tablet stays signed in as you underneath, so treat it as a child lock, not a safe.
      </span>
      <PinRow memberId={meId} label="Your PIN (to unlock the tablet)" isSet={mePinSet} />
      {kids.map((k) => <PinRow key={k.id} memberId={k.id} label={`${k.name}’s PIN`} isSet={k.pinSet} />)}
      {kids.map((k) => (
        <button key={k.id} type="button" className="btn btn-primary" disabled={busy || !mePinSet || !k.pinSet}
          onClick={() => start(async () => { const r = await startKidMode(k.id); if (r && !r.ok) toast.show(r.error); })}>
          Start {k.name} mode on this device
        </button>
      ))}
      {kids.some((k) => !k.pinSet) || !mePinSet ? <span className="small">Set both PINs first.</span> : null}
      {toast.node}
    </div>
  );
}
