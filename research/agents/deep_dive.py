"""
Deep-dive article generation for Saraswati.

Pipeline:
  1. Download PDF from arXiv
  2. Parse with PyMuPDF
  3. Generate structured deep-dive with LLM
  4. Cache result
"""
import json
import logging
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

import httpx

from .specialized import (
    ContentBlock,
    Chapter,
    generate_deep_dive_content,
)
from ..core.config import ResearchConfig

logger = logging.getLogger("saraswati.deepdive")


@dataclass
class DeepDiveResult:
    """Complete deep-dive article."""
    paper_id: str
    title: str
    subtitle: str = ""
    authors: list[str] = field(default_factory=list)
    date: str = ""
    tags: list[str] = field(default_factory=list)
    abstract: str = ""
    chapters: list[dict] = field(default_factory=list)
    citations: list[str] = field(default_factory=list)
    figures: list[dict] = field(default_factory=list)
    generated_at: float = 0.0
    generation_time_s: float = 0.0
    source_url: str = ""
    status: str = "complete"

    def to_dict(self) -> dict:
        return asdict(self)


import os
import boto3

class DeepDiveCache:
    """Simple S3 and file-based cache for deep-dive articles."""

    def __init__(self, cache_dir: str = "data/cache/deep_dives", ttl: int = 86400 * 7):
        self.cache_dir = Path(cache_dir)
        self.ttl = ttl
        self.bucket_name = os.getenv("S3_BUCKET_NAME")
        self.s3 = None
        if self.bucket_name:
            try:
                self.s3 = boto3.client("s3")
                logger.info(f"Using AWS S3 bucket '{self.bucket_name}' for deep-dive cache.")
            except Exception as e:
                logger.warning(f"Failed to initialize S3 client: {e}. Falling back to disk cache.")
                self.s3 = None
        
        if not self.s3:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _key(self, paper_id: str) -> str:
        return paper_id.replace("/", "_").replace(".", "_") + ".json"

    def get(self, paper_id: str) -> Optional[DeepDiveResult]:
        key_name = self._key(paper_id)
        if self.s3:
            try:
                s3_key = f"deep_dives/{key_name}"
                resp = self.s3.get_object(Bucket=self.bucket_name, Key=s3_key)
                data = json.loads(resp["Body"].read().decode("utf-8"))
                age = time.time() - data.get("generated_at", 0)
                if age < self.ttl:
                    from dataclasses import fields
                    valid_keys = {f.name for f in fields(DeepDiveResult)}
                    filtered_data = {k: v for k, v in data.items() if k in valid_keys}
                    return DeepDiveResult(**filtered_data)
            except Exception as e:
                # Check for NoSuchKey in a safe way without needing botocore imports at top level
                if "NoSuchKey" not in str(type(e)) and "404" not in str(e):
                    logger.warning(f"S3 cache read failed for {paper_id}: {e}")
        else:
            path = self.cache_dir / key_name
            if path.exists():
                try:
                    data = json.loads(path.read_text())
                    age = time.time() - data.get("generated_at", 0)
                    if age < self.ttl:
                        from dataclasses import fields
                        valid_keys = {f.name for f in fields(DeepDiveResult)}
                        filtered_data = {k: v for k, v in data.items() if k in valid_keys}
                        return DeepDiveResult(**filtered_data)
                except Exception as e:
                    logger.warning(f"Disk cache read failed for {paper_id}: {e}")
        return None

    def put(self, result: DeepDiveResult):
        key_name = self._key(result.paper_id)
        data_str = json.dumps(result.to_dict(), indent=2)
        if self.s3:
            try:
                s3_key = f"deep_dives/{key_name}"
                self.s3.put_object(
                    Bucket=self.bucket_name,
                    Key=s3_key,
                    Body=data_str,
                    ContentType="application/json"
                )
                logger.info(f"Successfully cached {result.paper_id} to S3.")
            except Exception as e:
                logger.warning(f"S3 cache write failed for {result.paper_id}: {e}")
        else:
            path = self.cache_dir / key_name
            try:
                path.write_text(data_str)
            except Exception as e:
                logger.warning(f"Disk cache write failed for {result.paper_id}: {e}")

    def list_available(self) -> list[dict]:
        results = []
        if self.s3:
            try:
                resp = self.s3.list_objects_v2(Bucket=self.bucket_name, Prefix="deep_dives/")
                for obj in resp.get("Contents", []):
                    key = obj["Key"]
                    if not key.endswith(".json"):
                        continue
                    try:
                        get_resp = self.s3.get_object(Bucket=self.bucket_name, Key=key)
                        data = json.loads(get_resp["Body"].read().decode("utf-8"))
                        results.append({
                            "paper_id": data.get("paper_id", ""),
                            "title": data.get("title", ""),
                            "generated_at": data.get("generated_at", 0),
                            "status": data.get("status", ""),
                        })
                    except Exception:
                        continue
            except Exception as e:
                logger.warning(f"S3 list objects failed: {e}")
        else:
            for path in self.cache_dir.glob("*.json"):
                try:
                    data = json.loads(path.read_text())
                    results.append({
                        "paper_id": data.get("paper_id", ""),
                        "title": data.get("title", ""),
                        "generated_at": data.get("generated_at", 0),
                        "status": data.get("status", ""),
                    })
                except Exception:
                    continue
        results.sort(key=lambda x: x.get("generated_at", 0), reverse=True)
        return results


