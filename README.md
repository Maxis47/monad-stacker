# Monad Stacker 🎮

Futuristic block-stacking game for [Monad Mission 7](https://github.com/Maxis47/monad-stacker).  
Integrates **Monad Games ID (Privy Wallet)**, on-chain scoring, personal history & global leaderboard.

---

## Features

- 🔑 Sign in with Monad Games ID (Privy)
- 🕹️ Stack blocks for points, unlimited levels
- ⛓️ Secure on-chain score submit (backend only)
- 🏆 Global leaderboard & 📜 personal history
- 🎨 Neon/futuristic responsive UI
- 🆓 Open source (MIT)

---

## Quick Start

```bash
git clone https://github.com/Maxis47/monad-stacker.git
cd monad-stacker

# Backend
cd server
cp .env.example .env      # edit values as needed
npm install
npm run dev

# Frontend (new terminal)
cd ../client
cp .env.example .env      # edit if needed
npm install
npm run dev
