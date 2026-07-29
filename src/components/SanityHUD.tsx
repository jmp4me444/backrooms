import React, { useEffect, useState } from 'react';
import Synthesizer from '../audio/Synthesizer';

interface SanityHUDProps {
  isLevelLoaded: boolean;
  onPlayerDeath?: () => void;
}

export const SanityHUD: React.FC<SanityHUDProps> = ({ isLevelLoaded, onPlayerDeath }) => {
  const [sanity, setSanity] = useState<number>(100);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [bottlesCount, setBottlesCount] = useState<number>(10);
  const [hudNotice, setHudNotice] = useState<string | null>(null);

  // Reset & delay activation until 10s after level is fully loaded
  useEffect(() => {
    if (!isLevelLoaded) {
      setIsActive(false);
      setSanity(100);
      setBottlesCount(10);
      return;
    }

    const activateTimer = setTimeout(() => {
      setIsActive(true);
      setSanity(100);
      setBottlesCount(10);
    }, 10000); // 10 seconds post-load delay

    return () => clearTimeout(activateTimer);
  }, [isLevelLoaded]);

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
  const handleDrinkMilk = () => {
    if (bottlesCount <= 0) return;
    
    Synthesizer.triggerDrinkSound();
    const nextCount = bottlesCount - 1;
    setBottlesCount(nextCount);
    setSanity(prev => Math.min(100, prev + 35));
    setHudNotice(`DRANK ALMOND MILK! (+35% SANITY RESTORED - ${nextCount} BOTTLES LEFT)`);

    setTimeout(() => {
      setHudNotice(null);
    }, 3500);
  };

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

      {/* 10 Almond Milk Bottles Supply Action Button */}
      {bottlesCount > 0 ? (
        <button
          onClick={handleDrinkMilk}
          className="flex items-center gap-2 bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold px-3 py-1.5 rounded shadow-lg backdrop-blur-md transition active:scale-95 animate-bounce"
        >
          <span>🍾 DRINK ALMOND MILK</span>
          <span className="text-emerald-400/80 text-[9px]">({bottlesCount} LEFT)</span>
        </button>
      ) : (
        <div className="text-[9px] text-red-400 font-bold bg-black/80 border border-red-500/30 px-2.5 py-1 rounded">
          OUT OF ALMOND MILK!
        </div>
      )}

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
