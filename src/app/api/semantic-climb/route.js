import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 15;

// In-memory cache for word embeddings: text -> float[]
const embeddingCache = new Map();

// 30 Curated rotating daily words
const DAILY_TARGETS = [
  'Lighthouse', 'Volcano', 'Submarine', 'Satellite', 'Compass',
  'Telescope', 'Oasis', 'Glacier', 'Cathedral', 'Harmonica',
  'Carnival', 'Chameleon', 'Archipelago', 'Avalanche', 'Meteor',
  'Orchestra', 'Pyramid', 'Espresso', 'Labyrinth', 'Constellation',
  'Jungle', 'Diamond', 'Bicycle', 'Waterfall', 'Castle',
  'Dragonfly', 'Sanctuary', 'Spaceship', 'Sunflower', 'Horizon'
];

const TARGET_DETAILS = {
  'Lighthouse': { category: 'Maritime & Coast', realm: 'Ocean Navigation', hint: 'A coastal tower sending beams across dark and foggy waters.', suggestions: ['Beacon', 'Tower', 'Ocean'] },
  'Volcano': { category: 'Geology & Earth', realm: 'Volcanic Landforms', hint: 'A summit that vents magma, ash, and fiery eruptions.', suggestions: ['Mountain', 'Lava', 'Fire'] },
  'Submarine': { category: 'Naval & Ocean', realm: 'Deep Sea Vessels', hint: 'A sealed vessel built to navigate and dive beneath the waves.', suggestions: ['Vessel', 'Depth', 'Sonar'] },
  'Satellite': { category: 'Astronomy & Orbit', realm: 'Orbital Tech', hint: 'A celestial orbiter beaming communications across Earth.', suggestions: ['Orbit', 'Space', 'Signal'] },
  'Compass': { category: 'Maritime & Navigation', realm: 'Direction Finding', hint: 'A magnetic needle that always seeks true north on uncharted seas.', suggestions: ['Needle', 'North', 'Map'] },
  'Telescope': { category: 'Astronomy & Optics', realm: 'Star Exploration', hint: 'Curved lenses that reveal distant stars, galaxies, and planets.', suggestions: ['Lens', 'Stars', 'Sky'] },
  'Oasis': { category: 'Geography & Desert', realm: 'Desert Sanctuaries', hint: 'A hidden haven of fresh water and palms amidst boundless sands.', suggestions: ['Desert', 'Water', 'Palm'] },
  'Glacier': { category: 'Cryosphere & Ice', realm: 'Frozen Landscapes', hint: 'A colossal river of ancient frozen ice carving through valleys.', suggestions: ['Ice', 'Frozen', 'Mountain'] },
  'Cathedral': { category: 'Architecture & Stone', realm: 'Historic Sanctuaries', hint: 'A grand monument of gothic arches, stone vaults, and spires.', suggestions: ['Spire', 'Temple', 'Stone'] },
  'Harmonica': { category: 'Music & Instruments', realm: 'Wind & Blues', hint: 'A pocket-sized reed instrument played by drawing breath.', suggestions: ['Music', 'Blues', 'Sound'] },
  'Carnival': { category: 'Culture & Festival', realm: 'Celebration & Joy', hint: 'A vibrant parade of music, masquerades, and dazzling lights.', suggestions: ['Festival', 'Parade', 'Music'] },
  'Chameleon': { category: 'Fauna & Nature', realm: 'Reptilian Mastery', hint: 'A creature known for shifting colors to blend into foliage.', suggestions: ['Lizard', 'Color', 'Nature'] },
  'Archipelago': { category: 'Geography & Islands', realm: 'Island Chains', hint: 'A scattered cluster of islands rising from the open sea.', suggestions: ['Island', 'Ocean', 'Coast'] },
  'Avalanche': { category: 'Alpine & Climate', realm: 'Mountain Cascades', hint: 'A sudden, thundering slide of snow down a mountain precipice.', suggestions: ['Snow', 'Mountain', 'Winter'] },
  'Meteor': { category: 'Cosmos & Space', realm: 'Shooting Stars', hint: 'A streak of brilliant light flashing through the upper atmosphere.', suggestions: ['Space', 'Star', 'Rock'] },
  'Orchestra': { category: 'Music & Ensemble', realm: 'Classical Harmony', hint: 'A grand assembly of strings, brass, and percussion led by a baton.', suggestions: ['Symphony', 'Violin', 'Conductor'] },
  'Pyramid': { category: 'Antiquity & Wonders', realm: 'Ancient Monuments', hint: 'A triangular monument of ancient sandstone built under desert suns.', suggestions: ['Monument', 'Desert', 'Ancient'] },
  'Espresso': { category: 'Culinary & Brews', realm: 'Rich Roast', hint: 'A concentrated shot of roasted beans brewed under intense steam.', suggestions: ['Coffee', 'Roast', 'Morning'] },
  'Labyrinth': { category: 'Myth & Architecture', realm: 'Enigmatic Paths', hint: 'An intricate maze of winding stone corridors designed to confound.', suggestions: ['Maze', 'Puzzle', 'Corridor'] },
  'Constellation': { category: 'Astronomy & Myth', realm: 'Starlit Patterns', hint: 'A celestial pattern of stars traced across the night sky.', suggestions: ['Star', 'Sky', 'Zodiac'] },
  'Jungle': { category: 'Ecosystem & Wild', realm: 'Tropical Canopy', hint: 'A dense tropical forest teeming with canopy wildlife and rainfall.', suggestions: ['Forest', 'Wild', 'Tropical'] },
  'Diamond': { category: 'Minerals & Gems', realm: 'Precious Stones', hint: 'The hardest crystallized carbon forged under subterranean pressure.', suggestions: ['Crystal', 'Gem', 'Carbon'] },
  'Bicycle': { category: 'Transport & Motion', realm: 'Two-Wheeled Travel', hint: 'A two-wheeled vehicle propelled along roads by human pedals.', suggestions: ['Wheel', 'Pedal', 'Ride'] },
  'Waterfall': { category: 'Hydrology & Nature', realm: 'Cascading Waters', hint: 'A surging river cascading over a high rocky cliff into a pool.', suggestions: ['River', 'Cascade', 'Current'] },
  'Castle': { category: 'Medieval & Strongholds', realm: 'Historic Fortresses', hint: 'A fortified stone bastion with battlements, moats, and keeps.', suggestions: ['Fortress', 'Stone', 'Tower'] },
  'Dragonfly': { category: 'Fauna & Insects', realm: 'Winged Wonders', hint: 'A shimmering insect with four iridescent wings darting over ponds.', suggestions: ['Wing', 'Pond', 'Insect'] },
  'Sanctuary': { category: 'Safe Havens', realm: 'Refuge & Peace', hint: 'A protected place of refuge and serenity shielded from tempest.', suggestions: ['Refuge', 'Haven', 'Peace'] },
  'Spaceship': { category: 'Aeronautics & Sci-Fi', realm: 'Interstellar Travel', hint: 'A vessel engineered to break free of gravity and traverse the void.', suggestions: ['Rocket', 'Voyage', 'Galaxy'] },
  'Sunflower': { category: 'Flora & Sunlight', realm: 'Golden Blooms', hint: 'A tall golden blossom that turns its face to track the sun.', suggestions: ['Flower', 'Golden', 'Sun'] },
  'Horizon': { category: 'Perspective & Sea', realm: 'The Distant Verge', hint: 'The far line where ocean meets the sky at the limits of vision.', suggestions: ['Sky', 'Sea', 'Distance'] }
};

