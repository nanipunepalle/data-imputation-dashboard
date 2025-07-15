'use client';

import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeAlpine } from 'ag-grid-community';
import styles from '@/styles/DataPreview.module.css';
import { useDatasetStore } from '@/store/useDataStore';

// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule]);


const DataPreview: React.FC = () => {
  const { dataset } = useDatasetStore();

  const rowData = useMemo(() => {
    if (!dataset || !dataset.rows.length) return [];
    return dataset.rows;
  }, [dataset]);

  const columnDefs = useMemo(() => {
    if (!dataset || !dataset.headers.length) return [];
    return dataset.headers.map((header) => ({
      headerName: header,
      field: header,
      sortable: true,
      filter: true,
      resizable: true,
    }));
  }, [dataset]);

  if (!dataset || !dataset.rows.length) {
    return <div className={styles.noData}>No data to display</div>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.tableContainer}>
        <div
          className="ag-theme-alpine"
          style={
            {
              '--ag-data-font-size': '12px',
              '--ag-header-font-size': '12px',
              height: '100%'
            } as React.CSSProperties
          }
        >
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            domLayout="normal"
            theme={themeAlpine}
            gridOptions={{ rowHeight: 20, headerHeight: 20 }}
          />
        </div>
      </div>
      <div className={styles.footer}>
        <span>Total Rows: {rowData.length}</span>
        <span>Feature Count: {columnDefs.length}</span>
      </div>
    </div>
  );
};

export default DataPreview;
