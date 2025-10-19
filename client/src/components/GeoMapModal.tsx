// GeoMapModal.tsx
"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Modal, Button, Typography } from 'antd';
import { useDatasetStore } from '@/store/useDataStore';

const { Text } = Typography;
const MapView = dynamic(() => import('./MapView'), { ssr: false });

const GeoMapModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState<any>(null);

  // 🔑 subscribe to store so we can key the MapView
  const { dataset, isUpdated } = useDatasetStore();

  const handleCountyClick = (countyData: any) => setSelectedCounty(countyData);

  return (
    <>
      <Button type="link" onClick={() => setOpen(true)}>🌍 Map</Button>
      <Modal
        title="U.S. Counties - Deaths per 100k Population"
        open={open}
        onCancel={() => {
          setOpen(false);
          setSelectedCounty(null);
        }}
        footer={null}
        width={1100}
        destroyOnClose   // ✅ ensure unmount on close
      >
        {/* ✅ force a fresh mount when dataset or isUpdated flips */}
        <MapView
          key={`${String(dataset)}::${String(isUpdated)}`}
          onCountyClick={handleCountyClick}
        />

        {selectedCounty && (
          <div style={{
            marginTop: 16, padding: 16, background: '#f5f5f5',
            borderRadius: 4, border: '1px solid #d9d9d9'
          }}>
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 16 }}>
                {selectedCounty.county_name || selectedCounty.NAME}
              </Text>
              {selectedCounty.state_name && (
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  {selectedCounty.state_name}
                </Text>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Text type="secondary">County Code (GEOID):</Text><br />
                <Text strong>{selectedCounty.geoid || selectedCounty.GEOID}</Text>
              </div>
              {selectedCounty.deaths_per_100k !== undefined && (
                <div>
                  <Text type="secondary">Deaths per 100k:</Text><br />
                  <Text strong style={{ color: '#cf1322', fontSize: 18 }}>
                    {selectedCounty.deaths_per_100k.toFixed(2)}
                  </Text>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default GeoMapModal;
