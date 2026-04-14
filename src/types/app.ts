export type AppView = 'auth' | 'create' | 'game';

export type PipBoyTab = 'status' | 'inventory' | 'quests' | 'map' | 'radio';

export type CombatViewMode = 'text' | 'isometric';

export type NarrativeEntry = {
  text: string;
  type: string;
};

export interface PlayerStats {
  strength: number;
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;
  [key: string]: number;
}

export interface LimbCondition {
  head: number; // 0 to 100
  torso: number;
  left_arm: number;
  right_arm: number;
  left_leg: number;
  right_leg: number;
}

export interface StatusEffect {
  type: string;
  duration: number;
  message: string;
}

export interface PlayerVitals {
  hit_points: number;
  max_hit_points: number;
  action_points: number;
  max_action_points: number;
  level: number;
  experience_points: number;
  money: number;
  karma: number;
  perk_points: number;
  critical_meter: number;
  status_effects?: (string | StatusEffect)[];
  limb_condition?: LimbCondition;
}

export interface PlayerEquipment {
  weapon_id: number | null;
  armor_id: number | null;
}

export interface PlayerQuest {
  id: number;
  title: string;
  description: string;
  objectives: string; // JSON string
  progress: string; // JSON string
  status: 'active' | 'completed' | 'failed';
  reward_caps?: number;
  reward_xp?: number;
}

export interface Item {
  id: number;
  name: string;
  description: string;
  type: string;
  weight: number;
  value: number;
  effects?: string;
  quantity?: number;
  is_equipped?: boolean;
  durability?: number;
  max_durability?: number;
  ammo_type?: string;
  stackable?: boolean;
}

export interface Player {
  id: number;
  name: string;
  stats: PlayerStats;
  vitals: PlayerVitals;
  equipment: PlayerEquipment;
  inventory: Item[];
  quests: PlayerQuest[];
  perks: Perk[];
  discovered_sectors: number[][];
  position?: { x: number; y: number } | null;
}

export interface Tile {
  x: number;
  y: number;
  kind: 'floor' | 'rubble' | 'wall' | 'rock' | 'dirt' | 'grass' | 'pavement' | 'cracked_pavement' | 'sand' | 'wasteland' | 'water' | 'toxic_sludge' | 'metal_floor';
  object_kind?: 'none' | 'barrel' | 'crate' | 'debris' | 'ruined_wall' | 'cactus' | 'terminal' | 'pipe' | 'radioactive_barrel' | 'computer_console' | 'power_generator' | 'ruined_car' | 'skeleton' | 'scrap_heap' | 'vending_machine';
  ap_cost: number;
  is_highlighted?: boolean;
  is_poi?: boolean;
  poi_description?: string;
  resource_type?: 'scrap' | 'water' | 'tech' | 'none';
  resource_amount?: number;
  animation?: 'flicker' | 'glow' | 'pulse' | 'none';
  hazard?: 'radiation' | 'toxic_gas' | 'none';
}

export interface MapGenConfig {
  biome: 'desert' | 'urban' | 'forest' | 'scrubland' | 'wasteland' | 'industrial' | 'vault';
  object_density: number; // 0 to 1
  rubble_frequency: number; // 0 to 1
  wall_density: number; // 0 to 1
  faction_presence?: string;
  seed?: number;
}

export interface LocationNpc {
  npc_id: number;
  name: string;
  is_hostile: boolean;
  hit_points: number;
  max_hit_points: number;
  x: number;
  y: number;
  tile_x: number;
  tile_y: number;
  status_effects: (string | StatusEffect)[];
  limb_condition: LimbCondition;
}

export interface Location {
  id: number;
  name: string;
  description: string;
  world_x: number;
  world_y: number;
  width?: number;
  height?: number;
  tiles?: Tile[];
  weather?: 'clear' | 'sandstorm' | 'radstorm' | 'rain';
  npcs?: LocationNpc[];
}

export interface GameState {
  player: Player;
  location: Location;
  inventory: Item[];
}

export interface Combatant {
  id: number;
  name: string;
  type: 'player' | 'npc';
  hit_points: number;
  max_hit_points: number;
  ap_remaining: number;
  tile_x: number;
  tile_y: number;
  is_dead: boolean;
  skill_value?: number;
  armor_class?: number;
  status_effects?: (string | StatusEffect)[];
  limb_condition?: LimbCondition;
}

export interface CombatLogEntry {
  type: string;
  message: string;
  attacker?: string;
  target?: string;
  damage?: number;
  body_part?: string;
  is_critical?: boolean;
  weapon?: string;
  [key: string]: unknown;
}

export interface CombatState {
  id: number;
  current_round: number;
  current_turn_index: number;
  turn_order: Combatant[];
  players?: Combatant[];
  npcs: Combatant[];
  combat_log: CombatLogEntry[];
  map: {
    width: number;
    height: number;
    tiles: Tile[];
  };
}

export interface WorldState {
  name: string;
  tone: string;
  climate: string;
}

export interface Perk {
  id: number;
  name: string;
  description: string;
  requirements_json: string;
}

export interface DialogueOption {
  text: string;
  action: string;
}

export interface DialogueState {
  npcId: number;
  npcName: string;
  text: string;
  options: DialogueOption[];
}

export interface TradeNpc {
  id: number;
  name: string;
}

export interface TradeState {
  npc: TradeNpc;
  inventory: Item[];
}

export interface EncounterOption {
  text: string;
  action: string;
}

export interface EncounterData {
  enemy_name?: string;
  item_name?: string;
  item_quantity?: number;
  options?: EncounterOption[];
  [key: string]: unknown;
}

export interface Encounter {
  type: 'narrative' | 'combat' | 'item' | 'npc' | 'choice';
  text: string;
  data?: EncounterData;
}
