# Project Saraswati

Real-time Research Radar — Monitors global scientific knowledge flow, detects new papers, tracks viral spread, and visualizes idea clusters in a 3D dashboard.

## Features

- Paper Detection: Monitors ArXiv, BioRxiv, and HuggingFace for new research.
- Discourse Tracking: Follows scientific discussions on Reddit, Twitter/X, and Hacker News.
- Knowledge Graph: Stores relationships in Memgraph (papers, authors, concepts).
- 3D Visualization: Force-directed graph showing idea clusters.
- Memory Efficient: Designed to run efficiently on standard consumer hardware.

## Architecture

Frontend (React): PaperList, StatsPanel, 3D GraphView
Backend (C++ / Drogon): Crawlers, Parsers, API, Enrichment
Database (Memgraph): Knowledge graph storage via Docker

## Quick Start

### Prerequisites

- Docker Desktop
- Node.js 18+
- CMake and a recent C++20 compiler (Clang/GCC/MSVC)
- Package managers: Homebrew (macOS) or vcpkg (Windows)

### 1. Install Dependencies

**macOS:**
```bash
brew install cmake ninja curl openssl@3 nlohmann-json gumbo-parser drogon

# Build mgclient (Memgraph C Client)
git clone https://github.com/memgraph/mgclient.git /tmp/mgclient
cd /tmp/mgclient && mkdir build && cd build
cmake .. -DCMAKE_INSTALL_PREFIX=/opt/homebrew && make -j$(sysctl -n hw.ncpu) && sudo make install
```

**Windows (vcpkg):**
Ensure you have `vcpkg` properly set up first.
```cmd
vcpkg install drogon curl nlohmann-json openssl gumbo

# Build mgclient (Memgraph C Client)
git clone https://github.com/memgraph/mgclient.git C:\temp\mgclient
cd C:\temp\mgclient
mkdir build && cd build
cmake .. 
cmake --build . --config Release --target install
```

### 2. Start Memgraph

```bash
docker compose up -d
```

### 3. Build Backend

**macOS / Linux:**
```bash
mkdir build && cd build
cmake .. -G Ninja -DCMAKE_BUILD_TYPE=Release
ninja
```

**Windows:**
```cmd
mkdir build && cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE="C:/path/to/vcpkg/scripts/buildsystems/vcpkg.cmake" -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release
```

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Run Backend

**macOS/Linux:**
```bash
./build/saraswati --config config/config.example.json
```

**Windows:**
```cmd
.\build\Release\saraswati.exe --config config\config.example.json
```

Frontend is already running from step 4. Open http://localhost:5173 to access the dashboard.

## Configuration

Copy `config/config.example.json` to `config/config.json` and adjust the parameters.

## License

MIT License