const NEAREST_NEIGHBORS = {
  'Lighthouse': [
    { word: 'Beacon', similarity: 94.8, rank: 2 },
    { word: 'Foghorn', similarity: 91.2, rank: 14 },
    { word: 'Watchtower', similarity: 88.5, rank: 35 },
    { word: 'Coastguard', similarity: 86.1, rank: 62 },
  ],
  'Volcano': [
    { word: 'Magma', similarity: 95.2, rank: 2 },
    { word: 'Eruption', similarity: 93.6, rank: 9 },
    { word: 'Crater', similarity: 89.4, rank: 28 },
    { word: 'Lava', similarity: 87.8, rank: 45 },
  ],
  'Compass': [
    { word: 'Sextant', similarity: 94.3, rank: 2 },
    { word: 'Bearing', similarity: 91.0, rank: 12 },
    { word: 'Heading', similarity: 88.6, rank: 38 },
    { word: 'Navigator', similarity: 86.4, rank: 59 },
  ],
  'Submarine': [
    { word: 'Periscope', similarity: 93.8, rank: 3 },
    { word: 'Torpedo', similarity: 90.5, rank: 18 },
    { word: 'Sonar', similarity: 88.1, rank: 41 },
    { word: 'Nautilus', similarity: 85.9, rank: 74 },
  ],
  'Telescope': [
    { word: 'Observatory', similarity: 94.5, rank: 2 },
    { word: 'Binoculars', similarity: 91.8, rank: 10 },
    { word: 'Stargazer', similarity: 88.4, rank: 36 },
    { word: 'Astrolabe', similarity: 85.7, rank: 68 },
  ],
  'Glacier': [
    { word: 'Iceberg', similarity: 94.2, rank: 2 },
    { word: 'Crevasse', similarity: 90.8, rank: 16 },
    { word: 'Permafrost', similarity: 87.9, rank: 42 },
    { word: 'Moraine', similarity: 85.3, rank: 75 },
  ],
  'Horizon': [
    { word: 'Skyline', similarity: 93.9, rank: 3 },
    { word: 'Verge', similarity: 89.7, rank: 24 },
    { word: 'Vista', similarity: 87.5, rank: 49 },
    { word: 'Expanse', similarity: 85.1, rank: 77 },
  ],
};

