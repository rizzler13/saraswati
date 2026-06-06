"""
Specialized research agents for Saraswati.

Each agent produces STRUCTURED JSON output designed for the DeepDive renderer.
They receive relevant context (NOT the full paper) and produce rich, typed content blocks.
"""
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from ..core.llm import complete
from ..core.config import ProviderConfig

logger = logging.getLogger("saraswati.agents")


@dataclass
class ContentBlock:
    """A typed content block for the deep-dive renderer."""
    type: str  # prose | pullquote | callout | comparison | equation | steps | benchmark | mermaid
    data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"type": self.type, **self.data}


@dataclass
class Chapter:
    """A chapter in the deep-dive."""
    number: str
    title: str
    lede: str = ""
    content: list[ContentBlock] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "number": self.number,
            "title": self.title,
            "lede": self.lede,
            "content": [c.to_dict() for c in self.content],
        }


@dataclass
class AgentResult:
    """Structured result from any agent."""
    agent: str
    content: str  # Raw text fallback
    chapters: list[Chapter] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    viz_spec: Optional[dict] = None
    structured: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "agent": self.agent,
            "content": self.content,
            "chapters": [c.to_dict() for c in self.chapters],
            "sources": self.sources,
            "viz_spec": self.viz_spec,
        }


# === QUERY CLASSIFICATION ===

CLASSIFY_KEYWORDS = {
    "math": ["equation", "formula", "derivative", "gradient", "loss function", "proof",
             "theorem", "lemma", "convergence", "optimization", "mathematical",
             "calculus", "integral", "matrix", "eigenvalue", "algebra", "notation"],
    "visualization": ["visualize", "diagram", "plot", "chart", "graph", "draw",
                      "architecture", "flowchart", "pipeline", "figure", "show me"],
    "critique": ["limitation", "weakness", "compare", "versus", "vs", "better than",
                 "advantage", "disadvantage", "criticism", "flaw", "issue", "problem with",
                 "why not", "alternative"],
}


def classify_query(query: str) -> str:
    """Classify a user query into an agent type."""
    q = query.lower()
    scores = {agent: 0 for agent in CLASSIFY_KEYWORDS}
    for agent, keywords in CLASSIFY_KEYWORDS.items():
        for kw in keywords:
            if kw in q:
                scores[agent] += 1
    best = max(scores, key=scores.get)
    if scores[best] > 0:
        return best
    return "summary"


# === AGENT SYSTEM PROMPTS ===

SUMMARY_SYSTEM = """You are a research scientist writing a detailed analysis of an academic paper.
Write in clear, accessible prose. Use markdown for formatting.
Include:
- Key contributions and novelty
- Methodology overview
- Main results and findings
- Practical implications

Use LaTeX notation for any math: $inline$ or $$display$$.
Use ```mermaid blocks for diagrams when helpful.
Be thorough but readable. Target an audience of ML practitioners."""

MATH_SYSTEM = """You are a mathematics expert analyzing the mathematical foundations of a research paper.
Focus on:
- Core equations and their derivations
- Mathematical notation explained clearly
- Step-by-step breakdowns of key formulas
- Intuitive explanations of mathematical concepts

ALWAYS use LaTeX notation: $inline$ for inline math, $$display$$ for display equations.
When explaining symbols, list each one with its meaning.
Make complex math accessible to graduate students."""

VIZ_SYSTEM = """You are a technical writer creating visual explanations of research.
When asked about architecture or pipelines, create Mermaid diagrams.
Use ```mermaid code blocks for diagrams.
Supported diagram types: flowchart, sequenceDiagram, classDiagram, stateDiagram.
Also describe components in clear prose alongside diagrams.
Use LaTeX for any math: $inline$ or $$display$$."""

CRITIQUE_SYSTEM = """You are a senior researcher providing critical analysis of a paper.
Address:
- Strengths and weaknesses
- Experimental validity
- Comparison with related work
- Missing baselines or evaluations
- Potential failure modes
- Suggestions for improvement

Be balanced, fair, and constructive. Support claims with evidence from the paper.
Use LaTeX for math: $inline$ or $$display$$."""


AGENT_MAP = {
    "summary": SUMMARY_SYSTEM,
    "math": MATH_SYSTEM,
    "visualization": VIZ_SYSTEM,
    "critique": CRITIQUE_SYSTEM,
}


# === CHAT AGENT ===

