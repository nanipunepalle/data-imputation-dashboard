'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Button, Upload, Select, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { DataRow, Dataset } from '@/types';
import DataTypeModal from './DataTypeConfigurationModal';
import ChartWrapper from '@/components/ChartWrapper';
import { uploadDataset } from '@/services/apiService';
import styles from '@/styles/DataConfiguration.module.css';
import DataPreview from './DataPreview';
import { useDatasetStore } from '@/store/useDataStore';

const { Option } = Select;

interface DatasetUploadProps {
  onDataUpload: (data: Dataset) => void;
  headers: string[];
  targetColumn: string | null;
  setTargetColumn: (value: string | null) => void;
  idColumn: string | null;
  setIdColumn: (value: string | null) => void;
  inModal?: boolean;
}

const DataConfiguration: React.FC<DatasetUploadProps> = ({
  onDataUpload,
  headers,
  targetColumn,
  setTargetColumn,
  idColumn,
  setIdColumn,
  inModal
}) => {

  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    fileName,
    setFileName,
    isUploaded,
    setIsUploaded,
    uploadedFile,
    setUploadedFile,
    error,
    setError,
  } = useDatasetStore();


  const handleFileChange = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      message.error('Please upload a CSV file');
      setIsUploaded(false);
      return false;
    }

    setUploadedFile(file);

    try {
      await uploadDataset(file);
    } catch (error) {
      console.error('Error uploading file:', error);
    }

    Papa.parse(file, {
      complete: (result) => {
        const parsedData = result.data as string[][];
        if (parsedData.length < 2) {
          setError('CSV file is empty or invalid');
          setIsUploaded(false);
          return;
        }

        const headers = parsedData[0];
        const rows = parsedData.slice(1).map((row) =>
          headers.reduce((obj, header, i) => {
            const value = row[i];
            const num = Number(value);
            obj[header] = isNaN(num) ? value : Math.round(num * 100) / 100;
            return obj;
          }, {} as DataRow)
        );

        onDataUpload({ headers, rows });
        setError(null);
        setFileName(file.name);
        setIsUploaded(true);
        return false;
      },
      header: false,
      skipEmptyLines: true,
      error: () => {
        setError('Error parsing CSV file');
        setIsUploaded(false);
      },
    });

    return false;
  };

  const content = (
    <div className={styles.container}>
      <div className={styles.uploadRow}>
        <Upload
          beforeUpload={handleFileChange}
          showUploadList={false}
          accept=".csv"
          customRequest={() => { }}
        >
          <Button icon={<UploadOutlined />}>Upload CSV</Button>
        </Upload>
        {fileName && <span className={styles.uploadFileName}>{fileName}</span>}
      </div>

      {isUploaded && (
        <div>
          <div className={styles.dropdownGroup}>
            <div className={styles.dropdownItem}>
              <label>Target Column</label>
              <Select
                value={targetColumn}
                onChange={setTargetColumn}
                placeholder="Select Target"
              >
                {headers.map((header) => (
                  <Option key={header} value={header}>
                    {header}
                  </Option>
                ))}
              </Select>
            </div>
            <div className={styles.dropdownItem}>
              <label>ID Column</label>
              <Select
                value={idColumn}
                onChange={setIdColumn}
                placeholder="Select ID"
              >
                {headers.map((header) => (
                  <Option key={header} value={header}>
                    {header}
                  </Option>
                ))}
              </Select>
            </div>
          </div>
          <div className={styles.tableSection}>
            <DataPreview></DataPreview>
          </div>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <DataTypeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={() => { }}
        availableColumns={headers}
        file={uploadedFile as File}
      />
    </div>
  );

  return (
    <ChartWrapper
      title="Data Configuration"
      tooltipContent={
        <div style={{ maxWidth: 300 }}>
          <p><strong>Data Configuration</strong> allows you to upload a dataset and select the target and ID columns.</p>
          <p>You can also open the modal to configure column data types.</p>
        </div>
      }
      controls={
        <Button
          type="link"
          size="small"
          disabled={!isUploaded}
          onClick={() => setIsModalOpen(true)}
        >
          Configure Data Type
        </Button>
      }
      inModal={inModal}
      modalContent={<DataConfiguration onDataUpload={onDataUpload} headers={headers} targetColumn={targetColumn} setTargetColumn={setTargetColumn} idColumn={idColumn} setIdColumn={setIdColumn} inModal={true}></DataConfiguration>}
    >
      {content}
    </ChartWrapper>
  );
};

export default DataConfiguration;
