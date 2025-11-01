"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { fetchMapData, ScatterPoint } from '@/services/apiService';
import { fetchNeighborMap } from '@/services/apiService'; // <-- NEW
import { useDatasetStore } from '@/store/useDataStore';

interface MapViewProps {
  onCountyClick?: (county: any) => void;
}

const padFips = (v: any) => String(v ?? "").replace(/\D/g, "").padStart(5, "0");

// Try to handle a few raw shapes (list of ids, {neighbors:[..]}, {idx:[..]}, {id->w})
const extractNeighborIds = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(padFips);
  if (typeof val === "object") {
    if (Array.isArray(val.neighbors)) return val.neighbors.map(padFips);
    if (Array.isArray(val.idx)) return val.idx.map(padFips);
    if (Array.isArray(val.ids)) return val.ids.map(padFips);
    // dict of neighbor->weight
    return Object.keys(val).map(padFips);
  }
  return [];
};

type FeatureIndexVal = {
  NAME?: string;
  county_name?: string;
  STATE?: string;
  STATE_NAME?: string;
  state_name?: string;
  GEOID?: string;
};

const MapView: React.FC<MapViewProps> = ({ onCountyClick }) => {
  const { dataset, isUpdated } = useDatasetStore();
  const [geoData, setGeoData] = useState<any>(null);
  const [mapData, setMapData] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [imputedSet, setImputedSet] = useState<Set<string>>(new Set());

  // NEW: neighbor map (GEOID -> Set<GEOID>)
  const [neighborMap, setNeighborMap] = useState<Map<string, Set<string>>>(new Map());
  const [hoveredGeoid, setHoveredGeoid] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    Promise.all([
      fetch('/counties.geojson').then((response) => response.json()),
      fetchMapData(),
    ])
      .then(async ([geoJson, scatterResponse]) => {
        setGeoData(geoJson);

        const dataMap = new Map<string, number>();
        const imputed = new Set<string>();

        if (scatterResponse.points && Array.isArray(scatterResponse.points)) {
          scatterResponse.points.forEach((point: ScatterPoint) => {
            const geoid = String(Math.round(point.x)).padStart(5, '0');
            dataMap.set(geoid, point.y);
            if (point.label === 'Imputed') imputed.add(geoid);
          });
        }

        setMapData(dataMap);
        setImputedSet(imputed);

        // --- NEW: fetch neighbor map (needs session id) -----------------------
        try {
          const raw = await fetchNeighborMap();
          const m = new Map<string, Set<string>>();
          Object.entries(raw).forEach(([k, v]) => {
            const src = padFips(k);
            const nbrs = extractNeighborIds(v);
            if (!m.has(src)) m.set(src, new Set());
            nbrs.forEach(n => m.get(src)!.add(n));
          });
          setNeighborMap(m);
        } catch (e: any) {
          console.warn("Neighbor map not available:", e?.message || e);
        }
        // ---------------------------------------------------------------------

        setLoading(false);
      })
      .catch((error) => {
        console.error('Error loading map data:', error);
        let errorMessage = 'Failed to load map data';
        if ((error as any).response?.status === 404) {
          errorMessage = 'API endpoint not found. Make sure the backend server is running.';
        } else if ((error as any).response?.status === 400) {
          errorMessage = (error as any).response?.data?.detail || 'Please run imputation first before viewing the map.';
        } else if ((error as any).message) {
          errorMessage = (error as any).message;
        }
        setError(errorMessage);
        setLoading(false);
      });
  }, [isUpdated, dataset]);

  // Index geojson features by GEOID so we can label neighbors nicely
  const featureIndex: Map<string, FeatureIndexVal> = useMemo(() => {
    const idx = new Map<string, FeatureIndexVal>();
    if (!geoData?.features) return idx;
    for (const f of geoData.features) {
      const p = f.properties || {};
      const geoid = padFips(p.GEOID ?? p.geoid);
      if (geoid) idx.set(geoid, p);
    }
    return idx;
  }, [geoData]);

  const getCountyColor = (geoid: string): string => {
    const deathRate = mapData.get(geoid);
    if (!deathRate || deathRate === 0) return '#E8E8E8';
    if (deathRate < 1) return '#ffffcc';
    if (deathRate < 3) return '#ffeda0';
    if (deathRate < 5) return '#fed976';
    if (deathRate < 10) return '#feb24c';
    if (deathRate < 15) return '#fd8d3c';
    if (deathRate < 20) return '#fc4e2a';
    if (deathRate < 25) return '#e31a1c';
    return '#bd0026';
  };

  const getCountyData = (geoid: string) => {
    const deathRate = mapData.get(geoid);
    if (deathRate !== undefined) {
      return { geoid, deaths_per_100k: deathRate };
    }
    return { geoid, deaths_per_100k: undefined as number | undefined };
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading map data...</div>;
  if (error) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ color: '#ff4d4f', marginBottom: 10, fontSize: 16, fontWeight: 'bold' }}>Error Loading Map</div>
        <div style={{ color: '#666', marginBottom: 15 }}>{error}</div>
        <div style={{ color: '#888', fontSize: 14 }}>
          {error.includes('404') || error.includes('not found') ? (
            <>
              <p>Make sure the backend server is running:</p>
              <code style={{ background: '#f5f5f5', padding: '5px 10px', borderRadius: 4 }}>python app.py</code>
            </>
          ) : error.includes('imputation') || error.includes('400') ? (
            <p>Please upload a dataset and run imputation before viewing the map.</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!geoData) return <div style={{ padding: 20, textAlign: 'center' }}>No map data available</div>;

  // For hover styling
  const neighborsOfHover = hoveredGeoid ? (neighborMap.get(hoveredGeoid) ?? new Set()) : new Set<string>();

  return (
    <div style={{ width: '100%', height: '60vh', overflow: 'hidden', position: 'relative' }}>
      <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1000 }} style={{ width: '100%', height: '100%' }}>
        <Geographies geography={geoData}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const geoid = padFips(geo.properties.GEOID);
              const countyData = getCountyData(geoid);
              const isImputed = imputedSet.has(geoid);

              const isHovered = hoveredGeoid === geoid;
              const isNeighbor = neighborsOfHover.has(geoid);
              const baseStroke = !isImputed ? '#a0d468' : '#ffffff';
              const hoverStroke = !isImputed ? '#7ac142' : '#ffffff';

              // NEW: outline logic
              let stroke = baseStroke;
              let strokeWidth = 0.5;

              if (isNeighbor) {
                stroke = '#1890ff';      // neighbor highlight
                strokeWidth = 1.5;
              }
              if (isHovered) {
                stroke = '#722ed1';      // hovered county highlight
                strokeWidth = 2;
              }

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(event) => {
                    const props = geo.properties || {};
                    const countyName = props.NAME || props.county_name || 'Unknown County';
                    const deathRate = mapData.get(geoid);

                    setHoveredGeoid(geoid); // <-- NEW

                    let tooltipContent = `${countyName}`;
                    if (deathRate !== undefined) {
                      tooltipContent += `\nDeaths per 100k: ${deathRate.toFixed(2)}`;
                    } else {
                      tooltipContent += `\nNo data available`;
                    }
                    tooltipContent += `\nStatus: ${isImputed ? 'Imputed' : 'Observed'}`;

                    // optional: show neighbor count if available
                    const nCount = neighborMap.get(geoid)?.size ?? 0;
                    if (nCount > 0) tooltipContent += `\nNeighbors: ${nCount}`;

                    setTooltip({ x: event.clientX, y: event.clientY, content: tooltipContent });
                  }}
                  onMouseMove={(event) => {
                    if (tooltip) setTooltip({ ...tooltip, x: event.clientX, y: event.clientY });
                  }}
                  onMouseLeave={() => {
                    setTooltip(null);
                    setHoveredGeoid(null); // <-- NEW
                  }}
                  onClick={() => {
                    if (!onCountyClick) return;

                    // Build neighbors payload with names + stats
                    const nbrIds = Array.from(neighborMap.get(geoid) ?? []);
                    const neighbors = nbrIds.map(id => {
                      const props = featureIndex.get(id) || {};
                      const name = (props.NAME || props.county_name || id) as string;
                      const state = (props.STATE_NAME || props.state_name || props.STATE || '') as string;
                      const value = mapData.get(id);
                      return {
                        geoid: id,
                        name,
                        state,
                        deaths_per_100k: value,
                        isImputed: imputedSet.has(id),
                      };
                    });

                    const props = geo.properties || {};
                    const payload = {
                      ...props,
                      ...countyData,
                      county_name: props.NAME || props.county_name,
                      state_name: props.STATE_NAME || props.state_name || props.STATE,
                      isImputed,
                      neighbors,
                    };

                    onCountyClick(payload);
                  }}
                  style={{
                    default: {
                      fill: getCountyColor(geoid),
                      stroke,
                      strokeWidth,
                      outline: 'none',
                    },
                    hover: {
                      fill: '#F53',
                      stroke: isNeighbor ? '#1890ff' : hoverStroke,
                      strokeWidth: isNeighbor ? 1.5 : 0.75,
                      outline: 'none',
                      cursor: 'pointer',
                    },
                    pressed: {
                      fill: '#E42',
                      stroke,
                      strokeWidth,
                      outline: 'none',
                    },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltip.x + 10}px`,
            top: `${tooltip.y + 10}px`,
            background: 'rgba(0, 0, 0, 0.85)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: 4,
            fontSize: 13,
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'pre-line',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {tooltip.content}
        </div>
      )}

      {/* Legend (adds hover annotations) */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        background: 'white',
        padding: 12,
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: 12
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Deaths per 100k</div>
        {/* ... your existing color items ... */}
        <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Annotations</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 20, height: 12, background: '#ffffff', border: '2px solid #52c41a', boxSizing: 'border-box' }} />
            <span>Observed</span>
          </div>
          {/* <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <div style={{ width: 20, height: 12, background: '#ffffff', border: '2px solid #722ed1', boxSizing: 'border-box' }} />
            <span>Hovered county</span>
          </div> */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <div style={{ width: 20, height: 12, background: '#ffffff', border: '2px solid #1890ff', boxSizing: 'border-box' }} />
            <span>Neighbor Counties</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
