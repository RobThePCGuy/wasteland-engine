function authHeaders(token: string | null, includeJson = false): HeadersInit {
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(url: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, options);
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

export const api = {
  auth: {
    async login(username: string, password: string) {
      return request<{ access_token: string }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    },

    async register(username: string, password: string) {
      return request<{ access_token: string }>('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    },
  },

  state: {
    async load(token: string | null) {
      return request('/api/state/load', { headers: authHeaders(token) });
    },

    async save(token: string | null, playerName: string, playerStats: Record<string, number>, locationId: number) {
      return request('/api/state/save', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ player_name: playerName, player_stats: playerStats, location_id: locationId }),
      });
    },

    async levelUp(token: string | null, stat: string) {
      return request<{ message: string }>('/api/state/levelup', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ stat }),
      });
    },

    async choosePerk(token: string | null, perkId: number) {
      return request<{ message: string }>('/api/state/perk/choose', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ perkId }),
      });
    },

    async restart(token: string | null) {
      return request('/api/state/restart', {
        method: 'POST',
        headers: authHeaders(token),
      });
    },
  },

  combat: {
    async getState(token: string | null) {
      return request('/api/combat/state', { headers: authHeaders(token) });
    },

    async start(token: string | null, npcIds: number[]) {
      return request<{ message: string }>('/api/combat/start', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ npc_ids: npcIds }),
      });
    },

    async action(token: string | null, actionType: string, targetId?: number, bodyPart?: string, useCritical?: boolean, targetX?: number, targetY?: number) {
      return request<{ message: string; combat_over?: boolean }>('/api/combat/action', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ action_type: actionType, target_id: targetId, body_part: bodyPart, use_critical: useCritical, target_x: targetX, target_y: targetY }),
      });
    },

    async npcTurn(token: string | null) {
      return request<{ message: string; combat_over?: boolean }>('/api/combat/npc-turn', {
        method: 'POST',
        headers: authHeaders(token),
      });
    },
  },

  npc: {
    async dialogue(token: string | null, npcId: number) {
      return request('/api/npc/' + npcId + '/dialogue', { headers: authHeaders(token) });
    },

    async dialogueRespond(token: string | null, npcId: number, playerText: string) {
      return request('/api/npc/dialogue/respond', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ npc_id: npcId, player_text: playerText }),
      });
    },

    async trade(token: string | null, npcId: number) {
      return request('/api/npc/' + npcId + '/trade', { headers: authHeaders(token) });
    },

    async loot(token: string | null, npcId: number) {
      return request('/api/npc/' + npcId + '/loot', {
        method: 'POST',
        headers: authHeaders(token),
      });
    },
  },

  trade: {
    async execute(token: string | null, npcId: number, itemId: number, action: 'buy' | 'sell', quantity: number = 1) {
      return request<{ message: string }>('/api/trade', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ npc_id: npcId, item_id: itemId, action, quantity }),
      });
    },
  },

  quest: {
    async generate(token: string | null) {
      return request('/api/quest/generate', { headers: authHeaders(token) });
    },

    async accept(token: string | null, quest: Record<string, unknown>) {
      return request('/api/quest/accept', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify(quest),
      });
    },

    async complete(token: string | null) {
      return request<{ message: string }>('/api/quest/complete', {
        method: 'POST',
        headers: authHeaders(token),
      });
    },
  },

  travel: {
    async initiate(token: string | null, targetLocationId?: number) {
      return request<{ request_id: string; preview_location?: { name: string } }>('/api/travel', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify(targetLocationId ? { target_location_id: targetLocationId } : {}),
      });
    },

    async confirm(token: string | null, requestId: string) {
      return request<{ location_name?: string }>('/api/travel/confirm', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ request_id: requestId }),
      });
    },
  },

  items: {
    async use(token: string | null, itemId: number) {
      return request<{ message: string }>('/api/item/' + itemId + '/use', {
        method: 'POST',
        headers: authHeaders(token),
      });
    },

    async equip(token: string | null, itemId: number) {
      return request<{ message: string }>('/api/item/' + itemId + '/equip', {
        method: 'POST',
        headers: authHeaders(token),
      });
    },
  },

  interact: {
    async move(token: string | null, targetX: number, targetY: number) {
      return request<{ message: string; hazardDamage?: number }>('/api/interact/move', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ targetX, targetY }),
      });
    },

    async scavenge(token: string | null, resourceType: string, resourceAmount: number, tileX: number, tileY: number) {
      return request<{ message: string }>('/api/interact/scavenge', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ resourceType, resourceAmount, tileX, tileY }),
      });
    },

    async hack(token: string | null, success: boolean, tileX: number, tileY: number) {
      return request<{ message: string }>('/api/interact/hack', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ success, tileX, tileY }),
      });
    },
  },

  world: {
    async profile(token: string | null) {
      return request('/api/world/profile', { headers: authHeaders(token) });
    },

    async locations(token: string | null) {
      return request<{ locations: unknown[] }>('/api/world/locations', { headers: authHeaders(token) });
    },

    async perks(token: string | null) {
      return request<{ perks: unknown[] }>('/api/world/perks', { headers: authHeaders(token) });
    },
  },

  narrative: {
    async log(token: string | null, text: string, type: string) {
      return fetch('/api/narrative/log', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ text, type }),
      }).catch(() => {});
    },
  },
};
