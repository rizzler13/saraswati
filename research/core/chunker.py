"""
Smart paper chunking, summarization, and caching for Saraswati.

Pipeline:
  1. chunk_paper_text()   → Split full paper into logical sections
  2. summarize_chunks()   → Summarize each chunk with a cheap/fast LLM
  3. build_paper_digest()  → Combine chunk summaries into a compact digest

Caching layers:
  - Chunk summaries: cached by SHA-256 content hash (shared across papers)
  - Paper digests:   cached by paper_id (shared across users)
  - PDF text:        cached by paper_id (avoids re-downloading PDFs)
"""
import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger("saraswati.chunker")

# ===========================================================================
#  SECTION HEADINGS commonly found in academic papers (case-insensitive)
# ===========================================================================
_SECTION_PATTERNS = [
    # Numbered sections: "1. Introduction", "2 Methods", "3.1 Dataset"
    re.compile(r"^(\d+\.?\d*\.?\s+)([A-Z])", re.MULTILINE),
    # ALL CAPS headings: "INTRODUCTION", "RELATED WORK"
    re.compile(r"^([A-Z][A-Z\s&\-:]{4,})$", re.MULTILINE),
    # Common section names
    re.compile(
        r"^(?:Abstract|Introduction|Background|Related Work|Methodology|Methods|"
        r"Approach|Model|Architecture|Experiments?|Results?|Evaluation|Discussion|"
        r"Conclusion|Limitations|Acknowledgments?|References|Appendix)",
        re.MULTILINE | re.IGNORECASE,
    ),
]


# ===========================================================================
#  PERSISTENT CACHE (disk / S3)
# ===========================================================================

class ChunkCache:
    """Persistent cache for chunk summaries, paper digests, and PDF text.

    Storage layout on disk:
        cache_dir/
            chunk_summaries/   ← keyed by SHA-256 of chunk text
            paper_digests/     ← keyed by paper_id
            pdf_text/          ← keyed by paper_id
    
    When S3_BUCKET_NAME is set, uses S3 with the same key structure under
    a `chunker/` prefix.  Disk is still used as a fast local fallback.
    """

    def __init__(self, cache_dir: str):
        self.cache_dir = Path(cache_dir)
        self.bucket_name = os.getenv("S3_BUCKET_NAME")
        self.s3 = None
        if self.bucket_name:
            try:
                import boto3
                self.s3 = boto3.client("s3")
            except Exception:
                self.s3 = None
        # Always create local dirs (fast local fallback even if S3 is primary)
        for sub in ("chunk_summaries", "paper_digests", "pdf_text"):
            (self.cache_dir / sub).mkdir(parents=True, exist_ok=True)

    # --- low-level helpers ------------------------------------------------

    def _safe_key(self, raw: str) -> str:
        return raw.replace("/", "_").replace(".", "_")

    def _read(self, subdir: str, key: str) -> Optional[str]:
        """Read from S3 first, then local disk."""
        safe = self._safe_key(key)
        if self.s3:
            try:
                s3_key = f"chunker/{subdir}/{safe}.json"
                resp = self.s3.get_object(Bucket=self.bucket_name, Key=s3_key)
                return resp["Body"].read().decode("utf-8")
            except Exception:
                pass
        path = self.cache_dir / subdir / f"{safe}.json"
        if path.exists():
            try:
                return path.read_text()
            except Exception:
                pass
        return None

    def _write(self, subdir: str, key: str, data: str):
        """Write to both S3 and local disk."""
        safe = self._safe_key(key)
        # Local disk
        path = self.cache_dir / subdir / f"{safe}.json"
        try:
            path.write_text(data)
        except Exception as e:
            logger.warning(f"Disk cache write failed ({subdir}/{safe}): {e}")
        # S3
        if self.s3:
            try:
                s3_key = f"chunker/{subdir}/{safe}.json"
                self.s3.put_object(
                    Bucket=self.bucket_name,
                    Key=s3_key,
                    Body=data,
                    ContentType="application/json",
                )
            except Exception as e:
                logger.warning(f"S3 cache write failed ({subdir}/{safe}): {e}")

    # --- public API -------------------------------------------------------

    def get_chunk_summary(self, chunk_hash: str) -> Optional[str]:
        raw = self._read("chunk_summaries", chunk_hash)
        if raw:
            try:
                return json.loads(raw).get("summary")
            except Exception:
                pass
        return None

    def put_chunk_summary(self, chunk_hash: str, summary: str):
        data = json.dumps({"summary": summary, "cached_at": time.time()})
        self._write("chunk_summaries", chunk_hash, data)

    def get_paper_digest(self, paper_id: str) -> Optional[str]:
        raw = self._read("paper_digests", paper_id)
        if raw:
            try:
                obj = json.loads(raw)
                # Digests expire after 7 days
                if time.time() - obj.get("cached_at", 0) < 86400 * 7:
                    return obj.get("digest")
            except Exception:
                pass
        return None

    def put_paper_digest(self, paper_id: str, digest: str):
        data = json.dumps({"digest": digest, "cached_at": time.time()})
        self._write("paper_digests", paper_id, data)

    def get_pdf_text(self, paper_id: str) -> Optional[dict]:
        """Returns {"text": str, "fig_pages": list[int]} or None."""
        raw = self._read("pdf_text", paper_id)
        if raw:
            try:
                obj = json.loads(raw)
                if time.time() - obj.get("cached_at", 0) < 86400 * 30:  # 30 days
                    return {"text": obj["text"], "fig_pages": obj.get("fig_pages", [])}
            except Exception:
                pass
        return None

    def put_pdf_text(self, paper_id: str, text: str, fig_pages: list[int]):
        data = json.dumps({
            "text": text,
            "fig_pages": fig_pages,
            "cached_at": time.time(),
        })
        self._write("pdf_text", paper_id, data)


