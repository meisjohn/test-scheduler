import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { 
  Settings, ChevronLeft, ChevronRight, X, Trash2, RedoDot, 
  Search, Clock, Calendar, Download, Copy, Edit3, MapPin, 
  Lock, Unlock, FileText, Link as LinkIcon, Save, ExternalLink, Plus 
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';


const socket = io(BACKEND_URL);

const getInitialWeek = () => {
  const now = new Date();
  const target = new Date(now.valueOf());
  const dayNr = (now.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
  return `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
};

function App() {
  const [activities, setActivities] = useState([]);
  const [config, setConfig] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [placingActivity, setPlacingActivity] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentWeek, setCurrentWeek] = useState(getInitialWeek());
  const [copyFeedback, setCopyFeedback] = useState({ visible: false, x: 0, y: 0 });
  const [gridSearchTerm, setGridSearchTerm] = useState("");
  const [archiveWeeks, setArchiveWeeks] = useState(12); // Default to 3 months
  const [holidays, setHolidays] = useState([]);

  const weekDates = useMemo(() => {
    const [year, week] = currentWeek.split("-W");
    const firstDayOfYear = new Date(year, 0, 1);
    const days = (week - 1) * 7;
    const dayOffset = firstDayOfYear.getDay() - 1;
    const monday = new Date(year, 0, 1 + days - dayOffset);
    return [0, 1, 2, 3, 4, 5, 6].map(offset => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      return {
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: new Date(d) // <--- SURGICAL FIX: Ensure this is a Date object
      };
    });
  }, [currentWeek]);

  const filteredBacklog = useMemo(() => {
    return activities
      .filter(a => a.status === 'staged')
      .filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [activities, searchTerm]);

  useEffect(() => {
    fetchData();
    socket.on('reload-data', fetchData);
    return () => socket.off('reload-data');
  }, [currentWeek]);

  const fetchData = async () => {
    try {
      const res = await axios.get(BACKEND_URL + `/api/activities/${currentWeek}`);
      setActivities(res.data.activities || []);
      setConfig(res.data.config);
    } catch (err) { console.error("Fetch error:", err); }
  };

  const updateConfig = async (updates) => {
    const newConfig = { ...config, ...updates };
    await axios.put(BACKEND_URL + `/api/activities/config/${currentWeek}`, newConfig);
    socket.emit('sync-work');
    fetchData();
  };

  const deleteWeekConfig = async () => {
    if (!window.confirm("This will reset this week's strings/shifts and unstage all items. Proceed?")) return;
    try {
      await axios.delete(BACKEND_URL + `/api/activities/config/${currentWeek}`);
      socket.emit('sync-work');
      fetchData();
      setIsSettingsOpen(false);
    } catch (err) { console.error("Delete Week Error", err); }
  };

  const moveActivity = async (id, updates) => {
    if (config?.isLocked && updates.status === 'scheduled') return;
    if (updates.status === 'scheduled') updates.weekIdentifier = currentWeek;
    await axios.patch(BACKEND_URL + `/api/activities/${id}`, updates);
    socket.emit('sync-work');
    fetchData();
  };

  const createActivityDirect = async (stringName, shiftIdx, dayIdx) => {
    if (config.isLocked) return;
    const title = window.prompt("Enter activity title:");
    if (!title) return;
    await axios.post(BACKEND_URL + '/api/activities', {
      title,
      status: 'scheduled',
      weekIdentifier: currentWeek,
      testString: stringName,
      shift: shiftIdx + 1,
      order: dayIdx
    });
    socket.emit('sync-work');
    fetchData();
  };

  const deleteActivity = async (id) => {
    if (config?.isLocked) return;
    if (!window.confirm("Delete permanently?")) return;
    await axios.delete(BACKEND_URL + `/api/activities/${id}`);
    socket.emit('sync-work');
    fetchData();
    setSelectedActivity(null);
  };

  const copyActivity = async (act, e) => {
    if (e && e.clientX) {
      setCopyFeedback({ visible: true, x: e.clientX, y: e.clientY });
      setTimeout(() => setCopyFeedback(prev => ({ ...prev, visible: false })), 1000);
    }

    const { _id, createdAt, updatedAt, __v, ...clone } = act;
    
    // THE LOCK CHECK:
    // If the week is locked, the clone loses its "spot" and goes to the backlog
    if (config.isLocked) {
      clone.status = 'staged';
      clone.weekIdentifier = null;
      clone.testString = null;
      clone.shift = null;
      clone.order = null;
    } 

    await axios.post(BACKEND_URL + '/api/activities', clone);
    socket.emit('sync-work');
    fetchData();
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await axios.post(BACKEND_URL + '/api/activities', { title: newTitle, status: 'staged' });
    setNewTitle("");
    socket.emit('sync-work');
    fetchData();
  };

  const unstageItem = async (id) => {
    if (config?.isLocked) return;
    await moveActivity(id, { status: 'staged', weekIdentifier: null, testString: null, shift: null, order: null });
    setPlacingActivity(null);
    setSelectedActivity(null);
  };

  const exportToCSV = () => {
    const headers = ["Title", "Status", "String", "Shift", "Day", "Lead", "Location", "Plan"];
    const rows = activities.filter(a => a.status === 'scheduled').map(a => [
      `"${a.title}"`, a.status, a.testString, a.shift,
      weekDates[a.order]?.date, `"${a.lead || ''}"`, a.location, `"${(a.testPlan || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `TestPlan_${currentWeek}.csv`);
    link.click();
  };

  const saveAsGlobal = async () => {
    if (!window.confirm("Set this week's layout as the template for all NEW weeks?")) return;
    try {
      await axios.put(BACKEND_URL + `/api/activities/global/config`, {
        testStrings: config.testStrings,
        locations: config.locations,
        shiftConfigs: config.shiftConfigs
      });
      alert("Global Template Updated.");
    } catch (err) { console.error(err); }
  };

const exportSystemData = async () => {
    try {
      const res = await axios.get(BACKEND_URL + '/api/activities/system/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `Matrix_Backup_${new Date().toISOString().split('T')[0]}.json`);
      link.click();
    } catch (err) { alert("Export failed"); }
  };

  const importSystemData = async (e) => {
    const file = e.target.files[0];
    if (!file || !window.confirm("CRITICAL WARNING: This will DELETE all current data and replace it with this backup. Proceed?")) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        await axios.post(BACKEND_URL + '/api/activities/system/import', json);
        alert("System Restore Complete!");
        window.location.reload(); // Hard refresh to sync everything
      } catch (err) { alert("Invalid Backup File"); }
    };
    reader.readAsText(file);
  };

  const runArchiveAndPrune = async () => {
    const confirmMessage = `WARNING: This will DOWNLOAD and then PERMANENTLY DELETE all scheduled activities older than ${archiveWeeks} weeks. This cannot be undone. Proceed?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await axios.post(BACKEND_URL + '/api/activities/system/archive', {
        olderThanWeeks: archiveWeeks
      });
      
      // Download the archive file
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `Archive_OlderThan_${archiveWeeks}wks_${new Date().toISOString().split('T')[0]}.json`);
      link.click();

      alert(`Success! ${res.data.prunedCount} records archived and removed from database.`);
      fetchData(); // Refresh grid
    } catch (err) {
      alert(err.response?.data?.message || "Archive process failed.");
    }
  };

  const restoreArchiveData = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const res = await axios.post(BACKEND_URL + '/api/activities/system/restore-archive', json);
        alert(`Restore Successful!\nMerged ${res.data.activitiesRestored} activities and ${res.data.configsRestored} week configs.`);
        fetchData(); // Refresh current view
      } catch (err) {
        alert("Restore Failed: Invalid archive format.");
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // 1. Close Modals/Sidebars first
        if (selectedActivity) {
          setSelectedActivity(null);
          return;
        }
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }

        // 2. Cancel Placement/Move Mode
        if (placingActivity) {
          setPlacingActivity(null);
          return;
        }

        // 3. Clear Filters (Backlog Search then Grid Search)
        if (searchTerm !== "") {
          setSearchTerm("");
        }
        if (gridSearchTerm !== "") {
          setGridSearchTerm("");
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Cleanup the listener when the component unmounts
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedActivity, isSettingsOpen, placingActivity, searchTerm, gridSearchTerm]);

  const PALETTE = [
    'bg-blue-600 border-blue-400',
    'bg-emerald-600 border-emerald-400',
    'bg-purple-600 border-purple-400',
    'bg-orange-600 border-orange-400',
    'bg-pink-600 border-pink-400',
    'bg-cyan-600 border-cyan-400',
    'bg-indigo-600 border-indigo-400',
    'bg-amber-600 border-amber-400',
    'bg-rose-600 border-rose-400',
    'bg-lime-600 border-lime-400'
  ];

  const getLocationColor = (locName) => {
    if (!locName || locName === 'unassigned') return 'bg-slate-700 border-slate-500';
    const index = config.locations.indexOf(locName);
    // use modulo (%) so if you have 11 locations, it wraps back to the first color
    return PALETTE[index % PALETTE.length];
  };

  const checkIsToday = (dateInput) => {
    if (!dateInput) return false;
    const today = new Date();
    // Wrap dateInput in new Date() to be safe
    const cellDate = new Date(dateInput); 
    return today.toDateString() === cellDate.toDateString();
  };

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const year = currentWeek.split('-')[0];
        const res = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
        setHolidays(res.data);
      } catch (err) { console.error("Holiday fetch failed"); }
    };
    fetchHolidays();
  }, [currentWeek]);

  // Helper to check for a holiday on a specific date
  const getHoliday = (dateObj) => {
    if (!dateObj) return null;
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const day = dateObj.getDate();
    const dayOfWeek = dateObj.getDay();

    // 1. Check COMPANY HOLIDAYS first (from config)
    // Format in config: [{ name: "Company Picnic", month: 5, day: 15 }]
    const companyHoliday = config?.companyHolidays?.find(h => 
      parseInt(h.month) === month && parseInt(h.day) === day
    );
    if (companyHoliday) return { name: companyHoliday.name, isCompany: true };

    // 2. Mathematical Federal Rules (Priority)
    const getNthWeekday = (y, m, dw, n) => {
      let count = 0, d = n > 0 ? new Date(y, m, 1) : new Date(y, m + 1, 0);
      while (count < Math.abs(n)) {
        if (d.getDay() === dw) count++;
        if (count < Math.abs(n)) n > 0 ? d.setDate(d.getDate() + 1) : d.setDate(d.getDate() - 1);
      }
      return d.getDate();
    };

    if (month === 4 && dayOfWeek === 1 && day === getNthWeekday(year, 4, 1, -1)) return { name: "Memorial Day" };
    if (month === 6 && day === 4) return { name: "Independence Day" };
    if (month === 8 && dayOfWeek === 1 && day === getNthWeekday(year, 8, 1, 1)) return { name: "Labor Day" };
    if (month === 10 && dayOfWeek === 4 && day === getNthWeekday(year, 10, 4, 4)) return { name: "Thanksgiving" };

    // 3. API Fallback (with "Observed" safety)
    const found = holidays.find(h => {
      const hDate = new Date(h.date + "T00:00:00");
      return hDate.getMonth() === month && hDate.getDate() === day;
    });

    if (found) {
      // If API finds a holiday on a day that ISN'T our fixed math day, it's Observed.
      const isObserved = (found.name.includes("Independence") && day !== 4);
      return { ...found, name: isObserved ? `${found.name} (Observed)` : found.name };
    }
    return null;
  };

  if (!config) return <div className="p-20 bg-slate-900 h-screen text-white font-mono text-center">Initializing Matrix...</div>;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      
      {/* FLOAT-NOTIFICATION: Z-9999 to stay on top of modals */}
      {copyFeedback.visible && (
          <div 
            className="fixed z-[9999] pointer-events-none bg-yellow-400 text-slate-900 text-[10px] font-black px-2 py-1 rounded shadow-2xl animate-in fade-in zoom-in duration-200"
            style={{ top: copyFeedback.y - 30, left: copyFeedback.x - 20, transform: 'translate(-50%, -50%)' }}
          >
            COPIED!
          </div>
      )}

      {/* SIDEBAR */}
      <div 
        className={`w-80 bg-slate-800 border-r border-slate-700 p-4 flex flex-col shadow-2xl z-20 overflow-hidden transition-all relative ${placingActivity?.status === 'scheduled' ? 'bg-slate-750 ring-2 ring-yellow-500/20' : ''}`}
        onClick={() => { if (placingActivity?.status === 'scheduled') unstageItem(placingActivity._id); }}
      >
        {placingActivity?.status === 'scheduled' && (
            <div className="absolute inset-0 bg-yellow-500/5 z-50 pointer-events-auto flex items-center justify-center">
                <div className="bg-yellow-500 text-slate-900 px-4 py-2 rounded-full font-black text-[10px] animate-pulse uppercase">Drop to Unstage</div>
            </div>
        )}

        <div className="flex justify-between items-center mb-4" onClick={(e) => e.stopPropagation()}>
          <h2 className="font-black text-xl italic tracking-tighter uppercase">Planning</h2>
          <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400">
            <Settings size={20} className={isSettingsOpen ? "text-blue-400" : ""} />
          </button>
        </div>

        <div className="relative mb-4" onClick={(e) => e.stopPropagation()}>
          <Search size={14} className="absolute left-3 top-3 text-slate-500" />
          <input className="w-full bg-slate-900 border border-slate-700 p-2 pl-9 rounded text-xs outline-none" placeholder="Search backlog..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        {!config.isLocked && (
          <form onSubmit={handleAddActivity} className="mb-6" onClick={(e) => e.stopPropagation()}>
            <input className="w-full bg-slate-700 border border-slate-600 p-2 rounded text-sm mb-2 outline-none" placeholder="Add test..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <button type="submit" className="w-full bg-blue-600 p-2 rounded text-sm font-black transition uppercase">+ Stage</button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar" onClick={(e) => e.stopPropagation()}>
          {filteredBacklog.map(act => (
            <div 
              key={act._id} 
              title={`Lead: ${act.lead || 'None'}\nLocation: ${act.location}\nPlan: ${act.testPlan || 'No details'}\nDoc URL: ${act.docUrl || 'None'}`}
              onClick={(e) => { e.stopPropagation(); setPlacingActivity(placingActivity?._id === act._id ? null : act); }}
              onDoubleClick={() => setSelectedActivity(act)}
              className={`p-2 rounded shadow-lg text-[10px] mb-1.5 cursor-pointer border transition-all relative group 
                ${placingActivity?._id === act._id ? 'bg-yellow-500 border-yellow-400 text-slate-900 scale-105' : `${getLocationColor(act.location)} text-white`}`}
              >
              <div className="flex justify-between items-start">
                <p className="font-bold text-sm leading-tight pr-6">{act.title}</p>


                {/* HOVER ACTIONS (Slide-in/Fade-in) */}
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition bg-slate-800 rounded p-1 shadow-lg">
                    {act.docUrl && (
                        <a href={act.docUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-white p-1">
                        <ExternalLink size={14} />
                        </a>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); copyActivity(act, e); }} className="text-slate-400 hover:text-blue-400"><Copy size={12}/></button>
                    {!config.isLocked && <button onClick={(e) => { e.stopPropagation(); deleteActivity(act._id); }} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[9px] font-black uppercase text-slate-500"><MapPin size={10} /> {act.location}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
          <header className="border-b border-slate-800 bg-slate-900 flex flex-col px-8 py-4 text-white">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-6">
                    <button onClick={() => {
                        const [year, week] = currentWeek.split("-W").map(Number);
                        let nW = week - 1; let nY = year; if (nW < 1) { nW = 52; nY--; }
                        setCurrentWeek(`${nY}-W${nW.toString().padStart(2, '0')}`);
                    }} className="p-2 hover:bg-slate-800 rounded-full"><ChevronLeft size={24}/></button>
                    <div className="flex flex-col items-center">
                        <h1 className="text-2xl font-black italic tracking-tighter uppercase leading-none">WEEK {currentWeek.split('-W')[1]}</h1>
                        <button onClick={() => setCurrentWeek(getInitialWeek())} className="flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black text-blue-500 uppercase mt-1 tracking-widest hover:text-white"><RedoDot size={14}/><span> Today</span></button>
                    </div>
                    <button onClick={() => {
                        const [year, week] = currentWeek.split("-W").map(Number);
                        let nW = week + 1; let nY = year; if (nW > 52) { nW = 1; nY++; }
                        setCurrentWeek(`${nY}-W${nW.toString().padStart(2, '0')}`);
                    }} className="p-2 hover:bg-slate-800 rounded-full"><ChevronRight size={24}/></button>
                    <button onClick={() => updateConfig({ isLocked: !config.isLocked })} className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black uppercase transition-all ${config.isLocked ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}>
                        {config.isLocked ? <Lock size={14}/> : <Unlock size={14}/>} {config.isLocked ? 'Locked' : 'Open'}
                    </button>
                </div>
                <div className="flex gap-4">
                    <div className="relative group">
                        <Search size={14} className={`absolute left-3 top-2.5 ${gridSearchTerm ? 'text-blue-400' : 'text-slate-500'}`} />
                        <input 
                            className={`bg-slate-800 border h-9 pl-9 pr-12 rounded-lg text-xs outline-none transition-all w-44 focus:w-64 ${gridSearchTerm ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-slate-700'}`}
                            placeholder="Filter grid..." 
                            value={gridSearchTerm} 
                            onChange={(e) => setGridSearchTerm(e.target.value)} 
                        />
                        {gridSearchTerm && (
                            <div className="absolute right-2 top-2 flex items-center gap-1">
                                <span className="text-[8px] font-black text-slate-600 bg-slate-900 px-1 rounded border border-slate-700">ESC</span>
                                <button onClick={() => setGridSearchTerm("")} className="text-slate-500 hover:text-white"><X size={14} /></button>
                            </div>
                        )}
                    </div>
                    <button onClick={exportToCSV} className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg text-xs font-black uppercase hover:bg-slate-700">Export CSV</button>
                    {placingActivity && (
                        <div className="flex items-center gap-2">
                            <div className="text-[10px] font-black bg-yellow-500 text-slate-900 px-4 py-2 rounded-full flex items-center gap-2 animate-pulse">MOVE MODE</div>
                            <button onClick={() => setPlacingActivity(null)} className="p-2 hover:bg-slate-800 rounded-full"><X size={14}/></button>
                        </div>
                    )}
                </div>
            </div>

            {/* WEEK OBJECTIVES SUBHEADER */}
            {(config.notes || config.externalDocUrl) && (
              <div className="mt-2 flex items-center gap-4 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                {config.externalDocUrl && (
                  <a href={config.externalDocUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-400 hover:text-white transition whitespace-nowrap border-r border-slate-700 pr-4">
                    <ExternalLink size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">Master Plan</span>
                  </a>
                )}
                {config.notes && (
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText size={14} className="text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-300 italic truncate uppercase tracking-tight">{config.notes}</span>
                  </div>
                )}
              </div>
            )}
          </header>

          <main className={`flex-1 overflow-auto p-6 ${config.isLocked ? 'grayscale-[0.2]' : ''}`}>
             <table className="w-full border-separate border-spacing-0 border border-slate-700 bg-slate-800 rounded-xl overflow-hidden shadow-2xl">
              <thead>
                  <tr className="bg-slate-950">
                    <th className="p-4 border-b border-r border-slate-700 text-left text-[10px] font-black text-slate-500 uppercase w-44">Shift / String</th>
                    {weekDates.map((day, idx) => {
                      const isToday = checkIsToday(day.date);
                      const holiday = getHoliday(day.fullDate); // Pass the full Date object here
                      return (
                        <th key={idx} className={`p-4 border-b border-r border-slate-700 text-center transition-colors 
                          ${isToday ? 'bg-blue-500/10' : ''} 
                          ${holiday ? 'bg-orange-500/10' : ''}`}>
                          <div className={`text-[10px] font-black uppercase mb-1 
                            ${isToday ? 'text-blue-400' : holiday ? 'text-orange-400' : 'text-slate-500'}`}>
                            {day.label} {isToday && "• TODAY"}
                          </div>
                          <div className="text-xs font-black text-white">{day.date}</div>
                          {holiday && (
                            <div className="text-[8px] font-black text-orange-400 uppercase mt-1 truncate w-32 mx-auto" title={holiday.name}>
                              {holiday.name}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                {config.shiftConfigs.map((shift, sIdx) => (
                    <React.Fragment key={`shift-${sIdx}`}>
                    <tr className="bg-slate-900/50">
                        <td colSpan={8} className="p-2 pl-4 border-b border-slate-700">
                          <div className="flex items-center gap-2 text-blue-400 font-black text-[10px] uppercase italic tracking-widest"><Clock size={12}/> {shift.name}</div>
                        </td>
                    </tr>
                    {config.testStrings.map(stringName => (
                        <tr key={`${stringName}-${sIdx}`} className="group hover:bg-slate-750/30">
                        <td className="p-4 border-r border-b border-slate-700 bg-slate-850/30 text-[10px] font-black text-slate-300 uppercase leading-none">
                            <div className="text-[10px] font-black text-slate-300 uppercase leading-none">{stringName}</div>
                        </td>
                        {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
                            const isToday = checkIsToday(weekDates[dayIdx]?.fullDate);
                            const isHoliday = getHoliday(weekDates[dayIdx]?.fullDate);
                            return (
                                <td
                                 key={dayIdx} 
                                 className={`border-r border-b border-slate-700 p-2 h-28 w-48 align-top relative transition-all 
                                             ${isToday ? 'bg-blue-500/5' : ''}
                                             ${isHoliday ? 'bg-orange-500/5' : ''}
                                             ${placingActivity && !config.isLocked ? 'hover:bg-blue-600/20 cursor-crosshair' : ''}`}
                                 onClick={() => { 
                                      if (placingActivity && !config.isLocked) { 
                                            moveActivity(placingActivity._id, { status: 'scheduled', testString: stringName, shift: sIdx + 1, order: dayIdx }); 
                                            setPlacingActivity(null); 
                                      } else if (!placingActivity && !config.isLocked) {
                                            createActivityDirect(stringName, sIdx, dayIdx);
                                      }
                                    }}
                                >
                                {!placingActivity && !config.isLocked && 
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                                    <Plus size={20} className="text-slate-600" />
                                  </div>
                                }
                                {activities
                                  .filter(a => 
                                    a.testString === stringName && 
                                    a.shift === (sIdx + 1) && 
                                    a.order === dayIdx &&
                                    (a.title.toLowerCase().includes(gridSearchTerm.toLowerCase()) || 
                                     (a.lead && a.lead.toLowerCase().includes(gridSearchTerm.toLowerCase())) ||
                                     (a.location && a.location.toLowerCase().includes(gridSearchTerm.toLowerCase())))
                                  )
                                  .map(act => (
                                    <div 
                                    key={act._id} 
                                    title={`Lead: ${act.lead || 'None'}\nLocation: ${act.location}\nPlan: ${act.testPlan || 'No details'}\nDoc URL: ${act.docUrl || 'None'}`}
                                    onClick={(e) => { e.stopPropagation(); if(!config.isLocked) setPlacingActivity(placingActivity?._id === act._id ? null : act); }} 
                                    onDoubleClick={(e) => { e.stopPropagation(); setSelectedActivity(act); }}
                                    className={`p-2 rounded shadow-lg text-[10px] mb-1.5 cursor-pointer border transition-all relative group ${placingActivity?._id === act._id ? 'bg-yellow-500 border-yellow-400 text-slate-900' : `${getLocationColor(act.location)} text-white`}`}
                                    >
                                        {/* HOVER ACTIONS (Overlays static icons when moused over) */}
                                        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-800 rounded pl-1 shadow-md">
                                            {act.docUrl && (
                                                <a href={act.docUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-white/80 hover:text-white p-0.5">
                                                <ExternalLink size={12} />
                                                </a>
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); copyActivity(act, e); }} className="hover:text-yellow-400 p-0.5"><Copy size={10}/></button>
                                            {!config.isLocked && <button onClick={(e) => { e.stopPropagation(); unstageItem(act._id); }} className="hover:text-orange-400 p-0.5"><X size={10}/></button>}
                                        </div>
                                        <div className="font-bold truncate pr-4">{act.title}</div>
                                        <div className="flex justify-between items-center mt-1 text-[8px] font-black uppercase opacity-70">
                                            <span>{act.lead || 'TBD'}</span>
                                            <span className="bg-black/20 px-1 rounded">{act.location}</span>
                                        </div>
                                    </div>
                                ))}
                                </td>
                            );
                        })}
                        </tr>
                    ))}
                    </React.Fragment>
                ))}
                </tbody>
            </table>
          </main>
      </div>

      {/* PLAN MODAL */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-start mb-6 border-b border-slate-700 pb-4">
                <div className="flex-1 mr-4">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-blue-400">Activity Title</label>
                   <input disabled={config.isLocked} className="w-full bg-transparent text-2xl font-black text-white italic tracking-tighter uppercase outline-none focus:text-blue-400 transition" value={selectedActivity.title} onChange={(e) => setSelectedActivity({...selectedActivity, title: e.target.value})} />
                </div>
                <div className="flex gap-2">
                   <button onClick={(e) => copyActivity(selectedActivity, e)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400" title="Copy Activity"><Copy size={20}/></button>
                   {!config.isLocked && <button onClick={() => deleteActivity(selectedActivity._id)} className="p-2 hover:bg-slate-700 rounded-full text-red-400" title="Delete Activity"><Trash2 size={20}/></button>}
                   <button onClick={() => setSelectedActivity(null)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400"><X size={24} /></button>
                </div>
             </div>
             <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                   <label className="text-[9px] font-black text-slate-500 uppercase">Team Lead</label>
                   <input disabled={config.isLocked} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm outline-none" value={selectedActivity.lead || ''} placeholder="Assign name..." onChange={(e) => setSelectedActivity({...selectedActivity, lead: e.target.value})} />
                </div>
                <div>
                   <label className="text-[9px] font-black text-slate-500 uppercase">Document URL</label>
                   <input disabled={config.isLocked} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm outline-none text-blue-400" value={selectedActivity.docUrl || ''} placeholder="Link..." onChange={(e) => setSelectedActivity({...selectedActivity, docUrl: e.target.value})} />
                </div>
                <div>
                   <label className="text-[9px] font-black text-slate-500 uppercase">Environment / Location</label>
                   <select disabled={config.isLocked} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm outline-none" value={selectedActivity.location} onChange={(e) => setSelectedActivity({...selectedActivity, location: e.target.value})}>
                      <option value="unassigned">CHOOSE...</option>
                      {config.locations?.map((l, idx) => <option key={idx} value={l}>{l.toUpperCase()}</option>)}
                   </select>
                </div>
             </div>
             <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-blue-400">Test Plan / Steps</label>
             <textarea disabled={config.isLocked} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-sm h-64 font-mono outline-none mt-1 custom-scrollbar" value={selectedActivity.testPlan || ''} placeholder="Markdown supported..." onChange={(e) => setSelectedActivity({...selectedActivity, testPlan: e.target.value})} />
             <div className="flex justify-between items-center mt-8">
                {selectedActivity.status === 'scheduled' && !config.isLocked && (
                    <button onClick={() => unstageItem(selectedActivity._id)} className="text-orange-500 text-[10px] font-black uppercase tracking-widest underline underline-offset-4 hover:text-orange-400">Return to Backlog</button>
                )}
                <div className="flex gap-4 ml-auto">
                    <button onClick={() => setSelectedActivity(null)} className="px-6 py-2 text-sm font-bold text-slate-400 hover:text-white">
                        Discard
                    </button>
                    
                    <button 
                        onClick={() => { 
                            if (config.isLocked) {
                                // If locked, save the edits but move it out of the grid
                                const movedAct = { 
                                    ...selectedActivity, 
                                    status: 'staged', 
                                    weekIdentifier: null, 
                                    testString: null, 
                                    shift: null, 
                                    order: null 
                                };
                                moveActivity(selectedActivity._id, movedAct);
                            } else {
                                moveActivity(selectedActivity._id, selectedActivity);
                            }
                            setSelectedActivity(null); 
                        }} 
                        className="bg-blue-600 hover:bg-blue-500 px-10 py-2 rounded-lg font-black text-sm uppercase tracking-widest transition shadow-lg shadow-blue-900/40"
                    >
                        {config.isLocked ? 'Save to Backlog' : 'Save Plan'}
                    </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* CONFIGURATION SIDEBAR */}
      {isSettingsOpen && (
          <div className="absolute top-0 right-0 w-96 bottom-0 bg-slate-800 border-l border-slate-700 shadow-2xl p-6 z-30 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-6 text-white">
              <h3 className="font-black italic text-blue-400 uppercase tracking-tighter">Week Config</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-8 custom-scrollbar">
              <section className="space-y-4">
                 <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Master Week URL</label>
                    <input className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-xs mt-1 text-blue-400 outline-none" value={config.externalDocUrl || ''} onChange={(e) => setConfig({...config, externalDocUrl: e.target.value})} placeholder="Link to documentation..." />
                 </div>
                 <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Week Notes (Shared)</label>
                    <textarea className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-xs mt-1 h-32 font-mono outline-none text-white" value={config.notes || ''} onChange={(e) => setConfig({...config, notes: e.target.value})} placeholder="Shared goals..." />
                 </div>
                 <button onClick={() => updateConfig(config)} className="w-full bg-slate-700 py-2 rounded font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-blue-600 transition tracking-widest text-white"><Save size={14}/> Save Metadata</button>
              </section>
              <section className="border-t border-slate-700 pt-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Test Strings</label>
                  {!config.isLocked && <button onClick={() => updateConfig({ testStrings: [...config.testStrings, "New String"] })} className="text-[10px] font-black text-blue-400 tracking-widest">+ ADD</button>}
                </div>
                {config.testStrings.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2 group">
                    <input disabled={config.isLocked} className="flex-1 bg-slate-900 border border-slate-700 p-2 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 text-white" value={s} onChange={(e) => setConfig({...config, testStrings: config.testStrings.map((str, idx) => idx === i ? e.target.value : str)})} onBlur={() => updateConfig({ testStrings: config.testStrings })} />
                    {!config.isLocked && <button className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100" onClick={() => updateConfig({ testStrings: config.testStrings.filter((_, idx) => idx !== i) })}><Trash2 size={14}/></button>}
                  </div>
                ))}
              </section>
              <section className="border-t border-slate-700 pt-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Locations</label>
                  <button onClick={() => updateConfig({ locations: [...config.locations, "New Location"] })} className="text-[10px] font-black text-blue-400 tracking-widest">+ ADD</button>
                </div>
                {config.locations.map((loc, i) => (
                  <div key={i} className="flex gap-2 mb-2 group">
                    <input disabled={config.isLocked} className="flex-1 bg-slate-900 border border-slate-700 p-2 rounded text-xs outline-none text-white" value={loc} onChange={(e) => setConfig({...config, locations: config.locations.map((l, idx) => idx === i ? e.target.value : l)})} onBlur={() => updateConfig({ locations: config.locations })} />
                    {!config.isLocked && <button className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100" onClick={() => updateConfig({ locations: config.locations.filter((_, idx) => idx !== i) })}><Trash2 size={14}/></button>}
                  </div>
                ))}
              </section>
              <section className="border-t border-slate-700 pt-6 mt-6">
                <button onClick={saveAsGlobal} className="w-full bg-blue-600/20 text-blue-400 border border-blue-600/50 py-3 rounded font-black text-[10px] uppercase hover:bg-blue-600 hover:text-white transition tracking-widest flex items-center justify-center gap-2 mb-4">
                    <Save size={14} /> Promote to Global Template
                </button>
                
                <button onClick={deleteWeekConfig} className="w-full bg-red-900/20 text-red-500 border border-red-900/50 py-3 rounded font-black text-[10px] uppercase hover:bg-red-900 hover:text-white transition tracking-widest flex items-center justify-center gap-2">
                    <Trash2 size={14} /> Reset to Global Template
                </button>
              </section>
            </div>
            <section className="border-t border-slate-700 pt-6">
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-black text-slate-500 uppercase">Company Holidays</label>
                <button 
                  onClick={() => updateConfig({ companyHolidays: [...(config.companyHolidays || []), { name: "New Holiday", month: 0, day: 1 }] })}
                  className="text-[10px] font-black text-blue-400 tracking-widest">+ ADD</button>
              </div>
              {(config.companyHolidays || []).map((h, i) => (
                <div key={i} className="flex gap-1 mb-2">
                  <input className="flex-1 bg-slate-900 border border-slate-700 p-1 rounded text-[10px] text-white outline-none" 
                    value={h.name} onChange={(e) => {
                      const next = [...config.companyHolidays]; next[i].name = e.target.value; setConfig({...config, companyHolidays: next});
                    }} onBlur={() => updateConfig({ companyHolidays: config.companyHolidays })} />
                  <select className="bg-slate-900 border border-slate-700 p-1 rounded text-[10px] text-white outline-none"
                    value={h.month} onChange={(e) => {
                      const next = [...config.companyHolidays]; next[i].month = e.target.value; setConfig({...config, companyHolidays: next});
                    }} onBlur={() => updateConfig({ companyHolidays: config.companyHolidays })}>
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, mi) => <option key={mi} value={mi}>{m}</option>)}
                  </select>
                  <input type="number" className="w-10 bg-slate-900 border border-slate-700 p-1 rounded text-[10px] text-white outline-none text-center" 
                    value={h.day} onChange={(e) => {
                      const next = [...config.companyHolidays]; next[i].day = e.target.value; setConfig({...config, companyHolidays: next});
                    }} onBlur={() => updateConfig({ companyHolidays: config.companyHolidays })} />
                  <button className="text-slate-600 hover:text-red-500" onClick={() => updateConfig({ companyHolidays: config.companyHolidays.filter((_, idx) => idx !== i) })}><Trash2 size={12}/></button>
                </div>
              ))}
            </section>
            <section className="border-t border-slate-700 pt-6 mt-10">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">System Maintenance</label>
                <div className="flex flex-col gap-2">
                    <button onClick={exportSystemData} className="w-full bg-slate-700 hover:bg-slate-600 py-2 rounded font-black text-[10px] uppercase flex items-center justify-center gap-2 transition">
                        <Download size={14}/> Export System Backup (.json)
                    </button>
                    
                    <label className="w-full bg-slate-900 border border-slate-700 hover:border-blue-500 py-2 rounded font-black text-[10px] uppercase flex items-center justify-center gap-2 cursor-pointer transition text-slate-400">
                        <Save size={14}/> Import System Backup
                        <input type="file" className="hidden" accept=".json" onChange={importSystemData} />
                    </label>
                </div>
            </section>
            <section className="border-t border-red-900/30 pt-6 mt-6 bg-red-900/5 p-4 rounded-lg">
                <label className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-2">Prune & Archive</label>
                <p className="text-[9px] text-slate-500 uppercase mb-4 leading-tight">
                  Move old scheduled tests to a JSON file and delete them from the live database.
                </p>
                
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] text-slate-400 uppercase font-black whitespace-nowrap">Older than</span>
                    <input 
                        type="number" 
                        className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-center text-white outline-none focus:border-red-500"
                        value={archiveWeeks}
                        onChange={(e) => setArchiveWeeks(e.target.value)}
                    />
                    <span className="text-[10px] text-slate-400 uppercase font-black">Weeks</span>
                </div>

                <button 
                    onClick={runArchiveAndPrune}
                    className="w-full bg-red-600/10 text-red-500 border border-red-600/30 py-2 rounded font-black text-[10px] uppercase hover:bg-red-600 hover:text-white transition tracking-widest flex items-center justify-center gap-2"
                >
                    <FileText size={14}/> Run Archive & Prune
                </button>
            </section>
            <section className="border-t border-red-900/30 pt-6 mt-6 bg-red-900/5 p-4 rounded-lg">
                <label className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-2">Prune & Archive</label>
                <p className="text-[9px] text-slate-500 uppercase mb-4 leading-tight">
                  Manage long-term storage by moving old data to local files.
                </p>
                
                <div className="mt-4 pt-4 border-t border-red-900/20">
                    <label className="w-full bg-slate-800 border border-slate-700 hover:border-blue-500 py-2 rounded font-black text-[10px] uppercase flex items-center justify-center gap-2 cursor-pointer transition text-blue-400">
                        <Edit3 size={14}/> Restore from Archive File
                        <input type="file" className="hidden" accept=".json" onChange={restoreArchiveData} />
                    </label>
                    <p className="text-[8px] text-slate-500 uppercase mt-2 text-center">
                      Note: This merges data into your current database without overwriting global settings.
                    </p>
                </div>
            </section>
          </div>
      )}
    </div>
  );
}

export default App;