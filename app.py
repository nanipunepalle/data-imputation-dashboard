import json
import os
from fastapi import FastAPI, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from io import BytesIO
import uvicorn
import numpy as np
import uuid
from typing import Dict
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.preprocessing import LabelEncoder
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import Request
from fastapi import HTTPException

from mice import MiceImputer
# from bart import BartImputer
from gknn import gKNNImputer
from customLabelEncoder import CustomLabelEncoder
from featureImportance import FeatureImportance

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session stores
session_store: Dict[str, pd.DataFrame] = {}

# Store original, imputed, and combined datasets per session
imputation_store: Dict[str, Dict[str, pd.DataFrame]] = {}

label_encoders: Dict[str, Dict[str, object]] = {}

def get_merged_df(df):
    csv_file_2 = 'CDC time series/Z LatLong Overdose Mapping Tool Data counties separated.csv'

    # Read the CSV files
    df1 = df.copy()
    df2 = pd.read_csv(csv_file_2)

    df1 = df1[df1['Notes'].isna() | (df1['Notes'] == '')]

    print("First CSV file shape:", df1.shape)
    print("Second CSV file shape:", df2.shape)

    df1['County Code'] = df1['County Code'].astype(str).str.replace('\.0$', '', regex=True)
    df2['GEOID'] = df2['GEOID'].astype(str)

    # Merge the dataframes using a right join
    merged_df = pd.merge(df1, df2, left_on='County Code', right_on='GEOID', how='right')

    # Replace 'GEOID' column with 'County Code' (assuming 'County Code' is preferred)
    merged_df['County Code'] = merged_df['GEOID']
    merged_df = merged_df.drop('GEOID', axis=1)
    # Convert 'County Code' to integer, handling errors if any
    merged_df['County Code'] = pd.to_numeric(merged_df['County Code'], errors='coerce').astype('Int64')

    merged_df.to_csv('merged_debug.csv', index=False)
    print("Merged DataFrame shape:", merged_df.shape)
    
    # Reset index to avoid length mismatch errors
    merged_df = merged_df.reset_index(drop=True)
    
    merged_df = merged_df.select_dtypes(include=['number'])

    print("Merged DataFrame with numeric types only shape:", merged_df.shape)

    merged_df = merged_df.drop(columns=['Deaths','Population','Unnamed: 3'], errors='ignore')
    return merged_df

@app.post("/dataframe/post")
async def get_dataframe_api(file: UploadFile = File(...)):
    contents = await file.read()
    df = pd.read_csv(BytesIO(contents)).replace([np.inf, -np.inf], np.nan)
    merged_df = get_merged_df(df)
    # merged_df = df

    session_id = uuid.uuid4().hex
    session_store[session_id] = merged_df
    session_store[session_id+'raw'] = df.copy()  # Store the raw DataFrame as well
    label_encoders[session_id] = {}

    return {
        "session_id": session_id,
        "dataframe": merged_df.head(5)
        .replace([np.inf, -np.inf], np.nan)
        .fillna("")
        .to_dict(orient="records"),
        "columns": merged_df.columns.tolist(),
        "shape": merged_df.shape,
    }


@app.get("/dataframe/describe")
async def describe_dataframe(session_id: str = Query(...)):
    df = session_store.get(session_id)
    if df is None or df.empty:
        return {"error": "No dataframe loaded for this session."}

    dtypes = df.dtypes.astype(str).to_dict()
    stats = df.describe(include="all").fillna("").to_dict()
    return {"dtypes": dtypes, "statistics": stats}


@app.get("/dataframe/missingness_summary")
async def missingness_summary_api(session_id: str = Query(...)):
    df = session_store.get(session_id)
    if df is None or df.empty:
        raise HTTPException(
            status_code=404, detail="No dataset found for this session."
        )

    missing_percent = (df.isnull().mean() * 100).round(2)
    summary = missing_percent.to_dict()
    return {"missingness_summary": summary}


