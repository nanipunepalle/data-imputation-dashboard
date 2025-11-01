"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Modal, Button, Typography, Card, Tag, List, Space } from 'antd';
import { useDatasetStore } from '@/store/useDataStore';

const { Text } = Typography;
const MapView = dynamic(() => import('./MapView'), { ssr: false });

type NeighborInfo = {
  geoid: string;
  name: string;
  state?: string;
  deaths_per_100k?: number;
  isImputed: boolean;
};

const GeoMapModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState<any>(null);

  // 🔑 subscribe to store so we can key the MapView
  const { dataset, isUpdated } = useDatasetStore();

  const handleCountyClick = (countyData: any) => setSelectedCounty(countyData);

  const statusTag = (imputed: boolean) =>
    imputed ? <Tag color="magenta">Imputed</Tag> : <Tag color="green">Observed</Tag>;

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
          <Card
            style={{ marginTop: 16 }}
            title={
              <Space wrap>
                <Text strong style={{ fontSize: 16 }}>
                  {selectedCounty.county_name || selectedCounty.NAME}
                </Text>
                {selectedCounty.state_name && (
                  <Text type="secondary">({selectedCounty.state_name})</Text>
                )}
                {statusTag(!!selectedCounty.isImputed)}
              </Space>
            }
            extra={
              <Button size="small" onClick={() => setSelectedCounty(null)}>
                Clear
              </Button>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <Text type="secondary">County Code (GEOID):</Text><br />
                <Text strong>{selectedCounty.geoid || selectedCounty.GEOID}</Text>
              </div>
              <div>
                <Text type="secondary">Deaths per 100k:</Text><br />
                <Text strong style={{ color: '#cf1322' }}>
                  {selectedCounty.deaths_per_100k !== undefined
                    ? Number(selectedCounty.deaths_per_100k).toFixed(2)
                    : '—'}
                </Text>
              </div>
            </div>

            {/* NEW: Neighbor list */}
            <div style={{ marginTop: 4 }}>
              <Text strong>Neighboring Counties</Text>
              <List
                style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto' }}
                size="small"
                bordered
                dataSource={(selectedCounty.neighbors as NeighborInfo[]) ?? []}
                locale={{ emptyText: 'No neighbors found' }}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr auto', gap: 8, width: '100%' }}>
                      <div>
                        <div>
                          <Text>{item.name}</Text>{' '}
                          {item.state && <Text type="secondary">({item.state})</Text>}
                        </div>
                        <div>
                          <Text type="secondary">GEOID: </Text>
                          <Text code>{item.geoid}</Text>
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">Deaths per 100k:</Text><br />
                        <Text strong>{item.deaths_per_100k !== undefined ? item.deaths_per_100k.toFixed(2) : '—'}</Text>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {statusTag(item.isImputed)}
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </Card>
        )}
      </Modal>
    </>
  );
};

export default GeoMapModal;
