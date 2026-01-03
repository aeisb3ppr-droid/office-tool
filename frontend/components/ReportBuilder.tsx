import { useState } from 'react';
import axios from 'axios';

interface Props {
  columns: string[];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function ReportBuilder({ columns }: Props) {
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const downloadReport = async () => {
    if(selectedCols.length === 0) return alert("Select at least one column.");
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/generate-report`, selectedCols, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'PSPCL_Report.xlsx');
      document.body.appendChild(link);
      link.click();
    } catch (e) {
      alert("Report generation failed.");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-gray-200 animate-fade-in-up">
       <h2 className="text-2xl font-bold text-slate-800 mb-4">Report Builder</h2>
       <div className="grid grid-cols-2 gap-2 mb-6 h-64 overflow-y-auto border p-2 rounded bg-slate-50">
         {columns.map(col => (
           <label key={col} className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer">
             <input 
               type="checkbox" 
               checked={selectedCols.includes(col)} 
               onChange={() => selectedCols.includes(col) ? setSelectedCols(selectedCols.filter(c=>c!==col)) : setSelectedCols([...selectedCols, col])} 
             />
             <span className="text-xs truncate">{col}</span>
           </label>
         ))}
       </div>
       <button onClick={downloadReport} disabled={loading} className="w-full bg-slate-800 text-white py-3 rounded font-bold hover:bg-slate-900">
         {loading ? "Generating..." : "Download Excel"}
       </button>
    </div>
  );
}