import json
from google.oauth2.service_account import Credentials
import pandas as pd
import gspread
from gspread_dataframe import set_with_dataframe
from fastapi import FastAPI, UploadFile, File, Body
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import io
import os

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "credentials.json")
SHEET_NAME = "Office Data System" # <--- MAKE SURE THIS MATCHES YOUR GOOGLE SHEET NAME

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GOOGLE CONNECTION ---
# --- GOOGLE CONNECTION ---
def connect_google():
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    
    # Priority 1: Try to load from Environment Variable (Best for Render/Production)
    if "GOOGLE_CREDENTIALS_JSON" in os.environ:
        creds_dict = json.loads(os.environ["GOOGLE_CREDENTIALS_JSON"])
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    
    # Priority 2: Try to load from local file (Best for Local Development)
    elif os.path.exists(CREDENTIALS_FILE):
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=scopes)
    
    else:
        raise Exception("No Google Credentials found! Set GOOGLE_CREDENTIALS_JSON or add credentials.json")

    client = gspread.authorize(creds)
    sheet = client.open(SHEET_NAME)
    return sheet

# --- HELPER: SMART EXCEL READER ---
def smart_read_monthly(file_content):
    """
    Reads Excel and handles 2-row headers (Main Header + Sub Header).
    Example: 'April 2025' (Row 5) + 'Generation' (Row 6) -> 'April 2025 - Generation'
    """
    # 1. Read first 20 rows to find where the table starts
    df_raw = pd.read_excel(io.BytesIO(file_content), header=None, nrows=20)
    
    # 2. Find the row containing "Sr. No" or "Sr.No"
    header_idx = -1
    for idx, row in df_raw.iterrows():
        row_str = row.astype(str).str.lower().values
        if any("sr.no" in s or "sr. no" in s for s in row_str):
            header_idx = idx
            break
            
    if header_idx == -1: return None

    # 3. Read the file again, capturing both the Header Row and the Sub-Header Row
    # We read from header_idx (Row 1) and header_idx+1 (Row 2)
    df = pd.read_excel(io.BytesIO(file_content), header=[header_idx, header_idx+1])
    
    # 4. Flatten the 2-level columns into 1 level
    new_columns = []
    
    for col in df.columns:
        # col is a tuple: ('April 2025', 'Generation')
        raw_top = col[0]
        
        # --- NEW FIX: Handle Dates Gracefully ---
        if isinstance(raw_top, pd.Timestamp):
            # Formats date as "April-25" (Full Month - Year)
            top_val = raw_top.strftime('%B-%y') 
        else:
            top_val = str(raw_top).strip()
        # ----------------------------------------

        sub_val = str(col[1]).strip()
        
        # Clean up "Unnamed" or "nan"
        if "Unnamed" in top_val or top_val == "nan": top_val = ""
        if "Unnamed" in sub_val or sub_val == "nan": sub_val = ""
        
        # Merge logic
        if top_val and sub_val:
            new_columns.append(f"{top_val} - {sub_val}")
        elif top_val:
            new_columns.append(top_val)
        elif sub_val:
            new_columns.append(sub_val)
        else:
            new_columns.append("Column_" + str(len(new_columns)))

    df.columns = new_columns
    
    # 5. Drop the first row if it's empty (artifact of double header)
    df = df.iloc[0:] 
    
    # 6. Remove rows where 'Sr. No' is empty or not a number
    # (Find the column that looks like Sr No)
    sr_col = next((c for c in df.columns if "Sr" in c and "No" in c), df.columns[0])
    df = df[pd.to_numeric(df[sr_col], errors='coerce').notnull()]

    return df

    # Deduplicate columns
    counts = {}
    final_cols = []
    for col in raw_columns:
        if col not in counts:
            counts[col] = 1
            final_cols.append(col)
        else:
            counts[col] += 1
            final_cols.append(f"{col}_{counts[col]}")
            
    df_data.columns = final_cols
    df_data = df_data[pd.to_numeric(df_data.iloc[:, 0], errors='coerce').notnull()]
    
    if 'Name of Project' in df_data.columns:
        df_data['Name of Project'] = df_data['Name of Project'].astype(str).str.strip()
        
    return df_data

# --- API ENDPOINTS ---

@app.get("/projects")
def get_projects():
    try:
        sh = connect_google()
        ws = sh.worksheet("Master_Data")
        data = ws.get_all_records()
        return {"data": data}
    except Exception as e:
        print(f"Error: {e}")
        return {"data": []}

@app.get("/columns")
def get_columns():
    try:
        sh = connect_google()
        # Fetch headers only (row 1) for speed
        headers_m = sh.worksheet("Master_Data").row_values(1)
        headers_g = sh.worksheet("Monthly_Data").row_values(1)
        all_cols = sorted(list(set(headers_m + headers_g)))
        return {"columns": all_cols}
    except:
        return {"columns": []}

