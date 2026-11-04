import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

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

const CAPTAIN_PROFILES = {
  barnaby: {
    name: 'Old Barnaby',
    title: 'The Generous Sailor',
    role: 'Warm, grandfatherly retired sea captain',
    style: 'Encouraging, patient, praises creative leaps and metaphorical connections. Hearty sailor laughs.',
    strictness: 'Be generous with any thoughtful or creative semantic association.',
    offlineBanter: [
      'A fine seafaring leap, young sailor! Try this one on:',
      'Grand thinking! Old Barnaby approves. Catch this:',
      'Ha! Warm winds fill our sails with that word. Back at ye:',
      'A hearty volley! Let us see how you handle this:',
    ]
  },
  blackbeard: {
    name: 'Captain Blackbeard',
    title: 'The Dread Pirate Lord',
    role: 'Gruff, fierce, ruthless pirate tactician',
    style: 'Stern, sharp, pirate jargon, demands nautical or gritty associative precision. Fierce praise or witty insults.',
    strictness: 'Strict refereeing. Demands direct or clever thematic ties; dismisses weak or lazy filler words.',
    offlineBanter: [
      'Hah! Barely acceptable, scum! Take this cannonball:',
      'Ye call that an answer?! Match my cutlass with this:',
      'Shiver me timbers, at least you have some spine. Return this:',
      'Not bad for a landlubber. Now dodge this volley:',
    ]
  },
  siren: {
    name: 'The Siren',
    title: 'The Lagoon Mystic',
    role: 'Enchanting, poetic sea nymph of the deep abyss',
    style: 'Mystical, alluring, poetic, loves evocative sensory and emotional imagery.',
    strictness: 'Favors evocative, sensory, or lyrical connections over dry textbook definitions.',
    offlineBanter: [
      'Like whispers through coral waves... answer this echo:',
      'A poetic cadence indeed. Can your heart fathom this?',
      'The deep waters stir with your thoughts. Gaze into this:',
      'Lyrical and swift as tide foam. Carry this to the shore:',
    ]
  }
};

function isValidGeminiKey(key) {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim().replace(/^['"]|['"]$/g, '');
  return (clean.startsWith('AIzaSy') || clean.startsWith('AQ.')) && clean.length >= 30;
}

function offlineEvaluate(currentWord, playerWord, history = [], captainId = 'siren') {
  const normCurrent = currentWord.toLowerCase().trim();
  const normPlayer = playerWord.toLowerCase().trim();
  const captain = CAPTAIN_PROFILES[captainId] || CAPTAIN_PROFILES.siren;

  // Basic check: at least 2 letters, alphabetical
  if (!/^[a-z]+$/i.test(normPlayer) || normPlayer.length < 2) {
    return {
      valid: false,
      score: 0,
      reason: 'Words must contain only valid letters.',
      counterWord: null,
      banter: captainId === 'blackbeard' ? 'What gibberish is this, scallywag?!' : 'That does not look like a standard word!',
    };
  }

  if (normPlayer === normCurrent) {
    return {
      valid: false,
      score: 0,
      reason: 'You cannot repeat the exact same word!',
      counterWord: null,
      banter: captainId === 'blackbeard' ? 'Parrot talk! Don’t echo me back!' : 'Repyt does not mean saying the exact same word twice!',
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

  let baseScore = isDirectKnown ? Math.floor(Math.random() * 15 + 85) : Math.floor(Math.random() * 25 + 68);
  if (captainId === 'barnaby') baseScore = Math.min(100, baseScore + 6);
  if (captainId === 'blackbeard') baseScore = Math.max(45, baseScore - 5);

  const banterList = captain.offlineBanter;

  return {
    valid: true,
    score: baseScore,
    reason: isDirectKnown
      ? `Strong connection between ${currentWord} and ${playerWord}.`
      : `Creative associative leap!`,
    counterWord,
    banter: banterList[Math.floor(Math.random() * banterList.length)],
  };
}

export async function POST(req) {
  let cleanCurrent = 'Ocean';
  let cleanPlayer = 'Wave';
  let hist = [];
  let captainId = 'siren';

  try {
    const body = await req.json();
    const currentWord = body.currentWord || '';
    const playerWord = body.playerWord || '';
    hist = body.history || [];
    const theme = body.theme || 'general';
    captainId = (body.captain && CAPTAIN_PROFILES[body.captain]) ? body.captain : 'siren';
    const captain = CAPTAIN_PROFILES[captainId];

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
        banter: captainId === 'blackbeard'
          ? 'Bah! Ye already used that word, landlubber!'
          : 'No repeats allowed in the same chain! Keep it fresh.',
      });
    }

    const rawKey = process.env.GEMINI_API_KEY;
    const apiKey = rawKey ? rawKey.trim().replace(/^['"]|['"]$/g, '') : '';

    if (!isValidGeminiKey(apiKey)) {
      const offlineResult = offlineEvaluate(cleanCurrent, cleanPlayer, hist, captainId);
      return NextResponse.json({
        ...offlineResult,
        captain: captainId,
        mode: 'offline_heuristic',
      });
    }

    const prompt = `You are ${captain.name} (${captain.title}), the referee and opponent in "Repyt", a high-speed nautical word tennis game.
Your persona: ${captain.role}.
Speaking style: ${captain.style}.
Referee guidance: ${captain.strictness}.

Current active served word: "${cleanCurrent}".
Player returned: "${cleanPlayer}".
History of words already used in this rally: [${hist.join(', ')}].
Theme: ${theme}.

Tasks:
1. Is "${cleanPlayer}" a legitimate word AND a sensible semantic, cultural, or thematic association with "${cleanCurrent}"?
2. If valid, score the connection strength from 1 to 100 based on your strictness criteria.
3. Provide a witty 1-sentence reaction / banter in your distinct voice as ${captain.name} (under 16 words).
4. Supply YOUR counter-word to rally back to the player.
   - Counter-word MUST be an association with "${cleanPlayer}".
   - Counter-word MUST NOT be in the history list: [${hist.join(', ')}].
   - Counter-word MUST be a single clean word (no spaces/hyphens).

Return strictly JSON matching this structure:
{
  "valid": true,
  "score": 85,
  "reason": "Clear thematic connection",
  "counterWord": "NextWord",
  "banter": "Your distinct character reaction here"
}`;

    let parsed = null;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const sdkCall = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SDK referee timeout (3500ms)')), 3500)
      );
      const response = await Promise.race([sdkCall, timeout]);
      const text = response?.text || '{}';
      parsed = JSON.parse(text);
    } catch (sdkErr) {
      // Fallback: try REST call with 3500ms timeout
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
        signal: AbortSignal.timeout(3500),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.text();
        throw new Error(`Gemini API error ${apiRes.status}: ${errBody}`);
      }

      const data = await apiRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      parsed = JSON.parse(text);
    }

    return NextResponse.json({
      valid: Boolean(parsed?.valid),
      score: parsed?.score || 50,
      reason: parsed?.reason || '',
      counterWord: parsed?.counterWord ? parsed.counterWord.trim() : 'Pulse',
      banter: parsed?.banter || 'Your turn!',
      captain: captainId,
      mode: 'gemini_live',
    });
  } catch (err) {
    console.error('Word-chain API error, falling back to offline mode:', err);
    // Graceful offline fallback with the actual user input! Never crash the game.
    const fallback = offlineEvaluate(cleanCurrent, cleanPlayer, hist, captainId);
    return NextResponse.json({
      ...fallback,
      captain: captainId,
      mode: 'offline_fallback',
      detail: err.message,
    });
  }
}
