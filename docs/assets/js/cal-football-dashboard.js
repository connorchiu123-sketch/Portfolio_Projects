// Drives the Cal Football Operations dashboard: fetches raw row-level data
// (extracted from Cal_Football_Business_Operations_Dataset.xlsx), aggregates it
// client-side, and renders it with Chart.js. Clicking a bar in the "Average
// Stadium Capacity by Season" chart cross-filters every other panel to that
// season, mirroring how a Power BI slicer visual behaves.

const CAL_COLORS = {
  blue: "#5b9dff",
  red: "#ff6b6b",
  amber: "#f5a623",
  purple: "#a78bfa",
  green: "#4ade80",
  gold: "#f5c542",
  grid: "rgba(255,255,255,0.06)",
  text: "#93a0b8",
  dim: "#2a3350",
};

const CAL_PALETTE = [CAL_COLORS.blue, CAL_COLORS.green, CAL_COLORS.amber, CAL_COLORS.purple, CAL_COLORS.red, CAL_COLORS.gold];

Chart.defaults.color = CAL_COLORS.text;
Chart.defaults.font.family = "Arial, Helvetica, sans-serif";
Chart.defaults.borderColor = CAL_COLORS.grid;
Chart.defaults.animation = false;

function usd(n) {
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

function pct(n) {
  return (n * 100).toFixed(1) + "%";
}

function sumBy(rows, key) {
  return rows.reduce((s, r) => s + r[key], 0);
}

function avgBy(rows, key) {
  return rows.length ? sumBy(rows, key) / rows.length : 0;
}

function groupSum(rows, groupKey, valueKey) {
  const map = new Map();
  for (const r of rows) {
    map.set(r[groupKey], (map.get(r[groupKey]) || 0) + r[valueKey]);
  }
  return [...map.entries()].map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);
}

