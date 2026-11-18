"use strict";

function classifySlowSensorLoop({ gain, plantTau, sensorTau, kp, ki, kd }) {
  // Routh-Hurwitz test for the closed-loop characteristic polynomial.
  const a3 = plantTau * sensorTau;
  const a2 = plantTau + sensorTau + gain * kd;
  const a1 = 1 + gain * kp;
  if (ki === 0) {
    return a2 * a2 < 4 * a3 * a1 ? "Stable (damped oscillation)" : "Stable";
  }
  const left = a2 * a1;
  const a0 = gain * ki;
  const right = a3 * a0;
  if (Math.abs(left - right) <= 1e-9 * Math.max(left, right)) return "Sustained oscillation";
  if (left < right) return "Unstable";

  // A negative cubic discriminant means the stable poles include a complex pair.
  const terms = [
    18 * a3 * a2 * a1 * a0,
    -4 * a2 ** 3 * a0,
    a2 ** 2 * a1 ** 2,
    -4 * a3 * a1 ** 3,
    -27 * a3 ** 2 * a0 ** 2,
  ];
  const discriminant = terms.reduce((sum, term) => sum + term, 0);
  const tolerance = 1e-12 * Math.max(...terms.map(Math.abs));
  return discriminant < -tolerance ? "Stable (damped oscillation)" : "Stable";
}

function simulateSlowSensor({ gain, plantTau, sensorTau, kp, ki, kd, duration = 20 }) {
  const setpoint = 1;
  const stepCount = Math.ceil(duration / Math.min(.005, sensorTau / 25, plantTau / 25));
  const dt = duration / stepCount;
  const stride = Math.max(1, Math.floor(stepCount / 850));
  let state = [0, 0, 0];
  let peak = 0;
  const points = [];

  function rates([output, measured, integral]) {
    const error = setpoint - measured;
    const sensorRate = (output - measured) / sensorTau;
    const control = kp * error + ki * integral - kd * sensorRate;
    return [(gain * control - output) / plantTau, sensorRate, error];
  }

  for (let i = 0; i <= stepCount; i++) {
    if (i % stride === 0 || i === stepCount) {
      points.push({ t: i * dt, output: state[0], measured: state[1] });
    }
    peak = Math.max(peak, state[0]);
    if (i === stepCount || state.some(value => !Number.isFinite(value) || Math.abs(value) > 1e5)) break;

    const k1 = rates(state);
    const k2 = rates(state.map((value, j) => value + dt * k1[j] / 2));
    const k3 = rates(state.map((value, j) => value + dt * k2[j] / 2));
    const k4 = rates(state.map((value, j) => value + dt * k3[j]));
    state = state.map((value, j) => value + dt * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6);
    if (state.some(value => !Number.isFinite(value) || Math.abs(value) > 1e5)) break;
  }

  return { points, overshoot: Math.max(0, (peak - setpoint) * 100), truncated: points.at(-1).t < duration - 1e-9 };
}

if (typeof module !== "undefined") module.exports = { simulateSlowSensor, classifySlowSensorLoop };



const byId = id => document.getElementById(id);
const controls = ["sensorTau", "kp", "ki", "kd", "gain", "plantTau"];
const canvas = byId("plot");
const context = canvas.getContext("2d");
const reference = { gain: 1, plantTau: 1, kp: 3, ki: 8, kd: 0 };
let result;

function draw() {
  if (!result) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.scale(scale, scale);

  const left = 52;
  const right = width - 15;
  const top = 18;
  const bottom = height - 48;
  const values = result.points.flatMap(point => [point.output, point.measured]);
  const min = Math.min(0, ...values);
  const max = Math.max(1.15, ...values);
  const x = time => left + (right - left) * time / 20;
  const y = value => bottom - (bottom - top) * (value - min) / (max - min);
  const number = value => Math.abs(value) >= 1000 ? value.toExponential(1) : value.toFixed(2);

  function line(points, color, dash = [], thickness = 1) {
    context.beginPath();
    points.forEach(([px, py], index) => {
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.strokeStyle = color;
    context.lineWidth = thickness;
    context.setLineDash(dash);
    context.stroke();
  }

  context.font = "12px system-ui";
  context.fillStyle = "#665975";
  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4;
    line([[left, y(value)], [right, y(value)]], "#e9e3f0");
    context.textAlign = "right";
    context.fillText(number(value), left - 6, y(value) + 4);
    const time = i * 5;
    context.textAlign = "center";
    context.fillText(time, x(time), bottom + 18);
  }
  context.fillText("Time (s)", (left + right) / 2, height - 8);
  line([[left, top], [left, bottom], [right, bottom]], "#777088");
  line([[left, y(1)], [right, y(1)]], "#665975", [2, 4], 2);
  line(result.points.map(point => [x(point.t), y(point.output)]), "#7552a5", [], 2.5);
  line(result.points.map(point => [x(point.t), y(point.measured)]), "#a34e24", [7, 4], 2.5);
}

function simulate() {
  const inputs = controls.map(byId);
  if (inputs.some(input => !input.validity.valid)) {
    byId("loop-status").textContent = "Loop status unavailable";
    byId("stats").textContent = "Enter plant parameters within the allowed ranges to update the plot.";
    return;
  }
  const settings = Object.fromEntries(inputs.map(input => [input.id, Number(input.value)]));
  byId("sensorTauValue").textContent = settings.sensorTau.toFixed(2) + " s";
  byId("kpValue").textContent = settings.kp.toFixed(1);
  byId("kiValue").textContent = settings.ki.toFixed(1);
  byId("kdValue").textContent = settings.kd.toFixed(2);
  result = simulateSlowSensor(settings);
  byId("loop-status").textContent = "Loop status: " + classifySlowSensorLoop(settings);
  draw();
  byId("stats").textContent = result.truncated
    ? "Simulation stopped because the response grew beyond the plotting limit."
    : "True-output overshoot above the setpoint: " + result.overshoot.toFixed(1) + "% (0–20 s)";
}

let animationFrame;
controls.forEach(id => byId(id).addEventListener("input", () => {
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(simulate);
}));
document.querySelectorAll("[data-tau]").forEach(button => {
  button.addEventListener("click", () => {
    Object.entries(reference).forEach(([id, value]) => { byId(id).value = value; });
    byId("sensorTau").value = button.dataset.tau;
    simulate();
  });
});
byId("check").addEventListener("click", () => {
  const prediction = byId("prediction").value;
  if (!prediction) {
    byId("verdict").textContent = "Choose a prediction first.";
    return;
  }
  const before = simulateSlowSensor({ ...reference, sensorTau: .05 }).overshoot;
  const after = simulateSlowSensor({ ...reference, sensorTau: .45 }).overshoot;
  byId("verdict").textContent = (prediction === "increase" ? "Correct. " : "It increases. ")
    + "Overshoot goes from " + before.toFixed(1) + "% to " + after.toFixed(1)
    + "% because the delayed measurement keeps the controller driving the plant for longer.";
});
new ResizeObserver(draw).observe(canvas);
simulate();


const validation = simulateSlowSensor({ ...reference, sensorTau: .05, kp: 9, ki: 0 });
const finalOutput = validation.points.at(-1).output;
const steadyStateError = (1 - finalOutput) * 100;
const validationPassed = !validation.truncated && Math.abs(finalOutput - .9) < .001;
byId("validation-result").textContent = (validationPassed ? "PASS" : "FAIL")
  + " | Simulated final output: " + finalOutput.toFixed(3)
  + " | Simulated steady-state error: " + steadyStateError.toFixed(1) + "%";
