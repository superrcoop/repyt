'use client';

import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { sound } from '../lib/audio';
import {
  getPlayerStats,
  recordChainGame,
  getPreferences,
  savePreferences,
} from '../lib/storage';

const STARTER_WORDS = [
  'Galaxy', 'Ocean', 'Rhythm', 'Volcano', 'Circuit',
  'Jungle', 'Glacier', 'Carnival', 'Echo', 'Neon'
];

export default function RepytGame() {
  const [mode, setMode] = useState('chain'); // 'chain' | 'climb'
  const [soundMuted, setSoundMuted] = useState(false);
  const [stats, setStats] = useState({ highScore: 0, bestStreak: 0, gamesPlayed: 0, totalWordsRallied: 0 });

  // Word Chain state
  const [chainState, setChainState] = useState('idle'); // 'idle' | 'playing' | 'evaluating' | 'gameover'
  const [currentWord, setCurrentWord] = useState('');
  const [playerInput, setPlayerInput] = useState('');
  const [history, setHistory] = useState([]);
  const [rallyFeed, setRallyFeed] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [aiBanter, setAiBanter] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Daily Climb state
  const [climbGuesses, setClimbGuesses] = useState([]);
  const [climbInput, setClimbInput] = useState('');
  const [climbEvaluating, setClimbEvaluating] = useState(false);
  const [climbSolved, setClimbSolved] = useState(false);

  // Social share feedback
  const [shareFeedback, setShareFeedback] = useState('');

  // Modals refs
  const howToDialogRef = useRef(null);
  const statsDialogRef = useRef(null);
  const gameOverDialogRef = useRef(null);
  const inputRef = useRef(null);

  // Load preferences and stats on mount
  useEffect(() => {
    const prefs = getPreferences();
    setSoundMuted(!prefs.sound);
    sound.setMuted(!prefs.sound);
    setStats(getPlayerStats());
  }, []);

  // Sync sound muted state
  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    sound.setMuted(next);
    savePreferences({ sound: !next });
  };

  // Helper for light-dismiss dialog fallback
  const openDialog = (ref) => {
    if (!ref.current) return;
    ref.current.showModal();
  };

  const closeDialog = (ref) => {
    if (!ref.current) return;
    ref.current.close();
  };

  // Backdrop click handler for light-dismiss fallback
  const handleDialogBackdropClick = (e, ref) => {
    if (!ref.current || e.target !== ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const isIn = (
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    );
    if (!isIn) {
      ref.current.close();
    }
  };

  // Timer loop for Chain Game
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
  }, [chainState, streak, score, currentWord, rallyFeed]);

  const startChainGame = () => {
    const randomStarter = STARTER_WORDS[Math.floor(Math.random() * STARTER_WORDS.length)];
    setCurrentWord(randomStarter);
    setHistory([randomStarter]);
    setRallyFeed([]);
    setScore(0);
    setStreak(0);
    setTimeLeft(15);
    setAiBanter(`Game on! Give me a creative word associated with "${randomStarter}"!`);
    setErrorMessage('');
    setChainState('playing');

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleTimeExpired = () => {
    sound.gameOver();
    setChainState('gameover');
    setAiBanter('Time expired! The rally has ended.');
    const updated = recordChainGame(score, streak, rallyFeed.length);
    if (updated) setStats(updated);
    openDialog(gameOverDialogRef);
  };

  const submitChainWord = async (e) => {
    e.preventDefault();
    if (chainState !== 'playing' || !playerInput.trim()) return;

    const guess = playerInput.trim();
    setPlayerInput('');
    setErrorMessage('');
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
        setErrorMessage(data.reason || 'Invalid word or link!');
        setAiBanter(data.banter || 'Oops, link broken!');
        setChainState('playing');
        return;
      }

      // Valid link!
      const newStreak = streak + 1;
      const turnScore = (data.score || 50) + newStreak * 15;
      const newScore = score + turnScore;

      sound.correct(newStreak);

      if (newStreak % 5 === 0) {
        sound.streak();
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
      }

      const nextWord = data.counterWord || 'Pulse';
      const newHistory = [...history, guess, nextWord];

      setRallyFeed((prev) => [
        {
          playerWord: guess,
          aiWord: nextWord,
          score: turnScore,
          banter: data.banter,
        },
        ...prev,
      ]);

      setCurrentWord(nextWord);
      setHistory(newHistory);
      setScore(newScore);
      setStreak(newStreak);
      setTimeLeft(Math.max(8, 15 - Math.floor(newStreak / 3))); // Turn timer gets faster as streak builds
      setAiBanter(data.banter);
      setChainState('playing');

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } catch (err) {
      console.error(err);
      sound.error();
      setErrorMessage('Network or server error.');
      setChainState('playing');
    }
  };

  // Daily Climb handlers
  const submitClimbGuess = async (e) => {
    e.preventDefault();
    if (!climbInput.trim() || climbEvaluating || climbSolved) return;

    const guess = climbInput.trim();
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
        confetti({ particleCount: 90, spread: 90, origin: { y: 0.5 } });
        setClimbSolved(true);
      } else {
        sound.correct();
      }

      setClimbGuesses((prev) => {
        const next = [data, ...prev];
        // Sort with lowest rank first (closer to 1 is better)
        return next.sort((a, b) => a.rank - b.rank);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setClimbEvaluating(false);
    }
  };

  const copyShareResult = () => {
    let text = '';
    if (mode === 'chain') {
      text = `Repyt: Word Tennis 🎾\nScore: ${score} | Streak: ${streak} 🔥\nCan you beat my rally on Repyt?`;
    } else {
      const bestRank = climbGuesses[0]?.rank || 9999;
      text = `Repyt: Daily Climb 🧗\nGuesses: ${climbGuesses.length} | Best Rank: #${bestRank} ${climbSolved ? '🟩 Solved!' : '🔥'}\nPlay daily at repyt.app`;
    }

    navigator.clipboard.writeText(text);
    setShareFeedback('Copied to clipboard!');
    setTimeout(() => setShareFeedback(''), 2500);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">R</div>
          <div>
            <h1 className="brand-title">Repyt</h1>
          </div>
          <span className="brand-badge">AI Word Game</span>
        </div>

        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={toggleSound}
            aria-label="Toggle Sound"
            title={soundMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {soundMuted ? '🔇' : '🔊'}
          </button>
          <button
            className="icon-btn"
            onClick={() => openDialog(howToDialogRef)}
            aria-label="How to play"
            title="How to play"
          >
            ❓
          </button>
          <button
            className="icon-btn"
            onClick={() => openDialog(statsDialogRef)}
            aria-label="Player Stats"
            title="Player Stats"
          >
            📊
          </button>
        </div>
      </header>

      {/* Mode Selector */}
      <nav className="mode-tabs" aria-label="Game Modes">
        <button
          className={`mode-tab ${mode === 'chain' ? 'active' : ''}`}
          onClick={() => setMode('chain')}
        >
          ⚡ Repyt Chain (Word Tennis)
        </button>
        <button
          className={`mode-tab ${mode === 'climb' ? 'active' : ''}`}
          onClick={() => setMode('climb')}
        >
          🧗 Daily Climb (Proximity)
        </button>
      </nav>

      {/* ===================== MODE 1: REPYT CHAIN ===================== */}
      {mode === 'chain' && (
        <section aria-labelledby="chain-game-heading">
          <h2 id="chain-game-heading" style={{ display: 'none' }}>Word Tennis Mode</h2>

          {/* HUD Bar */}
          <div className="hud-bar">
            <div className="hud-card">
              <div className="hud-label">Score</div>
              <div className="hud-value glow-cyan">{score}</div>
            </div>
            <div className="hud-card">
              <div className="hud-label">Streak</div>
              <div className="hud-value glow-emerald">{streak} 🔥</div>
            </div>
            <div className="hud-card">
              <div className="hud-label">Timer</div>
              <div className="hud-value glow-amber">{chainState === 'playing' ? `${timeLeft}s` : '--'}</div>
            </div>
          </div>

          {/* Arena Card */}
          <div className="arena-card">
            {chainState === 'playing' && (
              <div className="timer-track" role="progressbar" aria-valuenow={timeLeft} aria-valuemin={0} aria-valuemax={15}>
                <div
                  className={`timer-fill ${timeLeft <= 4 ? 'danger' : ''}`}
                  style={{ width: `${(timeLeft / 15) * 100}%` }}
                />
              </div>
            )}

            {chainState === 'idle' ? (
              <div style={{ textAlign: 'center', padding: '40px 10px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎾</div>
                <h3 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>
                  Ready to Rally with AI?
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '15px', maxWidth: '420px', margin: '0 auto 24px auto' }}>
                  The AI throws a word. You answer with a creative connection before the clock runs out. The AI volleys back!
                </p>
                <button className="primary-btn" onClick={startChainGame}>
                  Start Word Tennis →
                </button>
              </div>
            ) : (
              <>
                <div className="word-stage">
                  <div className={`turn-pill ${chainState === 'evaluating' ? 'ai' : 'player'}`}>
                    {chainState === 'evaluating' ? 'AI is evaluating...' : 'Your turn to connect'}
                  </div>
                  <div className="target-word">{currentWord}</div>
                  <p className="ai-banter">{aiBanter}</p>
                </div>

                {errorMessage && (
                  <div style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    background: 'rgba(244, 63, 94, 0.15)',
                    color: '#fb7185',
                    fontSize: '13px',
                    fontWeight: '600',
                    textAlign: 'center',
                    marginBottom: '10px'
                  }}>
                    ⚠️ {errorMessage}
                  </div>
                )}

                <form className="word-input-form" onSubmit={submitChainWord}>
                  <input
                    ref={inputRef}
                    type="text"
                    className="word-input"
                    placeholder={`Word connected to "${currentWord}"...`}
                    value={playerInput}
                    onChange={(e) => setPlayerInput(e.target.value)}
                    disabled={chainState !== 'playing'}
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="submit-btn"
                    disabled={chainState !== 'playing' || !playerInput.trim()}
                  >
                    {chainState === 'evaluating' ? '...' : 'Hit →'}
                  </button>
                </form>

                {rallyFeed.length > 0 && (
                  <div className="rally-feed" aria-label="Rally history">
                    {rallyFeed.map((item, idx) => (
                      <div key={idx} className="rally-item">
                        <div className="rally-words">
                          <span>{item.playerWord}</span>
                          <span className="rally-arrow">↔</span>
                          <span style={{ color: '#a78bfa' }}>{item.aiWord}</span>
                        </div>
                        <div className="rally-score">+{item.score} pts</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* ===================== MODE 2: DAILY CLIMB ===================== */}
      {mode === 'climb' && (
        <section aria-labelledby="climb-game-heading">
          <h2 id="climb-game-heading" style={{ display: 'none' }}>Daily Climb Mode</h2>

          <div className="arena-card">
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span className="turn-pill player">Daily Challenge</span>
              <h3 style={{ fontSize: '26px', fontWeight: '900', marginTop: '6px' }}>
                The Semantic Climb 🧗
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                Find the secret word of the day. The lower the rank number, the closer you are in meaning!
              </p>
            </div>

            {climbSolved ? (
              <div style={{
                textAlign: 'center',
                padding: '24px',
                background: 'rgba(16, 185, 129, 0.15)',
                borderRadius: '16px',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
                <h4 style={{ fontSize: '20px', fontWeight: '800', color: '#34d399' }}>
                  Target Word Discovered!
                </h4>
                <p style={{ color: '#cbd5e1', fontSize: '14px', marginTop: '4px' }}>
                  You found the secret word in <strong>{climbGuesses.length}</strong> guesses!
                </p>
                <button
                  className="primary-btn"
                  style={{ marginTop: '16px', background: '#10b981' }}
                  onClick={copyShareResult}
                >
                  {shareFeedback || 'Share Result 📋'}
                </button>
              </div>
            ) : (
              <form className="word-input-form" onSubmit={submitClimbGuess}>
                <input
                  type="text"
                  className="word-input"
                  placeholder="Guess any English word..."
                  value={climbInput}
                  onChange={(e) => setClimbInput(e.target.value)}
                  disabled={climbEvaluating || climbSolved}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={climbEvaluating || !climbInput.trim()}
                >
                  {climbEvaluating ? '...' : 'Guess'}
                </button>
              </form>
            )}

            {climbGuesses.length > 0 && (
              <div className="climb-list" aria-label="Guess proximity rankings">
                {climbGuesses.map((item, idx) => (
                  <div key={idx} className="climb-item">
                    <div className="climb-guess">{item.guess}</div>
                    <div className="climb-meta">
                      <span className="climb-rank">#{item.rank}</span>
                      <span className={`climb-pill ${item.color}`}>
                        {item.icon} {item.temperature}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===================== MODAL 1: HOW TO PLAY ===================== */}
      <dialog
        ref={howToDialogRef}
        closedby="any"
        aria-labelledby="how-to-title"
        onClick={(e) => handleDialogBackdropClick(e, howToDialogRef)}
      >
        <div className="modal-header">
          <h3 id="how-to-title" className="modal-title">How to Play Repyt</h3>
          <button className="icon-btn" onClick={() => closeDialog(howToDialogRef)}>✕</button>
        </div>
        <div className="modal-body">
          <h4 style={{ color: '#38bdf8', marginBottom: '6px' }}>⚡ Word Tennis</h4>
          <p>
            The AI serves an active word. Enter an associative word before your 15-second timer runs out.
          </p>
          <ul>
            <li><strong>No repeats</strong>: You cannot reuse words already in the rally.</li>
            <li><strong>Rally Streaks</strong>: High combos award score bonuses and speed up the clock.</li>
          </ul>

          <h4 style={{ color: '#34d399', marginTop: '16px', marginBottom: '6px' }}>🧗 The Daily Climb</h4>
          <p>
            Guess the mystery concept. Every guess is graded by semantic distance:
          </p>
          <ul>
            <li><span style={{ color: '#34d399' }}>🟩 #1 (Solved)</span></li>
            <li><span style={{ color: '#fb7185' }}>🔥 #2 - 300 (Burning Hot)</span></li>
            <li><span style={{ color: '#fbbf24' }}>🟡 #301 - 1,500 (Warm)</span></li>
            <li><span style={{ color: '#94a3b8' }}>🧊 #1,501+ (Cold)</span></li>
          </ul>
        </div>
        <button className="primary-btn" onClick={() => closeDialog(howToDialogRef)}>Got it!</button>
      </dialog>

      {/* ===================== MODAL 2: STATS ===================== */}
      <dialog
        ref={statsDialogRef}
        closedby="any"
        aria-labelledby="stats-title"
        onClick={(e) => handleDialogBackdropClick(e, statsDialogRef)}
      >
        <div className="modal-header">
          <h3 id="stats-title" className="modal-title">Your Career Stats</h3>
          <button className="icon-btn" onClick={() => closeDialog(statsDialogRef)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="hud-bar" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '16px' }}>
            <div className="hud-card">
              <div className="hud-label">High Score</div>
              <div className="hud-value glow-cyan">{stats.highScore}</div>
            </div>
            <div className="hud-card">
              <div className="hud-label">Best Streak</div>
              <div className="hud-value glow-emerald">{stats.bestStreak} 🔥</div>
            </div>
            <div className="hud-card">
              <div className="hud-label">Games Played</div>
              <div className="hud-value">{stats.gamesPlayed}</div>
            </div>
            <div className="hud-card">
              <div className="hud-label">Words Rallied</div>
              <div className="hud-value glow-amber">{stats.totalWordsRallied}</div>
            </div>
          </div>
        </div>
        <button className="primary-btn" onClick={() => closeDialog(statsDialogRef)}>Close</button>
      </dialog>

      {/* ===================== MODAL 3: GAME OVER ===================== */}
      <dialog
        ref={gameOverDialogRef}
        closedby="any"
        aria-labelledby="game-over-title"
        onClick={(e) => handleDialogBackdropClick(e, gameOverDialogRef)}
      >
        <div className="modal-header">
          <h3 id="game-over-title" className="modal-title">Rally Concluded!</h3>
          <button className="icon-btn" onClick={() => closeDialog(gameOverDialogRef)}>✕</button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎾</div>
          <div style={{ fontSize: '32px', fontWeight: '900', color: '#38bdf8' }}>{score} pts</div>
          <p style={{ color: '#94a3b8', marginTop: '4px' }}>
            Rally Streak: <strong>{streak} words</strong>
          </p>
          {score >= stats.highScore && score > 0 && (
            <div style={{
              margin: '12px auto',
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#fbbf24',
              fontWeight: '700',
              display: 'inline-block',
              fontSize: '13px'
            }}>
              🏆 New Personal Best!
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="primary-btn" onClick={() => { closeDialog(gameOverDialogRef); startChainGame(); }}>
            Play Again ⚡
          </button>
          <button
            className="icon-btn"
            style={{ width: '100%', height: '48px', borderRadius: '12px', fontWeight: '700' }}
            onClick={copyShareResult}
          >
            {shareFeedback || 'Share Score 📋'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
