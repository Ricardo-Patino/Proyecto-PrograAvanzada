import { useEffect, useState } from 'react'
import { listFinished } from '../api'

export default function FinishedGames(){
  const [rows, setRows] = useState([])
  useEffect(()=>{
    listFinished().then(setRows).catch(console.error)
  },[])
  return (
    <section>
      <h2>Partidas finalizadas</h2>
      <table>
        <thead><tr><th>ID</th><th>Modo</th><th>Creada</th><th>Finalizada</th><th>Tiempo (s)</th></tr></thead>
        <tbody>
          {rows.map(r=> (
            <tr key={r.id}>
              <td>
  <Link to={`/replay/${r.id}`}>Ver</Link>
</td>

              <td>{r.mode}</td>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{new Date(r.finished_at).toLocaleString()}</td>
              <td>{r.elapsed_seconds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
