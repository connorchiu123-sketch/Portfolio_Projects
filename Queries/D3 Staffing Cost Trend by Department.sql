SELECT d.calendar_date, dept.department_name,
       SUM(f.total_cost) AS daily_staffing_cost
FROM fact_staffing_cost f
JOIN dim_date d          ON f.date_id = d.date_id
JOIN dim_department dept ON f.department_id = dept.department_id
GROUP BY d.calendar_date, dept.department_name
ORDER BY d.calendar_date;
