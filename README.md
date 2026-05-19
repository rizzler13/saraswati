# Project Saraswati

Real-time Research Radar. Monitors scientific knowledge flow, detects new papers, tracks viral spread, and visualizes idea clusters.

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

## Quick Start (Docker - Recommended)

The easiest way to run Project Saraswati on **any operating system** (Windows, macOS, Linux) is using Docker. This avoids needing to install C++ compilers or database instances locally.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine + Docker Compose (Linux)

### 1-Click Start

Clone the repository and double-click the script for your OS (or run it in your terminal):

- **macOS / Linux:** Run `./start.sh`
- **Windows:** Double-click `start.bat` (or run it in Command Prompt)

This single script will:
1. Start the Memgraph database.
2. Build the C++ Backend natively within an isolated Ubuntu container.
3. Build the React/Vite Frontend statically and serve it securely via Nginx.
4. Auto-open your web browser to http://localhost:5173

### Useful Commands

- **Frontend Dashboard**: Open http://localhost:5173
- **Backend API**: Running on http://localhost:8080
- **Memgraph Lab UI**: Open http://localhost:3000 to query the graph visually.

## Manual Build (Local Environment)

For developers wanting to build the backend manually and work on the raw C++ code externally from Docker, please refer to the detailed guide in [BUILD.md](BUILD.md).

## Configuration

Copy `config/config.example.json` to `config/config.json` before building, and adjust the parameters as needed to fit your crawler rate limits.

## Production Deployment

Saraswati is designed for **$0/month deployment** using free cloud services:

| Component | Platform | Cost |
|:--|:--|:--|
| Frontend | [Netlify](https://netlify.com) (static CDN) | Free |
| Backend + DB | [Oracle Cloud](https://cloud.oracle.com/free) Always Free ARM VM | Free |
| HTTPS | [Caddy](https://caddyserver.com) + Let's Encrypt | Free |
| CI/CD | GitHub Actions | Free |

### Deploy in 3 Steps

1. **Provision server:** Create an Oracle Cloud Always Free ARM VM, then run:
   ```bash
   ssh ubuntu@<your-vm-ip> 'bash -s' < deploy/setup-server.sh
   ```

2. **Configure:** Edit `deploy/.env` with your domain and API keys.

3. **Launch:**
   ```bash
   cd deploy && docker compose -f docker-compose.prod.yml up -d --build
   ```

4. **Frontend:** Connect your GitHub repo to Netlify with base directory `ui` and env var `VITE_API_URL=https://api.yourdomain.com`.

See [`deploy/`](deploy/) for all production configuration files.

## License

MIT License
