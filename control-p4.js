// control-p4.js — P4 Tuning Challenge (Dania)
// A hidden random first-order plant K/(tau*s+1), like Module 4 in Homework 1.
// The loop is stepped with Euler. Derivative acts on the measurement (no setpoint kick),
// and the integral stops growing while the actuator is saturated (anti-windup).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  const SP = 1, LIMIT = 10, T_END = 15, DT = 0.005, D_FILTER = 0.05;
  const OS_MAX = 10, ERR_MAX = 0.5;          // % ; the settling limit depends on the plant
  const POINTS = { os: 30, ts: 30, err: 40 };

  let plant, spec, round_n = 0, bestScore = 0, revealed = false, showOpenLoop = false;

  function newPlant() {
    plant = { K: round(rand(0.5, 3), 1), tau: round(rand(0.3, 2), 2) };
    // Achievable with a PI controller for every plant in this range, but not with P alone.
    spec = { os: OS_MAX, ts: round(1.5 * plant.tau + 0.6, 1), err: ERR_MAX };
    round_n += 1; bestScore = 0; revealed = false; showOpenLoop = false;
    $('kp').value = 1; $('ki').value = 0; $('kd').value = 0;
    $('plantInfo').textContent = 'Plant hidden. Tip: the open-loop test applies u = 1; the final value is K and the 63% time is τ.';
    $('specOs').textContent = `≤ ${spec.os}%`;
    $('specTs').textContent = `≤ ${spec.ts} s`;
    $('specErr').textContent = `≤ ${spec.err}% (zero, within measurement)`;
    $('roundChip').textContent = 'Round ' + round_n;
    redraw();
  }

  // ---- Closed-loop simulation (Euler) ----
  function simulate(p, pl) {
    let y = 0, integral = 0, prevY = 0, rate = 0, peak = -Infinity, lastOut = -1;
    const N = Math.ceil(T_END / DT), dec = Math.floor(N / 400), samples = [];
    for (let i = 0; i <= N; i++) {
      const t = i * DT, e = SP - y;
      rate += DT / (D_FILTER + DT) * ((i === 0 ? 0 : (y - prevY) / DT) - rate);   // filtered dy/dt
      const d = -rate;
      let raw = p.kp * e + p.ki * integral + p.kd * d;
      if (i < N && p.ki > 0) {
        const trial = integral + e * DT, prop = p.kp * e + p.ki * trial + p.kd * d;
        if (!((prop > LIMIT && e > 0) || (prop < -LIMIT && e < 0))) integral = trial;   // anti-windup
        raw = p.kp * e + p.ki * integral + p.kd * d;
      }
      const u = Math.max(-LIMIT, Math.min(LIMIT, raw));
      if (i % dec === 0 || i === N) samples.push({ t, y, u });
      peak = Math.max(peak, y);
      if (Math.abs(y - SP) > 0.02 * SP) lastOut = i;
      if (i === N) break;
      prevY = y;
      y += DT * (pl.K * u - y) / pl.tau;
      if (!Number.isFinite(y) || Math.abs(y) > 1e6) return { unstable: true };
    }
    return {
      unstable: false, samples,
      os: Math.max(0, (peak - SP) / SP * 100),
      ts: lastOut === N ? null : (lastOut + 1) * DT,
      err: Math.abs(SP - samples[samples.length - 1].y) / SP * 100
    };
  }

  function openLoop() {   // u = 1 applied to the plant alone, shown for 6*tau
    const tEnd = 6 * plant.tau, n = 300, out = [];
    for (let i = 0; i <= n; i++) { const t = tEnd * i / n; out.push({ t, y: plant.K * (1 - Math.exp(-t / plant.tau)) }); }
    return out;
  }

  const grade = r => r.unstable ? { os: false, ts: false, err: false, score: 0 } : (() => {
    const g = { os: r.os <= spec.os, ts: r.ts !== null && r.ts <= spec.ts, err: r.err <= spec.err };
    g.score = (g.os ? POINTS.os : 0) + (g.ts ? POINTS.ts : 0) + (g.err ? POINTS.err : 0);
    return g;
  })();

  // ---- SVG plot ----
  function plot(id, data, key, lines, tEnd, ymin, ymax, vline) {
    const W = 800, H = 260, L = 50, B = 30, R = 20, T = 10;
    const x = t => L + (W - L - R) * t / tEnd;
    const y = v => T + (H - T - B) * (ymax - v) / (ymax - ymin);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    for (let i = 0; i <= 5; i++) s += `<text x="${x(tEnd * i / 5)}" y="${H - 8}" font-size="13" fill="#91829c" text-anchor="middle">${(tEnd * i / 5).toFixed(1)} s</text>`;
    for (let i = 0; i <= 4; i++) { const v = ymin + (ymax - ymin) * i / 4; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#f0eaf4"/><text x="${L - 6}" y="${y(v) + 4}" font-size="13" fill="#91829c" text-anchor="end">${v.toFixed(1)}</text>`; }
    for (const l of lines) s += `<line x1="${L}" x2="${W - R}" y1="${y(l.v)}" y2="${y(l.v)}" stroke="#e5a1b3" stroke-width="2" stroke-dasharray="${l.dot ? '2 5' : '9 7'}"/>`;
    if (vline !== null && vline <= tEnd) s += `<line x1="${x(vline)}" x2="${x(vline)}" y1="${T}" y2="${H - B}" stroke="#e5a1b3" stroke-width="2" stroke-dasharray="2 5"/>`;
    s += `<polyline fill="none" stroke="#8261b4" stroke-width="3" stroke-linejoin="round" points="${data.map(d => `${x(d.t).toFixed(1)},${y(Math.max(ymin, Math.min(ymax, d[key]))).toFixed(1)}`).join(' ')}"/>`;
    $(id).innerHTML = s + '</svg>';
  }

  const badge = (id, ok) => { $(id).textContent = ok ? '✓' : '✕'; $(id).className = ok ? 'pass' : 'fail'; };
  const read = () => ({ kp: +$('kp').value, ki: +$('ki').value, kd: +$('kd').value });

  function redraw() {
    const p = read();
    $('kpOut').textContent = p.kp.toFixed(1); $('kiOut').textContent = p.ki.toFixed(1); $('kdOut').textContent = p.kd.toFixed(1);
    $('predictionResult').textContent = '';
    if (showOpenLoop) {
      const d = openLoop(), top = Math.max(...d.map(s => s.y)) * 1.15;
      $('plotTitle').textContent = 'Open-loop test (u = 1, no controller)';
      plot('yPlot', d, 'y', [], d[d.length - 1].t, 0, top, null);
      $('uPlot').textContent = 'Open loop: the input is constant u = 1.';
      return;
    }
    $('plotTitle').textContent = 'Closed-loop response';
    const r = simulate(p, plant);
    if (r.unstable) {
      ['yPlot', 'uPlot'].forEach(id => $(id).textContent = 'The loop is unstable. Lower the gains.');
      ['mOs', 'mTs', 'mErr'].forEach(id => $(id).textContent = 'Unstable'); $('mScore').textContent = '0 / 100';
      ['badgeOs', 'badgeTs', 'badgeErr'].forEach(id => badge(id, false)); return;
    }
    const g = grade(r);
    bestScore = Math.max(bestScore, g.score);
    const top = Math.max(1.4, Math.min(3, Math.max(...r.samples.map(s => s.y)) * 1.1));
    plot('yPlot', r.samples, 'y', [{ v: SP }, { v: SP * (1 + spec.os / 100), dot: true }], T_END, 0, top, spec.ts);
    plot('uPlot', r.samples, 'u', [{ v: LIMIT }, { v: -LIMIT }], T_END, -LIMIT * 1.1, LIMIT * 1.1, null);
    $('mOs').textContent = r.os.toFixed(1) + '%'; $('mTs').textContent = r.ts === null ? 'Never settles' : r.ts.toFixed(2) + ' s'; $('mErr').textContent = r.err.toFixed(2) + '%';
    $('vOs').textContent = g.os ? 'passes' : 'fails'; $('vTs').textContent = g.ts ? 'passes' : 'fails'; $('vErr').textContent = g.err ? 'passes' : 'fails';
    $('mScore').textContent = g.score + ' / 100';
    $('vScore').textContent = g.score === 100 ? 'All three parts pass!' : 'Best this round: ' + bestScore;
    badge('badgeOs', g.os); badge('badgeTs', g.ts); badge('badgeErr', g.err);
    $('sessionNote').textContent = revealed ? 'Plant was revealed in this round.' : '';
  }

  ['kp', 'ki', 'kd'].forEach(id => $(id).addEventListener('input', () => { showOpenLoop = false; redraw(); }));
  $('openLoop').addEventListener('click', () => { showOpenLoop = !showOpenLoop; $('openLoop').textContent = showOpenLoop ? 'Back to closed loop' : 'Test plant (open loop)'; redraw(); });
  $('reveal').addEventListener('click', () => { revealed = true; $('plantInfo').textContent = `Plant: K = ${plant.K}, τ = ${plant.tau} s. Theory: P only leaves ${(100 / (1 + plant.K * read().kp)).toFixed(1)}% error at your Kp.`; redraw(); });
  $('newPlant').addEventListener('click', () => { $('openLoop').textContent = 'Test plant (open loop)'; newPlant(); });
  $('check').addEventListener('click', () => {
    const p = read(), a = simulate(p, plant), b = simulate({ ...p, ki: p.ki + 2 }, plant);
    if (a.unstable || b.unstable) { $('predictionResult').textContent = 'One of the runs was unstable. Try smaller gains.'; return; }
    const actual = Math.abs(b.os - a.os) < 0.5 ? 'same' : b.os > a.os ? 'increase' : 'decrease';
    $('predictionResult').textContent = (actual === $('prediction').value ? '✓ Correct. ' : '✗ Not quite. ') +
      `Overshoot now: ${a.os.toFixed(1)}%. With Ki + 2: ${b.os.toFixed(1)}%. More integral action removes error faster but tends to overshoot more.`;
  });

  window.P4 = { simulate, grade };
  newPlant();
})();
