import json
import os
import io
import time
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials
from fastapi import FastAPI, Body, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "credentials.json")
SHEET_NAME = "Office Data System" 
WORKSHEET_NAME = "Project_Data" # Main Data Tab
EMPLOYEE_SHEET_NAME = "Employees" # New Tab for Auth

# --- CACHE SETTINGS ---
CACHE_DURATION = 300  # 5 Minutes
cached_df = None
last_fetch_time = 0

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GOOGLE CONNECTION HELPERS ---
def get_gspread_client():
    """Authenticates and returns the gspread client."""
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    
    if "GOOGLE_CREDENTIALS_JSON" in os.environ:
        creds_dict = json.loads(os.environ["GOOGLE_CREDENTIALS_JSON"])
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    elif os.path.exists(CREDENTIALS_FILE):
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=scopes)
    else:
        raise Exception("No Google Credentials found!")

    return gspread.authorize(creds)

def get_cached_data():
    """Fetches Project Data with caching to prevent rate limiting."""
    global cached_df, last_fetch_time
    
    current_time = time.time()
    is_expired = (current_time - last_fetch_time) > CACHE_DURATION
    
    if cached_df is None or is_expired:
        print("⚡ Cache expired. Fetching fresh data...")
        try:
            client = get_gspread_client()
            sheet = client.open(SHEET_NAME)
            ws = sheet.worksheet(WORKSHEET_NAME)
            data = ws.get_all_records()
            cached_df = pd.DataFrame(data)
            last_fetch_time = current_time
        except Exception as e:
            print(f"Error fetching data: {e}")
            if cached_df is not None: return cached_df
            raise e
    return cached_df

# --- NEW ENDPOINT: EMPLOYEE VERIFICATION ---
@app.get("/verify-employee/{emp_id}")
def verify_employee(emp_id: str):
    try:
        print(f"--- VERIFYING ID: {emp_id} ---") # Debug print
        
        # 1. Connect to Google Sheets
        client = get_gspread_client()
        sheet = client.open(SHEET_NAME)
        
        # 2. Check if 'Employees' tab exists
        try:
            ws = sheet.worksheet(EMPLOYEE_SHEET_NAME)
        except gspread.WorksheetNotFound:
            print(f"CRITICAL ERROR: Tab '{EMPLOYEE_SHEET_NAME}' not found in Google Sheet!")
            return {"allowed": False, "error": f"Tab '{EMPLOYEE_SHEET_NAME}' is missing. Please create it."}

        # 3. Get IDs
        valid_ids = ws.col_values(1)
        print(f"Found {len(valid_ids)} IDs in whitelist.") # Debug print

        # 4. Check Match
        clean_input = str(emp_id).strip().upper()
        clean_list = [str(x).strip().upper() for x in valid_ids]

        if clean_input in clean_list:
            return {"allowed": True}
        else:
            print(f"ID {clean_input} NOT found in list.")
            return {"allowed": False, "error": "You are not authorized to register"}

    except Exception as e:
        print(f"CRITICAL SERVER ERROR: {e}") # This will show in your terminal
        return {"allowed": False, "error": str(e)}


# --- EXISTING ENDPOINTS ---
@app.get("/projects")
def get_projects():
    try:
        df = get_cached_data()
        return {"data": df.fillna("").to_dict(orient="records")}
    except Exception as e:
        return {"data": []}

@app.get("/columns")
def get_columns():
    try:
        df = get_cached_data()
        return {"columns": df.columns.tolist()}
    except Exception as e:
        return {"columns": []}

@app.get("/stats")
def get_stats():
    try:
        df = get_cached_data()
        if df.empty: return {"total_projects": 0, "total_capacity": 0, "monthly_payments": {}, "available_months": []}

        # 1. Projects
        plant_col = next((c for c in df.columns if "plant type" in c.lower()), None)
        total_projects = len(df[df[plant_col].astype(str).str.strip() != ""]) if plant_col else len(df)

        # 2. Capacity
        cap_col = next((c for c in df.columns if "capacity" in c.lower() or "mw" in c.lower()), None)
        total_capacity = pd.to_numeric(df[cap_col], errors='coerce').fillna(0).sum() if cap_col else 0

        # 3. Payments
        payment_cols = [c for c in df.columns if "payment" in c.lower()]
        monthly_data = {}
        for col in payment_cols:
            name = col.lower().replace("payment", "").strip(" -_").title()
            total = pd.to_numeric(df[col], errors='coerce').fillna(0).sum()
            monthly_data[name] = round(float(total), 2)

        return {
            "total_projects": int(total_projects),
            "total_capacity": round(float(total_capacity), 2),
            "monthly_payments": monthly_data,
            "available_months": list(monthly_data.keys())
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/generate-report")
async def generate_report(selected_cols: List[str] = Body(...)):
    try:
        df = get_cached_data()
        valid_cols = [c for c in selected_cols if c in df.columns]
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df[valid_cols].to_excel(writer, index=False, sheet_name='Report')
        output.seek(0)
        headers = {'Content-Disposition': 'attachment; filename="PSPCL_Report.xlsx"'}
        return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)