"""
Saraswati Research Engine - FastAPI Server (Python-only backend)

Routes:
  GET  /api/papers/trending   - Trending papers (HF daily + arXiv multi-field)
  GET  /api/papers/search     - Search arXiv
  POST /api/research          - Chat with paper (agent-routed)
  POST /api/deep-dive/generate - Generate deep-dive for a paper
  GET  /api/deep-dive/{id}    - Get cached deep-dive
  GET  /api/deep-dive/available - List pre-generated deep-dives
  GET  /api/stats             - Paper stats
  GET  /api/graph             - Concept graph
  GET  /health                - Health check
"""
import asyncio
import json
import logging
import os
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Set API keys for LiteLLM
for key in ["GROQ_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY"]:
    val = os.getenv(key)
    if val:
        os.environ[key] = val

from .core.config import ResearchConfig
from .core.llm import complete
from .agents.orchestrator import handle_chat_query
from .agents.specialized import AgentResult
from .agents.deep_dive import (
    generate_deep_dive,
    DeepDiveCache,
    DeepDiveResult,
)
from .sources.papers import (
    get_trending_papers,
    search_arxiv,
    fetch_huggingface_daily,
    load_cached_papers,
    Paper,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("saraswati.server")

# --- Config ---
config = ResearchConfig.from_env()
CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Deep dive cache
dd_cache = DeepDiveCache(
    cache_dir=str(CACHE_DIR / "deep_dives"),
    ttl=config.deep_dive_cache_ttl,
)

app = FastAPI(
    title="Saraswati Research Engine",
    version="0.2.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request / Response Models ---

class ResearchRequest(BaseModel):
    query: str
    paper_id: Optional[str] = None
    paper_title: Optional[str] = None
    paper_abstract: Optional[str] = None
    history: Optional[list[dict]] = None


class DeepDiveRequest(BaseModel):
    paper_id: str
    title: str
    abstract: str = ""
    authors: list[str] = []
    date: str = ""
    tags: list[str] = []


# --- Shared HTTP client ---

_client: Optional[httpx.AsyncClient] = None


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    return _client


@app.on_event("startup")
async def startup():
    """Initialize SQLite database and run a background task to refresh papers."""
    from .core.db import init_db
    try:
        init_db()
        logger.info("SQLite database initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

@app.on_event("shutdown")
async def shutdown():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()


# ===================================================================
#  PAPERS
# ===================================================================

@app.get("/api/papers/trending")
async def papers_trending(page: int = 1, limit: int = 50, category: Optional[str] = None):
    """Get trending papers from HuggingFace + arXiv with SQL pagination."""
    from .core.db import query_trending_papers
    client = await get_client()
    try:
        results = query_trending_papers(page=page, limit=limit, category=category)
        if not results and page == 1:
            logger.info("Database is empty on first page query. Refreshing...")
            await get_trending_papers(client)
            results = query_trending_papers(page=page, limit=limit, category=category)
        else:
            # Trigger background refresh asynchronously to keep DB up to date
            asyncio.create_task(get_trending_papers(client))
        return results
    except Exception as e:
        logger.error(f"Trending papers failed: {e}")
        if page == 1:
            cached = load_cached_papers()
            if cached:
                return [p.to_dict() for p in cached[:limit]]
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/papers/search")
async def papers_search(q: str = ""):
    """Search arXiv for papers matching a query."""
    if not q.strip():
        return []
    client = await get_client()
    try:
        papers = await search_arxiv(client, q.strip(), max_results=30)
        return [p.to_dict() for p in papers]
    except Exception as e:
        logger.error(f"Paper search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/papers/daily")
async def papers_daily():
    """Get HuggingFace daily papers."""
    client = await get_client()
    try:
        papers = await fetch_huggingface_daily(client)
        return [p.to_dict() for p in papers]
    except Exception as e:
        logger.error(f"Daily papers failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def generate_thumbnail_task(paper_id: str, thumb_path: Path):
    """Background task to fetch PDF and render thumbnail without blocking event loop."""
    import base64
    from .parsing.pdf_parser import render_first_page_thumbnail

    if thumb_path.exists():
        return

    logger.info(f"Asynchronously downloading PDF and generating thumbnail for {paper_id}...")
    pdf_url = f"https://arxiv.org/pdf/{paper_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(pdf_url, headers=headers)
            if resp.status_code == 200:
                # Render CPU-bound thumbnail in separate thread to keep event loop free
                data_uri = await asyncio.to_thread(render_first_page_thumbnail, resp.content, 240)
                if data_uri and data_uri.startswith("data:image/png;base64,"):
                    b64_data = data_uri.split(",")[1]
                    img_bytes = base64.b64decode(b64_data)
                    thumb_path.parent.mkdir(parents=True, exist_ok=True)
                    thumb_path.write_bytes(img_bytes)
                    logger.info(f"Successfully generated thumbnail for {paper_id}")
                    return
            logger.warning(f"Failed to fetch PDF for thumbnail: arXiv returned {resp.status_code}")
    except Exception as e:
        logger.warning(f"Error in background thumbnail generation for {paper_id}: {e}")


@app.get("/api/papers/thumbnail/{paper_id:path}")
async def papers_thumbnail(paper_id: str, background_tasks: BackgroundTasks):
    """Get first page thumbnail of a paper as PNG."""
    from fastapi.responses import Response
    paper_id = paper_id.strip()
    if not paper_id:
        raise HTTPException(status_code=400, detail="Invalid paper ID")

    # Check cache first
    thumb_cache_dir = CACHE_DIR / "thumbnails"
    thumb_cache_dir.mkdir(parents=True, exist_ok=True)
    safe_id = paper_id.replace("/", "_").replace(".", "_")
    thumb_path = thumb_cache_dir / f"{safe_id}.png"

    if thumb_path.exists():
        return Response(content=thumb_path.read_bytes(), media_type="image/png")

    # Queue background generation task
    background_tasks.add_task(generate_thumbnail_task, paper_id, thumb_path)

    # Immediately raise 404 to let frontend fall back to CSS placeholder instantly
    raise HTTPException(status_code=404, detail="Thumbnail generating in background")


# ===================================================================
#  RESEARCH (chat with paper)
# ===================================================================

@app.post("/api/research")
async def research(req: ResearchRequest):
    """Chat with a paper via agent routing."""
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")

    # Build context from paper
    context_parts = []
    if req.paper_title:
        context_parts.append(f"PAPER TITLE: {req.paper_title}")
    if req.paper_abstract:
        context_parts.append(f"ABSTRACT: {req.paper_abstract}")
    context = "\n\n".join(context_parts) if context_parts else "No paper context provided."

    try:
        result = await handle_chat_query(
            query=req.query,
            context=context,
            config=config,
            history=req.history,
        )
        return result.to_dict()
    except Exception as e:
        logger.error(f"Research query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================================================================
#  DEEP DIVE
# ===================================================================

# Track in-progress deep dives to avoid duplicate generation
_generating: dict[str, bool] = {}


@app.post("/api/deep-dive/generate")
async def deep_dive_generate(req: DeepDiveRequest, background_tasks: BackgroundTasks):
    """Generate a deep-dive article for a paper."""
    paper_id = req.paper_id.strip()
    if not paper_id:
        raise HTTPException(status_code=400, detail="paper_id is required")

    # Check cache first
    cached = dd_cache.get(paper_id)
    if cached:
        return cached.to_dict()

    # Check if already generating
    if paper_id in _generating:
        return {
            "paper_id": paper_id,
            "title": req.title,
            "status": "generating",
            "message": "Deep dive is being generated. Please check back shortly.",
        }

    # Generate synchronously (user is waiting)
    client = await get_client()
    try:
        _generating[paper_id] = True
        result = await generate_deep_dive(
            paper_id=paper_id,
            paper_title=req.title,
            paper_abstract=req.abstract,
            paper_authors=req.authors,
            paper_date=req.date,
            paper_tags=req.tags,
            config=config,
            client=client,
            cache=dd_cache,
        )
        return result.to_dict()
    except Exception as e:
        logger.error(f"Deep dive generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _generating.pop(paper_id, None)


@app.get("/api/deep-dive/available")
async def deep_dive_available():
    """List all available pre-generated deep dives."""
    return dd_cache.list_available()


@app.get("/api/deep-dive/{paper_id:path}")
async def deep_dive_get(paper_id: str):
    """Get a cached deep-dive by paper ID."""
    cached = dd_cache.get(paper_id)
    if cached:
        return cached.to_dict()
    raise HTTPException(status_code=404, detail="Deep dive not found. Generate it first.")


# ===================================================================
#  STATS & GRAPH
# ===================================================================

@app.get("/api/stats")
async def stats():
    """Compute stats from current papers."""
    client = await get_client()
    try:
        papers = await get_trending_papers(client)
    except Exception:
        papers = load_cached_papers()

    if not papers:
        return {
            "total_papers": 0,
            "sources": {},
            "top_domains": [],
            "trending_topics": [],
        }

    # Count categories
    cat_counts: Counter = Counter()
    tag_counts: Counter = Counter()
    source_counts: Counter = Counter()

    for p in papers:
        if p.category:
            cat_counts[p.category] += 1
        for t in p.tags:
            tag_counts[t] += 1
        source_counts[p.source] += 1

    top_domains = [
        {"name": name, "count": count}
        for name, count in cat_counts.most_common(12)
    ]

    # Trending topics: use tag frequency, compute a "multiplier" 
    # based on how many papers have this tag relative to average
    avg_count = max(1, sum(tag_counts.values()) / max(1, len(tag_counts)))
    trending_topics = []
    for name, count in tag_counts.most_common(10):
        multiplier = round(count / avg_count, 1)
        if multiplier < 1.0:
            multiplier = 1.0 + (count / max(1, len(papers)))
        trending_topics.append({
            "name": name,
            "count": count,
            "multiplier": round(max(1.1, multiplier), 1),
        })

    return {
        "total_papers": len(papers),
        "sources": dict(source_counts),
        "top_domains": top_domains,
        "trending_topics": trending_topics,
    }


@app.get("/api/graph")
async def graph():
    """Build a concept graph from papers."""
    client = await get_client()
    try:
        papers = await get_trending_papers(client)
    except Exception:
        papers = load_cached_papers()

    if not papers:
        return {"nodes": [], "links": []}

    # Build nodes from categories and tags
    node_map: dict[str, dict] = {}
    links: list[dict] = []
    link_set: set[tuple[str, str]] = set()

    for p in papers:
        cat = p.category or "Machine Learning"
        if cat not in node_map:
            node_map[cat] = {"id": cat, "group": "category", "val": 0}
        node_map[cat]["val"] += 1

        for tag in p.tags[:3]:
            if tag not in node_map:
                node_map[tag] = {"id": tag, "group": "tag", "val": 0}
            node_map[tag]["val"] += 1

            # Link tag to category
            pair = tuple(sorted([cat, tag]))
            if pair not in link_set and cat != tag:
                links.append({"source": cat, "target": tag})
                link_set.add(pair)

        # Link between co-occurring tags
        for i, t1 in enumerate(p.tags[:3]):
            for t2 in p.tags[i + 1:3]:
                pair = tuple(sorted([t1, t2]))
                if pair not in link_set and t1 != t2:
                    links.append({"source": t1, "target": t2})
                    link_set.add(pair)

    nodes = list(node_map.values())
    return {"nodes": nodes, "links": links}


# ===================================================================
#  HEALTH
# ===================================================================

@app.get("/health")
async def health():
    """Health check."""
    groq_ok = bool(os.getenv("GROQ_API_KEY"))
    or_ok = bool(os.getenv("OPENROUTER_API_KEY"))
    return {
        "status": "healthy",
        "version": "0.2.0",
        "groq_configured": groq_ok,
        "openrouter_configured": or_ok,
        "deep_dive_cache_count": len(dd_cache.list_available()),
    }

@app.get("/")
async def root():
    """Welcome root endpoint."""
    return {
        "message": "Welcome to Saraswati Research Engine API. Visit /health for status or /docs for documentation.",
        "version": "0.2.0",
        "status": "online"
    }