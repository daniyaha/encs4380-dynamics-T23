// Second-order step response with zero initial conditions.
// t: time in seconds
// zeta: damping ratio
// wn: natural frequency in rad/s
// K: system gain, A: step amplitude
function secondOrderStep(t, zeta, wn, K = 1, A = 1) {
  if (
    !Number.isFinite(t) || t < 0 ||
    !Number.isFinite(zeta) || zeta < 0 ||
    !Number.isFinite(wn) || wn <= 0
  ) {
    throw new Error("Use t >= 0, zeta >= 0, and wn > 0.");
  }

  const u = wn * t;
  let response;

  if (zeta < 1) {
    // Underdamped
    const q = Math.sqrt(1 - zeta * zeta);

    response = 1 - Math.exp(-zeta * u) * (
      Math.cos(q * u) +
      (zeta / q) * Math.sin(q * u)
    );
  } else if (zeta === 1) {
    // Critically damped
    response = 1 - Math.exp(-u) * (1 + u);
  } else {
    // Overdamped: two real, negative poles
    const q = Math.sqrt(zeta * zeta - 1);
    const slow = -1 / (zeta + q);
    const fast = -(zeta + q);

    response = 1 + (
      fast * Math.exp(slow * u) -
      slow * Math.exp(fast * u)
    ) / (slow - fast);
  }

  return K * A * response;
}
// Return the two poles as real and imaginary parts.
function secondOrderPoles(zeta, wn) {
  if (
    !Number.isFinite(zeta) || zeta < 0 ||
    !Number.isFinite(wn) || wn <= 0
  ) {
    throw new Error("Use zeta >= 0 and wn > 0.");
  }

  if (zeta < 1) {
    // Underdamped: complex conjugate poles
    const real = -zeta * wn;
    const imag = wn * Math.sqrt(1 - zeta * zeta);

    return [
      { real: real, imag: imag },
      { real: real, imag: -imag }
    ];
  } else if (zeta === 1) {
    // Critically damped: repeated real pole
    return [
      { real: -wn, imag: 0 },
      { real: -wn, imag: 0 }
    ];
  } else {
    // Overdamped: two distinct real poles
    const q = Math.sqrt(zeta * zeta - 1);

    return [
      { real: -wn / (zeta + q), imag: 0 },
      { real: -wn * (zeta + q), imag: 0 }
    ];
  }
}
// Rise time: time between the first 10% and 90% crossings.
// This function uses a unit step with K = 1.
function secondOrderRiseTime(zeta, wn) {
  const poles = secondOrderPoles(zeta, wn);

  const decayRate = zeta <= 1
    ? zeta * wn
    : -poles[0].real;

  if (decayRate <= 0) {
    throw new Error("Rise-time search requires zeta > 0.");
  }

  const endTime = 10 / decayRate;
  const samples = 10000;
  const dt = endTime / samples;

  let t10 = null;
  let t90 = null;
  let previousY = secondOrderStep(0, zeta, wn);

  for (let i = 1; i <= samples; i++) {
    const time = i * dt;
    const y = secondOrderStep(time, zeta, wn);

    // Interpolate between samples to estimate each crossing.
    if (t10 === null && previousY < 0.1 && y >= 0.1) {
      t10 = time - dt +
        ((0.1 - previousY) / (y - previousY)) * dt;
    }

    if (t90 === null && previousY < 0.9 && y >= 0.9) {
      t90 = time - dt +
        ((0.9 - previousY) / (y - previousY)) * dt;
    }

    if (t10 !== null && t90 !== null) {
      break;
    }

    previousY = y;
  }

  return {
    t10: t10,
    t90: t90,
    riseTime: t10 !== null && t90 !== null
      ? t90 - t10
      : null
  };
}
// Time and output value at the first peak.
// Uses a unit step with K = 1.
function secondOrderPeak(zeta, wn) {
  // Validate the parameters using our existing function.
  secondOrderPoles(zeta, wn);

  if (zeta >= 1) {
    return null; // No peak for critical or overdamping.
  }

  const wd = wn * Math.sqrt(1 - zeta * zeta);
  const peakTime = Math.PI / wd;

  return {
    peakTime: peakTime,
    peakValue: secondOrderStep(peakTime, zeta, wn)
  };
}
// Percentage overshoot for a unit step with K = 1.
function secondOrderOvershoot(zeta, wn) {
  const peak = secondOrderPeak(zeta, wn);

  if (peak === null) {
    return 0;
  }

  return Math.max(0, (peak.peakValue - 1) * 100);
}
// Settling time within ±2% of the unit final value.
function secondOrderSettlingTime(zeta, wn) {
  const poles = secondOrderPoles(zeta, wn);

  const decayRate = zeta <= 1
    ? zeta * wn
    : -poles[0].real;

  if (decayRate <= 0) {
    return null;
  }

  // Long enough for the response to settle.
  const endTime = 20 / decayRate;
  const samples = 20000;
  const dt = endTime / samples;
  const tolerance = 0.02;

  let lastOutside = -1;

  for (let i = 0; i <= samples; i++) {
    const time = i * dt;
    const y = secondOrderStep(time, zeta, wn);

    if (Math.abs(y - 1) > tolerance) {
      lastOutside = i;
    }
  }

  if (lastOutside === samples) {
    return null;
  }

  if (lastOutside === -1) {
    return 0;
  }

  // Refine the final crossing of the tolerance boundary.
  let left = lastOutside * dt;
  let right = (lastOutside + 1) * dt;

  for (let i = 0; i < 40; i++) {
    const middle = (left + right) / 2;
    const y = secondOrderStep(middle, zeta, wn);

    if (Math.abs(y - 1) > tolerance) {
      left = middle;
    } else {
      right = middle;
    }
  }

  return right;
}
// Run the two required overshoot validation checks.
function secondOrderValidation() {
  const tests = [
    {
      name: "Validation 4",
      zeta: 0.5,
      expected: 16.3,
      tolerance: 0.1
    },
    {
      name: "Validation 5",
      zeta: 1,
      expected: 0,
      tolerance: 0.000001
    }
  ];

  return tests.map(test => {
    const actual = secondOrderOvershoot(test.zeta, 2);

    return {
      name: test.name,
      zeta: test.zeta,
      expected: test.expected,
      actual: actual,
      passed: Math.abs(actual - test.expected) <= test.tolerance
    };
  });
}
function initSecondOrderPrediction() {
  const box = document.getElementById("predictionBox");
  const zetaSlider = document.getElementById("zetaSlider");
  const wnSlider = document.getElementById("wnSlider");

  let savedAnswer = null;
  let startingWn = null;

  box.innerHTML = `
    <p>
      If ζ increases from 0.50 to 1.00 while ωₙ stays fixed,
      what happens to overshoot?
    </p>

    <label for="predictionAnswer">Your prediction:</label>

    <select id="predictionAnswer">
      <option value="">Choose an answer</option>
      <option value="increase">It increases</option>
      <option value="zero">It decreases to zero</option>
      <option value="same">It stays the same</option>
    </select>

    <button id="savePrediction" type="button">
      Save prediction
    </button>

    <button id="checkPrediction" type="button" disabled>
      Check
    </button>

    <button id="resetPrediction" type="button">
      Try again
    </button>

    <p id="predictionResult" aria-live="polite"></p>
  `;

  const answer = document.getElementById("predictionAnswer");
  const save = document.getElementById("savePrediction");
  const check = document.getElementById("checkPrediction");
  const reset = document.getElementById("resetPrediction");
  const result = document.getElementById("predictionResult");

  save.addEventListener("click", function () {
    if (answer.value === "") {
      result.textContent = "Choose a prediction first.";
      return;
    }

    if (Math.abs(Number(zetaSlider.value) - 0.5) > 0.000001) {
      result.textContent =
        "Set ζ to 0.50 before saving your prediction.";
      return;
    }

    savedAnswer = answer.value;
    startingWn = Number(wnSlider.value);

    answer.disabled = true;
    save.disabled = true;
    check.disabled = false;

    result.textContent =
      "Prediction saved. Now set ζ to 1.00, keep ωₙ at " +
      startingWn.toFixed(2) + " rad/s, then click Check.";
  });

  check.addEventListener("click", function () {
    if (Math.abs(Number(zetaSlider.value) - 1) > 0.000001) {
      result.textContent = "Set ζ to 1.00 before checking.";
      return;
    }

    if (Math.abs(Number(wnSlider.value) - startingWn) > 0.000001) {
      result.textContent =
        "Keep ωₙ fixed at " + startingWn.toFixed(2) + " rad/s.";
      return;
    }

    const before = secondOrderOvershoot(0.5, startingWn);
    const after = secondOrderOvershoot(1, startingWn);
    const correct = savedAnswer === "zero";

    result.textContent =
      (correct ? "Correct! " : "Not quite. ") +
      "Overshoot decreased from " + before.toFixed(2) +
      "% to " + after.toFixed(2) +
      "%. At ζ = 1, the response is critically damped " +
      "and does not overshoot.";

    check.disabled = true;
  });

  reset.addEventListener("click", function () {
    savedAnswer = null;
    startingWn = null;

    answer.value = "";
    answer.disabled = false;
    save.disabled = false;
    check.disabled = true;

    result.textContent =
      "Set ζ to 0.50 and choose a new prediction.";
  });
}