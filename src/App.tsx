import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import * as gemini from './services/geminiService';
import { generateCharacterSprite, generateItemIcon } from './services/geminiService';
import { api } from './services/api';
import { Group, Panel, Separator } from 'react-resizable-panels';
import ErrorBoundary from './components/ErrorBoundary';
import EncounterOverlay from './components/EncounterOverlay';
import AuthScreen from './components/AuthScreen';
import CharacterCreationScreen from './components/CharacterCreationScreen';
import CombatSidebar from './components/CombatSidebar';
import ExplorationSidebar from './components/ExplorationSidebar';
import IsometricExplorationView from './components/IsometricExplorationView';
import IsometricCombatView from './components/IsometricCombatView';
import PipBoyOverlay from './components/PipBoyOverlay';
import TerminalPanel from './components/TerminalPanel';
import MapEditor from './components/MapEditor';
import type {
  AppView,
  CombatState,
  CombatViewMode,
  DialogueState,
  Encounter,
  GameState,
  NarrativeEntry,
  Perk,
  PipBoyTab,
  TradeState,
  WorldState,
} from './types/app';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwtToken'));
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [view, setView] = useState<AppView>('auth');
  const [feed, setFeed] = useState<NarrativeEntry[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [quest, setQuest] = useState<any>(null);
  const [loadingQuest, setLoadingQuest] = useState(false);
  const [loadingTravel, setLoadingTravel] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dialogueState, setDialogueState] = useState<DialogueState | null>(null);
  const [tradeState, setTradeState] = useState<TradeState | null>(null);
  const [activeEncounter, setActiveEncounter] = useState<Encounter | null>(null);
  const [pipBoyTab, setPipBoyTab] = useState<PipBoyTab | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [worldLocations, setWorldLocations] = useState<any[]>([]);
  const [availablePerks, setAvailablePerks] = useState<Perk[]>([]);

  const addNarrative = (text: string, type: string = 'narrative') => {
    setFeed(previous => [...previous, { text, type }]);
    if (token) api.narrative.log(token, text, type);
  };

  const handleApiError = (error: any, defaultMessage: string = 'An error occurred') => {
    console.error(defaultMessage, error);
    const message = error instanceof Error ? error.message : defaultMessage;
    addNarrative(`ERROR: ${message}`, 'error');
  };

  const resetCombatSelection = () => {
    setPendingAction(null);
    setSelectedBodyPart(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'Escape' && pipBoyTab) { setPipBoyTab(null); return; }
      if (event.key === 'Tab' || event.key === 'p' || event.key === 'P') {
        if (view !== 'game' || isGenerating) return;
        event.preventDefault();
        setPipBoyTab(previous => (previous ? null : 'status'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pipBoyTab, view, isGenerating]);

  // Random encounters
  useEffect(() => {
    if (view === 'game' && !combatState) {
      const interval = setInterval(() => {
        if (Math.random() < 0.15) handleRandomEncounter();
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [view, combatState, gameState, worldState, isGenerating, activeEncounter, tradeState]);

  // Auto-load on token
  useEffect(() => { if (token) void loadGame(); }, [token]);

  // --- Core game functions ---

  const loadGame = async () => {
    setIsGenerating(true);
    try {
      const [stateRes, worldRes, locationsRes, perksRes] = await Promise.all([
        api.state.load(token),
        api.world.profile(token),
        api.world.locations(token),
        api.world.perks(token),
      ]);

      if (stateRes.ok && worldRes.ok && locationsRes.ok && perksRes.ok) {
        const data = stateRes.data as any;
        setWorldState(worldRes.data as WorldState);
        setWorldLocations((locationsRes.data as any).locations || []);
        setAvailablePerks((perksRes.data as any).perks || []);

        const flavoredDescription = await gemini.generateWorldDescription(data.location, data.player);
        data.location.description = flavoredDescription || data.location.description;
        setGameState(data);

        if (data.location?.npcs) {
          data.location.npcs.forEach((npc: any) => {
            if (npc.hit_points > 0) generateCharacterSprite(npc.name, 'A wasteland wanderer.', npc.is_hostile);
          });
        }
        if (data.inventory) {
          data.inventory.forEach((item: any) => generateItemIcon(item.name, item.type, item.description));
        }
        if (data.narrative_history) setFeed(data.narrative_history);

        setView('game');
        addNarrative('Welcome back to the wasteland.', 'system');
        await checkCombatState();
        return;
      }

      if (stateRes.status === 404) { setView('create'); return; }
      handleLogout();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const checkCombatState = async () => {
    try {
      const { ok, data } = await api.combat.getState(token);
      if (!ok) { setCombatState(null); return; }
      setCombatState(data as CombatState);
      if ((data as any).turn_order?.[(data as any).current_turn_index]?.type === 'npc') await processNpcTurn();
    } catch (error) { handleApiError(error); }
  };

  const processNpcTurn = async () => {
    try {
      const { ok, data } = await api.combat.npcTurn(token);
      if (!ok) return;
      setIsGenerating(true);
      const flavoredMessage = await gemini.generateCombatFlavor((data as any).message);
      addNarrative(flavoredMessage || (data as any).message, 'combat');
      if ((data as any).combat_over) { setCombatState(null); await loadGame(); }
      else await checkCombatState();
    } catch (error) { handleApiError(error); }
    finally { setIsGenerating(false); }
  };

  const startCombat = async (npcId: number) => {
    try {
      const { ok, data } = await api.combat.start(token, [npcId]);
      if (!ok) return;
      addNarrative((data as any).message, 'combat');
      await checkCombatState();
    } catch (error) { handleApiError(error); }
  };

  const performCombatAction = async (actionType: string, targetId?: number, bodyPart?: string, useCritical?: boolean) => {
    try {
      const { ok, data } = await api.combat.action(token, actionType, targetId, bodyPart, useCritical);
      if (!ok) return;
      resetCombatSelection();
      setIsGenerating(true);
      const flavoredMessage = await gemini.generateCombatFlavor((data as any).message);
      addNarrative(flavoredMessage || (data as any).message, 'combat');
      if ((data as any).combat_over) { setCombatState(null); await loadGame(); }
      else await checkCombatState();
    } catch (error) { handleApiError(error); }
    finally { setIsGenerating(false); }
  };

  const performMove = async (targetX: number, targetY: number) => {
    try {
      const { ok, data } = await api.combat.action(token, 'move', undefined, undefined, undefined, targetX, targetY);
      addNarrative((data as any).message || 'Move failed.', ok ? 'combat' : 'system');
      if (ok) {
        if ((data as any).combat_over) { setCombatState(null); await loadGame(); }
        else await checkCombatState();
      }
    } catch (error) { handleApiError(error); }
  };

  // --- Auth ---

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    const target = event.target as typeof event.target & { username: { value: string }; password: { value: string } };
    const { ok, data } = await api.auth.login(target.username.value, target.password.value);
    if (!ok) { alert('Login failed'); return; }
    setToken(data.access_token);
    localStorage.setItem('jwtToken', data.access_token);
  };

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    const target = event.target as typeof event.target & { username: { value: string }; password: { value: string } };
    const { ok, data } = await api.auth.register(target.username.value, target.password.value);
    if (!ok) { alert('Registration failed'); return; }
    setToken(data.access_token);
    localStorage.setItem('jwtToken', data.access_token);
    setView('create');
  };

  const handleLogout = () => {
    setToken(null); setGameState(null); setCombatState(null); setView('auth');
    setFeed([]); setQuest(null); setTradeState(null); setDialogueState(null);
    setPipBoyTab(null); resetCombatSelection();
    localStorage.removeItem('jwtToken');
  };

  const handleCreate = async (name: string, stats: Record<string, number>) => {
    const { ok } = await api.state.save(token, name || 'Vault Dweller', stats, 1);
    if (ok) await loadGame();
  };

  // --- NPC Interaction ---

  const handleTalk = async (npcId: number, npcName: string) => {
    try {
      const { ok, data } = await api.npc.dialogue(token, npcId);
      if (!ok) return;
      setIsGenerating(true);
      const dialogue = await gemini.generateDialogue((data as any).npc, (data as any).player, 'The player approaches for a conversation.');
      setDialogueState({ npcId, npcName, text: dialogue.npc_text, options: dialogue.player_options });
      addNarrative(`You approach ${npcName}.`, 'system');
    } catch (error) { handleApiError(error); }
    finally { setIsGenerating(false); }
  };

  const handleDialogueOption = async (option: any) => {
    if (!dialogueState) return;
    addNarrative(`You: ${option.text}`, 'player');

    if (option.action === 'end') { setDialogueState(null); addNarrative('Conversation ended.', 'system'); return; }
    if (option.action === 'attack') { setDialogueState(null); await startCombat(dialogueState.npcId); return; }
    if (option.action === 'trade') { setDialogueState(null); await handleOpenTrade(dialogueState.npcId); return; }
    if (option.action === 'complete_quest') {
      try {
        const { ok, data } = await api.quest.complete(token);
        if (ok) { setDialogueState(null); addNarrative((data as any).message, 'system'); await loadGame(); }
        else addNarrative('You have no completed quests to turn in.', 'system');
      } catch (error) { handleApiError(error); }
      return;
    }

    try {
      const { ok, data } = await api.npc.dialogueRespond(token, dialogueState.npcId, option.text);
      if (!ok) return;
      setIsGenerating(true);
      const dialogue = await gemini.generateDialogue((data as any).npc, (data as any).player, `The player just said: "${option.text}"`);
      setDialogueState({ ...dialogueState, text: dialogue.npc_text, options: dialogue.player_options });
    } catch (error) { handleApiError(error); }
    finally { setIsGenerating(false); }
  };

  const handleOpenTrade = async (npcId: number) => {
    try {
      const { ok, data } = await api.npc.trade(token, npcId);
      if (!ok) return;
      setTradeState(data as TradeState);
      addNarrative(`You start trading with ${(data as any).npc.name}.`, 'system');
    } catch (error) { handleApiError(error); }
  };

  const handleTradeAction = async (itemId: number, action: 'buy' | 'sell', quantity: number = 1) => {
    if (!tradeState) return;
    const npcId = tradeState.npc.id;
    try {
      const { ok, data } = await api.trade.execute(token, npcId, itemId, action, quantity);
      if (!ok) { addNarrative(`Trade failed: ${(data as any).message}`, 'system'); return; }
      addNarrative((data as any).message, 'system');
      await loadGame();
      await handleOpenTrade(npcId);
    } catch (error) { handleApiError(error); }
  };

  const handleLoot = async (npcId: number) => {
    try {
      const { ok, data } = await api.npc.loot(token, npcId);
      if (!ok) return;
      addNarrative((data as any).message, 'system');
      await loadGame();
    } catch (error) { handleApiError(error); }
  };

  // --- Quests ---

  const loadQuest = async () => {
    setLoadingQuest(true); setIsGenerating(true);
    try {
      const { ok, data } = await api.quest.generate(token);
      if (!ok) return;
      const questData = await gemini.generateQuest((data as any).location, (data as any).player);
      setQuest(questData);
      addNarrative(`You check the local job board and find a new posting: "${questData.title}"`, 'system');
    } catch (error) { handleApiError(error); }
    finally { setLoadingQuest(false); setIsGenerating(false); }
  };

  const handleAcceptQuest = async () => {
    if (!quest) return;
    try {
      const { ok } = await api.quest.accept(token, quest);
      if (!ok) return;
      addNarrative(`You accepted the job: "${quest.title}".`, 'system');
      setQuest(null); await loadGame();
    } catch (error) { handleApiError(error); }
  };

  // --- Exploration ---

  const handleExplorationMove = async (x: number, y: number) => {
    try {
      const { ok, data } = await api.interact.move(token, x, y);
      if (!ok) { addNarrative(`Movement failed: ${(data as any).message}`, 'system'); return; }
      if ((data as any).hazardDamage > 0) addNarrative((data as any).message, 'system');
      await loadGame();
    } catch (error) { handleApiError(error); }
  };

  const handleScavenge = async (resourceType: string, resourceAmount: number, tileX: number, tileY: number) => {
    try {
      const { ok, data } = await api.interact.scavenge(token, resourceType, resourceAmount, tileX, tileY);
      if (!ok) { addNarrative(`Scavenging failed: ${(data as any).message}`, 'system'); return; }
      addNarrative((data as any).message, 'system'); await loadGame();
    } catch (error) { handleApiError(error); }
  };

  const handleHack = async (success: boolean, tileX: number, tileY: number) => {
    try {
      const { ok, data } = await api.interact.hack(token, success, tileX, tileY);
      if (!ok) { addNarrative(`Hacking failed: ${(data as any).message}`, 'system'); return; }
      addNarrative((data as any).message, 'system'); await loadGame();
    } catch (error) { handleApiError(error); }
  };

  // --- Travel ---

  const handleTravel = async () => {
    setLoadingTravel(true); setIsGenerating(true);
    addNarrative('You pack your gear and head out into the wastes...', 'system');
    try {
      const { ok, data } = await api.travel.initiate(token);
      if (!ok) return;
      const confirm = await api.travel.confirm(token, data.request_id);
      if (confirm.ok) {
        addNarrative(`You travel across the wasteland and discover: ${(confirm.data as any).location_name || data.preview_location?.name || 'a new location'}`, 'system');
        await loadGame();
      }
    } catch (error) { handleApiError(error); }
    finally { setLoadingTravel(false); setIsGenerating(false); }
  };

  const handleCoordinateTravel = async (locationId: number) => {
    setLoadingTravel(true); setIsGenerating(true);
    const target = worldLocations.find(l => l.id === locationId);
    addNarrative(`You set your coordinates for ${target?.name || 'the horizon'} and begin your journey...`, 'system');
    try {
      const { ok, data } = await api.travel.initiate(token, locationId);
      if (!ok) { addNarrative('Travel failed. The wasteland is too dangerous right now.', 'system'); return; }
      const confirm = await api.travel.confirm(token, data.request_id);
      if (confirm.ok) {
        addNarrative(`After a long trek, you arrive at: ${(confirm.data as any).location_name || target?.name || 'your destination'}`, 'system');
        await loadGame(); setPipBoyTab(null);
      }
    } catch (error) { handleApiError(error); }
    finally { setLoadingTravel(false); setIsGenerating(false); }
  };

  // --- Items ---

  const handleUseItem = async (itemId: number) => {
    try {
      const { ok, data } = await api.items.use(token, itemId);
      if (!ok) return;
      setIsGenerating(true);
      const item = gameState?.inventory.find((i: any) => i.id === itemId);
      const flavor = await gemini.generateNarrativeFlavor(gameState?.player, gameState?.location, worldState, `Uses ${item?.name || 'an item'}.`, { item, result: (data as any).message });
      addNarrative(flavor || (data as any).message, 'flavor'); await loadGame();
    } catch (error) { handleApiError(error); }
    finally { setIsGenerating(false); }
  };

  const handleEquipItem = async (itemId: number) => {
    try {
      const { ok, data } = await api.items.equip(token, itemId);
      if (!ok) return;
      addNarrative((data as any).message, 'system'); await loadGame();
    } catch (error) { handleApiError(error); }
  };

  const handleSaveGame = async () => {
    if (!gameState) return;
    addNarrative('Saving game state...', 'system');
    try {
      const { ok } = await api.state.save(token, gameState.player.name, gameState.player.stats, gameState.location.id);
      if (ok) addNarrative('Game saved successfully.', 'system');
    } catch (error) { handleApiError(error); }
  };

  const handleLevelUp = async (stat: string) => {
    try {
      const { ok, data } = await api.state.levelUp(token, stat);
      if (!ok) return;
      addNarrative((data as any).message, 'system'); await loadGame();
    } catch (error) { handleApiError(error); }
  };

  const handleChoosePerk = async (perkId: number) => {
    try {
      const { ok, data } = await api.state.choosePerk(token, perkId);
      if (!ok) { addNarrative(`Failed to choose perk: ${(data as any).message}`, 'system'); return; }
      addNarrative((data as any).message, 'system'); await loadGame();
    } catch (error) { handleApiError(error); }
  };

  // --- Encounters ---

  const handleRandomEncounter = async () => {
    if (!gameState || !worldState || isGenerating || combatState || activeEncounter || tradeState) return;
    setIsGenerating(true);
    try {
      const encounter = await gemini.generateRandomEncounter(gameState.player, gameState.location, worldState);
      if (encounter) {
        if (encounter.type === 'narrative') addNarrative(encounter.text, 'event');
        else { setActiveEncounter(encounter); addNarrative(`ENCOUNTER: ${encounter.text}`, 'event'); }
      }
    } catch (error) { handleApiError(error, 'Failed to generate random encounter'); }
    finally { setIsGenerating(false); }
  };

  const handleEncounterChoice = async (action: string) => {
    if (!activeEncounter) return;
    if (action === 'start_combat') addNarrative(`Combat initiated with ${activeEncounter.data?.enemy_name || 'the threat'}!`, 'system');
    else if (action === 'gain_item' && activeEncounter.data?.item_name) addNarrative(`You found: ${activeEncounter.data.item_name} (x${activeEncounter.data.item_quantity || 1})`, 'system');
    else if (action === 'gain_karma') addNarrative('Your actions have improved your standing in the wasteland.', 'system');
    else if (action === 'lose_karma') addNarrative('The wasteland remembers your cruelty.', 'system');
    setActiveEncounter(null);
  };

  const handleRecap = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const recap = await gemini.generateNarrativeRecap(feed.slice(-15));
      if (recap) addNarrative(`RECAP: ${recap}`, 'system');
    } catch (error) { handleApiError(error, 'Failed to generate recap'); }
    finally { setIsGenerating(false); }
  };

  // --- Render ---

  if (view === 'auth') return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />;
  if (view === 'create') return <CharacterCreationScreen onCreate={handleCreate} />;

  if (gameState?.player?.vitals?.hit_points <= 0) {
    return (
      <div className="crt h-screen bg-black text-red-500 font-mono p-4 flex flex-col items-center justify-center">
        <h1 className="text-6xl font-black mb-4 animate-pulse uppercase tracking-widest">You Died</h1>
        <p className="text-xl mb-8 uppercase tracking-widest opacity-80">The wasteland claims another soul.</p>
        <button
          onClick={async () => {
            await api.state.restart(token);
            setView('create'); setGameState(null);
          }}
          className="border-2 border-red-500 px-8 py-4 text-xl hover:bg-red-900 hover:text-white transition-colors uppercase tracking-widest font-bold"
        >
          Restart
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="crt h-screen bg-black text-green-500 font-mono p-4 flex flex-col">
        <AnimatePresence>
          {activeEncounter && <EncounterOverlay encounter={activeEncounter} onChoice={handleEncounterChoice} />}
        </AnimatePresence>

        {pipBoyTab && (
          <PipBoyOverlay
            activeTab={pipBoyTab} onTabChange={setPipBoyTab} onClose={() => setPipBoyTab(null)}
            gameState={gameState} inventory={gameState?.inventory || []}
            worldLocations={worldLocations} availablePerks={availablePerks}
            onUseItem={handleUseItem} onEquipItem={handleEquipItem}
            onLevelUp={handleLevelUp} onChoosePerk={handleChoosePerk} onTravel={handleCoordinateTravel}
          />
        )}

        <AnimatePresence>
          {showEditor && gameState?.location && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[200] p-4 bg-black/80 backdrop-blur-md">
              <MapEditor
                initialMap={{ width: gameState.location.width || 10, height: gameState.location.height || 10, tiles: gameState.location.tiles || [] }}
                onSave={(newMap) => {
                  setGameState(prev => prev ? { ...prev, location: { ...prev.location, width: newMap.width, height: newMap.height, tiles: newMap.tiles } } : null);
                  setShowEditor(false);
                  addNarrative("MAP DATA OVERWRITTEN BY WASTELAND ENGINE EDITOR.", "system");
                }}
                onClose={() => setShowEditor(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <Group orientation="horizontal" className="flex-1 h-full">
          <Panel defaultSize={25} minSize={15} className="flex flex-col h-full">
            <div className="h-full flex flex-col gap-4 overflow-y-auto pr-2">
              {combatState ? (
                <CombatSidebar combatState={combatState} gameState={gameState} onAction={performCombatAction} onMove={performMove}
                  pendingAction={pendingAction} setPendingAction={setPendingAction}
                  selectedBodyPart={selectedBodyPart} setSelectedBodyPart={setSelectedBodyPart} isGenerating={isGenerating} />
              ) : (
                <ExplorationSidebar gameState={gameState} quest={quest} loadingQuest={loadingQuest} loadingTravel={loadingTravel}
                  isGenerating={isGenerating} onOpenPipBoy={() => setPipBoyTab('status')} onTravel={handleTravel}
                  onLoadQuest={loadQuest} onAcceptQuest={handleAcceptQuest} onTalk={handleTalk} onAttack={startCombat}
                  onLoot={handleLoot} onOpenEditor={() => setShowEditor(true)} />
              )}
            </div>
          </Panel>

          <Separator className="w-2 mx-2 bg-green-900/30 hover:bg-green-500/50 transition-colors rounded cursor-col-resize flex items-center justify-center">
            <div className="w-1 h-8 bg-green-500/50 rounded-full" />
          </Separator>

          <Panel defaultSize={45} minSize={20} className="flex flex-col h-full">
            <div className="h-full flex flex-col overflow-hidden">
              {combatState ? (
                <IsometricCombatView combatState={combatState} gameState={gameState} onAction={performCombatAction} onMove={performMove}
                  pendingAction={pendingAction} setPendingAction={setPendingAction}
                  selectedBodyPart={selectedBodyPart} setSelectedBodyPart={setSelectedBodyPart} isGenerating={isGenerating} />
              ) : (
                <IsometricExplorationView location={gameState?.location ?? null} player={gameState?.player ?? null}
                  isGenerating={isGenerating} onTalk={handleTalk} onAttack={startCombat} onLoot={handleLoot}
                  onInteractObject={(action, data) => {
                    if (action === 'hack_success') handleHack(true, data.tile.x, data.tile.y);
                    else if (action === 'hack_fail') handleHack(false, data.tile.x, data.tile.y);
                    else if (action === 'scavenge_success') handleScavenge(data.type, data.amount, data.tile.x, data.tile.y);
                  }}
                  onMove={handleExplorationMove} />
              )}
            </div>
          </Panel>

          <Separator className="w-2 mx-2 bg-green-900/30 hover:bg-green-500/50 transition-colors rounded cursor-col-resize flex items-center justify-center">
            <div className="w-1 h-8 bg-green-500/50 rounded-full" />
          </Separator>

          <Panel defaultSize={30} minSize={20} className="flex flex-col h-full">
            <TerminalPanel tradeState={tradeState} onCloseTrade={() => setTradeState(null)} onTradeAction={handleTradeAction}
              gameState={gameState} isGenerating={isGenerating} dialogueState={dialogueState} onDialogueOption={handleDialogueOption}
              feed={feed} onOpenPipBoy={() => setPipBoyTab('status')} onRecap={handleRecap} onSaveGame={handleSaveGame} onLogout={handleLogout} />
          </Panel>
        </Group>
      </div>
    </ErrorBoundary>
  );
}
