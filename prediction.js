function initPrediction() {
    const box = document.getElementById("predictionBox");
    const slider = document.getElementById("tauSlider");

    let startingTau = null;
    let savedAnswer = null;

    box.innerHTML = `
        <p>
            If you increase τ, will the sensor respond
            faster or slower?
        </p>

        <select id="predictionAnswer">
            <option value="">Choose your prediction</option>
            <option value="faster">Faster</option>
            <option value="slower">Slower</option>
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

        startingTau = Number(slider.value);

        if (startingTau >= Number(slider.max)) {
            result.textContent =
                "Lower τ first so you can increase it during the experiment.";
            return;
        }

        savedAnswer = answer.value;
        answer.disabled = true;
        save.disabled = true;
        check.disabled = false;

        result.textContent =
            "Prediction saved at τ = " + startingTau.toFixed(1) +
            " s. Now increase τ using the slider, then click Check.";
    });

    check.addEventListener("click", function () {
        const currentTau = Number(slider.value);

        if (currentTau <= startingTau) {
            result.textContent =
                "Increase τ above " + startingTau.toFixed(1) +
                " s before checking.";
            return;
        }

        const feedback = savedAnswer === "slower"
            ? "Correct!"
            : "Not quite.";


        

        const isRamp = document.querySelector('input[name="inputType"]:checked').value === "ramp";
        const explanation = isRamp
            ? "the time lag (τ) and the steady-state error (Kτ) both grow."
            : "the error decreases more slowly, and the ln(error) slope becomes less negative.";

        result.textContent =
            feedback + " τ increased from " +
            startingTau.toFixed(1) + " s to " +
            currentTau.toFixed(1) +
            " s. A larger τ means a slower response: " +
            explanation;
        


        check.disabled = true;
    });

    reset.addEventListener("click", function () {
        startingTau = null;
        savedAnswer = null;
        answer.value = "";
        answer.disabled = false;
        save.disabled = false;
        check.disabled = true;
        result.textContent = "Choose a prediction to start a new experiment.";
    });
}