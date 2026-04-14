import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, User, Star, Package, ClipboardList, Globe, Shield, Zap, PlusCircle, Skull, Target, Activity, EyeOff, Radio, Music, Newspaper, Volume2, VolumeX } from 'lucide-react';
import type { PipBoyTab, GameState, Perk, Player, PlayerVitals, PlayerStats } from '../types/app';
import CharacterSprite from './CharacterSprite';
import ItemIcon from './ItemIcon';

interface PipBoyOverlayProps {
  activeTab: PipBoyTab;
  onTabChange: (tab: PipBoyTab) => void;
  onClose: () => void;
  gameState: GameState | null;
  inventory: any[];
  worldLocations: any[];
  availablePerks: Perk[];
  onUseItem: (itemId: number) => void;
  onEquipItem: (itemId: number) => void;
  onLevelUp: (stat: string) => void;
  onChoosePerk: (perkId: number) => void;
  onTravel: (locationId: number) => void;
}

const TABS: { id: PipBoyTab; icon: any }[] = [
  { id: 'status', icon: User },
  { id: 'inventory', icon: Package },
  { id: 'quests', icon: ClipboardList },
  { id: 'map', icon: Globe },
  { id: 'radio', icon: Radio },
];

export default function PipBoyOverlay({
  activeTab,
  onTabChange,
  onClose,
  gameState,
  inventory,
  worldLocations,
  availablePerks,
  onUseItem,
  onEquipItem,
  onLevelUp,
  onChoosePerk,
  onTravel,
}: PipBoyOverlayProps) {
  const [isBooting, setIsBooting] = useState(true);
  const player = gameState?.player;
  const vitals = player?.vitals;
  const stats = player?.stats;
  const isLowHp = vitals && (vitals.hit_points / vitals.max_hit_points) < 0.25;

  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.1, filter: 'brightness(2) blur(10px)' }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        filter: isLowHp ? 'brightness(1.2) contrast(1.5) hue-rotate(10deg)' : 'brightness(1) blur(0px)',
        x: isLowHp ? [0, -2, 2, -1, 0] : 0,
        y: isLowHp ? [0, 1, -1, 2, 0] : 0
      }}
      exit={{ opacity: 0, scale: 0.9, filter: 'brightness(0) blur(20px)' }}
      transition={{ 
        duration: 0.3, 
        ease: "easeOut",
        x: isLowHp ? { duration: 0.1, repeat: Infinity } : { duration: 0.3 },
        y: isLowHp ? { duration: 0.15, repeat: Infinity } : { duration: 0.3 }
      }}
      className="crt fixed inset-0 z-50 bg-black text-green-500 font-mono flex flex-col overflow-hidden"
    >
      <AnimatePresence>
        {isBooting && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] bg-black flex flex-col items-center justify-center p-12"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.5, 1] }}
              transition={{ duration: 0.5, times: [0, 0.1, 0.2, 1] }}
              className="text-center space-y-4"
            >
              <div className="text-4xl font-black tracking-tighter animate-pulse">ROBCO INDUSTRIES</div>
              <div className="text-xs tracking-[0.5em] opacity-50">UNIFIED OPERATING SYSTEM</div>
              <div className="w-64 h-1 bg-green-900 mt-8 relative overflow-hidden">
                <motion.div 
                  initial={{ x: '-100%' }}
                  animate={{ x: '0%' }}
                  transition={{ duration: 1, ease: "easeInOut" }}
                  className="absolute inset-0 bg-green-500"
                />
              </div>
              <div className="text-[10px] opacity-30 mt-4">COPYRIGHT 2075-2077 ROBCO CORP</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scanline effect */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-50 bg-[length:100%_2px,3px_100%]" />
      
      {/* CRT Flicker Overlay */}
      <motion.div 
        animate={{ opacity: [0.05, 0.15, 0.08, 0.12, 0.05] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="fixed inset-0 pointer-events-none bg-green-500/5 z-[45]"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-green-500 px-6 py-4 bg-green-950/20">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl tracking-widest font-bold">PIP-BOY 3000</h1>
          <div className="text-[10px] opacity-50 border border-green-900 px-2 py-0.5">V-TEC UOS v7.1.0</div>
        </div>
        <button
          onClick={onClose}
          className="border-2 border-green-500 px-4 py-1 hover:bg-green-500 hover:text-black transition-all text-sm font-bold"
        >
          RETURN [ESC]
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-green-500 bg-green-950/10">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-3 text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-all ${
              activeTab === tab.id
                ? 'bg-green-500 text-black font-bold'
                : 'hover:bg-green-900/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.id}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="h-full"
            >
              {activeTab === 'status' && (
                <StatusTab 
                  player={player} 
                  vitals={vitals} 
                  stats={stats} 
                  onLevelUp={onLevelUp} 
                  availablePerks={availablePerks}
                  onChoosePerk={onChoosePerk}
                />
              )}
              {activeTab === 'inventory' && (
                <InventoryTab
                  inventory={inventory}
                  equipment={player?.equipment}
                  onUseItem={onUseItem}
                  onEquipItem={onEquipItem}
                />
              )}
              {activeTab === 'quests' && (
                <QuestsTab quests={player?.quests} />
              )}
              {activeTab === 'map' && (
                <MapTab 
                  location={gameState?.location} 
                  worldLocations={worldLocations} 
                  onTravel={onTravel}
                  player={player}
                />
              )}
              {activeTab === 'radio' && (
                <RadioTab />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="border-t border-green-500 px-6 py-2 bg-green-950/20 flex justify-between items-center text-[10px] font-bold">
        <div className="flex gap-6">
          <span>HP {vitals?.hit_points}/{vitals?.max_hit_points}</span>
          <span>LEVEL {vitals?.level}</span>
          <span>XP {vitals?.experience_points}/{vitals?.level * 1000}</span>
        </div>
        <div className="flex gap-6">
          <span>CAPS {vitals?.money}</span>
          <span>RADS 0mSv</span>
        </div>
      </div>
    </motion.div>
  );
}

const PERK_ICONS: Record<string, any> = {
  'Toughness': Shield,
  'Strong Back': Package,
  'Better Criticals': Target,
  'Action Boy': Activity,
  'Medic': PlusCircle,
  'Bloody Mess': Skull,
};

function StatusTab({ player, vitals, stats, onLevelUp, availablePerks, onChoosePerk }: {
  player: Player;
  vitals: PlayerVitals;
  stats: PlayerStats;
  onLevelUp: (stat: string) => void;
  availablePerks: Perk[];
  onChoosePerk: (perkId: number) => void;
}) {
  const [subTab, setSubTab] = useState<'general' | 'perks'>('general');

  if (!player) return <div className="opacity-50">No data available.</div>;

  const canLevelUp = vitals?.experience_points >= vitals?.level * 1000;
  const hasPerkPoints = vitals?.perk_points > 0;

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex gap-4 border-b border-green-900 pb-2">
        <button 
          onClick={() => setSubTab('general')}
          className={`text-xs px-3 py-1 uppercase tracking-widest ${subTab === 'general' ? 'bg-green-500 text-black font-bold' : 'border border-green-900 hover:bg-green-950'}`}
        >
          General
        </button>
        <button 
          onClick={() => setSubTab('perks')}
          className={`text-xs px-3 py-1 uppercase tracking-widest flex items-center gap-2 ${subTab === 'perks' ? 'bg-green-500 text-black font-bold' : 'border border-green-900 hover:bg-green-950'}`}
        >
          Perks {hasPerkPoints && <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />}
        </button>
      </div>

      {subTab === 'general' ? (
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
              <div className="w-12 h-12 border border-green-500 bg-green-950/20 overflow-hidden relative">
                <CharacterSprite name={player.name} type="player" className="absolute inset-0 w-full h-full" />
              </div>
              {player.name.toUpperCase()}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-green-900 p-3 bg-green-950/5 md:col-span-2">
                <div className="text-[10px] opacity-50 uppercase mb-2">Limb Condition</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(vitals?.limb_condition || {}).map(([limb, health]: [string, any]) => (
                    <div key={limb} className="flex flex-col">
                      <div className="flex justify-between text-[8px] uppercase mb-1">
                        <span>{limb.replace('_', ' ')}</span>
                        <span className={health < 25 ? 'text-red-500' : health < 50 ? 'text-yellow-500' : 'text-green-500'}>{health}%</span>
                      </div>
                      <div className="w-full h-1 bg-green-900/30 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${health}%` }}
                          className={`h-full ${health < 25 ? 'bg-red-500' : health < 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        />
                      </div>
                    </div>
                  ))}
                  {(!vitals?.limb_condition || Object.keys(vitals.limb_condition).length === 0) && (
                    <div className="text-[10px] opacity-30 italic col-span-full">All systems nominal.</div>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="border border-green-900 p-3 bg-green-950/5">
                  <div className="text-[10px] opacity-50 uppercase">Karma</div>
                  <div className="text-lg">{vitals?.karma >= 0 ? 'NEUTRAL' : 'EVIL'} ({vitals?.karma})</div>
                </div>
                <div className="border border-green-900 p-3 bg-green-950/5">
                  <div className="text-[10px] opacity-50 uppercase">Weight</div>
                  <div className="text-lg">0 / {stats?.strength * 10 + 50} lbs</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm border-b border-green-900 pb-1 mb-4 uppercase tracking-widest opacity-70">S.P.E.C.I.A.L. Attributes</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'].map(stat => (
                <div key={stat} className="border border-green-900 p-3 flex flex-col items-center group hover:bg-green-900/20 transition-all">
                  <span className="uppercase text-[10px] opacity-50 mb-1">{stat.substring(0, 3)}</span>
                  <span className="text-2xl font-bold">{stats?.[stat] ?? '?'}</span>
                </div>
              ))}
            </div>
          </div>

          {canLevelUp && (
            <motion.div 
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border-2 border-amber-500 p-6 bg-amber-950/10 text-amber-500"
            >
              <h3 className="text-lg mb-2 font-bold flex items-center gap-2 animate-pulse">
                <Star className="w-5 h-5 fill-amber-500" /> LEVEL UP AVAILABLE!
              </h3>
              <p className="text-xs mb-4 opacity-80">Select a S.P.E.C.I.A.L. attribute to permanently increase:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'].map(stat => (
                  <button
                    key={stat}
                    onClick={() => onLevelUp(stat)}
                    className="border-2 border-amber-500 p-2 text-[10px] hover:bg-amber-500 hover:text-black transition-all uppercase font-bold"
                  >
                    +{stat.substring(0, 3)}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-green-900 pb-2">
            <h3 className="text-sm uppercase tracking-widest opacity-70">Available Perks</h3>
            {hasPerkPoints && (
              <div className="text-xs text-amber-400 font-bold animate-pulse">
                PERK POINTS: {vitals.perk_points}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availablePerks.map(perk => {
              const requirements = JSON.parse(perk.requirements_json || '{}');
              const hasPerk = player.perks?.some((p: any) => p.id === perk.id);
              
              // Check if requirements are met
              let unmetReqs = [];
              if (requirements.level && vitals.level < requirements.level) unmetReqs.push(`Level ${requirements.level}`);
              if (requirements.strength && stats.strength < requirements.strength) unmetReqs.push(`STR ${requirements.strength}`);
              if (requirements.perception && stats.perception < requirements.perception) unmetReqs.push(`PER ${requirements.perception}`);
              if (requirements.endurance && stats.endurance < requirements.endurance) unmetReqs.push(`END ${requirements.endurance}`);
              if (requirements.charisma && stats.charisma < requirements.charisma) unmetReqs.push(`CHA ${requirements.charisma}`);
              if (requirements.intelligence && stats.intelligence < requirements.intelligence) unmetReqs.push(`INT ${requirements.intelligence}`);
              if (requirements.agility && stats.agility < requirements.agility) unmetReqs.push(`AGI ${requirements.agility}`);
              if (requirements.luck && stats.luck < requirements.luck) unmetReqs.push(`LCK ${requirements.luck}`);

              const canAfford = hasPerkPoints && unmetReqs.length === 0 && !hasPerk;
              const Icon = PERK_ICONS[perk.name] || Star;

              return (
                <div 
                  key={perk.id} 
                  className={`border p-4 flex flex-col gap-2 transition-all ${
                    hasPerk 
                      ? 'border-green-500 bg-green-900/20' 
                      : unmetReqs.length > 0 
                        ? 'border-red-900/30 opacity-40' 
                        : 'border-green-900 hover:border-green-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${hasPerk ? 'text-green-300' : 'opacity-50'}`} />
                      <span className={`font-bold ${hasPerk ? 'text-green-300' : ''}`}>{perk.name.toUpperCase()}</span>
                    </div>
                    {hasPerk && <span className="text-[8px] bg-green-500 text-black px-1 font-bold">ACQUIRED</span>}
                  </div>
                  <p className="text-[10px] opacity-70 leading-relaxed">{perk.description}</p>
                  
                  {unmetReqs.length > 0 && !hasPerk && (
                    <div className="text-[8px] text-red-400 uppercase font-bold">
                      Requires: {unmetReqs.join(', ')}
                    </div>
                  )}

                  {canAfford && (
                    <button 
                      onClick={() => onChoosePerk(perk.id)}
                      className="mt-2 bg-green-900 text-green-300 text-[10px] py-1 hover:bg-green-500 hover:text-black transition-all font-bold uppercase"
                    >
                      Choose Perk
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {player.perks?.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm border-b border-green-900 pb-1 mb-4 uppercase tracking-widest opacity-70">Your Perks</h3>
              <div className="flex flex-wrap gap-2">
                {player.perks.map((perk: any) => (
                  <div key={perk.id} className="border border-green-500 px-3 py-1 text-xs bg-green-900/20">
                    {perk.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InventoryTab({ inventory, equipment, onUseItem, onEquipItem }: {
  inventory: any[];
  equipment: any;
  onUseItem: (id: number) => void;
  onEquipItem: (id: number) => void;
}) {
  if (!inventory || inventory.length === 0) {
    return <div className="text-sm opacity-50 flex flex-col items-center justify-center h-full gap-4">
      <Package className="w-12 h-12 opacity-20" />
      Your inventory is empty.
    </div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {inventory.map((item: any) => (
        <div key={item.id} className="border border-green-900 p-4 flex justify-between items-center hover:bg-green-900/10 transition-all group">
          <div className="w-12 h-12 mr-4 flex-shrink-0 bg-green-950/20 border border-green-900/50 p-1">
            <ItemIcon name={item.name} type={item.type} description={item.description} />
          </div>
          <div className="flex-1">
            <div className="font-bold flex items-center gap-2">
              {item.name} {item.quantity > 1 ? <span className="text-xs opacity-50">x{item.quantity}</span> : ''}
              {(equipment?.weapon_id === item.id || equipment?.armor_id === item.id) && (
                <span className="text-[8px] bg-green-500 text-black px-1 font-bold">EQUIPPED</span>
              )}
            </div>
            <div className="text-[10px] opacity-60 mt-1">{item.description}</div>
            <div className="flex gap-4 mt-2 text-[8px] opacity-40 uppercase">
              <span>Type: {item.type}</span>
              <span>Weight: {item.weight} lbs</span>
              <span>Value: {item.value} caps</span>
            </div>
          </div>
          <div className="flex gap-2">
            {item.type === 'healing' && (
              <button onClick={() => onUseItem(item.id)} className="border border-green-500 px-4 py-1 text-xs hover:bg-green-500 hover:text-black transition-all font-bold">USE</button>
            )}
            {(item.type === 'weapon' || item.type === 'armor') && (
              <button onClick={() => onEquipItem(item.id)} className="border border-green-500 px-4 py-1 text-xs hover:bg-green-500 hover:text-black transition-all font-bold">EQUIP</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuestsTab({ quests }: { quests: any[] }) {
  if (!quests || quests.length === 0) {
    return <div className="text-sm opacity-50 flex flex-col items-center justify-center h-full gap-4">
      <ClipboardList className="w-12 h-12 opacity-20" />
      No active quests.
    </div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {quests.map((q: any) => {
        const objectives = JSON.parse(q.objectives || '[]');
        const progress = JSON.parse(q.progress || '[]');
        return (
          <div key={q.id} className="border border-green-900 p-4 bg-green-950/5">
            <div className="font-bold text-green-300 mb-2 text-lg tracking-tight">{q.title.toUpperCase()}</div>
            <div className="text-xs opacity-70 mb-4 leading-relaxed">{q.description}</div>
            <div className="space-y-2">
              {objectives.map((obj: any, idx: number) => (
                <div
                  key={idx}
                  className={`text-[10px] flex items-center gap-3 ${progress[idx]?.completed ? 'line-through opacity-30' : 'opacity-90'}`}
                >
                  <div className={`w-2 h-2 border border-green-500 ${progress[idx]?.completed ? 'bg-green-500' : ''}`} />
                  <span>{obj.text} ({progress[idx]?.current_count || 0}/{obj.required_count})</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MapTab({ location, worldLocations, onTravel, player }: { 
  location: any; 
  worldLocations: any[];
  onTravel: (locationId: number) => void;
  player: any;
}) {
  const [selectedLocId, setSelectedLocId] = useState<number | null>(null);
  
  if (!location) {
    return <div className="text-sm opacity-50">No location data available.</div>;
  }

  const selectedLoc = worldLocations.find(l => l.id === selectedLocId) || null;
  const discoveredSectors = player?.discovered_sectors || [];

  // Grid constants
  const GRID_SIZE = 10;
  const cells = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const loc = worldLocations.find(l => l.world_x === x && l.world_y === y);
      const isCurrent = location.world_x === x && location.world_y === y;
      const isSelected = selectedLocId && loc?.id === selectedLocId;
      const isDiscovered = discoveredSectors.some((s: number[]) => s[0] === x && s[1] === y);

      cells.push(
        <div 
          key={`${x}-${y}`}
          onClick={() => loc && isDiscovered && setSelectedLocId(loc.id)}
          className={`aspect-square border border-green-900/10 relative group transition-all ${
            loc && isDiscovered ? 'cursor-pointer hover:bg-green-500/20' : ''
          } ${isSelected ? 'bg-green-500/40' : ''} ${!isDiscovered ? 'bg-black' : ''}`}
        >
          {isDiscovered ? (
            <>
              {loc && (
                <motion.div 
                  animate={isCurrent ? { scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`absolute inset-1 border ${isCurrent ? 'border-green-400' : 'border-green-700'}`}
                >
                  <div className={`absolute inset-0.5 ${isCurrent ? 'bg-green-400' : 'bg-green-900/50'}`} />
                </motion.div>
              )}
              {isCurrent && (
                <div className="absolute -inset-1 border border-green-400 animate-ping opacity-20 pointer-events-none" />
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center opacity-5">
              <EyeOff className="w-2 h-2" />
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-8 h-full">
      <div className="flex-1 flex flex-col gap-4">
        <div className="border border-green-500 p-4 bg-green-950/10">
          <h3 className="text-xl text-green-300 mb-2 uppercase tracking-widest flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Current: {location.name}
          </h3>
          <p className="text-[10px] opacity-70 leading-relaxed italic">"{location.description}"</p>
        </div>

        <div className="flex-1 bg-black border-2 border-green-900 p-2 relative overflow-hidden">
          {/* Grid Background */}
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #22c55e 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          
          <div className="grid grid-cols-10 gap-0.5 h-full border border-green-900/50">
            {cells}
          </div>

          <div className="absolute bottom-4 right-4 text-[8px] opacity-30 flex flex-col items-end">
            <span>GRID: 10x10</span>
            <span>COORD: {location.world_x}, {location.world_y}</span>
          </div>
        </div>
      </div>

      <div className="w-full md:w-72 flex flex-col gap-4">
        <div className="border border-green-900 p-4 flex-1 bg-green-950/5">
          <h4 className="text-xs uppercase tracking-widest opacity-50 mb-4 border-b border-green-900 pb-1">Location Details</h4>
          
          {selectedLoc ? (
            <div className="space-y-4">
              <div>
                <div className="text-lg font-bold text-green-300">{selectedLoc.name.toUpperCase()}</div>
                <div className="text-[10px] opacity-50">Coordinates: {selectedLoc.world_x}, {selectedLoc.world_y}</div>
              </div>
              <p className="text-[10px] leading-relaxed opacity-80">{selectedLoc.description}</p>
              
              {selectedLoc.id !== location.id && (
                <button 
                  onClick={() => onTravel(selectedLoc.id)}
                  className="w-full bg-green-900 text-green-300 py-2 text-xs font-bold hover:bg-green-500 hover:text-black transition-all uppercase mt-4"
                >
                  Initiate Travel
                </button>
              )}
              {selectedLoc.id === location.id && (
                <div className="text-[10px] text-green-500 font-bold uppercase text-center py-2 border border-green-500/30">
                  Current Location
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 gap-4">
              <Globe className="w-12 h-12" />
              <p className="text-[10px]">Select a discovered marker on the grid to view details or travel.</p>
            </div>
          )}
        </div>

        <div className="border border-green-900 p-3 text-[9px] opacity-50 space-y-1">
          <div className="flex justify-between"><span>LOCATIONS FOUND:</span> <span>{worldLocations.length}</span></div>
          <div className="flex justify-between"><span>FAST TRAVEL:</span> <span>ENABLED</span></div>
          <div className="flex justify-between"><span>SIGNAL STRENGTH:</span> <span>OPTIMAL</span></div>
        </div>
      </div>
    </div>
  );
}

const STATIONS = [
  {
    name: 'Galaxy News Radio',
    frequency: '98.3 FM',
    description: 'Bringing you the news, no matter how bad it is.',
    nowPlaying: 'Maybe - The Ink Spots',
    type: 'news',
    url: 'https://archive.org/download/78_maybe_the-ink-spots-allan-roberts_gbia0011534b/Maybe%20-%20The%20Ink%20Spots.mp3',
  },
  {
    name: 'Enclave Radio',
    frequency: '104.1 FM',
    description: 'God Bless America. God Bless the Enclave.',
    nowPlaying: 'Stars and Stripes Forever',
    type: 'propaganda',
    url: 'https://archive.org/download/StarsAndStripesForever_436/StarsAndStripesForever.mp3',
  },
  {
    name: 'Agatha\'s Station',
    frequency: '92.5 FM',
    description: 'Classical violin for the weary soul.',
    nowPlaying: 'Bach Partita No. 3',
    type: 'music',
    url: 'https://archive.org/download/BachPartitaNo.3InEMajorBwv1006-Preludio/BachPartitaNo.3InEMajorBwv1006-Preludio.mp3',
  },
  {
    name: 'Wasteland Emergency Broadcast',
    frequency: '88.1 AM',
    description: 'Automated emergency alerts and survival tips.',
    nowPlaying: 'Static / Signal Loss',
    type: 'emergency',
    url: '', // Static
  }
];

function RadioTab() {
  const [activeStation, setActiveStation] = useState<string | null>('Galaxy News Radio');
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);

  useEffect(() => {
    if (!activeStation || isMuted) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    const station = STATIONS.find(s => s.name === activeStation);
    if (!station || !station.url) {
      if (audioRef.current) audioRef.current.pause();
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = "anonymous";
      audioRef.current.loop = true;
    }

    if (audioRef.current.src !== station.url) {
      audioRef.current.src = station.url;
    }

    audioRef.current.play().catch(err => console.error("Audio play failed:", err));

    // Initialize AudioContext for "Radio Filter"
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
      
      // Create a "Radio" filter (Bandpass)
      filterRef.current = audioCtxRef.current.createBiquadFilter();
      filterRef.current.type = 'bandpass';
      filterRef.current.frequency.value = 1500; // Mid-range focus
      filterRef.current.Q.value = 1.0;

      const gain = audioCtxRef.current.createGain();
      gain.gain.value = 0.8;

      sourceRef.current.connect(filterRef.current);
      filterRef.current.connect(gain);
      gain.connect(audioCtxRef.current.destination);
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    return () => {
      // We don't necessarily want to stop on every re-render, 
      // but we should clean up if the component unmounts or station changes significantly
    };
  }, [activeStation, isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  const currentStation = STATIONS.find(s => s.name === activeStation);

  return (
    <div className="flex flex-col md:flex-row gap-8 h-full">
      <div className="flex-1 flex flex-col gap-4">
        <div className="border border-green-500 p-6 bg-green-950/10 flex flex-col items-center justify-center text-center relative overflow-hidden">
          {/* Audio Visualizer Mockup */}
          <div className="flex items-end gap-1 h-24 mb-6">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  height: activeStation && !isMuted ? [10, 40, 20, 60, 30, 80, 15] : 4
                }}
                transition={{
                  duration: 0.5 + Math.random(),
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-1 bg-green-500"
              />
            ))}
          </div>

          <div className="z-10">
            <h3 className="text-2xl font-bold text-green-300 mb-1 tracking-tighter">
              {activeStation ? activeStation.toUpperCase() : 'NO SIGNAL'}
            </h3>
            <div className="text-xs opacity-50 font-mono mb-4">{currentStation?.frequency || '---.- --'}</div>
            
            <div className="flex items-center justify-center gap-4 mb-6">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 border border-green-500 hover:bg-green-500 hover:text-black transition-all"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <div className="text-[10px] border border-green-900 px-4 py-2 bg-black/50 min-w-[200px]">
                <div className="opacity-40 uppercase mb-1 text-[8px]">Now Playing</div>
                <div className="truncate">{activeStation && !isMuted ? currentStation?.nowPlaying : '---'}</div>
              </div>
            </div>
          </div>

          {/* Background pattern */}
          <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#22c55e_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>

        <div className="border border-green-900 p-4 bg-green-950/5 flex-1">
          <h4 className="text-xs uppercase tracking-widest opacity-50 mb-3 border-b border-green-900 pb-1">Broadcast Details</h4>
          {currentStation ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{currentStation.description}</p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="border border-green-900/30 p-2">
                  <div className="text-[8px] opacity-40 uppercase">Signal Type</div>
                  <div className="text-xs font-bold uppercase">{currentStation.type}</div>
                </div>
                <div className="border border-green-900/30 p-2">
                  <div className="text-[8px] opacity-40 uppercase">Status</div>
                  <div className="text-xs font-bold uppercase text-green-400">Broadcasting</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs opacity-30 italic">Select a station to view broadcast details.</div>
          )}
        </div>
      </div>

      <div className="w-full md:w-72 flex flex-col gap-4">
        <div className="border border-green-900 p-4 flex-1 bg-green-950/5">
          <h4 className="text-xs uppercase tracking-widest opacity-50 mb-4 border-b border-green-900 pb-1">Available Stations</h4>
          <div className="space-y-2">
            {STATIONS.map(station => (
              <button
                key={station.name}
                onClick={() => setActiveStation(station.name)}
                className={`w-full text-left p-3 border transition-all flex items-center gap-3 ${
                  activeStation === station.name
                    ? 'border-green-500 bg-green-500/10 text-green-300'
                    : 'border-green-900/30 hover:border-green-700'
                }`}
              >
                {station.type === 'news' || station.type === 'propaganda' ? <Newspaper className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                <div>
                  <div className="text-xs font-bold">{station.name}</div>
                  <div className="text-[8px] opacity-50">{station.frequency}</div>
                </div>
              </button>
            ))}
            <button
              onClick={() => setActiveStation(null)}
              className={`w-full text-left p-3 border transition-all flex items-center gap-3 ${
                activeStation === null
                  ? 'border-green-500 bg-green-500/10 text-green-300'
                  : 'border-green-900/30 hover:border-green-700'
              }`}
            >
              <VolumeX className="w-4 h-4" />
              <div>
                <div className="text-xs font-bold uppercase">Turn Off</div>
                <div className="text-[8px] opacity-50">Disconnect Receiver</div>
              </div>
            </button>
          </div>
        </div>

        <div className="border border-green-900 p-3 text-[9px] opacity-50 space-y-1">
          <div className="flex justify-between"><span>RECEIVER:</span> <span>ACTIVE</span></div>
          <div className="flex justify-between"><span>ENCRYPTION:</span> <span>NONE</span></div>
          <div className="flex justify-between"><span>BATTERY:</span> <span>98%</span></div>
        </div>
      </div>
    </div>
  );
}
