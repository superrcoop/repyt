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

export async function GET() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const target = getDailyTarget(dateStr);
  const details = getTargetDetails(target);

  return NextResponse.json({
    category: details.category,
    realm: details.realm,
    hint: details.hint,
    suggestions: details.suggestions,
  });
}

export async function POST(req) {
  let cleanGuess = '';
  const dateStr = new Date().toISOString().slice(0, 10);
  const target = getDailyTarget(dateStr);
  const details = getTargetDetails(target);

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
        details,
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
        hint: rank <= 300 ? 'You are burning hot in meaning!' : 'Keep searching different categories.',
        mode: 'offline_heuristic',
        details,
      });
    }

    const prompt = `You are the referee and judge for Repyt, an AI semantic proximity concept voyage (like Contexto).
Target Secret Word: "${target}"
Player Guess: "${cleanGuess}"

Determine the semantic similarity and distance between the target and the guess in human conceptual space.
Rank scale:
- 1: The exact word (not applicable here)
- 2 to 300: Extremely close / direct synonym, identical category, or primary attribute (Burning Hot)
- 301 to 1500: Closely related concept / same domain (Warm Shallows)
- 1501 to 4000: Distantly related / loose association (Cool)
- 4001 to 10000: Completely unrelated / opposite / abstract mismatch (Freezing Waters)

Return strictly valid JSON:
{
  "rank": 240,
  "hint": "Very close! Think about where this object operates on the voyage."
}`;

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
      const errBody = await apiRes.text();
      throw new Error(`Gemini API error ${apiRes.status}: ${errBody}`);
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
      details,
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
      hint: rank <= 300 ? 'You are burning hot in meaning!' : 'Keep searching different categories.',
      mode: 'offline_fallback',
      detail: err.message,
      details,
    });
  }
}