@app.post("/datatype/configure")
async def configure_datatype_api(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    column: str = Form(...),
    dtype: str = Form(...),
    treat_none_as_category: bool = Form(False),
    custom_encoder: str = Form(None),
):
    contents = await file.read()
    df = pd.read_csv(BytesIO(contents))

    if column not in df.columns:
        return {"error": f"Column '{column}' not found in uploaded CSV."}

    try:
        if dtype == "Categorical":
            le = (
                CustomLabelEncoder(treat_none_as_category=treat_none_as_category)
                if custom_encoder
                else LabelEncoder()
            )

            if not custom_encoder:
                df[column].fillna(
                    "SPECIFICALLY_MARKED_MISSING_CATEGORY_PREPROCESSING_DATA",
                    inplace=True,
                )

            df[column] = df[column].astype(str)

            if custom_encoder:
                df[column] = le.fit_transform(df, column)
            else:
                df[column] = le.fit_transform(df[column])
                if (
                    "SPECIFICALLY_MARKED_MISSING_CATEGORY_PREPROCESSING_DATA"
                    in le.classes_
                ):
                    missing_val = le.transform(
                        ["SPECIFICALLY_MARKED_MISSING_CATEGORY_PREPROCESSING_DATA"]
                    )[0]
                    df[column].replace(missing_val, np.nan, inplace=True)

            label_encoders[session_id][column] = le
        else:
            df[column] = pd.to_numeric(df[column], errors="coerce")

        session_store[session_id] = df
        return {
            "message": f"Column '{column}' configured as {dtype}.",
            "dataframe": df.head(5).to_dict(orient="records"),
            "columns": df.columns.tolist(),
            "shape": df.shape,
        }

    except Exception as e:
        return {"error": str(e)}


@app.post("/feature_importance")
async def feature_importance_api(
    session_id: str = Form(...),
    target: str = Form(...),
    method: str = Form(...),
    threshold: float = Form(None),
    top_n: int = Form(None),
):
    # df = session_store.get(session_id)
    # target = 'Deaths_per_100k'
    # if df is None or df.empty:
    #     return {"error": "No dataset found for this session."}

    # featureImportance = FeatureImportance(df, target)
    # pearson_scores = featureImportance.featureCorr("pearson")
    # spearman_scores = featureImportance.featureCorr("spearman")
    # mutual_scores = featureImportance.featureMutualInfo()
    # rf_scores = featureImportance.featureRF()
    # lasso_scores = featureImportance.featureLasso().abs()
    # rf_shap_scores = featureImportance.featureRF_SHAP()
    # lasso_shap_scores = featureImportance.featureLasso_SHAP()

    # importance_df = pd.DataFrame(
    #     {
    #         "Pearson": pearson_scores,
    #         "Spearman": spearman_scores,
    #         "MutualInfo": mutual_scores,
    #         "RF": rf_scores,
    #         "Lasso": lasso_scores,
    #         "RF_SHAP": rf_shap_scores,
    #         "Lasso_SHAP": lasso_shap_scores,
    #     }
    # )

    # res_cols = []
    # match method:
    #     case "pearson":
    #         res_cols.append("Pearson")
    #     case "spearman":
    #         res_cols.append("Spearman")
    #     case "mutual_info":
    #         res_cols.append("MutualInfo")
    #     case "rf":
    #         res_cols.append("RF")
    #     case "lasso":
    #         res_cols.append("Lasso")
    #     case "rf_shap":
    #         res_cols.append("RF_SHAP")
    #     case "lasso_shap":
    #         res_cols.append("Lasso_SHAP")
    #     case "all_methods":
    #         res_cols = [
    #             "Pearson",
    #             "Spearman",
    #             "MutualInfo",
    #             "RF",
    #             "Lasso",
    #             "RF_SHAP",
    #             "Lasso_SHAP",
    #         ]

    # magnitude_df = importance_df[res_cols].apply(
    #     lambda s: (s - s.min()) / (s.max() - s.min()) if s.max() != s.min() else s,
    #     axis=0,
    # )
    # importance_df["Combined"] = magnitude_df.mean(axis=1)

    # directional_columns = ["Pearson", "Spearman", "Lasso"]
    # importance_df["Direction"] = importance_df[directional_columns].mean(axis=1)
    # importance_df["Direction_Sign"] = importance_df["Direction"].apply(np.sign)

    # combined_sorted = importance_df[["Combined", "Direction_Sign"]].sort_values(
    #     by="Combined", ascending=False
    # )
    # combined_sorted["Combined"] = combined_sorted["Combined"].clip(0, 1)

    # if threshold is not None:
    #     combined_sorted = combined_sorted[combined_sorted["Combined"] >= threshold]
    # if top_n is not None:
    #     combined_sorted = combined_sorted.head(top_n)

    # knee_features = featureImportance.impFeatureKnee(combined_sorted, min_combined=0.3)
    # combined_sorted = combined_sorted.replace([np.inf, -np.inf], np.nan).dropna()

    # return {
    #     "Combined_df": combined_sorted.to_dict(orient="index"),
    #     "knee_features": knee_features,
    # }
    pass


