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
        
        has_or = bool(os.getenv("OPENROUTER_API_KEY"))
        has_cerebras = bool(os.getenv("CEREBRAS_API_KEY"))

        # Configure Summary Agent routing chain
        if has_cerebras:
            config.summary_agent = ProviderConfig(
                model="groq/llama-3.3-70b-versatile",
                fallback="cerebras/llama-3.3-70b",
                emergency="openrouter/meta-llama/llama-3.3-70b-instruct" if has_or else "groq/llama-3.1-8b-instant",
                api_key_env="GROQ_API_KEY",
            )
        elif has_or:
            config.summary_agent = ProviderConfig(
                model="groq/llama-3.3-70b-versatile",
                fallback="openrouter/meta-llama/llama-3.3-70b-instruct",
                emergency="groq/llama-3.1-8b-instant",
                api_key_env="GROQ_API_KEY",
            )

        # Upgrade math agent if OpenRouter key available
        if has_or:
            config.math_agent = ProviderConfig(
                model="openrouter/deepseek/deepseek-r1",
                fallback="groq/llama-3.3-70b-versatile",
                emergency="groq/llama-3.1-8b-instant",
                api_key_env="OPENROUTER_API_KEY",
            )
            config.viz_agent = ProviderConfig(
                model="openrouter/qwen/qwen-2.5-coder-32b-instruct",
                fallback="groq/llama-3.3-70b-versatile",
                emergency="groq/llama-3.1-8b-instant",
                api_key_env="OPENROUTER_API_KEY",
            )
        return config