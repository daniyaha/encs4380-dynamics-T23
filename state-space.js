// Dina Otor – State-Space Panel
// m*x'' + b*x' + k*x = 1, with x(0) = v(0) = 0.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const mass = $('massSlider'), damping = $('dampingSlider');
  const spring = $('springSlider'), slider = $('timeSlider');
  const play = $('playButton');
  const fixed = (n, digits = 3) => n.toFixed(digits);
  const write = (id, value) => { if ($(id)) $(id).textContent = value; };

  let model, scales, duration = 10, time = 0;
  let frame = null, lastFrame = null, partnerPoles = null;

  // State-space matrices and eigenvalues of A.
  function calculateStateSpace(m, b, k) {
    const A = [[0, 1], [-k / m, -b / m]];
    const B = [[0], [1 / m]], C = [[1, 0]];
    const omegaN = Math.sqrt(k / m);
    const zeta = b / (2 * Math.sqrt(m * k));
    const D = b * b - 4 * m * k;
    const real = -b / (2 * m);
    let eigenvalues;

    if (Math.abs(D) < 1e-9) {
      eigenvalues = [{ re: real, im: 0 }, { re: real, im: 0 }];
    } else if (D < 0) {
      const im = Math.sqrt(-D) / (2 * m);
      eigenvalues = [{ re: real, im }, { re: real, im: -im }];
    } else {
      const r = Math.sqrt(D) / (2 * m);
      eigenvalues = [{ re: real + r, im: 0 }, { re: real - r, im: 0 }];
    }
    return { m, b, k, A, B, C, omegaN, zeta, eigenvalues };
  }

  function dampingType(zeta) {
    if (zeta === 0) return 'No damping';
    if (Math.abs(zeta - 1) < 1e-8) return 'Critically damped';
    return zeta < 1 ? 'Underdamped' : 'Overdamped';
  }

  // Exact displacement and velocity for a one-newton step input.
  function motionAt(s, t) {
    const xf = 1 / s.k, wn = s.omegaN, alpha = s.b / (2 * s.m);
    if (Math.abs(s.zeta - 1) < 1e-8) {
      const e = Math.exp(-wn * t);
      return { x: xf * (1 - (1 + wn * t) * e), v: xf * wn * wn * t * e };
    }
    if (s.zeta < 1) {
      const wd = Math.sqrt(wn * wn - alpha * alpha);
      const e = Math.exp(-alpha * t);
      return {
        x: xf * (1 - e * (Math.cos(wd * t) + alpha / wd * Math.sin(wd * t))),
        v: xf * wn * wn / wd * e * Math.sin(wd * t)
      };
    }
    const d = Math.sqrt(alpha * alpha - wn * wn);
    const r1 = -alpha + d, r2 = -alpha - d;
    const e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
    return {
      x: xf * (1 + (r2 * e1 - r1 * e2) / (r1 - r2)),
      v: xf * r1 * r2 / (r1 - r2) * (e1 - e2)
    };
  }

  function rootsEqual(a, b, tol = 1e-3) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2) return false;
    const close = (x, y) => Math.abs(x.re - y.re) < tol && Math.abs(x.im - y.im) < tol;
    return (close(a[0], b[0]) && close(a[1], b[1])) ||(close(a[0], b[1]) && close(a[1], b[0]));
           
  }

  function rootText(p) {
    return fixed(p.re) + (Math.abs(p.im) < 1e-8 ? '' :
      (p.im >= 0 ? ' + j' : ' - j') + fixed(Math.abs(p.im)));
  }

  function svgElement(svg, tag, attrs, content) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (content !== undefined) node.textContent = content;
    svg.appendChild(node);
    return node;
  }

  function drawPhasePlane() {
    const svg = $('phasePlot');
    if (!svg) return;
    svg.replaceChildren();
    svg.setAttribute('viewBox', '0 0 860 330');
    const points = Array.from({ length: 1001 }, (_, i) => motionAt(model, i * duration / 1000));
    const minX = Math.min(0, 1 / model.k, ...points.map(p => p.x)) - .1;
    const maxX = Math.max(0, 1 / model.k, ...points.map(p => p.x)) + .1;
    const minV = Math.min(0, ...points.map(p => p.v)) - .1;
    const maxV = Math.max(0, ...points.map(p => p.v)) + .1;
    const X = x => 74 + (x - minX) / (maxX - minX) * 746;
    const Y = v => 274 - (v - minV) / (maxV - minV) * 256;
    scales = { X, Y };
    const line = (x1, y1, x2, y2, stroke, dash) => svgElement(svg, 'line', {
      x1, y1, x2, y2, stroke, ...(dash ? { 'stroke-dasharray': dash } : {})
    });
    const label = (text, x, y, anchor = 'middle') => svgElement(svg, 'text', {
      x, y, 'text-anchor': anchor, 'font-size': 12, fill: '#6B6178'
    }, text);
    for (let i = 0; i <= 5; i++) {
      const x = 74 + 746 * i / 5, y = 18 + 256 * i / 5;
      line(x, 18, x, 274, '#EEE8F4');
      line(74, y, 820, y, '#EEE8F4');
      label(fixed(minX + (maxX - minX) * i / 5, 2), x, 294);
      label(fixed(maxV - (maxV - minV) * i / 5, 2), 65, y + 4, 'end');
    }
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p.v)}`).join(' ');
    svgElement(svg, 'path', { d: path, fill: 'none', stroke: '#9272BB', 'stroke-width': 3 });
    line(74, Y(0), 820, Y(0), '#B8AEC8', '5 5');
    line(X(0), 18, X(0), 274, '#B8AEC8', '5 5');
    const circle = (x, v, r, fill, id) => svgElement(svg, 'circle', {
      ...(id ? { id } : {}), cx: X(x), cy: Y(v), r, fill
    });
    circle(0, 0, 5, '#365176');
    circle(1 / model.k, 0, 6, '#DC814A');
    circle(0, 0, 7, '#65A88A', 'phaseCursor');
    label('Displacement x (m)', 447, 320);
    label('Velocity v (m/s)', 74, 13, 'start');
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = lastFrame = null;
    play.textContent = 'Play';
  }

  function setTime(t) {
    time = Math.min(duration, Math.max(0, t));
    slider.value = Math.round(time / duration * 1000);
    const pos = motionAt(model, time), cursor = $('phaseCursor');
    if (cursor && scales) {
      cursor.setAttribute('cx', scales.X(pos.x));
      cursor.setAttribute('cy', scales.Y(pos.v));
    }
    write('timeValue', fixed(time, 2) + ' s');
    write('displacementValue', fixed(pos.x) + ' m');
    write('velocityValue', fixed(pos.v) + ' m/s');
  }

  function animate(timestamp) {
    if (frame === null) return;
    if (lastFrame !== null) setTime(time + (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    if (time >= duration) return stop();
    frame = requestAnimationFrame(animate);
  }

  function comparePoles() {
    if (!partnerPoles) return;
    const same = rootsEqual(model.eigenvalues, partnerPoles);
    write('poleMatchStatus', same ? 'Poles Match' : 'Poles Do Not Match');
    write('poleCompare', same ? 'Poles Match' : 'Poles Do Not Match');
  }

  function update() {
    stop();
    model = calculateStateSpace(+mass.value, +damping.value, +spring.value);
    const { m, b, k, zeta, omegaN, A, B, eigenvalues } = model;
    for (const [id, matrix] of [['matrixA', A], ['matrixB', B]]) {
      const target = $(id);
      if (target) {
        target.replaceChildren();
        matrix.flat().forEach(n => {
          const cell = document.createElement('span');
          cell.textContent = fixed(n);
          target.appendChild(cell);
        });
      }
    }
    write('massValue', fixed(m, 2) + ' kg');
    write('dampingValue', fixed(b, 2) + ' N·s/m');
    write('springValue', fixed(k, 2) + ' N/m');
    write('zetaValue', fixed(zeta));
    write('omegaValue', fixed(omegaN) + ' rad/s');
    write('equilibriumValue', fixed(1 / k) + ' m');
    write('responseType', dampingType(zeta));
    write('eigenOne', rootText(eigenvalues[0]));
    write('eigenTwo', rootText(eigenvalues[1]));
    write('eigenEquation', `λ² + (${fixed(b / m)})λ + (${fixed(k / m)}) = 0`);
    write('discriminantValue', `D = b² - 4mk = ${fixed(b * b - 4 * m * k)}`);
    write('stateSubstitution', `ẋ₂ = (${fixed(-k / m)})x₁ + (${fixed(-b / m)})x₂ + (${fixed(1 / m)})F(t)`);

    const type = dampingType(zeta);
    const explanations = {
      'No damping': ['The oscillations continue without fading.', 'The path forms repeating closed loops.', 'ζ = 0 → No damping'],
      'Underdamped': ['The oscillation gradually decreases.', 'The path spirals toward equilibrium.', '0 < ζ < 1 → Underdamped'],
      'Critically damped': ['The system approaches equilibrium without oscillating.', 'The path approaches equilibrium without a spiral.', 'ζ = 1 → Critical'],
      'Overdamped': ['The system approaches equilibrium slowly, without oscillating.', 'The path approaches equilibrium without a spiral.', 'ζ > 1 → Overdamped']
    };
    write('responseDescription', explanations[type][0]);
    write('phaseExplanation', explanations[type][1]);
    write('dampingGuide', explanations[type][2]);

    const rates = eigenvalues.map(p => -p.re).filter(v => v > 1e-6);
    duration = Math.min(30, Math.max(5, rates.length ? 5 / Math.min(...rates) : 0, 8 * Math.PI / omegaN));
    drawPhasePlane();
    setTime(0);
    comparePoles();
  }

  function validate() {
    const s = calculateStateSpace(1, 2, 4);
    const expected = [{ re: -1, im: Math.sqrt(3) }, { re: -1, im: -Math.sqrt(3) }];
    const checks = [
      ['checkZeta', 'statusZeta', fixed(s.zeta), Math.abs(s.zeta - .5) < 1e-3],
      ['checkOmega', 'statusOmega', fixed(s.omegaN) + ' rad/s', Math.abs(s.omegaN - 2) < 1e-3],
      ['checkEigen', 'statusEigen', s.eigenvalues.map(rootText).join(', '), rootsEqual(s.eigenvalues, expected)],
      ['checkPoles', 'statusPoles', 'Matches reference poles', rootsEqual(s.eigenvalues, expected)]
    ];
    checks.forEach(([valueId, statusId, value, passed]) => {
      write(valueId, value);
      write(statusId, passed ? 'PASS' : 'FAIL');
    });
    console.log('Validation 6:', checks.every(check => check[3]) ? 'PASS' : 'FAIL');
  }

  [mass, damping, spring].forEach(input => input.addEventListener('input', update));
  slider.addEventListener('input', () => { stop(); setTime(+slider.value / 1000 * duration); });
  play.addEventListener('click', () => {
    if (frame !== null) return stop();
    if (time >= duration) setTime(0);
    lastFrame = null;
    play.textContent = 'Pause';
    frame = requestAnimationFrame(animate);
  });
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const criticalB = 2 * Math.sqrt(+mass.value * +spring.value);
    const presets = { none: 0, under: .5 * criticalB, critical: criticalB, over: 1.5 * criticalB };
    if (presets[button.dataset.preset] === undefined) return;
    damping.value = presets[button.dataset.preset];
    update();
  }));
  $('resetButton')?.addEventListener('click', () => {
    mass.value = 1; damping.value = 2; spring.value = 4; update();
  });

  window.Module3StateSpace = {
    calculateStateSpace, motionAt,
    updateStateSpace(m, b, k) { mass.value = m; damping.value = b; spring.value = k; update(); },
    setPartnerPoles(poles) {
      partnerPoles = Array.isArray(poles) ? poles.map(p => ({
        re: Number(p.re ?? p.real), im: Number(p.im ?? p.imag ?? 0)
      })) : null;
      comparePoles();
    }
  };
  update();
  validate();
})();
