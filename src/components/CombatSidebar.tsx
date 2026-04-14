import type { Dispatch, SetStateAction } from 'react';
import type { CombatViewMode, CombatState, GameState, Combatant } from '../types/app';

interface CombatSidebarProps {
  combatState: CombatState;
  gameState: GameState;
  onAction: (actionType: string, targetId?: number, bodyPart?: string) => void | Promise<void>;
  onMove: (targetX: number, targetY: number) => void | Promise<void>;
  pendingAction: string | null;
  setPendingAction: Dispatch<SetStateAction<string | null>>;
  selectedBodyPart: string | null;
  setSelectedBodyPart: Dispatch<SetStateAction<string | null>>;
  isGenerating: boolean;
}

export default function CombatSidebar({
  combatState,
  gameState,
  onAction,
  onMove,
  pendingAction,
  setPendingAction,
  selectedBodyPart,
  setSelectedBodyPart,
  isGenerating,
}: CombatSidebarProps) {
  const currentTurn = combatState.turn_order?.[combatState.current_turn_index];
  const healingItems = gameState?.inventory?.filter((item: any) => item.type === 'healing') ?? [];

  return (
    <>
      <div className="border border-red-500 p-4 flex-1 flex flex-col">
        <h2 className="text-xl border-b border-red-500 pb-2 mb-2 text-red-500">COMBAT ENGAGED</h2>
        <div className="mb-4 text-sm text-red-400">
          Round: {combatState.current_round} | Turn: {currentTurn?.name}
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div>
            <h3 className="text-lg text-red-500 mb-2">Enemies</h3>
              {combatState.npcs.map((npc: Combatant) => (
                <div key={npc.id} className="border border-red-900 p-2 mb-2">
                  <div className="flex justify-between text-sm">
                    <span>{npc.name}</span>
                    <span>HP: {npc.hit_points}/{npc.max_hit_points}</span>
                  </div>
                  {pendingAction && (
                    <button
                      onClick={() => onAction(pendingAction, npc.id, selectedBodyPart || undefined)}
                      className="mt-2 w-full bg-red-900 text-white py-1 text-xs hover:bg-red-700"
                    >
                      CONFIRM TARGET
                    </button>
                  )}
                </div>
              ))}
            </div>

            {currentTurn?.type === 'player' && !pendingAction && (
              <div className="mt-auto">
                <div className="text-sm mb-2 text-red-400">AP: {currentTurn?.ap_remaining}</div>
                {!isGenerating && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setPendingAction('attack')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500">ATTACK</button>
                    <button onClick={() => setPendingAction('aimed_shot')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500">AIMED SHOT</button>
                    <button onClick={() => onAction('defend')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500">DEFEND</button>
                    <button onClick={() => onAction('reload')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500">RELOAD</button>
                    <button onClick={() => setPendingAction('use_item')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500">USE ITEM</button>
                    <button onClick={() => onAction('flee')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500">FLEE</button>
                    <button onClick={() => onAction('end_turn')} className="border border-red-500 p-2 hover:bg-red-900 text-red-500">END TURN</button>
                  </div>
                )}
              </div>
            )}

            {pendingAction === 'use_item' && (
              <div className="mt-auto">
                <h3 className="text-sm text-red-500 mb-2">Select Item to Use</h3>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                  {healingItems.map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => onAction('use_item', item.id)}
                      className="border border-red-500 p-1 text-xs hover:bg-red-900 text-red-500 text-left flex justify-between"
                    >
                      <span>{item.name}</span>
                      <span>x{item.quantity}</span>
                    </button>
                  ))}
                  {healingItems.length === 0 && (
                    <div className="text-xs text-red-400 opacity-50">No usable items.</div>
                  )}
                </div>
                <button onClick={() => setPendingAction(null)} className="mt-2 w-full border border-gray-500 p-1 text-xs hover:bg-gray-800 text-gray-400">CANCEL</button>
              </div>
            )}

            {pendingAction === 'aimed_shot' && !selectedBodyPart && (
              <div className="mt-auto">
                <h3 className="text-sm text-red-500 mb-2">Select Target Area</h3>
                <div className="grid grid-cols-2 gap-2">
                  {['head', 'eyes', 'torso', 'arms', 'legs', 'groin'].map(part => (
                    <button
                      key={part}
                      onClick={() => setSelectedBodyPart(part)}
                      className="border border-red-500 p-1 text-xs hover:bg-red-900 text-red-500 uppercase"
                    >
                      {part}
                    </button>
                  ))}
                </div>
                <button onClick={() => setPendingAction(null)} className="mt-2 w-full border border-gray-500 p-1 text-xs hover:bg-gray-800 text-gray-400">CANCEL</button>
              </div>
            )}

            {pendingAction && selectedBodyPart && (
              <div className="mt-auto">
                <button
                  onClick={() => {
                    setPendingAction(null);
                    setSelectedBodyPart(null);
                  }}
                  className="w-full border border-gray-500 p-1 text-xs hover:bg-gray-800 text-gray-400"
                >
                  CANCEL AIMED SHOT
                </button>
              </div>
            )}

            {pendingAction === 'attack' && (
              <div className="mt-auto">
                <button onClick={() => setPendingAction(null)} className="w-full border border-gray-500 p-1 text-xs hover:bg-gray-800 text-gray-400">CANCEL ATTACK</button>
              </div>
            )}
          </div>
        </div>
    </>
  );
}