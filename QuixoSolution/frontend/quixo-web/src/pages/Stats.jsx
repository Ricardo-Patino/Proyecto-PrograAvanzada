import { useEffect, useState } from 'react'
import { statsDuo, statsQuartet } from '../api'

export default function Stats(){
  const [duo, setDuo] = useState([])
  const [quartet, setQuartet] = useState([])

  useEffect(()=>{
    statsDuo().then(setDuo)
    statsQuartet().then(setQuartet)
  },[])

  return (
    <section>
      <h2>Estadísticas — 2 jugadores</h2>
      <table>
        <thead><tr><th>Jugador</th><th>Efectividad %</th><th>Ganadas</th><th>Jugadas</th></tr></thead>
        <tbody>
          {duo.map((r,i)=> (
            <tr key={i}><td>{r.player}</td><td>{r.effectiveness ?? 0}</td><td>{r.won ?? 0}</td><td>{r.played ?? 0}</td></tr>
          ))}
        </tbody>
      </table>

      <h2 style={{marginTop:24}}>Estadísticas — 4 jugadores (equipos)</h2>
      <table>
        <thead><tr><th>Equipo</th><th>Efectividad %</th><th>Ganadas</th><th>Jugadas</th></tr></thead>
        <tbody>
          {quartet.map((r,i)=> (
            <tr key={i}><td>{r.team}</td><td>{r.effectiveness ?? 0}</td><td>{r.won ?? 0}</td><td>{r.played ?? 0}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
