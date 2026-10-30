// LocalStorage manager for player statistics and daily challenge state

const STATS_KEY = 'repyt_stats_v1';
const PREFS_KEY = 'repyt_prefs_v1';
const DAILY_KEY_PREFIX = 'repyt_daily_';

export function getPlayerStats() {
  if (typeof window === 'undefined') {
    return { highScore: 0, bestStreak: 0, gamesPlayed: 0, totalWordsRallied: 0 };
  }
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { highScore: 0, bestStreak: 0, gamesPlayed: 0, totalWordsRallied: 0 };
    return JSON.parse(raw);
  } catch (e) {
    return { highScore: 0, bestStreak: 0, gamesPlayed: 0, totalWordsRallied: 0 };
  }
}

export function recordChainGame(score, streak, wordsCount) {
  if (typeof window === 'undefined') return;
  try {
    const current = getPlayerStats();
    const updated = {
      highScore: Math.max(current.highScore, score),
      bestStreak: Math.max(current.bestStreak, streak),
      gamesPlayed: current.gamesPlayed + 1,
      totalWordsRallied: current.totalWordsRallied + wordsCount,
    };
    localStorage.setItem(STATS_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    // ignore
  }
}

export function getPreferences() {
  if (typeof window === 'undefined') return { sound: true, difficulty: 'standard' };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : { sound: true, difficulty: 'standard' };
  } catch (e) {
    return { sound: true, difficulty: 'standard' };
  }
}

export function savePreferences(prefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    // ignore
  }
}

export function getDailyState(dateStr) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${DAILY_KEY_PREFIX}${dateStr}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveDailyState(dateStr, state) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${DAILY_KEY_PREFIX}${dateStr}`, JSON.stringify(state));
  } catch (e) {
    // ignore
  }
}
