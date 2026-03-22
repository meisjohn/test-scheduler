import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { 
  Settings, ChevronLeft, ChevronRight, X, Trash2, ArrowLeftCircle, 
  Search, Clock, Calendar, Download, Copy, Edit3, MapPin, 
  Lock, Unlock, FileText, Link as LinkIcon, Save, ExternalLink 
} from 'lucide-react';

const socket = io('http://localhost:5000');

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
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

  useEffect(() => {
    if (selectedActivity || isSettingsOpen) setPlacingActivity(null);
  }, [selectedActivity, isSettingsOpen]);

  const fetchData = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/api/activities/${currentWeek}`);
      setActivities(res.data.activities || []);
      setConfig(res.data.config);
    } catch (err) { console.error("Fetch error:", err); }
  };

  const updateConfig = async (updates) => {
    const newConfig = { ...config, ...updates };
    await axios.put(`http://localhost:5000/api/activities/config/${currentWeek}`, newConfig);
    socket.emit('sync-work');
    fetchData();
  };

  const moveActivity = async (id, updates) => {
    if (config?.isLocked && updates.status === 'scheduled') return;
    if (updates.status === 'scheduled') updates.weekIdentifier = currentWeek;
    await axios.patch(`http://localhost:5000/api/activities/${id}`, updates);
    socket.emit('sync-work');
    fetchData();
  };

  const deleteActivity = async (id) => {
    if (config?.isLocked) return;
    if (!window.confirm("Delete permanently?")) return;
    await axios.delete(`http://localhost:5000/api/activities/${id}`);
    socket.emit('sync-work');
    fetchData();
    setSelectedActivity(null);
  };

  const copyActivity = async (act) => {
    const { _id, createdAt, updatedAt, __v, ...clone } = act;
    clone.title = `${clone.title} (Copy)`;
    clone.status = 'staged'; 
    await axios.post('http://localhost:5000/api/activities', clone);
    socket.emit('sync-work');
    fetchData();
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await axios.post('http://localhost:5000/api/activities', { title: newTitle, status: 'staged' });
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

  if (!config) return <div className="p-20 bg-slate-900 h-screen text-white font-mono text-center">Initializing Matrix...</div>;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      
      {/* SIDEBAR: GLOBAL BACKLOG */}
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
              className={`p-3 border-2 rounded-lg cursor-pointer transition-all relative group ${placingActivity?._id === act._id ? 'border-yellow-400 bg-yellow-400/10 scale-105 shadow-lg' : 'border-slate-700 bg-slate-750 hover:border-slate-500'}`}
            >
              <div className="flex justify-between items-start">
                <p className="font-bold text-sm leading-tight pr-6">{act.title}</p>
                {!config.isLocked && <Trash2 size={12} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-500" onClick={(e) => { e.stopPropagation(); deleteActivity(act._id); }} />}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[9px] font-black uppercase text-slate-500">
                <MapPin size={10} /> {act.location}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
          <header className="h-20 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-8 text-white">
            <div className="flex items-center gap-6">
                <button onClick={() => {
                  const [year, week] = currentWeek.split("-W").map(Number);
                  let nW = week - 1; let nY = year; if (nW < 1) { nW = 52; nY--; }
                  setCurrentWeek(`${nY}-W${nW.toString().padStart(2, '0')}`);
                }} className="p-2 hover:bg-slate-800 rounded-full"><ChevronLeft size={24}/></button>
                
                <div className="flex flex-col items-center">
                    <h1 className="text-2xl font-black italic tracking-tighter uppercase leading-none">WEEK {currentWeek.split('-W')[1]}</h1>
                    <button onClick={() => setCurrentWeek(getInitialWeek())} className="text-[10px] font-black text-blue-500 uppercase mt-1 tracking-widest">Today</button>
                </div>

                <button onClick={() => {
                  const [year, week] = currentWeek.split("-W").map(Number);
                  let nW = week + 1; let nY = year; if (nW > 52) { nW = 1; nY++; }
                  setCurrentWeek(`${nY}-W${nW.toString().padStart(2, '0')}`);
                }} className="p-2 hover:bg-slate-800 rounded-full"><ChevronRight size={24}/></button>
                
                <button 
                  onClick={() => updateConfig({ isLocked: !config.isLocked })}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black uppercase transition-all ${config.isLocked ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}
                >
                  {config.isLocked ? <Lock size={14}/> : <Unlock size={14}/>} {config.isLocked ? 'Locked' : 'Open'}
                </button>
            </div>

            <div className="flex gap-4">
                <button onClick={exportToCSV} className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg text-xs font-black uppercase hover:bg-slate-700">Export CSV</button>
                {placingActivity && (
                    <div className="flex items-center gap-2">
                        <div className="text-[10px] font-black bg-yellow-500 text-slate-900 px-4 py-2 rounded-full flex items-center gap-2">
                            <ArrowLeftCircle size={14} className="animate-pulse" /> MOVE MODE
                        </div>
                        <button onClick={() => setPlacingActivity(null)}><X size={14}/></button>
                    </div>
                )}
            </div>
          </header>

          <main className={`flex-1 overflow-auto p-6 ${config.isLocked ? 'grayscale-[0.2]' : ''}`}>
             <table className="w-full border-separate border-spacing-0 border border-slate-700 bg-slate-800 rounded-xl overflow-hidden shadow-2xl">
                <thead>
                    <tr className="bg-slate-950">
                        <th className="p-4 border-b border-r border-slate-700 text-left text-[10px] font-black text-slate-500 uppercase w-44">Shift / String</th>
                        {weekDates.map((day, idx) => (
                            <th key={idx} className="p-4 border-b border-r border-slate-700 text-center">
                                <div className="text-[10px] font-black text-slate-500 uppercase mb-1">{day.label}</div>
                                <div className="text-xs font-black text-white">{day.date}</div>
                            </th>
                        ))}
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
                        <tr key={`${stringName}-${sIdx}`} className="group hover:bg-slate-750/30 transition-colors">
                        <td className="p-4 border-r border-b border-slate-700 bg-slate-850/30">
                            <div className="text-[10px] font-black text-slate-300 uppercase leading-none">{stringName}</div>
                        </td>
                        {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => (
                            <td key={dayIdx} className={`border-r border-b border-slate-700 p-2 h-28 w-48 align-top transition-all relative ${placingActivity && !config.isLocked ? 'bg-blue-600/10 cursor-crosshair hover:bg-blue-600/30' : 'bg-transparent'}`}
                                onClick={() => { if (placingActivity && !config.isLocked) { moveActivity(placingActivity._id, { status: 'scheduled', testString: stringName, shift: sIdx + 1, order: dayIdx }); setPlacingActivity(null); } }}
                            >
                            {activities.filter(a => a.testString === stringName && a.shift === (sIdx + 1) && a.order === dayIdx).map(act => (
                                <div key={act._id} 
                                  title={`Lead: ${act.lead || 'None'}\nLocation: ${act.location}\nPlan: ${act.testPlan || 'No details'}\nDoc URL: ${act.docUrl || 'None'}`}
                                  onClick={(e) => { e.stopPropagation(); if(!config.isLocked) setPlacingActivity(placingActivity?._id === act._id ? null : act); }} 
                                  onDoubleClick={(e) => { e.stopPropagation(); setSelectedActivity(act); }}
                                  className={`p-2 rounded shadow-lg text-[10px] mb-1.5 cursor-pointer border transition-all ${placingActivity?._id === act._id ? 'bg-yellow-500 border-yellow-400 text-slate-900' : 'bg-blue-700 border-blue-500 text-white'}`}
                                >
                                <div className="font-bold truncate">{act.title}</div>
                                <div className="flex justify-between items-center mt-1 text-[8px] font-black uppercase opacity-70">
                                  <span>{act.lead || 'TBD'}</span>
                                  <span className="bg-black/20 px-1 rounded">{act.location}</span>
                                </div>
                                </div>
                            ))}
                            </td>
                        ))}
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
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl p-8 shadow-2xl">
             <div className="flex justify-between items-start mb-6 border-b border-slate-700 pb-4">
                <div className="flex-1 mr-4">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-blue-400">Activity Title</label>
                   <input 
                      disabled={config.isLocked}
                      className="w-full bg-transparent text-2xl font-black text-white italic tracking-tighter uppercase outline-none"
                      value={selectedActivity.title}
                      onChange={(e) => setSelectedActivity({...selectedActivity, title: e.target.value})}
                   />
                </div>
                <div className="flex gap-2">
                   {!config.isLocked && <button onClick={() => copyActivity(selectedActivity)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400" title="Copy Activity"><Copy size={20}/></button>}
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
             <textarea disabled={config.isLocked} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-sm h-64 font-mono outline-none mt-1" value={selectedActivity.testPlan || ''} placeholder="Markdown supported..." onChange={(e) => setSelectedActivity({...selectedActivity, testPlan: e.target.value})} />
             <div className="flex justify-between items-center mt-8">
                {selectedActivity.status === 'scheduled' && !config.isLocked && (
                    <button onClick={() => unstageItem(selectedActivity._id)} className="text-orange-500 text-[10px] font-black uppercase tracking-widest underline underline-offset-4">Return to Backlog</button>
                )}
                <div className="flex gap-4 ml-auto">
                    <button onClick={() => setSelectedActivity(null)} className="px-6 py-2 text-sm font-bold text-slate-400">Discard</button>
                    {!config.isLocked && <button onClick={() => { moveActivity(selectedActivity._id, selectedActivity); setSelectedActivity(null); }} className="bg-blue-600 hover:bg-blue-500 px-10 py-2 rounded-lg font-black text-sm uppercase tracking-widest">Save Plan</button>}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* CONFIGURATION SIDEBAR */}
      {isSettingsOpen && (
          <div className="absolute top-0 right-0 w-96 bottom-0 bg-slate-800 border-l border-slate-700 shadow-2xl p-6 z-30 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black italic text-blue-400 uppercase tracking-tighter">Week Config</h3>
              <button onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-8 custom-scrollbar">
              <section className="space-y-4">
                 <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Master Week URL</label>
                    <input className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-xs mt-1 text-blue-400 outline-none" value={config.externalDocUrl || ''} onChange={(e) => setConfig({...config, externalDocUrl: e.target.value})} placeholder="Link to documentation..." />
                 </div>
                 <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Week Notes (Shared)</label>
                    <textarea className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-xs mt-1 h-32 font-mono outline-none" value={config.notes || ''} onChange={(e) => setConfig({...config, notes: e.target.value})} placeholder="Shared goals..." />
                 </div>
                 <button onClick={() => updateConfig(config)} className="w-full bg-slate-700 py-2 rounded font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-blue-600 transition tracking-widest"><Save size={14}/> Save Metadata</button>
              </section>

              <section className="border-t border-slate-700 pt-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Test Strings</label>
                  {!config.isLocked && <button onClick={() => updateConfig({ testStrings: [...config.testStrings, "New String"] })} className="text-[10px] font-black text-blue-400 tracking-widest">+ ADD</button>}
                </div>
                {config.testStrings.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2 group">
                    <input disabled={config.isLocked} className="flex-1 bg-slate-900 border border-slate-700 p-2 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500" 
                      value={s} 
                      onChange={(e) => {
                        const next = [...config.testStrings]; next[i] = e.target.value; setConfig({...config, testStrings: next});
                      }}
                      onBlur={(e) => { 
                        const next = [...config.testStrings]; next[i] = e.target.value; updateConfig({ testStrings: next });
                      }}
                    />
                    {!config.isLocked && <button className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100" onClick={() => {
                       const next = config.testStrings.filter((_, idx) => idx !== i); updateConfig({ testStrings: next });
                    }}><Trash2 size={14}/></button>}
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
                    <input disabled={config.isLocked} className="flex-1 bg-slate-900 border border-slate-700 p-2 rounded text-xs outline-none" 
                      value={loc}
                      onChange={(e) => {
                        const next = [...config.locations]; next[i] = e.target.value; setConfig({...config, locations: next});
                      }}
                      onBlur={(e) => {
                        const next = [...config.locations]; next[i] = e.target.value; updateConfig({ locations: next });
                      }}
                    />
                    {!config.isLocked && <button className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100" onClick={() => {
                       const next = config.locations.filter((_, idx) => idx !== i); updateConfig({ locations: next });
                    }}><Trash2 size={14}/></button>}
                  </div>
                ))}
              </section>
            </div>
          </div>
      )}
    </div>
  );
}

export default App;