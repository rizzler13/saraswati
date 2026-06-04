# Project Saraswati

Realtime Research Radar. Monitors scientific knowledge flow, crawls new research, tracks code repository signals, and provides an agentic deep-dive explanation.

---

## Key Features & Latest Updates

- **High-Scale Ingestion**: Crawls arXiv categories (`cs.AI`, `cs.LG`, `cs.CL`, `cs.CV`, `cs.MA`, etc.) and Hugging Face daily trending entries with automated rate-limiting queue controls.
- **Papers with Code Alignment**: Automatically parses and extracts GitHub repositories from abstracts, fetching stars, forks, and star growth rates (velocity).
- **Dynamic Ranking Engine**: Ranks papers dynamically based on:
  $$\text{Score} = (\text{HF Upvotes} \times 10) + (\text{GitHub Stars} \times 0.5) + \text{Velocity}$$
- **Agentic Chat & Interactive Explanations**: Dedicated AI Agent chat tab to discuss paper contents with routing optimized across Groq, OpenRouter, and Cerebras APIs.
- **Figures Extraction & Smart Crop Filtering**: Extracts high-resolution figures directly from papers 
- **Interactive Architecture Flowcharts**: Automatically parses and generates high-substance model subgraphs 


---

## Tech Stack & Architecture

- **Frontend**: React + Vite, Tailwind-like custom CSS design token system, responsive HUD layouts, custom KaTeX math block renderers, and Mermaid diagram renderers.
- **Backend**: FastAPI + Uvicorn + LiteLLM, structured JSON agents, multi-agent orchestrator, and local SQLite data store.
- **Deployment**: AWS Serverless Lambda (Docker container) for the backend, S3 + CloudFront static site hosting for the frontend, with automated deploy and invalidation scripts.

---

### It's live, try here - https://d22a5eltm3ki72.cloudfront.net/




## License

MIT License
