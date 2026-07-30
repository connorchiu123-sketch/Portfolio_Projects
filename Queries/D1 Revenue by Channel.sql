SELECT sc.channel_name,
       SUM(f.gross_revenue) AS total_revenue,
       SUM(f.quantity_sold) AS total_tickets
FROM fact_ticket_sales f
JOIN dim_sales_channel sc ON f.channel_id = sc.channel_id
GROUP BY sc.channel_name
ORDER BY total_revenue DESC;
