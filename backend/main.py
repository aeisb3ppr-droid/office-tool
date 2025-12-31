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
WORKSHEET_NAME = "Project_Data" 

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
    
    if "GOOGLE_CREDENTIALS_JSON" in os.environ:
        creds_dict = json.loads(os.environ["GOOGLE_CREDENTIALS_JSON"])
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
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
        data = ws.get_all_records()
        return {"data": data}
    except Exception as e:
        print(f"Error fetching projects: {e}")
        return {"data": []}

@app.get("/columns")
def get_columns():
    try:
        ws = connect_google()
        headers = ws.row_values(1)
        return {"columns": headers}
    except Exception as e:
        return {"columns": []}

@app.get("/stats")
def get_stats():
    try:
        ws = connect_google()
        df = pd.DataFrame(ws.get_all_records())
        
        if df.empty:
            return {
                "total_projects": 0,
                "total_capacity": 0,
                "monthly_payments": {},
                "available_months": []
            }

        # 1. Total Projects (Counting entries in 'Plant Type' column)
        plant_col = next((c for c in df.columns if "plant type" in c.lower()), None)
        total_projects = 0
        if plant_col:
            # Filters out empty strings and actual Null/NaN values
            total_projects = len(df[df[plant_col].astype(str).str.strip() != ""])
        else:
            total_projects = len(df)

        # 2. Total Capacity (Case-insensitive search)
        cap_col = next((c for c in df.columns if "capacity" in c.lower() or "mw" in c.lower()), None)
        total_capacity = 0
        if cap_col:
            total_capacity = pd.to_numeric(df[cap_col], errors='coerce').fillna(0).sum()

        # 3. Monthly Payments Logic (Find all columns with 'payment')
        payment_cols = [c for c in df.columns if "payment" in c.lower()]
        monthly_data = {}
        
        for col in payment_cols:
            # Format the name for the UI (e.g., "April-25 Payment" -> "April-25")
            display_name = col.lower().replace("payment", "").strip(" -_").title()
            total_for_month = pd.to_numeric(df[col], errors='coerce').fillna(0).sum()
            monthly_data[display_name] = round(float(total_for_month), 2)

        return {
            "total_projects": int(total_projects),
            "total_capacity": round(float(total_capacity), 2),
            "monthly_payments": monthly_data,
            "available_months": list(monthly_data.keys())
        }
    except Exception as e:
        print(f"Stats Error: {e}")
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
            final_df.