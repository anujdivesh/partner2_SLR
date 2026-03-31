"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export interface RiskThresholds {
  veryHigh: number;
  high: number;
  medium: number;
  low: number;
}

export interface RiskPreferences {
  buildings: RiskThresholds;
  roads: RiskThresholds;
  hiddenCategories: {
    buildings: string[];
    roads: string[];
  };
}

const DEFAULT_PREFERENCES: RiskPreferences = {
  buildings: {
    veryHigh: 500000,
    high: 200000,
    medium: 50000,
    low: 10000,
  },
  roads: {
    veryHigh: 1000000,
    high: 400000,
    medium: 200000,
    low: 20000,
  },
  hiddenCategories: {
    buildings: ["residential", "out building", "unknown", "other"],
    roads: [],
  },
};

interface RiskPreferencesContextValue {
  preferences: RiskPreferences;
  updatePreferences: (newPreferences: RiskPreferences) => void;
  resetToDefaults: () => void;
}

const RiskPreferencesContext = createContext<RiskPreferencesContextValue | undefined>(undefined);

export function RiskPreferencesProvider({ children }: { children: ReactNode }) {
  // Initialize state from session storage
  const [preferences, setPreferences] = useState<RiskPreferences>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem("riskPreferences");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Migrate old preferences by merging with defaults
          return {
            ...DEFAULT_PREFERENCES,
            ...parsed,
            hiddenCategories: parsed.hiddenCategories || DEFAULT_PREFERENCES.hiddenCategories,
          };
        } catch (error) {
          console.error("Failed to parse stored preferences:", error);
        }
      }
    }
    return DEFAULT_PREFERENCES;
  });

  // Save preferences to session storage whenever they change
  const updatePreferences = (newPreferences: RiskPreferences) => {
    setPreferences(newPreferences);
    sessionStorage.setItem("riskPreferences", JSON.stringify(newPreferences));
  };

  const resetToDefaults = () => {
    setPreferences(DEFAULT_PREFERENCES);
    sessionStorage.setItem("riskPreferences", JSON.stringify(DEFAULT_PREFERENCES));
  };

  return (
    <RiskPreferencesContext.Provider value={{ preferences, updatePreferences, resetToDefaults }}>
      {children}
    </RiskPreferencesContext.Provider>
  );
}

export function useRiskPreferences() {
  const context = useContext(RiskPreferencesContext);
  if (context === undefined) {
    throw new Error("useRiskPreferences must be used within a RiskPreferencesProvider");
  }
  return context;
}

// Helper function to get risk label and color based on loss value and thresholds
export function getRiskLabelForLoss(
  loss: number,
  thresholds: RiskThresholds
): { label: string; color: string } {
  if (loss > thresholds.veryHigh) return { label: "Very High", color: "#d32f2f" };
  if (loss > thresholds.high) return { label: "High", color: "#f44336" };
  if (loss > thresholds.medium) return { label: "Medium", color: "#ff9800" };
  if (loss > thresholds.low) return { label: "Low-Med", color: "#ffc107" };
  return { label: "Low", color: "#4CAF50" };
}

// Helper function for ratio-based risk color (used in BuildingHeightCalculator)
export function getRiskColorFromThresholds(
  slrLoss: number,
  maxLoss: number,
  thresholds: RiskThresholds
): string {
  if (slrLoss > thresholds.veryHigh) return "#d32f2f"; // Red - Very High risk
  if (slrLoss > thresholds.high) return "#f57c00"; // Orange - High
  if (slrLoss > thresholds.medium) return "#fbc02d"; // Yellow - Medium
  if (slrLoss > thresholds.low) return "#689f38"; // Light green - Low-medium
  return "#1976d2"; // Blue - Low risk
}
