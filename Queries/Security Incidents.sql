SELECT g.gate_name, g.zone, f.incident_hour, f.incident_type,
       f.severity, f.response_time_minutes
FROM fact_security_incidents f
JOIN dim_gate g ON f.gate_id = g.gate_id;
