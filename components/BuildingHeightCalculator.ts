/**
 * BuildingHeightCalculator.ts
 * Calculates 3D heights for buildings based on structural attributes
 */

export interface RiskThresholds {
  veryHigh: number;
  high: number;
  medium: number;
  low: number;
}

export interface BuildingProperties {
  use?: string;
  levels?: number;
  minfloor_height?: string;
  roof_pitch?: string;
  roof_shape?: string;
  roof_material?: string;
  subuse?: string;
}

/**
 * Calculate the height in meters for a building
 * Height is derived from:
 * 1. Number of levels
 * 2. Use type (influences ceiling height per floor)
 * 3. Roof pitch (adds extra height)
 */
export function calculateBuildingHeight(properties: BuildingProperties): number {
  // Base parameters
  const levels = properties.levels || 1;

  // Height per floor varies by use type
  let heightPerFloor = 3.5; // Default for residential/commercial

  if (properties.use === "Public" || properties.use === "Institutional") {
    heightPerFloor = 4.0; // Higher ceilings for public buildings
  } else if (properties.use === "Commercial") {
    heightPerFloor = 3.8; // Standard commercial
  } else if (properties.use === "Educational") {
    heightPerFloor = 4.0; // Schools/universities
  } else if (properties.use === "Other") {
    heightPerFloor = 3.2; // Storage, industrial
  }

  // Base height from levels
  let height = levels * heightPerFloor;

  // Add roof pitch contribution
  const roofPitch = properties.roof_pitch?.toLowerCase() || "";
  const roofShape = properties.roof_shape?.toLowerCase() || "";

  if (roofPitch.includes("high") || roofPitch.includes("steep")) {
    height += 1.2; // Steep roof adds ~1.2m
  } else if (roofPitch.includes("moderate")) {
    height += 0.6; // Moderate roof adds ~0.6m
  } else if (roofPitch.includes("low") || roofPitch.includes("flat")) {
    height += 0.2; // Flat/low pitch adds minimal height
  }

  // Hip roofs add extra peak height
  if (roofShape.includes("hip")) {
    height += 0.3;
  }

  // Minimum foundation offset (accounts for minfloor_height)
  const minFloor = properties.minfloor_height || "<1.0m";
  let foundationOffset = 0.1; // Default ~0.1m

  if (minFloor.includes(">1.0m") || minFloor.includes("1.0-2.0m")) {
    foundationOffset = 1.5;
  }

  return Math.max(height + foundationOffset, 2); // Minimum 2m height
}

/**
 * Get visual color based on risk level
 * Can use either thresholds (absolute values) or ratio-based coloring
 */
export function getRiskColor(
  slrLoss: number,
  maxLoss: number = 1000000,
  thresholds?: RiskThresholds
): string {
  // If thresholds are provided, use absolute value comparison
  if (thresholds) {
    if (slrLoss > thresholds.veryHigh) return "#d32f2f"; // Red - Very High risk
    if (slrLoss > thresholds.high) return "#f57c00"; // Orange - High
    if (slrLoss > thresholds.medium) return "#fbc02d"; // Yellow - Medium
    if (slrLoss > thresholds.low) return "#689f38"; // Light green - Low-medium
    return "#1976d2"; // Blue - Low risk
  }

  // Otherwise, use ratio-based coloring (legacy behavior)
  const ratio = slrLoss / maxLoss;
  if (ratio > 0.5) return "#d32f2f"; // Red - High risk
  if (ratio > 0.2) return "#f57c00"; // Orange - Medium-high
  if (ratio > 0.1) return "#fbc02d"; // Yellow - Medium
  if (ratio > 0.01) return "#689f38"; // Light green - Low-medium
  return "#1976d2"; // Blue - Low risk
}

/**
 * Format currency values for display
 */
export function formatCurrency(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
