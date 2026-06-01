"""
LangGraph DAG orchestration for research workflows.

Two modes:
  1. Deep-dive mode: Full parallel agent pipeline -> aggregated article
  2. Chat mode: Single-agent routing for follow-up questions
"""
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from .specialized import (
    AgentResult,
    classify_query,
    chat_agent,
)
from ..core.config import ResearchConfig

logger = logging.getLogger(__name__)


async def handle_chat_query(
    query: str,
    context: str,
    config: ResearchConfig,
    history: list[dict] = None,
) -> AgentResult:
    """
    Handle a single chat query about a paper.
    Routes to the appropriate agent based on query content.
    Falls back gracefully on errors.
    """
    agent_type = classify_query(query)
    logger.info(f"Query classified as: {agent_type}")

    agent_configs = {
        "summary": config.summary_agent,
        "math": config.math_agent,
        "visualization": config.viz_agent,
        "critique": config.critique_agent,
    }
    agent_config = agent_configs.get(agent_type, config.summary_agent)

    try:
        result = await chat_agent(
            query=query,
            context=context,
            config=agent_config,
            history=history,
            agent_type=agent_type,
        )
        result.agent = agent_type
        return result
    except Exception as e:
        logger.error(f"Chat agent failed: {e}")
        return AgentResult(
            agent=agent_type,
            content=f"I encountered an error processing your question. Please check that your API keys are configured correctly.\n\nError: {str(e)}",
            sources=["error"],
        )