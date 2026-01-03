import { BackIcon } from './Icons';

interface Props {
  project: any;
  onBack: () => void;
}

export default function ProjectDetail({ project, onBack }: Props) {
  if (!project) return null;

  // Helper: Explicitly convert potential 'unknown' values to string
  const values = Object.values(project);
  const mainTitle = String(values[0] || "Project Details");
  const categoryTag = String(values[1] || "Info");

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto">
       <button onClick={onBack} className="flex items-center text-sm text-gray-500 hover:text-blue-600 mb-4 transition">
        <BackIcon /><span className="ml-1">Back to List</span>
      </button>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
         <div className="bg-slate-800 p-6 text-white">
           <div className="text-xs font-bold bg-blue-600 inline-block px-2 py-1 rounded mb-2 uppercase tracking-wide">
              {categoryTag}
           </div>
           <h1 className="text-3xl font-bold">{mainTitle}</h1>
         </div>
         
         <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
           {Object.entries(project).map(([key, val]: any) => (
             <div key={key} className="border-b border-gray-100 pb-2">
               <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{key}</dt>
               <dd className="text-base font-medium text-slate-800 break-words">
                 {/* Explicitly convert val to string here as well */}
                 {String(val ?? "-")}
               </dd>
             </div>
           ))}
         </div>
         
         <div className="bg-gray-50 p-6 text-center border-t border-gray-100">
            <button onClick={() => alert("Feature coming soon")} className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 mr-2">Edit Data</button>
            <button onClick={() => window.print()} className="px-6 py-2 bg-blue-600 rounded-lg text-sm font-bold text-white hover:bg-blue-700">Print Sheet</button>
         </div>
      </div>
    </div>
  );
}