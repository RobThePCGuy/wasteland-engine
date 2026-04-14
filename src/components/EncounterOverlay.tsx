import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Skull, Package, User, HelpCircle } from 'lucide-react';
import type { Encounter } from '../types/app';

interface EncounterOverlayProps {
  encounter: Encounter;
  onChoice: (action: string) => void;
}

const TYPE_ICONS: Record<string, any> = {
  narrative: HelpCircle,
  combat: Skull,
  item: Package,
  npc: User,
  choice: AlertTriangle,
};

export default function EncounterOverlay({ encounter, onChoice }: EncounterOverlayProps) {
  const Icon = TYPE_ICONS[encounter.type] || HelpCircle;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="crt fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="max-w-md w-full bg-black border-2 border-green-500 p-8 shadow-[0_0_50px_rgba(34,197,94,0.2)] relative overflow-hidden"
      >
        {/* Scanline effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] z-10 bg-[length:100%_2px]" />
        
        <div className="relative z-20">
          <div className="flex items-center gap-4 mb-6 border-b border-green-900 pb-4">
            <div className="p-3 bg-green-900/20 border border-green-500">
              <Icon className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tighter text-green-500 uppercase">
                {encounter.type} ENCOUNTER
              </h2>
              <div className="text-[10px] opacity-50 tracking-[0.3em]">WASTELAND EVENT DETECTED</div>
            </div>
          </div>

          <p className="text-lg text-green-300 mb-8 leading-relaxed italic">
            "{encounter.text}"
          </p>

          <div className="space-y-3">
            {encounter.type === 'choice' && encounter.data?.options ? (
              encounter.data.options.map((option: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => onChoice(option.action)}
                  className="w-full text-left border border-green-500 p-4 hover:bg-green-500 hover:text-black transition-all group flex justify-between items-center"
                >
                  <span className="font-bold uppercase tracking-widest">{option.text}</span>
                  <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">[SELECT]</span>
                </button>
              ))
            ) : (
              <button
                onClick={() => onChoice('continue')}
                className="w-full border border-green-500 p-4 hover:bg-green-500 hover:text-black transition-all font-bold uppercase tracking-widest"
              >
                CONTINUE
              </button>
            )}
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 p-2 opacity-20">
          <div className="text-[8px] font-mono">EVT_ID: {Math.random().toString(36).substring(7).toUpperCase()}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
