import { useMemo, useState } from 'react'
import Board from '../components/Board'
import SevenSegmentClock from '../components/SevenSegmentClock'
import { createGame, postMove } from '../api'
import LogPanel from '../components/LogPanel'
import Modal from '../components/Modal'

const SIZE = 5
const NEUTRAL = 0, CIRCLE = 1, CROSS = 2
const SEATS = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT']
const TEAM_OF_SEAT = { TOP: 'A', RIGHT: 'B', BOTTOM: 'A', LEFT: 'B' }
const SYMBOL_OF_TEAM = { A: CIRCLE, B: CROSS }

const rowOf = i => Math.floor(i / SIZE)
const colOf = i => i % SIZE
const idxOf = (r, c) => r * SIZE + c
const isPerimeter = i => rowOf(i) === 0 || rowOf(i) === SIZE - 1 || colOf(i) === 0 || colOf(i) === SIZE - 1

function freshBoard() {
  return Array.from({ length: SIZE * SIZE }, _ => ({ sym: NEUTRAL, dot: null }))
}

export default function NewGame() {
  const [mode, setMode] = useState('DUO')
  const [board, setBoard] = useState(freshBoard())
  const [turn, setTurn] = useState(1)
  const [running, setRunning] = useState(false)
  const [gameId, setGameId] = useState(null)

  const [selected, setSelected] = useState(null)
  const [allowedDirs, setAllowedDirs] = useState([])
  const [chosenDot, setChosenDot] = useState(null)

  const [logs, setLogs] = useState([])
  function addLog(msg) { setLogs(l => [...l, msg]) }

  // MODAL
  const [modal, setModal] = useState(null)

  // RESET CLOCK
  const [clockReset, setClockReset] = useState(0)

  const currentSeat = useMemo(() => {
    return mode === 'DUO'
      ? ((turn % 2 === 1) ? 'TOP' : 'BOTTOM')
      : SEATS[(turn - 1) % 4]
  }, [turn, mode])

  const currentTeam = TEAM_OF_SEAT[currentSeat]
  const currentSymbol =
    mode === 'DUO'
      ? (currentSeat === 'TOP' ? CIRCLE : CROSS)
      : SYMBOL_OF_TEAM[currentTeam]

  const opponentSymbol = currentSymbol === CIRCLE ? CROSS : CIRCLE

  const isFirstRound = useMemo(
    () => turn <= (mode === 'DUO' ? 2 : 4),
    [turn, mode]
  )

  async function start() {
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

    addLog(`🟢 Nueva partida iniciada (ID ${res.id}) en modo ${mode}`)

    // RESET CLOCK
    setClockReset(x => x + 1)
  }

  function resetLocal() {
    setBoard(freshBoard())
    setTurn(1)
    setRunning(false)
    setGameId(null)
    setSelected(null)
    setAllowedDirs([])
    setChosenDot(null)

    addLog("🔁 Reiniciaste la partida local")

    // RESET CLOCK
    setClockReset(x => x + 1)
  }

  function onPickCell(idx) {
    if (!running || !gameId) return alert('Inicia la partida primero')
    if (!isPerimeter(idx)) return

    const cell = board[idx]

    if (cell.sym === opponentSymbol)
      return alert('No puedes retirar un cubo del contrario')

    if (isFirstRound && cell.sym !== NEUTRAL)
      return alert('Primera vuelta: debe ser un cubo NEUTRO')

    if (mode === 'QUARTET' && cell.sym === currentSymbol) {
      const mustFace = {
        A: { TOP: 'TOP', BOTTOM: 'BOTTOM' },
        B: { RIGHT: 'RIGHT', LEFT: 'LEFT' }
      }[currentTeam][currentSeat]
      if (cell.dot !== mustFace)
        return alert('Ese cubo debe apuntarte a ti')
    }

    const r = rowOf(idx), c = colOf(idx)
    const dirs = []
    if (c !== 0) dirs.push('LEFT')
    if (c !== SIZE - 1) dirs.push('RIGHT')
    if (r !== 0) dirs.push('TOP')
    if (r !== SIZE - 1) dirs.push('BOTTOM')

    setSelected(idx)
    setAllowedDirs(dirs)
    addLog(`📌 Seleccionaste el cubo en índice ${idx}`)

    if (mode === 'QUARTET') {
      const defaultDot = {
        TOP: 'TOP', RIGHT: 'RIGHT', BOTTOM: 'BOTTOM', LEFT: 'LEFT'
      }[currentSeat]
      setChosenDot(defaultDot)
    }
  }

  function cloneBoard(b) { return b.map(c => ({ ...c })) }

  function performPush(idx, direction, dotForPlaced) {
    const r = rowOf(idx), c = colOf(idx)
    const nb = cloneBoard(board)

    if (direction === 'LEFT' || direction === 'RIGHT') {
      const row = []
      for (let j = 0; j < SIZE; j++)
        if (j !== c) row.push(nb[idxOf(r, j)])

      const placed = { sym: currentSymbol, dot: (mode === 'QUARTET' ? dotForPlaced : 'TOP') }
      if (direction === 'LEFT') row.unshift(placed)
      else row.push(placed)

      for (let j = 0; j < SIZE; j++) nb[idxOf(r, j)] = row[j]
      const placedIdx = idxOf(r, direction === 'LEFT' ? 0 : SIZE - 1)
      return { nextBoard: nb, placedIdx }
    }

    // vertical
    const col = []
    for (let i = 0; i < SIZE; i++)
      if (i !== r) col.push(nb[idxOf(i, c)])

    const placed = { sym: currentSymbol, dot: (mode === 'QUARTET' ? dotForPlaced : 'TOP') }
    if (direction === 'TOP') col.unshift(placed)
    else col.push(placed)

    for (let i = 0; i < SIZE; i++) nb[idxOf(i, c)] = col[i]
    const placedIdx = idxOf(direction === 'TOP' ? 0 : SIZE - 1, c)
    return { nextBoard: nb, placedIdx }
  }

  function checkLine5(b, sym) {
    for (let i = 0; i < SIZE; i++) {
      let ok = true
      for (let j = 0; j < SIZE; j++)
        if (b[idxOf(i, j)].sym !== sym) { ok = false; break }
      if (ok) return true
    }

    for (let j = 0; j < SIZE; j++) {
      let ok = true
      for (let i = 0; i < SIZE; i++)
        if (b[idxOf(i, j)].sym !== sym) { ok = false; break }
      if (ok) return true
    }

    {
      let ok = true
      for (let k = 0; k < SIZE; k++)
        if (b[idxOf(k, k)].sym !== sym) { ok = false; break }
      if (ok) return true
    }

    {
      let ok = true
      for (let k = 0; k < SIZE; k++)
        if (b[idxOf(k, SIZE - 1 - k)].sym !== sym) { ok = false; break }
      if (ok) return true
    }

    return false
  }

  async function chooseDirection(dir) {
    if (selected == null) return

    let dot = 'TOP'
    if (mode === 'QUARTET') {
      const validDots = currentTeam === 'A' ? ['TOP', 'BOTTOM'] : ['LEFT', 'RIGHT']
      if (!chosenDot || !validDots.includes(chosenDot))
        return alert('Elige un punto válido')

      dot = chosenDot
    }

    addLog(`➡️ Empujaste hacia ${dir}`)

    const { nextBoard, placedIdx } = performPush(selected, dir, dot)

    const winMine = checkLine5(nextBoard, currentSymbol)
    const winOpponent = checkLine5(nextBoard, opponentSymbol)

    setBoard(nextBoard)
    setSelected(null)
    setAllowedDirs([])
    setChosenDot(null)

    await postMove(gameId, {
      turnNumber: turn,
      actorSeat: currentSeat,
      pickedIndex: selected,
      pushDirection: dir,
      placedIndex: placedIdx,
      symbol: currentSymbol === CIRCLE ? 'CIRCLE' : 'CROSS',
      dotOrientation: dot,
      causedWin: winMine,
      causedLose: winOpponent,
      boardJson: JSON.stringify(nextBoard)
    })

    if (winMine) {
      setRunning(false)
      addLog(`🏆 ¡Victoria de jugador!`)

      setModal({
        title: "¡Victoria!",
        message: currentSymbol === CIRCLE
          ? "Ganó CÍRCULO (○)"
          : "Ganó CRUZ (×)"
      })

      setClockReset(x => x + 1)
      return
    }

    if (winOpponent) {
      setRunning(false)
      addLog(`❌ Derrota por línea del rival`)

      setModal({
        title: "Derrota",
        message: "¡Formaste línea del rival!"
      })

      setClockReset(x => x + 1)
      return
    }

    setTurn(t => t + 1)
    addLog(`🔄 Turno ${turn + 1}`)
  }

  const playerLabel =
    mode === 'DUO'
      ? (currentSymbol === CIRCLE ? 'CÍRCULO (arriba)' : 'CRUZ (abajo)')
      : `${currentSeat} — ${currentTeam === 'A' ? '○ A' : '× B'}`

  return (
    <section>
      <div className="toolbar">
        <select value={mode} onChange={e => setMode(e.target.value)} className="btn" disabled={running}>
          <option value="DUO">Modo 2 Jugadores</option>
          <option value="QUARTET">Modo 4 Jugadores</option>
        </select>

        <button className="btn" onClick={start}>Iniciar</button>
        <button className="btn" onClick={resetLocal}>Reiniciar</button>

        <span className="tag">Juego: {gameId ?? '—'}</span>

        {/* RELOJ */}
        <SevenSegmentClock running={running} resetSignal={clockReset} />
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Board board={board} selected={selected} onPick={onPickCell} />

        <div>
          <h3>Turno: <span className="tag">{turn}</span></h3>
          <p>Juega: <strong>{playerLabel}</strong></p>

          {/** Reglas **/}
          <ol>
            <li>Haz clic en un cubo de la <em>periferia</em>.</li>
            <li>Primera vuelta: debe ser <strong>neutro</strong>.</li>
            {mode === 'QUARTET' && <li>Si tomas uno tuyo, el punto debe apuntarte.</li>}
            <li>Elige dirección de empuje.</li>
            {mode === 'QUARTET' && <li>Elige la orientación del punto.</li>}
          </ol>

          {mode === 'QUARTET' && selected != null && (
            <div style={{ marginTop: 12 }}>
              <strong>Orientación del punto:</strong>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {currentTeam === 'A' && (
                  <>
                    <button className={`dotbtn ${chosenDot === 'TOP' ? 'sel' : ''}`} onClick={() => setChosenDot('TOP')}>⬆️ TOP</button>
                    <button className={`dotbtn ${chosenDot === 'BOTTOM' ? 'sel' : ''}`} onClick={() => setChosenDot('BOTTOM')}>⬇️ BOTTOM</button>
                  </>
                )}
                {currentTeam === 'B' && (
                  <>
                    <button className={`dotbtn ${chosenDot === 'LEFT' ? 'sel' : ''}`} onClick={() => setChosenDot('LEFT')}>⬅️ LEFT</button>
                    <button className={`dotbtn ${chosenDot === 'RIGHT' ? 'sel' : ''}`} onClick={() => setChosenDot('RIGHT')}>➡️ RIGHT</button>
                  </>
                )}
              </div>
            </div>
          )}

          {selected != null && allowedDirs.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong>Dirección de empuje:</strong>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {allowedDirs.includes('LEFT') && <button className="dirbtn" onClick={() => chooseDirection('LEFT')}>⬅️ Izquierda</button>}
                {allowedDirs.includes('RIGHT') && <button className="dirbtn" onClick={() => chooseDirection('RIGHT')}>➡️ Derecha</button>}
                {allowedDirs.includes('TOP') && <button className="dirbtn" onClick={() => chooseDirection('TOP')}>⬆️ Arriba</button>}
                {allowedDirs.includes('BOTTOM') && <button className="dirbtn" onClick={() => chooseDirection('BOTTOM')}>⬇️ Abajo</button>}
              </div>
            </div>
          )}
        </div>

        <LogPanel logs={logs} />
      </div>

      <p style={{ marginTop: 12, color: '#9ca3af' }}>
        * Reglas implementadas: DUO y QUARTET.
      </p>

      {/* MODAL */}
      {modal && (
        <Modal
          title={modal.title}
          message={modal.message}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  )
}
