'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const STORAGE_PREFIX = 'tabi-utm-tracking';

function normalizeParam(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function UtmTracker() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!queryString) return;

    const params = new URLSearchParams(queryString);
    const utmSource = normalizeParam(
      params.get('utm_source') ?? params.get('utmSource'),
    );
    const utmCampaign = normalizeParam(
      params.get('utm_campaign') ?? params.get('utmCampaign'),
    );
    const sessionId = normalizeParam(
      params.get('session_id') ?? params.get('sessionId'),
    );

    if (!utmSource || !utmCampaign || !sessionId) return;

    const storageKey = `${STORAGE_PREFIX}:${sessionId}:${utmSource}:${utmCampaign}`;
    if (window.sessionStorage.getItem(storageKey)) {
      return;
    }

    window.sessionStorage.setItem(storageKey, 'pending');

    void fetch('/api/utm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        session_id: sessionId,
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`UTM tracking failed (${response.status})`);
        }
        window.sessionStorage.setItem(storageKey, 'done');
      })
      .catch(error => {
        console.warn('[utm-tracker] save-failed', error);
        window.sessionStorage.removeItem(storageKey);
      });
  }, [queryString]);

  return null;
}
