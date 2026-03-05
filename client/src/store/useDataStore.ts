// src/store/useDatasetStore.ts
import { create } from 'zustand';
import { Dataset } from '@/types';

interface DatasetState {
  dataset: Dataset | null;
  targetColumn: string | null;
  idColumn: string | null;
  fileName: string | null;
  uploadedFile: File | null;
  isUploaded: boolean;
  error: string | null;
  isUpdated: boolean
  chartsReset: boolean;
  selectedAlgorithm: string | null;

  setDataset: (data: Dataset) => void;
  setTargetColumn: (column: string | null) => void;
  setIdColumn: (column: string | null) => void;
  setFileName: (name: string | null) => void;
  setUploadedFile: (file: File | null) => void;
  setIsUploaded: (flag: boolean) => void;
  setError: (err: string | null) => void;
  setUpdated: (flag: boolean) => void
  resetCharts: () => void;
  setSelectedAlgorithm: (algo: string) => void;
}

export const useDatasetStore = create<DatasetState>((set) => ({
  dataset: null,
  targetColumn: null,
  idColumn: null,
  fileName: null,
  uploadedFile: null,
  isUploaded: false,
  error: null,
  isUpdated: false,
  chartsReset: false,
  selectedAlgorithm: null,

  setDataset: (dataset) => set({ dataset }),
  setTargetColumn: (targetColumn) => set({ targetColumn }),
  setIdColumn: (idColumn) => set({ idColumn }),
  setFileName: (fileName) => set({ fileName }),
  setUploadedFile: (uploadedFile) => set({ uploadedFile }),
  setIsUploaded: (isUploaded) => set({ isUploaded }),
  setError: (error) => set({ error }),
  setUpdated: (isUpdated) => set({ isUpdated }),
  resetCharts: () => set((state) => ({ chartsReset: !state.chartsReset })),
  setSelectedAlgorithm: (selectedAlgorithm) => set({ selectedAlgorithm }),
}));
