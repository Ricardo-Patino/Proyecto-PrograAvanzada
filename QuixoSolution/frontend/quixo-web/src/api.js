const API = import.meta.env.VITE_API_URL || 'http://localhost:5000' // adjust backend port

export async function createGame(payload){
  const res = await fetch(`${API}/api/games`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  })
  if(!res.ok) throw new Error(await res.text()+'Error creando juego')
  return res.json()

}


export async function postMove(gameId, payload){
  const res = await fetch(`${API}/api/games/${gameId}/moves`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  })
  if(!res.ok) throw new Error(await res.text()+'Error registrando jugada')
  return res.json()
}

export async function listFinished(){
  const res = await fetch(`${API}/api/games/finished`)
  if(!res.ok) throw new Error(await res.text()+'Error listando partidas')
  return res.json()
}

export async function replay(gameId){
  const res = await fetch(`${API}/api/games/${Number(gameId)}/replay`)
  if(!res.ok) throw new Error(await res.text()+'No existe')
  return res.json()
}

export async function statsDuo(){
  const res = await fetch(`${API}/api/stats/duo`)
  return res.json()
}

export async function statsQuartet(){
  const res = await fetch(`${API}/api/stats/quartet`)
  return res.json()
}
