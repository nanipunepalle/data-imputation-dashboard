"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Checkbox } from 'antd';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { fetchMapData, ScatterPoint } from '@/services/apiService';
import { fetchNeighborMap } from '@/services/apiService'; // <-- NEW
import { useDatasetStore } from '@/store/useDataStore';

interface MapViewProps {
  onCountyClick?: (county: any) => void;
  // control whether hover interactions are enabled; parent (modal) can
  // disable hover when a county has been clicked for details.
  hoverEnabled?: boolean;
  // optional controlled selected GEOID from parent so contributors remain
  // highlighted until the parent clears selection.
  selectedGeoid?: string | null;
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

const MapView: React.FC<MapViewProps> = ({ onCountyClick, hoverEnabled = true, selectedGeoid = null }) => {
  const { dataset, isUpdated } = useDatasetStore();
  const [geoData, setGeoData] = useState<any>(null);
  const [mapData, setMapData] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [imputedSet, setImputedSet] = useState<Set<string>>(new Set());
  const [showImputed, setShowImputed] = useState<boolean>(true);
  const [showObserved, setShowObserved] = useState<boolean>(true);

  // counts for legend checkboxes
  const imputedCount = useMemo(() => {
    let c = 0;
    mapData.forEach((_, k) => { if (imputedSet.has(k)) c++; });
    return c;
  }, [mapData, imputedSet]);

  const observedCount = useMemo(() => {
    return Math.max(0, mapData.size - imputedCount);
  }, [mapData, imputedCount]);

  // NEW: neighbor map (GEOID -> Set<GEOID>)
  const [neighborMap, setNeighborMap] = useState<Map<string, Set<string>>>(new Map());
  const [hoveredGeoid, setHoveredGeoid] = useState<string | null>(null);
  // UI states for legend: collapsed vs expanded, and side position
  const [legendCollapsed, setLegendCollapsed] = useState<boolean>(false);
  const [legendPosition, setLegendPosition] = useState<'right' | 'left'>('right');

  // Compute contributors early (hooks must run in the same order every render).
  // These do not depend on geoData, so compute before any early returns.
  const selectedContributorsEarly = (selectedGeoid && imputedSet.has(selectedGeoid)) ? (neighborMap.get(selectedGeoid) ?? new Set<string>()) : new Set<string>();
  const hoverContributorsEarly = (hoveredGeoid && imputedSet.has(hoveredGeoid)) ? (neighborMap.get(hoveredGeoid) ?? new Set<string>()) : new Set<string>();

  const activeContributorsEarly = useMemo(() => {
    const s = new Set<string>();
    hoverContributorsEarly.forEach(id => s.add(id));
    selectedContributorsEarly.forEach(id => s.add(id));
    return s;
  }, [hoverContributorsEarly, selectedContributorsEarly, neighborMap]);

  // Also keep the generic neighbor set for hover/outline logic
  // Use the hovered GEOID if present, otherwise fall back to the controlled
  // `selectedGeoid` so neighbors are highlighted while a county is selected
  // (hover may be disabled by the parent while a county is selected).
  const focusGeoid = hoveredGeoid ?? selectedGeoid ?? null;
  const neighborsOfHoverEarly = focusGeoid ? (neighborMap.get(focusGeoid) ?? new Set<string>()) : new Set<string>();

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
    return '#800026';
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

  // For hover/selection styling - use the early computed values (see above).
  const activeContributors = activeContributorsEarly;
  // neighborsOfHover now refers to the neighbors of the current focus
  // (either hovered geoid or selected geoid).
  const neighborsOfHover = neighborsOfHoverEarly;

  return (
    <div style={{ width: '100%', height: '84vh', overflow: 'hidden', position: 'relative' }}>
  <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1200 }} style={{ width: '100%', height: '100%' }}>
        <Geographies geography={geoData}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const geoid = padFips(geo.properties.GEOID);
              const countyData = getCountyData(geoid);
              const isImputed = imputedSet.has(geoid);

              const isHovered = hoveredGeoid === geoid;
              const isNeighbor = neighborsOfHover.has(geoid);
              const isContributor = activeContributors.has(geoid);
              // Use neutral strokes for all counties (remove green/blue borders)
              const baseStroke = '#ffffff';
              const hoverStroke = '#722ed1';

              // Determine visibility based on imputed/observed checkboxes
              // Also keep contributors visible even when observed are unchecked
              // and keep the selected county visible regardless of filters.
              const visible = (isImputed && showImputed) || (!isImputed && showObserved) || isContributor || (geoid === selectedGeoid);

              // NEW: outline logic
              let stroke = baseStroke;
              let strokeWidth = 0.5;

              // If this county is a neighbor of the focused county (hovered
              // or selected), outline it in blue so neighbors stand out.
              if (isNeighbor) {
                stroke = '#1890ff';
                strokeWidth = 1.5;
              }

              // If this county is a contributor (selected or hovered
              // contributor), use a slightly darker blue outline to make
              // them distinct (and keep the blue fill as before).
              if (isContributor) {
                stroke = '#0958d9';
                strokeWidth = Math.max(strokeWidth, 1);
              }

