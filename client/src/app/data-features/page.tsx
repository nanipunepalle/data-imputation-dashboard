'use client';

import React from 'react';
import { Row, Col } from 'antd';
import styles from './dataFeatures.module.css';
import DataConfiguration from '@/components/DataConfiguration';
import { useDatasetStore } from '@/store/useDataStore';
import MissingnessSummaryChart from '@/components/MissingnessSummaryChart';
import FeatureImportanceChart from '@/components/FeatureImportanceChart';
import { Dataset } from '@/types';

const DataFeatures: React.FC = () => {
    const {
        dataset,
        targetColumn,
        idColumn,
        setDataset,
        setTargetColumn,
        setIdColumn
    } = useDatasetStore();

    const handleDataUpload = (data: Dataset) => {
        setDataset(data);
        setTargetColumn(data.headers[0] || null);
        setIdColumn(data.headers[1] || null);
    };
    return (
        <Row gutter={[8, 8]} style={{ marginLeft: "4px", marginRight: "4px" }}>
            <Col xs={24} lg={8} >
                <div className={styles.columnBox}>
                    <DataConfiguration
                        onDataUpload={handleDataUpload}
                        headers={dataset?.headers || []}
                        targetColumn={targetColumn}
                        setTargetColumn={setTargetColumn}
                        idColumn={idColumn}
                        setIdColumn={setIdColumn}>
                    </DataConfiguration>
                </div>
            </Col>
            <Col xs={24} lg={8} >
                <div className={styles.columnBox}>
                    <MissingnessSummaryChart data={dataset}></MissingnessSummaryChart>
                </div>
            </Col>
            <Col xs={24} lg={8}>
                <div className={styles.columnBox}>
                    <FeatureImportanceChart></FeatureImportanceChart>
                </div>
            </Col>
            <Col xs={24} lg={8}>
                <div className={styles.columnBox}>
                    {/* <FeatureImportanceSplit></FeatureImportanceSplit> */}
                </div>
            </Col>
            <Col xs={24} lg={16}>
                <div className={styles.columnBox}>
                    {/* <ScatterPlotD3></ScatterPlotD3> */}
                </div>
            </Col>
        </Row>
    );
};

export default DataFeatures;
