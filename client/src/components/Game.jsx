import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const W = 360, H = 560;
const BASE_SPEED = 2.2;
const BLOCK_H = 24;
const THRESHOLD_TOP = 80;
const TARGET_Y = H - 64;

export default function Game({ canPlay, address }) {
  const canvasRef = useRef(null);

  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [info, setInfo] = useState('Tap / Click / Space to drop'); // ← tanpa “Unlimited score mode”

  // status submit
  const [submitState, setSubmitState] = useState('idle'); // idle | submitting | ok | err
  const [submitMsg, setSubmitMsg] = useState('');
  const [lastTx, setLastTx] = useState('');

  // skor terakhir yang valid (sebelum game over)
  const lastScoreRef = useRef(0);

  const stateRef = useRef({
    stack: [],
    current: null,
    dir: 1,
    speed: BASE_SPEED,
    session: null,
    fallBlocks: null
  });

  /* ===== Helpers ===== */
  async function startSession() {
    const s = await api.startSession(address);
    stateRef.current.session = s;
  }

  function placedCountFromState() {
    return Math.max(0, (stateRef.current.stack?.length || 1) - 1);
  }

  function reset() {
    setSubmitState('idle'); setSubmitMsg(''); setLastTx('');
    lastScoreRef.current = 0;

    const baseW = 120;
    const baseX = Math.floor((W - baseW) / 2);
    stateRef.current = {
      stack: [{ x: baseX, y: H - 40, w: baseW, h: BLOCK_H }], // base (tidak dihitung)
      current: { x: 0, y: H - 64, w: baseW, h: BLOCK_H },
      dir: 1,
      speed: BASE_SPEED,
      session: stateRef.current.session,
      fallBlocks: null
    };
    setInfo('Tap / Click / Space to drop'); // ← tanpa “Unlimited score mode”
    draw(canvasRef.current.getContext('2d'));
  }

  function draw(ctx) {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0a0f1f'); g.addColorStop(1, '#141e46');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // grid
    ctx.globalAlpha = 0.08; ctx.strokeStyle = '#7df9ff';
    for (let i = 0; i < W; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
    for (let j = 0; j < H; j += 20) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke(); }
    ctx.globalAlpha = 1;

    const { stack, current, fallBlocks } = stateRef.current;
    const toDraw = fallBlocks?.length ? fallBlocks : [...stack, ...(current ? [current] : [])];
    toDraw.forEach((b, idx) => {
      const hue = 200 + ((idx * 15) % 120);
      const color = fallBlocks ? 'rgba(255,80,140,0.95)' : `hsl(${hue}, 90%, 60%)`;
      ctx.fillStyle = color;
      ctx.shadowColor = fallBlocks ? '#ff6ea6' : '#00eaff';
      ctx.shadowBlur = 12;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;
    });

    // tampilkan skor saat ini = jumlah blok yang berhasil
    const scoreNow = placedCountFromState();
    ctx.fillStyle = '#e6f1ff';
    ctx.font = '900 22px "Orbitron", system-ui, -apple-system, "Segoe UI", Roboto';
    ctx.shadowColor = 'rgba(125,249,255,.45)';
    ctx.shadowBlur = 12;
    ctx.fillText(`Score ${scoreNow}`, 16, 32);
    ctx.shadowBlur = 0;
  }

  const step = () => {
    if (!runningRef.current) return;
    const st = stateRef.current;
    const ctx = canvasRef.current.getContext('2d');

    // animasi jatuh (game over)
    if (st.fallBlocks?.length) {
      st.fallBlocks.forEach((b) => { b.y += b.vy; b.vy += 0.55; });
      draw(ctx);
      const done = st.fallBlocks.every((b) => b.y > H + 40);
      if (done) {
        st.fallBlocks = null;
        runningRef.current = false;
        setRunning(false);
        setInfo('Game Over. Submitting...');
        submitScore(); // gunakan lastScoreRef
        return;
      }
      requestAnimationFrame(step);
      return;
    }

    // gerak current
    st.current.x += st.dir * st.speed;
    if (st.current.x <= 0) st.dir = 1;
    if (st.current.x + st.current.w >= W) st.dir = -1;

    draw(ctx);
    requestAnimationFrame(step);
  };

  function doDrop() {
    if (!runningRef.current) return;
    const s = stateRef.current;
    const last = s.stack[s.stack.length - 1];
    const cur = s.current;

    const left = Math.max(last.x, cur.x);
    const right = Math.min(last.x + last.w, cur.x + cur.w);
    const overlap = right - left;

    if (overlap <= 0) {
      // simpan skor terakhir SEBELUM kosongkan stack
      lastScoreRef.current = placedCountFromState();

      // semua blok jatuh (animasi)
      const all = [...s.stack, cur].map((b, i) => ({ ...b, vy: 4 + i * 0.15 }));
      s.fallBlocks = all;
      s.stack = [];
      s.current = null;
      setInfo('Miss! Blocks falling...');
      return;
    }

    // potong & tambahkan ke stack (1 balok = 1 skor)
    cur.x = left;
    cur.w = overlap;
    s.stack.push(cur);

    // update skor terakhir berhasil
    lastScoreRef.current = s.stack.length - 1;

    // siapkan balok berikut
    const ny = cur.y - cur.h;
    s.current = { x: 0, y: ny, w: cur.w, h: cur.h };
    s.speed *= 1.04;

    // scroll ke bawah jika terlalu atas
    if (ny <= THRESHOLD_TOP) {
      const shift = TARGET_Y - ny;
      s.stack.forEach(b => { b.y += shift; });
      s.current.y += shift;
      setInfo('Nice! Tower keeps growing…');
    }
  }

  async function submitScore() {
    // gunakan skor terakhir yang disimpan saat game over
    const submittedScore = lastScoreRef.current;

    setSubmitState('submitting');
    setSubmitMsg(`Submitting score (${submittedScore}) to Monad testnet...`);
    setLastTx('');

    try {
      const sess = stateRef.current.session || (await api.startSession(address));
      stateRef.current.session = sess;
      const body = {
        sessionId: sess.sessionId,
        token: sess.token,
        wallet: address,
        scoreDelta: submittedScore,
        txDelta: 1
      };
      const res = await api.submitScore(body);
      if (res?.txHash) {
        setSubmitState('ok');
        setLastTx(res.txHash);
        setSubmitMsg(`Submitted on-chain successfully (score ${submittedScore}).`);
        setInfo('Submitted on-chain ✔');
      } else {
        setSubmitState('ok');
        setSubmitMsg(`Submitted (no tx hash returned, score ${submittedScore}).`);
        setInfo('Submitted.');
      }

      // History lokal pakai skor yang sama persis
      const item = { t: Date.now(), score: submittedScore, tx: res?.txHash || '' };
      const hist = JSON.parse(localStorage.getItem('hist') || '[]');
      hist.unshift(item);
      localStorage.setItem('hist', JSON.stringify(hist.slice(0, 50)));
    } catch (e) {
      setSubmitState('err');
      setSubmitMsg('Submit failed: ' + (e?.message || 'Unknown error'));
      setInfo('Submit failed');
    }
  }

  // init & controls
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    reset();
    draw(ctx);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!runningRef.current && canPlay) {
          startSession().then(() => {
            runningRef.current = true;
            setRunning(true);
            requestAnimationFrame(step);
          });
        } else { doDrop(); }
      }
    };
    const onClickCanvas = () => {
      if (!runningRef.current && canPlay) {
        startSession().then(() => {
          runningRef.current = true;
          setRunning(true);
          requestAnimationFrame(step);
        });
      } else { doDrop(); }
    };

    window.addEventListener('keydown', onKey);
    const c = canvasRef.current;
    c.addEventListener('click', onClickCanvas);
    return () => {
      window.removeEventListener('keydown', onKey);
      c.removeEventListener('click', onClickCanvas);
    };
  }, [canPlay]);

  return (
    <div className="game-wrap">
      <div className="canvas-shell">
        <canvas ref={canvasRef} width={W} height={H} className="game" />
      </div>

      <div className="controls">
        <div className="info">
          {canPlay ? 'Tap / Click / Space to drop' : 'Login to play'} {/* ← bersih */}
        </div>
        <div className="row">
          <button
            className="btn"
            disabled={!canPlay || running}
            onClick={async () => {
              if (!canPlay) return;
              await startSession();
              runningRef.current = true;
              setRunning(true);
              requestAnimationFrame(step);
            }}
          >Start</button>
          <button
            className="btn"
            onClick={() => {
              runningRef.current = false;
              setRunning(false);
              reset();
            }}
          >Reset</button>
          <button className="btn" onClick={doDrop} disabled={!running}>Drop</button>
        </div>

        <div className="inline-guide" style={{marginTop:12}}>
          <b>How to Play</b><br/>
          • Each placed block = 1 score (the base block doesn’t count).<br/>
          • The tower can grow continuously; when it reaches the top, the scene scrolls and you keep playing.<br/>
          • When there’s no overlap, all blocks fall and the run submits on-chain (exact score is submitted & shown in History).
        </div>

        <div
          className={
            'status-box ' +
            (submitState === 'submitting' ? 'sub' : submitState === 'ok' ? 'ok' : submitState === 'err' ? 'err' : '')
          }
          style={{marginTop:12}}
        >
          <div className="status-title">Submit Status</div>
          <div className="status-msg">{submitMsg || '—'}</div>
          {lastTx ? (
            <a
              className="status-link"
              href={`https://testnet.monadexplorer.com/tx/${lastTx}`}
              target="_blank"
              rel="noreferrer"
            >
              View on explorer: {lastTx.slice(0, 10)}…
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
