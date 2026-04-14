import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { findPath } from '../utils/pathfinding';
import type { CombatState, GameState, Combatant, StatusEffect } from '../types/app';
import CharacterSprite, { AnimationState } from './CharacterSprite';
import TerrainTile from './TerrainTile';
import EnvironmentObject from './EnvironmentObject';

const TILE_W = 64;
const TILE_H = 32;

function isoProject(x: number, y: number) {
  return {
    left: (x - y) * (TILE_W / 2),
    top: (x + y) * (TILE_H / 2),
  };
}

const TILE_COLORS: Record<string, string> = {
  floor: 'bg-green-900/40 border-green-700/50 shadow-[inset_0_0_10px_rgba(34,197,94,0.1)]',
  rubble: 'bg-amber-900/40 border-amber-700/50 shadow-[inset_0_0_10px_rgba(245,158,11,0.1)]',
  wall: 'bg-gray-800 border-gray-600 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]',
  rock: 'bg-stone-800 border-stone-600 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]',
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

function MuzzleFlash({ x, y, gridOffset }: { x: number; y: number; gridOffset: { left: number; top: number } }) {
  const pos = isoProject(x, y);
  return (
    <motion.div
      initial={{ scale: 0, opacity: 1 }}
      animate={{ scale: [1, 2, 0], opacity: [1, 0.8, 0] }}
      transition={{ duration: 0.2 }}
      className="absolute z-40 pointer-events-none"
      style={{
        left: pos.left - gridOffset.left + TILE_W / 2 - 10,
        top: pos.top - 10,
        width: 20,
        height: 20,
        background: 'radial-gradient(circle, #fbbf24 0%, transparent 70%)',
        filter: 'blur(2px)',
      }}
    />
  );
}

function BloodSplatter({ x, y, gridOffset }: { x: number; y: number; gridOffset: { left: number; top: number } }) {
  const pos = isoProject(x, y);
  return (
    <div className="absolute z-40 pointer-events-none" style={{ left: pos.left - gridOffset.left + TILE_W / 2, top: pos.top }}>
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ 
            x: (Math.random() - 0.5) * 40, 
            y: (Math.random() - 0.5) * 40 - 20, 
            opacity: 0,
            scale: 0.5
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute w-1 h-1 bg-red-600 rounded-full"
        />
      ))}
    </div>
  );
}

function DustParticles() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            x: Math.random() * 100 + '%', 
            y: Math.random() * 100 + '%', 
            opacity: Math.random() * 0.3,
            scale: Math.random() * 0.5 + 0.5
          }}
          animate={{ 
            x: [null, (Math.random() - 0.5) * 200 + 'px'],
            y: [null, (Math.random() - 0.5) * 200 + 'px'],
            opacity: [0.1, 0.3, 0.1]
          }}
          transition={{ 
            duration: 10 + Math.random() * 20, 
            repeat: Infinity, 
            ease: "linear" 
          }}
          className="absolute w-1 h-1 bg-amber-200/20 rounded-full blur-[1px]"
        />
      ))}
    </div>
  );
}

interface IsometricCombatViewProps {
  combatState: CombatState;
  gameState: GameState;
  onAction: (actionType: string, targetId?: number, bodyPart?: string, useCritical?: boolean) => void;
  onMove: (x: number, y: number) => void;
  pendingAction: string | null;
  setPendingAction: (action: string | null) => void;
  selectedBodyPart: string | null;
  setSelectedBodyPart: (part: string | null) => void;
  isGenerating?: boolean;
}

