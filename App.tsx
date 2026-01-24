import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Calendar as CalendarIcon, 
  Dumbbell, 
  Utensils, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  BrainCircuit,
  TrendingUp,
  Settings,
  Scale,
  Footprints,
  Users,
  ShieldCheck,
  ChevronDown,
  PencilLine,
  Lock,
  LogOut,
  UserCheck,
  Search,
  UserPlus,
  MessageSquare,
  Send,
  Info,
  History,
  Check,
  Camera,
  Image as ImageIcon,
  X,
  User,
  LayoutDashboard,
  BarChart3,
  Sliders,
  CalendarClock,
  ToggleRight,
  ToggleLeft,
  AlertTriangle,
  Clock,
  Download,
  ArrowLeftRight,
  Sparkles,
  Wand2,
  CircleHelp,
  Loader2,
  ChevronUp
} from 'lucide-react';
import { DayRecord, Workout, Nutrition, ClientProfile, ClientTargets, ChatMessage } from './types';
import { getAICoachInsights, parseWorkoutPlan, getExerciseInstructions, getExerciseCorrection } from './services/geminiService';
import { supabase } from "./services/supabaseClient.ts";

const PHOTO_LABELS = ["Linke Ansicht", "Rechte Ansicht", "Frontal", "Von hinten"];
const formatDate = (date: Date): string => date.toISOString().split('T')[0];
const generateEmptyWorkouts = (date: string): Workout[] => {
  return Array.from({ length: 8 }).map((_, idx) => ({
    id: `w-${date}-${idx}`,
    dayId: date,
    exerciseName: '',
    order: idx + 1,
    sets: Array.from({ length: 3 }).map((__, sIdx) => ({
      id: `s-${date}-${idx}-${sIdx}`,
      workoutId: `w-${date}-${idx}`,
      setNumber: sIdx + 1,
      weight: 0,
      reps: 0
    }))
  }));
};

const INITIAL_TARGETS: ClientTargets = { protein: 160, carbs: 250, fat: 70, steps: 10000, calories: 2270 };
const COACH_PASSWORD = "161094";
const COACH_EMAIL = "andi_vuong@gmx.de";

async function createClientTest() {
  const storageKey = Object.keys(localStorage).find(k =>
    k.endsWith("-auth-token")
  );

  if (!storageKey) {
    alert("Nicht eingeloggt");
    return;
  }

  const token = JSON.parse(localStorage.getItem(storageKey)!).access_token;

  const res = await fetch("/api/create-client", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: "client1@test.de",
      password: "Test1234!",
      name: "Client 1",
      license_days: 30,
    }),
  });

  const data = await res.json().catch(() => ({}));
  console.log("API RESULT:", res.status, data);

  if (!res.ok) {
    alert("Fehler: " + JSON.stringify(data));
  } else {
    alert("Client erstellt!");
  }
}

const App: React.FC = () => {
  useEffect(() => {
  const start = async () => {
    const { data, error } = await supabase.auth.getSession();
    console.log("[boot] getSession error:", error);
    console.log("[boot] session user:", data?.session?.user?.email, data?.session?.user?.id);

    const user = data.session?.user;
    if (!user) {
      console.log("[boot] no user -> return");
      return;
    }

    const coach = (user.email || "").toLowerCase() === COACH_EMAIL.toLowerCase();
    console.log("[boot] coach? ->", coach, "COACH_EMAIL:", COACH_EMAIL, "user.email:", user.email);

    setIsCoach(coach);

    if (coach) {
      setActiveClientId(null);
      setActiveTab("admin");
      console.log("[boot] loading clients for coach...");
      await loadClientsFromDb();
      console.log("[boot] loadClientsFromDb done");
      return;
    }

    console.log("[boot] client path -> upsert app_clients + load logs");
    await supabase.from("app_clients").upsert(
      { user_id: user.id, email: user.email, role: "client" },
      { onConflict: "user_id" }
    );

    setClients(prev => ({
      ...prev,
      [user.id]: {
        ...(prev[user.id] || {}),
        id: user.id,
        name: user.email || "Klient",
        isActive: true,
        targets: prev[user.id]?.targets || INITIAL_TARGETS,
        records: prev[user.id]?.records || {},
        messages: prev[user.id]?.messages || [],
      },
    }));

    setActiveClientId(user.id);
    setActiveTab("calendar");
    await loadClientFromDb(user.id);
  };

  start();
}, []);


const [activeClientId, setActiveClientId] = useState<string | null>(null);
const [isCoach, setIsCoach] = useState(false);
const [clients, setClients] = useState<Record<string, ClientProfile>>({});
const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()));
const [previewDate, setPreviewDate] = useState<string>(formatDate(new Date()));
const [activeTab, setActiveTab] = useState<'calendar' | 'details' | 'progression' | 'admin' | 'chat'>('calendar');
const [isAiLoading, setIsAiLoading] = useState(false);
const [aiInsight, setAiInsight] = useState<string | null>(null);
const [loginMode, setLoginMode] = useState<'client' | 'coach'>('client');
const [clientNameInput, setClientNameInput] = useState('');
const [passwordInput, setPasswordInput] = useState('');
const handleCoachLogin = async () => {

  // ✅ Blockiere Client-Accounts im Coach-Login
  if (clientNameInput.trim().toLowerCase() !== COACH_EMAIL.toLowerCase()) {
    setAuthError("Bitte nutze den Client-Login (nicht Coach).");
    return;
  }

setAuthError(false);
const { error } = await supabase.auth.signInWithPassword({
    email: clientNameInput,   // hier kommt deine Admin-E-Mail rein
    password: passwordInput,  // hier dein neues Admin-Passwort
  });

if (error) {setAuthError("Login fehlgeschlagen");return;}

setIsCoach(true);
setActiveTab("admin");
setActiveClientId(null);
await loadClientsFromDb();

};

const handleClientLogin = async () => {
  // ✅ Blockiere Coach-Account im Client-Login
if (clientNameInput.trim().toLowerCase() === COACH_EMAIL.toLowerCase()) {
  setAuthError("Bitte nutze den Coach-Login (nicht Client).");
  return;
}
  setAuthError(false);
const { error } = await supabase.auth.signInWithPassword({email: clientNameInput,password: passwordInput,});

if (error) {setAuthError("Login fehlgeschlagen");return;}
  setIsCoach(false);

const { data: userRes } = await supabase.auth.getUser();
const user = userRes.user;
if (!user) return;

  // 🔹 Client in DB anlegen / aktualisieren
const up = await supabase.from("app_clients").upsert({
    user_id: user.id,
    email: user.email,
    role: "client",
  },
  { onConflict: "user_id" }
);

console.log("app_clients upsert result:", up);

if (up.error) {console.error("app_clients upsert error:", up.error);} 
setClients(prev => ({
  ...prev,
  [user.id]: {
    ...(prev[user.id] || {}),
    id: user.id,
    name: user.email || "Klient",
    isActive: true,
    targets: prev[user.id]?.targets || INITIAL_TARGETS,
    records: prev[user.id]?.records || {},
    messages: prev[user.id]?.messages || [],
    hasUnreadClientMsg: prev[user.id]?.hasUnreadClientMsg || false,
    hasUnreadCoachMsg: prev[user.id]?.hasUnreadCoachMsg || false,
  }
}));

  setActiveClientId(user.id);
  setActiveTab("calendar");
  await loadClientFromDb(user.id);
};
    
const loadClientFromDb = async (clientId: string) => {
  // daily_logs laden
  const { data: logs, error: logsError } = await supabase
    .from("daily_logs")
    .select("date, record, planned, protein_g, fat_g, carbs_g, calories_kcal, body_weight_kg, steps, training")
    .eq("client_id", clientId);

  if (logsError) {
    console.error("daily_logs error", logsError);
    return;
  }
  
console.log("daily_logs loaded count:", (logs || []).length);
console.log("daily_logs first row:", (logs || [])[0]);

const records: Record<string, any> = {};

(logs || []).forEach((row: any) => {
  // 1) record aus DB (Source of truth)
  const base = row.record ?? null;

  if (base) {
    // merge: record + date/id absichern
    const merged: any = {
      ...base,
      id: base.id ?? row.date,
      date: base.date ?? row.date,
    };

    // planned aus separater Spalte ergänzen (falls nicht im record drin)
    if (row.planned) {
      if (merged.plannedNutrition == null && row.planned.plannedNutrition != null) {
        merged.plannedNutrition = row.planned.plannedNutrition;
      }
      if (merged.plannedSteps == null && row.planned.plannedSteps != null) {
        merged.plannedSteps = row.planned.plannedSteps;
      }
    }

    records[row.date] = merged;
    return;
  }

  // Fallback: falls record leer ist (damit UI nicht crasht)
  records[row.date] = {
    id: row.date,
    date: row.date,
    bodyWeight: row.body_weight_kg ?? 0,
    steps: row.steps ?? 0,
    nutrition: {
      id: `nut-${row.date}`,
      dayId: row.date,
      protein: row.protein_g ?? 0,
      carbs: row.carbs_g ?? 0,
      fat: row.fat_g ?? 0,
      calories: row.calories_kcal ?? 0,
    },
    workouts: row.training ?? [],
    plannedNutrition: row.planned?.plannedNutrition ?? null,
    plannedSteps: row.planned?.plannedSteps ?? null,
    photos: [],
  };
});

setClients((prev) => ({
  ...prev,
  [clientId]: {
    ...(prev[clientId] || {}),
    id: clientId,
    records,
  },
}));
}; 
  
