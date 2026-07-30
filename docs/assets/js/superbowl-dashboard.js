// Drives the Super Bowl Operations dashboard: fetches raw row-level data
// (mirroring the SuperBowlOps SQL Server star schema's sample data), aggregates
// it client-side, and renders it with Chart.js as a recreation of the Power BI
// report built on top of that schema.

const SB_COLORS = {
  blue: "#5b9dff",
  red: "#ff6b6b",
  amber: "#f5a623",
  purple: "#a78bfa",
  green: "#4ade80",
  gold: "#f5c542",
  teal: "#38bdf8",
  grid: "rgba(255,255,255,0.06)",
  text: "#93a0b8",
  dim: "#2a3350",
};

const SB_PALETTE = [SB_COLORS.blue, SB_COLORS.green, SB_COLORS.amber, SB_COLORS.purple, SB_COLORS.red, SB_COLORS.gold, SB_COLORS.teal];
const SEVERITY_COLORS = { High: SB_COLORS.teal, Low: SB_COLORS.dim, Medium: SB_COLORS.amber };

Chart.defaults.color = SB_COLORS.text;
Chart.defaults.font.family = "Arial, Helvetica, sans-serif";
Chart.defaults.borderColor = SB_COLORS.grid;
Chart.defaults.animation = false;

function usd(n) {
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function num(n) {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
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

function groupAvg(rows, groupKey, valueKey) {
  const sums = new Map();
  const counts = new Map();
  for (const r of rows) {
    sums.set(r[groupKey], (sums.get(r[groupKey]) || 0) + r[valueKey]);
    counts.set(r[groupKey], (counts.get(r[groupKey]) || 0) + 1);
  }
  return [...sums.entries()].map(([k, v]) => ({ key: k, value: v / counts.get(k) })).sort((a, b) => b.value - a.value);
}

function horizBarChart(canvasId, labels, values, color, tooltipFmt) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  return new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 4, barThickness: 20 }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => (tooltipFmt ? tooltipFmt(c.parsed.x) : c.parsed.x) } },
      },
      scales: {
        x: { grid: { color: SB_COLORS.grid }, ticks: { callback: (v) => (tooltipFmt ? tooltipFmt(v) : v) } },
        y: { grid: { display: false } },
      },
    },
  });
}

function vertBarChart(canvasId, labels, values, colors, tooltipFmt) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  return new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, barThickness: 28 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => (tooltipFmt ? tooltipFmt(c.parsed.y) : c.parsed.y) } },
      },
      scales: {
        y: { grid: { color: SB_COLORS.grid }, ticks: { callback: (v) => (tooltipFmt ? tooltipFmt(v) : v) } },
        x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 30, minRotation: 0 } },
      },
    },
  });
}

