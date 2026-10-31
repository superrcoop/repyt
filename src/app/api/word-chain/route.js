import { NextResponse } from 'next/server';

export const maxDuration = 15;

// Fallback pool of evocative associative words
const WORD_POOL = [
  'Galaxy', 'Nebula', 'Orbit', 'Thunder', 'Lightning', 'Horizon', 'Mirage', 'Phoenix',
  'Velocity', 'Prism', 'Echo', 'Tempest', 'Gravity', 'Solar', 'Spark', 'Current',
  'Tide', 'Crystal', 'Summit', 'Cascade', 'Rhythm', 'Melody', 'Shadow', 'Beacon',
  'Compass', 'Glacier', 'Obsidian', 'Breeze', 'Voyage', 'Zenith', 'Radiance', 'Pulse',
  'Chasm', 'Vortex', 'Aurora', 'Eclipse', 'Sanctuary', 'Labyrinth', 'Constellation',
  'Volcano', 'Oasis', 'Telescope', 'Archipelago', 'Avalanche', 'Meteor', 'Harmony'
];

const OFFLINE_ASSOCIATIONS = {
  ocean: ['wave', 'water', 'tide', 'blue', 'deep', 'fish', 'salt', 'coral', 'current', 'whale'],
  sun: ['light', 'heat', 'summer', 'star', 'morning', 'bright', 'energy', 'fire', 'burn'],
  music: ['melody', 'beat', 'rhythm', 'sound', 'dance', 'song', 'guitar', 'harmony', 'tempo'],
  coffee: ['caffeine', 'morning', 'cup', 'beans', 'brew', 'energy', 'latte', 'warmth', 'mug'],
  island: ['beach', 'palm', 'sand', 'tropical', 'ocean', 'caribbean', 'paradise', 'retreat'],
  fire: ['heat', 'smoke', 'ash', 'flame', 'spark', 'ember', 'burn', 'campfire', 'passion'],
  space: ['stars', 'galaxy', 'void', 'moon', 'orbit', 'astronaut', 'cosmos', 'planet'],
  storm: ['thunder', 'lightning', 'rain', 'wind', 'cloud', 'darkness', 'hurricane', 'tempest'],
  game: ['play', 'player', 'rules', 'fun', 'level', 'score', 'arcade', 'victory', 'puzzle'],
  dream: ['sleep', 'night', 'vision', 'imagination', 'cloud', 'hope', 'fantasy', 'subconscious'],
  wave: ['ocean', 'surf', 'sound', 'crest', 'tide', 'ripple', 'motion', 'tsunami', 'water'],
  star: ['sky', 'night', 'shine', 'astronomy', 'constellation', 'supernova', 'galaxy', 'glow'],
};

function isValidGeminiKey(key) {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim().replace(/^['"]|['"]$/g, '');
  // Supports legacy AIzaSy keys and modern AQ.Ab keys from Google AI Studio
  return (clean.startsWith('AIzaSy') || clean.startsWith('AQ.')) && clean.length >= 30;
}

function offlineEvaluate(currentWord, playerWord, history = []) {
  const normCurrent = currentWord.toLowerCase().trim();
  const normPlayer = playerWord.toLowerCase().trim();

  // Basic check: at least 2 letters, alphabetical
  if (!/^[a-z]+$/i.test(normPlayer) || normPlayer.length < 2) {
    return {
      valid: false,
      score: 0,
      reason: 'Words must contain only valid letters.',
      counterWord: null,
      banter: 'That does not look like a standard word!',
    };
  }

  if (normPlayer === normCurrent) {
    return {
      valid: false,
      score: 0,
      reason: 'You cannot repeat the exact same word!',
      counterWord: null,
      banter: 'Repyt does not mean saying the exact same word twice!',
    };
  }

  // Look in mock dictionary or accept reasonable word
  const knownLinks = OFFLINE_ASSOCIATIONS[normCurrent] || [];
  const isDirectKnown = knownLinks.includes(normPlayer);

  // Pick counter word from known associations or rich pool
  let candidateWords = OFFLINE_ASSOCIATIONS[normPlayer] || WORD_POOL;
  candidateWords = candidateWords.filter(
    (w) => !history.map((h) => h.toLowerCase()).includes(w.toLowerCase()) &&
           w.toLowerCase() !== normPlayer &&
           w.toLowerCase() !== normCurrent
  );

  const counterWord = candidateWords.length > 0
    ? candidateWords[Math.floor(Math.random() * candidateWords.length)]
    : WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)];

  const score = isDirectKnown ? Math.floor(Math.random() * 15 + 85) : Math.floor(Math.random() * 25 + 68);

  const wittyBanter = [
    'Sharp connection! How about this?',
    'Creative volley! Hit this back:',
    'Solid link! Back to you:',
    'Nice associative leap! Defend this:',
    'Clean return! Rally continues:'
  ];

  return {
    valid: true,
    score,
    reason: isDirectKnown
      ? `Strong connection between ${currentWord} and ${playerWord}.`
      : `Creative associative leap!`,
    counterWord,
    banter: isDirectKnown
      ? 'Classic connection, nicely played!'
      : wittyBanter[Math.floor(Math.random() * wittyBanter.length)],
  };
}

export async function POST(req) {
  let cleanCurrent = 'Ocean';
  let cleanPlayer = 'Wave';
  let hist = [];

  try {
    const body = await req.json();
    const currentWord = body.currentWord || '';
    const playerWord = body.playerWord || '';
    hist = body.history || [];
    const theme = body.theme || 'general';

    if (!currentWord || !playerWord) {
      return NextResponse.json({ error: 'Missing currentWord or playerWord' }, { status: 400 });
    }

    cleanPlayer = playerWord.trim();
    cleanCurrent = currentWord.trim();

    // Check repeat in history
    const normalizedHistory = hist.map((w) => w.toLowerCase().trim());
    if (normalizedHistory.includes(cleanPlayer.toLowerCase())) {
      return NextResponse.json({
        valid: false,
        score: 0,
        reason: `"${cleanPlayer}" was already used in this rally!`,
        counterWord: null,
        banter: 'No repeats allowed in the same chain! Keep it fresh.',
      });
    }

    const rawKey = process.env.GEMINI_API_KEY;
    const apiKey = rawKey ? rawKey.trim().replace(/^['"]|['"]$/g, '') : '';

    // If key is missing or not a valid Google AI Studio key format, use offline engine gracefully
    if (!isValidGeminiKey(apiKey)) {
      const offlineResult = offlineEvaluate(cleanCurrent, cleanPlayer, hist);
      return NextResponse.json({
        ...offlineResult,
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

    return NextResponse.json({
      valid: Boolean(parsed.valid),
      score: parsed.score || 50,
      reason: parsed.reason || '',
      counterWord: parsed.counterWord ? parsed.counterWord.trim() : 'Pulse',
      banter: parsed.banter || 'Your turn!',
      mode: 'gemini_live',
    });
  } catch (err) {
    console.error('Word-chain API error, falling back to offline mode:', err);
    // Graceful offline fallback with the actual user input! Never crash the game.
    const fallback = offlineEvaluate(cleanCurrent, cleanPlayer, hist);
    return NextResponse.json({
      ...fallback,
      mode: 'offline_fallback',
    });
  }
}
