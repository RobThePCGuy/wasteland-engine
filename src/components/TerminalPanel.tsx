import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { DialogueState, NarrativeEntry, TradeState } from '../types/app';

function TypingText({ text, speed = 10, onComplete }: { text: string; speed?: number; onComplete?: () => void }) {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[index]);
        setIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [index, text, speed, onComplete]);

  return <span>{displayedText}</span>;
}

interface TerminalPanelProps {
  tradeState: TradeState | null;
  onCloseTrade: () => void;
  onTradeAction: (itemId: number, action: 'buy' | 'sell', quantity?: number) => void | Promise<void>;
  gameState: any;
  isGenerating: boolean;
  dialogueState: DialogueState | null;
  onDialogueOption: (option: any) => void | Promise<void>;
  feed: NarrativeEntry[];
  onOpenPipBoy: () => void;
  onRecap: () => void | Promise<void>;
  onSaveGame: () => void | Promise<void>;
  onLogout: () => void;
}

export default function TerminalPanel({
  tradeState,
  onCloseTrade,
  onTradeAction,
  gameState,
  isGenerating,
  dialogueState,
  onDialogueOption,
  feed,
  onOpenPipBoy,
  onRecap,
  onSaveGame,
  onLogout,
}: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [feed, dialogueState]);

  return (
    <div className="crt h-full w-full border border-green-500 p-4 flex flex-col relative overflow-hidden bg-black">
      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] z-10 bg-[length:100%_2px]" />
      
      {/* CRT Flicker */}
      <motion.div 
        animate={{ opacity: [0.02, 0.08, 0.04, 0.06, 0.02] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 pointer-events-none bg-green-500/5 z-10"
      />

      {tradeState ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center border-b border-green-500 pb-2 mb-4">
            <h2 className="text-xl">TRADING WITH {tradeState.npc.name.toUpperCase()}</h2>
            <button onClick={onCloseTrade} className="border border-green-500 px-2 py-1 text-sm hover:bg-green-900">LEAVE</button>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
            <div className="border border-green-900 p-2 flex flex-col overflow-hidden">
              <h3 className="text-lg text-green-300 mb-2 border-b border-green-900 pb-1">VENDOR INVENTORY</h3>
              <div className="flex-1 overflow-y-auto pr-2">
                {tradeState.inventory.map((item: any) => (
                  <div key={item.id} className="mb-2 p-2 border border-green-900/50 flex justify-between items-center">
                    <div>
                      <div className="text-sm">{item.name} (x{item.quantity})</div>
                      <div className="text-xs opacity-70">Cost: {item.value} caps</div>
                    </div>
                    {!isGenerating && (
                      <button onClick={() => onTradeAction(item.id, 'buy')} className="bg-green-900 px-2 py-1 text-xs hover:bg-green-700">
                        BUY
                      </button>
                    )}
                  </div>
                ))}
                {tradeState.inventory.length === 0 && <div className="text-sm opacity-50">Vendor has no items.</div>}
              </div>
            </div>

            <div className="border border-green-900 p-2 flex flex-col overflow-hidden">
              <h3 className="text-lg text-green-300 mb-2 border-b border-green-900 pb-1">YOUR INVENTORY</h3>
              <div className="flex-1 overflow-y-auto pr-2">
                {gameState?.inventory?.map((item: any) => (
                  <div key={item.id} className="mb-2 p-2 border border-green-900/50 flex justify-between items-center">
                    <div>
                      <div className="text-sm">{item.name} (x{item.quantity})</div>
                      <div className="text-xs opacity-70">Value: {Math.floor(item.value * 0.5)} caps</div>
                    </div>
                    {!isGenerating && (
                      <button onClick={() => onTradeAction(item.id, 'sell')} className="bg-green-900 px-2 py-1 text-xs hover:bg-green-700">
                        SELL
                      </button>
                    )}
                  </div>
                ))}
                {(!gameState?.inventory || gameState.inventory.length === 0) && <div className="text-sm opacity-50">You have no items.</div>}
              </div>
            </div>
          </div>
        </div>
      ) : dialogueState ? (
        <div className="flex-1 flex flex-col">
          <h2 className="text-xl border-b border-green-500 pb-2 mb-4">DIALOGUE: {dialogueState.npcName.toUpperCase()}</h2>
          <div className="flex-1 overflow-y-auto mb-4" ref={scrollRef}>
            <p className="text-lg text-green-300 mb-4">
              "<TypingText text={dialogueState.text} speed={15} />"
            </p>
          </div>
          <div className="border-t border-green-500 pt-4 flex flex-col gap-2">
            {!isGenerating && dialogueState.options.map((option: any, index: number) => (
              <button
                key={index}
                onClick={() => onDialogueOption(option)}
                className="text-left border border-green-900 p-2 hover:bg-green-900 text-sm"
              >
                <span className="opacity-50 mr-2">[{index + 1}]</span>
                {option.text}
                <span className="ml-2 text-xs opacity-50 uppercase">[{option.action}]</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-xl border-b border-green-500 pb-2 mb-4">TERMINAL OUTPUT</h2>
          <div className="flex-1 overflow-y-auto flex flex-col gap-2" ref={scrollRef}>
            {feed.map((entry, index) => (
              <motion.div 
                key={index} 
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className={`text-sm ${entry.type === 'system' ? 'opacity-50' : ''} ${entry.type === 'dialogue' ? 'text-green-300' : ''} ${entry.type === 'event' ? 'italic text-green-400' : ''} ${entry.type === 'error' ? 'text-red-500 font-bold' : ''}`}
              >
                {'>'} <TypingText text={entry.text} speed={5} />
              </motion.div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 border-t border-green-500 pt-4 flex gap-2 overflow-x-auto">
        {!isGenerating && (
          <>
            <button onClick={onOpenPipBoy} className="border border-green-500 px-4 py-2 hover:bg-green-900 whitespace-nowrap">PIP-BOY</button>
            <button onClick={onRecap} className="border border-green-500 px-4 py-2 hover:bg-green-900 whitespace-nowrap">RECAP</button>
            <button onClick={onSaveGame} className="border border-green-500 px-4 py-2 hover:bg-green-900 whitespace-nowrap">SAVE GAME</button>
            <button onClick={onLogout} className="border border-green-500 px-4 py-2 hover:bg-green-900 whitespace-nowrap">LOGOUT</button>
          </>
        )}
      </div>
    </div>
  );
}