@app.post("/append-data")
async def append_data(file: UploadFile = File(...)):
    """Reads Excel, Merges with Google Sheet, Saves back to Google Sheet"""
    try:
        content = await file.read()
        df_new = smart_read_monthly(content)
        if df_new is None: return {"error": "Invalid File"}
        
        sh = connect_google()
        ws = sh.worksheet("Monthly_Data")
        
        # 1. Download existing data from Google
        existing_data = ws.get_all_records()
        if existing_data:
            df_existing = pd.DataFrame(existing_data)
        else:
            df_existing = pd.DataFrame() # Empty sheet

        # 2. Merge Logic (Using Pandas)
        if not df_existing.empty:
             # Identify new columns
            cols_to_use = ['Name of Project'] + [c for c in df_new.columns if c not in df_existing.columns]
            df_new_subset = df_new[cols_to_use]
            
            # Merge
            df_updated = pd.merge(df_existing, df_new_subset, on="Name of Project", how="outer")
        else:
            df_updated = df_new
        
        # 3. Upload back to Google (Overwrite sheet)
        ws.clear() # Clear old data
        set_with_dataframe(ws, df_updated) # Upload new merged data
        
        return {"status": "Google Sheet Updated Successfully!"}
    except Exception as e:
        return {"error": str(e)}
        
@app.post("/upload-master")
async def upload_master(file: UploadFile = File(...)):
    """One-time upload for Master Data to Google Sheets"""
    try:
        content = await file.read()
        df = pd.read_excel(io.BytesIO(content), header=0)
        df = df[pd.to_numeric(df['SR. No.'], errors='coerce').notnull()]
        
        sh = connect_google()
        ws = sh.worksheet("Master_Data")
        ws.clear()
        set_with_dataframe(ws, df)
        return {"status": "Master Data Synced to Google!"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/generate-report")
async def generate_report(selected_cols: List[str] = Body(...)):
    try:
        sh = connect_google()
        # Download both sheets to memory
        df_master = pd.DataFrame(sh.worksheet("Master_Data").get_all_records())
        df_monthly = pd.DataFrame(sh.worksheet("Monthly_Data").get_all_records())
        
        # Join
        df_monthly['JoinKey'] = df_monthly['Name of Project'].astype(str).str.upper().str.strip()
        df_master['JoinKey'] = df_master['NAME OF GENERATING COMPANY'].astype(str).str.upper().str.strip()
        
        merged = pd.merge(df_monthly, df_master, on='JoinKey', how='left')
        
        # Filter & Export
        valid_cols = [c for c in selected_cols if c in merged.columns]
        final_df = merged[valid_cols]
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            final_df.to_excel(writer, index=False, sheet_name='Custom Report')
        output.seek(0)
        
        headers = {'Content-Disposition': 'attachment; filename="Office_Report.xlsx"'}
        return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return {"error": str(e)}

@app.get("/stats")
def get_stats():
    try:
        sh = connect_google()
        
        # 1. Fetch Data
        ws_master = sh.worksheet("Master_Data")
        ws_monthly = sh.worksheet("Monthly_Data")
        df_master = pd.DataFrame(ws_master.get_all_records())
        df_monthly = pd.DataFrame(ws_monthly.get_all_records())
        
        # 2. Calculate Master Stats
        # Clean up column names to be safe
        df_master.columns = [c.strip() for c in df_master.columns]
        
        # Total Capacity (Sum of 'Installed Project capacity (MW)')
        # We look for a column that contains "Capacity" or "MW"
        cap_col = next((c for c in df_master.columns if "capacity" in c.lower()), None)
        total_capacity = 0
        if cap_col:
            total_capacity = pd.to_numeric(df_master[cap_col], errors='coerce').sum()

        # Count Projects
        total_projects = len(df_master)
        
        # 3. Calculate Monthly Stats (e.g., Latest Month Payment)
        # We try to find the most recent "Payment" column
        payment_cols = [c for c in df_monthly.columns if "Payment" in c]
        latest_payment = 0
        latest_month = "N/A"
        
        if payment_cols:
            # Sort columns to find the latest one (usually the last one added)
            latest_col = payment_cols[-1] 
            latest_payment = pd.to_numeric(df_monthly[latest_col], errors='coerce').sum()
            latest_month = latest_col.split("-")[0].strip() # Extract "2025-04-01"

        return {
            "total_projects": total_projects,
            "total_capacity": round(total_capacity, 2),
            "latest_month": latest_month,
            "latest_payment": round(latest_payment, 2) # Returns value in Rupees
        }
    except Exception as e:
        print(f"Stats Error: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)