// ramp.js — Unit ramp response of a first-order system
// x(t) = t,  y(t) = K [ t - tau (1 - e^{-t/tau}) ]

function rampLinspace(a, b, n) {
  const step = (b - a) / (n - 1);
  return Array.from({ length: n }, (_, i) => a + i * step);
}

function rampOutput(K, tau, t) {
  return K * (t - tau * (1 - Math.exp(-t / tau)));
}

function updateRamp(K, tau, t) {
  // t can be an array of times, or just the end time
  const times = Array.isArray(t) ? t : rampLinspace(0, Math.max(t, 5 * tau), 400);

  const x    = times.map(ti => ti);                        // input x(t) = t
  const ref  = times.map(ti => K * ti);                    // reference K x(t)
  const y    = times.map(ti => rampOutput(K, tau, ti));    // output y(t)
  const lag  = times.map(ti => K * (ti - tau));            // asymptote K(t - tau)
  const err  = times.map((ti, i) => ref[i] - y[i]);        // error = Kx(t) - y(t)

  const traces = [
    { x: times, y: x,   name: 'x(t) = t (input)', line: { dash: 'dot', color: '#888' } },
    { x: times, y: ref, name: 'Kx(t) (reference)', line: { color: '#2a9d8f' } },
    { x: times, y: y,   name: 'y(t) (output)',     line: { color: '#e63946', width: 3 } },
    { x: times, y: lag, name: 'K(t − τ) (asymptote)', line: { dash: 'dash', color: '#f4a261' } }
  ];

  const layout = {
    title: 'Ramp response',
    xaxis: { title: 'Time t (s)' },
    yaxis: { title: 'Amplitude' },
    legend: { orientation: 'h' },
    margin: { t: 40, l: 50, r: 10 }
  };

  Plotly.react('rampPlot', traces, layout, { responsive: true });

  // explanation block under the plot
  let info = document.getElementById('rampInfo');
  if (!info) {
    info = document.createElement('div');
    info.id = 'rampInfo';
    document.getElementById('rampPlot').insertAdjacentElement('afterend', info);
  }
  const finalErr = err[err.length - 1];
  info.innerHTML = `
    <p><b>Error definition:</b> e(t) = Kx(t) − y(t) (reference minus output, not x(t) − y(t)).</p>
    <p><b>Time lag:</b> after the transient (t ≳ 3τ), y(t) ≈ K(t − τ), so the output is
       delayed by <b>τ = ${tau.toFixed(2)} s</b>.</p>
    <p><b>Steady-state error:</b> Kτ = <b>${(K * tau).toFixed(3)}</b>
       (error at t = ${times[times.length - 1].toFixed(1)} s: ${finalErr.toFixed(3)}).</p>
    <p><i>Note:</i> if K ≠ 1, the difference between x(t) and y(t) is not the error;
       the error is measured against Kx(t).</p>`;
}