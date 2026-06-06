"""
LiteLLM wrapper with fallback routing, key rotation, and caching.

Core philosophy: never let a single provider failure kill the request.
Try primary -> alt key -> fallback -> emergency, cache aggressively.
"""
import asyncio
import hashlib
import json
import logging
import os
from typing import Optional

import litellm

logger = logging.getLogger(__name__)

# Suppress litellm noise
litellm.suppress_debug_info = True
litellm.set_verbose = False

# In-memory semantic cache (replace with Redis later)
_cache: dict[str, str] = {}
_MAX_CACHE = 2000


def _cache_key(model: str, messages: list[dict]) -> str:
    raw = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ===========================================================================
#  API KEY ROTATION
# ===========================================================================

def _get_api_keys(provider: str) -> list[str]:
    """Get all available API keys for a provider (primary + alternates).

    Checks for:
      CEREBRAS_API_KEY, CEREBRAS_ALT_API_KEY, CEREBRAS_ALT2_API_KEY, ...
      GROQ_API_KEY, GROQ_ALT_API_KEY, ...
      OPENROUTER_API_KEY, OPENROUTER_ALT_API_KEY, ...
    """
    prefix = provider.upper()
    keys = []

    # Primary key
    primary = os.getenv(f"{prefix}_API_KEY")
    if primary:
        keys.append(primary.strip())

    # Alt keys: _ALT_API_KEY, _ALT2_API_KEY, _ALT3_API_KEY, ...
    alt = os.getenv(f"{prefix}_ALT_API_KEY")
    if alt:
        keys.append(alt.strip())
    for i in range(2, 6):
        alt_n = os.getenv(f"{prefix}_ALT{i}_API_KEY")
        if alt_n:
            keys.append(alt_n.strip())

    return keys


def _provider_from_model(model: str) -> str:
    """Extract provider name from model string."""
    if model.startswith("groq/"):
        return "groq"
    elif model.startswith("openrouter/"):
        return "openrouter"
    elif model.startswith("cerebras/"):
        return "cerebras"
    return ""


# ===========================================================================
#  MAIN COMPLETION FUNCTION
# ===========================================================================

async def complete(
    model: str,
    messages: list[dict],
    fallback: Optional[str] = None,
    emergency: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 2048,
    api_key: Optional[str] = None,
) -> str:
    """
    Call LiteLLM with automatic fallback routing and key rotation.

    For each model in the chain (primary → fallback → emergency):
      1. Try the primary API key
      2. On rate limit → try alternate keys for the same model
      3. On all keys exhausted → move to next model in chain

    Returns the completion text.
    """
    # Check cache first
    key = _cache_key(model, messages)
    if key in _cache:
        logger.debug(f"Cache hit: {key}")
        return _cache[key]

    models_to_try = [m for m in [model, fallback, emergency] if m]

    last_error = None
    for m in models_to_try:
        provider = _provider_from_model(m)

        # Build list of API keys to try for this model
        if api_key:
            # Caller specified a key explicitly (e.g. parallel Cerebras calls)
            keys_to_try = [api_key]
        elif provider:
            keys_to_try = _get_api_keys(provider)
        else:
            keys_to_try = [None]

        if not keys_to_try:
            keys_to_try = [None]

        for key_idx, current_key in enumerate(keys_to_try):
            try:
                key_label = f"key#{key_idx+1}" if len(keys_to_try) > 1 else "primary"
                logger.info(f"Trying model: {m} ({key_label})")

                response = await litellm.acompletion(
                    model=m,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    api_key=current_key,
                    timeout=45,
                )
                content = response.choices[0].message.content or ""
                finish_reason = getattr(response.choices[0], "finish_reason", None)

                # If response was truncated due to output limits, try next
                if finish_reason == "length" and (
                    key_idx < len(keys_to_try) - 1 or m != models_to_try[-1]
                ):
                    raise RuntimeError(f"Model {m} response was truncated (length limit)")

                # Cache the result only if it was not truncated
                if finish_reason != "length" and len(_cache) < _MAX_CACHE:
                    _cache[key] = content

                return content

            except Exception as e:
                last_error = e
                err_str = str(e).lower()
                is_rate_limit = (
                    "rate_limit" in err_str
                    or "ratelimit" in err_str
                    or "429" in err_str
                    or "too many requests" in err_str
                    or "tokens per minute" in err_str
                )

                if is_rate_limit and key_idx < len(keys_to_try) - 1:
                    # Rate limited → try alternate key for SAME model
                    logger.warning(
                        f"Rate limited on {m} (key#{key_idx+1}), "
                        f"rotating to key#{key_idx+2}..."
                    )
                    await asyncio.sleep(0.5)
                    continue
                elif is_rate_limit:
                    # All keys exhausted for this model → move to next model
                    logger.warning(
                        f"Rate limited on {m} (all {len(keys_to_try)} keys exhausted). "
                        f"Falling to next model..."
                    )
                    await asyncio.sleep(1.0)
                    break
                else:
                    # Non-rate-limit error → move to next model
                    logger.warning(f"Model {m} failed: {e}")
                    await asyncio.sleep(1.0)
                    break

    error_msg = f"All models failed. Last error: {last_error}"
    logger.error(error_msg)
    raise RuntimeError(error_msg)


def clear_cache():
    """Clear the semantic cache."""
    _cache.clear()
