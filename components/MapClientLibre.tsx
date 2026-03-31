/**
 * MapClientLibre.tsx
 *
 * MapLibre GL JS equivalent of MapClient.tsx.
 * Key additions over the Leaflet version:
 *   - 3D building extrusions (fill-extrusion from OpenFreeMap vector tiles)
 *   - Camera pitch / tilt slider control
 *   - MapLibre NavigationControl with compass + visualised pitch ring
 *
 * Omissions vs MapClient.tsx (Leaflet-specific features, can be ported later):
 *   - MapScreenshotButton  — uses useMap() from react-leaflet; see TODO below
 *   - Side-by-side compare — requires two Map instances; basic dual-layer
 *     fallback is included but without the drag-slider clip effect
 *
 * Switching between map engines:
 *   Edit MapWrapper.tsx and toggle the two dynamic import lines.
 */

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, LayerSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";

import FilterSidebar from "./FilterSidebar";
import LeftSidebar from "./LeftSidebar";
import MapLegend from "./MapLegend";
// buildingImpactCountries is the exported list; we re-define config locally
// because buildingImpactConfig is not exported from CookIslandsBuildingViewer.
import { buildingImpactCountries } from "./CookIslandsBuildingViewer";
import { roadImpactConfig } from "./RoadNetworkViewer";
import { getRiskColor, formatCurrency } from "./BuildingHeightCalculator";
import { useRiskPreferences, getRiskLabelForLoss } from "./RiskPreferencesContext";
import styles from "./MapClient.module.css";

