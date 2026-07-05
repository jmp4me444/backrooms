import { useState, useEffect } from 'react';
import { Shield, Volume2, VolumeX, Terminal, Database } from 'lucide-react';
import { ThreeCanvas } from './components/ThreeCanvas';
import { TerminalUI } from './components/TerminalUI';
import { WikiDossier } from './components/WikiDossier';
import { parseKeywords } from './generator/ThemeParser';
import Synthesizer from './audio/Synthesizer';
import type { RoomTheme, LevelDossier, SearchableItem } from './types';

export default function App() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [keywords, setKeywords] = useState('yellow walls, office, hum');
  const [searchQuery, setSearchQuery] = useState('yellow walls, office, hum');
  
  const [theme, setTheme] = useState<RoomTheme | null>(null);
  const [dossier, setDossier] = useState<LevelDossier | null>(null);
  const [items, setItems] = useState<SearchableItem[]>([]);
  
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(0.4);
  const [entityDistance, setEntityDistance] = useState(999.0);

  // Side Drawer Toggles
  const [showLogs, setShowLogs] = useState(false);
  const [showDossier, setShowDossier] = useState(false);

  // Initialize defaults once user boots up the terminal
  useEffect(() => {
    if (hasInteracted) {
      handleSynthesis(keywords);
    }
  }, [hasInteracted]);

  // Handle ambient volume modulation
  useEffect(() => {
    if (hasInteracted) {
      Synthesizer.setVolume(soundOn ? volume : 0);
    }
  }, [soundOn, volume, hasInteracted]);

  const handleBoot = () => {
    Synthesizer.init();
    Synthesizer.setVolume(volume);
    setHasInteracted(true);
  };

  const handleSynthesis = (query: string) => {
    setIsLoading(true);
    setKeywords(query);
    setSearchQuery(query);

    // Simulate database scan and generation latency
    setTimeout(() => {
      const randomSeed = Math.random();
      const { theme: generatedTheme, dossier: generatedDossier, items: generatedItems } = parseKeywords(query, randomSeed);
      
      setTheme(generatedTheme);
      setDossier(generatedDossier);
      setItems(generatedItems);
      setEntityDistance(999.0); // Reset entity distance

      // Trigger ambient soundscape transition
      if (soundOn) {
        Synthesizer.start(generatedTheme.ambientSound);
      }

      setIsLoading(false);
    }, 1000);
  };

  const handleItemFound = (itemId: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === itemId && !item.found) {
          // Play collection glips
          Synthesizer.triggerEntityGlitch();
          return { ...item, found: true };
        }
        return item;
      })
    );
  };

  const handleLevelTransition = () => {
    const randomSeed = Math.random();
    const { theme: generatedTheme, dossier: generatedDossier, items: generatedItems } = parseKeywords(keywords, randomSeed);
    setTheme(generatedTheme);
    setDossier(generatedDossier);
    setItems(generatedItems);
    setEntityDistance(999.0);
    if (soundOn) {
      Synthesizer.start(generatedTheme.ambientSound);
    }
  };

  const handleToggleSound = () => {
    const nextSound = !soundOn;
    setSoundOn(nextSound);
    if (!nextSound) {
      Synthesizer.stopAll();
    } else if (theme) {
      Synthesizer.start(theme.ambientSound);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isLoading) return;
    handleSynthesis(searchQuery);
    
    // Release input focus to restore keyboard movement immediately
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // Boot Landing Screen (Interacts with user gesture browser requirements)
  if (!hasInteracted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#070b07] text-[#10b981] font-mono px-4 relative min-h-screen">
        <div className="absolute inset-0 bg-scanlines opacity-[0.08]" />
        <div className="absolute inset-0 bg-flicker pointer-events-none" />
        
        <div className="max-w-md w-full border border-green-500/30 bg-[#050906] p-6 rounded shadow-[0_0_30px_rgba(16,185,129,0.1)] relative z-10 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 mb-4 animate-pulse">
            <Shield className="w-8 h-8" />
          </div>
          
          <h1 className="text-xl md:text-2xl font-bold tracking-widest text-green-400 mb-1">
            M.E.G. PROTOCOL
          </h1>
          <p className="text-[10px] text-green-500/50 uppercase tracking-widest mb-6">
            Dimensional Level Synthesis Hub
          </p>

          <div className="w-full bg-black/60 border border-green-500/15 p-4 rounded text-left text-xs text-green-500/80 mb-6 leading-relaxed space-y-2 select-none">
            <div className="flex gap-2">
              <span className="text-green-500/50">[OK]</span>
              <span>Host Terminal Handshake: STABLE</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-500/50">[OK]</span>
              <span>Audio Synthesis Engine: LOADED</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-500/50">[OK]</span>
              <span>3D Geometrics Sandbox: READY</span>
            </div>
            <div className="text-green-500/40 text-[10px] border-t border-green-500/10 pt-2 mt-2">
              WARNING: Sensory feedback mimics high-fidelity psychological metrics. Turn on speakers to hear active humming/water drips.
            </div>
          </div>

          <button
            onClick={handleBoot}
            className="w-full bg-green-500 hover:bg-green-600 text-black font-extrabold uppercase py-3 rounded text-sm tracking-wider transition shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse"
          >
            BOOT SENSORY TERMINAL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#070b07] text-[#10b981] relative select-none overflow-hidden flex flex-col">
      
      {/* 3D Viewport - Fullscreen Background */}
      <div className="absolute inset-0 w-full h-full z-0">
        {theme && (
          <ThreeCanvas
            theme={theme}
            keywords={keywords}
            items={items}
            onItemFound={handleItemFound}
            entityDistance={entityDistance}
            setEntityDistance={setEntityDistance}
            onLevelTransition={handleLevelTransition}
          />
        )}
      </div>

      {/* Floating Header Controls (Left) */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-3 select-none pointer-events-auto">
        <div className="flex items-center gap-2 border border-green-500/20 bg-black/80 px-3 py-1.5 rounded shadow-lg backdrop-blur-md">
          <Shield className="w-4 h-4 text-green-400 animate-pulse" />
          <div className="hidden sm:block">
            <h1 className="text-[10px] font-bold font-mono tracking-wider text-green-400 uppercase m-0 leading-tight">
              M.E.G. SYSTEM
            </h1>
          </div>
        </div>

        {/* Audio controls */}
        <div className="flex items-center gap-2 border border-green-500/20 bg-black/80 px-2.5 py-1.5 rounded shadow-lg backdrop-blur-md">
          <button
            onClick={handleToggleSound}
            className="text-green-400 hover:text-green-300 transition shrink-0"
            title={soundOn ? 'Mute' : 'Unmute'}
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            disabled={!soundOn}
            className="w-12 md:w-16 accent-green-500 h-1 cursor-pointer disabled:opacity-20"
            title="Volume"
          />
        </div>
      </div>

      {/* Floating Center Search Bar Overlay */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-md select-none pointer-events-auto">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 bg-black/90 border border-green-500/40 p-1.5 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.15)] backdrop-blur-md">
          <div className="flex-1 flex items-center bg-black border border-green-500/20 px-2 py-1 rounded">
            <span className="text-green-500/40 font-mono text-[9px] mr-1.5 uppercase select-none">SEARCH_THEME:</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="pools, industrial, snowy office..."
              disabled={isLoading}
              className="flex-1 bg-transparent text-green-400 placeholder-green-500/25 outline-none font-mono text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !searchQuery.trim()}
            className="bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 px-3 rounded text-green-400 font-mono font-semibold text-xs flex items-center gap-1 transition disabled:opacity-30"
          >
            {isLoading ? 'SYNC...' : 'SYNTHESIS'}
          </button>
        </form>
      </div>

      {/* Floating Header Controls (Right) - Drawer toggles */}
      <div className="absolute top-4 right-4 z-30 flex gap-2 select-none pointer-events-auto">
        <button
          onClick={() => {
            setShowDossier(!showDossier);
            setShowLogs(false);
          }}
          className={`px-3 py-1.5 font-mono text-[10px] border rounded transition flex items-center gap-1 shadow-lg backdrop-blur-md ${
            showDossier 
              ? 'bg-green-500 text-black border-green-500 font-bold' 
              : 'bg-black/85 border-green-500/30 text-green-500/70 hover:border-green-500'
          }`}
          title="Toggle Level Dossier Archive"
        >
          <Database className="w-3.5 h-3.5" />
          <span>[DOSSIER]</span>
        </button>

        <button
          onClick={() => {
            setShowLogs(!showLogs);
            setShowDossier(false);
          }}
          className={`px-3 py-1.5 font-mono text-[10px] border rounded transition flex items-center gap-1 shadow-lg backdrop-blur-md ${
            showLogs 
              ? 'bg-green-500 text-black border-green-500 font-bold' 
              : 'bg-black/85 border-green-500/30 text-green-500/70 hover:border-green-500'
          }`}
          title="Toggle Terminal Console Logs"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>[CONSOLE]</span>
        </button>
      </div>

      {/* Slide-out Left Drawer: Wiki Dossier */}
      <div 
        className={`absolute top-16 bottom-16 left-4 z-40 w-[320px] md:w-[420px] bg-black/90 border border-green-500/30 rounded shadow-2xl backdrop-blur-md p-4 transition-all duration-300 transform pointer-events-auto flex flex-col ${
          showDossier ? 'translate-x-0 opacity-100' : '-translate-x-[110%] opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex justify-between items-center border-b border-green-500/20 pb-2 mb-3 font-mono text-xs select-none">
          <span className="text-green-400 font-bold uppercase flex items-center gap-1">
            <Database className="w-4 h-4" /> ARCHIVE_FILES
          </span>
          <button 
            onClick={() => setShowDossier(false)}
            className="text-green-500/50 hover:text-green-400 transition"
          >
            [CLOSE]
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
          {dossier && <WikiDossier dossier={dossier} items={items} />}
        </div>
      </div>

      {/* Slide-out Right Drawer: Terminal Console Logs */}
      <div 
        className={`absolute top-16 bottom-16 right-4 z-45 w-[320px] md:w-[420px] bg-black/90 border border-green-500/30 rounded shadow-2xl backdrop-blur-md p-4 transition-all duration-300 transform pointer-events-auto flex flex-col ${
          showLogs ? 'translate-x-0 opacity-100' : 'translate-x-[110%] opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex justify-between items-center border-b border-green-500/20 pb-2 mb-3 font-mono text-xs select-none">
          <span className="text-green-400 font-bold uppercase flex items-center gap-1">
            <Terminal className="w-4 h-4" /> M.E.G._LOGS
          </span>
          <button 
            onClick={() => setShowLogs(false)}
            className="text-green-500/50 hover:text-green-400 transition"
          >
            [CLOSE]
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <TerminalUI onGenerate={handleSynthesis} isLoading={isLoading} />
        </div>
      </div>

      {/* Retro CRT Scanline Flickers and Vignettes */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-scanlines opacity-[0.03]" />
      <div className="pointer-events-none fixed inset-0 z-50 bg-flicker" />
    </div>
  );
}
