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
    fontSize: '15px', // Larger font for legibility
  },
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    nodeSpacing: 50,
    rankSpacing: 60,
    padding: 30, // Increased internal padding for more breadth in boxes
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

  // Shape definitions ordered by specificity (multi-char openers first)
  const shapes = [
    { open: '([', close: '])' },
    { open: '[[', close: ']]' },
    { open: '[(', close: ')]' },
    { open: '((', close: '))' },
    { open: '{{', close: '}}' },
    { open: '[\\', close: '/]' },
    { open: '[/', close: '\\]' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '>', close: ']' }
  ];

  // Arrow patterns to skip over (must not be treated as node shapes)
  const arrowRegex = /^(--+>|==+>|-\.+-?>|<--+>|<==+>|--+\)|--+\}|--+\]|~~~|<-\.+-?>)/;
  // Arrow with label: --|label|, ==|label|, -.-|label|
  const labeledArrowRegex = /^(--+|==+|-\.+-?)\|([^|]*)\|/;

  function quoteLabel(label: string): string {
    const clean = label.trim().replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
    const escaped = clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  /**
   * Find the matching close bracket for a shape, handling nested parens/brackets.
   * Scans from `start` in `str` looking for `close` sequence.
   * Returns the index of the first character of `close`, or -1.
   */
  function findClose(str: string, start: number, close: string): number {
    // For simple close sequences, just find the last occurrence
    // before any arrow to handle cases like `A[foo (bar)] --> B[baz]`
    const sub = str.substring(start);
    
    // Find where arrows start (boundary for this node)
    const arrowBound = sub.search(/\s+(--+>|==+>|-\.+-?>|<--+>|&)\s+/);
    const searchIn = arrowBound !== -1 ? sub.substring(0, arrowBound) : sub;
    
    const idx = searchIn.lastIndexOf(close);
    return idx !== -1 ? start + idx : -1;
  }

  const lines = c.split('\n').map(line => {
    let l = line.trim();
    
    // Skip empty, comments, keywords
    if (!l || l.startsWith('#') || l.startsWith('%%')) return l;
    if (/^(end|direction\s|click\s|classDef\s|class\s|linkStyle\s)/i.test(l)) return l;
    
    // Strip markdown bold/italic
    l = l.replace(/\*\*/g, '');
    l = l.replace(/\*/g, '');

    // Handle subgraph with bracket label: subgraph ID [Label Text]
    const subgraphMatch = l.match(/^(subgraph\s+[a-zA-Z0-9_-]+\s*\[)(.*?)(\]\s*)$/i);
    if (subgraphMatch) {
      const [, prefix, label, suffix] = subgraphMatch;
      return `${prefix}${quoteLabel(label)}${suffix}`;
    }
    
    // Handle subgraph without brackets (just ID) — pass through
    if (/^subgraph\s+/i.test(l)) return l;
    
    // Handle style lines — pass through unchanged
    if (/^style\s+/i.test(l)) return l;

    // Now process the line character by character, handling:
    // 1. Identifiers followed by shape openers → quote their labels
    // 2. Arrows → pass through unchanged
    // 3. & operator → pass through unchanged
    // 4. Everything else → pass through
    
    let result = '';
    let i = 0;
    
    while (i < l.length) {
      // Skip whitespace
      if (l[i] === ' ' || l[i] === '\t') {
        result += l[i];
        i++;
        continue;
      }
      
      // Check for & operator (used for parallel nodes: A & B --> C)
      if (l[i] === '&') {
        result += '&';
        i++;
        continue;
      }

      // Check for arrows first — must be detected before shape matching
      const remaining = l.substring(i);
      
      // Labeled arrow: --|label|> or ==|label|> 
      const labeledMatch = remaining.match(labeledArrowRegex);
      if (labeledMatch) {
        // Find the full arrow after the label: --|label|> or --|label|
        const fullLabeledArrow = remaining.match(/^(--+|==+|-\.+-?)\|([^|]*)\|(>?)/);
        if (fullLabeledArrow) {
          result += fullLabeledArrow[0];
          i += fullLabeledArrow[0].length;
          continue;
        }
      }
      
      // Plain arrow: -->, ==>, -.->
      const arrowMatch = remaining.match(arrowRegex);
      if (arrowMatch) {
        result += arrowMatch[0];
        i += arrowMatch[0].length;
        continue;
      }

      // Check for identifier followed by a shape
      const idMatch = remaining.match(/^([a-zA-Z0-9_-]+)/);
      if (idMatch) {
        const id = idMatch[1];
        const afterId = l.substring(i + id.length);
        
        // Try to match a shape opener after the ID
        let matched = false;
        for (const shape of shapes) {
          if (afterId.startsWith(shape.open)) {
            const contentStart = i + id.length + shape.open.length;
            const closeIdx = findClose(l, contentStart, shape.close);
            
            if (closeIdx !== -1) {
              const label = l.substring(contentStart, closeIdx);
              result += id + shape.open + quoteLabel(label) + shape.close;
              i = closeIdx + shape.close.length;
              matched = true;
              break;
            }
          }
        }
        
        if (!matched) {
          // Just an identifier with no shape — pass through
          result += id;
          i += id.length;
        }
        continue;
      }
      
      // Any other character — pass through
      result += l[i];
      i++;
    }
    
    return result;
  }).filter(line => line.length > 0);

  return lines.join('\n');
}

