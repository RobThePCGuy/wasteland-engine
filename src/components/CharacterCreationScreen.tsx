import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';

interface CharacterCreationScreenProps {
  onCreate: (name: string, stats: Record<string, number>) => void | Promise<void>;
}

const STAT_NAMES = ['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'];

export default function CharacterCreationScreen({ onCreate }: CharacterCreationScreenProps) {
  const [name, setName] = useState('');
  const [stats, setStats] = useState<Record<string, number>>({
    strength: 5,
    perception: 5,
    endurance: 5,
    charisma: 5,
    intelligence: 5,
    agility: 5,
    luck: 5,
  });
  const [points, setPoints] = useState(5);

  const adjustStat = (stat: string, delta: number) => {
    const currentValue = stats[stat];
    const newValue = currentValue + delta;

    if (newValue < 1 || newValue > 10) return;
    if (delta > 0 && points <= 0) return;

    setStats(prev => ({ ...prev, [stat]: newValue }));
    setPoints(prev => prev - delta);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (points !== 0) {
      alert(`You must spend all points! (${points} remaining)`);
      return;
    }
    onCreate(name, stats);
  };

  return (
    <div className="crt min-h-screen bg-black text-green-500 font-mono p-4 md:p-8 flex flex-col items-center justify-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="border border-green-500 p-6 md:p-8 max-w-2xl w-full bg-black/80 backdrop-blur-sm shadow-[0_0_20px_rgba(34,197,94,0.2)]"
      >
        <h1 className="text-3xl mb-8 border-b border-green-500 pb-4 text-center tracking-widest">CHARACTER CREATION</h1>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-tighter opacity-70">Identity</label>
            <input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ENTER NAME..." 
              className="w-full bg-black border border-green-500 p-3 text-green-500 outline-none focus:ring-1 focus:ring-green-400 transition-all text-xl" 
              required 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-green-900 pb-1">
                <label className="text-xs uppercase tracking-tighter opacity-70">S.P.E.C.I.A.L. Attributes</label>
                <div className={`text-sm ${points > 0 ? 'text-amber-400 animate-pulse' : 'text-green-500'}`}>
                  POINTS REMAINING: {points}
                </div>
              </div>
              
              <div className="space-y-3">
                {STAT_NAMES.map(stat => (
                  <div key={stat} className="flex items-center justify-between group">
                    <span className="uppercase text-sm tracking-widest group-hover:text-green-400 transition-colors">{stat}</span>
                    <div className="flex items-center gap-4">
                      <button 
                        type="button"
                        onClick={() => adjustStat(stat, -1)}
                        className="w-8 h-8 border border-green-500 flex items-center justify-center hover:bg-green-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        disabled={stats[stat] <= 1}
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xl font-bold">{stats[stat]}</span>
                      <button 
                        type="button"
                        onClick={() => adjustStat(stat, 1)}
                        className="w-8 h-8 border border-green-500 flex items-center justify-center hover:bg-green-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        disabled={stats[stat] >= 10 || points <= 0}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-green-950/20 border border-green-900 p-4 space-y-4">
              <h3 className="text-xs uppercase opacity-70 border-b border-green-900 pb-1">Attribute Overview</h3>
              <div className="text-xs space-y-2 opacity-80 leading-relaxed">
                <p><span className="text-green-400">STRENGTH:</span> Raw physical power. Affects Melee Damage and Carry Weight.</p>
                <p><span className="text-green-400">PERCEPTION:</span> Environmental awareness. Affects Ranged Accuracy and Detection.</p>
                <p><span className="text-green-400">ENDURANCE:</span> Physical fitness. Affects Hit Points and Resistances.</p>
                <p><span className="text-green-400">CHARISMA:</span> Social influence. Affects Barter prices and Dialogue success.</p>
                <p><span className="text-green-400">INTELLIGENCE:</span> Mental acuity. Affects Skill points and Experience gain.</p>
                <p><span className="text-green-400">AGILITY:</span> Coordination and speed. Affects Action Points and Movement.</p>
                <p><span className="text-green-400">LUCK:</span> Fortune. Affects Critical Chance and random encounters.</p>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            className={`mt-4 p-4 text-xl tracking-widest transition-all ${
              points === 0 
                ? 'bg-green-500 text-black hover:bg-green-400 cursor-pointer' 
                : 'bg-green-900/50 text-green-800 cursor-not-allowed'
            }`}
          >
            ENTER THE WASTELAND
          </button>
        </form>
      </motion.div>
    </div>
  );
}
