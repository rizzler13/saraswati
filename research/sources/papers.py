"""
Paper source management for Saraswati.

Fetches papers from:
  - HuggingFace daily papers (primary trending signal)
  - arXiv API (multi-category: LLM, RL, Vision, Agents, etc.)
  - arXiv search (user-initiated search)

Merges sources, deduplicates, and ranks by quality signals.
"""
import asyncio
import hashlib
import json
import logging
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import re
import os

import httpx

from research.core.db import upsert_papers, get_connection, get_latest_paper_date

logger = logging.getLogger("saraswati.sources")

# --- Data Model ---

@dataclass
class Paper:
    """Unified paper representation across all sources."""
    id: str  # arxiv ID or HF ID
    title: str
    abstract: str
    authors: list[str] = field(default_factory=list)
    date: str = ""
    source: str = "arxiv"  # arxiv | huggingface
    url: str = ""
    score: int = 0
    category: str = ""
    tags: list[str] = field(default_factory=list)
    hf_upvotes: int = 0
    pdf_url: str = ""
    code_url: Optional[str] = None
    github_stars: int = 0
    github_forks: int = 0
    github_velocity: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


# --- Category Definitions ---

# Core CS/AI categories we care about
ARXIV_CATEGORIES = {
    "cs.AI": "Agents",
    "cs.LG": "Machine Learning",
    "cs.CL": "NLP",
    "cs.CV": "Computer Vision",
    "cs.MA": "Multi-Agent",
    "cs.RO": "Robotics",
    "cs.SD": "Sound & Audio",
    "cs.NE": "Neural & Evolutionary",
    "cs.IR": "Information Retrieval",
    "cs.HC": "Human-Computer Interaction",
    "cs.CR": "Cryptography & Security",
    "cs.DC": "Distributed Computing",
    "cs.SE": "Software Engineering",
    "cs.GR": "Graphics",
    "cs.MM": "Multimedia",
    "cs.SI": "Social Networks",
    "stat.ML": "Machine Learning",
    "eess.AS": "Audio & Speech",
    "eess.IV": "Image & Video",
    "eess.SP": "Signal Processing",
    "q-bio.NC": "Computational Neuroscience",
    "math.OC": "Optimization",
    "quant-ph": "Quantum Computing",
    "physics.data-an": "Data Analysis",
}

# Field-specific queries for getting top papers per domain
# 20 field queries -- broad coverage across all of modern AI/ML
FIELD_QUERIES = [
    # Core ML/DL
    {"query": "large language model OR LLM OR transformer architecture", "label": "LLM"},
    {"query": "reinforcement learning OR RLHF OR reward model", "label": "Reinforcement Learning"},
    {"query": "diffusion model OR image generation OR text-to-image", "label": "Generative AI"},
    {"query": "AI agent OR tool use OR agentic OR function calling", "label": "Agents"},
    {"query": "multimodal OR vision language model OR VLM", "label": "Multimodal"},
    {"query": "reasoning OR chain of thought OR logical inference", "label": "Reasoning"},
    # NLP & Language
    {"query": "retrieval augmented generation OR RAG OR knowledge grounding", "label": "RAG & Retrieval"},
    {"query": "machine translation OR multilingual OR cross-lingual", "label": "Multilingual NLP"},
    {"query": "text-to-speech OR speech recognition OR automatic speech", "label": "Speech & Audio"},
    # Vision & 3D
    {"query": "3D generation OR NeRF OR gaussian splatting OR 3D reconstruction", "label": "3D Vision"},
    {"query": "video understanding OR video generation OR temporal modeling", "label": "Video AI"},
    {"query": "object detection OR segmentation OR visual grounding", "label": "Detection & Segmentation"},
    # Applied AI
    {"query": "medical AI OR clinical NLP OR drug discovery OR biomedical", "label": "Medical AI"},
    {"query": "autonomous driving OR self-driving OR planning", "label": "Autonomous Systems"},
    {"query": "robot learning OR manipulation OR embodied AI", "label": "Robotics"},
    # Infrastructure & Theory
    {"query": "graph neural network OR GNN OR graph transformer", "label": "Graph Networks"},
    {"query": "federated learning OR differential privacy OR privacy-preserving", "label": "Privacy & Federated"},
    {"query": "model compression OR quantization OR knowledge distillation OR pruning", "label": "Efficient AI"},
    {"query": "time series forecasting OR anomaly detection OR temporal", "label": "Time Series"},
    {"query": "neuro-symbolic OR neuroscience-inspired OR brain-computer interface", "label": "Neuro-Symbolic"},
]

