import React, { useEffect, useMemo, useState } from 'react';

export default function Leaderboard({ myAddress }) {
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);

  async function fetchLB() {
    setLoading(true);
    try {
      const r = await fetch(`${base}/api/leaderboard`);
      const j = await r.json();
      setRows(j.top || []);
      setUpdatedAt(j.updatedAt || Date.now());
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLB();
    const t = setInterval(fetchLB, 30000); // auto refresh tiap 30s
    return () => clearInterval(t);
  }, []);

  const myIndex = useMemo(
    () => rows.findIndex(r => r.wallet?.toLowerCase() === (myAddress||'').toLowerCase()),
    [rows, myAddress]
  );

  return (
    <div className="card">
      <div className="row between" style={{marginBottom:10}}>
        <h3 style={{margin:0}}>Global Leaderboard</h3>
        <div className="row" style={{gap:8}}>
          <span className="small">Updated: {updatedAt ? new Date(updatedAt).toLocaleTimeString() : '-'}</span>
          <button className="btn" onClick={fetchLB} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="rank">#</th>
              <th>User</th>
              <th>Wallet</th>
              <th>Total Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isMe = i === myIndex;
              return (
                <tr key={r.wallet} className={isMe ? 'you' : ''}>
                  <td className="rank">{i + 1}</td>
                  <td>
                    {r.username ? '@' + r.username : <span className="small">—</span>}
                    {isMe ? <span className="badge-you">you</span> : null}
                  </td>
                  <td className="mono">{r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}</td>
                  <td>{r.total}</td>
                </tr>
              );
            })}
            {!rows.length && !loading ? (
              <tr><td colSpan="4" className="small">No data yet. Play a run to appear here.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="small" style={{marginTop:8}}>
        Top 50 aggregated from all submitted runs. Scores are totals per wallet.
      </div>
    </div>
  );
}
