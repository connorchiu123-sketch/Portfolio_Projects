SELECT g.gate_name, f.severity,
       COUNT(*) AS incident_count,
       AVG(f.response_time_minutes) AS avg_response
FROM fact_security_incidents f
JOIN dim_gate g ON f.gate_id = g.gate_id
GROUP BY g.gate_name, f.severity
ORDER BY incident_count DESC;
