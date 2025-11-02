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

from typing import Optional
import base64

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


def _safe_numeric(s: pd.Series) -> pd.Series:
    """Coerce to numeric, keeping NaNs for non-convertible values."""
    if not pd.api.types.is_numeric_dtype(s):
        return pd.to_numeric(s, errors="coerce")
    return s

def _linear_regression(x: np.ndarray, y: np.ndarray) -> Dict[str, float]:
    """
    Ordinary Least Squares for y = a*x + b, with R^2.
    Returns: {"slope": a, "intercept": b, "r2": r2}
    """
    # x: (n,), y: (n,)
    x_ = np.vstack([x, np.ones_like(x)]).T
    a, b = np.linalg.lstsq(x_, y, rcond=None)[0]
    y_hat = a * x + b
    ss_res = np.sum((y - y_hat) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
    return {"slope": float(a), "intercept": float(b), "r2": r2}
# --- end helpers ---

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
            status_code=400, detail="No dataset found for this session."
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
            status_code=400, detail="No dataset found for this session."
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
        all_neighbor_map = cached.get("all_neighbor_map", {})
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
        orig_vals, imp_vals, combined, mask, test_orig, test_imp, test_mask, downloadable_csv, all_neighbor_map = (
            imputer.impute()
        )
        try:
            fname = f"{session_id}_{algo}_neighbor_map.txt"
            with open(fname, "w") as fh:
                json.dump(
                    all_neighbor_map,
                    fh,
                    default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o),
                    indent=2,
                )
            print(f"Wrote neighbor map to {fname}")
        except Exception as e:
            print(f"Error writing neighbor map: {e}")
        # combined.to_csv(f"mice_combined.csv", index=False)
        # mask.to_csv(f"mice_mask.csv", index=False)
        # imp_vals.to_csv(f"mice_imputed.csv", index=False)

        # Store in cache
        imputation_store[cache_key] = {
            "original": orig_vals,
            "imputed": imp_vals,
            "combined": combined,
            "mask": mask,
            "test_orig": test_orig,
            "test_imp": test_imp,
            "test_mask": test_mask,
            "all_neighbor_map": all_neighbor_map,
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
        "all_neighbor_map": all_neighbor_map,
        "downloadable_csv": downloadable_csv,
    }

    return {
        "orig_values": orig_vals.head(5).to_dict(orient="records"),
        "imputed_values": imp_vals.head(5).to_dict(orient="records"),
        "combined": combined.head(5).to_dict(orient="records"),
        "columns": combined.columns.tolist(),
        "shape": combined.shape,
    }


