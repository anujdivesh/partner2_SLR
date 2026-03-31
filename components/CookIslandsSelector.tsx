/**
 * CookIslandsSelector.tsx
 * Separate sidebar component for selecting Cook Islands and toggling building view
 */

"use client";

import React, { useMemo, useState } from "react";
import styles from "./FilterSidebar.module.css";
import { buildingImpactCountries } from "./CookIslandsBuildingViewer";
import { useRiskPreferences, getRiskLabelForLoss } from "./RiskPreferencesContext";

interface BuildingListItem {
  id: string;
  name: string;
  useType: string;
  maxLoss: number;
}

interface CookIslandsSelectorProps {
  selectedCountry?: string;
  isBuildingLayerVisible?: boolean;
  onBuildingLayerToggle?: (visible: boolean) => void;
  buildingItems?: BuildingListItem[];
  buildingSeaLevels?: string[];
  buildingReturnPeriods?: string[];
  selectedBuildingSeaLevel?: string;
  onBuildingSeaLevelChange?: (seaLevel: string) => void;
  selectedBuildingReturnPeriod?: string;
  onBuildingReturnPeriodChange?: (returnPeriod: string) => void;
  onBuildingSelect?: (id: string) => void;
  selectedIsland?: string;
}

const formatReturnPeriodLabel = (rp: string) => {
  const numeric = rp.replace(/[^\d.]/g, "");
  return numeric ? `${numeric} years` : rp;
};

