'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

function triggerConfetti(opts) {
  if (typeof window !== 'undefined') {
    import('canvas-confetti').then((m) => {
      const conf = m.default || m;
      if (typeof conf === 'function') conf(opts);
    });
  }
}
import { sound } from '../lib/audio';
import {
  getPlayerStats,
  recordChainGame,
  recordSpeechPractice,
  getPirateRank,
  getPreferences,
  savePreferences,
  getDailyQuests,
  updateQuestProgress,
  claimQuestReward,
  getClientProximityCache,
  setClientProximityCache,
} from '../lib/storage';

// Transparent PNG assets
const P = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_';
const SHIP_IMG = P + '20261031_024714_39df675e-5060-4528-87dc-9d0c274815aa.png&w=1600&q=90';
const CAPT_IMG = P + '20261031_024703_a0298b6a-0117-47f1-8462-4be671d0407e.png&w=2048&q=90';
const PLANTS_IMG = P + '20261031_024704_3ccf1ac2-bec7-4fdb-bfce-ac19eca8db28.png&w=2048&q=90';

// Sprite cropping boxes on 2048x1360 sheets: [img, x, y, w, h]
const BOX = {
  capt:  [CAPT_IMG, 34, 153, 1246, 1074],
  chest: [CAPT_IMG, 1475, 830, 446, 392],
  palm:  [PLANTS_IMG, 19, 32, 910, 1284],
  bushL: [PLANTS_IMG, 515, 820, 860, 496],
  bushR: [PLANTS_IMG, 1528, 908, 499, 405]
};

// Optimized layout coordinates: portrait layout is compact and elevated for mobile-first scrolling
const LAY = {
  land: {
    w: 1600, h: 900,
    wave: { y0: 748, y1: 272, gap0: 1, gap1: 0.6 },
    ship: { x0: 1130, w0: 710, x1: 780, w1: 170 }, // Positioned in open sea channel between island and vault game container!
    palm: { x: -92, y: -112, w: 620 },
    capt: { x: 80, y: 318, w: 480 },
    chest: { x: 560, y: 620, w: 180 },
    bushL: { x: 60, y: 700, w: 720 },
    bushR: { x: 1370, y: 740, w: 300 }
  },
  port: {
    w: 800, h: 1500,
    wave: { y0: 1300, y1: 330, gap0: 1, gap1: 0.6 },
    ship: { x0: 420, w0: 620, x1: 620, w1: 140 }, // visible in open sea horizon on the right
    palm: { x: -130, y: -70, w: 460 },
    capt: { x: 30, y: 187, w: 340 }, // grounded at y = 480px
    chest: { x: 390, y: 348, w: 150 }, // grounded at y = 480px
    bushL: { x: -40, y: 430, w: 560 }, // foliage base grounds both Captain and Chest!
    bushR: { x: 570, y: 1340, w: 260 }
  }
};

const BACK_WAVES = [
  { dy: -100, a: 20, k: 1.5, v: 0.9, ph: 0, fill: 'var(--band)' },
  { dy: -52, a: 23, k: 1.9, v: 1.15, ph: 1.7, fill: 'var(--paper)' }
];

const FRONT_WAVES = [
  { dy: 0, a: 25, k: 1.7, v: 1.3, ph: 3.1, fill: 'var(--band2)' },
  { dy: 26, a: 18, k: 2.4, v: 1, ph: 4.4, span: [0.06, 0.44] },
  { dy: 48, a: 22, k: 1.45, v: 1.4, ph: 0.6, fill: 'var(--paper)' },
  { dy: 76, a: 15, k: 2.1, v: 1.2, ph: 5.1, span: [0.52, 0.97] },
  { dy: 104, a: 24, k: 1.8, v: 1.25, ph: 2.2, fill: 'var(--paper)' },
  { dy: 130, a: 14, k: 2.7, v: 1, ph: 1.1, span: [0.0, 0.62] },
  { dy: 158, a: 20, k: 1.6, v: 1.1, ph: 3.8 }
];

const MAX_LEAGUES = 5;

// Math helpers
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const mix = (a, b, k) => a + (b - a) * k;
const seg = (p, a, b) => clamp((p - a) / (b - a));
const io = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const out = (k) => 1 - Math.pow(1 - k, 3);
const back = (k) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);

function yAt(l, x, t, p, L) {
  const W = L.wave;
  const base = mix(W.y0, W.y1, p) + l.dy * mix(W.gap0, W.gap1, p);
  const a = l.a * mix(1, 0.72, p);
  const f = (2 * Math.PI / 1100) * l.k * (1 - 0.35 * p);
  return base + a * Math.sin(f * x + t * l.v + l.ph) + a * 0.45 * Math.sin(f * 2.3 * x - t * l.v * 0.7 + l.ph * 1.7);
}

function canFormWord(word, rackLetters) {
  if (!word || word.length < 3) return false;
  const counts = {};
  for (const l of rackLetters) {
    const ch = l.toUpperCase();
    counts[ch] = (counts[ch] || 0) + 1;
  }
  for (const ch of word.toUpperCase()) {
    if (!counts[ch]) return false;
    counts[ch]--;
  }
  return true;
}

function shuffleLetters(letters) {
  const arr = [...letters];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Prevent letters from spelling out original sequence
  if (arr.join('') === letters.join('') && arr.length > 2) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}

function createShuffledRack(rackLetters) {
  const shuffled = shuffleLetters(rackLetters);
  return shuffled.map((letter, idx) => ({ id: idx, letter, used: false }));
}

const FORGE_POOLS = [
  {
    theme: 'Pirates',
    rack: ['T', 'S', 'P', 'R', 'A', 'I', 'E'],
    valid: [
      'PIRATE', 'PIRATES', 'PIER', 'PIERS', 'RIPE', 'RIPES', 'TRAP', 'TRAPS',
      'TRIP', 'TRIPS', 'TEAR', 'TEARS', 'PART', 'PARTS', 'SPIT', 'STEP', 'STAR', 'STARE',
      'SPARE', 'PAST', 'PASTE', 'TAPE', 'TAPES', 'RATE', 'RATES', 'SEAT', 'EAST', 'REST',
      'PEST', 'PIE', 'PIES', 'PIT', 'PITS', 'TIP', 'TIPS', 'SIP', 'SIT', 'AIR', 'AIRS',
      'ART', 'ARTS', 'TAR', 'TARS', 'EAR', 'EARS', 'EAT', 'EATS', 'TEA', 'TEAS', 'SEA',
      'SET', 'PET', 'PETS', 'RAP', 'RAPS', 'RIP', 'RIPS', 'SAP', 'APE', 'APES', 'APT',
      'PAT', 'PATS', 'TAP', 'TAPS', 'SPAT', 'STIR', 'STRIP', 'TRIPE', 'TRIPES', 'PRAISE'
    ],
  },
  {
    theme: 'Compass',
    rack: ['S', 'M', 'P', 'C', 'A', 'S', 'O'],
    valid: [
      'COMPASS', 'CAMPS', 'SCAMP', 'MASS', 'PASS', 'SOAP', 'CAMP', 'MAPS', 'MOSS', 'SPAM',
      'COMA', 'SOPS', 'SPAS', 'MACS', 'SCAM', 'SOMA', 'MAP', 'CAP', 'CAPS', 'COP', 'COPS',
      'MOP', 'MOPS', 'SAP', 'SAPS', 'SOP', 'SPA', 'AMP', 'AMPS', 'CAM', 'CAMS'
    ],
  },
  {
    theme: 'Galleon',
    rack: ['L', 'G', 'E', 'A', 'O', 'N', 'L'],
    valid: [
      'GALLEON', 'ANGEL', 'GLEAN', 'LANE', 'LOAN', 'GOAL', 'GALL', 'LONE', 'LEAN',
      'ALONE', 'ALL', 'ALE', 'LOG', 'LEG', 'LAG', 'ONE', 'EON', 'AGE', 'AGO',
      'GALE', 'GAOL', 'NOEL', 'GLEN', 'ALOE'
    ],
  },
  {
    theme: 'Tempest',
    rack: ['P', 'E', 'T', 'M', 'S', 'T', 'E'],
    valid: [
      'TEMPEST', 'MEETS', 'STEEP', 'TEEMS', 'STEM', 'STEP', 'PETS', 'PEST', 'MEET', 'TEST',
      'TEEM', 'SEEP', 'SEEM', 'TEES', 'PET', 'SET', 'SEE', 'MET', 'TEE'
    ],
  },
  {
    theme: 'Captain',
    rack: ['N', 'A', 'P', 'C', 'T', 'I', 'A'],
    valid: [
      'CAPTAIN', 'CATNIP', 'PANIC', 'ANTIC', 'PAIN', 'PINT', 'PACT', 'ANTI', 'PITA', 'PANT',
      'CAN', 'CAT', 'CAP', 'PIN', 'PAN', 'TIN', 'TIP', 'TAP', 'PIT', 'PAT', 'ACT', 'ANT', 'NIP', 'TAN'
    ],
  },
  {
    theme: 'Anchor',
    rack: ['R', 'C', 'S', 'A', 'H', 'O', 'N'],
    valid: [
      'ANCHOR', 'ANCHORS', 'RANCH', 'ACORN', 'ROACH', 'SHORN', 'CRASH', 'ARCH', 'ROAN', 'HORN',
      'HORNS', 'CASH', 'SCAN', 'SOAR', 'CAR', 'CARS', 'OAR', 'OARS', 'ARC', 'ARCS', 'CAN',
      'CANS', 'RAN', 'ASH', 'SON', 'NOR', 'HAS'
    ],
  },
  {
    theme: 'Voyages',
    rack: ['G', 'E', 'Y', 'A', 'V', 'S', 'O'],
    valid: [
      'VOYAGE', 'VOYAGES', 'SAGE', 'SAVE', 'GAVE', 'GOES', 'EASY', 'SOYA', 'AGE', 'AGES', 'YES', 'SAY', 'GAS', 'SEA', 'SOY', 'AGO'
    ],
  },
  {
    theme: 'Corsair',
    rack: ['R', 'I', 'A', 'S', 'R', 'O', 'C'],
    valid: [
      'CORSAIR', 'SCAR', 'ROAR', 'SOAR', 'COIR', 'OARS', 'CARS', 'ARCS', 'AIRS', 'AIR', 'CAR', 'OAR', 'ARC', 'SIR', 'SIC'
    ],
  },
  {
    theme: 'Islands',
    rack: ['D', 'S', 'N', 'A', 'L', 'I', 'S'],
    valid: [
      'ISLAND', 'ISLANDS', 'SAIL', 'SAILS', 'LAND', 'LANDS', 'SAND', 'SANDS', 'SLID', 'LADS', 'NAIL', 'NAILS', 'AID', 'AIDS', 'AND', 'LAD', 'SIN', 'SINS'
    ],
  },
  {
    theme: 'Harbors',
    rack: ['B', 'O', 'R', 'H', 'A', 'S', 'R'],
    valid: [
      'HARBOR', 'HARBORS', 'ROAR', 'ROARS', 'BOAR', 'BOARS', 'SOAR', 'BARS', 'RASH', 'BAR', 'OAR', 'OARS', 'ASH', 'SOB'
    ],
  },
  {
    theme: 'Sailors',
    rack: ['O', 'S', 'L', 'I', 'A', 'S', 'R'],
    valid: [
      'SAILOR', 'SAILORS', 'SAIL', 'SAILS', 'SOLAR', 'SOAR', 'SOIL', 'SOILS', 'OARS', 'LASS', 'AIRS', 'SIR', 'SIRS', 'OIL', 'OILS', 'AIR', 'OAR'
    ],
  },
  {
    theme: 'Mariner',
    rack: ['N', 'E', 'R', 'R', 'A', 'M', 'I'],
    valid: [
      'MARINER', 'MARINE', 'MINER', 'REARM', 'MAIN', 'MINE', 'RAIN', 'REIN', 'RARE', 'RAM', 'MAN', 'MEN', 'RIM', 'RIME', 'EAR', 'ERA', 'AIR'
    ],
  },
  {
    theme: 'Krakens',
    rack: ['N', 'A', 'E', 'K', 'S', 'K', 'R'],
    valid: [
      'KRAKEN', 'KRAKENS', 'SNAKE', 'SNARE', 'RANK', 'RANKS', 'EARN', 'EARNS', 'NEAR', 'RAKE', 'RAKES', 'ARK', 'ARKS', 'SEA', 'ERA', 'ASK'
    ],
  },
  {
    theme: 'Beacons',
    rack: ['C', 'O', 'S', 'B', 'A', 'E', 'N'],
    valid: [
      'BEACON', 'BEACONS', 'BACON', 'BACONS', 'BANE', 'BEANS', 'BEAN', 'CANES', 'CANE', 'CONE', 'CONES', 'BONE', 'BONES', 'BASE', 'NOSE', 'ONE', 'ONES', 'CAN', 'CAB', 'BAN', 'SEA', 'SON'
    ],
  },
  {
    theme: 'Lagoons',
    rack: ['O', 'S', 'G', 'A', 'N', 'L', 'O'],
    valid: [
      'LAGOON', 'LAGOONS', 'LOAN', 'LOANS', 'LOGO', 'LOGOS', 'GOAL', 'GOALS', 'SOLO', 'SONG', 'LOG', 'LOGS', 'SAG', 'SOON', 'GAS', 'NAG'
    ],
  },
];