async def chat_agent(
    query: str,
    context: str,
    config: ProviderConfig,
    history: list[dict] = None,
    agent_type: str = "summary",
) -> AgentResult:
    """Run a chat agent with the given query and paper context."""
    system_prompt = AGENT_MAP.get(agent_type, SUMMARY_SYSTEM)

    messages = [{"role": "system", "content": system_prompt + "\n\n" + context}]

    if history:
        for msg in history[-6:]:  # Last 6 messages for context
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": query})

    # Try primary model, then fallback
    models = [config.model]
    if config.fallback:
        models.append(config.fallback)
    if config.emergency:
        models.append(config.emergency)

    last_error = None
    for model in models:
        try:
            response = await complete(model=model, messages=messages, max_tokens=4096)
            return AgentResult(
                agent=agent_type,
                content=response,
                sources=[model],
            )
        except Exception as e:
            last_error = e
            logger.warning(f"Model {model} failed: {e}, trying fallback...")
            continue

    raise last_error or Exception("All models failed")


# === DEEP DIVE AGENT (structured output) ===

DEEP_DIVE_SYSTEM = """You are a senior research scientist writing a thorough investigation of a paper for a top-tier AI research blog.
Your tone is that of a curious, skeptical, brilliant researcher who genuinely wants to understand every detail.
NOT a summarizer. NOT a generic blogger. You are INVESTIGATING this paper like a detective.

You MUST output VALID JSON with this exact structure:

{
  "subtitle": "A compelling one-line hook that captures the paper's core insight",
  "chapters": [
    {
      "number": "01",
      "title": "What Problem Is This Actually Solving?",
      "lede": "Opening paragraph that sets up the problem like a story — why should anyone care?",
      "content": [
        {"type": "prose", "text": "Deep analysis paragraph..."},
        {"type": "pullquote", "text": "A striking insight from the paper"},
        {"type": "callout", "label": "KEY INSIGHT", "title": "Why This Matters", "paragraphs": ["Explain significance", "Connect to broader field"]},
        {"type": "equation", "title": "Core Loss Function", "latex": "\\\\mathcal{L} = ...", "symbols": [{"symbol": "\\\\mathcal{L}", "meaning": "Total loss"}], "intuition": "In plain English, this measures..."},
        {"type": "comparison", "left_label": "Traditional Approach", "left_content": "How it was done before", "right_label": "This Paper's Approach", "right_content": "What's different and why"},
        {"type": "steps", "items": [{"number": "01", "title": "Step Name", "description": "What happens and why"}]},
        {"type": "benchmark", "title": "Key Results", "model_a_name": "This Paper", "model_b_name": "Previous SOTA", "rows": [{"task": "Task", "model_a": "95.2", "model_a_pct": 95, "model_b": "89.1", "model_b_pct": 89, "status": "SOTA"}]},
        {"type": "mermaid", "title": "Architecture Overview", "code": "flowchart LR\\n    subgraph InputPrep [Input Preparation]\\n        A[Input Tokens] --> B[Embedding Layer]\\n        B --> C[LayerNorm]\\n    end\\n    subgraph Attn [Multi-Head Attention]\\n        C --> D[QKV Projection]\\n        D --> E[Scaled Dot-Product]\\n        E --> F[Attention Maps]\\n        F --> G[O Projection]\\n    end\\n    subgraph MoE [MoE Routing & Experts]\\n        G --> H[Gate Router]\\n        H --> I{Top-K Routing}\\n        I -->|Expert 1| J[Shared Expert]\\n        I -->|Expert 2| K[Active Expert 1]\\n        I -->|Expert 3| L[Active Expert 2]\\n        J & K & L --> M[Expert Accumulation]\\n    end\\n    M --> N[Residual Connection]\\n    N --> O[Output Projection]"}
      ]
    }
  ],
  "figure_explanations": [
    {
      "title": "Figure 1: Descriptive Title (e.g. 'AntiSD Pipeline and Teacher Bias Overview' or 'Loss Convergence Comparison')",
      "explanation": "Extremely concise high-signal summary (max 15-20 words) of what this visual represents."
    }
  ]
}

CHAPTER STRUCTURE (follow this investigation framework):
1. "What Problem Is This Actually Solving?" — Set up the research gap with concrete examples. What fails today? What are the pain points? Make the reader FEEL the problem.
2. "How Does This Differ From Prior Art?" — Use a comparison block. What did others try? Why didn't it work? What's the key insight that makes THIS approach different?
3. "Show Me The Math" — Dive deep into the core equations. Use equation blocks with symbol explanations and intuitions. Break down the loss function, the objective, the key derivations. DON'T skip the math.
4. "The Architecture: How It Actually Works" — Use steps and/or mermaid diagrams. Walk through the pipeline step by step. What goes in? What comes out? Where does the magic happen?
5. "Do The Experiments Hold Up?" — Critical analysis of results. Use benchmark tables with real numbers from the paper. Are the baselines fair? Are the improvements statistically significant? What's missing?
6. "What Are The Implications?" — Broader impact. What does this unlock? Where will this be used in 2 years? What are the limitations the authors don't talk about?

RULES:
- Write EXACTLY 5-6 chapters to cover the complete investigation framework comprehensively.
- Each chapter must have EXACTLY 3-5 content blocks to provide deep substance, scientific rigor, and technical completeness.
- Make sure to write long, detailed paragraph-length explanations for the prose content blocks.
- ALWAYS include at least one `mermaid` flowchart diagram to illustrate the pipeline or architecture of the proposed system in the architecture chapter.
- ALWAYS include at least one `equation` block to explain the mathematical foundation of the paper in the mathematics chapter.
- Use a VARIETY of block types — don't just write prose. Mix in equations, comparisons, benchmarks, callouts, pullquotes
- LaTeX must use DOUBLE backslashes: \\\\alpha, \\\\mathcal{L}, \\\\theta
- Extract REAL numbers, equations, and method names from the paper text
- Be specific. "The model achieves 95.2% accuracy on ImageNet" NOT "the model performs well"
- Ask probing questions in the prose. "But wait — does this hold up when...?"
- Citations must reference real papers mentioned in the text
- For the `mermaid` block type, construct highly detailed, comprehensive, and technically granular architecture flowcharts mapping out the complete pipeline. Do NOT output simple linear flows of 3-4 nodes. Instead, map out the detailed internal sub-components, layers, routing mechanisms, routing layers, gates, query/key/value projections, attention heads, feed-forward pathways, layer normalizations, residual connections, and specific tensor shapes/dimensions where possible. Group them using nested subgraphs (e.g. "Input Prep", "Attention Mechanism", "MoE Routing & Experts", "Output Layer") to keep it extremely clean yet highly technical and information-dense. Intelligently choose the layout direction: use `flowchart LR` for sequential pipelines to space them horizontally, or `flowchart TD` for hierarchical structures.
- In the 'figure_explanations' array, write a definitive, descriptive, and context-informed title for the 'title' field of each figure (e.g. 'Training loss curves under different gating parameters' instead of generic titles). Do NOT use 'Short name' or any generic placeholder. Extracted figure explanations must be extremely short, summarized captions (maximum 15-20 words).
- The "figure_explanations" array must contain exactly the number of items specified in the EXTRACTED FIGURES INFO user prompt section.
- Output ONLY valid JSON, no markdown wrapping, no text before or after the JSON"""


