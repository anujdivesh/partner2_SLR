"use client";

import React, { useEffect, useState, useCallback } from "react";
import { FaPlay, FaPause } from "react-icons/fa";
import styles from './FilterSidebar.module.css';

// Simple fetch cache to avoid re-fetching the same catalog XML on re-mount or duplicate instances
const fetchCache = new Map<string, Promise<string[]>>();

function cachedFetchCatalogRefs(url: string): Promise<string[]> {
  if (fetchCache.has(url)) return fetchCache.get(url)!;
  const p = fetchCatalogRefs(url);
  fetchCache.set(url, p);
  // Evict after 60s so stale data doesn't persist
  setTimeout(() => fetchCache.delete(url), 60_000);
  return p;
}

const datasetCache = new Map<string, Promise<string[]>>();

function cachedFetchDatasets(url: string): Promise<string[]> {
  if (datasetCache.has(url)) return datasetCache.get(url)!;
  const p = fetchDatasets(url);
  datasetCache.set(url, p);
  setTimeout(() => datasetCache.delete(url), 60_000);
  return p;
}

interface FilterSidebarTopProps {
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
  // When set, hides the country picker (country is locked from the URL)
  lockedCountry?: string;
  /** Bubble up the available sea-level list so the map can show a progress bar */
  onAvailableSeaLevelsChange?: (levels: string[]) => void;
}

