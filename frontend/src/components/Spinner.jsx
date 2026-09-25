function Spinner({ size = 24, label = "불러오는 중" }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role="status" aria-label={label} />
  );
}

export default Spinner;
