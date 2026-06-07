import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { generateCharacterSprite } from '../services/geminiService';
import { User, Skull, Target } from 'lucide-react';
import { LimbCondition } from '../types/app';

export type AnimationState = 'idle' | 'walk' | 'attack' | 'hurt';

interface CharacterSpriteProps {
  name: string;
  description?: string;
  isHostile?: boolean;
  dead?: boolean;
  type: 'player' | 'npc';
  className?: string;
  animationState?: AnimationState;
  hpPercent?: number;
  equipment?: string;
  statusEffects?: (string | any)[];
  limbCondition?: LimbCondition;
}

export default function CharacterSprite({ 
  name, 
  description = 'A wasteland wanderer.', 
  isHostile = false, 
  dead = false, 
  type, 
  className = '',
  animationState = 'idle',
  hpPercent = 100,
  equipment = '',
  statusEffects = [],
  limbCondition
}: CharacterSpriteProps) {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isCrippled = limbCondition && Object.values(limbCondition).some((v: any) => v <= 0);

  useEffect(() => {
    let mounted = true;
    
    async function loadSprite() {
      if (dead) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      const url = await generateCharacterSprite(name, description, isHostile, hpPercent, equipment);
      if (mounted) {
        setSpriteUrl(url);
        setLoading(false);
      }
    }

    loadSprite();

    return () => {
      mounted = false;
    };
  }, [name, description, isHostile, dead]);

  const Icon = dead ? Skull : isHostile ? Target : User;
  const colorClass = type === 'player' ? 'text-green-400' : dead ? 'text-gray-500' : isHostile ? 'text-red-500' : 'text-amber-400';

  const effectTypes = statusEffects.map(e => typeof e === 'string' ? e : e.type);
  const isPoisoned = effectTypes.includes('poisoned');
  const isIrradiated = effectTypes.includes('irradiated');

  const variants = {
    idle: {
      y: [0, -2, 0],
      scaleY: [1, 1.02, 1],
      transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const }
    },
    walk: {
      y: [0, -6, 0],
      rotate: [-5, 5, -5],
      transition: { duration: 0.5, repeat: Infinity, ease: "linear" as const }
    },
    attack: {
      scale: [1, 1.2, 1],
      y: [0, -10, 0],
      transition: { duration: 0.3, ease: "easeOut" as const }
    },
    hurt: {
      x: [-5, 5, -5, 5, 0],
      opacity: [1, 0.5, 1, 0.5, 1],
      transition: { duration: 0.4 }
    }
  };

  if (dead) {
    return (
      <div className={`flex flex-col items-center justify-center opacity-50 ${className}`}>
        <Icon className={`w-8 h-8 ${colorClass} mb-1`} />
      </div>
    );
  }

  return (
    <motion.div 
      className={`relative flex flex-col items-center justify-end ${className}`}
      variants={variants}
      animate={animationState}
    >
      {loading || !spriteUrl ? (
        <Icon className={`w-8 h-8 mb-1 ${colorClass}`} />
      ) : (
        <div className="relative w-full h-full flex items-center justify-center">
          <img 
            src={spriteUrl} 
            alt={name} 
            className={`w-full h-full object-contain filter drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] ${
              isPoisoned ? 'sepia-[0.5] hue-rotate-[90deg] saturate-[2]' : ''
            } ${
              isIrradiated ? 'sepia-[0.5] hue-rotate-[60deg] saturate-[1.5] brightness-125' : ''
            } ${
              isCrippled ? 'grayscale-[0.3] brightness-[0.8] contrast-[1.2]' : ''
            }`}
            style={{ mixBlendMode: 'screen' }}
            referrerPolicy="no-referrer"
          />
          {/* Status Effect Glows */}
          {isCrippled && (
            <motion.div 
              animate={{ opacity: [0.1, 0.3, 0.1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="absolute inset-0 bg-red-600/20 blur-md rounded-full"
            />
          )}
          {isPoisoned && (
            <motion.div 
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full"
            />
          )}
          {isIrradiated && (
            <motion.div 
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute inset-0 bg-lime-500/20 blur-xl rounded-full"
            />
          )}
        </div>
      )}
    </motion.div>
  );
}
