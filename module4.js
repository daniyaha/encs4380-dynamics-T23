// module4.js: "Guess the sensor" challenge (Module 4).
// Uses secondOrderStep() from second-order.js (Module 3).
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const rand = (a, b) => a + Math.random() * (b - a);
    const roundTo = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

    // Gaussian noise (Box-Muller)
    function gauss() {
        const u = 1 - Math.random(), v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    // Noise-free step response of a parameter set p
    function response(p, t) {
        return p.type === 'first'
            ? p.K * (1 - Math.exp(-t / p.tau))
            : secondOrderStep(t, p.zeta, p.wn);   // K = 1, unit step
    }

    const HINTS = {
        first: [
            'The output reaches 63.2% of its final value at t = τ.',
            'Final value = K. Use the 95% point: it is at t = 3τ.'
        ],
        second: [
            'Overshoot depends only on ζ.  ζ = −ln(Mp) / √(π² + ln²(Mp)), with Mp as a fraction.',
            'Peak time tp = π / (ωn√(1 − ζ²)). Find ζ first, then solve for ωn.'
        ]
    };

    let sensor, times, data, revealed, hintStep;
    let rounds = 0, total = 0;

    function newSensor() {
        if (Math.random() < 0.5) {
            sensor = { type: 'first', K: roundTo(rand(1, 5), 1), tau: roundTo(rand(0.5, 5), 2) };
            sensor.tEnd = 5 * sensor.tau;
        } else {
            sensor = { type: 'second', zeta: roundTo(rand(0.2, 0.7), 2), wn: roundTo(rand(1, 8), 1) };
            sensor.tEnd = 6 / (sensor.zeta * sensor.wn);
        }
        const N = 200;
        times = Array.from({ length: N + 1 }, (_, i) => (i * sensor.tEnd) / N);
        const finalValue = sensor.type === 'first' ? sensor.K : 1;
        const sigma = 0.01 * finalValue;                       // 1% noise
        data = times.map((t) => response(sensor, t) + sigma * gauss());
        revealed = false;
        hintStep = 0;

        const first = sensor.type === 'first';
        $('tauBox').hidden = !first;
        $('zetaBox').hidden = first;
        $('wnBox').hidden = first;
        ['tauGuess', 'zetaGuess', 'wnGuess'].forEach((id) => { $(id).value = ''; });
        $('sensorInfo').textContent = first
            ? 'First-order sensor (step input A = 1). Estimate τ.'
            : 'Second-order sensor (unit step, K = 1). Estimate ζ and ωn.';
        $('hintText').textContent = '';
        $('msg').textContent = '';
        $('resultTable').innerHTML = '';
        $('submitBtn').disabled = false;
        drawPlot(null);
    }

    function drawPlot(guess) {
        const traces = [{
            x: times, y: data, mode: 'markers', name: 'measured (noisy)',
            marker: { color: '#1f6fd1', size: 4 }
        }];
        if (revealed) {
            traces.push({
                x: times, y: times.map((t) => response(sensor, t)), mode: 'lines',
                name: 'true response', line: { color: '#1a7f45', width: 3 }
            });
            if (guess) {
                traces.push({
                    x: times, y: times.map((t) => response(guess, t)), mode: 'lines',
                    name: 'your guess', line: { color: '#c62828', width: 2, dash: 'dash' }
                });
            }
        }
        Plotly.react('sensorPlot', traces, {
            margin: { t: 20, r: 20, b: 50, l: 60 },
            legend: { orientation: 'h', y: 1.12 },
            xaxis: { title: 'time (s)' },
            yaxis: { title: 'output' }
        }, { responsive: true });
    }

    function submit() {
        if (revealed) return;
        let guess, rows;
        if (sensor.type === 'first') {
            const tau = parseFloat($('tauGuess').value);
            if (!(tau > 0)) { $('msg').textContent = 'Enter a positive value for τ.'; return; }
            guess = { type: 'first', K: sensor.K, tau: tau };   // K is read off the final value
            rows = [['τ (s)', sensor.tau, tau]];
        } else {
            const zeta = parseFloat($('zetaGuess').value);
            const wn = parseFloat($('wnGuess').value);
            if (!(zeta > 0) || !(wn > 0)) { $('msg').textContent = 'Enter positive values for ζ and ωn.'; return; }
            guess = { type: 'second', zeta: zeta, wn: wn };
            rows = [['ζ', sensor.zeta, zeta], ['ωn (rad/s)', sensor.wn, wn]];
        }

        const errs = rows.map((r) => Math.abs(r[2] - r[1]) / r[1]);
        const worst = Math.max.apply(null, errs);
        const points = worst <= 0.10 ? 1 : worst <= 0.20 ? 0.5 : 0;   // full / half / none
        rounds += 1;
        total += points;
        revealed = true;
        $('submitBtn').disabled = true;

        $('resultTable').innerHTML =
            '<table><thead><tr><th>Parameter</th><th>True</th><th>Your guess</th><th>Error</th></tr></thead><tbody>' +
            rows.map((r, i) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] +
                '</td><td class="' + (errs[i] <= 0.10 ? 'pass' : 'fail') + '">' + (errs[i] * 100).toFixed(1) + ' %</td></tr>').join('') +
            '</tbody></table>';
        $('msg').textContent = points === 1 ? 'Full marks: within 10%.'
            : points === 0.5 ? 'Half marks: within 20%.'
            : 'No marks this round. More than 20% off.';
        $('scoreBar').textContent = 'Score: ' + total + ' / ' + rounds + ' rounds';
        drawPlot(guess);
    }

    function hint() {
        const list = HINTS[sensor.type];
        $('hintText').textContent = 'Hint: ' + list[hintStep % list.length];
        hintStep += 1;
    }

    function checkPrediction() {
        const pick = $('predAnswer').value;
        const box = $('predictionFeedback');
        if (!pick) { box.textContent = 'Pick an answer first.'; return; }
        const mp = (z) => 100 * Math.exp(-Math.PI * z / Math.sqrt(1 - z * z));
        const a = mp(0.3), b = mp(0.7);
        box.textContent = (pick === 'A' ? 'Correct. ' : 'Not quite. ') +
            'Overshoot is ' + a.toFixed(1) + '% at ζ = 0.3 and ' + b.toFixed(1) + '% at ζ = 0.7. Less damping means more overshoot.';
    }

    $('submitBtn').addEventListener('click', submit);
    $('hintBtn').addEventListener('click', hint);
    $('newBtn').addEventListener('click', newSensor);
    $('predCheck').addEventListener('click', checkPrediction);
    window.addEventListener('resize', () => {
        const el = $('sensorPlot');
        if (el && window.Plotly && el.data) Plotly.Plots.resize(el);
    });

    newSensor();
})();cd C:\Users\hp\encs4380-dynamics-T23

