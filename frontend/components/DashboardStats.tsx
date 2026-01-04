import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { SolarIcon, PlantIcon } from './Icons';

export interface DashboardProps {
  projects: any[];
  onCategorySelect: (category: string) => void;
  onRefresh: () => void;
}

export default function DashboardStats({ projects, onCategorySelect, onRefresh }: DashboardProps) {

  // --- 1. AGGREGATION LOGIC ---
  const stats = useMemo(() => {
    // Default zero state
    const defaults = { 
      totalCapacity: 0, 
      totalCount: 0, 
      totalGen: 0,
      groups: [] as any[],
      lineData: [] as any[]
    };
    
    if (!projects || !projects.length) return defaults;

    let totalCapacity = 0;
    let totalGen = 0;
    const typeGroups: { [key: string]: any } = {};
    const monthlyGroups: { [key: string]: number } = {};

    // Identify Columns
    const cols = Object.keys(projects[0]);
    const typeCol = cols.find(c => c.toLowerCase().includes("plant type")) || cols[0] || "";
    const stateCol = cols.find(c => c.toLowerCase().includes("within") || c.toLowerCase().includes("state")) || "";
    const capCol = cols.find(c => c.toLowerCase().includes("installed") && c.toLowerCase().includes("capacity")) 
                 || cols.find(c => c.toLowerCase().includes("capacity") || c.toLowerCase().includes("mw")) 
                 || "";
    const contractedCol = cols.find(c => c.toLowerCase().includes("contracted") && c.toLowerCase().includes("capacity")) || "";
    const genCols = cols.filter(c => c.toLowerCase().includes("net unit"));

    // Process Rows
    projects.forEach(p => {
      const capVal = Number(p[capCol] || 0);
      const conVal = Number(p[contractedCol] || 0);
      totalCapacity += conVal;

      let rawType = String(p[typeCol] || "Other").trim();
      const isPunjab = stateCol && String(p[stateCol]).toLowerCase().includes("within");
      
      let groupKey = rawType.replace(" Power Plant", "").replace(" Project", "");
      if (isPunjab && groupKey.toLowerCase().includes("solar")) groupKey = "Solar (Punjab)";
      if (!isPunjab && groupKey.toLowerCase().includes("solar")) groupKey = "Solar (Outside)";

      if (!typeGroups[groupKey]) {
        typeGroups[groupKey] = {
          name: groupKey,
          count: 0,
          installed: 0,
          contracted: 0,
          id: groupKey
        };
      }

      typeGroups[groupKey].count += 1;
      typeGroups[groupKey].installed += capVal;
      typeGroups[groupKey].contracted += conVal;

      // --- FIX: Strictly match Month-Year pattern to avoid "Unknown" and double counting ---
      genCols.forEach(gCol => {
        const match = gCol.match(/^([A-Za-z]+-\d{2})/); // Looks for "Apr-25" format
        if (match) {
          const monthLabel = match[1];
          const val = Number(p[gCol] || 0);
          if (val > 0) {
            monthlyGroups[monthLabel] = (monthlyGroups[monthLabel] || 0) + val;
            totalGen += val;
          }
        }
      });
    });

    // Format Groups
    const groups = Object.values(typeGroups).sort((a: any, b: any) => {
       if (a.name === "Solar (Punjab)") return -1;
       if (b.name === "Solar (Punjab)") return 1;
       return b.installed - a.installed;
    });

    // Format Trend
    const monthsOrder = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const lineData = Object.entries(monthlyGroups)
      .map(([name, value]) => ({ 
        name, 
        val: Number((value / 1000000).toFixed(2)) // Convert to MU
      }))
      .sort((a, b) => {
         const m1 = a.name.substring(0, 3);
         const m2 = b.name.substring(0, 3);
         return monthsOrder.indexOf(m1) - monthsOrder.indexOf(m2);
      });

    return {
      totalCapacity: Math.round(totalCapacity),
      totalCount: projects.length,
      totalGen: totalGen,
      groups,
      lineData
    };
  }, [projects]);

  // Colors for Pie Chart
  const COLORS = {
    solar: '#f97316', // Orange
    other: '#3b82f6'  // Blue
  };

  return (
    <div className="animate-fade-in-up space-y-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Generation Abstract</h2>
           <p className="text-slate-500 text-sm">Summary of installed capacity and active projects by source.</p>
        </div>
        <div className="flex items-center gap-4">
           <div className="text-right hidden md:block">
              <p className="text-xs text-gray-400 uppercase font-bold">Total System Capacity</p>
              <p className="text-xl font-extrabold text-blue-600">{stats.totalCapacity.toLocaleString()} MW</p>
           </div>
           <button onClick={onRefresh} className="px-4 py-2 bg-white border border-gray-200 text-blue-600 text-sm font-bold rounded-lg shadow-sm hover:bg-blue-50 transition">
             Refresh
           </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Source / Plant Type</th>
                <th className="px-6 py-4 text-center">No. of Projects</th>
                <th className="px-6 py-4 text-right">Installed Capacity (MW)</th>
                <th className="px-6 py-4 text-right">Contracted Capacity (MW)</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.groups.map((group: any, idx: number) => (
                <tr 
                  key={group.id} 
                  onClick={() => onCategorySelect(group.name)}
                  className={`hover:bg-blue-50/60 transition cursor-pointer group ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                >
                  <td className="px-6 py-4 font-bold text-slate-700 flex items-center gap-3">
                     <span className={`w-2.5 h-2.5 rounded-full ${group.name.toLowerCase().includes('solar') ? 'bg-orange-500' : 'bg-blue-500'}`}></span>
                     {group.name}
                  </td>
                  <td className="px-6 py-4 text-center font-medium text-slate-600">
                    <span className="bg-slate-100 px-2 py-1 rounded text-xs">{group.count}</span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-800">
                    {group.installed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-slate-600">
                    {group.contracted.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-blue-600 font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity">View &rarr;</span>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-900">
                <td className="px-6 py-4">Total System</td>
                <td className="px-6 py-4 text-center">{stats.totalCount}</td>
                <td className="px-6 py-4 text-right">{stats.totalCapacity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-6 py-4 text-right">
                  {stats.groups.reduce((acc: number, curr: any) => acc + curr.contracted, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

       {/* CHARTS SECTION (Grid Layout) */}
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         
         {/* 1. Generation Trend Chart (Area) */}
         {stats.lineData.length > 0 && (
           <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-lg font-bold text-slate-800">Net Generation Trend</h3>
                 <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase">Total YTD Gen</p>
                    <p className="text-lg font-bold text-green-600">{(stats.totalGen / 1000000).toFixed(2)} MU</p>
                 </div>
              </div>
              <div className="flex-1 min-h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.lineData}>
                    <defs>
                      <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="val" stroke="#10b981" fillOpacity={1} fill="url(#colorVal)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
           </div>
         )}

         {/* 2. Capacity Mix Chart (Pie) */}
         {stats.groups.length > 0 && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Installed Capacity Mix</h3>
              <p className="text-sm text-slate-400 mb-4">Share of total capacity by source type.</p>
              
              <div className="flex-1 min-h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.groups}
                      cx="50%"
                      cy="50%"
                      innerRadius={60} // Donut style
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="installed"
                    >
                      {stats.groups.map((entry: any, index: number) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.name.toLowerCase().includes('solar') ? COLORS.solar : COLORS.other} 
                        />
                      ))}
                    </Pie>
                    <Tooltip 
  // CHANGE: Allow 'value' to be 'any' or 'number | undefined' to satisfy TypeScript
  formatter={(value: any) => [`${Number(value).toLocaleString()} MW`, 'Capacity']}
  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
/>
                    <Legend verticalAlign="bottom" height={36} iconType="circle"/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
         )}

       </div>
    </div>
  );
}