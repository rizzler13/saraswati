# Project Saraswati

Realtime Research Radar. Monitors scientific knowledge flow, crawls new research, tracks code repository signals, and provides an agentic deep-dive explanation engine.

## Features

- **High-Scale Ingestion**: Crawls arXiv categories (`cs.AI`, `cs.LG`, `cs.CL`, `cs.CV`, `cs.MA`, etc.) and HuggingFace daily trending entries with automated rate-limiting queue controls.
- **Papers with Code Alignment**: Automatically parses and extracts GitHub repositories from abstracts, fetching stars, forks, and star growth rates (velocity).
- **Ranking Engine**: Ranks papers dynamically based on:
  $$\text{Score} = (\text{HF Upvotes} \times 10) + (\text{GitHub Stars} \times 0.5) + \text{Velocity}$$
- **Agent Chat**: Dedicated AI Agent tab to discuss paper contents with routing optimized across Groq, OpenRouter, and Cerebras APIs.
- **Deep Dives**: Automatically downloads PDFs, extracts content, and writes comprehensive multi-chapter blog posts/articles about papers.
- **Local Database**: Stores thousands of papers and repository records locally in SQLite for fast paginated queries (<5ms database response).

## Architecture

- **Frontend (React + Vite)**: Paginated PaperList, StatsPanel, 3D GraphView, AgentChat, ProfilePage.
- **Backend (Python + FastAPI)**: Uvicorn API server, background tasks, LLM agents (summary, math, visualization, critique) powered by LiteLLM.
- **Database (SQLite)**: Local high-performance file-based storage (`data/saraswati.db`).

## Quick Start (Local Environment)

### Prerequisites
- Python 3.11 or higher
- Node.js (v18+) and npm
- A Groq API Key (and optionally Cerebras or OpenRouter keys for upgraded reasoning)

### 1. Set Up Environment Variables
Create a `.env` file in the root directory:
```env
GROQ_API_KEY=gsk_...
# Optional keys:
CEREBRAS_API_KEY=csk_...
OPENROUTER_API_KEY=sk-or-v1-...
```

### 2. Run the Backend
```bash
# Set up a Python virtual environment
cd research
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install fastapi "uvicorn[standard]" litellm langgraph langchain-core pymupdf httpx pydantic python-dotenv

# Run the FastAPI server (run from the project root directory)
cd ..
python -m uvicorn research.server:app --host 0.0.0.0 --port 8081
```

### 3. Run the Frontend
```bash
# In a new terminal tab/window
cd ui
npm install
npm run dev
```

Open your browser to [http://localhost:5173](http://localhost:5173) to access the dashboard.

## Useful Commands

- **Backend healthcheck**: `curl http://localhost:8081/health`
- **FastAPI OpenAPI docs**: [http://localhost:8081/docs](http://localhost:8081/docs)

## License

MIT License
