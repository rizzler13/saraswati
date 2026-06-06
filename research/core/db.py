import json
import sqlite3
import os
import re
from pathlib import Path
from typing import Optional, Any

DB_PATH_ENV = os.getenv("DATABASE_PATH")
DATABASE_URL = os.getenv("DATABASE_URL")

# Check if we should use PostgreSQL
IS_POSTGRES = DATABASE_URL is not None and (DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://"))

if DB_PATH_ENV:
    DB_PATH = Path(DB_PATH_ENV)
else:
    DB_PATH = Path(__file__).parent.parent.parent / "data" / "saraswati.db"

def init_db():
    """Initialize the database (PostgreSQL or SQLite) and create tables/indexes if not exist."""
    conn = get_connection()
    cursor = conn.cursor()

    if IS_POSTGRES:
        # Create papers table (PostgreSQL syntax)
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
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_score ON papers(score DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_category ON papers(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_date ON papers(date DESC)")
    else:
        # SQLite initialization
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            abstract TEXT,
            authors TEXT,
            date TEXT,
            source TEXT,
            url TEXT,
            score INTEGER DEFAULT 0,
            category TEXT,
            tags TEXT,
            hf_upvotes INTEGER DEFAULT 0,
            pdf_url TEXT,
            code_url TEXT,
            github_stars INTEGER DEFAULT 0,
            github_forks INTEGER DEFAULT 0,
            github_velocity REAL DEFAULT 0.0,
            fetched_at INTEGER
        )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_score ON papers(score DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_category ON papers(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_papers_date ON papers(date DESC)")

    conn.commit()
    conn.close()

def get_connection():
    """Return a database connection configured to work with dict row factory."""
    if IS_POSTGRES:
        import psycopg2
        # Update connection string from postgres:// to postgresql:// if needed
        conn_str = DATABASE_URL
        if conn_str.startswith("postgres://"):
            conn_str = conn_str.replace("postgres://", "postgresql://", 1)
        conn = psycopg2.connect(conn_str)
        return conn
    else:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        return conn

def get_cursor(conn):
    """Return a cursor configured to return row results as dictionary/dict-like objects."""
    if IS_POSTGRES:
        import psycopg2.extras
        return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        return conn.cursor()

def get_placeholder(query: str) -> str:
    """Helper to swap placeholders and functions between SQLite and PostgreSQL."""
    if IS_POSTGRES:
        # Swap :param for %(param)s
        q = re.sub(r':([a-zA-Z0-9_]+)', r'%(\1)s', query)
        # Swap ? for %s
        q = q.replace('?', '%s')
        # Swap scalar MAX function to PostgreSQL GREATEST function and add table prefix to resolve ambiguity
        q = q.replace('MAX(excluded.github_stars, github_stars)', 'GREATEST(excluded.github_stars, papers.github_stars)')
        q = q.replace('MAX(excluded.github_forks, github_forks)', 'GREATEST(excluded.github_forks, papers.github_forks)')
        # Add table prefix to resolve code_url ambiguity
        q = q.replace('COALESCE(excluded.code_url, code_url)', 'COALESCE(excluded.code_url, papers.code_url)')
        return q
    return query

def upsert_papers(papers: list[dict]):
    """Insert or update a list of papers in the database in bulk."""
    if not papers:
        return

    # Chunk operations in batches of 100 to prevent server connection drops on serverless databases
    chunk_size = 100
    for idx in range(0, len(papers), chunk_size):
        chunk = papers[idx:idx + chunk_size]
        conn = get_connection()
        cursor = get_cursor(conn)

        import time
        now = int(time.time())

        query = """
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
        """

        cursor.executemany(get_placeholder(query), [
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
            for p in chunk
        ])

        conn.commit()
        conn.close()

def get_latest_paper_date(category: str) -> Optional[str]:
    """Get the latest published date for a category in the database."""
    conn = get_connection()
    cursor = get_cursor(conn)
    query = "SELECT MAX(date) FROM papers WHERE category = ?"
    cursor.execute(get_placeholder(query), (category,))
    row = cursor.fetchone()
    conn.close()
    if row:
        if IS_POSTGRES:
            val = row.get("max") or row.get("MAX(date)")
        else:
            val = row[0]
        return val
    return None

def query_trending_papers(page: int = 1, limit: int = 50, category: Optional[str] = None) -> list[dict]:
    """Retrieve trending papers matching category, with pagination."""
    conn = get_connection()
    cursor = get_cursor(conn)

    offset = (page - 1) * limit
    params: list[Any] = []

    sql = "SELECT * FROM papers"
    if category and category.strip():
        sql += " WHERE LOWER(category) = LOWER(?)"
        params.append(category.strip())

    sql += " ORDER BY score DESC, date DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(get_placeholder(sql), params)
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

def search_local_papers(query: str, limit: int = 50) -> list[dict]:
    """Search local database for papers matching query in title or abstract."""
    if not query.strip():
        return []
    
    conn = get_connection()
    cursor = get_cursor(conn)
    
    sql = """
    SELECT * FROM papers 
    WHERE LOWER(title) LIKE LOWER(?) OR LOWER(abstract) LIKE LOWER(?) 
    ORDER BY score DESC, date DESC 
    LIMIT ?
    """
    like_query = f"%{query.strip()}%"
    cursor.execute(get_placeholder(sql), (like_query, like_query, limit))
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
