/**
 * DeepDive - Magazine-style paper article renderer.
 *
 * Renders a structured deep-dive JSON into an elegant scrollable article
 * with chapters, equations, diagrams, benchmarks, and visualizations.
 */
import { useState } from 'react'
import { KaTeXRenderer, MixedMathRenderer } from './viz/KaTeXRenderer'
import { MermaidRenderer } from './viz/MermaidRenderer'
import '../styles/deepdive.css'

export interface DeepDiveData {
  paper_id: string
  title: string
  subtitle?: string
  authors?: string[]
  date?: string
  tags?: string[]
  abstract?: string
  chapters?: ChapterData[]
  citations?: string[]
  figures?: { data: string; page: number; width: number; height: number; title?: string; explanation?: string }[]
  generated_at?: number
  generation_time_s?: number
  source_url?: string
  status?: string
}

interface ChapterData {
  number: string
  title: string
  lede?: string
  content?: ContentBlock[]
}

interface ContentBlock {
  type: string
  [key: string]: any
}

function cleanFigureTitle(title: string | undefined): string {
  if (!title) return '';
  const cleanPattern = /^(?:figure|fig)\.?\s*\d+\s*[:\-–—]?\s*/i;
  return title.replace(cleanPattern, '').trim();
}

interface DeepDiveProps {
  data: DeepDiveData
  onBack?: () => void
  onRegenerate?: () => void
}

