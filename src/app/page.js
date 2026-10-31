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
} from '../lib/storage';

// Higgsfield high-res transparent PNG assets
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

const LAY = {
  land: {
    w: 1600, h: 900,
    wave: { y0: 748, y1: 272, gap0: 1, gap1: 0.6 },
    ship: { x0: 1130, w0: 710, x1: 1345, w1: 176 },
    palm: { x: -92, y: -112, w: 620 },
    capt: { x: 120, y: 318, w: 540 },
    chest: { x: 640, y: 628, w: 200 },
    bushL: { x: 96, y: 716, w: 700 },
    bushR: { x: 1370, y: 740, w: 300 }
  },
  port: {
    w: 800, h: 1500,
    wave: { y0: 1300, y1: 430, gap0: 1, gap1: 0.7 },
    ship: { x0: 420, w0: 620, x1: 640, w1: 150 },
    palm: { x: -150, y: -60, w: 560 },
    capt: { x: 20, y: 440, w: 600 },
    chest: { x: 560, y: 830, w: 190 },
    bushL: { x: -40, y: 1330, w: 520 },
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

const STARTER_WORDS = [
  'Galleon', 'Anchor', 'Compass', 'Ocean', 'Horizon',
  'Tempest', 'Island', 'Treasure', 'Corsair', 'Voyage'
];

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

export default function SaltwakeRepytGame() {
  // Game & Navigation state
  const [sceneIndex, setSceneIndex] = useState(0); // 0 = Sea (Voyage), 1 = Island (Treasure)
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

  // Word Tennis (Scene 0) state
  const [chainState, setChainState] = useState('idle'); // 'idle' | 'playing' | 'evaluating' | 'gameover'
  const [currentWord, setCurrentWord] = useState('Ocean');
  const [playerInput, setPlayerInput] = useState('');
  const [history, setHistory] = useState(['Ocean']);
  const [rallyFeed, setRallyFeed] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [captainBanter, setCaptainBanter] = useState('Welcome aboard, sailor! Speak or enter a word linked to the sea.');
  const [errorMessage, setErrorMessage] = useState('');

  // Daily Treasure Climb (Scene 1) state
  const [climbGuesses, setClimbGuesses] = useState([]);
  const [climbInput, setClimbInput] = useState('');
  const [climbEvaluating, setClimbEvaluating] = useState(false);
  const [climbSolved, setClimbSolved] = useState(false);

  // Dialog refs
  const rulesDialogRef = useRef(null);
  const statsDialogRef = useRef(null);
  const speechDialogRef = useRef(null);
  const gameOverDialogRef = useRef(null);
  const inputRef = useRef(null);
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
  const btn2Ref = useRef(null);
  const t2Ref = useRef(null);
  const curRef = useRef(null);
  const pingRef = useRef(null);

  // Transition engine refs
  const transitionRef = useRef({
    p: 0,
    pFrom: 0,
    pTo: 0,
    pT0: 0,
    duration: 2100,
    lockedUntil: 0
  });

  // Speech Recognition ref
  const recognitionRef = useRef(null);

  // 1. Initial Setup: Audio, Stats, Speech Recognition
  useEffect(() => {
    const prefs = getPreferences();
    setSoundMuted(!prefs.sound);
    sound.setMuted(!prefs.sound);
    setStats(getPlayerStats());

    // Check fine cursor
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      document.documentElement.classList.add('fine');
    }

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
      [-12, 74, 22, 56, 6]
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

  // 4. Saltwake 60FPS Render Loop
  useEffect(() => {
    let animId;
    const t0 = performance.now();

    // Mouse coordinates for ring cursor
    let mx = -100;
    let my = -100;
    let cx = -100;
    let cy = -100;
    let isPressed = false;
    let isOverLink = false;

    const onPointerMove = (e) => {
      mx = e.clientX;
      my = e.clientY;
      const target = e.target;
      isOverLink = Boolean(target && (target.closest('a') || target.closest('button') || target.closest('.pill')));
    };

    const onPointerDown = (e) => {
      isPressed = true;
      const ping = pingRef.current;
      if (ping) {
        ping.style.left = `${e.clientX}px`;
        ping.style.top = `${e.clientY}px`;
        ping.style.opacity = '1';
        ping.style.transform = 'scale(1)';
        ping.animate([
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(2.9)', opacity: 0 }
        ], { duration: 650, easing: 'ease-out', fill: 'forwards' });
      }
    };

    const onPointerUp = () => {
      isPressed = false;
    };

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

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
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

      // Ship positioning & rocking
      if (shipRef.current) {
        const c = L.ship;
        const sw = mix(c.w0, c.w1, p);
        const sx = mix(c.x0, c.x1, p);
        const sh = sw * 2002 / 1961;
        const wy = yAt(FRONT_WAVES[0], sx, t, p, L);
        const slope = (yAt(FRONT_WAVES[0], sx + 90, t, p, L) - yAt(FRONT_WAVES[0], sx - 90, t, p, L)) / 180;
        const rot = Math.atan(slope) * 57.3 * 0.75;

        shipRef.current.style.width = `${sw}px`;
        shipRef.current.style.height = `${sh}px`;
        shipRef.current.style.left = `${sx - sw / 2}px`;
        shipRef.current.style.top = `${wy + sw * 0.05 - sh}px`;
        shipRef.current.style.transform = `rotate(${rot}deg)`;
      }

      // Cloud drift
      if (cloudRef.current) {
        const cloudX = ((L.w * 0.72 - t * 16) % (L.w + 700)) - 400;
        cloudRef.current.style.left = `${cloudX}px`;
        cloudRef.current.style.top = portrait ? '110px' : '150px';
        cloudRef.current.style.opacity = `${1 - seg(p, 0.3, 0.7)}`;
      }

      // Intro & Copy transitions
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

      // Island texts (h2, p2, btn2)
      if (h2Ref.current) {
        const hk = seg(p, 0.42, 0.82);
        h2Ref.current.style.opacity = `${hk * hk}`;
        h2Ref.current.style.transform = `translateY(${mix(70, 0, out(hk))}px)`;
      }

      if (p2Ref.current) {
        const pk = seg(p, 0.76, 0.92);
        p2Ref.current.style.opacity = `${pk}`;
        p2Ref.current.style.transform = `translateY(${mix(16, 0, pk)}px)`;
      }

      if (btn2Ref.current) {
        const bk = seg(p, 0.86, 1);
        btn2Ref.current.style.opacity = `${bk}`;
        btn2Ref.current.style.transform = `scale(${mix(0.7, 1, back(bk))})`;
      }

      if (t2Ref.current) {
        t2Ref.current.style.pointerEvents = p > 0.9 ? 'auto' : 'none';
      }

      // Palm shade canvas dynamic drift
      if (shadeCanvasRef.current) {
        const sxTrans = Math.sin(t * 0.35) * 2.2;
        const syTrans = Math.cos(t * 0.27) * 1.6;
        const sRot = Math.sin(t * 0.22) * 0.8;
        shadeCanvasRef.current.style.transform = `translate(${sxTrans}%, ${syTrans}%) rotate(${sRot}deg)`;
      }

      // Cursor physics easing
      if (curRef.current) {
        const fCur = 1 - Math.exp(-dt * 22);
        cx += (mx - cx) * fCur;
        cy += (my - cy) * fCur;
        const curScale = isPressed ? 0.7 : isOverLink ? 1.35 : 1.0;
        curRef.current.style.left = `${cx}px`;
        curRef.current.style.top = `${cy}px`;
        curRef.current.style.transform = `scale(${curScale})`;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('wheel', onWheel);
    };
  }, [goToScene]);

  // 5. Timer loop for Word Tennis (Scene 0)
  useEffect(() => {
    let interval = null;
    if (chainState === 'playing') {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimeExpired();
            return 0;
          }
          if (prev <= 4) {
            sound.tick();
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [chainState, streak, score, currentWord]);

  // 6. Voice Recognition Toggle & Handling
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
        setSpeechFeedback('Listening... speak your word clearly!');
      } catch (e) {
        console.warn('Speech start error:', e);
      }
    }
  };

  const handleSpokenWord = (spokenText) => {
    // Extract first clean word
    const words = spokenText.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
    const spokenWord = words[0];
    if (!spokenWord) return;

    setSpeechFeedback(`Heard: "${spokenWord}"`);
    setTimeout(() => setSpeechFeedback(''), 3000);

    if (sceneIndex === 0) {
      // Word Tennis
      if (chainState === 'playing') {
        executeWordSubmission(spokenWord);
      } else {
        setPlayerInput(spokenWord);
      }
    } else {
      // The Daily Climb
      setClimbInput(spokenWord);
      executeClimbGuess(spokenWord);
    }
  };

  // 7. Speech Pronunciation Teaching Action
  const pronounceWord = (word) => {
    sound.speakWord(word, () => {
      // Award doubloons for speech practice
      const updated = recordSpeechPractice();
      if (updated) setStats(updated);
    });
  };

  // 8. Word Tennis Game Lifecycle
  const startChainGame = () => {
    const randomStarter = STARTER_WORDS[Math.floor(Math.random() * STARTER_WORDS.length)];
    setCurrentWord(randomStarter);
    setHistory([randomStarter]);
    setRallyFeed([]);
    setScore(0);
    setStreak(0);
    setTimeLeft(15);
    setCaptainBanter(`All hands on deck! Give me a creative word associated with "${randomStarter}"!`);
    setErrorMessage('');
    setChainState('playing');
    sound.shipBell();

    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  };

  const handleTimeExpired = () => {
    sound.gameOver();
    setChainState('gameover');
    setCaptainBanter('Turn timer expired! The rally has concluded.');
    const earnedDoubloons = Math.floor(score / 20) + streak * 2;
    const updated = recordChainGame(score, streak, rallyFeed.length, earnedDoubloons);
    if (updated) setStats(updated);
    openDialog(gameOverDialogRef);
  };

  // Optimistic Zero-Latency Submission Engine
  const executeWordSubmission = async (guessWord) => {
    const guess = (guessWord || '').trim();
    if (!guess) return;

    setPlayerInput('');
    setErrorMessage('');

    // Check immediate repeats locally (0ms)
    const normHist = history.map((w) => w.toLowerCase().trim());
    if (normHist.includes(guess.toLowerCase())) {
      sound.error();
      setErrorMessage(`"${guess}" was already spoken on this voyage!`);
      setCaptainBanter('No repeating words already logged in the ship’s log!');
      return;
    }

    // Optimistic fast acceptance chime!
    const nextStreak = streak + 1;
    sound.correct(nextStreak);
    sound.coin();

    setChainState('evaluating');

    try {
      const res = await fetch('/api/word-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentWord,
          playerWord: guess,
          history,
        }),
      });

      const data = await res.json();

      if (!data.valid) {
        sound.error();
        setErrorMessage(data.reason || 'Word association rejected!');
        setCaptainBanter(data.banter || 'The Captain frowns upon that link!');
        setChainState('playing');
        return;
      }

      // Validated by AI!
      const turnScore = (data.score || 60) + nextStreak * 15;
      const newScore = score + turnScore;
      const counterWord = data.counterWord || 'Horizon';

      if (nextStreak % 5 === 0) {
        sound.streak();
        triggerConfetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      }

      setRallyFeed((prev) => [
        { playerWord: guess, aiWord: counterWord, score: turnScore, banter: data.banter },
        ...prev
      ]);

      setCurrentWord(counterWord);
      setHistory((prev) => [...prev, guess, counterWord]);
      setScore(newScore);
      setStreak(nextStreak);
      setTimeLeft(Math.max(7, 15 - Math.floor(nextStreak / 3)));
      setCaptainBanter(data.banter || 'Clean return, sailor!');
      setChainState('playing');

      // Auto-pronounce AI word to teach speech
      sound.speakWord(counterWord);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } catch (err) {
      console.error(err);
      sound.error();
      setErrorMessage('Communication error with ship helm.');
      setChainState('playing');
    }
  };

  const handleTennisSubmit = (e) => {
    e.preventDefault();
    if (chainState !== 'playing') return;
    executeWordSubmission(playerInput);
  };

  // 9. Daily Treasure Climb (Scene 1)
  const executeClimbGuess = async (guessWord) => {
    const guess = (guessWord || '').trim();
    if (!guess || climbEvaluating || climbSolved) return;

    setClimbInput('');
    setClimbEvaluating(true);

    try {
      const res = await fetch('/api/semantic-climb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess }),
      });

      const data = await res.json();

      if (data.solved) {
        sound.streak();
        triggerConfetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } });
        setClimbSolved(true);
        // Award treasure chest doubloons
        const updated = recordChainGame(0, 0, 0, 100);
        if (updated) setStats(updated);
      } else {
        sound.correct();
      }

      setClimbGuesses((prev) => {
        const next = [data, ...prev];
        return next.sort((a, b) => a.rank - b.rank);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setClimbEvaluating(false);
    }
  };

  const handleClimbSubmit = (e) => {
    e.preventDefault();
    executeClimbGuess(climbInput);
  };

  // Dialog helpers
  const openDialog = (ref) => ref.current?.showModal();
  const closeDialog = (ref) => ref.current?.close();

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    sound.setMuted(next);
    savePreferences({ sound: !next });
  };

  const pirateRank = getPirateRank(stats.doubloons);

  return (
    <>
      <main className="frame" id="frame" ref={frameRef}>
        {/* Logo Anchor */}
        <div className="logo" id="logo" ref={logoRef} onClick={() => goToScene(0)}>
          <svg viewBox="0 0 26 30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="13" cy="4.5" r="2.8" />
            <path d="M13 7.5V28M7 12h12M2.5 19c.6 5.5 5.5 9 10.5 9s9.9-3.5 10.5-9" />
            <path d="m1 21 1.5-2.5L5 20.5M25 21l-1.5-2.5-2.5 2" />
          </svg>
          <div>
            Saltwake
            <span className="logo-sub">REPYT AI</span>
          </div>
        </div>

        {/* Navigation Bar */}
        <nav>
          <a
            href="#voyages"
            onClick={(e) => { e.preventDefault(); goToScene(0); }}
            title="Open Sea Word Tennis"
          >
            Voyages
            <svg viewBox="0 0 17 21" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <circle cx="8.5" cy="3" r="1.8" />
              <path d="M8.5 5V18M4.5 8h8M1.5 12.5c.4 3.5 3.5 6 7 6s6.5-2.5 7-6" />
            </svg>
          </a>

          <a
            href="#crew"
            onClick={(e) => { e.preventDefault(); goToScene(1); }}
            title="Island & Daily Treasure Climb"
          >
            Island
            <svg viewBox="0 0 17 21" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <circle cx="8.5" cy="3" r="1.8" />
              <path d="M8.5 5V18M4.5 8h8M1.5 12.5c.4 3.5 3.5 6 7 6s6.5-2.5 7-6" />
            </svg>
          </a>

          <button onClick={() => openDialog(rulesDialogRef)} title="Game Rules & Articles">
            Rules
          </button>

          <button onClick={() => openDialog(statsDialogRef)} title="Captain's Log & Career Stats">
            Log
          </button>

          <button onClick={toggleSound} title={soundMuted ? 'Unmute' : 'Mute'}>
            {soundMuted ? '🔇' : '🔊'}
          </button>

          <div className="nav-badge" title="Your Pirate Gold">
            <span>🪙 {stats.doubloons}</span>
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

          {/* Scene 0: The Open Sea Copy & Word Tennis Dock */}
          <div className="t1" id="t1" ref={t1Ref}>
            <div className="eb">Repyt Archipelago</div>
            <h1>Tales of<br />the open sea</h1>

            {chainState === 'idle' ? (
              <div style={{ marginTop: '24px' }}>
                <button
                  className="pill"
                  onClick={startChainGame}
                  data-go="0"
                  title="Begin high-speed word association rally"
                >
                  Set sail
                </button>
                <div style={{ marginTop: '14px', font: '700 13px/1 "Open Sans"', opacity: 0.7, letterSpacing: '0.12em' }}>
                  RALLY WORDS WITH THE WIND · 15S ROUNDS · BUILD STREAKS
                </div>
              </div>
            ) : (
              <div className="game-dock">
                {/* Active word volley banner */}
                <div className="active-volley-box">
                  <div className="volley-word-display">
                    <span className="volley-label">Rallying Target</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="volley-word">{currentWord}</span>
                      <button
                        className="chip-speaker"
                        onClick={() => pronounceWord(currentWord)}
                        title="Hear word pronunciation aloud"
                      >
                        🔊 Pronounce
                      </button>
                    </div>
                  </div>

                  <div className={`volley-timer-pill ${timeLeft <= 4 ? 'urgent' : ''}`}>
                    <span>⏳ {timeLeft}s</span>
                    <span style={{ fontSize: '13px', opacity: 0.8 }}>| 🔥 {streak}</span>
                  </div>
                </div>

                {/* Input row with Speech Microphone button */}
                <form onSubmit={handleTennisSubmit} className="input-row">
                  <input
                    ref={inputRef}
                    className="ink-input"
                    type="text"
                    value={playerInput}
                    onChange={(e) => setPlayerInput(e.target.value)}
                    placeholder={isRecording ? 'Listening to voice...' : 'Type or speak a linked word...'}
                    disabled={chainState === 'evaluating'}
                    autoComplete="off"
                    autoFocus
                  />

                  {/* Hands-Free Voice Button */}
                  <button
                    type="button"
                    className={`icon-pill-btn ${isRecording ? 'recording' : ''}`}
                    onClick={toggleListening}
                    title={isRecording ? 'Listening... click to stop' : 'Speak your answer hands-free'}
                  >
                    {isRecording ? '🔴' : '🎙️'}
                  </button>

                  <button
                    type="submit"
                    className="pill"
                    style={{ padding: '14px 28px 11px', fontSize: '16px' }}
                    disabled={chainState === 'evaluating'}
                  >
                    Volley
                  </button>
                </form>

                {speechFeedback && (
                  <div style={{ font: '600 13px/1 "Josefin Sans"', color: 'var(--gold)' }}>
                    🎙️ {speechFeedback}
                  </div>
                )}

                {errorMessage && (
                  <div style={{ font: '600 13px/1 "Josefin Sans"', color: 'var(--rose)' }}>
                    ⚠️ {errorMessage}
                  </div>
                )}

                {/* Captain's Banter */}
                <div className="captain-scroll">
                  <span className="captain-avatar">🦜</span>
                  <span>"{captainBanter}"</span>
                </div>

                {/* Recent Rally Chips */}
                {rallyFeed.length > 0 && (
                  <div className="rally-chips">
                    {rallyFeed.slice(0, 8).map((rf, i) => (
                      <span key={i} className="chip">
                        <span>{rf.playerWord}</span>
                        <span style={{ opacity: 0.5 }}>⇄</span>
                        <span>{rf.aiWord}</span>
                        <span
                          className="chip-speaker"
                          onClick={() => pronounceWord(rf.aiWord)}
                          title="Listen to pronunciation"
                        >
                          🔊
                        </span>
                        <span style={{ color: 'var(--gold)' }}>+{rf.score}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Galleon Ship Sprite */}
          <div className="spr" id="ship" ref={shipRef} />

          {/* Front Wave SVG Layers */}
          <svg className="w" id="wFront" ref={wFrontRef} />

          {/* Scene 1: Island Sprites */}
          <div className="spr" id="palm" ref={palmRef} />
          <div className="spr" id="capt" ref={captRef} />
          <div className="spr" id="chest" ref={chestRef} />
          <div className="spr" id="bushL" ref={bushLRef} />
          <div className="spr" id="bushR" ref={bushRRef} />

          {/* Scene 1: Island Copy & Daily Treasure Climb */}
          <div className="t2" id="t2" ref={t2Ref}>
            <h2 id="h2" ref={h2Ref}>Buried<br />Treasure</h2>
            <p id="p2" ref={p2Ref}>
              Guess today's mystery coordinates.<br />
              Climb semantic ranks to unlock Captain Saltwake's golden chest.
            </p>

            <div className="island-climb-box">
              <form onSubmit={handleClimbSubmit} className="input-row">
                <input
                  ref={climbInputRef}
                  className="ink-input"
                  type="text"
                  value={climbInput}
                  onChange={(e) => setClimbInput(e.target.value)}
                  placeholder="Guess mystery concept..."
                  disabled={climbEvaluating || climbSolved}
                />

                <button
                  type="button"
                  className={`icon-pill-btn ${isRecording ? 'recording' : ''}`}
                  onClick={toggleListening}
                  title="Speak guess hands-free"
                >
                  {isRecording ? '🔴' : '🎙️'}
                </button>

                <button
                  type="submit"
                  className="pill"
                  style={{ padding: '14px 24px 11px', fontSize: '15px' }}
                  disabled={climbEvaluating || climbSolved}
                >
                  Dig
                </button>
              </form>

              {/* Guesses Log */}
              {climbGuesses.length > 0 && (
                <div className="guess-log">
                  {climbGuesses.map((g, i) => (
                    <div
                      key={i}
                      className={`guess-row ${
                        g.solved ? 'solved' : g.rank <= 300 ? 'hot' : g.rank <= 1500 ? 'warm' : 'cold'
                      }`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{g.icon}</span>
                        <span>{g.guess}</span>
                        <span
                          className="chip-speaker"
                          onClick={() => pronounceWord(g.guess)}
                          title="Listen to pronunciation"
                        >
                          🔊
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>#{g.rank}</span>
                        <span style={{ fontSize: '12px', opacity: 0.7 }}>{g.temperature}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="btnw" id="btn2" ref={btn2Ref}>
              <i className="tick a" />
              <i className="tick b" />
              <i className="tick c" />
              <button
                className="pill"
                onClick={() => goToScene(0)}
                title="Return to ship voyage"
              >
                Back to Sea
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Palm Shade Canvas (64x36) */}
        <canvas id="shade" ref={shadeCanvasRef} width="64" height="36" />
      </main>

      {/* Custom Ring Cursor Elements */}
      <div id="ping" ref={pingRef} />
      <div id="cur" ref={curRef} />

      {/* Rules / Articles Modal */}
      <dialog ref={rulesDialogRef} onClick={(e) => e.target === rulesDialogRef.current && closeDialog(rulesDialogRef)}>
        <div className="modal-header">
          <h3 className="modal-title">Ship’s Articles</h3>
          <button className="icon-pill-btn" onClick={() => closeDialog(rulesDialogRef)}>✕</button>
        </div>
        <div className="modal-body">
          <h4>⚡ Word Tennis (Voyages)</h4>
          <p>The helm serves an associative word. Reply with a creative semantic link before your countdown expires.</p>
          <ul>
            <li><strong>No Repeats</strong>: Words logged in the ship's rally cannot be reused.</li>
            <li><strong>Combos & Doubloons</strong>: Higher streaks speed up waves and award golden doubloons.</li>
          </ul>

          <h4>🎙️ Speech Teaching & Hands-Free</h4>
          <p>Tap the microphone to speak your answer aloud. Tap any speaker icon to hear clear pedagogical pronunciation.</p>

          <h4>🧗 Buried Treasure (Island)</h4>
          <p>Every day, Captain Saltwake buries a secret concept. Proximity ranks guide your path:</p>
          <ul>
            <li>🟩 <strong>#1</strong>: Solved & Chest Unlocked!</li>
            <li>🔥 <strong>#2 - 300</strong>: Burning Hot</li>
            <li>🟡 <strong>#301 - 1,500</strong>: Warm Shallows</li>
            <li>🧊 <strong>#1,501+</strong>: Freezing Waters</li>
          </ul>
        </div>
        <button className="pill" style={{ width: '100%' }} onClick={() => closeDialog(rulesDialogRef)}>
          Aye, Captain!
        </button>
      </dialog>

      {/* Captain’s Log / Career Stats Modal */}
      <dialog ref={statsDialogRef} onClick={(e) => e.target === statsDialogRef.current && closeDialog(statsDialogRef)}>
        <div className="modal-header">
          <h3 className="modal-title">Captain’s Log</h3>
          <button className="icon-pill-btn" onClick={() => closeDialog(statsDialogRef)}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '36px' }}>{pirateRank.icon}</span>
            <div style={{ font: '400 28px/1 "Goudy Bookletter 1911"', marginTop: '6px' }}>
              {pirateRank.title}
            </div>
            <div style={{ font: '700 12px/1 "Open Sans"', opacity: 0.6, letterSpacing: '0.14em' }}>
              {pirateRank.badge} NAVIGATOR
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-lbl">Doubloons</div>
              <div className="stat-val" style={{ color: 'var(--gold)' }}>🪙 {stats.doubloons}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Best Streak</div>
              <div className="stat-val">🔥 {stats.bestStreak}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Words Rallied</div>
              <div className="stat-val">{stats.totalWordsRallied}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Speech Practiced</div>
              <div className="stat-val">🎙️ {stats.speechPracticed}</div>
            </div>
          </div>
        </div>
        <button className="pill" style={{ width: '100%' }} onClick={() => closeDialog(statsDialogRef)}>
          Close Log
        </button>
      </dialog>

      {/* Game Over Dialog */}
      <dialog ref={gameOverDialogRef} onClick={(e) => e.target === gameOverDialogRef.current && closeDialog(gameOverDialogRef)}>
        <div className="modal-header">
          <h3 className="modal-title">Voyage Concluded</h3>
          <button className="icon-pill-btn" onClick={() => closeDialog(gameOverDialogRef)}>✕</button>
        </div>
        <div className="modal-body">
          <p>The tide has turned. Here is your haul from this voyage:</p>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-lbl">Voyage Score</div>
              <div className="stat-val">{score}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Rally Streak</div>
              <div className="stat-val">🔥 {streak}</div>
            </div>
          </div>
        </div>
        <button className="pill" style={{ width: '100%' }} onClick={() => { closeDialog(gameOverDialogRef); startChainGame(); }}>
          Sail Again
        </button>
      </dialog>
    </>
  );
}
