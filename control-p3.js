// control-p3.js — P3 Digital PID (Shatha)
// u[k] = Kp*e[k] + Ki*Ts*sum(e[0..k]) + Kd*(e[k]-e[k-1])/Ts, computed once every Ts.
// u is held constant between samples (zero-order hold); the plant K/(tau*s+1) is stepped with Euler.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ids = ['K', 'tau', 'kp', 'ki', 'kd', 'Ts', 'uMax'];
  const SP = 1, U_MIN = 0, T_END = 10;
  let antiWindup = true;
  const read = () => ({ ...Object.fromEntries(ids.map(id => [id, +$(id).value])), antiWindup });

  // ---- Simulation: digital controller every Ts, Euler plant with step h <= 1 ms ----
  function simulate(p) {
    const n = Math.ceil(p.Ts / 0.001), h = p.Ts / n, N = Math.round(T_END / p.Ts);
    let y = 0, sum = 0, prevE = 0;
    const ys = [], us = [];
    for (let k = 0; k <= N; k++) {
      const e = SP - y;
      if (k === 0) prevE = e;                       // no e[-1]: avoids a derivative kick
      const d = (e - prevE) / p.Ts;
      let newSum = sum + e;
      let raw = p.kp * e + p.ki * p.Ts * newSum + p.kd * d;
      // Anti-windup: while saturated and e pushes further out, stop adding to the sum.
      if (p.antiWindup && ((raw > p.uMax && e > 0) || (raw < U_MIN && e < 0))) {
        newSum = sum;
        raw = p.kp * e + p.ki * p.Ts * newSum + p.kd * d;
      }
      sum = newSum; prevE = e;
      const u = Math.min(p.uMax, Math.max(U_MIN, raw));
      us.push({ t: k * p.Ts, v: u });
      for (let i = 0; i < n; i++) {                 // u held for one Ts
        ys.push({ t: (k * n + i) * h, v: y });
        y += h * (p.K * u - y) / p.tau;
      }
    }
    // Metrics: overshoot, and settling into +/-2% of the setpoint (null = never settles).
    const overshoot = Math.max(0, (Math.max(...ys.map(s => s.v)) - SP) * 100);
    let last = -1;
    ys.forEach((s, i) => { if (Math.abs(s.v - SP) > 0.02) last = i; });
    const settling = last === ys.length - 1 ? null : last < 0 ? 0 : ys[last + 1].t;
    return { ys, us, overshoot, settling };
  }

  // ---- SVG line plot. step:true draws a sample-and-hold staircase ----
  function plot(id, series, yMax, tEnd) {
    const W = 800, H = 260, L = 50, B = 30, x = t => L + (W - L - 30) * t / tEnd;
    const y = v => 10 + (H - B - 10) * (1 - Math.min(Math.max(v / yMax, -0.05), 1.05));
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    for (let i = 0; i <= 5; i++) svg += `<text x="${x(i * tEnd / 5)}" y="${H - 8}" font-size="13" fill="#91829c" text-anchor="middle">${(i * tEnd / 5).toFixed(1)} s</text>`;
    for (const f of [0, 0.5, 1]) svg += `<line x1="${L}" x2="${W - 10}" y1="${y(f * yMax)}" y2="${y(f * yMax)}" stroke="#f0eaf4"/><text x="${L - 6}" y="${y(f * yMax) + 4}" font-size="13" fill="#91829c" text-anchor="end">${(f * yMax).toFixed(1)}</text>`;
    for (const s of series) {
      let pts = s.data;                             // points past tEnd are clipped by the SVG
      if (s.step) pts = pts.flatMap((p, i) => [p, { t: i + 1 < pts.length ? pts[i + 1].t : T_END, v: p.v }]);
      else if (pts.length > 1000) pts = pts.filter((_, i) => i % 10 === 0);   // thin long traces only
      svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dash ? 'stroke-dasharray="8 6"' : ''} points="${pts.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>`;
    }
    $(id).innerHTML = svg + '</svg>';
  }
  const line = v => [{ t: 0, v }, { t: T_END, v }];
  const fmt = r => `${r.overshoot.toFixed(1)}% overshoot, ${r.settling === null ? 'never settles' : 'settles in ' + r.settling.toFixed(2) + ' s'}`;

  // ---- Arduino code: the same steps, in the same order, as simulate() ----
  function arduinoCode(p) {
    const f = v => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toPrecision(6)));
    return `// P3 Digital PID - plant G(s) = ${f(p.K)} / (${f(p.tau)} s + 1)
const float Kp = ${f(p.kp)}, Ki = ${f(p.ki)}, Kd = ${f(p.kd)};
const unsigned long TS_US = ${Math.round(p.Ts * 1e6)}UL;   // sampling time (us)
const float Ts = TS_US / 1000000.0;           // sampling time (s)
const float U_MIN = ${f(U_MIN)}, U_MAX = ${f(p.uMax)};
const bool ANTI_WINDUP = ${p.antiWindup};
const float setpoint = ${f(SP)};

float errorSum = 0, prevError = 0;
bool firstSample = true;
unsigned long lastSample;

float readSensor() { return analogRead(A0) * (5.0 / 1023.0); }  // TODO: scale to your units

void setup() {
  pinMode(9, OUTPUT);
  lastSample = micros() - TS_US;              // first sample runs immediately
}

void loop() {
  if (micros() - lastSample < TS_US) return;  // run once every Ts
  lastSample += TS_US;

  float e = setpoint - readSensor();
  if (firstSample) { prevError = e; firstSample = false; }
  float d = (e - prevError) / Ts;
  float newSum = errorSum + e;
  float uRaw = Kp * e + Ki * Ts * newSum + Kd * d;
  if (ANTI_WINDUP && ((uRaw > U_MAX && e > 0) || (uRaw < U_MIN && e < 0))) {
    newSum = errorSum;                        // anti-windup: stop integrating
    uRaw = Kp * e + Ki * Ts * newSum + Kd * d;
  }
  errorSum = newSum;
  prevError = e;

  float u = constrain(uRaw, U_MIN, U_MAX);
  analogWrite(9, (int)((u - U_MIN) / (U_MAX - U_MIN) * 255 + 0.5));  // hold u until next sample
}
`;
  }

  // ---- Redraw everything ----
  function redraw() {
    const p = read();
    ids.forEach(id => $(id + 'Out').textContent = id === 'Ts' ? (p.Ts * 1000).toFixed(0) + ' ms' : p[id]);
    const r = simulate(p);
    const view = Math.min(T_END, 40 * p.Ts);       // show the first 40 samples so the stairs are visible
    const top = Math.max(1.2, Math.min(3, Math.max(...r.ys.map(s => s.v)) * 1.05));
    plot('yPlot', [{ data: line(SP), color: '#e5a1b3', dash: true }, { data: r.ys, color: '#8261b4' }], top, view);
    plot('uPlot', [{ data: line(p.uMax), color: '#e5a1b3', dash: true }, { data: r.us, color: '#8261b4', step: true }], p.uMax * 1.1, view);
    $('metrics').textContent = `Ts = ${(p.Ts * 1000).toFixed(0)} ms: ${fmt(r)}`;
    // Performance as Ts grows: same gains, several sampling times.
    $('sweep').innerHTML = [0.01, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4].map(Ts => {
      const s = simulate({ ...p, Ts });
      return `<tr><td>${Ts * 1000} ms</td><td>${s.overshoot.toFixed(1)}%</td><td>${s.settling === null ? 'never (oscillates)' : s.settling.toFixed(2) + ' s'}</td></tr>`;
    }).join('');
    $('code').textContent = arduinoCode(p);
    $('result').textContent = '';
  }

  ids.forEach(id => $(id).addEventListener('input', redraw));
  document.querySelectorAll('[data-aw]').forEach(b => b.addEventListener('click', () => {
    antiWindup = b.dataset.aw === 'on';
    document.querySelectorAll('[data-aw]').forEach(x => x.classList.toggle('active', x === b));
    redraw();
  }));
  $('copy').addEventListener('click', () => navigator.clipboard.writeText($('code').textContent)
    .then(() => { $('copy').textContent = 'Copied ✓'; setTimeout(() => $('copy').textContent = 'Copy code', 1500); })
    .catch(() => { $('copy').textContent = 'Copy failed: select the code manually'; }));
  $('check').addEventListener('click', () => {
    const p = read(), a = simulate(p), b = simulate({ ...p, Ts: 3 * p.Ts });
    const actual = Math.abs(b.overshoot - a.overshoot) < 0.5 ? 'same' : b.overshoot > a.overshoot ? 'increase' : 'decrease';
    $('result').textContent = (actual === $('prediction').value ? '✓ Correct. ' : '✗ Not quite. ')
      + `Ts: ${fmt(a)}. 3×Ts: ${fmt(b)}. A larger Ts means the controller reacts later.`;
  });

  window.P3 = { simulate, arduinoCode };   // reused by the "My System" page
  redraw();
})();