ARXIV_API = "https://export.arxiv.org/api/query"
HF_DAILY_API = "https://huggingface.co/api/daily_papers"


# --- Cache ---

_cache: dict[str, tuple[float, list[Paper]]] = {}
_CACHE_TTL = 900  # 15 minutes


def _get_cached(key: str) -> Optional[list[Paper]]:
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return data
    return None


def _set_cached(key: str, data: list[Paper]):
    _cache[key] = (time.time(), data)


# --- HuggingFace Daily Papers ---

def _parse_hf_response_data(data: list) -> list[Paper]:
    """Parse raw HuggingFace daily papers JSON data into Paper objects."""
    papers = []
    if not isinstance(data, list):
        return papers

    for item in data:
        paper_data = item.get("paper", item)
        arxiv_id = paper_data.get("id", "")
        title = paper_data.get("title", "")
        summary = paper_data.get("summary", paper_data.get("abstract", ""))
        authors = []
        for a in paper_data.get("authors", []):
            if isinstance(a, dict):
                name = a.get("name", a.get("user", {}).get("fullname", ""))
                if name:
                    authors.append(name)
            elif isinstance(a, str):
                authors.append(a)

        upvotes = item.get("paper", {}).get("upvotes", 0) if isinstance(item.get("paper"), dict) else item.get("upvotes", 0)
        if not upvotes:
            upvotes = item.get("numUpvotes", 0)

        pub_date = paper_data.get("publishedAt", paper_data.get("date", ""))
        if pub_date and "T" in pub_date:
            pub_date = pub_date[:10]

        tags = _guess_tags(title + " " + summary)

        papers.append(Paper(
            id=arxiv_id,
            title=title,
            abstract=summary[:1500] if summary else "",
            authors=authors[:10],
            date=pub_date,
            source="huggingface",
            url=f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else "",
            score=upvotes * 10,
            hf_upvotes=upvotes,
            category=tags[0] if tags else "Machine Learning",
            tags=tags,
            pdf_url=f"https://arxiv.org/pdf/{arxiv_id}" if arxiv_id else "",
        ))
    return papers

async def fetch_huggingface_daily(client: httpx.AsyncClient) -> list[Paper]:
    """
    Fetch today's top papers from HuggingFace.
    HF upvotes are a strong community-curated quality signal.
    """
    cached = _get_cached("hf_daily")
    if cached is not None:
        return cached

    papers = []
    try:
        resp = await client.get(HF_DAILY_API, timeout=15.0)
        if resp.status_code != 200:
            logger.warning(f"HF daily papers returned {resp.status_code}")
            return papers

        papers = _parse_hf_response_data(resp.json())
        papers.sort(key=lambda p: p.hf_upvotes, reverse=True)
        logger.info(f"Fetched {len(papers)} papers from HuggingFace daily")
        _set_cached("hf_daily", papers)

    except Exception as e:
        logger.error(f"HF daily papers fetch failed: {e}")

    return papers

async def crawl_huggingface_historical(
    client: httpx.AsyncClient,
    days_back: int = 30,
) -> list[Paper]:
    """Crawl HuggingFace daily papers for the last N days to build historical database."""
    import datetime
    all_papers = []

    today = datetime.date.today()
    for i in range(days_back):
        date_str = (today - datetime.timedelta(days=i)).isoformat()
        url = f"{HF_DAILY_API}?date={date_str}"
        logger.info(f"Crawling HF daily papers for date: {date_str}...")

        try:
            resp = await client.get(url, timeout=15.0)
            if resp.status_code == 200:
                papers = _parse_hf_response_data(resp.json())
                for p in papers:
                    p.date = date_str
                all_papers.extend(papers)
                logger.info(f"Fetched {len(papers)} papers for HF {date_str}")
            elif resp.status_code == 429:
                logger.warning("HF rate limited during historical crawl, sleeping 10s...")
                await asyncio.sleep(10.0)
            else:
                logger.debug(f"HF daily papers returned {resp.status_code} for {date_str}")
        except Exception as e:
            logger.warning(f"Failed to crawl HF papers for {date_str}: {e}")

        # Throttling to respect HF API limits
        await asyncio.sleep(2.0)

    return all_papers


