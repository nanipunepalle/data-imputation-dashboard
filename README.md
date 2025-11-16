# Data Imputation Dashboard (FastAPI + Next.js)

An interactive dashboard for exploring missing data, configuring and running multiple imputation algorithms, visualizing spatial relationships on a county-level choropleth map, and exporting combined imputed datasets for downstream analysis.

This project includes:
- A Python FastAPI backend for data ingestion, preprocessing, imputation, evaluation, and API endpoints.
- A Next.js 15 + React 18 frontend with Ant Design components and react-simple-maps for geographic visualization.
- Algorithms implemented: gKNN (geographic KNN), MICE (Iterative Imputer), and MissForest (random-forest-based iterative imputer).
- Built-in evaluation on a 20% masked holdout with MAE/RMSE, and paired statistical test hooks.

---

## Table of Contents

1. Overview
2. Tech Stack
3. Repository Structure
4. Data Sources
5. Backend (FastAPI)
6. Frontend (Next.js)
7. Setup and Run (macOS zsh)
8. Algorithms and Evaluation
9. API Endpoints
10. UI Walkthrough
11. CSV Export
12. Development Tips & Troubleshooting

---

## 1) Overview

Upload a CSV, inspect missingness, pick targets, and run gKNN/MICE/MissForest imputations. Explore pre-imputation relationships and post-imputation values with charts and a county choropleth. Download a clean, combined CSV that merges original and imputed values keyed by County Code.

---

## 2) Tech Stack

- Backend: FastAPI, pandas, numpy, scikit-learn, pingouin, statsmodels
- Imputation: gKNN (custom), MICE (IterativeImputer), MissForest (missingpy)
- Frontend: Next.js 15, React 18, TypeScript, Ant Design 5, Zustand, react-simple-maps, D3
- Build/runtime helpers: uvicorn, axios

Key NPM packages (see `client/package.json`): next, react, antd, axios, react-simple-maps, d3, zustand

Key Python packages (see `requirements.txt`): fastapi, uvicorn, pandas, numpy, scikit-learn, missingpy, pingouin, statsmodels, matplotlib, seaborn, xgboost (for experiments), pymc_bart (optional), optuna (optional), openpyxl

---

## 3) Repository Structure

High-level directories and notable files:

```
.
├─ app.py                       # FastAPI app (all endpoints)
├─ gknn.py                      # gKNN imputer
├─ mice.py                      # MICE imputer with evaluation hooks
├─ missforest.py                # MissForest imputer with evaluation + CSV export
├─ customLabelEncoder.py        # Consistent categorical encoding
├─ featureImportance.py         # (optional) feature scoring utilities
├─ client/                      # Next.js app
│  ├─ src/components/           # UI components (MapView, charts, modals)
│  ├─ src/app/                  # Next App Router pages (imputation, analysis)
│  └─ package.json              # Next scripts and deps
├─ requirements.txt             # Python deps (install into venv)
├─ package.json                 # Node root (Express for static hosting, optional)
├─ server.js                    # Express static server (optional for prod build)
└─ CDC time series/             # Reference geo/demographic datasets
```

Frontend highlights (in `client/src/components`):
- `MapView.tsx`: Albers USA choropleth via react-simple-maps. Hover, selection, neighbor and contributor highlighting, legend with collapse/toggle.
- `GeoMapModal.tsx`: Wide modal wrapper with map controls; disables hover while a county is selected.
- `ImputationConfiguration.tsx`: Algorithm/target selection, run control, map open, CSV download button.
- Chart components for distributions, feature importance, and before/after scatter views.

---

## 4) Data Sources

The app merges uploaded CSVs with county geo/demographic references in `CDC time series/`. The backend function `get_merged_df()` ensures consistent numeric columns and aligns County GEOIDs. GeoJSON for the map lives at `client/public/counties.geojson`.

---

## 5) Backend (FastAPI)

- Entry: `app.py` (run with uvicorn for dev)
- Session-scoped stores maintain pre-impute data and imputation results keyed by `session_id`.
- Imputation caching avoids recomputing for identical (algo, columns, iterations) within a session.
- CSV export: Combined (original + imputed) CSV is stored per session and downloadable.

Core dependencies (`requirements.txt`):
- fastapi, uvicorn, pandas, numpy, scikit-learn, python-multipart
- missingpy (MissForest), pingouin (stats), statsmodels
- matplotlib, seaborn, xgboost (optional experiments), pymc_bart/pymc (optional), optuna (optional), openpyxl

---

## 6) Frontend (Next.js 15)

- App Router (`client/src/app`) with pages for analysis, data features, and imputation.
- Ant Design 5 for UI; charts and map built on D3/react-simple-maps.
- Zustand store (`client/src/store/useDataStore.ts`) holds session state and update triggers.

Dev scripts (`client/package.json`):
- `npm run dev` – Next dev server
- `npm run build` – Next build
- `npm start` – Next production server
- `npm run lint` – ESLint

Note: A legacy `server.js` and root `package.json` exist for serving a static build with Express. For local development and modern deployments, prefer Next’s own `dev/start`.

