/**
 * BuildingPopupChart.tsx
 * Mini sparkline chart showing SLR loss trajectory inside building popup
 */

"use client";

import { useRiskPreferences } from "./RiskPreferencesContext";

interface SLRDataPoint {
  label: string;
  slr: number; // cm
  loss: number; // USD
}

interface BuildingPopupChartProps {
  buildingName: string;
  useType: string;
  value: number;
  slrData: SLRDataPoint[];
  maxLoss?: number;
}

/**
 * Create a simple inline SVG sparkline chart for the popup
 */
export function BuildingSparkline({ slrData, maxLoss }: { slrData: SLRDataPoint[]; maxLoss?: number }) {
  const { preferences } = useRiskPreferences();
  
  if (!slrData || slrData.length === 0) {
    return <div style={{ fontSize: "11px", color: "#999" }}>No data</div>;
  }

  // Normalize data for SVG
  const max = maxLoss || Math.max(...slrData.map((d) => d.loss), 1);
  const width = 200;
  const height = 40;
  const padding = 5;

  const points = slrData.map((d, i) => {
    const x = (i / (slrData.length - 1)) * (width - 2 * padding) + padding;
    const y = height - (d.loss / max) * (height - 2 * padding) - padding;
    return { x, y, ...d };
  });

  // Create path data
  const pathData = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Determine color based on max loss using user preferences
  let color = "#4CAF50"; // Green - Low
  if (max > preferences.buildings.veryHigh) color = "#f44336"; // Red - Very High
  else if (max > preferences.buildings.high) color = "#ff9800"; // Orange - High
  else if (max > preferences.buildings.medium) color = "#ffc107"; // Yellow - Medium

  return (
    <svg width={width} height={height} style={{ marginTop: "8px", display: "block" }}>
      {/* Background grid */}
      <defs>
        <pattern id="grid" width="50" height="8" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 8" fill="none" stroke="#eee" strokeWidth="0.5" opacity="0.3" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#grid)" />

      {/* Line chart */}
      <path d={pathData} stroke={color} strokeWidth="2" fill="none" />

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill={color} opacity="0.7" />
      ))}

      {/* Axis labels (SLR progression) */}
      <text x={padding + 2} y={height - 2} fontSize="9" fill="#666" textAnchor="start">
        0cm
      </text>
      <text x={width - padding - 2} y={height - 2} fontSize="9" fill="#666" textAnchor="end">
        150cm
      </text>
    </svg>
  );
}

/**
 * Vulnerability scorecard showing key indicators
 */
export function VulnerabilityScorecard({
  properties,
}: {
  properties: {
    Condition: string;
    Structure: string;
    Wall_Material: string;
    Size: number;
    levels: number;
    window_protection?: string;
  };
}) {
  const conditionColor = {
    Excellent: "#4CAF50",
    Good: "#66BB6A",
    Fair: "#FFC107",
    Poor: "#FF9800",
    "Very Poor": "#F44336",
  };

  const riskFromCondition = {
    Excellent: "Low",
    Good: "Low-Medium",
    Fair: "Medium",
    Poor: "High",
    "Very Poor": "Very High",
  };

  const condition = properties.Condition || "Unknown";
  const conditionColor_ = conditionColor[condition as keyof typeof conditionColor] || "#999";
  const risk = riskFromCondition[condition as keyof typeof riskFromCondition] || "Unknown";

  return (
    <div style={{ marginTop: "12px", fontSize: "11px", lineHeight: "1.6" }}>
      <div style={{ marginBottom: "6px" }}>
        <strong>Building Profile:</strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
        <div>
          <span style={{ color: "#999" }}>Condition:</span>
          <br />
          <span style={{ color: conditionColor_, fontWeight: "bold" }}>{condition}</span>
        </div>
        <div>
          <span style={{ color: "#999" }}>Risk Level:</span>
          <br />
          <span style={{ color: conditionColor_ }}>{risk}</span>
        </div>

        <div>
          <span style={{ color: "#999" }}>Structure:</span>
          <br />
          <span style={{ fontSize: "10px" }}>{properties.Structure || "N/A"}</span>
        </div>
        <div>
          <span style={{ color: "#999" }}>Walls:</span>
          <br />
          <span style={{ fontSize: "10px" }}>{properties.Wall_Material || "N/A"}</span>
        </div>

        <div>
          <span style={{ color: "#999" }}>Size:</span>
          <br />
          <span style={{ fontSize: "10px" }}>{(properties.Size || 0).toFixed(0)} m²</span>
        </div>
        <div>
          <span style={{ color: "#999" }}>Levels:</span>
          <br />
          <span style={{ fontSize: "10px" }}>{properties.levels || 1}</span>
        </div>
      </div>

      {properties.window_protection && (
        <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid #555" }}>
          <span style={{ color: "#999", fontSize: "10px" }}>Window Protection:</span>
          <br />
          <span style={{ fontSize: "10px" }}>{properties.window_protection}</span>
        </div>
      )}
    </div>
  );
}
