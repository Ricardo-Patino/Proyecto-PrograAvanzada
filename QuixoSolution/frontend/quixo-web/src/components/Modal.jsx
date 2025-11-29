export default function Modal({ title, message, onClose }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000
    }}>
      <div style={{
        background: "#1f2937",
        padding: "24px",
        borderRadius: "12px",
        maxWidth: "360px",
        textAlign: "center",
        color: "white",
        border: "1px solid #4b5563",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
      }}>
        <h2 style={{ marginBottom: 12 }}>{title}</h2>
        <p style={{ marginBottom: 20 }}>{message}</p>
        <button
          onClick={onClose}
          className="btn"
          style={{ width: "100%" }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}