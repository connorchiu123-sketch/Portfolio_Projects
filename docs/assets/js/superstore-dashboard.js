// Drives the Superstore dashboard: fetches the pivot-table values pulled
// directly from Sample_Superstore.xlsx (Sales / Profit / Discount sheets) and
// renders them with Chart.js as a recreation of the workbook's own Dashboard
// sheet, which builds the same six charts off the same pivot tables.

const SS_COLORS = {
  blue: "#5b9dff",
  red: "#ff6b6b",
  amber: "#f5a623",
  purple: "#a78bfa",
  green: "#4ade80",
  gold: "#f5c542",
  grid: "rgba(255,255,255,0.06)",
  text: "#93a0b8",
};

Chart.defaults.color = SS_COLORS.text;
Chart.defaults.font.family = "Arial, Helvetica, sans-serif";
Chart.defaults.borderColor = SS_COLORS.grid;
Chart.defaults.animation = false;

function usd(n) {
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function pct(n) {
  return (n * 100).toFixed(1) + "%";
}

async function main() {
  const res = await fetch("assets/data/superstore_data.json");
  if (!res.ok) throw new Error(`superstore_data.json request failed: HTTP ${res.status}`);
  const data = await res.json();

  function renderKpis() {
    const el = document.getElementById("superstore-kpis");
    if (!el) return;
    const tiles = [
      [usd(data.kpis.total_sales), "Total Sales"],
      [usd(data.kpis.total_profit), "Total Profit"],
      [usd(data.kpis.total_discount_dollars), "Total Discount $"],
      [pct(data.kpis.profit_margin_pct), "Overall Profit Margin"],
    ];
    el.innerHTML = tiles.map(([n, l]) => `<div class="metric-box"><div class="val">${n}</div><div class="lbl">${l}</div></div>`).join("");
  }

  function salesTrendChart() {
    const ctx = document.getElementById("chart-sales-trend");
    if (!ctx) return;
    new Chart(ctx, {
      type: "line",
      data: {
        labels: data.sales_by_quarter.map((d) => d.period),
        datasets: [{ data: data.sales_by_quarter.map((d) => d.sales), borderColor: SS_COLORS.blue, backgroundColor: SS_COLORS.blue, tension: 0.35, pointRadius: 3, borderWidth: 2, fill: false }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => usd(c.parsed.y) } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 45 } },
          y: { grid: { color: SS_COLORS.grid }, ticks: { callback: (v) => usd(v) } },
        },
      },
    });
  }

  function profitByCategoryChart() {
    const ctx = document.getElementById("chart-profit-category");
    if (!ctx) return;
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.profit_by_category.map((d) => d.category),
        datasets: [{ data: data.profit_by_category.map((d) => d.profit), backgroundColor: SS_COLORS.green, borderRadius: 4, barThickness: 50 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => usd(c.parsed.y) } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: SS_COLORS.grid }, ticks: { callback: (v) => usd(v) } },
        },
      },
    });
  }

  function quantityByDiscountChart() {
    const ctx = document.getElementById("chart-quantity-discount");
    if (!ctx) return;
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.quantity_by_discount_range.map((d) => d.range),
        datasets: [{ data: data.quantity_by_discount_range.map((d) => d.quantity), backgroundColor: [SS_COLORS.blue, SS_COLORS.amber], borderRadius: 4, barThickness: 60 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.parsed.y.toLocaleString() + " units" } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: SS_COLORS.grid }, ticks: { callback: (v) => v.toLocaleString() } },
        },
      },
    });
  }

  function profitByRegionChart() {
    const ctx = document.getElementById("chart-profit-region");
    if (!ctx) return;
    const years = ["2014", "2015", "2016", "2017"];
    const palette = [SS_COLORS.blue, SS_COLORS.green, SS_COLORS.amber, SS_COLORS.purple];
    const datasets = data.profit_by_region_year.map((r, i) => ({
      label: r.region,
      data: years.map((y) => r[y]),
      borderColor: palette[i],
      backgroundColor: palette[i],
      tension: 0.3,
      pointRadius: 3,
      borderWidth: 2,
      fill: false,
    }));
    new Chart(ctx, {
      type: "line",
      data: { labels: years, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${usd(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: SS_COLORS.grid }, ticks: { callback: (v) => usd(v) } },
        },
      },
    });
  }

  function profitPctByDiscountChart() {
    const ctx = document.getElementById("chart-profit-pct-discount");
    if (!ctx) return;
    const years = data.profit_pct_by_discount_range_year.map((d) => d.year);
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: years,
        datasets: [
          { label: "0-20% Discount", data: data.profit_pct_by_discount_range_year.map((d) => d["0-20% Discount"]), backgroundColor: SS_COLORS.blue, borderRadius: 4 },
          { label: "20%+ Discount", data: data.profit_pct_by_discount_range_year.map((d) => d["20%+ Discount"]), backgroundColor: SS_COLORS.red, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${pct(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: SS_COLORS.grid }, ticks: { callback: (v) => pct(v) } },
        },
      },
    });
  }

  function salesDiscountByYearChart() {
    const ctx = document.getElementById("chart-sales-discount-year");
    if (!ctx) return;
    const years = data.sales_and_discount_by_year.map((d) => d.year);
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: years,
        datasets: [
          { label: "Sales", data: data.sales_and_discount_by_year.map((d) => d.sales), backgroundColor: SS_COLORS.blue, borderRadius: 4, yAxisID: "y" },
          { label: "Discount $", data: data.sales_and_discount_by_year.map((d) => d.discount_dollars), backgroundColor: SS_COLORS.amber, borderRadius: 4, yAxisID: "y" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${usd(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: SS_COLORS.grid }, ticks: { callback: (v) => usd(v) } },
        },
      },
    });
  }

  renderKpis();
  salesTrendChart();
  profitByCategoryChart();
  quantityByDiscountChart();
  profitByRegionChart();
  profitPctByDiscountChart();
  salesDiscountByYearChart();
}

main().catch((err) => {
  console.error("Failed to load Superstore dashboard:", err);

  const isFileProtocol = window.location.protocol === "file:";
  const message = isFileProtocol
    ? `You're opening this page directly as a local file, so the browser blocks it from fetching superstore_data.json (CORS). Serve the docs/ folder over HTTP and reload.`
    : `Something went wrong loading the dashboard data: ${err.message}`;
  const main = document.querySelector("main .wrap");
  if (main) {
    const warn = document.createElement("p");
    warn.style.cssText = "color:#ff6b6b; font-weight:bold;";
    warn.textContent = message;
    main.prepend(warn);
  }
});
