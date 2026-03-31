"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import styles from "./FilterSidebar.module.css";
import { formatCurrency } from "./BuildingHeightCalculator";
import { roadImpactConfig, roadImpactCountries } from "./RoadNetworkViewer";
import { useRiskPreferences } from "./RiskPreferencesContext";

ChartJS.register(ArcElement, Tooltip, Legend);

function formatRoadCurrency(val: number) {
  return "$" + Math.round(val).toLocaleString() ;
}

const buildRoadKeyVariants = (seaLevel: number, returnPeriod: number, suffix: "Loss" | "Depth") => {
    return [
        `SLR_${seaLevel}cm_ARI${returnPeriod}_${suffix}`,
        `SLR_${seaLevel}cm_ARI${returnPeriod}.${suffix}`
    ];
};

const getRoadMetric = (props: Record<string, any>, seaLevel: number, returnPeriod: number, suffix: "Loss" | "Depth") => {
    const keys = buildRoadKeyVariants(seaLevel, returnPeriod, suffix);
    for (const key of keys) {
        const value = Number(props?.[key]);
        if (Number.isFinite(value)) return value;
    }
    return 0;
};

interface RoadPanelProps {
  selectedCountry?: string;
  selectedSeaLevel?: number;
  onSeaLevelChange?: (val: number) => void;
  selectedReturnPeriod?: number;
  onReturnPeriodChange?: (val: number) => void;
  onRoadSelect?: (id: number) => void;
  selectedIsland?: string;
  islandBounds?: [[number, number], [number, number]] | null;
  cardinalDirection?: string;
  roadOpacity?: number;
  onRoadOpacityChange?: (opacity: number) => void;
}

const cookIslandsBounds: { [key: string]: [[number, number], [number, number]] } = {
    'northern_cook_islands': [[-14.0, -166.0], [-8.0, -157.0]],
    'southern_cook_islands': [[-23.0, -160.0], [-18.0, -155.0]],
};

