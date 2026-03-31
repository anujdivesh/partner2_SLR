"use client";

import { useRiskPreferences } from "./RiskPreferencesContext";

// Approximate x-Sst / rainbow colour scale used by the WMS
// Matches ncWMS / THREDDS default-scalar style
const FLOOD_STOPS = [
  "#5e00fa", // 0 m
  "#0011ff",
  "#00b3ff",
  "#00ffaa",
  "#aeff00",
  "#ffee00",
  "#ff7700",
  "#ff0000", // 2.337 m
];

interface MapLegendProps {
  isFloodLayerEnabled: boolean;
  isRoadLayerVisible: boolean;
}

export default function MapLegend({ isFloodLayerEnabled, isRoadLayerVisible }: MapLegendProps) {
  const { preferences } = useRiskPreferences();
  
  // Generate road entries dynamically based on user preferences
  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val}`;
  };

  const ROAD_ENTRIES = [
    { color: "#d32f2f", label: `Very High  (>${formatCurrency(preferences.roads.veryHigh)})` },
    { color: "#f57c00", label: `High  (${formatCurrency(preferences.roads.high)} – ${formatCurrency(preferences.roads.veryHigh)})` },
    { color: "#fbc02d", label: `Medium  (${formatCurrency(preferences.roads.medium)} – ${formatCurrency(preferences.roads.high)})` },
    { color: "#689f38", label: `Low-Med  (${formatCurrency(preferences.roads.low)} – ${formatCurrency(preferences.roads.medium)})` },
    { color: "#1976d2", label: `Low  (<${formatCurrency(preferences.roads.low)})` },
    { color: "#555",    label: "No impact",    opacity: 0.35 },
  ];
  
  if (!isFloodLayerEnabled && !isRoadLayerVisible) return null;

  const panelStyle: React.CSSProperties = {
    backgroundColor: "rgba(0,0,0,0.72)",
    backdropFilter: "blur(4px)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "8px",
    color: "white",
    padding: "10px 12px",
    fontSize: "11px",
    minWidth: "150px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  };

  const headingStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    opacity: 0.7,
    marginBottom: "8px",
    fontWeight: 600,
  };

  return (
    /* Position mid-left, vertically centred on the map */
    <div
      data-pdf-ignore="true"
      style={{
        position: "absolute",
        top: "82%",
        left: "10px",
        transform: "translateY(-50%)",
        zIndex: 1000,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {/* ── Flood Depth Legend ── */}
      {isFloodLayerEnabled && (
        <div style={panelStyle}>
          <div style={headingStyle}>Flood Depth</div>
          <div style={{ display: "flex", alignItems: "stretch", gap: "8px" }}>
            {/* Gradient bar */}
            <div
              style={{
                width: "16px",
                borderRadius: "3px",
                flexShrink: 0,
                background: `linear-gradient(to top, ${FLOOD_STOPS.join(", ")})`,
              }}
            />
            {/* Labels */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                fontSize: "10px",
                opacity: 0.9,
                lineHeight: 1,
              }}
            >
              <span>2.3&#8202;m</span>
              <span>1.75&#8202;m</span>
              <span>1.2&#8202;m</span>
              <span>0.6&#8202;m</span>
              <span>0&#8202;m</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Road Impact Legend ── */}
      {isRoadLayerVisible && (
        <div style={panelStyle}>
          <div style={headingStyle}>Road Impact</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {ROAD_ENTRIES.map(({ color, label, opacity }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <div
                  style={{
                    width: "24px",
                    height: "4px",
                    borderRadius: "2px",
                    background: color,
                    opacity: opacity ?? 1,
                    flexShrink: 0,
                  }}
                />
                <span style={{ opacity: 0.9 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
