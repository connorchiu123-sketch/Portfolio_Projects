/* =============================================================================
   SUPER BOWL OPERATIONS — sample business questions (T-SQL practice)
   -----------------------------------------------------------------------------
   Each query answers one real ops/business question and maps to one visual
   you'd build in Power BI once this database is connected. Practice these
   before opening Power BI -- know the answer in SQL first, then check that
   the visual shows the same thing.
============================================================================= */

USE SuperBowlOps;
GO

-- Q1. Ticket revenue and attendance by tier -- [Power BI: bar chart, tier x revenue]
SELECT tt.tier_name, tt.face_value, fts.quantity_sold, fts.gross_revenue
FROM fact_ticket_sales fts
JOIN dim_ticket_tier tt ON fts.tier_id = tt.tier_id
ORDER BY fts.gross_revenue DESC;
GO

-- Q2. Which gate has the worst average wait time, and when? -- [Power BI: line chart, hour x wait time, split by gate]
SELECT g.gate_name, g.zone, fge.entry_hour, fge.fans_entered, fge.avg_wait_time_minutes
FROM fact_gate_entries fge
JOIN dim_gate g ON fge.gate_id = g.gate_id
ORDER BY fge.avg_wait_time_minutes DESC;
GO

-- Q3. Total staffing cost by department, with the vendor(s) behind it
--     -- [Power BI: stacked bar, department x vendor x total_cost]
SELECT d.department_name, d.department_group, v.vendor_name, fsc.total_cost
FROM fact_staffing_cost fsc
JOIN dim_department d ON fsc.department_id = d.department_id
JOIN dim_vendor v ON fsc.vendor_id = v.vendor_id
ORDER BY d.department_name;
GO

-- Q4. Concessions revenue by category, total across all zones
--     -- [Power BI: donut/bar, category x SUM(revenue)]
SELECT category, SUM(revenue) AS total_revenue, SUM(units_sold) AS total_units
FROM fact_concessions_sales
GROUP BY category
ORDER BY total_revenue DESC;
GO

-- Q5. Sponsorship revenue by sponsor, biggest deals first
--     -- [Power BI: table sorted descending, or bar chart]
SELECT s.sponsor_name, s.category, s.sponsorship_tier, SUM(fsr.amount) AS total_sponsorship_revenue
FROM fact_sponsorship_revenue fsr
JOIN dim_sponsor s ON fsr.sponsor_id = s.sponsor_id
GROUP BY s.sponsor_name, s.category, s.sponsorship_tier
ORDER BY total_sponsorship_revenue DESC;
GO

-- Q6. Security incidents by type and severity -- which gate needs more coverage?
--     -- [Power BI: heatmap/matrix, gate x incident_type, color by count or avg response time]
SELECT g.gate_name, fsi.incident_type, fsi.severity, COUNT(*) AS incident_count,
       AVG(fsi.response_time_minutes) AS avg_response_minutes
FROM fact_security_incidents fsi
JOIN dim_gate g ON fsi.gate_id = g.gate_id
GROUP BY g.gate_name, fsi.incident_type, fsi.severity
ORDER BY avg_response_minutes DESC;
GO

-- Q7. Budget vs actual by department -- which departments ran over?
--     -- [Power BI: diverging bar, department x variance_amount]
SELECT d.department_name, fdb.budgeted_amount, fdb.actual_amount, fdb.variance_amount,
       CAST(fdb.variance_amount * 100.0 / fdb.budgeted_amount AS DECIMAL(6,2)) AS variance_pct
FROM fact_department_budget fdb
JOIN dim_department d ON fdb.department_id = d.department_id
ORDER BY variance_pct DESC;
GO

-- Q8. Total event revenue across all three revenue streams -- [Power BI: KPI card row]
SELECT
    (SELECT SUM(gross_revenue) FROM fact_ticket_sales)                 AS total_ticket_revenue,
    (SELECT SUM(revenue) FROM fact_concessions_sales)                  AS total_concessions_revenue,
    (SELECT SUM(amount) FROM fact_sponsorship_revenue)                 AS total_sponsorship_revenue,
    (SELECT SUM(gross_revenue) FROM fact_ticket_sales)
      + (SELECT SUM(revenue) FROM fact_concessions_sales)
      + (SELECT SUM(amount) FROM fact_sponsorship_revenue)             AS total_event_revenue;
GO

/* =============================================================================
   CONNECTING THIS DATABASE TO POWER BI
   -----------------------------------------------------------------------------
   1. Open Power BI Desktop -> Get Data -> SQL Server.
   2. Server: your machine name (or "localhost\SQLEXPRESS" for SQL Server
      Express -- check the exact instance name in SSMS's Object Explorer).
   3. Database: SuperBowlOps
   4. Data Connectivity mode: Import (simplest to start; DirectQuery is an
      option once the model is bigger than a laptop wants to hold in memory).
   5. In Navigator, check all 5 dim_ tables and all 6 fact_ tables, then Load.
   6. In Model view, Power BI should auto-detect the FK relationships from the
      table structure; if any are missing, drag from the fact table's FK
      column to the dimension table's PK column to create it manually.
   7. Build visuals against the queries above -- each one is a dashboard tile.
============================================================================= */
