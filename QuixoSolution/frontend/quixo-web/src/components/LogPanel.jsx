import { useEffect, useRef } from "react";

export default function LogPanel({ logs }) {
  const endRef = useRef(null);

  useEffect(() => {
  if (endRef.current) {
    endRef.current.parentElement.scrollTop = endRef.current.parentElement.scrollHeight;
  }
}, [logs]);

  return (
    <div className="log-panel">
      <h4 style={{ marginBottom: 8 }}>Eventos</h4>
      {logs.map((t, i) => (
        <div key={i} className="log-entry">
          {t}
        </div>
      ))}
      <div ref={endRef}></div>
    </div>
  );
}


