"use client";
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard"); 
  const [projects, setProjects] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total_projects: 0, total_capacity: 0, latest_month: '-', latest_payment: 0 });

  // Use Env Var for URL or fallback to Render
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://office-backend-w8nc.onrender.com";

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const pRes = await axios.get(`${API_BASE_URL}/projects`);
      setProjects(pRes.data.data);
      
      const cRes = await axios.get(`${API_BASE_URL}/columns`);
      setColumns(cRes.data.columns);

      const sRes = await axios.get(`${API_BASE_URL}/stats`);
      if (!sRes.data.error) {
        setStats(sRes.data);
      }
    } catch (e) {
      console.error("Server error");
      setStatus("Error fetching data from Google.");
    }
    setLoading(false);
  };

  const downloadReport = async () => {
    if(selectedCols.length === 0) return alert("Select columns!");
    setLoading(true);
    setStatus("Generating Report...");
    try {
      const res = await axios.post(`${API_BASE_URL}/generate-report`, selectedCols, { responseType: 'blob' });
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

  const filteredProjects = projects.filter(p => 
    Object.values(p).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      
      {/* NAVIGATION */}
      <nav className="bg-blue-900 text-white p-4 shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Cloud Office Dashboard</h1>
          <div className="space-x-2">
            <button onClick={() => setActiveTab("dashboard")} className={`px-3 py-2 rounded ${activeTab === 'dashboard' ? 'bg-blue-700' : 'hover:bg-blue-800'}`}>Dashboard</button>
            <button onClick={() => setActiveTab("report")} className={`px-3 py-2 rounded ${activeTab === 'report' ? 'bg-blue-700' : 'hover:bg-blue-800'}`}>Report Builder</button>
            <button onClick={fetchData} className="px-3 py-2 rounded bg-green-600 hover:bg-green-700">↻ Refresh</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-6">
        
        {status && (
          <div className="mb-6 p-4 rounded text-center font-bold bg-blue-100 text-blue-800">
            {status}
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
                <h3 className="text-gray-500 text-sm font-bold uppercase">Total Projects</h3>
                <p className="text-3xl font-bold text-gray-800">{stats.total_projects}</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-purple-500">
                <h3 className="text-gray-500 text-sm font-bold uppercase">Total Capacity</h3>
                <p className="text-3xl font-bold text-gray-800">{stats.total_capacity} <span className="text-sm text-gray-400">MW</span></p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-green-500">
                <h3 className="text-gray-500 text-sm font-bold uppercase">Latest Month</h3>
                <p className="text-xl font-bold text-gray-800">{stats.latest_month}</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-orange-500">
                <h3 className="text-gray-500 text-sm font-bold uppercase">Total Payment</h3>
                <p className="text-3xl font-bold text-gray-800">
                  ₹{(stats.latest_payment / 10000000).toFixed(2)} <span className="text-sm text-gray-400">Cr</span>
                </p>
              </div>
            </div>

            <input 
              type="text" 
              placeholder="Search Projects..." 
              className="w-full p-4 mb-6 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {loading && <p className="text-center text-gray-500 animate-pulse">Loading data from Google Sheets...</p>}

            <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    {/* Only show first 8 columns to keep table readable */}
                    {projects.length > 0 && Object.keys(projects[0]).slice(0, 8).map(header => (
                      <th key={header} className="p-4 font-bold text-gray-700 whitespace-nowrap">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProjects.map((row, idx) => (
                    <tr key={idx} className="hover:bg-blue-50 transition">
                       {Object.values(row).slice(0, 8).map((val: any, i) => (
                         <td key={i} className="p-4 truncate max-w-xs" title={String(val)}>{val}</td>
                       ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">Showing first 8 columns. Use "Report Builder" to download full data.</p>
          </div>
        )}

        {/* TAB 2: REPORT BUILDER */}
        {activeTab === 'report' && (
          <div className="bg-white p-8 rounded-lg shadow-lg">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Select Columns for Report</h2>
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

      </div>
    </div>
  );
}