# ===========================================================================
#  CHUNKING
# ===========================================================================

def _content_hash(text: str) -> str:
    """SHA-256 hash of text content for cache keying."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:24]


def chunk_paper_text(
    full_text: str,
    max_chars: int = 12_000,
    min_chars: int = 500,
) -> list[str]:
    """Split paper text into logical chunks by section headings.

    Falls back to paragraph-boundary splitting if no headings are found.
    Each chunk stays under `max_chars` characters.
    """
    if not full_text or len(full_text) < min_chars:
        return [full_text] if full_text else []

    # --- Try to split on section headings first ---
    # Find all heading positions
    heading_positions = set()
    for pattern in _SECTION_PATTERNS:
        for match in pattern.finditer(full_text):
            heading_positions.add(match.start())

    if len(heading_positions) >= 3:
        # We have enough headings for meaningful sections
        positions = sorted(heading_positions)
        # Add start and end
        if positions[0] > 0:
            positions.insert(0, 0)
        positions.append(len(full_text))

        chunks = []
        for i in range(len(positions) - 1):
            section = full_text[positions[i]:positions[i + 1]].strip()
            if not section:
                continue
            # If section is too large, split it further by paragraphs
            if len(section) > max_chars:
                sub_chunks = _split_by_paragraphs(section, max_chars)
                chunks.extend(sub_chunks)
            elif section and len(section) >= min_chars:
                chunks.append(section)
            elif chunks:
                # Merge tiny sections into previous chunk
                chunks[-1] += "\n\n" + section
        return chunks if chunks else [full_text[:max_chars]]

    # --- Fallback: split by paragraphs ---
    return _split_by_paragraphs(full_text, max_chars)


def _split_by_paragraphs(text: str, max_chars: int) -> list[str]:
    """Split text into chunks at paragraph boundaries."""
    paragraphs = re.split(r"\n\s*\n", text)
    chunks = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) + 2 > max_chars:
            if current:
                chunks.append(current.strip())
            # If single paragraph exceeds max, force-split by sentences
            if len(para) > max_chars:
                sentences = re.split(r"(?<=[.!?])\s+", para)
                current = ""
                for sent in sentences:
                    if len(current) + len(sent) + 1 > max_chars:
                        if current:
                            chunks.append(current.strip())
                        current = sent
                    else:
                        current += " " + sent if current else sent
            else:
                current = para
        else:
            current += "\n\n" + para if current else para

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text[:max_chars]]


# ===========================================================================
#  CHUNK SUMMARIZATION
# ===========================================================================

_CHUNK_SUMMARY_SYSTEM = """You are a research paper analyst. Summarize the following section of an academic paper.
Preserve:
- Key technical details, method names, and model names
- Specific numbers, metrics, and benchmark results
- Mathematical notation and equations (use LaTeX: $inline$ or $$display$$)
- Important claims and findings

