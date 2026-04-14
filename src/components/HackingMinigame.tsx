import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Terminal, Lock, Unlock, AlertTriangle } from 'lucide-react';

interface HackingMinigameProps {
  onSuccess: () => void;
  onFail: () => void;
  onClose: () => void;
  difficulty?: 'easy' | 'medium' | 'hard';
}

const WORDS = {
  easy: ['FALLOUT', 'VAULT', 'WASTE', 'WATER', 'POWER', 'RADIO', 'GHOUL', 'CAPS', 'STIM', 'RUST'],
  medium: ['RADIATION', 'SCAVENGER', 'BROTHERHOOD', 'MUTATION', 'SURVIVAL', 'WASTELAND', 'TERMINAL', 'SECURITY'],
  hard: ['APOCALYPSE', 'DESTRUCTION', 'OVERSEER', 'TECHNOLOGY', 'REVOLUTION', 'EXPERIMENTAL', 'GOVERNMENT']
};

export default function HackingMinigame({ onSuccess, onFail, onClose, difficulty = 'easy' }: HackingMinigameProps) {
  const [words, setWords] = useState<string[]>([]);
  const [password, setPassword] = useState<string>('');
  const [attempts, setAttempts] = useState(4);
  const [history, setHistory] = useState<{ word: string; match: number }[]>([]);
  const [status, setStatus] = useState<'playing' | 'success' | 'locked'>('playing');

  useEffect(() => {
    const wordList = WORDS[difficulty];
    const shuffled = [...wordList].sort(() => 0.5 - Math.random()).slice(0, 6);
    setWords(shuffled);
    setPassword(shuffled[Math.floor(Math.random() * shuffled.length)]);
  }, [difficulty]);

  const getMatchCount = (guess: string, target: string) => {
    let count = 0;
    for (let i = 0; i < Math.min(guess.length, target.length); i++) {
      if (guess[i] === target[i]) count++;
    }
    return count;
  };

  const handleGuess = (guess: string) => {
    if (status !== 'playing') return;

    const match = getMatchCount(guess, password);
    setHistory(prev => [...prev, { word: guess, match }]);

    if (guess === password) {
      setStatus('success');
      setTimeout(onSuccess, 1500);
    } else {
      const newAttempts = attempts - 1;
      setAttempts(newAttempts);
      if (newAttempts <= 0) {
        setStatus('locked');
        setTimeout(onFail, 1500);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="crt fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono"
    >
      <div className="bg-black border-2 border-green-500 w-full max-w-2xl h-[80vh] flex flex-col text-green-500 p-6 relative overflow-hidden shadow-[0_0_30px_rgba(34,197,94,0.2)]">
        {/* Scanline effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] z-10 bg-[length:100%_4px]" />
        
        <div className="flex justify-between items-center border-b border-green-500/50 pb-4 mb-4 relative z-20">
          <div className="flex items-center gap-3">
            <Terminal className="w-6 h-6" />
            <h2 className="text-xl font-bold tracking-widest uppercase">RobCo Industries Unified Operating System</h2>
          </div>
          <button onClick={onClose} className="text-green-500 hover:text-green-300 hover:bg-green-900/30 px-3 py-1 border border-transparent hover:border-green-500 transition-colors">
            [ EXIT ]
          </button>
        </div>

        <div className="flex-1 flex flex-col relative z-20">
          <div className="mb-6">
            <p className="mb-2">Welcome to ROBCO Industries (TM) Termlink</p>
            <p>Password Required</p>
            <div className="flex gap-2 mt-4">
              Attempts Remaining: 
              <span className="flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <span key={i} className={i < attempts ? 'text-green-500' : 'text-green-900'}>■</span>
                ))}
              </span>
            </div>
          </div>

          {status === 'playing' ? (
            <div className="grid grid-cols-2 gap-8 flex-1">
              <div className="flex flex-col gap-1">
                {words.map((word, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleGuess(word)}
                    className="text-left hover:bg-green-500 hover:text-black px-2 py-1 transition-colors uppercase"
                  >
                    0x{Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')} {word}
                  </button>
                ))}
              </div>
              
              <div className="border-l border-green-900 pl-8 flex flex-col justify-end">
                {history.map((h, i) => (
                  <div key={i} className="opacity-70">
                    &gt; {h.word}
                    <br />
                    &gt; Entry denied ({h.match}/{password.length} correct)
                  </div>
                ))}
                <div className="animate-pulse mt-2">&gt; _</div>
              </div>
            </div>
          ) : status === 'success' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-pulse">
              <Unlock className="w-16 h-16 mb-4" />
              <h3 className="text-2xl font-bold">ACCESS GRANTED</h3>
              <p className="mt-2 opacity-70">Disengaging security protocols...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-red-500 animate-pulse">
              <Lock className="w-16 h-16 mb-4" />
              <h3 className="text-2xl font-bold">TERMINAL LOCKED</h3>
              <p className="mt-2 opacity-70">Please contact an administrator.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
