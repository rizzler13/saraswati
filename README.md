# Project Saraswati

Realtime Research Radar. Monitors scientific knowledge flow, detects new papers, tracks viral spread, and visualizes idea clusters.

## Features

- Paper Detection: Monitors ArXiv, BioRxiv, and HuggingFace for new research.
- Discourse Tracking: Follows scientific discussions on Reddit, Twitter/X, and Hacker News.
- Knowledge Graph: Stores relationships in Memgraph (papers, authors, concepts).
- 3D Visualization: Force-directed graph showing idea clusters.
- Memory Efficient: Designed to run efficiently on standard consumer hardware.

## Architecture

- Frontend (React): PaperList, StatsPanel, 3D GraphView
- Backend (C++ / Drogon): Crawlers, Parsers, API, Enrichment
- Database (Memgraph): Knowledge graph storage via Docker

## Quick Start (Docker - Recommended)

The easiest way to run Project Saraswati on **any operating system** (Windows, macOS, Linux) is using Docker. This avoids needing to install C++ compilers or database instances locally.

### Installation

Clone the repository 

`git clone https://github.com/rizzler13/asl-qc.git`
`cd saraswati`

This single script will:
1. Start the Memgraph database.
2. Build the C++ Backend natively within an isolated Ubuntu container.
3. Build the React/Vite Frontend statically and serve it securely via Nginx.
4. Auto-open your web browser to http://localhost:5173

### Useful Commands

**Frontend Dashboard**: navigate to ui/ and run `npm run dev`
**Backend API**: run `build ninja` in build file and `./saraswati` which will load the backend


## Manual Build (Local Environment)

For developers wanting to build the backend manually and work on the raw C++ code externally from Docker, please refer to the detailed guide in [BUILD.md](BUILD.md).


## Production Deployment - Will shortly be deployed (under progress)

## License

MIT License