# --- arXiv API ---

async def fetch_arxiv_category(
    client: httpx.AsyncClient,
    category: str,
    max_results: int = 50,
) -> list[Paper]:
    """Fetch recent papers from a specific arXiv category."""
    url = (
        f"{ARXIV_API}?search_query=cat:{category}"
        f"&sortBy=submittedDate&sortOrder=descending"
        f"&max_results={max_results}"
    )

    for attempt in range(3):
        try:
            resp = await client.get(url, timeout=15.0)
            if resp.status_code == 429:
                wait = 3 * (attempt + 1)
                logger.warning(f"arXiv rate limited, waiting {wait}s...")
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            break
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < 2:
                await asyncio.sleep(3 * (attempt + 1))
                continue
            logger.error(f"arXiv fetch failed for {category}: {e}")
            return []
        except Exception as e:
            logger.error(f"arXiv fetch failed for {category}: {e}")
            return []

    return _parse_arxiv_response(resp.text, category)


GITHUB_REGEX = re.compile(r'https?://github\.com/([a-zA-Z0-9_\-\.]+)/([a-zA-Z0-9_\-\.]+)')

def extract_github_url(text: str) -> Optional[str]:
    """Extract and normalize the first GitHub repo link from text."""
    if not text:
        return None
    match = GITHUB_REGEX.search(text)
    if match:
        owner = match.group(1).rstrip('.,;)')
        repo = match.group(2).rstrip('.,;)')
        if repo.endswith('.git'):
            repo = repo[:-4]
        return f"https://github.com/{owner}/{repo}"
    return None

