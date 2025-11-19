import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { replay } from '../api'
import Board from '../components/Board'

export default function Replay() {
  const { gameId } = useParams()
  const [loading, setLoading] = useState(true)
  const [game, setGame] = useState(null)
  const [participants, setParticipants] = useState([])
  const [moves, setMoves] = useState([])
  const [idx, setIdx] = useState(0) // índice del movimiento actual
  const [board, setBoard] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const data = await replay(gameId)
        setGame(data.game)
        setParticipants(data.participants)
        setMoves(data.moves)

        // estado inicial antes de la jugada 1
        if (data.moves.length > 0) {
          const initial = JSON.parse(data.moves[0].board_json)
          setBoard(initial)
        }
      } catch (err) {
        console.error(err)
        alert('No se pudo cargar la partida.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [gameId])

  useEffect(() => {
    if (!moves.length) return
    const b = JSON.parse(moves[idx].board_json)
    setBoard(b)
  }, [idx, moves])

  if (loading) return <p>Cargando…</p>
  if (!game) return <p>No existe la partida #{gameId}</p>

  const m = moves[idx]
  const created = new Date(game.created_at)
  const now = new Date(m.created_at)
  const elapsedSec = Math.floor((now - created) / 1000)

  // format time hh:mm:ss
  const hh = String(Math.floor(elapsedSec / 3600)).padStart(2, '0')
  const mm = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0')
  const ss = String(elapsedSec % 60).padStart(2, '0')

  const goFirst = () => setIdx(0)
  const goLast = () => setIdx(moves.length - 1)
  const prev = () => setIdx((i) => Math.max(0, i - 1))
  const next = () => setIdx((i) => Math.min(moves.length - 1, i + 1))

  const winner =
    game.status === 'FINISHED'
      ? game.winner_team
        ? `Ganó equipo ${game.winner_team}`
        : game.winner_player_id
        ? `Ganó jugador ID ${game.winner_player_id}`
        : 'Finalizada'
      : 'En progreso'

  return (
    <section>
      <h2>Reproducción — Partida #{gameId}</h2>

      <p><strong>Modo:</strong> {game.mode}</p>
      <p><strong>Estado:</strong> {winner}</p>
      <p><strong>Jugadas totales:</strong> {moves.length}</p>

      <h3>Participantes</h3>
      <ul>
        {participants.map((p) => (
          <li key={p.seat}>
            <strong>{p.seat}</strong> — Jugador {p.player_id} —{' '}
            {p.team ? `Equipo ${p.team}` : ''} — Símbolo {p.symbol_at_game}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
        <Board board={board} />

        <div>
          <h3>Movimiento {idx + 1} / {moves.length}</h3>
          <p><strong>Tiempo:</strong> {hh}:{mm}:{ss}</p>

          {m && (
            <>
              <p><strong>Seat:</strong> {m.played_seat}</p>
              <p><strong>Team:</strong> {m.played_team ?? '—'}</p>
              <p><strong>Dirección:</strong> {m.push_direction}</p>
              <p><strong>Símbolo puesto:</strong> {m.result_symbol}</p>
              <p><strong>Punto orientado:</strong> {m.result_dot_dir}</p>
              {m.caused_win ? (
                <p style={{ color: 'green' }}><strong>¡Esta jugada ganó la partida!</strong></p>
              ) : null}
              {m.caused_loss_by_opponent_line ? (
                <p style={{ color: 'red' }}><strong>¡Esta jugada causó derrota por línea del rival!</strong></p>
              ) : null}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <button onClick={goFirst} className="btn">⏮️ Inicio</button>
            <button onClick={prev} className="btn">⬅️ Anterior</button>
            <button onClick={next} className="btn">➡️ Siguiente</button>
            <button onClick={goLast} className="btn">⏭️ Final</button>
          </div>

          <a
            href={`http://localhost:5000/api/games/${gameId}/export.xml`}
            target="_blank"
            className="btn"
            style={{ marginTop: 16, display: 'inline-block' }}
          >
            📤 Exportar XML
          </a>
        </div>
      </div>
    </section>
  )
}
