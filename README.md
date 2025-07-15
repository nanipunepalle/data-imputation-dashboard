# Full-Stack CSV Imputation Dashboard

This repository contains a full-stack dashboard application that allows users to:

1. Upload a CSV dataset.
2. Select a column to impute and specify the number of iterations.
3. Send these inputs to a Python backend (FastAPI) that performs a dummy imputation.
4. Render a D3.js histogram overlay (original vs. imputed values) in a React frontend served via Express.js.

---

## Table of Contents

1. [Prerequisites](#prerequisites)  
2. [Project Structure](#project-structure)  
3. [Backend Setup (FastAPI)](#backend-setup-fastapi)  
4. [Frontend Setup (React + D3)](#frontend-setup-react--d3)  
5. [Express Server (Serving React Build)](#express-server-serving-react-build)  
6. [Running in Development](#running-in-development)  
7. [Building & Running in Production](#building--running-in-production)  

---

## Prerequisites

Before you start, ensure that you have the following installed on your machine:

- **Node.js (v14 or newer) & npm**  
  ```bash
  node --version   # should be v14.x or higher
  npm --version    # any recent npm is fine
  ```
- **Python 3.8 or newer**  
  ```bash
  python3 --version   # should be 3.8+
  ```
- **Git** (optional, but recommended)  
  ```bash
  git --version
  ```
- **A code editor/IDE** of your choice (e.g., VS Code).

---

## Project Structure

```
your-project-folder/
├─ app.py                 # FastAPI backend code
├─ requirements.txt       # Python dependencies
├─ server.js              # Express server to serve React build
├─ package.json           # Root Node.js config (Express)
└─ client/                # React frontend
   ├─ package.json        # React + D3 dependencies
   └─ src/
      ├─ index.js
      └─ App.js
```

- **`app.py`**: FastAPI application exposing `POST /api/impute`.  
- **`requirements.txt`**: Lists `fastapi`, `uvicorn`, and `pandas`.  
- **`server.js`**: Express server that serves the React production build (`client/build`).  
- **`package.json`** (root): Defines scripts to start Express and to build/serve the React client.  
- **`client/`**: A Create React App project that handles CSV upload, column selection, calls the backend, and renders a D3 histogram.

---

## Backend Setup (FastAPI)

1. **Navigate to the project root**  
   ```bash
   cd your-project-folder
   ```

2. **Create and activate a Python virtual environment**  
   ```bash
   python3 -m venv venv
   source venv/bin/activate      # macOS/Linux
   # OR on Windows (PowerShell):
   # .\venv\Scripts\Activate.ps1
   ```

3. **Create `requirements.txt`** (if not already present) with the following contents:  
   ```
   fastapi
   uvicorn
   pandas
   ```

4. **Install Python dependencies**  
   ```bash
   pip install -r requirements.txt
   ```

---

## Frontend Setup (React + D3)

1. **Navigate into the `client/` directory**  
   ```bash
   cd your-project-folder/client
   ```

2. **Install React & D3 dependencies**  
   ```bash
   npm install
   npm install d3
   ```

3. **Run the React development server**  
   ```bash
   npm start
   ```
   - React dev server runs on:  
     ```
     http://localhost:3000
     ```
   - Because FastAPI’s CORS is open (`allow_origins=["*"]`), the React app can call `http://localhost:8000/api/impute`.

---

## Express Server (Serving React Build)

1. **Navigate back to project root**  
   ```bash
   cd ../    # exit client/ and return to your-project-folder
   ```


3. **Install Express** (if not already)  
   ```bash
   npm install express
   ```

---

## Running in Development

1. **Start the Python backend**  
   ```bash
   cd your-project-folder
   source venv/bin/activate       # (or Windows equivalent)
   uvicorn app:app --reload --port 8000
   ```
   - Backend API available at `http://localhost:8000`.

2. **Start the React frontend (dev server)**  
   ```bash
   cd your-project-folder/client
   npm start
   ```
   - React app available at `http://localhost:3000`.
   - When you upload a CSV and click “Submit,” React will POST to `http://localhost:8000/api/impute`.

You can now develop simultaneously: FastAPI (port 8000) and React (port 3000).

---