async function main() {
  const res = await fetch("assets/data/cal_football_data.json");
  if (!res.ok) throw new Error(`cal_football_data.json request failed: HTTP ${res.status}`);
  const { raw } = await res.json();

  const seasons = [...new Set(raw.games.map((g) => g.season))].sort();
  let selectedSeason = null; // null = all seasons combined

  function filtered(rows) {
    return selectedSeason ? rows.filter((r) => r.season === selectedSeason) : rows;
  }

  // ---- Chart instances (created once, updated on filter change) ----
  let ticketChart, gamedayChart, capacityChart;

  function renderKpis() {
    const games = filtered(raw.games);
    const tickets = filtered(raw.tickets);
    const gameday = filtered(raw.gameday);
    const statsEl = document.getElementById("overview-stats");
    if (!statsEl) return;
    const tiles = [
      [usd(sumBy(tickets, "revenue")), "Total ticket revenue"],
      [usd(sumBy(gameday, "revenue")), "Total gameday revenue"],
      [pct(avgBy(games, "capacity_pct")), "Average stadium capacity"],
      [sumBy(games, "attendance").toLocaleString(), "Total home attendance"],
    ];
    statsEl.innerHTML = tiles
      .map(([num, label]) => `<div class="metric-box"><div class="val">${num}</div><div class="lbl">${label}</div></div>`)
      .join("");
  }

  function renderTicketChart() {
    const byTier = groupSum(filtered(raw.tickets), "tier", "revenue");
    const labels = byTier.map((d) => d.key);
    const values = byTier.map((d) => d.value);
    if (!ticketChart) {
      const ctx = document.getElementById("chart-ticket-tier");
      if (!ctx) return;
      ticketChart = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ data: values, backgroundColor: CAL_COLORS.blue, borderRadius: 4, barThickness: 20 }] },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => usd(c.parsed.x) } },
          },
          scales: {
            x: { grid: { color: CAL_COLORS.grid }, ticks: { callback: (v) => usd(v) } },
            y: { grid: { display: false } },
          },
        },
      });
    } else {
      ticketChart.data.labels = labels;
      ticketChart.data.datasets[0].data = values;
      ticketChart.update();
    }
  }

  function renderGamedayChart() {
    const byCat = groupSum(filtered(raw.gameday), "category", "revenue");
    const labels = byCat.map((d) => d.key);
    const values = byCat.map((d) => d.value);
    if (!gamedayChart) {
      const ctx = document.getElementById("chart-gameday-category");
      if (!ctx) return;
      gamedayChart = new Chart(ctx, {
        type: "doughnut",
        data: { labels, datasets: [{ data: values, backgroundColor: CAL_PALETTE, borderColor: "#141a2b", borderWidth: 2 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c) => `${c.label}: ${usd(c.parsed)}` } },
          },
        },
      });
    } else {
      gamedayChart.data.labels = labels;
      gamedayChart.data.datasets[0].data = values;
      gamedayChart.update();
    }
  }

  function renderCapacityChart() {
    // This chart is the slicer: it always shows all seasons, but highlights
    // the selected one (or all, in the accent color, if nothing is selected).
    const bySeason = seasons.map((s) => ({
      season: s,
      avg: avgBy(
        raw.games.filter((g) => g.season === s),
        "capacity_pct"
      ),
    }));
    const colors = bySeason.map((d) => (!selectedSeason || d.season === selectedSeason ? CAL_COLORS.green : CAL_COLORS.dim));

    if (!capacityChart) {
      const ctx = document.getElementById("chart-capacity-season");
      if (!ctx) return;
      capacityChart = new Chart(ctx, {
        type: "bar",
        data: { labels: bySeason.map((d) => d.season), datasets: [{ data: bySeason.map((d) => d.avg), backgroundColor: colors, borderRadius: 4, barThickness: 60 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (evt, elements) => {
            if (!elements.length) return;
            const clickedSeason = bySeason[elements[0].index].season;
            selectedSeason = selectedSeason === clickedSeason ? null : clickedSeason;
            renderAll();
          },
          onHover: (evt, elements) => {
            evt.native.target.style.cursor = elements.length ? "pointer" : "default";
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => pct(c.parsed.y) } },
          },
          scales: {
            y: { grid: { color: CAL_COLORS.grid }, ticks: { callback: (v) => pct(v) }, suggestedMax: 1 },
            x: { grid: { display: false } },
          },
        },
      });
    } else {
      capacityChart.data.datasets[0].data = bySeason.map((d) => d.avg);
      capacityChart.data.datasets[0].backgroundColor = colors;
      capacityChart.update();
    }
  }

  function renderTable() {
    const tbody = document.querySelector("#table-attendance-opponent tbody");
    if (!tbody) return;
    const byOpponent = groupSum(filtered(raw.games), "opponent", "attendance").sort((a, b) => a.key.localeCompare(b.key));
    const gameCounts = new Map();
    for (const g of filtered(raw.games)) gameCounts.set(g.opponent, (gameCounts.get(g.opponent) || 0) + 1);
    const total = sumBy(filtered(raw.games), "attendance");
    tbody.innerHTML =
      byOpponent.map((d) => `<tr><td>${d.key}</td><td>${gameCounts.get(d.key)}</td><td>${d.value.toLocaleString()}</td></tr>`).join("") +
      `<tr><td><strong>Total</strong></td><td><strong>${filtered(raw.games).length}</strong></td><td><strong>${total.toLocaleString()}</strong></td></tr>`;
  }

  function renderFilterStatus() {
    const el = document.getElementById("season-filter-status");
    if (!el) return;
    if (selectedSeason) {
      el.innerHTML = `Filtered to the <strong style="color:${CAL_COLORS.green}">${selectedSeason}</strong> season &mdash; <a href="#" id="season-filter-clear" style="color:${CAL_COLORS.blue}; font-weight:bold;">clear filter</a>`;
      const clearLink = document.getElementById("season-filter-clear");
      if (clearLink) {
        clearLink.addEventListener("click", (e) => {
          e.preventDefault();
          selectedSeason = null;
          renderAll();
        });
      }
    } else {
      el.textContent = "Showing all seasons — click a bar below to filter the whole dashboard by season.";
    }
  }

  function renderAll() {
    renderKpis();
    renderTicketChart();
    renderGamedayChart();
    renderCapacityChart();
    renderTable();
    renderFilterStatus();
  }

  renderAll();
}

main().catch((err) => console.error("Cal Football dashboard failed to load:", err));
