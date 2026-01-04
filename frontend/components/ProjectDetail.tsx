import { useState, useEffect } from 'react';
import axios from 'axios';
import { BackIcon } from './Icons';

interface Props {
  project: any;
  onBack: () => void;
}

export default function ProjectDetail({ project, onBack }: Props) {
  const [history, setHistory] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    current_export: '',
    current_import: '',
    date: new Date().toISOString().split('T')[0]
  });

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const getProjectName = () => {
    if (!project) return "";
    const keys = Object.keys(project);
    // Look for a key containing "Name" or "Project"
    const nameKey = keys.find(k => k.toLowerCase().includes("name") && k.toLowerCase().includes("project")) || keys[0];
    return String(project[nameKey] || "");
  };
const projectName = getProjectName();



  // Fetch History on Load
  useEffect(() => {
    if (projectName) fetchHistory();
  }, [projectName]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // Use the actual project name (e.g. "Allianz") to find the tab
      const res = await axios.get(`${API_BASE_URL}/history/${encodeURIComponent(String(projectName))}`);
      if (res.data.data) {
        setHistory(res.data.data);
        setHeaders(res.data.headers || []);
      }
    } catch (e) {
      console.error("Failed to load history", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm("Are you sure you want to generate the bill for this month?")) return;

    try {
      await axios.post(`${API_BASE_URL}/add-reading`, {
        project_name: projectName,
        date: formData.date,
        current_export: Number(formData.current_export),
        current_import: Number(formData.current_import)
      });
      alert("Bill Generated Successfully!");
      setShowForm(false);
      fetchHistory(); // Refresh table
    } catch (err: any) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    }
  };

  if (!project) return null;
  const values = Object.values(project);
  const mainTitle = String(values[0] || "Project Details");

  return (
    <div className="animate-fade-in-up max-w-6xl mx-auto space-y-6">
       
       {/* HEADER */}
       <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center text-sm text-gray-500 hover:text-blue-600 transition">
            <BackIcon /><span className="ml-1">Back to List</span>
        </button>
        <button 
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700"
        >
            + New Bill
        </button>
       </div>

      {/* 1. INFO CARD */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
         <div className="bg-slate-800 p-6 text-white">
           <h1 className="text-3xl font-bold">{mainTitle}</h1>
         </div>
         <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
           {Object.entries(project).slice(0, 8).map(([key, val]: any) => (
             <div key={key}>
               <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">{key}</dt>
               <dd className="text-sm font-medium text-slate-800">{String(val ?? "-")}</dd>
             </div>
           ))}
         </div>
      </div>

      {/* 2. HISTORY TABLE (LEDGER) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-slate-700">Monthly Billing History</h3>
            <span className="text-xs text-gray-400">{history.length} records found</span>
        </div>
        
        <div className="overflow-x-auto max-h-[500px]">
           {loading ? (
             <div className="p-8 text-center text-gray-400">Loading ledger data...</div>
           ) : (
            <table className="min-w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                        {headers.map((h, i) => (
                            <th key={i} className="px-4 py-3 font-bold text-slate-600 border-b border-slate-200 uppercase tracking-wide">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {history.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50 transition">
                            {headers.map((h, i) => (
                                <td key={i} className={`px-4 py-2 border-r border-gray-50 last:border-0 ${h.includes('AMOUNT') ? 'font-bold text-green-700' : 'text-slate-600'}`}>
                                    {row[h]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
           )}
        </div>
      </div>

      {/* 3. MODAL FORM */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
                <div className="bg-slate-800 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold">Generate New Bill</h3>
                    <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Billing Date</label>
                        <input 
                            type="date" 
                            required
                            className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={formData.date}
                            onChange={e => setFormData({...formData, date: e.target.value})}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Export</label>
                            <input 
                                type="number" 
                                required
                                placeholder="e.g. 3500123"
                                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.current_export}
                                onChange={e => setFormData({...formData, current_export: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Import</label>
                            <input 
                                type="number" 
                                required
                                placeholder="e.g. 25000"
                                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.current_import}
                                onChange={e => setFormData({...formData, current_import: e.target.value})}
                            />
                        </div>
                    </div>
                    
                    <div className="bg-blue-50 p-3 rounded text-xs text-blue-700">
                        <strong>Note:</strong> Previous reading, MF, and Tariff Rate will be auto-fetched from the last entry in the sheet to calculate the bill.
                    </div>

                    <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 transition">
                        Calculate & Save Bill
                    </button>
                </form>
            </div>
        </div>
      )}

    </div>
  );
}