'use client';

import { useEffect, useState } from 'react';
import { Radio, Select, InputNumber, Button, Progress } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import styles from '@/styles/ImputationConfiguration.module.css';
import {
    fetchDataTypes,
    fetchImputationMask,
    fetchImputationStatus,
    fetchMissingnessSummary,
    runImputation
} from '@/services/apiService';
import { useDatasetStore } from '@/store/useDataStore';
import MissingnessSummaryChart from './MissingnessSummaryChart';
import GeoMapModal from './GeoMapModal';

const { Option } = Select;
const algorithms = ['gKNN', 'MICE', 'BART'];

const algorithmDurations: Record<string, number> = {
    gKNN: 2000,
    MICE: 5000,
    BART: 8000,
};

const ImputationConfiguration: React.FC = () => {
    const { dataset, setUpdated, isUpdated } = useDatasetStore();
    const [selectedAlgorithm, setSelectedAlgorithm] = useState('MICE');
    const [type, setType] = useState<'Single' | 'Multiple'>('Single');
    const [target, setTarget] = useState<string | string[] | undefined>();
    const [maxIteration, setMaxIteration] = useState<number | null>(25);
    const [progress, setProgress] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [imputationReady, setImputationReady] = useState(false); // ✅ controls Map visibility

    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;

    // Load columns that have missingness
    useEffect(() => {
        const loadColumns = async () => {
            try {
                const summary = await fetchMissingnessSummary();
                const cols = summary.filter((s: any) => s.percent > 0).map((s: any) => s.feature);
                setColumns(cols);
            } catch (error) {
                console.error('Failed to fetch columns:', error);
                setColumns([]);
            }
        };
        loadColumns();
    }, [dataset]);

    // Default the Target dropdown to the first available column (and keep it valid when columns update)
    useEffect(() => {
        if (columns.length === 0) {
            setTarget(undefined);
            return;
        }

        if (typeof target === 'undefined') {
            setTarget(type === 'Multiple' ? [columns[0]] : columns[0]);
            return;
        }

        if (Array.isArray(target)) {
            const filtered = target.filter((c) => columns.includes(c));
            if (filtered.length === 0) {
                setTarget([columns[0]]);
            } else if (filtered.length !== target.length) {
                setTarget(filtered);
            }
        } else {
            if (!columns.includes(target)) {
                setTarget(columns[0]);
            }
        }
    }, [columns, type]);

    // Check imputation status whenever inputs change
    useEffect(() => {
        checkImputationStatus();
    }, [dataset, columns, selectedAlgorithm, target, maxIteration, sessionId, isUpdated]);

    const checkImputationStatus = async () => {
        // Reset to false by default
        setImputationReady(false);

        if (!target || !maxIteration || !sessionId) return;

        const selectedColumns = Array.isArray(target) ? target : [target];

        try {
            const resp = await fetchImputationStatus({
                algo: selectedAlgorithm,
                columns: selectedColumns,
                iterations: maxIteration,
            });

            // Be tolerant of different response shapes:
            // - boolean
            // - { done: boolean } or { isDone: boolean } or { status: 'done'|'pending' }
            const ready =
                resp === true ||
                resp?.done === true ||
                resp?.isDone === true ||
                (typeof resp?.status === 'string' && resp.status.toLowerCase() === 'done');

            setImputationReady(!!ready);
        } catch (e) {
            console.error('fetchImputationStatus failed:', e);
            setImputationReady(false);
        }
    };

    const handleRunImputation = async () => {
        if (!target || !maxIteration || !sessionId) return;

        const selectedColumns = Array.isArray(target) ? target : [target];

        setProgress(0);
        setLoading(true);

        const duration = algorithmDurations[selectedAlgorithm];
        const start = Date.now();

        const timer = setInterval(() => {
            const elapsed = Date.now() - start;
            const percent = Math.min(Math.floor((elapsed / duration) * 100), 100);
            setProgress(percent);

            if (percent >= 100) {
                clearInterval(timer);
            }
        }, 200);

        try {
            const response = await runImputation({
                algo: selectedAlgorithm,
                columns: selectedColumns,
                iterations: maxIteration,
            });

            console.log('Response:', response);
            setUpdated(!isUpdated);
            setImputationReady(true); // ✅ imputation now done; reveal Map
        } catch (error: any) {
            console.error(error);
            setImputationReady(false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ChartWrapper
            title="Imputation Configuration"
            tooltipContent={
                <div style={{ maxWidth: 300 }}>
                    <p><strong>Configure the imputation algorithm</strong> by choosing the type, target, and max iterations.</p>
                    <p>Click "Run Imputation" to begin.</p>
                </div>
            }
        >
            <div className={styles.container}>
                <div className={styles.sidebar}>
                    {algorithms.map((algo) => (
                        <div
                            key={algo}
                            className={`${styles.algorithm} ${selectedAlgorithm === algo ? styles.selected : ''}`}
                            onClick={() => setSelectedAlgorithm(algo)}
                        >
                            {algo}
                        </div>
                    ))}
                </div>

                <div className={styles.configPanel}>
                    {/* If you want to enable Single/Multiple later, this block is ready */}
                    {/*
          <div className={styles.formRow}>
            <label>Type:</label>
            <Radio.Group
              onChange={(e) => {
                setType(e.target.value);
                setTarget(undefined);
              }}
              value={type}
              className={styles.radioGroup}
            >
              <Radio value="Single">Single</Radio>
              <Radio value="Multiple">Multiple</Radio>
            </Radio.Group>
          </div>
          */}

                    <div className={styles.formRow}>
                        <label>Target:</label>
                        <Select
                            mode={type === 'Multiple' ? 'multiple' : undefined}
                            style={{ width: '100%' }}
                            placeholder="Select column(s)"
                            onChange={(value) => setTarget(value as any)}
                            value={target as any}
                        >
                            {columns.map((col) => (
                                <Option key={col} value={col}>
                                    {col}
                                </Option>
                            ))}
                        </Select>
                    </div>

                    <div className={styles.formRow}>
                        <label>Max Iteration:</label>
                        <InputNumber
                            min={1}
                            style={{ width: '100%' }}
                            value={maxIteration ?? undefined}
                            onChange={(value) => setMaxIteration(value ?? null)}
                        />
                    </div>

                    <div className={styles.buttonRow}>
                        <Button type="primary" onClick={handleRunImputation} loading={loading} disabled={loading}>
                            Run Imputation
                        </Button>

                        {/* ✅ Show Map button only when imputation is done */}
                        {imputationReady && (
                            <>
                                <Button>
                                    <GeoMapModal />
                                </Button>
                                <Button 
                                    type="default" 
                                    onClick={async () => {
                                        const sessionId = localStorage.getItem('session_id');
                                        if (!sessionId) {
                                            console.error('No session ID found');
                                            return;
                                        }
                                        try {
                                            const response = await fetch(`http://localhost:8000/dataframe/download_imputed_csv?session_id=${sessionId}`);
                                            if (!response.ok) {
                                                throw new Error('Failed to download CSV');
                                            }
                                            const blob = await response.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `imputed_data_${sessionId}.csv`;
                                            document.body.appendChild(a);
                                            a.click();
                                            a.remove();
                                            window.URL.revokeObjectURL(url);
                                        } catch (error) {
                                            console.error('Error downloading CSV:', error);
                                        }
                                    }}
                                >
                                    Download CSV
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Optional: show a progress bar if you decide to re-enable it */}
                    {/*
          {loading && (
            <div className={styles.progressBar}>
              <Progress percent={progress} showInfo={false} status="active" />
            </div>
          )}
          */}
                </div>
            </div>
        </ChartWrapper>
    );
};

export default ImputationConfiguration;
