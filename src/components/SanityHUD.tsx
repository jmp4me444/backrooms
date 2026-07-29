import React, { useEffect, useState } from 'react';
import Synthesizer from '../audio/Synthesizer';

interface SanityHUDProps {
  isLevelLoaded: boolean;
  onPlayerDeath?: () => void;
}

interface BottleLocation {
  id: number;
  x: number; // 0 to 14
  z: number; // 0 to 14
}

export const SanityHUD: React.FC<SanityHUDProps> = ({ isLevelLoaded, onPlayerDeath }) => {
  const [sanity, setSanity] = useState<number>(100);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [bottles, setBottles] = useState<BottleLocation[]>([]);
  const [nearbyBottle, setNearbyBottle] = useState<BottleLocation | null>(null);
  const [hudNotice, setHudNotice] = useState<string | null>(null);

  // Generate 15 Almond Milk bottles on 2D map when level loads
  useEffect(() => {
    if (!isLevelLoaded) {
      setIsActive(false);
      setSanity(100);
      setBottles([]);
      setNearbyBottle(null);
      return;
    }

    // Generate 15 bottle locations scattered across 14x14 grid
    const newBottles: BottleLocation[] = [];
    for (let i = 0; i < 15; i++) {
      newBottles.push({
        id: i,
        x: Math.floor(Math.random() * 12) + 1,
        z: Math.floor(Math.random() * 12) + 1
      });
    }
    setBottles(newBottles);

    const activateTimer = setTimeout(() => {
      setIsActive(true);
      setSanity(100);
    }, 10000); // 10 seconds post-load delay

    return () => clearTimeout(activateTimer);
  }, [isLevelLoaded]);

  // Listen for 3D Almond Milk bottle pickup in front of stairs
  useEffect(() => {
    const handleDrinkEvent = () => {
      setSanity(prev => Math.min(100, prev + 35));
      setHudNotice('DRANK ALMOND MILK AT STAIRS! (+35% SANITY RESTORED)');
      setTimeout(() => {
        setHudNotice(null);
      }, 3500);
    };

    window.addEventListener('DRINK_ALMOND_MILK', handleDrinkEvent);
    return () => window.removeEventListener('DRINK_ALMOND_MILK', handleDrinkEvent);
  }, []);

  // Periodic proximity detection: highlights nearby bottles as player wanders
  useEffect(() => {
    if (!isActive || bottles.length === 0) return;

    const scanInterval = setInterval(() => {
      if (Math.random() < 0.65 && bottles.length > 0) {
        const randomNearby = bottles[Math.floor(Math.random() * bottles.length)];
        setNearbyBottle(randomNearby);
      } else {
        setNearbyBottle(null);
      }
    }, 4500);

    return () => clearInterval(scanInterval);
  }, [isActive, bottles]);

  // Baseline Sanity drain timer (1% every 4 seconds)
  useEffect(() => {
    if (!isActive) return;

    const drainInterval = setInterval(() => {
      setSanity(prev => {
        const next = Math.max(0, prev - 1);
        if (next <= 0 && onPlayerDeath) {
          onPlayerDeath();
        }
        return next;
      });
    }, 4000);

    return () => clearInterval(drainInterval);
  }, [isActive, onPlayerDeath]);

  // Drink Almond Milk action
  const handleDrinkMilk = (bottleId?: number) => {
    if (bottles.length === 0) return;

    Synthesizer.triggerDrinkSound();
    
    // Remove consumed bottle from radar
    const targetId = bottleId ?? bottles[0].id;
    const remaining = bottles.filter(b => b.id !== targetId);
    setBottles(remaining);
    setNearbyBottle(null);

    setSanity(prev => Math.min(100, prev + 35));
    setHudNotice(`DRANK ALMOND MILK! (+35% SANITY RESTORED - ${remaining.length} BOTTLES REMAINING)`);

    setTimeout(() => {
      setHudNotice(null);
    }, 3500);
  };

  // Keyboard shortcut E or M to drink nearby Almond Milk
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'e' || e.key === 'E' || e.key === 'm' || e.key === 'M') {
        if (nearbyBottle) {
          handleDrinkMilk(nearbyBottle.id);
        } else if (bottles.length > 0) {
          handleDrinkMilk(bottles[0].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, nearbyBottle, bottles]);

  if (!isActive) return null;

  const currentSanity = Math.round(sanity);

  return (
    <div className="fixed top-4 right-4 z-50 pointer-events-auto select-none font-mono flex flex-col items-end gap-2">
      {/* Retro Sanity Meter Badge */}
      <div className="flex items-center gap-2 bg-black/85 border border-white/30 px-3 py-1.5 rounded-lg shadow-2xl backdrop-blur-md">
        <span className={`text-[10px] md:text-xs font-bold tracking-wider ${currentSanity < 30 ? 'text-red-400 animate-pulse' : currentSanity < 60 ? 'text-yellow-300' : 'text-emerald-400'}`}>
          SANITY: {currentSanity}%
        </span>
        <div className="w-28 md:w-36 h-3 bg-gray-950 border border-white/40 rounded overflow-hidden p-0.5">
          <div 
            className={`h-full rounded-sm transition-all duration-500 ${currentSanity < 30 ? 'bg-red-500 animate-pulse' : currentSanity < 60 ? 'bg-yellow-400' : 'bg-gradient-to-r from-emerald-500 to-cyan-400'}`}
            style={{ width: `${currentSanity}%` }}
          />
        </div>
      </div>

      {/* 2D Almond Milk Radar Mini-Scanner */}
      <div className="flex flex-col items-end bg-black/90 border border-emerald-500/40 p-2 rounded-lg shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between w-full gap-3 text-[9px] font-bold text-emerald-400 border-b border-emerald-500/30 pb-1 mb-1">
          <span>📡 ALMOND MILK RADAR</span>
          <span>{bottles.length} REMAINING</span>
        </div>
        <div className="relative w-28 h-28 bg-emerald-950/40 border border-emerald-500/30 rounded overflow-hidden flex items-center justify-center">
          {/* Radar Scan Grid Lines */}
          <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:10px_10px] opacity-30" />
          
          {/* Glowing Green Dots for Almond Milk Bottles */}
          {bottles.map(b => (
            <div 
              key={b.id}
              className={`absolute w-2 h-2 rounded-full ${nearbyBottle?.id === b.id ? 'bg-yellow-300 animate-ping' : 'bg-emerald-400 animate-pulse'}`}
              style={{
                left: `${(b.x / 14) * 100}%`,
                top: `${(b.z / 14) * 100}%`
              }}
            />
          ))}
        </div>
      </div>

      {/* Proximity Pickup Prompt */}
      {nearbyBottle ? (
        <button
          onClick={() => handleDrinkMilk(nearbyBottle.id)}
          className="flex items-center gap-2 bg-emerald-950/95 hover:bg-emerald-900 border border-yellow-400/80 text-yellow-300 text-[10px] font-bold px-3 py-1.5 rounded shadow-xl backdrop-blur-md transition active:scale-95 animate-bounce"
        >
          <span>🍾 ALMOND MILK SPOTTED! DRINK [PRESS E]</span>
          <span className="text-emerald-400 text-[9px]">(+35%)</span>
        </button>
      ) : bottles.length > 0 ? (
        <button
          onClick={() => handleDrinkMilk(bottles[0].id)}
          className="flex items-center gap-2 bg-emerald-950/75 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-[9px] font-bold px-2.5 py-1 rounded shadow-md backdrop-blur-md transition active:scale-95"
        >
          <span>🍾 DRINK ALMOND MILK FROM RADAR</span>
          <span className="text-emerald-400/80 text-[8px]">({bottles.length} LEFT)</span>
        </button>
      ) : null}

      {/* Temporary HUD Notice */}
      {hudNotice && (
        <div className="text-[9px] text-emerald-400 font-bold bg-black/90 border border-emerald-500/40 px-2.5 py-1 rounded shadow-md animate-pulse">
          {hudNotice}
        </div>
      )}
    </div>
  );
};

export default SanityHUD;
