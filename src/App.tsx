import { useState, useEffect } from 'react';
import { Shield, Volume2, VolumeX, Terminal, Database } from 'lucide-react';
import { ThreeCanvas } from './components/ThreeCanvas';
import { TerminalUI } from './components/TerminalUI';
import { WikiDossier } from './components/WikiDossier';
import { parseKeywords, expandKeywordsWithDictionary } from './generator/ThemeParser';
import Synthesizer from './audio/Synthesizer';
import type { RoomTheme, LevelDossier, SearchableItem } from './types';
import vaultGateImg from './assets/vault_gate.jpg';

const PRESET_THEMES = [
  { label: 'Yellow Lobby', query: 'yellow walls, office, hum' },
  { label: 'Jungle Oasis', query: 'jungle' },
  { label: 'Tropical Beach', query: 'beach' },
  { label: 'Sterile Hospital', query: 'hospital' },
  { label: 'Industrial Pipes', query: 'industrial' },
  { label: 'Frozen Archive', query: 'icey room' },
  { label: 'Funhouse Circus', query: 'circus' },
  { label: 'Golden Palace', query: 'gold' },
  { label: 'Boiler Lava Room', query: 'lava' },
  { label: 'Dusty Ruins', query: 'desert' },
  { label: 'Neon Arcade', query: 'arcade' },
  { label: 'Dark Void', query: 'dark' },
  { label: 'Matrix Core', query: 'matrix' }
];

export default function App() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [keywords, setKeywords] = useState('yellow walls, office, hum');
  const [searchQuery, setSearchQuery] = useState('yellow walls, office, hum');
  
  const [theme, setTheme] = useState<RoomTheme | null>(null);
  const [dossier, setDossier] = useState<LevelDossier | null>(null);
  const [items, setItems] = useState<SearchableItem[]>([]);
  const [showSplash, setShowSplash] = useState(false);
  
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

  const handleSynthesis = async (query: string) => {
    setIsLoading(true);
    setShowSplash(true);
    setKeywords(query);
    setSearchQuery(query);

    // Call async dictionary keyword expansion for unknown words at runtime
    const expandedQuery = await expandKeywordsWithDictionary(query);

    const randomSeed = Math.random();
    const { theme: generatedTheme, dossier: generatedDossier, items: generatedItems } = parseKeywords(expandedQuery, randomSeed);
    
    // Set theme and data immediately behind the scenes
    setTheme(generatedTheme);
    setDossier(generatedDossier);
    setItems(generatedItems);
    setEntityDistance(999.0);

    // Show the splash screen briefly for a cinematic transition, then fade it out and start the audio
    setTimeout(() => {
      if (soundOn) {
        Synthesizer.start(generatedTheme.ambientSound);
      }
      setIsLoading(false);
      setShowSplash(false);
    }, 2500);
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
            M.E.G. PROTOCOL v55
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

          <div className="w-full flex flex-col gap-2 mb-5">
            <span className="text-[9px] text-green-500/60 uppercase tracking-wider select-none font-bold">
              TYPE YOUR DESIRED THEME IN THE BOX BELOW THEN CLICK THE BOOT BUTTON
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setKeywords(e.target.value);
              }}
              placeholder="pools, jungle, hospital, snowy office..."
              className="w-full bg-black border border-green-500/35 px-3 py-2.5 rounded text-green-400 placeholder-green-500/25 outline-none focus:border-green-500/70 font-mono text-xs text-center shadow-inner"
            />
          </div>

          <button
            onClick={handleBoot}
            className="w-full bg-white hover:bg-neutral-200 text-black font-extrabold uppercase py-3 rounded text-sm tracking-widest transition shadow-[0_0_15px_rgba(255,255,255,0.4)] mb-4 shrink-0"
          >
            BOOT
          </button>

          <div className="w-full flex flex-col gap-2 shrink-0">
            <span className="text-[9px] text-green-500/50 uppercase tracking-widest select-none font-bold">
              [ QUICK PRESETS ]
            </span>
            <div className="grid grid-cols-2 gap-2 text-left max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
              {PRESET_THEMES.map(themeOption => {
                const isSelected = searchQuery === themeOption.query || (themeOption.query === 'yellow walls, office, hum' && searchQuery.includes('yellow walls'));
                return (
                  <label 
                    key={themeOption.label}
                    className={`flex items-center gap-2 p-2 rounded border border-green-500/20 bg-black/40 hover:bg-green-500/5 cursor-pointer transition text-[9px] font-mono select-none ${
                      isSelected ? 'border-green-500/80 bg-green-500/10 text-green-400 font-semibold shadow-[0_0_8px_rgba(16,185,129,0.15)]' : 'text-green-500/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSearchQuery(themeOption.query);
                        setKeywords(themeOption.query);
                      }}
                      className="w-3.5 h-3.5 accent-green-500 cursor-pointer rounded border-green-500/30"
                    />
                    <span>{themeOption.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
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
              onBlur={() => window.scrollTo(0, 0)}
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

      {/* Cinematic Splash Loading Screen showing the Vault Gate */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9999, // ensures it sits on top of 3D Canvas
          backgroundColor: '#060a06',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 1.0s ease-in-out',
          opacity: showSplash ? 1.0 : 0.0,
          pointerEvents: showSplash ? 'auto' : 'none',
          userSelect: 'none'
        }}
      >
        <div 
          style={{
            position: 'relative',
            width: '90%',
            maxWidth: '560px',
            aspectRatio: '1.2',
            borderRadius: '6px',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            overflow: 'hidden',
            boxShadow: '0 0 50px rgba(0, 0, 0, 0.95)',
            backgroundColor: '#000000'
          }}
        >
          <img 
            src={vaultGateImg} 
            alt="M.E.G. Staging Entrance" 
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'brightness(0.7) contrast(1.1) saturate(0.9)'
            }}
          />
          <div 
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
              pointerEvents: 'none'
            }}
          />
          
          <div 
            className="animate-pulse"
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              fontFamily: 'monospace',
              fontSize: '9px',
              color: '#10b981',
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              padding: '6px 10px',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '4px',
              letterSpacing: '0.1em'
            }}
          >
            M.E.G. GATEWAY: INGRESS IN PROGRESS...
          </div>
        </div>
        
        <div 
          className="animate-pulse"
          style={{
            marginTop: '20px',
            fontFamily: 'monospace',
            fontSize: '10px',
            color: 'rgba(16, 185, 129, 0.7)',
            letterSpacing: '0.25em',
            textTransform: 'uppercase'
          }}
        >
          SYNCHRONIZING DIMENSIONAL LAYOUT... PLEASE WAIT
        </div>
      </div>

      {/* Retro CRT Scanline Flickers and Vignettes */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-scanlines opacity-[0.03]" />
      <div className="pointer-events-none fixed inset-0 z-50 bg-flicker" />
    </div>
  );
}
