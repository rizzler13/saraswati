# Building & Running Project Saraswati Locally

Saraswati is designed with a lightweight Python backend running FastAPI and a React/Vite frontend. It uses SQLite for storing crawled papers locally.

---

## Prerequisites

- **Python**: `>= 3.11`
- **Node.js**: `>= v18` & **npm**

---

## 1. Environment Setup

Copy your API keys into a `.env` file at the root of the project:

```env
GROQ_API_KEY=gsk_NhYG...
OPENROUTER_API_KEY=sk-or-...
CEREBRAS_API_KEY=csk-...
```

---

## 2. Backend Setup & Run

The backend is housed in the `research/` directory.

### Step 1: Virtual Environment
```bash
cd research
python3 -m venv .venv
source .venv/bin/activate
```

### Step 2: Install Dependencies
Install all required libraries for LiteLLM, LangGraph, and PDF parsing:
```bash
pip install fastapi "uvicorn[standard]" litellm langgraph langchain-core pymupdf httpx pydantic python-dotenv
```

### Step 3: Run the FastAPI Server
**Crucial**: The server must be executed from the project root directory so that it can resolve internal package paths (`from .core import ...`):
```bash
cd ..
python -m uvicorn research.server:app --host 0.0.0.0 --port 8081
```

Once running, you can access:
- **API Documentation (Swagger UI)**: [http://localhost:8081/docs](http://localhost:8081/docs)
- **Health Check**: `curl http://localhost:8081/health`

---

## 3. Frontend Setup & Run

The frontend is housed in the `ui/` directory.

### Step 1: Install Node Dependencies
```bash
cd ui
npm install
```

### Step 2: Launch Vite Dev Server
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. All requests to `/api` will be automatically proxied by Vite to the Python server at `http://localhost:8081`.

---

## 4. SQLite Database Details

Saraswati automatically initializes and handles its local SQLite database file on startup at:
`data/saraswati.db`

### Schema Structure
- **Table**: `papers`
- **Indexes**:
  - `idx_papers_score` (Descending on `score`)
  - `idx_papers_category` (On `category`)
  - `idx_papers_date` (Descending on published `date`)

### Inspected/Query Stats
You can query the database directly using SQLite commands:
```bash
# Count total papers stored
sqlite3 data/saraswati.db "SELECT count(*) FROM papers;"

# List categories and counts
sqlite3 data/saraswati.db "SELECT category, count(*) FROM papers GROUP BY category;"
```

---

## 5. Troubleshooting & FAQ

### ModuleNotFoundError: No module named 'research'
Make sure you are executing the `uvicorn` command from the **project root directory** (e.g. `saraswati/`) and running it as a module (`python -m uvicorn research.server:app`) rather than launching it inside the `research/` directory.

### Port Conflicts (8081 or 5173 already in use)
If you get address already in use errors, check what processes are running on those ports:
```bash
lsof -i :8081
lsof -i :5173
```
Kill those processes or adjust the port configurations in `research/server.py` and `ui/vite.config.ts`.

### GitHub API Rate Limits
If you get warnings about `GitHub API rate limit hit` in the server logs, it means the public API limit has been reached. 
You can increase the limit by setting a `GITHUB_TOKEN` in your `.env` file.
```env
GITHUB_TOKEN=ghp_...
```
