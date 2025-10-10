import { Link, Outlet } from 'react-router-dom'

export default function App() {
  return (
    <>
      <header>
        <strong>♟️ Quixo</strong>
        <nav>
          <Link to="/">Jugar</Link>
          <Link to="/finished">Finalizadas</Link>
          <Link to="/stats">Estadísticas</Link>
        </nav>
      </header>
      <div className="container">
        <Outlet />
      </div>
    </>
  )
}