@app.post("/dataframe/impute/status")
async def impute_status_api(
    session_id: str = Form(...),
    algo: str = Form(...),
    columns: str = Form(...),
    iterations: int = Form(...),
):
    df = session_store.get(session_id)
    raw_df = session_store.get(session_id + 'raw')
    if df is None or df.empty:
        raise HTTPException(
            status_code=400, detail="No dataset found for this session."
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
        return True
    return False

@app.get("/dataframe/column_distribution")
def get_column_distribution(session_id: str = Query(...), column: str = Query(...)):
    if session_id not in imputation_store:
        raise HTTPException(
            status_code=400, detail="No imputation data for this session."
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
            status_code=400, detail="No imputation data for this session."
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

@app.get("/dataframe/neighbor_map")
def get_neighbor_map(session_id: str = Query(...)):
    """
    Return the raw neighbor map dictionary for a given session.
    """
    if session_id not in imputation_store:
        raise HTTPException(status_code=400, detail="No imputation data for this session.")

    neighbor_map = imputation_store[session_id].get("all_neighbor_map")
    if neighbor_map is None:
        raise HTTPException(status_code=404, detail="Neighbor map not found for this session.")

    return {"neighbor_map": neighbor_map}



@app.get("/dataframe/preimpute/columns")
def get_preimpute_numeric_like_columns(
    session_id: str = Query(...),
    use_raw: bool = Query(True, description="If True, use the raw uploaded CSV; if False, use merged pre-impute working DF."),
    min_fraction_numeric: float = Query(
        0.5, ge=0.0, le=1.0,
        description="Keep columns where at least this fraction coerces to numeric"
    )
):
    """
    Returns numeric-like columns from the PRE-IMPUTATION dataset.
    - If use_raw=True and you uploaded a CSV, we prefer session_id+'raw' (your original upload).
    - Else we fall back to session_store[session_id] (your merged numeric-only pre-impute DF).
    """
    df: Optional[pd.DataFrame] = None

    if use_raw and (session_id + 'raw') in session_store:
        df = session_store.get(session_id + 'raw')
    else:
        df = session_store.get(session_id)

    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="No pre-imputation dataset found for this session.")

    numericish = []
    for c in df.columns:
        s = pd.to_numeric(df[c], errors="coerce")
        if s.notna().mean() >= min_fraction_numeric:
            numericish.append(c)

    return {"columns": numericish}


@app.get("/dataframe/preimpute/scatter")
def get_preimpute_scatter(
    session_id: str = Query(..., description="Session key"),
    x_column: str = Query(...),
    y_column: str = Query(...),
    target_column: str = Query(..., description="Column to assess for missingness (planned imputation target)"),
    sample_size: Optional[int] = Query(
        5000, ge=100, le=100000,
        description="Optional uniform downsample for large datasets"
    )
):
    """
    Build a BEFORE-IMPUTATION scatter dataset from the MERGED pre-impute frame only.
    - Uses session_store[session_id] (the merged, numeric-only pre-impute DF created in /dataframe/post).
    - Drops rows where X or Y is NaN (pairwise complete for plotting).
    - Labels each plotted point by whether `target_column` is missing on that row:
        * label='ImputeTargetMissing' if target_column is NaN
        * label='Observed' otherwise
    - Returns points [{x,y,label}], correlation stats, OLS line, bounds, counts (by label), and dropped record counts.
    """
    # Always use the merged pre-impute DF
    df: Optional[pd.DataFrame] = session_store.get(session_id)

    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="No pre-imputation dataset available for this session.")

    # Validate columns
    for col_name, col_label in [(x_column, "X"), (y_column, "Y"), (target_column, "Target")]:
        if col_name not in df.columns:
            raise HTTPException(status_code=400, detail=f"{col_label} column '{col_name}' not found in pre-imputation dataset.")

    # Coerce to numeric but preserve NaNs for filtering
    x = _safe_numeric(df[x_column])
    y = _safe_numeric(df[y_column])

    # Target column is only used for missingness labeling; don't coerce to numeric
    target = df[target_column]

    total_rows = len(df)
    x_missing = int(x.isna().sum())
    y_missing = int(y.isna().sum())
    either_missing = int((x.isna() | y.isna()).sum())
    target_missing_total = int(target.isna().sum())

    # Pairwise complete cases for scatter
    data = pd.DataFrame({"x": x, "y": y})
    before = len(data)
    data = data.dropna(subset=["x", "y"])
    dropped = before - len(data)

    if len(data) < 2:
        raise HTTPException(status_code=400, detail="Not enough valid numeric pairs to compute scatter/correlation.")

    # Align target-missing mask to the filtered scatter rows
    target_missing_mask = target.isna()
    target_missing_on_scatter = target_missing_mask.loc[data.index]

    # Optional downsample (do this *after* labeling counts are computed against the same subset)
    if sample_size and len(data) > sample_size:
        # Keep indices to resample mask consistently
        data = data.sample(n=sample_size, random_state=42)
        target_missing_on_scatter = target_missing_on_scatter.loc[data.index]

    # Stats
    pearson = float(data["x"].corr(data["y"], method="pearson"))
    spearman = float(data["x"].rank().corr(data["y"].rank(), method="pearson"))

    x_vals = data["x"].to_numpy(dtype=float)
    y_vals = data["y"].to_numpy(dtype=float)
    if np.std(x_vals) > 0 and np.std(y_vals) > 0:
        reg = _linear_regression(x_vals, y_vals)
    else:
        reg = {"slope": 0.0, "intercept": float(np.mean(y_vals)), "r2": 0.0}

    # Build labeled points
    labels = np.where(target_missing_on_scatter.values, "ImputeTargetMissing", "Observed")
    points = [
        {"x": float(xx), "y": float(yy), "label": str(lbl)}
        for (xx, yy, lbl) in zip(data["x"].tolist(), data["y"].tolist(), labels.tolist())
    ]

    # Counts by label on the plotted subset
    count_missing_plotted = int(target_missing_on_scatter.sum())
    count_observed_plotted = int(len(data) - count_missing_plotted)

    return {
        "mode": "preimpute",
        "source": "merged_preimpute",
        "session_id": session_id,
        "x_column": x_column,
        "y_column": y_column,
        "target_column": target_column,
        "n": len(points),
        "dropped": int(dropped),
        "missing_counts": {
            "total_rows": int(total_rows),
            "x_missing": x_missing,
            "y_missing": y_missing,
            "either_missing": either_missing,
            "target_missing_total": target_missing_total,
            "target_missing_in_scatter": count_missing_plotted
        },
        "pearson": pearson,
        "spearman": spearman,
        "slope": reg["slope"],
        "intercept": reg["intercept"],
        "r2": reg["r2"],
        "x_min": float(data["x"].min()),
        "x_max": float(data["x"].max()),
        "y_min": float(data["y"].min()),
        "y_max": float(data["y"].max()),
        "counts": {
            "observed": count_observed_plotted,
            "impute_target_missing": count_missing_plotted
        },
        "points": points,
        "legend": ["Observed", "ImputeTargetMissing"]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
