// LocalStorage manager for player statistics, pirate doubloons, and game state

const STATS_KEY = 'repyt_saltwake_stats_v2';
const PREFS_KEY = 'repyt_saltwake_prefs_v2';
const DAILY_KEY_PREFIX = 'repyt_daily_';

export function getPirateRank(doubloons = 0) {
  if (doubloons >= 1500) return { title: 'Sea Captain', icon: '⚓', badge: 'Legendary' };
  if (doubloons >= 700) return { title: 'Quartermaster', icon: '🧭', badge: 'Officer' };
  if (doubloons >= 300) return { title: 'Gunner', icon: '💣', badge: 'Veteran' };
  if (doubloons >= 100) return { title: 'Deckhand', icon: '🗡️', badge: 'Sailor' };
  return { title: 'Cabin Boy', icon: '🪵', badge: 'Novice' };
}

export function getPlayerStats() {
  if (typeof window === 'undefined') {
    return {
      highScore: 0,
      bestStreak: 0,
      gamesPlayed: 0,
      totalWordsRallied: 0,
      doubloons: 0,
      speechPracticed: 0,
    };
  }
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) {
      return {
        highScore: 0,
        bestStreak: 0,
        gamesPlayed: 0,
        totalWordsRallied: 0,
        doubloons: 0,
        speechPracticed: 0,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      highScore: parsed.highScore || 0,
      bestStreak: parsed.bestStreak || 0,
      gamesPlayed: parsed.gamesPlayed || 0,
      totalWordsRallied: parsed.totalWordsRallied || 0,
      doubloons: parsed.doubloons || 0,
      speechPracticed: parsed.speechPracticed || 0,
    };
  } catch (e) {
    return {
      highScore: 0,
      bestStreak: 0,
      gamesPlayed: 0,
      totalWordsRallied: 0,
      doubloons: 0,
      speechPracticed: 0,
    };
  }
}

export function recordChainGame(score, streak, wordsCount, earnedDoubloons = 0) {
  if (typeof window === 'undefined') return;
  try {
    const current = getPlayerStats();
    const updated = {
      ...current,
      highScore: Math.max(current.highScore, score),
      bestStreak: Math.max(current.bestStreak, streak),
      gamesPlayed: current.gamesPlayed + 1,
      totalWordsRallied: current.totalWordsRallied + wordsCount,
      doubloons: (current.doubloons || 0) + earnedDoubloons,
    };
    localStorage.setItem(STATS_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    // ignore
  }
}

export function recordSpeechPractice() {
  if (typeof window === 'undefined') return;
  try {
    const current = getPlayerStats();
    const updated = {
      ...current,
      doubloons: (current.doubloons || 0) + 5, // 5 bonus doubloons per speech practice
      speechPracticed: (current.speechPracticed || 0) + 1,
    };
    localStorage.setItem(STATS_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    // ignore
  }
}

export function getPreferences() {
  if (typeof window === 'undefined') return { sound: true, voiceEnabled: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : { sound: true, voiceEnabled: true };
  } catch (e) {
    return { sound: true, voiceEnabled: true };
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
