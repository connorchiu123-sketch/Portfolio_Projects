SELECT d.calendar_date, d.day_name, sc.channel_name, sc.market_type,
       tt.tier_name, tt.face_value, f.quantity_sold, f.unit_price, f.gross_revenue
FROM fact_ticket_sales f
JOIN dim_date d          ON f.date_id = d.date_id
JOIN dim_sales_channel sc ON f.channel_id = sc.channel_id
JOIN dim_ticket_tier tt   ON f.tier_id = tt.tier_id;