export default function RoadPanel({
  selectedCountry,
  selectedSeaLevel = 0,
  onSeaLevelChange,
  selectedReturnPeriod = 100,
  onReturnPeriodChange,
  onRoadSelect,
  selectedIsland,
  islandBounds,
  cardinalDirection,
  roadOpacity = 0.8,
  onRoadOpacityChange,
}: RoadPanelProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { preferences } = useRiskPreferences();

  // Available options
  const seaLevels = [0, 50, 100, 150];
  const seaLevelListId = "road-sea-level-ticks";

  const handleSeaLevelSlider = (index: number) => {
      onSeaLevelChange?.(seaLevels[index] || 0);
  };

  const currentSeaLevelIndex = seaLevels.indexOf(selectedSeaLevel);

  useEffect(() => {
        if (!selectedCountry || !roadImpactCountries.includes(selectedCountry)) {
            setData(null);
            return;
        }

        const dataPath = roadImpactConfig[selectedCountry]?.dataPath;
        if (!dataPath) {
            setData(null);
            return;
        }

        setLoading(true);
        fetch(dataPath)
      .then((res) => {
         if (!res.ok) throw new Error("Failed to load road data");
         return res.json();
      })
      .then((json) => {
         setData(json);
         setLoading(false);
      })
      .catch((err) => {
         setError(err.message);
         setLoading(false);
      });
  }, [selectedCountry]);

  // Pre-process features with original index
  const allFeaturesWithIndex = useMemo(() => {
     if (!data) return [];
     return data.features.map((f: any, i: number) => ({ ...f, _originalIndex: i }));
  }, [data]);

  // Filter features
  const filteredFeatures = useMemo(() => {
      let features = allFeaturesWithIndex;
      let filterBounds: [[number, number], [number, number]] | undefined;

      if (selectedIsland && islandBounds) {
          filterBounds = islandBounds;
      } else if (cardinalDirection && cookIslandsBounds[cardinalDirection]) {
          filterBounds = cookIslandsBounds[cardinalDirection];
      }

      if (filterBounds) {
          const [[south, west], [north, east]] = filterBounds;
          features = features.filter((f: any) => {
              if (!f.geometry || f.geometry.type !== 'LineString') return false;
              // Check if any point of the road is within bounds
              return f.geometry.coordinates.some((coord: number[]) => {
                  const [lng, lat] = coord;
                  return lat >= south && lat <= north && lng >= west && lng <= east;
              });
          });
      }
      return features;
  }, [allFeaturesWithIndex, selectedIsland, islandBounds, cardinalDirection]);

  // Grouping
  const groupedData = useMemo(() => {
      const groups: Record<string, any[]> = {};
      
      filteredFeatures.forEach((feature: any) => {
          const type = feature.properties?.UseType || "Other";
          const loss = getRoadMetric(feature.properties || {}, selectedSeaLevel, selectedReturnPeriod, "Loss");
          if (loss > 0) {
              if (!groups[type]) groups[type] = [];
              groups[type].push({ ...feature, _loss: loss });
          }
      });
      return groups;
  }, [filteredFeatures, selectedSeaLevel, selectedReturnPeriod]);

  // Filter out hidden categories (case-insensitive)
  const visibleGroupKeys = useMemo(() => {
    const hiddenCategories = preferences.hiddenCategories?.roads || [];
    const hiddenLowercase = hiddenCategories.map(cat => cat.toLowerCase());
    return Object.keys(groupedData)
      .filter(key => !hiddenLowercase.includes(key.toLowerCase()))
      .sort();
  }, [groupedData, preferences.hiddenCategories]);

  const toggleGroup = (group: string) => {
      const next = new Set(expandedGroups);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      setExpandedGroups(next);
  };

  const handleRowClick = (originalIndex: number) => {
      onRoadSelect?.(originalIndex);
  };
  
  // STATS Calculation
  const stats = useMemo(() => {
    if (!data) return null;
    let totalLoss = 0;
    
    filteredFeatures.forEach((f: any) => {
         const loss = getRoadMetric(f.properties || {}, selectedSeaLevel, selectedReturnPeriod, "Loss");
       totalLoss += loss;
    });

    return { totalLoss };
  }, [data, filteredFeatures, selectedSeaLevel, selectedReturnPeriod]);


    if (!selectedCountry) return <div className={styles.panelPlaceholder}>Select a country first.</div>;
    if (!roadImpactCountries.includes(selectedCountry)) return <div className={styles.panelPlaceholder}>No road impact data available.</div>;
  if (loading) return <div className={styles.panelPlaceholder}>Loading road impact...</div>;
  if (error) return <div className={styles.panelPlaceholder}>{error}</div>;
  if (!data || !stats) return <div className={styles.panelPlaceholder}>No data available.</div>;

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelCardTitle}>Road Impact Analysis</div>
      
      <div className={styles.panelFilters} style={{ gridTemplateColumns: "1fr" }}>
         <div className={styles.panelFilterItem}>
           <div>Sea Level Rise: <span style={{color: '#64b5f6'}}>{selectedSeaLevel}cm</span></div>
           <input 
             type="range" 
             min="0" 
             max="3" 
             step="1"
             list={seaLevelListId}
             value={currentSeaLevelIndex === -1 ? 0 : currentSeaLevelIndex}
             onChange={(e) => handleSeaLevelSlider(Number(e.target.value))}
             className={styles.slider}
           />
           <datalist id={seaLevelListId}>
             {seaLevels.map((level, index) => (
                <option key={level} value={index} label={`${level}cm`} />
             ))}
           </datalist>
           <div className={styles.sliderRange}>
              <span>0cm</span><span>150cm</span>
           </div>
         </div>
         <div className={styles.panelFilterItem}>
           Return Period: <span style={{color: '#e0e0e0',fontWeight: 600}}>100 years</span>
         </div>
      </div>

      <div className={styles.sliderSection}>
        <label className={styles.sliderLabel}>
          Road Opacity: <span className={styles.sliderValue}>{Math.round(roadOpacity * 100)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(roadOpacity * 100)}
          onChange={(e) => onRoadOpacityChange?.(parseInt(e.target.value, 10) / 100)}
          className={styles.slider}
        />
        <div className={styles.sliderRange}>
          <span>0%</span><span>100%</span>
        </div>
      </div>

     <div className={styles.panelChartCard} style={{cursor: 'default', marginTop: '12px', marginBottom: '16px'}}>
         <div className={styles.panelCardMeta}>Total Road Loss</div>
         <div style={{fontSize: '16px', color: '#fff', fontWeight: 600, margin: '8px 0'}}>
            {formatRoadCurrency(stats.totalLoss)}
         </div>
      </div>

      <div
        style={{
          maxHeight: "400px",
          overflowY: "auto",
          paddingRight: "4px",
          scrollbarWidth: "thin",
          scrollbarColor: "#4a4b4f #1f2023",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
           {visibleGroupKeys.map((group) => {
               const items = groupedData[group];
               const groupTotal = items.reduce((sum, item) => sum + item._loss, 0);
               const isExpanded = expandedGroups.has(group);
               
               return (
                   <div key={group}>
                       <button 
                          type="button"
                          onClick={() => toggleGroup(group)}
                          style={{ 
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 12px",
                              fontSize: "12px",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              color: "#e0e0e0",
                              background: "linear-gradient(135deg, rgba(70,73,80,0.7), rgba(40,42,46,0.7))",
                              border: "1px solid #4a4b4f",
                              borderRadius: "6px",
                              cursor: "pointer",
                          }}
                       >
                           <span style={{ fontWeight: 600 }}>{group}</span>
                           <span style={{ fontSize: "11px", color: "#b0b0b0" }}>
                              {items.length} {isExpanded ? "▾" : "▸"}
                           </span>
                       </button>
                       
                       {isExpanded && (
                           <div style={{ marginTop: "6px", display: "grid", gap: "6px" }}>
                               {items.map((item) => (
                                   <button 
                                       key={item._originalIndex}
                                       type="button"
                                       onClick={() => handleRowClick(item._originalIndex)}
                                       style={{ 
                                           textAlign: "left",
                                           padding: "10px 12px",
                                           borderRadius: "6px",
                                           border: "1px solid #333",
                                           backgroundColor: "#1a1b1e",
                                           color: "#f2f2f2",
                                           cursor: "pointer",
                                           display: "flex",
                                           justifyContent: "space-between",
                                           alignItems: "center",
                                           fontSize: '11px'
                                       }}
                                   >
                                       <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                           <span style={{ fontWeight: 600 }}>{item.properties?.Asset || "Unknown Road"}</span>
                                           <span style={{ fontSize: '10px', color: '#999' }}>{item.properties?.Details || ""}</span>
                                       </div>
                                       <div style={{ fontWeight: 600, color: '#ffecb3' }}>{formatRoadCurrency(item._loss)}</div>
                                   </button>
                               ))}
                           </div>
                       )}
                   </div>
               );
           })}
        </div>
      </div>

    </div>
  );
}
