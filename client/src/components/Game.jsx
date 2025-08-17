import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import StackerGame from './StackerGame';
import { getLeaderboard, getHistory } from '../lib/api';

const CROSS_APP_ID = 'cmd8euall0037le0my79qpz42';

export default function Game() {
  const { user, ready, authenticated, login, logout } = usePrivy();
  const [wallet, setWallet] = useState('');
  const [username, setUsername] = useState('');
  const [hist, setHist] = useState([]);
  const [lbPreview, setLbPreview] = useState([]);

  // ekstrak wallet embedded dari Cross App ID Monad Games ID
  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    try {
      const cross = (user.linkedAccounts || []).find(
        (a) => a.type === 'cross_app' && a.providerApp?.id === CROSS_APP_ID
      );
      const addr = cross?.embeddedWallets?.[0]?.address;
      if (addr) setWallet(addr);
    } catch (e) {
      console.error('wallet parse error', e);
    }
  }, [ready, authenticated, user]);

  // fetch username dari endpoint Monad Games ID
  useEffect(() => {
    if (!wallet) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${wallet}`,
          { signal: ctrl.signal }
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.hasUsername) setUsername(json.user?.username || '');
          else setUsername('');
        }
      } catch (e) {
        console.warn('get username failed', e);
      }
    })();
    return () => ctrl.abort();
  }, [wallet]);

  // preview history & leaderboard (opsional)
  async function refreshSide() {
    try {
      if (wallet) {
        const h = await getHistory(wallet);
        setHist(h.slice(0, 5));
      }
      const lb = await getLeaderboard();
      setLbPreview(lb.slice(0, 5));
    } catch (e) {
      console.warn('side refresh fail', e);
    }
  }

  useEffect(() => {
    refreshSide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const canPlay = useMemo(() => ready && authenticated && wallet && username, [
    ready,
    authenticated,
    wallet,
    username
  ]);

  return (
    <div className="layout-2col">
      <div className="col">
        <div className="panel">
          <div className="panel-header">
            <h3>Game</h3>
            {!authenticated ? (
              <button className="btn primary" onClick={login}>Sign in with Monad Games ID</button>
            ) : (
              <div className="row-gap-8">
                <span className="muted">@{username || 'no-username'}</span>
                <button className="btn" onClick={logout}>Logout</button>
              </div>
            )}
          </div>

          {!authenticated && <p className="muted">Login first to play.</p>}
          {authenticated && !username && (
            <p className="warn">
              You must reserve a username before playing. Open
              {' '}
              <a className="link" href="https://monad-games-id-site.vercel.app/" target="_blank" rel="noreferrer">
                Monad Games ID
              </a>
              , register a username, then reload this page.
            </p>
          )}

          <div className="content-pad">
            {/* Komponen game baru (blok datang bergantian kiri/kanan + pantulan tepi) */}
            <StackerGame
              wallet={wallet}
              username={username}
              onSubmitOk={refreshSide}
            />
          </div>
        </div>
      </div>

      <div className="col">
        <div className="panel">
          <div className="panel-header">
            <h3>How to Play</h3>
          </div>
          <ul className="bullets">
            <li>Click/Touch or press Space to drop the moving block.</li>
            <li>Blocks come in from <b>left and right alternately</b> and <b>bounce</b> on edges.</li>
            <li>Place a block on top to gain <b>+1 score</b>. The base block doesn’t count.</li>
            <li>When there’s no overlap, all blocks fall and the run is submitted on-chain.</li>
          </ul>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Recent Submissions</h3>
            <button className="btn" onClick={refreshSide}>Refresh</button>
          </div>
          {hist.length === 0 ? (
            <p className="muted">No recent runs.</p>
          ) : (
            <div className="table">
              <div className="row head">
                <div className="cell">Time</div>
                <div className="cell right w-24">Score</div>
                <div className="cell w-16">Tx</div>
              </div>
              {hist.map((r, i) => (
                <div key={i} className="row">
                  <div className="cell">{new Date(r.ts).toLocaleString()}</div>
                  <div className="cell right w-24">{r.score}</div>
                  <div className="cell w-16">
                    {r.txHash ? (
                      <a className="link" href={`https://testnet.monadexplorer.com/tx/${r.txHash}`} target="_blank" rel="noreferrer">tx</a>
                    ) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Top Players (preview)</h3>
            <button className="btn" onClick={refreshSide}>Refresh</button>
          </div>
          {lbPreview.length === 0 ? (
            <p className="muted">No data yet.</p>
          ) : (
            <div className="table">
              <div className="row head">
                <div className="cell w-12">#</div>
                <div className="cell">Player</div>
                <div className="cell w-24 right">Total</div>
              </div>
              {lbPreview.map((r) => (
                <div key={r.rank + r.wallet} className="row">
                  <div className="cell w-12">{r.rank}</div>
                  <div className="cell">{r.username || short(r.wallet)}</div>
                  <div className="cell w-24 right">{r.totalScore ?? 0}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function short(a) {
  if (!a) return '';
  return a.slice(0, 6) + '…' + a.slice(-4);
}
