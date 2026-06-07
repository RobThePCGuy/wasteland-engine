import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Wrench, Package, AlertCircle } from 'lucide-react';

interface ScavengingModalProps {
  onSuccess: (loot: { type: string; amount: number }) => void;
  onClose: () => void;
  resourceType?: string;
  resourceAmount?: number;
}

export default function ScavengingModal({ onSuccess, onClose, resourceType = 'scrap', resourceAmount = 1 }: ScavengingModalProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'scavenging' | 'success' | 'failed'>('scavenging');

  useEffect(() => {
    if (status !== 'scavenging') return;

    const interval = setInterval(() => {
      setProgress(p => {
        const next = p + Math.random() * 15;
        if (next >= 100) {
          clearInterval(interval);
          setStatus('success');
          setTimeout(() => onSuccess({ type: resourceType, amount: resourceAmount }), 1500);
          return 100;
        }
        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [status, resourceType, resourceAmount, onSuccess]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="crt fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono"
    >
      <div className="bg-black border-2 border-amber-500 w-full max-w-md flex flex-col text-amber-500 p-6 relative overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.2)]">
        {/* Scanline effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] z-10 bg-[length:100%_4px]" />
        
        <div className="flex justify-between items-center border-b border-amber-500/50 pb-4 mb-4 relative z-20">
          <div className="flex items-center gap-3">
            <Wrench className="w-6 h-6" />
            <h2 className="text-xl font-bold tracking-widest uppercase">Scavenging</h2>
          </div>
          <button onClick={onClose} className="text-amber-500 hover:text-amber-300 hover:bg-amber-900/30 px-3 py-1 border border-transparent hover:border-amber-500 transition-colors">
            [ CANCEL ]
          </button>
        </div>

        <div className="flex-1 flex flex-col relative z-20 items-center justify-center py-8">
          {status === 'scavenging' ? (
            <>
              <p className="mb-4 text-center">Searching through the debris...</p>
              <div className="w-full h-4 bg-amber-900/30 border border-amber-500 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-amber-500" 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs opacity-70">{Math.floor(progress)}% Complete</p>
            </>
          ) : status === 'success' ? (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center text-green-500"
            >
              <Package className="w-16 h-16 mb-4" />
              <h3 className="text-2xl font-bold">LOOT SECURED</h3>
              <p className="mt-2 text-amber-300">Found {resourceAmount}x {resourceType.toUpperCase()}</p>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center text-red-500"
            >
              <AlertCircle className="w-16 h-16 mb-4" />
              <h3 className="text-2xl font-bold">NOTHING FOUND</h3>
              <p className="mt-2 opacity-70">The area has been picked clean.</p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