export default function IsometricCombatView({
  combatState,
  gameState,
  onAction,
  onMove,
  pendingAction,
  setPendingAction,
  selectedBodyPart,
  setSelectedBodyPart,
  isGenerating = false,
}: IsometricCombatViewProps) {
  const [moveMode, setMoveMode] = useState(false);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [vatsTargetId, setVatsTargetId] = useState<number | null>(null);
  const [useCritical, setUseCritical] = useState(false);
  const [damageNumbers, setDamageNumbers] = useState<{ id: number; x: number; y: number; value: number; isCritical: boolean }[]>([]);
  const [projectiles, setProjectiles] = useState<{ id: number; fromX: number; fromY: number; toX: number; toY: number; type: 'bullet' | 'laser' | 'plasma' | 'gamma' }[]>([]);
  const [flashes, setFlashes] = useState<{ id: number; x: number; y: number }[]>([]);
  const [splatters, setSplatters] = useState<{ id: number; x: number; y: number }[]>([]);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; vx: number; vy: number }[]>([]);
  const [vaultBoy, setVaultBoy] = useState<{ id: number; type: 'critical' | 'levelup' | 'failed' | 'crippled'; message: string } | null>(null);
  const [shake, setShake] = useState(false);
  const [isSlowMo, setIsSlowMo] = useState(false);
  const [animationStates, setAnimationStates] = useState<Record<string, AnimationState>>({});
  const lastLogLength = useRef(combatState.combat_log?.length || 0);
  const prevPositions = useRef<Record<string, { x: number, y: number }>>({});

  const criticalMeter = gameState?.player?.vitals?.critical_meter || 0;

  // Track movement for walking animation
  useEffect(() => {
    const newStates = { ...animationStates };
    let changed = false;

    combatState.turn_order.forEach(actor => {
      if (actor.tile_x === undefined || actor.tile_y === undefined) return;
      const key = `${actor.type}-${actor.id}`;
      const prev = prevPositions.current[key];
      
      if (prev && (prev.x !== actor.tile_x || prev.y !== actor.tile_y)) {
        newStates[key] = 'walk';
        changed = true;
        
        setTimeout(() => {
          setAnimationStates(s => ({ ...s, [key]: 'idle' }));
        }, 500);
      }
      
      prevPositions.current[key] = { x: actor.tile_x, y: actor.tile_y };
    });

    if (changed) {
      setAnimationStates(newStates);
    }
  }, [combatState.turn_order]);

  // Watch combat log for new events
  useEffect(() => {
    const log = combatState.combat_log || [];
    if (log.length > lastLogLength.current) {
      const newEntries = log.slice(lastLogLength.current);
      newEntries.forEach((entry: any) => {
        const target = combatState.turn_order.find((c: Combatant) => c.name === entry.target);
        const attacker = combatState.turn_order.find((c: Combatant) => c.name === entry.attacker);
        const id = Date.now() + Math.random();

        // 1. Projectiles (Trigger on any attack attempt)
        if (attacker && target && attacker.tile_x !== undefined && target.tile_x !== undefined) {
          const attackerKey = `${attacker.type}-${attacker.id}`;
          const targetKey = `${target.type}-${target.id}`;

          setAnimationStates(s => ({ ...s, [attackerKey]: 'attack' }));
          setTimeout(() => setAnimationStates(s => ({ ...s, [attackerKey]: 'idle' })), 300);

          const projId = id + 1;
          // Determine projectile type based on weapon name or random for variety
          let type: 'bullet' | 'laser' | 'plasma' | 'gamma' = 'bullet';
          const msg = entry.message?.toUpperCase() || '';
          if (msg.includes('PLASMA')) type = 'plasma';
          else if (msg.includes('GAMMA') || msg.includes('RAD')) type = 'gamma';
          else if (msg.includes('LASER') || msg.includes('ENERGY')) type = 'laser';
          else if (Math.random() > 0.7) type = 'laser'; // Random variety

          setProjectiles(prev => [...prev, { id: projId, fromX: attacker.tile_x, fromY: attacker.tile_y, toX: target.tile_x, toY: target.tile_y, type }]);
          
          // Muzzle Flash
          const flashId = id + 2;
          setFlashes(prev => [...prev, { id: flashId, x: attacker.tile_x, y: attacker.tile_y }]);
          setTimeout(() => setFlashes(prev => prev.filter(f => f.id !== flashId)), 200);

          setTimeout(() => {
            setProjectiles(prev => prev.filter(p => p.id !== projId));
            
            // Trigger Particles on impact (approximate timing)
            if (entry.damage > 0 && target.tile_x !== undefined) {
              const particleColor = type === 'laser' ? '#ef4444' : type === 'plasma' ? '#4ade80' : type === 'gamma' ? '#a855f7' : '#fbbf24';
              const newParticles = Array.from({ length: 8 }).map((_, i) => ({
                id: Date.now() + i + Math.random(),
                x: target.tile_x,
                y: target.tile_y,
                color: particleColor,
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.5) * 0.2
              }));
              setParticles(prev => [...prev, ...newParticles]);
              setTimeout(() => {
                setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
              }, 600);
            }
          }, 350);
        }

        // 2. Damage Numbers & Shake & Slow Mo
        if (entry.damage > 0) {
          if (target && target.tile_x !== undefined) {
            const isCritical = entry.message?.includes('CRITICAL');
            const isKill = entry.message?.toUpperCase().includes('KILLED') || entry.message?.toUpperCase().includes('DIED');

            // Damage Number
            setDamageNumbers(prev => [...prev, { id, x: target.tile_x, y: target.tile_y, value: entry.damage, isCritical }]);
            
            const targetKey = `${target.type}-${target.id}`;
            setAnimationStates(s => ({ ...s, [targetKey]: 'hurt' }));
            setTimeout(() => setAnimationStates(s => ({ ...s, [targetKey]: 'idle' })), 400);

            // Blood Splatter
            const splatterId = id + 3;
            setSplatters(prev => [...prev, { id: splatterId, x: target.tile_x, y: target.tile_y }]);
            setTimeout(() => setSplatters(prev => prev.filter(s => s.id !== splatterId)), 600);

            if (isCritical || isKill) {
              setShake(true);
              setTimeout(() => setShake(false), 500);
            }

            if (isCritical) {
              setVaultBoy({ id: Date.now(), type: 'critical', message: 'CRITICAL HIT!' });
              setTimeout(() => setVaultBoy(null), 2500);
            }

            // Slow Motion Finisher
            if (isKill && target.type === 'npc') {
              const remainingNpcs = combatState.turn_order.filter((c: Combatant) => c.type === 'npc' && !c.is_dead).length;
              // If this was the last NPC or a significant kill
              if (remainingNpcs <= 1) {
                setIsSlowMo(true);
                setTimeout(() => setIsSlowMo(false), 2000);
              }
            }

            setTimeout(() => {
              setDamageNumbers(prev => prev.filter(dn => dn.id !== id));
            }, 1000);
          }
        }

        // 3. Special Notifications (Vault Boy)
        const msg = entry.message?.toUpperCase() || '';
        if (msg.includes('LEVEL UP')) {
          setVaultBoy({ id: Date.now(), type: 'levelup', message: 'LEVEL UP!' });
          setTimeout(() => setVaultBoy(null), 3000);
        } else if (msg.includes('CRIPPLED') || msg.includes('INJURED')) {
          setVaultBoy({ id: Date.now(), type: 'crippled', message: 'LIMB CRIPPLED!' });
          setTimeout(() => setVaultBoy(null), 3000);
        } else if (msg.includes('FAILED') || msg.includes('MISS')) {
          // Only show failure for player actions to avoid spam
          if (attacker?.type === 'player') {
            setVaultBoy({ id: Date.now(), type: 'failed', message: 'ATTACK FAILED' });
            setTimeout(() => setVaultBoy(null), 2000);
          }
        }
      });
      lastLogLength.current = log.length;
    }
  }, [combatState.combat_log, combatState.turn_order]);

  const map = combatState.map;
  const turnOrder = useMemo(() => {
    return combatState.turn_order.map((t: any) => {
      if (t.type === 'player') {
        const p = combatState.players?.find((p: any) => p.id === t.id);
        return { ...t, ...p };
      } else {
        const n = combatState.npcs?.find((n: any) => n.id === t.id);
        return { ...t, ...n };
      }
    });
  }, [combatState.turn_order, combatState.players, combatState.npcs]);
  const currentTurnIdx = combatState.current_turn_index;
  const currentCombatant = turnOrder[currentTurnIdx];
  const isPlayerTurn = currentCombatant?.type === 'player';

  // Build occupied positions map: key -> combatant
  const actorMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of turnOrder) {
      if (c.tile_x !== undefined && c.tile_y !== undefined) {
        m.set(`${c.tile_x},${c.tile_y}`, c);
      }
    }
    return m;
  }, [turnOrder]);

  // Build occupied set for pathfinding (exclude current player)
  const occupiedPositions = useMemo(() => {
    const s = new Set<string>();
    for (const c of turnOrder) {
      if (c.tile_x !== undefined && c.tile_y !== undefined) {
        if (!(c.type === currentCombatant?.type && c.id === currentCombatant?.id)) {
          s.add(`${c.tile_x},${c.tile_y}`);
        }
      }
    }
    return s;
  }, [turnOrder, currentCombatant]);

  // Path preview on hover
  const pathPreview = useMemo(() => {
    if (!moveMode || !hoverTile || !isPlayerTurn || !currentCombatant) return null;
    if (currentCombatant.tile_x === undefined) return null;
    return findPath(map, currentCombatant.tile_x, currentCombatant.tile_y, hoverTile.x, hoverTile.y, occupiedPositions);
  }, [moveMode, hoverTile, isPlayerTurn, currentCombatant, map, occupiedPositions]);

  // Path preview tile set for highlighting
  const pathTileSet = useMemo(() => {
    const s = new Set<string>();
    if (pathPreview?.valid && pathPreview.path) {
      for (const p of pathPreview.path) s.add(`${p.x},${p.y}`);
    }
    return s;
  }, [pathPreview]);

  const handleTileClick = (x: number, y: number) => {
    if (!isPlayerTurn) return;

    if (moveMode) {
      onMove(x, y);
      setMoveMode(false);
      return;
    }

    // If pending attack action, check if an actor is on this tile
    if (pendingAction === 'attack' || pendingAction === 'aimed_shot') {
      const actor = actorMap.get(`${x},${y}`);
      if (actor && actor.type === 'npc') {
        setVatsTargetId(actor.id);
        return;
      }
    }
  };

  const calculateHitChance = (part: string, target: Combatant) => {
    if (!currentCombatant || !target || !gameState.player) return 0;
    
    const dist = Math.sqrt(
      Math.pow(currentCombatant.tile_x - target.tile_x, 2) + 
      Math.pow(currentCombatant.tile_y - target.tile_y, 2)
    );
    
    // Use server-like logic: skill - targetAc + aimedPenalty + rangePenalty
    const skill = currentCombatant.skill_value || (gameState.player.stats.perception * 10);
    const targetAc = target.armor_class || 0;
    
    const aimedPenalties: Record<string, number> = {
      torso: 0,
      head: -40,
      eyes: -60,
      arms: -30,
      legs: -20,
      groin: -30,
    };

    // Simple range penalty for client-side preview
    const rangePenalty = dist > 4 ? -(dist - 4) * 10 : 0;
    
    const raw = skill - targetAc + (aimedPenalties[part] || 0) + rangePenalty;
    return Math.max(5, Math.min(95, Math.floor(raw)));
  };

  const vatsTarget = vatsTargetId ? combatState.npcs.find((n: any) => n.id === vatsTargetId) : null;

  // Compute grid bounds for centering
  const gridOffset = isoProject(0, map.height - 1);
  const gridRight = isoProject(map.width - 1, 0);
  const totalWidth = gridRight.left - gridOffset.left + TILE_W;
  const totalHeight = isoProject(map.width - 1, map.height - 1).top + TILE_H;

  // Kill Cam Zoom Logic
  const killCamTarget = useMemo(() => {
    if (!isSlowMo) return null;
    // Find the target that was just killed
    const log = combatState.combat_log || [];
    const lastEntry = log[log.length - 1];
    if (lastEntry && (lastEntry.message?.toUpperCase().includes('KILLED') || lastEntry.message?.toUpperCase().includes('DIED'))) {
      return turnOrder.find((c: any) => c.name === lastEntry.target);
    }
    return null;
  }, [isSlowMo, combatState.combat_log, turnOrder]);

  return (
    <div className="crt border border-red-500 p-4 flex-1 flex flex-col overflow-hidden relative">
      <h2 className="text-xl border-b border-red-500 pb-2 mb-2 text-red-500">COMBAT ENGAGED - TACTICAL VIEW</h2>
      <div className="mb-2 text-sm text-red-400">
        Round: {combatState.current_round} | Turn: {currentCombatant?.name} | AP: {currentCombatant?.ap_remaining}
        {moveMode && ' | MOVE MODE - Click a tile'}
        {pathPreview?.valid && hoverTile && ` | Move cost: ${pathPreview.totalApCost} AP`}
        {pathPreview && !pathPreview.valid && hoverTile && ' | No valid path'}
      </div>

      {/* Isometric grid */}
      <motion.div 
        animate={{
          x: shake ? [-5, 5, -5, 5, 0] : 0,
          y: shake ? [-5, 5, -5, 5, 0] : 0,
          scale: isSlowMo ? 1.5 : 1,
          originX: killCamTarget ? 0.5 : 0.5, // Default center
          originY: killCamTarget ? 0.5 : 0.5,
        }}
        transition={{ duration: isSlowMo ? 0.8 : 0.4 }}
        className="flex-1 overflow-auto relative h-full" 
      >
        <motion.div 
          className="relative" 
          style={{ width: totalWidth, height: totalHeight, margin: '0 auto' }}
          animate={killCamTarget ? {
            x: -(isoProject(killCamTarget.tile_x, killCamTarget.tile_y).left - gridOffset.left - totalWidth / 2 + TILE_W / 2),
            y: -(isoProject(killCamTarget.tile_x, killCamTarget.tile_y).top - totalHeight / 2 + TILE_H / 2),
          } : { x: 0, y: 0 }}
          transition={{ duration: isSlowMo ? 1.5 : 0.5, type: 'spring', bounce: 0 }}
        >
          {/* Grid Overlay (Tactical Feel) */}
          <div className="absolute inset-0 pointer-events-none opacity-5" style={{ 
            backgroundImage: `linear-gradient(rgba(34,197,94,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.2) 1px, transparent 1px)`,
            backgroundSize: `${TILE_W}px ${TILE_H}px`,
            transform: 'rotateX(60deg) rotateZ(45deg) scale(2)',
            transformOrigin: 'center center'
          }} />

          {map.tiles.map((tile) => {
            const pos = isoProject(tile.x, tile.y);
            const adjustedLeft = pos.left - gridOffset.left;
            const tileKey = `${tile.x},${tile.y}`;
            const isOnPath = pathTileSet.has(tileKey);
            const isHovered = hoverTile?.x === tile.x && hoverTile?.y === tile.y;

            return (
              <div
                key={tileKey}
                className="absolute cursor-pointer"
                style={{
                  left: adjustedLeft,
                  top: pos.top,
                  width: TILE_W,
                  height: TILE_H,
                }}
                onClick={() => handleTileClick(tile.x, tile.y)}
                onMouseEnter={() => setHoverTile({ x: tile.x, y: tile.y })}
                onMouseLeave={() => setHoverTile(null)}
              >
                {/* Diamond-shaped tile */}
                <div
                  className={`absolute inset-0 border ${TILE_COLORS[tile.kind] || TILE_COLORS.floor} ${
                    isOnPath ? '!bg-cyan-800/60' : ''
                  } ${isHovered && moveMode ? '!border-cyan-400' : ''}`}
                  style={{
                    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                  }}
                >
                  <TerrainTile kind={tile.kind} className="opacity-40" />
                  {/* Texture Overlay */}
                  <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:4px_4px]" />
                  {isHovered && (
                    <div className="absolute inset-0 bg-white/5 pointer-events-none" />
                  )}
                </div>

                {tile.object_kind && tile.object_kind !== 'none' && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-1/2 w-10 h-10 z-10 pointer-events-none">
                    <EnvironmentObject kind={tile.object_kind} className="w-full h-full" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Actors (Rendered separately for smooth movement) */}
          {turnOrder.map((actor: Combatant) => {
            if (actor.tile_x === undefined || actor.tile_y === undefined) return null;
            const pos = isoProject(actor.tile_x, actor.tile_y);
            const adjustedLeft = pos.left - gridOffset.left;
            const isCurrentActor = currentCombatant?.id === actor.id && currentCombatant?.type === actor.type;

            return (
              <motion.div
                key={`${actor.type}-${actor.id}`}
                layoutId={`${actor.type}-${actor.id}`}
                initial={false}
                animate={{ left: adjustedLeft, top: pos.top }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                className={`absolute text-[9px] font-bold text-center leading-tight pointer-events-none ${
                  actor.type === 'player' ? 'text-green-400' : 'text-red-400'
                } ${isCurrentActor ? 'z-20' : 'z-10'}`}
                style={{
                  width: TILE_W,
                  height: TILE_H,
                }}
              >
                <div className="absolute top-[-20px] left-0 right-0 flex flex-col items-center">
                  <div className={`px-1 rounded ${isCurrentActor ? 'bg-green-500 text-black' : 'bg-black/80'}`}>
                    {actor.name.toUpperCase()}
                  </div>
                  <div className="w-8 h-1 bg-gray-800 mt-0.5 rounded-full overflow-hidden border border-black">
                    <div 
                      className={`h-full ${actor.type === 'player' ? 'bg-green-500' : 'bg-red-500'}`} 
                      style={{ width: `${(actor.hit_points / actor.max_hit_points) * 100}%` }} 
                    />
                  </div>
                  {actor.status_effects && actor.status_effects.length > 0 && !actor.is_dead && (
                    <div className="flex gap-1 mt-0.5">
                      {actor.status_effects.map((effect, idx) => {
                        const type = typeof effect === 'string' ? effect : effect.type;
                        const message = typeof effect === 'string' ? effect : effect.message;
                        return (
                          <div 
                            key={`${type}-${idx}`} 
                            className={`w-1.5 h-1.5 rounded-full ${type === 'irradiated' ? 'bg-lime-500' : type === 'poisoned' ? 'bg-purple-500' : 'bg-gray-500'}`}
                            title={message}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <CharacterSprite 
                      name={actor.name}
                      isHostile={actor.type !== 'player'}
                      dead={actor.hit_points <= 0}
                      type={actor.type}
                      className={`w-16 h-16 ${isCurrentActor ? 'animate-pulse scale-110' : ''}`}
                      animationState={animationStates[`${actor.type}-${actor.id}`] || 'idle'}
                      statusEffects={actor.status_effects}
                      limbCondition={actor.limb_condition}
                    />
                    
                    {/* Shadow */}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-black/40 rounded-full blur-[1px]" />
                    
                    {/* Selection Ring */}
                    {isCurrentActor && (
                      <motion.div 
                        animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className={`absolute -inset-2 border-2 rounded-full ${actor.type === 'player' ? 'border-green-500' : 'border-red-500'}`}
                        style={{ transform: 'rotateX(60deg)' }}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Floating Damage Numbers */}
          <AnimatePresence>
            {damageNumbers.map(dn => {
              const pos = isoProject(dn.x, dn.y);
              const adjustedLeft = pos.left - gridOffset.left;
              return (
                <motion.div
                  key={dn.id}
                  initial={{ opacity: 0, y: 0, scale: 0.5 }}
                  animate={{ opacity: 1, y: -40, scale: dn.isCritical ? 1.5 : 1 }}
                  exit={{ opacity: 0, y: -60 }}
                  className={`absolute z-30 font-black pointer-events-none ${dn.isCritical ? 'text-yellow-400 text-2xl' : 'text-red-500 text-lg'}`}
                  style={{ left: adjustedLeft + TILE_W / 2 - 10, top: pos.top }}
                >
                  -{dn.value}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Projectiles */}
          <AnimatePresence>
            {projectiles.map(p => {
              const from = isoProject(p.fromX, p.fromY);
              const to = isoProject(p.toX, p.toY);
              const fromLeft = from.left - gridOffset.left + TILE_W / 2;
              const fromTop = from.top + TILE_H / 2;
              const toLeft = to.left - gridOffset.left + TILE_W / 2;
              const toTop = to.top + TILE_H / 2;

              return (
                <motion.div
                  key={p.id}
                  initial={{ left: fromLeft, top: fromTop, opacity: 1, scale: p.type === 'plasma' ? 0.5 : 1 }}
                  animate={{ left: toLeft, top: toTop, scale: p.type === 'plasma' ? 1.5 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: isSlowMo ? 0.9 : 0.3, ease: "linear" }}
                  className={`absolute z-40 pointer-events-none ${
                    p.type === 'laser' ? 'w-8 h-1 bg-red-500 shadow-[0_0_10px_red]' : 
                    p.type === 'plasma' ? 'w-4 h-4 bg-green-400 rounded-full shadow-[0_0_15px_#4ade80] blur-[1px]' :
                    p.type === 'gamma' ? 'w-10 h-2 bg-purple-500/50 border-l-4 border-purple-300 shadow-[0_0_10px_purple]' :
                    'w-1.5 h-1.5 bg-yellow-200 rounded-full shadow-[0_0_5px_yellow]'
                  }`}
                  style={{ 
                    transform: `rotate(${Math.atan2(toTop - fromTop, toLeft - fromLeft)}rad)`,
                    borderRadius: p.type === 'gamma' ? '50% 0 0 50%' : undefined
                  }}
                />
              );
            })}
          </AnimatePresence>

          {/* Particles */}
          <AnimatePresence>
            {particles.map(p => {
              const pos = isoProject(p.x, p.y);
              const adjustedLeft = pos.left - gridOffset.left + TILE_W / 2;
              const adjustedTop = pos.top + TILE_H / 2;

              return (
                <motion.div
                  key={p.id}
                  initial={{ left: adjustedLeft, top: adjustedTop, opacity: 1, scale: 1 }}
                  animate={{ 
                    left: adjustedLeft + p.vx * 1000, 
                    top: adjustedTop + p.vy * 1000, 
                    opacity: 0, 
                    scale: 0 
                  }}
                  transition={{ duration: isSlowMo ? 1.5 : 0.6, ease: "easeOut" }}
                  className="absolute z-30 w-1 h-1 pointer-events-none"
                  style={{ backgroundColor: p.color }}
                />
              );
            })}
          </AnimatePresence>

          {/* Muzzle Flashes */}
          {flashes.map(f => (
            <MuzzleFlash key={f.id} {...f} gridOffset={gridOffset} />
          ))}

          {/* Blood Splatters */}
          {splatters.map(s => (
            <BloodSplatter key={s.id} {...s} gridOffset={gridOffset} />
          ))}
        </motion.div>
      </motion.div>

      {/* Slow Motion Overlay */}
      <AnimatePresence>
        {isSlowMo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] pointer-events-none bg-white/5 backdrop-grayscale-[0.5]"
          />
        )}
      </AnimatePresence>

      {/* Atmospheric Glow */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />

      <DustParticles />

      {/* Vault Boy Notification Overlay */}
      <AnimatePresence>
        {vaultBoy && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.5, y: -100 }}
            className="fixed bottom-24 right-8 z-[100] flex flex-col items-center"
          >
            <div className={`relative w-48 h-48 border-4 rounded-full flex items-center justify-center overflow-hidden ${
              vaultBoy.type === 'failed' ? 'bg-red-500/10 border-red-500' :
              vaultBoy.type === 'crippled' ? 'bg-amber-500/10 border-amber-500' :
              'bg-green-500/10 border-green-500'
            }`}>
              <div className={`absolute inset-0 ${
                vaultBoy.type === 'failed' ? 'bg-[radial-gradient(circle,rgba(239,68,68,0.2)_0%,transparent_70%)]' :
                vaultBoy.type === 'crippled' ? 'bg-[radial-gradient(circle,rgba(245,158,11,0.2)_0%,transparent_70%)]' :
                'bg-[radial-gradient(circle,rgba(34,197,94,0.2)_0%,transparent_70%)]'
              }`} />
              
              {/* Vault Boy SVG with dynamic expressions */}
              <svg viewBox="0 0 100 100" className={`w-32 h-32 fill-current ${
                vaultBoy.type === 'failed' ? 'text-red-500' :
                vaultBoy.type === 'crippled' ? 'text-amber-500' :
                'text-green-500'
              }`}>
                <circle cx="50" cy="35" r="20" /> {/* Head */}
                <path d="M30 60 Q50 45 70 60 L65 90 L35 90 Z" /> {/* Body */}
                
                {/* Dynamic Arms/Thumbs */}
                {vaultBoy.type === 'failed' ? (
                  <path d="M30 60 L15 75 M70 60 L85 75" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                ) : vaultBoy.type === 'crippled' ? (
                  <path d="M30 60 L15 50 M70 60 L85 70" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                ) : (
                  <>
                    <path d="M70 60 L85 45" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="85" cy="45" r="4" />
                  </>
                )}

                {/* Eyes */}
                {vaultBoy.type === 'failed' ? (
                  <path d="M40 35 L45 30 M45 35 L40 30 M55 35 L60 30 M60 35 L55 30" stroke="black" strokeWidth="2" />
                ) : (
                  <path d="M40 30 Q50 25 60 30" fill="none" stroke="black" strokeWidth="2" />
                )}

                {/* Mouth */}
                {vaultBoy.type === 'failed' || vaultBoy.type === 'crippled' ? (
                  <path d="M42 52 Q50 45 58 52" fill="none" stroke="black" strokeWidth="2" />
                ) : (
                  <path d="M42 45 Q50 52 58 45" fill="none" stroke="black" strokeWidth="2" />
                )}
              </svg>
            </div>
            <div className={`mt-4 px-6 py-2 font-black text-xl tracking-tighter skew-x-[-12deg] ${
              vaultBoy.type === 'failed' ? 'bg-red-500 text-white' :
              vaultBoy.type === 'crippled' ? 'bg-amber-500 text-black' :
              'bg-green-500 text-black'
            }`}>
              {vaultBoy.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      {!isGenerating && isPlayerTurn && !pendingAction && (
        <div className="mt-2">
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => setMoveMode(!moveMode)} className={`border p-2 text-xs ${moveMode ? 'bg-cyan-900 border-cyan-500 text-cyan-300' : 'border-red-500 hover:bg-red-900 text-red-500'}`}>
              {moveMode ? 'CANCEL MOVE' : 'MOVE'}
            </button>
            <button onClick={() => { setMoveMode(false); setPendingAction('vats'); }} className="border border-red-500 p-2 hover:bg-red-900 text-red-500 text-xs">V.A.T.S.</button>
            <button onClick={() => { setMoveMode(false); setPendingAction('attack'); }} className="border border-red-500 p-2 hover:bg-red-900 text-red-500 text-xs">ATTACK</button>
            <button onClick={() => onAction('defend')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500 text-xs">DEFEND</button>
            <button onClick={() => onAction('reload')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500 text-xs">RELOAD</button>
            <button onClick={() => { setMoveMode(false); setPendingAction('use_item'); }} className="border border-red-500 p-2 hover:bg-red-900 text-red-500 text-xs">USE ITEM</button>
            <button onClick={() => onAction('flee')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500 text-xs">FLEE</button>
            <button onClick={() => onAction('end_turn')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500 text-xs">END TURN</button>
          </div>
        </div>
      )}

      {/* V.A.T.S. Overlay */}
      {vatsTarget && (
        <div className="crt fixed inset-0 z-[100] bg-green-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-black border-2 border-green-500 w-full max-w-2xl p-6 relative overflow-hidden">
            {/* Scanlines */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] z-10 bg-[length:100%_2px]" />
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-3xl font-black text-green-500 tracking-tighter">V.A.T.S.</h2>
                <div className="text-xs text-green-700 font-bold">VAULT-TEC ASSISTED TARGETING SYSTEM</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-500">{vatsTarget.name.toUpperCase()}</div>
                <div className="text-sm text-green-700">HP: {vatsTarget.hit_points}/{vatsTarget.max_hit_points}</div>
              </div>
            </div>

            {/* Critical Meter */}
            <div className="mb-6 border border-green-900 p-3 bg-green-950/20">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-green-700 uppercase">Critical Meter</span>
                <span className="text-[10px] font-bold text-green-500">{criticalMeter}%</span>
              </div>
              <div className="w-full h-4 bg-green-900/30 border border-green-900 relative overflow-hidden">
                <motion.div 
                  className={`h-full ${criticalMeter >= 100 ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${criticalMeter}%` }}
                />
                {criticalMeter >= 100 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-black text-black uppercase tracking-widest">CRITICAL READY</span>
                  </div>
                )}
              </div>
              {criticalMeter >= 100 && (
                <button 
                  onClick={() => setUseCritical(!useCritical)}
                  className={`mt-2 w-full border-2 p-1 text-xs font-bold transition-all ${useCritical ? 'bg-yellow-500 border-yellow-400 text-black' : 'border-yellow-500 text-yellow-500 hover:bg-yellow-500/10'}`}
                >
                  {useCritical ? 'CRITICAL ACTIVE' : 'EXECUTE CRITICAL'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col items-center justify-center border border-green-900 p-4 bg-green-950/10 relative overflow-hidden">
                {/* VATS Scanning Line */}
                <motion.div 
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 right-0 h-0.5 bg-green-400/50 shadow-[0_0_10px_rgba(74,222,128,0.5)] z-20"
                />
                {/* Target Silhouette Mockup */}
                <div className="w-48 h-64 border-2 border-green-500/30 relative flex items-center justify-center">
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20">
                    <div className="w-12 h-12 rounded-full border-2 border-green-500 mb-2" />
                    <div className="w-24 h-32 border-2 border-green-500 mb-2" />
                    <div className="flex gap-4">
                      <div className="w-8 h-24 border-2 border-green-500" />
                      <div className="w-8 h-24 border-2 border-green-500" />
                    </div>
                  </div>
                  <div className="text-[10px] text-green-500/50 uppercase font-bold">Targeting Matrix Active</div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-green-700 uppercase mb-4 border-b border-green-900 pb-1">Select Target Area</h3>
                {['head', 'eyes', 'torso', 'arms', 'legs', 'groin'].map(part => {
                  const chance = calculateHitChance(part, vatsTarget);
                  const limbKey = {
                    head: 'head', eyes: 'head', torso: 'torso', arms: 'right_arm', legs: 'right_leg', groin: 'torso'
                  }[part as 'head' | 'eyes' | 'torso' | 'arms' | 'legs' | 'groin'];
                  const limbHealth = vatsTarget.limb_condition ? vatsTarget.limb_condition[limbKey] : 100;

                  return (
                    <button
                      key={part}
                      onClick={() => {
                        onAction('aimed_shot', vatsTarget.id, part, useCritical);
                        setVatsTargetId(null);
                        setPendingAction(null);
                        setUseCritical(false);
                      }}
                      className="w-full group flex justify-between items-center border border-green-900 p-3 hover:bg-green-500 hover:text-black transition-all"
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-bold uppercase">{part}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-16 h-1 bg-green-900/50 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${limbHealth < 25 ? 'bg-red-500' : limbHealth < 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={{ width: `${limbHealth}%` }}
                            />
                          </div>
                          <span className="text-[8px] opacity-50 group-hover:text-black/70">{limbHealth}% CND</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-green-900/30 overflow-hidden">
                          <div className="h-full bg-green-500 group-hover:bg-black" style={{ width: `${chance}%` }} />
                        </div>
                        <span className="text-lg font-black w-12 text-right">{chance}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center border-t border-green-900 pt-4">
              <div className="text-xs text-green-700 font-bold">AP COST: 4</div>
              <button
                onClick={() => {
                  setVatsTargetId(null);
                  setPendingAction(null);
                }}
                className="border-2 border-green-500 px-6 py-2 text-sm font-bold hover:bg-green-500 hover:text-black transition-all"
              >
                CANCEL [ESC]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending attack: click an NPC on the grid */}
      {(pendingAction === 'attack' || pendingAction === 'vats') && !vatsTargetId && (
        <div className="mt-2 text-xs text-red-400">
          Click an enemy on the grid to {pendingAction === 'vats' ? 'engage V.A.T.S.' : 'attack'}.
          <button onClick={() => setPendingAction(null)} className="ml-2 border border-gray-500 px-2 py-1 hover:bg-gray-800 text-gray-400">CANCEL</button>
        </div>
      )}

      {/* Aimed shot: body part selection */}
      {pendingAction === 'aimed_shot' && !selectedBodyPart && (
        <div className="mt-2">
          <h3 className="text-sm text-red-500 mb-2">Select Target Area</h3>
          <div className="grid grid-cols-3 gap-2">
            {['head', 'eyes', 'torso', 'arms', 'legs', 'groin'].map(part => (
              <button key={part} onClick={() => setSelectedBodyPart(part)} className="border border-red-500 p-1 text-xs hover:bg-red-900 text-red-500 uppercase">{part}</button>
            ))}
          </div>
          <button onClick={() => setPendingAction(null)} className="mt-2 w-full border border-gray-500 p-1 text-xs hover:bg-gray-800 text-gray-400">CANCEL</button>
        </div>
      )}

      {pendingAction === 'aimed_shot' && selectedBodyPart && (
        <div className="mt-2 text-xs text-red-400">
          Aimed at {selectedBodyPart} - click an enemy on the grid.
          <button onClick={() => { setPendingAction(null); setSelectedBodyPart(null); }} className="ml-2 border border-gray-500 px-2 py-1 hover:bg-gray-800 text-gray-400">CANCEL</button>
        </div>
      )}

      {/* Use item in combat */}
      {pendingAction === 'use_item' && (
        <div className="mt-2">
          <h3 className="text-sm text-red-500 mb-2">Select Item to Use</h3>
          <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
            {gameState?.inventory?.filter((i: any) => i.type === 'healing').map((item: any) => (
              <button key={item.id} onClick={() => onAction('use_item', item.id)} className="border border-red-500 p-1 text-xs hover:bg-red-900 text-red-500 text-left flex justify-between">
                <span>{item.name}</span>
                <span>x{item.quantity}</span>
              </button>
            ))}
            {gameState?.inventory?.filter((i: any) => i.type === 'healing').length === 0 && (
              <div className="text-xs text-red-400 opacity-50">No usable items.</div>
            )}
          </div>
          <button onClick={() => setPendingAction(null)} className="mt-2 w-full border border-gray-500 p-1 text-xs hover:bg-gray-800 text-gray-400">CANCEL</button>
        </div>
      )}

      {/* NPC list with HP for reference */}
      <div className="mt-2 border-t border-red-900 pt-2">
        <div className="flex gap-4 text-xs">
          {combatState.npcs.map((npc: any) => (
            <span key={npc.id} className={npc.hp <= 0 ? 'opacity-30 line-through' : 'text-red-400'}>
              {npc.name}: {npc.hp}/{npc.max_hp}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