export default function RepytGame() {
  // Navigation & Scene state
  const [sceneIndex, setSceneIndex] = useState(0); // 0 = Sea (Hero), 1 = Island (Vault)
  const [soundMuted, setSoundMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechFeedback, setSpeechFeedback] = useState('');
  const [stats, setStats] = useState({
    highScore: 0,
    bestStreak: 0,
    gamesPlayed: 0,
    totalWordsRallied: 0,
    doubloons: 0,
    speechPracticed: 0,
  });

  // Daily Concept Clue & Starter Suggestions
  const [dailyClue, setDailyClue] = useState({
    category: 'Maritime & Navigation',
    realm: 'Ocean Voyages',
    hint: 'A coastal beacon guiding vessels through tempest and dark waters.',
    suggestions: ['Beacon', 'Tower', 'Ocean']
  });

  // Buried Treasure (Scene 1) Game State
  const [climbGuesses, setClimbGuesses] = useState([]);
  const [climbInput, setClimbInput] = useState('');
  const [climbEvaluating, setClimbEvaluating] = useState(false);
  const [climbSolved, setClimbSolved] = useState(false);
  const [incorrectGuesses, setIncorrectGuesses] = useState(0);
  const [captainBanter, setCaptainBanter] = useState(
    'Ahoy! Test any word to gauge your bearing to the Repyt Vault.'
  );

  // Keep a mutable ref of incorrectGuesses for the 60fps render loop
  const incorrectRef = useRef(0);
  useEffect(() => {
    incorrectRef.current = incorrectGuesses;
  }, [incorrectGuesses]);

  // Active Game Mode: 'vault' | 'forge'
  const [activeTab, setActiveTab] = useState('vault');

  // Word Forge (Letter Joining) Game State - normal mode default
  const [forgePoolIndex, setForgePoolIndex] = useState(0);
  const [forgeRack, setForgeRack] = useState(() =>
    FORGE_POOLS[0].rack.map((letter, idx) => ({ id: idx, letter, used: false }))
  );
  const [forgeAssembled, setForgeAssembled] = useState([]);
  const [forgeActive, setForgeActive] = useState(false);
  const [forgeTimer, setForgeTimer] = useState(60);
  const [forgeStreak, setForgeStreak] = useState(0);
  const [forgeScore, setForgeScore] = useState(0);
  const [forgeWords, setForgeWords] = useState([]);
  const [forgeBanter, setForgeBanter] = useState(
    'Tap letter tiles from your rack or type to forge words. 3+ letters!'
  );
  const [forgeResult, setForgeResult] = useState(null);
  const forgeGameOverDialogRef = useRef(null);

  // Daily Quests
  const [dailyQuests, setDailyQuests] = useState([]);
  const [shareToast, setShareToast] = useState('');

  // Preferences State
  const [quickSelectsEnabled, setQuickSelectsEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speechAudioEnabled, setSpeechAudioEnabled] = useState(true);

  // Dialog refs
  const rulesDialogRef = useRef(null);
  const statsDialogRef = useRef(null);
  const settingsDialogRef = useRef(null);
  const strandedDialogRef = useRef(null);
  const victoryDialogRef = useRef(null);
  const climbInputRef = useRef(null);

  // Canvas & Scene DOM refs
  const frameRef = useRef(null);
  const sceneRef = useRef(null);
  const shadeCanvasRef = useRef(null);
  const wBackRef = useRef(null);
  const wFrontRef = useRef(null);
  const shipRef = useRef(null);
  const cloudRef = useRef(null);
  const t1Ref = useRef(null);
  const logoRef = useRef(null);
  const palmRef = useRef(null);
  const captRef = useRef(null);
  const chestRef = useRef(null);
  const bushLRef = useRef(null);
  const bushRRef = useRef(null);
  const h2Ref = useRef(null);
  const p2Ref = useRef(null);
  const t2Ref = useRef(null);
  const feedRef = useRef(null);

  // Transition engine refs
  const transitionRef = useRef({
    p: 0,
    pFrom: 0,
    pTo: 0,
    pT0: 0,
    duration: 2100,
    lockedUntil: 0,
  });

  // Speech Recognition ref
  const recognitionRef = useRef(null);

  // Scroll answers feed to show closest bearing when guesses update
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [climbGuesses]);

  // 1. Initial Setup: Audio, Stats, Speech Recognition & Daily Clue Fetch
  useEffect(() => {
    const prefs = getPreferences();
    setSoundMuted(!prefs.sound);
    sound.setMuted(!prefs.sound);
    setQuickSelectsEnabled(prefs.quickSelects !== false);
    setVoiceEnabled(prefs.voiceEnabled !== false);
    setSpeechAudioEnabled(prefs.speechAudio !== false);
    setStats(getPlayerStats());

    // Load Daily Logbook Quests
    setDailyQuests(getDailyQuests());

    // Fetch daily clue from API
    fetch('/api/semantic-climb')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.category) {
          setDailyClue(data);
          const targetKey = data.targetWord || data.category || 'Daily';
          if (Array.isArray(data.quickSelects)) {
            data.quickSelects.forEach((item) => {
              const itemData = {
                guess: item.word,
                rank: item.rank,
                similarity: item.similarity,
                bearing: item.rank <= 300
                  ? 'Direct Heading: Core Attribute / Direct Synonym'
                  : item.rank <= 1500
                  ? 'On Course: Shared Domain & Conceptual Field'
                  : item.rank <= 4000
                  ? 'Drifting: Loose / Tangential Association'
                  : 'Opposite Heading: Unrelated Semantic Domain',
                solved: item.rank === 1,
                temperature: item.rank <= 300 ? 'Burning Hot' : item.rank <= 1500 ? 'Warm' : item.rank <= 4000 ? 'Cool' : 'Freezing',
                color: item.rank <= 300 ? 'rose' : item.rank <= 1500 ? 'amber' : item.rank <= 4000 ? 'sky' : 'slate',
                icon: '',
                hint: item.rank <= 300 ? 'Burning hot bearing!' : 'Keep exploring along this train of thought.',
                mode: 'precomputed_instant',
              };
              setClientProximityCache(targetKey, item.word, itemData);
            });
          }
        }
      })
      .catch((err) => console.warn('Could not load daily clue:', err));

    // Initialize Web Speech Recognition
    if (typeof window !== 'undefined') {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US';

        rec.onresult = (event) => {
          const transcript = event.results[0][0].transcript.trim();
          setIsRecording(false);
          if (transcript) {
            handleSpokenWord(transcript);
          }
        };

        rec.onerror = (e) => {
          console.warn('Speech rec error:', e);
          setIsRecording(false);
        };

        rec.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = rec;
      }
    }
  }, []);

  // 2. Setup Palm Shade Canvas once
  useEffect(() => {
    const cvs = shadeCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    ctx.scale(0.5, 0.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cvs.width * 2, cvs.height * 2);

    ctx.strokeStyle = 'rgba(120, 114, 96, 0.9)';
    ctx.lineCap = 'round';

    const curves = [
      [-10, 26, 38, -8, 8],
      [-8, 46, 58, -2, 5],
      [-10, 62, 74, 6, 4],
      [14, 78, 96, 16, 4],
      [40, 82, 118, 22, 3],
      [78, 80, 140, 34, 5],
      [-12, 74, 22, 56, 6],
    ];

    curves.forEach(([x0, y0, x1, y1, lw]) => {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + 6, (y0 + y1) / 2 + 8, x1, y1);
      ctx.stroke();
    });
  }, []);

  // 3. Camera Transition Trigger & Mode Switching Safety
  const goToScene = useCallback((target) => {
    const now = performance.now();
    const tr = transitionRef.current;
    if (tr.pTo === target) return;

    if (target === 0) {
      setForgeActive(false);
    }

    tr.pFrom = tr.p;
    tr.pTo = target;
    tr.pT0 = now;
    setSceneIndex(target);
    sound.shipBell();
  }, []);

  const handleTabSwitch = useCallback((tab) => {
    if (tab !== 'forge') {
      setForgeActive(false);
    } else {
      setForgeActive(true);
      setForgeTimer(60);
    }
    setActiveTab(tab);
  }, []);

  const handleStartVoyage = useCallback(() => {
    handleTabSwitch('vault');
    goToScene(1);
    setTimeout(() => {
      climbInputRef.current?.focus();
    }, 700);
  }, [goToScene, handleTabSwitch]);

  // 4. 60FPS Render Loop with Dynamic Ship Horizon Lifeline & Overlap Prevention
  useEffect(() => {
    let animId;
    const t0 = performance.now();

    // Smoothed mist level for ship lifeline (0 at shore -> 1 vanished at horizon)
    let currentMist = 0;

    const onWheel = (e) => {
      const now = performance.now();
      const tr = transitionRef.current;
      if (now < tr.lockedUntil) return;

      if (e.deltaY > 8) {
        goToScene(1);
        tr.lockedUntil = now + 1200;
      } else if (e.deltaY < -8) {
        goToScene(0);
        tr.lockedUntil = now + 1200;
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });

    // Apply sprite background clipping
    const applySprite = (el, [sheetUrl, x, y, w, h]) => {
      if (!el) return;
      el.style.backgroundImage = `url("${sheetUrl}")`;
      el.style.backgroundSize = `${(2048 / w) * 100}% ${(1360 / h) * 100}%`;
      el.style.backgroundPosition = `${(x / (2048 - w)) * 100}% ${(y / (1360 - h)) * 100}%`;
    };

    applySprite(captRef.current, BOX.capt);
    applySprite(chestRef.current, BOX.chest);
    applySprite(palmRef.current, BOX.palm);
    applySprite(bushLRef.current, BOX.bushL);
    applySprite(bushRRef.current, BOX.bushR);

    if (shipRef.current) {
      shipRef.current.style.backgroundImage = `url("${SHIP_IMG}")`;
    }

    let lastTime = t0;

    const render = (now) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = (now - t0) / 1000;

      const frame = frameRef.current;
      if (!frame) {
        animId = requestAnimationFrame(render);
        return;
      }

      const W = frame.clientWidth;
      const H = frame.clientHeight;
      const portrait = H > W;
      document.documentElement.classList.toggle('portrait', portrait);

      const L = portrait ? LAY.port : LAY.land;
      const S = Math.min(W / L.w, H / L.h);
      const DW = W / S;
      const DH = H / S;
      const DX = (DW - L.w) / 2;
      const DY = (DH - L.h) / 2;

      if (sceneRef.current) {
        sceneRef.current.style.width = `${L.w}px`;
        sceneRef.current.style.height = `${L.h}px`;
        sceneRef.current.style.transform = `translate(${DX * S}px, ${DY * S}px) scale(${S})`;
      }

      // Compute transition progress p
      const tr = transitionRef.current;
      const k = seg(now, tr.pT0, tr.pT0 + tr.duration);
      tr.p = mix(tr.pFrom, tr.pTo, io(k));
      const p = tr.p;

      // Render Waves (BACK & FRONT)
      const renderWaveLayer = (svgEl, layers) => {
        if (!svgEl) return;
        svgEl.setAttribute('width', DW);
        svgEl.setAttribute('height', DH);
        svgEl.style.width = `${DW}px`;
        svgEl.style.height = `${DH}px`;

        const startX = -DX - 20;
        const endX = L.w + DX + 20;
        const step = 22;

        layers.forEach((l, idx) => {
          let path = svgEl.children[idx];
          if (!path) {
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('stroke', 'var(--line)');
            path.setAttribute('stroke-width', '3.2');
            path.setAttribute('stroke-linecap', 'round');
            svgEl.appendChild(path);
          }

          let x0 = startX;
          let x1 = endX;
          if (l.span) {
            const spanW = endX - startX;
            x0 = startX + spanW * l.span[0];
            x1 = startX + spanW * l.span[1];
          }

          let d = `M ${x0} ${yAt(l, x0, t, p, L)}`;
          for (let x = x0 + step; x <= x1; x += step) {
            d += ` L ${x} ${yAt(l, x, t, p, L)}`;
          }

          if (l.fill) {
            d += ` L ${x1} ${DH + 60} L ${x0} ${DH + 60} Z`;
            path.setAttribute('fill', l.fill);
          } else {
            path.setAttribute('fill', 'none');
          }

          path.setAttribute('d', d);
        });
      };

      renderWaveLayer(wBackRef.current, BACK_WAVES);
      renderWaveLayer(wFrontRef.current, FRONT_WAVES);

      // Ship positioning, rocking, and Horizon Lifeline
      if (shipRef.current) {
        const c = L.ship;
        const baseSw = mix(c.w0, c.w1, p);
        const baseSx = mix(c.x0, c.x1, p);

        // Calculate lifeline mist ratio (0 to 1) when on or transitioning to scene 1
        const targetMist = p > 0.05 ? clamp(incorrectRef.current / MAX_LEAGUES, 0, 1) : 0;
        currentMist += (targetMist - currentMist) * 0.07;

        // Scale: Ship shrinks further toward vanishing point per missed league
        const sw = baseSw * (1 - currentMist * 0.78);
        const sh = sw * 2002 / 1961;

        // Position: Ship drifts higher towards the horizon line and further away
        const sx = baseSx + currentMist * (portrait ? 45 : 85);
        const wy = yAt(FRONT_WAVES[0], sx, t, p, L) - currentMist * (portrait ? 35 : 45);

        const slope = (yAt(FRONT_WAVES[0], sx + 90, t, p, L) - yAt(FRONT_WAVES[0], sx - 90, t, p, L)) / 180;
        const rot = Math.atan(slope) * 57.3 * 0.75;

        // Opacity: Fades into sea mist until gone on 5th mistake
        const shipOpacity = Math.max(0, 1 - currentMist * 0.98);

        shipRef.current.style.width = `${sw}px`;
        shipRef.current.style.height = `${sh}px`;
        shipRef.current.style.left = `${sx - sw / 2}px`;
        shipRef.current.style.top = `${wy + sw * 0.05 - sh}px`;
        shipRef.current.style.transform = `rotate(${rot}deg)`;
        shipRef.current.style.opacity = String(shipOpacity);
      }

      // Cloud drift
      if (cloudRef.current) {
        const cloudX = ((L.w * 0.72 - t * 16) % (L.w + 700)) - 400;
        cloudRef.current.style.left = `${cloudX}px`;
        cloudRef.current.style.top = portrait ? '110px' : '150px';
        cloudRef.current.style.opacity = `${1 - seg(p, 0.3, 0.7)}`;
      }

      // Intro & Copy transitions for Scene 0 (Hero)
      const intro = out(seg(now, t0 + 200, t0 + 1100));
      if (t1Ref.current) {
        t1Ref.current.style.opacity = `${intro * (1 - seg(p, 0.62, 0.7))}`;
        t1Ref.current.style.transform = `translateY(${(1 - intro) * 26 - p * 40}px)`;
        t1Ref.current.style.pointerEvents = p > 0.1 ? 'none' : 'auto';
      }

      if (logoRef.current) {
        logoRef.current.style.opacity = `${1 - seg(p, 0.12, 0.3)}`;
      }

      // Island Elements (Palm, Captain, Chest)
      const e = io(seg(p, 0.04, 0.92));
      if (palmRef.current) {
        const px = mix(-L.palm.w - 80, L.palm.x, e);
        const py = mix(-170, L.palm.y, e);
        palmRef.current.style.width = `${L.palm.w}px`;
        palmRef.current.style.height = `${L.palm.w * 1284 / 910}px`;
        palmRef.current.style.transform = `translate(${px}px, ${py}px) rotate(${Math.sin(t * 0.8) * 0.7}deg)`;
      }

      if (captRef.current) {
        const cxPos = mix(-L.capt.w - 160, L.capt.x, e);
        captRef.current.style.width = `${L.capt.w}px`;
        captRef.current.style.height = `${L.capt.w * 1074 / 1246}px`;
        captRef.current.style.top = `${L.capt.y}px`;
        captRef.current.style.transform = `translateX(${cxPos}px) rotate(${Math.sin(t * 1.1) * 0.5 * p}deg)`;
      }

      if (chestRef.current) {
        const chX = mix(-L.chest.w - 720, L.chest.x, e);
        const chY = mix(120, L.chest.y, e);
        chestRef.current.style.width = `${L.chest.w}px`;
        chestRef.current.style.height = `${L.chest.w * 392 / 446}px`;
        chestRef.current.style.transform = `translate(${chX}px, ${chY}px)`;
      }

      // Foregrounds bushes
      const b = out(seg(p, 0.5, 1));
      if (bushLRef.current) {
        bushLRef.current.style.width = `${L.bushL.w}px`;
        bushLRef.current.style.height = `${L.bushL.w * 496 / 860}px`;
        bushLRef.current.style.left = `${L.bushL.x}px`;
        bushLRef.current.style.top = `${L.bushL.y}px`;
        bushLRef.current.style.transform = `translateY(${mix(340, 0, b)}px)`;
      }

      if (bushRRef.current) {
        bushRRef.current.style.width = `${L.bushR.w}px`;
        bushRRef.current.style.height = `${L.bushR.w * 405 / 499}px`;
        bushRRef.current.style.left = `${L.bushR.x}px`;
        bushRRef.current.style.top = `${L.bushR.y}px`;
        bushRRef.current.style.transform = `translateY(${mix(300, 0, b)}px)`;
      }

      // STRICT OVERLAP PREVENTION: Hide entire Scene 1 container until voyage is started
      if (t2Ref.current) {
        const t2k = seg(p, 0.25, 0.85);
        t2Ref.current.style.opacity = String(t2k);
        t2Ref.current.style.visibility = p > 0.05 ? 'visible' : 'hidden';
        t2Ref.current.style.pointerEvents = p > 0.75 ? 'auto' : 'none';
        t2Ref.current.style.transform = `translateY(${mix(40, 0, out(t2k))}px)`;
      }

      if (h2Ref.current) {
        const hk = seg(p, 0.35, 0.8);
        h2Ref.current.style.opacity = `${hk * hk}`;
      }

      if (p2Ref.current) {
        const pk = seg(p, 0.65, 0.9);
        p2Ref.current.style.opacity = `${pk}`;
      }

      // Palm shade canvas dynamic drift
      if (shadeCanvasRef.current) {
        const sxTrans = Math.sin(t * 0.35) * 2.2;
        const syTrans = Math.cos(t * 0.27) * 1.6;
        const sRot = Math.sin(t * 0.22) * 0.8;
        shadeCanvasRef.current.style.transform = `translate(${sxTrans}%, ${syTrans}%) rotate(${sRot}deg)`;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('wheel', onWheel);
    };
  }, [goToScene]);

  // 5. Voice Recognition Toggle & Handling
  const toggleListening = () => {
    if (!voiceEnabled) {
      setSpeechFeedback('Voice input is disabled in Settings.');
      setTimeout(() => setSpeechFeedback(''), 2500);
      return;
    }

    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setSpeechFeedback('Listening... speak clearly!');
      } catch (e) {
        console.warn('Speech start error:', e);
      }
    }
  };

  const handleSpokenWord = (spokenText) => {
    const words = spokenText.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
    const spokenWord = words[0];
    if (!spokenWord) return;

    setSpeechFeedback(`Heard: "${spokenWord}"`);
    setTimeout(() => setSpeechFeedback(''), 3000);

    if (activeTab === 'forge') {
      executeForgeWord(spokenWord);
    } else {
      setClimbInput(spokenWord);
      executeClimbGuess(spokenWord);
    }
  };

  const startForgeGame = (poolIdx) => {
    const idx = poolIdx !== undefined
      ? poolIdx
      : Math.floor(Math.random() * FORGE_POOLS.length);
    const pool = FORGE_POOLS[idx];
    setForgePoolIndex(idx);
    setForgeRack(createShuffledRack(pool.rack));
    setForgeAssembled([]);
    setForgeStreak(0);
    setForgeScore(0);
    setForgeWords([]);
    setForgeTimer(60);
    setForgeActive(true);
    setForgeBanter(`Forge shift begun with ${pool.theme}! Tap rack tiles or type to forge words.`);
    sound.shipBell();
  };

  const handleTileClick = (tile) => {
    if (!forgeActive || tile.used) return;
    setForgeRack((prev) =>
      prev.map((t) => (t.id === tile.id ? { ...t, used: true } : t))
    );
    setForgeAssembled((prev) => [...prev, { id: tile.id, letter: tile.letter }]);
    sound.tick();
  };

  const handleAssembledTileClick = (index) => {
    const tileToRemove = forgeAssembled[index];
    if (!tileToRemove) return;
    setForgeAssembled((prev) => prev.filter((_, idx) => idx !== index));
    setForgeRack((prev) =>
      prev.map((t) => (t.id === tileToRemove.id ? { ...t, used: false } : t))
    );
    sound.tick();
  };

  const handleForgeBackspace = () => {
    if (forgeAssembled.length === 0) return;
    const lastTile = forgeAssembled[forgeAssembled.length - 1];
    setForgeAssembled((prev) => prev.slice(0, -1));
    setForgeRack((prev) =>
      prev.map((t) => (t.id === lastTile.id ? { ...t, used: false } : t))
    );
    sound.tick();
  };

  const handleForgeClear = () => {
    setForgeAssembled([]);
    setForgeRack((prev) => prev.map((t) => ({ ...t, used: false })));
  };

  const handleForgeShuffle = () => {
    setForgeRack((prev) => {
      const unusedLetters = prev.filter((t) => !t.used).map((t) => t.letter);
      for (let i = unusedLetters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unusedLetters[i], unusedLetters[j]] = [unusedLetters[j], unusedLetters[i]];
      }
      let uIdx = 0;
      return prev.map((t) => {
        if (!t.used) {
          return { ...t, letter: unusedLetters[uIdx++] };
        }
        return t;
      });
    });
    sound.tick();
  };

  const handleForgeNextWord = () => {
    if (!forgeActive) return;
    let nextIdx = Math.floor(Math.random() * FORGE_POOLS.length);
    if (FORGE_POOLS.length > 1 && nextIdx === forgePoolIndex) {
      nextIdx = (nextIdx + 1) % FORGE_POOLS.length;
    }
    const nextPool = FORGE_POOLS[nextIdx];
    setForgePoolIndex(nextIdx);
    setForgeRack(createShuffledRack(nextPool.rack));
    setForgeAssembled([]);
    setForgeBanter(`Auto-shuffled to ${nextPool.theme}! Forge words from the new rack.`);
    sound.tick();
  };

  const executeForgeWord = (wordOverride) => {
    if (!forgeActive) return;
    const currentPool = FORGE_POOLS[forgePoolIndex];
    const candidate = (
      wordOverride || forgeAssembled.map((t) => t.letter).join('')
    ).toUpperCase().trim();

    if (!candidate || candidate.length < 3) {
      sound.error();
      setForgeBanter('Words must be at least 3 letters long!');
      return;
    }

    if (forgeWords.some((w) => w.word === candidate)) {
      sound.error();
      setForgeBanter(`"${candidate}" is already forged in this shift!`);
      return;
    }

    if (!canFormWord(candidate, currentPool.rack)) {
      sound.error();
      setForgeBanter(`Cannot forge "${candidate}" with your current rack!`);
      return;
    }

    const isValid = currentPool.valid.includes(candidate);
    if (!isValid) {
      sound.error();
      setForgeBanter(`"${candidate}" is not in the nautical lexicon.`);
      return;
    }

    let basePts = 30;
    if (candidate.length === 4) basePts = 60;
    else if (candidate.length === 5) basePts = 100;
    else if (candidate.length === 6) basePts = 160;
    else if (candidate.length >= 7) basePts = 260;

    const multiplier = 1 + Math.floor(forgeStreak / 4) * 0.5;
    const earned = Math.round(basePts * multiplier);
    const nextStreak = forgeStreak + 1;
    const nextScore = forgeScore + earned;

    sound.correct(nextStreak);
    if (candidate.length >= 6 || nextStreak % 5 === 0) {
      sound.streak();
      triggerConfetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
    }

    if (forgeWords.length + 1 >= 5) {
      const updatedQ = updateQuestProgress('quest_forge', 1);
      setDailyQuests(updatedQ);
    }

    // Auto-shuffle to the next word pool for continuous fresh challenge
    let nextIdx = Math.floor(Math.random() * FORGE_POOLS.length);
    if (FORGE_POOLS.length > 1 && nextIdx === forgePoolIndex) {
      nextIdx = (nextIdx + 1) % FORGE_POOLS.length;
    }
    const nextPool = FORGE_POOLS[nextIdx];
    setForgePoolIndex(nextIdx);
    setForgeRack(createShuffledRack(nextPool.rack));
    setForgeAssembled([]);
    setForgeStreak(nextStreak);
    setForgeScore(nextScore);
    setForgeWords((prev) => [{ word: candidate, points: earned }, ...prev]);
    setForgeBanter(`Splendid! "${candidate}" forged for +${earned} pts! Auto-shuffled to ${nextPool.theme}.`);
  };

  const handleForgeTimeout = useCallback(() => {
    sound.gameOver();
    setForgeActive(false);
    const earnedDoubloons = Math.floor(forgeScore / 10);
    const updated = recordChainGame(forgeScore, forgeStreak, forgeWords.length, earnedDoubloons);
    if (updated) setStats(updated);

    setForgeResult({
      score: forgeScore,
      streak: forgeStreak,
      wordsCount: forgeWords.length,
      earnedDoubloons,
      wordsList: forgeWords,
      reason: '60-second forge timer has elapsed!'
    });
    setForgeBanter('Time expired! The forge fire has settled.');
    openDialog(forgeGameOverDialogRef);
  }, [forgeScore, forgeStreak, forgeWords]);

  // Word Forge 60s countdown timer
  useEffect(() => {
    if (activeTab !== 'forge' || sceneIndex !== 1 || !forgeActive) {
      return;
    }

    const interval = setInterval(() => {
      setForgeTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        if (prev <= 4) {
          sound.tick();
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTab, sceneIndex, forgeActive]);

  useEffect(() => {
    if (activeTab === 'forge' && sceneIndex === 1 && forgeActive && forgeTimer === 0) {
      handleForgeTimeout();
    }
  }, [forgeTimer, activeTab, sceneIndex, forgeActive, handleForgeTimeout]);

  // Keyboard controls for Word Forge
  useEffect(() => {
    if (activeTab !== 'forge' || sceneIndex !== 1 || !forgeActive) return;

    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (typeof document !== 'undefined' && document.documentElement.classList.contains('has-modal')) return;

      const key = e.key;
      if (/^[a-zA-Z]$/.test(key)) {
        const upper = key.toUpperCase();
        const availableTile = forgeRack.find((t) => t.letter === upper && !t.used);
        if (availableTile) {
          e.preventDefault();
          handleTileClick(availableTile);
        }
      } else if (key === 'Backspace') {
        e.preventDefault();
        handleForgeBackspace();
      } else if (key === 'Enter') {
        e.preventDefault();
        executeForgeWord();
      } else if (key === ' ') {
        e.preventDefault();
        handleForgeShuffle();
      } else if (key === 'Escape') {
        e.preventDefault();
        handleForgeClear();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, sceneIndex, forgeActive, forgeRack, forgeAssembled]);

  // 6. Speech Pronunciation Teaching Action
  const pronounceWord = (word) => {
    if (!speechAudioEnabled) return;
    sound.speakWord(word, () => {
      const updated = recordSpeechPractice();
      if (updated) setStats(updated);
      const updatedQ = updateQuestProgress('quest_speech', 1);
      setDailyQuests(updatedQ);
    });
  };

  // 7. Repyt Semantic Proximity Engine with Ship Horizon Lifeline & Zero-Latency Cache
  const applyClimbResult = (data, guess) => {
    if (data.details) {
      setDailyClue(data.details);
    }

    if (data.solved) {
      sound.streak();
      triggerConfetti({ particleCount: 120, spread: 100, origin: { y: 0.5 } });
      setClimbSolved(true);
      setCaptainBanter(`Vault unlocked! The mystery concept was indeed "${guess}"!`);

      const updated = recordChainGame(100, 1, climbGuesses.length + 1, 150);
      if (updated) setStats(updated);

      // Quest: Master Navigator (3+ leagues remaining)
      if (MAX_LEAGUES - incorrectGuesses >= 3) {
        const updatedQ = updateQuestProgress('quest_vault', 1);
        setDailyQuests(updatedQ);
      }

      setClimbGuesses((prev) => [data, ...prev].sort((a, b) => a.rank - b.rank));

      setTimeout(() => {
        openDialog(victoryDialogRef);
      }, 800);
    } else {
      const nextMistakes = incorrectGuesses + 1;
      setIncorrectGuesses(nextMistakes);

      if (data.rank <= 300) {
        sound.correct();
        setCaptainBanter(`Burning hot bearing! You're extremely close to the vault.`);
      } else if (data.rank <= 1500) {
        sound.correct();
        setCaptainBanter(`Warm shallows. Keep exploring along this train of thought.`);
      } else {
        sound.error();
        setCaptainBanter(`Cold waters! Your ship drifts further toward the horizon.`);
      }

      setClimbGuesses((prev) => [data, ...prev].sort((a, b) => a.rank - b.rank));

      if (nextMistakes >= MAX_LEAGUES) {
        sound.gameOver();
        setCaptainBanter('The galleon has faded into the mist. Voyage stranded!');
        setTimeout(() => {
          openDialog(strandedDialogRef);
        }, 1200);
      }
    }
  };

  const executeClimbGuess = async (guessWord) => {
    const guess = (guessWord || '').trim();
    if (!guess || climbEvaluating || climbSolved || incorrectGuesses >= MAX_LEAGUES) return;

    // Check duplicate guesses
    if (climbGuesses.some((g) => g.guess.toLowerCase() === guess.toLowerCase())) {
      sound.error();
      setCaptainBanter(`"${guess}" was already tested in this sand!`);
      return;
    }

    setClimbInput('');

    // Zero-Latency Local Cache Check
    const targetWord = dailyClue.category ? (dailyClue.targetWord || dailyClue.category) : 'Daily';

    // Zero-Latency Quick Select Match
    const quickMatch = dailyClue.quickSelects?.find((q) => q.word.toLowerCase() === guess.toLowerCase());
    if (quickMatch) {
      const instantData = {
        guess: quickMatch.word,
        rank: quickMatch.rank,
        similarity: quickMatch.similarity,
        bearing: quickMatch.rank <= 300
          ? 'Direct Heading: Core Attribute / Direct Synonym'
          : quickMatch.rank <= 1500
          ? 'On Course: Shared Domain & Conceptual Field'
          : quickMatch.rank <= 4000
          ? 'Drifting: Loose / Tangential Association'
          : 'Opposite Heading: Unrelated Semantic Domain',
        solved: quickMatch.rank === 1,
        temperature: quickMatch.rank <= 300 ? 'Burning Hot' : quickMatch.rank <= 1500 ? 'Warm' : quickMatch.rank <= 4000 ? 'Cool' : 'Freezing',
        color: quickMatch.rank <= 300 ? 'rose' : quickMatch.rank <= 1500 ? 'amber' : quickMatch.rank <= 4000 ? 'sky' : 'slate',
        icon: '',
        hint: quickMatch.rank <= 300 ? 'Burning hot! You are circling the exact conceptual core.' : 'Warm shallows. Keep exploring along this train of thought.',
        mode: 'precomputed_instant',
      };
      setClientProximityCache(targetWord, quickMatch.word, instantData);
      applyClimbResult(instantData, quickMatch.word);
      return;
    }

    const cached = getClientProximityCache(targetWord, guess);
    if (cached) {
      applyClimbResult(cached, guess);
      return;
    }

    setClimbEvaluating(true);

    try {
      const res = await fetch('/api/semantic-climb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess }),
      });

      const data = await res.json();
      setClientProximityCache(targetWord, guess, data);
      applyClimbResult(data, guess);
    } catch (err) {
      console.error(err);
      sound.error();
      setCaptainBanter('The compass faltered. Try your guess once more.');
    } finally {
      setClimbEvaluating(false);
    }
  };



  const handleClaimQuest = (questId) => {
    const res = claimQuestReward(questId);
    if (res) {
      setDailyQuests(res.quests);
      setStats(res.stats);
      sound.streak();
      triggerConfetti({ particleCount: 60, spread: 60 });
    }
  };

  const shareVoyageResults = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const solvedText = climbSolved ? 'Vault Unlocked [Solved]' : 'Stranded in Mist [Unsolved]';
    const remaining = MAX_LEAGUES - incorrectGuesses;
    const bestSim = climbGuesses.length > 0 ? Math.max(...climbGuesses.map((g) => g.similarity || 0)) : 0;

    const rankGrid = climbGuesses.slice(0, 8).map((g) => {
      if (g.rank === 1) return '[#1]';
      if (g.rank <= 300) return '[HOT]';
      if (g.rank <= 1500) return '[WARM]';
      if (g.rank <= 4000) return '[COOL]';
      return '[COLD]';
    }).join(' ');

    const text = `Repyt Vault #${dateStr}\n${solvedText}\nLeagues Remaining: ${remaining}/${MAX_LEAGUES}\nGuesses: ${climbGuesses.length} | Best Proximity: ${bestSim}%\n${rankGrid}\n\nPlay at https://repyt.app`;

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setShareToast('Voyage copied to clipboard!');
      setTimeout(() => setShareToast(''), 3000);
    }
  };

  const handleClimbSubmit = (e) => {
    e.preventDefault();
    executeClimbGuess(climbInput);
  };

  const handleQuickGuess = (word) => {
    setClimbInput(word);
    executeClimbGuess(word);
  };

  // Reset Voyage
  const resetVoyage = () => {
    setIncorrectGuesses(0);
    setClimbGuesses([]);
    setClimbSolved(false);
    setClimbInput('');
    setCaptainBanter('New voyage charted! Cast your bearing into the sand.');
    closeDialog(strandedDialogRef);
    closeDialog(victoryDialogRef);
  };

  // Dialog helpers with coordinate backdrop check and safe modal restoration
  const openDialog = (ref) => {
    try {
      if (ref?.current && !ref.current.open) {
        ref.current.showModal();
        document.documentElement.classList.add('has-modal');
      }
    } catch (err) {
      console.warn('Dialog showModal error:', err);
    }
  };

  const closeDialog = (ref) => {
    try {
      if (ref?.current && ref.current.open) {
        ref.current.close();
      }
    } catch (err) {
      console.warn('Dialog close error:', err);
    } finally {
      if (typeof document !== 'undefined') {
        const anyOpen = document.querySelectorAll('dialog[open]').length > 0;
        if (!anyOpen) {
          document.documentElement.classList.remove('has-modal');
        }
      }
    }
  };

  const handleDialogBackdropClick = (e, ref) => {
    if (!ref?.current || e.target !== ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const isInside = (
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    );
    if (!isInside) {
      closeDialog(ref);
    }
  };

  const handleToggleSound = (val) => {
    const nextSoundOn = typeof val === 'boolean' ? val : soundMuted;
    const isMuted = !nextSoundOn;
    setSoundMuted(isMuted);
    sound.setMuted(isMuted);
    savePreferences({ sound: nextSoundOn });
  };

  const toggleSound = () => {
    handleToggleSound(soundMuted);
  };

  const handleToggleQuickSelects = (val) => {
    const nextVal = typeof val === 'boolean' ? val : !quickSelectsEnabled;
    setQuickSelectsEnabled(nextVal);
    savePreferences({ quickSelects: nextVal });
    sound.tick();
  };

  const handleToggleVoice = (val) => {
    const nextVal = typeof val === 'boolean' ? val : !voiceEnabled;
    setVoiceEnabled(nextVal);
    savePreferences({ voiceEnabled: nextVal });
    sound.tick();
  };

  const handleToggleSpeechAudio = (val) => {
    const nextVal = typeof val === 'boolean' ? val : !speechAudioEnabled;
    setSpeechAudioEnabled(nextVal);
    savePreferences({ speechAudio: nextVal });
    sound.tick();
  };

  const handleResetPreferences = () => {
    const defaults = {
      sound: true,
      quickSelects: true,
      voiceEnabled: true,
      speechAudio: true,
    };
    savePreferences(defaults);
    setSoundMuted(false);
    sound.setMuted(false);
    setQuickSelectsEnabled(true);
    setVoiceEnabled(true);
    setSpeechAudioEnabled(true);
    sound.streak();
  };

  const pirateRank = getPirateRank(stats.doubloons);
  const remainingLeagues = Math.max(0, MAX_LEAGUES - incorrectGuesses);

  return (
    <>
      <main className="frame" id="frame" ref={frameRef}>
        {/* Repyt Brand Logo */}
        <div className="logo" id="logo" ref={logoRef} onClick={() => goToScene(0)} title="Repyt — Home">
          <svg className="logo-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 16c0-6.627 5.373-12 12-12 5.5 0 10.1 3.7 11.5 8.8M28 16c0 6.627-5.373 12-12 12-5.5 0-10.1-3.7-11.5-8.8" />
            <path d="M12 12h7a3.5 3.5 0 0 1 0 7h-7V9" />
            <circle cx="16" cy="16" r="2" fill="currentColor" />
          </svg>
          <div className="logo-text-group">
            <span className="brand-name">Repyt</span>
            <span className="logo-sub">AI ODYSSEY</span>
          </div>
        </div>

        {/* Navigation Bar */}
        <nav>
          <a
            href="#voyage"
            onClick={(e) => { e.preventDefault(); goToScene(0); }}
            title="Open Sea Voyage Hero"
            className={sceneIndex === 0 ? 'nav-link-active' : ''}
          >
            Voyage
            <svg viewBox="0 0 17 21" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <circle cx="8.5" cy="3" r="1.8" />
              <path d="M8.5 5V18M4.5 8h8M1.5 12.5c.4 3.5 3.5 6 7 6s6.5-2.5 7-6" />
            </svg>
          </a>

          <a
            href="#vault"
            onClick={(e) => { e.preventDefault(); handleTabSwitch('vault'); goToScene(1); }}
            title="The Repyt Vault"
            className={sceneIndex === 1 && activeTab === 'vault' ? 'nav-link-active' : ''}
          >
            Vault
            <svg viewBox="0 0 17 21" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <circle cx="8.5" cy="3" r="1.8" />
              <path d="M8.5 5V18M4.5 8h8M1.5 12.5c.4 3.5 3.5 6 7 6s6.5-2.5 7-6" />
            </svg>
          </a>

          <a
            href="#forge"
            onClick={(e) => {
              e.preventDefault();
              handleTabSwitch('forge');
              goToScene(1);
            }}
            title="Word Forge Tile Joining"
            className={sceneIndex === 1 && activeTab === 'forge' ? 'nav-link-active' : ''}
          >
            Forge
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </a>

          <button onClick={() => openDialog(rulesDialogRef)} title="Ship's Rules & Codex">
            Rules
          </button>

          <button onClick={() => openDialog(statsDialogRef)} title="Navigator's Log">
            Log
          </button>

          <button onClick={() => openDialog(settingsDialogRef)} title="Ship's Settings & Preferences">
            Settings
          </button>

          <button onClick={toggleSound} title={soundMuted ? 'Unmute Sound' : 'Mute Sound'} aria-label="Toggle sound">
            {soundMuted ? (
              <svg className="icon-svg" viewBox="0 0 24 24">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg className="icon-svg" viewBox="0 0 24 24">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          <div className="nav-badge" title="Your Pirate Gold">
            <span>{stats.doubloons} Gold</span>
            <span style={{ opacity: 0.6 }}>· {pirateRank.title}</span>
          </div>
        </nav>

        {/* 2-Scene Scaled Design World */}
        <div id="scene" ref={sceneRef}>
          {/* Cloud SVG */}
          <div className="spr" id="cloudA" ref={cloudRef}>
            <svg viewBox="0 0 300 80" width="300" height="80">
              <path
                fill="#d3cebe"
                d="M0 79c14-3 26-3 38-10-4-16 10-30 30-26 6-22 42-34 62-16 16-12 42-6 50 14 10-2 18 2 22 8 24 22 66 26 98 30z"
              />
            </svg>
          </div>

          {/* Back Wave SVG Layers */}
          <svg className="w" id="wBack" ref={wBackRef} />

          {/* Scene 0: Landing Hero with ONLY "Start voyage" button */}
          <div className="t1" id="t1" ref={t1Ref}>
            <div className="eb">Repyt Archipelago</div>
            <h1>Tales of<br />the open sea</h1>
            <div style={{ marginTop: '28px' }}>
              <button
                className="pill"
                onClick={handleStartVoyage}
                data-go="0"
                title="Embark on the voyage for buried treasure"
              >
                Start voyage
              </button>
              <div className="sub">
                Set sail to deduce today&apos;s mystery concept in the Repyt Vault
              </div>
            </div>
          </div>

          {/* Galleon Ship Sprite (Drifts to horizon per missed league) */}
          <div className="spr" id="ship" ref={shipRef} />

          {/* Front Wave SVG Layers */}
          <svg className="w" id="wFront" ref={wFrontRef} />

          {/* Scene 1: Island Sprites */}
          <div className="spr" id="palm" ref={palmRef} />
          <div className="spr" id="capt" ref={captRef} />
          <div className="spr" id="chest" ref={chestRef} />
          <div className="spr" id="bushL" ref={bushLRef} />
          <div className="spr" id="bushR" ref={bushRRef} />

          {/* Scene 1: The Repyt Interaction Arena (Vault & Word Tennis) */}
          <div className="t2" id="t2" ref={t2Ref}>
            {/* Vault Header with Back to Sea button */}
            <div className="vault-header">
              <div className="vault-title-wrap">
                <h2 id="h2" ref={h2Ref}>
                  {activeTab === 'forge' ? <>Repyt<br />Word Forge</> : <>The Repyt<br />Vault</>}
                </h2>
                <p id="p2" ref={p2Ref}>
                  {activeTab === 'forge'
                    ? "Join letter tiles from your rack to forge pirate words before time expires!"
                    : "Deduce today's secret concept to open the golden vault."}
                </p>
              </div>

              <div className="vault-nav-actions">
                <button
                  type="button"
                  className="icon-pill-btn"
                  onClick={() => openDialog(settingsDialogRef)}
                  title="Preferences & Settings"
                >
                  <svg className="icon-svg" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  className="pill back-btn"
                  onClick={() => goToScene(0)}
                  title="Return to ship voyage"
                >
                  <svg className="icon-svg" style={{ width: '13px', height: '13px', marginRight: '5px' }} viewBox="0 0 24 24">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Back to Sea
                </button>
              </div>
            </div>

            {/* TAB 1: REPYT WORD FORGE ARENA */}
            {activeTab === 'forge' ? (
              <div className="question-card forge-arena-card">
                <div className="forge-arena-header">
                  <div className="forge-status-wrap">
                    <span className="clue-tag">Word Forge</span>
                    <span className="forge-streak-badge">
                      Streak: {forgeStreak} (x{(1 + Math.floor(forgeStreak / 4) * 0.5).toFixed(1)})
                    </span>
                  </div>
                  <div className="forge-hud-stats">
                    <span className={`forge-timer-pill ${forgeTimer <= 10 ? 'urgent' : forgeTimer <= 20 ? 'warning' : ''}`}>
                      {forgeTimer}s
                    </span>
                    <span className="forge-score-badge">
                      {forgeScore} Pts
                    </span>
                  </div>
                </div>

                {/* Forge Prompt */}
                <div className="forge-target-info">
                  <span>Join letters from your rack to forge words (3+ letters). Tap tiles or type!</span>
                </div>

                {/* Assembled Word Anvil */}
                <div className="forge-assembled-box">
                  <div className="assembled-tiles-row">
                    {forgeAssembled.length === 0 ? (
                      <span className="assembled-placeholder">Tap rack tiles or type on keyboard...</span>
                    ) : (
                      forgeAssembled.map((tile, idx) => (
                        <button
                          key={`${tile.id}-${idx}`}
                          type="button"
                          className="forge-tile assembled-tile"
                          onClick={() => handleAssembledTileClick(idx)}
                          title="Remove letter"
                        >
                          {tile.letter}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Letter Rack */}
                <div className="forge-rack-wrap">
                  <div className="forge-rack">
                    {forgeRack.map((tile) => (
                      <button
                        key={tile.id}
                        type="button"
                        className={`forge-tile rack-tile ${tile.used ? 'used' : 'available'}`}
                        onClick={() => handleTileClick(tile)}
                        disabled={tile.used || !forgeActive}
                        title={tile.used ? 'Used' : `Add ${tile.letter}`}
                      >
                        {tile.letter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Forge Action Controls */}
                <div className="forge-controls-row">
                  <button
                    type="button"
                    className="icon-pill-btn forge-control-btn"
                    onClick={handleForgeShuffle}
                    disabled={!forgeActive}
                    title="Shuffle unused tiles (Spacebar)"
                  >
                    <svg className="icon-svg" viewBox="0 0 24 24">
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                      <line x1="15" y1="15" x2="21" y2="21" />
                      <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                    <span>Shuffle</span>
                  </button>

                  <button
                    type="button"
                    className="icon-pill-btn forge-control-btn"
                    onClick={handleForgeNextWord}
                    disabled={!forgeActive}
                    title="Auto-shuffle to next word challenge"
                  >
                    <svg className="icon-svg" viewBox="0 0 24 24">
                      <polygon points="5 4 15 12 5 20 5 4" />
                      <line x1="19" y1="5" x2="19" y2="19" />
                    </svg>
                    <span>Next Word</span>
                  </button>

                  <button
                    type="button"
                    className="icon-pill-btn forge-control-btn"
                    onClick={handleForgeBackspace}
                    disabled={!forgeActive || forgeAssembled.length === 0}
                    title="Backspace last letter"
                  >
                    <svg className="icon-svg" viewBox="0 0 24 24">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                      <line x1="18" y1="9" x2="12" y2="15" />
                      <line x1="12" y1="9" x2="18" y2="15" />
                    </svg>
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    className="icon-pill-btn forge-control-btn"
                    onClick={handleForgeClear}
                    disabled={!forgeActive || forgeAssembled.length === 0}
                    title="Clear all letters (Esc)"
                  >
                    <span>Clear</span>
                  </button>

                  {forgeActive ? (
                    <button
                      type="button"
                      className="pill dig-btn forge-submit-btn"
                      onClick={() => executeForgeWord()}
                      disabled={forgeAssembled.length < 3}
                    >
                      Forge!
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pill dig-btn forge-submit-btn"
                      onClick={() => startForgeGame()}
                    >
                      Start Forge!
                    </button>
                  )}
                </div>

                {/* Forge Banter Feedback */}
                <div className="captain-scroll forge-scroll">
                  <span>&ldquo;{forgeBanter}&rdquo;</span>
                </div>

                {/* Discovered Words Feed */}
                {forgeWords.length > 0 && (
                  <div className="forge-words-feed">
                    <div className="forge-words-header">
                      <span className="forge-words-title">Forged Words ({forgeWords.length})</span>
                      <button
                        type="button"
                        className="starter-chip"
                        onClick={() => startForgeGame()}
                        style={{ fontSize: '10px', padding: '2px 8px' }}
                      >
                        New Rack
                      </button>
                    </div>
                    <div className="forge-words-list">
                      {forgeWords.map((w, idx) => (
                        <div key={idx} className="forge-word-pill">
                          <span className="forge-word-name">{w.word}</span>
                          <span className="forge-word-pts">+{w.points} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* TAB 2: THE VAULT (SEMANTIC CLIMB) */
              <>
                {/* 1. Primary Question & Controls Card */}
                <div className="question-card">
                  {/* Daily Clue & Riddle */}
                  <div className="daily-clue-header">
                    <span className="clue-tag">Realm: {dailyClue.category}</span>
                    <span className="clue-badge">DAILY CLUE</span>
                  </div>
                  <div className="clue-text">&ldquo;{dailyClue.hint}&rdquo;</div>

                  {/* Ship Horizon Distance Lifeline Gauge */}
                  <div className="lifeline-gauge">
                    <div className="gauge-header">
                      <span className="gauge-title">Ship Distance to Horizon</span>
                      <span className={`gauge-status ${remainingLeagues <= 1 ? 'danger' : ''}`}>
                        {remainingLeagues === 0 ? 'Ship Lost in Mist' : `${remainingLeagues} Leagues Remaining`}
                      </span>
                    </div>
                    <div className="gauge-track">
                      {[5, 4, 3, 2, 1].map((leagueNum, index) => {
                        const isLost = index < incorrectGuesses;
                        const isCritical = remainingLeagues <= 2;
                        return (
                          <div
                            key={leagueNum}
                            className={`gauge-knot ${isLost ? 'lost' : isCritical ? 'warning' : 'safe'}`}
                            title={`League ${leagueNum}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Input Form with Hands-Free Speech Microphone & Dig Button */}
                  <form onSubmit={handleClimbSubmit} className="input-row">
                    <input
                      ref={climbInputRef}
                      className="ink-input"
                      type="text"
                      value={climbInput}
                      onChange={(e) => setClimbInput(e.target.value)}
                      placeholder={
                        climbSolved
                          ? 'Vault unlocked!'
                          : remainingLeagues === 0
                          ? 'Ship stranded in mist'
                          : isRecording
                          ? 'Listening to speech...'
                          : 'Type any word...'
                      }
                      disabled={climbEvaluating || climbSolved || remainingLeagues === 0}
                      autoComplete="off"
                    />

                    <button
                      type="button"
                      className={`icon-pill-btn ${isRecording ? 'recording' : ''}`}
                      onClick={toggleListening}
                      title={!voiceEnabled ? 'Voice input disabled in Settings' : isRecording ? 'Listening... click to stop' : 'Speak your guess hands-free'}
                      aria-label="Microphone"
                      disabled={climbSolved || remainingLeagues === 0 || !voiceEnabled}
                    >
                      <svg className="icon-svg" viewBox="0 0 24 24">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </button>

                    <button
                      type="submit"
                      className="pill dig-btn"
                      disabled={climbEvaluating || climbSolved || remainingLeagues === 0}
                    >
                      Dig
                    </button>
                  </form>

                  {/* Persistent Quick Selects */}
                  {!climbSolved && remainingLeagues > 0 && quickSelectsEnabled && (
                    <div className="starter-chips-row">
                      <span className="starter-label">Quick Selects:</span>
                      {(dailyClue.quickSelects || (dailyClue.suggestions || ['Beacon', 'Tower', 'Ocean']).map((s) => ({ word: s }))).map((item) => {
                        const word = item.word || item;
                        const tested = climbGuesses.find(
                          (g) => g.guess.toLowerCase() === word.toLowerCase()
                        );
                        return (
                          <button
                            key={word}
                            type="button"
                            className={`starter-chip ${tested ? 'tested' : 'untested'}`}
                            onClick={() => !tested && handleQuickGuess(word)}
                            disabled={climbEvaluating || remainingLeagues === 0 || !!tested}
                            title={tested ? `Tested: #${tested.rank}` : `Quick select "${word}"`}
                          >
                            <span className="chip-word">{word}</span>
                            {tested && (
                              <span className={`chip-rank-tag ${tested.rank <= 300 ? 'hot' : tested.rank <= 1500 ? 'warm' : 'cold'}`}>
                                #{tested.rank}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {speechFeedback && (
                    <div className="speech-hint">
                      {speechFeedback}
                    </div>
                  )}
                </div>

                {/* 2. Answers Container - Rendered distinctly BELOW the question & input! */}
                {climbGuesses.length > 0 && (
                  <div className="answers-container">
                    <div className="answers-header">
                      <span className="answers-title">Cast Bearings ({climbGuesses.length})</span>
                      <span className="answers-subtitle">Closest concepts on top</span>
                    </div>
                    <div className="answers-list" ref={feedRef}>
                      {climbGuesses.map((g, i) => {
                        const statusClass = g.solved ? 'solved' : g.rank <= 300 ? 'hot' : g.rank <= 1500 ? 'warm' : 'cold';
                        const statusLabel = g.solved ? 'SOLVED' : g.rank <= 300 ? 'HOT' : g.rank <= 1500 ? 'WARM' : 'COLD';
                        return (
                          <div key={i} className={`answer-card ${statusClass}`}>
                            <div className="answer-card-header">
                              <span className={`rank-badge ${statusClass}`}>{statusLabel}</span>
                              <span className="answer-word">{g.guess}</span>
                              <span className="answer-rank">#{g.rank}</span>
                              {g.similarity != null && (
                                <span className="answer-sim-badge">{g.similarity}% sim</span>
                              )}
                            </div>
                            <div className="answer-card-footer">
                              <span>
                                {g.bearing
                                  ? g.bearing
                                  : g.solved
                                  ? 'Vault Unlocked!'
                                  : g.rank <= 300
                                  ? 'Burning hot bearing!'
                                  : g.rank <= 1500
                                  ? 'Warm shallows nearby.'
                                  : 'Cold waters. Ship drifts further.'}
                              </span>
                              <button
                                type="button"
                                className="pronounce-btn"
                                onClick={() => pronounceWord(g.guess)}
                                title="Hear pronunciation aloud"
                              >
                                <svg className="icon-svg" style={{ width: '12px', height: '12px' }} viewBox="0 0 24 24">
                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                                </svg>
                                Pronounce
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Dynamic Palm Shade Canvas (64x36) */}
        <canvas id="shade" ref={shadeCanvasRef} width="64" height="36" />
      </main>



      {/* Ship's Articles & Rules Modal */}
      <dialog
        ref={rulesDialogRef}
        className="rules-dialog"
        onClose={() => {
          if (typeof document !== 'undefined' && !document.querySelectorAll('dialog[open]').length) {
            document.documentElement.classList.remove('has-modal');
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeDialog(rulesDialogRef);
        }}
        onClick={(e) => handleDialogBackdropClick(e, rulesDialogRef)}
      >
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Ship&apos;s Articles &amp; Rules</h3>
            <div className="rules-modal-sub">Repyt Navigator&apos;s Codex</div>
          </div>
          <button className="icon-pill-btn" onClick={() => closeDialog(rulesDialogRef)} aria-label="Close modal">
            <svg className="icon-svg" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body rules-modal-body">
          {/* Section 1: The Vault */}
          <div className="rules-section-card">
            <div className="rules-card-title">
              <span className="rules-mode-badge">Game Mode 1</span>
              <h4>The Repyt Vault (Proximity Climb)</h4>
            </div>
            <p className="rules-card-intro">
              A secret daily concept is sealed in the golden vault. Repyt measures <strong>semantic vector proximity</strong> to guide your bearing:
            </p>

            <div className="rules-ranks-grid">
              <div className="rules-rank-item solved">
                <span className="rules-rank-tag solved">#1 SOLVED</span>
                <span className="rules-rank-info">Exact concept match unlocks the vault!</span>
              </div>
              <div className="rules-rank-item hot">
                <span className="rules-rank-tag hot">#2 – #300 HOT</span>
                <span className="rules-rank-info">Burning hot bearing! Direct synonym or core attribute.</span>
              </div>
              <div className="rules-rank-item warm">
                <span className="rules-rank-tag warm">#301 – #1,500 WARM</span>
                <span className="rules-rank-info">Warm shallows. Shared semantic domain or category.</span>
              </div>
              <div className="rules-rank-item cool">
                <span className="rules-rank-tag cool">#1,501 – #4,000 COOL</span>
                <span className="rules-rank-info">Cool breeze. Tangential or loose association.</span>
              </div>
              <div className="rules-rank-item cold">
                <span className="rules-rank-tag cold">#4,001+ COLD</span>
                <span className="rules-rank-info">Freezing waters. Distant or completely unrelated heading.</span>
              </div>
            </div>

            <div className="rules-lifeline-desc">
              <strong>The 5-League Horizon Lifeline:</strong> You have <strong>5 leagues (5, 4, 3, 2, 1)</strong> before your galleon fades into the mist. Each incorrect guess pushes your ship 1 league further. Reach #1 before all 5 leagues expire!
            </div>
          </div>

          {/* Section 2: Word Forge */}
          <div className="rules-section-card" style={{ marginTop: '12px' }}>
            <div className="rules-card-title">
              <span className="rules-mode-badge">Game Mode 2</span>
              <h4>Repyt Word Forge (Letter Joining)</h4>
            </div>
            <p className="rules-card-intro">
              Join letter tiles from your rack to forge valid nautical words before time expires:
            </p>
            <ul className="rules-list">
              <li><strong>60-Second Shift:</strong> Normal mode round timer. Forge as many words as possible!</li>
              <li><strong>Letter Joining:</strong> Click rack tiles or type on your keyboard to assemble words (3+ letters).</li>
              <li><strong>Auto-Shuffle:</strong> Letters are automatically scrambled to challenge your eye. Successfully forging a word immediately loads fresh scrambled tiles!</li>
              <li><strong>Word Scoring:</strong> 3 letters = 30 pts, 4 letters = 60 pts, 5 letters = 100 pts, 6 letters = 160 pts, 7+ letters = 260 pts!</li>
              <li><strong>Streaks &amp; Doubloons:</strong> Multipliers boost your score and earn gold doubloons for your logbook.</li>
            </ul>
          </div>

          {/* Section 3: Speech & Pronunciation */}
          <div className="rules-section-card" style={{ marginTop: '12px' }}>
            <div className="rules-card-title">
              <span className="rules-mode-badge">Feature</span>
              <h4>Voice &amp; Pronunciation Practice</h4>
            </div>
            <p className="rules-card-intro">
              Tap the <strong>Microphone</strong> icon to speak your guesses hands-free. Tap <strong>Pronounce</strong> on any word in your log to hear clear spoken pronunciation and earn <strong>+5 bonus doubloons</strong>!
            </p>
          </div>
        </div>
        <button className="pill" style={{ width: '100%' }} onClick={() => closeDialog(rulesDialogRef)}>
          Understood, Captain!
        </button>
      </dialog>

      {/* Navigator&apos;s Log Modal */}
      <dialog
        ref={statsDialogRef}
        onClose={() => {
          if (typeof document !== 'undefined' && !document.querySelectorAll('dialog[open]').length) {
            document.documentElement.classList.remove('has-modal');
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeDialog(statsDialogRef);
        }}
        onClick={(e) => handleDialogBackdropClick(e, statsDialogRef)}
      >
        <div className="modal-header">
          <h3 className="modal-title">Navigator&apos;s Log</h3>
          <button className="icon-pill-btn" onClick={() => closeDialog(statsDialogRef)} aria-label="Close modal">
            <svg className="icon-svg" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ font: '400 32px/1 "Goudy Bookletter 1911"', marginTop: '6px' }}>
              {pirateRank.title}
            </div>
            <div style={{ font: '700 12px/1 "Open Sans"', opacity: 0.6, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {pirateRank.badge} NAVIGATOR
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-lbl">Doubloons</div>
              <div className="stat-val" style={{ color: 'var(--gold)' }}>{stats.doubloons}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Voyages Completed</div>
              <div className="stat-val">{stats.gamesPlayed}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Speech Practiced</div>
              <div className="stat-val">{stats.speechPracticed}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Best Bearing</div>
              <div className="stat-val">
                {climbGuesses.length > 0 ? `#${Math.min(...climbGuesses.map((g) => g.rank))}` : 'None'}
              </div>
            </div>
          </div>

          {/* Daily Quests Section */}
          <div className="daily-quests-section">
            <div className="quests-header">
              <h4 className="quests-section-title">Daily Logbook Quests</h4>
              <span className="quests-sub">Earn bonus Gold doubloons</span>
            </div>
            <div className="quests-list">
              {dailyQuests.map((q) => (
                <div key={q.id} className={`quest-card ${q.completed ? 'completed' : ''}`}>
                  <div className="quest-info">
                    <div className="quest-title">{q.title}</div>
                    <div className="quest-desc">{q.desc}</div>
                    <div className="quest-progress-track">
                      <div
                        className="quest-progress-bar"
                        style={{ width: `${Math.min(100, (q.current / q.target) * 100)}%` }}
                      />
                    </div>
                    <div className="quest-progress-text">
                      {q.current} / {q.target} {q.completed ? '· Goal Reached!' : ''}
                    </div>
                  </div>
                  <div className="quest-action">
                    {q.claimed ? (
                      <span className="quest-claimed-badge">Claimed</span>
                    ) : q.completed ? (
                      <button
                        type="button"
                        className="pill quest-claim-btn"
                        onClick={() => handleClaimQuest(q.id)}
                      >
                        Claim +{q.reward} Gold
                      </button>
                    ) : (
                      <span className="quest-reward-tag">+{q.reward} Gold</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button className="pill" style={{ width: '100%' }} onClick={() => closeDialog(statsDialogRef)}>
          Close Log
        </button>
      </dialog>

      {/* Ship's Settings & Preferences Modal */}
      <dialog
        ref={settingsDialogRef}
        className="rules-dialog settings-dialog"
        onClose={() => {
          if (typeof document !== 'undefined' && !document.querySelectorAll('dialog[open]').length) {
            document.documentElement.classList.remove('has-modal');
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeDialog(settingsDialogRef);
        }}
        onClick={(e) => handleDialogBackdropClick(e, settingsDialogRef)}
      >
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Ship&apos;s Settings &amp; Preferences</h3>
            <div className="rules-modal-sub">Customise your Repyt voyage experience</div>
          </div>
          <button className="icon-pill-btn" onClick={() => closeDialog(settingsDialogRef)} aria-label="Close modal">
            <svg className="icon-svg" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body settings-modal-body">
          {/* Setting 1: Vault Quick Selects */}
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Vault Quick Selects</div>
              <div className="setting-desc">
                Display curated guess chips in the Vault. Includes the target answer among hot and warm semantic bearings.
              </div>
            </div>
            <label className="toggle-switch" title="Toggle Vault Quick Selects">
              <input
                type="checkbox"
                checked={quickSelectsEnabled}
                onChange={(e) => handleToggleQuickSelects(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Setting 2: Sound Effects & Ambience */}
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Sound Effects &amp; Audio</div>
              <div className="setting-desc">
                Synthesized sea bells, tile clicks, bearing alerts, streak fanfare, and victory cannons.
              </div>
            </div>
            <label className="toggle-switch" title="Toggle Sound Effects">
              <input
                type="checkbox"
                checked={!soundMuted}
                onChange={(e) => handleToggleSound(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Setting 3: Spoken Pronunciation */}
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Spoken Pronunciation</div>
              <div className="setting-desc">
                Audible text-to-speech pronunciation when tapping Pronounce on navigator log words.
              </div>
            </div>
            <label className="toggle-switch" title="Toggle Spoken Pronunciation">
              <input
                type="checkbox"
                checked={speechAudioEnabled}
                onChange={(e) => handleToggleSpeechAudio(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Setting 4: Hands-Free Voice Input */}
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Hands-Free Microphone</div>
              <div className="setting-desc">
                Enable voice recognition microphone to speak guesses and word forge letters aloud.
              </div>
            </div>
            <label className="toggle-switch" title="Toggle Microphone">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => handleToggleVoice(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Setting 5: Factory Reset */}
          <div className="settings-reset-card">
            <div className="setting-info">
              <div className="setting-label">Restore Settings</div>
              <div className="setting-desc">
                Reset all preferences to factory defaults.
              </div>
            </div>
            <button
              type="button"
              className="icon-pill-btn reset-prefs-btn"
              onClick={handleResetPreferences}
            >
              Reset Defaults
            </button>
          </div>
        </div>

        <button className="pill" style={{ width: '100%', marginTop: '12px' }} onClick={() => closeDialog(settingsDialogRef)}>
          Save &amp; Return to Sea
        </button>
      </dialog>

      {/* Ship Stranded Modal */}
      <dialog
        ref={strandedDialogRef}
        onClose={() => {
          if (typeof document !== 'undefined' && !document.querySelectorAll('dialog[open]').length) {
            document.documentElement.classList.remove('has-modal');
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeDialog(strandedDialogRef);
        }}
        onClick={(e) => handleDialogBackdropClick(e, strandedDialogRef)}
      >
        <div className="modal-header">
          <h3 className="modal-title">Voyage Lost in Mist</h3>
          <button className="icon-pill-btn" onClick={() => closeDialog(strandedDialogRef)} aria-label="Close modal">
            <svg className="icon-svg" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p>
            Your galleon drifted past the horizon after 5 missed leagues. Today&apos;s mystery concept was <strong>&ldquo;{dailyClue.targetWord || 'The Secret Concept'}&rdquo;</strong>.
          </p>
          <div className="stats-grid" style={{ margin: '14px 0 10px' }}>
            <div className="stat-card">
              <div className="stat-lbl">Attempts Made</div>
              <div className="stat-val">5 / 5</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Closest Bearing</div>
              <div className="stat-val">
                {climbGuesses.length > 0 ? `#${Math.min(...climbGuesses.map((g) => g.rank))}` : 'None'}
              </div>
            </div>
          </div>

          {/* Nearest Semantic Concepts Reveal */}
          {dailyClue.nearestNeighbors && dailyClue.nearestNeighbors.length > 0 && (
            <div className="nearest-reveal-section">
              <div className="nearest-reveal-title">Top Closest Concepts in English:</div>
              <div className="nearest-reveal-grid">
                {dailyClue.nearestNeighbors.map((n, idx) => (
                  <div key={idx} className="nearest-neighbor-pill">
                    <span className="neighbor-rank">#{n.rank}</span>
                    <span className="neighbor-word">{n.word}</span>
                    <span className="neighbor-sim">{n.similarity}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="pill share-btn" onClick={shareVoyageResults} style={{ width: '100%', marginBottom: '8px' }}>
          Share Voyage (Copy Grid)
        </button>
        <button className="pill" style={{ width: '100%' }} onClick={resetVoyage}>
          Chart New Course
        </button>
      </dialog>

      {/* Victory / Vault Unlocked Modal */}
      <dialog
        ref={victoryDialogRef}
        onClose={() => {
          if (typeof document !== 'undefined' && !document.querySelectorAll('dialog[open]').length) {
            document.documentElement.classList.remove('has-modal');
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeDialog(victoryDialogRef);
        }}
        onClick={(e) => handleDialogBackdropClick(e, victoryDialogRef)}
      >
        <div className="modal-header">
          <h3 className="modal-title">Vault Unlocked!</h3>
          <button className="icon-pill-btn" onClick={() => closeDialog(victoryDialogRef)} aria-label="Close modal">
            <svg className="icon-svg" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p>
            Splendid navigation! You uncovered today&apos;s secret concept and opened the Repyt Vault!
          </p>
          <div className="stats-grid" style={{ margin: '14px 0 10px' }}>
            <div className="stat-card">
              <div className="stat-lbl">Leagues Spared</div>
              <div className="stat-val" style={{ color: 'var(--emerald)' }}>{remainingLeagues}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Bounty Awarded</div>
              <div className="stat-val" style={{ color: 'var(--gold)' }}>+150 Gold</div>
            </div>
          </div>

          {/* Nearest Semantic Concepts Reveal */}
          {dailyClue.nearestNeighbors && dailyClue.nearestNeighbors.length > 0 && (
            <div className="nearest-reveal-section">
              <div className="nearest-reveal-title">Top Closest Concepts in English:</div>
              <div className="nearest-reveal-grid">
                {dailyClue.nearestNeighbors.map((n, idx) => (
                  <div key={idx} className="nearest-neighbor-pill">
                    <span className="neighbor-rank">#{n.rank}</span>
                    <span className="neighbor-word">{n.word}</span>
                    <span className="neighbor-sim">{n.similarity}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="pill share-btn" onClick={shareVoyageResults} style={{ width: '100%', marginBottom: '8px' }}>
          Share Voyage (Copy Grid)
        </button>
        <button className="pill" style={{ width: '100%' }} onClick={resetVoyage}>
          Embark on Next Voyage
        </button>
      </dialog>

      {/* Word Forge Shift Concluded Modal */}
      <dialog
        ref={forgeGameOverDialogRef}
        onClose={() => {
          if (typeof document !== 'undefined' && !document.querySelectorAll('dialog[open]').length) {
            document.documentElement.classList.remove('has-modal');
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeDialog(forgeGameOverDialogRef);
        }}
        onClick={(e) => handleDialogBackdropClick(e, forgeGameOverDialogRef)}
      >
        <div className="modal-header">
          <h3 className="modal-title">Forge Shift Concluded!</h3>
          <button className="icon-pill-btn" onClick={() => closeDialog(forgeGameOverDialogRef)} aria-label="Close modal">
            <svg className="icon-svg" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p>{forgeResult?.reason || 'The 60-second forge timer has elapsed.'}</p>
          <div className="stats-grid" style={{ margin: '18px 0' }}>
            <div className="stat-card">
              <div className="stat-lbl">Final Score</div>
              <div className="stat-val" style={{ color: 'var(--gold)' }}>{forgeResult?.score || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Words Forged</div>
              <div className="stat-val">{forgeResult?.wordsCount || 0} Words</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Best Streak</div>
              <div className="stat-val">{forgeResult?.streak || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Bounty Awarded</div>
              <div className="stat-val" style={{ color: 'var(--emerald)' }}>+{forgeResult?.earnedDoubloons || 0} Gold</div>
            </div>
          </div>

          {/* List of Forged Words */}
          {forgeResult?.wordsList && forgeResult.wordsList.length > 0 && (
            <div className="nearest-reveal-section">
              <div className="nearest-reveal-title">Forged in this shift:</div>
              <div className="forge-words-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {forgeResult.wordsList.map((w, idx) => (
                  <div key={idx} className="forge-word-pill">
                    <span className="forge-word-name">{w.word}</span>
                    <span className="forge-word-pts">+{w.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className="pill"
            style={{ width: '100%' }}
            onClick={() => {
              closeDialog(forgeGameOverDialogRef);
              startForgeGame();
            }}
          >
            Forge Next Rack!
          </button>
          <button
            className="pill"
            style={{ width: '100%', background: '#eae4d3', color: 'var(--ink)' }}
            onClick={() => {
              closeDialog(forgeGameOverDialogRef);
              goToScene(0);
            }}
          >
            Return to Sea
          </button>
        </div>
      </dialog>

      {/* Share Toast Banner */}
      {shareToast && (
        <div className="share-toast-banner">
          {shareToast}
        </div>
      )}
    </>
  );
}
