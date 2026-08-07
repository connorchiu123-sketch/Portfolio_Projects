// Drives the Superstore Power BI recreation: loads the same 9,994 order-line
// rows behind SuperStore_Dataset.pbix (dictionary-encoded to keep the JSON
// small), decodes them into plain row objects, and renders three of the
// report's five pages (Product Analysis, Profit vs. Discount Analysis,
// Customer Analysis) with Chart.js. The sidebar checkboxes/chips are real
// slicers: every one of them re-filters the underlying rows and recomputes
// every card, chart, and table on the active page, the same way a Power BI
// slicer cross-filters a page.

const SS2_COLORS = {
  blue: "#5b9dff",
  red: "#ff6b6b",
  amber: "#f5a623",
  purple: "#a78bfa",
  green: "#4ade80",
  gold: "#f5c542",
  grid: "rgba(255,255,255,0.06)",
  text: "#93a0b8",
};

const CAT_COLOR_MAP = { Furniture: SS2_COLORS.amber, "Office Supplies": SS2_COLORS.blue, Technology: SS2_COLORS.purple };
const SEG_COLOR_MAP = { Consumer: SS2_COLORS.blue, Corporate: SS2_COLORS.green, "Home Office": SS2_COLORS.amber };
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

Chart.defaults.color = SS2_COLORS.text;
Chart.defaults.font.family = "Arial, Helvetica, sans-serif";
Chart.defaults.borderColor = SS2_COLORS.grid;
Chart.defaults.animation = false;

