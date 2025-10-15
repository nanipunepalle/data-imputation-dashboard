'use client';

import React from 'react';
import { Row, Col } from 'antd';
import styles from './dataFeatures.module.css';
import DataConfiguration from '@/components/DataConfiguration';
import { useDatasetStore } from '@/store/useDataStore';
import MissingnessSummaryChart from '@/components/MissingnessSummaryChart';
import ImputationConfiguration from '@/components/ImputationConfiguration';
import HistogramImputation from '@/components/ImputationDistributionHistogramChart';
import AbsoluteDifferenceHistogram from '@/components/AbsoluteDifferenceHistogramChart';
import ImputedScatterPlot from '@/components/ImputedScatterChart';
import { HourglassOutlined } from '@ant-design/icons';
import { Dataset } from '@/types';
import ScatterChart from '@/components/PreImputeScatterChart';
import PreImputeScatterPlot from '@/components/PreImputeScatterChart';

const DataFeatures: React.FC = () => {
  const {
    dataset,
    targetColumn,
    idColumn,
    setDataset,
    setTargetColumn,
    setIdColumn,
  } = useDatasetStore();

  const handleDataUpload = (data: Dataset) => {
    setDataset(data);
    setTargetColumn(data.headers[0] || null);
    setIdColumn(data.headers[1] || null);
  };

  return (
    <Row gutter={[8, 0]} style={{ marginLeft: '4px', marginRight: '4px' }}>
      {/* Column 1 */}
      <Col xs={24} lg={8}>
        <div className={styles.stack}>
          <div className={`${styles.columnBox} ${styles.thirdHeight}`}>
            <DataConfiguration
              onDataUpload={handleDataUpload}
              headers={dataset?.headers || []}
              targetColumn={targetColumn}
              setTargetColumn={setTargetColumn}
              idColumn={idColumn}
              setIdColumn={setIdColumn}
            />
          </div>

          <div className={`${styles.columnBox} ${styles.thirdHeight}`}>
            <ImputationConfiguration />
          </div>

          <div className={`${styles.columnBox} ${styles.thirdHeight}`}>
            <MissingnessSummaryChart data={dataset} />
          </div>
        </div>
      </Col>

      {/* Column 2 */}
      <Col xs={24} lg={8}>
        <div className={styles.stack}>
          <div className={`${styles.columnBox} ${styles.halfHeight}`}>
            {/* <div className={styles.centerFill}>
              <HourglassOutlined style={{ fontSize: 20, color: '#faad14', marginRight: 8 }} />
              <span>Plot yet to be implemented</span>
            </div> */}
            <PreImputeScatterPlot></PreImputeScatterPlot>
          </div>

          <div className={`${styles.columnBox} ${styles.halfHeight}`}>
            <ImputedScatterPlot />
          </div>
        </div>
      </Col>

      {/* Column 3 */}
      <Col xs={24} lg={8}>
        <div className={styles.stack}>
          <div className={`${styles.columnBox} ${styles.halfHeight}`}>
            <HistogramImputation />
          </div>

          <div className={`${styles.columnBox} ${styles.halfHeight}`}>
            <AbsoluteDifferenceHistogram />
          </div>
        </div>
      </Col>
    </Row>
  );
};

export default DataFeatures;
