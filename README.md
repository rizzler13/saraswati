# Saraswati

**Real-time Research Radar** — Monitors global scientific knowledge flow, detects new papers, tracks viral spread, and visualizes idea clusters in a 3D dashboard.

![Status](https://img.shields.io/badge/status-alpha-orange)
![C++](https://img.shields.io/badge/C++-20-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Paper Detection**: Monitors ArXiv, BioRxiv, and HuggingFace for new research
- **Discourse Tracking**: Follows scientific discussions on Reddit, Twitter/X, and Hacker News
- **Knowledge Graph**: Stores relationships in Memgraph (papers, authors, concepts)
- **3D Visualization**: Force-directed graph showing idea clusters
- **Memory Efficient**: Designed for 8GB M1 MacBook Air

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  PaperList  │  │ StatsPanel  │  │    3D GraphView     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────────┐
│                  Backend (C++/Drogon)                       │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Crawlers │  │  Parsers  │  │   API    │  │ Enrichment │  │
│  └──────────┘  └───────────┘  └──────────┘  └────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ Cypher
┌────────────────────────▼────────────────────────────────────┐
│                  Memgraph (Docker)                          │
│         [:WROTE] [:BELONGS_TO] [:MENTIONED_ON]              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker Desktop
- Homebrew (macOS)
- Node.js 18+

### 1. Install Dependencies

```bash
# Install brew packages
brew install cmake ninja curl openssl@3 nlohmann-json gumbo-parser drogon

# Build mgclient (Memgraph driver)
git clone https://github.com/memgraph/mgclient.git /tmp/mgclient
cd /tmp/mgclient && mkdir build && cd build
cmake .. -DCMAKE_INSTALL_PREFIX=/opt/homebrew && make -j4 && sudo make install
```

### 2. Start Memgraph

```bash
docker compose up -d
```

### 3. Build Backend

```bash
mkdir build && cd build
cmake .. -G Ninja -DCMAKE_BUILD_TYPE=Release
ninja
```

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Run

```bash
# Terminal 1: Backend
./build/saraswati --config config/config.json

# Terminal 2: Frontend (already running from step 4)
# Open http://localhost:5173
```

## 📁 Project Structure

```
saraswati/
├── src/
│   ├── main.cpp              # Entry point
│   ├── db/                   # Memgraph client
│   ├── net/                  # HTTP client
│   ├── parsers/              # Source parsers
│   ├── crawlers/             # Discourse crawlers
│   ├── clients/              # External APIs
│   └── controllers/          # REST API
├── include/                  # Headers
├── frontend/                 # React dashboard
├── config/                   # Configuration
└── db/                       # Schema files
```

## 🔧 Configuration

Copy `config/config.example.json` to `config/config.json` and edit:

```json
{
  "memgraph": { "host": "localhost", "port": 7687 },
  "crawler": { "max_threads": 8, "rate_limit_ms": 2000 },
  "sources": {
    "arxiv": { "enabled": true, "feeds": ["cs.AI", "cs.LG"] }
  }
}
```

## License

MIT License
