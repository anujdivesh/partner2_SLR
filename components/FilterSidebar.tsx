"use client";

import React, { useState } from "react";
import { GiPartyHat } from "react-icons/gi";
import styles from './FilterSidebar.module.css';
import FilterSidebarTop from './FilterSidebarTop';
import FilterSidebarBottom from './FilterSidebarBottom';
import BuildingPanel from './BuildingPanel';
import EventPanel from './EventPanel';
import RoadPanel from './RoadPanel';
import PDFReportButton from './PDFReportButton';

interface FilterSidebarProps {
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
  islandBounds?: [[number, number], [number, number]] | null;
  onIslandBoundsChange?: (bounds: [[number, number], [number, number]] | null) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isBuildingLayerVisible?: boolean;
  onBuildingLayerToggle?: (visible: boolean) => void;
  buildingItems?: { id: string; name: string; useType: string; maxLoss: number }[];
  buildingSeaLevels?: string[];
  buildingReturnPeriods?: string[];
  selectedBuildingSeaLevel?: string;
  onBuildingSeaLevelChange?: (seaLevel: string) => void;
  selectedBuildingReturnPeriod?: string;
  onBuildingReturnPeriodChange?: (returnPeriod: string) => void;
  onBuildingSelect?: (id: string) => void;
  isRoadLayerVisible?: boolean;
  onRoadLayerToggle?: (visible: boolean) => void;
  roadSeaLevel?: number;
  onRoadSeaLevelChange?: (val: number) => void;
  roadReturnPeriod?: number;
  onRoadReturnPeriodChange?: (val: number) => void;
  onRoadSelect?: (id: number) => void;
  roadOpacity?: number;
  onRoadOpacityChange?: (opacity: number) => void;
  showFilters?: boolean;
  showPanels?: boolean;
  title?: string;
}

export default function FilterSidebar({ 
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
  islandBounds,
  onIslandBoundsChange,
  isCollapsed,
  setIsCollapsed,
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
  isRoadLayerVisible,
  onRoadLayerToggle,
  roadSeaLevel,
  onRoadSeaLevelChange,
  roadReturnPeriod,
  onRoadReturnPeriodChange,
  onRoadSelect,
  roadOpacity,
  onRoadOpacityChange,
  showFilters = true,
  showPanels = true,
  title = "Filters"
}: FilterSidebarProps) {
  const [activePanel, setActivePanel] = useState<"buildings" | "events" | "roads" | null>("buildings");

  return (
    <div data-panel="right" className={`${styles.container} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        {!isCollapsed && <h3 className={styles.title}>{title}</h3>}
        <button 
          className={styles.toggleButton} 
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand" : "Collapse"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? '☰' : '«'} 
        </button>
      </div>
      {!isCollapsed && (
        <div className={styles.content}>
          {showFilters && (
            <>
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
              />
              <FilterSidebarBottom
                selectedCountry={selectedCountry}
                selectedIsland={selectedIsland}
                cardinalDirection={cardinalDirection}
              />
            </>
          )}
          {showPanels && selectedCountry && (
            <>
              <div className={styles.panelTabs}>
                  <button
                  type="button"
                  className={`${styles.panelTab} ${activePanel === "events" ? styles.panelTabActive : ""}`}
                  onClick={() => setActivePanel((prev) => (prev === "events" ? null : "events"))}
                  aria-label="Events"
                  title="Events"
                  aria-pressed={activePanel === "events"}
                >
                  <GiPartyHat aria-hidden="true" style={{ color: "#fff", fill: "#fff" }} />
                  <span className={styles.panelTabLabel}>Event Impact</span>
                </button>

                <button
                  type="button"
                  className={`${styles.panelTab} ${activePanel === "buildings" ? styles.panelTabActive : ""}`}
                  onClick={() => setActivePanel((prev) => (prev === "buildings" ? null : "buildings"))}
                  aria-label="Buildings"
                  title="Buildings"
                  aria-pressed={activePanel === "buildings"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="8" width="7" height="13" rx="1" />
                    <rect x="14" y="3" width="7" height="18" rx="1" />
                    <rect x="6" y="11" width="2" height="2" />
                    <rect x="6" y="15" width="2" height="2" />
                    <rect x="17" y="6" width="2" height="2" />
                    <rect x="17" y="10" width="2" height="2" />
                    <rect x="17" y="14" width="2" height="2" />
                  </svg>
                  <span className={styles.panelTabLabel}>Building Impact</span>
                </button>
              
                <button
                  type="button"
                  className={`${styles.panelTab} ${activePanel === "roads" ? styles.panelTabActive : ""}`}
                  onClick={() => {
                    const next = activePanel === "roads" ? null : "roads";
                    setActivePanel(next);
                    onRoadLayerToggle?.(next === "roads");
                  }}
                  aria-label="Roads"
                  title="Roads"
                  aria-pressed={activePanel === "roads"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 3h4l3 18h-4l-1-6h-2l-1 6H4l3-18h3" />
                    <path d="M12 7v2" />
                    <path d="M12 11v2" />
                  </svg>
                  <span className={styles.panelTabLabel}>Road Impact</span>
                </button>
              </div>

              <div
                className={`${styles.panelContent} ${activePanel === "buildings" ? styles.panelContentActive : ""}`}
                aria-hidden={activePanel !== "buildings"}
              >
                <BuildingPanel
                  selectedCountry={selectedCountry}
                  isBuildingLayerVisible={isBuildingLayerVisible}
                  onBuildingLayerToggle={onBuildingLayerToggle}
                  buildingItems={buildingItems}
                  buildingSeaLevels={buildingSeaLevels}
                  buildingReturnPeriods={buildingReturnPeriods}
                  selectedBuildingSeaLevel={selectedBuildingSeaLevel}
                  onBuildingSeaLevelChange={onBuildingSeaLevelChange}
                  selectedBuildingReturnPeriod={selectedBuildingReturnPeriod}
                  onBuildingReturnPeriodChange={onBuildingReturnPeriodChange}
                  onBuildingSelect={onBuildingSelect}
                  selectedIsland={selectedIsland}
                />
              </div>
              <div
                className={`${styles.panelContent} ${activePanel === "events" ? styles.panelContentActive : ""}`}
                aria-hidden={activePanel !== "events"}
              >
                <EventPanel selectedCountry={selectedCountry} selectedIsland={selectedIsland} />
              </div>
              <div
                className={`${styles.panelContent} ${activePanel === "roads" ? styles.panelContentActive : ""}`}
                aria-hidden={activePanel !== "roads"}
              >
                <RoadPanel
                  selectedCountry={selectedCountry}
                  selectedSeaLevel={roadSeaLevel}
                  onSeaLevelChange={onRoadSeaLevelChange}
                  selectedReturnPeriod={roadReturnPeriod}
                  onReturnPeriodChange={onRoadReturnPeriodChange}
                  onRoadSelect={onRoadSelect}
                  selectedIsland={selectedIsland}
                  islandBounds={islandBounds}
                  cardinalDirection={cardinalDirection}
                  roadOpacity={roadOpacity}
                  onRoadOpacityChange={onRoadOpacityChange}
                />
              </div>
            </>
          )}
          {selectedCountry && (
            <div style={{ padding: '4px 4px 8px' }}>
              <PDFReportButton
                selectedCountry={selectedCountry}
                selectedIsland={selectedIsland}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}