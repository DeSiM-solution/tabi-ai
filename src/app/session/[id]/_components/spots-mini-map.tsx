'use client';

import { useCallback } from 'react';
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';

import type { SpotsPanelItem } from '../_lib/spots-view-model';

type SpotsMiniMapProps = {
  items: SpotsPanelItem[];
};

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '196px',
} as const;

const FALLBACK_CENTER = {
  lat: 35.6764,
  lng: 139.65,
};

export function SpotsMiniMap({ items }: SpotsMiniMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const hasApiKey = apiKey.trim().length > 0;
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'tabi-spots-mini-map',
    googleMapsApiKey: apiKey,
  });

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    if (items.length === 0) return;

    if (items.length === 1) {
      const item = items[0];
      if (item.latitude === null || item.longitude === null) return;
      map.setCenter({
        lat: item.latitude,
        lng: item.longitude,
      });
      map.setZoom(13);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    for (const item of items) {
      if (item.latitude === null || item.longitude === null) continue;
      bounds.extend({
        lat: item.latitude,
        lng: item.longitude,
      });
    }
    map.fitBounds(bounds, 40);
  }, [items]);

  if (!hasApiKey) {
    return (
      <div className="flex h-[196px] items-center justify-center rounded-[14px] border border-dashed border-border-light bg-bg-secondary px-5 text-center">
        <p className="max-w-xs text-[12px] leading-[1.6] text-text-tertiary">
          Google Maps API key is missing. The list and CSV export still work, but the
          mini map is unavailable.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-[196px] items-center justify-center rounded-[14px] border border-dashed border-border-light bg-bg-secondary px-5 text-center">
        <p className="max-w-xs text-[12px] leading-[1.6] text-text-tertiary">
          No resolved coordinates yet. Once spots have latitude and longitude, they will
          appear on the map.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-[196px] items-center justify-center rounded-[14px] border border-dashed border-border-light bg-bg-secondary px-5 text-center">
        <p className="max-w-xs text-[12px] leading-[1.6] text-text-tertiary">
          We couldn&apos;t load Google Maps right now. The spots list and CSV export are
          still available.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[196px] items-center justify-center rounded-[14px] border border-border-light bg-bg-secondary px-5 text-center">
        <p className="text-[12px] leading-[1.6] text-text-tertiary">
          Loading map...
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-border-light bg-bg-secondary">
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={FALLBACK_CENTER}
        zoom={5}
        onLoad={handleMapLoad}
        options={{
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: true,
          clickableIcons: false,
        }}
      >
        {items.map(item => {
          if (item.latitude === null || item.longitude === null) return null;
          return (
            <MarkerF
              key={item.id}
              position={{
                lat: item.latitude,
                lng: item.longitude,
              }}
              title={item.name}
            />
          );
        })}
      </GoogleMap>
    </div>
  );
}
