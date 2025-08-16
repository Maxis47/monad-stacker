export default function History() {
  const hist = JSON.parse(localStorage.getItem('hist') || '[]');
  return (
    <div className="card">
      <h3>History</h3>
      <div className="list">
        {hist.length === 0 && <div className="empty">Belum ada permainan</div>}
        {hist.map((h, i) => (
          <div key={i} className="row between">
            <div>
              <div className="mono small">{new Date(h.t).toLocaleString()}</div>
              <div>Score {h.score}</div>
            </div>
            <div>
              {h.tx ? (
                <a className="link" href={`https://testnet.monadexplorer.com/tx/${h.tx}`} target="_blank" rel="noreferrer">Tx</a>
              ) : (
                <span className="mono small">no tx</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}