"use client";

import dynamic from "next/dynamic";

// ── Map engine switch ──────────────────────────────────────────────────────
// Comment ONE line and uncomment the OTHER to toggle between map engines.
// Leaflet (default):
const MapClient = dynamic(() => import("@/components/MapClient"), {
// MapLibre GL (3D buildings + camera tilt) — uncomment to activate:
// const MapClient = dynamic(() => import("@/components/MapClientLibre"), {
  ssr: false,
  loading: () => (
    <main style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
      <p>Loading map...</p>
    </main>
  ),
});

interface MapWrapperProps {
  country?: string;
}

export default function MapWrapper({ country }: MapWrapperProps) {
  return <MapClient initialCountry={country} />;
}