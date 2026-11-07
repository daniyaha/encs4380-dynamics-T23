// main.js: connects the controls to the plotting functions of the other members.
(function () {
  const kSlider   = document.getElementById('kSlider');
  const tauSlider = document.getElementById('tauSlider');
  const kValue    = document.getElementById('kValue');
  const tauValue  = document.getElementById('tauValue');
  const stepSection = document.getElementById('stepSection');
  const rampSection = document.getElementById('rampSection');

  // 801 points from 0 to max(10 s, 8*tau)
  function makeTime(tau) {
      const N = 801, tEnd = Math.max(10, 8 * tau);
    return Array.from({ length: N }, (_, i) => (i * tEnd) / (N - 1));
  }

  // Call a teammate's function only if her file is already loaded
  function call(name, ...args) {
    if (typeof window[name] === 'function') window[name](...args);
  }

  function refresh() {
    const K   = parseFloat(kSlider.value);
    const tau = parseFloat(tauSlider.value);
    const mode = document.querySelector('input[name="inputType"]:checked').value;
    const t = makeTime(tau);

    kValue.textContent   = K.toFixed(1);
    tauValue.textContent = tau.toFixed(1) + ' s';

    // Show only the part that belongs to the chosen input
    stepSection.hidden = (mode !== 'step');
    rampSection.hidden = (mode !== 'ramp');

    if (mode === 'step') {
      call('updateStep', K, tau, t);
      call('updateError', K, tau, t);
    } else {
      call('updateRamp', K, tau, t);
    }
  }

  kSlider.addEventListener('input', refresh);
  tauSlider.addEventListener('input', refresh);
  document.querySelectorAll('input[name="inputType"]')
    .forEach(r => r.addEventListener('change', refresh));

  window.addEventListener('resize', () => {
    ['stepPlot', 'rampPlot', 'errorPlot', 'logErrorPlot'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.offsetParent && window.Plotly && el.data) Plotly.Plots.resize(el);
    });
  });

  call('initPrediction');   // once, at page load
  refresh();
})();
