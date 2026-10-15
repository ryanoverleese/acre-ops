'use client';

import { useEffect, useState } from 'react';
import type { FieldPivotStatus, ValleyStatusResponse } from '@/lib/valley/types';

// Refresh only the badges, never the page or the user's recommendation drafts.
export function useValleyPivots(enabled: boolean, fieldIds: number[]) {
  const key = [...new Set(fieldIds)].sort((a,b) => a-b).join(',');
  const [snapshot, setSnapshot] = useState<{key:string; fields:Record<number, FieldPivotStatus>}>({key:'',fields:{}});
  const [now, setNow] = useState<number | undefined>();
  useEffect(() => {
    if (!enabled || !key) return;
    const controller = new AbortController();
    const ids = key.split(',').map(Number);
    let running = false;
    setSnapshot({key,fields:{}});
    setNow(Date.now());
    async function refresh() {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        // Small sequential batches keep the upstream call fan-out bounded.
        for (let i=0; i<ids.length && !controller.signal.aborted; i+=8) {
          const batch = ids.slice(i,i+8);
          let fields: Record<number, FieldPivotStatus>;
          try {
            const response = await fetch(`/api/valley/status?${new URLSearchParams({fields:batch.join(',')})}`, {
              cache:'no-store', signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),
            });
            if (!response.ok) throw new Error('Pivot readings unavailable');
            const data: ValleyStatusResponse = await response.json();
            fields = data.enabled ? data.fields : Object.fromEntries(batch.map(id => [id,{state:'unlinked',pivots:[]}]));
          } catch {
            fields = Object.fromEntries(batch.map(id => [id,{state:'unavailable',pivots:[]}]));
          }
          if (!controller.signal.aborted) {
            setSnapshot(previous => ({key,fields:{...(previous.key===key ? previous.fields : {}),...fields}}));
            setNow(Date.now());
          }
        }
      } finally { running = false; }
    }
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 300000);
    const clock = setInterval(() => setNow(Date.now()), 60000);
    const visible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); void refresh(); } };
    document.addEventListener('visibilitychange',visible);
    return () => {
      controller.abort(); clearInterval(interval); clearInterval(clock);
      document.removeEventListener('visibilitychange',visible);
    };
  }, [enabled,key]);
  return { fields:enabled && snapshot.key===key ? snapshot.fields : {}, now };
}