Be concise but information-dense. Target 200-400 words. Output ONLY the summary text, no headers or labels."""


async def summarize_chunks(
    chunks: list[str],
    paper_title: str,
    cache: "ChunkCache",
    config=None,
) -> list[str]:
    """Summarize each chunk independently, using cache where available.

    Uses a cheap/fast model (llama-3.1-8b-instant on Cerebras or Groq)
    to keep each call small (~3-4K tokens).
    """
    from .llm import complete

    # Pick the cheapest/fastest models for chunk summarization
    primary, fallback, emergency = _pick_cheap_models()
    logger.info(
        f"Summarizing {len(chunks)} chunks for '{paper_title}' "
        f"using chain: {primary} → {fallback} → {emergency}"
    )

    summaries = []
    for i, chunk in enumerate(chunks):
        chunk_hash = _content_hash(chunk)

        # Check cache first
        cached = cache.get_chunk_summary(chunk_hash)
        if cached:
            logger.debug(f"Chunk {i+1}/{len(chunks)}: cache hit ({chunk_hash})")
            summaries.append(cached)
            continue

        # Summarize with LLM
        try:
            messages = [
                {"role": "system", "content": _CHUNK_SUMMARY_SYSTEM},
                {
                    "role": "user",
                    "content": (
                        f"Paper: {paper_title}\n\n"
                        f"Section {i+1} of {len(chunks)}:\n\n"
                        f"{chunk[:12000]}"  # Safety cap per chunk
                    ),
                },
            ]
            summary = await complete(
                model=primary,
                fallback=fallback,
                emergency=emergency,
                messages=messages,
                max_tokens=1024,
                temperature=0.1,
            )
            summaries.append(summary)
            cache.put_chunk_summary(chunk_hash, summary)
            logger.info(f"Chunk {i+1}/{len(chunks)}: summarized ({len(summary)} chars)")
        except Exception as e:
            logger.warning(f"Chunk {i+1} summarization failed: {e}")
            # Fallback: use first 2000 chars of the raw chunk
            fallback_text = chunk[:2000] + "..." if len(chunk) > 2000 else chunk
            summaries.append(fallback_text)

    return summaries


def _pick_cheap_models() -> tuple[str, Optional[str], Optional[str]]:
    """Pick cheap models (primary, fallback, emergency) for chunk summarization.

    Prefer Cerebras (blazing fast & doesn't touch Groq TPM limits),
    falling back to Groq Llama 3.1 8B, then OpenRouter Llama 3.1 8B.
    """
    has_cerebras = bool(os.getenv("CEREBRAS_API_KEY"))
    has_groq = bool(os.getenv("GROQ_API_KEY"))
    has_or = bool(os.getenv("OPENROUTER_API_KEY"))

    options = []
    if has_cerebras:
        options.append("cerebras/llama3.1-8b")
    if has_groq:
        options.append("groq/llama-3.1-8b-instant")
    if has_or:
        options.append("openrouter/meta-llama/llama-3.1-8b-instruct")

    if not options:
        return "groq/llama-3.1-8b-instant", None, None

    primary = options[0]
    fallback = options[1] if len(options) > 1 else "groq/llama-3.1-8b-instant"
    emergency = options[2] if len(options) > 2 else "groq/llama-3.1-8b-instant"
    return primary, fallback, emergency


# ===========================================================================
#  PAPER DIGEST
# ===========================================================================

def build_paper_digest(
    chunk_summaries: list[str],
    abstract: str,
    paper_title: str,
) -> str:
    """Combine chunk summaries into a single compact paper digest.

    This is NOT an LLM call — it's a deterministic concatenation.
    The digest replaces the raw full_text in the deep dive prompt,
    cutting tokens from ~15K to ~4-6K.
    """
    parts = [f"PAPER: {paper_title}\n"]

    if abstract:
        parts.append(f"ABSTRACT:\n{abstract}\n")

    parts.append("DETAILED SECTION SUMMARIES:\n")
    for i, summary in enumerate(chunk_summaries, 1):
        parts.append(f"--- Section {i} ---\n{summary}\n")

    digest = "\n".join(parts)
    logger.info(
        f"Built paper digest: {len(digest)} chars "
        f"(from {len(chunk_summaries)} chunk summaries)"
    )
    return digest


# ===========================================================================
#  FULL PIPELINE
# ===========================================================================

async def prepare_paper_digest(
    paper_id: str,
    paper_title: str,
    full_text: str,
    abstract: str,
    cache: "ChunkCache",
    config=None,
) -> str:
    """Full pipeline: chunk → summarize → digest.

    Returns the paper digest string ready for the deep dive prompt.
    Caches the final digest by paper_id for cross-user reuse.
    """
    # Check digest cache first
    cached_digest = cache.get_paper_digest(paper_id)
    if cached_digest:
        logger.info(f"Paper digest cache hit for {paper_id}")
        return cached_digest

    # Step 1: Chunk
    chunks = chunk_paper_text(full_text)
    logger.info(f"Split paper into {len(chunks)} chunks")

    # Step 2: Summarize each chunk
    summaries = await summarize_chunks(
        chunks=chunks,
        paper_title=paper_title,
        cache=cache,
        config=config,
    )

    # Step 3: Build digest
    digest = build_paper_digest(summaries, abstract, paper_title)

    # Cache the digest
    cache.put_paper_digest(paper_id, digest)

    return digest