async function main() {
  const res = await fetch("assets/data/superbowl_data.json");
  if (!res.ok) throw new Error(`superbowl_data.json request failed: HTTP ${res.status}`);
  const { raw } = await res.json();

  // ============================= KPI CARDS ===============================

  function renderKpis() {
    const el = document.getElementById("revenue-kpis");
    if (!el) return;
    const totalTicketRevenue = sumBy(raw.ticket_sales, "revenue");
    const totalQty = sumBy(raw.ticket_sales, "qty");
    const revenuePerFan = totalTicketRevenue / totalQty;
    const avgTicketsSold = totalQty / raw.ticket_sales.length;
    const tiles = [
      [usd(totalTicketRevenue), "Total Ticket Revenue"],
      [usd(revenuePerFan), "Revenue Per Fan"],
      [avgTicketsSold.toFixed(2), "Average Tickets Sold"],
    ];
    el.innerHTML = tiles.map(([n, l]) => `<div class="metric-box"><div class="val">${n}</div><div class="lbl">${l}</div></div>`).join("");
  }

  // ======================= REVENUE & SPONSORSHIP ==========================

  function renderTicketTierChart() {
    const byTier = groupSum(raw.ticket_sales, "tier", "revenue");
    horizBarChart("chart-ticket-tier", byTier.map((d) => d.key), byTier.map((d) => d.value), SB_COLORS.blue, usd);
  }

  function renderConcessionCategoryChart() {
    // Sum of sponsorship revenue by sponsor category (matches the source report's panel).
    const byCat = groupSum(raw.sponsorship_revenue, "category", "amount");
    vertBarChart("chart-concession-category", byCat.map((d) => d.key), byCat.map((d) => d.value), SB_COLORS.blue, usd);
  }

  function renderRevenuePerSponsorChart() {
    const byTier = groupSum(raw.sponsorship_revenue, "sponsorship_tier", "amount");
    vertBarChart("chart-revenue-per-sponsor", byTier.map((d) => d.key), byTier.map((d) => d.value), SB_COLORS.blue, usd);
  }

  function renderSponsorChannelChart() {
    // Sum of ticket revenue by sales channel (matches the source report's panel).
    const byChannel = groupSum(raw.ticket_sales, "channel", "revenue");
    horizBarChart("chart-sponsor-channel", byChannel.map((d) => d.key), byChannel.map((d) => d.value), SB_COLORS.blue, usd);
  }

  function renderConcessionEntryHourChart() {
    const hours = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    const categories = ["Beverage - Alcoholic", "Beverage - Non-Alcoholic", "Food", "Merchandise"];
    const catColors = { "Beverage - Alcoholic": SB_COLORS.blue, "Beverage - Non-Alcoholic": SB_COLORS.dim, Food: SB_COLORS.amber, Merchandise: SB_COLORS.purple };
    const ctx = document.getElementById("chart-concession-entry-hour");
    if (!ctx) return;
    const datasets = categories.map((cat) => ({
      label: cat,
      data: hours.map((h) => sumBy(raw.concessions.filter((c) => c.category === cat && c.entry_hour === h), "revenue")),
      borderColor: catColors[cat],
      backgroundColor: catColors[cat],
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 2,
    }));
    new Chart(ctx, {
      type: "line",
      data: { labels: hours, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${usd(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false }, title: { display: true, text: "Entry Hour", color: SB_COLORS.text } },
          y: { grid: { color: SB_COLORS.grid }, ticks: { callback: (v) => usd(v) } },
        },
      },
    });
  }

  // ==================== OPERATIONS & FAN EXPERIENCE =======================

  function renderWaitTimeZoneTable() {
    const tbody = document.querySelector("#table-wait-zone tbody");
    if (!tbody) return;
    const byZone = groupAvg(raw.gate_entries, "zone", "avg_wait_time_minutes");
    const total = avgBy(raw.gate_entries, "avg_wait_time_minutes");
    tbody.innerHTML =
      byZone.map((d) => `<tr><td>${d.key}</td><td>${d.value.toFixed(2)}</td></tr>`).join("") +
      `<tr><td><strong>Total</strong></td><td><strong>${total.toFixed(2)}</strong></td></tr>`;
  }

  function renderWaitTimeHourTable() {
    const tbody = document.querySelector("#table-wait-hour tbody");
    if (!tbody) return;
    const byHour = groupAvg(raw.gate_entries, "entry_hour", "avg_wait_time_minutes");
    const total = avgBy(raw.gate_entries, "avg_wait_time_minutes");
    tbody.innerHTML =
      byHour.map((d) => `<tr><td>${d.key}</td><td>${d.value.toFixed(2)}</td></tr>`).join("") +
      `<tr><td><strong>Total</strong></td><td><strong>${total.toFixed(2)}</strong></td></tr>`;
  }

  function renderIncidentsStackedChart() {
    const ctx = document.getElementById("chart-incidents-stacked");
    if (!ctx) return;
    const gateOrder = [...new Set(raw.security_incidents.map((i) => i.gate))].sort((a, b) => {
      const countA = raw.security_incidents.filter((i) => i.gate === a).length;
      const countB = raw.security_incidents.filter((i) => i.gate === b).length;
      return countB - countA;
    });
    const severities = ["Low", "Medium", "High"];
    const datasets = severities.map((sev) => ({
      label: sev,
      data: gateOrder.map((g) => raw.security_incidents.filter((i) => i.gate === g && i.severity === sev).length),
      backgroundColor: SEVERITY_COLORS[sev],
      borderRadius: 2,
    }));
    new Chart(ctx, {
      type: "bar",
      data: { labels: gateOrder, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, grid: { color: SB_COLORS.grid }, title: { display: true, text: "Count of incident_id", color: SB_COLORS.text } },
        },
      },
    });
  }

  function renderIncidentsScatterChart() {
    const ctx = document.getElementById("chart-incidents-scatter");
    if (!ctx) return;
    const severities = ["Low", "Medium", "High"];
    const datasets = severities.map((sev) => ({
      label: sev,
      data: raw.security_incidents.filter((i) => i.severity === sev).map((i) => ({ x: i.incident_hour, y: i.response_time_minutes })),
      backgroundColor: SEVERITY_COLORS[sev],
      pointRadius: 5,
    }));

    // Simple linear regression trend line across all incidents.
    const pts = raw.security_incidents.map((i) => ({ x: i.incident_hour, y: i.response_time_minutes }));
    const n = pts.length;
    const meanX = sumBy(pts, "x") / n;
    const meanY = sumBy(pts, "y") / n;
    const slope = pts.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0) / pts.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
    const intercept = meanY - slope * meanX;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    datasets.push({
      type: "line",
      label: "Trend",
      data: [
        { x: minX, y: slope * minX + intercept },
        { x: maxX, y: slope * maxX + intercept },
      ],
      borderColor: "#6b7690",
      borderDash: [6, 6],
      pointRadius: 0,
      borderWidth: 1.5,
    });

    new Chart(ctx, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { title: { display: true, text: "Incident Hour", color: SB_COLORS.text }, grid: { color: SB_COLORS.grid } },
          y: { title: { display: true, text: "Response Time", color: SB_COLORS.text }, grid: { color: SB_COLORS.grid } },
        },
      },
    });
  }

  // ========================== COST & BUDGET ===============================

  function renderBudgetWaterfallChart() {
    const ctx = document.getElementById("chart-budget-waterfall");
    if (!ctx) return;
    const byDept = groupSum(raw.department_budget, "department", "budgeted_amount");
    const total = sumBy(byDept, "value");
    const labels = [...byDept.map((d) => d.key), "Total"];
    let running = 0;
    const floats = byDept.map((d) => {
      const bar = [running, running + d.value];
      running += d.value;
      return bar;
    });
    floats.push([0, total]);
    const colors = [...byDept.map(() => SB_COLORS.green), SB_COLORS.blue];
    new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ data: floats, backgroundColor: colors, borderRadius: 4, barThickness: 36 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => usd(c.raw[1] - c.raw[0]) } },
        },
        scales: {
          y: { grid: { color: SB_COLORS.grid }, ticks: { callback: (v) => usd(v) } },
          x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 30 } },
        },
      },
    });
  }

  function renderVendorContractChart() {
    const byVendor = groupSum(raw.vendors.map((v) => ({ key: v.name, value: v.contract_amount })), "key", "value");
    horizBarChart("chart-vendor-contract", byVendor.map((d) => d.key), byVendor.map((d) => d.value), SB_COLORS.blue, usd);
  }

  function renderCostPieChart() {
    const ctx = document.getElementById("chart-cost-pie");
    if (!ctx) return;
    const byDept = groupSum(raw.staffing_cost, "department", "total_cost");
    const total = sumBy(byDept, "value");
    new Chart(ctx, {
      type: "pie",
      data: {
        labels: byDept.map((d) => d.key),
        datasets: [{ data: byDept.map((d) => d.value), backgroundColor: SB_PALETTE, borderColor: "#141a2b", borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${usd(c.parsed)} (${((c.parsed / total) * 100).toFixed(2)}%)` } },
        },
      },
    });
  }

  renderKpis();
  renderTicketTierChart();
  renderConcessionCategoryChart();
  renderRevenuePerSponsorChart();
  renderSponsorChannelChart();
  renderConcessionEntryHourChart();
  renderWaitTimeZoneTable();
  renderWaitTimeHourTable();
  renderIncidentsStackedChart();
  renderIncidentsScatterChart();
  renderBudgetWaterfallChart();
  renderVendorContractChart();
  renderCostPieChart();
}

main().catch((err) => {
  console.error("Failed to load Super Bowl Operations dashboard:", err);

  const isFileProtocol = window.location.protocol === "file:";
  const message = isFileProtocol
    ? `You're opening this page directly as a local file, so the browser blocks it from fetching superbowl_data.json (CORS). Serve the docs/ folder over HTTP (e.g. "python -m http.server" from docs/) and reload.`
    : `Something went wrong loading the dashboard data: ${err.message}`;
  const main = document.querySelector("main .wrap");
  if (main) {
    const warn = document.createElement("p");
    warn.style.cssText = "color:#ff6b6b; font-weight:bold;";
    warn.textContent = message;
    main.prepend(warn);
  }
});
