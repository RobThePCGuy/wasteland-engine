import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Skull, Shield, Zap, Target, Eye, Info } from 'lucide-react';
import CharacterSprite from './CharacterSprite';
import TerrainTile from './TerrainTile';
import EnvironmentObject from './EnvironmentObject';
import HackingMinigame from './HackingMinigame';
import ScavengingModal from './ScavengingModal';
import { StatusEffect } from '../types/app';

const TILE_W = 72;
const TILE_H = 36;

function isoProject(x: number, y: number) {
  return {
    left: (x - y) * (TILE_W / 2),
    top: (x + y) * (TILE_H / 2),
  };
}

const TILE_STYLES: Record<string, string> = {
  floor: 'bg-green-950/40 border-green-800/70 shadow-[inset_0_0_10px_rgba(34,197,94,0.05)]',
  rubble: 'bg-amber-900/40 border-amber-700/70 shadow-[inset_0_0_10px_rgba(245,158,11,0.05)]',
  wall: 'bg-slate-700/80 border-slate-500 shadow-[0_4px_0_rgba(0,0,0,0.5),inset_0_0_15px_rgba(0,0,0,0.3)]',
  rock: 'bg-stone-700/80 border-stone-500 shadow-[0_4px_0_rgba(0,0,0,0.5),inset_0_0_15px_rgba(0,0,0,0.3)]',
  dirt: 'bg-amber-950/40 border-amber-900/70',
  grass: 'bg-emerald-950/40 border-emerald-900/70',
  pavement: 'bg-slate-900/40 border-slate-800/70',
  cracked_pavement: 'bg-slate-950/40 border-slate-900/70',
  sand: 'bg-yellow-950/40 border-yellow-900/70',
  wasteland: 'bg-stone-950/40 border-stone-900/70',
  water: 'bg-blue-900/60 border-blue-700/70 shadow-[inset_0_0_15px_rgba(59,130,246,0.2)]',
  toxic_sludge: 'bg-lime-900/60 border-lime-700/70 shadow-[inset_0_0_15px_rgba(132,204,22,0.3)]',
  metal_floor: 'bg-zinc-800/60 border-zinc-600/70 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]',
};

function WeatherEffects({ weather, biome = 'wasteland' }: { weather?: string, biome?: string }) {
  const isDesert = biome === 'desert' || biome === 'scrubland';
  
  if (weather === 'clear') return null;

  if (weather === 'sandstorm' || (isDesert && !weather)) {
    return (
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {[...Array(40)].map((_, i) => (
          <motion.div
            key={`sand-${i}`}
            initial={{ x: Math.random() * 100 + '%', y: Math.random() * 100 + '%', opacity: Math.random() * 0.3, scale: Math.random() * 0.5 + 0.5 }}
            animate={{ x: [null, (Math.random() - 0.5) * 400 + 'px'], y: [null, (Math.random() - 0.5) * 100 + 'px'], opacity: [0.1, 0.4, 0.1] }}
            transition={{ duration: 5 + Math.random() * 10, repeat: Infinity, ease: "linear" }}
            className="absolute w-2 h-2 bg-amber-200/30 rounded-full blur-[2px]"
          />
        ))}
        <motion.div 
          animate={{ x: ['-100%', '100%'], opacity: [0, 0.2, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-600/20 to-transparent skew-x-12"
        />
      </div>
    );
  }

  if (weather === 'radstorm') {
    return (
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={`rad-${i}`}
            initial={{ x: Math.random() * 100 + '%', y: Math.random() * 100 + '%', opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0], scale: [1, 1.5, 1] }}
            transition={{ duration: 3 + Math.random() * 5, repeat: Infinity, ease: "easeInOut", delay: Math.random() * 5 }}
            className="absolute w-4 h-4 bg-lime-400/20 rounded-full blur-[4px]"
          />
        ))}
        <motion.div 
          animate={{ opacity: [0.05, 0.15, 0.05] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 bg-lime-900/20 mix-blend-overlay"
        />
      </div>
    );
  }

  if (weather === 'rain') {
    return (
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {[...Array(60)].map((_, i) => (
          <motion.div
            key={`rain-${i}`}
            initial={{ x: Math.random() * 100 + '%', y: -10, opacity: Math.random() * 0.5 + 0.2 }}
            animate={{ y: '100%', x: '+=20px' }}
            transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, ease: "linear" }}
            className="absolute w-[1px] h-4 bg-blue-300/40 rotate-12"
          />
        ))}
        <div className="absolute inset-0 bg-slate-900/20" />
      </div>
    );
  }

  // Default dust
  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={`dust-${i}`}
          initial={{ x: Math.random() * 100 + '%', y: Math.random() * 100 + '%', opacity: Math.random() * 0.2, scale: Math.random() * 0.5 + 0.5 }}
          animate={{ x: [null, (Math.random() - 0.5) * 150 + 'px'], y: [null, (Math.random() - 0.5) * 150 + 'px'], opacity: [0.05, 0.2, 0.05] }}
          transition={{ duration: 15 + Math.random() * 25, repeat: Infinity, ease: "linear" }}
          className="absolute w-1 h-1 bg-amber-200/10 rounded-full blur-[1px]"
        />
      ))}
    </div>
  );
}