              // Hovered county gets a prominent purple outline (overrides
              // neighbour/contributor outlines for the hovered county itself).
              if (isHovered) {
                stroke = '#722ed1';      // hovered county highlight
                strokeWidth = 2;
              }

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(event) => {
                    // If parent has disabled hover (e.g., a county is selected
                    // and the modal is showing details), skip hover handling.
                    if (!visible || !hoverEnabled) return;
                    const props = geo.properties || {};
                    const countyName = props.NAME || props.county_name || 'Unknown County';
                    const deathRate = mapData.get(geoid);

            // only set hoveredGeoid if hoverEnabled prop is true
            // (read from component props via closure)
            // We'll get hoverEnabled via the prop in scope below.
                    
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
                    // If hover is disabled or county not visible, ensure tooltip
                    // is cleared and do nothing.
                    if (!visible || !hoverEnabled) {
                      setTooltip(null);
                      setHoveredGeoid(null);
                      return;
                    }

                    // If the cursor moved over a new geography but onMouseEnter
                    // didn't fire for some reason, update hoveredGeoid and
                    // tooltip content here so continuous movement updates the
                    // details reliably.
                    if (hoveredGeoid !== geoid) {
                      setHoveredGeoid(geoid);

                      const props = geo.properties || {};
                      const countyName = props.NAME || props.county_name || 'Unknown County';
                      const deathRate = mapData.get(geoid);
                      let tooltipContent = `${countyName}`;
                      if (deathRate !== undefined) {
                        tooltipContent += `\nDeaths per 100k: ${deathRate.toFixed(2)}`;
                      } else {
                        tooltipContent += `\nNo data available`;
                      }
                      tooltipContent += `\nStatus: ${isImputed ? 'Imputed' : 'Observed'}`;
                      const nCount = neighborMap.get(geoid)?.size ?? 0;
                      if (nCount > 0) tooltipContent += `\nNeighbors: ${nCount}`;

                      setTooltip({ x: event.clientX, y: event.clientY, content: tooltipContent });
                      return;
                    }

                    // Otherwise, just update coordinates so tooltip follows the cursor.
                    if (tooltip) setTooltip({ ...tooltip, x: event.clientX, y: event.clientY });
                  }}
                  onMouseLeave={() => {
                    if (!visible || !hoverEnabled) return;
                    setTooltip(null);
                    setHoveredGeoid(null); // <-- NEW
                  }}
                    onClick={() => {
                    if (!visible) return;
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
                      // If this county is the currently selected county, persist the
                      // hover color (green) so selection remains visible after
                      // moving the mouse away. Contributors remain blue.
                      fill: geoid === selectedGeoid ? '#52c41a' : (isContributor ? '#1890ff' : getCountyColor(geoid)),
                      opacity: visible ? 1 : 0.15,
                      stroke: visible ? stroke : '#e6e6e6',
                      strokeWidth: visible ? strokeWidth : 0.5,
                      outline: 'none',
                      cursor: visible ? 'pointer' : 'default',
                    },
                    hover: visible
                      ? {
                          // Use green for hover so it doesn't conflict with
                          // the choropleth red colors in the legend.
                          fill: '#52c41a',
                          stroke: hoverStroke,
                          strokeWidth: isNeighbor ? 1.5 : 0.75,
                          outline: 'none',
                          cursor: 'pointer',
                        }
                      : {
                          fill: getCountyColor(geoid),
                          opacity: 0.15,
                          stroke: '#e6e6e6',
                          strokeWidth: 0.5,
                          outline: 'none',
                          cursor: 'default',
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
      {/* Floating control to collapse/expand legend and move its side */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: legendPosition === 'right' ? 18 : 'auto',
          left: legendPosition === 'left' ? 18 : 'auto',
          zIndex: 1050,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => setLegendCollapsed(prev => !prev)}
          aria-label={legendCollapsed ? 'Expand legend' : 'Collapse legend'}
          style={{
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(0,0,0,0.08)',
            padding: '6px 8px',
            borderRadius: 6,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
          }}
        >
          {legendCollapsed ? '▸ Legend' : '◂ Legend'}
        </button>
        <button
          onClick={() => setLegendPosition(pos => pos === 'right' ? 'left' : 'right')}
          title="Move legend"
          style={{
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(0,0,0,0.06)',
            padding: '6px 8px',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          {legendPosition === 'right' ? 'Move Left' : 'Move Right'}
        </button>
      </div>

      {!legendCollapsed && (
        <div style={{
          position: 'absolute',
          bottom: 18,
          right: legendPosition === 'right' ? 18 : 'auto',
          left: legendPosition === 'left' ? 18 : 'auto',
          background: 'white',
          padding: 8,
          borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          fontSize: 11,
          width: 160,
          maxWidth: '30%',
          transition: 'opacity 120ms ease'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Deaths per 100k</div>

          {/* Checkbox filters for Imputed / Observed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6, fontSize: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Checkbox checked={showImputed} onChange={(e) => setShowImputed(e.target.checked)} />
              <span style={{ fontSize: 12 }}>Imputed ({imputedCount})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Checkbox checked={showObserved} onChange={(e) => setShowObserved(e.target.checked)} />
              <span style={{ fontSize: 12 }}>Observed ({observedCount})</span>
            </label>
          </div>

          {/* Legend swatches matching the choropleth bins */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['#ffffcc', '< 1'],
              ['#ffeda0', '1-3'],
              ['#fed976', '3-5'],
              ['#feb24c', '5-10'],
              ['#fd8d3c', '10-15'],
              ['#fc4e2a', '15-20'],
              ['#e31a1c', '20-25'],
              ['#800026', '25+'],
            ].map(([color, label]) => (
              <div key={String(label)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 16, height: 10, background: String(color) }} />
                <span style={{ fontSize: 11 }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Annotations</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div style={{ width: 16, height: 10, background: '#52c41a', boxSizing: 'border-box' }} />
              <span style={{ fontSize: 11 }}>Imputed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div style={{ width: 16, height: 10, background: '#1890ff', boxSizing: 'border-box' }} />
              <span style={{ fontSize: 11 }}>Donors</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;
