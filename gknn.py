import numpy as np
import pandas as pd
from fetureImp import getImpFeatures, load_merged_data
from distance import compute_socio_distance, compute_geo_distance, compute_mahalanobis_distance
from gridSearch import grid_search_parameters, bayesian_search
from validation import validate_imputation_kfold, writeImputation, validate_imputation_testset
from sklearn.linear_model import LinearRegression
from sklearn.neighbors import KNeighborsRegressor
from sklearn.ensemble import RandomForestRegressor
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score



import matplotlib.pyplot as plt
from kneed import KneeLocator

class gKNNImputer:
    def __init__(self, df, columns):
        self.df = df.copy()
        self.columns = columns

    def getCDCFile(self, year):
        
        return f"CDC time series/updated_{year}.xlsx"

    # def getCDCImputedFile(year):
    #     return f"../CDC time series/NewFinal/updated_{year}.xlsx"

    def getSociEconFile(self):
        return "CDC time series/Z LatLong Overdose Mapping Tool Data counties separated.xlsx"

    def getMissingDataFile(self):
        return "CDC time series/Population/Population_2000_2022.csv"
    
    def merge_cdc_missing(self, cdc_df, missing):
        missing['County Code'] = missing['County Code'].apply(lambda x: str(int(x)) if not pd.isna(x) else x).str.zfill(5)
        
        missing = missing[~missing['County Code'].isna()]

        cdc_geoids = set(cdc_df['County Code'].unique())
        # new_missing = missing[~missing['County Code'].isin(cdc_geoids)].copy()
        new_missing = missing.copy()
        
        for col in cdc_df.columns:
            if col not in new_missing.columns:
                new_missing[col] = np.nan
        
        # restrict to only the columns present in the CDC file.
        new_missing = new_missing[cdc_df.columns]
        
        # Concatenate the CDC data (priority rows) with the new missing rows.
        merged_df = pd.concat([cdc_df, new_missing], ignore_index=True)
        # Remove common columns except 'County Code' from new_missing before merging
        common_cols = [col for col in cdc_df.columns if col in new_missing.columns and col != 'County Code']
        cdc_df_drop = cdc_df.drop(columns=common_cols)
        merged_df1 = pd.merge(cdc_df_drop, new_missing, on='County Code', how='right')
        
        # Remove duplicate County Code rows where Deaths_Per_100k is empty
        duplicates = merged_df[merged_df.duplicated(subset=['County Code'], keep=False)]
        to_drop = duplicates[duplicates['Deaths_per_100k'].isna()].index
        merged_df = merged_df.drop(index=to_drop).reset_index(drop=True)

        print(f"Merged CDC data shape after adding missing: {merged_df.shape}")

        
        return merged_df

    def impFeatureKnee(self, socio_imp_features, min_combined=0.3):
        sorted_df = socio_imp_features.sort_values(by='Combined', ascending=False)
        x = np.arange(1, len(sorted_df) + 1)
        y = sorted_df['Combined'].values
        
        knee = KneeLocator(x, y, curve='convex', direction='decreasing').knee

        if knee:
            knee_df = sorted_df.head(knee)
        else:
            knee_df = sorted_df.iloc[0:0]  # empty if none found

        thresh_df = sorted_df[sorted_df['Combined'] >= min_combined] #threshold‐based selection

        union_idx = knee_df.index.union(thresh_df.index) #union the two sets
        selected = sorted_df.loc[union_idx]

        signed_imp = selected['Combined'] * selected['Direction_Sign']
        # return list(zip(signed_imp.index.tolist(), signed_imp.tolist()))
        return list(signed_imp.index.tolist())

    def benchmark_models(self, X_train, y_train, X_test, y_test, pop):
        models = {
            "Linear Regression": LinearRegression(),
            "kNN Regression": KNeighborsRegressor(n_neighbors=5),
            "Random Forest": RandomForestRegressor(n_estimators=100, random_state=42),
            "XGBoost": xgb.XGBRegressor(n_estimators=100, random_state=42)
        }
        results = {}
        for name, model in models.items():
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            y_pred_deaths = (y_pred * pop) / 100_000 #only for Deaths metric
            mae = mean_absolute_error(y_test, y_pred_deaths)
            mse = mean_squared_error(y_test, y_pred_deaths)
            rmse = np.sqrt(mse)
            r2 = r2_score(y_test, y_pred_deaths)
            results[name] = {"MAE": mae, "MSE": mse, "RMSE": rmse, "R2": r2}
        return results
    
    def getMissingData(self, year):
        file_path = self.getMissingDataFile()
        # file_path = f"../../CDC time series/Population/Population_2000_2022.csv"
        df_year = pd.read_csv(file_path)

        year_col = str(year)
        df_result = df_year[["GEO_ID", "NAME", year_col]].copy()
        
        df_result['GEO_ID'] = df_result['GEO_ID'].apply(lambda a: a.split("US")[1])
        df_result.rename(columns={"GEO_ID": "County Code",
                                "NAME": "County",
                                year_col: "Population"}, inplace=True)
        
        return df_result

    def impute(self):
        # Fit the imputer on the data
        target = self.columns[0]

        twenty_imp, twenty_true, twenty_mask = self.run(self.df, target, ['random'], validation=False, real_test=True)
        orig_values, imp_values, combined, mask, all_neighbor_map, final_cdc_data_copy = self.run(self.df, target, validation=False, real_test=False)
        if isinstance(combined, pd.DataFrame) and 'County Code' in combined.columns:
            combined = combined.sort_values('County Code').reset_index(drop=True)
        
        # Create CSV combining original df with imputed values
        # Sort the original dataframe by County Code to match the sorted imputed data
        combined_df = final_cdc_data_copy.copy()
        combined_df['County Code'] = combined_df['County Code'].apply(lambda x: str(int(x)) if not pd.isna(x) else x).str.zfill(5)
        combined_df = combined_df.sort_values('County Code').reset_index(drop=True)
        
        # combined is already sorted by County Code and doesn't have County Code as a column
        if isinstance(combined, pd.DataFrame):
            combined_for_merge = combined.copy()
        else:
            combined_for_merge = combined.to_frame()
        
        # Rename the target column to indicate it contains imputed values
        if target in combined_for_merge.columns:
            combined_for_merge = combined_for_merge.rename(columns={target: f'{target}_imputed'})
        
        # Directly concatenate since both are sorted by County Code
        combined_df[f'{target}_imputed'] = combined_for_merge[f'{target}_imputed'].values
        
        # Create a final column that uses imputed values where original was missing
        combined_df[f'{target}_final'] = combined_df[target].fillna(combined_df[f'{target}_imputed'])
        
        # Generate CSV string and bytes
        self.imputed_csv = combined_df.to_csv(index=False)
        self.imputed_csv_bytes = self.imputed_csv.encode('utf-8')
        
        # Return the existing outputs plus the CSV variables in the final dict
        return orig_values, imp_values, combined, mask, twenty_true, twenty_imp, twenty_mask, self.imputed_csv, all_neighbor_map

    def run(self, df, target, death_threshold=[], interval=False, validation=False,real_test=False, plot=False):
        socio_econ_file_path = self.getSociEconFile()

        df_socio_econ = pd.read_excel(socio_econ_file_path)
        df_socio_econ['GEOID'] = df_socio_econ['GEOID'].astype(str).str.zfill(5)
        geo_data = df_socio_econ[['lat', 'lng']].copy()

        df_cdc = df.copy()
        df_cdc = df_cdc[~df_cdc['County Code'].isna()].copy()
        df_cdc['County Code'] = df_cdc['County Code'].apply(lambda x: str(int(x)) if not pd.isna(x) else x).str.zfill(5)

        # Merge with missing CDC data if applicable
        if not real_test:
            missing_cdc = self.getMissingData('2010')
            final_cdc_data = self.merge_cdc_missing(df_cdc, missing_cdc)
        else:
            final_cdc_data = df_cdc.copy()

        # Map County Code to Socio_Index using GEOID from socio-econ file
        geoid_to_index = {geoid: idx for idx, geoid in enumerate(df_socio_econ['GEOID'])}
        final_cdc_data['Socio_Index'] = final_cdc_data['County Code'].map(geoid_to_index)
        final_cdc_data = final_cdc_data[final_cdc_data['Socio_Index'].notna()].copy()
        final_cdc_data_copy = final_cdc_data.copy()

        if real_test:
            final_cdc_data = final_cdc_data[final_cdc_data[target].notna()].copy()
            if interval:
                mask = final_cdc_data['Deaths'].between(death_threshold[0], death_threshold[1])
                training_data = final_cdc_data[~mask].copy()
                test_data     = final_cdc_data[mask].copy()
            elif death_threshold[0] == 'random':
                test_idx = final_cdc_data.sample(frac=0.2, random_state=42).index
                test_data     = final_cdc_data.loc[test_idx].copy()
                training_data = final_cdc_data.drop(test_idx).copy()
            else:
                training_data = final_cdc_data[final_cdc_data['Deaths'] > death_threshold[0]].copy()
                test_data = final_cdc_data[final_cdc_data['Deaths'] <= death_threshold[0]].copy()
        else:
            training_data = final_cdc_data[final_cdc_data[target].notna()].copy()

        # Compute feature importance and select features
        socio_imp_features = getImpFeatures(df_socio_econ, training_data, target)
        socio_imp_features = self.impFeatureKnee(socio_imp_features)

        # Use only the selected socio-economic features for distance computations
        socio_data = df_socio_econ[socio_imp_features]
        Dsoc = compute_socio_distance(socio_data)
        Dgeo = compute_geo_distance(geo_data)

        # Perform Bayesian parameter search using the filtered training_data.
        best_params, MAE_results = bayesian_search(training_data, socio_data, geo_data, target, 300)
        # print("best_params: ", best_params)
        # print("MAE_results: ", MAE_results)
        
        best_alpha, best_beta, best_k = best_params

        D_combined = best_alpha * Dsoc + best_beta * Dgeo

        if real_test:
            metrics = {}
            test_metrics, all_neighbor_map, twenty_imp, twenty_true, twenty_mask  = validate_imputation_testset(test_data.index.tolist(), final_cdc_data, D_combined, target, k=best_k)
            # test_metrics = validate_imputation_testset(test_data.index.tolist(), final_cdc_data, D_combined, "Deaths", k=best_k)
        
            metrics['Imputation'] = test_metrics

            # Build design matrices from socio-economic features for benchmark models.
            # We use the socio_data from df_socio_econ.
            X_all = socio_data.values
            training_indices = training_data['Socio_Index'].astype(int).values
            test_indices = test_data['Socio_Index'].dropna().astype(int).values
            X_train = X_all[training_indices]
            X_test = X_all[test_indices]
            y_train = training_data[target].values
            # y_test = test_data[target].values 
            y_test = test_data["Deaths"].values
            population = test_data["Population"].values
            
            benchmark_results = self.benchmark_models(X_train, y_train, X_test, y_test, population)
            metrics["Benchmark"] = benchmark_results
            
            # Create boolean mask for test data
            test_mask_bool = pd.DataFrame(index=test_data.index, columns=[target, "County Code"])
            test_mask_bool[target] = True  # True indicates this value was masked/imputed
            test_mask_bool["County Code"] = test_data["County Code"]
            return twenty_imp.to_frame(), twenty_true.to_frame(), test_mask_bool
        
        # Write the imputation for final_cdc_data (which contains rows with missing target)
        all_neighbor_map, imputed_values_dict , combined, imp_values, orig_values, mask_all= writeImputation(final_cdc_data, df_socio_econ, D_combined, k=best_k)

        # if validation:
        #     final_metrics = validate_imputation_kfold(training_data, D_combined, target, k=best_k, plot=plot)
        #     print("\nFinal Imputation Performance Metrics:")
        #     print(final_metrics)

        # Create boolean mask for missing values
        mask_bool = pd.DataFrame(index=final_cdc_data.index, columns=[target, "County Code"])
        mask_bool["County Code"] = final_cdc_data["County Code"]
        mask_bool[target] = False  # Initialize all as False
        # Set True for indices that were missing and got imputed
        missing_indices = mask_all.index if hasattr(mask_all, 'index') else mask_all[0] if isinstance(mask_all, pd.DataFrame) else []
        if len(missing_indices) > 0:
            mask_bool.loc[missing_indices, target] = True

        mask_bool = mask_bool.sort_values(by="County Code").reset_index(drop=True)
        return orig_values.to_frame(), imp_values.to_frame(), combined.to_frame(), mask_bool, all_neighbor_map, final_cdc_data_copy