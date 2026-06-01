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


class DeepDiveCache:
    """Simple file-based cache for deep-dive articles."""

    def __init__(self, cache_dir: str = "data/cache/deep_dives", ttl: int = 86400 * 7):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl

    def _key(self, paper_id: str) -> Path:
        safe_id = paper_id.replace("/", "_").replace(".", "_")
        return self.cache_dir / f"{safe_id}.json"

    def get(self, paper_id: str) -> Optional[DeepDiveResult]:
        path = self._key(paper_id)
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
                logger.warning(f"Cache read failed for {paper_id}: {e}")
        return None

    def put(self, result: DeepDiveResult):
        path = self._key(result.paper_id)
        try:
            path.write_text(json.dumps(result.to_dict(), indent=2))
        except Exception as e:
            logger.warning(f"Cache write failed for {result.paper_id}: {e}")

    def list_available(self) -> list[dict]:
        results = []
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
    pdf_url = f"https://arxiv.org/pdf/{paper_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        resp = await client.get(pdf_url, headers=headers, timeout=45.0, follow_redirects=True)
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
) -> DeepDiveResult:
    """Generate a full deep-dive article for a paper."""
    start_time = time.time()

    # Check cache
    cached = cache.get(paper_id)
    if cached:
        return cached

    # Download and parse PDF (text + figures)
    logger.info(f"Generating deep-dive for: {paper_title}")
    full_text, figures = await _download_and_parse_pdf(paper_id, client)
    if not full_text:
        full_text = paper_abstract  # Fallback to abstract

    fig_pages = [fig["page"] for fig in figures]

    # Generate structured content
    try:
        structured = await generate_deep_dive_content(
            paper_title=paper_title,
            paper_abstract=paper_abstract,
            paper_authors=paper_authors,
            paper_tags=paper_tags,
            full_text=full_text,
            config=config.summary_agent,
            fig_pages=fig_pages,
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