@app.post("/dataframe/impute")
async def impute_api(
    session_id: str = Form(...),
    algo: str = Form(...),
    columns: str = Form(...),
    iterations: int = Form(...),
):
    df = session_store.get(session_id)
    raw_df = session_store.get(session_id + 'raw')
    if df is None or df.empty:
        raise HTTPException(
            status_code=404, detail="No dataset found for this session."
        )

    try:
        columns = json.loads(columns)  # parse JSON array
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400, detail="Invalid columns format. Expected a JSON list."
        )
    
    print(f"Imputing with algo={algo}, columns={columns}, iterations={iterations}")
    # Check cache for repeated calls
    cache_key = f"{session_id}_{algo}_{json.dumps(columns)}_{iterations}"
    if cache_key in imputation_store:
        cached = imputation_store[cache_key]
        orig_vals = cached["original"]
        imp_vals = cached["imputed"]
        print("Aitik: Using cached imputation result")
        imp_vals.to_csv(f"{algo}_imputed.csv", index=False)
        combined = cached["combined"]
        mask = cached["mask"]
        test_orig = cached["test_orig"]
        test_imp = cached["test_imp"]
        test_mask = cached["test_mask"]
    else:
        if algo == "mice":
            imputer = MiceImputer(df.copy(), columns, max_iter=iterations)
        elif algo == "bart":
            # imputer = BartImputer(df.copy(), columns, max_iter=iterations)
            pass
        elif algo == "gknn":
            imputer = gKNNImputer(raw_df.copy(), columns)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown algorithm: {algo}")

        # Run imputation
        orig_vals, imp_vals, combined, mask, test_orig, test_imp, test_mask = (
            imputer.impute()
        )
        combined.to_csv(f"mice_combined.csv", index=False)
        mask.to_csv(f"mice_mask.csv", index=False)
        imp_vals.to_csv(f"mice_imputed.csv", index=False)

        # Store in cache
        imputation_store[cache_key] = {
            "original": orig_vals,
            "imputed": imp_vals,
            "combined": combined,
            "mask": mask,
            "test_orig": test_orig,
            "test_imp": test_imp,
            "test_mask": test_mask,
        }

    # Save imputed components separately for this session
    imputation_store[session_id] = {
        "original": orig_vals,
        "imputed": imp_vals,
        "combined": combined,
        "mask": mask,
        "test_orig": test_orig,
        "test_imp": test_imp,
        "test_mask": test_mask,
    }

    return {
        "orig_values": orig_vals.head(5).to_dict(orient="records"),
        "imputed_values": imp_vals.head(5).to_dict(orient="records"),
        "combined": combined.head(5).to_dict(orient="records"),
        "columns": combined.columns.tolist(),
        "shape": combined.shape,
    }


@app.get("/dataframe/column_distribution")
def get_column_distribution(session_id: str = Query(...), column: str = Query(...)):
    if session_id not in imputation_store:
        raise HTTPException(
            status_code=404, detail="No imputation data for this session."
        )

    original_df = imputation_store[session_id]["original"]
    combined_df = imputation_store[session_id]["combined"]
    imputed_df = imputation_store[session_id]["imputed"]

    if column not in combined_df.columns:
        raise HTTPException(status_code=400, detail="Invalid column.")

    orig_vals = original_df[column].dropna().tolist()
    imputed_vals = imputed_df[column].dropna().tolist()

    return {
        "original": orig_vals,
        "imputed": imputed_vals,
    }

