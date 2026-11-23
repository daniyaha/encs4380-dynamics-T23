// ENCS4380 — My System: Micromouse drive motor speed control (Team 23)
// IMPORTANT: The motor has not been measured. K=500 RPM/duty and tau=0.25s are
// explicitly illustrative assumptions; they are NOT experimental identification.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const END = 5;                  // seconds of simulated time
  const PWM_MIN = 0, PWM_MAX = 1;
  const OS_SPEC = 10, SETTLE_SPEC = 2, ERROR_SPEC = 1;
  const fields = ['K', 'tau', 'sp', 'sampleMs', 'kp', 'ki', 'kd'];
  const val = id => Number($(id).value);
  const fmt = n => Number(n.toPrecision(6)).toString();
  const cFloat = n => (Number.isInteger(n) ? n.toFixed(1) : fmt(n)) + 'f';
  let current = null;

  function params() {
    const p = Object.fromEntries(fields.map(id => [id, val(id)]));
    p.Ts = p.sampleMs / 1000;
    const good = Number.isFinite(p.K) && p.K > 0 && Number.isFinite(p.tau) && p.tau > 0 &&
      Number.isFinite(p.sp) && p.sp > 0 && Number.isFinite(p.Ts) && p.Ts >= 0.005 && p.Ts <= 0.1 &&
      [p.kp, p.ki, p.kd].every(x => Number.isFinite(x) && x >= 0);
    return good ? p : null;
  }

  // Forward Euler motor plant; sampled digital PID, zero-order-held PWM.
  // D is on the measurement to avoid setpoint kick. Conditional anti-windup.
  function simulate(p) {
    const substeps = Math.ceil(p.Ts / 0.001);
    const dt = p.Ts / substeps;
    const nSamples = Math.ceil(END / p.Ts);
    let speed = 0, sum = 0, prevSpeed = 0, maxSpeed = 0;
    const trace = [{ t: 0, speed: 0, pwm: 0 }];
    for (let k = 0; k < nSamples; k++) {
      const t = k * p.Ts;
      const error = p.sp - speed;
      const derivative = k === 0 ? 0 : -(speed - prevSpeed) / p.Ts;
      const candidate = sum + error * p.Ts;
      let uRaw = p.kp * error + p.ki * candidate + p.kd * derivative;
      if (!((uRaw > PWM_MAX && error > 0) || (uRaw < PWM_MIN && error < 0))) sum = candidate;
      uRaw = p.kp * error + p.ki * sum + p.kd * derivative;
      const pwm = Math.max(PWM_MIN, Math.min(PWM_MAX, uRaw));
      prevSpeed = speed;
      for (let j = 0; j < substeps; j++) {
        const simTime = t + j * dt;
        if (simTime > END + 1e-9) break;
        // Thin plot samples to <= ~1000 points, but continue integrating at dt.
        if (j === 0 || (trace.length < 1100 && (k * substeps + j) % 5 === 0)) {
          trace.push({ t: simTime, speed, pwm });
        }
        maxSpeed = Math.max(maxSpeed, speed);
        speed += dt * (p.K * pwm - speed) / p.tau;
        if (!Number.isFinite(speed) || Math.abs(speed) > 1e8) return { unstable: true };
      }
    }
    trace.push({ t: END, speed, pwm: trace[trace.length - 1].pwm });
    maxSpeed = Math.max(maxSpeed, speed);
    let t10 = null, t90 = null, lastOutside = -1;
    for (let i = 0; i < trace.length; i++) {
      const s = trace[i];
      if (t10 === null && s.speed >= p.sp * 0.1) t10 = s.t;
      if (t90 === null && s.speed >= p.sp * 0.9) t90 = s.t;
      if (Math.abs(s.speed - p.sp) > 0.02 * p.sp) lastOutside = i;
    }
    return {
      unstable: false, trace,
      rise: t10 !== null && t90 !== null ? t90 - t10 : null,
      overshoot: 100 * Math.max(0, (maxSpeed - p.sp) / p.sp),
      settling: lastOutside === trace.length - 1 ? null : (lastOutside < 0 ? 0 : trace[lastOutside + 1].t),
      error: 100 * Math.abs(speed - p.sp) / p.sp,
      lastPWM: trace[trace.length - 1].pwm * 100
    };
  }

  // Lightweight SVG plots (no server or dependencies, compatible with GitHub Pages).
  function plot(id, trace, key, maxY, reference, unit) {
    const W = 800, H = 260, L = 62, R = 18, T = 16, B = 34;
    const x = t => L + (W - L - R) * t / END;
    const y = n => T + (H - T - B) * (1 - n / maxY);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`;
    for (let i = 0; i <= 5; i++) {
      const time = i * END / 5;
      svg += `<text x="${x(time)}" y="${H-8}" fill="#91829c" font-size="13" text-anchor="middle">${time.toFixed(0)} s</text>`;
    }
    for (let i = 0; i <= 4; i++) {
      const amount = i * maxY / 4;
      svg += `<line x1="${L}" x2="${W-R}" y1="${y(amount)}" y2="${y(amount)}" stroke="#f1ecf5"/>`;
      svg += `<text x="${L-8}" y="${y(amount)+5}" fill="#91829c" font-size="13" text-anchor="end">${amount.toFixed(0)}${unit}</text>`;
    }
    svg += `<line x1="${L}" y1="${y(reference)}" x2="${W-R}" y2="${y(reference)}" stroke="#e5a1b3" stroke-width="2.5" stroke-dasharray="8 6"/>`;
    const data = trace.filter((_, i) => i % Math.max(1, Math.ceil(trace.length / 850)) === 0 || i === trace.length - 1);
    svg += `<polyline fill="none" stroke="#8261b4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${data.map(pt => `${x(Math.max(0,Math.min(END,pt.t))).toFixed(2)},${y(Math.max(0,Math.min(maxY,pt[key]))).toFixed(2)}`).join(' ')}"/>`;
    $(id).innerHTML = svg + '</svg>';
  }

  function setMetric(valueId, statusId, text, isPass, criterion) {
    $(valueId).textContent = text;
    $(statusId).textContent = isPass ? `✓ Pass · ${criterion}` : `✕ Fail · ${criterion}`;
    $(statusId).className = isPass ? 'passed' : 'failed';
  }

  function code(p) {
    // A single-motor ESP32 sketch: GPIOs are EXAMPLES, not the team's actual pin plan.
    // The encoder count remains 0 until the user calibrates the gearbox/output shaft.
    return `// ENCS4380 Team 23 — Micromouse motor speed PID (one wheel)
// Example sketch: Arduino-ESP32 core 3.x; DRV8833 driver
// IMPORTANT: Tune and measure AFTER hardware arrives.
// K=${fmt(p.K)} RPM/duty and tau=${fmt(p.tau)} s are simulation assumptions ONLY.

#include <Arduino.h>

const int IN1_PIN = 25;         // EXAMPLE: DRV8833 AIN1 (PWM)
const int IN2_PIN = 26;         // EXAMPLE: DRV8833 AIN2 (held LOW)
const int ENCODER_A_PIN = 32;   // EXAMPLE: Hall encoder channel A
// Channel B is not needed for this one-direction speed loop.
// WARNING: verify GPIOs, motor supply, nSLEEP, encoder voltage, and GND.

const float KP = ${cFloat(p.kp)};  // PWM fraction per RPM
const float KI = ${cFloat(p.ki)};  // PWM fraction / (RPM*s)
const float KD = ${cFloat(p.kd)};  // PWM fraction*s / RPM
const float SETPOINT_RPM = ${cFloat(p.sp)};
const uint32_t SAMPLE_US = ${Math.round(p.Ts * 1e6)}UL;
const float TS = SAMPLE_US / 1000000.0f;
const int PWM_FREQ = 20000, PWM_BITS = 8;
const int PWM_MAX = 255;

// REQUIRED CALIBRATION BEFORE MOTOR CAN RUN:
// Encoder's advertised '7 PPR' may refer to the MOTOR SHAFT,
// not the geared OUTPUT SHAFT. Obtain gearbox ratio and counting mode.
// Number of RISING edges on channel A PER OUTPUT SHAFT REVOLUTION:
const float EDGES_PER_OUTPUT_REV = 0.0f;  // TODO: replace after calibration

volatile uint32_t encoderEdges = 0;
float integral = 0.0f, prevRPM = 0.0f;
uint32_t lastUpdateUs = 0;

void IRAM_ATTR onEncoderRise() { encoderEdges++; }

void setup() {
  Serial.begin(115200);
  pinMode(IN2_PIN, OUTPUT);
  digitalWrite(IN2_PIN, LOW);  // Forward PWM mode for DRV8833
  pinMode(ENCODER_A_PIN, INPUT); // add pull-up/level shifting if required
  attachInterrupt(digitalPinToInterrupt(ENCODER_A_PIN), onEncoderRise, RISING);
  if (!ledcAttach(IN1_PIN, PWM_FREQ, PWM_BITS)) {
    Serial.println("PWM initialization failed");
    while (true) { delay(1000); }
  }
  ledcWrite(IN1_PIN, 0);
  lastUpdateUs = micros();
}

void loop() {
  const uint32_t now = micros();
  if ((uint32_t)(now - lastUpdateUs) < SAMPLE_US) return;
  lastUpdateUs += SAMPLE_US;

  if (EDGES_PER_OUTPUT_REV <= 0.0f) {
    ledcWrite(IN1_PIN, 0);   // SAFETY: cannot control uncalibrated motor
    return;
  }

  noInterrupts();
  uint32_t edges = encoderEdges;
  encoderEdges = 0;
  interrupts();

  float rpm = (edges * 60.0f) / (EDGES_PER_OUTPUT_REV * TS);
  float error = SETPOINT_RPM - rpm;
  float dMeasurement = -(rpm - prevRPM) / TS; // no setpoint kick
  float trialIntegral = integral + error * TS;
  float uTrial = KP * error + KI * trialIntegral + KD * dMeasurement;
  // Conditional anti-windup: do not integrate deeper into saturation.
  if (!((uTrial > 1.0f && error > 0.0f) ||
        (uTrial < 0.0f && error < 0.0f))) {
    integral = trialIntegral;
  }
  float u = constrain(KP * error + KI * integral + KD * dMeasurement,
                      0.0f, 1.0f);
  prevRPM = rpm;
  ledcWrite(IN1_PIN, (uint32_t)roundf(u * PWM_MAX));
}
`;
  }

  function redraw() {
    const p = params();
    if (!p) {
      $('statusChip').textContent = 'CHECK INPUTS';
      $('poleEstimate').textContent = 'Enter positive values for K, τ, setpoint, and sample time; PID gains must be nonnegative.';
      return;
    }
    const r = simulate(p);
    if (r.unstable) { $('statusChip').textContent = 'SIMULATION ERROR'; return; }
    current = { p, r };
    const gainTerm = p.tau + p.K * p.kd;
    const wn = p.ki > 0 ? Math.sqrt(p.K * p.ki / gainTerm) : null;
    const zeta = wn ? (1 + p.K * p.kp) / (2 * gainTerm * wn) : null;
    $('poleEstimate').textContent = zeta === null
      ? 'With Ki = 0, the step-tracking system has proportional steady-state error; PI damping ratio is undefined.'
      : `Ideal linear estimate: ζ ≈ ${zeta.toFixed(2)}, ωn ≈ ${wn.toFixed(2)} rad/s. Suggested ζ range: 0.60–0.80. Note: model assumes an ideal derivative; digital/saturated results differ.`;
    $('zetaOut').textContent = val('targetZeta').toFixed(2);
    $('wnOut').textContent = val('targetWn').toFixed(1) + ' rad/s';
    const maxSpeed = Math.max(p.sp * 1.3, Math.max(...r.trace.map(pt => pt.speed)) * 1.1, 30);
    plot('speedPlot', r.trace, 'speed', maxSpeed, p.sp, '');
    const pwmTrace = r.trace.map(x => ({ ...x, duty: x.pwm * 100 }));
    plot('pwmPlot', pwmTrace, 'duty', 110, 100, '%');
    $('mRise').textContent = r.rise === null ? 'Not reached' : r.rise.toFixed(2) + ' s';
    setMetric('mOvershoot','vOvershoot',r.overshoot.toFixed(1) + '%',r.overshoot <= OS_SPEC,'≤ 10%');
    setMetric('mSettling','vSettling',r.settling === null ? 'Not settled' : r.settling.toFixed(2) + ' s',r.settling !== null && r.settling <= SETTLE_SPEC,'≤ 2.0 s');
    setMetric('mError','vError',r.error.toFixed(2) + '%',r.error <= ERROR_SPEC,'≤ 1% at 5 s');
    $('statusChip').textContent = [r.overshoot <= OS_SPEC, r.settling !== null && r.settling <= SETTLE_SPEC, r.error <= ERROR_SPEC].every(Boolean) ? 'ALL SPECS PASS' : 'TUNING NEEDED';
    $('arduinoCode').textContent = code(p);
    $('predictionResult').textContent = '';
  }

  function autoTune() {
    const p = params();
    if (!p) return;
    const zeta = val('targetZeta'), wn = val('targetWn');
    const kp = (2 * zeta * wn * p.tau - 1) / p.K;
    const ki = p.tau * wn * wn / p.K;
    if (kp < 0) {
      $('poleEstimate').textContent = 'These targets require negative Kp. Choose a larger ωn or ζ.';
      return;
    }
    $('kp').value = +kp.toPrecision(6);
    $('ki').value = +ki.toPrecision(6);
    $('kd').value = 0; // PI pole placement formula (not a PID design with D)
    redraw();
  }

  fields.forEach(id => $(id).addEventListener('input', redraw));
  ['targetZeta','targetWn'].forEach(id => $(id).addEventListener('input', () => {
    $('zetaOut').textContent = val('targetZeta').toFixed(2);
    $('wnOut').textContent = val('targetWn').toFixed(1) + ' rad/s';
  }));
  $('autoTune').addEventListener('click', autoTune);
  $('reset').addEventListener('click', () => {
    const defaults = { K: 500, tau: 0.25, sp: 250, sampleMs: 10, kp: 0.0029, ki: 0.0245, kd: 0, targetZeta: 0.7, targetWn: 7 };
    Object.entries(defaults).forEach(([id,v]) => { $(id).value = v; });
    redraw();
  });
  $('checkPrediction').addEventListener('click', () => {
    if (!current) return;
    const { p, r } = current;
    if (p.ki === 0) {
      $('predictionResult').textContent = 'Set Ki above zero first so a 50% increase makes a difference.';
      return;
    }
    const changed = simulate({ ...p, ki: p.ki * 1.5 });
    if (changed.unstable) return;
    const difference = changed.overshoot - r.overshoot;
    const actual = Math.abs(difference) < 0.5 ? 'same' : difference < 0 ? 'decrease' : 'increase';
    $('predictionResult').textContent = `${actual === $('prediction').value ? '✓ Correct.' : '✕ Not quite.'} Overshoot now: ${r.overshoot.toFixed(1)}%; with Ki × 1.5: ${changed.overshoot.toFixed(1)}%. Stronger integral action may remove tracking error sooner but can increase overshoot.`;
  });
  $('copyCode').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('arduinoCode').textContent); $('copyCode').textContent = 'Copied ✓'; }
    catch { $('copyCode').textContent = 'Select code to copy'; }
  });
  window.MySystem = { simulate, code, autoTune }; // useful for local tests
  redraw();
})();
