"use client";

import { useState } from "react";
import FilterSidebarBottom from "./FilterSidebarBottom";
import FilterSidebarTop from "./FilterSidebarTop";
import styles from "./FilterSidebar.module.css";
import { useRiskPreferences } from "./RiskPreferencesContext";

interface LeftSidebarProps {
  isFloodLayerEnabled: boolean;
  setIsFloodLayerEnabled: (enabled: boolean) => void;
  selectedCountry?: string;
  onCountryChange?: (country: string) => void;
  cardinalDirection?: string;
  onCardinalDirectionChange?: (direction: string) => void;
  selectedIsland?: string;
  onIslandChange?: (island: string) => void;
  selectedReturnPeriod?: string;
  onReturnPeriodChange?: (rp: string) => void;
  selectedSeaLevel?: string;
  onSeaLevelChange?: (sl: string) => void;
  onIslandBoundsChange?: (bounds: [[number, number], [number, number]] | null) => void;
  // Hazard layer opacity
  floodOpacity?: number;
  onFloodOpacityChange?: (opacity: number) => void;
  // Compare layer
  compareEnabled?: boolean;
  onCompareEnabledChange?: (enabled: boolean) => void;
  compareReturnPeriod?: string;
  onCompareReturnPeriodChange?: (rp: string) => void;
  compareSeaLevel?: string;
  onCompareSeaLevelChange?: (sl: string) => void;
  // Locks the country picker to one country (used on country-specific pages)
  lockedCountry?: string;
  /** Bubbled up from FilterSidebarTop for the flood animation progress bar */
  onAvailableSeaLevelsChange?: (levels: string[]) => void;
}