/* Render a single content block */
function BlockRenderer({ block }: { block: ContentBlock }) {
  try {
    switch (block.type) {
      case 'prose':
        return (
          <div className="dd-prose">
            <MixedMathRenderer text={block.text || ''} />
          </div>
        )

      case 'pullquote':
        return (
          <blockquote className="dd-pullquote">
            <MixedMathRenderer text={block.text || ''} />
          </blockquote>
        )

      case 'callout':
        return (
          <div className="dd-callout">
            {block.label && <div className="dd-callout-label">{block.label}</div>}
            {block.title && <div className="dd-callout-title">{block.title}</div>}
            {Array.isArray(block.paragraphs) ? (
              block.paragraphs.map((p: string, i: number) => (
                <p key={i} className="dd-callout-text"><MixedMathRenderer text={p} /></p>
              ))
            ) : block.paragraphs ? (
              <p className="dd-callout-text"><MixedMathRenderer text={String(block.paragraphs)} /></p>
            ) : null}
            {/* fallback for single text */}
            {!block.paragraphs && block.text && (
              <p className="dd-callout-text"><MixedMathRenderer text={block.text} /></p>
            )}
          </div>
        )

      case 'equation':
        return (
          <div className="dd-equation-block">
            {block.title && <div className="dd-equation-title">{block.title}</div>}
            {block.latex && <KaTeXRenderer latex={block.latex} display={true} />}
            {Array.isArray(block.symbols) && block.symbols.length > 0 && (
              <div className="dd-symbols">
                {block.symbols.map((s: any, i: number) => (
                  <div key={i} className="dd-symbol-row">
                    {s && s.symbol && <KaTeXRenderer latex={s.symbol} display={false} />}
                    {s && s.meaning && <span className="dd-symbol-meaning">{s.meaning}</span>}
                  </div>
                ))}
              </div>
            )}
            {block.intuition && (
              <p className="dd-equation-intuition"><MixedMathRenderer text={block.intuition} /></p>
            )}
          </div>
        )

      case 'comparison':
        return (
          <div className="dd-comparison">
            <div className="dd-comparison-col dd-comparison-left">
              <div className="dd-comparison-header">{block.left_label || 'Before'}</div>
              <div className="dd-comparison-content">
                <MixedMathRenderer text={block.left_content || ''} />
              </div>
            </div>
            <div className="dd-comparison-col dd-comparison-right">
              <div className="dd-comparison-header">{block.right_label || 'After'}</div>
              <div className="dd-comparison-content">
                <MixedMathRenderer text={block.right_content || ''} />
              </div>
            </div>
          </div>
        )

      case 'steps':
        return (
          <div className="dd-steps">
            {Array.isArray(block.items) && block.items.map((step: any, i: number) => (
              <div key={i} className="dd-step">
                <div className="dd-step-num">{step?.number || String(i + 1).padStart(2, '0')}</div>
                <div className="dd-step-body">
                  <div className="dd-step-title">{step?.title}</div>
                  <div className="dd-step-desc"><MixedMathRenderer text={step?.description || ''} /></div>
                </div>
              </div>
            ))}
          </div>
        )

      case 'benchmark':
        return (
          <div className="dd-benchmark">
            {block.title && <div className="dd-benchmark-title">{block.title}</div>}
            <table className="dd-benchmark-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>{block.model_a_name || 'Model A'}</th>
                  <th>{block.model_b_name || 'Model B'}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(block.rows) && block.rows.map((row: any, i: number) => (
                  <tr key={i}>
                    <td className="dd-bench-task">{row?.task}</td>
                    <td>
                      <div className="dd-bench-bar-cell">
                        <div className="dd-bench-bar dd-bench-bar-a" style={{ width: `${row?.model_a_pct || 0}%` }} />
                        <span className="dd-bench-val">{row?.model_a}</span>
                      </div>
                    </td>
                    <td>
                      <div className="dd-bench-bar-cell">
                        <div className="dd-bench-bar dd-bench-bar-b" style={{ width: `${row?.model_b_pct || 0}%` }} />
                        <span className="dd-bench-val">{row?.model_b}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`dd-bench-status ${row?.status === 'SOTA' ? 'dd-bench-sota' : ''}`}>
                        {row?.status || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

      case 'mermaid':
        return <MermaidRenderer code={block.code || ''} title={block.title} />

      case 'figure':
        return (
          <figure className="dd-figure">
            {block.data && <img src={block.data} alt={block.caption || 'Figure'} className="dd-figure-img" />}
            {block.caption && <figcaption className="dd-figure-caption">{block.caption}</figcaption>}
          </figure>
        )

      default:
        // Unknown block type — render as prose
        if (block.text) {
          return <div className="dd-prose"><MixedMathRenderer text={block.text} /></div>
        }
        return null
    }
  } catch (err) {
    console.error('Error rendering content block:', err, block)
    return (
      <div className="dd-prose" style={{ border: '1px solid #fee2e2', padding: 12, borderRadius: 6, background: '#fef2f2', color: '#991b1b' }}>
        <strong>Render Error:</strong> Failed to render this section. Malformed structure.
        {block?.text && <p><MixedMathRenderer text={block.text} /></p>}
      </div>
    )
  }
}


export function DeepDive({ data, onBack, onRegenerate }: DeepDiveProps) {
  const [citationsOpen, setCitationsOpen] = useState(false)

  const genTime = data.generation_time_s
    ? `Generated in ${data.generation_time_s}s`
    : ''

  return (
    <article className="dd" id="deep-dive-article">
      {/* MASTHEAD */}
      <header className="dd-masthead">
        <div className="dd-mast-inner">
          {onBack && (
            <button className="dd-back-btn" onClick={onBack}>
              ← Back
            </button>
          )}
          {data.tags && data.tags.length > 0 && (
            <div className="dd-tags">
              {data.tags.slice(0, 4).map(tag => (
                <span key={tag} className="dd-tag">{tag}</span>
              ))}
            </div>
          )}
          <h1 className="dd-title">{data.title}</h1>
          {data.subtitle && <p className="dd-subtitle">{data.subtitle}</p>}
          <div className="dd-meta">
            {data.authors && data.authors.length > 0 && (
              <span className="dd-authors">
                {data.authors.slice(0, 5).join(', ')}
                {data.authors.length > 5 && ` +${data.authors.length - 5} more`}
              </span>
            )}
            {data.date && <span className="dd-date">{data.date}</span>}
          </div>
          <div className="dd-actions">
            {data.source_url && (
              <a href={data.source_url} target="_blank" rel="noopener" className="btn btn-outline">
                View on arXiv
              </a>
            )}
            {data.paper_id && (
              <button
                className="btn btn-outline"
                onClick={() => {
                  const article = document.getElementById('deep-dive-article')
                  if (!article) return
                  const printWindow = window.open('', '_blank', 'width=900,height=700')
                  if (!printWindow) { alert('Please allow pop-ups to save as PDF'); return }
                  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
                    .map(el => el.outerHTML).join('\n')
                  const fontLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                    .map(el => (el as HTMLLinkElement).href)
                    .filter(href => href.includes('fonts.googleapis.com'))
                    .map(href => `<link rel="stylesheet" href="${href}">`).join('\n')
                   printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
                    <title>${data.title} — Saraswati</title>${fontLinks}${styles}
                    <style>
                      body { margin:0; padding:0; background:#fff; }
                      .dd {
                        position: relative !important;
                        height: auto !important;
                        min-height: auto !important;
                        overflow: visible !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                        max-width: 100% !important;
                      }
                      .dd-body {
                        max-width: 100% !important;
                        width: 100% !important;
                        padding: 20px 0 !important;
                        margin: 0 !important;
                      }
                      .btn, button, .dd-gen-time, .dd-back-btn, .dd-citations-toggle { display:none!important; }
                      .dd-citations-print-title { display: block !important; margin-bottom: 16px; font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 700; border-bottom: 2px solid #000; padding-bottom: 8px; }
                      .dd-citations-list { display: block !important; }
                      * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
                      
                      /* Block-level layout overrides for clean page breaking */
                      .dd-chapter-content {
                        display: block !important;
                      }
                      .dd-chapter-content > * {
                        margin-bottom: 24px !important;
                      }
                      
                      .dd-figures-layout {
                        display: block !important;
                      }
                      .dd-figures-layout .dd-figure-card {
                        margin-bottom: 24px !important;
                      }

                      .dd-figures-grid {
                        display: block !important;
                      }
                      .dd-figures-grid .dd-figure {
                        display: block !important;
                        max-width: 100% !important;
                        margin: 0 auto 24px !important;
                      }
                      
                      /* Avoid orphaned titles */
                      .dd-chapter-header {
                        break-after: avoid !important;
                        page-break-after: avoid !important;
                      }

                      /* Avoid page breaks inside logical cards/visualizations */
                      .dd-figure-card,
                      .dd-figure,
                      .dd-callout,
                      .dd-equation-block,
                      .dd-comparison,
                      .dd-comparison-col,
                      .dd-step,
                      .dd-benchmark,
                      .dd-mermaid-wrapper {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                      }

                      /* Page break before major sections */
                      .dd-figures-section,
                      .dd-citations-section {
                        page-break-before: always !important;
                        break-before: page !important;
                      }

                      @media print {
                        .dd { position: relative !important; }
                        .dd-masthead { background:#0c0c0c!important; color:#fff!important; }
                        .dd-callout { background:#111!important; }
                        @page { size: A4; margin: 1.6cm 1.2cm !important; }
                      }
                    </style></head><body>${article.outerHTML}</body></html>`)
                  printWindow.document.close()
                  printWindow.onload = () => { setTimeout(() => printWindow.print(), 800) }
                }}
              >
                Save as PDF
              </button>
            )}
            {onRegenerate && (
              <button
                className="btn btn-outline"
                onClick={onRegenerate}
              >
                Regenerate
              </button>
            )}
          </div>
          {genTime && <div className="dd-gen-time">{genTime}</div>}
        </div>
      </header>

      {/* CHAPTERS */}
      <div className="dd-body">
        {Array.isArray(data.chapters) && data.chapters.map((chapter, ci) => (
          <section key={ci} className="dd-chapter">
            <div className="dd-chapter-header">
              <span className="dd-chapter-num">{chapter?.number}</span>
              <h2 className="dd-chapter-title">{chapter?.title}</h2>
            </div>
            {chapter?.lede && (
              <p className="dd-chapter-lede"><MixedMathRenderer text={chapter.lede} /></p>
            )}
            <div className="dd-chapter-content">
              {Array.isArray(chapter?.content) && chapter.content.map((block, bi) => (
                <BlockRenderer key={bi} block={block} />
              ))}
            </div>
          </section>
        ))}

        {/* EXTRACTED FIGURES */}
        {Array.isArray(data.figures) && data.figures.length > 0 && (
          <section className="dd-chapter dd-figures-section">
            <div className="dd-chapter-header">
              <span className="dd-chapter-num">FIG</span>
              <h2 className="dd-chapter-title">Extracted Figures</h2>
            </div>
            {data.figures.some(fig => fig.explanation) ? (
              <div className="dd-figures-layout">
                {data.figures.map((fig, i) => (
                  <div
                    key={i}
                    className="dd-figure-card"
                    onClick={() => window.open(`https://arxiv.org/pdf/${data.paper_id}#page=${fig.page}`, '_blank')}
                    title={`Click to view Page ${fig.page} in the PDF`}
                  >
                    <div className="dd-figure-image-wrap">
                      {fig?.data && <img src={fig.data} alt={fig?.title || `Figure from page ${fig.page}`} className="dd-figure-img" />}
                      <div className="dd-figure-page-tag">Page {fig?.page}</div>
                    </div>
                    <div className="dd-figure-info">
                      <h3 className="dd-figure-title">{cleanFigureTitle(fig?.title) || `Visual (Page ${fig.page})`}</h3>
                      {fig?.explanation && (
                        <p className="dd-figure-explanation">
                          <MixedMathRenderer text={fig.explanation} />
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dd-figures-grid">
                {data.figures.map((fig, i) => (
                  <figure
                    key={i}
                    className="dd-figure"
                    onClick={() => window.open(`https://arxiv.org/pdf/${data.paper_id}#page=${fig.page}`, '_blank')}
                    title={`Click to view Page ${fig.page} in the PDF`}
                  >
                    <div className="dd-figure-image-wrap">
                      {fig?.data && <img src={fig.data} alt={`Figure ${i + 1} from page ${fig.page}`} className="dd-figure-img" />}
                      <div className="dd-figure-page-tag">Page {fig?.page}</div>
                    </div>
                    <figcaption className="dd-figure-caption">
                      {cleanFigureTitle(fig?.title) || `Visual (Page ${fig.page})`}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        {/* CITATIONS — collapsible */}
        {Array.isArray(data.citations) && data.citations.length > 0 && (
          <section className="dd-citations-section">
            <h2 className="dd-citations-print-title">References</h2>
            <button
              className="dd-citations-toggle"
              onClick={() => setCitationsOpen(!citationsOpen)}
            >
              <span className="dd-citations-label">
                References ({data.citations.length})
              </span>
              <span className={`dd-citations-arrow ${citationsOpen ? 'open' : ''}`}>
                ▼
              </span>
            </button>
            <ol className={`dd-citations-list ${citationsOpen ? 'open' : ''}`}>
              {data.citations.map((cite, i) => (
                <li key={i} className="dd-citation-item">
                  <MixedMathRenderer text={cite} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </article>
  )
}