async def fetch_github_repo_details(client: httpx.AsyncClient, code_url: str) -> dict:
    """Fetch star count, forks and velocity from GitHub API for a repo URL."""
    if not code_url:
        return {}
    
    match = GITHUB_REGEX.search(code_url)
    if not match:
        return {}
        
    owner = match.group(1).rstrip('.,;)')
    repo = match.group(2).rstrip('.,;)')
    if repo.endswith('.git'):
        repo = repo[:-4]
        
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {
        "User-Agent": "Saraswati-Research-Engine/1.0"
    }
    
    # Check if user has GITHUB_TOKEN in env
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"token {token}"
        
    try:
        resp = await client.get(api_url, headers=headers, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            stars = data.get("stargazers_count", 0)
            forks = data.get("forks_count", 0)
            return {
                "github_stars": stars,
                "github_forks": forks,
                "github_velocity": float(stars) * 0.05
            }
        elif resp.status_code == 403 or resp.status_code == 429:
            logger.warning(f"GitHub API rate limit hit for {owner}/{repo}")
        else:
            logger.debug(f"GitHub API returned {resp.status_code} for {owner}/{repo}")
    except Exception as e:
        logger.warning(f"Failed to fetch GitHub stats for {owner}/{repo}: {e}")
        
    return {}

async def crawl_arxiv_category(
    client: httpx.AsyncClient,
    category: str,
    max_to_fetch: int = 1000,
    batch_size: int = 200,
) -> list[Paper]:
    """Crawl a specific arXiv category up to max_to_fetch papers, with pagination and throttling."""
    papers = []
    start = 0
    
    # Check what is the latest date we have in DB for this category (for incremental scraping)
    latest_date = get_latest_paper_date(category)
    
    while start < max_to_fetch:
        url = (
            f"{ARXIV_API}?search_query=cat:{category}"
            f"&sortBy=submittedDate&sortOrder=descending"
            f"&start={start}"
            f"&max_results={batch_size}"
        )
        logger.info(f"Crawling arXiv category {category} starting from {start}...")
        
        attempt_success = False
        for attempt in range(3):
            try:
                resp = await client.get(url, timeout=20.0)
                if resp.status_code == 429:
                    wait = 5 * (attempt + 1)
                    logger.warning(f"arXiv rate limited during crawl of {category}, waiting {wait}s...")
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                attempt_success = True
                break
            except Exception as e:
                logger.warning(f"Error fetching arXiv category {category} (start={start}): {e}")
                await asyncio.sleep(3 * (attempt + 1))
                
        if not attempt_success:
            break
            
        batch_papers = _parse_arxiv_response(resp.text, category)
        if not batch_papers:
            break
            
        papers.extend(batch_papers)
        
        # Check if we've reached papers older than our latest_date
        if latest_date:
            reached_old = False
            for p in batch_papers:
                if p.date and p.date <= latest_date:
                    reached_old = True
                    break
            if reached_old:
                logger.info(f"Reached papers older than latest date {latest_date} for {category}. Stopping crawl.")
                break
                
        start += batch_size
        await asyncio.sleep(3.0)  # Throttling 3 seconds
        
    return papers


async def search_arxiv(
    client: httpx.AsyncClient,
    query: str,
    max_results: int = 30,
) -> list[Paper]:
    """Search arXiv for papers matching a query."""
    cached = _get_cached(f"search:{query}")
    if cached is not None:
        return cached

    import re
    clean_q = query.strip()
    if clean_q.lower().startswith("arxiv:"):
        clean_q = clean_q[6:].strip()

    is_arxiv_id = False
    if re.match(r'^\d{4}\.\d{4,5}(v\d+)?$', clean_q):
        is_arxiv_id = True
    elif re.match(r'^[a-zA-Z\-]+(\.[a-zA-Z\-]+)?/\d{7}(v\d+)?$', clean_q):
        is_arxiv_id = True

    params = {}
    if is_arxiv_id:
        params["id_list"] = clean_q
    else:
        keywords = [kw for kw in clean_q.split() if kw]
        if keywords:
            search_query = " AND ".join(f"all:{kw}" for kw in keywords)
        else:
            search_query = f'ti:"{query}" OR abs:"{query}"'
        params["search_query"] = search_query
        params["sortBy"] = "relevance"
        params["sortOrder"] = "descending"
        params["max_results"] = str(max_results)

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    for attempt in range(3):
        try:
            resp = await client.get(ARXIV_API, params=params, headers=headers, timeout=15.0)
            if resp.status_code == 429:
                wait = 3 * (attempt + 1)
                logger.warning(f"arXiv search rate limited, waiting {wait}s (attempt {attempt+1})")
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            papers = _parse_arxiv_response(resp.text)
            _set_cached(f"search:{query}", papers)
            logger.info(f"arXiv search '{query}': {len(papers)} results")
            return papers
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < 2:
                await asyncio.sleep(3 * (attempt + 1))
                continue
            logger.error(f"arXiv search failed: {e}")
            return []
        except Exception as e:
            logger.error(f"arXiv search failed: {e}")
            return []
    return []


async def fetch_field_top_papers(
    client: httpx.AsyncClient,
    max_per_field: int = 10,
) -> list[Paper]:
    """
    Fetch top papers across all major fields.
    Batches queries (4 at a time) with delays to respect arXiv rate limits.
    """
    cached = _get_cached("field_top")
    if cached is not None:
        return cached

    all_papers: list[Paper] = []
    seen_ids: set[str] = set()

    batch_size = 4
    for batch_start in range(0, len(FIELD_QUERIES), batch_size):
        batch = FIELD_QUERIES[batch_start:batch_start + batch_size]

        tasks = []
        for field_q in batch:
            search_query = f'all:({field_q["query"]})'
            params = {
                "search_query": search_query,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
                "max_results": str(max_per_field),
            }
            tasks.append(_fetch_field_batch(client, params, field_q["label"]))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                continue
            for p in result:
                if p.id and p.id not in seen_ids:
                    all_papers.append(p)
                    seen_ids.add(p.id)

        if batch_start + batch_size < len(FIELD_QUERIES):
            await asyncio.sleep(4)

    logger.info(f"Fetched {len(all_papers)} top papers across {len(FIELD_QUERIES)} fields")
    _set_cached("field_top", all_papers)
    return all_papers


async def _fetch_field_batch(
    client: httpx.AsyncClient,
    params: dict,
    label: str,
) -> list[Paper]:
    """Fetch a single field's papers with retry."""
    for attempt in range(2):
        try:
            resp = await client.get(ARXIV_API, params=params, timeout=15.0)
            if resp.status_code == 429:
                await asyncio.sleep(5)
                continue
            if resp.status_code != 200:
                return []

            papers = _parse_arxiv_response(resp.text)
            for p in papers:
                p.tags = [label] + p.tags
                if not p.category or p.category == "Machine Learning":
                    p.category = label
            return papers

        except Exception as e:
            logger.warning(f"Field query '{label}' failed: {e}")
            if attempt == 0:
                await asyncio.sleep(3)
    return []


def _parse_arxiv_response(xml_text: str, default_category: str = "") -> list[Paper]:
    """Parse arXiv API XML response into Paper objects."""
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "arxiv": "http://arxiv.org/schemas/atom",
    }
    papers = []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.error(f"Failed to parse arXiv XML: {e}")
        return []

    for entry in root.findall("atom:entry", ns):
        arxiv_id_raw = entry.findtext("atom:id", "", ns)
        arxiv_id = arxiv_id_raw.split("/abs/")[-1].split("v")[0] if "/abs/" in arxiv_id_raw else arxiv_id_raw

        title = entry.findtext("atom:title", "", ns).replace("\n", " ").strip()
        abstract = entry.findtext("atom:summary", "", ns).replace("\n", " ").strip()
        published = entry.findtext("atom:published", "", ns)
        authors = [
            a.findtext("atom:name", "", ns)
            for a in entry.findall("atom:author", ns)
        ]

        categories = [c.get("term", "") for c in entry.findall("atom:category", ns)]
        primary_cat = categories[0] if categories else default_category

        category = ARXIV_CATEGORIES.get(primary_cat, default_category or "Machine Learning")
        tags = _guess_tags(title + " " + abstract)

        try:
            pub_date = datetime.fromisoformat(published.replace("Z", "+00:00"))
            hours_ago = max(1, (datetime.now(timezone.utc) - pub_date).total_seconds() / 3600)
            score = max(1, int(200 / (hours_ago ** 0.4)))
        except Exception:
            score = 5

        papers.append(Paper(
            id=arxiv_id,
            title=title,
            abstract=abstract[:1500],
            authors=authors[:15],
            date=published[:10] if published else "",
            source="arxiv",
            url=f"https://arxiv.org/abs/{arxiv_id}",
            score=score,
            category=category,
            tags=tags,
            pdf_url=f"https://arxiv.org/pdf/{arxiv_id}",
        ))

    return papers


