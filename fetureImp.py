import pandas as pd
from sklearn.feature_selection import mutual_info_regression
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LassoCV
import numpy as np
import shap

def featureCorr(df, target, corr_type):
    """
    Compute and return sorted feature correlations with the target variable using Pearson or Spearman correlation.
    """
    if corr_type == 'pearson':
        corr_matrix = df.corr(method='pearson')
    elif corr_type == 'spearman':
        corr_matrix = df.corr(method='spearman')
    else:
        raise ValueError("Invalid correlation type. Use 'pearson' or 'spearman'.")
    
    target_corr = corr_matrix[target].drop(target)
    sorted_corr = target_corr.reindex(target_corr.abs().sort_values(ascending=False).index)

    return sorted_corr

def featureMutualInfo(df, target):
    """
    Compute and return the Mutual Information scores for features in df with respect to the target.
    Returns a pandas Series sorted by descending MI score.
    """
    X = df.drop(columns=[target])
    y = df[target]
    mi_scores = mutual_info_regression(X, y, random_state=42)
    mi_series = pd.Series(mi_scores, index=X.columns).sort_values(ascending=False)
    return mi_series

def featureRF(df, target, n_estimators=100, random_state=42):
    """
    Fit a Random Forest regressor and return the feature importances.
    Returns a pandas Series sorted by descending importance.
    """
    X = df.drop(columns=[target])
    y = df[target]
    rf = RandomForestRegressor(n_estimators=n_estimators, random_state=random_state)
    rf.fit(X, y)
    importances = rf.feature_importances_
    rf_series = pd.Series(importances, index=X.columns).sort_values(ascending=False)
    return rf_series

def featureLasso(df, target, cv=5, random_state=42):
    """
    Fit a Lasso regression model using cross-validation and return the coefficients.
    Coefficients are sorted by their absolute values in descending order.
    """
    X = df.drop(columns=[target])
    y = df[target]
    lasso = LassoCV(cv=cv, max_iter=10000, random_state=random_state)
    lasso.fit(X, y)
    # Create a Series with the coefficients (retain their sign for interpretation)
    lasso_coef = pd.Series(lasso.coef_, index=X.columns)
    # Sort by the absolute value of the coefficients
    lasso_coef_sorted = lasso_coef.reindex(lasso_coef.abs().sort_values(ascending=False).index)
    return lasso_coef_sorted

def featureRF_SHAP(df, target, n_estimators=100, random_state=42):
    """
    Fit a Random Forest regressor, compute SHAP values using TreeExplainer,
    and return the mean absolute SHAP values per feature, sorted in descending order.
    """
    X = df.drop(columns=[target])
    y = df[target]
    rf = RandomForestRegressor(n_estimators=n_estimators, random_state=random_state)
    rf.fit(X, y)
    
    explainer = shap.TreeExplainer(rf)
    shap_values = explainer.shap_values(X)
    
    # Compute mean absolute SHAP value for each feature
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    shap_series = pd.Series(mean_abs_shap, index=X.columns).sort_values(ascending=False)
    return shap_series

def featureLasso_SHAP(df, target, cv=5, random_state=42):
    """
    Fit a Lasso regression model, compute SHAP values using LinearExplainer,
    and return the mean absolute SHAP values per feature, sorted in descending order.
    """
    X = df.drop(columns=[target])
    y = df[target]
    lasso = LassoCV(cv=cv, random_state=random_state, max_iter=10000)
    lasso.fit(X, y)
    
    explainer = shap.LinearExplainer(lasso, X, feature_perturbation="interventional")
    shap_values = explainer.shap_values(X)
    
    # Compute mean absolute SHAP value for each feature
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    shap_series = pd.Series(mean_abs_shap, index=X.columns).sort_values(ascending=False)
    return shap_series

