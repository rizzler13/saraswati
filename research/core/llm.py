"""
LiteLLM wrapper with fallback routing and caching.

Core philosophy: never let a single provider failure kill the request.
Try primary -> fallback -> emergency, cache aggressively.
"""
import hashlib
import json
import logging
from typing import Optional

import litellm

logger = logging.getLogger(__name__)

# Suppress litellm noise
litellm.suppress_debug_info = True
litellm.set_verbose = False

# In-memory semantic cache (replace with Redis later)
_cache: dict[str, str] = {}
_MAX_CACHE = 500


def _cache_key(model: str, messages: list[dict]) -> str:
    raw = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


async def complete(
    model: str,
    messages: list[dict],
    fallback: Optional[str] = None,
    emergency: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 2048,
) -> str:
    """
    Call LiteLLM with automatic fallback routing.

    Returns the completion text. On failure, tries fallback models.
    """
    # Check cache first
    key = _cache_key(model, messages)
    if key in _cache:
        logger.debug(f"Cache hit: {key}")
        return _cache[key]

    models_to_try = [m for m in [model, fallback, emergency] if m]

    import os
    last_error = None
    for m in models_to_try:
        try:
            logger.info(f"Trying model: {m}")
            # Explicitly select API key to avoid environment confusion
            api_key = None
            if m.startswith("groq/"):
                api_key = os.getenv("GROQ_API_KEY")
            elif m.startswith("openrouter/"):
                api_key = os.getenv("OPENROUTER_API_KEY")
            elif m.startswith("cerebras/"):
                api_key = os.getenv("CEREBRAS_API_KEY")

            response = await litellm.acompletion(
                model=m,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                api_key=api_key,
            )
            content = response.choices[0].message.content or ""

            # Cache the result
            if len(_cache) < _MAX_CACHE:
                _cache[key] = content

            return content

        except Exception as e:
            last_error = e
            logger.warning(f"Model {m} failed: {e}")
            import asyncio
            await asyncio.sleep(2.0)
            continue

    error_msg = f"All models failed. Last error: {last_error}"
    logger.error(error_msg)
    raise RuntimeError(error_msg)


def clear_cache():
    """Clear the semantic cache."""
    _cache.clear()
