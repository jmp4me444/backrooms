import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, HelpCircle, ShieldAlert } from 'lucide-react';
import Synthesizer from '../audio/Synthesizer';

interface TerminalUIProps {
  onGenerate: (keywords: string) => void;
  isLoading: boolean;
}

interface LogLine {
  text: string;
  type: 'system' | 'success' | 'warning' | 'input' | 'help';
}

export const TerminalUI: React.FC<TerminalUIProps> = ({ onGenerate, isLoading }) => {
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Initial boot sequence
  useEffect(() => {
    const bootSequence = [
      { text: 'M.E.G. (MAJOR EXPLORER GROUP) - HOST TERMINAL v8.9.11', type: 'system' as const },
      { text: 'ESTABLISHING SECURE SATELLITE COMMS LINK TO SECTOR-07...', type: 'system' as const },
      { text: 'DECRYPTING ANOMALOUS GEOMETRY INTERFACE...', type: 'system' as const },
      { text: 'SYSTEM READY. ENGINE: THREE_VIEWPORT V3.1', type: 'success' as const },
      { text: '--------------------------------------------------', type: 'system' as const },
      { text: 'ENTER DESCRIPTIVE KEYWORDS TO SYNTHESIZE A 3D BACKROOMS LEVEL.', type: 'help' as const },
      { text: 'EXAMPLES: "industrial, red alarm, metal", "pool, flooded, tiles", "dark, moss, forest", "sterile hospital".', type: 'help' as const },
      { text: 'SUPPORTED COMMANDS: /help, /about, /clear', type: 'help' as const },
      { text: '--------------------------------------------------', type: 'system' as const },
    ];

    let timer = 0;
    bootSequence.forEach((line, index) => {
      timer = setTimeout(() => {
        setLogs(prev => [...prev, line]);
        // Trigger a tiny click noise for text typing
        if (index % 2 === 0) {
          Synthesizer.triggerEntityGlitch(); // will sound like a tiny terminal blip at low volume
        }
      }, index * 200);
    });

    return () => clearTimeout(timer);
  }, []);

  // Scroll to bottom of logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const cmd = input.trim();
    setLogs(prev => [...prev, { text: `> ${cmd}`, type: 'input' }]);
    setInput('');

    // Handle commands
    if (cmd.startsWith('/')) {
      const parts = cmd.toLowerCase().split(' ');
      const action = parts[0];

      if (action === '/help') {
        setLogs(prev => [
          ...prev,
          { text: 'AVAILABLE COMMANDS:', type: 'help' },
          { text: '  /help              - Display this helper catalog', type: 'help' },
          { text: '  /about             - Information about Major Explorer Group DB', type: 'help' },
          { text: '  /clear             - Wipe console log feeds', type: 'help' },
          { text: '  [any keywords]     - Type any keywords (e.g. dark, water, neon) to generate a room.', type: 'help' },
        ]);
      } else if (action === '/about') {
        setLogs(prev => [
          ...prev,
          { text: 'M.E.G. ARCHIVAL PROJECT: LEVEL SYNTHESIS TOOL', type: 'system' },
          { text: 'This console interfaces directly with localized dimensional metrics. By entering keywords, we can construct virtual projections of known and unmapped Backrooms levels, helping scouts simulate environmental hazards before entry.', type: 'system' },
          { text: 'DEVELOPMENT STATUS: STABLE SENSORY INTEGRATION.', type: 'success' },
        ]);
      } else if (action === '/clear') {
        setLogs([]);
      } else {
        setLogs(prev => [...prev, { text: `UNRECOGNIZED COMMAND: ${action}. TYPE /help FOR ASSISTANCE.`, type: 'warning' }]);
      }
    } else {
      // It's a keyword prompt
      setLogs(prev => [...prev, { text: `SYNTHESIZING LEVEL WITH METRIC PARAMETERS: "${cmd}"...`, type: 'system' }]);
      onGenerate(cmd);
    }

    // Release input focus to restore keyboard movement immediately
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const fillTemplate = (template: string) => {
    setInput(template);
  };

  return (
    <div className="flex flex-col bg-[#050906] border border-green-500/30 p-3 rounded font-mono text-xs text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.05)] w-full h-[320px] md:h-[400px]">
      {/* Console Title Bar */}
      <div className="flex items-center justify-between border-b border-green-500/20 pb-2 mb-2 select-none">
        <div className="flex items-center gap-1.5 font-bold tracking-wider">
          <Terminal className="w-4 h-4 text-green-400" />
          <span>M.E.G._CONSOLE.EXE</span>
        </div>
        <div className="text-[9px] px-1.5 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 uppercase">
          SECURE CONNECTION
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto mb-3 space-y-1.5 pr-2 custom-scrollbar">
        {logs.map((line, index) => {
          let color = 'text-green-500';
          if (line.type === 'success') color = 'text-emerald-400';
          if (line.type === 'warning') color = 'text-amber-500 flex items-center gap-1';
          if (line.type === 'input') color = 'text-yellow-400 font-semibold';
          if (line.type === 'help') color = 'text-green-400/80';

          return (
            <div key={index} className={`${color} leading-relaxed break-words`}>
              {line.type === 'warning' && <ShieldAlert className="w-3.5 h-3.5 inline text-amber-500" />}
              <span>{line.text}</span>
            </div>
          );
        })}
        {isLoading && (
          <div className="text-green-400 animate-pulse flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
            <span>SYNTHESIS IN PROGRESS... MODULATING GRID VIRTUAL CHANNELS...</span>
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {/* Recommended presets */}
      <div className="flex flex-wrap gap-1.5 mb-2 py-1.5 border-t border-green-500/10 select-none">
        <span className="text-[10px] text-green-500/50 flex items-center gap-1 mr-1">
          <HelpCircle className="w-3 h-3" /> SUGGESTED PRESETS:
        </span>
        <button
          onClick={() => fillTemplate('yellow walls, office, hum')}
          className="text-[9px] px-1.5 py-0.5 bg-green-500/5 border border-green-500/20 text-green-500/70 hover:bg-green-500/10 hover:text-green-400 rounded transition"
        >
          Lobby (Lvl 0)
        </button>
        <button
          onClick={() => fillTemplate('flooded pool, teal tiles, water drips')}
          className="text-[9px] px-1.5 py-0.5 bg-green-500/5 border border-green-500/20 text-green-500/70 hover:bg-green-500/10 hover:text-green-400 rounded transition"
        >
          Poolrooms (Lvl 37)
        </button>
        <button
          onClick={() => fillTemplate('rusty pipes, dark metal factory, red alarm')}
          className="text-[9px] px-1.5 py-0.5 bg-green-500/5 border border-green-500/20 text-green-500/70 hover:bg-green-500/10 hover:text-green-400 rounded transition"
        >
          Industrial (Lvl 2)
        </button>
        <button
          onClick={() => fillTemplate('dark creepy shadow entity')}
          className="text-[9px] px-1.5 py-0.5 bg-green-500/5 border border-green-500/20 text-green-500/70 hover:bg-green-500/10 hover:text-green-400 rounded transition"
        >
          Entity Danger (Lvl 6)
        </button>
        <button
          onClick={() => fillTemplate('sterile white hospital cabinet')}
          className="text-[9px] px-1.5 py-0.5 bg-green-500/5 border border-green-500/20 text-green-500/70 hover:bg-green-500/10 hover:text-green-400 rounded transition"
        >
          Clinic (Lvl 4)
        </button>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isLoading}
          placeholder={isLoading ? 'Computing matrix...' : 'Type keywords or commands here...'}
          className="flex-1 bg-black border border-green-500/30 px-3 py-1.5 rounded text-green-400 placeholder-green-500/30 outline-none focus:border-green-500/60 focus:ring-1 focus:ring-green-500/40 text-xs shadow-inner"
          autoFocus
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-green-500/10 hover:bg-green-500/25 border border-green-500/30 px-3 py-1.5 rounded text-green-400 hover:text-green-300 font-bold transition flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};

export default TerminalUI;
