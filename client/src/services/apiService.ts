import axios from 'axios';

export const API_BASE_URL = 'http://localhost:8000';

// Utility to get session_id from localStorage
function getSessionId(): string {
  const sessionId = localStorage.getItem('session_id');
  if (!sessionId) throw new Error('Session ID not found. Please upload a file first.');
  return sessionId;
}

interface ConfigureDataTypeParams {
  file: File;
  column: string;
  dtype: string;
  treat_none_as_category?: boolean;
  custom_encoder?: string;
}

export async function configureDataType({
  file,
  column,
  dtype,
  treat_none_as_category = false,
  custom_encoder,
}: ConfigureDataTypeParams): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('session_id', getSessionId());
  formData.append('column', column);
  formData.append('dtype', dtype);
  formData.append('treat_none_as_category', String(treat_none_as_category));
  if (custom_encoder) {
    formData.append('custom_encoder', custom_encoder);
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/datatype/configure`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error configuring data type:', error);
    throw error;
  }
}

export async function fetchDataTypes(): Promise<Record<string, string>> {
  try {
    const response = await axios.get(`${API_BASE_URL}/dataframe/describe`, {
      params: {
        session_id: getSessionId(),
      },
    });
    return response.data.dtypes || {};
  } catch (error) {
    console.error('Error fetching data types:', error);
    return {};
  }
}

export interface FeatureImportanceResponse {
  Combined_df: Record<string, { Combined: number; Direction_Sign: number }>;
  knee_features: string[];
}

export async function fetchFeatureImportance(
  target: string,
  method: string,
  threshold = 0.1,
  top_n?: number
): Promise<FeatureImportanceResponse> {
  const formData = new FormData();
  formData.append('session_id', getSessionId());
  formData.append('target', target);
  formData.append('method', method);
  formData.append('threshold', String(threshold));
  if (top_n !== undefined) {
    formData.append('top_n', String(top_n));
  }

  try {
    const response = await axios.post<FeatureImportanceResponse>(
      `${API_BASE_URL}/feature_importance`,
      formData
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching feature importance:', error);
    throw error;
  }
}

export async function uploadDataset(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await axios.post(`${API_BASE_URL}/dataframe/post`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const sessionId = response.data.session_id;
    localStorage.setItem('session_id', sessionId);
    return sessionId;
  } catch (error) {
    console.error('Error uploading dataset:', error);
    throw error;
  }
}

export async function fetchMissingnessSummary(): Promise<{ feature: string; percent: number }[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/dataframe/missingness_summary`, {
      params: { session_id: getSessionId() },
    });

    const summary = response.data.missingness_summary || {};
    return Object.entries(summary)
      .map(([feature, percent]) => ({
        feature,
        percent: Number(percent),
      }))
      .sort((a, b) => b.percent - a.percent);
  } catch (error) {
    console.error('Error fetching missingness summary:', error);
    return [];
  }
}