_is_refreshing = False

async def get_trending_papers(client: httpx.AsyncClient) -> list[Paper]:
    """
    Get trending papers by querying the SQLite database.
    Triggers a background refresh to keep data current.
    """
    cached = _get_cached("trending_merged")
    if cached is not None:
        return cached

    from research.core.db import query_trending_papers
    db_results = query_trending_papers(page=1, limit=200)

    if not db_results:
        logger.info("Database is empty on query. Starting background refresh...")
        # Trigger async refresh in background to prevent HTTP lockup/timeout
        _trigger_background_refresh(client)
        
        # Load local disk cache if present as instant fallback, otherwise return empty list
        fallback = load_cached_papers()
        if fallback:
            return fallback
        return []
    else:
        # DB has papers, trigger background refresh if needed
        _trigger_background_refresh(client)

    # Convert SQLite dict rows back to Paper instances
    papers = []
    for d in db_results:
        p = Paper(
            id=d["id"],
            title=d["title"],
            abstract=d["abstract"],
            authors=d["authors"] if isinstance(d["authors"], list) else [],
            date=d["date"],
            source=d["source"],
            url=d["url"],
            score=d["score"],
            category=d["category"],
            tags=d["tags"] if isinstance(d["tags"], list) else [],
            hf_upvotes=d["hf_upvotes"],
            pdf_url=d["pdf_url"],
            code_url=d["code_url"],
            github_stars=d["github_stars"],
            github_forks=d["github_forks"],
            github_velocity=d["github_velocity"],
        )
        papers.append(p)

    _set_cached("trending_merged", papers)
    return papers

_last_refresh_time = 0.0
_REFRESH_COOLDOWN = 1800.0  # 30 minutes cooldown
_background_tasks = set()

def _trigger_background_refresh(client: httpx.AsyncClient):
    global _is_refreshing
    if _is_refreshing:
        return

    # Check cooldown
    if time.time() - _last_refresh_time < _REFRESH_COOLDOWN:
        return

    _is_refreshing = True
    task = asyncio.create_task(_background_refresh_task(client))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

