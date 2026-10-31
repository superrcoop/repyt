import { NextResponse } from 'next/server';

export const maxDuration = 15;

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

function isValidGeminiKey(key) {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim().replace(/^['"]|['"]$/g, '');
  return (clean.startsWith('AIzaSy') || clean.startsWith('AQ.')) && clean.length >= 30;
}

function offlineEstimateRank(guess, target) {
  const g = guess.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (g === t) {
    return 1;
  }

  let score = 5000;
  if (g.length === t.length) score -= 400;
  if (g[0] === t[0]) score -= 800;

  const relatedGroups = [
    ['light', 'beacon', 'tower', 'coast', 'sea', 'ocean', 'ship', 'fog', 'lamp', 'lighthouse'],
    ['fire', 'lava', 'magma', 'mountain', 'eruption', 'ash', 'smoke', 'crater', 'volcano'],
    ['water', 'underwater', 'deep', 'periscope', 'sonar', 'dive', 'torpedo', 'submarine'],
    ['space', 'orbit', 'telecom', 'signal', 'earth', 'dish', 'rocket', 'satellite'],
    ['north', 'direction', 'needle', 'map', 'navigate', 'south', 'east', 'west', 'compass'],
    ['stars', 'sky', 'lens', 'observatory', 'astronomy', 'space', 'galaxy', 'telescope'],
    ['desert', 'water', 'palm', 'sand', 'green', 'mirage', 'caravan', 'oasis'],
    ['ice', 'cold', 'snow', 'frozen', 'arctic', 'mountain', 'frost', 'glacier'],
    ['church', 'temple', 'dome', 'gothic', 'monument', 'steeple', 'cathedral'],
    ['instrument', 'music', 'sound', 'melody', 'blues', 'mouth', 'harmonica'],
    ['music', 'symphony', 'violin', 'conductor', 'instruments', 'band', 'orchestra'],
    ['egypt', 'stone', 'monument', 'tomb', 'pharaoh', 'desert', 'triangle', 'pyramid'],
    ['coffee', 'caffeine', 'roast', 'morning', 'cup', 'brew', 'latte', 'espresso'],
    ['maze', 'puzzle', 'minotaur', 'path', 'lost', 'corridor', 'labyrinth'],
    ['stars', 'zodiac', 'orion', 'sky', 'night', 'astronomy', 'cluster', 'constellation']
  ];

  for (const group of relatedGroups) {
    if (group.includes(t) && group.includes(g)) {
      score = Math.floor(Math.random() * 250 + 25);
      break;
    }
  }

  return Math.max(2, Math.min(score, 9999));
}

export async function POST(req) {
  let cleanGuess = '';
  const dateStr = new Date().toISOString().slice(0, 10);
  const target = getDailyTarget(dateStr);

  try {
    const body = await req.json();
    const guess = body.guess || '';

    if (!guess) {
      return NextResponse.json({ error: 'Guess is required' }, { status: 400 });
    }

    cleanGuess = guess.trim();

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

    const rawKey = process.env.GEMINI_API_KEY;
    const apiKey = rawKey ? rawKey.trim().replace(/^['"]|['"]$/g, '') : '';

    if (!isValidGeminiKey(apiKey)) {
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const apiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!apiRes.ok) {
      throw new Error(`Gemini API error: ${apiRes.status}`);
    }

    const data = await apiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
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
    console.error('Semantic-climb API error, falling back to offline mode:', err);
    const rank = offlineEstimateRank(cleanGuess || 'word', target);
    const temp = getTemperature(rank);
    return NextResponse.json({
      guess: cleanGuess || 'guess',
      rank,
      solved: false,
      temperature: temp.label,
      color: temp.color,
      icon: temp.icon,
      hint: rank <= 300 ? 'You are super close in meaning!' : 'Keep searching different categories.',
      mode: 'offline_fallback',
    });
  }
}
