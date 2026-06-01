import json
import sqlite3
import os
from pathlib import Path
from typing import Optional, Any

DB_PATH_ENV = os.getenv("DATABASE_PATH")
if DB_PATH_ENV:
    DB_PATH = Path(DB_PATH_ENV)
else:
    DB_PATH = Path(__file__).parent.parent.parent / "data" / "saraswati.db"

def init_db():
    """Initialize the SQLite database and create tables/indexes if not exist."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Create papers table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS papers (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        abstract TEXT,
        authors TEXT,        -- JSON array of strings
        date TEXT,           -- YYYY-MM-DD
        source TEXT,         -- 'arxiv' | 'huggingface'
        url TEXT,
        score INTEGER DEFAULT 0,
        category TEXT,
        tags TEXT,           -- JSON array of strings
        hf_upvotes INTEGER DEFAULT 0,
        pdf_url TEXT,
        code_url TEXT,       -- GitHub repo link
        github_stars INTEGER DEFAULT 0,
        github_forks INTEGER DEFAULT 0,
        github_velocity REAL DEFAULT 0.0,
        fetched_at INTEGER
    )
    """)

    # Create indexes for high performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_score ON papers(score DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_category ON papers(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_date ON papers(date DESC)")

    conn.commit()
    conn.close()

def get_connection():
    """Return a sqlite3 connection configured to work with dict row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def upsert_papers(papers: list[dict]):
    """Insert or update a list of papers in the database in bulk."""
    if not papers:
        return

    conn = get_connection()
    cursor = conn.cursor()

    import time
    now = int(time.time())

    # We do bulk insert with INSERT OR REPLACE (upsert)
    cursor.executemany("""
    INSERT INTO papers (
        id, title, abstract, authors, date, source, url, score, category, tags,
        hf_upvotes, pdf_url, code_url, github_stars, github_forks, github_velocity, fetched_at
    ) VALUES (
        :id, :title, :abstract, :authors, :date, :source, :url, :score, :category, :tags,
        :hf_upvotes, :pdf_url, :code_url, :github_stars, :github_forks, :github_velocity, :fetched_at
    )
    ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        abstract = excluded.abstract,
        authors = excluded.authors,
        date = excluded.date,
        source = excluded.source,
        url = excluded.url,
        score = excluded.score,
        category = excluded.category,
        tags = excluded.tags,
        hf_upvotes = excluded.hf_upvotes,
        pdf_url = excluded.pdf_url,
        code_url = COALESCE(excluded.code_url, code_url),
        github_stars = MAX(excluded.github_stars, github_stars),
        github_forks = MAX(excluded.github_forks, github_forks),
        github_velocity = excluded.github_velocity
    """, [
        {
            "id": p.get("id"),
            "title": p.get("title"),
            "abstract": p.get("abstract"),
            "authors": json.dumps(p.get("authors", [])),
            "date": p.get("date"),
            "source": p.get("source"),
            "url": p.get("url"),
            "score": p.get("score", 0),
            "category": p.get("category"),
            "tags": json.dumps(p.get("tags", [])),
            "hf_upvotes": p.get("hf_upvotes", 0),
            "pdf_url": p.get("pdf_url"),
            "code_url": p.get("code_url"),
            "github_stars": p.get("github_stars", 0),
            "github_forks": p.get("github_forks", 0),
            "github_velocity": p.get("github_velocity", 0.0),
            "fetched_at": now
        }
        for p in papers
    ])

    conn.commit()
    conn.close()

def get_latest_paper_date(category: str) -> Optional[str]:
    """Get the latest published date for a category in the database."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(date) FROM papers WHERE category = ?", (category,))
    row = cursor.fetchone()
    conn.close()
    if row and row[0]:
        return row[0]
    return None

def query_trending_papers(page: int = 1, limit: int = 50, category: Optional[str] = None) -> list[dict]:
    """Retrieve trending papers matching category, with pagination."""
    conn = get_connection()
    cursor = conn.cursor()

    offset = (page - 1) * limit
    params: list[Any] = []

    sql = "SELECT * FROM papers"
    if category and category.strip():
        sql += " WHERE category = ?"
        params.append(category.strip())

    sql += " ORDER BY score DESC, date DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        # Reconstruct correct JSON lists/types
        d = dict(r)
        try:
            d["authors"] = json.loads(d["authors"])
        except Exception:
            d["authors"] = []
        try:
            d["tags"] = json.loads(d["tags"])
        except Exception:
            d["tags"] = []
        results.append(d)

    return results

def search_local_papers(query: str, limit: int = 50) -> list[dict]:
    """Search local SQLite database for papers matching query in title or abstract."""
    if not query.strip():
        return []
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # Simple case-insensitive search on title and abstract
    sql = """
    SELECT * FROM papers 
    WHERE title LIKE ? OR abstract LIKE ? 
    ORDER BY score DESC, date DESC 
    LIMIT ?
    """
    like_query = f"%{query.strip()}%"
    cursor.execute(sql, (like_query, like_query, limit))
    rows = cursor.fetchall()
    conn.close()
    
    results = []
    for r in rows:
        d = dict(r)
        try:
            d["authors"] = json.loads(d["authors"])
        except Exception:
            d["authors"] = []
        try:
            d["tags"] = json.loads(d["tags"])
        except Exception:
            d["tags"] = []
        results.append(d)
        
    return results
