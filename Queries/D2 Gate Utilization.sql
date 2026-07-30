SELECT g.gate_name, g.zone,
       AVG(f.avg_wait_time_minutes) AS avg_wait,
       SUM(f.fans_entered) AS total_entries,
       g.max_capacity_per_hour,
       SUM(f.fans_entered) * 1.0 / NULLIF(g.max_capacity_per_hour, 0) AS utilization_ratio
FROM fact_gate_entries f
JOIN dim_gate g ON f.gate_id = g.gate_id
GROUP BY g.gate_name, g.zone, g.max_capacity_per_hour;