async def _background_refresh_task(client: httpx.AsyncClient):
    global _is_refreshing, _last_refresh_time
    try:
        logger.info("Starting background update of trending papers...")
        await _refresh_papers_now(client)
        _last_refresh_time = time.time()
        logger.info("Background update of trending papers complete.")
    except Exception as e:
        logger.error(f"Background update of trending papers failed: {e}")
    finally:
        _is_refreshing = False

async def _refresh_papers_now(client: httpx.AsyncClient) -> list[Paper]:
    # 1. Fetch HF daily papers
    hf_papers = await fetch_huggingface_daily(client)

    # Automatically backfill historical daily papers if database is empty/low on HF papers
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM papers WHERE source = 'huggingface'")
        row = cursor.fetchone()
        hf_count = row[0] if row else 0
        conn.close()

        if hf_count < 100:
            logger.info(f"HuggingFace papers count in DB ({hf_count}) is low. Backfilling 30 days...")
            hf_historical = await crawl_huggingface_historical(client, days_back=30)
            hf_papers.extend(hf_historical)
    except Exception as e:
        logger.error(f"Failed checking/backfilling HF historical papers: {e}")

    # 2. Crawl arXiv categories (cs.AI, cs.LG, cs.CL, cs.CV, cs.MA)
    categories_to_crawl = ["cs.AI", "cs.LG", "cs.CL", "cs.CV", "cs.MA"]
    arxiv_papers = []

    for cat in categories_to_crawl:
        try:
            cat_papers = await crawl_arxiv_category(client, cat, max_to_fetch=300, batch_size=100)
            arxiv_papers.extend(cat_papers)
        except Exception as e:
            logger.error(f"Failed crawling category {cat}: {e}")

    # 3. Fetch field top papers
    field_papers = await fetch_field_top_papers(client)

    # Combine all parsed papers
    all_papers_dict = {}

    for p in hf_papers + arxiv_papers + field_papers:
        if not p.id:
            continue
        # Extract GitHub link if not present
        if not p.code_url:
            p.code_url = extract_github_url(p.abstract) or extract_github_url(p.title)

        # Deduplicate: if paper is already seen, merge it
        if p.id in all_papers_dict:
            existing = all_papers_dict[p.id]
            existing.hf_upvotes = max(existing.hf_upvotes, p.hf_upvotes)
            if p.code_url:
                existing.code_url = p.code_url
            existing.score = max(existing.score, p.score)
            if p.category and p.category != "Machine Learning":
                existing.category = p.category
            # Merge tags
            existing_tags = set(existing.tags)
            for t in p.tags:
                existing_tags.add(t)
            existing.tags = list(existing_tags)[:4]
        else:
            all_papers_dict[p.id] = p

    # Now fetch GitHub stats for papers with a code_url
    papers_with_code = [p for p in all_papers_dict.values() if p.code_url]

    # Query existing github stats from SQLite DB
    known_github_stats = {}
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT code_url, github_stars, github_forks, github_velocity FROM papers WHERE code_url IS NOT NULL")
        for row in cursor.fetchall():
            known_github_stats[row["code_url"]] = {
                "github_stars": row["github_stars"],
                "github_forks": row["github_forks"],
                "github_velocity": row["github_velocity"]
            }
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to query existing github stats: {e}")

    github_queries_count = 0
    max_github_queries = 20  # Avoid hitting API limits

    for p in papers_with_code:
        if p.code_url in known_github_stats and known_github_stats[p.code_url]["github_stars"] > 0:
            stats = known_github_stats[p.code_url]
            p.github_stars = stats["github_stars"]
            p.github_forks = stats["github_forks"]
            p.github_velocity = stats["github_velocity"]
        elif github_queries_count < max_github_queries:
            stats = await fetch_github_repo_details(client, p.code_url)
            if stats:
                p.github_stars = stats.get("github_stars", 0)
                p.github_forks = stats.get("github_forks", 0)
                p.github_velocity = stats.get("github_velocity", 0.0)
                github_queries_count += 1
                await asyncio.sleep(0.5)

    # Recalculate scores using formula: Score = (HF Upvotes * 10) + (GitHub Stars * 0.5) + Velocity
    for p in all_papers_dict.values():
        github_stars = p.github_stars or 0
        github_velocity = p.github_velocity or 0.0

        if p.source == "huggingface":
            base_score = p.hf_upvotes * 10
        else:
            base_score = p.score

        p.score = int(base_score + (github_stars * 0.5) + github_velocity)

    # Write to SQLite database
    papers_to_save = [p.to_dict() for p in all_papers_dict.values()]
    upsert_papers(papers_to_save)
    logger.info(f"Upserted {len(papers_to_save)} papers into SQLite database.")

    # Write legacy cache
    try:
        sorted_papers = sorted(all_papers_dict.values(), key=lambda x: x.score, reverse=True)
        cache_dir = Path(__file__).parent.parent.parent / "data" / "cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = cache_dir / "papers.json"
        cache_file.write_text(json.dumps([p.to_dict() for p in sorted_papers[:200]], indent=2))
    except Exception as e:
        logger.warning(f"Failed to write legacy papers.json: {e}")

    return list(all_papers_dict.values())