def combineFeatureImportances(df, target, threshold=None, top_n=None):
    """
    Combine feature importance scores from multiple methods and return final selected features.

    """
    # Compute individual importance scores using the pre-defined functions
    pearson_scores = featureCorr(df, target, 'pearson')
    spearman_scores = featureCorr(df, target, 'spearman')
    mutual_scores = featureMutualInfo(df, target)
    rf_scores = featureRF(df, target)
    lasso_scores = featureLasso(df, target).abs()  # using absolute values for Lasso
    rf_shap_scores = featureRF_SHAP(df, target)
    lasso_shap_scores = featureLasso_SHAP(df, target)
    
    # Combine all scores into a DataFrame; index should be the feature names.
    importance_df = pd.DataFrame({
        'Pearson': pearson_scores,
        'Spearman': spearman_scores,
        'MutualInfo': mutual_scores,
        'RF': rf_scores,
        'Lasso': lasso_scores,
        'RF_SHAP': rf_shap_scores,
        'Lasso_SHAP': lasso_shap_scores
    })
    
    magnitude_df = importance_df.copy()

    for col in ['Pearson', 'Spearman', 'Lasso']:
        magnitude_df[col] = magnitude_df[col].abs()

    def _minmax(s):
        if s.max() == s.min(): # Avoid division by zero
            return s  
        return (s - s.min()) / (s.max() - s.min())
    
    magnitude_df = magnitude_df.apply(_minmax, axis=0)
    importance_df['Combined'] = magnitude_df.mean(axis=1)
    
    directional_columns = ['Pearson', 'Spearman', 'Lasso']
    importance_df['Direction'] = importance_df[directional_columns].mean(axis=1)
    importance_df['Direction_Sign'] = importance_df['Direction'].apply(np.sign) #just sigh
    
    combined_sorted = importance_df[['Combined', 'Direction_Sign']].sort_values(by='Combined', ascending=False)
    
    if threshold is not None:
        combined_sorted = combined_sorted[combined_sorted > threshold]
    
    if top_n is not None:
        combined_sorted = combined_sorted.head(top_n)
    
    return combined_sorted

def load_merged_data(df_socio_econ, df_cdc, target, keepPrimary=False, geo=False):
    """
    Load and merge p1 and p3 data for the specified year.
    
    Parameters:
        year (int or str): The year for which to load the p3 data file.
        
    Returns:
        pandas.DataFrame: The merged DataFrame with reliable Deaths_per_100k values.
    """
    
    # Select only the numeric columns from p1, excluding unwanted ones
    used_cols = list(
        df_socio_econ.select_dtypes(include=['float64', 'int64']).columns.difference(
            ['lat', 'lng', 'NAME', 'Unnamed: 3', 'ACS Total Population'] #exclude population
        )
    )
    if "GEOID" not in used_cols:
        used_cols.append("GEOID")
    if geo:
        used_cols.extend(['lat', 'lng'])
    
    df_socio_econ = df_socio_econ[used_cols]
    
    # Keep only the necessary columns in p3
    df_cdc = df_cdc[~df_cdc[target].isna()]
    df_cdc = df_cdc[["County Code", target]]
    
    # Rename identifiers to a common name
    df_socio_econ.rename(columns={'GEOID': 'GEOID'}, inplace=True)
    df_cdc.rename(columns={'County Code': 'GEOID'}, inplace=True)
    
    # Ensure CountyID is a string and padded to 5 digits
    df_socio_econ['GEOID'] = df_socio_econ['GEOID'].astype(str).str.zfill(5)
    df_cdc['GEOID'] = df_cdc['GEOID'].apply(lambda x: str(int(x)) if not pd.isna(x) else x).str.zfill(5)
    
    # Merge on GEOID
    merged_df = pd.merge(df_socio_econ, df_cdc, on='GEOID')

    if(not keepPrimary):
        merged_df = merged_df.drop(columns=["GEOID"])
    return merged_df

def getImpFeatures(df_socio_econ, df_cdc, target="Deaths_per_100k"):
    #get the df with socio economic factors as well as the Deaths_per_100K
    mdf = load_merged_data(df_socio_econ,df_cdc, target)
    all_features_with_imp = combineFeatureImportances(mdf,target)

    return all_features_with_imp