@app.get("/dataframe/test_evaluation")
def get_test_evaluation(session_id: str = Query(...)):
    """
    Returns the 20% masked test original and imputed values for evaluation.
    """
    if session_id not in imputation_store:
        raise HTTPException(
            status_code=404, detail="No imputation data for this session."
        )

    test_orig = imputation_store[session_id].get("test_orig")
    test_imp = imputation_store[session_id].get("test_imp")

    if test_orig is None or test_imp is None:
        raise HTTPException(status_code=404, detail="Test evaluation data not found.")

    # Flatten to return only aligned, non-null pairs
    test_orig_flat = test_orig.stack().reset_index()
    test_imp_flat = test_imp.stack().reset_index()

    test_orig_flat.columns = ["index", "column", "original"]
    test_imp_flat.columns = ["index", "column", "imputed"]

    merged = pd.merge(test_orig_flat, test_imp_flat, on=["index", "column"])
    merged["absolute_diff"] = (merged["original"] - merged["imputed"]).abs()

    return {
        "test_evaluation": merged.to_dict(orient="records"),
        "column_list": merged["column"].unique().tolist(),
        "summary": {
            "mean_abs_diff": merged["absolute_diff"].mean(),
            "median_abs_diff": merged["absolute_diff"].median(),
            "std_abs_diff": merged["absolute_diff"].std(),
        }
    }


@app.get("/dataframe/scatter_plot_data")
def get_scatter_plot_data(
    session_id: str = Query(...),
    x_column: str = Query(...),
    y_column: str = Query(...)
):
    if session_id not in imputation_store:
        raise HTTPException(status_code=400, detail="No imputation data for this session.")

    imputed_df = imputation_store[session_id]["imputed"]
    mask_df = imputation_store[session_id].get("mask")
    combined_df = imputation_store[session_id]["combined"]

    original_df = session_store.get(session_id)
    original_df.to_csv(f"original_df.csv", index=False)
    original_df["County Code"] = pd.to_numeric(original_df["County Code"], errors="coerce").astype("Int64")
    mask_df["County Code"] = pd.to_numeric(mask_df["County Code"], errors="coerce").astype("Int64")
    original_df = original_df.sort_values(by="County Code").reset_index(drop=True)

    # original_df = imputation_store[session_id]["combined"]
    if original_df is None or x_column not in original_df.columns:
        raise HTTPException(status_code=400, detail="X column not found in original dataset.")

    if y_column not in imputed_df.columns:
        raise HTTPException(status_code=400, detail="Invalid y column.")

    points = []
    if "County Code" not in mask_df.columns:
        raise HTTPException(status_code=400, detail="'County Code' column not found in combined dataset.")

    for county_code in mask_df["County Code"].dropna().unique():
        county_row = original_df[original_df["County Code"] == county_code]
        if county_row.empty:
            print("AITIK: county_row is empty for County Code:", county_code)
            continue
        else:
            x_val = county_row.iloc[0][x_column] if x_column in county_row.columns else None
            idx = mask_df[mask_df["County Code"] == county_code].index[0]
            y_val = combined_df.at[idx, y_column] if idx in combined_df.index else None
    
        
    # for idx in original_df.index:
    #     x_val = original_df.at[idx, x_column] if idx in original_df.index else None
    #     if idx in combined_df.index and combined_df.at[idx, y_column]:
    #         y_val = combined_df.at[idx, y_column] if idx in combined_df.index else None
    
        if pd.isna(x_val) or pd.isna(y_val):
            continue  # Skip missing

        is_imputed = False
        if mask_df is not None and y_column in mask_df.columns:
            is_imputed = bool(mask_df[mask_df["County Code"] == county_code].iloc[0][y_column])
        points.append({
            "x": float(x_val),
            "y": float(y_val),
            "label": "Imputed" if is_imputed else "Rest"
        })

    return {
        "x_column": x_column,
        "y_column": y_column,
        "points": points
    }



if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
