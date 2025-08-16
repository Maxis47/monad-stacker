export default function Profile({ address, username }) {
  return (
    <div className="card">
      <h3>Profile</h3>
      <div className="grid2">
        <div className="stat">
          <div className="label">Monad Games ID</div>
          <div className="value">{username ? '@' + username : '(no username)'}</div>
        </div>
        <div className="stat">
          <div className="label">Wallet</div>
          <div className="value mono">{address || '-'}</div>
        </div>
      </div>
      {!username && (
        <p style={{ marginTop: 12 }}>
          Belum punya username? Daftar di{' '}
          <a href="https://monad-games-id-site.vercel.app/" target="_blank" rel="noreferrer">monad-games-id-site.vercel.app</a>
        </p>
      )}
    </div>
  );
}