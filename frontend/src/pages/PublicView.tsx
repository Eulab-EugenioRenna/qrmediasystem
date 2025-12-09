import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { MediaItem } from '../types';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, 
  ListMusic, Music, Video, Loader2, Maximize, VolumeX, Lock, ChevronUp, ChevronDown
} from 'lucide-react';
import { cn } from '../lib/utils';
import { EulabFooter } from '../components/EulabFooter';

interface PublicData {
  recipient: string;
  album: string;
  album_cover?: string;
  media: MediaItem[];
  session_token: string;
  assignment_id: number;
}

export const PublicView = () => {
  const { token } = useParams();
  const [data, setData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  
  // Media State
  const [currentTrack, setCurrentTrack] = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLoggedViewRef = useRef(false);

  useEffect(() => {
    fetchData();
    return () => {
        if(heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    }
  }, [token]);

  // Session & Heartbeat Effect
  useEffect(() => {
      const handleBeforeUnload = () => {
          if (sessionTokenRef.current) {
              const data = JSON.stringify({ session_token: sessionTokenRef.current });
              navigator.sendBeacon(api.defaults.baseURL + '/public/leave', data);
          }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);

      if(data?.session_token) {
          sessionTokenRef.current = data.session_token;
          
          if (!hasLoggedViewRef.current) {
               logEvent('view_assignment', undefined, 'User viewed assignment');
               hasLoggedViewRef.current = true;
          }

          if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = setInterval(() => {
              sendHeartbeat(data.session_token);
          }, 10000); 
      }
      return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
          if(heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      }
  }, [data]);

  const sendHeartbeat = async (sToken: string) => {
      try {
          await api.post('/public/heartbeat', { session_token: sToken });
      } catch (err: any) {
          if (err.response && (err.response.status === 404 || err.response.status === 403)) {
               setIsBlocked(true);
               setError("Session expired or taken over.");
          }
      }
  };

  const logEvent = async (type: string, mediaId?: number, details?: string) => {
      if(!sessionTokenRef.current) return;
      try {
          await api.post('/public/event', {
              session_token: sessionTokenRef.current,
              event_type: type,
              media_item_id: mediaId,
              details: details
          });
      } catch (err) {
          console.error("Log event failed", err);
      }
  };

  const fetchData = async () => {
    try {
      const storedTokenKey = `session_token_${token}`;
      const storedToken = localStorage.getItem(storedTokenKey);
      
      const headers: Record<string, string> = {};
      if(storedToken) {
          headers['X-Session-Token'] = storedToken;
      }
      
      const res = await api.get(`/public/view/${token}`, { headers });
      setData(res.data);
      setIsBlocked(false);
      
      if(res.data.session_token) {
          localStorage.setItem(storedTokenKey, res.data.session_token);
      }
      
      if (res.data.media.length > 0 && !currentTrack) {
        setCurrentTrack(res.data.media[0]);
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
          setIsBlocked(true);
          setError('This assignment is currently active in another session. Only one concurrent session is allowed.');
      } else {
          setError('Content unavailable');
      }
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = () => {
    if (!currentTrack) return;
    if (!isPlaying) {
        logEvent('media_play', currentTrack.id);
    } else {
        logEvent('media_pause', currentTrack.id);
    }
    setIsPlaying(!isPlaying);
  };

  const playTrack = (track: MediaItem) => {
    if(track.id !== currentTrack?.id) {
        logEvent('media_play', track.id);
        setCurrentTrack(track);
        setIsPlaying(true);
        setProgress(0);
    } else {
        togglePlay();
    }
  };

  const playNext = () => {
    if (!data || !currentTrack) return;
    const idx = data.media.findIndex(m => m.id === currentTrack.id);
    if (idx < data.media.length - 1) {
      playTrack(data.media[idx + 1]);
    }
  };

  const playPrev = () => {
    if (!data || !currentTrack) return;
    const idx = data.media.findIndex(m => m.id === currentTrack.id);
    if (idx > 0) {
      playTrack(data.media[idx - 1]);
    }
  };

  const handleTimeUpdate = () => {
    const mediaElement = currentTrack?.media_type === 'video' ? videoRef.current : audioRef.current;
    if (mediaElement) {
      setProgress(mediaElement.currentTime);
      setDuration(mediaElement.duration || 0);
    }
  };
  
  useEffect(() => {
    if(videoRef.current) videoRef.current.volume = volume;
    if(audioRef.current) audioRef.current.volume = volume;
  }, [volume, currentTrack]);

  useEffect(() => {
     const mediaElement = currentTrack?.media_type === 'video' ? videoRef.current : audioRef.current;
     if(isPlaying) {
         mediaElement?.play().catch(e => console.error("Play failed", e));
     } else {
         mediaElement?.pause();
     }
  }, [isPlaying, currentTrack]);

  const toggleFullscreen = () => {
      if(videoRef.current) {
          if(document.fullscreenElement) {
              document.exitFullscreen();
          } else {
              videoRef.current.requestFullscreen();
          }
      }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      if(!progressRef.current || !duration) return;
      const rect = progressRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const pos = (clientX - rect.left) / rect.width;
      const newTime = Math.max(0, Math.min(duration, pos * duration));
      
      const mediaElement = currentTrack?.media_type === 'video' ? videoRef.current : audioRef.current;
      if(mediaElement) {
          mediaElement.currentTime = newTime;
          setProgress(newTime);
      }
  };

  const handleVolumeChange = (e: React.MouseEvent<HTMLDivElement>) => {
      if(!volumeRef.current) return;
      const rect = volumeRef.current.getBoundingClientRect();
      let newVol = (e.clientX - rect.left) / rect.width;
      newVol = Math.max(0, Math.min(1, newVol));
      setVolume(newVol);
  };
  
  const formatTime = (time: number) => {
    if(isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (loading) return <div className="h-screen bg-black flex items-center justify-center"><Loader2 className="animate-spin text-green-500 w-8 h-8" /></div>;
  
  if (isBlocked) {
      return (
          <div className="h-screen bg-black flex flex-col items-center justify-center text-white p-4 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="text-xl md:text-2xl font-bold mb-2">Access Denied</h1>
              <p className="text-neutral-400 max-w-md text-sm md:text-base">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-6 px-6 py-3 bg-white text-black rounded-full font-medium hover:bg-neutral-200 transition"
              >
                  Try Again
              </button>
          </div>
      );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col h-screen bg-[#121212] text-white">
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
         {/* Desktop Sidebar - Hidden on Mobile */}
         <div className="w-[280px] hidden md:flex flex-col gap-4 p-4 bg-[#121212] shrink-0">
            <div className="w-full aspect-square bg-[#282828] rounded-xl flex items-center justify-center overflow-hidden shadow-xl shadow-black/50 relative group">
               {currentTrack?.media_type === 'video' ? (
                 <>
                    <video 
                        key={currentTrack.id}
                        ref={videoRef}
                        src={`/media/${currentTrack.filename}`}
                        className="w-full h-full object-cover"
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={() => { setIsPlaying(false); playNext(); }}
                        onClick={togglePlay}
                        autoPlay={isPlaying}
                    />
                    <button 
                        onClick={toggleFullscreen}
                        className="absolute top-2 right-2 p-2 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-black/80"
                        title="Fullscreen"
                    >
                        <Maximize className="w-4 h-4" />
                    </button>
                 </>
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-[#121212]">
                    <Music className="w-20 h-20 text-white/50" />
                    <audio 
                       key={currentTrack?.id}
                       ref={audioRef}
                       src={currentTrack ? `/media/${currentTrack.filename}` : undefined}
                       onTimeUpdate={handleTimeUpdate}
                       onEnded={() => { setIsPlaying(false); playNext(); }}
                       autoPlay={isPlaying}
                    />
                 </div>
               )}
            </div>
            
            <div className="px-2">
               <h2 className="text-xl font-bold truncate">{currentTrack?.title}</h2>
               <p className="text-[#b3b3b3] text-sm">{currentTrack?.media_type}</p>
            </div>
         </div>

         {/* Playlist / Tracklist Area */}
         <div className="flex-1 overflow-y-auto bg-gradient-to-b from-[#1e1e1e] to-[#121212] p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6 mb-6 md:mb-8">
               <div className="w-32 h-32 md:w-52 md:h-52 bg-[#282828] shadow-2xl flex items-center justify-center rounded-md overflow-hidden relative mx-auto md:mx-0 shrink-0">
                  {(data.album_cover) ? (
                      <img src={`/media/${data.album_cover}`} alt={data.album} className="w-full h-full object-cover" />
                  ) : (
                      <div className="w-full h-full bg-gradient-to-br from-green-700 to-green-900 flex items-center justify-center">
                          <ListMusic className="w-16 h-16 md:w-24 md:h-24 text-white" />
                      </div>
                  )}
               </div>
               <div className="text-center md:text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-1 md:mb-2 text-[#b3b3b3]">Private Album</h4>
                  <h1 className="text-2xl md:text-5xl lg:text-7xl font-black tracking-tight mb-2 md:mb-4">{data.album}</h1>
                  <div className="flex items-center justify-center md:justify-start gap-2 text-sm font-medium">
                     <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-black font-bold text-xs">
                        {(data.recipient[0] || 'U').toUpperCase()}
                     </div>
                     <span>{data.recipient}</span>
                     <span className="text-white/60">• {data.media.length} items</span>
                  </div>
               </div>
            </div>

            {/* List */}
            <div className="bg-black/20 rounded-lg backdrop-blur-sm">
               {/* Table Header */}
               <div className="hidden md:grid grid-cols-[16px_1fr_40px] gap-4 px-4 py-3 border-b border-white/10 text-[#b3b3b3] text-sm uppercase tracking-wider sticky top-0 bg-[#121212]/95 z-10">
                  <span>#</span>
                  <span>Title</span>
                  <span></span> 
               </div>

               {/* Rows */}
               <div className="flex flex-col">
                  {data.media.map((item, index) => {
                     const isActive = currentTrack?.id === item.id;
                     return (
                        <div 
                           key={item.id}
                           onClick={() => playTrack(item)}
                           className={cn(
                              "group grid grid-cols-[24px_1fr_40px] md:grid-cols-[16px_1fr_40px] gap-3 md:gap-4 px-3 md:px-4 py-4 md:py-3 text-sm hover:bg-white/10 rounded-md cursor-pointer transition-colors items-center",
                              isActive && "bg-white/10"
                           )}
                        >
                           <span className={cn("text-[#b3b3b3] tabular-nums group-hover:hidden text-center", isActive && "text-green-500")}>
                             {index + 1}
                           </span>
                           <span className="hidden group-hover:flex justify-center text-white">
                              {isActive && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                           </span>
                           
                           <div className="flex items-center gap-3 min-w-0">
                              {/* Mobile: Show media type icon */}
                              <div className="md:hidden w-10 h-10 bg-[#282828] rounded flex items-center justify-center shrink-0">
                                {item.media_type === 'video' ? <Video className="w-5 h-5 text-slate-500" /> : <Music className="w-5 h-5 text-slate-500" />}
                              </div>
                              <div className="flex flex-col justify-center min-w-0">
                                 <span className={cn("font-medium truncate", isActive ? "text-green-500" : "text-white")}>
                                    {item.title}
                                 </span>
                                 <span className="text-xs text-[#b3b3b3] capitalize">{item.media_type}</span>
                              </div>
                           </div>

                           <span className="text-[#b3b3b3] flex justify-center">
                             {isActive && isPlaying && (
                               <div className="flex gap-0.5">
                                 <span className="w-0.5 h-3 bg-green-500 animate-pulse"></span>
                                 <span className="w-0.5 h-3 bg-green-500 animate-pulse delay-75"></span>
                                 <span className="w-0.5 h-3 bg-green-500 animate-pulse delay-150"></span>
                               </div>
                             )}
                           </span>
                        </div>
                     );
                  })}
               </div>
            </div>
         </div>
      </div>

      {/* Mobile Now Playing + Controls */}
      {currentTrack && (
        <div className="md:hidden">
          {/* Expandable Now Playing Panel */}
          {showPlaylist && (
            <div className="fixed inset-0 bg-gradient-to-b from-[#282828] to-[#121212] z-40 flex flex-col p-4 pt-12">
              <button 
                onClick={() => setShowPlaylist(false)}
                className="absolute top-4 left-4 p-2 text-white"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
              
              {/* Large Album Art */}
              <div className="flex-1 flex flex-col items-center justify-center px-8">
                <div className="w-full max-w-[280px] aspect-square bg-[#282828] rounded-xl overflow-hidden shadow-2xl mb-6">
                  {currentTrack.media_type === 'video' ? (
                    <video 
                      src={`/media/${currentTrack.filename}`}
                      className="w-full h-full object-cover"
                      onClick={toggleFullscreen}
                    />
                  ) : currentTrack.cover_filename ? (
                    <img src={`/media/${currentTrack.cover_filename}`} className="w-full h-full object-cover" />
                  ) : data.album_cover ? (
                    <img src={`/media/${data.album_cover}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-purple-900 to-[#121212] flex items-center justify-center">
                      <Music className="w-24 h-24 text-white/50" />
                    </div>
                  )}
                </div>
                
                <div className="text-center w-full mb-8">
                  <h2 className="text-xl font-bold truncate">{currentTrack.title}</h2>
                  <p className="text-[#b3b3b3] text-sm">{data.album}</p>
                </div>
                
                {/* Progress */}
                <div className="w-full mb-6">
                  <div 
                    ref={progressRef}
                    className="h-1 w-full rounded-full cursor-pointer relative py-3 -my-3 flex items-center"
                    onClick={handleSeek}
                    onTouchStart={handleSeek}
                  >
                    <div className="w-full h-1 bg-neutral-600 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-white rounded-full" 
                        style={{ width: `${(progress / (duration || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-[#b3b3b3] mt-2 font-mono">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
                
                {/* Large Controls */}
                <div className="flex items-center justify-center gap-8">
                  <button onClick={playPrev} className="text-white p-3">
                    <SkipBack className="w-7 h-7" />
                  </button>
                  <button 
                    onClick={togglePlay}
                    className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black"
                  >
                    {isPlaying ? <Pause className="w-8 h-8 fill-black" /> : <Play className="w-8 h-8 fill-black ml-1" />}
                  </button>
                  <button onClick={playNext} className="text-white p-3">
                    <SkipForward className="w-7 h-7" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Player Bar - Responsive */}
      <div className="h-[72px] md:h-[90px] bg-[#181818] border-t border-[#282828] px-3 md:px-4 grid grid-cols-[1fr_auto] md:grid-cols-3 items-center z-50 gap-2 md:gap-4">
         
         {/* Left: Current Info */}
         <div 
           className="flex items-center gap-3 min-w-0 cursor-pointer md:cursor-default"
           onClick={() => setShowPlaylist(!showPlaylist)}
         >
             {currentTrack && (
                <>
                   <div className="w-12 h-12 md:w-14 md:h-14 bg-neutral-800 rounded flex items-center justify-center overflow-hidden relative group shrink-0">
                          {currentTrack.cover_filename ? (
                              <img src={`/media/${currentTrack.cover_filename}`} alt="Cover" className="w-full h-full object-cover" />
                          ) : data.album_cover ? (
                              <img src={`/media/${data.album_cover}`} alt="Cover" className="w-full h-full object-cover" />
                          ) : currentTrack.media_type === 'video' ? (
                             <Video className="w-6 h-6 md:w-8 md:h-8 text-neutral-500" />
                          ) : (
                             <Music className="w-6 h-6 md:w-8 md:h-8 text-neutral-500" />
                          )}
                       </div>
                   <div className="flex flex-col justify-center min-w-0 flex-1">
                      <h4 className="text-sm font-medium truncate">{currentTrack.title}</h4>
                      <p className="text-xs text-[#b3b3b3] truncate">{data.album}</p>
                   </div>
                   <button className="md:hidden p-2 text-[#b3b3b3]">
                     <ChevronUp className="w-5 h-5" />
                   </button>
                </>
             )}
         </div>

         {/* Center: Controls - Hidden on Mobile (shown in mini player) */}
         <div className="hidden md:flex flex-col items-center gap-2 max-w-xl w-full mx-auto">
            <div className="flex items-center gap-6">
                <button onClick={playPrev} className="text-[#b3b3b3] hover:text-white transition"><SkipBack className="w-5 h-5" /></button>
                <button 
                  onClick={togglePlay}
                  className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:scale-105 transition text-black"
                >
                   {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
                </button>
                <button onClick={playNext} className="text-[#b3b3b3] hover:text-white transition"><SkipForward className="w-5 h-5" /></button>
            </div>
            
            <div className="w-full flex items-center gap-2 text-xs text-[#b3b3b3] font-mono">
               <span>{formatTime(progress)}</span>
               <div 
                   ref={progressRef}
                   className="h-1 flex-1 rounded-full cursor-pointer group relative py-2 -my-2 flex items-center" 
                   onClick={handleSeek}
               >
                  <div className="w-full h-1 bg-neutral-600 rounded-full overflow-hidden">
                     <div 
                       className="h-full bg-green-500 rounded-full group-hover:bg-green-400" 
                       style={{ width: `${(progress / (duration || 1)) * 100}%` }}
                     ></div>
                  </div>
                  <div 
                     className="absolute w-3 h-3 bg-white rounded-full shadow hidden group-hover:block"
                     style={{ left: `${(progress / (duration || 1)) * 100}%`, transform: 'translateX(-50%)' }}
                  ></div>
               </div>
               <span>{formatTime(duration)}</span>
            </div>
         </div>

         {/* Mobile Mini Controls */}
         <div className="md:hidden flex items-center gap-2">
           <button 
             onClick={togglePlay}
             className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black"
           >
             {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
           </button>
         </div>

         {/* Right: Volume/Extra - Desktop Only */}
         <div className="hidden md:flex items-center justify-end gap-3 md:gap-4">
            <button onClick={() => setVolume(volume === 0 ? 1 : 0)}>
                {volume === 0 ? <VolumeX className="w-5 h-5 text-[#b3b3b3]"/> : <Volume2 className="w-5 h-5 text-[#b3b3b3]" />}
            </button>
            
            <div 
                ref={volumeRef}
                className="w-24 h-1 rounded-full cursor-pointer relative group py-2 -my-2 flex items-center"
                onClick={handleVolumeChange}
            >
               <div className="hidden group-hover:block absolute right-0 bottom-full mb-2 bg-[#282828] px-2 py-1 rounded text-xs select-none">
                  {Math.round(volume * 100)}%
               </div>
               <div className="w-full h-1 rounded-full overflow-hidden bg-neutral-600">
                    <div className="h-full bg-white rounded-full hover:bg-green-500" style={{ width: `${volume * 100}%` }}></div>
               </div>
            </div>
            
            <button className="text-[#b3b3b3] hover:text-white" onClick={toggleFullscreen} title="Toggle Fullscreen">
                 <Maximize className="w-4 h-4" />
            </button>
         </div>
      </div>
      
      {/* Hidden audio element for mobile */}
      <audio 
        key={`audio-${currentTrack?.id}`}
        ref={audioRef}
        src={currentTrack?.media_type === 'audio' ? `/media/${currentTrack.filename}` : undefined}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => { setIsPlaying(false); playNext(); }}
        className="hidden"
      />
      
      <EulabFooter position="top-right" />
    </div>
  );
};
