# Project Saraswati

Realtime Research Radar. Monitors scientific knowledge flow, crawls new research, tracks code repository signals, and provides an agentic deep-dive explanation.

---

## Key Features & Latest Updates

- **High-Scale Ingestion**: Crawls arXiv categories (`cs.AI`, `cs.LG`, `cs.CL`, `cs.CV`, `cs.MA`, etc.) and Hugging Face daily trending entries with automated rate-limiting queue controls.
<img width="1136" height="777" alt="2026-06-04_20-10-59" src="https://github.com/user-attachments/assets/ecbba1aa-e900-49f5-aaaa-33a79da793d6" />

- **Papers with Code Alignment**: Automatically parses and extracts GitHub repositories from abstracts, fetching stars, forks, and star growth rates (velocity).
- **Dynamic Ranking Engine**: Ranks papers dynamically based on:
  $$\text{Score} = (\text{HF Upvotes} \times 10) + (\text{GitHub Stars} \times 0.5) + \text{Velocity}$$
- **Agentic Chat & Interactive Explanations**: Dedicated AI Agent chat tab to discuss paper contents with routing optimized across Groq, OpenRouter, and Cerebras APIs.
<img width="908" height="778" alt="2026-06-04_20-18-29" src="https://github.com/user-attachments/assets/4f0f9314-402f-4908-bcd2-be5b5d1ef107" />
<img width="1224" height="777" alt="2026-06-04_20-12-10" src="https://github.com/user-attachments/assets/81f30e6f-9374-4ff9-96c5-537cdff2a51d" />

- **Figures Extraction & Smart Crop Filtering**: Extracts high-resolution figures directly from papers.
<img width="1117" height="777" alt="2026-06-04_20-21-31" src="https://github.com/user-attachments/assets/c59dd5fb-091a-4ad0-90a4-98c93cb8c545" />

- **Interactive Architecture Flowcharts**: Automatically parses and generates high-substance model subgraphs 
<img width="1108" height="779" alt="2026-06-04_20-23-15" src="https://github.com/user-attachments/assets/5fc8cbe6-4f6b-4cf8-bd6c-6a9b0fb3783e" />


---

## Tech Stack & Architecture

- **Frontend**: React + Vite, Tailwind-like custom CSS design token system, responsive HUD layouts, custom KaTeX math block renderers, and Mermaid diagram renderers.
- **Backend**: FastAPI + Uvicorn + LiteLLM, structured JSON agents, multi-agent orchestrator, and local SQLite data store.
- **Deployment**: AWS Serverless Lambda (Docker container) for the backend, S3 + CloudFront static site hosting for the frontend, with automated deploy and invalidation scripts.

---

**It's live, try here** - https://d22a5eltm3ki72.cloudfront.net/




## License

MIT License
