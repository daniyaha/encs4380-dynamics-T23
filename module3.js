// Module 3 page integration.
// Uses Partner 2's second-order functions and Partner 3's existing state-space model.
// No changes to either partner's calculation file are required.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const mass = $('massSlider');
  const damping = $('dampingSlider');
  const spring = $('springSlider');
  const timeSlider = $('timeSlider');
  const playButton = $('playButton');

  if (!window.Module3StateSpace ||
      typeof window.secondOrderStep !== 'function' ||
      typeof window.secondOrderPoles !== 'function') {
    console.error('Module 3 needs second-order.js and state-space.js to load first.');
    return;
  }

  let plotScale = null;
  let syncFrame = null;
  let currentEndTime = 10;
  let savedPrediction = null;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const format = (n, decimals = 3) => {
    if (!Number.isFinite(n)) return 'N/A';
    return (Math.abs(n) < 0.5 * 10 ** (-decimals) ? 0 : n).toFixed(decimals);
  };
  const set = (id, value) => { if ($(id)) $(id).textContent = value; };

  function svgNode(tag, attrs = {}, text) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      element.setAttribute(key, value);
    }
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function add(svg, tag, attrs, text) {
    const item = svgNode(tag, attrs, text);
    svg.appendChild(item);
    return item;
  }

  function getModel() {
    const m = Number(mass.value);
    const b = Number(damping.value);
    const k = Number(spring.value);
    return window.Module3StateSpace.calculateStateSpace(m, b, k);
  }

  function getPoles(model) {
    return window.secondOrderPoles(model.zeta, model.omegaN).map(p => ({
      re: Number(p.real),
      im: Number(p.imag)
    }));
  }

  function rootsMatch(a, b, tolerance = 1e-6) {
    if (!a || !b || a.length !== 2 || b.length !== 2) return false;
    const near = (x, y) => Math.abs(x.re - y.re) <= tolerance && Math.abs(x.im - y.im) <= tolerance;
    return (near(a[0], b[0]) && near(a[1], b[1])) ||
           (near(a[0], b[1]) && near(a[1], b[0]));
  }

  function poleLabel(p) {
    const re = format(p.re);
    if (Math.abs(p.im) < 1e-8) return re;
    return re + (p.im >= 0 ? ' + j' : ' − j') + format(Math.abs(p.im));
  }

  function getEndTime(model, poles) {
    const rates = poles.map(p => -p.re).filter(x => x > 1e-6);
    const decay = rates.length ? 5 / Math.min(...rates) : 0;
    return Math.min(30, Math.max(5, decay, 8 * Math.PI / model.omegaN));
  }

  function stepAt(model, t) {
    // The physical unit force has steady-state displacement x_final = 1/k.
    return window.secondOrderStep(t, model.zeta, model.omegaN, 1 / model.k, 1);
  }

  function svgGrid(svg, width, height, left, right, top, bottom, limits, xlabel, ylabel) {
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const X = x => left + (x - limits.minX) / (limits.maxX - limits.minX) * plotW;
    const Y = y => top + plotH - (y - limits.minY) / (limits.maxY - limits.minY) * plotH;

    for (let i = 0; i <= 5; i++) {
      const x = left + plotW * i / 5;
      const y = top + plotH * i / 5;
      add(svg, 'line', { x1: x, y1: top, x2: x, y2: height - bottom, stroke: '#eee9f3' });
      add(svg, 'line', { x1: left, y1: y, x2: width - right, y2: y, stroke: '#eee9f3' });
      add(svg, 'text', { x, y: height - 16, 'text-anchor': 'middle', fill: '#7e748d', 'font-size': 11 }, format(limits.minX + (limits.maxX - limits.minX) * i / 5, 2));
      add(svg, 'text', { x: left - 10, y: y + 4, 'text-anchor': 'end', fill: '#7e748d', 'font-size': 11 }, format(limits.maxY - (limits.maxY - limits.minY) * i / 5, 2));
    }
    add(svg, 'text', { x: width / 2, y: height - 1, 'text-anchor': 'middle', fill: '#716381', 'font-size': 12 }, xlabel);
    add(svg, 'text', { x: 12, y: top + 4, fill: '#716381', 'font-size': 11 }, ylabel);
    return { X, Y, plotW, plotH };
  }

  function plotStep(model, horizon) {
    const svg = $('stepResponsePlot');
    svg.replaceChildren();
    const width = 880, height = 320, left = 62, right = 24, top = 25, bottom = 43;
    const xs = [], samples = 650;
    for (let i = 0; i <= samples; i++) {
      const t = i * horizon / samples;
      xs.push({ t, x: stepAt(model, t) });
    }
    const finalX = 1 / model.k;
    const maxY = Math.max(finalX, ...xs.map(p => p.x));
    const minY = Math.min(0, ...xs.map(p => p.x));
    const pad = Math.max(.05 * finalX, (maxY - minY) * .11);
    const limits = { minX: 0, maxX: horizon, minY: minY - pad, maxY: maxY + pad };
    const { X, Y } = svgGrid(svg, width, height, left, right, top, bottom, limits, 'Time (s)', 'Displacement x (m)');

    // The ±2% settling band and the 100% final response reference.
    const bandTop = Y(1.02 * finalX), bandBottom = Y(.98 * finalX);
    add(svg, 'rect', { x: X(0), y: bandTop, width: X(horizon) - X(0), height: bandBottom - bandTop, fill: '#bfe1d0', opacity: .3 });
    for (const y of [.98, 1.02]) {
      add(svg, 'line', { x1: X(0), y1: Y(y * finalX), x2: X(horizon), y2: Y(y * finalX), stroke: '#83b7a1', 'stroke-width': 1, 'stroke-dasharray': '4 5' });
    }
    add(svg, 'line', { x1: X(0), y1: Y(finalX), x2: X(horizon), y2: Y(finalX), stroke: '#e09962', 'stroke-width': 2, 'stroke-dasharray': '7 5' });

    // Mark the 10% and 90% levels used for rise-time measurement.
    for (const [fraction, label] of [[.1, '10%'], [.9, '90%']]) {
      const y = Y(fraction * finalX);
      add(svg, 'line', { x1: X(0), y1: y, x2: X(horizon), y2: y, stroke: '#c4b2d5', 'stroke-dasharray': '2 6', opacity: .75 });
      add(svg, 'text', { x: X(horizon) - 4, y: y - 4, 'text-anchor': 'end', 'font-size': 10, fill: '#9480a4' }, label);
    }

    const d = xs.map((p, i) => `${i ? 'L' : 'M'} ${format(X(p.t), 2)} ${format(Y(p.x), 2)}`).join(' ');
    add(svg, 'path', { d, stroke: '#8968b4', 'stroke-width': 3.1, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });

    // If available, show the final crossing into the 2% settling band.
    if (model.zeta > 0) {
      try {
        const settling = window.secondOrderSettlingTime(model.zeta, model.omegaN);
        if (settling !== null && settling <= horizon) {
          add(svg, 'line', { x1: X(settling), y1: top, x2: X(settling), y2: height - bottom, stroke: '#69a590', 'stroke-width': 1.8, 'stroke-dasharray': '5 5' });
          add(svg, 'text', { x: Math.min(X(settling) + 6, width - right - 8), y: top + 12, 'text-anchor': 'start', 'font-size': 10, fill: '#4b9079' }, 'Settling');
        }
      } catch (error) { console.warn('Settling marker:', error); }
    }

    add(svg, 'circle', { id: 'stepTimeCursor', cx: X(0), cy: Y(0), r: 7, fill: '#55a38a', stroke: '#fff', 'stroke-width': 2.5 });
    plotScale = { X, Y, model };
  }

  function plotPoles(model, poles) {
    const svg = $('sPlanePlot');
    svg.replaceChildren();
    const eigen = model.eigenvalues;
    const width = 700, height = 320, left = 64, right = 28, top = 29, bottom = 45;
    const reals = [...poles, ...eigen].map(p => p.re);
    const ims = [...poles, ...eigen].map(p => Math.abs(p.im));
    const leftLimit = Math.min(-1.2, Math.min(...reals) * 1.2 - .25);
    const topIm = Math.max(1, Math.max(...ims) * 1.33 + .2);
    const limits = { minX: leftLimit, maxX: Math.max(1, -leftLimit * .13), minY: -topIm, maxY: topIm };
    const { X, Y } = svgGrid(svg, width, height, left, right, top, bottom, limits, 'Real (σ)', 'Imaginary (jω)');
    add(svg, 'line', { x1: X(0), y1: top, x2: X(0), y2: height - bottom, stroke: '#ac9bbf', 'stroke-width': 1.6 });
    add(svg, 'line', { x1: left, y1: Y(0), x2: width - right, y2: Y(0), stroke: '#ac9bbf', 'stroke-width': 1.6 });

    // Plot the two independent calculations at their actual positions.
    // Repeated roots are shown once so a critical-damping double pole stays readable.
    function distinctRoots(roots) {
      return roots.filter((p, i) => !roots.slice(0, i).some(q =>
        Math.abs(p.re - q.re) < 1e-8 && Math.abs(p.im - q.im) < 1e-8));
    }

    distinctRoots(eigen).forEach(p => {
      const x = X(p.re), y = Y(p.im);
      const ring = add(svg, 'circle', {
        cx: x, cy: y, r: 11, fill: 'none', stroke: '#8161b0', 'stroke-width': 2.5
      });
      add(ring, 'title', {}, `State-space eigenvalue: ${poleLabel(p)}`);
    });

    distinctRoots(poles).forEach(p => {
      const x = X(p.re), y = Y(p.im);
      add(svg, 'line', { x1: x - 6, y1: y - 6, x2: x + 6, y2: y + 6,
        stroke: '#e0935c', 'stroke-width': 3, 'stroke-linecap': 'round' });
      add(svg, 'line', { x1: x - 6, y1: y + 6, x2: x + 6, y2: y - 6,
        stroke: '#e0935c', 'stroke-width': 3, 'stroke-linecap': 'round' });
      add(svg, 'text', { x: x + 16, y: y - 13, fill: '#665572', 'font-size': 11 }, poleLabel(p));
    });
  }

  function updateMetrics(model) {
    const z = model.zeta, wn = model.omegaN;
    let rise = null, peak = null, settling = null;
    try {
      if (z === 0) {
        // y(t) = 1 - cos(wn*t) for a unit step without damping.
        // The first 10% and 90% crossing times still define rise time.
        const t10 = Math.acos(0.9) / wn;
        const t90 = Math.acos(0.1) / wn;
        rise = { t10, t90, riseTime: t90 - t10 };
      } else {
        rise = window.secondOrderRiseTime(z, wn);
      }
    } catch (e) { console.warn('Rise time:', e); }
    try { peak = window.secondOrderPeak(z, wn); } catch (e) { console.warn('Peak time:', e); }
    try { settling = window.secondOrderSettlingTime(z, wn); } catch (e) { console.warn('Settling time:', e); }
    set('riseTimeValue', rise && rise.riseTime !== null ? format(rise.riseTime, 2) + ' s' : 'N/A');
    set('peakTimeValue', peak ? format(peak.peakTime, 2) + ' s' : 'N/A');
    set('overshootValue', format(window.secondOrderOvershoot(z, wn), 2) + '%');
    set('settlingTimeValue', settling === null ? 'N/A' : format(settling, 2) + ' s');
  }

  function showValidations() {
    const tests = window.secondOrderValidation();
    for (const test of tests) {
      const n = test.name.endsWith('4') ? 4 : 5;
      set('val' + n + 'Actual', format(test.actual, 3) + '%');
      const el = $('val' + n + 'Status');
      el.textContent = test.passed ? 'PASS' : 'FAIL';
      el.className = 'check-status ' + (test.passed ? 'pass' : 'fail');
    }
    for (const id of ['statusZeta', 'statusOmega', 'statusEigen', 'statusPoles']) {
      const el = $(id);
      el.className = 'check-status ' + (el.textContent.trim() === 'PASS' ? 'pass' : 'fail');
    }
  }

  function currentTime() {
    // The state-space partner owns simulation time and updates #timeValue.
    return Math.max(0, Math.min(currentEndTime, parseFloat($('timeValue').textContent) || 0));
  }

  function updateStepCursor() {
    if (!plotScale) return;
    const t = currentTime();
    const dot = $('stepTimeCursor');
    if (dot) {
      dot.setAttribute('cx', plotScale.X(t));
      dot.setAttribute('cy', plotScale.Y(stepAt(plotScale.model, t)));
    }
  }

  function animateStepMarker() {
    syncFrame = null;
    updateStepCursor();
    if (playButton.textContent.toLowerCase().includes('pause')) {
      syncFrame = requestAnimationFrame(animateStepMarker);
    }
  }

  function updateAll() {
    const model = getModel();
    const poles = getPoles(model);
    currentEndTime = getEndTime(model, poles);

    // Partner 3's public API normalizes {real,imag} to {re,im} before comparing.
    window.Module3StateSpace.setPartnerPoles(window.secondOrderPoles(model.zeta, model.omegaN));
    const same = rootsMatch(model.eigenvalues, poles);
    const matchElement = $('poleMatchStatus');
    matchElement.textContent = same ? '✓ Eigenvalues match the poles' : '✕ Eigenvalues do not match the poles';
    matchElement.classList.toggle('mismatch', !same);

    set('poleOne', poleLabel(poles[0]));
    set('poleTwo', poleLabel(poles[1]));
    set('equilibriumReadout', format(1 / model.k) + ' m');

    const explanations = {
      'No damping': 'The response oscillates indefinitely because no damping removes energy.',
      'Underdamped': 'The response overshoots the final displacement and oscillates with decreasing amplitude.',
      'Critically damped': 'The response approaches equilibrium quickly without overshooting.',
      'Overdamped': 'The response approaches equilibrium without oscillating, but more slowly.'
    };
    const type = $('responseType').textContent.trim();
    set('stepExplanation', explanations[type] || 'Change the sliders to compare damping cases.');

    updateMetrics(model);
    plotStep(model, currentEndTime);
    plotPoles(model, poles);
    updateStepCursor();

    // Do not reveal the second prediction value before the user checks it.
    if (!savedPrediction) {
      set('predictBefore', format(window.secondOrderOvershoot(.5, model.omegaN), 2) + '%');
    }
  }

  function setDampingRatio(zeta) {
    const m = Number(mass.value), k = Number(spring.value);
    damping.value = 2 * zeta * Math.sqrt(m * k);
    damping.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setupPrediction() {
    const answer = $('predictionAnswer');
    const result = $('predictionResult');
    const save = $('savePrediction');
    const apply = $('applyCritical');
    const check = $('checkPrediction');
    const reset = $('resetPrediction');

    function feedback(message, style) {
      result.textContent = message;
      result.className = 'prediction-result' + (style ? ' ' + style : '');
    }

    $('setHalfDamping').addEventListener('click', () => setDampingRatio(.5));

    save.addEventListener('click', () => {
      const model = getModel();
      if (!answer.value) { feedback('Choose an answer before saving your prediction.'); return; }
      if (Math.abs(model.zeta - .5) > 1e-5) {
        feedback('First click “Set ζ = 0.50” and keep that damping ratio.');
        return;
      }
      savedPrediction = { answer: answer.value, wn: model.omegaN, m: model.m, k: model.k };
      set('predictBefore', format(window.secondOrderOvershoot(.5, model.omegaN), 2) + '%');
      set('predictAfter', 'Hidden until check');
      answer.disabled = true;
      save.disabled = true;
      apply.disabled = false;
      check.disabled = false;
      feedback('Prediction saved. Click “Apply ζ = 1.00”, then check the result. Keep mass and stiffness unchanged.');
    });

    apply.addEventListener('click', () => {
      if (!savedPrediction) return;
      if (Math.abs(Number(mass.value) - savedPrediction.m) > 1e-8 ||
          Math.abs(Number(spring.value) - savedPrediction.k) > 1e-8) {
        feedback('Mass or stiffness changed. Restore the original values or choose “Try again”.');
        return;
      }
      setDampingRatio(1);
    });

    check.addEventListener('click', () => {
      if (!savedPrediction) return;
      const model = getModel();
      if (Math.abs(model.omegaN - savedPrediction.wn) > 1e-5 ||
          Math.abs(model.m - savedPrediction.m) > 1e-6 ||
          Math.abs(model.k - savedPrediction.k) > 1e-6) {
        feedback('Keep m and k the same so the natural frequency stays fixed.');
        return;
      }
      if (Math.abs(model.zeta - 1) > 1e-5) {
        feedback('Apply ζ = 1.00 before checking your prediction.');
        return;
      }
      const before = window.secondOrderOvershoot(.5, savedPrediction.wn);
      const after = window.secondOrderOvershoot(1, savedPrediction.wn);
      set('predictAfter', format(after, 2) + '%');
      const correct = savedPrediction.answer === 'zero';
      feedback((correct ? 'Correct! ' : 'Not quite. ') +
        'Overshoot changes from ' + format(before, 2) + '% to ' + format(after, 2) +
        '%. A critically damped response has no overshoot.', correct ? 'correct' : 'incorrect');
      check.disabled = true;
      apply.disabled = true;
    });

    reset.addEventListener('click', () => {
      savedPrediction = null;
      answer.value = '';
      answer.disabled = false;
      save.disabled = false;
      apply.disabled = true;
      check.disabled = true;
      set('predictAfter', 'Hidden until check');
      set('predictBefore', format(window.secondOrderOvershoot(.5, getModel().omegaN), 2) + '%');
      feedback('Set ζ to 0.50, choose an answer, then save your prediction.');
    });
  }

  [mass, damping, spring].forEach(slider => {
    slider.addEventListener('input', updateAll);
  });
  document.querySelectorAll('[data-preset]').forEach(button => {
    button.addEventListener('click', updateAll);
  });
  $('resetButton').addEventListener('click', updateAll);
  timeSlider.addEventListener('input', updateStepCursor);
  playButton.addEventListener('click', () => {
    if (syncFrame !== null) cancelAnimationFrame(syncFrame);
    syncFrame = null;
    if (playButton.textContent.toLowerCase().includes('pause')) {
      syncFrame = requestAnimationFrame(animateStepMarker);
    } else {
      updateStepCursor();
    }
  });

  showValidations();
  setupPrediction();
  updateAll();
})();
