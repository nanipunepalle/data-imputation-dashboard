import numpy as np
import pandas as pd
import os
import matplotlib.pyplot as plt
from sklearn.model_selection import KFold
from sklearn.metrics import mean_absolute_error, mean_squared_error
from imputation import impute_death_rate

def validate_imputation_kfold(cdc_data, distance_matrix, target, k=5, n_splits=5, plot=False):
    """
    Perform k-fold cross-validation to evaluate the imputation of Deaths_per_100k.
    
    For each fold, the test indices have their Deaths_per_100k temporarily set to NaN,
    and imputation is performed using the remaining data (and the full distance_matrix).
    Then, the imputed values are compared to the actual values.
    
    Additionally, this function aggregates the actual and imputed values across all folds
    and plots a scatter plot (Actual vs. Imputed) with an ideal fit line.
    
    Parameters:
        cdc_data (pd.DataFrame): DataFrame with reliable Deaths_per_100k values.
                                 Must contain at least the columns 'Deaths_per_100k' and 'Socio_Index'.
        distance_matrix (np.array): The combined distance matrix corresponding to cdc_data rows.
        target (str): Name of the target column, e.g. "Deaths_per_100k".
        k (int): The number of neighbors to use in the imputation.
        n_splits (int): Number of folds for cross-validation.
        
    Returns:
        dict: A dictionary containing the averaged error metrics:
              - MAE: Mean Absolute Error
              - MSE: Mean Squared Error
              - RMSE: Root Mean Squared Error
              - NRMSE: Normalized Root Mean Squared Error
              - Correlation: Pearson correlation coefficient between actual and imputed values.
    """
    # Initialize lists for error metrics
    mae_list, mse_list, rmse_list, nrmse_list, corr_list = [], [], [], [], []
    overall_actual_vals, overall_imputed_vals = [], []
    
    # Filter to only include rows with a defined target and Socio_Index
    cdc_data = cdc_data[~cdc_data[target].isna()]
    cdc_data = cdc_data[cdc_data['Socio_Index'].notna()]
    all_labels = cdc_data.index.tolist()
    
    # Create a KFold splitter
    kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)
    
    for train_index, test_index in kf.split(all_labels):
        # Map positions back to actual index labels
        train_labels = [all_labels[i] for i in train_index]
        test_labels = [all_labels[i] for i in test_index]
        
        # Copy the data for this fold and mask the target in the test set
        fold_data = cdc_data.copy()
        actual_values_fold = fold_data.loc[test_labels, target].copy()
        fold_data.loc[test_labels, target] = np.nan
        
        imputed_vals, actual_vals = [], []
        
        # Impute each test instance
        for idx in test_labels:
            imputed_value, _ = impute_death_rate(idx, fold_data, distance_matrix, k)
            if not np.isnan(imputed_value):
                imputed_vals.append(imputed_value)
                actual_vals.append(actual_values_fold.loc[idx])
        
        # Aggregate overall actual vs imputed values
        overall_actual_vals.extend(actual_vals)
        overall_imputed_vals.extend(imputed_vals)
        
        # Compute error metrics for this fold if available
        if imputed_vals:
            mae = mean_absolute_error(actual_vals, imputed_vals)
            mse = mean_squared_error(actual_vals, imputed_vals)
            rmse = np.sqrt(mse)
            range_val = np.max(actual_vals) - np.min(actual_vals)
            nrmse = rmse / range_val if range_val != 0 else np.nan
            try:
                corr = np.corrcoef(actual_vals, imputed_vals)[0, 1]
            except Exception:
                corr = np.nan
            mae_list.append(mae)
            mse_list.append(mse)
            rmse_list.append(rmse)
            nrmse_list.append(nrmse)
            corr_list.append(corr)
    
    # Average error metrics over all folds
    avg_mae = np.mean(mae_list) if mae_list else np.nan
    avg_mse = np.mean(mse_list) if mse_list else np.nan
    avg_rmse = np.mean(rmse_list) if rmse_list else np.nan
    avg_nrmse = np.mean(nrmse_list) if nrmse_list else np.nan
    avg_corr = np.mean(corr_list) if corr_list else np.nan
    
    metrics = {
        'MAE': avg_mae,
        'MSE': avg_mse,
        'RMSE': avg_rmse,
        'NRMSE': avg_nrmse,
        'Correlation': avg_corr
    }
    
    # Plot scatter of overall actual vs imputed values
    if (plot):
        plt.figure(figsize=(8, 6))
        plt.scatter(overall_actual_vals, overall_imputed_vals, alpha=0.6, label='Counties')
        min_val = min(min(overall_actual_vals), min(overall_imputed_vals))
        max_val = max(max(overall_actual_vals), max(overall_imputed_vals))
        plt.plot([min_val, max_val], [min_val, max_val], 'r--', label='Ideal Fit')
        plt.xlabel("Actual Deaths per 100k")
        plt.ylabel("Imputed Deaths per 100k")
        plt.title("Scatter Plot: Actual vs. Imputed Death Rates")
        plt.legend()
        plt.grid(True)
        plt.show()
    
    return metrics

