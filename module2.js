// JavaScript source code
// module2.js: first-order frequency response (Module 2).
// Pure math first, then plotting, then the controls at the bottom.
(function () {
    'use strict';

    const RAD2DEG = 180 / Math.PI;
    const BLUE = '#1f6fd1';     // input
    const ORANGE = '#e8710a';   // output

    // ---------- math (no DOM in here, easy to test) ----------
    // Amplitude ratio of G(s) = 1/(tau*s + 1) at angular frequency w (rad/s)
    const gain = (w, tau) => 1 / Math.sqrt(1 + (w * tau) ** 2);
    // Phase in radians. Negative means the output lags the input.
    const phase = (w, tau) => -Math.atan(w * tau);
    // Largest tau that keeps the error below e (0.05 = 5%) up to w (rad/s):
    // M >= 1 - e  ->  tau <= sqrt(1/(1-e)^2 - 1) / w
    const tauMax = (e, w) => Math.sqrt(1 / ((1 - e) ** 2) - 1) / w;

    // ---------- page elements ----------
    const $ = (id) => document.getElementById(id);
    const tauSlider = $('tauSlider');
    const wSlider = $('wSlider');

    // The frequency slider holds log10(w), so w = 10^value
    const wFromSlider = () => Math.pow(10, parseFloat(wSlider.value));

    const fmt = (x, d) => x.toFixed(d);

    // Logarithmic frequency grid for the Bode plot: 0.01 to 1000 rad/s
    const WGRID = Array.from({ length: 401 }, (_, i) => Math.pow(10, -2 + (5 * i) / 400));

    const layoutBase = { margin: { t: 30, r: 20, b: 50, l: 60 }, legend: { orientation: 'h', y: 1.15 } };

    // ---------- plots ----------
    function drawTime(tau, w) {
        const M = gain(w, tau), phi = phase(w, tau);
        const T = (2 * Math.PI) / w;           // one period
        const N = 800, tEnd = 4 * T;           // show four periods
        const t = Array.from({ length: N + 1 }, (_, i) => (i * tEnd) / N);
        const x = t.map((s) => Math.sin(w * s));
        const y = t.map((s) => M * Math.sin(w * s + phi));
        Plotly.react('timePlot', [
            { x: t, y: x, name: 'input sin(\u03C9t)', line: { color: BLUE, width: 2 } },
            { x: t, y: y, name: 'output', line: { color: ORANGE, width: 2 } }
        ], Object.assign({}, layoutBase, {
            xaxis: { title: 'time (s)' },
            yaxis: { title: 'amplitude', range: [-1.2, 1.2] }
        }), { responsive: true });
    }

    function drawBode(tau, w) {
        const mag = WGRID.map((v) => 20 * Math.log10(gain(v, tau)));
        const ph = WGRID.map((v) => phase(v, tau) * RAD2DEG);
        const wc = 1 / tau;
        const curW = w;
        const curMag = 20 * Math.log10(gain(w, tau));
        const curPh = phase(w, tau) * RAD2DEG;

        Plotly.react('bodeMag', [
            { x: WGRID, y: mag, name: 'magnitude', line: { color: BLUE, width: 2 } },
            { x: [wc, wc], y: [-60, 10], name: 'cutoff 1/\u03C4', mode: 'lines', line: { color: '#888', dash: 'dash' } },
            { x: [wc], y: [20 * Math.log10(Math.SQRT1_2)], name: '-3 dB', mode: 'markers', marker: { color: '#888', size: 9 } },
            { x: [curW], y: [curMag], name: 'now', mode: 'markers', marker: { color: '#c62828', size: 11 } }
        ], Object.assign({}, layoutBase, {
            xaxis: { title: '\u03C9 (rad/s)', type: 'log' },
            yaxis: { title: 'gain (dB)', range: [-60, 10] }
        }), { responsive: true });

        Plotly.react('bodePhase', [
            { x: WGRID, y: ph, name: 'phase', line: { color: ORANGE, width: 2 } },
            { x: [wc, wc], y: [-100, 10], name: 'cutoff 1/\u03C4', mode: 'lines', line: { color: '#888', dash: 'dash' } },
            { x: [wc], y: [-45], name: '-45\u00B0', mode: 'markers', marker: { color: '#888', size: 9 } },
            { x: [curW], y: [curPh], name: 'now', mode: 'markers', marker: { color: '#c62828', size: 11 } }
        ], Object.assign({}, layoutBase, {
            xaxis: { title: '\u03C9 (rad/s)', type: 'log' },
            yaxis: { title: 'phase (degrees)', range: [-100, 10] }
        }), { responsive: true });
    }

    // ---------- numbers ----------
    function updateReadouts(tau, w) {
        const M = gain(w, tau), phiDeg = phase(w, tau) * RAD2DEG;
        $('mValue').textContent = fmt(M, 4);
        $('dbValue').textContent = fmt(20 * Math.log10(M), 2) + ' dB';
        $('phiValue').textContent = fmt(phiDeg, 2) + '\u00B0';
        $('delayValue').textContent = fmt(-phase(w, tau) / w, 4) + ' s';
        $('deltaValue').textContent = fmt((M - 1) * 100, 2) + ' %';
    }

    // ---------- dynamic-error calculator ----------
    function updateCalculator() {
        const out = $('calcResult');
        const ePct = parseFloat($('errInput').value);
        const f = parseFloat($('fInput').value);
        if (!(ePct > 0 && ePct < 100) || !(f > 0)) {
            out.textContent = 'Enter an error between 0 and 100 % and a frequency above 0 Hz.';
            return;
        }
        const w = 2 * Math.PI * f;                    // Hz -> rad/s
        const tm = tauMax(ePct / 100, w);
        const lag = -phase(w, tm) * RAD2DEG;
        const tau = parseFloat(tauSlider.value);
        const errNow = (1 - gain(w, tau)) * 100;      // error of the slider's tau at this frequency
        const ok = tau <= tm;
        out.innerHTML =
            '<p><strong>\u03C4max = ' + fmt(tm * 1000, 3) + ' ms</strong> (' + fmt(tm, 6) + ' s)</p>' +
            '<p>With \u03C4max, the phase lag at ' + fmt(f, 2) + ' Hz is ' + fmt(lag, 2) + '\u00B0.</p>' +
            '<p>Your slider \u03C4 = ' + fmt(tau, 2) + ' s gives ' + fmt(errNow, 2) + ' % error at ' + fmt(f, 2) +
            ' Hz, so it ' + (ok ? 'meets' : 'does NOT meet') + ' the limit.</p>';
    }

    // ---------- predict, then check ----------
    function checkGuess() {
        const picked = document.querySelector('input[name="guess"]:checked');
        const box = $('predictionFeedback');
        if (!picked) { box.textContent = 'Pick an answer first.'; return; }
        const tau = parseFloat(tauSlider.value);
        const w1 = wFromSlider();
        const w2 = Math.min(w1 * 10, 100);          // slider tops out at 100 rad/s
        const m1 = gain(w1, tau), m2 = gain(w2, tau);
        // actually move the slider so the learner sees it happen
        wSlider.value = Math.log10(w2);
        refresh();
        const right = picked.value === 'shrink';
        box.textContent = (right ? 'Correct. ' : 'Not quite. ') +
            'M went from ' + fmt(m1, 3) + ' (at ' + fmt(w1, 2) + ' rad/s) to ' + fmt(m2, 3) +
            ' (at ' + fmt(w2, 2) + ' rad/s). Higher frequency means the sensor cannot keep up, so the amplitude shrinks.';
    }

    // ---------- validation (fixed inputs from the slides) ----------
    function buildValidation() {
        const rows = [];
        const add = (name, expected, calc, tol, unit, d) => {
            const pass = Math.abs(calc - expected) <= tol;
            rows.push('<tr><td>' + name + '</td><td>' + fmt(expected, d) + unit + '</td><td>' + fmt(calc, d) + unit +
                '</td><td class="' + (pass ? 'pass' : 'fail') + '">' + (pass ? 'PASS' : 'FAIL') + '</td></tr>');
        };
        // Check 2: tau = 0.2 s, input sin(2t): amplitude 0.93, lag 21.8 degrees
        add('tau = 0.2 s, input sin 2t: amplitude ratio', 0.93, gain(2, 0.2), 0.005, '', 3);
        add('tau = 0.2 s, input sin 2t: phase lag', 21.8, -phase(2, 0.2) * RAD2DEG, 0.05, '\u00B0', 2);
        // Check 3: up to 100 Hz with at most 5 % error
        const tm = tauMax(0.05, 2 * Math.PI * 100);
        add('100 Hz, 5 % error: tau max', 0.52, tm * 1000, 0.01, ' ms', 3);
        add('Phase lag at 50 Hz (with tau max)', 9.3, -phase(2 * Math.PI * 50, tm) * RAD2DEG, 0.1, '\u00B0', 2);
        $('validationResults').innerHTML =
            '<table><thead><tr><th>Check</th><th>Expected value</th><th>Calculated value</th><th>Result</th></tr></thead><tbody>' +
            rows.join('') + '</tbody></table>';
    }

    // ---------- wiring ----------
    function refresh() {
        const tau = parseFloat(tauSlider.value);
        const w = wFromSlider();
        $('tauValue').textContent = fmt(tau, 2) + ' s';
        $('wValue').textContent = fmt(w, 2);
        $('fNote').textContent = 'f = ' + fmt(w / (2 * Math.PI), 3) + ' Hz. The slider is logarithmic: 0.1 to 100 rad/s.';
        updateReadouts(tau, w);
        drawTime(tau, w);
        drawBode(tau, w);
        updateCalculator();   // keeps the "your slider tau" line current
    }

    tauSlider.addEventListener('input', refresh);
    wSlider.addEventListener('input', refresh);
    $('errInput').addEventListener('input', updateCalculator);
    $('fInput').addEventListener('input', updateCalculator);
    $('checkGuess').addEventListener('click', checkGuess);

    window.addEventListener('resize', () => {
        ['timePlot', 'bodeMag', 'bodePhase'].forEach((id) => {
            const el = $(id);
            if (el && el.offsetParent && window.Plotly && el.data) Plotly.Plots.resize(el);
        });
    });

    buildValidation();
    refresh();
})();