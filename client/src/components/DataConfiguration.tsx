'use client';

import { useState, useEffect, useRef } from 'react';
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

  // Prevent double init in React 18 StrictMode
  const didInitRef = useRef(false);

  // Reusable CSV parse + state setter
  const parseFileAndSetState = async (file: File) =>
    new Promise<void>((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (result) => {
          const parsedData = result.data as string[][];
          if (parsedData.length < 2) {
            setError('CSV file is empty or invalid');
            setIsUploaded(false);
            reject(new Error('Empty/invalid CSV'));
            return;
          }

          const parsedHeaders = parsedData[0];
          const rows = parsedData.slice(1).map((row) =>
            parsedHeaders.reduce((obj, header, i) => {
              const value = row[i];
              const num = Number(value);
              (obj)[header] = isNaN(num) ? value : Math.round(num * 100) / 100;
              return obj;
            }, {} as DataRow)
          );

          onDataUpload({ headers: parsedHeaders, rows });
          setError(null);
          setFileName(file.name);
          setIsUploaded(true);
          resolve();
        },
        error: (err) => {
          setError('Error parsing CSV file');
          setIsUploaded(false);
          reject(err);
        },
      });
    });

  useEffect(() => {
    // If no file has been uploaded yet, fetch sample.csv, upload it to the server, and parse it.
    if (didInitRef.current) return;
    didInitRef.current = true;

    const initWithSample = async () => {
      try {
        if (isUploaded || uploadedFile) return;

        const res = await fetch('/sample.csv');
        if (!res.ok) {
          throw new Error(`Failed to fetch sample.csv: ${res.status}`);
        }

        // Turn fetched blob into a File so it can be uploaded and parsed uniformly
        const blob = await res.blob();
        const sampleFile = new File([blob], 'sample.csv', { type: 'text/csv' });

        setUploadedFile(sampleFile);

        // 1) send to backend
        await uploadDataset(sampleFile);

        // 2) parse locally for preview
        await parseFileAndSetState(sampleFile);
      } catch (e) {
        console.error(e);
        setError('Failed to load or parse sample dataset');
      }
    };

    void initWithSample();
  }, [isUploaded, uploadedFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      message.error('Please upload a CSV file');
      setIsUploaded(false);
      return false;
    }

    try {
      setUploadedFile(file);
      // send to backend
      await uploadDataset(file);
      // parse for preview
      await parseFileAndSetState(file);
      message.success(`Loaded ${file.name}`);
    } catch (err) {
      console.error('Error uploading/parsing file:', err);
      // parseFileAndSetState already sets error when parsing fails
    }

    // prevent antd Upload from auto-uploading
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
          <div className={styles.tableSection}>
            <DataPreview />
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
          <p>If nothing is uploaded, a built-in sample is loaded and also sent to the server.</p>
        </div>
      }
      // controls={
      //   <Button
      //     type="link"
      //     size="small"
      //     disabled={!isUploaded}
      //     onClick={() => setIsModalOpen(true)}
      //   >
      //     Configure Data Type
      //   </Button>
      // }
      inModal={inModal}
      modalContent={
        <DataConfiguration
          onDataUpload={onDataUpload}
          headers={headers}
          targetColumn={targetColumn}
          setTargetColumn={setTargetColumn}
          idColumn={idColumn}
          setIdColumn={setIdColumn}
          inModal={true}
        />
      }
    >
      {content}
    </ChartWrapper>
  );
};

export default DataConfiguration;
