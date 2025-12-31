import json
import os
import io
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials
from fastapi import FastAPI, Body
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "credentials.json")
SHEET_NAME = "Office Data System" 
WORKSHEET_NAME = "Project_Data"  # <--- RENAME YOUR GOOGLE SHEET TAB TO THIS

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GOOGLE CONNECTION ---
def connect_google():
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    
    # Priority 1: Environment Variable (Render)
    if "GOOGLE_CREDENTIALS_JSON" in os.environ:
        creds_dict = json.loads(os.environ["GOOGLE_CREDENTIALS_JSON"])
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    
    # Priority 2: Local File (Development)
    elif os.path.exists(CREDENTIALS_FILE):
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=scopes)
    
    else:
        raise Exception("No Google Credentials found!")

    client = gspread.authorize(creds)
    sheet = client.open(SHEET_NAME)
    return sheet.worksheet(WORKSHEET_NAME)

# --- API ENDPOINTS ---

@app.get("/projects")
def get_projects():
    try:
        ws = connect_google()
        # get_all_records returns a list of dicts: [{'Project': 'A', 'Capacity': 5}, ...]
        data = ws.get_all_records()
        return {"data": data}
    except Exception as e:
        print(f"Error: {e}")
        return {"data": []}

@app.get("/columns")
def get_columns():
    try:
        ws = connect_google()
        # Row 1 is headers
        headers = ws.row_values(1)
        return {"columns": headers}
    except:
        return {"columns": []}

@app.get("/stats")
def get_stats():
    try:
        ws = connect_google()
        df = pd.DataFrame(ws.get_all_records())

        if df.empty:
            return {"total_projects": 0, "total_capacity": 0, "latest_month": "N/A", "latest_payment": 0}
        
        # 1. Total Projects (Counting entries in 'Plant Type' column)
        plant_col = next((c for c in df.columns if "plant type" in c.lower()), None)
        total_projects = 0

    if plant_col:
    # .dropna() removes empty cells
    # .astype(str).str.strip() ensures we don't count cells that just have spaces
    valid_projects = df[plant_col].replace('', pd.NA).dropna()
    total_projects = len(valid_projects)
else:
    # Fallback if the column name changes slightly
    total_projects = len(df)
        
        # 2. Total Capacity (Finds any column with 'Capacity' or 'MW')
        cap_col = next((c for c in df.columns if "capacity" in c.lower() or "mw" in c.lower()), None)
        total_capacity = 0
        if cap_col:
            total_capacity = pd.to_numeric(df[cap_col], errors='coerce').sum()
        
        # 3. Monthly Payments Logic
        payment_cols = [c for c in df.columns if "payment" in c.lower()]

        # Create a dictionary of { "Month Name": Total_Sum }
        monthly_data = {}
        for col in payment_cols:
            # Clean the name (e.g., "April-25 Payment" -> "April-25")
            display_name = col.lower().replace("payment", "").strip(" -_").title()
            total_for_month = pd.to_numeric(df[col], errors='coerce').fillna(0).sum()
            monthly_data[display_name] = round(float(total_for_month), 2)

        return {
            "total_projects": int(total_projects),
            "total_capacity": round(total_capacity, 2),
            "monthly_payments": monthly_data,  # Now returns ALL months
            "available_months": list(monthly_data.keys()) # For your dropdown list
        }

    except Exception as e:
        return {"error": str(e)}

@app.post("/generate-report")
async def generate_report(selected_cols: List[str] = Body(...)):
    try:
        ws = connect_google()
        df = pd.DataFrame(ws.get_all_records())
        
        # Filter Columns
        valid_cols = [c for c in selected_cols if c in df.columns]
        final_df = df[valid_cols]
        
        # Export
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            final_df.to_excel(writer, index=False, sheet_name='Report')
        output.seek(0)
        
        headers = {'Content-Disposition': 'attachment; filename="Office_Report.xlsx"'}
        return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)