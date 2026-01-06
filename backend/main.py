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
from typing import List, Optional, Any, Dict
from pydantic import BaseModel

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "credentials.json")
SHEET_NAME = "Office Data System" 
WORKSHEET_NAME = "Project_Data" # Main Data Tab
EMPLOYEE_SHEET_NAME = "Employees" # Auth Tab

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

# --- MODELS ---

class ReadingInput(BaseModel):
    project_name: str
    date: str 
    current_export: float
    current_import: float
    # Extra Fields
    power_factor: Optional[str] = ""
    invoice_no: Optional[str] = ""
    invoice_date: Optional[str] = ""
    submission_date: Optional[str] = ""
    verify_date: Optional[str] = ""
    remarks: Optional[str] = ""

class UpdateRowInput(BaseModel):
    project_name: str
    month_date: str  # The unique identifier for the row (Date/Month column)
    updated_data: Dict[str, Any] # Map of Header Name -> New Value

ReadingInput.model_rebuild()
UpdateRowInput.model_rebuild()

# --- HELPERS ---

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
    """Fetches Project List with caching."""
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

def find_worksheet(sheet, project_name):
    """Smart matching helper to find a worksheet."""
    worksheets = sheet.worksheets()
    target = project_name.strip().lower()
    
    # 1. Exact Match
    ws = next((w for w in worksheets if w.title.strip().lower() == target), None)
    
    # 2. Partial Match
    if not ws:
        ws = next((w for w in worksheets if target in w.title.strip().lower() or w.title.strip().lower() in target), None)
        
    return ws

# --- ENDPOINTS ---

@app.get("/verify-employee/{emp_id}")
def verify_employee(emp_id: str):
    try:
        client = get_gspread_client()
        sheet = client.open(SHEET_NAME)
        ws = sheet.worksheet(EMPLOYEE_SHEET_NAME)
        
        valid_ids = [str(x).strip().upper() for x in ws.col_values(1)]
        clean_input = str(emp_id).strip().upper()

        if clean_input in valid_ids:
            return {"allowed": True}
        else:
            return {"allowed": False, "error": "Unauthorized ID"}
    except Exception as e:
        return {"allowed": False, "error": str(e)}

@app.get("/history/{project_name}")
def get_project_history(project_name: str):
    print(f"\n🔍 LOOKUP: '{project_name}'") 
    try:
        client = get_gspread_client()
        sheet = client.open(SHEET_NAME)
        ws = find_worksheet(sheet, project_name)

        if not ws:
            return {"error": "Sheet not found"}

        rows = ws.get_all_values()
        if len(rows) < 3: return {"data": []}

        h1 = rows[0]
        h2 = rows[1]
        headers = []
        current_group = ""
        
        # Build Clean Headers (e.g. "EXPORT - CURRENT")
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

        return {"data": data, "headers": headers}

    except Exception as e:
        print(f"ERROR: {e}")
        return {"error": str(e)}

