SELECT g.gate_name, g.zone, f.category, f.entry_hour, f.units_sold, f.revenue
FROM fact_concessions_sales f
JOIN dim_gate g ON f.gate_id = g.gate_id;
