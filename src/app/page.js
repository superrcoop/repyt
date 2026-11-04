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

  // Active Game Mode: 'vault' | 'tennis'
  const [activeTab, setActiveTab] = useState('vault');

  // Word Tennis (Repyt Chain) Game State
  const [tennisActive, setTennisActive] = useState(false);
  const [tennisWord, setTennisWord] = useState('Ocean');
  const [tennisInput, setTennisInput] = useState('');
  const [tennisTimer, setTennisTimer] = useState(15);
  const [tennisStreak, setTennisStreak] = useState(0);
  const [tennisScore, setTennisScore] = useState(0);
  const [tennisEvaluating, setTennisEvaluating] = useState(false);
  const [tennisBanter, setTennisBanter] = useState(
    'AI serves the opening word. Return an associative word within 15 seconds!'
  );
  const [tennisHistory, setTennisHistory] = useState([]);
  const [tennisResult, setTennisResult] = useState(null);
  const tennisInputRef = useRef(null);
  const tennisGameOverDialogRef = useRef(null);

  // Selectable AI Captains in Word Tennis: 'barnaby' | 'siren' | 'blackbeard'
  const [tennisCaptain, setTennisCaptain] = useState('siren');

  // Daily Quests
  const [dailyQuests, setDailyQuests] = useState([]);
  const [shareToast, setShareToast] = useState('');

  // Dialog refs
  const statsDialogRef = useRef(null);
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
    setStats(getPlayerStats());

    // Load Daily Logbook Quests
    setDailyQuests(getDailyQuests());

    // Fetch daily clue from API
    fetch('/api/semantic-climb')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.category) {
          setDailyClue(data);
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

  // 3. Camera Transition Trigger
  const goToScene = useCallback((target) => {
    const now = performance.now();
    const tr = transitionRef.current;
    if (tr.pTo === target) return;

    tr.pFrom = tr.p;
    tr.pTo = target;
    tr.pT0 = now;
    setSceneIndex(target);
    sound.shipBell();
  }, []);

  const handleStartVoyage = useCallback(() => {
    goToScene(1);
    setTimeout(() => {
      climbInputRef.current?.focus();
    }, 700);
  }, [goToScene]);

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

    if (activeTab === 'tennis') {
      setTennisInput(spokenWord);
      executeTennisVolley(spokenWord);
    } else {
      setClimbInput(spokenWord);
      executeClimbGuess(spokenWord);
    }
  };

  // Word Tennis Volley Countdown Timer
  useEffect(() => {
    if (!tennisActive || tennisEvaluating) return;

    const interval = setInterval(() => {
      setTennisTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTennisTimeout();
          return 0;
        }
        if (prev <= 4) {
          sound.tick();
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [tennisActive, tennisEvaluating]);

  const getInitialTimer = (captain) => {
    if (captain === 'barnaby') return 20;
    if (captain === 'blackbeard') return 10;
    return 15;
  };

  const getCaptainMultiplier = (captain) => {
    if (captain === 'blackbeard') return 2.0;
    if (captain === 'siren') return 1.5;
    return 1.0;
  };

  const handleTennisTimeout = () => {
    sound.gameOver();
    setTennisActive(false);
    const captainMult = getCaptainMultiplier(tennisCaptain);
    const earnedDoubloons = Math.floor((tennisScore / 10) * captainMult);
    const updated = recordChainGame(tennisScore, tennisStreak, tennisHistory.length, earnedDoubloons);
    if (updated) setStats(updated);

    const clockName = tennisCaptain === 'blackbeard' ? '10' : tennisCaptain === 'barnaby' ? '20' : '15';
    setTennisResult({
      score: tennisScore,
      streak: tennisStreak,
      wordsCount: tennisHistory.length,
      earnedDoubloons,
      reason: `${clockName}-second volley clock expired!`
    });
    setTennisBanter('Time expired! The volley dropped into the sea.');
    openDialog(tennisGameOverDialogRef);
  };

  const startTennisGame = () => {
    const starterWords = ['Ocean', 'Galaxy', 'Horizon', 'Phoenix', 'Tempest', 'Compass', 'Solar', 'Voyage'];
    const initial = starterWords[Math.floor(Math.random() * starterWords.length)];
    const initTimer = getInitialTimer(tennisCaptain);
    setTennisWord(initial);
    setTennisStreak(0);
    setTennisScore(0);
    setTennisHistory([]);
    setTennisTimer(initTimer);
    setTennisActive(true);
    setTennisBanter(`Opponent serves "${initial}"! Return an associative word quickly!`);
    sound.shipBell();
    setTimeout(() => {
      tennisInputRef.current?.focus();
    }, 200);
  };

  const executeTennisVolley = async (wordToPlay) => {
    const play = (wordToPlay || tennisInput || '').trim();
    if (!play || !tennisActive || tennisEvaluating) return;

    setTennisInput('');
    setTennisEvaluating(true);

    try {
      const res = await fetch('/api/word-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentWord: tennisWord,
          playerWord: play,
          history: tennisHistory.flatMap((h) => [h.playerWord, h.counterWord]),
          theme: 'nautical',
          captain: tennisCaptain,
        }),
      });

      const data = await res.json();

      if (data.valid) {
        const nextStreak = tennisStreak + 1;
        const multiplier = 1 + Math.floor(tennisStreak / 5) * 0.5;
        const roundScore = Math.round((data.score || 50) * multiplier);
        const nextScore = tennisScore + roundScore;

        sound.correct(nextStreak);
        if (nextStreak % 5 === 0) {
          sound.streak();
          triggerConfetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        }

        // Daily Quest: Rally Commander (5+ volleys)
        if (nextStreak >= 5) {
          const updatedQ = updateQuestProgress('quest_tennis', 1);
          setDailyQuests(updatedQ);
        }

        setTennisStreak(nextStreak);
        setTennisScore(nextScore);
        setTennisWord(data.counterWord || 'Pulse');
        setTennisBanter(data.banter || 'Sharp return!');
        setTennisHistory((prev) => [
          {
            servedWord: tennisWord,
            playerWord: play,
            counterWord: data.counterWord,
            score: roundScore,
            banter: data.banter,
          },
          ...prev,
        ]);

        const baseClock = getInitialTimer(tennisCaptain);
        const minClock = tennisCaptain === 'blackbeard' ? 6 : tennisCaptain === 'barnaby' ? 12 : 9;
        const nextTimer = Math.max(minClock, baseClock - Math.floor(nextStreak / 4));
        setTennisTimer(nextTimer);
      } else {
        sound.error();
        setTennisActive(false);
        const captainMult = getCaptainMultiplier(tennisCaptain);
        const earnedDoubloons = Math.floor((tennisScore / 10) * captainMult);
        const updated = recordChainGame(tennisScore, tennisStreak, tennisHistory.length, earnedDoubloons);
        if (updated) setStats(updated);

        setTennisResult({
          score: tennisScore,
          streak: tennisStreak,
          wordsCount: tennisHistory.length,
          earnedDoubloons,
          reason: data.reason || 'Invalid word association or repeat!'
        });
        setTennisBanter(data.banter || 'Foul return! Rally ended.');
        openDialog(tennisGameOverDialogRef);
      }
    } catch (err) {
      console.error(err);
      sound.error();
      setTennisBanter('The referee faltered. Try your return once more.');
    } finally {
      setTennisEvaluating(false);
    }
  };

  // 6. Speech Pronunciation Teaching Action
  const pronounceWord = (word) => {
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

  // Dialog helpers with Modal Cursor Restoration
  const openDialog = (ref) => {
    ref.current?.showModal();
    document.documentElement.classList.add('has-modal');
  };

  const closeDialog = (ref) => {
    ref.current?.close();
    document.documentElement.classList.remove('has-modal');
  };

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    sound.setMuted(next);
    savePreferences({ sound: !next });
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
          >
            Voyage
            <svg viewBox="0 0 17 21" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <circle cx="8.5" cy="3" r="1.8" />
              <path d="M8.5 5V18M4.5 8h8M1.5 12.5c.4 3.5 3.5 6 7 6s6.5-2.5 7-6" />
            </svg>
          </a>

          <a
            href="#vault"
            onClick={(e) => { e.preventDefault(); setActiveTab('vault'); goToScene(1); }}
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
            href="#tennis"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('tennis');
              goToScene(1);
              if (!tennisActive && tennisHistory.length === 0) {
                startTennisGame();
              }
            }}
            title="Word Tennis AI Rally"
            className={sceneIndex === 1 && activeTab === 'tennis' ? 'nav-link-active' : ''}
          >
            Tennis
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </a>


          <button onClick={() => openDialog(statsDialogRef)} title="Navigator's Log">
            Log
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
            {/* Vault Header with mode tabs & Back to Sea button */}
            <div className="vault-header">
              <div className="vault-title-wrap">
                <h2 id="h2" ref={h2Ref}>
                  {activeTab === 'tennis' ? <>Repyt<br />Tennis</> : <>The Repyt<br />Vault</>}
                </h2>
                <p id="p2" ref={p2Ref}>
                  {activeTab === 'tennis'
                    ? "High-speed associative word rally against the AI. Keep the volley alive!"
                    : "Deduce today's secret concept to open the golden vault."}
                </p>
              </div>

              <div className="vault-nav-actions">
                {/* Game Mode Selector Tabs */}
                <div className="mode-toggle-group">
                  <button
                    type="button"
                    className={`mode-tab-btn ${activeTab === 'vault' ? 'active' : ''}`}
                    onClick={() => setActiveTab('vault')}
                    title="Deduce the secret daily concept"
                  >
                    The Vault
                  </button>
                  <button
                    type="button"
                    className={`mode-tab-btn ${activeTab === 'tennis' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('tennis');
                      if (!tennisActive && tennisHistory.length === 0) {
                        startTennisGame();
                      }
                    }}
                    title="Play speed word tennis vs AI"
                  >
                    Word Tennis
                  </button>
                </div>

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

            {/* TAB 1: REPYT WORD TENNIS ARENA */}
            {activeTab === 'tennis' ? (
              <div className="question-card tennis-arena-card">
                <div className="tennis-arena-header">
                  <div className="tennis-status-wrap">
                    <span className="clue-tag">Word Tennis Rally</span>
                    <span className="tennis-streak-badge">
                      Streak: {tennisStreak} (x{(1 + Math.floor(tennisStreak / 5) * 0.5).toFixed(1)})
                    </span>
                  </div>
                  <div className="tennis-hud-stats">
                    <span className={`tennis-timer-pill ${tennisTimer <= 4 ? 'urgent' : tennisTimer <= 8 ? 'warning' : ''}`}>
                      {tennisTimer}s
                    </span>
                    <span className="tennis-score-badge">
                      {tennisScore} Pts
                    </span>
                  </div>
                </div>

                {/* Selectable AI Opponent Captains */}
                <div className="tennis-captain-selector">
                  <span className="captain-select-label">Opponent:</span>
                  {[
                    { id: 'barnaby', name: 'Old Barnaby', tier: 'Novice', clock: '20s', mult: '1.0x' },
                    { id: 'siren', name: 'The Siren', tier: 'Mystic', clock: '15s', mult: '1.5x' },
                    { id: 'blackbeard', name: 'Blackbeard', tier: 'Veteran', clock: '10s', mult: '2.0x' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`captain-chip ${tennisCaptain === c.id ? 'active' : ''}`}
                      onClick={() => {
                        if (!tennisActive) {
                          setTennisCaptain(c.id);
                          setTennisTimer(getInitialTimer(c.id));
                        }
                      }}
                      disabled={tennisActive}
                      title={`${c.name} (${c.clock} Clock, ${c.mult} Gold Bounty)`}
                    >
                      <span className="captain-chip-icon">[{c.tier}]</span>
                      <span className="captain-chip-name">{c.name}</span>
                      <span className="captain-chip-bounty">{c.clock} · {c.mult}</span>
                    </button>
                  ))}
                </div>

                {/* AI Served Active Word */}
                <div className="tennis-served-section">
                  <div className="tennis-served-label">AI Served Word:</div>
                  <div className="tennis-served-word">{tennisWord}</div>
                  <div className="tennis-instruction">
                    Return a creative associative word within <strong>{tennisTimer} seconds</strong>! No duplicates in this rally.
                  </div>
                </div>

                {/* Volley Return Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    executeTennisVolley(tennisInput);
                  }}
                  className="input-row"
                >
                  <input
                    ref={tennisInputRef}
                    className="ink-input"
                    type="text"
                    value={tennisInput}
                    onChange={(e) => setTennisInput(e.target.value)}
                    placeholder={
                      !tennisActive
                        ? 'Rally idle... click Serve to play!'
                        : isRecording
                        ? 'Listening to speech...'
                        : 'Type your associative return word...'
                    }
                    disabled={!tennisActive || tennisEvaluating}
                    autoComplete="off"
                  />

                  <button
                    type="button"
                    className={`icon-pill-btn ${isRecording ? 'recording' : ''}`}
                    onClick={toggleListening}
                    title={isRecording ? 'Listening... click to stop' : 'Speak return word hands-free'}
                    aria-label="Microphone"
                    disabled={!tennisActive}
                  >
                    <svg className="icon-svg" viewBox="0 0 24 24">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>

                  {tennisActive ? (
                    <button
                      type="submit"
                      className="pill dig-btn tennis-hit-btn"
                      disabled={tennisEvaluating || !tennisInput.trim()}
                    >
                      {tennisEvaluating ? 'Judging...' : 'Hit!'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pill dig-btn tennis-hit-btn"
                      onClick={startTennisGame}
                    >
                      Serve!
                    </button>
                  )}
                </form>

                {/* Referee Banter Scroll */}
                <div className="captain-scroll">
                  <span>&ldquo;{tennisBanter}&rdquo;</span>
                </div>

                {speechFeedback && (
                  <div className="speech-hint">{speechFeedback}</div>
                )}

                {/* Volley History Feed */}
                {tennisHistory.length > 0 && (
                  <div className="tennis-history-feed">
                    <div className="tennis-history-header">
                      <span className="tennis-history-title">Rally Volleys ({tennisHistory.length})</span>
                      <button
                        type="button"
                        className="starter-chip"
                        onClick={startTennisGame}
                        style={{ fontSize: '10px', padding: '2px 8px' }}
                      >
                        New Serve
                      </button>
                    </div>
                    <div className="tennis-volleys-list">
                      {tennisHistory.map((h, idx) => (
                        <div key={idx} className="tennis-volley-item">
                          <span className="volley-order">#{tennisHistory.length - idx}</span>
                          <span className="volley-served">{h.servedWord}</span>
                          <span className="volley-arrow">-&gt;</span>
                          <span className="volley-return">{h.playerWord}</span>
                          <span className="volley-score">+{h.score} pts</span>
                          <span className="volley-counter">AI: &ldquo;{h.counterWord}&rdquo;</span>
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
                      title={isRecording ? 'Listening... click to stop' : 'Speak your guess hands-free'}
                      aria-label="Microphone"
                      disabled={climbSolved || remainingLeagues === 0}
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

                  {/* Starter Bearing Suggestions */}
                  {climbGuesses.length === 0 && !climbSolved && (
                    <div className="starter-chips-row">
                      <span className="starter-label">Try a starting word:</span>
                      {(dailyClue.suggestions || ['Beacon', 'Tower', 'Ocean']).map((sugg) => (
                        <button
                          key={sugg}
                          type="button"
                          className="starter-chip"
                          onClick={() => handleQuickGuess(sugg)}
                          disabled={climbEvaluating || remainingLeagues === 0}
                        >
                          {sugg}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Helmsman Banter Scroll */}
                  <div className="captain-scroll">
                    <span>&ldquo;{captainBanter}&rdquo;</span>
                  </div>

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



      {/* Navigator&apos;s Log Modal */}
      <dialog
        ref={statsDialogRef}
        onClose={() => document.documentElement.classList.remove('has-modal')}
        onClick={(e) => e.target === statsDialogRef.current && closeDialog(statsDialogRef)}
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

      {/* Ship Stranded Modal */}
      <dialog
        ref={strandedDialogRef}
        onClose={() => document.documentElement.classList.remove('has-modal')}
        onClick={(e) => e.target === strandedDialogRef.current && closeDialog(strandedDialogRef)}
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
        onClose={() => document.documentElement.classList.remove('has-modal')}
        onClick={(e) => e.target === victoryDialogRef.current && closeDialog(victoryDialogRef)}
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



      {/* Word Tennis Rally Concluded Modal */}
      <dialog
        ref={tennisGameOverDialogRef}
        onClose={() => document.documentElement.classList.remove('has-modal')}
        onClick={(e) => e.target === tennisGameOverDialogRef.current && closeDialog(tennisGameOverDialogRef)}
      >
        <div className="modal-header">
          <h3 className="modal-title">Rally Concluded!</h3>
          <button className="icon-pill-btn" onClick={() => closeDialog(tennisGameOverDialogRef)} aria-label="Close modal">
            <svg className="icon-svg" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p>{tennisResult?.reason || 'The word volley has dropped into the sea.'}</p>
          <div className="stats-grid" style={{ margin: '18px 0' }}>
            <div className="stat-card">
              <div className="stat-lbl">Final Score</div>
              <div className="stat-val" style={{ color: 'var(--gold)' }}>{tennisResult?.score || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Rally Length</div>
              <div className="stat-val">{tennisResult?.wordsCount || 0} Volleys</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Best Streak</div>
              <div className="stat-val">{tennisResult?.streak || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Bounty Awarded</div>
              <div className="stat-val" style={{ color: 'var(--emerald)' }}>+{tennisResult?.earnedDoubloons || 0} Gold</div>
            </div>
          </div>
        </div>
        <button
          className="pill"
          style={{ width: '100%' }}
          onClick={() => {
            closeDialog(tennisGameOverDialogRef);
            startTennisGame();
          }}
        >
          Serve Next Rally!
        </button>
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
