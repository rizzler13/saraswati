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
  year?: number
}

interface CategoryGroup {
  category: string
  methods: MethodEntry[]
  totalPapers: number
}

// Complete, rich methods list and metadata from the Papers with Code screenshots
const STATIC_METHODS: Record<string, MethodEntry[]> = {
  'Audio': [
    { name: 'Whisper', paperCount: 1485, year: 2022 },
    { name: 'WaveNet', paperCount: 563, year: 2016 },
    { name: 'Spectrogram', paperCount: 282 },
    { name: 'Wav2Vec', paperCount: 175, year: 2019 }
  ],
  'General': [
    { name: 'Large language model (LLM)', paperCount: 26603 },
    { name: 'Fine-tuning', paperCount: 9837 },
    { name: 'Transformer', paperCount: 9739, year: 2017 },
    { name: 'Softmax', paperCount: 8046 },
    { name: 'Layer Normalization', paperCount: 7184, year: 2016 },
    { name: 'Multi-head attention', paperCount: 6932, year: 2017 },
    { name: 'Dropout', paperCount: 6283, year: 2014 },
    { name: 'Adam', paperCount: 6116, year: 2014 },
    { name: 'Embedding', paperCount: 5872 },
    { name: 'Pre-training', paperCount: 5791 },
    { name: 'Chain-of-Thought (CoT)', paperCount: 4362, year: 2022 },
    { name: 'Label smoothing', paperCount: 3881, year: 2015 },
    { name: 'Convolution', paperCount: 3714 },
    { name: 'GRPO', paperCount: 3599 },
    { name: 'Direct Preference Optimization (DPO)', paperCount: 3568, year: 2023 },
    { name: 'Stable Diffusion', paperCount: 3455, year: 2022 },
    { name: 'RLHF', paperCount: 3448, year: 2022 },
    { name: 'Diffusion Transformer (DiT)', paperCount: 3116, year: 2022 },
    { name: 'LoRA', paperCount: 3017, year: 2021 },
    { name: 'DeepSeek-R1', paperCount: 2608, year: 2024 },
    { name: 'Classifier-free guidance', paperCount: 2601, year: 2022 },
    { name: 'PPO', paperCount: 2599 },
    { name: 'PEFT', paperCount: 2574, year: 2021 },
    { name: 'ReAct', paperCount: 2556, year: 2022 },
    { name: 'Scaling laws', paperCount: 2541, year: 2020 },
    { name: 'Qwen3', paperCount: 2511, year: 2025 },
    { name: 'Cosine Annealing', paperCount: 2462 },
    { name: 'GPT-3', paperCount: 2337, year: 2020 },
    { name: 'Gaussian splatting', paperCount: 2186, year: 2023 },
    { name: 'Knowledge Distillation', paperCount: 1885, year: 2015 },
    { name: 'Hallucination', paperCount: 1821, year: 2023 },
    { name: 'Autoencoder (AE)', paperCount: 1808 },
    { name: 'Flow matching', paperCount: 1798, year: 2022 },
    { name: 'Mixture-of-Experts (MoE)', paperCount: 1669, year: 1991 },
    { name: 'Flash Attention', paperCount: 1591, year: 2022 },
    { name: 'Gemini 1.5', paperCount: 1573, year: 2024 },
    { name: 'Monte-Carlo Tree Search', paperCount: 213 },
    { name: 'Sharpness-Aware Minimization', paperCount: 205, year: 2020 },
    { name: 'Self-training', paperCount: 198 },
    { name: 'Reward hacking', paperCount: 196 },
    { name: 'MCP', paperCount: 193, year: 2004 },
    { name: 'Deep Research', paperCount: 188, year: 2025 },
    { name: 'KL Divergence', paperCount: 185 },
    { name: 'Linear attention', paperCount: 172 },
    { name: 'Test-time compute', paperCount: 167, year: 2024 },
    { name: 'Prefill', paperCount: 148 },
    { name: 'Logistic Regression', paperCount: 127 },
    { name: 'k-means clustering', paperCount: 122 },
    { name: 'Claude 4', paperCount: 121, year: 2025 },
    { name: 'kNN', paperCount: 119 },
    { name: 'Dice Loss', paperCount: 109 },
    { name: 'Matryoshka representation learning (MRL)', paperCount: 104, year: 2022 },
    { name: 'QAT', paperCount: 97 },
    { name: 'Muon', paperCount: 92, year: 2024 },
    { name: 'Non-reasoning model', paperCount: 92 },
    { name: 'JEPA', paperCount: 84, year: 2022 },
    { name: 'ColPali', paperCount: 82, year: 2024 },
    { name: 'Claude 3.5 Sonnet', paperCount: 76, year: 2024 },
    { name: 'fp8', paperCount: 76, year: 2022 },
    { name: 'Teacher forcing', paperCount: 75, year: 2016 },
    { name: 'Sora', paperCount: 71, year: 2024 },
    { name: 'Mid-training', paperCount: 62, year: 2025 },
    { name: 'Non Maximum Suppression (NMS)', paperCount: 59 },
    { name: 'REINFORCE', paperCount: 50 },
    { name: 'Hybrid reasoning model', paperCount: 29 },
    { name: 'Context engineering', paperCount: 27, year: 2025 },
    { name: 'Learning rate scheduler', paperCount: 19 },
    { name: 'Xavier initialization', paperCount: 14, year: 2010 },
    { name: 'Context rot', paperCount: 3, year: 2025 },
    { name: 'FLUX', paperCount: 0, year: 2024 }
  ],
  'Language': [
    { name: 'Diffusion', paperCount: 8261, year: 2015 },
    { name: 'BPE', paperCount: 5897, year: 2015 },
    { name: 'LLaMA', paperCount: 4564, year: 2023 },
    { name: 'BERT', paperCount: 3385, year: 2018 },
    { name: 'RAG', paperCount: 2957, year: 2020 },
    { name: 'T5', paperCount: 2789, year: 2019 },
    { name: 'GPT', paperCount: 2528, year: 2018 },
    { name: 'GPT-4', paperCount: 2232, year: 2023 },
    { name: 'ELMo', paperCount: 914, year: 2018 },
    { name: 'Seq2Seq', paperCount: 732, year: 2014 },
    { name: 'Grouped-Query Attention', paperCount: 709, year: 2023 },
    { name: 'Speculative decoding', paperCount: 665, year: 2022 }
  ],
  'Vision': [
    { name: 'LLaVa', paperCount: 3972, year: 2023 },
    { name: 'CLIP', paperCount: 3754, year: 2021 },
    { name: 'Vision Transformer', paperCount: 2516, year: 2020 },
    { name: 'DINO', paperCount: 2237, year: 2021 },
    { name: 'Segment Anything (SAM)', paperCount: 2231, year: 2023 },
    { name: 'VQ-VAE', paperCount: 1478, year: 2017 },
    { name: 'ResNet', paperCount: 1008, year: 2015 },
    { name: 'ConvNeXt', paperCount: 958, year: 2022 },
    { name: 'U-Net', paperCount: 918, year: 2015 },
    { name: 'Residual Block', paperCount: 818 },
    { name: 'RoIAlign', paperCount: 809, year: 2017 },
    { name: 'Mask R-CNN', paperCount: 772, year: 2017 },
    { name: '1x1 Convolution', paperCount: 707, year: 2013 },
    { name: 'NeRF', paperCount: 705, year: 2020 },
    { name: 'Max Pooling', paperCount: 672 },
    { name: 'DUST3R', paperCount: 645, year: 2023 },
    { name: 'CutMix', paperCount: 627, year: 2019 },
    { name: 'VGG', paperCount: 594, year: 2015 },
    { name: 'Global Average Pooling', paperCount: 573 },
    { name: 'Depthwise Convolution', paperCount: 453, year: 2014 },
    { name: 'YOLO', paperCount: 431, year: 2015 },
    { name: 'RoIPool', paperCount: 418, year: 2015 },
    { name: 'RPN', paperCount: 406, year: 2015 },
    { name: 'Fast R-CNN', paperCount: 351, year: 2015 },
    { name: 'Faster R-CNN', paperCount: 347, year: 2015 },
    { name: 'Cutout', paperCount: 319, year: 2017 },
    { name: 'Deformable Convolution', paperCount: 296, year: 2017 },
    { name: 'R-CNN', paperCount: 259, year: 2013 },
    { name: 'YOLOv3', paperCount: 253, year: 2018 },
    { name: 'PCA', paperCount: 196 },
    { name: 'Pointwise Convolution', paperCount: 194, year: 2017 },
    { name: 'YOLOv8', paperCount: 56, year: 2023 }
  ]
}

