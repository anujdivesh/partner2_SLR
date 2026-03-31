"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, LayersControl, WMSTileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import FilterSidebar from "./FilterSidebar";
import LeftSidebar from "./LeftSidebar";
import SideBySideControl from "./SideBySideControl";
import MapScreenshotButton from "./MapScreenshotButton";
import MapLegend from "./MapLegend";
import CookIslandsBuildingViewer, { buildingImpactCountries } from "./CookIslandsBuildingViewer";
import RoadNetworkViewer from "./RoadNetworkViewer";
import styles from './MapClient.module.css';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

const cookIslandsBounds: { [key: string]: [[number, number], [number, number]] } = {
  'northern_cook_islands': [[-14.0, -166.0], [-8.0, -157.0]],
  'southern_cook_islands': [[-23.0, -160.0], [-18.0, -155.0]],
};

// Map 2-letter codes to 3-letter API codes
const countryCodeMap: { [key: string]: string } = {
  'CK': 'COK',
  'TO': 'TON',
  'TV': 'TUV',
  'VU': 'VUT',
  'WS': 'WSM',
  'FJ': 'FJI',
  'MH': 'MHL', // Marshall Islands: use MHL for static assets
  'NU': 'NIU',
  'PW': 'PLW',
  'NR': 'NRU',
  'SB': 'SLB',
  'KI': 'KIR',
  'FM': 'FSM',
  'PN': 'PCN',
  'AS': 'ASM',
  'WF': 'WLF',
  'NC': 'NCL',
  'TK': 'TKL',
  'PF': 'PYF',
  'MP': 'MNP',
  'GU': 'GUM',
  'PG': 'PNG',
};

const normalizeLongitude = (lng: number) => {
  const normalized = ((lng + 180) % 360 + 360) % 360 - 180;
  return normalized;
};

const normalizeBounds = (
  south: number,
  west: number,
  north: number,
  east: number
): [[number, number], [number, number]] => {
  const normWest = normalizeLongitude(west);
  const normEast = normalizeLongitude(east);
  return [[south, normWest], [north, normEast]];
};

const isDatelineCrossing = (bounds: [[number, number], [number, number]]) => {
  return bounds[0][1] > bounds[1][1];
};

const getAdjustedBounds = (bounds: [[number, number], [number, number]]) => {
  const [[south, west], [north, east]] = bounds;
  if (!isDatelineCrossing(bounds)) {
    return L.latLngBounds([south, west], [north, east]);
  }
  return L.latLngBounds([south, west], [north, east + 360]);
};

const getBoundsCenter = (bounds: [[number, number], [number, number]]) => {
  const [[south, west], [north, east]] = bounds;
  const adjustedEast = isDatelineCrossing(bounds) ? east + 360 : east;
  const centerLat = (south + north) / 2;
  const centerLng = normalizeLongitude((west + adjustedEast) / 2);
  return [centerLat, centerLng] as [number, number];
};

const defaultCenter: [number, number] = [-8, normalizeLongitude(-180.6947)];

const countryFlagMap: Record<string, { name: string }> = {
  CK: { name: "Cook Islands" },
  MH: { name: "Marshall Islands" },
  TO: { name: "Tonga" },
  TV: { name: "Tuvalu" },
  VU: { name: "Vanuatu" },
  WS: { name: "Samoa" },
  FJ: { name: "Fiji" },
};

