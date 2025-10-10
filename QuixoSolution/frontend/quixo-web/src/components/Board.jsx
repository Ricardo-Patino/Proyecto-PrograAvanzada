import { useMemo } from 'react'

/**
 * Cell model: { sym: 0|1|2, dot: 'UP'|'RIGHT'|'DOWN'|'LEFT'|null }
 * 0=neutro, 1=círculo(Equipo A), 2=cruz(Equipo B)
 */
export default function Board({ board, selected, onPick }) {
  const perim = useMemo(() => {
    const ids = new Set()
    for (let i = 0; i < 5; i++) { ids.add(i); ids.add(20 + i) } // top/bottom
    for (let r = 0; r < 5; r++) { ids.add(r * 5); ids.add(r * 5 + 4) } // left/right
    return ids
  }, [])

  const dotChar = (d) => {
    if (!d) return ''
    return { UP: '•↑', RIGHT: '•→', DOWN: '•↓', LEFT: '•←' }[d]
  }

  return (
    <div className="grid">
      {board.map((cell, idx) => {
        const isPerimeter = perim.has(idx)
        const isSel = selected === idx
        const sym = cell.sym === 0 ? '·' : (cell.sym === 1 ? '○' : '×')
        return (
          <div
            key={idx}
            className={`cell ${isPerimeter ? 'perimeter' : ''} ${isSel ? 'sel' : ''}`}
            onClick={() => isPerimeter && onPick?.(idx)}
            title={isPerimeter ? 'Periferia (clic para seleccionar)' : 'No seleccionable'}
          >
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', lineHeight:1.1}}>
              <div>{sym}</div>
              <div style={{fontSize:12, opacity:0.8}}>{dotChar(cell.dot)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

