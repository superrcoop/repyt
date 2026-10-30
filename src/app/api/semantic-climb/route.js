import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// 30 Curated rotating daily words
const DAILY_TARGETS = [
  'Lighthouse', 'Volcano', 'Submarine', 'Satellite', 'Compass',
  'Telescope', 'Oasis', 'Glacier', 'Cathedral', 'Harmonica',
  'Carnival', 'Chameleon', 'Archipelago', 'Avalanche', 'Meteor',
  'Orchestra', 'Pyramid', 'Espresso', 'Labyrinth', 'Constellation',
  'Jungle', 'Diamond', 'Bicycle', 'Waterfall', 'Castle',
  'Dragonfly', 'Sanctuary', 'Spaceship', 'Sunflower', 'Horizon'
];

function getDailyTarget(dateStr) {
  // Deterministic seed based on date string
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DAILY_TARGETS.length;
  return DAILY_TARGETS[index];
}

function getTemperature(rank) {
  if (rank === 1) return { label: 'Solved!', color: 'emerald', icon: '🟩' };
  if (rank <= 300) return { label: 'Burning Hot!', color: 'rose', icon: '🔥' };
  if (rank <= 1500) return { label: 'Warm', color: 'amber', icon: '🟡' };
  if (rank <= 4000) return { label: 'Cool', color: 'sky', icon: '❄️' };
  return { label: 'Freezing', color: 'slate', icon: '🧊' };
}

function offlineEstimateRank(guess, target) {
  const g = guess.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (g === t) {
    return 1;
  }

  // Common simple heuristic distance
  let score = 5000;
  if (g.length === t.length) score -= 500;
  if (g[0] === t[0]) score -= 800;

  // Keyword associations
  const relatedGroups = [
    ['light', 'beacon', 'tower', 'coast', 'sea', 'ocean', 'ship', 'fog', 'lamp', 'lighthouse'],
    ['fire', 'lava', 'magma', 'mountain', 'eruption', 'ash', 'smoke', 'crater', 'volcano'],
    ['water', 'underwater', 'deep', 'periscope', 'sonar', 'dive', 'torpedo', 'submarine'],
    ['space', 'orbit', 'telecom', 'signal', 'earth', 'dish', 'rocket', 'satellite'],
    ['north', 'direction', 'needle', 'map', 'navigate', 'south', 'east', 'west', 'compass'],
  ];

  for (const group of relatedGroups) {
    if (group.includes(t) && group.includes(g)) {
      score = Math.floor(Math.random() * 200 + 15);
      break;
    }
  }

  return Math.max(2, Math.min(score, 9999));
}

export async function POST(req) {
  try {
    const { guess, dateStr = new Date().toISOString().slice(0, 10) } = await req.json();

    if (!guess) {
      return NextResponse.json({ error: 'Guess is required' }, { status: 400 });
    }

    const cleanGuess = guess.trim();
    const target = getDailyTarget(dateStr);

    // Exact match
    if (cleanGuess.toLowerCase() === target.toLowerCase()) {
      const temp = getTemperature(1);
      return NextResponse.json({
        guess: cleanGuess,
        rank: 1,
        solved: true,
        temperature: temp.label,
        color: temp.color,
        icon: temp.icon,
        hint: `Bingo! The daily target was ${target}!`,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      const rank = offlineEstimateRank(cleanGuess, target);
      const temp = getTemperature(rank);
      return NextResponse.json({
        guess: cleanGuess,
        rank,
        solved: false,
        temperature: temp.label,
        color: temp.color,
        icon: temp.icon,
        hint: rank <= 300 ? 'You are super close in meaning!' : 'Keep searching different categories.',
        mode: 'offline_heuristic',
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are the judge for a semantic proximity word game (like Contexto / Semantle).
Target Secret Word: "${target}"
Player Guess: "${cleanGuess}"

Determine the semantic similarity and distance between the target and the guess in human conceptual space.
Rank scale:
- 1: The exact word (not applicable here)
- 2 to 300: Extremely close / direct synonym, identical category, or primary attribute (Burning Hot)
- 301 to 1500: Closely related concept / same domain (Warm)
- 1501 to 4000: Distantly related / loose association (Cool)
- 4001 to 10000: Completely unrelated / opposite / abstract mismatch (Freezing)

Return strictly valid JSON:
{
  "rank": 240,
  "hint": "Very close! Think about where this object operates."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const rank = Math.max(2, Math.min(Number(parsed.rank) || 4500, 9999));
    const temp = getTemperature(rank);

    return NextResponse.json({
      guess: cleanGuess,
      rank,
      solved: false,
      temperature: temp.label,
      color: temp.color,
      icon: temp.icon,
      hint: parsed.hint || '',
      mode: 'gemini_live',
    });
  } catch (err) {
    console.error('Semantic-climb API error:', err);
    const target = getDailyTarget(new Date().toISOString().slice(0, 10));
    const rank = offlineEstimateRank(guess || '', target);
    const temp = getTemperature(rank);
    return NextResponse.json({
      guess,
      rank,
      solved: false,
      temperature: temp.label,
      color: temp.color,
      icon: temp.icon,
      hint: 'Rally on!',
    });
  }
}