export default function LeftSidebar({
  isFloodLayerEnabled,
  setIsFloodLayerEnabled,
  selectedCountry,
  onCountryChange,
  cardinalDirection,
  onCardinalDirectionChange,
  selectedIsland,
  onIslandChange,
  selectedReturnPeriod,
  onReturnPeriodChange,
  selectedSeaLevel,
  onSeaLevelChange,
  onIslandBoundsChange,
  floodOpacity,
  onFloodOpacityChange,
  compareEnabled,
  onCompareEnabledChange,
  compareReturnPeriod,
  onCompareReturnPeriodChange,
  compareSeaLevel,
  onCompareSeaLevelChange,
  lockedCountry,
  onAvailableSeaLevelsChange,
}: LeftSidebarProps) {
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'buildings' | 'roads' | 'hidden'>('buildings');
  const { preferences, updatePreferences, resetToDefaults } = useRiskPreferences();

  // Local state for editing thresholds
  const [editingPreferences, setEditingPreferences] = useState(preferences);

  // Update local state when modal opens
  const handleOpenPreferences = () => {
    setEditingPreferences(preferences);
    setIsPreferencesOpen(true);
  };

  const handleSavePreferences = () => {
    updatePreferences(editingPreferences);
    setIsPreferencesOpen(false);
  };

  const handleResetDefaults = () => {
    resetToDefaults();
    setEditingPreferences({
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
        roads: ["unclassified"],
      },
    });
  };

  const updateBuildingThreshold = (key: keyof typeof editingPreferences.buildings, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      setEditingPreferences({
        ...editingPreferences,
        buildings: {
          ...editingPreferences.buildings,
          [key]: numValue,
        },
      });
    }
  };

  const updateRoadThreshold = (key: keyof typeof editingPreferences.roads, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      setEditingPreferences({
        ...editingPreferences,
        roads: {
          ...editingPreferences.roads,
          [key]: numValue,
        },
      });
    }
  };

  const updateHiddenCategories = (type: 'buildings' | 'roads', value: string) => {
    // Parse comma-separated list
    const categories = value.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0);
    setEditingPreferences({
      ...editingPreferences,
      hiddenCategories: {
        ...editingPreferences.hiddenCategories,
        [type]: categories,
      },
    });
  };

  return (
    <div data-panel="left" className={`${styles.container} ${styles.leftContainer}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Filters</h3>
      </div>
      <div className={styles.content}>
        <FilterSidebarTop
          isFloodLayerEnabled={isFloodLayerEnabled}
          setIsFloodLayerEnabled={setIsFloodLayerEnabled}
          selectedCountry={selectedCountry}
          onCountryChange={onCountryChange}
          cardinalDirection={cardinalDirection}
          onCardinalDirectionChange={onCardinalDirectionChange}
          selectedIsland={selectedIsland}
          onIslandChange={onIslandChange}
          selectedReturnPeriod={selectedReturnPeriod}
          onReturnPeriodChange={onReturnPeriodChange}
          selectedSeaLevel={selectedSeaLevel}
          onSeaLevelChange={onSeaLevelChange}
          onIslandBoundsChange={onIslandBoundsChange}
          floodOpacity={floodOpacity}
          onFloodOpacityChange={onFloodOpacityChange}
          compareEnabled={compareEnabled}
          onCompareEnabledChange={onCompareEnabledChange}
          compareReturnPeriod={compareReturnPeriod}
          onCompareReturnPeriodChange={onCompareReturnPeriodChange}
          compareSeaLevel={compareSeaLevel}
          onCompareSeaLevelChange={onCompareSeaLevelChange}
          lockedCountry={lockedCountry}
          onAvailableSeaLevelsChange={onAvailableSeaLevelsChange}
        />
        <FilterSidebarBottom
          selectedCountry={selectedCountry}
          selectedIsland={selectedIsland}
          cardinalDirection={cardinalDirection}
        />
      </div>
      <small
        className={styles.preferencesLabel}
        role="button"
        tabIndex={0}
        onClick={handleOpenPreferences}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleOpenPreferences();
          }
        }}
        style={{right:'127px'}}
      >
        User Preferences
      </small>

      {isPreferencesOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.preferencesModalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Preferences</h3>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setIsPreferencesOpen(false)}
                aria-label="Close preferences"
              >
                ✕
              </button>
            </div>
            <div className={styles.tabsContainer}>
              <button
                type="button"
                className={`${styles.tab} ${activeTab === 'buildings' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('buildings')}
              >
                Buildings
              </button>
              <button
                type="button"
                className={`${styles.tab} ${activeTab === 'roads' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('roads')}
              >
                 Roads
              </button>
              <button
                type="button"
                className={`${styles.tab} ${activeTab === 'hidden' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('hidden')}
              >
                 Categories
              </button>
            </div>
            <div className={styles.preferencesModalBody}>
              {activeTab === 'buildings' && (
                <div style={{ marginBottom: "24px" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                    Building Impact Risk Thresholds
                  </h4>
                  <p style={{ margin: "0 0 12px 0", fontSize: "11px", color: "#bbb" }}>
                    Define the loss thresholds (in $) for risk categorization of buildings.
                  </p>
                <div style={{ display: "grid", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0" }}>
                      <span style={{ display: "inline-block", width: "20px", height: "12px", backgroundColor: "#d32f2f", marginRight: "6px", borderRadius: "2px" }}></span>
                      Very High (Greater than $)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={editingPreferences.buildings.veryHigh}
                      onChange={(e) => updateBuildingThreshold("veryHigh", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0" }}>
                      <span style={{ display: "inline-block", width: "20px", height: "12px", backgroundColor: "#f44336", marginRight: "6px", borderRadius: "2px" }}></span>
                      High (Greater than $)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={editingPreferences.buildings.high}
                      onChange={(e) => updateBuildingThreshold("high", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0" }}>
                      <span style={{ display: "inline-block", width: "20px", height: "12px", backgroundColor: "#ff9800", marginRight: "6px", borderRadius: "2px" }}></span>
                      Medium (Greater than $)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={editingPreferences.buildings.medium}
                      onChange={(e) => updateBuildingThreshold("medium", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0" }}>
                      <span style={{ display: "inline-block", width: "20px", height: "12px", backgroundColor: "#ffc107", marginRight: "6px", borderRadius: "2px" }}></span>
                      Low-Med (Greater than $)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={editingPreferences.buildings.low}
                      onChange={(e) => updateBuildingThreshold("low", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                  </div>
                </div>
              </div>
              )}

              {activeTab === 'roads' && (
                <div style={{ marginBottom: "24px" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                    Road Impact Risk Thresholds
                  </h4>
                <p style={{ margin: "0 0 12px 0", fontSize: "11px", color: "#bbb" }}>
                  Define the loss thresholds (in $) for risk categorization of roads.
                </p>
                <div style={{ display: "grid", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0" }}>
                      <span style={{ display: "inline-block", width: "20px", height: "12px", backgroundColor: "#d32f2f", marginRight: "6px", borderRadius: "2px" }}></span>
                      Very High (Greater than $)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={editingPreferences.roads.veryHigh}
                      onChange={(e) => updateRoadThreshold("veryHigh", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0" }}>
                      <span style={{ display: "inline-block", width: "20px", height: "12px", backgroundColor: "#f57c00", marginRight: "6px", borderRadius: "2px" }}></span>
                      High (Greater than $)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={editingPreferences.roads.high}
                      onChange={(e) => updateRoadThreshold("high", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0" }}>
                      <span style={{ display: "inline-block", width: "20px", height: "12px", backgroundColor: "#fbc02d", marginRight: "6px", borderRadius: "2px" }}></span>
                      Medium (Greater than $)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={editingPreferences.roads.medium}
                      onChange={(e) => updateRoadThreshold("medium", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0" }}>
                      <span style={{ display: "inline-block", width: "20px", height: "12px", backgroundColor: "#689f38", marginRight: "6px", borderRadius: "2px" }}></span>
                      Low-Med (Greater than $)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={editingPreferences.roads.low}
                      onChange={(e) => updateRoadThreshold("low", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                  </div>
                </div>
              </div>
              )}

              {activeTab === 'hidden' && (
                <div style={{ marginBottom: "24px" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                    Hidden Categories (Listing Only)
                  </h4>
                <p style={{ margin: "0 0 12px 0", fontSize: "11px", color: "#bbb" }}>
                  Categories to hide from the dropdown list (still visible on map). Enter comma-separated values.
                </p>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0", fontWeight: "600" }}>
                      Building Categories to Hide
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., residential, unknown, others"
                      value={editingPreferences.hiddenCategories.buildings.join(', ')}
                      onChange={(e) => updateHiddenCategories('buildings', e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                    <div style={{ fontSize: "10px", color: "#888", marginTop: "4px" }}>
                      Current: {editingPreferences.hiddenCategories.buildings.length > 0 ? editingPreferences.hiddenCategories.buildings.join(', ') : 'None'}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#e0e0e0", fontWeight: "600" }}>
                      Road Categories to Hide
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., minor road, footpath"
                      value={editingPreferences.hiddenCategories.roads.join(', ')}
                      onChange={(e) => updateHiddenCategories('roads', e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #4a4b4f",
                        backgroundColor: "#1f2023",
                        color: "#e6e6e6",
                      }}
                    />
                    <div style={{ fontSize: "10px", color: "#888", marginTop: "4px" }}>
                      Current: {editingPreferences.hiddenCategories.roads.length > 0 ? editingPreferences.hiddenCategories.roads.join(', ') : 'None'}
                    </div>
                  </div>
                </div>
              </div>
              )}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", paddingTop: "12px", borderTop: "1px solid #4a4b4f" }}>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  style={{
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontWeight: "600",
                    borderRadius: "6px",
                    border: "1px solid #4a4b4f",
                    backgroundColor: "transparent",
                    color: "#e0e0e0",
                    cursor: "pointer",
                  }}
                >
                  Reset to Defaults
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreferencesOpen(false)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontWeight: "600",
                    borderRadius: "6px",
                    border: "1px solid #4a4b4f",
                    backgroundColor: "transparent",
                    color: "#e0e0e0",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePreferences}
                  style={{
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontWeight: "600",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: "#1976d2",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
