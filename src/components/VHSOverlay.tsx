import React, { useEffect, useState } from 'react';

interface VHSOverlayProps {
  entityDistance: number;
}

export const VHSOverlay: React.FC<VHSOverlayProps> = ({ entityDistance }) => {
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

  // Determine static glitch opacity based on entity distance
  const getStaticIntensity = () => {
    if (entityDistance >= 8.0) return 0.02; // baseline scanline/VHS noise
    // linearly scale noise from 0.02 to 0.4 based on distance
    const progress = (8.0 - entityDistance) / 8.0; // 0 (far) to 1 (touching)
    return 0.02 + progress * 0.35;
  };

  const noiseOpacity = getStaticIntensity();

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
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping shrink-0" />
            <span className="font-semibold tracking-wider drop-shadow-md">REC</span>
          </div>
          <div className="text-right drop-shadow-md">
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
