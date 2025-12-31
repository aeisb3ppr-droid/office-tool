"use client";
import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { auth } from './firebaseConfig'; // Ensure this file exists!

export default function Home() {
  // --- AUTH STATE ---
  const [user, setUser] = useState<any>(null);
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // --- DASHBOARD STATE ---
  const [activeTab, setActiveTab] = useState("dashboard"); 
  const [projects, setProjects] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>({ 
    total_projects: 0, total_capacity: 0, monthly_payments: {}, available_months: [] 
  });
  const [selectedMonth, setSelectedMonth] = useState("");

  // Use Env Var or localhost fallback
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // Check Login Status on Load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchData();
    });
    return () => unsubscribe();
  }, []);

  // --- AUTH HANDLER ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    
    // We append @pspcl.in to make the ID look like an email for Firebase
    const email = `${empId.trim()}@pspcl.in`; 

    try {
      if (authView === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // REGISTER FLOW: Verify Whitelist first
        const verifyRes = await axios.get(`${API_BASE_URL}/verify-employee/${empId}`);
        
        if (!verifyRes.data.allowed) {
          throw new Error(verifyRes.data.error || "Employee ID not authorized.");
        }

        // If verified, create account
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError("ID already registered. Please Login.");
      } else if (err.code === 'auth/invalid-credential') {
        setAuthError("Invalid ID or Password.");
      } else {
        setAuthError(err.message.replace("Firebase: ", ""));
      }
    }
    setAuthLoading(false);
  };

  const logout = async () => {
    await signOut(auth);
    setProjects([]);
  };

  // --- DATA FETCHING ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const sRes = await axios.get(`${API_BASE_URL}/stats`);
      if (!sRes.data.error) {
         const allMonths = sRes.data.available_months || [];
         const filtered = allMonths.filter((m: string) => 
           !m.includes("Total") && !m.includes("Previous Year")
         );
         setStats({ ...sRes.data, available_months: filtered });
         if (filtered.length > 0) setSelectedMonth(filtered[filtered.length - 1]);
      }
      const pRes = await axios.get(`${API_BASE_URL}/projects`);
      setProjects(pRes.data.data || []);
      const cRes = await axios.get(`${API_BASE_URL}/columns`);
      setColumns(cRes.data.columns || []);
    } catch (e) {
      console.error(e);
      setStatus("Error fetching data. Is the backend running?");
    }
    setLoading(false);
  };

  const downloadReport = async () => {
    if(selectedCols.length === 0) return alert("Select at least one column.");
    setLoading(true);
    setStatus("Generating Excel...");
    try {
      const res = await axios.post(`${API_BASE_URL}/generate-report`, selectedCols, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'PSPCL_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      setStatus("Download Complete!");
    } catch (e) {
      setStatus("Report generation failed.");
    }
    setLoading(false);
  };

  // --- LOGIN SCREEN ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-slate-800 to-gray-900 p-4 font-sans">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
          <div className="bg-blue-800 p-8 text-center relative overflow-hidden">
             {/* Decorative Circle */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-10 -mt-10"></div>
            
            <h1 className="text-3xl font-extrabold text-white tracking-widest">PSPCL</h1>
            <p className="text-blue-200 text-xs mt-1 uppercase tracking-wider">Punjab State Power Corporation Ltd.</p>
            <div className="mt-4 inline-block px-4 py-1 rounded-full bg-blue-900/40 border border-blue-400/30 text-blue-100 text-[10px] font-bold uppercase tracking-wide">
              Power Purchase & Regulation
            </div>
          </div>

          <div className="p-8">
            <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">
              {authView === "login" ? "Employee Login" : "New Registration"}
            </h2>

            {authError && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100 text-center flex items-center justify-center gap-2">
                <span>⚠️</span> {authError}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Employee ID</label>
                <input 
                  type="text" 
                  required
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-800 font-medium"
                  placeholder="e.g. 10452"
                  value={empId}
                  onChange={e => setEmpId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Password</label>
                <input 
                  type="password" 
                  required
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-800"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                disabled={authLoading}
                className="w-full py-3.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg transition shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed flex justify-center items-center"
              >
                {authLoading ? <span className="animate-pulse">Processing...</span> : (authView === "login" ? "Sign In" : "Verify & Register")}
              </button>
            </form>

            <div className="mt-6 text-center pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                {authView === "login" ? "New Employee?" : "Already have an account?"}
                <button 
                  onClick={() => {
                    setAuthView(authView === "login" ? "register" : "login");
                    setAuthError("");
                    setEmpId("");
                    setPassword("");
                  }}
                  className="ml-2 text-blue-700 font-bold hover:underline"
                >
                  {authView === "login" ? "Register Here" : "Login Here"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD (Protected) ---
  const filteredProjects = projects.filter(p => 
    Object.values(p).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      
      {/* NAVBAR */}
      <nav className="bg-slate-900 text-white shadow-xl sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0">
          <div className="flex items-center space-x-3">
             <div className="w-9 h-9 bg-gradient-to-tr from-orange-500 to-yellow-500 rounded-lg flex items-center justify-center font-bold shadow-lg">P</div>
             <div>
               <h1 className="text-lg font-bold leading-tight tracking-wide">PSPCL Dashboard</h1>
               <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Dept. of Power Purchase</p>
             </div>
          </div>
          
          <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end">
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button onClick={() => setActiveTab("dashboard")} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Data</button>
              <button onClick={() => setActiveTab("report")} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${activeTab === 'report' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Reports</button>
            </div>
            <div className="h-6 w-px bg-gray-700"></div>
            <button onClick={logout} className="text-xs text-red-400 hover:text-red-300 font-bold tracking-wide">LOGOUT</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* WELCOME HEADER */}
        <div className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Welcome, Employee #{user.email?.split('@')[0]}</h2>
            <p className="text-slate-500 text-sm mt-1">Overview of current power projects and financials.</p>
          </div>
          <button onClick={fetchData} className="px-4 py-2 bg-white border border-gray-200 text-blue-600 hover:bg-blue-50 text-sm font-bold rounded-lg shadow-sm flex items-center transition">
            <span className={`mr-2 ${loading ? 'animate-spin' : ''}`}>↻</span> Refresh Data
          </button>
        </div>

        {status && (
          <div className="mb-6 p-3 rounded-lg text-center font-medium bg-blue-100 text-blue-800 border border-blue-200">
            {status}
          </div>
        )}

        {/* --- VIEW 1: DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in-up space-y-8">
            
            {/* STATS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition group">
                <div className="flex justify-between items-start">
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Projects</h3>
                    <span className="p-1.5 bg-blue-50 text-blue-600 rounded-md text-xs">Active</span>
                </div>
                <p className="text-3xl font-extrabold text-slate-800 mt-2">{stats.total_projects}</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Capacity</h3>
                    <span className="p-1.5 bg-green-50 text-green-600 rounded-md text-xs">MW</span>
                </div>
                <p className="text-3xl font-extrabold text-slate-800 mt-2">{stats.total_capacity}</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition md:col-span-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-orange-100 to-transparent rounded-bl-full -mr-5 -mt-5 z-0"></div>
                <div className="relative z-10">
                   <div className="flex justify-between items-center mb-1">
                    <h3 className="text-orange-500 text-xs font-bold uppercase tracking-wider">Monthly Payment</h3>
                    <select 
                      value={selectedMonth} 
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white hover:border-orange-300 outline-none cursor-pointer"
                    >
                      {stats.available_months.map((m: string) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex items-baseline space-x-2 mt-2">
                    <p className="text-4xl font-extrabold text-slate-800">
                      ₹{((stats.monthly_payments[selectedMonth] || 0) / 10000000).toFixed(2)} 
                      <span className="text-lg text-gray-400 ml-1 font-medium">Cr</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* DATA TABLE */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center space-x-3 bg-gray-50/50">
                 <span className="text-gray-400">🔍</span>
                 <input 
                  type="text" 
                  placeholder="Search projects by Name, ID, Capacity..." 
                  className="w-full bg-transparent outline-none text-gray-700 placeholder-gray-400 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {loading && <div className="p-12 text-center text-gray-500 italic">Syncing with server...</div>}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-gray-100/80 text-gray-600 font-semibold uppercase text-xs tracking-wide">
                    <tr>
                      {projects.length > 0 && Object.keys(projects[0]).slice(0, 8).map(header => (
                        <th key={header} className="p-4 whitespace-nowrap">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredProjects.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 transition">
                         {Object.values(row).slice(0, 8).map((val: any, i) => (
                           <td key={i} className="p-4 truncate max-w-[180px] text-gray-700 font-medium" title={String(val)}>{val}</td>
                         ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-gray-50 text-center text-xs text-gray-400 border-t border-gray-100">
                Displaying limited columns. Use "Reports" to download full dataset.
              </div>
            </div>
          </div>
        )}

        {/* --- VIEW 2: REPORTS --- */}
        {activeTab === 'report' && (
          <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-gray-200 animate-fade-in-up">
             <div className="text-center mb-8">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">📊</div>
                <h2 className="text-2xl font-bold text-slate-800">Custom Report Builder</h2>
                <p className="text-gray-500 text-sm mt-1">Select data points to generate an official PSPCL Excel report.</p>
             </div>
             
             <div className="flex justify-between items-center mb-3 px-1">
                <span className="text-xs font-bold text-gray-400 uppercase">Available Columns</span>
                <button onClick={() => setSelectedCols(columns)} className="text-xs text-blue-600 hover:text-blue-800 font-bold">Select All</button>
             </div>

             <div className="h-80 overflow-y-auto border border-gray-200 p-4 rounded-lg bg-slate-50/50 grid grid-cols-2 md:grid-cols-3 gap-3 mb-8 shadow-inner custom-scrollbar">
               {columns.map(col => (
                 <label key={col} className={`flex items-center space-x-3 p-2 rounded cursor-pointer transition select-none ${selectedCols.includes(col) ? 'bg-blue-100 border-blue-200 shadow-sm' : 'hover:bg-white'}`}>
                   <input 
                     type="checkbox" 
                     checked={selectedCols.includes(col)} 
                     onChange={() => selectedCols.includes(col) ? setSelectedCols(selectedCols.filter(c=>c!==col)) : setSelectedCols([...selectedCols, col])} 
                     className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" 
                   />
                   <span className="text-xs text-gray-700 font-medium truncate" title={col}>{col}</span>
                 </label>
               ))}
             </div>
             <button 
               onClick={downloadReport} 
               disabled={loading}
               className="w-full bg-slate-800 text-white py-4 rounded-lg font-bold hover:bg-slate-900 disabled:bg-gray-400 transition shadow-lg flex justify-center items-center gap-2"
             >
               {loading ? "Generating Report..." : (
                 <>
                   <span>Download Excel File</span>
                   <span className="text-gray-400 text-xs font-normal">(.xlsx)</span>
                 </>
               )}
             </button>
          </div>
        )}

      </div>
    </div>
  );
}