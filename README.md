# Repyt 🎾

> An addictive, real-time AI word game built with Next.js and Google Gemini.

[![Next.js](https://img.shields.io/badge/Next.js-13.4-black)](https://nextjs.org/)
[![Gemini](https://img.shields.io/badge/Powered%20By-Google%20Gemini-blue)](https://aistudio.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🎮 Game Modes

### 1. ⚡ Repyt Chain (Word Tennis vs. AI)
- **The Concept**: High-speed word association rally against AI.
- **The Rules**:
  - The AI serves an active word (e.g. `Ocean`).
  - You must hit back with an associative word (e.g. `Current`) within **15 seconds**.
  - **No Repeats**: You cannot reuse words already played in the rally.
  - **Streaks & Combos**: Streaks earn score multipliers and progressively speed up the clock.
  - **Banter**: The AI evaluates the strength of your link (1–100) with witty commentary before countering with its own word.

### 2. 🧗 The Daily Climb (Semantic Proximity)
- **The Concept**: Daily puzzle inspired by *Contexto* and *Semantle*.
- **The Rules**:
  - Guess the secret concept of the day.
  - Every guess is scored by semantic distance and assigned a rank:
    - 🟩 **#1**: Target Discovered!
    - 🔥 **#2 – 300**: Burning Hot!
    - 🟡 **#301 – 1,500**: Warm.
    - ❄️ **#1,501 – 4,000**: Cool.
    - 🧊 **#4,001+**: Freezing.
  - Shareable daily emoji grid for X, WhatsApp, and Discord.

---

## 🛠️ Tech Stack & Architecture

- **Framework**: [Next.js](https://nextjs.org/) (App Router) + React 18
- **AI Engine**: [`@google/genai`](https://www.npmjs.com/package/@google/genai) calling `gemini-3.8-flash`
- **Audio Synthesizer**: Web Audio API (tactile retro sound effects with zero external audio assets)
- **Animations**: `canvas-confetti` + pure CSS GPU-accelerated keyframes
- **State & Storage**: LocalStorage for persistent player statistics, high scores, and streaks
- **Offline Mode**: Built-in heuristic dictionary fallback so the game works out-of-the-box even without an API key

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/superrcoop/repyt.git
cd repyt
git checkout feature/ai-word-game
```

### 2. Install dependencies
```bash
npm install
```

### 3. (Optional) Configure Gemini API Key
To enable live AI scoring and banter:
1. Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
3. Add your key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
*(Note: If left blank, Repyt automatically runs in offline heuristic mode).*

### 4. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Production Build

```bash
npm run build
npm run start
```

Deployable to [Vercel](https://vercel.com) with one click.