def validate_imputation_testset(test_indices, final_cdc_data, distance_matrix, target, k, allowed_indices=None):
    """
        Evaluate imputation performance on a dedicated test set.
        
        This function assumes test_data is a DataFrame containing the test counties 
        (e.g., counties with Deaths < 20) with known target values, and that these values 
        represent the 'suppressed' or missing data scenario.
        
        Parameters:
            test_data (pd.DataFrame): Test set with known target values.
            distance_matrix (np.array): The combined distance matrix corresponding to test_data rows.
            target (str): The name of the target column (e.g., "Deaths_per_100k").
            k (int): The number of neighbors to use in the imputation.
        
        Returns:
            dict: A dictionary containing performance metrics (MAE, MSE, RMSE, NRMSE, Correlation).
    """


    actual_test_values = final_cdc_data.loc[test_indices, target].copy()
    twenty_true = final_cdc_data.loc[test_indices, 'Deaths_per_100k'].copy()
    geoid = final_cdc_data.loc[test_indices, "County Code"].copy()

    # Mask the test set target values
    final_cdc_data.loc[test_indices, target] = np.nan
    
    # Impute values for all counties in the test set
    imputed_vals = []
    imputed_idx_vals = {} #for bootstrap
    all_neighbor_map = {}
    for idx in test_indices:
        imputed_value, neighbor_map = impute_death_rate(idx, final_cdc_data, distance_matrix, k, allowed_indices=allowed_indices)
        all_neighbor_map.update(neighbor_map)

        imp_deaths = (imputed_value * final_cdc_data.at[idx, 'Population']) / 100_000
        final_cdc_data.at[idx, 'Deaths_per_100k'] = imputed_value
        imputed_vals.append(imputed_value)
        # imputed_idx_vals[idx] = imputed_value #for boots
        # imputed_vals.append(imp_deaths)
    # return imputed_idx_vals #for boots

    imputed_vals = np.array(imputed_vals)

    valid_mask = np.isfinite(imputed_vals)

    # Filter both arrays using the mask
    actual_filtered = actual_test_values[valid_mask]
    imputed_filtered = imputed_vals[valid_mask]
    geoid = geoid[valid_mask]

    twenty_imputed = final_cdc_data.loc[test_indices, 'Deaths_per_100k']
    
    # print("actual_filtered", actual_filtered)
    # print("imputed_filtered", imputed_filtered)

    # Compute error metrics
    mae = mean_absolute_error(actual_filtered, imputed_filtered)
    mse = mean_squared_error(actual_filtered, imputed_filtered)
    rmse = np.sqrt(mse)
    range_val = np.max(actual_filtered) - np.min(actual_filtered)
    nrmse = rmse / range_val if range_val != 0 else np.nan
    try:
        corr = np.corrcoef(actual_filtered, imputed_filtered)[0, 1]
    except Exception:
        corr = np.nan
    
    metrics = {
        'MAE': mae,
        'MSE': mse,
        'RMSE': rmse,
        'NRMSE': nrmse,
        'Correlation': corr,
        'Actual': actual_filtered.tolist(),
        'Imputed': imputed_filtered.tolist(),
        'geoid': geoid.tolist()
    }
    
    return metrics, all_neighbor_map, twenty_imputed, twenty_true, test_indices

