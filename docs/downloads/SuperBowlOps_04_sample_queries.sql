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

-- Q1. Ticket revenue and quantity by tier -- [Power BI: bar chart, tier x revenue]
SELECT tt.tier_name, tt.face_value,
       SUM(fts.quantity_sold)  AS total_quantity_sold,
       SUM(fts.gross_revenue)  AS total_gross_revenue
FROM fact_ticket_sales fts
JOIN dim_ticket_tier tt ON fts.tier_id = tt.tier_id
GROUP BY tt.tier_name, tt.face_value
ORDER BY total_gross_revenue DESC;
GO

-- Q1b. Ticket revenue by sales channel, and how far above/below face value
--      each channel actually sells at -- [Power BI: bar chart, channel x revenue,
--      table with avg markup %]
SELECT sc.channel_name, sc.market_type,
       SUM(fts.quantity_sold) AS total_quantity_sold,
       SUM(fts.gross_revenue) AS total_gross_revenue,
       CAST(AVG(fts.unit_price / tt.face_value) * 100 AS DECIMAL(6,2)) AS avg_pct_of_face_value
FROM fact_ticket_sales fts
JOIN dim_sales_channel sc ON fts.channel_id = sc.channel_id
JOIN dim_ticket_tier tt ON fts.tier_id = tt.tier_id
GROUP BY sc.channel_name, sc.market_type
ORDER BY total_gross_revenue DESC;
GO

-- Q1c. Ticket sales by month -- [Power BI: line/column chart, month x revenue]
--      Shows how volume builds as game day approaches.
SELECT dd.month_name, dd.event_phase,
       SUM(fts.quantity_sold) AS total_quantity_sold,
       SUM(fts.gross_revenue) AS total_gross_revenue
FROM fact_ticket_sales fts
JOIN dim_date dd ON fts.date_id = dd.date_id
GROUP BY dd.month_name, dd.event_phase
ORDER BY MIN(dd.days_to_game) DESC;
GO

-- Q2. Which gate has the worst average wait time, and when? -- [Power BI: line chart, hour x wait time, split by gate]
SELECT g.gate_name, g.zone, fge.entry_hour, fge.fans_entered, fge.avg_wait_time_minutes
FROM fact_gate_entries fge
JOIN dim_gate g ON fge.gate_id = g.gate_id
ORDER BY fge.avg_wait_time_minutes DESC;
GO

-- Q3. Total staffing cost by department, with the vendor(s) behind it
--     -- [Power BI: stacked bar, department x vendor x total_cost]
SELECT d.department_name, d.department_group, v.vendor_name,
       SUM(fsc.total_cost) AS total_cost
FROM fact_staffing_cost fsc
JOIN dim_department d ON fsc.department_id = d.department_id
JOIN dim_vendor v ON fsc.vendor_id = v.vendor_id
GROUP BY d.department_name, d.department_group, v.vendor_name
ORDER BY d.department_name;
GO

-- Q3b. Staffing cost by event phase (Setup / Game Day / Teardown) --
--      [Power BI: stacked column, phase x department x total_cost]
--      Shows how much of the labor bill happens outside game day itself.
SELECT dd.event_phase, d.department_name,
       SUM(fsc.workers_scheduled) AS total_worker_shifts,
       SUM(fsc.total_cost)        AS total_cost
FROM fact_staffing_cost fsc
JOIN dim_date dd ON fsc.date_id = dd.date_id
JOIN dim_department d ON fsc.department_id = d.department_id
GROUP BY dd.event_phase, d.department_name
ORDER BY MIN(dd.days_to_game) DESC, total_cost DESC;
GO

-- Q4. Concessions revenue by category, total across all zones
--     -- [Power BI: donut/bar, category x SUM(revenue)]
SELECT category, SUM(revenue) AS total_revenue, SUM(units_sold) AS total_units
FROM fact_concessions_sales
GROUP BY category
ORDER BY total_revenue DESC;
GO

-- Q4b. Concessions revenue by hour block -- pregame vs. in-game/halftime vs.
--      post-game egress -- [Power BI: stacked area/column, hour x category]
SELECT
    CASE
        WHEN entry_hour BETWEEN 11 AND 16 THEN 'Pregame'
        WHEN entry_hour BETWEEN 17 AND 20 THEN 'In-Game / Halftime'
        ELSE 'Post-Game Egress'
    END AS hour_block,
    category,
    SUM(units_sold) AS total_units,
    SUM(revenue)     AS total_revenue
FROM fact_concessions_sales
GROUP BY
    CASE
        WHEN entry_hour BETWEEN 11 AND 16 THEN 'Pregame'
        WHEN entry_hour BETWEEN 17 AND 20 THEN 'In-Game / Halftime'
        ELSE 'Post-Game Egress'
    END,
    category
ORDER BY hour_block, total_revenue DESC;
GO

-- Q5. Sponsorship revenue by sponsor, biggest deals first
--     -- [Power BI: table sorted descending, or bar chart]
SELECT s.sponsor_name, s.category, s.sponsorship_tier, SUM(fsr.amount) AS total_sponsorship_revenue
FROM fact_sponsorship_revenue fsr
JOIN dim_sponsor s ON fsr.sponsor_id = s.sponsor_id
GROUP BY s.sponsor_name, s.category, s.sponsorship_tier
ORDER BY total_sponsorship_revenue DESC;
GO

-- Q5b. Sponsorship revenue recognized by month -- [Power BI: line/column
--      chart, month x amount] -- shows the installment cadence rather than
--      one lump sum landing on a single date.
SELECT dd.month_name, dd.event_phase, SUM(fsr.amount) AS total_recognized
FROM fact_sponsorship_revenue fsr
JOIN dim_date dd ON fsr.date_id = dd.date_id
GROUP BY dd.month_name, dd.event_phase
ORDER BY MIN(dd.days_to_game) DESC;
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
SELECT d.department_name,
       SUM(fdb.budgeted_amount) AS budgeted_amount,
       SUM(fdb.actual_amount)   AS actual_amount,
       SUM(fdb.variance_amount) AS variance_amount,
       CAST(SUM(fdb.variance_amount) * 100.0 / SUM(fdb.budgeted_amount) AS DECIMAL(6,2)) AS variance_pct
FROM fact_department_budget fdb
JOIN dim_department d ON fdb.department_id = d.department_id
GROUP BY d.department_name
ORDER BY variance_pct DESC;
GO

-- Q7b. Budget vs actual by category, across all departments -- [Power BI:
--      matrix, department x category, color by variance_pct] -- which cost
--      category is the biggest overrun driver company-wide?
SELECT bc.category_name,
       SUM(fdb.budgeted_amount) AS budgeted_amount,
       SUM(fdb.actual_amount)   AS actual_amount,
       SUM(fdb.variance_amount) AS variance_amount
FROM fact_department_budget fdb
JOIN dim_budget_category bc ON fdb.category_id = bc.category_id
GROUP BY bc.category_name
ORDER BY variance_amount DESC;
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
   5. In Navigator, check all 8 dim_ tables and all 6 fact_ tables, then Load.
   6. In Model view, Power BI should auto-detect the FK relationships from the
      table structure; if any are missing, drag from the fact table's FK
      column to the dimension table's PK column to create it manually.
      dim_date will show three relationships (ticket sales, staffing,
      sponsorship) -- only one can be "active" at a time in the model, so mark
      the others as inactive relationships and use USERELATIONSHIP() in DAX
      measures where you need to pivot on a different one.
   7. Build visuals against the queries above -- each one is a dashboard tile.
============================================================================= */
