SELECT dept.department_name, bc.category_name,
       SUM(f.budgeted_amount) AS total_budgeted,
       SUM(f.actual_amount)   AS total_actual,
       SUM(f.variance_amount) AS total_variance,
       SUM(f.variance_amount) * 1.0 / NULLIF(SUM(f.budgeted_amount), 0) AS variance_pct
FROM fact_department_budget f
JOIN dim_department dept    ON f.department_id = dept.department_id
JOIN dim_budget_category bc ON f.category_id = bc.category_id
GROUP BY dept.department_name, bc.category_name
HAVING SUM(f.actual_amount) > SUM(f.budgeted_amount)
ORDER BY total_variance DESC;