---

## 7) Setup and Run (macOS zsh)

Backend
```zsh
cd /path/to/data-imputation-dashboard
python3 -m venv myvenv
source myvenv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Frontend
```zsh
cd client
npm install
npm run dev
```

URLs
- FastAPI: http://localhost:8000
- Next.js: http://localhost:3000

Optional (serve a built frontend with Express)
```zsh
cd client && npm run build && cd ..
npm run start
```

---

## 8) Algorithms and Evaluation

Implemented Algorithms
- gKNN (`gknn.py`): Geographic KNN with contributor tracking (neighbor maps persisted per run). Returns combined frames and neighbor metadata.
- MICE (`mice.py`): IterativeImputer baseline. Masks 20% of non-null entries per target column for evaluation, computes MAE and RMSE, and returns aligned test splits.

Holdout Evaluation
- For each target column, 20% of observable values are masked and imputed.
- Metrics: MAE, RMSE, sample count per column.
- Statistical tests: paired non-parametric Wilcoxon test (via pingouin), computed internally for MissForest; easy to expose via API.

CSV Output
- The imputer returns a combined DataFrame (original + imputed). The backend persists a CSV snapshot per session for download.

---

## 9) API Endpoints (summary)

Data lifecycle
- `POST /dataframe/post` – Upload CSV; returns `session_id` and merged numeric frame.
- `GET /dataframe/describe` – Dtypes and describe stats for the current session.
- `GET /dataframe/missingness_summary` – Percentage missing per column.
- `POST /datatype/configure` – Configure a column’s dtype/encoding (numeric/categorical) with optional custom label encoder.

Imputation
- `POST /dataframe/impute` – Run imputation with `{algo, columns, iterations}`. Caches results for repeat calls.
- `POST /dataframe/impute/status` – Check if the above run is cached (fast UI gating).
- `GET /dataframe/column_distribution` – Original vs imputed distributions per column.
- `GET /dataframe/test_evaluation` – Flattened paired originals vs imputations for the 20% holdout; includes summary stats.
- `GET /dataframe/download_imputed_csv` – Download the combined imputed CSV for the session.

Visualization/analysis
- `GET /dataframe/scatter_plot_data` – Post-imputation scatter pairs (x vs y), labeled by imputed/rest.
- `GET /dataframe/neighbor_map` – Neighbor map (contributors and adjacency) from gKNN.
- Pre-imputation views:
  - `GET /dataframe/preimpute/columns` – Numeric-like columns in the pre-impute frame.
  - `GET /dataframe/preimpute/scatter` – Before-imputation scatter with missingness labeling and OLS line.

---

## 10) UI Walkthrough

1) Upload & Inspect
- Upload a CSV in the frontend. The backend merges with reference county data (GEOIDs) and returns a numeric working frame.
- View missingness summary to choose imputation targets.

2) Configure & Run
- In Imputation Configuration: pick algorithm (gKNN, MICE, MissForest), choose target column(s), set iterations, and run.
- A progress bar animates during runs; repeated runs with identical params are cached.

3) Map & Interactions
- Open the Geo Map. Hover highlight is green (#52c41a). Selected county remains green persistently.
- Contributors (for gKNN) appear filled blue with darker blue stroke; neighbors outline in blue.
- Legend can collapse/expand and move sides; when collapsed it fully hides.
- Hover is disabled when a county is selected; clear selection to re-enable.

4) Charts & Evaluation
- Compare original vs imputed distributions per column.
- Explore pre-imputation scatter relationships with missingness labels.
- Fetch 20% holdout pairs and summary stats from `/dataframe/test_evaluation`.

5) Export
- Use the “Download CSV” button in Imputation Configuration to retrieve the combined imputed CSV.

---

## 11) CSV Export

The backend stores a session-level `downloadable_csv` after a successful imputation. The frontend calls:

```
GET /dataframe/download_imputed_csv?session_id={SESSION}
```

to stream a file named `imputed_data_{session}.csv`.

---

## 12) Development Tips & Troubleshooting

Versions & tooling
- Node: Next 15 typically requires Node 18+. Use `nvm` to switch if needed.
- Python: 3.10+ works well. Use a virtualenv (`myvenv/`) and `pip install -r requirements.txt`.

Common issues
- Missing `missingpy`: required for MissForest. Ensure it’s present in `requirements.txt` and installed.
- CORS: FastAPI is configured with `allow_origins=["*"]` for simplicity during dev.
- Port conflicts: Next dev defaults to 3000; FastAPI uses 8000.
- Ant Design `Modal` styles: use `styles={{ body: { ... } }}` (not `bodyStyle`) on v5.
- Map sizing: projection scale in `MapView.tsx` controls the rendered map size.

Useful scripts
- Backend: `uvicorn app:app --reload --port 8000`
- Frontend: `npm run dev` (Next), `npm run build && npm start` for production.
- Optional: `npm run build` at repo root builds the client; `npm start` serves it via Express.

---

If you need additional endpoints, metrics exposure (e.g., Wilcoxon results), or new algorithms, the code is organized to plug them in with minimal changes.