export default function Dashboard({ address }) {
  const hist = JSON.parse(localStorage.getItem('hist') || '[]');
  const totalScore = hist.reduce((a, b) => a + (b.score || 0), 0);
  const totalGames = hist.length;

  return (
    <div className="card">
      <h3>Overview</h3>
      <div className="grid2">
        <div className="stat">
          <div className="label">Address</div>
          <div className="value mono">{address || '-'}</div>
        </div>
        <div className="stat">
          <div className="label">Total Games</div>
          <div className="value">{totalGames}</div>
        </div>
        <div className="stat">
          <div className="label">Total Score</div>
          <div className="value">{totalScore}</div>
        </div>
        <div className="stat">
          <div className="label">Avg Score</div>
          <div className="value">{totalGames ? Math.round(totalScore / totalGames) : 0}</div>
        </div>
      </div>
    </div>
  );
}