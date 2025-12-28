"use client";
import { useState, useEffect, ChangeEvent } from 'react';
import axios from 'axios';

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard"); 
  const [projects, setProjects] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // Load Data on Startup
  useEffect(() => {
    fetchData();
  }, []);
const [stats, setStats] = useState({ total_projects: 0, total_capacity: 0, latest_month: '-', latest_payment: 0 });
  const fetchData = async () => {
    try {
      const pRes = await axios.get("http://localhost:8000/projects");
      setProjects(pRes.data.data);
      
      const cRes = await axios.get("http://localhost:8000/columns");
      setColumns(cRes.data.columns);

      // NEW: Fetch Stats
      const sRes = await axios.get("http://localhost:8000/stats");
      if (!sRes.data.error) {
        setStats(sRes.data);
      }
    } catch (e) {
      console.error("Server error");
    }
  };

  // Generic File Upload Handler
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>, type: 'master' | 'monthly') => {
    if (!e.target.files?.[0]) return;
    
    setLoading(true);
    setStatus("Uploading to Google Sheets... This takes a few seconds.");
    
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const endpoint = type === 'master' ? 'upload-master' : 'append-data';
      await axios.post(`http://localhost:8000/${endpoint}`, formData);
      
      setStatus(`✅ ${type === 'master' ? 'Master Info' : 'Monthly Data'} Synced with Google!`);
      // Refresh local data to show changes immediately
      fetchData();
    } catch (error) {
      setStatus("❌ Error uploading file. Check backend console.");
    }
    setLoading(false);
  };

  const downloadReport = async () => {
    if(selectedCols.length === 0) return alert("Select columns!");
    setLoading(true);
    setStatus("Generating Report from Google Data...");
    try {
      const res = await axios.post("http://localhost:8000/generate-report", selectedCols, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Office_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      setStatus("Download Complete!");
    } catch (e) {
      setStatus("Error generating report.");
    }
    setLoading(false);
  };

  // Filter Logic
  const filteredProjects = projects.filter(p => 
    Object.values(p).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      
      {/* NAVIGATION */}
      <nav className="bg-blue-900 text-white p-4 shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Cloud Office Tool</h1>
          <div className="space-x-2">
            <button onClick={() => setActiveTab("dashboard")} className={`px-3 py-2 rounded ${activeTab === 'dashboard' ? 'bg-blue-700' : 'hover:bg-blue-800'}`}>Dashboard</button>
            <button onClick={() => setActiveTab("report")} className={`px-3 py-2 rounded ${activeTab === 'report' ? 'bg-blue-700' : 'hover:bg-blue-800'}`}>Report Builder</button>
            <button onClick={() => setActiveTab("upload")} className={`px-3 py-2 rounded ${activeTab === 'upload' ? 'bg-green-600' : 'hover:bg-green-700'}`}>+ Upload Data</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-6">
        
        {/* GLOBAL STATUS BAR */}
        {status && (
          <div className={`mb-6 p-4 rounded text-center font-bold ${status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-800'}`}>
            {status}
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <input 
              type="text" 
              placeholder="Search Projects..." 
              className="w-full p-4 mb-6 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {/* STATS CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {/* Card 1 */}
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
                <h3 className="text-gray-500 text-sm font-bold uppercase">Total Projects</h3>
                <p className="text-3xl font-bold text-gray-800">{stats.total_projects}</p>
              </div>
              
              {/* Card 2 */}
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-purple-500">
                <h3 className="text-gray-500 text-sm font-bold uppercase">Total Capacity</h3>
                <p className="text-3xl font-bold text-gray-800">{stats.total_capacity} <span className="text-sm text-gray-400">MW</span></p>
              </div>

              {/* Card 3 */}
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-green-500">
                <h3 className="text-gray-500 text-sm font-bold uppercase">Latest Month</h3>
                <p className="text-xl font-bold text-gray-800">{stats.latest_month}</p>
              </div>

              {/* Card 4 */}
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-orange-500">
                <h3 className="text-gray-500 text-sm font-bold uppercase">Total Payment</h3>
                <p className="text-3xl font-bold text-gray-800">
                  ₹{(stats.latest_payment / 10000000).toFixed(2)} <span className="text-sm text-gray-400">Cr</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">For {stats.latest_month}</p>
              </div>
            </div>
            {loading && <p className="text-center text-gray-500 animate-pulse">Fetching data from Google...</p>}

            {!loading && projects.length === 0 && (
              <div className="text-center p-10 bg-white rounded shadow">
                <p className="text-gray-500 mb-4">No data found in Google Sheets.</p>
                <button onClick={() => setActiveTab('upload')} className="text-blue-600 underline">Go to Upload Tab</button>
              </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      {/* We dynamically grab headers from the first project to handle any master file format */}
                      {projects.length > 0 && Object.keys(projects[0]).slice(0, 5).map(header => (
                        <th key={header} className="p-4 font-bold text-gray-700">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredProjects.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50 transition">
                         {Object.values(row).slice(0, 5).map((val: any, i) => (
                           <td key={i} className="p-4 truncate max-w-xs" title={val}>{val}</td>
                         ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REPORT BUILDER */}
        {activeTab === 'report' && (
          <div className="bg-white p-8 rounded-lg shadow-lg">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Select Columns</h2>
                <button onClick={() => setSelectedCols(columns)} className="text-blue-600 underline">Select All</button>
             </div>
             
             <div className="h-96 overflow-y-auto border p-4 rounded bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
               {columns.map(col => (
                 <label key={col} className="flex items-center space-x-2 p-1 hover:bg-white rounded cursor-pointer">
                   <input 
                     type="checkbox" 
                     checked={selectedCols.includes(col)} 
                     onChange={() => {
                       selectedCols.includes(col) ? setSelectedCols(selectedCols.filter(c=>c!==col)) : setSelectedCols([...selectedCols, col])
                     }} 
                     className="w-4 h-4 text-blue-600" 
                   />
                   <span className="text-xs truncate" title={col}>{col}</span>
                 </label>
               ))}
             </div>
             
             <button 
               onClick={downloadReport} 
               disabled={loading}
               className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400"
             >
               {loading ? "Generating..." : "Download Excel Report"}
             </button>
          </div>
        )}

        {/* TAB 3: UPLOAD DATA */}
        {activeTab === 'upload' && (
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* 1. Monthly Upload */}
            <div className="bg-white p-8 rounded-xl shadow-lg border-t-4 border-green-500">
              <h2 className="text-xl font-bold mb-2 text-gray-800">1. Add Monthly Data</h2>
              <p className="text-sm text-gray-500 mb-6">Upload your "NRSE Monthwise" sheet here. It will append new months to the database.</p>
              
              <div className="border-2 border-dashed border-green-200 bg-green-50 p-6 rounded text-center">
                <input type="file" onChange={(e) => handleUpload(e, 'monthly')} disabled={loading} />
              </div>
            </div>

            {/* 2. Master Upload */}
            <div className="bg-white p-8 rounded-xl shadow-lg border-t-4 border-blue-500">
              <h2 className="text-xl font-bold mb-2 text-gray-800">2. Update Master List</h2>
              <p className="text-sm text-gray-500 mb-6">Upload "Book1.xlsx" (Emails/Static info). <span className="text-red-500 font-bold">Warning: Overwrites existing Master list.</span></p>
              
              <div className="border-2 border-dashed border-blue-200 bg-blue-50 p-6 rounded text-center">
                <input type="file" onChange={(e) => handleUpload(e, 'master')} disabled={loading} />
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}