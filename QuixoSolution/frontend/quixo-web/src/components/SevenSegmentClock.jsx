import { useEffect, useState } from 'react'

export default function SevenSegmentClock({ running = true, resetSignal }) {
  const [secs, setSecs] = useState(0)

  // RESET DEL RELOJ
  useEffect(() => {
    setSecs(0)
  }, [resetSignal])

  // CONTADOR
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [running])

  const h = Math.floor(secs / 3600).toString().padStart(2, '0')
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')

  return <span className="clock">{h}:{m}:{s}</span>
}