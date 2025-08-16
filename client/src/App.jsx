import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Tabs from './components/Tabs.jsx';
import Game from './components/Game.jsx';
import Dashboard from './components/Dashboard.jsx';
import Profile from './components/Profile.jsx';
import History from './components/History.jsx';
import Leaderboard from './components/Leaderboard.jsx';

const CROSS_APP_ID = 'cmd8euall0037le0my79qpz42';

export default function App() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [tab, setTab] = useState('game');

  // Ambil wallet dari Cross App Account Monad Games ID
  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    const linked = user.linkedAccounts || [];
    const ca = linked.find(
      (a) => a.type === 'cross_app' && a.providerApp?.id === CROSS_APP_ID
    );
    if (ca && ca.embeddedWallets?.length > 0) {
      setAddress(ca.embeddedWallets[0].address);
    }
  }, [ready, authenticated, user]);

  // Fetch username dari endpoint Monad Games ID
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      if (!address) return;
      try {
        const r = await fetch(
          `https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${address}`,
          { signal: controller.signal }
        );
        const j = await r.json();
        if (j?.hasUsername && j?.user?.username) setUsername(j.user.username);
        else setUsername('');
      } catch {}
    })();
    return () => controller.abort();
  }, [address]);

  return (
    <div className="wrap">
      {/* Watermark X clickable (bottom-right) */}
      <a
        href="https://x.com/MaxisCrypto"
        className="watermark"
        target="_blank"
        rel="noopener noreferrer"
      >
        X @MaxisCrypto
      </a>

      {/* Topbar */}
      <div className="topbar">
        <div className="brand">Monad Stacker</div>
        <div className="right">
          {ready && authenticated ? (
            <>
              <span className="id">
                {username ? `@${username}` : address?.slice(0, 6) + '...' + address?.slice(-4)}
              </span>
              <button className="btn" onClick={logout}>Logout</button>
            </>
          ) : (
            <button className="btn" onClick={login}>Sign in with Monad Games ID</button>
          )}
        </div>
      </div>

      <Tabs active={tab} onChange={setTab} />
      <div className="panel">
        {tab === 'game' && <Game canPlay={ready && authenticated && !!address} address={address} />}
        {tab === 'dashboard' && <Dashboard address={address} />}
        {tab === 'profile' && <Profile address={address} username={username} />}
        {tab === 'history' && <History />}
        {tab === 'leaderboard' && <Leaderboard myAddress={address} />}
      </div>
    </div>
  );
}
