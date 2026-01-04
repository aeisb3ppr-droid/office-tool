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
from pydantic import BaseModel

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

class ReadingInput(BaseModel):
    project_name: str
    date: str  # Format: YYYY-MM-DD
    current_export: float
    current_import: float
    remarks: str = ""

ReadingInput.model_rebuild()

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

def clean_header(h1, h2):
    """Merges double headers (Export + KWH -> Export - KWH)"""
    h1 = str(h1).strip().upper()
    h2 = str(h2).strip().upper()
    if h1 and h2: return f"{h1} - {h2}"
    if h2: return h2
    return h1

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

# --- CORE ENDPOINTS ---

@app.get("/history/{project_name}")
def get_project_history(project_name: str):
    """Fetches the raw ledger with SMART MATCHING (Exact or Partial)."""
    print(f"\n🔍 LOOKUP REQUEST: '{project_name}'") 
    try:
        client = get_gspread_client()
        sheet = client.open(SHEET_NAME)
        worksheets = sheet.worksheets()
        
        # Target Name (from Dashboard)
        target = project_name.strip().lower()
        
        # --- 1. TRY EXACT MATCH ---
        ws = next((w for w in worksheets if w.title.strip().lower() == target), None)

        # --- 2. TRY PARTIAL MATCH (If exact fails) ---
        if not ws:
            print(f"   ⚠️ Exact match failed. Trying partial match for '{target}'...")
            # Check if Tab Name is inside Target OR Target is inside Tab Name
            # e.g. Matches "Allianz" with "Allianz Power Project"
            ws = next((w for w in worksheets if w.title.strip().lower() in target or target in w.title.strip().lower()), None)

        if not ws:
            all_titles = [w.title for w in worksheets]
            print(f"   ❌ ERROR: Sheet not found. Available: {all_titles}")
            return {"error": f"Sheet not found. Available tabs: {all_titles}"}

        print(f"   ✅ FOUND TAB: {ws.title}")
        
        # --- (Rest of the function remains the same) ---
        rows = ws.get_all_values()
        if len(rows) < 3: return {"data": []}

        h1 = rows[0]
        h2 = rows[1]
        headers = []
        current_group = ""
        
        for i, col in enumerate(h2):
            if i < len(h1) and h1[i].strip():
                current_group = h1[i].strip()
            
            clean_col = col.strip()
            if current_group and clean_col and clean_col != "MONTH":
                headers.append(f"{current_group} - {clean_col}")
            else:
                headers.append(clean_col or f"Col_{i}")

        data = []
        for r in rows[2:]:
            if not any(r): continue 
            row_dict = {}
            for i, val in enumerate(r):
                if i < len(headers):
                    row_dict[headers[i]] = val
            data.append(row_dict)

        print(f"   🚀 Returning {len(data)} records")
        return {"data": data, "headers": headers}

    except Exception as e:
        print(f"   🔥 CRITICAL ERROR: {e}")
        return {"error": str(e)}

@app.post("/add-reading")
def add_reading(payload: ReadingInput):
    """Calculates bill based on previous row and appends new entry."""
    try:
        client = get_gspread_client()
        sheet = client.open(SHEET_NAME)
        ws = next((w for w in sheet.worksheets() if w.title.lower() == payload.project_name.lower()), None)
        
        if not ws:
            raise HTTPException(status_code=404, detail="Project Sheet not found")

        # 1. Fetch Last Row to get Previous Readings & Constants
        all_values = ws.get_all_values()
        if len(all_values) < 3:
             raise HTTPException(status_code=400, detail="Sheet is empty or missing headers. Cannot calculate.")

        last_row = all_values[-1]
        
        # --- MAPPING INDICES BASED ON 'ALLIANZ' FORMAT ---
        # 0: Month | 1: MF | 2: Prev Exp | 3: Curr Exp | 11: Rate
        try:
            mf = float(last_row[1].replace(",",""))
            prev_export = float(last_row[3].replace(",","")) # Last Current becomes new Previous
            prev_import = float(last_row[7].replace(",","")) 
            rate = float(last_row[11].replace(",",""))
        except (ValueError, IndexError):
             raise HTTPException(status_code=400, detail="Could not read numeric data from the last row. Check sheet format.")

        # 2. PERFORM CALCULATIONS
        # Export Side
        diff_export = payload.current_export - prev_export
        kwh_export = diff_export * mf
        
        # Import Side
        diff_import = payload.current_import - prev_import
        kwh_import = diff_import * mf
        
        # Net
        net_export = kwh_export - kwh_import
        bill_amount = net_export * rate
        
        # 3. PREPARE NEW ROW
        # Format: Month, MF, PrevExp, CurrExp, DiffExp, KwhExp, PrevImp, CurrImp, DiffImp, KwhImp, NetExp, Rate, Bill
        new_row = [
            payload.date,             # 0: Month
            mf,                       # 1: MF
            prev_export,              # 2: Prev Reading (Exp)
            payload.current_export,   # 3: Curr Reading (Exp)
            diff_export,              # 4: Diff
            kwh_export,               # 5: KWH
            prev_import,              # 6: Prev Reading (Imp)
            payload.current_import,   # 7: Curr Reading (Imp)
            diff_import,              # 8: Diff
            kwh_import,               # 9: KWH
            net_export,               # 10: Net Export
            rate,                     # 11: Rate
            round(bill_amount),       # 12: Bill Amount
            "", "", "",               # 13-15: Rebates/Deductions (Empty)
            "", "", "", ""            # 16+: Metadata cols
        ]

        # 4. APPEND TO GOOGLE SHEET
        ws.append_row(new_row)
        
        # Clear Cache so Dashboard updates immediately
        global cached_df
        cached_df = None
        
        return {"success": True, "message": "Reading added & Bill Calculated!", "bill_amount": bill_amount}

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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