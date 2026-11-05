// LocalStorage manager for player statistics, pirate doubloons, and game state

const STATS_KEY = 'repyt_saltwake_stats_v2';
const PREFS_KEY = 'repyt_saltwake_prefs_v2';
const DAILY_KEY_PREFIX = 'repyt_daily_';

export function getPirateRank(doubloons = 0) {
  if (doubloons >= 1500) return { title: 'Sea Captain', icon: '', badge: 'Legendary' };
  if (doubloons >= 700) return { title: 'Quartermaster', icon: '', badge: 'Officer' };
  if (doubloons >= 300) return { title: 'Gunner', icon: '', badge: 'Veteran' };
  if (doubloons >= 100) return { title: 'Deckhand', icon: '', badge: 'Sailor' };
  return { title: 'Cabin Boy', icon: '', badge: 'Novice' };
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
  const defaults = {
    sound: true,
    quickSelects: true,
    voiceEnabled: true,
    speechAudio: true,
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      sound: parsed.sound !== false,
      quickSelects: parsed.quickSelects !== false,
      voiceEnabled: parsed.voiceEnabled !== false,
      speechAudio: parsed.speechAudio !== false,
    };
  } catch (e) {
    return defaults;
  }
}

export function savePreferences(prefs) {
  if (typeof window === 'undefined') return;
  try {
    const current = getPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
    return updated;
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


// ========================================================
// Daily Logbook Quests
// ========================================================
const QUESTS_KEY = 'repyt_saltwake_quests_v2';

export function getDailyQuests() {
  if (typeof window === 'undefined') return [];
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(QUESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === today && Array.isArray(parsed.quests)) {
        return parsed.quests;
      }
    }
  } catch (e) {
    // ignore
  }

  // Default initial quests for today
  const defaultQuests = [
    {
      id: 'quest_forge',
      title: 'Forge Master',
      desc: 'Forge 5 words in a single Word Forge shift',
      target: 5,
      current: 0,
      reward: 30,
      completed: false,
      claimed: false,
    },
    {
      id: 'quest_vault',
      title: 'Master Navigator',
      desc: 'Unlock the Vault with 3+ leagues remaining',
      target: 1,
      current: 0,
      reward: 50,
      completed: false,
      claimed: false,
    },
    {
      id: 'quest_speech',
      title: 'Sea Chants',
      desc: 'Pronounce 3 words aloud with audio speech',
      target: 3,
      current: 0,
      reward: 20,
      completed: false,
      claimed: false,
    },
  ];

  try {
    localStorage.setItem(QUESTS_KEY, JSON.stringify({ date: today, quests: defaultQuests }));
  } catch (e) {}

  return defaultQuests;
}

export function updateQuestProgress(questId, amount = 1) {
  if (typeof window === 'undefined') return [];
  const quests = getDailyQuests();
  const today = new Date().toISOString().slice(0, 10);

  let updated = false;
  const nextQuests = quests.map((q) => {
    if (q.id === questId && !q.completed) {
      const nextVal = Math.min(q.target, q.current + amount);
      const isDone = nextVal >= q.target;
      updated = true;
      return { ...q, current: nextVal, completed: isDone };
    }
    return q;
  });

  if (updated) {
    try {
      localStorage.setItem(QUESTS_KEY, JSON.stringify({ date: today, quests: nextQuests }));
    } catch (e) {}
  }

  return nextQuests;
}

export function claimQuestReward(questId) {
  if (typeof window === 'undefined') return null;
  const quests = getDailyQuests();
  const today = new Date().toISOString().slice(0, 10);

  const quest = quests.find((q) => q.id === questId);
  if (!quest || !quest.completed || quest.claimed) return null;

  const stats = getPlayerStats();
  const updatedStats = {
    ...stats,
    doubloons: (stats.doubloons || 0) + quest.reward,
  };
  localStorage.setItem(STATS_KEY, JSON.stringify(updatedStats));

  const nextQuests = quests.map((q) =>
    q.id === questId ? { ...q, claimed: true } : q
  );

  try {
    localStorage.setItem(QUESTS_KEY, JSON.stringify({ date: today, quests: nextQuests }));
  } catch (e) {}

  return { quests: nextQuests, stats: updatedStats, reward: quest.reward };
}

// ========================================================
// Client-Side Proximity Cache (Zero-Latency Instant Results)
// ========================================================
const PROXIMITY_CACHE_KEY = 'repyt_saltwake_cache_v2';
const memoryCache = new Map();

export function getClientProximityCache(target, guess) {
  const key = `${target.toLowerCase().trim()}:::${guess.toLowerCase().trim()}`;
  if (memoryCache.has(key)) return memoryCache.get(key);

  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROXIMITY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed[key]) {
      memoryCache.set(key, parsed[key]);
      return parsed[key];
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export function setClientProximityCache(target, guess, data) {
  const key = `${target.toLowerCase().trim()}:::${guess.toLowerCase().trim()}`;
  memoryCache.set(key, data);

  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PROXIMITY_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[key] = data;

    // Cap cache entries to 250
    const keys = Object.keys(parsed);
    if (keys.length > 250) {
      delete parsed[keys[0]];
    }
    localStorage.setItem(PROXIMITY_CACHE_KEY, JSON.stringify(parsed));
  } catch (e) {
    // ignore
  }
}
