import { useMemo } from 'react'

interface ApiNode {
  id: string
  type?: string
  group?: string
  label?: string
  size?: number
  val?: number
  paperId?: string
}

interface ApiEdge {
  source: string
  target: string
  type?: string
}

export interface GraphData {
  nodes: ApiNode[]
  edges: ApiEdge[]
}

interface MethodsLibraryProps {
  graphData?: GraphData | null
  onConceptClick?: (label: string) => void
}

interface MethodEntry {
  name: string
  paperCount: number
}

interface CategoryGroup {
  category: string
  methods: MethodEntry[]
  totalPapers: number
}

/* Derive method categories from graph concept nodes */
const CATEGORY_MAP: Record<string, string> = {
  'LLM': 'General',
  'Transformers': 'General',
  'Attention': 'General',
  'Fine-Tuning': 'General',
  'LoRA': 'General',
  'Pre-training': 'General',
  'Reinforcement Learning': 'Learning',
  'RLHF': 'Learning',
  'Supervised Learning': 'Learning',
  'Self-Supervised': 'Learning',
  'Contrastive Learning': 'Learning',
  'Diffusion': 'Generative',
  'Diffusion Models': 'Generative',
  'GANs': 'Generative',
  'VAE': 'Generative',
  'Autoregressive': 'Generative',
  'Flow': 'Generative',
  'Computer Vision': 'Vision',
  'Object Detection': 'Vision',
  'Segmentation': 'Vision',
  'Image Classification': 'Vision',
  '3D': 'Vision',
  'NLP': 'Language',
  'RAG': 'Language',
  'Embeddings': 'Language',
  'Tokenization': 'Language',
  'Optimization': 'Optimization',
  'Adam': 'Optimization',
  'Quantization': 'Optimization',
  'Pruning': 'Optimization',
  'Distillation': 'Optimization',
  'MoE': 'Architecture',
  'Mixture of Experts': 'Architecture',
  'Graph Neural Networks': 'Architecture',
  'Neural Architecture': 'Architecture',
  'Multimodal': 'Multimodal',
  'Reasoning': 'Reasoning',
  'Safety & Alignment': 'Safety',
  'Agents': 'Agents',
  'Robotics': 'Robotics',
  'World Models': 'World Models',
}

function categorize(label: string): string {
  const match = CATEGORY_MAP[label]
  if (match) return match
  const lower = label.toLowerCase()
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key.toLowerCase())) return cat
  }
  return 'General'
}

export function GraphView({ graphData, onConceptClick }: MethodsLibraryProps) {
  const categories = useMemo<CategoryGroup[]>(() => {
    const nodes = graphData?.nodes || []
    const edges = graphData?.edges || (graphData as any)?.links || []

    const concepts = nodes.filter(n => n.type === 'Concept' || n.group === 'tag')
    const edgeCounts = new Map<string, number>()

    edges.forEach((e: any) => {
      if (e && e.source && e.target) {
        edgeCounts.set(e.source, (edgeCounts.get(e.source) || 0) + 1)
        edgeCounts.set(e.target, (edgeCounts.get(e.target) || 0) + 1)
      }
    })

    const methods: MethodEntry[] = concepts.map(c => ({
      name: c.label || c.id,
      paperCount: edgeCounts.get(c.id) || c.size || c.val || 1,
    }))

    const grouped = new Map<string, MethodEntry[]>()
    methods.forEach(m => {
      const cat = categorize(m.name)
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(m)
    })

    return Array.from(grouped.entries())
      .map(([category, methods]) => ({
        category,
        methods: methods.sort((a, b) => b.paperCount - a.paperCount),
        totalPapers: methods.reduce((sum, m) => sum + m.paperCount, 0),
      }))
      .sort((a, b) => b.totalPapers - a.totalPapers)
  }, [graphData])

  if (!graphData || categories.length === 0) {
    return (
      <div className="page-full">
        <div className="methods-header">
          <h1 className="methods-title">Methods <em>library</em></h1>
          <p className="methods-subtitle">Common techniques used across AI research, with the papers that use them.</p>
        </div>
        <div className="empty-state">
          <div className="loading-spinner" />
          Building methods index...
        </div>
      </div>
    )
  }

  return (
    <div className="page-full" id="methods-library">
      <div className="methods-header">
        <h1 className="methods-title">Methods <em>library</em></h1>
        <p className="methods-subtitle">Common techniques used across AI research, with the papers that use them.</p>
      </div>

      {categories.map(group => (
        <section key={group.category} className="methods-category">
          <div className="methods-category-header">
            <h2 className="methods-category-name">{group.category}</h2>
            <span className="methods-category-count">
              {group.methods.length} methods &middot; {group.totalPapers.toLocaleString()} papers
            </span>
          </div>

          <div className="methods-grid">
            {group.methods.map(method => (
              <div
                key={method.name}
                className="methods-cell"
                onClick={() => onConceptClick?.(method.name)}
              >
                <div className="methods-cell-name">{method.name}</div>
                <div className="methods-cell-meta">
                  {method.paperCount.toLocaleString()} papers
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