export async function runImputation({
  algo,
  columns,
  iterations,
}: {
  algo: string;
  columns: string[];
  iterations: number;
}): Promise<any> {
  const sessionId = getSessionId();
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('algo', algo.toLowerCase());
  formData.append('columns', JSON.stringify(columns));
  formData.append('iterations', iterations.toString());

  const response = await axios.post(`${API_BASE_URL}/dataframe/impute`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
}

export async function fetchImputationMask(): Promise<{ row: number; column: string; imputed: boolean }[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/dataframe/imputation_mask`, {
      params: { session_id: getSessionId() },
    });
    return response.data.mask || [];
  } catch (error) {
    console.error('Error fetching imputation mask:', error);
    return [];
  }
}

export async function fetchColumnDistribution(column: string): Promise<{ original: number[]; imputed: number[] }> {
  const sessionId = getSessionId();
  const response = await axios.get(`${API_BASE_URL}/dataframe/column_distribution`, {
    params: { session_id: sessionId, column },
  });
  return response.data;
}


export interface TestEvaluationRecord {
  index: number;
  column: string;
  original: number;
  imputed: number;
  absolute_diff: number;
}

export interface TestEvaluationResponse {
  test_evaluation: TestEvaluationRecord[];
  column_list: string[];
  summary: {
    mean_abs_diff: number;
    median_abs_diff: number;
    std_abs_diff: number;
    mae: number;
    rmse: number; 
  };
}

export async function fetchTestEvaluation(): Promise<TestEvaluationResponse> {
  const sessionId = getSessionId();
  try {
    const response = await axios.get(`${API_BASE_URL}/dataframe/test_evaluation`, {
      params: { session_id: sessionId },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching test evaluation:', error);
    throw error;
  }
}

export const fetchScatterPlotData = async (xColumn: string, yColumn: string) => {
  const sessionId = localStorage.getItem("session_id"); // or wherever it's stored
  const res = await fetch(`${API_BASE_URL}/dataframe/scatter_plot_data?session_id=${sessionId}&x_column=${xColumn}&y_column=${yColumn}`);
  if (!res.ok) throw new Error("Failed to fetch scatter plot data");
  return await res.json();
};

export const fetchImputationStatus = async ({
  algo,
  columns,
  iterations,
}: {
  algo: string;
  columns: string[];
  iterations: number;
}) => {
  const sessionId = getSessionId();
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('algo', algo.toLowerCase());
  formData.append('columns', JSON.stringify(columns));
  formData.append('iterations', iterations.toString());

  const response = await axios.post(`${API_BASE_URL}/dataframe/impute/status`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  console.log(response)

  return response.data;
}

// ---- Replace your existing two functions with these ----

export async function fetchPreimputeColumns(params: { use_raw?: boolean } = {}): Promise<string[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/dataframe/preimpute/columns`, {
      params: {
        session_id: getSessionId(),
        use_raw: params.use_raw ?? true,
      },
    });
    return response.data?.columns ?? [];
  } catch (error) {
    console.error('Error fetching pre-impute columns:', error);
    throw error;
  }
}


interface PreimputeScatterParams {
  x_column: string;
  y_column: string;
  target_column: string;   // NEW required field
  sample_size?: number;
}

export async function fetchPreimputeScatter(params: PreimputeScatterParams) {
  if (!params?.x_column || !params?.y_column || !params?.target_column) {
    throw new Error('x_column, y_column, and target_column are required');
  }
  try {
    const response = await axios.get(`${API_BASE_URL}/dataframe/preimpute/scatter`, {
      params: {
        session_id: getSessionId(),
        x_column: params.x_column,
        y_column: params.y_column,
        target_column: params.target_column,  // pass through
        ...(params.sample_size ? { sample_size: params.sample_size } : {}),
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Error fetching pre-impute scatter:', error?.response?.data ?? error);
    throw new Error(
      (error?.response?.data && typeof error.response.data === 'string')
        ? error.response.data
        : 'Failed to fetch pre-impute scatter'
    );
  }
}

export interface ScatterPoint {
  x: number;
  y: number;
  label?: 'Imputed'|'Rest';
}

export interface MapDataResponse {
  x_column: string;
  y_column: string;
  points: ScatterPoint[];
}

export async function fetchMapData(): Promise<MapDataResponse> {
  try {
    const response = await axios.get(`${API_BASE_URL}/dataframe/scatter_plot_data`, {
      params: {
        session_id: getSessionId(),
        x_column: 'County Code',
        y_column: 'Deaths_per_100k',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching map data:', error);
    throw error;
  }
}

// --- Neighbor map ------------------------------------------------------------
export async function fetchNeighborMap() {
  const res = await fetch(`${API_BASE_URL}/dataframe/neighbor_map?session_id=${getSessionId()}`);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Neighbor map fetch failed: ${res.status} ${msg}`);
  }
  const data = await res.json();
  return data.neighbor_map as Record<string, any>;
}

