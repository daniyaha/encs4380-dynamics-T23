function updateError(K, tau, t) {
    // Calculate the remaining error fraction.
    const errorFraction = t.map(time => Math.exp(-time / tau));

    // ln(exp(-t/tau)) = -t/tau
    const logError = t.map(time => -time / tau);

    // Plot the error fraction using a logarithmic vertical axis.
    Plotly.react("errorPlot", [{
        x: t,
        y: errorFraction,
        mode: "lines",
        name: "Error fraction",
        line: { color: "purple" }
    }], {
        title: { text: "Step Response Error Fraction" },
        xaxis: { title: { text: "Time (s)" } },
        yaxis: {
            title: { text: "Error fraction (log scale)" },
            type: "log"
        },
        margin: { t: 60, b: 60, l: 80, r: 30 }
    }, {
        responsive: true
    });

    // Plot the natural logarithm using ordinary axes.
    Plotly.react("logErrorPlot", [{
        x: t,
        y: logError,
        mode: "lines",
        name: "ln(Error fraction)",
        line: { color: "green" }
    }], {
        title: {
            text: "ln(Error Fraction) — Slope = "
                + (-1 / tau).toFixed(3) + " s⁻¹"
        },
        xaxis: { title: { text: "Time (s)" } },
        yaxis: { title: { text: "ln(Error fraction)" } },
        margin: { t: 60, b: 60, l: 80, r: 30 }
    }, {
        responsive: true
    });
}