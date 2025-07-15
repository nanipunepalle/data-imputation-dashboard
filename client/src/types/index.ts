/**
 * 
 */
export interface DataRow {
  [key: string]: string | number;
}

/**
 * 
 */
export interface Dataset {
  headers: string[];
  rows: DataRow[];
}