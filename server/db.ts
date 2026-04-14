import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const dbPath = path.resolve(process.cwd(), 'game.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const DEFAULT_RUNTIME_REALIZATION_VERSION = 'runtime-realizer-v2';

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      strength INTEGER DEFAULT 5,
      perception INTEGER DEFAULT 5,
      endurance INTEGER DEFAULT 5,
      charisma INTEGER DEFAULT 5,
      intelligence INTEGER DEFAULT 5,
      agility INTEGER DEFAULT 5,
      luck INTEGER DEFAULT 5,
      hit_points INTEGER DEFAULT 20,
      max_hit_points INTEGER DEFAULT 20,
      action_points INTEGER DEFAULT 7,
      experience_points INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      perk_points INTEGER DEFAULT 0,
      money INTEGER DEFAULT 0,
      karma INTEGER DEFAULT 0,
      gender TEXT DEFAULT 'male',
      reputation TEXT DEFAULT '{}',
      current_location_id INTEGER,
      tile_x INTEGER,
      tile_y INTEGER,
      equipped_weapon_id INTEGER,
      equipped_armor_id INTEGER,
      ammo_in_clip INTEGER DEFAULT 0,
      discovered_sectors_json TEXT DEFAULT '[]',
      critical_meter INTEGER DEFAULT 0,
      status_effects TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS perks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      requirements_json TEXT DEFAULT '{}',
      effects_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS player_perks (
      player_id INTEGER,
      perk_id INTEGER,
      PRIMARY KEY (player_id, perk_id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (perk_id) REFERENCES perks(id)
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      weight REAL DEFAULT 0,
      value INTEGER DEFAULT 0,
      effects TEXT,
      durability INTEGER,
      max_durability INTEGER,
      ammo_type TEXT,
      stackable BOOLEAN DEFAULT 0,
      location_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      layout_json TEXT,
      is_safe_zone BOOLEAN DEFAULT 0,
      region_id INTEGER,
      world_x INTEGER DEFAULT 0,
      world_y INTEGER DEFAULT 0,
      stable_id TEXT,
      run_id TEXT,
      spec_stable_id TEXT,
      trace_id TEXT,
      realization_id TEXT,
      realization_version TEXT,
      creation_mode TEXT DEFAULT 'legacy'
    );

    CREATE TABLE IF NOT EXISTS npcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'human',
      strength INTEGER DEFAULT 5,
      perception INTEGER DEFAULT 5,
      endurance INTEGER DEFAULT 5,
      charisma INTEGER DEFAULT 5,
      intelligence INTEGER DEFAULT 5,
      agility INTEGER DEFAULT 5,
      luck INTEGER DEFAULT 5,
      hit_points INTEGER DEFAULT 15,
      max_hit_points INTEGER DEFAULT 15,
      action_points INTEGER DEFAULT 7,
      faction TEXT,
      is_hostile BOOLEAN DEFAULT 0,
      is_unique BOOLEAN DEFAULT 0,
      current_location_id INTEGER,
      tile_x INTEGER,
      tile_y INTEGER,
      equipped_weapon_id INTEGER,
      equipped_armor_id INTEGER,
      ammo_in_clip INTEGER DEFAULT 0,
      run_id TEXT,
      spec_stable_id TEXT,
      trace_id TEXT,
      realization_id TEXT,
      realization_version TEXT,
      creation_mode TEXT DEFAULT 'legacy',
      status_effects TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS combats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      is_active BOOLEAN DEFAULT 1,
      current_turn_index INTEGER DEFAULT 0,
      current_round INTEGER DEFAULT 1,
      turn_order TEXT DEFAULT '[]',
      combat_log TEXT DEFAULT '[]',
      map_json TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      objectives TEXT NOT NULL,
      reward_caps INTEGER DEFAULT 0,
      reward_xp INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS player_quests (
      player_id INTEGER,
      quest_id INTEGER,
      status TEXT DEFAULT 'active',
      progress TEXT DEFAULT '[]',
      PRIMARY KEY (player_id, quest_id)
    );

    CREATE TABLE IF NOT EXISTS player_items (
      player_id INTEGER,
      item_id INTEGER,
      quantity INTEGER DEFAULT 1,
      is_equipped BOOLEAN DEFAULT 0,
      PRIMARY KEY (player_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS npc_items (
      npc_id INTEGER REFERENCES npcs(id) ON DELETE CASCADE,
      item_id INTEGER,
      quantity INTEGER DEFAULT 1,
      run_id TEXT,
      spec_stable_id TEXT,
      trace_id TEXT,
      realization_id TEXT,
      realization_version TEXT,
      creation_mode TEXT DEFAULT 'legacy',
      PRIMARY KEY (npc_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS combat_players (
      combat_id INTEGER,
      player_id INTEGER,
      PRIMARY KEY (combat_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS combat_npcs (
      combat_id INTEGER,
      npc_id INTEGER,
      PRIMARY KEY (combat_id, npc_id)
    );

    CREATE TABLE IF NOT EXISTS narrative_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS world_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stable_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT 'The Wasteland',
      climate TEXT NOT NULL DEFAULT 'arid',
      biome TEXT NOT NULL DEFAULT 'desert',
      tone TEXT NOT NULL DEFAULT 'gritty',
      scarcity_profile TEXT NOT NULL DEFAULT 'scarce',
      tech_level TEXT NOT NULL DEFAULT 'post-apocalyptic',
      banned_motifs TEXT DEFAULT '[]',
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stable_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      biome_tags TEXT NOT NULL DEFAULT '[]',
      hazard_tags TEXT NOT NULL DEFAULT '[]',
      resource_tags TEXT NOT NULL DEFAULT '[]',
      faction_tags TEXT NOT NULL DEFAULT '[]',
      world_id INTEGER NOT NULL DEFAULT 1,
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (world_id) REFERENCES world_state(id)
    );

    CREATE TABLE IF NOT EXISTS world_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stable_id TEXT UNIQUE NOT NULL,
      fact_type TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      region_id INTEGER,
      canon_level TEXT NOT NULL DEFAULT 'runtime_only',
      source TEXT,
      promoted_by TEXT,
      promoted_reason TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (region_id) REFERENCES regions(id)
    );

    CREATE TABLE IF NOT EXISTS generation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT UNIQUE NOT NULL,
      trace_id TEXT,
      run_type TEXT NOT NULL,
      context_snapshot TEXT,
      model_name TEXT,
      prompt_version TEXT,
      result_status TEXT NOT NULL DEFAULT 'pending',
      result_data TEXT,
      validation_report TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS location_specs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stable_id TEXT UNIQUE NOT NULL,
      location_id INTEGER,
      run_id TEXT,
      trace_id TEXT,
      spec_json TEXT NOT NULL,
      admission_status TEXT NOT NULL DEFAULT 'pending',
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (location_id) REFERENCES locations(id),
      FOREIGN KEY (run_id) REFERENCES generation_runs(run_id)
    );

    CREATE TABLE IF NOT EXISTS travel_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      trace_id TEXT,
      player_id INTEGER NOT NULL,
      source_location_id INTEGER NOT NULL,
      request_mode TEXT NOT NULL DEFAULT 'legacy',
      parameter_fingerprint TEXT NOT NULL,
      realization_id TEXT,
      realization_version TEXT DEFAULT '${DEFAULT_RUNTIME_REALIZATION_VERSION}',
      generated_payload_json TEXT,
      run_id TEXT,
      spec_stable_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      target_location_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      consumed_at DATETIME,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (source_location_id) REFERENCES locations(id),
      FOREIGN KEY (target_location_id) REFERENCES locations(id)
    );
  `);

  // Migration: add map_json to combats if missing (existing DBs)
  try { db.prepare("SELECT map_json FROM combats LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE combats ADD COLUMN map_json TEXT DEFAULT NULL"); }

  // Migration: add exploration layout/position data if missing (existing DBs)
  try { db.prepare("SELECT layout_json FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN layout_json TEXT DEFAULT NULL"); }

  try { db.prepare("SELECT tile_x FROM players LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE players ADD COLUMN tile_x INTEGER"); }

  try { db.prepare("SELECT tile_y FROM players LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE players ADD COLUMN tile_y INTEGER"); }

  try { db.prepare("SELECT tile_x FROM npcs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npcs ADD COLUMN tile_x INTEGER"); }

  try { db.prepare("SELECT tile_y FROM npcs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npcs ADD COLUMN tile_y INTEGER"); }

  // Migration: add region_id to locations if missing
  try { db.prepare("SELECT region_id FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN region_id INTEGER"); }

  // Migration: add stable_id to locations if missing
  try { db.prepare("SELECT stable_id FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN stable_id TEXT"); }

  // Migration: add runtime provenance columns to locations if missing
  try { db.prepare("SELECT run_id FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN run_id TEXT"); }

  try { db.prepare("SELECT spec_stable_id FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN spec_stable_id TEXT"); }

  try { db.prepare("SELECT trace_id FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN trace_id TEXT"); }

  try { db.prepare("SELECT realization_id FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN realization_id TEXT"); }

  try { db.prepare("SELECT realization_version FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN realization_version TEXT"); }

  try { db.prepare("SELECT creation_mode FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN creation_mode TEXT DEFAULT 'legacy'"); }

  // Migration: add runtime provenance columns to npcs if missing
  try { db.prepare("SELECT run_id FROM npcs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npcs ADD COLUMN run_id TEXT"); }

  try { db.prepare("SELECT spec_stable_id FROM npcs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npcs ADD COLUMN spec_stable_id TEXT"); }

  try { db.prepare("SELECT trace_id FROM npcs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npcs ADD COLUMN trace_id TEXT"); }

  try { db.prepare("SELECT realization_id FROM npcs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npcs ADD COLUMN realization_id TEXT"); }

  try { db.prepare("SELECT realization_version FROM npcs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npcs ADD COLUMN realization_version TEXT"); }

  try { db.prepare("SELECT creation_mode FROM npcs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npcs ADD COLUMN creation_mode TEXT DEFAULT 'legacy'"); }

  // Migration: add runtime provenance columns to npc_items if missing
  try { db.prepare("SELECT run_id FROM npc_items LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npc_items ADD COLUMN run_id TEXT"); }

  try { db.prepare("SELECT spec_stable_id FROM npc_items LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npc_items ADD COLUMN spec_stable_id TEXT"); }

  try { db.prepare("SELECT trace_id FROM npc_items LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npc_items ADD COLUMN trace_id TEXT"); }

  try { db.prepare("SELECT realization_id FROM npc_items LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npc_items ADD COLUMN realization_id TEXT"); }

  try { db.prepare("SELECT realization_version FROM npc_items LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npc_items ADD COLUMN realization_version TEXT"); }

  try { db.prepare("SELECT creation_mode FROM npc_items LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE npc_items ADD COLUMN creation_mode TEXT DEFAULT 'legacy'"); }

  // Migration: add travel request tracking columns if missing
  try { db.prepare("SELECT request_mode FROM travel_requests LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE travel_requests ADD COLUMN request_mode TEXT NOT NULL DEFAULT 'legacy'"); }

  try { db.prepare("SELECT generated_payload_json FROM travel_requests LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE travel_requests ADD COLUMN generated_payload_json TEXT"); }

  try { db.prepare("SELECT trace_id FROM travel_requests LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE travel_requests ADD COLUMN trace_id TEXT"); }

  try { db.prepare("SELECT realization_id FROM travel_requests LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE travel_requests ADD COLUMN realization_id TEXT"); }

  try { db.prepare("SELECT realization_version FROM travel_requests LIMIT 1").get(); }
  catch { db.exec(`ALTER TABLE travel_requests ADD COLUMN realization_version TEXT DEFAULT '${DEFAULT_RUNTIME_REALIZATION_VERSION}'`); }

  try { db.prepare("SELECT run_id FROM travel_requests LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE travel_requests ADD COLUMN run_id TEXT"); }

  try { db.prepare("SELECT spec_stable_id FROM travel_requests LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE travel_requests ADD COLUMN spec_stable_id TEXT"); }

  try { db.prepare("SELECT world_x FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN world_x INTEGER DEFAULT 0"); }

  try { db.prepare("SELECT world_y FROM locations LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE locations ADD COLUMN world_y INTEGER DEFAULT 0"); }

  try { db.prepare("SELECT perk_points FROM players LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE players ADD COLUMN perk_points INTEGER DEFAULT 0"); }

  try { db.prepare("SELECT discovered_sectors_json FROM players LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE players ADD COLUMN discovered_sectors_json TEXT DEFAULT '[]'"); }

  try { db.prepare("SELECT critical_meter FROM players LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE players ADD COLUMN critical_meter INTEGER DEFAULT 0"); }

  // Migration: add range data to 10mm Pistol if missing (existing DBs)
  const pistol = db.prepare("SELECT id, effects FROM items WHERE name = '10mm Pistol'").get() as any;
  if (pistol && pistol.effects && !pistol.effects.includes('range_optimal')) {
    const effects = JSON.parse(pistol.effects);
    effects.range_optimal = 4;
    effects.range_max = 8;
    effects.weapon_class = 'ranged';
    db.prepare("UPDATE items SET effects = ? WHERE id = ?").run(JSON.stringify(effects), pistol.id);
  }

  // Seed default items if empty
  const itemCount = db.prepare('SELECT COUNT(*) as count FROM items').get() as any;
  if (itemCount.count === 0) {
    db.prepare(`
      INSERT INTO items (name, description, type, weight, value, effects, stackable)
      VALUES 
      ('Stimpak', 'Heals 20 HP.', 'healing', 0.5, 50, '{"heal": 20}', 1),
      ('RadAway', 'Removes radiation.', 'healing', 0.5, 75, '{"rad_heal": 50}', 1),
      ('10mm Pistol', 'A standard sidearm.', 'weapon', 3.0, 150, '{"damage_min": 5, "damage_max": 12, "ammo_type": "10mm", "magazine_size": 12, "range_optimal": 4, "range_max": 8, "weapon_class": "ranged"}', 0),
      ('Leather Armor', 'Basic protection.', 'armor', 10.0, 200, '{"armor_dt": 2, "armor_dr": 15}', 0),
      ('Doctor''s Bag', 'Heals all crippled limbs and restores some HP.', 'healing', 2.0, 100, '{"heal": 10, "heal_limbs": true}', 1),
      ('Scrap Metal', 'Useful for crafting or selling.', 'junk', 1.0, 5, '{}', 1),
      ('10mm Ammo', 'Standard pistol ammunition.', 'ammo', 0.01, 2, '{"ammo_type": "10mm"}', 1)
    `).run();
  }

  // Seed default world profile if empty
  const perkCount = db.prepare('SELECT COUNT(*) as count FROM perks').get() as any;
  if (perkCount.count === 0) {
    db.prepare(`
      INSERT INTO perks (name, description, requirements_json, effects_json)
      VALUES 
      ('Toughness', 'You are more resilient to damage. +10% Damage Resistance.', '{"level": 1, "endurance": 5}', '{"dr_bonus": 10}'),
      ('Strong Back', 'You can carry more weight. +50 Carry Weight.', '{"level": 2, "strength": 5}', '{"carry_weight_bonus": 50}'),
      ('Better Criticals', 'Your critical hits do 50% more damage.', '{"level": 3, "luck": 6}', '{"crit_damage_mult": 1.5}'),
      ('Action Boy', 'Your Action Points regenerate faster.', '{"level": 2, "agility": 6}', '{"ap_regen_bonus": 20}'),
      ('Medic', 'Stimpaks and RadAway are 50% more effective.', '{"level": 1, "intelligence": 4}', '{"healing_mult": 1.5}'),
      ('Bloody Mess', 'Characters often explode in a shower of gore. +5% damage with all weapons.', '{"level": 1}', '{"damage_mult": 1.05}'),
      ('Sniper', 'You are much more accurate with aimed shots. +25% hit chance for aimed shots.', '{"level": 5, "perception": 8}', '{"aimed_shot_bonus": 25}'),
      ('Slayer', 'You are a master of melee combat. Melee attacks cost 1 less AP.', '{"level": 5, "strength": 8}', '{"melee_ap_reduction": 1}'),
      ('Grim Reaper Sprint', 'A kill in combat restores 3 Action Points.', '{"level": 6, "luck": 8}', '{"ap_refund_on_kill": 3}'),
      ('Rad Resistance', 'You are naturally resistant to radiation. -50% radiation damage.', '{"level": 2, "endurance": 6}', '{"rad_resist": 0.5}'),
      ('Snake Eater', 'You are naturally resistant to poisons. -50% poison damage.', '{"level": 2, "endurance": 6}', '{"poison_resist": 0.5}')
    `).run();
  }

  // Seed default world profile if empty
  const worldCount = db.prepare('SELECT COUNT(*) as count FROM world_state').get() as any;
  if (worldCount.count === 0) {
    db.prepare(`
      INSERT INTO world_state (stable_id, name, climate, biome, tone, scarcity_profile, tech_level, banned_motifs, schema_version)
      VALUES ('world-default', 'The Wasteland', 'arid', 'desert', 'gritty', 'scarce', 'post-apocalyptic', '["lush_forest","tropical","underwater"]', 1)
    `).run();
  }

  // Seed default region if empty
  const regionCount = db.prepare('SELECT COUNT(*) as count FROM regions').get() as any;
  if (regionCount.count === 0) {
    db.prepare(`
      INSERT INTO regions (stable_id, name, description, biome_tags, hazard_tags, resource_tags, faction_tags, world_id, schema_version)
      VALUES ('region-starter', 'Outer Wastes', 'The barren outskirts where most survivors scrape by.', '["desert","scrubland"]', '["radiation","bandits"]', '["scrap","water_scarce"]', '["raiders","scavengers"]', 1, 1)
    `).run();
  }

  // Migration: add validation_report and retry_count to generation_runs if missing
  try { db.prepare("SELECT trace_id FROM generation_runs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE generation_runs ADD COLUMN trace_id TEXT"); }

  try { db.prepare("SELECT validation_report FROM generation_runs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE generation_runs ADD COLUMN validation_report TEXT"); }

  try { db.prepare("SELECT retry_count FROM generation_runs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE generation_runs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0"); }

  try { db.prepare("SELECT trace_id FROM location_specs LIMIT 1").get(); }
  catch { db.exec("ALTER TABLE location_specs ADD COLUMN trace_id TEXT"); }

  // Backfill existing locations into default region
  db.prepare('UPDATE locations SET region_id = 1 WHERE region_id IS NULL').run();

  // Backfill existing content provenance into legacy mode
  db.prepare("UPDATE locations SET creation_mode = 'legacy' WHERE creation_mode IS NULL").run();
  db.prepare("UPDATE npcs SET creation_mode = 'legacy' WHERE creation_mode IS NULL").run();
  db.prepare("UPDATE npc_items SET creation_mode = 'legacy' WHERE creation_mode IS NULL").run();

  db.prepare(`
    UPDATE travel_requests
    SET
      trace_id = COALESCE(trace_id, request_id),
      realization_id = COALESCE(realization_id, 'realization-' || request_id),
      realization_version = COALESCE(realization_version, '${DEFAULT_RUNTIME_REALIZATION_VERSION}')
    WHERE trace_id IS NULL OR realization_id IS NULL OR realization_version IS NULL
  `).run();

  db.prepare(`
    UPDATE generation_runs
    SET trace_id = COALESCE(trace_id, run_id)
    WHERE trace_id IS NULL
  `).run();

  db.prepare(`
    UPDATE location_specs
    SET trace_id = COALESCE(trace_id, run_id, stable_id)
    WHERE trace_id IS NULL
  `).run();

  db.prepare(`
    UPDATE locations
    SET
      trace_id = COALESCE(trace_id, realization_id, stable_id, 'legacy-location-' || id),
      realization_version = COALESCE(
        realization_version,
        CASE
          WHEN creation_mode = 'legacy' THEN 'legacy-runtime-v1'
          ELSE '${DEFAULT_RUNTIME_REALIZATION_VERSION}'
        END
      )
    WHERE trace_id IS NULL OR realization_version IS NULL
  `).run();

  db.prepare(`
    UPDATE npcs
    SET
      trace_id = COALESCE(trace_id, realization_id, spec_stable_id, 'legacy-npc-' || id),
      realization_version = COALESCE(
        realization_version,
        CASE
          WHEN creation_mode = 'legacy' THEN 'legacy-runtime-v1'
          ELSE '${DEFAULT_RUNTIME_REALIZATION_VERSION}'
        END
      )
    WHERE trace_id IS NULL OR realization_version IS NULL
  `).run();

  db.prepare(`
    UPDATE npc_items
    SET
      trace_id = COALESCE(trace_id, realization_id, spec_stable_id, 'legacy-npc-item-' || npc_id || '-' || item_id),
      realization_version = COALESCE(
        realization_version,
        CASE
          WHEN creation_mode = 'legacy' THEN 'legacy-runtime-v1'
          ELSE '${DEFAULT_RUNTIME_REALIZATION_VERSION}'
        END
      )
    WHERE trace_id IS NULL OR realization_version IS NULL
  `).run();

  try {
    db.exec('ALTER TABLE players ADD COLUMN status_effects TEXT DEFAULT "[]"');
  } catch (e) {
    // Ignore if column exists
  }

  try {
    db.exec('ALTER TABLE npcs ADD COLUMN status_effects TEXT DEFAULT "[]"');
  } catch (e) {
    // Ignore if column exists
  }

  try {
    db.exec('ALTER TABLE players ADD COLUMN limb_condition TEXT DEFAULT \'{"head":100,"torso":100,"left_arm":100,"right_arm":100,"left_leg":100,"right_leg":100}\'');
  } catch (e) {
    // Ignore if column exists
  }

  try {
    db.exec('ALTER TABLE npcs ADD COLUMN limb_condition TEXT DEFAULT \'{"head":100,"torso":100,"left_arm":100,"right_arm":100,"left_leg":100,"right_leg":100}\'');
  } catch (e) {
    // Ignore if column exists
  }

  // Migration: hash any existing plaintext passwords
  const users = db.prepare('SELECT id, password FROM users').all() as any[];
  for (const user of users) {
    if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
      const hashed = bcrypt.hashSync(user.password, 10);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
    }
  }
}