const QUICK_SELECT_SETS = {
  'Lighthouse': [
    { word: 'Beacon', similarity: 94.8, rank: 2 },
    { word: 'Foghorn', similarity: 91.2, rank: 14 },
    { word: 'Watchtower', similarity: 88.5, rank: 35 },
    { word: 'Coastguard', similarity: 86.1, rank: 62 },
    { word: 'Lantern', similarity: 82.4, rank: 110 },
    { word: 'Harbor', similarity: 73.1, rank: 280 },
    { word: 'Ocean', similarity: 65.8, rank: 450 },
    { word: 'Ship', similarity: 58.4, rank: 720 },
    { word: 'Island', similarity: 53.2, rank: 1200 },
    { word: 'Mountain', similarity: 22.1, rank: 5400 },
  ],
  'Volcano': [
    { word: 'Magma', similarity: 95.2, rank: 2 },
    { word: 'Eruption', similarity: 93.6, rank: 9 },
    { word: 'Crater', similarity: 89.4, rank: 28 },
    { word: 'Lava', similarity: 87.8, rank: 45 },
    { word: 'Basalt', similarity: 83.2, rank: 95 },
    { word: 'Geyser', similarity: 76.5, rank: 210 },
    { word: 'Mountain', similarity: 67.3, rank: 410 },
    { word: 'Smoke', similarity: 59.8, rank: 680 },
    { word: 'Fire', similarity: 54.1, rank: 1150 },
    { word: 'Glacier', similarity: 18.2, rank: 6200 },
  ],
  'Compass': [
    { word: 'Sextant', similarity: 94.3, rank: 2 },
    { word: 'Bearing', similarity: 91.0, rank: 12 },
    { word: 'Heading', similarity: 88.6, rank: 38 },
    { word: 'Navigator', similarity: 86.4, rank: 59 },
    { word: 'Needle', similarity: 81.7, rank: 125 },
    { word: 'Latitude', similarity: 74.2, rank: 260 },
    { word: 'Map', similarity: 66.5, rank: 440 },
    { word: 'North', similarity: 58.9, rank: 710 },
    { word: 'Horizon', similarity: 52.8, rank: 1220 },
    { word: 'Volcano', similarity: 19.4, rank: 5900 },
  ],
  'Submarine': [
    { word: 'Periscope', similarity: 93.8, rank: 3 },
    { word: 'Torpedo', similarity: 90.5, rank: 18 },
    { word: 'Sonar', similarity: 88.1, rank: 41 },
    { word: 'Nautilus', similarity: 85.9, rank: 74 },
    { word: 'Depth', similarity: 80.4, rank: 135 },
    { word: 'Propeller', similarity: 72.8, rank: 290 },
    { word: 'Vessel', similarity: 64.6, rank: 480 },
    { word: 'Ocean', similarity: 57.2, rank: 760 },
    { word: 'Trench', similarity: 51.5, rank: 1280 },
    { word: 'Desert', similarity: 17.8, rank: 6100 },
  ],
  'Telescope': [
    { word: 'Observatory', similarity: 94.5, rank: 2 },
    { word: 'Binoculars', similarity: 91.8, rank: 10 },
    { word: 'Stargazer', similarity: 88.4, rank: 36 },
    { word: 'Astrolabe', similarity: 85.7, rank: 68 },
    { word: 'Eyepiece', similarity: 81.2, rank: 140 },
    { word: 'Refractor', similarity: 73.5, rank: 275 },
    { word: 'Lens', similarity: 65.3, rank: 460 },
    { word: 'Stars', similarity: 58.0, rank: 740 },
    { word: 'Cosmos', similarity: 52.1, rank: 1250 },
    { word: 'Submarine', similarity: 18.9, rank: 5800 },
  ],
  'Glacier': [
    { word: 'Iceberg', similarity: 94.2, rank: 2 },
    { word: 'Crevasse', similarity: 90.8, rank: 16 },
    { word: 'Permafrost', similarity: 87.9, rank: 42 },
    { word: 'Moraine', similarity: 85.3, rank: 75 },
    { word: 'Fjord', similarity: 80.9, rank: 130 },
    { word: 'Icefield', similarity: 73.0, rank: 285 },
    { word: 'Ice', similarity: 66.2, rank: 430 },
    { word: 'Frozen', similarity: 58.7, rank: 700 },
    { word: 'Mountain', similarity: 52.4, rank: 1230 },
    { word: 'Volcano', similarity: 19.1, rank: 5950 },
  ],
  'Horizon': [
    { word: 'Skyline', similarity: 93.9, rank: 3 },
    { word: 'Verge', similarity: 89.7, rank: 24 },
    { word: 'Vista', similarity: 87.5, rank: 49 },
    { word: 'Expanse', similarity: 85.1, rank: 77 },
    { word: 'Sunset', similarity: 80.2, rank: 145 },
    { word: 'Mirage', similarity: 72.1, rank: 310 },
    { word: 'Distance', similarity: 64.9, rank: 470 },
    { word: 'Sea', similarity: 57.8, rank: 730 },
    { word: 'Coast', similarity: 51.9, rank: 1260 },
    { word: 'Labyrinth', similarity: 18.5, rank: 6050 },
  ],
};