// TODO: MapScreenshotButton uses useMap() from react-leaflet and cannot be
// used inside a MapLibre context.  Replace with:
//   mapRef.current?.getCanvas().toBlob(blob => { /* save blob */ })

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers (mirrors MapClient.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const cookIslandsBounds: { [key: string]: [[number, number], [number, number]] } = {
  northern_cook_islands: [[-14.0, -166.0], [-8.0, -157.0]],
  southern_cook_islands: [[-23.0, -160.0], [-18.0, -155.0]],
};

const countryCodeMap: { [key: string]: string } = {
  CK: "COK", TO: "TON", TV: "TUV", VU: "VUT", WS: "WSM",
  FJ: "FJI", MH: "MHL", NU: "NIU", PW: "PLW", NR: "NRU",
  SB: "SLB", KI: "KIR", FM: "FSM", PN: "PCN", AS: "ASM",
  WF: "WLF", NC: "NCL", TK: "TKL", PF: "PYF", MP: "MNP",
  GU: "GUM", PG: "PNG",
};

const normalizeLongitude = (lng: number) =>
  ((lng + 180) % 360 + 360) % 360 - 180;

const normalizeBounds = (
  south: number, west: number, north: number, east: number
): [[number, number], [number, number]] => [
  [south, normalizeLongitude(west)],
  [north, normalizeLongitude(east)],
];

const isDatelineCrossing = (b: [[number, number], [number, number]]) => b[0][1] > b[1][1];

/** [lng, lat] — MapLibre order */
const defaultCenter: [number, number] = [normalizeLongitude(-180.6947), -8];

const countryFlagMap: Record<string, { name: string }> = {
  CK: { name: "Cook Islands" }, MH: { name: "Marshall Islands" },
  TO: { name: "Tonga" },       TV: { name: "Tuvalu" },
  VU: { name: "Vanuatu" },     WS: { name: "Samoa" },
  FJ: { name: "Fiji" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Building impact config (mirrors CookIslandsBuildingViewer.tsx — not exported)
// ─────────────────────────────────────────────────────────────────────────────

const buildingImpactConfig: Record<
  string,
  {
    dataPath: string;
    boundsByRegion?: { [key: string]: { minLat: number; maxLat: number; minLng: number; maxLng: number } };
  }
> = {
  CK: {
    dataPath: "/dataset/COK/latest results-buildings-impact.geojson",
    boundsByRegion: {
      northern_cook_islands: { minLat: -14.0, maxLat: -8.0, minLng: -166.0, maxLng: -157.0 },
      southern_cook_islands: { minLat: -23.0, maxLat: -18.0, minLng: -160.0, maxLng: -155.0 },
    },
  },
  TV: { dataPath: "/dataset/TUV/latest (no duplicate regions)-buildings-impact.geojson" },
  VU: { dataPath: "/dataset/VUT/Latest full results-buildings-impact.geojson" },
  WS: { dataPath: "/dataset/WSM/SLR example-buildings-impact.geojson" },
  TO: { dataPath: "/dataset/TON/Example dashboard results-buildings-impact.geojson" },
  MH: { dataPath: "/dataset/MHL/dashboard results-buildings-impact.geojson" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Building data helpers (mirrors CookIslandsBuildingViewer.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const lossKeyRegex = /^SLR_(.+)_ARI(\d+)[._]Loss$/;

const getLossEntries = (props: Record<string, unknown>) =>
  Object.entries(props)
    .map(([key, value]) => {
      const m = key.match(lossKeyRegex);
      if (!m) return null;
      const loss = Number(value);
      if (!Number.isFinite(loss)) return null;
      return { seaLevel: m[1], returnPeriod: `ARI${m[2]}`, loss };
    })
    .filter(Boolean) as { seaLevel: string; returnPeriod: string; loss: number }[];

const normalizeReturnPeriod = (rp?: string) =>
  rp && !rp.startsWith("ARI") ? `ARI${rp}` : (rp ?? "");

const getSelectedLoss = (
  props: Record<string, unknown>,
  seaLevel?: string,
  returnPeriod?: string
): number => {
  if (!seaLevel || !returnPeriod) return 0;
  const rp = normalizeReturnPeriod(returnPeriod);
  for (const key of [`SLR_${seaLevel}_${rp}_Loss`, `SLR_${seaLevel}_${rp}.Loss`]) {
    const v = Number(props[key]);
    if (Number.isFinite(v)) return v;
  }
  return 0;
};

const getMaxLoss = (props: Record<string, unknown>) => {
  const losses = getLossEntries(props).map((e) => e.loss);
  return losses.length ? Math.max(...losses) : 0;
};

const extractBuildingOptions = (features: Feature[]) => {
  const seaLevels = new Set<string>();
  const returnPeriods = new Set<string>();
  features.forEach((f) => {
    Object.keys(f.properties ?? {}).forEach((k) => {
      const m = k.match(lossKeyRegex);
      if (m) { seaLevels.add(m[1]); returnPeriods.add(`ARI${m[2]}`); }
    });
  });
  return {
    seaLevels: [...seaLevels].sort((a, b) => parseFloat(a) - parseFloat(b)),
    returnPeriods: [...returnPeriods].sort(
      (a, b) =>
        parseFloat(a.replace(/\D/g, "")) - parseFloat(b.replace(/\D/g, ""))
    ),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Spatial helpers (shared by buildings + roads)
// ─────────────────────────────────────────────────────────────────────────────

const isLngWithinBounds = (lng: number, west: number, east: number) =>
  west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;

const isCoordWithinBounds = (
  lat: number, lng: number, bounds: [[number, number], [number, number]]
) => {
  const [[south, west], [north, east]] = bounds;
  return lat >= south && lat <= north && isLngWithinBounds(lng, west, east);
};

const featureWithinBounds = (
  feature: Feature, bounds: [[number, number], [number, number]]
): boolean => {
  const geom = feature.geometry;
  if (!geom) return false;
  if (geom.type === "Polygon")
    return geom.coordinates.some((r) => r.some(([lng, lat]) => isCoordWithinBounds(lat, lng, bounds)));
  if (geom.type === "MultiPolygon")
    return geom.coordinates.some((p) =>
      p.some((r) => r.some(([lng, lat]) => isCoordWithinBounds(lat, lng, bounds)))
    );
  if (geom.type === "LineString")
    return geom.coordinates.some(([lng, lat]) => isCoordWithinBounds(lat, lng, bounds));
  if (geom.type === "MultiLineString")
    return geom.coordinates.some((l) =>
      l.some(([lng, lat]) => isCoordWithinBounds(lat, lng, bounds))
    );
  return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// Road data helpers (mirrors RoadNetworkViewer.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const getRoadMetric = (
  props: Record<string, unknown>,
  seaLevel: number,
  returnPeriod: number,
  suffix: "Loss" | "Depth"
): number => {
  for (const key of [
    `SLR_${seaLevel}cm_ARI${returnPeriod}_${suffix}`,
    `SLR_${seaLevel}cm_ARI${returnPeriod}.${suffix}`,
  ]) {
    const v = Number(props[key]);
    if (Number.isFinite(v)) return v;
  }
  return 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Story overlay — hoisted outside component to satisfy React 19 rules
// ─────────────────────────────────────────────────────────────────────────────
interface StoryOverlayProps {
  isFloodLayerEnabled: boolean;
  returnPeriod: string;
  seaLevel: string;
  isCompareActive: boolean;
  compareReturnPeriod: string;
  compareSeaLevel: string;
  /** All available sea levels (sorted asc) — used to draw the water bar */
  availableSeaLevels: string[];
}

function StoryOverlay({
  isFloodLayerEnabled,
  returnPeriod,
  seaLevel,
  isCompareActive,
  compareReturnPeriod,
  compareSeaLevel,
  availableSeaLevels,
}: StoryOverlayProps) {
  if (!returnPeriod || !seaLevel || !isFloodLayerEnabled) return null;
  const rpLabel        = returnPeriod.replace(/ARI/i, "") + " Year";
  const compareRpLabel = compareReturnPeriod
    ? compareReturnPeriod.replace(/ARI/i, "") + " Year"
    : "";

  // Water bar width — shows how high the sea level is relative to available range
  const slIdx = availableSeaLevels.indexOf(seaLevel);
  const pct   = availableSeaLevels.length > 1
    ? Math.round((slIdx / (availableSeaLevels.length - 1)) * 100)
    : 100;

  return (
    <div
      style={{
        position: "absolute", top: "10px", left: "50%",
        transform: "translateX(-50%)", zIndex: 10, pointerEvents: "none",
      }}
    >
      <div
        className={styles.floodRising}
        style={{
          position: "relative", overflow: "hidden",
          backgroundColor: "rgba(0,0,0,0.7)", padding: "10px 20px",
          borderRadius: "20px", color: "white", backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.2)", textAlign: "center",
          boxShadow: "0 4px 6px rgba(0,0,0,0.3)", pointerEvents: "auto",
          minWidth: isCompareActive ? "320px" : undefined,
        }}
      >
        {/* Animated water-level bar at the bottom of the pill */}
        <div className={styles.waterBar} style={{ width: `${pct}%` }} />
        {isCompareActive ? (
          <div style={{ display: "flex", alignItems: "stretch", gap: "12px" }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", opacity: 0.8, marginBottom: "2px" }}>Left</div>
              <div style={{ fontSize: "13px", fontWeight: "bold" }}>
                <span style={{ color: "#4fc3f7" }}>{rpLabel}</span> Event
              </div>
              <div style={{ fontSize: "11px", marginTop: "2px" }}>
                <span style={{ color: "#ffb74d" }}>{seaLevel}m</span> SLR
              </div>
            </div>
            <div style={{ width: "1px", background: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", opacity: 0.8, marginBottom: "2px" }}>Right</div>
              <div style={{ fontSize: "13px", fontWeight: "bold" }}>
                <span style={{ color: "#4fc3f7" }}>{compareRpLabel}</span> Event
              </div>
              <div style={{ fontSize: "11px", marginTop: "2px" }}>
                <span style={{ color: "#ffb74d" }}>{compareSeaLevel}m</span> SLR
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", opacity: 0.8, marginBottom: "2px" }}>
              Current Projection
            </div>
            <div style={{ fontSize: "14px", fontWeight: "bold" }}>
              Flood Depth at <span style={{ color: "#4fc3f7" }}>{rpLabel}</span> Event
            </div>
            <div style={{ fontSize: "12px", marginTop: "2px" }}>
              with <span style={{ color: "#ffb74d" }}>{seaLevel}m</span> Sea Level Rise
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Basemap configurations
// ─────────────────────────────────────────────────────────────────────────────
type BasemapId = "satellite" | "light" | "voyager" | "dark";

interface BasemapConfig {
  label: string;
  description: string;
  icon: string;
  tiles: string[];
  /** Hide the ESRI labels overlay — CARTO tiles include their own labels */
  showEsriLabels: boolean;
}

const BASEMAPS: Record<BasemapId, BasemapConfig> = {
  light: {
    label: "Light",
    description: "Positron — Clean, minimal. Best for hazard visibility.",
    icon: "☀",
    tiles: [
      "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    ],
    showEsriLabels: false,
  },
  voyager: {
    label: "Detailed",
    description: "Voyager — Richer detail, more labels and features. Good for context.",
    icon: "\u{1F5FA}",
    tiles: [
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    ],
    showEsriLabels: false,
  },
  dark: {
    label: "Dark",
    description: "Dark Matter — Reduces glare, good for extended viewing. Enhanced hazard contrast.",
    icon: "\u{1F319}",
    tiles: [
      "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    ],
    showEsriLabels: false,
  },
  satellite: {
    label: "Satellite",
    description: "ESRI World Imagery — High-resolution satellite photography.",
    icon: "\u{1F6F0}",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    showEsriLabels: true,
  },
};

const BASEMAP_ORDER: BasemapId[] = ["light", "voyager", "dark", "satellite"];
const DEFAULT_BASEMAP: BasemapId = "light";

// ─────────────────────────────────────────────────────────────────────────────
// MapClientLibre component
// ─────────────────────────────────────────────────────────────────────────────

export default function MapClientLibre(
  { initialCountry }: { initialCountry?: string } = {}
) {
  // ── State — mirrors MapClient.tsx ─────────────────────────────────────────
  const [isFloodLayerEnabled,       setIsFloodLayerEnabled]       = useState(false);
  const [selectedCountry,           setSelectedCountry]           = useState<string>(initialCountry || "");
  const [cardinalDirection,         setCardinalDirection]         = useState<string>("");
  const [selectedIsland,            setSelectedIsland]            = useState<string>("");
  const [returnPeriod,              setReturnPeriod]              = useState<string>("100");
  const [seaLevel,                  setSeaLevel]                  = useState<string>("0.1");
  const [islandBounds,              setIslandBounds]              = useState<[[number, number], [number, number]] | null>(null);
  const [isSidebarCollapsed,        setIsSidebarCollapsed]        = useState(false);
  const [countryBounds,             setCountryBounds]             = useState<{ [key: string]: [[number, number], [number, number]] }>({});
  const [isBuildingLayerVisible,    setIsBuildingLayerVisible]    = useState(true);
  const [buildingItems,             setBuildingItems]             = useState<{ id: string; name: string; useType: string; maxLoss: number }[]>([]);
  const [buildingSeaLevels,         setBuildingSeaLevels]         = useState<string[]>([]);
  const [buildingReturnPeriods,     setBuildingReturnPeriods]     = useState<string[]>([]);
  const [selectedBuildingSeaLevel,  setSelectedBuildingSeaLevel]  = useState<string>("");
  const [selectedBuildingReturnPeriod, setSelectedBuildingReturnPeriod] = useState<string>("");
  const [buildingSelectRequest,     setBuildingSelectRequest]     = useState<{ id: string; nonce: number } | null>(null);
  const [isRoadLayerVisible,        setIsRoadLayerVisible]        = useState(false);
  const [roadSeaLevel,              setRoadSeaLevel]              = useState<number>(0);
  const [roadReturnPeriod,          setRoadReturnPeriod]          = useState<number>(100);
  const [roadSelectRequest,         setRoadSelectRequest]         = useState<{ id: number; nonce: number } | null>(null);
  const [floodOpacity,              setFloodOpacity]              = useState(0.8);
  const [roadOpacity,               setRoadOpacity]               = useState(0.8);
  // Available sea levels bubbled up from FilterSidebarTop (used for water-bar animation)
  const [availableSeaLevels,        setAvailableSeaLevels]        = useState<string[]>([]);
  // Active basemap
  const [basemapId,                 setBasemapId]                 = useState<BasemapId>(DEFAULT_BASEMAP);
  const [compareEnabled,            setCompareEnabled]            = useState(false);
  const [compareReturnPeriod,       setCompareReturnPeriod]       = useState<string>("");
  const [compareSeaLevel,           setCompareSeaLevel]           = useState<string>("");

  // ── MapLibre-specific ─────────────────────────────────────────────────────
  const mapRef           = useRef<maplibregl.Map | null>(null);
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const [mapLoaded,      setMapLoaded] = useState(false);
  const [pitch,          setPitch]     = useState(0);

  // Compare map — second MapLibre instance for side-by-side split view.
  // MapLibre renders to a single WebGL canvas, so individual layers cannot
  // be CSS-clipped. Two synchronised map instances (one per side) are the
  // canonical approach (same as @maplibre/maplibre-gl-compare).
  const compareMapRef           = useRef<maplibregl.Map | null>(null);
  const compareMapContainerRef  = useRef<HTMLDivElement>(null);
  const compareSliderContainerRef = useRef<HTMLDivElement>(null);
  const [compareSliderPos, setCompareSliderPos] = useState(0.5);

  // Raw GeoJSON data held in state so dependent effects re-run on new data
  const [rawBuildingData, setRawBuildingData] = useState<FeatureCollection | null>(null);
  const [rawRoadData,     setRawRoadData]     = useState<FeatureCollection | null>(null);

  // Track whether MapLibre building/road layers are already added to the map.
  // Layers are created once and then updated via setData(); click handlers
  // read pre-computed properties so they don't need closure over filter state.
  const buildingLayersAddedRef = useRef(false);
  const roadLayersAddedRef     = useRef(false);

  // Animation frame handle for flood-rise effect
  const floodAnimRef = useRef<number | null>(null);

  // Popups
  const buildingPopupRef = useRef<maplibregl.Popup | null>(null);
  const roadPopupRef     = useRef<maplibregl.Popup | null>(null);

  // Keep latest risk preferences accessible inside stable click-handler closures
  const { preferences } = useRiskPreferences();
  const preferencesRef  = useRef(preferences);
  // Keep ref in sync after each render so click-handler closures always read
  // the latest preferences without needing to re-register the handlers.
  useEffect(() => { preferencesRef.current = preferences; });

  // ── Computed values (memoised) ─────────────────────────────────────────────
  const country            = selectedCountry || "CK";
  const island             = selectedIsland || (country === "CK" ? "manihiki" : "");
  const isCompareActive    = compareEnabled && !!compareReturnPeriod && !!compareSeaLevel;

  const wmsUrl = useMemo(() => {
    const cardinalDirectionPath = cardinalDirection ? `${cardinalDirection}/` : "";
    const coastalPath        = country === "WS" ? "" : "Coastal/";
    const islandNameForFile  = island.replace("_province", "");
    const wmsBaseUrl = `https://gemthreddshpc.spc.int/thredds/wms/POP/Partner2/SLR/${country}/${coastalPath}${cardinalDirectionPath}${island}/FloodDepth_${islandNameForFile}_${returnPeriod}_${seaLevel}.nc`;
    const WMS_PARAMS =
      "SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap" +
      "&LAYERS=Depth&STYLES=default-scalar%2Fx-Sst" +
      "&FORMAT=image%2Fpng&TRANSPARENT=true" +
      "&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256" +
      "&BBOX={bbox-epsg-3857}" +
      "&TIME=2022-06-14T00%3A00%3A00.000Z" +
      "&COLORSCALERANGE=0%2C2.337";
    return `${wmsBaseUrl}?${WMS_PARAMS}`;
  }, [country, cardinalDirection, island, returnPeriod, seaLevel]);

  const compareWmsUrl = useMemo(() => {
    if (!isCompareActive) return "";
    const cardinalDirectionPath = cardinalDirection ? `${cardinalDirection}/` : "";
    const coastalPath        = country === "WS" ? "" : "Coastal/";
    const islandNameForFile  = island.replace("_province", "");
    const compareWmsBaseUrl = `https://gemthreddshpc.spc.int/thredds/wms/POP/Partner2/SLR/${country}/${coastalPath}${cardinalDirectionPath}${island}/FloodDepth_${islandNameForFile}_${compareReturnPeriod}_${compareSeaLevel}.nc`;
    const WMS_PARAMS =
      "SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap" +
      "&LAYERS=Depth&STYLES=default-scalar%2Fx-Sst" +
      "&FORMAT=image%2Fpng&TRANSPARENT=true" +
      "&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256" +
      "&BBOX={bbox-epsg-3857}" +
      "&TIME=2022-06-14T00%3A00%3A00.000Z" +
      "&COLORSCALERANGE=0%2C2.337";
    return `${compareWmsBaseUrl}?${WMS_PARAMS}`;
  }, [isCompareActive, country, cardinalDirection, island, compareReturnPeriod, compareSeaLevel]);

  // ── Handlers (stable references via useCallback) ──────────────────────────
  const handleCountryChange = useCallback((c: string) => {
    setSelectedCountry(c);
    setCardinalDirection("");
    setSelectedIsland("");
    setIslandBounds(null);
  }, []);
  const handleCardinalDirectionChange = useCallback((d: string) => {
    setCardinalDirection(d);
    setSelectedIsland("");
    setIslandBounds(null);
  }, []);
  const handleIslandChange = useCallback((i: string) => {
    setSelectedIsland(i);
    setIslandBounds(null);
  }, []);
  const handleBuildingSelect = useCallback((id: string) =>
    setBuildingSelectRequest({ id, nonce: Date.now() }), []);
  const handleRoadSelect     = useCallback((id: number) =>
    setRoadSelectRequest({ id, nonce: Date.now() }), []);
  // ── Fetch country bounds ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("https://ocean-middleware.spc.int/middleware/api/country/")
      .then((r) => r.json())
      .then((data: Record<string, number | string>[]) => {
        const bounds: { [key: string]: [[number, number], [number, number]] } = {};
        data.forEach((c) => {
          bounds[c.short_name] = normalizeBounds(
            Number(c.south_bound_latitude), Number(c.west_bound_longitude),
            Number(c.north_bound_latitude), Number(c.east_bound_longitude)
          );
        });
        setCountryBounds(bounds);
      })
      .catch((err) => console.error("Error loading country bounds:", err));
  }, []);

  // ── Auto-select first building filter options ─────────────────────────────
  useEffect(() => {
    if (
      buildingSeaLevels.length > 0 &&
      (!selectedBuildingSeaLevel || !buildingSeaLevels.includes(selectedBuildingSeaLevel))
    ) {
      setSelectedBuildingSeaLevel(buildingSeaLevels[0]);
    }
  }, [buildingSeaLevels, selectedBuildingSeaLevel]);

  useEffect(() => {
    if (
      buildingReturnPeriods.length > 0 &&
      (!selectedBuildingReturnPeriod || !buildingReturnPeriods.includes(selectedBuildingReturnPeriod))
    ) {
      setSelectedBuildingReturnPeriod(buildingReturnPeriods[0]);
    }
  }, [buildingReturnPeriods, selectedBuildingReturnPeriod]);

  // ── Reset building state when country has no building data ────────────────
  useEffect(() => {
    if (!buildingImpactCountries.includes(selectedCountry)) {
      setBuildingItems([]);
      setBuildingSelectRequest(null);
      setBuildingSeaLevels([]);
      setBuildingReturnPeriods([]);
      setSelectedBuildingSeaLevel("");
      setSelectedBuildingReturnPeriod("");
      setRawBuildingData(null);
    }
  }, [selectedCountry]);

  // ── Auto-enable flood layer when an island is selected ───────────────────
  useEffect(() => {
    if (selectedIsland) {
      setIsFloodLayerEnabled(true);
    } else {
      setIsFloodLayerEnabled(false);
      setCompareEnabled(false);
    }
  }, [selectedIsland]);

  // ── Initialise MapLibre map ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
        sources: {
          // Basemap raster — tiles are swapped dynamically via basemapId state
          "esri-satellite": {
            type: "raster",
            tiles: BASEMAPS[DEFAULT_BASEMAP].tiles,
            tileSize: 256,
            attribution: "© CARTO © OpenStreetMap contributors",
            maxzoom: 19,
          },
          // Labels / boundaries overlay — same ESRI reference layer
          "esri-labels": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            maxzoom: 19,
          },
          // OpenFreeMap vector tiles — provides building footprints for 3D
          // extrusion. No API key required. Swap the url to MapTiler Streets
          // or any OpenMapTiles-compatible source if better coverage is needed
          // over Pacific islands.
          openmaptiles: {
            type: "vector",
            url: "https://tiles.openfreemap.org/planet",
            attribution: "© OpenFreeMap © OpenStreetMap contributors",
          },
        },
        layers: [
          { id: "esri-satellite", type: "raster", source: "esri-satellite" },
          // ── 3D building extrusions ────────────────────────────────────────
          // Uses the OpenMapTiles 'building' source-layer with render_height.
          // Visible from zoom 14 and above. Extruded height responds to pitch.
          {
            id: "3d-buildings",
            source: "openmaptiles",
            "source-layer": "building",
            type: "fill-extrusion",
            minzoom: 14,
            paint: {
              "fill-extrusion-color": "#aabbc0",
              "fill-extrusion-height": [
                "coalesce",
                ["get", "render_height"],
                ["get", "height"],
                5,
              ],
              "fill-extrusion-base": [
                "coalesce",
                ["get", "render_min_height"],
                ["get", "min_height"],
                0,
              ],
              "fill-extrusion-opacity": 0.7,
            },
          } as LayerSpecification,
          // Labels on top of everything
          { id: "esri-labels", type: "raster", source: "esri-labels" },
        ],
      },
      center: defaultCenter,
      zoom: 5,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      attributionControl: false,
    });

    // Built-in controls — NavigationControl includes compass + pitch ring
    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      "top-right"
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    // Keep our pitch slider in sync when the user drags the compass pitch ring
    map.on("pitchend", () => setPitch(Math.round(map.getPitch())));

    map.on("load", () => setMapLoaded(true));
    mapRef.current = map;

    return () => {
      setMapLoaded(false);
      buildingLayersAddedRef.current = false;
      roadLayersAddedRef.current     = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Resize map when sidebar collapses / expands ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const ids = [50, 100, 150, 200, 300].map((t) =>
      setTimeout(() => map.resize(), t)
    );
    return () => ids.forEach(clearTimeout);
  }, [isSidebarCollapsed, mapLoaded]);

  // ── Navigation: fly to country / island ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const apiCode = countryCodeMap[selectedCountry] || selectedCountry;

    const fitBounds = (bounds: [[number, number], [number, number]], maxZoom: number) => {
      const [[south, west], [north, east]] = bounds;
      const adjustedEast = isDatelineCrossing(bounds) ? east + 360 : east;
      map.fitBounds([[west, south], [adjustedEast, north]], {
        maxZoom,
        duration: 1500,
      });
    };

    if (islandBounds) {
      fitBounds(islandBounds, 15);
    } else if (
      selectedCountry === "CK" &&
      cardinalDirection &&
      cookIslandsBounds[cardinalDirection]
    ) {
      fitBounds(cookIslandsBounds[cardinalDirection], 5);
    } else if (selectedCountry && countryBounds[apiCode]) {
      fitBounds(countryBounds[apiCode], 5);
    } else {
      map.flyTo({ center: defaultCenter, zoom: 5, duration: 1500 });
    }
  }, [selectedCountry, cardinalDirection, islandBounds, mapLoaded, countryBounds]);

  // ── Flood-rise animation helper ───────────────────────────────────────────
  // Smoothly ramps a raster layer's opacity from 0 → target over `duration`ms,
  // giving the visual effect of water spreading / rising.
  const animateFloodIn = (layerId: string, targetOpacity: number, duration = 1400) => {
    const map = mapRef.current;
    if (!map) return;
    if (floodAnimRef.current !== null) cancelAnimationFrame(floodAnimRef.current);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // Ease-out cubic: fast at first then slows — mimics water slowing as it spreads
      const eased = 1 - Math.pow(1 - t, 3);
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, "raster-opacity", eased * targetOpacity);
      }
      if (t < 1) {
        floodAnimRef.current = requestAnimationFrame(step);
      } else {
        floodAnimRef.current = null;
      }
    };
    floodAnimRef.current = requestAnimationFrame(step);
  };

  // ── WMS flood layer ───────────────────────────────────────────────────────
  // Create the source+layer once when flood is enabled; update tiles in-place
  // when the WMS URL changes (avoids full teardown+rebuild on every dropdown).
  const floodSourceAddedRef = useRef(false);

  // Effect 1: Add / remove the flood source+layer when flood is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!isFloodLayerEnabled) {
      if (floodAnimRef.current !== null) {
        cancelAnimationFrame(floodAnimRef.current);
        floodAnimRef.current = null;
      }
      if (map.getLayer("flood-wms"))  map.removeLayer("flood-wms");
      if (map.getSource("flood-wms")) map.removeSource("flood-wms");
      floodSourceAddedRef.current = false;
      return;
    }

    if (!floodSourceAddedRef.current) {
      map.addSource("flood-wms", {
        type: "raster",
        tiles: [wmsUrl],
        tileSize: 256,
      });
      map.addLayer(
        {
          id: "flood-wms",
          type: "raster",
          source: "flood-wms",
          paint: { "raster-opacity": 0 },
        },
        "esri-labels"
      );
      floodSourceAddedRef.current = true;
      map.once("idle", () => animateFloodIn("flood-wms", floodOpacity, 1400));
    }
  }, [isFloodLayerEnabled, mapLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Update WMS tiles in-place when URL changes (no teardown)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !isFloodLayerEnabled || !floodSourceAddedRef.current) return;
    const src = map.getSource("flood-wms") as maplibregl.RasterTileSource | undefined;
    if (src) {
      src.setTiles([wmsUrl]);
    }
  }, [wmsUrl, mapLoaded, isFloodLayerEnabled]);

  // ── Basemap switching ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const cfg = BASEMAPS[basemapId];
    const src = map.getSource("esri-satellite") as maplibregl.RasterTileSource | undefined;
    if (src) src.setTiles(cfg.tiles);
    map.setLayoutProperty(
      "esri-labels",
      "visibility",
      cfg.showEsriLabels ? "visible" : "none"
    );
  }, [basemapId, mapLoaded]);

  // ── Update flood opacity without full re-add ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer("flood-wms"))
      map.setPaintProperty("flood-wms", "raster-opacity", floodOpacity);
  }, [floodOpacity, mapLoaded]);

  // ── Compare map — two-instance side-by-side split view ────────────────────
  // Create / destroy a second synchronised MapLibre instance whenever the
  // compare mode toggles.  The compare canvas sits on top of the main canvas
  // and is CSS clip-path'd to the right of the draggable divider.

  useEffect(() => {
    const mainMap  = mapRef.current;
    const container = compareMapContainerRef.current;

    if (!mainMap || !container || !mapLoaded || !isCompareActive) {
      if (compareMapRef.current) {
        compareMapRef.current.remove();
        compareMapRef.current = null;
      }
      return;
    }

    // Build a minimal style for the compare map (same raster basemap + the
    // compare flood WMS).  glyphs / fonts are not needed since we show no text.
    const compareMap = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          "cmp-basemap": {
            type: "raster",
            tiles: BASEMAPS[basemapId].tiles,
            tileSize: 256,
            attribution: "© CARTO © OpenStreetMap contributors",
            maxzoom: 19,
          },
        },
        layers: [{ id: "cmp-basemap", type: "raster", source: "cmp-basemap" }],
      },
      center:  mainMap.getCenter(),
      zoom:    mainMap.getZoom(),
      pitch:   mainMap.getPitch(),
      bearing: mainMap.getBearing(),
      interactive: false,
      attributionControl: false,
    });

    compareMapRef.current = compareMap;
    // Resize after mount so the map fills the container correctly
    setTimeout(() => compareMap.resize(), 0);

    // Keep compare map in sync with every main-map movement
    const syncCompare = () => {
      if (compareMapRef.current !== compareMap) return;
      compareMap.jumpTo({
        center:  mainMap.getCenter(),
        zoom:    mainMap.getZoom(),
        pitch:   mainMap.getPitch(),
        bearing: mainMap.getBearing(),
      });
    };
    mainMap.on("move", syncCompare);

    return () => {
      mainMap.off("move", syncCompare);
      if (compareMapRef.current === compareMap) {
        compareMap.remove();
        compareMapRef.current = null;
      }
    };
  }, [isCompareActive, mapLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update compare WMS source when the compare parameters change
  useEffect(() => {
    const m = compareMapRef.current;
    if (!m || !compareWmsUrl) return;

    const update = () => {
      if (compareMapRef.current !== m) return; // stale closure guard
      if (m.getSource("compare-flood")) {
        (m.getSource("compare-flood") as maplibregl.RasterTileSource).setTiles([compareWmsUrl]);
      } else {
        m.addSource("compare-flood", { type: "raster", tiles: [compareWmsUrl], tileSize: 256 });
        m.addLayer({
          id: "compare-flood",
          type: "raster",
          source: "compare-flood",
          paint: { "raster-opacity": floodOpacity },
        });
      }
    };

    if (m.loaded()) {
      update();
    } else {
      m.on("load", update);
    }
    return () => { m.off("load", update); };
  }, [compareWmsUrl, isCompareActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync compare map opacity with main flood opacity slider
  useEffect(() => {
    const m = compareMapRef.current;
    if (!m?.loaded() || !m.getLayer("compare-flood")) return;
    m.setPaintProperty("compare-flood", "raster-opacity", floodOpacity);
  }, [floodOpacity]);

  // Sync compare map basemap tiles when the user switches basemaps
  useEffect(() => {
    const m = compareMapRef.current;
    if (!m?.loaded()) return;
    const src = m.getSource("cmp-basemap") as maplibregl.RasterTileSource | undefined;
    if (src) src.setTiles(BASEMAPS[basemapId].tiles);
  }, [basemapId]);

  // ── Building data loading ─────────────────────────────────────────────────
  // Cache building GeoJSON per country to avoid re-fetching on island/filter change.
  const buildingCacheRef = useRef<{ country: string; data: FeatureCollection } | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Remove existing building layers when country / island changes
    if (buildingLayersAddedRef.current) {
      if (map.getLayer("buildings-fill"))    map.removeLayer("buildings-fill");
      if (map.getLayer("buildings-outline")) map.removeLayer("buildings-outline");
      if (map.getSource("buildings"))        map.removeSource("buildings");
      buildingLayersAddedRef.current = false;
    }

    const countryConfig = buildingImpactConfig[selectedCountry];
    if (!countryConfig) {
      setRawBuildingData(null);
      setBuildingItems([]);
      return;
    }

    const processData = (data: FeatureCollection) => {
      let features = data.features;

      // Filter by island or cardinal direction bounds
      if (selectedIsland && islandBounds) {
        features = features.filter((f) => featureWithinBounds(f, islandBounds));
      } else if (cardinalDirection && countryConfig.boundsByRegion?.[cardinalDirection]) {
        const b = countryConfig.boundsByRegion[cardinalDirection];
        const bnd: [[number, number], [number, number]] = [
          [b.minLat, b.minLng],
          [b.maxLat, b.maxLng],
        ];
        features = features.filter((f) => featureWithinBounds(f, bnd));
      }

      // Augment with stable IDs and display names
      features = features.map((f, idx) => {
        const rawName =
          typeof f.properties?.Details === "string"
            ? f.properties.Details.split(";")[0].trim()
            : "";
        const name =
          rawName && rawName.toLowerCase() !== "nan"
            ? rawName
            : `Building ${idx + 1}`;
        return {
          ...f,
          properties: {
            ...f.properties,
            __featureId:   String(f.properties?.id ?? `b-${idx + 1}`),
            __featureName: name,
          },
        };
      });

      const options = extractBuildingOptions(features);
      setBuildingSeaLevels(options.seaLevels);
      setBuildingReturnPeriods(options.returnPeriods);
      setRawBuildingData({ ...data, features });
    };

    // Use cached data if same country to avoid re-fetching the GeoJSON
    if (buildingCacheRef.current?.country === selectedCountry) {
      processData(buildingCacheRef.current.data);
    } else {
      fetch(countryConfig.dataPath)
        .then((r) => r.json())
        .then((data: FeatureCollection) => {
          buildingCacheRef.current = { country: selectedCountry, data };
          processData(data);
        })
        .catch((err) => console.error("Building GeoJSON load error:", err));
    }
  }, [selectedCountry, selectedIsland, cardinalDirection, islandBounds, mapLoaded]);

  // ── Render / update building layer ───────────────────────────────────────
  // Runs when raw data arrives or when filter settings change.
  // On first load: creates the MapLibre source + layers + click handler.
  // On filter change: calls setData() with newly coloured features.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!rawBuildingData) {
      // No data — hide layers if they exist
      if (map.getLayer("buildings-fill"))
        map.setLayoutProperty("buildings-fill", "visibility", "none");
      if (map.getLayer("buildings-outline"))
        map.setLayoutProperty("buildings-outline", "visibility", "none");
      return;
    }

    // Pre-compute risk colour and selected loss for each feature
    const coloredFeatures: Feature[] = rawBuildingData.features.map((f) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const maxLoss      = getMaxLoss(props);
      const selectedLoss = getSelectedLoss(props, selectedBuildingSeaLevel, selectedBuildingReturnPeriod) || maxLoss;
      const color        = getRiskColor(selectedLoss, maxLoss || 1, preferences.buildings);
      return {
        ...f,
        properties: {
          ...props,
          __riskColor:    color,
          __selectedLoss: selectedLoss,
          __maxLoss:      maxLoss,
        } as Record<string, unknown>,
      } as Feature;
    });

    const coloredData: FeatureCollection = {
      type: "FeatureCollection",
      features: coloredFeatures,
    };

    // Update sidebar building list
    const items = coloredFeatures.map((f) => {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      return {
        id:      String(p.__featureId ?? ""),
        name:    String(p.__featureName ?? ""),
        useType: String(p.UseType ?? "Other"),
        maxLoss: Number(p.__selectedLoss ?? 0),
      };
    });
    setBuildingItems(items);

    if (buildingLayersAddedRef.current && map.getSource("buildings")) {
      // Layers already exist — just update data (efficient, no flicker)
      (map.getSource("buildings") as GeoJSONSource).setData(coloredData);
      map.setLayoutProperty(
        "buildings-fill",
        "visibility",
        isBuildingLayerVisible ? "visible" : "none"
      );
      map.setLayoutProperty(
        "buildings-outline",
        "visibility",
        isBuildingLayerVisible ? "visible" : "none"
      );
    } else {
      // First time — create source, layers, and register click handler
      map.addSource("buildings", { type: "geojson", data: coloredData });

      map.addLayer(
        {
          id: "buildings-fill",
          type: "fill",
          source: "buildings",
          paint: {
            "fill-color":   ["coalesce", ["get", "__riskColor"], "#888888"],
            "fill-opacity": isBuildingLayerVisible ? 0.6 : 0,
          },
        },
        "esri-labels"
      );

      map.addLayer(
        {
          id: "buildings-outline",
          type: "line",
          source: "buildings",
          paint: {
            "line-color":   ["coalesce", ["get", "__riskColor"], "#888888"],
            "line-width":   1,
            "line-opacity": isBuildingLayerVisible ? 0.8 : 0,
          },
        },
        "esri-labels"
      );

      buildingLayersAddedRef.current = true;

      // Click handler — reads pre-computed properties so no re-registration
      // needed when filter settings change.
      map.on("click", "buildings-fill", (e) => {
        if (!e.features?.length) return;
        const props     = e.features[0].properties as Record<string, unknown>;
        const name      = String(props.__featureName ?? "Building");
        const loss      = Number(props.__selectedLoss ?? 0);
        const maxLoss   = Number(props.__maxLoss ?? 0);
        const color     = String(props.__riskColor ?? "#888");
        const riskInfo  = getRiskLabelForLoss(loss, preferencesRef.current.buildings);

        buildingPopupRef.current?.remove();
        buildingPopupRef.current = new maplibregl.Popup({ maxWidth: "300px" })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px;line-height:1.5;font-family:sans-serif">
              <div style="font-weight:bold;font-size:13px;margin-bottom:4px">🏢 ${name}</div>
              <div style="color:${color};font-weight:600">Risk Level: ${riskInfo.label}</div>
              <div style="color:#555;font-size:11px;margin-top:2px">
                Predicted Loss: <strong>${formatCurrency(loss)}</strong>
                ${maxLoss > loss ? ` &nbsp;(worst-case: ${formatCurrency(maxLoss)})` : ""}
              </div>
              <div style="color:#555;font-size:11px;margin-top:2px">
                Use type: ${String(props.UseType ?? "Unknown")}
              </div>
            </div>`
          )
          .addTo(map);
      });

      map.on("mouseenter", "buildings-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "buildings-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    }
  }, [rawBuildingData, selectedBuildingSeaLevel, selectedBuildingReturnPeriod, preferences, mapLoaded, isBuildingLayerVisible]);

  // ── Toggle building layer visibility ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !buildingLayersAddedRef.current) return;
    const vis = isBuildingLayerVisible ? "visible" : "none";
    if (map.getLayer("buildings-fill"))    map.setLayoutProperty("buildings-fill",    "visibility", vis);
    if (map.getLayer("buildings-outline")) map.setLayoutProperty("buildings-outline", "visibility", vis);
  }, [isBuildingLayerVisible, mapLoaded]);

  // ── Fly to selected building ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!buildingSelectRequest || !map || !mapLoaded || !rawBuildingData) return;
    const feature = rawBuildingData.features.find(
      (f) => String(f.properties?.__featureId) === buildingSelectRequest.id
    );
    if (!feature?.geometry) return;
    const geom = feature.geometry;
    let coords: [number, number][] = [];
    if (geom.type === "Polygon" && geom.coordinates[0])
      coords = geom.coordinates[0] as [number, number][];
    if (geom.type === "MultiPolygon" && geom.coordinates[0]?.[0])
      coords = geom.coordinates[0][0] as [number, number][];
    if (coords.length) {
      const lngs = coords.map((c) => c[0]);
      const lats  = coords.map((c) => c[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { maxZoom: 17, duration: 1500, padding: 80 }
      );
    }
  }, [buildingSelectRequest, mapLoaded, rawBuildingData]);

  // ── Road data loading + rendering ─────────────────────────────────────────
  // Separate data fetching (expensive) from styling updates (cheap).
  const roadCacheRef = useRef<{ country: string; data: FeatureCollection } | null>(null);
  const rawRoadFeaturesRef = useRef<Feature[] | null>(null);

  // Effect: Fetch road GeoJSON only when country/island/visibility changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Remove existing road layer
    if (roadLayersAddedRef.current) {
      if (map.getLayer("roads"))  map.removeLayer("roads");
      if (map.getSource("roads")) map.removeSource("roads");
      roadLayersAddedRef.current = false;
    }
    setRawRoadData(null);
    rawRoadFeaturesRef.current = null;

    if (!isRoadLayerVisible) return;

    const countryConfig = roadImpactConfig[selectedCountry];
    if (!countryConfig) return;

    const setupRoadLayer = (data: FeatureCollection) => {
      let features = data.features;
      if (selectedIsland && islandBounds) {
        features = features.filter((f) => featureWithinBounds(f, islandBounds));
      }
      rawRoadFeaturesRef.current = features;

      // Pre-compute road colours
      const coloredFeatures = features.map((f) => {
        const props = (f.properties ?? {}) as Record<string, unknown>;
        const loss  = getRoadMetric(props, roadSeaLevel, roadReturnPeriod, "Loss");
        const depth = getRoadMetric(props, roadSeaLevel, roadReturnPeriod, "Depth");
        const color = loss > 0 ? getRiskColor(loss, 2000, preferences.roads) : "#555555";
        return { ...f, properties: { ...props, __riskColor: color, __roadLoss: loss, __roadDepth: depth } };
      });

      const coloredData: FeatureCollection = { type: "FeatureCollection", features: coloredFeatures };
      setRawRoadData(coloredData);

      map.addSource("roads", { type: "geojson", data: coloredData });
      map.addLayer(
        {
          id: "roads",
          type: "line",
          source: "roads",
          paint: {
            "line-color":   ["coalesce", ["get", "__riskColor"], "#555555"],
            "line-width":   4,
            "line-opacity": roadOpacity,
          },
        },
        "esri-labels"
      );

      roadLayersAddedRef.current = true;

      map.on("click", "roads", (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties as Record<string, unknown>;
        const loss  = Number(props.__roadLoss   ?? 0);
        const depth = Number(props.__roadDepth  ?? 0);
        roadPopupRef.current?.remove();
        roadPopupRef.current = new maplibregl.Popup({ maxWidth: "280px" })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:sans-serif;font-size:12px;min-width:150px">
              <strong style="font-size:13px">${String(props.Asset ?? "")}</strong>
              ${props.Details ? `<br/><span style="color:#666">${String(props.Details)}</span>` : ""}
              <hr style="margin:6px 0;border:0;border-top:1px solid #ccc"/>
              <div><strong>Use:</strong> ${String(props.UseType ?? "")}</div>
              <div><strong>Size:</strong> ${props.Size != null ? String(props.Size) : "N/A"}</div>
              <div><strong>Loss:</strong> $${Math.round(loss).toLocaleString()}K</div>
              <div><strong>Depth:</strong> ${depth ? depth + "m" : "0m"}</div>
              <div style="margin-top:8px;font-size:11px;color:#555;border-top:1px solid #eee;padding-top:4px">
                Return period of 100 years on ${roadSeaLevel}cm sea level rise
              </div>
            </div>`
          )
          .addTo(map);
      });

      map.on("mouseenter", "roads", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "roads", () => { map.getCanvas().style.cursor = "";        });
    };

    // Use cached data if same country (avoid network re-fetch)
    if (roadCacheRef.current?.country === selectedCountry) {
      setupRoadLayer(roadCacheRef.current.data);
    } else {
      fetch(countryConfig.dataPath)
        .then((r) => r.json())
        .then((data: FeatureCollection) => {
          roadCacheRef.current = { country: selectedCountry, data };
          setupRoadLayer(data);
        })
        .catch((err) => console.error("Road GeoJSON load error:", err));
    }
  }, [selectedCountry, selectedIsland, islandBounds, isRoadLayerVisible, mapLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect: Update road colors when filter settings change (no re-fetch!)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !roadLayersAddedRef.current || !rawRoadFeaturesRef.current) return;

    const features = rawRoadFeaturesRef.current;
    const coloredFeatures = features.map((f) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const loss  = getRoadMetric(props, roadSeaLevel, roadReturnPeriod, "Loss");
      const depth = getRoadMetric(props, roadSeaLevel, roadReturnPeriod, "Depth");
      const color = loss > 0 ? getRiskColor(loss, 2000, preferences.roads) : "#555555";
      return { ...f, properties: { ...props, __riskColor: color, __roadLoss: loss, __roadDepth: depth } };
    });
    const coloredData: FeatureCollection = { type: "FeatureCollection", features: coloredFeatures };
    setRawRoadData(coloredData);
    (map.getSource("roads") as GeoJSONSource)?.setData(coloredData);
  }, [roadSeaLevel, roadReturnPeriod, preferences, mapLoaded]);

  // ── Road opacity update ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer("roads"))
      map.setPaintProperty("roads", "line-opacity", roadOpacity);
  }, [roadOpacity, mapLoaded]);

  // ── Fly to selected road ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!roadSelectRequest || !map || !mapLoaded || !rawRoadData) return;
    const feature = rawRoadData.features[roadSelectRequest.id];
    if (!feature?.geometry) return;
    const geom = feature.geometry;
    let coords: [number, number][] = [];
    if (geom.type === "LineString")      coords = geom.coordinates as [number, number][];
    if (geom.type === "MultiLineString") coords = (geom.coordinates as [number, number][][]).flat();
    if (coords.length) {
      const lngs = coords.map((c) => c[0]);
      const lats  = coords.map((c) => c[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { maxZoom: 17, duration: 1500, padding: 50 }
      );
    }
  }, [roadSelectRequest, mapLoaded, rawRoadData]);

  // ── Camera pitch control ──────────────────────────────────────────────────
  const handlePitchChange = (value: number) => {
    setPitch(value);
    mapRef.current?.easeTo({ pitch: value });
  };

  // ── Compare slider drag handler ───────────────────────────────────────────
  const handleCompareSliderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = compareSliderContainerRef.current;
    if (!container) return;
    const onMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const pct = Math.max(0, Math.min(ev.clientX - rect.left, rect.width)) / rect.width;
      setCompareSliderPos(pct);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.appContainer}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {initialCountry && countryFlagMap[initialCountry] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/dataset/${countryCodeMap[initialCountry] || initialCountry}/${countryCodeMap[initialCountry] || initialCountry}.png`}
              alt={`${countryFlagMap[initialCountry].name} flag`}
              style={{ height: "32px", width: "auto", borderRadius: "3px", boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }}
            />
          )}
          <h1 className={styles.title}>PARTNER2 SLR</h1>
          {initialCountry && countryFlagMap[initialCountry] && (
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: 500 }}>
              — {countryFlagMap[initialCountry].name}
            </span>
          )}
          {/* Engine badge so it's obvious which map is active */}
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px", marginLeft: "4px" }}>
            [MapLibre GL]
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className={styles.mainContent} style={{ position: "relative" }}>
        <LeftSidebar
          isFloodLayerEnabled={isFloodLayerEnabled}
          setIsFloodLayerEnabled={setIsFloodLayerEnabled}
          selectedCountry={selectedCountry}
          onCountryChange={handleCountryChange}
          lockedCountry={initialCountry}
          cardinalDirection={cardinalDirection}
          onCardinalDirectionChange={handleCardinalDirectionChange}
          selectedIsland={selectedIsland}
          onIslandChange={handleIslandChange}
          selectedReturnPeriod={returnPeriod}
          onReturnPeriodChange={setReturnPeriod}
          selectedSeaLevel={seaLevel}
          onSeaLevelChange={setSeaLevel}
          onIslandBoundsChange={setIslandBounds}
          floodOpacity={floodOpacity}
          onFloodOpacityChange={setFloodOpacity}
          compareEnabled={compareEnabled}
          onCompareEnabledChange={setCompareEnabled}
          compareReturnPeriod={compareReturnPeriod}
          onCompareReturnPeriodChange={setCompareReturnPeriod}
          compareSeaLevel={compareSeaLevel}
          onCompareSeaLevelChange={setCompareSeaLevel}
          onAvailableSeaLevelsChange={setAvailableSeaLevels}
        />

        {/* Map viewport */}
        <div ref={compareSliderContainerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* MapLibre primary canvas container */}
          <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

          {/* Compare map canvas — always in DOM so the ref is stable;
              clipped to the right of the compare divider when active */}
          <div
            ref={compareMapContainerRef}
            style={{
              position: "absolute",
              inset: 0,
              clipPath: isCompareActive
                ? `inset(0 0 0 ${compareSliderPos * 100}%)`
                : undefined,
              visibility: isCompareActive ? "visible" : "hidden",
              pointerEvents: "none",
            }}
          />

          {/* Compare divider — draggable vertical split line */}
          {isCompareActive && (
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${compareSliderPos * 100}%`,
                width: "4px",
                marginLeft: "-2px",
                background: "rgba(255,255,255,0.9)",
                boxShadow: "0 0 10px rgba(0,0,0,0.5)",
                cursor: "ew-resize",
                zIndex: 20,
                userSelect: "none",
              }}
              onMouseDown={handleCompareSliderMouseDown}
            >
              {/* Drag handle circle */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.95)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  cursor: "ew-resize",
                  color: "#555",
                  border: "2px solid rgba(0,0,0,0.1)",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                ⇔
              </div>
            </div>
          )}

          {/* Story overlay (flood layer info bar) */}
          {/* key forces remount on every step so CSS animations restart */}
          <StoryOverlay
            key={`${seaLevel}-${returnPeriod}`}
            isFloodLayerEnabled={isFloodLayerEnabled}
            returnPeriod={returnPeriod}
            seaLevel={seaLevel}
            isCompareActive={isCompareActive}
            compareReturnPeriod={compareReturnPeriod}
            compareSeaLevel={compareSeaLevel}
            availableSeaLevels={availableSeaLevels}
          />

          {/* ── Basemap switcher — top-left ─────────────────────────────── */}
          <div className={styles.basemapSwitcher}>
            {BASEMAP_ORDER.map((id) => {
              const cfg = BASEMAPS[id];
              return (
                <button
                  key={id}
                  className={`${styles.basemapBtn}${
                    basemapId === id ? ` ${styles.basemapBtnActive}` : ""
                  }`}
                  onClick={() => setBasemapId(id)}
                  title={cfg.description}
                >
                  <span className={styles.basemapBtnIcon}>{cfg.icon}</span>
                  <span className={styles.basemapBtnLabel}>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Camera tilt / pitch control ──────────────────────────────── */}
          <div className={styles.tiltControl}>
            <button
              onClick={() => handlePitchChange(0)}
              title="Flat 2D view"
              style={{
                background: pitch < 10 ? "#4fc3f7" : "#3a3b40",
                color: pitch < 10 ? "#000" : "#fff",
              }}
            >
              2D
            </button>

            <input
              type="range"
              min={0}
              max={85}
              step={5}
              value={pitch}
              onChange={(e) => handlePitchChange(Number(e.target.value))}
              title={`Camera tilt: ${pitch}°`}
              aria-label="Camera tilt"
            />

            <button
              onClick={() => handlePitchChange(60)}
              title="3D perspective view"
              style={{
                background: pitch >= 50 ? "#4fc3f7" : "#3a3b40",
                color: pitch >= 50 ? "#000" : "#fff",
              }}
            >
              3D
            </button>

            <span
              style={{
                fontSize: "10px", color: "#aaa",
                minWidth: "28px", textAlign: "center",
              }}
            >
              {pitch}°
            </span>
          </div>
          {/* ──────────────────────────────────────────────────────────────── */}

          <MapLegend
            isFloodLayerEnabled={isFloodLayerEnabled}
            isRoadLayerVisible={isRoadLayerVisible}
          />
        </div>

        <FilterSidebar
          isFloodLayerEnabled={isFloodLayerEnabled}
          setIsFloodLayerEnabled={setIsFloodLayerEnabled}
          selectedCountry={selectedCountry}
          onCountryChange={handleCountryChange}
          cardinalDirection={cardinalDirection}
          onCardinalDirectionChange={handleCardinalDirectionChange}
          selectedIsland={selectedIsland}
          onIslandChange={handleIslandChange}
          selectedReturnPeriod={returnPeriod}
          onReturnPeriodChange={setReturnPeriod}
          selectedSeaLevel={seaLevel}
          onSeaLevelChange={setSeaLevel}
          islandBounds={islandBounds}
          onIslandBoundsChange={setIslandBounds}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          isBuildingLayerVisible={isBuildingLayerVisible}
          onBuildingLayerToggle={setIsBuildingLayerVisible}
          buildingItems={buildingItems}
          isRoadLayerVisible={isRoadLayerVisible}
          onRoadLayerToggle={setIsRoadLayerVisible}
          roadSeaLevel={roadSeaLevel}
          onRoadSeaLevelChange={setRoadSeaLevel}
          roadReturnPeriod={roadReturnPeriod}
          onRoadReturnPeriodChange={setRoadReturnPeriod}
          roadOpacity={roadOpacity}
          onRoadOpacityChange={setRoadOpacity}
          buildingSeaLevels={buildingSeaLevels}
          buildingReturnPeriods={buildingReturnPeriods}
          selectedBuildingSeaLevel={selectedBuildingSeaLevel}
          onBuildingSeaLevelChange={setSelectedBuildingSeaLevel}
          selectedBuildingReturnPeriod={selectedBuildingReturnPeriod}
          onBuildingReturnPeriodChange={setSelectedBuildingReturnPeriod}
          onBuildingSelect={handleBuildingSelect}
          onRoadSelect={handleRoadSelect}
          showFilters={false}
          title="Impact"
        />
      </div>
    </div>
  );
}
