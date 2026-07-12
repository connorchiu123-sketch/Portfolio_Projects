// Drives the FIFA World Cup 2026 dashboard: fetches pre-computed data
// (generated from World_Cup_Research_Dashboard.ipynb) and renders it with Chart.js.

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

function eur(n) {
  if (Math.abs(n) >= 1e6) return "€" + (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return "€" + (n / 1e3).toFixed(0) + "K";
  return "€" + n.toFixed(0);
}

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

async function main() {
  const res = await fetch("assets/data/fifa_data.json");
  if (!res.ok) throw new Error(`fifa_data.json request failed: HTTP ${res.status}`);
  const data = await res.json();

  // ---- Overview stats ----
  const statsEl = document.getElementById("overview-stats");
  if (statsEl) {
    const tiles = [
      [data.meta.row_count.toLocaleString(), "Match rows crunched"],
      [data.meta.player_count.toLocaleString(), "Players profiled"],
      [data.meta.team_count.toLocaleString(), "Squads compared"],
      [data.model_comparison.random_forest.r2.toFixed(2), "Model R² on held-out data"],
    ];
    statsEl.innerHTML = tiles
      .map(([num, label]) => `<div class="metric-box"><div class="val">${num}</div><div class="lbl">${label}</div></div>`)
      .join("");
  }

  // ---- Section: Team Dashboard ----
  const top15Teams = data.teams.slice(0, 15);
  horizBarChart("chart-team-value", top15Teams.map((t) => t.team), top15Teams.map((t) => t.total_market_value_eur), FIFA_COLORS.blue, "Total market value", eur);
  horizBarChart("chart-team-goals", top15Teams.map((t) => t.team), top15Teams.map((t) => t.total_goals), FIFA_COLORS.green, "Goals");
  horizBarChart("chart-team-pass", top15Teams.map((t) => t.team), top15Teams.map((t) => t.avg_pass_accuracy), FIFA_COLORS.purple, "Pass accuracy (0-1)");
  horizBarChart("chart-team-cards", top15Teams.map((t) => t.team), top15Teams.map((t) => t.total_cards), FIFA_COLORS.red, "Cards");

  // ---- Radar: top 5 teams ----
  const radarCtx = document.getElementById("chart-team-radar");
  if (radarCtx) {
    const radar = data.radar_top5_teams;
    const palette = [FIFA_COLORS.blue, FIFA_COLORS.green, FIFA_COLORS.amber, FIFA_COLORS.red, FIFA_COLORS.purple];
    new Chart(radarCtx, {
      type: "radar",
      data: {
        labels: radar.labels,
        datasets: radar.teams.map((t, i) => ({
          label: t.team,
          data: t.values,
          borderColor: palette[i % palette.length],
          backgroundColor: palette[i % palette.length] + "22",
          pointBackgroundColor: palette[i % palette.length],
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { boxWidth: 10 } } },
        scales: {
          r: {
            angleLines: { color: FIFA_COLORS.grid },
            grid: { color: FIFA_COLORS.grid },
            pointLabels: { color: FIFA_COLORS.text },
            ticks: { display: false, backdropColor: "transparent" },
            suggestedMin: 0,
            suggestedMax: 100,
          },
        },
      },
    });
  }

  // ---- Interactive team explorer ----
  const teamSelect = document.getElementById("team-select");
  let explorerChart = null;
  if (teamSelect) {
    const teamNames = data.teams.map((t) => t.team).sort();
    teamSelect.innerHTML = teamNames.map((t) => `<option value="${t}">${t}</option>`).join("");

    function renderExplorer(teamName) {
      const row = data.teams.find((t) => t.team === teamName);
      const avg = data.tournament_avg;
      // Raw units differ wildly (euros in the hundreds of millions vs. a 0-1 pass
      // accuracy), so every metric is expressed as % of the tournament average —
      // that keeps all five bars on one meaningful, comparable scale.
      const rawMetrics = [
        ["Total Market Value", row.total_market_value_eur, avg.total_market_value_eur, eur],
        ["Total Goals", row.total_goals, avg.total_goals, (v) => v.toFixed(0)],
        ["Avg Pass Accuracy", row.avg_pass_accuracy, avg.avg_pass_accuracy, (v) => v.toFixed(2)],
        ["Avg Player Rating", row.avg_player_rating, avg.avg_player_rating, (v) => v.toFixed(2)],
        ["Avg Distance Covered (km)", row.avg_distance_km, avg.avg_distance_km, (v) => v.toFixed(2)],
      ];
      const teamPct = rawMetrics.map((m) => (m[1] / m[2]) * 100);
      const ctx = document.getElementById("chart-team-explorer");
      if (explorerChart) explorerChart.destroy();
      explorerChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: rawMetrics.map((m) => m[0]),
          datasets: [
            { label: teamName, data: teamPct, backgroundColor: FIFA_COLORS.blue, borderRadius: 4 },
            { label: "Tournament average", data: rawMetrics.map(() => 100), backgroundColor: "#4a5578", borderRadius: 4 },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { boxWidth: 10 } },
            tooltip: {
              callbacks: {
                label: (c) => {
                  const [label, teamVal, avgVal, fmt] = rawMetrics[c.dataIndex];
                  const raw = c.datasetIndex === 0 ? teamVal : avgVal;
                  return `${c.dataset.label}: ${fmt(raw)} (${c.parsed.x.toFixed(0)}% of avg)`;
                },
              },
            },
          },
          scales: {
            x: { grid: { color: FIFA_COLORS.grid }, title: { display: true, text: "% of tournament average", color: FIFA_COLORS.text } },
            y: { grid: { display: false } },
          },
        },
      });
      document.getElementById("team-explorer-meta").textContent =
        `Squad size: ${row.squad_size} players   |   Average age: ${row.avg_age.toFixed(1)}`;
    }

    teamSelect.addEventListener("change", () => renderExplorer(teamSelect.value));
    renderExplorer(teamNames[0]);
  }

  // ---- Value Score leaderboard ----
  horizBarChart(
    "chart-top15",
    data.top15_players.map((p) => `${p.player_name} (${p.team})`),
    data.top15_players.map((p) => p.value_score),
    FIFA_COLORS.blue,
    "Value Score (0-100)"
  );

  let positionChart = null;
  function renderPositionChart(pos) {
    const rows = data.top_by_position[pos] || [];
    const color = data.meta.position_colors[pos] || FIFA_COLORS.blue;
    if (positionChart) positionChart.destroy();
    positionChart = horizBarChart(
      "chart-position",
      rows.map((r) => `${r.player_name} (${r.team})`),
      rows.map((r) => r.value_score),
      color,
      "Value Score"
    );
    document.getElementById("position-chart-title").textContent = `Top 8 ${pos}s`;
  }
  renderPositionChart("Forward");

  document.querySelectorAll("#position-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#position-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderPositionChart(btn.dataset.pos);
    });
  });

  // ---- Best per team table ----
  const bestPerTeamBody = document.querySelector("#table-best-per-team tbody");
  if (bestPerTeamBody) {
    bestPerTeamBody.innerHTML = data.best_per_team_top10
      .map((r) => {
        const dot = data.meta.position_colors[r.position] || "#888";
        return `<tr><td>${r.team}</td><td>${r.player_name}</td><td><span class="pos-dot" style="background:${dot}"></span>${r.position}</td><td>${r.value_score.toFixed(1)}</td></tr>`;
      })
      .join("");
  }

  // ---- Correlation with market value ----
  const corr = data.correlation_with_value;
  const ctxCorr = document.getElementById("chart-correlation");
  if (ctxCorr) {
    new Chart(ctxCorr, {
      type: "bar",
      data: {
        labels: corr.map((c) => c.metric),
        datasets: [{ data: corr.map((c) => c.correlation), backgroundColor: corr.map((c) => (c.correlation >= 0 ? FIFA_COLORS.green : FIFA_COLORS.red)), borderRadius: 4, barThickness: 14 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: FIFA_COLORS.grid }, title: { display: true, text: "Pearson correlation with log market value", color: FIFA_COLORS.text } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  // ---- Model metrics + feature importance ----
  function fillMetrics(elId, metrics) {
    const el = document.getElementById(elId);
    if (!el) return;
    const tiles = [
      [eur(metrics.mae), "MAE"],
      [eur(metrics.rmse), "RMSE"],
      [metrics.r2.toFixed(3), "R²"],
    ];
    el.innerHTML = tiles
      .map(([num, label]) => `<div class="metric-box"><div class="val" style="font-size:1.3rem;">${num}</div><div class="lbl">${label}</div></div>`)
      .join("");
  }
  fillMetrics("metrics-linear", data.model_comparison.linear_regression);
  fillMetrics("metrics-rf", data.model_comparison.random_forest);

  const importance = data.feature_importance.slice(0, 12);
  horizBarChart("chart-importance", importance.map((f) => f.feature), importance.map((f) => f.importance), FIFA_COLORS.blue, "Relative importance");

  // ---- Best deals ----
  const bestDeals = data.best_deals_top15;
  horizBarChart(
    "chart-best-deals",
    bestDeals.map((b) => `${b.player_name} (${b.team})`),
    bestDeals.map((b) => b.value_gap_pct),
    FIFA_COLORS.green,
    "Projected value gap (%)",
    (v) => v.toFixed(0) + "%"
  );

  const scatterCtx = document.getElementById("chart-scatter");
  if (scatterCtx) {
    const byPos = {};
    data.current_vs_projected_scatter.forEach((p) => {
      byPos[p.position] = byPos[p.position] || [];
      byPos[p.position].push({ x: p.market_value_eur, y: p.projected_2027_value });
    });
    const maxVal = Math.max(...data.current_vs_projected_scatter.map((p) => Math.max(p.market_value_eur, p.projected_2027_value)));
    const datasets = Object.entries(byPos).map(([pos, points]) => ({
      label: pos,
      data: points,
      backgroundColor: (data.meta.position_colors[pos] || "#888") + "aa",
      pointRadius: 4,
    }));
    datasets.push({ type: "line", label: "No change", data: [{ x: 0, y: 0 }, { x: maxVal, y: maxVal }], borderColor: "#6b7690", borderDash: [6, 6], pointRadius: 0, borderWidth: 1.5 });
    new Chart(scatterCtx, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { boxWidth: 10 } } },
        scales: {
          x: { title: { display: true, text: "Current market value", color: FIFA_COLORS.text }, ticks: { callback: (v) => eur(v) }, grid: { color: FIFA_COLORS.grid } },
          y: { title: { display: true, text: "Projected 2027 value", color: FIFA_COLORS.text }, ticks: { callback: (v) => eur(v) }, grid: { color: FIFA_COLORS.grid } },
        },
      },
    });
  }

  const bestDealBody = document.querySelector("#table-best-deal-per-team tbody");
  if (bestDealBody) {
    bestDealBody.innerHTML = data.best_deal_per_team_top15
      .map(
        (r) => `<tr><td>${r.team}</td><td>${r.player_name}</td><td>${r.position}</td><td>${r.age}</td><td>${eur(r.market_value_eur)}</td><td>${eur(r.projected_2027_value)}</td><td style="color:${r.value_gap_pct >= 0 ? FIFA_COLORS.green : FIFA_COLORS.red}">${r.value_gap_pct.toFixed(1)}%</td></tr>`
      )
      .join("");
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