def _guess_tags(text: str) -> list[str]:
    """Guess topic tags from text content."""
    t = text.lower()
    tags = []

    tag_keywords = [
        ("LLM", ["large language model", "llm", "language model", "gpt", "llama", "gemini", "claude"]),
        ("NLP", ["natural language", "text generation", "sentiment", "named entity", "text classification"]),
        ("Transformers", ["transformer", "attention mechanism", "self-attention", "multi-head attention"]),
        ("Diffusion", ["diffusion model", "stable diffusion", "ddpm", "denoising", "text-to-image"]),
        ("Generative AI", ["generative", "gan", "variational autoencoder", "vae", "image synthesis"]),
        ("Reasoning", ["reasoning", "chain-of-thought", "chain of thought", "logical", "math reasoning"]),
        ("Agents", ["ai agent", "autonomous agent", "tool use", "function calling", "agentic"]),
        ("Reinforcement Learning", ["reinforcement learning", "rlhf", "ppo", "reward model", "policy gradient"]),
        ("Computer Vision", ["computer vision", "image recognition", "object detection", "yolo", "image classification"]),
        ("3D Vision", ["nerf", "gaussian splatting", "3d reconstruction", "point cloud", "3d generation"]),
        ("Video AI", ["video understanding", "video generation", "optical flow", "video prediction"]),
        ("Segmentation", ["segmentation", "instance segmentation", "panoptic", "semantic segmentation"]),
        ("Multimodal", ["multimodal", "vision-language", "image-text", "clip", "vlm"]),
        ("RAG", ["retrieval augmented", "retrieval-augmented", " rag ", "knowledge grounding"]),
        ("Translation", ["machine translation", "multilingual", "cross-lingual", "low-resource"]),
        ("Speech & Audio", ["speech", "text-to-speech", "audio", "whisper", "tts", "speech recognition", "asr"]),
        ("Medical AI", ["medical", "clinical", "biomedical", "drug discovery", "radiology", "pathology", "healthcare"]),
        ("Autonomous Systems", ["autonomous driving", "self-driving", "lidar", "motion planning"]),
        ("Robotics", ["robot", "embodied", "manipulation", "locomotion", "dexterous"]),
        ("Code", ["code generation", "codegen", "programming", "copilot", "software engineering"]),
        ("Fine-Tuning", ["fine-tuning", "fine tuning", "lora", "qlora", "peft", "instruction tuning"]),
        ("Safety", ["alignment", "safety", "red team", "constitutional", "jailbreak", "guardrails"]),
        ("MoE", ["mixture of experts", "moe", "sparse expert"]),
        ("Efficient AI", ["quantization", "pruning", "distillation", "model compression", "efficient inference"]),
        ("Graph Networks", ["graph neural", "gnn", "graph transformer", "knowledge graph"]),
        ("Federated", ["federated learning", "differential privacy", "privacy-preserving"]),
        ("Time Series", ["time series", "forecasting", "anomaly detection", "temporal"]),
        ("Neuro-Symbolic", ["neuro-symbolic", "neuroscience", "brain-computer", "neural coding"]),
    ]

    for tag, keywords in tag_keywords:
        if any(kw in t for kw in keywords):
            tags.append(tag)

    return tags[:4] if tags else ["Machine Learning"]


# --- Disk Cache Fallback ---

def load_cached_papers() -> list[Paper]:
    """Load papers from disk cache as fallback."""
    cache_file = Path(__file__).parent.parent.parent / "data" / "cache" / "papers.json"
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text())
            return [Paper(**p) for p in data]
        except Exception as e:
            logger.warning(f"Failed to load papers cache: {e}")
    return []