export function GraphView({ graphData, onConceptClick }: MethodsLibraryProps) {
  const categories = useMemo<CategoryGroup[]>(() => {
    // Collect active concepts from real-time database graph
    const nodes = graphData?.nodes || []
    const edges = graphData?.edges || (graphData as any)?.links || []

    const edgeCounts = new Map<string, number>()
    edges.forEach((e: any) => {
      if (e && e.source && e.target) {
        edgeCounts.set(e.source, (edgeCounts.get(e.source) || 0) + 1)
        edgeCounts.set(e.target, (edgeCounts.get(e.target) || 0) + 1)
      }
    })

    const dynamicMethodsMap = new Map<string, number>()
    nodes.forEach(n => {
      if (n.type === 'Concept' || n.group === 'tag') {
        const name = n.label || n.id
        const count = edgeCounts.get(n.id) || n.size || n.val || 1
        dynamicMethodsMap.set(name.toLowerCase(), count)
      }
    })

    // Merge static baseline with any live data, update counts if they match
    return Object.entries(STATIC_METHODS).map(([catName, staticList]) => {
      const mergedList = staticList.map(method => {
        const liveCount = dynamicMethodsMap.get(method.name.toLowerCase())
        // If liveCount is available, add to or update baseline count
        return {
          ...method,
          paperCount: liveCount ? Math.max(method.paperCount, liveCount) : method.paperCount
        }
      })

      return {
        category: catName,
        methods: mergedList.sort((a, b) => b.paperCount - a.paperCount),
        totalPapers: mergedList.reduce((sum, m) => sum + m.paperCount, 0)
      }
    })
  }, [graphData])

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
                  {method.paperCount.toLocaleString()} papers {method.year ? `· ${method.year}` : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
