"use client";

import React, { useEffect, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { fetchMapData, ScatterPoint } from '@/services/apiService';
import { useDatasetStore } from '@/store/useDataStore';

interface MapViewProps {
  onCountyClick?: (county: any) => void;
}

const MapView: React.FC<MapViewProps> = ({ onCountyClick }) => {
  const { dataset, isUpdated } = useDatasetStore();
  const [geoData, setGeoData] = useState<any>(null);
  const [mapData, setMapData] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [imputedSet, setImputedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);

    Promise.all([
      fetch('/counties.geojson').then((response) => response.json()),
      fetchMapData(),
    ])
      .then(([geoJson, scatterResponse]) => {
        setGeoData(geoJson);

        const dataMap = new Map<string, number>();
        const imputed = new Set<string>();

        if (scatterResponse.points && Array.isArray(scatterResponse.points)) {
          scatterResponse.points.forEach((point: ScatterPoint) => {
            const geoid = String(Math.round(point.x)).padStart(5, '0');
            dataMap.set(geoid, point.y);

            // 👇 mark imputed counties
            if (point.label === 'Imputed') {
              imputed.add(geoid);
            }
          });
        }

        setMapData(dataMap);
        setImputedSet(imputed);   // 👈 save it
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error loading map data:', error);
        let errorMessage = 'Failed to load map data';
        if (error.response?.status === 404) {
          errorMessage = 'API endpoint not found. Make sure the backend server is running.';
        } else if (error.response?.status === 400) {
          errorMessage = error.response?.data?.detail || 'Please run imputation first before viewing the map.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        setError(errorMessage);
        setLoading(false);
      });
  }, [isUpdated, dataset]);

  // Get color based on deaths_per_100k
  const getCountyColor = (geoid: string): string => {
    const deathRate = mapData.get(geoid);
    if (!deathRate || deathRate === 0) return '#E8E8E8';

    // Color scale from light yellow to dark red
    if (deathRate < 1) return '#ffffcc';
    if (deathRate < 3) return '#ffeda0';
    if (deathRate < 5) return '#fed976';
    if (deathRate < 10) return '#feb24c';
    if (deathRate < 15) return '#fd8d3c';
    if (deathRate < 20) return '#fc4e2a';
    if (deathRate < 25) return '#e31a1c';
    return '#bd0026';
  };

  // Get county data for tooltip/click
  const getCountyData = (geoid: string) => {
    const deathRate = mapData.get(geoid);
    if (deathRate !== undefined) {
      return {
        geoid,
        deaths_per_100k: deathRate,
      };
    }
    return null;
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading map data...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ color: '#ff4d4f', marginBottom: '10px', fontSize: '16px', fontWeight: 'bold' }}>
          Error Loading Map
        </div>
        <div style={{ color: '#666', marginBottom: '15px' }}>
          {error}
        </div>
        <div style={{ color: '#888', fontSize: '14px' }}>
          {error.includes('404') || error.includes('not found') ? (
            <>
              <p>Make sure the backend server is running:</p>
              <code style={{ background: '#f5f5f5', padding: '5px 10px', borderRadius: '4px' }}>
                python app.py
              </code>
            </>
          ) : error.includes('imputation') || error.includes('400') ? (
            <p>Please upload a dataset and run imputation before viewing the map.</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!geoData) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>No map data available</div>;
  }

  return (
    <div style={{ width: '100%', height: '60vh', overflow: 'hidden' }}>
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{
          scale: 1000,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <Geographies geography={geoData}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const geoid = geo.properties.GEOID;
              const countyData = getCountyData(geoid);

              const isImputed = imputedSet.has(geoid);
              const baseStroke = !isImputed ? '#a0d468' : '#ffffff';
              const hoverStroke = !isImputed ? '#7ac142' : '#ffffff';



              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(event) => {
                    const countyName = geo.properties.NAME || 'Unknown County';
                    const deathRate = mapData.get(geoid);

                    let tooltipContent = `${countyName}`;
                    if (deathRate !== undefined) {
                      tooltipContent += `\nDeaths per 100k: ${deathRate.toFixed(2)}`;
                    } else {
                      tooltipContent += `\nNo data available`;
                    }
                    // 👇 add imputation status
                    tooltipContent += `\nStatus: ${isImputed ? 'Imputed' : 'Observed'}`;

                    setTooltip({
                      x: event.clientX,
                      y: event.clientY,
                      content: tooltipContent,
                    });
                  }}
                  onMouseMove={(event) => {
                    if (tooltip) {
                      setTooltip({ ...tooltip, x: event.clientX, y: event.clientY });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => {
                    if (onCountyClick && countyData) {
                      onCountyClick({ ...geo.properties, ...countyData, isImputed }); // pass it along too
                    }
                  }}
                  style={{
                    default: {
                      fill: getCountyColor(geoid),
                      stroke: baseStroke,
                      strokeWidth: 0.5,
                      outline: 'none',
                    },
                    hover: {
                      fill: '#F53',
                      stroke: hoverStroke,
                      strokeWidth: 0.75,
                      outline: 'none',
                      cursor: 'pointer',
                    },
                    pressed: {
                      fill: '#E42',
                      stroke: baseStroke,
                      strokeWidth: 0.5,
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
            borderRadius: '4px',
            fontSize: '13px',
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'pre-line',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {tooltip.content}
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        background: 'white',
        padding: '12px',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '12px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Deaths per 100k</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '12px', background: '#ffffcc' }}></div>
            <span>&lt; 1</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '12px', background: '#ffeda0' }}></div>
            <span>1-3</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '12px', background: '#fed976' }}></div>
            <span>3-5</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '12px', background: '#feb24c' }}></div>
            <span>5-10</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '12px', background: '#fd8d3c' }}></div>
            <span>10-15</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '12px', background: '#fc4e2a' }}></div>
            <span>15-20</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '12px', background: '#e31a1c' }}></div>
            <span>20-25</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '12px', background: '#800026' }}></div>
            <span>25+</span>
          </div>

          <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Annotations</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 20,
                height: 12,
                background: '#ffffff',
                border: '2px solid #52c41a',
                boxSizing: 'border-box'
              }} />
              <span>Original</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default MapView;
