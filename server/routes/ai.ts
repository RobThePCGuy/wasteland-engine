import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

// Server-side Gemini proxy. Previously these calls ran in the BROWSER with the API key inlined
// into the bundle (vite.config define) — extractable by any user. They now run here, behind
// `authenticate` (see server.ts) and the global rate limiter, so the key never leaves the server.
//
// Model ids are centralized. Both are verified callable today; migrate when convenient:
//   text  : gemini-3-flash-preview  -> GA successor gemini-3.5-flash
//   image : gemini-2.5-flash-image  -> SHUTS DOWN 2026-10-02; migrate to gemini-3.1-flash-image-preview
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

export const aiRouter = Router();

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.error('[ai] GEMINI_API_KEY is missing or using the placeholder value.');
    return null;
  }
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimit =
        error?.message?.includes('429') || error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED');
      if (isRateLimit && i < retries) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, i) + Math.floor(Math.random() * 1000);
        console.warn(`[ai] Rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Serialize image generation to avoid hitting concurrent-request limits.
let activeImageGenerations = 0;
const MAX_CONCURRENT_IMAGES = 1;
const imageQueue: (() => void)[] = [];

function acquireImageSlot(): Promise<void> {
  if (activeImageGenerations < MAX_CONCURRENT_IMAGES) {
    activeImageGenerations++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => imageQueue.push(resolve));
}

function releaseImageSlot() {
  activeImageGenerations--;
  if (imageQueue.length > 0) {
    const next = imageQueue.shift();
    if (next) {
      activeImageGenerations++;
      next();
    }
  }
}

function parseJson(text: string | undefined): any {
  if (!text) return {};
  try {
    const cleaned = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned);
  } catch {
    console.error('[ai] Failed to parse JSON from AI response:', text);
    return {};
  }
}

async function generateImage(prompt: string): Promise<string | null> {
  const ai = getAi();
  if (!ai) return null;
  try {
    await acquireImageSlot();
    const response = await callWithRetry(() =>
      ai.models.generateContent({ model: IMAGE_MODEL, contents: { parts: [{ text: prompt }] } }),
    );
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error('[ai] Image generation failed:', error);
  } finally {
    releaseImageSlot();
  }
  return null;
}

// --- Text routes -----------------------------------------------------------

aiRouter.post('/dialogue', async (req: any, res: any) => {
  const ai = getAi();
  if (!ai) return res.status(503).json({ message: 'AI service unavailable' });
  const { npc, player, context } = req.body ?? {};

  const prompt = `
    You are writing dialogue for a Fallout-style RPG.
    NPC Name: ${npc?.name}
    NPC Description: ${npc?.description}
    Player Name: ${player?.name}
    Player Stats: STR ${player?.strength}, PER ${player?.perception}, END ${player?.endurance}, CHR ${player?.charisma}, INT ${player?.intelligence}, AGI ${player?.agility}, LCK ${player?.luck}
    Context: ${context}

    Generate the NPC's response and 2-4 dialogue options for the player.
  `;

  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            npc_text: { type: Type.STRING, description: "The NPC's dialogue" },
            player_options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING, description: "The player's dialogue option" },
                  action: { type: Type.STRING, description: "Action to take if chosen (e.g., 'continue', 'trade', 'attack', 'complete_quest', 'end')" },
                },
                required: ['text', 'action'],
              },
            },
          },
          required: ['npc_text', 'player_options'],
        },
      },
    }),
  );

  res.json(parseJson(response.text));
});

aiRouter.post('/combat-flavor', async (req: any, res: any) => {
  const ai = getAi();
  const message = String(req.body?.message ?? '');
  if (!ai) return res.json({ text: message });

  const prompt = `
    You are a narrator for a Fallout-style RPG. Rewrite this combat log entry as a single, gritty sentence. No options, no alternatives, no commentary. Just one punchy narrative line under 30 words.
    Entry: "${message}"
  `;
  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { text: { type: Type.STRING, description: 'A single gritty narrative sentence rewriting the combat entry' } },
          required: ['text'],
        },
      },
    }),
  );
  const parsed = parseJson(response.text);
  res.json({ text: parsed.text || message });
});

aiRouter.post('/world-description', async (req: any, res: any) => {
  const ai = getAi();
  if (!ai) return res.json({ text: null });
  const { location, player } = req.body ?? {};
  const prompt = `
    You are a narrator for a Fallout-style RPG.
    Describe the location the player just entered.
    Location Name: ${location?.name}
    Base Description: ${location?.description}
    Player INT: ${player?.intelligence}, PER: ${player?.perception}
    Make it atmospheric and gritty. Keep it under 3 sentences.
  `;
  const response = await callWithRetry(() => ai.models.generateContent({ model: TEXT_MODEL, contents: prompt }));
  res.json({ text: response.text });
});

aiRouter.post('/narrative-flavor', async (req: any, res: any) => {
  const ai = getAi();
  if (!ai) return res.json({ text: null });
  const { player, location, world, action, context } = req.body ?? {};
  const prompt = `
    You are a gritty narrator for a post-apocalyptic RPG called "${world?.name}".
    World Tone: ${world?.tone}. Climate: ${world?.climate}.

    Player: ${player?.name} (Level ${player?.level}, Karma ${player?.karma})
    Location: ${location?.name} - ${location?.description}

    Action: ${action}
    Context: ${JSON.stringify(context)}

    Generate a single, punchy, atmospheric sentence (under 25 words) describing this action in a gritty, immersive way.
    Focus on sensory details and the harsh reality of the wasteland.
  `;
  const response = await callWithRetry(() => ai.models.generateContent({ model: TEXT_MODEL, contents: prompt }));
  res.json({ text: response.text?.trim() || null });
});

aiRouter.post('/random-encounter', async (req: any, res: any) => {
  const ai = getAi();
  if (!ai) return res.status(503).json({ message: 'AI service unavailable' });
  const { player, location, world } = req.body ?? {};
  const prompt = `
    You are a world-event generator for a post-apocalyptic RPG.
    Location: ${location?.name} (${location?.description})
    World Tone: ${world?.tone}
    Player Level: ${player?.level}

    Generate a random encounter or atmospheric event that the player notices while exploring.
    The encounter can be one of:
    - narrative: A purely atmospheric detail or small story beat.
    - combat: A sudden threat (e.g., a radroach, a raider scout).
    - item: Finding something useful (e.g., a stash of caps, a stimpak).
    - npc: A brief interaction with a wanderer or scavenger.
    - choice: A small dilemma with two options.

    Return a structured JSON object.
  `;
  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "One of: 'narrative', 'combat', 'item', 'npc', 'choice'" },
            text: { type: Type.STRING, description: 'The description of the encounter' },
            data: {
              type: Type.OBJECT,
              properties: {
                enemy_name: { type: Type.STRING, description: 'For combat: the name of the enemy' },
                item_name: { type: Type.STRING, description: 'For item: the name of the item found' },
                item_quantity: { type: Type.INTEGER, description: 'For item: quantity' },
                npc_name: { type: Type.STRING, description: 'For npc: the name of the NPC' },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING, description: 'The choice text' },
                      action: { type: Type.STRING, description: "The result action (e.g., 'gain_karma', 'lose_karma', 'gain_item', 'start_combat')" },
                    },
                    required: ['text', 'action'],
                  },
                },
              },
            },
          },
          required: ['type', 'text'],
        },
      },
    }),
  );
  res.json(parseJson(response.text));
});

aiRouter.post('/narrative-recap', async (req: any, res: any) => {
  const ai = getAi();
  const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];
  if (logs.length === 0) return res.json({ text: 'Nothing of note has happened yet.' });
  if (!ai) return res.json({ text: null });

  const logText = logs.map((l: any) => `[${l.type}] ${l.text}`).join('\n');
  const prompt = `
    Summarize the following recent events in a gritty, first-person journal style for a post-apocalyptic survivor.

    Events:
    ${logText}

    Keep the summary concise (2-3 sentences).
  `;
  const response = await callWithRetry(() => ai.models.generateContent({ model: TEXT_MODEL, contents: prompt }));
  res.json({ text: response.text?.trim() || null });
});

aiRouter.post('/quest', async (req: any, res: any) => {
  const ai = getAi();
  if (!ai) return res.status(503).json({ message: 'AI service unavailable' });
  const { location, player } = req.body ?? {};
  const prompt = `
    You are a quest designer for a Fallout-style RPG.
    Generate a procedural job board quest for the player.
    Location: ${location?.name}
    Player Level: ${player?.level}
    Player Karma: ${player?.karma}

    The quest should be gritty, morally ambiguous, and fit the post-apocalyptic setting.
  `;
  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'The title of the quest' },
            description: { type: Type.STRING, description: 'The quest description and background' },
            objectives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING, description: 'Display text for the objective' },
                  type: { type: Type.STRING, description: "Type of objective: 'kill', 'fetch', 'talk', 'explore'" },
                  target: { type: Type.STRING, description: 'The target of the objective (NPC name, item name, or location name)' },
                  required_count: { type: Type.INTEGER, description: 'Number of times the action must be performed' },
                },
                required: ['text', 'type', 'target', 'required_count'],
              },
              description: 'A list of 1-3 structured objectives',
            },
            reward_caps: { type: Type.INTEGER, description: 'The reward in caps' },
            reward_xp: { type: Type.INTEGER, description: 'The reward in XP' },
          },
          required: ['title', 'description', 'objectives', 'reward_caps', 'reward_xp'],
        },
      },
    }),
  );
  res.json(parseJson(response.text));
});

// --- Image routes (return { imageUrl: string | null }) ---------------------

aiRouter.post('/sprite/terrain', async (req: any, res: any) => {
  const kind = String(req.body?.kind ?? '');
  const prompt = `A retro 90s CRPG pixel art isometric tile of ${kind} terrain for a post-apocalyptic wasteland. Pure black background, no borders, seamless-ready style. Dark, gritty, Fallout style.`;
  res.json({ imageUrl: await generateImage(prompt) });
});

aiRouter.post('/sprite/object', async (req: any, res: any) => {
  const kind = String(req.body?.kind ?? '');
  const prompt = `A retro 90s CRPG pixel art isometric environmental object: ${kind}. For a post-apocalyptic wasteland. Pure black background, full object visible, isometric angle. Dark, gritty, Fallout style.`;
  res.json({ imageUrl: await generateImage(prompt) });
});

aiRouter.post('/sprite/character', async (req: any, res: any) => {
  const { name, description, isHostile, hpPercent = 100, equipment = '' } = req.body ?? {};
  let statusPrompt = isHostile ? 'They look hostile, holding a makeshift weapon.' : 'They look neutral.';
  if (hpPercent < 30) statusPrompt += ' They look severely wounded and bloody.';
  else if (hpPercent < 70) statusPrompt += ' They look injured and tired.';
  if (equipment) statusPrompt += ` They are equipped with ${equipment}.`;
  const prompt = `A retro 90s CRPG pixel art sprite of a post-apocalyptic character named ${name}. ${description}. ${statusPrompt} Isometric angle, full body, standing on a pure black background. Dark, gritty, Fallout style.`;
  res.json({ imageUrl: await generateImage(prompt) });
});

aiRouter.post('/sprite/item', async (req: any, res: any) => {
  const { name, type, description } = req.body ?? {};
  const prompt = `A retro 90s CRPG pixel art icon of a post-apocalyptic item: ${name}. It is a ${type}. ${description}. Centered, pure black background. Dark, gritty, Fallout style.`;
  res.json({ imageUrl: await generateImage(prompt) });
});
