"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Feature } from "geojson";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { getRiskColor, formatCurrency } from "./BuildingHeightCalculator";
import { useRiskPreferences } from "./RiskPreferencesContext";

// Module-level GeoJSON cache per country
const _roadGeoJsonCache = new Map<string, any>();

function formatRoadCurrency(val: number) {
  return "$" + Math.round(val).toLocaleString() + "K";
}

interface RoadNetworkViewerProps {
  selectedCountry: string;
  selectedSeaLevel: number;
  selectedReturnPeriod: number;
  selectedIsland?: string;
  islandBounds?: [[number, number], [number, number]] | null;
  roadSelectRequest?: { id: number; nonce: number } | null;
  roadOpacity?: number;
}

type RoadImpactConfig = {
  dataPath: string;
  boundsByRegion?: { [key: string]: { minLat: number; maxLat: number; minLng: number; maxLng: number } };
};

export const roadImpactConfig: Record<string, RoadImpactConfig> = {
  CK: {
    dataPath: "/dataset/COK/latest results-road-impact.geojson",
    boundsByRegion: {
      northern_cook_islands: { minLat: -14.0, maxLat: -8.0, minLng: -166.0, maxLng: -157.0 },
      southern_cook_islands: { minLat: -23.0, maxLat: -18.0, minLng: -160.0, maxLng: -155.0 },
    }
  },
  TV: {
    dataPath: "/dataset/TUV/latest (no duplicate regions)-road-impact.geojson"
  },
  VU: {
    dataPath: "/dataset/VUT/Latest full results-road-impact.geojson"
  },
  WS: {
    dataPath: "/dataset/WSM/SLR example-road-impact.geojson"
  },
  TO: {
    dataPath: "/dataset/TON/Example dashboard results-road-impact.geojson"
  }
  ,
  MH: {
    dataPath: "/dataset/MHL/dashboard results-road-impact.geojson"
  }
};

export const roadImpactCountries = Object.keys(roadImpactConfig);

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

const isLngWithinBounds = (lng: number, west: number, east: number) => {
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
};

const isCoordWithinBounds = (lat: number, lng: number, bounds: [[number, number], [number, number]]) => {
  const [[south, west], [north, east]] = bounds;
  return lat >= south && lat <= north && isLngWithinBounds(lng, west, east);
};

const roadFeatureWithinBounds = (feature: Feature, bounds: [[number, number], [number, number]]) => {
  if (!feature.geometry) return false;
  const geom = feature.geometry;
  if (geom.type === "LineString") {
    return geom.coordinates.some(([lng, lat]) => isCoordWithinBounds(lat, lng, bounds));
  }
  if (geom.type === "MultiLineString") {
    return geom.coordinates.some((line) => line.some(([lng, lat]) => isCoordWithinBounds(lat, lng, bounds)));
  }
  return false;
};

