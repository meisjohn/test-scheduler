import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { Settings, ChevronLeft, ChevronRight, X, Calendar, Edit2, Trash2 } from 'lucide-react';

const socket = io('http://localhost:5000');

function App() {
  const [activities, setActivities] = useState([]);
  const [config, setConfig] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [placingActivity, setPlacingActivity] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [currentWeek, setCurrentWeek] = useState("2026-W12");

  // Helper: Calculate dates for the header based on ISO Week
  const weekDates = useMemo(() => {
    const [year, week] = currentWeek.split("-W");
    const firstDayOfYear = new Date(year, 0, 1);
    const days = (week - 1) * 7;
    const dayOffset = firstDayOfYear.getDay() - 1; // Adjust for Monday start
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

  useEffect(() => {
    fetchData();
    socket.on('reload-data', fetchData);
    return () => socket.off('reload-data');
  }, [currentWeek]);

  const fetchData = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/api/activities/${currentWeek}`);
      setActivities(res.data.activities || []);
      setConfig(res.data.config);
    } catch (err) { console.error("Fetch error:", err); }
  };

  const moveActivity = async (id, updates) => {
    await axios.patch(`http://localhost:5000/api/activities/${id}`, updates);
    socket.emit('sync-work');
    fetchData();
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await axios.post('http://localhost:5000/api/activities', {
      title: newTitle, weekIdentifier: currentWeek
    });
    setNewTitle("");
    socket.emit('sync-work');
    fetchData();
  };

  const updateConfig = async (newConfig) => {
    // This calls the PUT route we discussed for auto-unstaging
    await axios.put(`http://localhost:5000/api/activities/config/${currentWeek}`, newConfig);
    socket.emit('sync-work');
    fetchData();
  };

  if (!config) return <div className="p-20 bg-slate-900 h-screen text-white font-mono">Initializing Matrix...</div>;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      
      {/* SIDEBAR: PLANNING */}
      <div className="w-80 bg-slate-800 border-r border-slate-700 p-4 flex flex-col shadow-2xl z-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-black text-xl italic tracking-tighter">PLANNING LIST</h2>
          <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 hover:bg-slate-700 rounded-full transition">
            <Settings size={20} className={isSettingsOpen ? "text-blue-400" : "text-slate-400"} />
          </button>
        </div>

        {placingActivity && (
          <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500 rounded-lg flex justify-between items-center animate-pulse">
            <span className="text-xs font-bold text-yellow-500 uppercase">Moving: {placingActivity.title}</span>
            <button onClick={() => setPlacingActivity(null)}><X size={14} className="text-yellow-500" /></button>
          </div>
        )}

        <form onSubmit={handleAddActivity} className="mb-6">
          <input 
            className="w-full bg-slate-700 border border-slate-600 p-2 rounded text-sm mb-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            placeholder="New test objective..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 p-2 rounded text-sm font-black transition">
            + STAGE OBJECTIVE
          </button>
        </form>

        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
          {activities.filter(a => a.status === 'staged').map(act => (
            <div 
              key={act._id} 
              onClick={() => setPlacingActivity(act)}
              className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${placingActivity?._id === act._id ? 'border-yellow-400 bg-yellow-400/10 scale-105 shadow-lg' : 'border-slate-700 bg-slate-750 hover:border-slate-500'}`}
            >
              <p className="font-bold text-sm">{act.title}</p>
              <p className="text-[10px] uppercase font-black text-slate-500 mt-1 tracking-widest">Unscheduled</p>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        {/* TOP NAV */}
        <header className="h-20 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-slate-800 rounded text-slate-400"><ChevronLeft size={24} /></button>
            <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2">
              <Calendar size={24} className="text-blue-500" />
              {currentWeek}
            </h1>
            <button className="p-2 hover:bg-slate-800 rounded text-slate-400"><ChevronRight size={24} /></button>
          </div>
          <div className="text-[10px] font-black uppercase text-slate-500 bg-slate-800 px-3 py-1 rounded-full tracking-widest border border-slate-700">
            Collaborative Mode Active
          </div>
        </header>

        {/* THE GRID */}
        <main className="flex-1 overflow-auto p-6 bg-slate-900">
          <table className="w-full border-separate border-spacing-0 border border-slate-700 bg-slate-800 rounded-xl overflow-hidden shadow-2xl">
            <thead>
              <tr className="bg-slate-950">
                <th className="p-4 border-b border-r border-slate-700 text-left text-[10px] font-black text-slate-500 uppercase w-44">Resource / Shift</th>
                {weekDates.map((day, idx) => (
                  <th key={idx} className="p-4 border-b border-r border-slate-700 text-center">
                    <div className="text-[10px] font-black text-slate-500 uppercase">{day.label}</div>
                    <div className="text-sm font-black text-white">{day.date}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.testStrings.map((stringName, strIdx) => (
                <React.Fragment key={stringName}>
                  {config.shiftConfigs.map((shift, sIdx) => (
                    <tr key={`${stringName}-${sIdx}`}>
                      <td className="p-4 border-r border-b border-slate-700 bg-slate-850/50 sticky left-0 z-10">
                        <div className="text-[10px] font-black text-slate-500 uppercase leading-none mb-1">{stringName}</div>
                        <div className={`text-xs font-black leading-none ${sIdx === 0 ? 'text-blue-400' : 'text-orange-400'}`}>{shift.name}</div>
                        <div className="text-[9px] text-slate-500 mt-1 font-mono">{shift.startTime} - {shift.endTime}</div>
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => (
                        <td 
                          key={dayIdx} 
                          className={`border-r border-b border-slate-700 p-2 h-36 w-48 align-top transition-all relative group
                            ${placingActivity ? 'bg-blue-600/10 cursor-crosshair hover:bg-blue-600/30' : 'bg-slate-800/40 hover:bg-slate-750/50'}`}
                          onClick={() => {
                            if (placingActivity) {
                              moveActivity(placingActivity._id, {
                                status: 'scheduled',
                                testString: stringName,
                                shift: sIdx + 1,
                                order: dayIdx
                              });
                              setPlacingActivity(null);
                            }
                          }}
                        >
                          {activities.filter(a => a.testString === stringName && a.shift === (sIdx + 1) && a.order === dayIdx).map(act => (
                            <div 
                              key={act._id}
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                // Clicking a scheduled item lets you "pick it up" for fluid move
                                if (!placingActivity) {
                                  setPlacingActivity(act);
                                } else {
                                  setSelectedActivity(act);
                                }
                              }}
                              onDoubleClick={(e) => { e.stopPropagation(); setSelectedActivity(act); }}
                              className="bg-blue-600 p-2 rounded-lg shadow-lg text-[11px] mb-2 cursor-pointer border border-blue-400 hover:scale-105 transition-transform group-relative"
                            >
                              <div className="font-bold truncate text-white">{act.title}</div>
                              <div className="flex justify-between items-center mt-1 text-[9px] font-black uppercase text-blue-100/70">
                                <span>{act.lead || 'TBD'}</span>
                                <span className="bg-blue-900/40 px-1 rounded">{act.location}</span>
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

        {/* MANAGE WEEK CONFIG PANEL (The Slide-out) */}
        {isSettingsOpen && (
          <div className="absolute top-20 right-0 w-96 bottom-0 bg-slate-800 border-l border-slate-700 shadow-2xl p-6 z-30 animate-slide-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black italic text-blue-400 uppercase tracking-tighter">Week Configuration</h3>
              <button onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Test Strings</label>
                {config.testStrings.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input className="flex-1 bg-slate-900 border border-slate-700 p-1.5 rounded text-xs" value={s} 
                      onChange={(e) => {
                        const next = [...config.testStrings];
                        next[i] = e.target.value;
                        updateConfig({...config, testStrings: next});
                      }}
                    />
                    <button className="text-red-500 hover:text-red-400 p-1" onClick={() => {
                       const next = config.testStrings.filter((_, idx) => idx !== i);
                       updateConfig({...config, testStrings: next});
                    }}><Trash2 size={16} /></button>
                  </div>
                ))}
                <button className="text-[10px] font-bold text-blue-500 mt-2" onClick={() => updateConfig({...config, testStrings: [...config.testStrings, "New String"]})}>+ ADD STRING</button>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Shifts</label>
                {config.shiftConfigs.map((s, i) => (
                  <div key={i} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 mb-2 space-y-2">
                    <input className="w-full bg-slate-900 border border-slate-700 p-1 rounded text-xs font-bold" value={s.name} onChange={(e) => {
                        const next = [...config.shiftConfigs];
                        next[i].name = e.target.value;
                        updateConfig({...config, shiftConfigs: next});
                    }}/>
                    <div className="flex gap-2 text-[10px]">
                      <input type="time" className="bg-slate-900 p-1 rounded border border-slate-700 flex-1" value={s.startTime} onChange={(e) => {
                        const next = [...config.shiftConfigs];
                        next[i].startTime = e.target.value;
                        updateConfig({...config, shiftConfigs: next});
                      }}/>
                      <input type="time" className="bg-slate-900 p-1 rounded border border-slate-700 flex-1" value={s.endTime} onChange={(e) => {
                        const next = [...config.shiftConfigs];
                        next[i].endTime = e.target.value;
                        updateConfig({...config, shiftConfigs: next});
                      }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EDIT ACTIVITY MODAL */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-2xl p-8 shadow-2xl">
             <div className="flex justify-between items-start mb-6 border-b border-slate-700 pb-4">
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Plan // {selectedActivity.title}</h2>
                <button onClick={() => setSelectedActivity(null)} className="text-slate-500 hover:text-white transition"><X size={24} /></button>
             </div>
             
             <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Team Lead</label>
                   <input className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500" value={selectedActivity.lead || ''} placeholder="Assign name..." onChange={(e) => setSelectedActivity({...selectedActivity, lead: e.target.value})} />
                </div>
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Target Environment</label>
                   <select className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500" value={selectedActivity.location} onChange={(e) => setSelectedActivity({...selectedActivity, location: e.target.value})}>
                      <option value="unassigned">CHOOSE LOCATION...</option>
                      <option value="cloud">CLOUD INSTANCE</option>
                      <option value="lab">HARDWARE LAB</option>
                      <option value="field">FIELD TESTING</option>
                   </select>
                </div>
             </div>

             <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Main Objectives & Details</label>
                <textarea className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-sm h-64 font-mono focus:ring-1 focus:ring-blue-500 outline-none scrollbar-thin" value={selectedActivity.testPlan || ''} placeholder="Enter markdown or test steps..." onChange={(e) => setSelectedActivity({...selectedActivity, testPlan: e.target.value})} />
             </div>

             <div className="flex justify-between mt-8">
                <button onClick={() => { moveActivity(selectedActivity._id, { status: 'staged', testString: null, shift: null, order: null }); setSelectedActivity(null); }} className="text-red-500 text-[10px] font-black hover:text-red-400 transition uppercase tracking-widest underline underline-offset-4 flex items-center gap-1"><Trash2 size={14} /> Unstage Item</button>
                <div className="flex gap-4">
                  <button onClick={() => setSelectedActivity(null)} className="px-6 py-2 text-sm font-bold text-slate-400">DISCARD</button>
                  <button onClick={() => { moveActivity(selectedActivity._id, selectedActivity); setSelectedActivity(null); }} className="bg-blue-600 hover:bg-blue-500 px-10 py-2 rounded-lg font-black text-sm transition shadow-lg shadow-blue-900/20 uppercase tracking-widest">Update Plan</button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;