// Component to handle map view updates
function MapViewController({ 
  selectedCountry, 
  cardinalDirection, 
  islandBounds,
  isSidebarCollapsed,
  countryBounds
}: { 
  selectedCountry: string, 
  cardinalDirection: string, 
  islandBounds: [[number, number], [number, number]] | null,
  isSidebarCollapsed: boolean,
  countryBounds: { [key: string]: [[number, number], [number, number]] }
}) {
  const map = useMap();
  
  // Handle layout changes when sidebar collapses/expands
  useEffect(() => {
    map.invalidateSize();
    const times = [50, 100, 200, 300];
    const timeouts = times.map(t => setTimeout(() => map.invalidateSize(), t));
    return () => { timeouts.forEach(t => clearTimeout(t)); };
  }, [isSidebarCollapsed, map]);

  useEffect(() => {
    try {
      if (!map || typeof (map as any).getSize !== "function") return;
      const size = map.getSize();
      if (!size || !size.x) {
        map.invalidateSize();
        setTimeout(() => map.invalidateSize(), 120);
      }

      const apiCode = countryCodeMap[selectedCountry] || selectedCountry;

      if (islandBounds) {
        const adjusted = getAdjustedBounds(islandBounds);
        const center = getBoundsCenter(islandBounds);
        const zoom = Math.min(map.getBoundsZoom(adjusted), 15);
        map.flyTo(center, zoom, { duration: 1.5 });
      } else if (selectedCountry === 'CK' && cardinalDirection && cookIslandsBounds[cardinalDirection]) {
        const bounds = cookIslandsBounds[cardinalDirection];
        const adjusted = getAdjustedBounds(bounds);
        const center = getBoundsCenter(bounds);
        const zoom = Math.min(map.getBoundsZoom(adjusted), 5);
        map.flyTo(center, zoom, { duration: 1.5 });
      } else if (selectedCountry && countryBounds[apiCode]) {
        const bounds = countryBounds[apiCode];
        const adjusted = getAdjustedBounds(bounds);
        const center = getBoundsCenter(bounds);
        const zoom = Math.min(map.getBoundsZoom(adjusted), 5);
        map.flyTo(center, zoom, { duration: 1.5 });
      } else {
        map.flyTo(defaultCenter, 5, { duration: 1.5 });
      }
    } catch (err) {
      console.warn("MapViewController useEffect error:", err);
    }
  }, [selectedCountry, cardinalDirection, islandBounds, map, countryBounds]);
  
  return null;
} 

// Helper component for smooth WMS transitions
function TransitioningWMSTileLayer({ url, ...props }: { url: string } & React.ComponentProps<typeof WMSTileLayer>) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [previousUrl, setPreviousUrl] = useState<string | null>(null);

  useEffect(() => {
    if (url !== currentUrl) {
      setPreviousUrl(currentUrl);
      setCurrentUrl(url);
      
      const timer = setTimeout(() => {
        setPreviousUrl(null);
      }, 1500); 
      return () => clearTimeout(timer);
    }
  }, [url, currentUrl]);

  return (
    <>
      {previousUrl && (
        <WMSTileLayer
          key={previousUrl}
          url={previousUrl}
          {...props}
        />
      )}
      <WMSTileLayer
        key={currentUrl}
        url={currentUrl}
        {...props}
      />
    </>
  );
}

// Story Overlay — hoisted outside MapClient to avoid recreation on every render
function StoryOverlay({
  returnPeriod,
  seaLevel,
  isFloodLayerEnabled,
  isCompareActive,
  compareReturnPeriod,
  compareSeaLevel,
}: {
  returnPeriod: string;
  seaLevel: string;
  isFloodLayerEnabled: boolean;
  isCompareActive: boolean;
  compareReturnPeriod: string;
  compareSeaLevel: string;
}) {
  if (!returnPeriod || !seaLevel || !isFloodLayerEnabled) return null;
  const rpLabel = returnPeriod.replace(/ARI/i, '') + ' Year';
  const compareRpLabel = compareReturnPeriod ? compareReturnPeriod.replace(/ARI/i, '') + ' Year' : '';
  return (
    <div className="leaflet-top leaflet-left" style={{ 
      top: '10px', left: '50%', transform: 'translateX(-50%)',
      position: 'absolute', zIndex: 1000, pointerEvents: 'none'
    }}>
      <div style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)', padding: '10px 20px',
        borderRadius: '20px', color: 'white', backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255,255,255,0.2)', textAlign: 'center',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)', pointerEvents: 'auto',
        minWidth: isCompareActive ? '320px' : undefined,
      }}>
        {isCompareActive ? (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '12px' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '2px' }}>Left</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold' }}><span style={{ color: '#4fc3f7' }}>{rpLabel}</span> Event</div>
              <div style={{ fontSize: '11px', marginTop: '2px' }}><span style={{ color: '#ffb74d' }}>{seaLevel}m</span> SLR</div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.3)', flexShrink: 0, alignSelf: 'stretch' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.6, pointerEvents: 'none' }}>vs</div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '2px' }}>Right</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold' }}><span style={{ color: '#4fc3f7' }}>{compareRpLabel}</span> Event</div>
              <div style={{ fontSize: '11px', marginTop: '2px' }}><span style={{ color: '#ffb74d' }}>{compareSeaLevel}m</span> SLR</div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '2px' }}>Current Projection</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Flood Depth at <span style={{ color: '#4fc3f7' }}>{rpLabel}</span> Event</div>
            <div style={{ fontSize: '12px', marginTop: '2px' }}>with <span style={{ color: '#ffb74d' }}>{seaLevel}m</span> Sea Level Rise</div>
          </>
        )}
      </div>
    </div>
  );
}

