// Client-side AI helper. The Gemini API key NO LONGER lives in the browser bundle — every
// call now goes through the authenticated server routes under /api/ai (see server/routes/ai.ts).
// Exported signatures are unchanged so existing components and App.tsx keep working as-is.

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('jwtToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function postAi<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`/api/ai/${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    console.error(`AI request to ${path} failed:`, e);
    return null;
  }
}

export async function generateDialogue(npc: any, player: any, context: string) {
  return (await postAi<any>('dialogue', { npc, player, context })) ?? {};
}

export async function generateCombatFlavor(message: string) {
  const data = await postAi<{ text?: string }>('combat-flavor', { message });
  return data?.text || message;
}

export async function generateWorldDescription(location: any, player: any) {
  const data = await postAi<{ text?: string | null }>('world-description', { location, player });
  return data?.text ?? null;
}

export async function generateNarrativeFlavor(player: any, location: any, world: any, action: string, context: any) {
  const data = await postAi<{ text?: string | null }>('narrative-flavor', { player, location, world, action, context });
  return data?.text ?? null;
}

export async function generateRandomEncounter(player: any, location: any, world: any) {
  return (await postAi<any>('random-encounter', { player, location, world })) ?? {};
}

export async function generateNarrativeRecap(logs: any[]) {
  if (!logs || logs.length === 0) return 'Nothing of note has happened yet.';
  const data = await postAi<{ text?: string | null }>('narrative-recap', { logs });
  return data?.text ?? null;
}

export async function generateQuest(location: any, player: any) {
  return (await postAi<any>('quest', { location, player })) ?? {};
}

// --- Image helpers. Cached client-side so repeated renders don't re-request. ---
const spriteCache = new Map<string, string>();
const itemIconCache = new Map<string, string>();
const terrainCache = new Map<string, string>();
const objectCache = new Map<string, string>();

async function postImage(path: string, body: unknown): Promise<string | null> {
  const data = await postAi<{ imageUrl?: string | null }>(path, body);
  return data?.imageUrl ?? null;
}

export async function generateTerrainSprite(kind: string): Promise<string | null> {
  if (terrainCache.has(kind)) return terrainCache.get(kind)!;
  const url = await postImage('sprite/terrain', { kind });
  if (url) terrainCache.set(kind, url);
  return url;
}

export async function generateObjectSprite(kind: string): Promise<string | null> {
  if (objectCache.has(kind)) return objectCache.get(kind)!;
  const url = await postImage('sprite/object', { kind });
  if (url) objectCache.set(kind, url);
  return url;
}

export async function generateCharacterSprite(
  name: string,
  description: string,
  isHostile: boolean,
  hpPercent: number = 100,
  equipment: string = '',
): Promise<string | null> {
  const cacheKey = `${name}-${isHostile}-${hpPercent > 50 ? 'healthy' : 'wounded'}-${equipment}`;
  if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey)!;
  const url = await postImage('sprite/character', { name, description, isHostile, hpPercent, equipment });
  if (url) spriteCache.set(cacheKey, url);
  return url;
}

export async function generateItemIcon(name: string, type: string, description: string): Promise<string | null> {
  const cacheKey = `${name}-${type}`;
  if (itemIconCache.has(cacheKey)) return itemIconCache.get(cacheKey)!;
  const url = await postImage('sprite/item', { name, type, description });
  if (url) itemIconCache.set(cacheKey, url);
  return url;
}