async def generate_deep_dive_content(
    paper_title: str,
    paper_abstract: str,
    paper_authors: list[str],
    paper_tags: list[str],
    full_text: str,
    config: ProviderConfig,
    fig_pages: list[int] = None,
    paper_digest: str = None,
) -> dict:
    """Generate structured deep-dive content for a paper.

    If `paper_digest` is provided (from the chunking pipeline), it replaces
    the raw `full_text` in the prompt — cutting tokens by ~60-70%.
    """
    # Use the chunked digest if available, otherwise fall back to truncated text
    if paper_digest:
        paper_body = paper_digest
        logger.info(f"Using paper digest ({len(paper_digest)} chars) instead of raw text")
    else:
        paper_body = f"FULL PAPER TEXT:\n{full_text[:12000]}"
        logger.info(f"No digest available, using truncated text ({min(len(full_text), 12000)} chars)")

    context = f"""PAPER TITLE: {paper_title}
AUTHORS: {', '.join(paper_authors[:5])}
TAGS: {', '.join(paper_tags)}

ABSTRACT:
{paper_abstract}

{paper_body}"""

    if fig_pages:
        fig_info = ", ".join(f"Figure {i+1} (from page {p})" for i, p in enumerate(fig_pages))
        context += f"\n\nEXTRACTED FIGURES INFO:\nWe have extracted {len(fig_pages)} figures/diagrams from the PDF on pages: {', '.join(str(p) for p in fig_pages)}.\n"
        context += f"You MUST include EXACTLY {len(fig_pages)} items in your 'figure_explanations' JSON array matching these figures in order: {fig_info}. "
        context += "Write an extremely concise, high-signal summary of each figure (maximum 15-20 words). Focus only on what the visual represents."
    else:
        context += "\n\nEXTRACTED FIGURES INFO:\nNo figures were extracted from the PDF. Provide an empty list [] for 'figure_explanations'."

    messages = [
        {"role": "system", "content": DEEP_DIVE_SYSTEM},
        {"role": "user", "content": f"Investigate this paper in depth. Extract real equations, real numbers, real method names. Write a research-scientist-level deep dive:\n\n{context}"},
    ]

    import asyncio
    import os as _os

    # Check if primary is Cerebras. If so, run models in parallel with DIFFERENT keys!
    has_cerebras_primary = config.model.startswith("cerebras/")

    if has_cerebras_primary:
        cerebras_primary_key = _os.getenv("CEREBRAS_API_KEY")
        cerebras_alt_key = _os.getenv("CEREBRAS_ALT_API_KEY")

        cerebras_models = ["cerebras/gpt-oss-120b", "cerebras/zai-glm-4.7"]
        # Assign different keys to each parallel call to avoid rate-limiting
        cerebras_keys = [cerebras_primary_key, cerebras_alt_key or cerebras_primary_key]

        logger.info(
            f"Cerebras is primary. Launching parallel calls with "
            f"{'DIFFERENT' if cerebras_alt_key else 'SAME'} API keys..."
        )

        async def run_one(model_name: str, api_key: str):
            try:
                response = await complete(
                    model=model_name,
                    messages=messages,
                    max_tokens=8192,
                    api_key=api_key,
                )
                parsed = _extract_json(response)
                return model_name, parsed
            except Exception as e:
                logger.error(f"Parallel Cerebras model {model_name} failed: {e}")
                return model_name, None

        results = await asyncio.gather(
            *(run_one(m, k) for m, k in zip(cerebras_models, cerebras_keys))
        )

        # Extract the successful JSON structures
        parsed_results = [r[1] for r in results if r[1]]

        if parsed_results:
            # If both succeeded, merge them!
            if len(parsed_results) == 2:
                logger.info("Both parallel Cerebras models succeeded. Merging chapters to double substance.")
                merged = parsed_results[0].copy()

                # Merge chapters and renumber (pairing by index)
                chapters1 = merged.get("chapters", [])
                chapters2 = parsed_results[1].get("chapters", [])

                all_chapters = []
                max_chaps = max(len(chapters1), len(chapters2))
                for idx in range(max_chaps):
                    if idx < len(chapters1) and idx < len(chapters2):
                        chap1 = chapters1[idx]
                        chap2 = chapters2[idx]

                        # Merge content blocks from both chapters
                        content1 = chap1.get("content", []) or []
                        content2 = chap2.get("content", []) or []

                        # Concatenate content blocks
                        merged_content = content1 + content2

                        merged_chap = chap1.copy()
                        merged_chap["content"] = merged_content
                        # Rename title/lede if needed (prefer non-empty)
                        if not merged_chap.get("lede") and chap2.get("lede"):
                            merged_chap["lede"] = chap2["lede"]

                        # Ensure correct number format
                        merged_chap["number"] = f"{idx+1:02d}"
                        all_chapters.append(merged_chap)
                    elif idx < len(chapters1):
                        chap = chapters1[idx].copy()
                        chap["number"] = f"{idx+1:02d}"
                        all_chapters.append(chap)
                    else:
                        chap = chapters2[idx].copy()
                        chap["number"] = f"{idx+1:02d}"
                        all_chapters.append(chap)

                merged["chapters"] = all_chapters

                # Merge figure explanations
                figs1 = merged.get("figure_explanations", [])
                figs2 = parsed_results[1].get("figure_explanations", [])
                if len(figs1) >= len(figs2):
                    merged["figure_explanations"] = figs1
                else:
                    merged["figure_explanations"] = figs2

                return merged
            else:
                logger.info("Only one parallel Cerebras model succeeded. Returning single response.")
                return parsed_results[0]

        logger.warning("Parallel Cerebras calls failed. Falling back to OpenRouter/Groq...")

    # Fallback/Emergency sequential path for non-Cerebras or when parallel Cerebras failed
    fallback_models = []
    if not has_cerebras_primary:
        fallback_models = [config.model]
        if config.fallback:
            fallback_models.append(config.fallback)
        if config.emergency:
            fallback_models.append(config.emergency)
    else:
        # Filter out cerebras since we tried them
        if config.fallback and not config.fallback.startswith("cerebras/"):
            fallback_models.append(config.fallback)
        if config.emergency and not config.emergency.startswith("cerebras/"):
            fallback_models.append(config.emergency)

    last_error = None
    for model in fallback_models:
        try:
            response = await complete(model=model, messages=messages, max_tokens=8192)
            parsed = _extract_json(response)
            if parsed:
                return parsed
            logger.warning(f"Model {model} returned non-JSON, trying fallback")
        except Exception as e:
            last_error = e
            logger.warning(f"Deep dive model {model} failed: {e}")
            continue

    raise last_error or Exception("All models failed for deep dive")


def _extract_json(text: str) -> Optional[dict]:
    """Extract JSON from a model response, handling markdown wrappers."""
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from ```json ... ```
    json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try finding first { to last }
    first_brace = text.find('{')
    last_brace = text.rfind('}')
    if first_brace != -1 and last_brace != -1:
        try:
            return json.loads(text[first_brace:last_brace + 1])
        except json.JSONDecodeError:
            pass

    return None