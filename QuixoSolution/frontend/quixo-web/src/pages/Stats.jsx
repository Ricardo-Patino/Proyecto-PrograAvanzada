import { useEffect, useState } from 'react'
import { statsDuo, statsQuartet } from '../api'

export default function Stats() {
  const [duo, setDuo] = useState([])
  const [quartet, setQuartet] = useState([])

  useEffect(() => {
    statsDuo().then(setDuo)
    statsQuartet().then(setQuartet)
  }, [])

  return (
    <section style={{ padding: "20px" }}>
      <h2>Estadísticas — 2 jugadores</h2>
      <table>
        <thead>
          <tr>
            <th>Jugador</th><th>Efectividad %</th><th>Ganadas</th><th>Jugadas</th>
          </tr>
        </thead>
        <tbody>
          {duo.map((r, i) => (
            <tr key={i}>
              <td>{r.jugador}</td>
              <td>{r.efectividad_pct}</td>
              <td>{r.ganadas}</td>
              <td>{r.played_cnt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Estadísticas — 4 jugadores (equipos)</h2>
      <table>
        <thead>
          <tr>
            <th>Equipo</th><th>Efectividad %</th><th>Ganadas</th><th>Jugadas</th>
          </tr>
        </thead>
        <tbody>
          {quartet.map((r, i) => (
            <tr key={i}>
              <td>{r.equipo ?? "—"}</td>
              <td>{r.efectividad_pct}</td>
              <td>{r.ganadas}</td>
              <td>{r.played_cnt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}