function adjustSvgColors(container: HTMLDivElement, isDark: boolean) {
  const svg = container.querySelector('svg')
  if (!svg) return

  // Center SVG and prevent stretch
  svg.style.display = 'block'
  svg.style.margin = '0 auto'

  const nodeShapes = svg.querySelectorAll('.node rect, .node path, .node polygon, .node circle, .node ellipse, .label-container')
  const nodeLabels = svg.querySelectorAll('.node text, .node tspan, .node span, .node div, .nodeLabel')
  const edgePaths = svg.querySelectorAll('.edgePath .path, .edge-thickness-normal')
  const markers = svg.querySelectorAll('.marker, marker path')
  const edgeLabelRects = svg.querySelectorAll('.edgeLabel rect')
  const edgeLabelTexts = svg.querySelectorAll('.edgeLabel text, .edgeLabel span')

  if (isDark) {
    nodeShapes.forEach(shape => {
      (shape as SVGElement).style.setProperty('fill', '#1c1d1f', 'important');
      (shape as SVGElement).style.setProperty('stroke', '#444444', 'important');
    })
    nodeLabels.forEach(label => {
      (label as HTMLElement).style.setProperty('fill', '#f3f4f6', 'important');
      (label as HTMLElement).style.setProperty('color', '#f3f4f6', 'important');
    })
    edgePaths.forEach(path => {
      (path as SVGElement).style.setProperty('stroke', '#c9553a', 'important');
    })
    markers.forEach(marker => {
      (marker as SVGElement).style.setProperty('fill', '#c9553a', 'important');
      (marker as SVGElement).style.setProperty('stroke', '#c9553a', 'important');
    })
    edgeLabelRects.forEach(rect => {
      (rect as SVGElement).style.setProperty('fill', '#0b0c0d', 'important');
    })
    edgeLabelTexts.forEach(text => {
      (text as HTMLElement).style.setProperty('fill', '#9ca3af', 'important');
      (text as HTMLElement).style.setProperty('color', '#9ca3af', 'important');
    })
  } else {
    // Clear all inline overrides to restore default light styles
    nodeShapes.forEach(shape => {
      (shape as SVGElement).style.removeProperty('fill');
      (shape as SVGElement).style.removeProperty('stroke');
    })
    nodeLabels.forEach(label => {
      (label as HTMLElement).style.removeProperty('fill');
      (label as HTMLElement).style.removeProperty('color');
    })
    edgePaths.forEach(path => {
      (path as SVGElement).style.removeProperty('stroke');
    })
    markers.forEach(marker => {
      (marker as SVGElement).style.removeProperty('fill');
      (marker as SVGElement).style.removeProperty('stroke');
    })
    edgeLabelRects.forEach(rect => {
      (rect as SVGElement).style.removeProperty('fill');
    })
    edgeLabelTexts.forEach(text => {
      (text as HTMLElement).style.removeProperty('fill');
      (text as HTMLElement).style.removeProperty('color');
    })
  }
}

export function MermaidRenderer({ code, title }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendered, setRendered] = useState(0)
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      setIsDark(dark)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

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
          setRendered(prev => prev + 1)
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

  useEffect(() => {
    if (containerRef.current) {
      adjustSvgColors(containerRef.current, isDark)
    }
  }, [isDark, rendered, error])

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