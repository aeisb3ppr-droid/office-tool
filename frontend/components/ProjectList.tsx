import { useState } from 'react';
import { BackIcon } from './Icons';

interface Props {
  projects: any[];
  categoryName: string;
  onSelectProject: (project: any) => void;
  onBack: () => void;
}

export default function ProjectList({ projects, categoryName, onSelectProject, onBack }: Props) {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = projects.filter(p => 
    Object.values(p).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="animate-fade-in-up">
      <button onClick={onBack} className="flex items-center text-sm text-gray-500 hover:text-blue-600 mb-4 transition">
        <BackIcon /><span className="ml-1">Back to Dashboard</span>
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
             <h2 className="text-xl font-bold text-slate-800">{categoryName} Projects</h2>
             <p className="text-sm text-gray-500">Showing {filtered.length} records</p>
          </div>
          <input 
            type="text" 
            placeholder="Search in this list..." 
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
              <tr>
                {projects.length > 0 && Object.keys(projects[0]).slice(0, 6).map(h => (
                  <th key={h} className="p-4 whitespace-nowrap">{h}</th>
                ))}
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row, idx) => (
                <tr key={idx} className="hover:bg-blue-50/50 transition group cursor-pointer" onClick={() => onSelectProject(row)}>
                   {Object.values(row).slice(0, 6).map((val: any, i) => (
                     <td key={i} className="p-4 truncate max-w-[200px] text-gray-700">{val}</td>
                   ))}
                   <td className="p-4 text-right text-blue-600 font-bold opacity-0 group-hover:opacity-100">View &rarr;</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-gray-400">No projects found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}