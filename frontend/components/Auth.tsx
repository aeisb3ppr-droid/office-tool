"use client";
import { useState } from 'react';
import axios from 'axios';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from '../app/firebaseConfig'; // Adjust path if needed

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function Auth() {
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    const email = `${empId.trim()}@pspcl.in`; 
    
    try {
      if (authView === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const verifyRes = await axios.get(`${API_BASE_URL}/verify-employee/${empId}`);
        if (!verifyRes.data.allowed) throw new Error(verifyRes.data.error || "Employee ID not authorized.");
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message.replace("Firebase: ", ""));
    }
    setAuthLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 font-sans">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-blue-800 p-8 text-center">
          <h1 className="text-3xl font-extrabold text-white">PSPCL</h1>
          <p className="text-blue-200 text-xs mt-1">Office Data System</p>
        </div>
        <div className="p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">{authView === "login" ? "Login" : "Register"}</h2>
          {authError && <div className="mb-4 p-2 bg-red-100 text-red-600 text-xs rounded text-center">{authError}</div>}
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="text" required className="w-full p-3 bg-gray-50 border rounded-lg" placeholder="Employee ID" value={empId} onChange={e => setEmpId(e.target.value)}/>
            <input type="password" required className="w-full p-3 bg-gray-50 border rounded-lg" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}/>
            <button type="submit" disabled={authLoading} className="w-full py-3 bg-blue-700 text-white font-bold rounded-lg hover:bg-blue-800 transition">
              {authLoading ? "Processing..." : (authView === "login" ? "Sign In" : "Verify & Register")}
            </button>
          </form>
          <button onClick={() => setAuthView(authView === "login" ? "register" : "login")} className="w-full mt-4 text-sm text-blue-600 hover:underline">
            {authView === "login" ? "New Employee? Register" : "Back to Login"}
          </button>
        </div>
      </div>
    </div>
  );
}