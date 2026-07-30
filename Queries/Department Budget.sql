SELECT dept.department_name, bc.category_name, v.vendor_name,
       f.budgeted_amount, f.actual_amount, f.variance_amount
FROM fact_department_budget f
JOIN dim_department dept      ON f.department_id = dept.department_id
JOIN dim_budget_category bc   ON f.category_id = bc.category_id
LEFT JOIN dim_vendor v        ON f.vendor_id = v.vendor_id;
-- LEFT JOIN on vendor: some budget lines (e.g. internal labor) may have no vendor_id
