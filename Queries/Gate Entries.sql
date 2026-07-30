SELECT g.gate_name, g.zone, g.max_capacity_per_hour,
       f.entry_hour, f.fans_entered, f.avg_wait_time_minutes
FROM fact_gate_entries f
JOIN dim_gate g ON f.gate_id = g.gate_id;