export default function CookIslandsSelector({
  selectedCountry,
  isBuildingLayerVisible,
  onBuildingLayerToggle,
  buildingItems,
  buildingSeaLevels,
  buildingReturnPeriods,
  selectedBuildingSeaLevel,
  onBuildingSeaLevelChange,
  selectedBuildingReturnPeriod,
  onBuildingReturnPeriodChange,
  onBuildingSelect,
  selectedIsland,
}: CookIslandsSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const { preferences } = useRiskPreferences();
  
  const seaLevelListId = "building-sea-level-ticks";

  const handleToggleBuildingLayer = () => {
    onBuildingLayerToggle?.(!isBuildingLayerVisible);
  };


  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    const items = buildingItems ?? [];
    if (!normalizedSearch) return items;
    return items.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(normalizedSearch);
      const typeMatch = item.useType.toLowerCase().includes(normalizedSearch);
      return nameMatch || typeMatch;
    });
  }, [buildingItems, normalizedSearch]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, BuildingListItem[]> = {};
    visibleItems.forEach((item) => {
      const key = item.useType || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [visibleItems]);

  const groupKeys = useMemo(() => {
    const hiddenCategories = preferences.hiddenCategories?.buildings || [];
    const hiddenLowercase = hiddenCategories.map(cat => cat.toLowerCase());
    return Object.keys(groupedItems)
      .filter(key => !hiddenLowercase.includes(key.toLowerCase()))
      .sort();
  }, [groupedItems, preferences.hiddenCategories]);

  // Only show this component when the country has building impact data
  if (!selectedCountry || !buildingImpactCountries.includes(selectedCountry)) {
    return null;
  }

  return (
    <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid #4a4b4f" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <h3 style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#fff", textTransform: "uppercase" }}>
          🏢 Buildings
        </h3>
      </div>

      {/* NATIONAL VIEW */}
      <>
      <p
        style={{
          margin: "0 0 10px 0",
          fontSize: "11px",
          color: "#bbb",
          fontStyle: "italic",
        }}
      >
        View building footprints, structural information, and flood risk assessment.
      </p>

      {isBuildingLayerVisible && (
        <div
          style={{
            border: "1px solid #3a3b3f",
            borderRadius: "8px",
            background: "linear-gradient(160deg, rgba(32,33,36,0.95), rgba(24,25,28,0.95))",
            padding: "10px",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset",
          }}
        >
          {(buildingReturnPeriods?.length || 0) > 0 && (
            <div className={styles.radioSection} style={{ marginTop: 0 }}>
              <label className={styles.radioLabel}>Return Period:</label>
              {(buildingReturnPeriods?.length || 0) <= 1 ? (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#ffffff",
                    marginTop: "4px",
                    fontWeight: 700,
                    letterSpacing: "0.3px",
                  }}
                >
                  {formatReturnPeriodLabel(buildingReturnPeriods?.[0] || "")}
                </div>
              ) : (
                <div className={styles.radioGroup}>
                  {buildingReturnPeriods?.map((rp) => (
                    <label
                      key={rp}
                      className={`${styles.radioItem} ${selectedBuildingReturnPeriod === rp ? styles.radioItemSelected : ""}`}
                    >
                      <input
                        type="radio"
                        name="buildingReturnPeriod"
                        value={rp}
                        checked={selectedBuildingReturnPeriod === rp}
                        onChange={(e) => onBuildingReturnPeriodChange?.(e.target.value)}
                        className={styles.radioInput}
                      />
                      <span className={styles.radioText}>{formatReturnPeriodLabel(rp)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {(buildingSeaLevels?.length || 0) > 0 && (
            <div className={styles.sliderSection} style={{ marginTop: "10px" }}>
              <label className={styles.sliderLabel}>
                Sea Level: <span className={styles.sliderValue}>{selectedBuildingSeaLevel}</span>
              </label>
              <input
                type="range"
                min="0"
                max={(buildingSeaLevels?.length || 1) - 1}
                step="1"
                list={seaLevelListId}
                value={
                  buildingSeaLevels?.indexOf(selectedBuildingSeaLevel || "") !== -1
                    ? buildingSeaLevels?.indexOf(selectedBuildingSeaLevel || "")
                    : 0
                }
                onChange={(e) => {
                  const index = parseInt(e.target.value, 10);
                  const nextValue = buildingSeaLevels?.[index];
                  if (nextValue) onBuildingSeaLevelChange?.(nextValue);
                }}
                className={styles.slider}
              />
              <datalist id={seaLevelListId}>
                {buildingSeaLevels?.map((level, index) => (
                  <option key={level} value={index} label={level} />
                ))}
              </datalist>
              <div className={styles.sliderRange}>
                <span>{buildingSeaLevels?.[0]}</span>
                <span>{buildingSeaLevels?.[buildingSeaLevels.length - 1]}</span>
              </div>
            </div>
          )}

          <div style={{ marginBottom: "10px" }}>
            <input
              type="text"
              placeholder="Search buildings or use type"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: "11px",
                borderRadius: "6px",
                border: "1px solid #4a4b4f",
                backgroundColor: "#1f2023",
                color: "#e6e6e6",
              }}
            />
          </div>

          {groupKeys.length === 0 && (
            <div style={{ fontSize: "11px", color: "#888" }}>No buildings match your filter.</div>
          )}

          <div
            style={{
              maxHeight: "400px",
              overflowY: "auto",
              paddingRight: "4px",
              scrollbarWidth: "thin",
              scrollbarColor: "#4a4b4f #1f2023",
            }}
          >
            {groupKeys.map((groupKey) => {
              const items = groupedItems[groupKey];
              const isExpanded = expandedGroups[groupKey] ?? false;

              return (
                <div key={groupKey} style={{ marginBottom: "10px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [groupKey]: !(prev[groupKey] ?? false),
                      }))
                    }
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "#e0e0e0",
                      background: "linear-gradient(135deg, rgba(70,73,80,0.7), rgba(40,42,46,0.7))",
                      border: "1px solid #4a4b4f",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    <span>{groupKey}</span>
                    <span style={{ fontSize: "10px", color: "#b0b0b0" }}>
                      {items.length} {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div style={{ marginTop: "6px", display: "grid", gap: "6px" }}>
                      {items.map((item) => {
                        const risk = getRiskLabelForLoss(item.maxLoss, preferences.buildings);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onBuildingSelect?.(item.id)}
                            style={{
                              textAlign: "left",
                              padding: "8px",
                              borderRadius: "6px",
                              border: "1px solid #333",
                              backgroundColor: "#1a1b1e",
                              color: "#f2f2f2",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <div style={{ fontSize: "11px", fontWeight: 600, lineHeight: "1.3" }}>{item.name}</div>
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: "999px",
                                fontSize: "9px",
                                fontWeight: 700,
                                color: "#fff",
                                backgroundColor: risk.color,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {risk.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>
    </div>
  );
}
