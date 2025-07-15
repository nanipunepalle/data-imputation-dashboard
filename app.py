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
from customLabelEncoder import CustomLabelEncoder
from featureImportance import FeatureImportance
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import Request

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
label_encoders: Dict[str, Dict[str, object]] = {}


@app.post("/api/dataframe/post")
async def get_dataframe_api(file: UploadFile = File(...)):
    contents = await file.read()
    df = pd.read_csv(BytesIO(contents)).replace([np.inf, -np.inf], np.nan).fillna("")

    session_id = uuid.uuid4().hex
    session_store[session_id] = df
    label_encoders[session_id] = {}

    return {
        "session_id": session_id,
        "dataframe": df.head(5).to_dict(orient="records"),
        "columns": df.columns.tolist(),
        "shape": df.shape,
    }


@app.get("/api/dataframe/describe")
async def describe_dataframe(session_id: str = Query(...)):
    df = session_store.get(session_id)
    if df is None or df.empty:
        return {"error": "No dataframe loaded for this session."}

    dtypes = df.dtypes.astype(str).to_dict()
    stats = df.describe(include="all").fillna("").to_dict()
    return {"dtypes": dtypes, "statistics": stats}


@app.post("/api/missingness_summary")
async def missingness_summary_api(file: UploadFile = File(...)):
    contents = await file.read()
    df = pd.read_csv(BytesIO(contents))
    missing_percent = (df.isnull().mean() * 100).round(2)
    summary = missing_percent.to_dict()
    return {"missingness_summary": summary}


@app.post("/api/datatype/configure")
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
                if custom_encoder else LabelEncoder()
            )

            if not custom_encoder:
                df[column].fillna("SPECIFICALLY_MARKED_MISSING_CATEGORY_PREPROCESSING_DATA", inplace=True)

            df[column] = df[column].astype(str)

            if custom_encoder:
                df[column] = le.fit_transform(df, column)
            else:
                df[column] = le.fit_transform(df[column])
                if "SPECIFICALLY_MARKED_MISSING_CATEGORY_PREPROCESSING_DATA" in le.classes_:
                    missing_val = le.transform(["SPECIFICALLY_MARKED_MISSING_CATEGORY_PREPROCESSING_DATA"])[0]
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


@app.post("/api/feature_importance")
async def feature_importance_api(
    session_id: str = Form(...),
    target: str = Form(...),
    method: str = Form(...),
    threshold: float = Form(None),
    top_n: int = Form(None),
):
    df = session_store.get(session_id)
    if df is None or df.empty:
        return {"error": "No dataset found for this session."}

    featureImportance = FeatureImportance(df, target)
    pearson_scores = featureImportance.featureCorr("pearson")
    spearman_scores = featureImportance.featureCorr("spearman")
    mutual_scores = featureImportance.featureMutualInfo()
    rf_scores = featureImportance.featureRF()
    lasso_scores = featureImportance.featureLasso().abs()
    rf_shap_scores = featureImportance.featureRF_SHAP()
    lasso_shap_scores = featureImportance.featureLasso_SHAP()

    importance_df = pd.DataFrame({
        "Pearson": pearson_scores,
        "Spearman": spearman_scores,
        "MutualInfo": mutual_scores,
        "RF": rf_scores,
        "Lasso": lasso_scores,
        "RF_SHAP": rf_shap_scores,
        "Lasso_SHAP": lasso_shap_scores,
    })

    res_cols = []
    match method:
        case "pearson":
            res_cols.append("Pearson")
        case "spearman":
            res_cols.append("Spearman")
        case "mutual_info":
            res_cols.append("MutualInfo")
        case "rf":
            res_cols.append("RF")
        case "lasso":
            res_cols.append("Lasso")
        case "rf_shap":
            res_cols.append("RF_SHAP")
        case "lasso_shap":
            res_cols.append("Lasso_SHAP")
        case "all_methods":
            res_cols = ["Pearson", "Spearman", "MutualInfo", "RF", "Lasso", "RF_SHAP", "Lasso_SHAP"]

    magnitude_df = importance_df[res_cols].apply(lambda s: (s - s.min()) / (s.max() - s.min()) if s.max() != s.min() else s, axis=0)
    importance_df["Combined"] = magnitude_df.mean(axis=1)

    directional_columns = ["Pearson", "Spearman", "Lasso"]
    importance_df["Direction"] = importance_df[directional_columns].mean(axis=1)
    importance_df["Direction_Sign"] = importance_df["Direction"].apply(np.sign)

    combined_sorted = importance_df[["Combined", "Direction_Sign"]].sort_values(by="Combined", ascending=False)
    combined_sorted["Combined"] = combined_sorted["Combined"].clip(0, 1)

    if threshold is not None:
        combined_sorted = combined_sorted[combined_sorted["Combined"] >= threshold]
    if top_n is not None:
        combined_sorted = combined_sorted.head(top_n)

    knee_features = featureImportance.impFeatureKnee(combined_sorted, min_combined=0.3)
    combined_sorted = combined_sorted.replace([np.inf, -np.inf], np.nan).dropna()

    return {
        "Combined_df": combined_sorted.to_dict(orient="index"),
        "knee_features": knee_features,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