async def _download_and_parse_pdf(
    paper_id: str,
    client: httpx.AsyncClient,
) -> tuple[str, list[dict]]:
    """Download PDF and extract both text and figures.
    Returns (full_text, figures_list)."""
    pdf_url = f"https://export.arxiv.org/pdf/{paper_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        resp = await client.get(pdf_url, headers=headers, timeout=15.0, follow_redirects=True)
        if resp.status_code != 200:
            logger.warning(f"PDF download failed: {resp.status_code}")
            return "", []

        pdf_bytes = resp.content

        # Extract text
        from ..parsing.pdf_parser import extract_text_from_pdf, extract_figures_from_pdf
        full_text = extract_text_from_pdf(pdf_bytes, max_pages=25)
        figures = extract_figures_from_pdf(pdf_bytes, max_figures=6, min_size=8000)

        return full_text, figures

    except Exception as e:
        logger.warning(f"PDF download/parse failed: {e}")
        return "", []


async def generate_deep_dive(
    paper_id: str,
    paper_title: str,
    paper_abstract: str,
    paper_authors: list[str],
    paper_date: str,
    paper_tags: list[str],
    config: ResearchConfig,
    client: httpx.AsyncClient,
    cache: DeepDiveCache,
    chunk_cache=None,
) -> DeepDiveResult:
    """Generate a full deep-dive article for a paper.

    Pipeline:
      1. Check deep dive cache → return if complete
      2. Download PDF → cache raw text + figures
      3. Chunk → summarize → build digest (all cached)
      4. Generate structured deep dive with compact digest
      5. Cache final result
    """
    from ..core.chunker import ChunkCache, prepare_paper_digest

    start_time = time.time()

    # Check deep dive cache
    cached = cache.get(paper_id)
    if cached and cached.status != "generating":
        return cached

    # --- Step 1: Get PDF text (cached or fresh download) ---
    logger.info(f"Generating deep-dive for: {paper_title}")

    full_text = ""
    figures = []
    fig_pages = []

    # Check PDF text cache first
    if chunk_cache:
        pdf_cached = chunk_cache.get_pdf_text(paper_id)
        if pdf_cached:
            full_text = pdf_cached["text"]
            fig_pages = pdf_cached.get("fig_pages", [])
            logger.info(f"PDF text cache hit for {paper_id} ({len(full_text)} chars)")

    if not full_text:
        # Download and parse PDF
        full_text, figures = await _download_and_parse_pdf(paper_id, client)
        fig_pages = [fig["page"] for fig in figures]

        # Cache the extracted PDF text for future reuse
        if full_text and chunk_cache:
            chunk_cache.put_pdf_text(paper_id, full_text, fig_pages)
            logger.info(f"Cached PDF text for {paper_id} ({len(full_text)} chars)")

    if not full_text:
        full_text = paper_abstract  # Fallback to abstract

    # --- Step 2: Build paper digest via chunking pipeline ---
    paper_digest = None
    if chunk_cache and len(full_text) > 3000:
        try:
            paper_digest = await prepare_paper_digest(
                paper_id=paper_id,
                paper_title=paper_title,
                full_text=full_text,
                abstract=paper_abstract,
                cache=chunk_cache,
                config=config,
            )
            logger.info(
                f"Paper digest ready: {len(paper_digest)} chars "
                f"(original text: {len(full_text)} chars, "
                f"reduction: {100 - len(paper_digest) * 100 // max(1, len(full_text))}%)"
            )
        except Exception as e:
            logger.warning(f"Chunking pipeline failed, falling back to raw text: {e}")
            paper_digest = None

    # --- Step 3: Generate structured deep dive content ---
    try:
        structured = await generate_deep_dive_content(
            paper_title=paper_title,
            paper_abstract=paper_abstract,
            paper_authors=paper_authors,
            paper_tags=paper_tags,
            full_text=full_text,
            config=config.summary_agent,
            fig_pages=fig_pages,
            paper_digest=paper_digest,
        )

        # Merge figure explanations from LLM JSON to figures list
        explanations = structured.get("figure_explanations", [])
        for i, fig in enumerate(figures):
            if i < len(explanations):
                fig["title"] = explanations[i].get("title", f"Figure {i+1}")
                fig["explanation"] = explanations[i].get("explanation", "Visual representation from the paper.")
            else:
                fig["title"] = f"Figure {i+1}"
                fig["explanation"] = "Visual asset from the paper."

        generation_time = time.time() - start_time

        result = DeepDiveResult(
            paper_id=paper_id,
            title=paper_title,
            subtitle=structured.get("subtitle", ""),
            authors=paper_authors,
            date=paper_date,
            tags=paper_tags,
            abstract=paper_abstract,
            chapters=structured.get("chapters", []),
            citations=structured.get("citations", []),
            figures=figures,
            generated_at=time.time(),
            generation_time_s=round(generation_time, 1),
            source_url=f"https://arxiv.org/abs/{paper_id}",
            status="complete",
        )

    except Exception as e:
        logger.error(f"Deep dive generation failed: {e}")
        generation_time = time.time() - start_time
        result = DeepDiveResult(
            paper_id=paper_id,
            title=paper_title,
            subtitle="Generation failed",
            authors=paper_authors,
            date=paper_date,
            tags=paper_tags,
            abstract=paper_abstract,
            chapters=[{
                "number": "01",
                "title": "Error",
                "lede": f"Deep-dive generation encountered an error: {str(e)}",
                "content": [{"type": "prose", "text": f"Please check that your API keys (GROQ_API_KEY or OPENROUTER_API_KEY) are correctly configured in the .env file.\n\nError details: {str(e)}"}],
            }],
            generated_at=time.time(),
            generation_time_s=round(generation_time, 1),
            source_url=f"https://arxiv.org/abs/{paper_id}",
            status="error",
        )

    # Cache result
    cache.put(result)
    return result