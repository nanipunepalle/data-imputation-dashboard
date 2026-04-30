'use client';

import { useEffect, useMemo, useState } from 'react';
import { Table, Spin } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchComparisonTable } from '@/services/apiService';
import styles from '@/styles/MethodComparisonTable.module.css';

interface ComparisonRow {
  algorithm: string;
  mae: number;
  rmse: number;
  runtime_seconds: number;
}

const MethodComparisonTable: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
  const { dataset, isUpdated, selectedAlgorithm, setSelectedAlgorithm } = useDatasetStore();
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await fetchComparisonTable();
      setComparisonData(data.comparison_data);
    } catch (error) {
      console.error('Error fetching comparison table:', error);
      setComparisonData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAlgorithmClick = (algorithm: string) => {
    // Normalize algorithm name to match the sidebar format
    const normalized = normalizeAlgorithmName(algorithm);
    setSelectedAlgorithm(normalized);
  };

  // Normalize algorithm names to handle case sensitivity
  const normalizeAlgorithmName = (name: string): string => {
    const mapping: Record<string, string> = {
      'mice': 'MICE',
      'gknn': 'gKNN',
      'random forest': 'Random Forest',
      'xgboost': 'XGBoost',
      'knn regressor': 'KNN Regressor',
    };
    return mapping[name.toLowerCase()] || name;
  };

  const normalizedSelectedAlgorithm = useMemo(() => {
    if (!selectedAlgorithm) return null;
    return normalizeAlgorithmName(selectedAlgorithm);
  }, [selectedAlgorithm]);

  // Fetch on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Fetch when dataset updates
  useEffect(() => {
    if (dataset && isUpdated !== undefined) {
      fetchData();
    }
  }, [dataset, isUpdated]);

  const bestRmse = useMemo(() => {
    const validRmseValues = comparisonData
      .map((row) => row.rmse)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (!validRmseValues.length) {
      return null;
    }

    return Math.min(...validRmseValues);
  }, [comparisonData]);

  const columns = [
    {
      title: 'Algorithm',
      dataIndex: 'algorithm',
      key: 'algorithm',
      render: (text: string) => {
        const normalizedRowAlgorithm = normalizeAlgorithmName(text);
        const isActive = normalizedSelectedAlgorithm === normalizedRowAlgorithm;

        return (
          <div className={styles.algorithmCell}>
            <span className={`${styles.activeDot} ${isActive ? styles.activeDotVisible : ''}`}>●</span>
            <span
              className={styles.algorithmLink}
              onClick={(e) => {
                e.stopPropagation();
                handleAlgorithmClick(text);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleAlgorithmClick(text);
                }
              }}
            >
              {text}
            </span>
          </div>
        );
      },
    },
    {
      title: 'MAE',
      dataIndex: 'mae',
      key: 'mae',
      render: (value: number) => value?.toFixed(4) ?? 'N/A',
      sorter: (a: ComparisonRow, b: ComparisonRow) => a.mae - b.mae,
    },
    {
      title: 'RMSE',
      dataIndex: 'rmse',
      key: 'rmse',
      render: (value: number) => value?.toFixed(4) ?? 'N/A',
      sorter: (a: ComparisonRow, b: ComparisonRow) => a.rmse - b.rmse,
    },
    {
      title: 'ΔRMSE',
      key: 'delta_rmse',
      render: (_: unknown, record: ComparisonRow) => {
        if (bestRmse === null || typeof record.rmse !== 'number' || !Number.isFinite(record.rmse)) {
          return 'N/A';
        }

        const delta = record.rmse - bestRmse;
        return `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`;
      },
      sorter: (a: ComparisonRow, b: ComparisonRow) => a.rmse - b.rmse,
    },
    {
      title: 'Runtime',
      dataIndex: 'runtime_seconds',
      key: 'runtime_seconds',
      render: (value: number) => {
        if (!value && value !== 0) return 'N/A';
        if (value < 1) return `${(value * 1000).toFixed(0)}ms`;
        if (value < 60) return `${value.toFixed(2)}s`;
        const minutes = Math.floor(value / 60);
        const seconds = (value % 60).toFixed(0);
        return `${minutes}m ${seconds}s`;
      },
      sorter: (a: ComparisonRow, b: ComparisonRow) => a.runtime_seconds - b.runtime_seconds,
    },
  ];

  return (
    <ChartWrapper
      title="Method Comparison Summary"
      tooltipContent="Comparison of MAE, RMSE, ΔRMSE, and runtime across all executed imputation algorithms"
    //   description="Comparison of MAE, RMSE, and runtime across all executed imputation algorithms"
      inModal={inModal}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          dataSource={comparisonData}
          columns={columns}
          rowKey="algorithm"
          pagination={false}
          size="middle"
          bordered
          style={{ marginTop: '16px' }}
          rowClassName={(record: ComparisonRow) => {
            const normalizedRowAlgorithm = normalizeAlgorithmName(record.algorithm);
            const isActive = normalizedSelectedAlgorithm === normalizedRowAlgorithm;
            return isActive ? styles.activeRow : '';
          }}
          onRow={(record: ComparisonRow) => ({
            onClick: () => handleAlgorithmClick(record.algorithm),
          })}
        />
      )}
    </ChartWrapper>
  );
};

export default MethodComparisonTable;