function usd(n) {
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
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
  for (const r of rows) map.set(r[groupKey], (map.get(r[groupKey]) || 0) + r[valueKey]);
  return [...map.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

async function main() {
  const res = await fetch("assets/data/superstore_powerbi_data.json");
  if (!res.ok) throw new Error(`superstore_powerbi_data.json request failed: HTTP ${res.status}`);
  const raw = await res.json();
  const D = raw.dict;
  const C = raw.cols;

  const rows = [];
  for (let i = 0; i < C.c.length; i++) {
    const year = Math.floor(C.ym[i] / 100);
    const month = C.ym[i] % 100;
    rows.push({
      category: D.category[C.c[i]],
      subCategory: D.subCategory[C.sc[i]],
      segment: D.segment[C.sg[i]],
      region: D.region[C.rg[i]],
      customer: D.customer[C.cu[i]],
      order: D.order[C.oi[i]],
      product: D.product[C.pi[i]],
      discount: C.di[i],
      sales: C.sa[i],
      qty: C.qt[i],
      profit: C.pr[i],
      year,
      month,
      quarter: Math.floor((month - 1) / 3) + 1,
    });
  }

  const CATEGORIES = D.category; // already alphabetically sorted
  const REGIONS = D.region;
  const SEGMENTS = D.segment;
  const YEARS = [...new Set(rows.map((r) => r.year))].sort();
  const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const QUARTERS = [];
  for (const y of YEARS) for (let q = 1; q <= 4; q++) QUARTERS.push({ year: y, quarter: q, key: y * 10 + q, label: `${y} Q${q}` });

  function freshState() {
    return {
      category: new Set(CATEGORIES),
      region: new Set(REGIONS),
      segment: new Set(SEGMENTS),
      year: new Set(YEARS),
      month: new Set(MONTHS),
    };
  }

  const state = { product: freshState(), discount: freshState(), customer: freshState() };

  function filterRows(st) {
    return rows.filter((r) => st.category.has(r.category) && st.region.has(r.region) && st.segment.has(r.segment) && st.year.has(r.year) && st.month.has(r.month));
  }

  function quarterSeries(rowsForSeries, valueKey) {
    const byQ = new Map();
    for (const r of rowsForSeries) {
      const qk = r.year * 10 + r.quarter;
      byQ.set(qk, (byQ.get(qk) || 0) + r[valueKey]);
    }
    return QUARTERS.map((q) => byQ.get(q.key) || 0);
  }

  // ---------------------------------------------------------------- slicers
  function buildListSlicer(containerId, values, selectedSet, onChange) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = values
      .map((v) => `<label class="slicer-item"><input type="checkbox" value="${v}" ${selectedSet.has(v) ? "checked" : ""} /><span>${v}</span></label>`)
      .join("");
    el.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) selectedSet.add(cb.value);
        else selectedSet.delete(cb.value);
        onChange();
      });
    });
  }

  function buildChipSlicer(containerId, values, selectedSet, onChange, formatFn) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = values.map((v) => `<button type="button" class="slicer-chip" data-v="${v}">${formatFn ? formatFn(v) : v}</button>`).join("");
    el.querySelectorAll(".slicer-chip").forEach((btn) => {
      const v = Number(btn.dataset.v);
      btn.classList.toggle("active", selectedSet.has(v));
      btn.addEventListener("click", () => {
        if (selectedSet.has(v)) selectedSet.delete(v);
        else selectedSet.add(v);
        btn.classList.toggle("active");
        onChange();
      });
    });
  }

  function buildProductSlicers() {
    buildListSlicer("slicer-product-category", CATEGORIES, state.product.category, () => renderPage("product"));
    buildListSlicer("slicer-product-region", REGIONS, state.product.region, () => renderPage("product"));
    buildListSlicer("slicer-product-segment", SEGMENTS, state.product.segment, () => renderPage("product"));
    buildChipSlicer("slicer-product-year", YEARS, state.product.year, () => renderPage("product"));
    buildChipSlicer("slicer-product-month", MONTHS, state.product.month, () => renderPage("product"), (m) => MONTH_NAMES[m - 1]);
  }

  function buildDiscountSlicers() {
    buildListSlicer("slicer-discount-region", REGIONS, state.discount.region, () => renderPage("discount"));
    buildListSlicer("slicer-discount-segment", SEGMENTS, state.discount.segment, () => renderPage("discount"));
    buildListSlicer("slicer-discount-category", CATEGORIES, state.discount.category, () => renderPage("discount"));
    buildChipSlicer("slicer-discount-year", YEARS, state.discount.year, () => renderPage("discount"));
    buildChipSlicer("slicer-discount-month", MONTHS, state.discount.month, () => renderPage("discount"), (m) => MONTH_NAMES[m - 1]);
  }

  function buildCustomerSlicers() {
    buildListSlicer("slicer-customer-segment", SEGMENTS, state.customer.segment, () => renderPage("customer"));
    buildListSlicer("slicer-customer-region", REGIONS, state.customer.region, () => renderPage("customer"));
    buildListSlicer("slicer-customer-category", CATEGORIES, state.customer.category, () => renderPage("customer"));
    buildChipSlicer("slicer-customer-year", YEARS, state.customer.year, () => renderPage("customer"));
    buildChipSlicer("slicer-customer-month", MONTHS, state.customer.month, () => renderPage("customer"), (m) => MONTH_NAMES[m - 1]);
  }

  // ------------------------------------------------------------- kpi cards
  function renderKpis(containerId, tiles) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = tiles.map(([n, l]) => `<div class="metric-box"><div class="val">${n}</div><div class="lbl">${l}</div></div>`).join("");
  }

  // --------------------------------------------------------- product page
  let chartProductSalesByCat = null;
  let chartProductUnitsByCat = null;
  let chartProductSubcat = null;

  function renderProduct() {
    const filtered = filterRows(state.product);

    const totalProducts = new Set(filtered.map((r) => r.product)).size;
    const totalQty = sumBy(filtered, "qty");
    const totalProfit = sumBy(filtered, "profit");
    const profitPerUnit = totalQty ? totalProfit / totalQty : 0;
    const byCat = groupSum(filtered, "category", "profit");
    const topCategory = byCat.length ? byCat[0].key : "—";

    renderKpis("pbi-product-kpis", [
      [totalProducts.toLocaleString(), "Total Products"],
      [topCategory, "Top Category by Total Profit"],
      [usd(profitPerUnit), "Profit per Unit"],
      [totalQty.toLocaleString(), "Total Quantity Sold"],
    ]);

    const labels = QUARTERS.map((q) => q.label);
    const salesDatasets = CATEGORIES.map((cat) => ({
      label: cat,
      data: quarterSeries(filtered.filter((r) => r.category === cat), "sales"),
      borderColor: CAT_COLOR_MAP[cat],
      backgroundColor: CAT_COLOR_MAP[cat],
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2,
      fill: false,
    }));
    const unitsDatasets = CATEGORIES.map((cat) => ({
      label: cat,
      data: quarterSeries(filtered.filter((r) => r.category === cat), "qty"),
      borderColor: CAT_COLOR_MAP[cat],
      backgroundColor: CAT_COLOR_MAP[cat],
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2,
      fill: false,
    }));

    if (!chartProductSalesByCat) {
      const ctx = document.getElementById("pbi-product-sales-by-cat");
      if (ctx)
        chartProductSalesByCat = new Chart(ctx, {
          type: "line",
          data: { labels, datasets: salesDatasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${usd(c.parsed.y)}` } } },
            scales: { x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 45 } }, y: { grid: { color: SS2_COLORS.grid }, ticks: { callback: (v) => usd(v) } } },
          },
        });
    } else {
      chartProductSalesByCat.data.labels = labels;
      chartProductSalesByCat.data.datasets = salesDatasets;
      chartProductSalesByCat.update();
    }

    if (!chartProductUnitsByCat) {
      const ctx = document.getElementById("pbi-product-units-by-cat");
      if (ctx)
        chartProductUnitsByCat = new Chart(ctx, {
          type: "line",
          data: { labels, datasets: unitsDatasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toLocaleString()} units` } } },
            scales: { x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 45 } }, y: { grid: { color: SS2_COLORS.grid }, ticks: { callback: (v) => v.toLocaleString() } } },
          },
        });
    } else {
      chartProductUnitsByCat.data.labels = labels;
      chartProductUnitsByCat.data.datasets = unitsDatasets;
      chartProductUnitsByCat.update();
    }

    const bySubcat = groupSum(filtered, "subCategory", "sales");
    const subcatToCat = new Map();
    for (const r of filtered) if (!subcatToCat.has(r.subCategory)) subcatToCat.set(r.subCategory, r.category);
    const subcatLabels = bySubcat.map((d) => d.key);
    const subcatData = bySubcat.map((d) => d.value);
    const subcatColors = bySubcat.map((d) => CAT_COLOR_MAP[subcatToCat.get(d.key)] || SS2_COLORS.blue);

    if (!chartProductSubcat) {
      const ctx = document.getElementById("pbi-product-subcat-sales");
      if (ctx)
        chartProductSubcat = new Chart(ctx, {
          type: "bar",
          data: { labels: subcatLabels, datasets: [{ data: subcatData, backgroundColor: subcatColors, borderRadius: 4 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => usd(c.parsed.y) } } },
            scales: { x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 45 } }, y: { grid: { color: SS2_COLORS.grid }, ticks: { callback: (v) => usd(v) } } },
          },
        });
    } else {
      chartProductSubcat.data.labels = subcatLabels;
      chartProductSubcat.data.datasets[0].data = subcatData;
      chartProductSubcat.data.datasets[0].backgroundColor = subcatColors;
      chartProductSubcat.update();
    }

    const groups = new Map();
    for (const r of filtered) {
      const k = r.category + "|" + r.subCategory;
      if (!groups.has(k)) groups.set(k, { category: r.category, subCategory: r.subCategory, sales: 0, profit: 0, qty: 0, discSum: 0, discN: 0, orders: new Set() });
      const g = groups.get(k);
      g.sales += r.sales;
      g.profit += r.profit;
      g.qty += r.qty;
      g.discSum += r.discount;
      g.discN++;
      g.orders.add(r.order);
    }
    const arr = [...groups.values()].sort((a, b) => a.category.localeCompare(b.category) || b.sales - a.sales);
    const tbody = document.querySelector("#pbi-product-table tbody");
    if (tbody) {
      tbody.innerHTML = arr
        .map(
          (g) =>
            `<tr><td>${g.category}</td><td>${g.subCategory}</td><td>${usd(g.sales)}</td><td>${usd(g.profit)}</td><td>${pct(g.sales ? g.profit / g.sales : 0)}</td><td>${g.qty.toLocaleString()}</td><td>${pct(g.discN ? g.discSum / g.discN : 0)}</td><td>${g.orders.size}</td><td>${usd(g.qty ? g.profit / g.qty : 0)}</td></tr>`
        )
        .join("");
    }

    updateStatus(filtered.length);
  }

  // -------------------------------------------------------- discount page
  let chartDiscountByTier = null;
  let chartDiscountVsTime = null;

  function renderDiscount() {
    const filtered = filterRows(state.discount);

    const totalSales = sumBy(filtered, "sales");
    const totalProfit = sumBy(filtered, "profit");
    const profitPct = totalSales ? totalProfit / totalSales : 0;
    const avgDiscount = avgBy(filtered, "discount");

    renderKpis("pbi-discount-kpis", [
      [usd(totalSales), "Total Sales"],
      [usd(totalProfit), "Total Profit"],
      [pct(profitPct), "Profit %"],
      [pct(avgDiscount), "Average Discount %"],
    ]);

    const byDisc = new Map();
    for (const r of filtered) {
      if (!byDisc.has(r.discount)) byDisc.set(r.discount, { sales: 0, profit: 0, orders: new Set() });
      const g = byDisc.get(r.discount);
      g.sales += r.sales;
      g.profit += r.profit;
      g.orders.add(r.order);
    }
    const discounts = [...byDisc.keys()].sort((a, b) => a - b);
    const tierLabels = discounts.map((d) => pct(d));
    const tierValues = discounts.map((d) => {
      const g = byDisc.get(d);
      return g.sales ? g.profit / g.sales : 0;
    });
    const tierColors = tierValues.map((v) => (v >= 0 ? SS2_COLORS.green : SS2_COLORS.red));

    if (!chartDiscountByTier) {
      const ctx = document.getElementById("pbi-discount-profitpct-bydiscount");
      if (ctx)
        chartDiscountByTier = new Chart(ctx, {
          type: "bar",
          data: { labels: tierLabels, datasets: [{ data: tierValues, backgroundColor: tierColors, borderRadius: 4 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => pct(c.parsed.y) } } },
            scales: { x: { grid: { display: false } }, y: { grid: { color: SS2_COLORS.grid }, ticks: { callback: (v) => pct(v) } } },
          },
        });
    } else {
      chartDiscountByTier.data.labels = tierLabels;
      chartDiscountByTier.data.datasets[0].data = tierValues;
      chartDiscountByTier.data.datasets[0].backgroundColor = tierColors;
      chartDiscountByTier.update();
    }

    const qLabels = QUARTERS.map((q) => q.label);
    const byQ = new Map();
    for (const r of filtered) {
      const qk = r.year * 10 + r.quarter;
      if (!byQ.has(qk)) byQ.set(qk, { sales: 0, profit: 0, discSum: 0, discN: 0 });
      const g = byQ.get(qk);
      g.sales += r.sales;
      g.profit += r.profit;
      g.discSum += r.discount;
      g.discN++;
    }
    const profitPctSeries = QUARTERS.map((q) => {
      const g = byQ.get(q.key);
      return g && g.sales ? g.profit / g.sales : 0;
    });
    const avgDiscSeries = QUARTERS.map((q) => {
      const g = byQ.get(q.key);
      return g && g.discN ? g.discSum / g.discN : 0;
    });

    if (!chartDiscountVsTime) {
      const ctx = document.getElementById("pbi-discount-profitpct-vs-discount-time");
      if (ctx)
        chartDiscountVsTime = new Chart(ctx, {
          type: "line",
          data: {
            labels: qLabels,
            datasets: [
              { label: "Profit %", data: profitPctSeries, borderColor: SS2_COLORS.blue, backgroundColor: SS2_COLORS.blue, tension: 0.3, pointRadius: 2, borderWidth: 2, fill: false, yAxisID: "y" },
              { label: "Average Discount", data: avgDiscSeries, borderColor: SS2_COLORS.amber, backgroundColor: SS2_COLORS.amber, tension: 0.3, pointRadius: 2, borderWidth: 2, fill: false, yAxisID: "y1" },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${pct(c.parsed.y)}` } } },
            scales: {
              x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 45 } },
              y: { position: "left", grid: { color: SS2_COLORS.grid }, ticks: { callback: (v) => pct(v) } },
              y1: { position: "right", grid: { display: false }, ticks: { callback: (v) => pct(v) } },
            },
          },
        });
    } else {
      chartDiscountVsTime.data.labels = qLabels;
      chartDiscountVsTime.data.datasets[0].data = profitPctSeries;
      chartDiscountVsTime.data.datasets[1].data = avgDiscSeries;
      chartDiscountVsTime.update();
    }

    const tbody = document.querySelector("#pbi-discount-table tbody");
    if (tbody) {
      tbody.innerHTML = discounts
        .map((d) => {
          const g = byDisc.get(d);
          const p = g.sales ? g.profit / g.sales : 0;
          return `<tr><td>${pct(d)}</td><td>${usd(g.sales)}</td><td>${usd(g.profit)}</td><td style="color:${p >= 0 ? SS2_COLORS.green : SS2_COLORS.red}">${pct(p)}</td><td>${g.orders.size}</td></tr>`;
        })
        .join("");
    }

    updateStatus(filtered.length);
  }

  // -------------------------------------------------------- customer page
  let chartNewCustomers = null;
  let chartSalesBySegment = null;
  let chartTop10 = null;
  let chartBottom10 = null;

  function renderCustomer() {
    const filtered = filterRows(state.customer);

    const totalSales = sumBy(filtered, "sales");
    const totalProfit = sumBy(filtered, "profit");
    const custSet = new Set(filtered.map((r) => r.customer));
    const totalCustomers = custSet.size;
    const avgCLV = totalCustomers ? totalSales / totalCustomers : 0;

    const ordersByCust = new Map();
    for (const r of filtered) {
      if (!ordersByCust.has(r.customer)) ordersByCust.set(r.customer, new Set());
      ordersByCust.get(r.customer).add(r.order);
    }
    const repeatCount = [...ordersByCust.values()].filter((s) => s.size > 1).length;
    const repeatRate = totalCustomers ? repeatCount / totalCustomers : 0;

    renderKpis("pbi-customer-kpis", [
      [usd(totalSales), "Total Sales"],
      [usd(totalProfit), "Total Profit"],
      [totalCustomers.toLocaleString(), "Total Customers"],
      [usd(avgCLV), "Avg. Client Lifetime Value"],
      [pct(repeatRate), "Repeat Customer Rate"],
    ]);

    const qLabels = QUARTERS.map((q) => q.label);
    const firstQByCust = new Map();
    for (const r of filtered) {
      const qk = r.year * 10 + r.quarter;
      const cur = firstQByCust.get(r.customer);
      if (cur === undefined || qk < cur) firstQByCust.set(r.customer, qk);
    }
    const newCustCounts = new Map();
    for (const qk of firstQByCust.values()) newCustCounts.set(qk, (newCustCounts.get(qk) || 0) + 1);
    const newCustData = QUARTERS.map((q) => newCustCounts.get(q.key) || 0);

    if (!chartNewCustomers) {
      const ctx = document.getElementById("pbi-customer-newcustomers");
      if (ctx)
        chartNewCustomers = new Chart(ctx, {
          type: "line",
          data: { labels: qLabels, datasets: [{ data: newCustData, borderColor: SS2_COLORS.green, backgroundColor: SS2_COLORS.green, tension: 0.3, pointRadius: 2, borderWidth: 2, fill: false }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y} new customers` } } },
            scales: { x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 45 } }, y: { grid: { color: SS2_COLORS.grid } } },
          },
        });
    } else {
      chartNewCustomers.data.labels = qLabels;
      chartNewCustomers.data.datasets[0].data = newCustData;
      chartNewCustomers.update();
    }

    const segDatasets = SEGMENTS.map((seg) => ({
      label: seg,
      data: quarterSeries(filtered.filter((r) => r.segment === seg), "sales"),
      borderColor: SEG_COLOR_MAP[seg],
      backgroundColor: SEG_COLOR_MAP[seg],
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2,
      fill: false,
    }));

    if (!chartSalesBySegment) {
      const ctx = document.getElementById("pbi-customer-sales-by-segment");
      if (ctx)
        chartSalesBySegment = new Chart(ctx, {
          type: "line",
          data: { labels: qLabels, datasets: segDatasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${usd(c.parsed.y)}` } } },
            scales: { x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 45 } }, y: { grid: { color: SS2_COLORS.grid }, ticks: { callback: (v) => usd(v) } } },
          },
        });
    } else {
      chartSalesBySegment.data.labels = qLabels;
      chartSalesBySegment.data.datasets = segDatasets;
      chartSalesBySegment.update();
    }

    const byCustProfit = groupSum(filtered, "customer", "profit");
    const top10 = byCustProfit.slice(0, 10);
    const bottom10 = [...byCustProfit].sort((a, b) => a.value - b.value).slice(0, 10);

    if (!chartTop10) {
      const ctx = document.getElementById("pbi-customer-top10");
      if (ctx)
        chartTop10 = new Chart(ctx, {
          type: "bar",
          data: { labels: top10.map((d) => d.key), datasets: [{ data: top10.map((d) => d.value), backgroundColor: SS2_COLORS.green, borderRadius: 4 }] },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => usd(c.parsed.x) } } },
            scales: { x: { grid: { color: SS2_COLORS.grid }, ticks: { callback: (v) => usd(v) } }, y: { grid: { display: false } } },
          },
        });
    } else {
      chartTop10.data.labels = top10.map((d) => d.key);
      chartTop10.data.datasets[0].data = top10.map((d) => d.value);
      chartTop10.update();
    }

    if (!chartBottom10) {
      const ctx = document.getElementById("pbi-customer-bottom10");
      if (ctx)
        chartBottom10 = new Chart(ctx, {
          type: "bar",
          data: { labels: bottom10.map((d) => d.key), datasets: [{ data: bottom10.map((d) => d.value), backgroundColor: SS2_COLORS.red, borderRadius: 4 }] },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => usd(c.parsed.x) } } },
            scales: { x: { grid: { color: SS2_COLORS.grid }, ticks: { callback: (v) => usd(v) } }, y: { grid: { display: false } } },
          },
        });
    } else {
      chartBottom10.data.labels = bottom10.map((d) => d.key);
      chartBottom10.data.datasets[0].data = bottom10.map((d) => d.value);
      chartBottom10.update();
    }

    const custGroups = new Map();
    for (const r of filtered) {
      if (!custGroups.has(r.customer)) custGroups.set(r.customer, { customer: r.customer, region: r.region, segment: r.segment, sales: 0, profit: 0, orders: new Set() });
      const g = custGroups.get(r.customer);
      g.sales += r.sales;
      g.profit += r.profit;
      g.orders.add(r.order);
    }
    const custArr = [...custGroups.values()].sort((a, b) => b.sales - a.sales).slice(0, 50);
    const tbody = document.querySelector("#pbi-customer-table tbody");
    if (tbody) {
      tbody.innerHTML = custArr
        .map(
          (g) =>
            `<tr><td>${g.customer}</td><td>${g.region}</td><td>${g.segment}</td><td>${usd(g.sales)}</td><td>${usd(g.profit)}</td><td>${pct(g.sales ? g.profit / g.sales : 0)}</td><td>${g.orders.size}</td><td>${usd(g.orders.size ? g.sales / g.orders.size : 0)}</td></tr>`
        )
        .join("");
    }

    updateStatus(filtered.length);
  }

  // ----------------------------------------------------------- navigation
  function updateStatus(filteredCount) {
    const el = document.getElementById("pbi-status");
    if (!el) return;
    el.innerHTML = `Showing <strong>${filteredCount.toLocaleString()}</strong> of ${rows.length.toLocaleString()} order line items &mdash; filtered live from the same dataset behind the .pbix file.`;
  }

  function renderPage(page) {
    if (page === "product") renderProduct();
    else if (page === "discount") renderDiscount();
    else if (page === "customer") renderCustomer();
  }

  const initialized = { product: false, discount: false, customer: false };

  function activateTab(page) {
    document.querySelectorAll("#pbi-page-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    document.querySelectorAll(".pbi-layout[data-page-panel]").forEach((p) => {
      p.style.display = p.dataset.pagePanel === page ? "" : "none";
    });
    if (!initialized[page]) {
      if (page === "product") buildProductSlicers();
      else if (page === "discount") buildDiscountSlicers();
      else if (page === "customer") buildCustomerSlicers();
      initialized[page] = true;
    }
    renderPage(page);
  }

  document.querySelectorAll("#pbi-page-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.page));
  });

  document.querySelectorAll(".slicer-clear").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.clear;
      state[page] = freshState();
      if (page === "product") buildProductSlicers();
      else if (page === "discount") buildDiscountSlicers();
      else if (page === "customer") buildCustomerSlicers();
      renderPage(page);
    });
  });

  activateTab("product");
}

main().catch((err) => {
  console.error("Failed to load Superstore Power BI dashboard:", err);

  const isFileProtocol = window.location.protocol === "file:";
  const message = isFileProtocol
    ? `You're opening this page directly as a local file, so the browser blocks it from fetching superstore_powerbi_data.json (CORS). Serve the docs/ folder over HTTP and reload.`
    : `Something went wrong loading the dashboard data: ${err.message}`;
  const main = document.querySelector("main .wrap");
  if (main) {
    const warn = document.createElement("p");
    warn.style.cssText = "color:#ff6b6b; font-weight:bold;";
    warn.textContent = message;
    main.prepend(warn);
  }
});
