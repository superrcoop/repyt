import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Offline fallback dictionary for instant testing without API key
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
};

function offlineEvaluate(currentWord, playerWord, history) {
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

  // Pick counter word
  let candidateWords = OFFLINE_ASSOCIATIONS[normPlayer] || [
    'energy', 'spark', 'horizon', 'pulse', 'echo', 'shadow', 'motion', 'nexus', 'wonder', 'velocity'
  ];
  candidateWords = candidateWords.filter(
    (w) => !history.map((h) => h.toLowerCase()).includes(w) && w !== normPlayer && w !== normCurrent
  );

  const counterWord = candidateWords.length > 0
    ? candidateWords[Math.floor(Math.random() * candidateWords.length)]
    : 'Echo';

  const score = isDirectKnown ? Math.floor(Math.random() * 15 + 85) : Math.floor(Math.random() * 25 + 65);

  return {
    valid: true,
    score,
    reason: isDirectKnown ? `Strong connection between ${currentWord} and ${playerWord}.` : `Creative associative leap!`,
    counterWord,
    banter: isDirectKnown ? 'Classic connection, nicely played!' : 'Bold link! Back to you:',
  };
}

export async function POST(req) {
  try {
    const { currentWord, playerWord, history = [], theme = 'general' } = await req.json();

    if (!currentWord || !playerWord) {
      return NextResponse.json({ error: 'Missing currentWord or playerWord' }, { status: 400 });
    }

    const cleanPlayerWord = playerWord.trim();
    const cleanCurrentWord = currentWord.trim();

    // Check repeat in history
    const normalizedHistory = history.map((w) => w.toLowerCase().trim());
    if (normalizedHistory.includes(cleanPlayerWord.toLowerCase())) {
      return NextResponse.json({
        valid: false,
        score: 0,
        reason: `"${cleanPlayerWord}" was already used in this rally!`,
        counterWord: null,
        banter: 'No repeats allowed in the same chain! Keep it fresh.',
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Use offline fallback
      const offlineResult = offlineEvaluate(cleanCurrentWord, cleanPlayerWord, history);
      return NextResponse.json({
        ...offlineResult,
        mode: 'offline_heuristic',
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are the lively referee and opponent in "Repyt", a high-speed word tennis / word association game.
The current active word is: "${cleanCurrentWord}".
The player answered: "${cleanPlayerWord}".
History of words already used in this rally: [${history.join(', ')}].
Theme: ${theme}.

Tasks:
1. Is "${cleanPlayerWord}" a legitimate English word AND a creative/sensible semantic, cultural, or thematic association with "${cleanCurrentWord}"?
   - Be generous with creative or clever leaps, metaphors, and pop culture idioms.
   - Reject non-words, keyboard smashes, completely random unlinked words, or exact repetitions.
2. If valid, score the connection strength from 1 to 100.
3. Provide a witty 1-sentence reaction / banter (under 15 words).
4. If valid, supply YOUR counter-word to rally back to the player.
   - Counter-word MUST be an association with "${cleanPlayerWord}".
   - Counter-word MUST NOT be in the history list: [${history.join(', ')}].
   - Counter-word MUST be a single clean word (no spaces/hyphens).

Return strictly JSON matching this structure:
{
  "valid": true,
  "score": 85,
  "reason": "Clear thematic connection",
  "counterWord": "NextWord",
  "banter": "Sharp return! Let's see you handle this:"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
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
    console.error('Word-chain API error:', err);
    // Graceful fallback to offline heuristic on any network/API glitch
    const fallback = offlineEvaluate('word', 'idea', []);
    return NextResponse.json(fallback);
  }
}
