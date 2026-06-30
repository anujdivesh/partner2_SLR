/**
 * CookIslandsBuildingViewer.tsx
 * Building impact viewer for supported countries.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import L, { GeoJSON as GeoJSONLayer } from "leaflet";
import { useMap } from "react-leaflet";
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from "chart.js";

// GeoJSON fetch cache — avoids re-downloading the same file on re-mount / filter change
const _buildingGeoJsonCache = new Map<string, FeatureCollection<Geometry, BuildingProperties>>();

// Register Chart.js components
Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
import { getRiskColor, formatCurrency } from "./BuildingHeightCalculator";
import { useRiskPreferences, getRiskLabelForLoss } from "./RiskPreferencesContext";

interface BuildingListItem {
  id: string;
  name: string;
  useType: string;
  maxLoss: number;
}

interface BuildingFilterOptions {
  seaLevels: string[];
  returnPeriods: string[];
}

interface BuildingSelectRequest {
  id: string;
  nonce: number;
}

interface BuildingProperties {
  [key: string]: unknown;
  UseType?: string;
  Value?: number;
  Size?: number;
  Condition?: string;
  Structure?: string;
  Wall_Material?: string;
  SLR_0cm_ARI100_Loss?: number;
  SLR_50cm_ARI100_Loss?: number;
  SLR_100cm_ARI100_Loss?: number;
  SLR_150cm_ARI100_Loss?: number;
  Details?: string;
  __featureId?: string;
  __featureName?: string;
}

type BuildingGeoJsonFeature = Feature<Geometry, BuildingProperties>;

type BuildingGeoJson = FeatureCollection<Geometry, BuildingProperties>;

interface CookIslandsBuildingViewerProps {
  selectedCountry: string;
  selectedIsland: string;
  cardinalDirection: string;
  islandBounds?: [[number, number], [number, number]] | null;
  onBuildingDataLoaded?: (items: BuildingListItem[]) => void;
  onBuildingOptionsLoaded?: (options: BuildingFilterOptions) => void;
  selectedBuildingSeaLevel?: string;
  selectedBuildingReturnPeriod?: string;
  buildingSelectRequest?: BuildingSelectRequest | null;
}

const normalizeReturnPeriod = (rp?: string) => {
  if (!rp) return "";
  return rp.startsWith("ARI") ? rp : `ARI${rp}`;
};

const buildLossKeys = (seaLevel?: string, returnPeriod?: string) => {
  if (!seaLevel || !returnPeriod) return [] as string[];
  const rp = normalizeReturnPeriod(returnPeriod);
  return [`SLR_${seaLevel}_${rp}_Loss`, `SLR_${seaLevel}_${rp}.Loss`];
};

const lossKeyRegex = /^SLR_(.+)_ARI(\d+)[._]Loss$/;

const getLossEntries = (properties: BuildingProperties) => {
  return Object.entries(properties)
    .map(([key, value]) => {
      const match = key.match(lossKeyRegex);
      if (!match) return null;
      const seaLevel = match[1];
      const returnPeriod = `ARI${match[2]}`;
      const loss = Number(value);
      if (!Number.isFinite(loss)) return null;
      return { seaLevel, returnPeriod, loss };
    })
    .filter(Boolean) as { seaLevel: string; returnPeriod: string; loss: number }[];
};

const extractBuildingOptions = (features: BuildingGeoJsonFeature[]): BuildingFilterOptions => {
  const seaLevels = new Set<string>();
  const returnPeriods = new Set<string>();

  features.forEach((feature) => {
    const props = feature.properties ?? {};
    Object.keys(props).forEach((key) => {
      const match = key.match(lossKeyRegex);
      if (!match) return;
      seaLevels.add(match[1]);
      returnPeriods.add(`ARI${match[2]}`);
    });
  });

  const sortedSeaLevels = Array.from(seaLevels).sort((a, b) => parseFloat(a) - parseFloat(b));
  const sortedReturnPeriods = Array.from(returnPeriods).sort((a, b) => {
    const numA = parseFloat(a.replace(/[^\d.]/g, ""));
    const numB = parseFloat(b.replace(/[^\d.]/g, ""));
    return numA - numB;
  });

  return { seaLevels: sortedSeaLevels, returnPeriods: sortedReturnPeriods };
};

const getSelectedLoss = (
  properties: BuildingProperties,
  seaLevel?: string,
  returnPeriod?: string,
  fallback: number = 0
) => {
  const lossKeys = buildLossKeys(seaLevel, returnPeriod);
  if (!lossKeys.length) return fallback;
  for (const key of lossKeys) {
    const raw = properties[key as keyof BuildingProperties];
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
};

const getMaxLoss = (properties: BuildingProperties) => {
  const losses = getLossEntries(properties).map((entry) => entry.loss);
  return losses.length ? Math.max(...losses) : 0;
};

const getSeaLevelSeries = (properties: BuildingProperties, returnPeriod?: string) => {
  const entries = getLossEntries(properties);
  if (entries.length === 0) return [] as { label: string; slr: number; loss: number }[];

  const normalizedRp = normalizeReturnPeriod(returnPeriod);
  let filtered = entries.filter((entry) => entry.returnPeriod === normalizedRp);

  if (filtered.length === 0) {
    const fallbackRp = entries[0].returnPeriod;
    filtered = entries.filter((entry) => entry.returnPeriod === fallbackRp);
  }

  return filtered
    .map((entry) => ({
      label: `${entry.seaLevel}`,
      slr: Number(entry.seaLevel),
      loss: entry.loss
    }))
    .sort((a, b) => a.slr - b.slr);
};

const isLngWithinBounds = (lng: number, west: number, east: number) => {
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
};

const isCoordWithinBounds = (lat: number, lng: number, bounds: [[number, number], [number, number]]) => {
  const [[south, west], [north, east]] = bounds;
  return lat >= south && lat <= north && isLngWithinBounds(lng, west, east);
};

const featureWithinBounds = (feature: BuildingGeoJsonFeature, bounds: [[number, number], [number, number]]) => {
  if (!feature.geometry) return false;
  const geom = feature.geometry;
  if (geom.type === "Polygon") {
    return geom.coordinates.some((ring) =>
      ring.some(([lng, lat]) => isCoordWithinBounds(lat, lng, bounds))
    );
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((polygon) =>
      polygon.some((ring) => ring.some(([lng, lat]) => isCoordWithinBounds(lat, lng, bounds)))
    );
  }
  return false;
};

type CountryBuildingConfig = {
  dataPath: string;
  boundsByRegion?: { [key: string]: { minLat: number; maxLat: number; minLng: number; maxLng: number } };
};

const buildingImpactConfig: Record<string, CountryBuildingConfig> = {
  CK: {
    dataPath: "/dataset/COK/latest results-buildings-impact.geojson",
    boundsByRegion: {
      northern_cook_islands: { minLat: -14.0, maxLat: -8.0, minLng: -166.0, maxLng: -157.0 },
      southern_cook_islands: { minLat: -23.0, maxLat: -18.0, minLng: -160.0, maxLng: -155.0 },
    }
  },
  TV: {
    dataPath: "/dataset/TUV/latest (no duplicate regions)-buildings-impact.geojson"
  },
  VU: {
    dataPath: "/dataset/VUT/Latest full results-buildings-impact.geojson"
  },
  WS: {
    dataPath: "/dataset/WSM/SLR example-buildings-impact.geojson"
  },
  TO: {
    dataPath: "/dataset/TON/Example dashboard results-buildings-impact.geojson"
  }
  ,
  MH: {
    dataPath: "/dataset/MHL/dashboard results-buildings-impact.geojson"
  }
};

export const buildingImpactCountries = Object.keys(buildingImpactConfig);

export default function CookIslandsBuildingViewer({
  selectedCountry,
  selectedIsland,
  cardinalDirection,
  islandBounds,
  onBuildingDataLoaded,
  onBuildingOptionsLoaded,
  selectedBuildingSeaLevel,
  selectedBuildingReturnPeriod,
  buildingSelectRequest,
}: CookIslandsBuildingViewerProps) {
  const map = useMap();
  const { preferences } = useRiskPreferences();
  const geoJsonRef = useRef<GeoJSONLayer | null>(null);
  const layerByIdRef = useRef<Map<string, L.Layer>>(new Map());
  const [buildingData, setBuildingData] = useState<BuildingGeoJson | null>(null);

  // Load building GeoJSON data for supported countries
  useEffect(() => {
    const countryConfig = buildingImpactConfig[selectedCountry];
    if (!countryConfig) {
      // Remove building layer if not Cook Islands
      if (geoJsonRef.current) {
        map.removeLayer(geoJsonRef.current);
        geoJsonRef.current = null;
      }
      setBuildingData(null);
      onBuildingDataLoaded?.([]);
      return;
    }

    const loadBuildingData = async () => {
      try {
        let data: BuildingGeoJson;
        // Use cache to avoid re-fetching the same GeoJSON
        if (_buildingGeoJsonCache.has(countryConfig.dataPath)) {
          data = _buildingGeoJsonCache.get(countryConfig.dataPath)!;
        } else {
          const response = await fetch(countryConfig.dataPath);
          if (!response.ok) throw new Error("Failed to load building data");
          data = (await response.json()) as BuildingGeoJson;
          _buildingGeoJsonCache.set(countryConfig.dataPath, data);
        }

        // Filter features based on island bounds or cardinal direction
        let filteredFeatures = data.features ?? [];
        if (selectedIsland && islandBounds) {
          filteredFeatures = filteredFeatures.filter((feature) => featureWithinBounds(feature, islandBounds));
        } else if (cardinalDirection && countryConfig.boundsByRegion?.[cardinalDirection]) {
          const bound = countryConfig.boundsByRegion[cardinalDirection];
          const regionBounds: [[number, number], [number, number]] = [
            [bound.minLat, bound.minLng],
            [bound.maxLat, bound.maxLng],
          ];
          filteredFeatures = filteredFeatures.filter((feature) => featureWithinBounds(feature, regionBounds));
        }

        const features = filteredFeatures.map((feature: BuildingGeoJsonFeature, index: number) => {
          const rawName = typeof feature.properties?.Details === "string" ? feature.properties.Details.split(";")[0] : "";
          const trimmedName = rawName ? rawName.trim() : "";
          const fallbackName = `Building ${index + 1}`;
          const name = trimmedName && trimmedName.toLowerCase() !== "nan" ? trimmedName : fallbackName;
          const featureId = String(feature.properties?.id ?? `b-${index + 1}`);

          feature.properties = {
            ...feature.properties,
            __featureId: featureId,
            __featureName: name,
          };
          return feature;
        });

        const options = extractBuildingOptions(features);
        onBuildingOptionsLoaded?.(options);
        setBuildingData({ ...data, features });
      } catch (error) {
        console.error("Error loading building data:", error);
      }
    };

    loadBuildingData();
  }, [selectedCountry, selectedIsland, cardinalDirection, islandBounds, map, onBuildingOptionsLoaded]);

  useEffect(() => {
    if (!buildingData) return;

    const items = buildingData.features.map((feature: BuildingGeoJsonFeature, index: number) => {
      const properties = feature.properties ?? {};
      const name = properties.__featureName || `Building ${index + 1}`;
      const useType = properties.UseType || "Other";
      const maxLoss = getMaxLoss(properties);
      const selectedLoss = getSelectedLoss(
        properties,
        selectedBuildingSeaLevel,
        selectedBuildingReturnPeriod,
        maxLoss
      );
      const id = String(properties.__featureId || `b-${index + 1}`);
      return { id, name, useType, maxLoss: selectedLoss };
    });

    onBuildingDataLoaded?.(items);
  }, [buildingData, onBuildingDataLoaded, selectedBuildingSeaLevel, selectedBuildingReturnPeriod]);

  // Render GeoJSON layer with click handlers for popups
  useEffect(() => {
    if (!buildingData || !buildingImpactConfig[selectedCountry]) return;

    // Remove existing layer
    if (geoJsonRef.current) {
      map.removeLayer(geoJsonRef.current);
    }

    // Create feature group for buildings
    const geoJsonLayer = L.geoJSON(buildingData, {
      style: (feature?: BuildingGeoJsonFeature) => {
        if (!feature) return {};

        const maxLoss = getMaxLoss(feature.properties);
        const selectedLoss = getSelectedLoss(
          feature.properties,
          selectedBuildingSeaLevel,
          selectedBuildingReturnPeriod,
          maxLoss
        );
        const color = getRiskColor(selectedLoss, maxLoss, preferences.buildings);

        return {
          color: color,
          weight: 1,
          opacity: 0.7,
          fillColor: color,
          fillOpacity: 0.5,
        };
      },
      onEachFeature: (feature: BuildingGeoJsonFeature, layer) => {
        // Create popup content
        const properties = feature.properties;
        const featureId = String(properties.__featureId || "");
        if (featureId) {
          layerByIdRef.current.set(featureId, layer);
        }
        // SLR data for sparkline
        const slrData = getSeaLevelSeries(properties, selectedBuildingReturnPeriod);

        // Find the worst-case loss
        const maxLoss = slrData.length ? Math.max(...slrData.map((d) => d.loss)) : 0;
        const selectedLoss = getSelectedLoss(
          properties,
          selectedBuildingSeaLevel,
          selectedBuildingReturnPeriod,
          maxLoss
        );
        const riskLevelInfo = getRiskLabelForLoss(selectedLoss, preferences.buildings);
        const riskLevel = riskLevelInfo.label;

        // Create popup HTML
        const popupContent = document.createElement("div");
        popupContent.style.maxWidth = "500px";
        popupContent.style.maxHeight = "400px";
        popupContent.style.overflowY = "auto";
        popupContent.style.fontSize = "12px";
        popupContent.style.lineHeight = "1.4";

        const titleDiv = document.createElement("div");
        titleDiv.style.marginBottom = "8px";
        titleDiv.style.borderBottom = "1px solid #ddd";
        titleDiv.style.paddingBottom = "6px";

        const buildingName = properties.__featureName || (properties.Details ? properties.Details.split(";")[0] : "Building");
        const riskColor = getRiskColor(selectedLoss, maxLoss, preferences.buildings);

        const selectedSeaLevelLabel = selectedBuildingSeaLevel || "N/A";
        const selectedReturnPeriodLabel = selectedBuildingReturnPeriod
          ? normalizeReturnPeriod(selectedBuildingReturnPeriod)
          : "";

        titleDiv.innerHTML = `
          <div style="font-weight: bold; font-size: 13px;">🏢 ${buildingName}</div>
          <div style="color: ${riskColor}; font-weight: 600; margin-top: 4px;">Risk Level: ${riskLevel}</div>
          <div style="color: #666; font-size: 11px; margin-top: 2px;">Predicted Loss @ ${selectedSeaLevelLabel} SLR ${selectedReturnPeriodLabel ? `(${selectedReturnPeriodLabel})` : ""}: <strong>${formatCurrency(selectedLoss)}</strong></div>
        `;

        popupContent.appendChild(titleDiv);

        // Add Chart.js chart for SLR Impact Trajectory
        const chartContainer = document.createElement("div");
        chartContainer.style.marginTop = "6px";
        chartContainer.style.marginBottom = "4px";
        
        const chartTitle = document.createElement("div");
        chartTitle.style.fontWeight = "600";
        chartTitle.style.fontSize = "10px";
        chartTitle.style.color = "#333";
        chartTitle.style.marginBottom = "4px";
        chartTitle.textContent = "SLR Impact Trajectory";
        chartContainer.appendChild(chartTitle);
        
        const canvas = document.createElement("canvas");
        canvas.width = 500;
        canvas.height = 110;
        canvas.style.maxWidth = "100%";
        canvas.style.display = "block";
        chartContainer.appendChild(canvas);
        popupContent.appendChild(chartContainer);
        
        // Alternative: Simple SVG bar chart visualization
        const maxLossValue = slrData.length ? Math.max(...slrData.map(d => d.loss)) : 0;
        const padding = 30;
        const chartWidth = 500 - (padding * 2);
        const chartHeight = 110 - (padding * 2);
        const barWidth = chartWidth / slrData.length - 4;
        
        let svgContent = `
          <svg width="500" height="110" style="border: 1px solid #eee; border-radius: 4px;">
            <!-- Y-axis labels -->
            <text x="5" y="15" font-size="9" fill="#999">${formatCurrency(maxLossValue)}</text>
            <text x="5" y="95" font-size="9" fill="#999">$0</text>
            
            <!-- Bars -->
        `;
        
        slrData.forEach((d, i) => {
          const x = padding + (i * (barWidth + 4));
          const barHeight = maxLossValue > 0 ? (d.loss / maxLossValue) * chartHeight : 0;
          const y = padding + (chartHeight - barHeight);
          
          // Get color based on this specific bar's loss value
          const barColor = getRiskColor(d.loss, maxLossValue, preferences.buildings);
          
          svgContent += `
            <g class="bar-group" style="cursor: pointer;">
              <rect 
                x="${x}" 
                y="${y}" 
                width="${barWidth}" 
                height="${barHeight}" 
                fill="${barColor}" 
                opacity="0.7" 
                rx="2"
                class="bar"
                style="transition: opacity 0.2s ease;"
              />
              <title>${d.label}: ${formatCurrency(d.loss)}</title>
            </g>
            <text 
              x="${x + barWidth/2}" 
              y="${padding + chartHeight + 18}" 
              font-size="9" 
              fill="#333" 
              text-anchor="middle"
            >${d.label}</text>
          `;
        });
        
        svgContent += `
            <!-- X-axis line -->
            <line x1="${padding}" y1="${padding + chartHeight}" x2="${padding + chartWidth}" y2="${padding + chartHeight}" stroke="#ddd" stroke-width="1"/>
          </svg>
          <style>
            .bar-group:hover .bar {
              opacity: 1 !important;
              filter: brightness(1.1);
            }
          </style>
        `;
        
        canvas.outerHTML = svgContent;

        // COMMENTED OUT: Chart.js implementation
        /*
        setTimeout(() => {
          const maxLossValue = Math.max(...slrData.map(d => d.loss));
          new Chart(canvas, {
            type: "line",
            data: {
              labels: slrData.map(d => d.label),
              datasets: [
                {
                  label: "Predicted Loss",
                  data: slrData.map(d => d.loss),
                  borderColor: riskColor,
                  backgroundColor: riskColor + "20",
                  borderWidth: 2,
                  pointRadius: 4,
                  pointBackgroundColor: riskColor,
                  pointBorderColor: "#fff",
                  pointBorderWidth: 2,
                  tension: 0.3,
                  fill: true,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  callbacks: {
                    label: (context) => {
                      return `Loss: ${formatCurrency(context.parsed.y ?? 0)}`;
                    },
                  },
                },
              },
              scales: {
                x: {
                  title: {
                    display: true,
                    text: "Sea Level Rise",
                    font: { size: 10 },
                  },
                  grid: {
                    display: false,
                  },
                  ticks: {
                    font: { size: 9 },
                  },
                },
                y: {
                  beginAtZero: true,
                  max: maxLossValue * 1.15,
                  title: {
                    display: true,
                    text: "Financial Loss",
                    font: { size: 10 },
                  },
                  grid: {
                    color: "rgba(0, 0, 0, 0.05)",
                  },
                  ticks: {
                    font: { size: 9 },
                    maxTicksLimit: 5,
                    callback: (value) => formatCurrency(Number(value)),
                  },
                },
              },
            },
          });
        }, 100);
        */

        // Add vulnerability scorecard
        const scorecardDiv = document.createElement("div");
        scorecardDiv.style.marginTop = "12px";
        scorecardDiv.style.fontSize = "11px";
        scorecardDiv.style.lineHeight = "1.6";

        const conditionColor = {
          Excellent: "#4CAF50",
          Good: "#66BB6A",
          Fair: "#FFC107",
          Poor: "#FF9800",
          "Very Poor": "#F44336",
        };
        const conditionColor_ = conditionColor[properties.Condition as keyof typeof conditionColor] || "#999";

        scorecardDiv.innerHTML = `
          <div style="margin-bottom: 6px; font-weight: bold;">Building Profile</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div>
              <span style="color: #999;">Use Type:</span><br/>
              <span style="font-size: 10px;">${properties.UseType || "N/A"}</span>
            </div>
            <div>
              <span style="color: #999;">Condition:</span><br/>
              <span style="color: ${conditionColor_}; font-weight: bold;">${properties.Condition || "Unknown"}</span>
            </div>
            <div>
              <span style="color: #999;">Structure:</span><br/>
              <span style="font-size: 10px;">${properties.Structure || "N/A"}</span>
            </div>
            <div>
              <span style="color: #999;">Walls:</span><br/>
              <span style="font-size: 10px;">${properties.Wall_Material || "N/A"}</span>
            </div>
            <div>
              <span style="color: #999;">Size:</span><br/>
              <span style="font-size: 10px;">${(properties.Size || 0).toFixed(0)} m²</span>
            </div>
            <div>
              <span style="color: #999;">Asset Value:</span><br/>
              <span style="font-size: 10px;">${formatCurrency(Number(properties.Value ?? 0))}</span>
            </div>
          </div>
        `;
        popupContent.appendChild(scorecardDiv);

        // Bind popup with proper sizing options
        layer.bindPopup(popupContent, { maxWidth: 520, minWidth: 400, className: "building-popup" });

        // Open popup on click
        layer.on("click", () => {
          layer.openPopup();
        });

        // Visual feedback on hover
        layer.on("mouseover", () => {
          if (layer instanceof L.Path) {
            layer.setStyle({ weight: 3, opacity: 1 });
          }
        });

        layer.on("mouseout", () => {
          if (layer instanceof L.Path) {
            layer.setStyle({ weight: 1, opacity: 0.7 });
          }
        });
      },
    });

    map.addLayer(geoJsonLayer);
    geoJsonRef.current = geoJsonLayer;
    const layerMap = layerByIdRef.current;

    return () => {
      if (geoJsonRef.current) {
        map.removeLayer(geoJsonRef.current);
      }
      layerMap.clear();
    };
  }, [buildingData, selectedCountry, map]);

  // Update styles when filter settings change — avoids full layer rebuild
  useEffect(() => {
    if (!geoJsonRef.current || !buildingData) return;
    geoJsonRef.current.eachLayer((layer: any) => {
      const feature = layer.feature as BuildingGeoJsonFeature | undefined;
      if (!feature) return;
      const maxLoss = getMaxLoss(feature.properties);
      const selectedLoss = getSelectedLoss(
        feature.properties,
        selectedBuildingSeaLevel,
        selectedBuildingReturnPeriod,
        maxLoss
      );
      const color = getRiskColor(selectedLoss, maxLoss, preferences.buildings);
      if (layer instanceof L.Path) {
        layer.setStyle({ color, fillColor: color });
      }
    });
  }, [buildingData, selectedBuildingSeaLevel, selectedBuildingReturnPeriod, preferences]);

  useEffect(() => {
    if (!buildingSelectRequest || !buildingImpactConfig[selectedCountry]) return;

    const layer = layerByIdRef.current.get(buildingSelectRequest.id);
    if (!layer) return;

    const pathLayer = layer as L.Path & { getBounds?: () => L.LatLngBounds };
    if (typeof pathLayer.getBounds === "function") {
      map.fitBounds(pathLayer.getBounds(), { maxZoom: 17, padding: [20, 20] });
    }

    if ("openPopup" in layer && typeof (layer as L.Layer & { openPopup?: () => void }).openPopup === "function") {
      (layer as L.Layer & { openPopup?: () => void }).openPopup();
    }
  }, [buildingSelectRequest, selectedCountry, map]);

  return null; // This component manages the map layer directly
}
