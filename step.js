function updateStep(K, timeConstant, t) {
    const A = 1; // Unit step input
    const finalValue = K * A;

   
    const times = Array.isArray(t) && t.length > 0 ? t
        : Array.from({ length: 801 }, (_, i) => (i / 800) * 8 * timeConstant);

    const inputs = times.map(() => A);
    const outputs = times.map(time => K * A * (1 - Math.exp(-time / timeConstant)));

    const inputTrace = { x: times, y: inputs, mode: "lines", name: "Input",
        line: { color: "#2874d0", width: 2.5 },
        hovertemplate: "Time: %{x:.2f} s<br>Input: %{y:.3f}<extra></extra>"};

    const outputTrace = { x: times, y: outputs, mode: "lines", name: "Output",
        line: { color: "#e8710a", width: 3 },
        hovertemplate: "Time: %{x:.2f} s<br>Output: %{y:.3f}<extra></extra>" };

    const calculated63 = finalValue * (1 - Math.exp(-1));
    const calculated95 = finalValue * (1 - Math.exp(-3));

    const point63 = {x: [timeConstant],y: [calculated63],mode: "markers",name: "63.2% point (t = τ)",
        marker: { color: "#db3535", size: 11 },
        hovertemplate: "t = τ = %{x:.2f} s<br>Output: %{y:.4f}<extra></extra>"};

    const point95 = {x: [3 * timeConstant], y: [calculated95], mode: "markers", name: "95% point (t = 3τ)",
        marker: { color: "#188449", size: 11 },
        hovertemplate: "t = 3τ = %{x:.2f} s<br>Output: %{y:.4f}<extra></extra>"};

    const layout = { margin: { l: 64, r: 16, t: 18, b: 68 },
        xaxis: { title: "Time (s)", zeroline: false },
        yaxis: { title: "Amplitude", rangemode: "tozero", zeroline: false },
        legend: { orientation: "h", x: 0, y: -0.24, xanchor: "left", yanchor: "top" },
        hovermode: "closest",
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)"
    };

    Plotly.react( "stepPlot", [inputTrace, outputTrace, point63, point95], layout, { responsive: true, displaylogo: false });

    // Steady-state value, displayed separately from the graph.
    const finalValueBox = document.getElementById("finalValue");
    if (finalValueBox) {
        finalValueBox.innerHTML = `
            <div>
                <div class="metric-label">Final value (KA)</div>
                <div class="metric-note">Steady-state step output</div>
            </div>
            <div class="metric-number">${finalValue.toFixed(3)}</div>
        `;
    }

    // Validation: 63.2% and 95% are rounded lecture values,
    const expected63 = 0.632 * finalValue;
    const expected95 = 0.95 * finalValue;
    const tolerance = 0.001 * Math.abs(finalValue);

    const checks = [
        {
            label: "63.2% at t = τ",
            expected: expected63,
            calculated: calculated63
        },
        {
            label: "95% at t = 3τ",
            expected: expected95,
            calculated: calculated95
        }
    ];

    const rows = checks.map(check => {
        const passed = Math.abs(check.expected - check.calculated) <= tolerance;
        const className = passed ? "pass" : "fail";
        const status = passed ? "PASS" : "FAIL";

        return `
            <tr>
                <th scope="row">${check.label}</th>
                <td>${check.expected.toFixed(5)}</td>
                <td>${check.calculated.toFixed(5)}</td>
                <td><span class="status-pill ${className}">${status}</span></td>
            </tr>
        `;
    }).join("");

    const validationResults = document.getElementById("validationResults");
    if (validationResults) {
        validationResults.innerHTML = `
            <h3>Validation checks</h3>
            <p class="results-note">Expected and calculated values are compared using a small rounding tolerance.</p>
            <div class="results-table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Check</th>
                            <th scope="col">Expected value</th>
                            <th scope="col">Calculated value</th>
                            <th scope="col">Result</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }
}
