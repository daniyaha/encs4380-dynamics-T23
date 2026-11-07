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
  const tEnd     = times[times.length - 1];
  const yEnd     = y[y.length - 1];

  // Quantities read from the plotted curve at the end time
  const measuredLag = tEnd - yEnd / K;   // how many seconds y trails the input
  const rows = [
    { label: 'Time lag (s)',       expected: tau,     calculated: measuredLag },
    { label: 'Steady-state error', expected: K * tau, calculated: finalErr }
  ].map(r => {
    const passed = Math.abs(r.calculated - r.expected) <= 0.01 * Math.abs(r.expected);
    return `<tr>
      <th scope="row">${r.label}</th>
      <td>${r.expected.toFixed(4)}</td>
      <td>${r.calculated.toFixed(4)}</td>
      <td><span class="status-pill ${passed ? 'pass' : 'fail'}">${passed ? 'PASS' : 'FAIL'}</span></td>
    </tr>`;
  }).join('');

  info.innerHTML = `
    <h3>Ramp results</h3>
    <div class="results">
      <table>
        <thead>
          <tr>
            <th scope="col">Quantity</th>
            <th scope="col">Expected (theory)</th>
            <th scope="col">Calculated from curve (t = ${tEnd.toFixed(1)} s)</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p><b>How to read the plot:</b> the output y(t) starts slowly, then after about 5τ it settles onto the dashed line K(t − τ).</p>
    <p><b>Time lag:</b> on that dashed line the output equals K·t, but τ = ${tau.toFixed(2)} s later, so the sensor always shows the input as it was τ seconds ago.</p>
    <p><b>Steady-state error:</b> the output stays below K·x(t) by a constant
       Kτ = ${(K * tau).toFixed(3)}, where e(t) = K·x(t) − y(t). If K ≠ 1, measure the error against K·x(t), not x(t).</p>`;
}