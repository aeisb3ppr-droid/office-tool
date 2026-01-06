import { useState, useEffect, useMemo } from 'react';
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
  
  // Track modified rows to show "Save" button
  const [modifiedRows, setModifiedRows] = useState<Set<number>>(new Set());
  const [savingRows, setSavingRows] = useState<Set<number>>(new Set());

  // Form State for "Add Latest Month"
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    current_export: '', 
    current_import: '', 
    power_factor: '',
    invoice_no: '', 
    invoice_date: '', 
    submission_date: '', 
    verify_date: ''
  });

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const getProjectName = () => {
    if (!project) return "";
    const keys = Object.keys(project);
    const nameKey = keys.find(k => k.toLowerCase().includes("name") && k.toLowerCase().includes("project")) || keys[0];
    return String(project[nameKey] || "");
  };
  const projectName = getProjectName();

  useEffect(() => {
    if (projectName) fetchHistory();
  }, [projectName]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/history/${encodeURIComponent(String(projectName))}`);
      if (res.data.data) {
        setHistory(res.data.data);
        setHeaders(res.data.headers || []);
        setModifiedRows(new Set()); // Reset changes on reload
      }
    } catch (e) {
      console.error("Failed to load history", e);
    } finally {
      setLoading(false);
    }
  };

  // --- 1. MODAL LIVE PREVIEW LOGIC ---
  const lastValidRow = useMemo(() => {
    if (!history.length || headers.length < 2) return null;

    // Iterate backwards to find a row with a valid numeric MF (Index 1)
    for (let i = history.length - 1; i >= 0; i--) {
        const row = history[i];
        const mfKey = headers[1]; 
        
        if (!mfKey) continue; 

        const val = String(row[mfKey] || "").replace(/,/g, '');
        if (!isNaN(parseFloat(val)) && parseFloat(val) > 0) {
            return row;
        }
    }
    return null;
  }, [history, headers]);

  const liveStats = useMemo(() => {
    if (!lastValidRow || headers.length < 12) return null;

    // Extract Previous Values based on assumed Header Indices
    // 1: MF, 3: Prev Export (Curr becomes Prev), 7: Prev Import, 11: Rate
    const getVal = (idx: number) => {
        const key = headers[idx];
        if (!key) return 0; 
        return parseFloat(String(lastValidRow[key] || "0").replace(/,/g, ''));
    };
    
    const mf = getVal(1);
    const prevExport = getVal(3); 
    const prevImport = getVal(7);
    const rate = getVal(11);

    const currExport = parseFloat(formData.current_export) || 0;
    const currImport = parseFloat(formData.current_import) || 0;

    // Calcs
    const diffExport = currExport - prevExport;
    const kwhExport = diffExport * mf;
    
    const diffImport = currImport - prevImport;
    const kwhImport = diffImport * mf;

    const netExport = kwhExport - kwhImport;
    const bill = netExport * rate;

    return { mf, prevExport, prevImport, rate, diffExport, kwhExport, diffImport, kwhImport, netExport, bill };
  }, [lastValidRow, headers, formData.current_export, formData.current_import]);


  // --- 2. TABLE LIVE EDIT LOGIC ---
  const handleCellChange = (rowIndex: number, header: string, value: string) => {
    const newHistory = [...history];
    const row = { ...newHistory[rowIndex], [header]: value };
    
    // Auto-Calculate Table Row
    const findKey = (sub: string) => headers.find(h => h.toUpperCase().includes(sub));
    
    const kMF = findKey("MF");
    const kRate = findKey("RATE") || findKey("TARIFF");
    
    const kExpCurr = findKey("EXPORT - CURRENT");
    const kExpPrev = findKey("EXPORT - PREVIOUS");
    const kExpDiff = findKey("EXPORT - DIFFERENCE"); 
    const kExpKWH = findKey("EXPORT - KWH"); 

    const kImpCurr = findKey("IMPORT - CURRENT");
    const kImpPrev = findKey("IMPORT - PREVIOUS");
    const kImpKWH = findKey("IMPORT - KWH");
    
    const kNet = findKey("NET");
    const kBill = findKey("BILL AMOUNT");

    // FIX: Safely handle undefined keys
    const val = (k: string | undefined) => {
        if (!k) return 0;
        return parseFloat(String(row[k] || "0").replace(/,/g, '')) || 0;
    };

    // Trigger Recalc if Inputs Change
    if (kMF && kRate && (header === kExpCurr || header === kImpCurr || header === kMF || header === kRate)) {
        try {
            const mf = val(kMF);
            const rate = val(kRate);
            
            // Export Side
            if (kExpCurr && kExpPrev && kExpDiff && kExpKWH) {
                const diff = val(kExpCurr) - val(kExpPrev);
                if (kExpDiff) row[kExpDiff] = diff.toFixed(2);
                row[kExpKWH] = (diff * mf).toFixed(2);
            }
            
            // Import Side
            if (kImpCurr && kImpPrev && kImpKWH) {
                const diff = val(kImpCurr) - val(kImpPrev);
                const kImpDiff = findKey("IMPORT - DIFFERENCE");
                if (kImpDiff) row[kImpDiff] = diff.toFixed(2);
                row[kImpKWH] = (diff * mf).toFixed(2);
            }

            // Net & Bill
            if (kExpKWH && kImpKWH && kNet && kBill) {
                const expUnits = parseFloat(String(row[kExpKWH]).replace(/,/g, ''));
                const impUnits = parseFloat(String(row[kImpKWH]).replace(/,/g, ''));
                const net = expUnits - impUnits;
                
                row[kNet] = net.toFixed(2);
                row[kBill] = Math.round(net * rate).toString();
            }
        } catch (e) {
            console.log("Calc error", e);
        }
    }

    newHistory[rowIndex] = row;
    setHistory(newHistory);
    setModifiedRows(prev => new Set(prev).add(rowIndex));
  };

  const saveRow = async (rowIndex: number) => {
    const row = history[rowIndex];
    const month = row["MONTH"] || row[headers[0]];
    
    setSavingRows(prev => new Set(prev).add(rowIndex));
    try {
        await axios.put(`${API_BASE_URL}/update-row`, {
            project_name: projectName,
            month_date: month,
            updated_data: row
        });
        
        const newMod = new Set(modifiedRows);
        newMod.delete(rowIndex);
        setModifiedRows(newMod);
        alert("Saved successfully!");
    } catch (err: any) {
        alert("Failed to save: " + (err.response?.data?.detail || err.message));
    } finally {
        const newSaving = new Set(savingRows);
        newSaving.delete(rowIndex);
        setSavingRows(newSaving);
    }
  };

  const handleAddNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`Generate Bill for amount ₹${Math.round(liveStats?.bill || 0)}?`)) return;

    try {
      await axios.post(`${API_BASE_URL}/add-reading`, {
        project_name: projectName,
        ...formData,
        current_export: Number(formData.current_export),
        current_import: Number(formData.current_import)
      });
      alert("Added successfully!");
      setShowForm(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        current_export: '', current_import: '', power_factor: '',
        invoice_no: '', invoice_date: '', submission_date: '', verify_date: ''
      });
      fetchHistory();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  if (!project) return null;
  const values = Object.values(project);
  const mainTitle = String(values[0] || "Project Details");

  return (
    <div className="animate-fade-in-up max-w-full mx-auto space-y-6">
       
       {/* HEADER */}
       <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center text-sm text-gray-500 hover:text-blue-600 transition">
            <BackIcon /><span className="ml-1">Back</span>
        </button>
        <button 
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700 flex items-center gap-2"
        >
            <span>+</span> Add Latest Month
        </button>
       </div>

      {/* INFO CARD */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
         <div className="bg-slate-800 p-4 text-white">
           <h1 className="text-2xl font-bold">{mainTitle}</h1>
         </div>
         <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
           {Object.entries(project).slice(0, 8).map(([key, val]: any) => (
             <div key={key}>
               <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{key}</dt>
               <dd className="text-sm font-medium text-slate-800 truncate">{String(val ?? "-")}</dd>
             </div>
           ))}
         </div>
      </div>

      {/* LIVE EXCEL TABLE */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col h-[70vh]">
        <div className="overflow-auto flex-1">
           {loading ? (
             <div className="p-8 text-center text-gray-400">Loading data...</div>
           ) : (
            <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th className="p-2 border bg-slate-100 w-10">#</th>
                        {headers.map((h, i) => (
                            <th key={i} className="px-3 py-2 font-bold text-slate-600 border border-slate-300 whitespace-nowrap min-w-[100px]">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {history.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50">
                            {/* Action Column */}
                            <td className="p-1 border border-slate-200 text-center sticky left-0 bg-white z-0">
                                {modifiedRows.has(idx) && (
                                    <button 
                                        onClick={() => saveRow(idx)}
                                        disabled={savingRows.has(idx)}
                                        className="text-[10px] bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {savingRows.has(idx) ? "..." : "SAVE"}
                                    </button>
                                )}
                            </td>

                            {headers.map((h, i) => (
                                <td key={i} className="border border-slate-200 p-0 min-w-[100px]">
                                    <input 
                                        type="text" 
                                        value={row[h] || ""}
                                        onChange={(e) => handleCellChange(idx, h, e.target.value)}
                                        className={`w-full h-full px-2 py-2 outline-none bg-transparent focus:bg-blue-100 focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors
                                            ${h.includes("AMOUNT") ? "font-bold text-slate-800" : "text-slate-600"}
                                            ${modifiedRows.has(idx) ? "bg-yellow-50" : ""}
                                        `}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
           )}
        </div>
      </div>

      {/* MODAL: ADD LATEST MONTH DATA */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Modal Header */}
                <div className="bg-slate-800 p-4 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-bold text-lg">Add Latest Month Data</h3>
                        <p className="text-xs text-slate-400">Enter current readings. Calculations update live.</p>
                    </div>
                    <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <form onSubmit={handleAddNewSubmit} className="space-y-6">
                        
                        {/* Section A: Live Calculations Preview */}
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                             <h4 className="text-xs font-bold text-blue-800 uppercase mb-3 border-b border-blue-200 pb-1">Live Calculation Preview</h4>
                             {liveStats ? (
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                     <div>
                                         <span className="block text-xs text-gray-500">Prev Export</span>
                                         <span className="font-mono">{liveStats.prevExport}</span>
                                     </div>
                                     <div>
                                         <span className="block text-xs text-gray-500">Diff Export</span>
                                         <span className={`font-bold ${liveStats.diffExport < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {liveStats.diffExport.toFixed(2)}
                                         </span>
                                     </div>
                                     <div>
                                         <span className="block text-xs text-gray-500">Net Units</span>
                                         <span className="font-mono">{liveStats.netExport.toFixed(2)}</span>
                                     </div>
                                     <div>
                                         <span className="block text-xs text-gray-500">Bill Amount</span>
                                         <span className="font-bold text-xl text-blue-700">₹ {Math.round(liveStats.bill).toLocaleString()}</span>
                                     </div>
                                     <div className="col-span-2 md:col-span-4 text-xs text-gray-400 mt-2">
                                         Formula: (Diff × MF {liveStats.mf}) × Rate {liveStats.rate}
                                     </div>
                                 </div>
                             ) : (
                                 <div className="text-red-500 text-sm">Could not find previous data row to base calculations on.</div>
                             )}
                        </div>

                        {/* Section B: Inputs */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            
                            {/* Group 1: Readings */}
                            <div className="space-y-4">
                                <h5 className="font-bold text-slate-700 border-b pb-1">Readings</h5>
                                <div>
                                    <label className="label">Billing Month</label>
                                    <input type="date" required className="input-field" 
                                        value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                                </div>
                                <div>
                                    <label className="label">Current Export</label>
                                    <input type="number" required step="0.01" className="input-field" placeholder="e.g. 15000"
                                        value={formData.current_export} onChange={e => setFormData({...formData, current_export: e.target.value})} />
                                </div>
                                <div>
                                    <label className="label">Current Import</label>
                                    <input type="number" required step="0.01" className="input-field" placeholder="e.g. 200"
                                        value={formData.current_import} onChange={e => setFormData({...formData, current_import: e.target.value})} />
                                </div>
                            </div>

                            {/* Group 2: Invoice Details */}
                            <div className="space-y-4">
                                <h5 className="font-bold text-slate-700 border-b pb-1">Invoice Details</h5>
                                <div>
                                    <label className="label">Invoice No.</label>
                                    <input type="text" className="input-field" placeholder="INV-2024-001"
                                        value={formData.invoice_no} onChange={e => setFormData({...formData, invoice_no: e.target.value})} />
                                </div>
                                <div>
                                    <label className="label">Invoice Date</label>
                                    <input type="date" className="input-field" 
                                        value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} />
                                </div>
                                <div>
                                    <label className="label">Power Factor</label>
                                    <input type="text" className="input-field" placeholder="0.98"
                                        value={formData.power_factor} onChange={e => setFormData({...formData, power_factor: e.target.value})} />
                                </div>
                            </div>

                            {/* Group 3: Process Dates */}
                            <div className="space-y-4">
                                <h5 className="font-bold text-slate-700 border-b pb-1">Process Dates</h5>
                                <div>
                                    <label className="label">Submission Date</label>
                                    <input type="date" className="input-field" 
                                        value={formData.submission_date} onChange={e => setFormData({...formData, submission_date: e.target.value})} />
                                </div>
                                <div>
                                    <label className="label">Verify Date</label>
                                    <input type="date" className="input-field" 
                                        value={formData.verify_date} onChange={e => setFormData({...formData, verify_date: e.target.value})} />
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="w-full py-4 bg-slate-800 text-white font-bold rounded hover:bg-slate-900 transition shadow-lg mt-4">
                            Save Month Data & Generate Bill
                        </button>
                    </form>
                </div>
            </div>
        </div>
      )}

      <style jsx>{`
        .label { display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem; }
        .input-field { width: 100%; border: 1px solid #cbd5e1; border-radius: 0.375rem; padding: 0.5rem; font-size: 0.875rem; outline: none; transition: all 0.2s; }
        .input-field:focus { border-color: #3b82f6; ring: 2px solid #3b82f6; }
      `}</style>
    </div>
  );
}