const countryMapping = (country: string) => {
  if (country === 'CK') return 'Cook Islands';
  if (country === 'TO') return 'Tonga';
  if (country === 'TV') return 'Tuvalu';
  if (country === 'VU') return 'Vanuatu';
  if (country === 'WS') return 'Samoa';
  if (country === 'FJ') return 'Fiji';
  return country;
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

async function fetchCatalogRefs(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const xmlText = await res.text();

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  const refs = Array.from(xmlDoc.getElementsByTagName('catalogRef'));

  return refs
    .map((ref) => ref.getAttribute('name') || '')
    .filter(Boolean) as string[];
}

async function fetchDatasets(url: string): Promise<string[]> {
    const res = await fetch(url);
    if (!res.ok) return [];
    const xmlText = await res.text();
  
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  
    const datasets = Array.from(xmlDoc.getElementsByTagName('dataset'));
  
    return datasets
      .map((d) => d.getAttribute('name') || '')
      .filter((name) => name.endsWith('.nc') && name.startsWith('FloodDepth_') && !name.includes('_CRS'));
}

async function fetchWMSBounds(wmsUrl: string): Promise<[[number, number], [number, number]] | null> {
    const capsUrl = `${wmsUrl}?service=WMS&version=1.3.0&request=GetCapabilities`;
    try {
        const res = await fetch(capsUrl);
        if(!res.ok) return null;
        const text = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const box = doc.querySelector('EX_GeographicBoundingBox');
        if(box) {
            const west = parseFloat(box.querySelector('westBoundLongitude')?.textContent || '0');
            const east = parseFloat(box.querySelector('eastBoundLongitude')?.textContent || '0');
            const south = parseFloat(box.querySelector('southBoundLatitude')?.textContent || '0');
            const north = parseFloat(box.querySelector('northBoundLatitude')?.textContent || '0');
            return normalizeBounds(south, west, north, east);
        }
        return null;
    } catch(e) {
        console.error("Error fetching bounds", e);
        return null;
    }
}

const FilterSidebarTop = React.memo(function FilterSidebarTop({ 
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
  floodOpacity = 0.8,
  onFloodOpacityChange,
  compareEnabled,
  onCompareEnabledChange,
  compareReturnPeriod,
  onCompareReturnPeriodChange,
  compareSeaLevel,
  onCompareSeaLevelChange,
  lockedCountry,
  onAvailableSeaLevelsChange,
}: FilterSidebarTopProps) {
  const [countries, setCountries] = useState<string[]>([]);
  const [islands, setIslands] = useState<string[]>([]);
  const [availableReturnPeriods, setAvailableReturnPeriods] = useState<string[]>([]);
  const [availableSeaLevels, setAvailableSeaLevels] = useState<string[]>([]);
  const [activeMenu, setActiveMenu] = useState<'country' | 'region' | 'island' | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCountriesLoading, setIsCountriesLoading] = useState(false);
  const [isIslandsLoading, setIsIslandsLoading] = useState(false);

  // Animation Loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
        // Current Indices
        const currentRpIdx = availableReturnPeriods.indexOf(selectedReturnPeriod || '');
        const currentSlIdx = availableSeaLevels.indexOf(selectedSeaLevel || '');

        let nextSlIdx = currentSlIdx + 1;
        let nextRpIdx = currentRpIdx;

        // Advance Sea Level first
        if (nextSlIdx >= availableSeaLevels.length) {
            nextSlIdx = 0;
            // Then Advance Return Period
            nextRpIdx = currentRpIdx + 1;
            
            if (nextRpIdx >= availableReturnPeriods.length) {
                nextRpIdx = 0; // Loop back to start
            }
        }

        const nextSl = availableSeaLevels[nextSlIdx];
        const nextRp = availableReturnPeriods[nextRpIdx];

        if (nextSl) onSeaLevelChange?.(nextSl);
        if (nextRp && nextRp !== selectedReturnPeriod) onReturnPeriodChange?.(nextRp);
        
    }, 2000); // 2 seconds per frame

    return () => clearInterval(interval);
  }, [isPlaying, availableReturnPeriods, availableSeaLevels, selectedReturnPeriod, selectedSeaLevel, onSeaLevelChange, onReturnPeriodChange]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(`.${styles.breadcrumbContainer}`)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setIsCountriesLoading(true);
    cachedFetchCatalogRefs('https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/catalog.xml')
      .then(setCountries)
      .catch(console.error)
      .finally(() => setIsCountriesLoading(false));
  }, []);

  // Fetch islands when country or cardinal direction changes
  useEffect(() => {
    let active = true;

    if (!selectedCountry) {
      setIsIslandsLoading(false);
      Promise.resolve().then(() => active && setIslands([]));
      return;
    }

    let url = '';
    if (selectedCountry === 'CK') {
      if (cardinalDirection) {
        url = `https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/CK/Coastal/${cardinalDirection}/catalog.xml`;
      }
    } else if (selectedCountry === 'WS') {
      url = `https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/WS/catalog.xml`;
    } else if (selectedCountry === 'MH' || selectedCountry === 'MHL' || selectedCountry === 'RMI') {
      url = `https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/RMI/Coastal/catalog.xml`;
    } else {
      url = `https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/${selectedCountry}/Coastal/catalog.xml`;
    }

    if (url) {
      setIsIslandsLoading(true);
      cachedFetchCatalogRefs(url)
        .then((data) => {
          if (active) setIslands(data);
        })
        .catch((err) => {
          console.error("Failed to fetch islands:", err);
          if (active) setIslands([]);
        })
        .finally(() => {
          if (active) setIsIslandsLoading(false);
        });
    } else {
      setIsIslandsLoading(false);
      setIslands([]);
    }

    return () => {
      active = false;
    };
  }, [selectedCountry, cardinalDirection]);

  // Fetch datasets when island changes
  useEffect(() => {
    let active = true;
    if (!selectedIsland || !selectedCountry) {
        Promise.resolve().then(() => {
            if(active) {
                setAvailableReturnPeriods([]);
                setAvailableSeaLevels([]);
            }
        });
        return;
    }

    let baseUrl = '';
    if (selectedCountry === 'CK') {
      if (cardinalDirection) {
        baseUrl = `https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/CK/Coastal/${cardinalDirection}`;
      }
    } else if (selectedCountry === 'WS') {
      baseUrl = `https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/WS`;
    } else if (selectedCountry === 'MH' || selectedCountry === 'MHL' || selectedCountry === 'RMI') {
      baseUrl = `https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/RMI/Coastal`;
    } else {
      baseUrl = `https://gemthreddshpc.spc.int/thredds/catalog/POP/Partner2/SLR/${selectedCountry}/Coastal`;
    }

    if (!baseUrl) {
        setAvailableReturnPeriods([]);
        setAvailableSeaLevels([]);
        return;
    }

    const catalogUrl = `${baseUrl}/${selectedIsland}/catalog.xml`;

    cachedFetchDatasets(catalogUrl).then(names => {
        if (!active) return;
        
        const rps = new Set<string>();
        const sls = new Set<string>();
        const islandNameForFile = selectedIsland.replace('_province', '');
        const prefix = `FloodDepth_${islandNameForFile}_`;
        let firstValidFile = '';

        names.forEach(name => {
            if (!name.startsWith(prefix)) return;
            if (!firstValidFile) firstValidFile = name;
            const suffix = name.substring(prefix.length);
            const lastUnderscoreIndex = suffix.lastIndexOf('_');
            if (lastUnderscoreIndex === -1) return;

            const rp = suffix.substring(0, lastUnderscoreIndex);
            const sl = suffix.substring(lastUnderscoreIndex + 1).replace('.nc', '');

            if (rp) rps.add(rp);
            if (sl) sls.add(sl);
        });

        const sortedRps = Array.from(rps).sort((a, b) => {
             const numA = parseFloat(a);
             const numB = parseFloat(b);
             if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
             return a.localeCompare(b);
        });
        
        const sortedSls = Array.from(sls).sort((a, b) => parseFloat(a) - parseFloat(b));

        setAvailableReturnPeriods(sortedRps);
        setAvailableSeaLevels(sortedSls);
        onAvailableSeaLevelsChange?.(sortedSls);

        if (firstValidFile && onIslandBoundsChange) {
            const wmsBase = baseUrl.replace('/catalog/', '/wms/');
            const fileWmsUrl = `${wmsBase}/${selectedIsland}/${firstValidFile}`;
            fetchWMSBounds(fileWmsUrl).then(bounds => {
                if (active && bounds) onIslandBoundsChange(bounds);
            });
        }

    }).catch(err => {
        console.error("Failed to fetch datasets:", err);
        if(active) {
            setAvailableReturnPeriods([]);
            setAvailableSeaLevels([]);
        }
    });

    return () => { active = false; };
  }, [selectedCountry, cardinalDirection, selectedIsland, onIslandBoundsChange, onAvailableSeaLevelsChange]);

  // Validate and set default Return Period
  useEffect(() => {
    if (availableReturnPeriods.length > 0) {
      if (!selectedReturnPeriod || !availableReturnPeriods.includes(selectedReturnPeriod)) {
        onReturnPeriodChange?.(availableReturnPeriods[0]);
      }
    }
  }, [availableReturnPeriods, selectedReturnPeriod, onReturnPeriodChange]);

  // Validate and set default Sea Level
  useEffect(() => {
    if (availableSeaLevels.length > 0) {
      if (!selectedSeaLevel || !availableSeaLevels.includes(selectedSeaLevel)) {
        onSeaLevelChange?.(availableSeaLevels[0]);
      }
    }
  }, [availableSeaLevels, selectedSeaLevel, onSeaLevelChange]);

  // Auto-initialise compare RP to last available (highest) — gives a meaningful contrast
  useEffect(() => {
    if (availableReturnPeriods.length > 0) {
      if (!compareReturnPeriod || !availableReturnPeriods.includes(compareReturnPeriod)) {
        onCompareReturnPeriodChange?.(availableReturnPeriods[availableReturnPeriods.length - 1]);
      }
    }
  }, [availableReturnPeriods, compareReturnPeriod, onCompareReturnPeriodChange]);

  // Auto-initialise compare SL to last available (highest)
  useEffect(() => {
    if (availableSeaLevels.length > 0) {
      if (!compareSeaLevel || !availableSeaLevels.includes(compareSeaLevel)) {
        onCompareSeaLevelChange?.(availableSeaLevels[availableSeaLevels.length - 1]);
      }
    }
  }, [availableSeaLevels, compareSeaLevel, onCompareSeaLevelChange]);

  return (
    <div className={styles.topSection}>
      {/* Breadcrumb Navigator */}
      <div className={styles.breadcrumbContainer}>
        {/* Country Picker — hidden when country is locked via URL */}
        {!lockedCountry && (
          <div className={styles.breadcrumbItem}>
            <button 
              className={styles.breadcrumbButton}
              onClick={() => setActiveMenu(activeMenu === 'country' ? null : 'country')}
            >
              <span className={styles.breadcrumbText}>
                {selectedCountry ? countryMapping(selectedCountry) : "Select Country"}
              </span>
              <span style={{fontSize: '10px'}}>▼</span>
            </button>
            
            {activeMenu === 'country' && (
              <div className={styles.dropdownMenu}>
                {isCountriesLoading ? (
                  <div className={styles.dropdownItem} style={{ fontStyle: 'italic', cursor: 'default' }}>
                    Loading...
                  </div>
                ) : (
                  countries.map((c) => (
                    <div 
                      key={c} 
                      className={`${styles.dropdownItem} ${selectedCountry === c ? styles.selected : ''}`}
                      onClick={() => {
                        onCountryChange?.(c);
                        setActiveMenu(null);
                      }}
                    >
                      {countryMapping(c)}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Region Picker (Only for Cook Islands) */}
        {selectedCountry === 'CK' && (
          <>
            {!lockedCountry && <span className={styles.breadcrumbSeparator}>/</span>}
            <div className={styles.breadcrumbItem}>
              <button 
                className={styles.breadcrumbButton}
                onClick={() => setActiveMenu(activeMenu === 'region' ? null : 'region')}
              >
                 <span className={styles.breadcrumbText}>
                  {cardinalDirection === 'northern_cook_islands' ? 'Northern' : 
                   cardinalDirection === 'southern_cook_islands' ? 'Southern' : 
                   "Select Region"}
                </span>
                <span style={{fontSize: '10px'}}>▼</span>
              </button>
              
              {activeMenu === 'region' && (
                <div className={styles.dropdownMenu}>
                  {[
                    { val: 'northern_cook_islands', label: 'Northern Cook Islands' },
                    { val: 'southern_cook_islands', label: 'Southern Cook Islands' }
                  ].map((opt) => (
                    <div 
                      key={opt.val} 
                      className={`${styles.dropdownItem} ${cardinalDirection === opt.val ? styles.selected : ''}`}
                      onClick={() => {
                        onCardinalDirectionChange?.(opt.val);
                        setActiveMenu(null);
                      }}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Island Picker */}
        {(selectedCountry && (selectedCountry !== 'CK' || cardinalDirection)) && (
          <>
             {(!lockedCountry || (selectedCountry === 'CK' && !!cardinalDirection)) && (
               <span className={styles.breadcrumbSeparator}>/</span>
             )}
             <div className={styles.breadcrumbItem}>
              <button 
                className={styles.breadcrumbButton}
                onClick={() => setActiveMenu(activeMenu === 'island' ? null : 'island')}
              >
                <span className={styles.breadcrumbText}>
                  {selectedIsland || "Select Island"}
                </span>
                <span style={{fontSize: '10px'}}>▼</span>
              </button>
              
              {activeMenu === 'island' && isIslandsLoading && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownItem} style={{ fontStyle: 'italic', cursor: 'default' }}>
                    Loading...
                  </div>
                </div>
              )}
              {activeMenu === 'island' && !isIslandsLoading && islands.length > 0 && (
                <div className={styles.dropdownMenu}>
                  {islands.map((island) => (
                     <div 
                      key={island} 
                      className={`${styles.dropdownItem} ${selectedIsland === island ? styles.selected : ''}`}
                      onClick={() => {
                        onIslandChange?.(island);
                        setActiveMenu(null);
                      }}
                    >
                      {island}
                    </div>
                  ))}
                </div>
              )}
                {activeMenu === 'island' && !isIslandsLoading && islands.length === 0 && (
                 <div className={styles.dropdownMenu}>
                    <div className={styles.dropdownItem} style={{ fontStyle: 'italic', cursor: 'default' }}>
                      No islands found
                    </div>
                 </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Hazard Layer Opacity */}
      {isFloodLayerEnabled && (
        <div className={styles.sliderSection}>
          <label className={styles.sliderLabel}>
            Hazard Opacity: <span className={styles.sliderValue}>{Math.round(floodOpacity * 100)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={Math.round(floodOpacity * 100)}
            onChange={(e) => onFloodOpacityChange?.(parseInt(e.target.value, 10) / 100)}
            className={styles.slider}
          />
          <div className={styles.sliderRange}>
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Animation Control */}
      {availableReturnPeriods.length > 0 && availableSeaLevels.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: isPlaying ? 'rgba(239, 83, 80, 0.2)' : 'rgba(76, 175, 80, 0.2)', // Tinted bg
              color: isPlaying ? '#ef5350' : '#81c784', // Colored text
              border: `1px solid ${isPlaying ? '#ef5350' : '#4caf50'}`,
              borderRadius: '20px', // Pill shape matching map styles
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              width: '100%',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = isPlaying ? 'rgba(239, 83, 80, 0.3)' : 'rgba(76, 175, 80, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = isPlaying ? 'rgba(239, 83, 80, 0.2)' : 'rgba(76, 175, 80, 0.2)';
            }}
          >
            {isPlaying ? <FaPause size={10} /> : <FaPlay size={10} />}
            {isPlaying ? 'PAUSE SIMULATION' : 'PLAY SIMULATION'}
          </button>
        </div>
      )}

      {/* Return Period - Button Grid */}
      {availableReturnPeriods.length > 0 && (
        <div className={styles.radioSection}>
          <label className={styles.radioLabel}>Return Period:</label>
          <div className={styles.radioGroup}>
            {availableReturnPeriods.map((rp) => (
              <label 
                key={rp} 
                className={`${styles.radioItem} ${selectedReturnPeriod === rp ? styles.radioItemSelected : ''}`}
              >
                <input
                  type="radio"
                  name="returnPeriod"
                  value={rp}
                  checked={selectedReturnPeriod === rp}
                  onChange={(e) => onReturnPeriodChange?.(e.target.value)}
                  className={styles.radioInput}
                />
                <span className={styles.radioText}>
                  {isNaN(Number(rp)) ? rp : `${rp} Yrs`}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Sea Level - Slider */}
      {availableSeaLevels.length > 0 && (
         <div className={styles.sliderSection}>
          <label className={styles.sliderLabel}>
            Sea Level: <span className={styles.sliderValue}>{selectedSeaLevel}m</span>
          </label>
          <input
            type="range"
            min="0"
            max={availableSeaLevels.length - 1}
            step="1"
            value={availableSeaLevels.indexOf(selectedSeaLevel || '') !== -1 ? availableSeaLevels.indexOf(selectedSeaLevel || '') : 0}
            onChange={(e) => {
              const index = parseInt(e.target.value, 10);
              onSeaLevelChange?.(availableSeaLevels[index]);
            }}
            className={styles.slider}
          />
          <div className={styles.sliderRange}>
            <span>{availableSeaLevels[0]}</span>
            <span>{availableSeaLevels[availableSeaLevels.length - 1]}</span>
          </div>
        </div>
      )}

      {/* ── Compare Layer ─────────────────────────────────── */}
      {availableReturnPeriods.length > 0 && availableSeaLevels.length > 0 && isFloodLayerEnabled && (
        <div style={{
          marginTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.15)',
          paddingTop: '12px',
        }}>
          {/* Toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            color: compareEnabled ? '#4fc3f7' : 'rgba(255,255,255,0.8)',
            userSelect: 'none',
            marginBottom: compareEnabled ? '10px' : 0,
          }}>
            <input
              type="checkbox"
              checked={!!compareEnabled}
              onChange={(e) => onCompareEnabledChange?.(e.target.checked)}
              style={{ accentColor: '#4fc3f7', width: 14, height: 14 }}
            />
            Activate Compare Layer
          </label>

          {/* Compare controls — visible only when enabled */}
          {compareEnabled && (
            <>
              <div style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Compare: Return Period
              </div>
              <div className={styles.radioGroup} style={{ marginBottom: '10px' }}>
                {availableReturnPeriods.map((rp) => (
                  <label
                    key={rp}
                    className={styles.radioItem}
                    style={compareReturnPeriod === rp
                      ? { borderColor: '#ffb74d', background: '#ffb74d', color: '#fff', fontWeight: 600 }
                      : {}}
                  >
                    <input
                      type="radio"
                      name="compareReturnPeriod"
                      value={rp}
                      checked={compareReturnPeriod === rp}
                      onChange={(e) => onCompareReturnPeriodChange?.(e.target.value)}
                      className={styles.radioInput}
                    />
                    <span className={styles.radioText}>
                      {isNaN(Number(rp)) ? rp : `${rp} Yrs`}
                    </span>
                  </label>
                ))}
              </div>

              <div style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Compare: Sea Level — <span style={{ color: '#ffb74d' }}>{compareSeaLevel}m</span>
              </div>
              <input
                type="range"
                min="0"
                max={availableSeaLevels.length - 1}
                step="1"
                value={
                  availableSeaLevels.indexOf(compareSeaLevel || '') !== -1
                    ? availableSeaLevels.indexOf(compareSeaLevel || '')
                    : availableSeaLevels.length - 1
                }
                onChange={(e) => {
                  const index = parseInt(e.target.value, 10);
                  onCompareSeaLevelChange?.(availableSeaLevels[index]);
                }}
                className={styles.slider}
                style={{ accentColor: '#ffb74d' }}
              />
              <div className={styles.sliderRange}>
                <span>{availableSeaLevels[0]}</span>
                <span>{availableSeaLevels[availableSeaLevels.length - 1]}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Load Flood Data Button (disabled - flood layer auto-shows on island selection) */}
      {false && (
        <button
          onClick={() => setIsFloodLayerEnabled(!isFloodLayerEnabled)}
          className={`${styles.loadButton} ${isFloodLayerEnabled ? styles.active : ''}`}
        >
          {isFloodLayerEnabled ? 'Hide Flood Layer' : 'Load Flood Data'}
        </button>
      )}
    </div>
  );
});

export default FilterSidebarTop;
