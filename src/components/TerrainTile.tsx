import React, { useState, useEffect } from 'react';
import { generateTerrainSprite } from '../services/geminiService';

interface TerrainTileProps {
  kind: string;
  className?: string;
}

export default function TerrainTile({ kind, className = '' }: TerrainTileProps) {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadSprite() {
      setLoading(true);
      const url = await generateTerrainSprite(kind);
      if (mounted) {
        setSpriteUrl(url);
        setLoading(false);
      }
    }
    loadSprite();
    return () => { mounted = false; };
  }, [kind]);

  if (loading || !spriteUrl) {
    return <div className={`w-full h-full ${className}`} />;
  }

  return (
    <img 
      src={spriteUrl} 
      alt={kind} 
      className={`w-full h-full object-cover ${className}`}
      style={{ mixBlendMode: 'screen' }}
      referrerPolicy="no-referrer"
    />
  );
}
