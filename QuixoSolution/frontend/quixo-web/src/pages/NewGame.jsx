import { useMemo, useState } from 'react'
import Board from '../components/Board'
import SevenSegmentClock from '../components/SevenSegmentClock'
import { createGame, postMove } from '../api'

const SIZE = 5
const NEUTRAL = 0, CIRCLE = 1, CROSS = 2
const SEATS = ['TOP','RIGHT','BOTTOM','LEFT']        // orden de turnos en QUARTET
const TEAM_OF_SEAT = { TOP:'A', RIGHT:'B', BOTTOM:'A', LEFT:'B' }
const SYMBOL_OF_TEAM = { A: CIRCLE, B: CROSS }

const rowOf = i => Math.floor(i / SIZE)
const colOf = i => i % SIZE
const idxOf = (r,c) => r*SIZE + c
const isPerimeter = i => rowOf(i)===0 || rowOf(i)===SIZE-1 || colOf(i)===0 || colOf(i)===SIZE-1

function freshBoard(){
  return Array.from({length: SIZE*SIZE}, _ => ({ sym: NEUTRAL, dot: null }))
}

export default function NewGame(){
  const [mode, setMode] = useState('DUO')
  const [board, setBoard] = useState(freshBoard())
  const [turn, setTurn] = useState(1)
  const [running, setRunning] = useState(false)
  const [gameId, setGameId] = useState(null)

  const [selected, setSelected] = useState(null)
  const [allowedDirs, setAllowedDirs] = useState([]) // ['LEFT','RIGHT','TOP','BOTTOM']
  const [chosenDot, setChosenDot] = useState(null)   // para QUARTET

  // Jugador actual (símbolo/seat)
  const currentSeat = useMemo(()=>{
    return mode === 'DUO' ? ( (turn % 2 === 1) ? 'TOP' : 'BOTTOM' ) : SEATS[(turn-1) % 4]
  }, [turn, mode])

let currentSymbol;
if (mode === 'DUO') {
  // DUO: TOP = CIRCLE, BOTTOM = CROSS
  currentSymbol = currentSeat === 'TOP' ? CIRCLE : CROSS;
} else {
  // QUARTET usa equipos A/B
  const currentTeam = TEAM_OF_SEAT[currentSeat];
  currentSymbol = SYMBOL_OF_TEAM[currentTeam];
}

  const opponentSymbol = currentSymbol === CIRCLE ? CROSS : CIRCLE

  // Primera vuelta: DUO -> turn<=2; QUARTET -> turn<=4
  const isFirstRound = useMemo(()=> turn <= (mode==='DUO' ? 2 : 4), [turn, mode])

  async function start(){
    const payload = mode === 'DUO'
      ? { mode: 'DUO', playerTopId: 1, playerBottomId: 2 }
      : { mode: 'QUARTET', playerTopId: 1, playerRightId: 2, playerBottomId: 3, playerLeftId: 4 }
    const res = await createGame(payload)
    setGameId(res.id)
    setBoard(freshBoard())
    setTurn(1)
    setRunning(true)
    setSelected(null)
    setAllowedDirs([])
    setChosenDot(null)
  }

  function resetLocal(){
    setBoard(freshBoard())
    setTurn(1)
    setRunning(false)
    setGameId(null)
    setSelected(null)
    setAllowedDirs([])
    setChosenDot(null)
  }

  function onPickCell(idx){
    if(!running || !gameId) return alert('Inicia la partida primero')
    if(!isPerimeter(idx)) return

    const cell = board[idx]

    // Regla general: no puedes retirar pieza del contrario
    if(cell.sym === opponentSymbol) return alert('No puedes retirar un cubo del contrario')

    // Primera vuelta: solo NEUTRO
    if(isFirstRound && cell.sym !== NEUTRAL) return alert('Primera vuelta: debes retirar un cubo NEUTRO')

    // En QUARTET, si es tu símbolo, el dot debe apuntarte
    if(mode === 'QUARTET' && cell.sym === currentSymbol){
      const mustFace = {
        A: { TOP:'TOP', BOTTOM:'BOTTOM' },
        B: { RIGHT:'RIGHT', LEFT:'LEFT' }
      }[currentTeam][currentSeat]
      if(cell.dot !== mustFace) return alert('Solo puedes retirar un cubo de tu símbolo cuyo punto te apunte')
    }

    // Direcciones válidas (no devolver al mismo lugar)
    const r = rowOf(idx), c = colOf(idx)
    const dirs = []
    if(c !== 0) dirs.push('LEFT')
    if(c !== SIZE-1) dirs.push('RIGHT')
    if(r !== 0) dirs.push('TOP')
    if(r !== SIZE-1) dirs.push('BOTTOM')

    setSelected(idx)
    setAllowedDirs(dirs)
    // Dot por defecto (QUARTET): apunta a ti mismo
    if(mode==='QUARTET'){
      const defaultDot = {
        TOP: 'TOP', RIGHT: 'RIGHT', BOTTOM: 'BOTTOM', LEFT: 'LEFT'
      }[currentSeat]
      setChosenDot(defaultDot)
    }
  }

  function cloneBoard(b){ return b.map(c => ({...c})) }

  function performPush(idx, direction, dotForPlaced){
    const r = rowOf(idx), c = colOf(idx)
    const nb = cloneBoard(board)

    if(direction === 'LEFT' || direction === 'RIGHT'){
      // fila r
      const row = []
      for(let j=0;j<SIZE;j++) if(j!==c) row.push(nb[idxOf(r,j)])
      const placed = { sym: currentSymbol, dot: (mode==='QUARTET' ? dotForPlaced : 'TOP') }
      if(direction === 'LEFT') row.unshift(placed)
      else row.push(placed)
      for(let j=0;j<SIZE;j++) nb[idxOf(r,j)] = row[j]
      const placedIdx = idxOf(r, direction==='LEFT' ? 0 : SIZE-1)
      return { nextBoard: nb, placedIdx }
    } else {
      // columna c
      const col = []
      for(let i=0;i<SIZE;i++) if(i!==r) col.push(nb[idxOf(i,c)])
      const placed = { sym: currentSymbol, dot: (mode==='QUARTET' ? dotForPlaced : 'TOP') }
      if(direction === 'TOP') col.unshift(placed)
      else col.push(placed)
      for(let i=0;i<SIZE;i++) nb[idxOf(i,c)] = col[i]
      const placedIdx = idxOf(direction==='TOP' ? 0 : SIZE-1, c)
      return { nextBoard: nb, placedIdx }
    }
  }

  function checkLine5(b, sym){
    // filas
    for(let i=0;i<SIZE;i++){
      let ok = true
      for(let j=0;j<SIZE;j++){ if(b[idxOf(i,j)].sym!==sym){ ok=false; break } }
      if(ok) return true
    }
    // cols
    for(let j=0;j<SIZE;j++){
      let ok = true
      for(let i=0;i<SIZE;i++){ if(b[idxOf(i,j)].sym!==sym){ ok=false; break } }
      if(ok) return true
    }
    // diag principal
    { let ok = true
      for(let k=0;k<SIZE;k++){ if(b[idxOf(k,k)].sym!==sym){ ok=false; break } }
      if(ok) return true
    }
    // diag secundaria
    { let ok = true
      for(let k=0;k<SIZE;k++){ if(b[idxOf(k,SIZE-1-k)].sym!==sym){ ok=false; break } }
      if(ok) return true
    }
    return false
  }

  async function chooseDirection(dir){
    if(selected == null) return

    // En QUARTET, obliga a elegir dot válido (solo hacia los asientos de tu equipo)
    let dot = 'TOP'
    if(mode==='QUARTET'){
      const validDots = currentTeam==='A' ? ['TOP','BOTTOM'] : ['LEFT','RIGHT']
      if(!chosenDot || !validDots.includes(chosenDot)){
        return alert('Elige la orientación del punto para decidir quién de tu equipo podrá jugar el cubo')
      }
      dot = chosenDot
    }

    const { nextBoard, placedIdx } = performPush(selected, dir, dot)

    // Win/Lose
    const winMine = checkLine5(nextBoard, currentSymbol)
    const winOpponent = checkLine5(nextBoard, opponentSymbol)
    const causedWin = !!winMine
    const causedLose = !!winOpponent

    setBoard(nextBoard)
    setSelected(null)
    setAllowedDirs([])
    setChosenDot(null)

    // Registrar jugada
    await postMove(gameId, {
      turnNumber: turn,
      actorSeat: currentSeat,
      pickedIndex: selected,
      pushDirection: dir,
      placedIndex: placedIdx,
      symbol: currentSymbol===CIRCLE?'CIRCLE':'CROSS',
      dotOrientation: dot,
      causedWin,
      causedLose,
      boardJson: JSON.stringify(nextBoard)
    })

    if(causedWin || causedLose){
      setRunning(false)
      const who = mode==='DUO'
        ? (currentSymbol===CIRCLE ? 'CÍRCULO' : 'CRUZ')
        : (currentTeam==='A' ? 'Equipo A (○)' : 'Equipo B (×)')
      alert(causedWin ? `¡Gana ${who}!` : `¡Pierde ${who} por formar línea del rival!`)
    } else {
      // siguiente turno
      setTurn(t => t+1)
    }
  }

  // UI helpers
  const playerLabel = (mode==='DUO'
    ? (currentSymbol===CIRCLE ? 'CÍRCULO (arriba)' : 'CRUZ (abajo)')
    : `${currentSeat} — ${currentTeam==='A'?'○ A':'× B'}`)

  return (
    <section>
      <div className="toolbar">
        <select value={mode} onChange={e=>setMode(e.target.value)} className="btn" disabled={running}>
          <option value="DUO">Modo 2 Jugadores</option>
          <option value="QUARTET">Modo 4 Jugadores</option>
        </select>
        <button className="btn" onClick={start}>Iniciar</button>
        <button className="btn" onClick={resetLocal}>Reiniciar</button>
        <span className="tag">Juego: {gameId ?? '—'}</span>
        <SevenSegmentClock running={running} />
      </div>

      <div style={{display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap'}}>
        <Board board={board} selected={selected} onPick={onPickCell} />
        <div>
          <h3>Turno: <span className="tag">{turn}</span></h3>
          <p>Juega: <strong>{playerLabel}</strong></p>
          <ol>
            <li>Haz clic en un cubo de la <em>periferia</em> (no puede ser del rival).</li>
            <li>Primera vuelta: {mode==='DUO' ? 'turnos 1 y 2' : 'turnos 1 a 4'} debe ser <strong>neutro</strong>.</li>
            {mode==='QUARTET' && <li>Si tomas uno de tu símbolo, el <strong>punto debe apuntarte</strong>.</li>}
            <li>Elige la dirección de empuje (no puedes devolver al mismo lugar).</li>
            {mode==='QUARTET' && <li>Selecciona la <strong>orientación del punto</strong> para decidir quién del equipo podrá volver a jugar ese cubo.</li>}
          </ol>

          {mode==='QUARTET' && selected!=null && (
            <div style={{marginTop:12}}>
              <div><strong>Orientación del punto (dot):</strong></div>
              <div style={{display:'flex', gap:8, marginTop:6, flexWrap:'wrap'}}>
                {currentTeam==='A' && (
                  <>
                    <button className={`dotbtn ${chosenDot==='TOP'?'sel':''}`} onClick={()=>setChosenDot('TOP')}>⬆️ Apunta a TOP</button>
                    <button className={`dotbtn ${chosenDot==='BOTTOM'?'sel':''}`} onClick={()=>setChosenDot('BOTTOM')}>⬇️ Apunta a BOTTOM</button>
                  </>
                )}
                {currentTeam==='B' && (
                  <>
                    <button className={`dotbtn ${chosenDot==='LEFT'?'sel':''}`} onClick={()=>setChosenDot('LEFT')}>⬅️ Apunta a LEFT</button>
                    <button className={`dotbtn ${chosenDot==='RIGHT'?'sel':''}`} onClick={()=>setChosenDot('RIGHT')}>➡️ Apunta a RIGHT</button>
                  </>
                )}
              </div>
            </div>
          )}

          {selected != null && allowedDirs.length > 0 && (
            <div style={{marginTop:12, display:'grid', gap:8}}>
              <div><strong>Dirección de empuje:</strong></div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                {allowedDirs.includes('LEFT')   && <button className="dirbtn" onClick={()=>chooseDirection('LEFT')}>⬅️ Izquierda</button>}
                {allowedDirs.includes('RIGHT')  && <button className="dirbtn" onClick={()=>chooseDirection('RIGHT')}>➡️ Derecha</button>}
                {allowedDirs.includes('TOP')    && <button className="dirbtn" onClick={()=>chooseDirection('TOP')}>⬆️ Arriba</button>}
                {allowedDirs.includes('BOTTOM') && <button className="dirbtn" onClick={()=>chooseDirection('BOTTOM')}>⬇️ Abajo</button>}
              </div>
            </div>
          )}
        </div>
      </div>

      <p style={{marginTop:12, color:'#9ca3af'}}>
        * Reglas implementadas: DUO y QUARTET con selección válida, primera vuelta (neutro), empuje, orientación del punto (4J) y victoria/derrota por líneas.
      </p>
    </section>
  )
}