export function getNearestNeighbors(target) {
  if (NEAREST_NEIGHBORS[target]) return NEAREST_NEIGHBORS[target];
  const details = getTargetDetails(target);
  const baseSims = [93.4, 89.8, 86.5, 83.2];
  const baseRanks = [4, 19, 48, 88];
  const suggestions = details.suggestions || ['Beacon', 'Coast', 'Navigation', 'Harbor'];
  return suggestions.map((word, idx) => ({
    word,
    similarity: baseSims[idx] || 82.0,
    rank: baseRanks[idx] || (idx + 1) * 20,
  }));
}

export function getQuickSelects(target) {
  if (QUICK_SELECT_SETS[target]) return QUICK_SELECT_SETS[target];
  const details = getTargetDetails(target);
  const nn = getNearestNeighbors(target);
  const baseSuggestions = details.suggestions || ['Ocean', 'Sky', 'Mountain', 'Coast', 'Sun', 'Island', 'Wind', 'River'];
  const pool = [...nn];
  const added = new Set(pool.map((p) => p.word.toLowerCase()));

  const fallbackRanks = [18, 55, 140, 320, 650, 1100, 2400, 4800];
  const fallbackSims = [91.5, 87.2, 81.0, 72.5, 62.1, 54.8, 41.2, 24.5];

  baseSuggestions.forEach((w, idx) => {
    if (!added.has(w.toLowerCase())) {
      pool.push({
        word: w,
        rank: fallbackRanks[idx % fallbackRanks.length] || 500,
        similarity: fallbackSims[idx % fallbackSims.length] || 60.0,
      });
      added.add(w.toLowerCase());
    }
  });

  return pool.slice(0, 10);
}

function getDailyTarget(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DAILY_TARGETS.length;
  return DAILY_TARGETS[index];
}

function getTargetDetails(target) {
  return TARGET_DETAILS[target] || {
    category: 'Exploration & Nature',
    realm: 'The Unknown',
    hint: 'A fundamental concept tied to voyages and nature.',
    suggestions: ['Ocean', 'Sky', 'Compass']
  };
}

function getTemperature(rank) {
  if (rank === 1) return { label: 'Solved', color: 'emerald', icon: '' };
  if (rank <= 300) return { label: 'Burning Hot', color: 'rose', icon: '' };
  if (rank <= 1500) return { label: 'Warm', color: 'amber', icon: '' };
  if (rank <= 4000) return { label: 'Cool', color: 'sky', icon: '' };
  return { label: 'Freezing', color: 'slate', icon: '' };
}

