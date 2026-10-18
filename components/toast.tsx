'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast(ms = 3500) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(m);
    timer.current = setTimeout(() => setMessage(null), ms);
  }, [ms]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const node = message ? <div className="toast" role="status">{message}</div> : null;
  return { show, node };
}
