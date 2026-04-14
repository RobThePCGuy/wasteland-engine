import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { generateObjectSprite } from '../services/geminiService';

interface EnvironmentObjectProps {
  kind: string;
  className?: string;
  animation?: 'flicker' | 'glow' | 'pulse' | 'none';
  isHighlighted?: boolean;
  resourceType?: 'scrap' | 'water' | 'tech' | 'none';
}

export default function EnvironmentObject({ 
  kind, 
  className = '', 
  animation = 'none',
  isHighlighted = false,
  resourceType = 'none'
}: EnvironmentObjectProps) {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadSprite() {
      if (kind === 'none') {
        setLoading(false);
        return;
      }
      setLoading(true);
      const url = await generateObjectSprite(kind);
      if (mounted) {
        setSpriteUrl(url);
        setLoading(false);
      }
    }
    loadSprite();
    return () => { mounted = false; };
  }, [kind]);

  if (kind === 'none' || loading || !spriteUrl) {
    return null;
  }

  const animationClass = {
    flicker: 'animate-pulse opacity-80',
    glow: 'drop-shadow-[0_0_8px_rgba(0,255,0,0.5)]',
    pulse: 'animate-bounce',
    none: ''
  }[animation];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ 
        opacity: 1, 
        scale: isHovered ? 1.1 : 1,
        filter: isHighlighted || isHovered ? 'brightness(1.5) drop-shadow(0 0 5px #00ff00)' : 'brightness(1)'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex flex-col items-center justify-end cursor-pointer transition-all duration-200 ${className} ${animationClass}`}
    >
      <img 
        src={spriteUrl} 
        alt={kind} 
        className="w-full h-full object-contain filter drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
        style={{ mixBlendMode: 'screen' }}
        referrerPolicy="no-referrer"
      />
      {isHighlighted && (
        <div className={`absolute -top-2 w-2 h-2 rounded-full animate-ping ${
          resourceType === 'scrap' ? 'bg-orange-500' :
          resourceType === 'water' ? 'bg-blue-500' :
          resourceType === 'tech' ? 'bg-purple-500' :
          'bg-green-500'
        }`} />
      )}
    </motion.div>
  );
}