interface ExplorationNpc {
  npc_id: number;
  name: string;
  is_hostile: boolean;
  hit_points: number;
  max_hit_points: number;
  x?: number;
  y?: number;
  equipment_name?: string;
  status_effects?: (string | StatusEffect)[];
}

interface IsometricExplorationViewProps {
  location: {
    name: string;
    description: string;
    width?: number;
    height?: number;
    tiles?: { 
      x: number; 
      y: number; 
      kind: string; 
      object_kind?: string; 
      ap_cost: number;
      is_highlighted?: boolean;
      is_poi?: boolean;
      poi_description?: string;
      resource_type?: 'scrap' | 'water' | 'tech' | 'none';
      resource_amount?: number;
      animation?: 'flicker' | 'glow' | 'pulse' | 'none';
      hazard?: 'radiation' | 'toxic_gas' | 'none';
    }[];
    weather?: 'clear' | 'sandstorm' | 'radstorm' | 'rain';
    npcs?: ExplorationNpc[];
    biome?: string;
  } | null;
  player: {
    name: string;
    position?: { x: number; y: number } | null;
    vitals?: {
      hit_points: number;
      max_hit_points: number;
      status_effects?: (string | StatusEffect)[];
    };
  } | null;
  isGenerating: boolean;
  onTalk: (npcId: number, npcName: string) => void | Promise<void>;
  onAttack: (npcId: number) => void | Promise<void>;
  onLoot: (npcId: number) => void | Promise<void>;
  onInteractObject?: (action: string, data?: any) => void;
  onMove?: (x: number, y: number) => void | Promise<void>;
}

