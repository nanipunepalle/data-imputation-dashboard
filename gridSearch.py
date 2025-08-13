import numpy as np
import pandas as pd
import optuna
import random
from functools import partial
from sklearn.metrics import mean_absolute_error, mean_squared_error
from distance import compute_socio_distance, compute_geo_distance, compute_mahalanobis_distance
from imputation import impute_death_rate

optuna.logging.set_verbosity(optuna.logging.WARNING)

def grid_search_parameters(cdc_data, socio_data, geo_data, target, num_samples=100):
    """
    Grid search over alpha (and consequently beta = 1 - alpha) and k for the imputation method.
    Parameters:
        cdc_data (pd.DataFrame): DataFrame containing known Deaths_per_100k values (and other columns).
        socio_data (np.array): Array or DataFrame of socio-economic data (used to compute Dsoc).
        geo_data (np.array): Array or DataFrame of geographic data (used to compute Dgeo).
        num_samples (int): Number of known indices to use for validation.
    Returns:
        best_params (tuple): (alpha, beta, k) combination with the lowest MAE.
        results (list): List of dictionaries with the parameter combination and corresponding error metrics.
    """

    alphas = np.arange(0, 1.1, 0.1)
    ks = [1, 3, 5, 7]
    # Compute socio-economic and geographic distances using your method (ensure they are computed on socio_data and geo_data)
    Dsoc = compute_mahalanobis_distance(socio_data)
    Dgeo = compute_geo_distance(geo_data)
    
    # Normalize and standardize distances if required here...
    
    results = []
    best_mae = np.inf
    best_params = None
    
    # Select indices where Deaths_per_100k is known and reliable
    # cdc_data = cdc_data[cdc_data["Crude Rate"] != "Unreliable"]
    known_indices = cdc_data[~cdc_data[target].isna()].index.tolist()
    validation_indices = random.sample(known_indices, min(num_samples, len(known_indices)))
    
    for alpha in alphas:
        beta = 1 - alpha
        # Compute combined distance matrix
        D = alpha * Dsoc + beta * Dgeo
        
        for k in ks:
            imputed_values = []
            actual_values = []
            
            # Validate imputation for the sampled rows
            for idx in validation_indices:
                actual_value = cdc_data.loc[idx, target]
                print("actual_value: ", actual_value)
                imputed_value, _ = impute_death_rate(idx, cdc_data, D, k)  # your imputation function
                if not np.isnan(imputed_value):
                    imputed_values.append(imputed_value)
                    actual_values.append(actual_value)
            
            if imputed_values:
                mae = mean_absolute_error(actual_values, imputed_values)
                rmse = np.sqrt(mean_squared_error(actual_values, imputed_values))
            else:
                mae = np.inf
                rmse = np.inf
            
            results.append({
                'alpha': alpha,
                'beta': beta,
                'k': k,
                'MAE': mae,
                'RMSE': rmse
            })
            
            if mae < best_mae:
                best_mae = mae
                best_params = (alpha, beta, k)
                
            print(f"Alpha: {alpha:.2f}, Beta: {beta:.2f}, k: {k}, MAE: {mae:.4f}, RMSE: {rmse:.4f}")
    
    return best_params, results

# Example usage:
# best_params, grid_results = grid_search_parameters(cdc_data, socio_data, geo_data, num_samples=100)
# print("Best Parameters:", best_params)

def objective(trial, cdc_data, socio_data, geo_data, target, num_samples):
    alpha = trial.suggest_float("alpha", 0.0, 1.0)
    beta = 1 - alpha
    k = trial.suggest_categorical("k", [1, 3, 5, 7])
    
    # Compute distance matrices (we assume these functions are defined and socio_data/geo_df are global)
    Dsoc = compute_socio_distance(socio_data)
    # Dsoc = compute_mahalanobis_distance(socio_data)
    Dgeo = compute_geo_distance(geo_data) 
    
    # Combine distances using the hyperparameters
    D_combined = alpha * Dsoc + beta * Dgeo
    
    # Use a random subset of indices from cdc_data for validation
    known_indices = cdc_data[~cdc_data[target].isna()].index.tolist()
    validation_indices = random.sample(known_indices, min(num_samples, len(known_indices)))
    
    imputed_vals = []
    actual_vals = []
    
    # Impute Deaths_per_100k for the validation indices and collect actual values
    for idx in validation_indices:
        # actual_value = cdc_data.loc[idx, target]
        val = cdc_data.loc[idx, target]
        actual_value = val.iloc[0] if isinstance(val, pd.Series) else val
        imputed_value, _ = impute_death_rate(idx, cdc_data, D_combined, k)
        if not np.isnan(imputed_value):
            imputed_vals.append(imputed_value)
            actual_vals.append(actual_value)

    # If no imputation could be performed, return a very high error
    if not imputed_vals:
        return float('inf')
    
    # Compute MAE as the objective metric
    mae = mean_absolute_error(actual_vals, imputed_vals)
    return mae

def bayesian_search(cdc_data, socio_data, geo_data, target, num_samples):
    # Create and run the Optuna study
    study = optuna.create_study(direction="minimize")
    objective_with_data = partial(objective, cdc_data=cdc_data, socio_data=socio_data, geo_data=geo_data, target=target, num_samples=num_samples)  
    study.optimize(objective_with_data, n_trials=50)

    best_alpha = study.best_params["alpha"]
    best_beta = 1 - best_alpha
    best_k = study.best_params["k"]
    best_mae = study.best_value

    return {best_alpha, best_beta, best_k}, best_mae