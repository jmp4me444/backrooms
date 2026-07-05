import React, { useState } from 'react';
import type { LevelDossier, SearchableItem } from '../types';

import { ShieldCheck, Database, FolderOpen, FileText, ChevronRight } from 'lucide-react';

interface WikiDossierProps {
  dossier: LevelDossier;
  items: SearchableItem[];
}

export const WikiDossier: React.FC<WikiDossierProps> = ({ dossier, items }) => {
  const [activeItemTab, setActiveItemTab] = useState<string | null>(null);

  // Survival Difficulty color map
  const getDifficultyColorClass = (cls: string) => {
    switch (cls) {
      case 'Class 0':
        return {
          border: 'border-blue-600',
          bg: 'bg-blue-950/20',
          text: 'text-blue-400',
          labelBg: 'bg-blue-600 text-white',
        };
      case 'Class 1':
        return {
          border: 'border-emerald-600',
          bg: 'bg-emerald-950/20',
          text: 'text-emerald-400',
          labelBg: 'bg-emerald-600 text-white',
        };
      case 'Class 2':
        return {
          border: 'border-yellow-600',
          bg: 'bg-yellow-950/20',
          text: 'text-yellow-400',
          labelBg: 'bg-yellow-600 text-black font-bold',
        };
      case 'Class 3':
        return {
          border: 'border-orange-600',
          bg: 'bg-orange-950/20',
          text: 'text-orange-400',
          labelBg: 'bg-orange-600 text-white',
        };
      case 'Class 4':
        return {
          border: 'border-rose-600',
          bg: 'bg-rose-950/20',
          text: 'text-rose-400',
          labelBg: 'bg-rose-600 text-white',
        };
      case 'Class 5':
        return {
          border: 'border-red-950',
          bg: 'bg-red-950/30',
          text: 'text-red-500 animate-pulse',
          labelBg: 'bg-red-950 text-red-500 font-bold border border-red-500/30',
        };
      default:
        return {
          border: 'border-zinc-600',
          bg: 'bg-zinc-950/20',
          text: 'text-zinc-400',
          labelBg: 'bg-zinc-600 text-white',
        };
    }
  };

  const diffColors = getDifficultyColorClass(dossier.difficultyClass);
  const foundCount = items.filter(i => i.found).length;

  return (
    <div className="bg-[#fcf8f2] text-[#2c2b29] border border-[#d3ccbc] p-4 md:p-6 rounded font-serif shadow-sm">
      
      {/* Wiki Database Title Header */}
      <div className="flex items-center gap-2.5 border-b-2 border-[#8a8074] pb-3 mb-5 select-none font-sans">
        <Database className="w-6 h-6 text-[#8a8074]" />
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#8a8074] m-0 leading-tight">
            M.E.G. CENTRAL ARCHIVES
          </h2>
          <p className="text-[10px] text-[#a09587] m-0 uppercase tracking-widest leading-none mt-0.5">
            Level Data Vault & Exploratory Logs
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side Navigation Panel (Aesthetic Wiki Side Menu) */}
        <div className="lg:col-span-1 border-r border-[#e9e3d5] pr-4 font-sans text-xs select-none hidden lg:block">
          <div className="space-y-4">
            <div>
              <h4 className="font-bold text-[#8a8074] border-b border-[#e9e3d5] pb-1 mb-2 uppercase tracking-wide">
                Database Hub
              </h4>
              <ul className="space-y-1.5 list-none p-0 m-0">
                <li className="flex items-center gap-1 text-[#6f675f] hover:text-[#2c2b29] cursor-pointer">
                  <ChevronRight className="w-3.5 h-3.5 text-[#a09587]" />
                  <span>Main Database Page</span>
                </li>
                <li className="flex items-center gap-1 text-[#6f675f] hover:text-[#2c2b29] cursor-pointer">
                  <ChevronRight className="w-3.5 h-3.5 text-[#a09587]" />
                  <span>Recent Breaches</span>
                </li>
                <li className="flex items-center gap-1 text-[#6f675f] hover:text-[#2c2b29] cursor-pointer">
                  <ChevronRight className="w-3.5 h-3.5 text-[#a09587]" />
                  <span>M.E.G. Guidelines</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-[#8a8074] border-b border-[#e9e3d5] pb-1 mb-2 uppercase tracking-wide">
                Levels Archive
              </h4>
              <ul className="space-y-1.5 list-none p-0 m-0">
                <li className="text-[#6f675f] hover:text-[#2c2b29] cursor-pointer font-bold">
                  » {dossier.levelNumber} (Current)
                </li>
                <li className="flex items-center gap-1 text-[#6f675f] hover:text-[#2c2b29] cursor-pointer">
                  <ChevronRight className="w-3.5 h-3.5 text-[#a09587]" />
                  <span>Level 0: "The Lobby"</span>
                </li>
                <li className="flex items-center gap-1 text-[#6f675f] hover:text-[#2c2b29] cursor-pointer">
                  <ChevronRight className="w-3.5 h-3.5 text-[#a09587]" />
                  <span>Level 37: "Poolrooms"</span>
                </li>
                <li className="flex items-center gap-1 text-[#6f675f] hover:text-[#2c2b29] cursor-pointer">
                  <ChevronRight className="w-3.5 h-3.5 text-[#a09587]" />
                  <span>Level 4: "Hospital"</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right Side Main Wiki Entry */}
        <div className="lg:col-span-3">
          
          {/* Main Wiki Title */}
          <div className="mb-4">
            <h1 className="text-2xl md:text-3xl font-bold font-serif text-[#222222] m-0">
              {dossier.levelNumber}
            </h1>
            <p className="italic text-sm text-[#6f675f] m-0 mt-0.5">
              Standard designation: {dossier.levelName}
            </p>
          </div>

          {/* Survival Difficulty Box (Wikidot layout) */}
          <div className={`border-2 ${diffColors.border} ${diffColors.bg} flex flex-col sm:flex-row items-stretch rounded mb-6 overflow-hidden`}>
            <div className={`${diffColors.labelBg} px-4 py-3 flex flex-col justify-center items-center font-sans font-extrabold text-[11px] uppercase tracking-wider text-center sm:w-44 shrink-0`}>
              <ShieldCheck className="w-6 h-6 mb-1" />
              <span>Survival Difficulty</span>
              <span className="text-sm font-black mt-0.5">{dossier.difficultyClass}</span>
            </div>
            <div className="px-4 py-3 font-sans text-xs flex flex-col justify-center">
              <div className={`font-bold ${diffColors.text} uppercase tracking-wide`}>
                {dossier.difficultyClass === 'Class 5' ? '» DEADLY HAZARD DETECTED «' : 'M.E.G. SAFETY RATING'}
              </div>
              <p className="m-0 mt-1 text-[#4e4d4a] font-medium leading-relaxed">
                {dossier.difficultyText}
              </p>
            </div>
          </div>

          {/* Body Sections */}
          <div className="space-y-5 text-sm md:text-base leading-relaxed text-[#2c2b29]">
            
            {/* Description */}
            <div>
              <h3 className="text-base font-sans font-bold border-b border-[#d3ccbc] pb-0.5 mb-2 text-[#7c2d12] uppercase tracking-wide">
                Description
              </h3>
              <p className="m-0 indent-4" dangerouslySetInnerHTML={{ __html: dossier.description }} />
            </div>

            {/* Properties */}
            <div>
              <h3 className="text-base font-sans font-bold border-b border-[#d3ccbc] pb-0.5 mb-2 text-[#7c2d12] uppercase tracking-wide">
                Environmental Properties
              </h3>
              <ul className="list-disc pl-5 space-y-1 mt-1 text-sm">
                {dossier.properties.map((prop, idx) => (
                  <li key={idx} className="pl-1">{prop}</li>
                ))}
              </ul>
            </div>

            {/* Entities */}
            <div>
              <h3 className="text-base font-sans font-bold border-b border-[#d3ccbc] pb-0.5 mb-2 text-[#7c2d12] uppercase tracking-wide">
                Entities
              </h3>
              <p className="m-0 text-sm italic">{dossier.entitiesText}</p>
            </div>

            {/* Discovery Logs / Explorer Journals */}
            <div>
              <h3 className="text-base font-sans font-bold border-b border-[#d3ccbc] pb-0.5 mb-2 text-[#7c2d12] uppercase tracking-wide">
                Expedition & Discovery Logs
              </h3>
              <div className="bg-[#f0ebd9] border-l-4 border-[#c5ba9d] p-3 font-mono text-xs text-[#524d45] italic rounded shadow-inner leading-relaxed">
                {dossier.discoveryLog}
              </div>
            </div>

            {/* Searchable Items / Intel Database (Integrates 3D exploration and Wiki) */}
            <div className="pt-2 border-t border-[#d3ccbc]">
              <h3 className="text-base font-sans font-bold text-[#7c2d12] uppercase tracking-wide flex items-center justify-between mb-2">
                <span>Recovered Intel Database</span>
                <span className="text-[10px] bg-[#8a8074]/15 text-[#6f675f] px-2 py-0.5 rounded font-sans font-semibold">
                  INTELLIGENCE STATUS: {foundCount} / {items.length} LOCATED
                </span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {items.map(item => {
                  const isFound = item.found;
                  const isActive = activeItemTab === item.id;
                  
                  return (
                    <div 
                      key={item.id} 
                      className={`border rounded p-2 transition flex flex-col ${
                        isFound 
                          ? 'border-emerald-600 bg-emerald-50/50 hover:bg-emerald-50 cursor-pointer' 
                          : 'border-dashed border-[#ccc5b9] bg-[#f9f5ed]/30 opacity-60'
                      }`}
                      onClick={() => isFound && setActiveItemTab(isActive ? null : item.id)}
                    >
                      <div className="flex items-center gap-2">
                        {isFound ? (
                          <FolderOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                        <div className="font-sans text-[11px] font-bold text-[#3c3b38] truncate">
                          {item.name}
                        </div>
                      </div>
                      <div className="font-sans text-[9px] text-gray-500 mt-1 italic leading-normal">
                        {isFound ? 'Decryption Completed. Click to read.' : '🔒 File encrypted. Locate in 3D level.'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* expanded log readout */}
              {activeItemTab && (
                <div className="mt-3 bg-[#ffffff] border border-emerald-600 p-4 rounded shadow-inner animate-fadeIn">
                  {items.map(item => {
                    if (item.id === activeItemTab && item.found) {
                      return (
                        <div 
                          key={item.id} 
                          className="font-sans text-xs text-[#333333] prose-sm"
                          dangerouslySetInnerHTML={{ __html: item.content }}
                        />
                      );
                    }
                    return null;
                  })}
                  <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end">
                    <button 
                      onClick={() => setActiveItemTab(null)}
                      className="text-[10px] font-sans font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded"
                    >
                      CLOSE FILE READER
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default WikiDossier;
