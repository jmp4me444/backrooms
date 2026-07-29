import React, { useEffect, useState } from 'react';

interface VHSOverlayProps {
  entityDistance: number;
  sanity?: number;
  isSanityActive?: boolean;
}

export const VHSOverlay: React.FC<VHSOverlayProps> = ({ entityDistance, sanity = 100, isSanityActive = false }) => {
  const [timestamp, setTimestamp] = useState('00:00:00');
  
  // Format current elapsed time
  useEffect(() => {
    let seconds = 0;
    const interval = setInterval(() => {
      seconds++;
      const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
      const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      setTimestamp(`${hrs}:${mins}:${secs}`);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Determine static glitch opacity based on entity distance & sanity
  const getStaticIntensity = () => {
    let noise = 0.02;
    if (entityDistance < 8.0) {
      const progress = (8.0 - entityDistance) / 8.0;
      noise += progress * 0.35;
    }
    if (isSanityActive && sanity < 30) {
      noise += ((30 - Math.max(0, sanity)) / 30) * 0.25;
    }
    return Math.min(0.7, noise);
  };

  const noiseOpacity = getStaticIntensity();
  const currentSanity = Math.max(0, Math.min(100, Math.round(sanity)));

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden select-none">
      
      {/* Scanline Grid Overlay */}
      <div className="absolute inset-0 bg-scanlines opacity-[0.08]" />

      {/* Screen Flickering Filter */}
      <div className="absolute inset-0 bg-flicker pointer-events-none" />

      {/* Retro VHS Vitals HUD */}
      <div className="absolute inset-0 font-mono text-[9px] md:text-[10px] text-white/80 p-4 flex flex-col justify-between h-full vhs-text">
        {/* Top bar */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping shrink-0" />
            <span className="font-semibold tracking-wider drop-shadow-md">REC</span>
          </div>

          {/* Retro Sanity Meter - Fades in 3 seconds after level finishes loading */}
          {isSanityActive && (
            <div className="flex items-center gap-2 bg-black/80 border border-white/30 px-3 py-1 rounded shadow-lg backdrop-blur-md transition-opacity duration-1000 animate-fade-in">
              <span className={`text-[9px] font-bold font-mono tracking-wider ${currentSanity < 30 ? 'text-red-400 animate-pulse' : currentSanity < 60 ? 'text-yellow-300' : 'text-emerald-400'}`}>
                SANITY: {currentSanity}%
              </span>
              <div className="w-24 md:w-32 h-2.5 bg-gray-950 border border-white/40 rounded overflow-hidden p-0.5">
                <div 
                  className={`h-full rounded-sm transition-all duration-300 ${currentSanity < 30 ? 'bg-red-500 animate-pulse' : currentSanity < 60 ? 'bg-yellow-400' : 'bg-gradient-to-r from-emerald-500 to-cyan-400'}`}
                  style={{ width: `${currentSanity}%` }}
                />
              </div>
            </div>
          )}

          <div className="text-right drop-shadow-md hidden sm:block">
            AMB 3D_SENSORS
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex justify-between items-end mt-auto">
          <div className="drop-shadow-md pb-1">
            <span>PLAY</span>
            <span className="ml-2">▶</span>
            <div className="text-[8px] text-white/40">SP MODE</div>
          </div>
          <div className="text-right drop-shadow-md pb-1">
            <span>{timestamp}</span>
            <div className="text-[8px] text-white/40">JULY 04, 2026</div>
          </div>
        </div>
      </div>

      {/* Noise/Static Overlay - intensifies when near entities */}
      <div 
        className="absolute inset-0 bg-vhs-static mix-blend-screen pointer-events-none transition-opacity duration-100"
        style={{ opacity: noiseOpacity }}
      />

      {/* CRT Corner Vignette */}
      <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.85)]" />
      <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.6)]" />
    </div>
  );
};

export default VHSOverlay;
