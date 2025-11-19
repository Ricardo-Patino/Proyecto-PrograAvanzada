import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import NewGame from './pages/NewGame'
import FinishedGames from './pages/FinishedGames'
import Stats from './pages/Stats'
import Replay from './pages/Replay'

const router = createBrowserRouter([
  { path: '/', element: <App />,
    children: [
      { index: true, element: <NewGame /> },
      { path: 'finished', element: <FinishedGames /> },
      { path: 'stats', element: <Stats /> },
      { path: 'replay/:gameId', element: <Replay /> },
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