def writeImputation(cdc_file, socio_columns_data, distance_matrix, k):
    
    cdc_file['Deaths_per_100k'] = pd.to_numeric(cdc_file['Deaths_per_100k'], errors='coerce')
    orig_values = cdc_file['Deaths_per_100k'].dropna()

    missing_indices = cdc_file[(cdc_file['Deaths_per_100k'].isna()) & (cdc_file['Socio_Index'].notna())].index
    print("missing_indices: ", len(missing_indices))
    
    #cdc_file['Death Rate'] = cdc_file['Crude Rate'].copy()
    cdc_file['Imputed Deaths'] = cdc_file['Deaths'].copy()
    cdc_file['Imputed'] = 0
    nan_imputtation_count = 0
    imputed_values_dict = {}
    all_neighbor_map = {}
    for idx in missing_indices:
        imputed_value, neighbor_map = impute_death_rate(idx, cdc_file, distance_matrix, k)
        all_neighbor_map.update(neighbor_map)
        # print(imputed_value)
        if not pd.isna(imputed_value):
            cdc_file.at[idx, 'Deaths_per_100k'] = imputed_value
            cdc_file['Population'] = cdc_file['Population'].replace("Not Available", np.nan)
            population = cdc_file.at[idx, 'Population']
            impD = np.nan
            if not pd.isna(population):  
                impD = int(min(9, (imputed_value * population) / 100_000))
                cdc_file.at[idx, 'Imputed Deaths'] = impD
            else:
                cdc_file.at[idx, 'Imputed Deaths'] = np.nan
            cdc_file.at[idx, 'Imputed'] = 1
            #print(f"Index: {idx}, Imputed Rate: {imputed_value}, Population: {population}, "  f"Calculated Deaths: {(imputed_value * population) / 100_000}")

            imputed_values_dict[idx] = impD
            # imputed_values_dict[idx] = imputed_value
        else:
            nan_imputtation_count += 1
    
    print("nan_imputtation_count: ", nan_imputtation_count)
    columns_to_save = list(cdc_file.columns)
    # columns_to_remove = ['Socio_Index']
    # columns_to_save = [col for col in columns_to_save if col not in columns_to_remove]
    cdc_file = cdc_file[columns_to_save]
    
    # updated_folder_path = os.path.join('/Users/aitikdandapat/Library/CloudStorage/OneDrive-StonyBrookUniversity/Development/gKNN-imputation/', 'CDC time series', 'NewFinal')
    # updated_file_path = os.path.join(updated_folder_path, filename)
    # if os.path.exists(updated_file_path):
    #     # File exists: append new sheet
    #     with pd.ExcelWriter(updated_file_path, mode='a', engine='openpyxl', if_sheet_exists='new') as writer:
    #         cdc_file.to_excel(writer, sheet_name=sheet_name, index=False)
    # else:
    #     # File doesn't exist: create a new file
    #     with pd.ExcelWriter(updated_file_path, mode='w', engine='openpyxl') as writer:
    #         cdc_file.to_excel(writer, sheet_name=sheet_name, index=False)
    # print(f"Imputed results written to: {updated_file_path}")
    imp_values = cdc_file.loc[missing_indices, 'Deaths_per_100k']
    combined = cdc_file["Deaths_per_100k"].copy()
    

    return all_neighbor_map, imputed_values_dict, combined, imp_values, orig_values, missing_indices.to_frame()
