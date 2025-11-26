from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import numpy as np
import pandas as pd
import io
from customLabelEncoder import CustomLabelEncoder


class RandomForestImputer:
    def __init__(self, df, cols, max_iter=25, random_state=42, treat_none_as_category=False):
        self.df = df.copy()
        self.cols = cols
        self.max_iter = max_iter
        self.random_state = random_state
        self.label_encoders = {}  # Store encoders for each non-numeric column
        self.treat_none_as_category = treat_none_as_category
        # new variables to hold CSV output
        self.imputed_csv = None
        self.imputed_csv_bytes = None

    def encode_categoricals(self):
        """
        Encodes all non-numeric columns using CustomLabelEncoder.
        """
        non_numeric_cols = self.df.select_dtypes(exclude=[np.number]).columns.tolist()

        for col in non_numeric_cols:
            encoder = CustomLabelEncoder(treat_none_as_category=self.treat_none_as_category)
            self.df[col] = encoder.fit_transform(self.df, col)
            self.label_encoders[col] = encoder

    def impute(self):
        """
        Imputes missing values using Random Forest (via IterativeImputer) across specified columns.
        Also masks 20% of existing non-null values in target columns for evaluation,
        and returns both full and evaluation-specific results. Also creates a CSV
        representation of the imputed dataframe (in-memory) and stores it on the instance.
        """
        if not isinstance(self.cols, list):
            raise ValueError("The 'cols' parameter must be a list of column names.")

        for col in self.cols:
            if col not in self.df.columns:
                raise ValueError(f"Column '{col}' not found in DataFrame.")

        # Encode non-numeric columns before imputation
        self.encode_categoricals()

        # Get only numeric columns (which now includes encoded categoricals)
        numerical_cols = self.df.select_dtypes(include=[np.number]).columns.tolist()

        # Ensure all columns to be imputed are numerical
        for col in self.cols:
            if col not in numerical_cols:
                raise ValueError(f"Column '{col}' is not numeric after encoding. Cannot proceed with Random Forest imputation.")

        # Save original values and mask
        original_series = self.df[self.cols].copy()

        # Mask 20% of existing non-null values in each column
        evaluation_mask = pd.DataFrame(False, index=self.df.index, columns=self.cols)
        np.random.seed(self.random_state)

        # Create combined mask for specified columns (e.g., 'deaths_per_100k' and 'county code')
        if 'County Code' in self.df.columns:
            combined_mask = self.df[self.cols + ['County Code']]
        else:
            combined_mask = self.df[self.cols]
        # Traverse combined_mask on column Deaths_per_100k
        for idx, value in combined_mask[self.cols[0]].items():
            if pd.notna(value):
                combined_mask.at[idx, self.cols[0]] = False
            else:
                combined_mask.at[idx, self.cols[0]] = True

        for col in self.cols:
            non_null_indices = self.df[self.df[col].notna()].index
            sample_size = int(0.2 * len(non_null_indices))
            if sample_size > 0:
                sample_indices = np.random.choice(non_null_indices, size=sample_size, replace=False)
                evaluation_mask.loc[sample_indices, col] = True
                self.df.loc[sample_indices, col] = np.nan  # Mask for evaluation

        # Impute using IterativeImputer with RandomForestRegressor
        # n_jobs=-1 uses all available cores
        rf_estimator = RandomForestRegressor(n_jobs=-1, random_state=self.random_state)
        imputer = IterativeImputer(estimator=rf_estimator, max_iter=self.max_iter, random_state=self.random_state)
        imputed_values = imputer.fit_transform(self.df[numerical_cols])

        # Update self.df with imputed values
        imputed_array = pd.DataFrame(imputed_values, columns=numerical_cols, index=self.df.index)
        self.df[numerical_cols] = imputed_array[numerical_cols]

        # After merging imputed columns into self.df, create CSV (in-memory) for download
        merged_df = self.df.copy()
        # CSV as string
        self.imputed_csv = merged_df.to_csv(index=False)
        # CSV as bytes buffer (useful for sending as downloadable file in web frameworks)
        self.imputed_csv_bytes = io.BytesIO(self.imputed_csv.encode('utf-8'))

        # Extract original and imputed values for:
        orig_values = original_series.dropna()
        imputed_values_only = self.df.loc[combined_mask[self.cols[0]], self.cols]
        combined = self.df[self.cols].copy()

        # Extract only 20% evaluation mask values separately
        original_values_20 = original_series[evaluation_mask]
        imputed_values_20 = self.df[self.cols][evaluation_mask]

        # Calculate MAE and RMSE for the 20% test data
        evaluation_metrics = {}
        for col in self.cols:
            col_mask = evaluation_mask[col]
            if col_mask.sum() > 0:  # Only calculate if there are masked values
                original_col = original_series.loc[col_mask, col].dropna()
                imputed_col = self.df.loc[col_mask, col].dropna()
                
                # Align indices to ensure we're comparing the same values
                common_idx = original_col.index.intersection(imputed_col.index)
                if len(common_idx) > 0:
                    orig_vals = original_col.loc[common_idx].values
                    imp_vals = imputed_col.loc[common_idx].values
                    
                    mae = mean_absolute_error(orig_vals, imp_vals)
                    mse = mean_squared_error(orig_vals, imp_vals)
                    rmse = np.sqrt(mse)
                    
                    evaluation_metrics[col] = {
                        'MAE': float(mae),
                        'RMSE': float(rmse),
                        'MSE': float(mse),
                        'n_samples': len(common_idx)
                    }
                    
                    # print(f"\n20% Test Evaluation Metrics for '{col}':")
                    # print(f"  Number of test samples: {len(common_idx)}")
                    # print(f"  MAE:  {mae:.4f}")
                    # print(f"  RMSE: {rmse:.4f}")
                    # print(f"  MSE:  {mse:.4f}")

        return orig_values, imputed_values_only, combined, combined_mask, original_values_20, imputed_values_20, evaluation_mask, self.imputed_csv, {}
