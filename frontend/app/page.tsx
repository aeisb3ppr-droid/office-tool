"use client";
import { useState, useEffect } from 'react';
import axios from 'axios';
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from './firebaseConfig';

// Make sure this import matches the file name perfectly
import Auth from '../components/Auth';
import DashboardStats from '../components/DashboardStats';
import ProjectList from '../components/ProjectList';
import ProjectDetail from '../components/ProjectDetail';
import ReportBuilder from '../components/ReportBuilder';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  
  const [currentView, setCurrentView] = useState<"dashboard" | "list" | "detail" | "report">("dashboard");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchData();
    });
    return () => unsubscribe();
  }, []);

  const fetchData = async () => {
    try {
      const pRes = await axios.get(`${API_BASE_URL}/projects`);
      setProjects(pRes.data.data || []);
      const cRes = await axios.get(`${API_BASE_URL}/columns`);
      setColumns(cRes.data.columns || []);
    } catch (e) {
      console.error("Fetch Error:", e);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setProjects([]);
  };

  if (!user) return <Auth />;

  const filteredProjects = projects.filter(p => {
    if (!selectedCategory) return true;
    const cols = Object.keys(p);
    const typeCol = cols.find(c => c.toLowerCase().includes("plant type") || c.toLowerCase().includes("source")) || cols[0];
    const stateCol = cols.find(c => c.toLowerCase().includes("within") || c.toLowerCase().includes("state")) || "";
    
    const pType = String(p[typeCol] || "").toLowerCase();
    const pState = String(p[stateCol] || "").toLowerCase();
    const category = selectedCategory.toLowerCase();

    if (category === "solar (punjab)") return pType.includes("solar") && pState.includes("within");
    if (category === "solar (outside)") return pType.includes("solar") && !pState.includes("within");
    return pType.includes(category);
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setCurrentView("dashboard"); setSelectedCategory(null); }}>
             <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold">P</div>
             <div><h1 className="font-bold text-slate-800 leading-tight">PSPCL Dashboard</h1></div>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => setCurrentView("dashboard")} className={`text-sm font-medium ${currentView !== 'report' ? 'text-blue-600' : 'text-gray-500'}`}>Overview</button>
             <button onClick={() => setCurrentView("report")} className={`text-sm font-medium ${currentView === 'report' ? 'text-blue-600' : 'text-gray-500'}`}>Reports</button>
             <div className="h-4 w-px bg-gray-300"></div>
             <button onClick={logout} className="text-xs text-red-500 font-bold hover:text-red-700">SIGNOUT</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {currentView === 'dashboard' && (
          <DashboardStats 
            projects={projects} 
            onRefresh={fetchData} 
            // FIX: Explicitly type the argument 'cat' as string
            onCategorySelect={(cat: string) => {
              setSelectedCategory(cat);
              setCurrentView("list");
            }}
          />
        )}

        {currentView === 'list' && (
          <ProjectList 
            projects={filteredProjects} 
            categoryName={selectedCategory || "All"}
            onBack={() => setCurrentView("dashboard")}
            onSelectProject={(proj) => {
              setSelectedProject(proj);
              setCurrentView("detail");
            }}
          />
        )}

        {currentView === 'detail' && (
          <ProjectDetail 
            project={selectedProject} 
            onBack={() => setCurrentView("list")}
          />
        )}

        {currentView === 'report' && (
          <ReportBuilder columns={columns} />
        )}

      </div>
    </div>
  );
}