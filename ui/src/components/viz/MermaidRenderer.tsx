/**
 * Mermaid diagram renderer.
 * Renders Mermaid markup into SVG diagrams.
 */
import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

// Initialize mermaid with base theme matching the monochrome/terracotta aesthetic
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'loose',
  fontFamily: 'var(--font-sans, system-ui)',
  themeVariables: {
    primaryColor: '#ffffff',
    primaryTextColor: '#111111',
    primaryBorderColor: '#e2e8f0', // slate-200
    lineColor: '#c9553a', // accent terracotta
    secondaryColor: '#f8fafc',
    tertiaryColor: '#ffffff',
    // Node colors
    nodeBorder: '#cbd5e1', // slate-300
    mainBkg: '#ffffff',
    textColor: '#0f172a', // slate-900
    // Edge/Arrow colors
    edgeColor: '#64748b', // slate-500
    arrowheadColor: '#c9553a',
    fontFamily: 'var(--font-sans, system-ui)',
    fontSize: '13px',
  },
})

interface MermaidProps {
  code: string
  title?: string
}

function correctMermaidSyntax(rawCode: string): string {
  let c = rawCode.trim()
  
  // Remove markdown wrapper if present
  if (c.startsWith('```mermaid')) {
    c = c.substring(10)
  }
  if (c.endsWith('```')) {
    c = c.substring(0, c.length - 3)
  }
  c = c.trim()

  // Clean lines of syntax errors and markdown symbols
  const lines = c.split('\n').map(line => {
    let l = line.trim()
    // Skip any lines that are markdown comments or markdown headings
    if (l.startsWith('#')) return ''
    
    // Strip markdown bold and italic markers (**, *)
    l = l.replace(/\*\*/g, '')
    l = l.replace(/\*/g, '')
    
    return l
  }).filter(line => line.length > 0)

  c = lines.join('\n')

  // Fix invalid labeled arrow trailing bracket (e.g. -->|Label|> to -->|Label|)
  c = c.replace(/(--\s*>\s*\|[^|]+\|)\s*>/g, '$1')
  c = c.replace(/(-\.-\s*>\s*\|[^|]+\|)\s*>/g, '$1')
  c = c.replace(/(==\s*>\s*\|[^|]+\|)\s*>/g, '$1')

  return c
}

export function MermaidRenderer({ code, title }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || !code) return

    let isMounted = true

    const renderDiagram = async () => {
      const cleanCode = correctMermaidSyntax(code)
      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`

      try {
        // 1. Validate syntax first (does not pollute the DOM)
        await mermaid.parse(cleanCode)

        // 2. Render if syntax is valid
        const { svg } = await mermaid.render(id, cleanCode)
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg
          setError(null)
        }
      } catch (e: any) {
        console.warn('Mermaid render error:', e)
        if (isMounted) {
          setError(e?.message || 'Failed to render diagram')
        }

        // Clean up any error element injected by Mermaid in document.body
        const badElement = document.getElementById(id) || document.getElementById(`dmermaid-${id}`)
        if (badElement) {
          badElement.remove()
        }

        // Remove any leaked SVG error elements at the root body level
        const bodySvgs = document.querySelectorAll('body > svg')
        bodySvgs.forEach((svgEl) => {
          if (svgEl.id.startsWith('mermaid-') || svgEl.innerHTML.includes('Syntax error')) {
            svgEl.remove()
          }
        })
      }
    }

    renderDiagram()

    return () => {
      isMounted = false
    }
  }, [code])

  if (error) {
    return (
      <div className="dd-mermaid-error">
        {title && <div className="dd-mermaid-title">{title}</div>}
        <pre className="dd-mermaid-fallback">{code}</pre>
      </div>
    )
  }

  return (
    <div className="dd-mermaid-wrapper">
      {title && <div className="dd-mermaid-title">{title}</div>}
      <div ref={containerRef} className="dd-mermaid-container" />
    </div>
  )
}