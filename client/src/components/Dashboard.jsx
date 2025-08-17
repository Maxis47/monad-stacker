// client/src/components/Leaderboard.jsx
import { useEffect, useRef, useState } from 'react';
import { getLeaderboard } from '../lib/api';

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  async function refresh() {
    try {
      setLoading(true);
      const data = await getLeaderboard(); // [{ wallet, username, totalScore, rank }]
      setRows(data);
    } catch (e) {
      console.error('leaderboard refresh error:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(); // initial load
    timerRef.current = setInterval(refresh, 8000); // auto-refresh tiap 8 detik
    return () => clearInterval(timerRef.current);
  }, []);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>All-time Global Leaderboard</h3>
        <button className="btn" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className="muted" style={{ marginTop: -6, marginBottom: 10 }}>
        Rankings show the <b>total cumulative points</b> per player (all sessions, all time).
      </p>

      <div className="table">
        <div className="row head">
          <div className="cell w-12">#</div>
          <div className="cell">Player</div>
          <div className="cell w-24 right">Total Score</div>
        </div>

        {rows.length === 0 && (
          <div className="row">
            <div className="cell">No data yet — be the first!</div>
          </div>
        )}

        {rows.map((r) => (
          <div key={`${r.rank}-${r.wallet}`} className="row">
            <div className="cell w-12">{r.rank}</div>
            <div className="cell">{r.username ? r.username : short(r.wallet)}</div>
            <div className="cell w-24 right">{r.totalScore ?? 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function short(a) {
  if (!a) return '';
  return a.slice(0, 6) + '…' + a.slice(-4);
}
