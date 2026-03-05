'use client';

import { useEffect, useState } from 'react';
import { Table, Spin } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchComparisonTable } from '@/services/apiService';

interface ComparisonRow {
  algorithm: string;
  mae: number;
  rmse: number;
  runtime_seconds: number;
}

const MethodComparisonTable: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
  const { dataset, isUpdated, setSelectedAlgorithm } = useDatasetStore();
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
    setSelectedAlgorithm(algorithm);
  };

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

  const columns = [
    {
      title: 'Algorithm',
      dataIndex: 'algorithm',
      key: 'algorithm',
      render: (text: string) => (
        <span 
          style={{ 
            fontWeight: 600, 
            textTransform: 'capitalize', 
            color: '#1890ff',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
          onClick={() => handleAlgorithmClick(text)}
        >
          {text}
        </span>
      ),
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
        />
      )}
    </ChartWrapper>
  );
};

export default MethodComparisonTable;
