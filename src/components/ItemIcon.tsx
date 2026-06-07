import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { generateItemIcon } from '../services/geminiService';
import { Package, Shield, Crosshair, Heart, Zap, Star } from 'lucide-react';

interface ItemIconProps {
  name: string;
  type: string;
  description?: string;
  className?: string;
}

export default function ItemIcon({ name, type, description = '', className = '' }: ItemIconProps) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    async function loadIcon() {
      setLoading(true);
      const url = await generateItemIcon(name, type, description);
      if (mounted) {
        setIconUrl(url);
        setLoading(false);
      }
    }

    loadIcon();

    return () => {
      mounted = false;
    };
  }, [name, type, description]);

  const getFallbackIcon = () => {
    switch (type.toLowerCase()) {
      case 'weapon': return <Crosshair className="w-full h-full text-red-400" />;
      case 'armor': return <Shield className="w-full h-full text-blue-400" />;
      case 'consumable': return <Heart className="w-full h-full text-green-400" />;
      case 'ammo': return <Zap className="w-full h-full text-yellow-400" />;
      case 'misc': return <Star className="w-full h-full text-purple-400" />;
      default: return <Package className="w-full h-full text-gray-400" />;
    }
  };

  if (loading || !iconUrl) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-3/4 h-3/4"
        >
          {getFallbackIcon()}
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div 
      className={`relative flex items-center justify-center ${className}`}
      whileHover={{ scale: 1.1 }}
      transition={{ duration: 0.2 }}
    >
      <img 
        src={iconUrl} 
        alt={name} 
        className="w-full h-full object-contain filter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
        style={{ mixBlendMode: 'screen' }}
        referrerPolicy="no-referrer"
      />
    </motion.div>
  );
}
