import { useEffect, useRef, useState } from 'react';
import { startSession, submitScore } from '../lib/api';

/**
 * Props:
 *  - wallet: string (required)
 *  - username: string|null
 *  - onSubmitOk?: (res) => void
 */
export default function StackerGame({ wallet, username, onSubmitOk }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // session token untuk submit skor
  const sessRef = useRef({ sessionId: null, token: null });

  // running flag via ref supaya loop dalam effect bisa baca live value
  const runningRef = useRef(false);

  // skor di state + ref agar sinkron dengan canvas draw
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const setScoreSafe = (fnOrVal) => {
    setScore((prev) => {
      const next = typeof fnOrVal === 'function' ? fnOrVal(prev) : fnOrVal;
      scoreRef.current = next;
      return next;
    });
  };

  // pesan submit untuk UI
  const [submitMsg, setSubmitMsg] = useState('Ready');

  // world
  const worldRef = useRef(null);

  // Start session di server saat wallet siap
  useEffect(() => {
    let mounted = true;
    async function boot() {
      if (!wallet) return;
      try {
        const s = await startSession(wallet);
        if (!mounted) return;
        sessRef.current = { sessionId: s.sessionId, token: s.token };
        setSubmitMsg('Ready');
      } catch (e) {
        console.error(e);
        setSubmitMsg('Session failed to start');
      }
    }
    boot();
    return () => { mounted = false; };
  }, [wallet]);

  // Setup canvas, world, dan main loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    const DPR = Math.min(2, window.devicePixelRatio || 1);

    const W = 360;
    const H = 540;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(DPR, DPR);

    function resetWorld() {
      const baseWidth = 160;
      const blockHeight = 28;
      const baseX = (W - baseWidth) / 2;
      const baseY = H - blockHeight - 32;

      worldRef.current = {
        W, H, blockHeight,
        stack: [{ x: baseX, y: baseY, w: baseWidth }], // blok dasar
        moving: spawnMoving(0, W, blockHeight, baseX, baseY, baseWidth),
        speed: 2.2,
        placed: 0,
        falling: false
      };
      setScoreSafe(0);
    }

    function spawnMoving(placed, W, blockH, baseX, baseY, baseW) {
      const fromLeft = placed % 2 === 0; // bergantian kiri/kanan
      const w = Math.max(60, Math.floor(baseW * 0.9));
      const y = baseY - blockH * (placed + 1) - 6; // jarak kecil
      const margin = 18;
      const startX = fromLeft ? -w - margin : W + margin;
      const dir = fromLeft ? +1 : -1;
      return { x: startX, y, w, dir };
    }

    function drawBlock(ctx, x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, 4);
      ctx.globalAlpha = 1;
    }

    function draw() {
      const world = worldRef.current;
      const { W, H, blockHeight, stack, moving, falling } = world;

      // background
      ctx.fillStyle = '#0a0f14';
      ctx.fillRect(0, 0, W, H);

      // subtle grid
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = '#2a3b4a';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 24) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 24) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // stack
      for (let i = 0; i < stack.length; i++) {
        const b = stack[i];
        drawBlock(ctx, b.x, b.y, b.w, blockHeight, i === stack.length - 1 ? '#4cc9f0' : '#2dd4bf');
      }

      // moving
      if (!falling && moving) {
        drawBlock(ctx, moving.x, moving.y, moving.w, blockHeight, '#e879f9');
      }

      // HUD score
      ctx.fillStyle = '#d1e9ff';
      ctx.font = '600 16px Inter, ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`Score ${scoreRef.current}`, 12, 24);

      // watermark
      ctx.textAlign = 'right';
      ctx.globalAlpha = 0.8;
      ctx.fillText('@MaxisCrypto', W - 12, H - 12);
      ctx.globalAlpha = 1;
    }

    function update() {
      const world = worldRef.current;

      if (!world.falling && runningRef.current) {
        // gerakkan blok dan PANTUL di tepi
        const { moving, W } = world;
        moving.x += world.speed * moving.dir;

        if (moving.x <= 0) {
          moving.x = 0; moving.dir = +1;
        } else if (moving.x + moving.w >= W) {
          moving.x = W - moving.w; moving.dir = -1;
        }
      } else if (world.falling) {
        // animasi jatuh
        for (let i = 0; i < world.stack.length; i++) {
          world.stack[i].y += 10 + i * 0.6;
        }
      }
    }

    function loop() {
      update();
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    resetWorld();
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Input: pointer/touch/space untuk drop
  useEffect(() => {
    function handleDown(e) {
      e.preventDefault();
      if (!runningRef.current) return;
      dropNow();
    }
    function handleKey(e) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!runningRef.current) return;
        dropNow();
      }
    }
    window.addEventListener('pointerdown', handleDown, { passive: false });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handleDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  function dropNow() {
    const world = worldRef.current;
    if (world.falling) return;

    const prev = world.stack[world.stack.length - 1];
    const cur = world.moving;

    // hitung overlap
    const left = Math.max(prev.x, cur.x);
    const right = Math.min(prev.x + prev.w, cur.x + cur.w);
    const overlap = Math.max(0, right - left);

    if (overlap <= 0) {
      // miss → semua jatuh, akhiri run
      world.falling = true;
      runningRef.current = false;
      endAndSubmit();
      // restart lembut
      setTimeout(() => softRestart(), 950);
      return;
    }

    // success → potong blok ke bagian overlap
    const newBlock = { x: left, y: cur.y, w: overlap };
    world.stack.push(newBlock);

    // +1 poin tiap blok sukses
    setScoreSafe((s) => s + 1);

    // siapkan blok berikutnya, bergantian sisi
    const placed = world.stack.length - 1;
    const nextFromLeft = placed % 2 === 0;
    const w = Math.max(50, Math.floor(newBlock.w * 0.95));
    const y = newBlock.y - world.blockHeight - 6;
    const margin = 18;
    world.moving = {
      x: nextFromLeft ? -w - margin : world.W + margin,
      y,
      w,
      dir: nextFromLeft ? +1 : -1
    };

    // naikkan kecepatan perlahan
    world.speed = Math.min(world.speed + 0.05, 5);
  }

  function softRestart() {
    const canvas = canvasRef.current;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.width / DPR;
    const H = canvas.height / DPR;

    const baseWidth = 160;
    const blockHeight = 28;
    const baseX = (W - baseWidth) / 2;
    const baseY = H - blockHeight - 32;

    worldRef.current = {
      W, H, blockHeight,
      stack: [{ x: baseX, y: baseY, w: baseWidth }],
      moving: { x: -120, y: baseY - blockHeight - 6, w: 140, dir: +1 },
      speed: 2.2,
      placed: 0,
      falling: false
    };
    setScoreSafe(0);
    runningRef.current = true;
  }

  async function endAndSubmit() {
    const { sessionId, token } = sessRef.current;
    if (!wallet || !sessionId || !token) {
      setSubmitMsg('No session yet, skipping submit');
      return;
    }
    try {
      const res = await submitScore({
        sessionId,
        token,
        wallet,
        scoreDelta: Math.max(0, scoreRef.current),
        username: username || undefined
      });
      setSubmitMsg(`Submitted on-chain successfully (score ${scoreRef.current}).`);
      onSubmitOk?.(res);
      // siapkan session berikutnya
      const s = await startSession(wallet);
      sessRef.current = { sessionId: s.sessionId, token: s.token };
    } catch (e) {
      console.error(e);
      setSubmitMsg(`Submit failed: ${e.message}`);
    }
  }

  function handleStart() {
    runningRef.current = true;
    setSubmitMsg('Ready');
  }

  function handleReset() {
    runningRef.current = false;
    // restart lembut tapi tidak langsung start
    setSubmitMsg('Ready');
    setTimeout(() => {
      softRestart();
      runningRef.current = false;
    }, 50);
  }

  return (
    <div className="game-wrap">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="controls">
        <button className="btn primary" onClick={handleStart}>Start</button>
        <button className="btn" onClick={handleReset}>Reset</button>
      </div>
      <div className="status">
        <div>Score: <b>{score}</b></div>
        <div className="muted">{submitMsg}</div>
        <div className="help">Tap or press Space to drop. Every clean landing gives one point.</div>
      </div>
    </div>
  );
}
