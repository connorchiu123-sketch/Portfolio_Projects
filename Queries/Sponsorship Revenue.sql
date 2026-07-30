SELECT d.calendar_date, s.sponsor_name, s.category, s.sponsorship_tier,
       f.revenue_category, f.amount
FROM fact_sponsorship_revenue f
JOIN dim_date d      ON f.date_id = d.date_id
JOIN dim_sponsor s   ON f.sponsor_id = s.sponsor_id;
