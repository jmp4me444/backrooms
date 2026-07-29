import React from 'react';

interface SwitchControlsHUDProps {
  controllerName: string;
}

export const SwitchControlsHUD: React.FC<SwitchControlsHUDProps> = ({ controllerName }) => {
  return (
    <div className="fixed top-4 right-4 z-50 pointer-events-none flex items-center space-x-3 bg-black/85 backdrop-blur-md border border-red-500/60 rounded-xl px-4 py-2 text-white shadow-2xl animate-fade-in">
      {/* Nintendo Switch Joy-Con Icon */}
      <div className="flex items-center space-x-1">
        <div className="w-3.5 h-7 bg-cyan-400 rounded-l-md border border-cyan-200 flex flex-col justify-between items-center py-1">
          <div className="w-1.5 h-1.5 bg-black rounded-full" />
          <div className="w-1 h-1 bg-black rounded-full" />
        </div>
        <div className="w-3.5 h-7 bg-red-500 rounded-r-md border border-red-300 flex flex-col justify-between items-center py-1">
          <div className="w-1 h-1 bg-black rounded-full" />
          <div className="w-1.5 h-1.5 bg-black rounded-full" />
        </div>
      </div>

      <div className="flex flex-col">
        <span className="text-xs font-bold tracking-wider text-red-400 uppercase">
          Nintendo Switch Edition
        </span>
        <span className="text-[10px] text-gray-300 font-mono truncate max-w-[180px]">
          {controllerName.includes('Joy-Con') ? 'Joy-Con Pair Active' : 'Switch Controller Connected'}
        </span>
      </div>

      {/* Button Tooltip Bar */}
      <div className="hidden sm:flex items-center space-x-2 text-[10px] text-gray-300 border-l border-gray-700 pl-3">
        <span className="bg-gray-800 border border-gray-600 px-1.5 py-0.5 rounded text-cyan-300 font-mono font-bold">L-Stick</span>
        <span>Move</span>
        <span className="bg-gray-800 border border-gray-600 px-1.5 py-0.5 rounded text-red-300 font-mono font-bold">R-Stick</span>
        <span>Look</span>
        <span className="bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">ZR</span>
        <span>Hammer</span>
        <span className="bg-cyan-600 text-white px-1.5 py-0.5 rounded font-bold">ZL</span>
        <span>Flashlight</span>
      </div>
    </div>
  );
};

export default SwitchControlsHUD;
