import axios from 'axios';

export const API_BASE_URL = 'http://127.0.0.1:8000';

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
    const response = await axios.post(`${API_BASE_URL}/api/datatype/configure`, formData, {
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
    const response = await axios.get(`${API_BASE_URL}/api/dataframe/describe`, {
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
      `${API_BASE_URL}/api/feature_importance`,
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
    const response = await axios.post(`${API_BASE_URL}/api/dataframe/post`, formData, {
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
