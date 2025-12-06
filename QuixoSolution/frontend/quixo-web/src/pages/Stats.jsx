import { useEffect, useState } from 'react';
import { statsDuo, statsQuartet } from '../api';

export default function Stats() {
  const [duo, setDuo] = useState([]);
  const [quartet, setQuartet] = useState([]);

  useEffect(() => {
    statsDuo()
      .then(setDuo)
      .catch((err) => console.error('Error stats DUO:', err));

    statsQuartet()
      .then(setQuartet)
      .catch((err) => console.error('Error stats QUARTET:', err));
  }, []);

  return (
    <div className="container">
      <h1>Estadísticas</h1>

      {/* =========================
          2 JUGADORES (DUO)
         ========================= */}
      <h2>Estadísticas — 2 jugadores</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Efectividad %</th>
            <th>Ganadas</th>
            <th>Jugadas</th>
          </tr>
        </thead>
        <tbody>
          {duo.map((r, i) => (
            <tr key={i}>
              {/* Nombre del jugador */}
              <td>{r.jugador}</td>

              {/* Porcentaje de victorias */}
              <td>
                {r.efectividad_pct != null
                  ? Number(r.efectividad_pct).toFixed(2)
                  : '0.00'}
              </td>

              {/* Partidas ganadas */}
              <td>{r.ganadas ?? 0}</td>

              {/* Partidas jugadas */}
              <td>{r.played_cnt ?? 0}</td>
            </tr>
          ))}

          {duo.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center' }}>
                No hay partidas DUO finalizadas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* =========================
          4 JUGADORES (QUARTET)
         ========================= */}
      <h2>Estadísticas — 4 jugadores (equipos)</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>Efectividad %</th>
            <th>Ganadas</th>
            <th>Jugadas</th>
          </tr>
        </thead>
        <tbody>
          {quartet.map((r, i) => (
            <tr key={i}>
              {/* Equipo A / B */}
              <td>{r.equipo}</td>

              {/* Porcentaje de victorias */}
              <td>
                {r.efectividad_pct != null
                  ? Number(r.efectividad_pct).toFixed(2)
                  : '0.00'}
              </td>

              {/* Partidas ganadas por el equipo */}
              <td>{r.ganadas ?? 0}</td>

              {/* Partidas jugadas TOTAL en modo QUARTET */}
              <td>{r.jugadas ?? 0}</td>
            </tr>
          ))}

          {quartet.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center' }}>
                No hay partidas QUARTET finalizadas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