@app.post("/add-reading")
def add_reading(payload: ReadingInput):
    """Calculates bill based on LAST VALID row and appends new entry."""
    try:
        print(f"--- ADD READING: {payload.project_name} ---")
        client = get_gspread_client()
        sheet = client.open(SHEET_NAME)
        ws = find_worksheet(sheet, payload.project_name)
        
        if not ws:
            raise HTTPException(status_code=404, detail="Project Sheet not found")

        # 1. Fetch Data & Find Last Valid Row
        all_values = ws.get_all_values()
        last_valid_row = None
        
        # Iterate backwards to skip "Total" rows or Notes
        for i in range(len(all_values) - 1, 1, -1):
            row = all_values[i]
            if len(row) < 12: continue 
            try:
                # Check if MF (Index 1) is a number
                float(str(row[1]).replace(",","")) 
                last_valid_row = row
                break
            except ValueError:
                continue
        
        if not last_valid_row:
             raise HTTPException(status_code=400, detail="Could not find valid previous data (MF/Rates). Check sheet format.")

        # 2. Extract Previous Data
        try:
            mf = float(str(last_valid_row[1]).replace(",",""))
            # Last Current Export (Col 3) -> New Previous Export
            prev_export = float(str(last_valid_row[3]).replace(",","")) 
            # Last Current Import (Col 7) -> New Previous Import
            prev_import = float(str(last_valid_row[7]).replace(",","")) 
            rate = float(str(last_valid_row[11]).replace(",",""))
        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Error reading numbers: {e}")

        # 3. Calculate Bill
        diff_export = payload.current_export - prev_export
        kwh_export = diff_export * mf
        
        diff_import = payload.current_import - prev_import
        kwh_import = diff_import * mf
        
        net_export = kwh_export - kwh_import
        bill_amount = net_export * rate
        
        # 4. Prepare New Row
        # Adjust indices if your sheet structure changes
        new_row = [
            payload.date,             # 0
            mf,                       # 1
            prev_export,              # 2
            payload.current_export,   # 3
            diff_export,              # 4
            kwh_export,               # 5
            prev_import,              # 6
            payload.current_import,   # 7
            diff_import,              # 8
            kwh_import,               # 9
            net_export,               # 10
            rate,                     # 11
            round(bill_amount),       # 12
            payload.power_factor,     # 13
            payload.invoice_no,       # 14
            payload.invoice_date,     # 15
            payload.submission_date,  # 16
            payload.verify_date,      # 17
            payload.remarks           # 18
        ]

        ws.append_row(new_row)
        
        # Clear Cache
        global cached_df
        cached_df = None
        
        return {"success": True, "bill_amount": bill_amount}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/update-row")
def update_row(payload: UpdateRowInput):
    """Updates a specific row in the history based on the Date/Month."""
    try:
        print(f"--- UPDATE ROW: {payload.project_name} | {payload.month_date} ---")
        client = get_gspread_client()
        sheet = client.open(SHEET_NAME)
        ws = find_worksheet(sheet, payload.project_name)
        
        if not ws:
            raise HTTPException(status_code=404, detail="Project Sheet not found")

        # 1. Find Row Index by Date (Col A / Index 1)
        dates = ws.col_values(1)
        try:
            # gspread uses 1-based indexing
            row_index = dates.index(payload.month_date) + 1 
        except ValueError:
            raise HTTPException(status_code=404, detail=f"Row for date '{payload.month_date}' not found.")

        # 2. Map Headers to Column Indices
        headers_row_1 = ws.row_values(1)
        headers_row_2 = ws.row_values(2)
        
        header_map = {}
        current_group = ""
        for i, h2 in enumerate(headers_row_2):
            h1 = headers_row_1[i] if i < len(headers_row_1) else ""
            if h1.strip(): current_group = h1.strip()
            
            clean_h2 = h2.strip()
            # Reconstruct the key format: "GROUP - HEADER"
            full_name = f"{current_group} - {clean_h2}" if (current_group and clean_h2 and clean_h2 != "MONTH") else (clean_h2 or f"Col_{i}")
            header_map[full_name] = i + 1

        # 3. Prepare Updates
        cells_to_update = []
        for key, value in payload.updated_data.items():
            if key in header_map:
                col_idx = header_map[key]
                cells_to_update.append(gspread.Cell(row_index, col_idx, value))
        
        if cells_to_update:
            ws.update_cells(cells_to_update)
            global cached_df
            cached_df = None
            return {"success": True, "message": f"Updated {len(cells_to_update)} cells."}
        else:
            return {"success": False, "message": "No matching columns found to update."}

    except Exception as e:
        print(f"Update Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

        # 1. Projects Count
        plant_col = next((c for c in df.columns if "plant type" in c.lower()), None)
        total_projects = len(df[df[plant_col].astype(str).str.strip() != ""]) if plant_col else len(df)

        # 2. Capacity Sum
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