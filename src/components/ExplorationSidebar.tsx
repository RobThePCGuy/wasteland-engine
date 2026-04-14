import type { GameState, PlayerQuest } from '../types/app';

interface ExplorationSidebarProps {
  gameState: GameState | null;
  quest: PlayerQuest | null;
  loadingQuest: boolean;
  loadingTravel: boolean;
  isGenerating: boolean;
  onOpenPipBoy: () => void;
  onTravel: () => void | Promise<void>;
  onLoadQuest: () => void | Promise<void>;
  onAcceptQuest: () => void | Promise<void>;
  onTalk: (npcId: number, npcName: string) => void | Promise<void>;
  onAttack: (npcId: number) => void | Promise<void>;
  onLoot: (npcId: number) => void | Promise<void>;
  onOpenEditor?: () => void;
}

export default function ExplorationSidebar({
  gameState,
  quest,
  loadingQuest,
  loadingTravel,
  isGenerating,
  onOpenPipBoy,
  onTravel,
  onLoadQuest,
  onAcceptQuest,
  onTalk,
  onAttack,
  onLoot,
  onOpenEditor,
}: ExplorationSidebarProps) {
  return (
    <>
      <div className="border border-green-500 p-3 flex items-center justify-between">
        <span className="text-sm font-bold">{gameState?.player?.name}</span>
        <span className="text-sm">HP: {gameState?.player?.vitals?.hit_points}/{gameState?.player?.vitals?.max_hit_points}</span>
        {!isGenerating && (
          <button onClick={onOpenPipBoy} className="border border-green-500 px-2 py-1 text-xs hover:bg-green-900">PIP-BOY</button>
        )}
      </div>

      <div className="border border-green-500 p-4 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <h2 className="text-xl">{gameState?.location?.name}</h2>
          {!isGenerating && (
            <button
              onClick={onTravel}
              disabled={loadingTravel}
              className="bg-green-900 px-3 py-1 text-xs hover:bg-green-700 disabled:opacity-50"
            >
              {loadingTravel ? 'TRAVELING...' : 'TRAVEL'}
            </button>
          )}
        </div>
        <p className="text-sm mb-4">{gameState?.location?.description}</p>

        <div className="flex items-center justify-between mb-2 gap-2">
          <h3 className="text-lg">Entities</h3>
          {onOpenEditor && (
            <button 
              onClick={onOpenEditor}
              className="text-[10px] border border-green-900 px-1 hover:bg-green-900 transition-colors"
            >
              MAP EDITOR
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {gameState?.location?.npcs?.map((npc) => (
            <div key={npc.npc_id} className="flex justify-between items-center border border-green-900 p-2">
              {npc.hit_points > 0 ? (
                <>
                  <span>{npc.name} {npc.is_hostile ? '(Hostile)' : ''}</span>
                  {!isGenerating && (
                    <div className="flex gap-2">
                      <button onClick={() => onTalk(npc.npc_id, npc.name)} className="bg-green-900 px-2 py-1 text-xs hover:bg-green-700">TALK</button>
                      <button onClick={() => onAttack(npc.npc_id)} className="bg-red-900 px-2 py-1 text-xs hover:bg-red-700 text-white">ATTACK</button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <span className="opacity-50">Corpse of {npc.name}</span>
                  {!isGenerating && (
                    <button onClick={() => onLoot(npc.npc_id)} className="bg-gray-800 px-2 py-1 text-xs hover:bg-gray-700 text-gray-300">LOOT</button>
                  )}
                </>
              )}
            </div>
          ))}
          {(!gameState?.location?.npcs || gameState.location.npcs.length === 0) && (
            <div className="text-sm opacity-50">No one is here.</div>
          )}
        </div>

        <h3 className="text-lg mb-2 mt-4">Job Board</h3>
        <div className="border border-green-900 p-2">
          {!quest && !loadingQuest && !isGenerating && (
            <button onClick={onLoadQuest} className="bg-green-900 px-2 py-1 text-xs hover:bg-green-700 w-full">CHECK POSTINGS</button>
          )}
          {loadingQuest && (
            <div className="text-sm opacity-50 text-center">Searching network...</div>
          )}
          {quest && (
            <div className="text-sm">
              <div className="font-bold text-green-300 mb-1">{quest.title}</div>
              <div className="mb-2 opacity-80">{quest.description}</div>
              <ul className="list-disc pl-4 mb-2 opacity-80">
                {JSON.parse(quest.objectives).map((obj: any, index: number) => <li key={index}>{obj.text}</li>)}
              </ul>
              <div className="flex justify-between text-xs text-green-300">
                <span>Reward: {quest.reward_caps} Caps</span>
                <span>XP: {quest.reward_xp}</span>
              </div>
              {!isGenerating && (
                <button onClick={onAcceptQuest} className="mt-2 bg-green-900 px-2 py-1 text-xs hover:bg-green-700 w-full">ACCEPT JOB</button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}