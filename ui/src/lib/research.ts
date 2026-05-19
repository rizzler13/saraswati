import type { Paper } from '../App'

export interface ResearchMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are a research scientist with deep expertise across machine learning, computer science, and statistics. You analyze papers with precision and intellectual honesty.

When analyzing a paper:
- Focus on what actually matters: the core contribution, methodology, and whether the claims hold up
- Compare to relevant prior work when you can
- Be specific about limitations - don't hand-wave
- If something is genuinely impressive, say so. If it's incremental, say that too
- Write clearly. No filler, no fluff, no hedging with "it's worth noting that"

You have access to the paper's title and abstract. Base your analysis on what's presented.`

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT
}

export function buildContextBlock(
  paper: Paper,
  relatedPapers?: Paper[]
): string {
  let ctx = `PAPER UNDER ANALYSIS:\n`
  ctx += `Title: ${paper.title}\n`
  ctx += `ID: ${paper.id}\n`
  ctx += `Date: ${paper.date}\n`
  if (paper.authors?.length) {
    ctx += `Authors: ${paper.authors.join(', ')}\n`
  }
  ctx += `Source: ${paper.source || 'arxiv'}\n`
  if (paper.category) {
    ctx += `Category: ${paper.category}\n`
  }
  ctx += `\nAbstract:\n${paper.abstract}\n`

  if (relatedPapers?.length) {
    ctx += `\n---\nRELATED PAPERS IN CURRENT DATASET:\n`
    for (const rp of relatedPapers.slice(0, 5)) {
      ctx += `- "${rp.title}" (${rp.id}, score: ${rp.score})\n`
    }
  }

  return ctx
}

export function getSuggestedPrompts(paper: Paper): string[] {
  const base = [
    'What are the key contributions of this paper?',
    'How does this compare to prior work in the field?',
    'What are the main limitations or potential weaknesses?',
    'What follow-up experiments would you suggest?',
  ]

  const text = (paper.title + ' ' + paper.abstract).toLowerCase()

  if (text.includes('llm') || text.includes('language model')) {
    base.push('How does this scale with model size?')
  }
  if (text.includes('benchmark') || text.includes('evaluation')) {
    base.push('Are the evaluation metrics appropriate?')
  }
  if (text.includes('training') || text.includes('fine-tun')) {
    base.push('What are the compute requirements?')
  }
  if (text.includes('safety') || text.includes('alignment')) {
    base.push('What are the safety implications?')
  }

  return base.slice(0, 6)
}

export function findRelatedPapers(
  target: Paper,
  allPapers: Paper[],
  limit = 5
): Paper[] {
  const targetWords = new Set(
    (target.title + ' ' + target.abstract)
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3)
  )

  const scored = allPapers
    .filter(p => p.id !== target.id)
    .map(p => {
      const words = (p.title + ' ' + p.abstract)
        .toLowerCase()
        .split(/\W+/)
      const overlap = words.filter(w => targetWords.has(w)).length
      return { paper: p, overlap }
    })
    .sort((a, b) => b.overlap - a.overlap)

  return scored.slice(0, limit).map(s => s.paper)
}
