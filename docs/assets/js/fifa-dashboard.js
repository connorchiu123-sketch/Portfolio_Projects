// Drives the FIFA World Cup 2026 dashboard: fetches pre-computed data
// (generated from World_Cup_2026_Real_Performance_Analysis.ipynb) and renders it with Chart.js.
// Every number here traces back to FBref's real 2026 World Cup "Player Standard Stats" table.

const FIFA_COLORS = {
  blue: "#5b9dff",
  red: "#ff6b6b",
  amber: "#f5a623",
  purple: "#a78bfa",
  green: "#4ade80",
  grid: "rgba(255,255,255,0.06)",
  text: "#93a0b8",
};

Chart.defaults.color = FIFA_COLORS.text;
Chart.defaults.font.family = "Arial, Helvetica, sans-serif";
Chart.defaults.borderColor = FIFA_COLORS.grid;
// Draw synchronously instead of animating in — charts far down this long page
// otherwise sometimes miss their first (and only) animation frame.
Chart.defaults.animation = false;

function horizBarChart(canvasId, labels, values, color, xLabel, formatter) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: color, borderRadius: 4, barThickness: 16 }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => (formatter ? formatter(c.parsed.x) : c.parsed.x) } },
      },
      scales: {
        x: {
          grid: { color: FIFA_COLORS.grid },
          ticks: { callback: (v) => (formatter ? formatter(v) : v) },
          title: { display: !!xLabel, text: xLabel, color: FIFA_COLORS.text },
        },
        y: { grid: { display: false } },
      },
    },
  });
}

function renderTable(selector, rows, rowFn) {
  const body = document.querySelector(`${selector} tbody`);
  if (!body) return;
  body.innerHTML = rows.map(rowFn).join("");
}