const loadClientsFromDb = async () => {
const { data, error } = await supabase
    .from("app_clients")
    .select("*")
    .eq("role", "client");
console.log("loadClientsFromDb ERROR:", error);
console.log("loadClientsFromDb DATA:", data);

  if (error) {
    console.error("clients load error", error);
    return;
  }

setClients((prev) => {
  const next: any = { ...prev };

  (data || []).forEach((c: any) => {
    const existing = next[c.user_id] || {};

    next[c.user_id] = {
      ...existing,
      id: c.user_id,
      name: c.email || "Klient",
      isActive: true,

      // NICHT überschreiben, wenn schon vorhanden
      targets: existing.targets ?? INITIAL_TARGETS,
      records: existing.records ?? {},
      messages: existing.messages ?? [],
      hasUnreadClientMsg: existing.hasUnreadClientMsg ?? false,
      hasUnreadCoachMsg: existing.hasUnreadCoachMsg ?? false,
    };
  });

  return next;
});
};
 
const saveDayToDb = async (clientId: string, date: string, record: any) => {
  const payload = {
    client_id: clientId,
    date,

    // flache Spalten (für Fallback & einfache Queries)
    protein_g: record?.nutrition?.protein ?? null,
    fat_g: record?.nutrition?.fat ?? null,
    carbs_g: record?.nutrition?.carbs ?? null,
    calories_kcal: record?.nutrition?.calories ?? null,
    body_weight_kg: record?.bodyWeight ?? null,
    steps: record?.steps ?? null,
    training: record?.workouts ?? [],

    // komplettes DayRecord (Source of truth)
    record,

    // geplante Werte getrennt
    planned: {
      plannedSteps: record?.plannedSteps ?? null,
      plannedNutrition: record?.plannedNutrition ?? null,
    },

    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("daily_logs")
    .upsert(payload, { onConflict: "client_id,date" });

  if (error) throw error;
};
  
  const [authError, setAuthError] = useState<string | boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Exercise Instructions State
  const [instructionData, setInstructionData] = useState<{ name: string, execution: string, tips: string[] } | null>(null);
  const [loadingInstruction, setLoadingInstruction] = useState(false);

  // Persistenz

  // Nachricht gelesen Logik
  useEffect(() => {
    if (activeTab === 'chat' && activeClientId) {
      const client = clients[activeClientId];
      if (isCoach && client.hasUnreadClientMsg) {
        setClients(prev => ({
          ...prev,
          [activeClientId]: { ...prev[activeClientId], hasUnreadClientMsg: false }
        }));
      } else if (!isCoach && client.hasUnreadCoachMsg) {
        setClients(prev => ({
          ...prev,
          [activeClientId]: { ...prev[activeClientId], hasUnreadCoachMsg: false }
        }));
      }
    }
  }, [activeTab, activeClientId, isCoach, clients]);

  const filteredClients = useMemo(() => {
    return (Object.values(clients) as ClientProfile[]).filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [clients, searchTerm]);

  const handleLogin = () => {
    setAuthError(false);
    if (loginMode === 'coach') {
      if (passwordInput === COACH_PASSWORD) {
        setIsCoach(true); setActiveClientId(null); setActiveTab('admin');
      } else { setAuthError(true); }
    } else {
      const client = Object.values(clients).find(c => 
        c.name.toLowerCase().trim() === clientNameInput.toLowerCase().trim()
      );
      
      if (client && client.password === passwordInput) {
        if (!client.isActive) {
          setAuthError("Dieses Konto wurde deaktiviert. Kontaktiere deinen Coach.");
          return;
        }
        if (client.subscriptionExpiresAt && Date.now() > client.subscriptionExpiresAt) {
          setAuthError("Deine Lizenz ist abgelaufen. Kontaktiere deinen Coach.");
          return;
        }
        
        setActiveClientId(client.id); setIsCoach(false); setActiveTab('calendar');
      } else { setAuthError(true); }
    }
    setPasswordInput('');
  };

  const handleLogout = () => {
    setActiveClientId(null); setIsCoach(false); setAuthError(false); setPasswordInput(''); setClientNameInput('');
  };
  
const deleteClient = async (id: string) => {
  const clientName = clients[id]?.name || "Klient";
  const ok = window.confirm(
    `Soll "${clientName}" wirklich gelöscht werden?\n\nHinweis: Login-Account (Auth) wird NICHT automatisch gelöscht.`
  );
  if (!ok) return;

  // 1) DB: app_clients löschen (daily_logs werden durch CASCADE automatisch gelöscht)
  const { error } = await supabase.from("app_clients").delete().eq("user_id", id);
  if (error) {
    console.error("delete app_clients error:", error);
    alert("Löschen fehlgeschlagen (DB). Bitte später erneut versuchen.");
    return;
  }

  // 2) UI: aus State entfernen
  setClients((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });

  // 3) UI: falls gerade geöffnet
  if (activeClientId === id) {
    setActiveClientId(null);
    setActiveTab("admin");
  }

  alert(
    `Client gelöscht.\n\nWenn du willst, lösche jetzt auch den Login-Account:\nSupabase → Authentication → Users → ${clientName}`
  );
};

  const activeClient = activeClientId ? clients[activeClientId] : null;
  
  const getEffectiveData = (targetDate: string) => {
    if (!activeClient) return null;
    const records = activeClient.records || {};
    const allDates = Object.keys(records).sort((a, b) => b.localeCompare(a)); 
    
    let templateDate: string | null = null;
    let templateWorkouts: Workout[] = [];
    const currentRec = records[targetDate];

    if (currentRec?.workouts.some(w => w.exerciseName.trim() !== '')) {
      templateDate = targetDate; templateWorkouts = currentRec.workouts;
    } else {
      const pastDates = allDates.filter(d => d < targetDate);
      for (const d of pastDates) {
        const rec = records[d];
        if (rec.workouts.some(w => w.exerciseName.trim() !== '')) {
          templateDate = d; templateWorkouts = rec.workouts; break;
        }
      }
    }

    let pNutrition: Nutrition | null = currentRec?.plannedNutrition || null;
    let pSteps: number | null = currentRec?.plannedSteps ?? null;

    if (!pNutrition || pSteps === null) {
      const pastDates = allDates.filter(d => d < targetDate);
      for (const d of pastDates) {
        const rec = records[d];
        if (!pNutrition && rec.plannedNutrition) pNutrition = rec.plannedNutrition;
        if (pSteps === null && rec.plannedSteps !== undefined) pSteps = rec.plannedSteps;
        if (pNutrition && pSteps !== null) break;
      }
    }

    if (!pNutrition) {
      pNutrition = { 
        id: 'global', dayId: 'global', 
        protein: activeClient.targets.protein, 
        carbs: activeClient.targets.carbs, 
        fat: activeClient.targets.fat, 
        calories: activeClient.targets.calories 
      };
    }
    if (pSteps === null) pSteps = activeClient.targets.steps;

    const finalWorkouts = templateDate ? templateWorkouts : generateEmptyWorkouts(targetDate);
    
    let perfDate: string | null = null;
    if (templateDate) {
      if (currentRec?.workouts.some(w => w.sets.some(s => s.weight > 0 || s.reps > 0))) {
        perfDate = targetDate;
      } else {
        const pastDatesSinceTemplate = allDates.filter(d => d < targetDate && d >= templateDate);
        for (const d of pastDatesSinceTemplate) {
          const rec = records[d];
          if (rec.workouts.some(w => w.sets.some(s => s.weight > 0 || s.reps > 0))) {
            perfDate = d; break;
          }
        }
      }
    }

    return { 
      workouts: finalWorkouts, 
      plannedNutrition: pNutrition, 
      plannedSteps: pSteps,
      planOriginDate: templateDate,
      perfOriginDate: perfDate,
      record: currentRec || {
        id: targetDate, date: targetDate,
        workouts: finalWorkouts.map(w => ({
          ...w, id: `w-${targetDate}-${w.order}`, dayId: targetDate,
          sets: w.sets.map(s => ({ ...s, id: `s-${targetDate}-${w.order}-${s.setNumber}` }))
        })),
        nutrition: { id: `nut-${targetDate}`, dayId: targetDate, protein: 0, carbs: 0, fat: 0, calories: 0 },
        bodyWeight: 0, steps: 0, photos: []
      }
    };
  };

  const currentSelection = useMemo(() => getEffectiveData(selectedDate), [activeClient, selectedDate]);
  const previewSelection = useMemo(() => getEffectiveData(previewDate), [activeClient, previewDate]);

  const handleUpdateRecord = async (updated: DayRecord) => {
    if (!activeClientId) return;
    setClients(prev => ({ ...prev, [activeClientId]: { ...prev[activeClientId], records: { ...prev[activeClientId].records, [updated.date]: updated } } }));
try {
  await saveDayToDb(activeClientId, updated.date, updated);
  await loadClientFromDb(activeClientId);
} catch (e) {
  console.error("saveDayToDb failed", e);
}

  };

  const updateClientProfile = (id: string, updates: Partial<ClientProfile>) => {
    setClients(prev => ({ ...prev, [id]: { ...prev[id], ...updates } }));
  };

  const sendMessage = (text: string) => {
    if (!activeClientId || !text.trim()) return;
    const newMessage: ChatMessage = { id: `m-${Date.now()}`, senderId: isCoach ? 'coach' : activeClientId, text, timestamp: Date.now() };
    setClients(prev => {
      const client = prev[activeClientId];
      return { 
        ...prev, 
        [activeClientId]: { 
          ...client, 
          messages: [...(client.messages || []), newMessage],
          hasUnreadCoachMsg: isCoach ? true : client.hasUnreadCoachMsg,
          hasUnreadClientMsg: !isCoach ? true : client.hasUnreadClientMsg
        } 
      };
    });
  };

  const handleAiCoach = async () => {
    if (!currentSelection?.record) return;
    setIsAiLoading(true);
    try {
      const insight = await getAICoachInsights(currentSelection.record);
      setAiInsight(insight);
    } catch (err) {
      setAiInsight("Fehler bei der Verbindung zum KI-Coach.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleShowInstructions = async (name: string) => {
    if (!name.trim()) return;
    setLoadingInstruction(true);
    try {
      const res = await getExerciseInstructions(name);
      setInstructionData({ name, ...res });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInstruction(false);
    }
  };

  if (!activeClientId && !isCoach) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] p-8 text-slate-900 shadow-2xl">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center mb-4 shadow-lg"><ShieldCheck className="w-10 h-10 text-white" /></div>
            <h1 className="text-3xl font-black text-blue-900 uppercase leading-none">FitSheet Pro</h1>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-2">Professional Coaching Platform</p>
          </div>
          <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-6">
            <button onClick={() => setLoginMode('client')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${loginMode === 'client' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>Klient</button>
            <button onClick={() => setLoginMode('coach')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all ${loginMode === 'coach' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>Coach</button>
          </div>
          <div className="space-y-4">
            {(loginMode === 'client' || loginMode === 'coach') && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Deine E-Mail</label>
                <div className="relative">
                  <input 
                    type="email"
                    placeholder="name@domain.de" 
                    value={clientNameInput} 
                    onChange={(e) => setClientNameInput(e.target.value)} 
                   onKeyDown={(e) =>
  e.key === "Enter" &&
  (loginMode === "coach" ? handleCoachLogin() : handleClientLogin())
}


                    className={`w-full bg-slate-50 border p-4 pr-12 rounded-2xl font-black text-slate-700 focus:outline-none transition-all ${authError ? 'border-rose-400' : 'border-slate-200 focus:border-blue-500'}`} 
                  />
                  <User className={`absolute right-4 top-4 w-5 h-5 ${authError ? 'text-rose-400' : 'text-slate-300'}`} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Passwort</label>
              <div className="relative">
                <input type="password" placeholder="••••••••" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) =>
  e.key === "Enter" &&
  (loginMode === "coach" ? handleCoachLogin() : handleClientLogin())
}

 className={`w-full bg-slate-50 border p-4 rounded-2xl font-black text-slate-700 focus:outline-none transition-all ${authError ? 'border-rose-400' : 'border-slate-200 focus:border-blue-500'}`} />
                <Lock className={`absolute right-4 top-4 w-5 h-5 ${authError ? 'text-rose-400' : 'text-slate-300'}`} />
              </div>
            </div>
            {authError && (
              <p className="text-center text-rose-500 text-[10px] font-black uppercase tracking-widest p-2 bg-rose-50 rounded-xl">
                {typeof authError === 'string' ? authError : 'Zugriff verweigert'}
              </p>
            )}
            <button
 onClick={() => (loginMode === "coach" ? handleCoachLogin() : handleClientLogin())}


 className="w-full bg-blue-600 text-white p-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all mt-4 flex items-center justify-center gap-2">Login <UserCheck className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  const hasCoachNotifications = Object.values(clients).some(c => c.hasUnreadClientMsg);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center">
      <div className="w-full max-w-6xl flex flex-col min-h-screen shadow-2xl bg-white md:my-4 md:min-h-[90vh] md:rounded-[3rem] overflow-hidden relative">
        <header className="bg-blue-800 text-white p-4 md:p-6 sticky top-0 z-20 flex justify-between items-center shadow-lg">
          <div className="flex flex-col">
            <h1 className="text-xs md:text-sm font-black tracking-tighter flex items-center gap-1.5 opacity-80 uppercase"><ShieldCheck className="w-4 h-4 text-blue-300" /> {isCoach ? 'Coach Control Panel' : 'FitSheet Tracker'}</h1>
            <div className="flex items-center gap-2 font-black text-base md:text-xl">{isCoach && activeClientId ? (<span className="text-emerald-300 flex items-center gap-2"><PencilLine className="w-5 h-5" /> {activeClient?.name}</span>) : (activeTab === 'admin' ? 'Klientenverwaltung' : (activeClient?.name || 'Dashboard'))}</div>
          </div>
          <div className="flex gap-2">
            {isCoach && <button onClick={() => { setActiveTab('admin'); setActiveClientId(null); }} className={`p-2 rounded-xl transition-all ${activeTab === 'admin' ? 'bg-white text-blue-800' : 'bg-blue-700 hover:bg-blue-600'}`}><Users className="w-5 h-5" /></button>}
            <button onClick={handleLogout} className="p-2 bg-blue-700 rounded-xl hover:bg-rose-600 transition-all flex items-center gap-2 md:px-4"><LogOut className="w-5 h-5" /><span className="hidden md:inline font-black text-xs uppercase">Logout</span></button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 md:p-8 custom-scrollbar">
          {activeTab === 'calendar' && activeClientId && activeClient && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 space-y-6">
                <CalendarView 
                  selectedDate={previewDate} 
                  setSelectedDate={(d: string) => setPreviewDate(d)} 
                  onDoubleClick={(d: string) => { setSelectedDate(d); setPreviewDate(d); setActiveTab('details'); }}
                  records={activeClient.records || {}} 
                />
              </div>
             
              <div className="lg:col-span-5">
                {previewSelection && (
                  <ClientTargetsCard 
                    targets={{ 
                      steps: previewSelection.plannedSteps, 
                      protein: previewSelection.plannedNutrition?.protein || 0, 
                      carbs: previewSelection.plannedNutrition?.carbs || 0, 
                      fat: previewSelection.plannedNutrition?.fat || 0, 
                      calories: previewSelection.plannedNutrition?.calories || 0 
                    }} 
                    record={previewSelection.record}
                    displayDate={previewDate}
                  />
                )}
                <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase flex items-center justify-center gap-2">
                    <Info className="w-3 h-3" /> Tipp: 1x Klick für Vorschau, 2x Klick für Details
                  </p>
                </div>
              </div>
            </div>
          )}
           {activeTab === 'calendar' && activeClientId && !activeClient && (
  <div className="p-8 text-center text-slate-400 font-black uppercase text-xs">
    Lade Klient...
  </div>
)}
          {activeTab === 'details' && currentSelection && (
            <div className="space-y-4 md:space-y-10 animate-in slide-in-from-right duration-300 max-w-5xl mx-auto">
              <div className="bg-slate-50 p-3 md:p-4 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100 flex items-center justify-between shadow-sm">
                <button onClick={() => setSelectedDate(formatDate(new Date(new Date(selectedDate).setDate(new Date(selectedDate).getDate()-1))))} className="p-2 md:p-3 bg-white text-blue-600 rounded-xl md:rounded-2xl hover:bg-blue-50 shadow-sm"><ChevronLeft className="w-5 h-5 md:w-6 md:h-6" /></button>
                <div className="flex flex-col items-center">
                  <h2 className="text-sm md:text-xl font-black text-slate-800 text-center">{new Date(selectedDate).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })}</h2>
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {currentSelection.planOriginDate && currentSelection.planOriginDate !== selectedDate && (<div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[7px] md:text-[8px] font-black uppercase"><Info className="w-2 h-2" /> Plan: {new Date(currentSelection.planOriginDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</div>)}
                    {currentSelection.perfOriginDate && currentSelection.perfOriginDate !== selectedDate && (<div className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[7px] md:text-[8px] font-black uppercase"><History className="w-2 h-2" /> Last: {new Date(currentSelection.perfOriginDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</div>)}
                  </div>
                </div>
                <button onClick={() => setSelectedDate(formatDate(new Date(new Date(selectedDate).setDate(new Date(selectedDate).getDate()+1))))} className="p-2 md:p-3 bg-white text-blue-600 rounded-xl md:rounded-2xl hover:bg-blue-50 shadow-sm"><ChevronRight className="w-5 h-5 md:w-6 md:h-6" /></button>
              </div>
              
              {!isCoach && (
                <button onClick={handleAiCoach} disabled={isAiLoading} className="w-full bg-blue-600 text-white py-4 rounded-2xl flex items-center justify-center gap-2 text-[10px] md:text-xs font-black shadow-lg hover:bg-blue-700 disabled:opacity-50">
                  <BrainCircuit className="w-5 h-5" /> {isAiLoading ? 'ANALYSIERE...' : 'KI COACH ANALYSE'}
                </button>
              )}

              {aiInsight && (
                <div className="bg-blue-50 border-l-8 border-blue-500 p-6 rounded-r-2xl text-slate-700 text-xs md:text-sm italic relative shadow-sm animate-in fade-in slide-in-from-left duration-300">
                  <button onClick={() => setAiInsight(null)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">✕</button>
                  <p className="leading-relaxed font-medium">{aiInsight}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 md:gap-6">
                <BodyWeightSection weight={currentSelection.record.bodyWeight} onUpdate={(bw: number) => handleUpdateRecord({ ...currentSelection.record, bodyWeight: bw })} />
                <StepsSection 
                  steps={currentSelection.record.steps} 
                  plannedSteps={currentSelection.record.plannedSteps ?? currentSelection.plannedSteps}
                  onUpdate={(s: number) => handleUpdateRecord({ ...currentSelection.record, steps: s })}
                  onUpdatePlanned={(ps: number) => handleUpdateRecord({ ...currentSelection.record, plannedSteps: ps })}
                  isCoach={isCoach}
                />
              </div>
              
              <NutritionSection 
                data={currentSelection.record.nutrition} 
                plannedData={currentSelection.record.plannedNutrition || currentSelection.plannedNutrition}
                onUpdate={(n: Nutrition) => handleUpdateRecord({ ...currentSelection.record, nutrition: n })} 
                onUpdatePlanned={(pn: Nutrition) => handleUpdateRecord({ ...currentSelection.record, plannedNutrition: pn })}
                isCoach={isCoach}
              />
              
              <PhotoUploadSection photos={currentSelection.record.photos || []} onUpdate={(p: string[]) => handleUpdateRecord({ ...currentSelection.record, photos: p })} isCoach={isCoach} date={selectedDate} />
              <WorkoutSection workouts={currentSelection.workouts} onUpdate={(w: Workout[]) => handleUpdateRecord({ ...currentSelection.record, workouts: w })} isCoach={isCoach} perfOriginDate={currentSelection.perfOriginDate} currentDate={selectedDate} onShowInfo={handleShowInstructions} />
            </div>
          )}
          {activeTab === 'progression' && activeClient && (<div className="max-w-5xl mx-auto">{isCoach && (<button onClick={() => { setActiveTab('admin'); setActiveClientId(null); }} className="mb-6 flex items-center gap-2 text-slate-400 font-black text-xs uppercase hover:text-blue-600"><Plus className="w-4 h-4 rotate-45" /> Zurück zur Übersicht</button>)}<ProgressionView records={activeClient.records || {}} clientName={activeClient.name} isCoach={isCoach} /></div>)}
          
         {isCoach && !activeClientId && activeTab !== 'chat' && (
  <div className="max-w-6xl mx-auto space-y-6 md:space-y-8 pb-20">
    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-blue-900 p-6 md:p-10 rounded-[2.5rem] shadow-xl text-white">
      <div>
        <h2 className="text-2xl md:text-4xl font-black">Coach Übersicht</h2>
        <p className="text-blue-300 text-xs font-black uppercase tracking-widest">
          {Object.keys(clients).length} Aktive Betreuungen
        </p>
      </div>
      <button
        onClick={async () => {
  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      alert("Nicht eingeloggt");
      return;
    }

    const res = await fetch(
      "https://nrxabbtoikecqvyaabso.supabase.co/functions/v1/smooth-task",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: `client_${Date.now()}@demo.local`,
          password: "123456",
          name: "Neuer Klient",
          license_days: 30,
        }),
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      alert("Fehler: " + txt);
      return;
    }

    // WICHTIG: echte Clients neu laden
    await loadClientsFromDb();
  } catch (e) {
    alert("Fehler: " + String(e));
  }
}}

        className="bg-white text-blue-900 px-8 py-4 rounded-2xl font-black text-sm uppercase flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-lg shadow-blue-950/20"
      >
        <UserPlus className="w-5 h-5" /> Klient hinzufügen
      </button>
    </div>

    <div className="relative group max-w-xl mx-auto px-1">
      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        placeholder="Suchen..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full bg-white border border-slate-200 p-4 pl-14 rounded-2xl font-black text-slate-700 shadow-sm focus:outline-none focus:border-blue-500 transition-all"
      />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredClients.map((client) => (
        <AdminClientCard
          key={client.id}
          client={client}
          onSelect={() => {
            setActiveClientId(client.id);
            setActiveTab("calendar");
          }}
          onViewAnalysis={() => {
            setActiveClientId(client.id);
            setActiveTab("progression");
          }}
          onUpdate={(up) => updateClientProfile(client.id, up)}
          onDelete={() => deleteClient(client.id)}
        />
      ))}
    </div>
  </div>
)}

          
          {activeTab === 'chat' && (<div className="max-w-6xl mx-auto h-[70vh] md:h-[75vh]">{isCoach ? (<CoachInbox clients={clients} activeClientId={activeClientId} onSelectClient={setActiveClientId} onSendMessage={sendMessage} />) : (<ChatWindow messages={activeClient?.messages || []} onSendMessage={sendMessage} title="Coach Kontakt" isCoach={false} />)}</div>)}
        </main>
        
        <nav className="bg-white border-t border-slate-100 p-2 md:p-4 grid grid-cols-4 gap-1 sticky bottom-0 z-20 md:static">
          {isCoach && !activeClientId ? (
            <>
              <NavBtn icon={<LayoutDashboard/>} label="Klienten" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />
              <NavBtn icon={<MessageSquare/>} label="Postfach" active={activeTab === 'chat'} hasNotification={hasCoachNotifications} onClick={() => setActiveTab('chat')} />
              <NavBtn icon={<BarChart3/>} label="Analysen" active={false} onClick={() => {}} />
              <NavBtn icon={<Sliders/>} label="Einstellungen" active={false} onClick={() => {}} />
            </>
          ) : (
            <>
              <NavBtn icon={<CalendarIcon/>} label="Plan" active={activeTab === 'calendar'} onClick={() => { setActiveTab('calendar'); setPreviewDate(selectedDate); }} />
              <NavBtn icon={<Dumbbell/>} label="Eingabe" active={activeTab === 'details'} onClick={() => setActiveTab('details')} />
              <NavBtn icon={<TrendingUp/>} label="Analyse" active={activeTab === 'progression'} onClick={() => setActiveTab('progression')} />
              <NavBtn icon={<MessageSquare/>} label="Chat" active={activeTab === 'chat'} hasNotification={!isCoach && activeClient?.hasUnreadCoachMsg} onClick={() => setActiveTab('chat')} />
            </>
          )}
        </nav>
      </div>

      {/* Global Instruction Modal */}
      {(instructionData || loadingInstruction) && (
        <div className="fixed inset-0 z-[100] bg-blue-900/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in slide-in-from-bottom-10 duration-300">
            <div className="bg-slate-800 p-6 text-white flex justify-between items-start">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Übungs-Guide</span>
                <h3 className="text-xl font-black uppercase leading-tight">{instructionData?.name || 'Lade Guide...'}</h3>
              </div>
              <button onClick={() => setInstructionData(null)} className="p-2 bg-slate-700 rounded-xl hover:bg-rose-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8">
              {loadingInstruction ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">KI analysiert Technik...</p>
                </div>
              ) : instructionData && (
                <div className="space-y-8">
                  <div className="space-y-3">
                    <h4 className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                      <Sparkles className="w-4 h-4" /> Ausführung
                    </h4>
                    <p className="text-slate-600 text-sm font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 italic">
                      "{instructionData.execution}"
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                      Darauf achten
                    </h4>
                    <ul className="space-y-3">
                      {instructionData.tips.map((tip, i) => (
                        <li key={i} className="flex gap-3 items-start group">
                          <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-black text-[10px] shrink-0 mt-0.5 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                            {i+1}
                          </div>
                          <span className="text-slate-700 text-sm font-bold">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button onClick={() => setInstructionData(null)} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-slate-900 transition-all flex items-center justify-center gap-2">
                    Verstanden <Check className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-Components ---

const AdminClientCard: React.FC<{ client: ClientProfile, onSelect: () => void, onViewAnalysis: () => void, onUpdate: (up: Partial<ClientProfile>) => void, onDelete: () => void }> = ({ client, onSelect, onViewAnalysis, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  
  const updateTargetField = (field: keyof ClientTargets, value: number) => {
    const updated = { ...client.targets, [field]: value };
    updated.calories = (updated.protein * 4) + (updated.carbs * 4) + (updated.fat * 9);
    onUpdate({ targets: updated });
  };

  const handleSetSubscription = (days: number) => {
    const expiry = Date.now() + (days * 24 * 60 * 60 * 1000);
    onUpdate({ subscriptionExpiresAt: expiry, isActive: true });
  };

  const isExpired = client.subscriptionExpiresAt && Date.now() > client.subscriptionExpiresAt;
  const daysLeft = client.subscriptionExpiresAt 
    ? Math.max(0, Math.ceil((client.subscriptionExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className={`bg-white border rounded-[2rem] shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden relative group ${!client.isActive || isExpired ? 'border-rose-200' : 'border-slate-100'}`}>
      
      {/* Lizenz-Status Badge */}
      <div className="absolute top-3 right-16 flex gap-1 items-center z-10">
        {!client.isActive && <div className="bg-rose-100 text-rose-600 p-1.5 rounded-lg" title="Deaktiviert"><Sliders className="w-3 h-3" /></div>}
        {isExpired && <div className="bg-amber-100 text-amber-600 p-1.5 rounded-lg" title="Abgelaufen"><Clock className="w-3 h-3" /></div>}
        {client.hasUnreadClientMsg && (
          <div className="w-3 h-3 bg-rose-500 rounded-full border-2 border-white animate-pulse"></div>
        )}
      </div>
      
      <div 
        className={`p-4 md:p-6 cursor-pointer hover:bg-slate-50 transition-colors flex-1 ${editing ? 'pointer-events-none' : ''} ${!client.isActive || isExpired ? 'opacity-60' : ''}`}
        onClick={onSelect}
      >
        <div className="flex justify-between items-start mb-4 gap-2">
          <div className="flex-1 overflow-hidden">
            <h3 className="font-black text-slate-800 text-lg leading-tight truncate">{client.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">PW: {client.password}</p>
              {daysLeft !== null && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${daysLeft < 7 ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'}`}>
                  {daysLeft} TAGE ÜBRIG
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0 pointer-events-auto">
            <button 
              onClick={(e) => { e.stopPropagation(); onUpdate({ isActive: !client.isActive }); }} 
              className={`p-2 rounded-xl transition-all ${client.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}
              title={client.isActive ? "Deaktivieren" : "Aktivieren"}
            >
              {client.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditing(!editing); }} className={`p-2 rounded-xl transition-all ${editing ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}><Settings className="w-4 h-4" /></button>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="px-4 pb-4 md:px-6 md:pb-6 space-y-4 animate-in slide-in-from-top duration-300">
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-[7px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Lizenz verlängern</label>
              <div className="grid grid-cols-3 gap-1">
                <button onClick={() => handleSetSubscription(30)} className="text-[8px] font-black p-2 bg-white border border-blue-100 rounded-lg text-blue-600 hover:bg-blue-600 hover:text-white transition-all">30 TAGE</button>
                <button onClick={() => handleSetSubscription(90)} className="text-[8px] font-black p-2 bg-white border border-blue-100 rounded-lg text-blue-600 hover:bg-blue-600 hover:text-white transition-all">90 TAGE</button>
                <button onClick={() => handleSetSubscription(365)} className="text-[8px] font-black p-2 bg-white border border-blue-100 rounded-lg text-blue-600 hover:bg-blue-600 hover:text-white transition-all">1 JAHR</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-400 uppercase">Name</label>
                <input value={client.name} onChange={e => onUpdate({ name: e.target.value })} className="w-full bg-white p-2.5 rounded-xl text-xs font-black focus:outline-none focus:ring-1 ring-blue-300 border border-slate-100" />
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-400 uppercase">Passwort</label>
                <input value={client.password} onChange={e => onUpdate({ password: e.target.value })} className="w-full bg-white p-2.5 rounded-xl text-xs font-black focus:outline-none focus:ring-1 ring-blue-300 border border-slate-100" />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {[{ label: 'Prot', field: 'protein', color: 'emerald' }, { label: 'Carbs', field: 'carbs', color: 'amber' }, { label: 'Fett', field: 'fat', color: 'rose' }].map(m => (
                <div key={m.field} className={`bg-${m.color}-50 border border-${m.color}-100 p-2 rounded-xl`}>
                  <label className={`text-[7px] font-black uppercase text-${m.color}-600 block mb-1`}>{m.label}</label>
                  <input type="number" value={client.targets[m.field as keyof ClientTargets]} onChange={e => updateTargetField(m.field as keyof ClientTargets, parseInt(e.target.value) || 0)} className="w-full bg-transparent text-xs font-black focus:outline-none" />
                </div>
              ))}
            </div>
            
            <button onClick={() => setEditing(false)} className="w-full bg-blue-600 text-white py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"><Check className="w-4 h-4" /> Speichern</button>
          </div>
        </div>
      )}
      
      {!editing && (
        <div className="px-4 pb-4 md:px-6 md:pb-6 grid grid-cols-2 gap-2 mt-auto">
          <button onClick={onSelect} className="bg-blue-50 text-blue-600 py-4 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"><Dumbbell className="w-4 h-4" /> Planen</button>
          <button onClick={onViewAnalysis} className="bg-emerald-50 text-emerald-600 py-4 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"><TrendingUp className="w-4 h-4" /> Analyse</button>
        </div>
      )}
    </div>
  );
};

const ClientTargetsCard: React.FC<{ targets: ClientTargets, record: DayRecord, displayDate: string }> = ({ targets, record, displayDate }) => {
  const nutrition = record.nutrition || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const getPercent = (val: number, target: number) => Math.min(100, (val / (target || 1)) * 100);
  
  const stats = [
    { label: 'KALORIEN', val: nutrition.calories, target: targets.calories, unit: 'kcal', color: 'bg-emerald-400' },
    { label: 'PROTEIN', val: nutrition.protein, target: targets.protein, unit: 'g', color: 'bg-emerald-500' },
    { label: 'KOHLENHYDRATE', val: nutrition.carbs, target: targets.carbs, unit: 'g', color: 'bg-amber-400' },
    { label: 'FETT', val: nutrition.fat, target: targets.fat, unit: 'g', color: 'bg-rose-400' },
    { label: 'SCHRITTE', val: record.steps || 0, target: targets.steps, unit: '', color: 'bg-blue-400' },
  ];

  const dateLabel = new Date(displayDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });

  return (
    <div className="bg-blue-900 text-white p-8 rounded-[2.5rem] shadow-xl border-b-4 border-blue-950 animate-in fade-in zoom-in duration-300">
      <h3 className="font-black text-xs uppercase tracking-widest opacity-60 mb-8 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" /> Ziele für {dateLabel}
      </h3>
      <div className="space-y-6">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="flex justify-between font-black text-[9px] mb-1.5 uppercase tracking-wide">
              <span>{s.label}</span>
              <span>{s.val?.toLocaleString()} / {s.target?.toLocaleString()}{s.unit}</span>
            </div>
            <div className="h-1.5 bg-blue-950 rounded-full overflow-hidden">
              <div className={`h-full ${s.color} transition-all duration-700 ease-out`} style={{ width: `${getPercent(s.val, s.target)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PhotoUploadSection: React.FC<{ photos: string[], onUpdate: (p: string[], dateStr?: string) => void, isCoach: boolean, date: string }> = ({ photos, onUpdate, isCoach, date }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    if (isCoach) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const newPhotos = [...photos];
      while (newPhotos.length <= index) newPhotos.push('');
      newPhotos[index] = reader.result as string;
      onUpdate(newPhotos); 
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (index: number) => {
    if (isCoach) return;
    const newPhotos = [...photos];
    newPhotos[index] = '';
    onUpdate(newPhotos);
  };

  const downloadPhoto = (data: string, label: string) => {
    const link = document.createElement('a');
    link.href = data;
    link.download = `Fitsheet_${date}_${label.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const photoCount = photos.filter(p => p && p.trim() !== '').length;

  return (
    <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-6 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Camera className="w-5 h-5 text-blue-500" />
          <div className="flex flex-col items-start">
            <h3 className="font-black text-[10px] uppercase text-slate-800 tracking-widest">UPDATE FOTOS</h3>
            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">
              {photoCount === 4 ? 'Vollständig' : `${photoCount} von 4 hochgeladen`}
            </span>
          </div>
        </div>
        <div className={`p-2 rounded-xl bg-slate-100 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </button>

      {isOpen && (
        <div className="p-6 pt-0 animate-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {PHOTO_LABELS.map((label, i) => (
              <div key={i} className="flex flex-col gap-2">
                <span className="text-[7px] font-black text-slate-400 uppercase text-center truncate">{label}</span>
                <div className="aspect-[3/4] bg-slate-50 rounded-2xl border border-dashed border-slate-200 relative group overflow-hidden shadow-inner">
                  {photos[i] ? (
                    <>
                      <img src={photos[i]} alt={label} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {!isCoach ? (
                          <button onClick={() => removePhoto(i)} className="bg-rose-500 text-white p-2 rounded-xl shadow-lg hover:scale-110 transition-transform">
                            <X className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => downloadPhoto(photos[i], label)} className="bg-blue-600 text-white p-2 rounded-xl shadow-lg hover:scale-110 transition-transform">
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    !isCoach && (
                      <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors">
                        <Plus className="w-5 h-5 text-slate-300 mb-1" />
                        <span className="text-[8px] font-black text-slate-400 uppercase">Foto</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, i)} />
                      </label>
                    )
                  )}
                  {isCoach && !photos[i] && (
                    <div className="w-full h-full flex items-center justify-center opacity-30">
                      <ImageIcon className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ExerciseInputWithSuggestions: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  isCoach: boolean;
}> = ({ value, onChange, placeholder, className, isCoach }) => {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const checkCorrection = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 4) {
      setSuggestion(null);
      return;
    }
    const fixed = await getExerciseCorrection(text);
    if (fixed && fixed.toLowerCase() !== text.toLowerCase()) {
      setSuggestion(fixed);
    } else {
      setSuggestion(null);
    }
  }, []);

  useEffect(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (value.trim()) {
      timeoutRef.current = window.setTimeout(() => checkCorrection(value), 1000);
    } else {
      setSuggestion(null);
    }
  }, [value, checkCorrection]);

  return (
    <div className="relative w-full">
      <input 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder}
        className={className}
      />
      {suggestion && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-blue-100 rounded-xl shadow-xl p-2 animate-in zoom-in duration-200 flex flex-col gap-1.5 min-w-[200px]">
          <div className="flex items-center gap-2 px-2 py-1">
            <Sparkles className="w-3 h-3 text-blue-500" />
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Meintest du?</span>
          </div>
          <button 
            onClick={() => { onChange(suggestion); setSuggestion(null); }}
            className="w-full text-left px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg transition-colors flex justify-between items-center group"
          >
            {suggestion}
            <div className="text-[8px] font-black text-blue-300 group-hover:text-blue-500 uppercase">Annehmen</div>
          </button>
          <button 
            onClick={() => setSuggestion(null)}
            className="absolute top-1 right-1 p-1 text-slate-300 hover:text-slate-500"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

const WorkoutSection: React.FC<{ workouts: Workout[]; onUpdate: (w: Workout[]) => void; isCoach: boolean; perfOriginDate: string | null; currentDate: string; onShowInfo: (name: string) => void; }> = ({ workouts, onUpdate, isCoach, perfOriginDate, currentDate, onShowInfo }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [isAiPlanning, setIsAiPlanning] = useState(false);
  const [aiPlanText, setAiPlanText] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);

  const isInherited = perfOriginDate && perfOriginDate !== currentDate;
  
  const handleAiParse = async () => {
    if (!aiPlanText.trim()) return;
    setIsAiParsing(true);
    try {
      const exerciseNames = await parseWorkoutPlan(aiPlanText);
      const newWorkouts = [...workouts];
      exerciseNames.forEach((name, i) => {
        if (newWorkouts[i]) {
          newWorkouts[i] = { ...newWorkouts[i], exerciseName: name };
        }
      });
      onUpdate(newWorkouts);
      setIsAiPlanning(false);
      setAiPlanText('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiParsing(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="flex justify-between items-center px-1">
        <h3 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">{isCoach ? 'TRAININGSPLAN ERSTELLEN' : 'TRAININGSAUFZEICHNUNG'}</h3>
        <div className="flex gap-2">
          {isCoach && (
            <button 
              onClick={() => setIsAiPlanning(!isAiPlanning)} 
              className={`p-2 rounded-xl transition-all ${isAiPlanning ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-blue-600 border border-slate-100 hover:bg-slate-50'}`}
              title="KI Übungsplaner"
            >
              <Wand2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => { setShowAll(!showAll); setExpandedId(null); }} className="text-[9px] font-black px-4 py-2 rounded-xl bg-white text-blue-600 border border-slate-100 hover:bg-slate-50 transition-colors">{showAll ? 'KOMPAKT' : 'ALLE DETAILS'}</button>
        </div>
      </div>

      {isAiPlanning && isCoach && (
        <div className="bg-blue-50 border border-blue-100 p-6 rounded-[2rem] animate-in slide-in-from-top duration-300 space-y-4 shadow-inner">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">KI ÜBUNGS-PLANER</span>
          </div>
          <p className="text-[9px] text-blue-400 font-bold uppercase leading-relaxed">
            Gib Übungen einfach durch Komma oder Zeilenumbruch getrennt ein. Die KI übernimmt sie automatisch in die Liste.
          </p>
          <textarea 
            value={aiPlanText}
            onChange={e => setAiPlanText(e.target.value)}
            placeholder="Bsp: Bankdrücken, Kniebeugen, Klimmzüge, Kreuzheben..."
            className="w-full bg-white border border-blue-100 rounded-2xl p-4 font-medium text-xs focus:outline-none focus:ring-2 ring-blue-500/20 min-h-[100px] resize-none shadow-sm"
          />
          <div className="flex gap-2">
            <button 
              onClick={handleAiParse}
              disabled={isAiParsing || !aiPlanText.trim()}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isAiParsing ? 'PARSING...' : 'PLAN ÜBERNEHMEN'}
            </button>
            <button 
              onClick={() => { setIsAiPlanning(false); setAiPlanText(''); }}
              className="px-6 bg-white text-slate-400 py-3 rounded-xl font-black text-[10px] uppercase border border-slate-100 hover:bg-slate-50 transition-all"
            >
              ABBRECHEN
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {workouts.map((w, idx) => {
          const isExpanded = showAll || expandedId === w.id;
          return (
            <div key={w.id} className={`bg-white border border-slate-100 rounded-[2rem] p-4 transition-all border-l-[10px] ${idx >= 4 ? 'border-l-slate-200' : 'border-l-blue-600'} ${isExpanded ? 'ring-2 ring-blue-50' : 'cursor-pointer hover:border-slate-200 shadow-sm'}`} onClick={() => !showAll && setExpandedId(isExpanded ? null : w.id)}>
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white ${idx >= 4 ? 'bg-slate-400' : 'bg-blue-600'}`}>{idx + 1}</div>
                <div className="flex-1 flex items-center justify-between gap-2 overflow-hidden">
                  {isCoach && isExpanded ? (
                    <ExerciseInputWithSuggestions 
                      value={w.exerciseName} 
                      isCoach={isCoach}
                      onChange={val => onUpdate(workouts.map(x => x.id === w.id ? { ...x, exerciseName: val } : x))}
                      placeholder="Übung Name..."
                      className="w-full bg-transparent font-black text-lg text-slate-800 focus:outline-none border-b-2 border-blue-50 focus:border-blue-500 pb-1"
                    />
                  ) : (
                    <span className={`font-black text-sm md:text-lg truncate ${w.exerciseName ? 'text-slate-700' : 'text-slate-300 italic'}`}>{w.exerciseName || 'Übung festlegen...'}</span>
                  )}
                  {w.exerciseName && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onShowInfo(w.exerciseName); }}
                      className="p-2 bg-slate-50 text-blue-500 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors shrink-0"
                      title="Technik Info"
                    >
                      <CircleHelp className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && w.exerciseName && (
                <div className="grid grid-cols-3 gap-3 mt-6 animate-in fade-in zoom-in duration-200">
                  {w.sets.map((s, si) => (
                    <div key={s.id} className="bg-slate-50 p-3 rounded-2xl flex flex-col items-center border border-slate-100">
                      <span className="text-[8px] font-black text-slate-400 uppercase mb-1">Satz {si + 1}</span>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <input type="number" value={s.weight || ''} onChange={e => {
                          const ns = [...w.sets]; ns[si].weight = parseFloat(e.target.value) || 0;
                          onUpdate(workouts.map(x => x.id === w.id ? { ...x, sets: ns } : x));
                        }} className={`w-10 text-center font-black text-base focus:outline-none bg-transparent ${isInherited && s.weight > 0 ? 'text-slate-400' : 'text-slate-800'}`} placeholder="kg" />
                        <span className="text-slate-300 text-xs">×</span>
                        <input type="number" value={s.reps || ''} onChange={e => {
                          const ns = [...w.sets]; ns[si].reps = parseInt(e.target.value) || 0;
                          onUpdate(workouts.map(x => x.id === w.id ? { ...x, sets: ns } : x));
                        }} className={`w-10 text-center font-black text-base focus:outline-none bg-transparent ${isInherited && s.reps > 0 ? 'text-slate-400' : 'text-slate-800'}`} placeholder="wdh" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const BodyWeightSection = ({ weight, onUpdate }: any) => (
  <div className="bg-white border border-slate-100 rounded-[2rem] p-4 flex flex-col items-center shadow-sm">
    <h3 className="font-black text-[9px] uppercase text-slate-400 mb-2 flex items-center gap-1"><Scale className="w-3 h-3 text-emerald-500" /> GEWICHT</h3>
    <input type="number" step="0.1" value={weight || ''} onChange={e => onUpdate(parseFloat(e.target.value) || 0)} className="w-full text-center font-black text-xl text-slate-800 bg-slate-50 p-3 rounded-2xl focus:outline-none border border-transparent focus:border-blue-100" placeholder="0.0" />
    <span className="text-[8px] font-black text-slate-300 mt-2">KG</span>
  </div>
);

const StepsSection = ({ steps, plannedSteps, onUpdate, onUpdatePlanned, isCoach }: any) => (
  <div className="bg-white border border-slate-100 rounded-[2rem] p-4 flex flex-col items-center shadow-sm">
    <h3 className="font-black text-[9px] uppercase text-slate-400 mb-2 flex items-center gap-1"><Footprints className="w-3 h-3 text-blue-500" /> SCHRITTE</h3>
    <div className="w-full flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-[7px] font-black text-slate-400 uppercase self-center mb-1">Ist-Wert</span>
        <input type="number" value={steps || ''} onChange={e => onUpdate(parseInt(e.target.value) || 0)} className="w-full text-center font-black text-xl text-slate-800 bg-slate-50 p-3 rounded-2xl focus:outline-none border border-transparent focus:border-blue-100" placeholder="0" />
      </div>
      {isCoach && (
        <div className="flex flex-col pt-2 border-t border-slate-50">
          <span className="text-[7px] font-black text-blue-500 uppercase self-center mb-1">Zukünftiges Ziel</span>
          <input type="number" value={plannedSteps || ''} onChange={e => onUpdatePlanned(parseInt(e.target.value) || 0)} className="w-full text-center font-black text-xs text-blue-600 bg-blue-50/30 p-2 rounded-xl focus:outline-none border border-blue-50" placeholder="Ziel..." />
        </div>
      )}
    </div>
  </div>
);

const NutritionSection = ({ data, plannedData, onUpdate, onUpdatePlanned, isCoach }: any) => {
  const n = data || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const pn = plannedData || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  
  const up = (f: string, v: number) => {
    const updated = { ...n, [f]: Math.max(0, v) };
    updated.calories = (updated.protein * 4) + (updated.carbs * 4) + (updated.fat * 9);
    onUpdate(updated);
  };
  
  const upPlanned = (f: string, v: number) => {
    const updated = { ...pn, [f]: Math.max(0, v) };
    updated.calories = (updated.protein * 4) + (updated.carbs * 4) + (updated.fat * 9);
    onUpdatePlanned(updated);
  };

  return (
    <div className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-black text-[10px] uppercase text-slate-400 flex items-center gap-2"><Utensils className="w-4 h-4 text-orange-500" /> ERNÄHRUNG</h3>
        <div className="bg-blue-50 px-4 py-1 rounded-full border border-blue-100 flex flex-col items-center">
          <span className="text-blue-600 font-black text-lg leading-none">{n.calories}</span>
          <span className="text-[7px] font-black text-blue-400 uppercase">kcal ist</span>
        </div>
      </div>
      
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          {[{ label: 'Protein', field: 'protein', color: 'emerald' }, { label: 'Carbs', field: 'carbs', color: 'amber' }, { label: 'Fett', field: 'fat', color: 'rose' }].map(m => (
            <div key={m.field} className="bg-slate-50 p-3 rounded-2xl text-center border border-slate-100">
              <label className={`text-[8px] font-black text-${m.color}-600 uppercase block mb-1`}>{m.label}</label>
              <input type="number" value={n[m.field as keyof Nutrition] || ''} onChange={e => up(m.field, parseInt(e.target.value) || 0)} className="w-full bg-transparent text-center font-black text-base focus:outline-none" />
            </div>
          ))}
        </div>

        {isCoach && (
          <div className="pt-6 border-t border-slate-50 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-[8px] font-black text-blue-500 uppercase tracking-widest">NEUE MAKROPHASE STARTEN</h4>
              <div className="bg-blue-600 px-3 py-0.5 rounded-full text-white text-[9px] font-black">{pn.calories} kcal ziel</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[{ label: 'Ziel Prot', field: 'protein', color: 'emerald' }, { label: 'Ziel Carbs', field: 'carbs', color: 'amber' }, { label: 'Ziel Fett', field: 'fat', color: 'rose' }].map(m => (
                <div key={m.field} className="bg-blue-50/50 p-2 rounded-2xl text-center border border-blue-100/50">
                  <label className={`text-[7px] font-black text-blue-600 uppercase block mb-1`}>{m.label}</label>
                  <input type="number" value={pn[m.field as keyof Nutrition] || ''} onChange={e => upPlanned(m.field, parseInt(e.target.value) || 0)} className="w-full bg-transparent text-center font-black text-xs text-blue-700 focus:outline-none" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const NavBtn = ({ icon, label, active, onClick, hasNotification }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all relative ${active ? 'text-blue-600 bg-blue-50 font-black shadow-inner shadow-blue-100/50' : 'text-slate-400 hover:text-slate-600'}`}>
    {hasNotification && (
      <div className="absolute top-2 right-4 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white shadow-sm"></div>
    )}
    {React.cloneElement(icon, { className: 'w-5 h-5' })}
    <span className="text-[8px] uppercase tracking-tighter font-black">{label}</span>
  </button>
);

const CalendarView = ({ selectedDate, setSelectedDate, onDoubleClick, records }: any) => {
  const [view, setView] = useState(new Date(selectedDate));
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const start = (new Date(view.getFullYear(), view.getMonth(), 1).getDay() + 6) % 7;
  
  return (
    <div className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-slate-100 shadow-sm">
      <div className="flex justify-between items-center mb-8">
        <h3 className="font-black text-xl text-slate-800">{view.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-2">
          <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="p-2 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"><ChevronLeft className="w-5 h-5"/></button>
          <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="p-2 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"><ChevronRight className="w-5 h-5"/></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {['M','D','M','D','F','S','S'].map(d => <div key={d} className="text-center text-[9px] font-black text-slate-300 mb-2 uppercase">{d}</div>)}
        {Array.from({ length: 42 }).map((_, i) => {
          const dNum = i - start + 1;
          if (dNum <= 0 || dNum > days) return <div key={i} />;
          const ds = formatDate(new Date(view.getFullYear(), view.getMonth(), dNum));
          const rec = records[ds];
          const hasWorkout = rec?.workouts?.some((w: any) => w.sets.some((s: any) => s.reps > 0 || s.weight > 0));
          const hasPhotos = rec?.photos && rec.photos.some((p: string) => p && p.trim() !== '');
          const isS = ds === selectedDate;

          return (
            <button 
              key={i} 
              onClick={() => setSelectedDate(ds)} 
              onDoubleClick={() => onDoubleClick(ds)}
              className={`aspect-square rounded-2xl flex flex-col items-center justify-center text-sm font-black transition-all relative ${isS ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105 z-10' : 'text-slate-600 hover:bg-blue-50'}`}
            >
              <span className="mt-[-2px]">{dNum}</span>
              <div className="absolute bottom-1.5 flex gap-0.5">
                {hasWorkout && <Dumbbell className={`w-2 h-2 ${isS ? 'text-white' : 'text-blue-500'}`} />}
                {hasPhotos && <Camera className={`w-2 h-2 ${isS ? 'text-white' : 'text-emerald-500'}`} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ChatWindow = ({ messages, onSendMessage, title, isCoach }: any) => {
  const [t, setT] = useState('');
  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] border overflow-hidden shadow-xl">
      <div className="bg-slate-800 text-white p-5 font-black text-xs uppercase tracking-widest flex items-center justify-between">
        <span>{title}</span>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/50">
        {(messages || []).map((m: any) => (
          <div key={m.id} className={`flex ${ (isCoach ? m.senderId==='coach' : m.senderId!=='coach') ? 'justify-end':'justify-start' }`}>
            <div className={`p-4 rounded-2xl text-[11px] md:text-xs font-semibold max-w-[85%] shadow-sm leading-relaxed ${ (isCoach ? m.senderId==='coach' : m.senderId!=='coach') ? 'bg-blue-600 text-white rounded-tr-none shadow-blue-200':'bg-white text-slate-800 rounded-tl-none border border-slate-100 shadow-sm' }`}>{m.text}</div>
          </div>
        ))}
      </div>
      <div className="p-4 bg-white border-t flex gap-2">
        <input value={t} onChange={e => setT(e.target.value)} onKeyDown={e => e.key === 'Enter' && t.trim() && (onSendMessage(t), setT(''))} placeholder="Nachricht schreiben..." className="flex-1 bg-slate-50 p-4 rounded-xl focus:outline-none focus:ring-1 ring-blue-100 font-medium" />
        <button onClick={() => { if(t.trim()) { onSendMessage(t); setT(''); } }} className="bg-blue-600 text-white p-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"><Send className="w-5 h-5"/></button>
      </div>
    </div>
  );
};

const CoachInbox = ({ clients, activeClientId, onSelectClient, onSendMessage }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-12 h-full gap-4">
    <div className="md:col-span-4 bg-white rounded-[2rem] border overflow-hidden flex flex-col shadow-sm">
      <div className="p-5 bg-slate-50 border-b font-black text-xs uppercase text-slate-400 tracking-widest">Posteingang</div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {Object.values(clients).map((c: any) => (
          <button 
            key={c.id} 
            onClick={() => onSelectClient(c.id)} 
            className={`w-full p-5 text-left border-b font-black text-sm hover:bg-slate-50 transition-all flex items-center justify-between ${activeClientId === c.id ? 'bg-blue-50 text-blue-600 border-r-8 border-r-blue-600':''}`}
          >
            <span>{c.name}</span>
            {c.hasUnreadClientMsg && (
              <div className="w-2.5 h-2.5 bg-rose-500 rounded-full border border-white"></div>
            )}
          </button>
        ))}
      </div>
    </div>
    <div className="md:col-span-8">
      {activeClientId ? <ChatWindow messages={clients[activeClientId].messages || []} onSendMessage={onSendMessage} title={clients[activeClientId].name} isCoach={true} /> : <div className="h-full bg-white rounded-[2rem] border border-dashed flex items-center justify-center text-slate-300 font-black uppercase text-xs tracking-widest">Chat auswählen</div>}
    </div>
  </div>
);

const ProgressionView = ({ records, clientName, isCoach }: { records: Record<string, DayRecord>, clientName: string, isCoach: boolean }) => {
  const [viewMode, setViewMode] = useState<'charts' | 'photos'>('charts');
  const [compDate1, setCompDate1] = useState<string>('');
  const [compDate2, setCompDate2] = useState<string>('');

  const sorted = (Object.values(records) as DayRecord[]).sort((a, b) => a.date.localeCompare(b.date));
  const weights = sorted.filter(r => r.bodyWeight && r.bodyWeight > 0);
  const datesWithPhotos = sorted.filter(r => r.photos && r.photos.some(p => p && p.trim() !== '')).map(r => r.date);

  // Initialisiere Vergleichsdaten wenn Fotos vorhanden sind
  useEffect(() => {
    if (datesWithPhotos.length >= 2 && !compDate1 && !compDate2) {
      setCompDate1(datesWithPhotos[0]);
      setCompDate2(datesWithPhotos[datesWithPhotos.length - 1]);
    } else if (datesWithPhotos.length === 1 && !compDate1) {
      setCompDate1(datesWithPhotos[0]);
    }
  }, [datesWithPhotos, compDate1, compDate2]);

  const record1 = compDate1 ? records[compDate1] : null;
  const record2 = compDate2 ? records[compDate2] : null;

  const downloadPhoto = (data: string, date: string, label: string) => {
    const link = document.createElement('a');
    link.href = data;
    link.download = `Fitsheet_${date}_${label.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-10">
      <button
  onClick={createClientTest}
  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold"
>
  Client erstellen (Test)
</button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-slate-800">Fortschritt: <span className="text-blue-600">{clientName}</span></h2>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
          <button 
            onClick={() => setViewMode('charts')} 
            className={`flex-1 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'charts' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
          >
            Statistiken
          </button>
          <button 
            onClick={() => setViewMode('photos')} 
            className={`flex-1 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'photos' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
          >
            Fotovergleich
          </button>
        </div>
      </div>

      {viewMode === 'charts' ? (
        <div className="bg-white p-6 md:p-10 rounded-[3rem] shadow-sm border border-slate-100">
          <h3 className="font-black text-[10px] uppercase text-slate-400 mb-10 tracking-widest flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /> GEWICHTSVERLAUF</h3>
          <div className="h-64 flex items-end gap-3 px-2">
            {weights.slice(-14).map((r, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                <span className="text-[9px] font-black text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 px-2 py-1 rounded-md mb-2">{r.bodyWeight}kg</span>
                <div className="w-full bg-blue-500 rounded-t-xl transition-all duration-700 hover:bg-emerald-500 relative" style={{ height: `${(r.bodyWeight!/150)*100}%` }}>
                   <div className="absolute inset-x-0 bottom-full h-4 bg-blue-100/30 -mb-px rounded-t-xl opacity-0 group-hover:opacity-100"></div>
                </div>
                <span className="text-[7px] font-black text-slate-300 transform -rotate-45 mt-4 whitespace-nowrap">{new Date(r.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</span>
              </div>
            ))}
            {weights.length === 0 && (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 font-black uppercase text-xs italic gap-4">
                Keine Gewichtsdaten vorhanden <TrendingUp className="w-12 h-12 opacity-10" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-300">
          <div className="bg-blue-900 p-6 md:p-10 rounded-[2.5rem] shadow-xl text-white">
            <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
              <div className="flex flex-col gap-2 flex-1 w-full max-w-xs">
                <label className="text-[8px] font-black text-blue-300 uppercase tracking-widest">Zeitpunkt A auswählen</label>
                <select 
                  value={compDate1} 
                  onChange={e => setCompDate1(e.target.value)}
                  className="bg-blue-800 text-white font-black text-xs p-3 rounded-xl border border-blue-700 focus:outline-none"
                >
                  <option value="">Wähle Datum...</option>
                  {datesWithPhotos.map(d => (
                    <option key={d} value={d}>{new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</option>
                  ))}
                </select>
              </div>
              <ArrowLeftRight className="w-6 h-6 text-blue-400 hidden md:block" />
              <div className="flex flex-col gap-2 flex-1 w-full max-w-xs">
                <label className="text-[8px] font-black text-blue-300 uppercase tracking-widest">Zeitpunkt B auswählen</label>
                <select 
                  value={compDate2} 
                  onChange={e => setCompDate2(e.target.value)}
                  className="bg-blue-800 text-white font-black text-xs p-3 rounded-xl border border-blue-700 focus:outline-none"
                >
                  <option value="">Wähle Datum...</option>
                  {datesWithPhotos.map(d => (
                    <option key={d} value={d}>{new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {compDate1 && compDate2 ? (
            <div className="space-y-12">
              {PHOTO_LABELS.map((label, idx) => (
                <div key={idx} className="bg-white rounded-[3rem] overflow-hidden border border-slate-100 shadow-sm p-6 md:p-10">
                  <h4 className="text-center font-black text-xs md:text-sm text-slate-400 uppercase tracking-widest mb-8 border-b border-slate-50 pb-4">{label} - Direktvergleich</h4>
                  <div className="grid grid-cols-2 gap-4 md:gap-10">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-2">
                        <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase">{new Date(compDate1).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        {isCoach && record1?.photos?.[idx] && (
                          <button onClick={() => downloadPhoto(record1.photos![idx], compDate1, label)} className="p-2 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl transition-all">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="aspect-[3/4] bg-slate-50 rounded-[2rem] overflow-hidden shadow-inner border border-slate-100 group relative">
                        {record1?.photos?.[idx] ? (
                          <img src={record1.photos[idx]} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={`${label} Date 1`} />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-200 gap-2 font-black text-[9px] uppercase tracking-tighter">Kein Foto <ImageIcon className="w-10 h-10 opacity-10" /></div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-2">
                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">{new Date(compDate2).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        {isCoach && record2?.photos?.[idx] && (
                          <button onClick={() => downloadPhoto(record2.photos![idx], compDate2, label)} className="p-2 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl transition-all">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="aspect-[3/4] bg-slate-50 rounded-[2rem] overflow-hidden shadow-inner border border-slate-100 group relative">
                        {record2?.photos?.[idx] ? (
                          <img src={record2.photos[idx]} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={`${label} Date 2`} />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-200 gap-2 font-black text-[9px] uppercase tracking-tighter">Kein Foto <ImageIcon className="w-10 h-10 opacity-10" /></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-20 rounded-[3rem] border border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-6">
              <ImageIcon className="w-16 h-16 text-slate-100" />
              <div className="max-w-xs">
                <h4 className="font-black text-slate-800 text-lg uppercase tracking-tight">Fotos auswählen</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed mt-2">Wähle zwei Daten aus dem Dropdown oben aus, um die Körperveränderung im Detail zu analysieren.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
