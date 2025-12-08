import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Recipient, Album, MediaItem, Assignment } from '../types';
import { Users, Disc, Film, QrCode, LogOut, Upload, Trash2, Music, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import axios from 'axios';
import { EulabFooter } from '../components/EulabFooter';

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'recipients' | 'media' | 'albums' | 'assignments'>('assignments');
  
  // Data State
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  
  // Form States
  const [newRecipient, setNewRecipient] = useState({ name: '', email: '' });
  const [newAlbum, setNewAlbum] = useState({ title: '', description: '' });
  const [newAssignment, setNewAssignment] = useState({ recipient_id: '', album_id: '' });
  const [qrCodeData, setQrCodeData] = useState<{ url: string, qr_base64: string } | null>(null);
  
  // Loading
  const [loading, setLoading] = useState(false);
  
  // Stats State
  const [selectedAssignmentStats, setSelectedAssignmentStats] = useState<any>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [r, m, a, ass] = await Promise.all([
        api.get('/admin/recipients'),
        api.get('/admin/media'),
        api.get('/admin/albums'),
        api.get('/admin/assignments')
      ]);
      setRecipients(r.data);
      setMedia(m.data);
      setAlbums(a.data);
      setAssignments(ass.data);
    } catch (e) {
      console.error(e);
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        navigate('/login');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/logout');
    } catch (e) {
      console.error("Logout cleanup failed", e);
    }
    localStorage.removeItem('token');
    navigate('/login');
  };

  // Actions
  const createRecipient = async () => {
    if(!newRecipient.name) return;
    await api.post('/admin/recipients', newRecipient);
    setNewRecipient({ name: '', email: '' });
    fetchData();
  };

  const createAlbum = async () => {
    if(!newAlbum.title) return;
    await api.post('/admin/albums', newAlbum);
    setNewAlbum({ title: '', description: '' });
    fetchData();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name.split('.')[0]);
    formData.append('media_type', file.type.startsWith('image') ? 'video' : (file.type.startsWith('audio') ? 'audio' : 'video')); // Simple heuristic
    
    setLoading(true);
    await api.post('/admin/upload', formData);
    setLoading(false);
    fetchData();
  };
  
  const handleCoverUpload = async (file: File, targetType: 'album' | 'media', targetId: number) => {
     const formData = new FormData();
     formData.append('file', file);
     setLoading(true);
     try {
       // 1. Upload Cover
       const uploadRes = await api.post('/admin/upload/cover', formData);
       const filename = uploadRes.data.filename;
       
       // 2. Set Cover
       if(targetType === 'album') {
           await api.post(`/admin/albums/${targetId}/cover`, { filename });
       } else {
           await api.post(`/admin/media/${targetId}/cover`, { filename });
       }
       fetchData();
     } catch(e) {
       console.error("Cover upload failed", e);
     } finally {
       setLoading(false);
     }
  };

  const handleRemoveCover = async (targetType: 'album' | 'media', targetId: number) => {
     if(!window.confirm("Remove cover image?")) return;
     try {
       if(targetType === 'album') {
           await api.post(`/admin/albums/${targetId}/cover`, { filename: "" });
       } else {
           await api.post(`/admin/media/${targetId}/cover`, { filename: "" });
       }
       fetchData();
     } catch(e) {
       console.error("Failed to remove cover", e);
     }
  };

  const createAssignment = async () => {
    if(!newAssignment.recipient_id || !newAssignment.album_id) return;
    const res = await api.post(`/admin/assign?recipient_id=${newAssignment.recipient_id}&album_id=${newAssignment.album_id}`);
    fetchData();
    // Show details automatically
    selectAssignment(res.data);
  };
 
  const selectAssignment = async (assignment: Assignment) => {
      setSelectedAssignmentId(assignment.id);
      // Fetch QR
      const qrRes = await api.get(`/admin/qrcode/${assignment.token}`);
      setQrCodeData(qrRes.data);
      
      // Fetch Stats
      try {
          const statsRes = await api.get(`/admin/assignments/${assignment.id}/stats`);
          setSelectedAssignmentStats(statsRes.data);
      } catch (e) {
          console.error("Failed to fetch stats", e);
          setSelectedAssignmentStats(null);
      }
  };
  
  const addToAlbum = async (albumId: number, mediaId: number) => {
     await api.post(`/admin/albums/${albumId}/add_media/${mediaId}`);
     fetchData();
  };

  const deleteRecipient = async (id: number) => {
    if(!window.confirm("Delete this recipient?")) return;
    await api.delete(`/admin/recipients/${id}`);
    fetchData();
  };

  const deleteMedia = async (id: number) => {
    if(!window.confirm("Delete this media? This cannot be undone.")) return;
    await api.delete(`/admin/media/${id}`);
    fetchData();
  };

  const deleteAlbum = async (id: number) => {
    if(!window.confirm("Delete this album?")) return;
    await api.delete(`/admin/albums/${id}`);
    fetchData();
  };

  const removeMediaFromAlbum = async (albumId: number, mediaId: number) => {
    if(!window.confirm("Remove media from this album?")) return;
    await api.delete(`/admin/albums/${albumId}/media/${mediaId}`);
    fetchData();
  };

  const deleteAssignment = async (id: number) => {
    if(!window.confirm("Delete this assignment?")) return;
    await api.delete(`/admin/assignments/${id}`);
    fetchData();
    if(selectedAssignmentId === id) {
        setSelectedAssignmentId(null);
        setQrCodeData(null);
        setSelectedAssignmentStats(null);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 p-6 flex flex-col">
        <h1 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          QR Media Admin
        </h1>
        
        <nav className="flex-1 space-y-2">
          {[
            { id: 'assignments', icon: QrCode, label: 'Assignments' },
            { id: 'recipients', icon: Users, label: 'Recipients' },
            { id: 'albums', icon: Disc, label: 'Albums' },
            { id: 'media', icon: Film, label: 'Media Library' },
          ].map((item) => (
             <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === item.id 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-400 mt-auto">
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-white capitalize">{activeTab} Management</h2>
          </div>

          {/* Tab Content */}
          {activeTab === 'recipients' && (
            <div className="space-y-6">
               <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <h3 className="text-lg font-semibold mb-4 text-white">Add Recipient</h3>
                  <div className="flex gap-4">
                    <input 
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2" 
                      placeholder="Name"
                      value={newRecipient.name}
                      onChange={e => setNewRecipient({...newRecipient, name: e.target.value})}
                    />
                    <input 
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2" 
                      placeholder="Email (optional)"
                      value={newRecipient.email}
                      onChange={e => setNewRecipient({...newRecipient, email: e.target.value})}
                    />
                    <button onClick={createRecipient} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-500">Add</button>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {recipients.map(r => (
                   <div key={r.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                      <div className="flex justify-between items-start">
                         <div>
                            <div className="font-bold text-white">{r.name}</div>
                            <div className="text-sm text-slate-500">{r.email}</div>
                         </div>
                         <button onClick={() => deleteRecipient(r.id)} className="text-slate-500 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'media' && (
            <div className="space-y-6">
              <div className="bg-slate-900 p-8 rounded-2xl border border-dashed border-slate-700 hover:border-indigo-500 transition-colors flex flex-col items-center justify-center">
                 <Upload className="w-12 h-12 text-slate-600 mb-4" />
                 <p className="text-slate-400 mb-4">Drag and drop or click to upload audio/video</p>
                 <input type="file" onChange={handleFileUpload} className="hidden" id="file-upload" />
                 <label htmlFor="file-upload" className="bg-white text-black font-medium px-6 py-2 rounded-full cursor-pointer hover:bg-slate-200">
                   {loading ? "Uploading..." : "Select File"}
                 </label>
              </div>

               <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                 {media.map(m => (
                   <div key={m.id} className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden aspect-square">
                       <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-700">
                          {m.cover_filename ? (
                              <img src={`/media/${m.cover_filename}`} alt={m.title} className="w-full h-full object-cover" />
                          ) : (
                              m.media_type === 'video' ? <Film className="w-12 h-12" /> : <Music className="w-12 h-12" />
                          )}
                       </div>
                      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black to-transparent">
                        <div className="text-white font-medium truncate">{m.title}</div>
                        <div className="text-xs text-slate-400 uppercase">{m.media_type}</div>
                      </div>
                       <button 
                         onClick={(e) => { e.stopPropagation(); deleteMedia(m.id); }} 
                         className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-red-500 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-all"
                       >
                          <Trash2 className="w-4 h-4" />
                       </button>
                       
                       <div className="absolute top-2 left-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                           {!m.cover_filename ? (
                               <label className="p-2 bg-black/70 hover:bg-indigo-500 rounded-lg text-white cursor-pointer flex items-center gap-2 text-xs font-medium">
                                   <ImageIcon className="w-4 h-4" />
                                   <span>Upload Cover</span>
                                   <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0], 'media', m.id)} />
                               </label>
                           ) : (
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleRemoveCover('media', m.id); }}
                                 className="p-2 bg-black/50 hover:bg-red-500 rounded-lg text-white"
                                 title="Remove Cover"
                               >
                                   <Trash2 className="w-4 h-4" />
                               </button>
                           )}
                       </div>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'albums' && (
            <div className="space-y-6">
               <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <div className="flex gap-4">
                    <input 
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2" 
                      placeholder="Album Title"
                      value={newAlbum.title}
                      onChange={e => setNewAlbum({...newAlbum, title: e.target.value})}
                    />
                    <button onClick={createAlbum} className="bg-indigo-600 text-white px-6 py-2 rounded-lg">Create Album</button>
                  </div>
               </div>

               <div className="grid gap-6">
                  {albums.map(album => (
                    <div key={album.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                       <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xl font-bold text-white">{album.title}</h3>
                          <div className="flex items-center gap-4">
                             <div className="relative group w-10 h-10 bg-slate-800 rounded overflow-hidden flex items-center justify-center cursor-pointer shrink-0">
                                {album.cover_filename ? (
                                    <>
                                        <img src={`/media/${album.cover_filename}`} alt="Cover" className="w-full h-full object-cover" />
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveCover('album', album.id);
                                            }}
                                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-500"
                                            title="Remove Cover"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <Disc className="w-5 h-5 text-slate-600" />
                                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Upload Cover">
                                            <Upload className="w-4 h-4 text-white" />
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0], 'album', album.id)} />
                                        </label>
                                    </>
                                )}
                             </div>
                             {!album.cover_filename && (
                                 <label className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1">
                                     Upload Image
                                     <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0], 'album', album.id)} />
                                 </label>
                             )}
                             <span className="text-sm text-slate-500">ID: {album.id}</span>
                             <button onClick={() => deleteAlbum(album.id)} className="text-slate-500 hover:text-red-500 transition-colors">
                                 <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                       </div>

                       <div className="mb-6">
                           <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Assigned Content</h4>
                           {album.media_items && album.media_items.length > 0 ? (
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                   {album.media_items.map(item => (
                                       <div key={item.id} className="group/item flex items-center justify-between gap-3 p-2 bg-slate-950/50 border border-slate-800 rounded-lg hover:border-red-500/50 transition-colors">
                                           <div className="flex items-center gap-3 overflow-hidden">
                                              {item.media_type === 'video' ? <Film className="w-4 h-4 text-indigo-400 shrink-0"/> : <Music className="w-4 h-4 text-emerald-400 shrink-0"/>}
                                              <span className="text-sm truncate text-slate-300">{item.title}</span>
                                           </div>
                                           <button 
                                             onClick={() => removeMediaFromAlbum(album.id, item.id)}
                                             className="opacity-0 group-hover/item:opacity-100 text-slate-500 hover:text-red-400 px-2"
                                           >
                                              <Trash2 className="w-3 h-3" />
                                           </button>
                                       </div>
                                   ))}
                               </div>
                           ) : (
                               <div className="text-sm text-slate-500 italic p-2">No content assigned yet</div>
                           )}
                       </div>
                       
                       <div className="mb-4">
                         <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Add Content</h4>
                         <div className="flex flex-wrap gap-2">
                           {media.map(m => (
                             <button 
                               key={m.id} 
                               onClick={() => addToAlbum(album.id, m.id)}
                               className="text-xs bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white px-3 py-1 rounded-full transition-colors border border-slate-700"
                             >
                               + {m.title}
                             </button>
                           ))}
                         </div>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'assignments' && (
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                   <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                      <h3 className="text-lg font-bold text-white mb-4">Create New Assignment</h3>
                      <div className="space-y-4">
                         <div>
                           <label className="block text-sm text-slate-400 mb-1">Select Recipient</label>
                           <select 
                             className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white"
                             value={newAssignment.recipient_id}
                             onChange={e => setNewAssignment({...newAssignment, recipient_id: e.target.value})}
                           >
                             <option value="">Select...</option>
                             {recipients.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                           </select>
                         </div>
                         <div>
                           <label className="block text-sm text-slate-400 mb-1">Select Album</label>
                           <select 
                             className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white"
                             value={newAssignment.album_id}
                             onChange={e => setNewAssignment({...newAssignment, album_id: e.target.value})}
                           >
                              <option value="">Select...</option>
                              {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                           </select>
                         </div>
                         <button 
                           onClick={createAssignment} 
                           className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-medium py-3 rounded-xl shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-transform"
                         >
                           Generate Access (QR & Link)
                         </button>
                      </div>
                   </div>

                   {/* List Assignments */}
                   <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                      {assignments.map(ass => (
                        <div 
                            key={ass.id} 
                            onClick={() => selectAssignment(ass)}
                            className={cn(
                                "p-4 border-b border-slate-800 hover:bg-slate-800/50 flex justify-between items-center cursor-pointer transition-colors",
                                selectedAssignmentId === ass.id && "bg-slate-800/80 border-indigo-500/50"
                            )}
                        >
                           <div>
                              <div className="text-white font-medium">To: {recipients.find(r => r.id === ass.recipient_id)?.name}</div>
                              <div className="text-sm text-slate-500">Album: {albums.find(a => a.id === ass.album_id)?.title}</div>
                           </div>
                           <div className="flex items-center gap-2">
                             <button onClick={(e) => { e.stopPropagation(); deleteAssignment(ass.id); }} className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg" title="Delete Assignment">
                               <Trash2 className="w-5 h-5" />
                             </button>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>

                {/* QR & Stats Display Area */}
                <div className="bg-slate-900 rounded-3xl p-8 flex flex-col text-center shadow-2xl relative overflow-hidden border border-slate-800">
                   {qrCodeData ? (
                     <div className="space-y-8 animate-in fade-in zoom-in duration-300">
                        {/* Stats Section */}
                        {selectedAssignmentStats && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                    <div className="text-slate-400 text-sm font-medium mb-1 uppercase tracking-wider">Total Views</div>
                                    <div className="text-3xl font-bold text-white">{selectedAssignmentStats.total_views}</div>
                                </div>
                                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                    <div className="text-slate-400 text-sm font-medium mb-1 uppercase tracking-wider">Media Plays</div>
                                    <div className="text-3xl font-bold text-indigo-400">{selectedAssignmentStats.total_plays}</div>
                                </div>
                                {selectedAssignmentStats.last_active && (
                                    <div className="col-span-2 bg-slate-950/50 p-4 rounded-xl border border-slate-800 text-left flex items-center justify-between">
                                        <div className="text-slate-400 text-sm">Last Active Connection</div>
                                        <div className="text-green-400 font-mono text-sm">
                                            {new Date(selectedAssignmentStats.last_active).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="w-full bg-slate-800/50 h-px"></div>

                        {/* QR Section */}
                        <div className="flex flex-col items-center">
                            <h3 className="text-2xl font-bold text-white mb-2">Access Link</h3>
                            <p className="text-slate-400 mb-6 text-sm">Share this QR code with the recipient.</p>
                            
                            <div className="relative group">
                                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                <img src={`data:image/png;base64,${qrCodeData.qr_base64}`} alt="QR Code" className="w-48 h-48 rounded-xl relative z-10" />
                            </div>

                            <div className="mt-6 p-4 bg-slate-950 rounded-xl w-full break-all font-mono text-xs text-slate-500 border border-slate-800">
                                {window.location.origin}/view/{qrCodeData.url.split('/').pop()}
                            </div>
                        </div>
                     </div>
                   ) : (
                     <div className="flex flex-col items-center justify-center h-full text-slate-500 min-h-[400px]">
                        <QrCode className="w-24 h-24 opacity-10 mb-4" />
                        <p>Select an assignment to view Details & Statistics</p>
                     </div>
                   )}
                </div>
             </div>
          )}
        </div>
      </div>
      <EulabFooter />
    </div>
  );
};