async function main() {
  const res = await fetch("assets/data/fifa_data.json");
  if (!res.ok) throw new Error(`fifa_data.json request failed: HTTP ${res.status}`);
  const data = await res.json();
  const posColor = (pos) => data.meta.position_colors[pos] || "#888";

  // ---- Overview stats ----
  const statsEl = document.getElementById("overview-stats");
  if (statsEl) {
    const tiles = [
      [data.meta.player_count.toLocaleString(), "Players in the dataset"],
      [data.meta.team_count.toLocaleString(), "National squads"],
      [data.meta.qualified_count.toLocaleString(), "Qualified for efficiency board (≥180 min)"],
      [data.regression.total_model.r2.toFixed(2), "Regression R² (raw output)"],
    ];
    statsEl.innerHTML = tiles
      .map(([num, label]) => `<div class="metric-box"><div class="val">${num}</div><div class="lbl">${label}</div></div>`)
      .join("");
  }

  // ---- Efficiency leaderboard: goal contributions per 90 ----
  const eff = data.efficiency_leaderboard.slice(0, 15);
  horizBarChart(
    "chart-efficiency",
    eff.map((p) => `${p.player_name} (${p.team})`),
    eff.map((p) => p.contrib_per90),
    eff.map((p) => posColor(p.position)),
    "Goal contributions per 90 minutes"
  );

  // ---- Breakout U21 table ----
  renderTable("#table-breakout", data.breakout_u21, (r) => {
    const dot = posColor(r.position);
    return `<tr><td>${r.player_name}</td><td>${r.team}</td><td><span class="pos-dot" style="background:${dot}"></span>${r.position}</td><td>${r.age}</td><td>${r.total_goals_tournament}</td><td>${r.total_assists_tournament}</td><td>${r.goals_plus_assists}</td></tr>`;
  });

  // ---- Impact vs. opportunity table ----
  renderTable("#table-impact-opportunity", data.impact_vs_opportunity, (r) => {
    const dot = posColor(r.position);
    return `<tr><td>${r.player_name}</td><td>${r.team}</td><td><span class="pos-dot" style="background:${dot}"></span>${r.position}</td><td>${r.matches_played}</td><td>${r.starts}</td><td>${r.goals_plus_assists}</td></tr>`;
  });

  // ---- Discipline by position ----
  const disc = data.discipline_by_position;
  horizBarChart(
    "chart-discipline",
    disc.map((d) => d.position),
    disc.map((d) => d.cards_per90),
    disc.map((d) => posColor(d.position)),
    "Average cards per 90 (min. 3.0 nineties)",
    (v) => v.toFixed(2)
  );

  renderTable("#table-discipline", data.discipline_leaderboard, (r) => {
    const dot = posColor(r.position);
    return `<tr><td>${r.player_name}</td><td>${r.team}</td><td><span class="pos-dot" style="background:${dot}"></span>${r.position}</td><td>${r.yellow_cards_tournament}</td><td>${r.red_cards_tournament}</td><td>${r.cards_per90.toFixed(2)}</td></tr>`;
  });

  // ---- Impact Score leaderboard (overall, FW/MF only) ----
  const impact = data.impact_score_leaderboard.slice(0, 15);
  horizBarChart(
    "chart-impact-score",
    impact.map((p) => `${p.player_name} (${p.team})`),
    impact.map((p) => p.impact_score),
    impact.map((p) => posColor(p.position)),
    "Tournament Impact Score (0-100)"
  );

  // ---- Impact Score by position tabs ----
  let positionChart = null;
  function renderPositionChart(pos) {
    const rows = data.impact_score_by_position[pos] || [];
    const color = posColor(pos);
    if (positionChart) positionChart.destroy();
    positionChart = horizBarChart(
      "chart-position",
      rows.map((r) => `${r.player_name} (${r.team})`),
      rows.map((r) => r.impact_score),
      color,
      "Impact Score"
    );
    document.getElementById("position-chart-title").textContent = `Top ${rows.length} ${pos}s`;
  }
  renderPositionChart("Forward");

  document.querySelectorAll("#position-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#position-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderPositionChart(btn.dataset.pos);
    });
  });

  // ---- Regression: rate model vs. total model metrics ----
  function fillMetrics(elId, metrics) {
    const el = document.getElementById(elId);
    if (!el) return;
    const tiles = [
      [metrics.r2.toFixed(3), "R²"],
      [metrics.mae.toFixed(3), "MAE"],
    ];
    el.innerHTML = tiles
      .map(([num, label]) => `<div class="metric-box"><div class="val" style="font-size:1.3rem;">${num}</div><div class="lbl">${label}</div></div>`)
      .join("");
  }
  fillMetrics("metrics-rate", data.regression.rate_model);
  fillMetrics("metrics-total", data.regression.total_model);

  // ---- Regression coefficients ----
  const coefs = data.regression.coefficients;
  const ctxCoef = document.getElementById("chart-coefficients");
  if (ctxCoef) {
    new Chart(ctxCoef, {
      type: "bar",
      data: {
        labels: coefs.map((c) => c.feature),
        datasets: [{
          data: coefs.map((c) => c.coefficient),
          backgroundColor: coefs.map((c) => (c.coefficient >= 0 ? FIFA_COLORS.green : FIFA_COLORS.red)),
          borderRadius: 4,
          barThickness: 20,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: FIFA_COLORS.grid }, title: { display: true, text: "Linear regression coefficient (goal contributions)", color: FIFA_COLORS.text } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  // ---- Predicted vs. actual scatter ----
  const scatterCtx = document.getElementById("chart-scatter");
  if (scatterCtx) {
    const points = data.regression.scatter;
    const maxVal = Math.max(...points.map((p) => Math.max(p.actual, p.predicted)));
    new Chart(scatterCtx, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Test-set players",
            data: points.map((p) => ({ x: p.actual, y: p.predicted })),
            backgroundColor: FIFA_COLORS.blue + "aa",
            pointRadius: 4,
          },
          {
            type: "line",
            label: "Perfect prediction",
            data: [{ x: 0, y: 0 }, { x: maxVal, y: maxVal }],
            borderColor: "#6b7690",
            borderDash: [6, 6],
            pointRadius: 0,
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { boxWidth: 10 } } },
        scales: {
          x: { title: { display: true, text: "Actual goal contributions (tournament total)", color: FIFA_COLORS.text }, grid: { color: FIFA_COLORS.grid } },
          y: { title: { display: true, text: "Predicted goal contributions", color: FIFA_COLORS.text }, grid: { color: FIFA_COLORS.grid } },
        },
      },
    });
  }
}

main().catch((err) => {
  console.error("Failed to load FIFA dashboard data:", err);

  const isFileProtocol = window.location.protocol === "file:";
  const message = isFileProtocol
    ? `You're opening this page directly as a local file, so the browser blocks it from
       loading <code>fifa_data.json</code> (a CORS restriction on <code>file://</code> pages).
       This works correctly once the site is deployed to GitHub Pages. To preview it
       locally in the meantime, serve the <code>docs</code> folder over HTTP, e.g.:
       <br><br><code>python -m http.server 8000 --directory docs</code><br>
       then open <code>http://localhost:8000/fifa-world-cup.html</code>.`
    : `Something went wrong loading the dashboard data (${err.message}). Check the browser console for details.`;

  document.querySelectorAll("section.case-section").forEach((section) => (section.innerHTML = ""));

  const firstSection = document.querySelector("section.case-section");
  if (firstSection) {
    firstSection.insertAdjacentHTML(
      "afterend",
      `<section class="case-section"><div class="wrap"><div class="placeholder-panel">
        <div class="big-icon">⚠️</div>
        <h3>Dashboard data didn't load</h3>
        <p>${message}</p>
      </div></div></section>`
    );
  }
});