export default function IsometricExplorationView({
  location,
  player,
  isGenerating,
  onTalk,
  onAttack,
  onLoot,
  onInteractObject,
  onMove,
}: IsometricExplorationViewProps) {
  const [selectedNpcId, setSelectedNpcId] = useState<number | null>(null);
  const [hoveredTile, setHoveredTile] = useState<{ 
    x: number; 
    y: number; 
    poi?: string;
    resource?: { type: string; amount: number };
  } | null>(null);
  const [interactingObject, setInteractingObject] = useState<{ type: 'terminal' | 'scrap'; tile: any } | null>(null);

  const selectedNpc = location?.npcs?.find(npc => npc.npc_id === selectedNpcId) ?? null;

  const actors = useMemo(() => {
    const result: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      type: 'player' | 'npc';
      hostile?: boolean;
      dead?: boolean;
      npcId?: number;
      hp?: number;
      maxHp?: number;
      equipment?: string;
      statusEffects?: (string | StatusEffect)[];
    }> = [];

    if (player?.position) {
      result.push({
        id: 'player',
        name: player.name,
        x: player.position.x,
        y: player.position.y,
        type: 'player',
        hp: player.vitals?.hit_points,
        maxHp: player.vitals?.max_hit_points,
        statusEffects: player.vitals?.status_effects,
      });
    }

    for (const npc of location?.npcs ?? []) {
      if (npc.x === undefined || npc.y === undefined) {
        continue;
      }

      result.push({
        id: `npc-${npc.npc_id}`,
        npcId: npc.npc_id,
        name: npc.name,
        x: npc.x,
        y: npc.y,
        type: 'npc',
        hostile: npc.is_hostile,
        dead: npc.hit_points <= 0,
        hp: npc.hit_points,
        maxHp: npc.max_hit_points,
        equipment: npc.equipment_name,
        statusEffects: npc.status_effects,
      });
    }

    return result.sort((left, right) => (left.x + left.y) - (right.x + right.y));
  }, [location?.npcs, player]);

  if (!location?.tiles?.length || !player?.position || !location.width || !location.height) {
    return <div className="text-sm opacity-50">Exploration map data is unavailable for this location.</div>;
  }

  const gridLeft = isoProject(0, location.height - 1).left;
  const gridRight = isoProject(location.width - 1, 0).left;
  const totalWidth = gridRight - gridLeft + TILE_W;
  const totalHeight = isoProject(location.width - 1, location.height - 1).top + TILE_H + 48;

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="border border-green-900 p-3 bg-black/40 relative overflow-hidden flex flex-col h-full">
        {/* Scanline effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] z-10 bg-[length:100%_2px]" />
        
        <div className="flex justify-between items-center text-xs text-green-300 mb-2 uppercase tracking-widest relative z-20">
          <div className="flex items-center gap-2"><Eye className="w-3 h-3" /> Wasteland Survey</div>
          <div className="opacity-50">GRID: {location.width}x{location.height}</div>
        </div>

        <div className="relative overflow-auto z-20 flex-1">
          <div className="relative mx-auto" style={{ width: totalWidth, height: totalHeight }}>
            <WeatherEffects weather={location.weather} biome={location.biome} />
            
            {/* Atmospheric Glow */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.3)_100%)] z-0" />

            {location.tiles.map(tile => {
              const projected = isoProject(tile.x, tile.y);
              const left = projected.left - gridLeft;
              const isHovered = hoveredTile?.x === tile.x && hoveredTile?.y === tile.y;

              return (
                <div
                  key={`${tile.x}-${tile.y}`}
                  className={`absolute group ${tile.object_kind === 'terminal' || tile.object_kind === 'computer_console' || tile.resource_type && tile.resource_type !== 'none' || (onMove && !tile.object_kind && tile.kind !== 'wall') ? 'cursor-pointer' : ''}`}
                  style={{ left, top: projected.top, width: TILE_W, height: TILE_H }}
                  onMouseEnter={() => setHoveredTile({ 
                    x: tile.x, 
                    y: tile.y, 
                    poi: tile.poi_description,
                    resource: tile.resource_type && tile.resource_type !== 'none' ? { type: tile.resource_type, amount: tile.resource_amount ?? 0 } : undefined
                  })}
                  onMouseLeave={() => setHoveredTile(null)}
                  onClick={() => {
                    if (tile.object_kind === 'terminal' || tile.object_kind === 'computer_console') {
                      setInteractingObject({ type: 'terminal', tile });
                    } else if (tile.resource_type && tile.resource_type !== 'none') {
                      setInteractingObject({ type: 'scrap', tile });
                    } else if (onMove && !tile.object_kind && tile.kind !== 'wall') {
                      onMove(tile.x, tile.y);
                    }
                  }}
                >
                  <div
                    className={`absolute inset-0 border transition-all duration-300 ${
                      tile.is_highlighted ? 'border-green-400/50 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : ''
                    } ${
                      TILE_STYLES[tile.kind] || TILE_STYLES.floor
                    } ${isHovered ? 'brightness-125 scale-105 z-40' : ''}`}
                    style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
                  >
                    <TerrainTile kind={tile.kind} className="opacity-40" />
                    {/* Texture Overlay */}
                    <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(circle,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:6px_6px]" />
                    {/* Hazard Overlay */}
                    {tile.hazard === 'radiation' && (
                      <div className="absolute inset-0 bg-lime-500/20 mix-blend-overlay animate-pulse" />
                    )}
                    {tile.hazard === 'toxic_gas' && (
                      <div className="absolute inset-0 bg-yellow-500/20 mix-blend-overlay" />
                    )}
                  </div>
                  
                  {tile.object_kind && tile.object_kind !== 'none' && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-1/2 w-12 h-12 z-10 pointer-events-none">
                      <EnvironmentObject 
                        kind={tile.object_kind} 
                        className="w-full h-full" 
                        animation={tile.animation}
                        isHighlighted={tile.is_highlighted}
                        resourceType={tile.resource_type}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {actors.map(actor => {
              const projected = isoProject(actor.x, actor.y);
              const left = projected.left - gridLeft + (TILE_W / 2);
              const isSelected = actor.type === 'npc' && selectedNpcId === actor.npcId;
              const Icon = actor.dead ? Skull : actor.hostile ? Target : User;

              return (
                <motion.button
                  key={actor.id}
                  layoutId={actor.id}
                  onClick={() => actor.type === 'npc' && setSelectedNpcId(actor.npcId ?? null)}
                  className={`absolute text-center text-[10px] leading-tight z-30 ${
                    actor.type === 'player'
                      ? 'text-green-300 cursor-default'
                      : actor.dead
                        ? 'text-gray-500'
                        : actor.hostile
                          ? 'text-red-400'
                          : 'text-amber-300'
                  }`}
                  style={{
                    left,
                    top: projected.top - 24,
                    transform: 'translate(-50%, 0)',
                    minWidth: 80,
                  }}
                  animate={{ scale: isSelected ? 1.1 : 1 }}
                  disabled={actor.type === 'player'}
                >
                  <div className="relative flex flex-col items-center">
                    <div className="relative mb-1">
                      <CharacterSprite 
                        name={actor.name}
                        isHostile={actor.hostile}
                        dead={actor.dead}
                        type={actor.type}
                        hpPercent={actor.hp && actor.maxHp ? (actor.hp / actor.maxHp) * 100 : 100}
                        equipment={actor.equipment}
                        statusEffects={actor.statusEffects}
                        className={`w-16 h-16 ${isSelected ? 'animate-pulse scale-110' : ''}`}
                      />
                      
                      {/* Shadow */}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-3 bg-black/40 rounded-full blur-[1px]" />

                      
                      {/* Selection Ring */}
                      {isSelected && (
                        <motion.div 
                          animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className={`absolute -inset-2 border-2 rounded-full ${
                            actor.type === 'player' ? 'border-green-500' : 
                            actor.hostile ? 'border-red-500' : 'border-amber-500'
                          }`}
                          style={{ transform: 'rotateX(60deg)' }}
                        />
                      )}
                    </div>
                    <div className={`bg-black/80 px-2 py-0.5 border border-current/30 rounded whitespace-nowrap ${isSelected ? 'bg-current/20 font-bold' : ''}`}>
                      {actor.name.toUpperCase()}
                    </div>
                    {actor.type === 'npc' && !actor.dead && (
                      <div className="w-8 h-1 bg-gray-900 mt-1 rounded-full overflow-hidden border border-black">
                        <div 
                          className={`h-full ${actor.hostile ? 'bg-red-500' : 'bg-amber-400'}`} 
                          style={{ width: `${((actor.hp || 0) / (actor.maxHp || 1)) * 100}%` }} 
                        />
                      </div>
                    )}
                    {actor.statusEffects && actor.statusEffects.length > 0 && !actor.dead && (
                      <div className="flex gap-1 mt-1">
                        {actor.statusEffects.map((effect, idx) => {
                          const type = typeof effect === 'string' ? effect : effect.type;
                          const message = typeof effect === 'string' ? effect : effect.message;
                          return (
                            <div 
                              key={`${type}-${idx}`} 
                              className={`w-2 h-2 rounded-full ${type === 'irradiated' ? 'bg-lime-500' : type === 'poisoned' ? 'bg-purple-500' : 'bg-gray-500'}`}
                              title={message}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border border-green-900 p-3 text-[10px] flex flex-wrap gap-4 bg-green-950/10">
        <span className="flex items-center gap-2 uppercase font-bold"><User className="w-3 h-3 text-green-500" /> You</span>
        <span className="flex items-center gap-2 uppercase font-bold"><User className="w-3 h-3 text-amber-400" /> Neutral</span>
        <span className="flex items-center gap-2 uppercase font-bold"><Target className="w-3 h-3 text-red-500" /> Hostile</span>
        <span className="flex items-center gap-2 uppercase font-bold"><Skull className="w-3 h-3 text-gray-600" /> Corpse</span>
      </div>

      <div className="border border-green-900 p-4 min-h-[120px] bg-black/40 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {hoveredTile?.poi || hoveredTile?.resource ? (
            <motion.div
              key="poi-info"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-3 text-green-400"
            >
              <Info className={`w-6 h-6 animate-pulse ${
                hoveredTile.resource?.type === 'scrap' ? 'text-orange-500' :
                hoveredTile.resource?.type === 'water' ? 'text-blue-500' :
                hoveredTile.resource?.type === 'tech' ? 'text-purple-500' :
                'text-green-400'
              }`} />
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">
                  {hoveredTile.resource ? 'Resource Detected' : 'Point of Interest'}
                </div>
                <div className="text-sm font-bold">
                  {hoveredTile.resource 
                    ? `${hoveredTile.resource.amount}x ${hoveredTile.resource.type.toUpperCase()} found in the area.`
                    : hoveredTile.poi}
                </div>
              </div>
            </motion.div>
          ) : selectedNpc ? (
            <motion.div 
              key={selectedNpc.npc_id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex flex-col gap-4 relative z-20"
            >
              <div className="flex items-center justify-between gap-3 border-b border-green-900 pb-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 border ${selectedNpc.is_hostile ? 'border-red-500 text-red-500' : 'border-amber-400 text-amber-400'}`}>
                    {selectedNpc.hit_points > 0 ? <User className="w-5 h-5" /> : <Skull className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-lg font-black tracking-tight text-green-300 uppercase">{selectedNpc.name}</div>
                    <div className="text-[10px] opacity-70 uppercase tracking-widest">
                      {selectedNpc.hit_points > 0
                        ? `HP ${selectedNpc.hit_points}/${selectedNpc.max_hit_points} • ${selectedNpc.is_hostile ? 'HOSTILE' : 'NEUTRAL'}`
                        : 'DECEASED • READY FOR SALVAGE'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNpcId(null)}
                  className="border border-green-700 px-3 py-1 text-[10px] hover:bg-green-900 uppercase font-bold"
                >
                  DISMISS
                </button>
              </div>

              {!isGenerating && (
                <div className="flex flex-wrap gap-2">
                  {selectedNpc.hit_points > 0 ? (
                    <>
                      <button
                        onClick={() => onTalk(selectedNpc.npc_id, selectedNpc.name)}
                        className="bg-green-900 border border-green-500 px-6 py-2 text-xs font-bold hover:bg-green-500 hover:text-black transition-all uppercase"
                      >
                        TALK
                      </button>
                      <button
                        onClick={() => onAttack(selectedNpc.npc_id)}
                        className="bg-red-900 border border-red-500 px-6 py-2 text-xs font-bold hover:bg-red-500 hover:text-white transition-all uppercase"
                      >
                        ATTACK
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onLoot(selectedNpc.npc_id)}
                      className="bg-gray-800 border border-gray-500 px-6 py-2 text-xs font-bold hover:bg-gray-500 hover:text-black transition-all uppercase"
                    >
                      LOOT REMAINS
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              className="h-full flex flex-col items-center justify-center text-center gap-3"
            >
              <Info className="w-8 h-8" />
              <p className="text-xs uppercase tracking-widest">Select a target on the survey map to interact.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {interactingObject?.type === 'terminal' && (
          <HackingMinigame
            difficulty="medium"
            onSuccess={() => {
              setInteractingObject(null);
              onInteractObject?.('hack_success', { tile: interactingObject.tile });
            }}
            onFail={() => {
              setInteractingObject(null);
              onInteractObject?.('hack_fail', { tile: interactingObject.tile });
            }}
            onClose={() => setInteractingObject(null)}
          />
        )}
        {interactingObject?.type === 'scrap' && (
          <ScavengingModal
            resourceType={interactingObject.tile.resource_type}
            resourceAmount={interactingObject.tile.resource_amount}
            onSuccess={(loot) => {
              setInteractingObject(null);
              onInteractObject?.('scavenge_success', { ...loot, tile: interactingObject.tile });
            }}
            onClose={() => setInteractingObject(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}