export default function RoadNetworkViewer({
  selectedCountry,
  selectedSeaLevel,
  selectedReturnPeriod,
  selectedIsland,
  islandBounds,
  roadSelectRequest,
  roadOpacity = 0.8,
}: RoadNetworkViewerProps) {
  const map = useMap();
  const { preferences } = useRiskPreferences();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const layerMapRef = useRef<Map<number, L.Layer>>(new Map());
  const [data, setData] = useState<any>(null);

  // Fetch data once per country
  useEffect(() => {
    const countryConfig = roadImpactConfig[selectedCountry];
    if (!countryConfig) {
      setData(null);
      return;
    }

    if (_roadGeoJsonCache.has(countryConfig.dataPath)) {
      setData(_roadGeoJsonCache.get(countryConfig.dataPath));
    } else {
      fetch(countryConfig.dataPath)
        .then((res) => res.json())
        .then((d) => {
          _roadGeoJsonCache.set(countryConfig.dataPath, d);
          setData(d);
        })
        .catch((err) => console.error("Failed to load road GeoJSON:", err));
    }
  }, [selectedCountry]);

  // Build Leaflet layer when data or island changes
  useEffect(() => {
    if (geoJsonRef.current) {
        map.removeLayer(geoJsonRef.current);
        geoJsonRef.current = null;
    }
    layerMapRef.current.clear();

    if (!data || !map) return;

    const filteredData = selectedIsland && islandBounds
      ? { ...data, features: data.features.filter((feature: Feature) => roadFeatureWithinBounds(feature, islandBounds)) }
      : data;

    // Pre-assign indices to features to avoid O(n²) indexOf later
    filteredData.features.forEach((f: any, i: number) => {
      f.properties = { ...f.properties, __roadIdx: i };
    });

    const layer = L.geoJSON(filteredData, {
      style: (feature) => {
        const props = feature?.properties || {};
        const loss = getRoadMetric(props, selectedSeaLevel, selectedReturnPeriod, "Loss");
        if (loss <= 0) {
             return { color: "#555", weight: 2, opacity: roadOpacity * 0.375 };
        }
        const color = getRiskColor(loss, 2000, preferences.roads); 
        return { color, weight: 4, opacity: roadOpacity };
      },
      onEachFeature: (feature, layer) => {
         const idx = feature?.properties?.__roadIdx;
         if (typeof idx === 'number') {
             layerMapRef.current.set(idx, layer);
         }

         const props = feature?.properties || {};
         const loss = getRoadMetric(props, selectedSeaLevel, selectedReturnPeriod, "Loss");
         const depth = getRoadMetric(props, selectedSeaLevel, selectedReturnPeriod, "Depth");

         layer.bindPopup(`
           <div style="font-family: sans-serif; font-size: 12px; min-width: 150px;">
             <strong style="font-size: 13px;">${props.Asset}</strong>
             ${props.Details ? `<br/><span style="color:#666">${props.Details}</span>` : ""}
             <hr style="margin: 6px 0; border: 0; border-top: 1px solid #ccc"/>
             <div><strong>Use:</strong> ${props.UseType}</div>
             <div><strong>Size:</strong> ${props.Size != null ? props.Size : 'N/A'}</div>
             <div><strong>Loss:</strong> ${formatRoadCurrency(loss)}</div>
             <div><strong>Depth:</strong> ${depth ? depth + 'm' : '0m'}</div>
             <div style="margin-top: 8px; font-size: 11px; color: #555; border-top: 1px solid #eee; padding-top: 4px;">
               Return period of ${selectedReturnPeriod} years on ${selectedSeaLevel}cm sea level rise
             </div>
           </div>
         `);
      }
    });

    layer.addTo(map);
    geoJsonRef.current = layer;

    return () => {
        if (geoJsonRef.current) map.removeLayer(geoJsonRef.current);
    };
  }, [data, map, selectedIsland, islandBounds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update styles in-place when filter settings change (no layer rebuild)
  useEffect(() => {
    if (!geoJsonRef.current) return;
    geoJsonRef.current.eachLayer((layer: any) => {
      const feature = layer.feature;
      if (!feature) return;
      const props = feature.properties || {};
      const loss = getRoadMetric(props, selectedSeaLevel, selectedReturnPeriod, "Loss");
      if (loss <= 0) {
        layer.setStyle({ color: "#555", weight: 2, opacity: roadOpacity * 0.375 });
      } else {
        const color = getRiskColor(loss, 2000, preferences.roads);
        layer.setStyle({ color, weight: 4, opacity: roadOpacity });
      }
    });
  }, [selectedSeaLevel, selectedReturnPeriod, roadOpacity, preferences]);

  // Handle selections
  useEffect(() => {
    if (!roadSelectRequest) return;
    
    const layer = layerMapRef.current.get(roadSelectRequest.id);
    if (layer) {
        if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
             map.flyToBounds(layer.getBounds(), { maxZoom: 17, duration: 1.5 });
             layer.openPopup();
        }
    }
  }, [roadSelectRequest, map]);


  return null;
}
