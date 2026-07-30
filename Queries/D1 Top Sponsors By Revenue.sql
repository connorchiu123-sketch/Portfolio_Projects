SELECT TOP 5 s.sponsor_name, SUM(f.amount) AS total_sponsorship_revenue
FROM fact_sponsorship_revenue f
JOIN dim_sponsor s ON f.sponsor_id = s.sponsor_id
GROUP BY s.sponsor_name
ORDER BY total_sponsorship_revenue DESC;
