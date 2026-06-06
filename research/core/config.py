"""
Saraswati Research Engine -- Configuration

Multi-provider routing with fallback chains.
Each agent gets its own model chain optimized for its task.

API Keys should be set in a .env file at the project root:
  GROQ_API_KEY=gsk_...
  OPENROUTER_API_KEY=sk-or-...
"""
import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ProviderConfig:
    """Single provider configuration with fallback chain."""
    model: str
    fallback: Optional[str] = None
    emergency: Optional[str] = None
    api_key_env: str = ""

    @property
    def api_key(self) -> Optional[str]:
        if self.api_key_env:
            return os.getenv(self.api_key_env)
        return None


@dataclass
class ResearchConfig:
    """Full research engine configuration."""
    # Summary Agent: needs good structured output, fast
    summary_agent: ProviderConfig = field(default_factory=lambda: ProviderConfig(
        model="groq/llama-3.3-70b-versatile",
        fallback="groq/llama-3.1-8b-instant",
        api_key_env="GROQ_API_KEY",
    ))
    # Math Agent: needs strong mathematical reasoning
    math_agent: ProviderConfig = field(default_factory=lambda: ProviderConfig(
        model="groq/llama-3.3-70b-versatile",
        fallback="groq/llama-3.1-8b-instant",
        api_key_env="GROQ_API_KEY",
    ))
    # Visualization Agent: needs code generation ability
    viz_agent: ProviderConfig = field(default_factory=lambda: ProviderConfig(
        model="groq/llama-3.3-70b-versatile",
        fallback="groq/llama-3.1-8b-instant",
        api_key_env="GROQ_API_KEY",
    ))
    # Critique Agent: needs analytical reasoning
    critique_agent: ProviderConfig = field(default_factory=lambda: ProviderConfig(
        model="groq/llama-3.3-70b-versatile",
        fallback="groq/llama-3.1-8b-instant",
        api_key_env="GROQ_API_KEY",
    ))

    # Server
    host: str = "0.0.0.0"
    port: int = 8081
    cors_origins: list[str] = field(default_factory=lambda: [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:3000",
    ])

    # Deep dive settings
    deep_dive_cache_dir: str = "data/cache/deep_dives"
    deep_dive_cache_ttl: int = 86400 * 7  # 7 days
    max_pdf_size_mb: int = 50

    @classmethod
    def from_env(cls) -> "ResearchConfig":
        config = cls()
        
        has_cerebras = bool(os.getenv("CEREBRAS_API_KEY"))
        has_or = bool(os.getenv("OPENROUTER_API_KEY"))
        has_groq = bool(os.getenv("GROQ_API_KEY"))

        # Summary & Critique agents fallback lists
        summary_options = []
        if has_cerebras:
            summary_options.append(("cerebras/zai-glm-4.7", "CEREBRAS_API_KEY"))
        if has_or:
            summary_options.append(("openrouter/meta-llama/llama-3.3-70b-instruct", "OPENROUTER_API_KEY"))
        if has_groq:
            summary_options.append(("groq/llama-3.3-70b-versatile", "GROQ_API_KEY"))
            
        if not summary_options:
            summary_options = [("groq/llama-3.3-70b-versatile", "GROQ_API_KEY")]

        config.summary_agent = ProviderConfig(
            model=summary_options[0][0],
            fallback=summary_options[1][0] if len(summary_options) > 1 else "groq/llama-3.1-8b-instant",
            emergency=summary_options[2][0] if len(summary_options) > 2 else "groq/llama-3.1-8b-instant",
            api_key_env=summary_options[0][1],
        )
        config.critique_agent = ProviderConfig(
            model=summary_options[0][0],
            fallback=summary_options[1][0] if len(summary_options) > 1 else "groq/llama-3.1-8b-instant",
            emergency=summary_options[2][0] if len(summary_options) > 2 else "groq/llama-3.1-8b-instant",
            api_key_env=summary_options[0][1],
        )

        # Math agent (reasoning-heavy) fallback lists
        math_options = []
        if has_cerebras:
            math_options.append(("cerebras/zai-glm-4.7", "CEREBRAS_API_KEY"))
        if has_or:
            math_options.append(("openrouter/deepseek/deepseek-r1", "OPENROUTER_API_KEY"))
        if has_groq:
            math_options.append(("groq/llama-3.3-70b-versatile", "GROQ_API_KEY"))
            
        if not math_options:
            math_options = [("groq/llama-3.3-70b-versatile", "GROQ_API_KEY")]

        config.math_agent = ProviderConfig(
            model=math_options[0][0],
            fallback=math_options[1][0] if len(math_options) > 1 else "groq/llama-3.1-8b-instant",
            emergency=math_options[2][0] if len(math_options) > 2 else "groq/llama-3.1-8b-instant",
            api_key_env=math_options[0][1],
        )

        # Visualization agent (coding-heavy) fallback lists
        viz_options = []
        if has_cerebras:
            viz_options.append(("cerebras/zai-glm-4.7", "CEREBRAS_API_KEY"))
        if has_or:
            viz_options.append(("openrouter/qwen/qwen-2.5-coder-32b-instruct", "OPENROUTER_API_KEY"))
        if has_groq:
            viz_options.append(("groq/llama-3.3-70b-versatile", "GROQ_API_KEY"))
            
        if not viz_options:
            viz_options = [("groq/llama-3.3-70b-versatile", "GROQ_API_KEY")]

        config.viz_agent = ProviderConfig(
            model=viz_options[0][0],
            fallback=viz_options[1][0] if len(viz_options) > 1 else "groq/llama-3.1-8b-instant",
            emergency=viz_options[2][0] if len(viz_options) > 2 else "groq/llama-3.1-8b-instant",
            api_key_env=viz_options[0][1],
        )

        return config