export default function MapClient({ initialCountry }: { initialCountry?: string } = {}) {
  const [isFloodLayerEnabled, setIsFloodLayerEnabled] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string>(initialCountry || '');
  const [cardinalDirection, setCardinalDirection] = useState<string>('');
  const [selectedIsland, setSelectedIsland] = useState<string>('');
  const [returnPeriod, setReturnPeriod] = useState<string>('100');
  const [seaLevel, setSeaLevel] = useState<string>('0.1');
  const [islandBounds, setIslandBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [countryBounds, setCountryBounds] = useState<{ [key: string]: [[number, number], [number, number]] }>({});
  const [isBuildingLayerVisible, setIsBuildingLayerVisible] = useState(true);
  const [buildingItems, setBuildingItems] = useState<
    { id: string; name: string; useType: string; maxLoss: number }[]
  >([]);
  const [buildingSeaLevels, setBuildingSeaLevels] = useState<string[]>([]);
  const [buildingReturnPeriods, setBuildingReturnPeriods] = useState<string[]>([]);
  const [selectedBuildingSeaLevel, setSelectedBuildingSeaLevel] = useState<string>("");
  const [selectedBuildingReturnPeriod, setSelectedBuildingReturnPeriod] = useState<string>("");
  const [buildingSelectRequest, setBuildingSelectRequest] = useState<
    { id: string; nonce: number } | null
  >(null);

  const [isRoadLayerVisible, setIsRoadLayerVisible] = useState(false);
  const [roadSeaLevel, setRoadSeaLevel] = useState<number>(0);
  const [roadReturnPeriod, setRoadReturnPeriod] = useState<number>(100);
  const [roadSelectRequest, setRoadSelectRequest] = useState<{ id: number; nonce: number } | null>(null);

  const [floodOpacity, setFloodOpacity] = useState(0.8);
  const [roadOpacity, setRoadOpacity] = useState(0.8);

  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareReturnPeriod, setCompareReturnPeriod] = useState<string>('');
  const [compareSeaLevel, setCompareSeaLevel] = useState<string>('');

  // ── Stable handler references (useCallback) ──────────────────────────────
  const handleRoadSelect = useCallback((id: number) => {
    setRoadSelectRequest({ id, nonce: Date.now() });
  }, []);


  const handleBuildingOptionsLoaded = useCallback(
    ({ seaLevels, returnPeriods }: { seaLevels: string[]; returnPeriods: string[] }) => {
      setBuildingSeaLevels(seaLevels);
      setBuildingReturnPeriods(returnPeriods);
    },
    []
  );

  // Fetch country bounds from API
  useEffect(() => {
    fetch('https://ocean-middleware.spc.int/middleware/api/country/')
      .then(response => response.json())
      .then(data => {
        const bounds: { [key: string]: [[number, number], [number, number]] } = {};
        data.forEach((country: any) => {
          bounds[country.short_name] = normalizeBounds(
            country.south_bound_latitude,
            country.west_bound_longitude,
            country.north_bound_latitude,
            country.east_bound_longitude
          );
        });
        setCountryBounds(bounds);
      })
      .catch(error => console.error('Error loading country bounds:', error));
  }, []);

  const handleCountryChange = useCallback((country: string) => {
    setSelectedCountry(country);
    setCardinalDirection('');
    setSelectedIsland('');
    setIslandBounds(null);
  }, []);

  const handleCardinalDirectionChange = useCallback((direction: string) => {
    setCardinalDirection(direction);
    setSelectedIsland('');
    setIslandBounds(null);
  }, []);

  const handleIslandChange = useCallback((island: string) => {
    setSelectedIsland(island);
    setIslandBounds(null);
  }, []);

  useEffect(() => {
    if (!buildingImpactCountries.includes(selectedCountry)) {
      setBuildingItems([]);
      setBuildingSelectRequest(null);
      setBuildingSeaLevels([]);
      setBuildingReturnPeriods([]);
      setSelectedBuildingSeaLevel("");
      setSelectedBuildingReturnPeriod("");
    }
  }, [selectedCountry]);

  useEffect(() => {
    if (selectedIsland) {
      setIsFloodLayerEnabled(true);
    } else {
      setIsFloodLayerEnabled(false);
      setCompareEnabled(false);
    }
  }, [selectedIsland]);

  useEffect(() => {
    if (buildingSeaLevels.length > 0) {
      if (!selectedBuildingSeaLevel || !buildingSeaLevels.includes(selectedBuildingSeaLevel)) {
        setSelectedBuildingSeaLevel(buildingSeaLevels[0]);
      }
    }
  }, [buildingSeaLevels, selectedBuildingSeaLevel]);

  useEffect(() => {
    if (buildingReturnPeriods.length > 0) {
      if (!selectedBuildingReturnPeriod || !buildingReturnPeriods.includes(selectedBuildingReturnPeriod)) {
        setSelectedBuildingReturnPeriod(buildingReturnPeriods[0]);
      }
    }
  }, [buildingReturnPeriods, selectedBuildingReturnPeriod]);

  const handleBuildingSelect = useCallback((id: string) => {
    setBuildingSelectRequest({ id, nonce: Date.now() });
  }, []);

  const country = selectedCountry || 'CK';
  const island = selectedIsland || (country === 'CK' ? 'manihiki' : '');

  // Use 'RMI' for Marshall Islands in WMS/data paths
  let wmsCountry = country;
  if (country === 'MH' || country === 'MHL' || country === 'RMI') {
    wmsCountry = 'RMI';
  }

  const isCompareActive = compareEnabled && !!compareReturnPeriod && !!compareSeaLevel;

  // Memoise WMS URLs to avoid recalculating every render
  const wmsUrl = useMemo(() => {
    const cdp = cardinalDirection ? `${cardinalDirection}/` : '';
    const cp = wmsCountry === 'WS' ? '' : 'Coastal/';
    const inf = island.replace('_province', '');
    return `https://gemthreddshpc.spc.int/thredds/wms/POP/Partner2/SLR/${wmsCountry}/${cp}${cdp}${island}/FloodDepth_${inf}_${returnPeriod}_${seaLevel}.nc`;
  }, [wmsCountry, cardinalDirection, island, returnPeriod, seaLevel]);

  const compareWmsUrl = useMemo(() => {
    const cdp = cardinalDirection ? `${cardinalDirection}/` : '';
    const cp = wmsCountry === 'WS' ? '' : 'Coastal/';
    const inf = island.replace('_province', '');
    return `https://gemthreddshpc.spc.int/thredds/wms/POP/Partner2/SLR/${wmsCountry}/${cp}${cdp}${island}/FloodDepth_${inf}_${compareReturnPeriod}_${compareSeaLevel}.nc`;
  }, [wmsCountry, cardinalDirection, island, compareReturnPeriod, compareSeaLevel]);

  // Stable WMS params object
  const wmsBaseParams = useMemo(() => ({
    layers: 'Depth',
    styles: 'default-scalar/x-Sst',
    format: 'image/png',
    transparent: true,
    version: '1.3.0',
    time: '2022-06-14T00:00:00.000Z',
    COLORSCALERANGE: '0,2.337',
  }), []);

  return (
    <div className={styles.appContainer}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {initialCountry && countryFlagMap[initialCountry] && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/dataset/${countryCodeMap[initialCountry] || initialCountry}/${countryCodeMap[initialCountry] || initialCountry}.png`}
                alt={`${countryFlagMap[initialCountry].name} flag`}
                style={{ height: '32px', width: 'auto', borderRadius: '3px', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
              />
            </>
          )}
          <h1 className={styles.title}>PARTNER2 SLR</h1>
          {initialCountry && countryFlagMap[initialCountry] && (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px', fontWeight: 500 }}>
              — {countryFlagMap[initialCountry].name}
            </span>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className={styles.mainContent} style={{ position: 'relative' }}>
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
        />
        <StoryOverlay
          returnPeriod={returnPeriod}
          seaLevel={seaLevel}
          isFloodLayerEnabled={isFloodLayerEnabled}
          isCompareActive={isCompareActive}
          compareReturnPeriod={compareReturnPeriod}
          compareSeaLevel={compareSeaLevel}
        />
        <MapContainer
          className={styles.mapContainer}
          center={defaultCenter}
          zoom={5}
          scrollWheelZoom={true}
          attributionControl={false}
        >
        <MapViewController 
          selectedCountry={selectedCountry} 
          cardinalDirection={cardinalDirection} 
          islandBounds={islandBounds} 
          isSidebarCollapsed={isSidebarCollapsed}
          countryBounds={countryBounds}
        />
        <CookIslandsBuildingViewer
          selectedCountry={selectedCountry}
          selectedIsland={selectedIsland}
          cardinalDirection={cardinalDirection}
          islandBounds={islandBounds}
          onBuildingDataLoaded={setBuildingItems}
          onBuildingOptionsLoaded={handleBuildingOptionsLoaded}
          selectedBuildingSeaLevel={selectedBuildingSeaLevel}
          selectedBuildingReturnPeriod={selectedBuildingReturnPeriod}
          buildingSelectRequest={buildingSelectRequest}
        />
        {isRoadLayerVisible && (
          <RoadNetworkViewer
            selectedCountry={selectedCountry}
            selectedSeaLevel={roadSeaLevel}
            selectedReturnPeriod={roadReturnPeriod}
            selectedIsland={selectedIsland}
            islandBounds={islandBounds}
            roadSelectRequest={roadSelectRequest}
            roadOpacity={roadOpacity}
          />
        )}
        <LayersControl position="topright">
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> SPC'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite" checked>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution=''
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution=' &copy; Pacific Community SPC'
          pane="overlayPane"
        />
        {/* Normal single flood layer — hidden when side-by-side is active */}
        {isFloodLayerEnabled && !isCompareActive && (
          <TransitioningWMSTileLayer
            url={wmsUrl}
            pane="overlayPane"
            zIndex={650}
            opacity={floodOpacity}
            params={{
              layers: 'Depth',
              styles: 'default-scalar/x-Sst',
              format: 'image/png',
              transparent: true,
              version: '1.3.0',
              time: '2022-06-14T00:00:00.000Z',
              COLORSCALERANGE: '0,2.337'
            } as any}
          />
        )}
        {/* Side-by-side comparison control */}
        {isFloodLayerEnabled && (
          <SideBySideControl
            enabled={isCompareActive}
            leftUrl={wmsUrl}
            rightUrl={compareWmsUrl}
            wmsParams={wmsBaseParams}
            opacity={floodOpacity}
          />
        )}
        <MapLegend isFloodLayerEnabled={isFloodLayerEnabled} isRoadLayerVisible={isRoadLayerVisible} />
        <MapScreenshotButton />
        </MapContainer>
        
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
