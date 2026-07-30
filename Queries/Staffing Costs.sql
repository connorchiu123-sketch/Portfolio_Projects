SELECT d.calendar_date, dept.department_name, dept.department_group,
       f.crew_name, f.workers_scheduled, f.hours_per_worker, f.hourly_rate, f.total_cost
FROM fact_staffing_cost f
JOIN dim_date d           ON f.date_id = d.date_id
JOIN dim_department dept  ON f.department_id = dept.department_id;