function isValidGeminiKey(key) {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim().replace(/^['"]|['"]$/g, '');
  return (clean.startsWith('AIzaSy') || clean.startsWith('AQ.')) && clean.length >= 30;
}

// Vector math: Cosine similarity between two float arrays
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Maps continuous cosine similarity [-1, 1] to a calibrated rank curve (#1 to #9999)
function similarityToRank(sim) {
  const s = Math.max(0, Math.min(sim, 1.0));
  if (s >= 0.999) return 1;

  // Burning Hot: 0.72 <= s < 0.999 -> ranks 2..300
  if (s >= 0.72) {
    const ratio = (0.999 - s) / (0.999 - 0.72);
    return Math.round(2 + ratio * 298);
  }

  // Warm Shallows: 0.52 <= s < 0.72 -> ranks 301..1500
  if (s >= 0.52) {
    const ratio = (0.72 - s) / (0.72 - 0.52);
    return Math.round(301 + ratio * 1199);
  }

  // Cool: 0.32 <= s < 0.52 -> ranks 1501..4000
  if (s >= 0.32) {
    const ratio = (0.52 - s) / (0.52 - 0.32);
    return Math.round(1501 + ratio * 2499);
  }

  // Freezing Waters: s < 0.32 -> ranks 4001..9999
  const ratio = Math.min(1, (0.32 - s) / 0.32);
  return Math.round(4001 + ratio * 5998);
}

function getVectorCompassBearing(rank, sim) {
  if (rank === 1) return 'Exact Target Identified!';
  if (rank <= 300) return 'Direct Heading: Core Attribute / Direct Synonym';
  if (rank <= 1500) return 'On Course: Shared Domain & Conceptual Field';
  if (rank <= 4000) return 'Drifting: Loose / Tangential Association';
  return 'Opposite Heading: Unrelated Semantic Domain';
}

// Fetch or retrieve cached embedding from Google GenAI with strict timeouts
async function fetchEmbedding(word, apiKey) {
  const normalized = word.toLowerCase().trim();
  if (embeddingCache.has(normalized)) {
    return embeddingCache.get(normalized);
  }

  // 1. Fast direct REST call with 3000ms timeout
  try {
    const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const res = await fetch(restUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text: normalized }] },
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      const values = data?.embedding?.values;
      if (Array.isArray(values) && values.length > 0) {
        embeddingCache.set(normalized, values);
        return values;
      }
    }
  } catch (restErr) {
    // REST call timed out or failed
  }

  // 2. Try SDK with 3000ms timeout
  try {
    const ai = new GoogleGenAI({ apiKey });
    const sdkCall = ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: normalized,
    });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SDK embedding timeout (3000ms)')), 3000)
    );
    const response = await Promise.race([sdkCall, timeout]);

    const values = response?.embedding?.values || response?.embeddings?.[0]?.values;
    if (Array.isArray(values) && values.length > 0) {
      embeddingCache.set(normalized, values);
      return values;
    }
  } catch (sdkErr) {
    // SDK failed or timed out
  }

  throw new Error(`Embedding unavailable for "${word}"`);
}

function offlineEstimateRank(guess, target) {
  const g = guess.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (g === t) {
    return { rank: 1, similarity: 1.0 };
  }

  let sim = 0.15;
  if (g.length === t.length) sim += 0.08;
  if (g[0] === t[0]) sim += 0.12;

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
      sim = 0.78 + Math.random() * 0.15;
      break;
    }
  }

  const rank = similarityToRank(sim);
  return { rank, similarity: Math.max(0.05, Math.min(sim, 0.98)) };
}

export async function GET() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const target = getDailyTarget(dateStr);
  const details = getTargetDetails(target);
  const nearestNeighbors = getNearestNeighbors(target);
  const quickSelects = getQuickSelects(target);

  return NextResponse.json({
    category: details.category,
    realm: details.realm,
    hint: details.hint,
    suggestions: details.suggestions,
    nearestNeighbors,
    quickSelects,
  });
}

