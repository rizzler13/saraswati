// ============================================
// Project Saraswati — Graph Schema
// ============================================

// --- Indexes for fast lookups ---
CREATE INDEX ON :Paper(arxiv_id);
CREATE INDEX ON :Paper(doi);
CREATE INDEX ON :Paper(biorxiv_id);
CREATE INDEX ON :Paper(hf_id);
CREATE INDEX ON :Paper(title);
CREATE INDEX ON :Author(name);
CREATE INDEX ON :Concept(name);
CREATE INDEX ON :Platform(name);
CREATE INDEX ON :User(username);

// --- Constraints for uniqueness ---
CREATE CONSTRAINT ON (p:Paper) ASSERT p.arxiv_id IS UNIQUE;
CREATE CONSTRAINT ON (p:Paper) ASSERT p.doi IS UNIQUE;
CREATE CONSTRAINT ON (c:Concept) ASSERT c.name IS UNIQUE;
CREATE CONSTRAINT ON (pl:Platform) ASSERT pl.name IS UNIQUE;

// --- Sample Platform nodes (pre-seed) ---
CREATE (:Platform {name: 'arxiv', display_name: 'ArXiv', url: 'https://arxiv.org'});
CREATE (:Platform {name: 'biorxiv', display_name: 'BioRxiv', url: 'https://biorxiv.org'});
CREATE (:Platform {name: 'huggingface', display_name: 'HuggingFace', url: 'https://huggingface.co'});
CREATE (:Platform {name: 'reddit', display_name: 'Reddit', url: 'https://reddit.com'});
CREATE (:Platform {name: 'twitter', display_name: 'Twitter/X', url: 'https://twitter.com'});
CREATE (:Platform {name: 'hackernews', display_name: 'Hacker News', url: 'https://news.ycombinator.com'});

// ============================================
// Schema Documentation (Comments)
// ============================================
// 
// NODES:
// (:Paper)    - arxiv_id, doi, biorxiv_id, hf_id, title, abstract, 
//               published_date, citation_count, hype_score, created_at
// (:Author)   - name, affiliations[]
// (:Concept)  - name, description
// (:Platform) - name, display_name, url
// (:User)     - username, platform, follower_count, is_influencer
//
// RELATIONSHIPS:
// (:Author)-[:WROTE]->(:Paper)
// (:Paper)-[:CITES]->(:Paper)
// (:Paper)-[:BELONGS_TO]->(:Concept)
// (:Paper)-[:MENTIONED_ON {url, score, comment_count, mentioned_at}]->(:Platform)
// (:User)-[:DISCUSSED {url, text, discussed_at}]->(:Paper)
// (:User)-[:ACTIVE_ON]->(:Platform)