export async function POST(req) {
  let cleanGuess = '';
  const dateStr = new Date().toISOString().slice(0, 10);
  const target = getDailyTarget(dateStr);
  const details = getTargetDetails(target);
  const nearestNeighbors = getNearestNeighbors(target);
  const quickSelects = getQuickSelects(target);
  const extendedDetails = { ...details, targetWord: target, nearestNeighbors, quickSelects };

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
        similarity: 100,
        bearing: getVectorCompassBearing(1, 1.0),
        solved: true,
        temperature: temp.label,
        color: temp.color,
        icon: temp.icon,
        hint: `Bingo! The daily target was ${target}!`,
        targetWord: target,
        nearestNeighbors,
        details: extendedDetails,
      });
    }

    // Instant precomputed match for quick selects and nearest neighbors
    const precomputed = [...quickSelects, ...nearestNeighbors].find(
      (item) => item.word.toLowerCase() === cleanGuess.toLowerCase()
    );
    if (precomputed) {
      const temp = getTemperature(precomputed.rank);
      const sim = precomputed.similarity;
      const rank = precomputed.rank;
      return NextResponse.json({
        guess: cleanGuess,
        rank,
        similarity: sim,
        bearing: getVectorCompassBearing(rank, sim / 100),
        solved: false,
        temperature: temp.label,
        color: temp.color,
        icon: temp.icon,
        hint: rank <= 300
          ? 'Burning hot! You are circling the exact conceptual core.'
          : rank <= 1500
          ? 'Warm shallows! You are in the right domain—hone in on specific function or form.'
          : rank <= 4000
          ? 'Cool breeze. The concept shares a loose connection, but try shifting perspective.'
          : 'Freezing waters. This concept is in an entirely different corner of the map.',
        mode: 'precomputed_instant',
        details: extendedDetails,
      });
    }

    const rawKey = process.env.GEMINI_API_KEY;
    const apiKey = rawKey ? rawKey.trim().replace(/^['"]|['"]$/g, '') : '';

    if (!isValidGeminiKey(apiKey)) {
      const offline = offlineEstimateRank(cleanGuess, target);
      const temp = getTemperature(offline.rank);
      return NextResponse.json({
        guess: cleanGuess,
        rank: offline.rank,
        similarity: Math.round(offline.similarity * 1000) / 10,
        bearing: getVectorCompassBearing(offline.rank, offline.similarity),
        solved: false,
        temperature: temp.label,
        color: temp.color,
        icon: temp.icon,
        hint: offline.rank <= 300 ? 'You are burning hot in meaning!' : 'Keep searching different categories.',
        mode: 'offline_heuristic',
        details: extendedDetails,
      });
    }

    // Step 1: True Vector Embeddings & Cosine Similarity (max 4500ms ceiling)
    const vectorPromise = Promise.all([
      fetchEmbedding(target, apiKey),
      fetchEmbedding(cleanGuess, apiKey)
    ]);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Vector calculation timeout (4500ms)')), 4500)
    );

    const [targetVec, guessVec] = await Promise.race([vectorPromise, timeoutPromise]);

    const sim = cosineSimilarity(targetVec, guessVec);
    const rank = similarityToRank(sim);
    const temp = getTemperature(rank);
    const simPercent = Math.round(sim * 1000) / 10;
    const bearing = getVectorCompassBearing(rank, sim);

    // Step 2: Contextual hint based on vector distance
    let hint = '';
    if (rank <= 300) {
      hint = 'Burning hot! You are circling the exact conceptual core.';
    } else if (rank <= 1500) {
      hint = 'Warm shallows! You are in the right domain—hone in on specific function or form.';
    } else if (rank <= 4000) {
      hint = 'Cool breeze. The concept shares a loose connection, but try shifting perspective.';
    } else {
      hint = 'Freezing waters. This concept is in an entirely different corner of the map.';
    }

    return NextResponse.json({
      guess: cleanGuess,
      rank,
      similarity: simPercent,
      bearing,
      solved: false,
      temperature: temp.label,
      color: temp.color,
      icon: temp.icon,
      hint,
      mode: 'vector_gemini',
      details: extendedDetails,
    });
  } catch (err) {
    console.error('Semantic-climb API vector error, falling back to offline mode:', err);
    const offline = offlineEstimateRank(cleanGuess || 'word', target);
    const temp = getTemperature(offline.rank);
    return NextResponse.json({
      guess: cleanGuess || 'guess',
      rank: offline.rank,
      similarity: Math.round(offline.similarity * 1000) / 10,
      bearing: getVectorCompassBearing(offline.rank, offline.similarity),
      solved: false,
      temperature: temp.label,
      color: temp.color,
      icon: temp.icon,
      hint: offline.rank <= 300 ? 'You are burning hot in meaning!' : 'Keep searching different categories.',
      mode: 'offline_fallback',
      detail: err.message,
      details: extendedDetails,
    });
  }
}
