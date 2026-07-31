/* =============================================================================
   SUPER BOWL OPERATIONS — sample data (all figures fabricated for practice)
   -----------------------------------------------------------------------------
   Game day is fixed at 2027-02-14 (a Sunday, purely hypothetical). dim_date
   spans the 60 days before game day (the ticket on-sale + sponsorship
   installment window) through 1 day after (teardown). Everything else --
   ticket sales, staffing, sponsorship installments -- hangs off that single
   date dimension so it can all be grouped by week/month/event phase together.

   Grain changes from the original version of this script:
     - fact_ticket_sales    : now one row per tier/date/channel transaction
                              instead of one row per tier.
     - fact_concessions_sales: now split by entry_hour (11:00-21:00) instead
                              of one lump total per gate/category.
     - fact_staffing_cost   : now split by shift date (Setup x2 / Game Day /
                              Teardown) instead of game-day-only crews.
     - fact_sponsorship_revenue: now split into payment installments across
                              the contract timeline instead of one amount
                              per sponsor/category.
     - fact_department_budget: now split into category line items (Labor,
                              Equipment & AV, Insurance, ...) that sum to the
                              same department totals as before, instead of
                              one pre-aggregated row per department.

   fact_gate_entries and fact_security_incidents keep their original grain --
   they were already a full gate x hour matrix, which is the realistic unit
   for those two.

   Note: fact_department_budget's totals are still the FULL department
   operating budget -- staffing, equipment, insurance, coordination overhead,
   everything -- while fact_staffing_cost is only the direct hourly labor
   portion, so the labor category line will always be smaller than
   fact_staffing_cost's own total for that department (staffing_cost also
   covers setup/teardown shifts the original budget line already accounts
   for as part of "Direct Labor"). That's intentional, not an error.
============================================================================= */

USE SuperBowlOps;
GO

-- ============================= DIMENSIONS ==================================

INSERT INTO dim_department (department_name, department_group) VALUES
    ('Security',                     'Operations'),
    ('Guest Services',               'Guest Experience'),
    ('Concessions & Merchandise',    'Revenue'),
    ('Medical Services',             'Support'),
    ('Parking & Transportation',     'Operations'),
    ('Broadcast & Media Operations', 'Revenue'),
    ('Cleaning & Facilities',        'Support');
GO

-- dim_date: generated with a loop rather than typed out row by row -- the
-- standard way to build a date dimension in T-SQL. Covers 2026-12-16 through
-- 2027-02-15 (60 days pre-game through 1 day post-game).
DECLARE @game_date  DATE = '2027-02-14';
DECLARE @start_date DATE = DATEADD(DAY, -60, @game_date);
DECLARE @end_date   DATE = DATEADD(DAY, 1, @game_date);
DECLARE @d DATE = @start_date;

WHILE @d <= @end_date
BEGIN
    INSERT INTO dim_date (calendar_date, day_name, week_number, month_name, days_to_game, event_phase)
    VALUES (
        @d,
        DATENAME(WEEKDAY, @d),
        DATEPART(WEEK, @d),
        DATENAME(MONTH, @d),
        DATEDIFF(DAY, @d, @game_date),
        CASE
            WHEN DATEDIFF(DAY, @d, @game_date) < 0 THEN 'Teardown'
            WHEN DATEDIFF(DAY, @d, @game_date) = 0 THEN 'Game Day'
            WHEN DATEDIFF(DAY, @d, @game_date) <= 2 THEN 'Setup'
            ELSE 'Ticket Sales Window'
        END
    );
    SET @d = DATEADD(DAY, 1, @d);
END
GO

INSERT INTO dim_sales_channel (channel_name, market_type) VALUES
    ('Season Ticket Holder Allocation', 'Primary'),
    ('Public On-Sale',                  'Primary'),
    ('Corporate Hospitality Package',   'Primary'),
    ('Ticket Exchange / Resale',        'Secondary');
GO

INSERT INTO dim_budget_category (category_name) VALUES
    ('Direct Labor'),
    ('Equipment & AV'),
    ('Insurance & Risk Management'),
    ('Facilities & Site Prep'),
    ('Security Technology & K9'),
    ('Coordination & Overhead'),
    ('Contingency Reserve');
GO

INSERT INTO dim_vendor (vendor_name, vendor_category, contract_amount) VALUES
    ('Apex Staffing Solutions',   'Staffing Agency',        410000.00),
    ('Summit Security Services',  'Security Services',      680000.00),
    ('Gameday Catering Co.',      'Catering',                295000.00),
    ('CleanSweep Facilities',     'Cleaning Services',       210000.00),
    ('Rapid Response Medical',    'Medical Services',        185000.00),
    ('Skyline AV Productions',    'Broadcast / AV Equipment',540000.00),
    ('Metro Shuttle Transit',     'Transportation',          160000.00),
    ('Premier Merchandise Group', 'Merchandise Supplier',    120000.00);
GO

INSERT INTO dim_gate (gate_name, zone, max_capacity_per_hour) VALUES
    ('Gate A', 'North',       8000),
    ('Gate B', 'South',       8000),
    ('Gate C', 'East',        6000),
    ('Gate D', 'West',        6000),
    ('Gate E', 'Club Level',  3000),
    ('Gate F', 'Suites',      1500);
GO

INSERT INTO dim_ticket_tier (tier_name, face_value, gate_id) VALUES
    ('Upper Bowl',                950.00, 1),
    ('Lower Bowl',               2400.00, 2),
    ('Club Level',               4800.00, 5),
    ('Suite Package (per seat)', 9500.00, 6),
    ('Standing Room / Party Deck', 650.00, 3);
GO

INSERT INTO dim_sponsor (sponsor_name, category, sponsorship_tier) VALUES
    ('Apex Beverage Co.',        'Beverage',           'Presenting Sponsor'),
    ('IronPeak Financial',       'Financial Services', 'Official Partner'),
    ('Velocity Motors',          'Automotive',         'Official Partner'),
    ('NimbusTech',               'Technology',         'Suite Sponsor'),
    ('Guardian Insurance Group', 'Insurance',          'Official Partner'),
    ('Stride Athletic Apparel',  'Apparel',            'Official Partner'),
    ('Crestline Streaming Co.',  'Media / Broadcast',  'Official Partner');
GO

-- =============================== FACTS =====================================

-- ---------------------------------------------------------------------------
-- fact_ticket_sales: transaction grain, generated set-based per channel.
-- Each channel is only eligible for certain tiers and certain points in the
-- sales window, and price/quantity move with proximity to game day:
--   Season Ticket Holder Allocation : Upper/Lower/Club only, early-access
--                                      window (50-58 days out), face value.
--   Public On-Sale                  : Upper/Lower/Standing Room, most of the
--                                      window, volume builds as game nears.
--   Corporate Hospitality Package   : Club/Suite only, bulk bought early,
--                                      15-35% markup for the bundled package.
--   Ticket Exchange / Resale        : all tiers, last 30 days only, price
--                                      climbs sharply the closer to kickoff
--                                      (classic secondary-market scarcity).
-- ---------------------------------------------------------------------------
INSERT INTO fact_ticket_sales (tier_id, date_id, channel_id, quantity_sold, unit_price)
SELECT
    tt.tier_id,
    dd.date_id,
    ch.channel_id,
    150 + ABS(CHECKSUM(NEWID())) % 100 AS quantity_sold,
    CAST(tt.face_value * (0.99 + (ABS(CHECKSUM(NEWID())) % 3) / 100.0) AS DECIMAL(10,2)) AS unit_price
FROM dim_date dd
CROSS JOIN dim_ticket_tier tt
CROSS JOIN dim_sales_channel ch
WHERE ch.channel_name = 'Season Ticket Holder Allocation'
  AND tt.tier_name IN ('Upper Bowl', 'Lower Bowl', 'Club Level')
  AND dd.days_to_game BETWEEN 50 AND 58;
GO

INSERT INTO fact_ticket_sales (tier_id, date_id, channel_id, quantity_sold, unit_price)
SELECT
    tt.tier_id,
    dd.date_id,
    ch.channel_id,
    20 + (55 - dd.days_to_game) * 3 + ABS(CHECKSUM(NEWID())) % 40 AS quantity_sold,
    CAST(tt.face_value * 1.05 * (0.97 + (ABS(CHECKSUM(NEWID())) % 7) / 100.0) AS DECIMAL(10,2)) AS unit_price
FROM dim_date dd
CROSS JOIN dim_ticket_tier tt
CROSS JOIN dim_sales_channel ch
WHERE ch.channel_name = 'Public On-Sale'
  AND tt.tier_name IN ('Upper Bowl', 'Lower Bowl', 'Standing Room / Party Deck')
  AND dd.days_to_game BETWEEN 5 AND 55;
GO

INSERT INTO fact_ticket_sales (tier_id, date_id, channel_id, quantity_sold, unit_price)
SELECT
    tt.tier_id,
    dd.date_id,
    ch.channel_id,
    5 + ABS(CHECKSUM(NEWID())) % 20 AS quantity_sold,
    CAST(tt.face_value * 1.35 * (0.95 + (ABS(CHECKSUM(NEWID())) % 15) / 100.0) AS DECIMAL(10,2)) AS unit_price
FROM dim_date dd
CROSS JOIN dim_ticket_tier tt
CROSS JOIN dim_sales_channel ch
WHERE ch.channel_name = 'Corporate Hospitality Package'
  AND tt.tier_name IN ('Club Level', 'Suite Package (per seat)')
  AND dd.days_to_game BETWEEN 10 AND 58;
GO

INSERT INTO fact_ticket_sales (tier_id, date_id, channel_id, quantity_sold, unit_price)
SELECT
    tt.tier_id,
    dd.date_id,
    ch.channel_id,
    3 + ABS(CHECKSUM(NEWID())) % 15 AS quantity_sold,
    CAST(tt.face_value * (1.10 + (30 - dd.days_to_game) * 0.03) * (0.90 + (ABS(CHECKSUM(NEWID())) % 40) / 100.0) AS DECIMAL(10,2)) AS unit_price
FROM dim_date dd
CROSS JOIN dim_ticket_tier tt
CROSS JOIN dim_sales_channel ch
WHERE ch.channel_name = 'Ticket Exchange / Resale'
  AND dd.days_to_game BETWEEN 3 AND 30;
GO

-- Gate entries span a 6-hour pre-game window (11:00-16:59) -- early arrivals
-- are light, volume and wait times build as kickoff approaches.
INSERT INTO fact_gate_entries (gate_id, entry_hour, fans_entered, avg_wait_time_minutes) VALUES
    (1, 11,  400, 1.2), (1, 12,  900, 1.8), (1, 13, 1500, 2.1), (1, 14, 2600, 3.8), (1, 15, 2900, 6.5), (1, 16,  900, 11.2),
    (2, 11,  380, 1.3), (2, 12,  850, 2.0), (2, 13, 1400, 2.4), (2, 14, 2500, 4.1), (2, 15, 3000, 7.2), (2, 16, 1000, 12.8),
    (3, 11,  300, 1.1), (3, 12,  650, 1.7), (3, 13, 1100, 2.0), (3, 14, 1900, 3.5), (3, 15, 2200, 6.0), (3, 16,  700, 10.5),
    (4, 11,  290, 1.2), (4, 12,  620, 1.8), (4, 13, 1050, 2.2), (4, 14, 1850, 3.7), (4, 15, 2150, 6.3), (4, 16,  750, 10.9),
    (5, 11,  150, 0.8), (5, 12,  350, 1.3), (5, 13,  600, 1.5), (5, 14, 1000, 2.8), (5, 15, 1100, 4.2), (5, 16,  250,  6.0),
    (6, 11,   80, 0.6), (6, 12,  180, 0.9), (6, 13,  300, 1.0), (6, 14,  500, 1.8), (6, 15,  550, 2.5), (6, 16,  120,  3.2);
GO

-- ---------------------------------------------------------------------------
-- fact_staffing_cost: same 16 game-day crews as before (department/vendor
-- pairs), now dated to Game Day plus lighter Setup (2 days, 1 day out) and
-- Teardown crews. Not every department works every phase -- Medical and
-- Broadcast only show up on Game Day, Cleaning and Security span all four
-- dates, matching how a real stadium build/breakdown schedule works.
-- ---------------------------------------------------------------------------

-- Setup Day 1 (2 days before game): site lockdown, initial cleaning pass, merch stocking begins.
INSERT INTO fact_staffing_cost (department_id, vendor_id, date_id, crew_name, workers_scheduled, hours_per_worker, hourly_rate)
SELECT 1, 2, date_id, 'Security: Perimeter & Bag Check',        60, 8.0, 26.00 FROM dim_date WHERE days_to_game = 2
UNION ALL SELECT 7, 4, date_id, 'Cleaning: Site Prep Crew',      50, 8.0, 18.00 FROM dim_date WHERE days_to_game = 2
UNION ALL SELECT 3, 8, date_id, 'Concessions: Merchandise Stocking', 30, 6.0, 17.00 FROM dim_date WHERE days_to_game = 2;
GO

-- Setup Day 2 (1 day before game): credentialing walkthrough, AV rig, stand stocking, usher training.
INSERT INTO fact_staffing_cost (department_id, vendor_id, date_id, crew_name, workers_scheduled, hours_per_worker, hourly_rate)
SELECT 1, 2, date_id, 'Security: Perimeter & Bag Check',            90,  9.0, 27.00 FROM dim_date WHERE days_to_game = 1
UNION ALL SELECT 1, 2, date_id, 'Security: Credentialing Walkthrough',  40,  8.0, 28.00 FROM dim_date WHERE days_to_game = 1
UNION ALL SELECT 7, 4, date_id, 'Cleaning: Site Prep Crew',             70,  9.0, 18.50 FROM dim_date WHERE days_to_game = 1
UNION ALL SELECT 3, 3, date_id, 'Concessions: Stand Stocking & Prep',  120,  8.0, 18.00 FROM dim_date WHERE days_to_game = 1
UNION ALL SELECT 3, 8, date_id, 'Concessions: Merchandise Stocking',    60,  8.0, 17.50 FROM dim_date WHERE days_to_game = 1
UNION ALL SELECT 6, 6, date_id, 'Broadcast: Production Rehearsal',      40, 10.0, 50.00 FROM dim_date WHERE days_to_game = 1
UNION ALL SELECT 6, 6, date_id, 'Broadcast: AV Rig & Engineering',      25, 12.0, 65.00 FROM dim_date WHERE days_to_game = 1
UNION ALL SELECT 2, 1, date_id, 'Guest Services: Usher Training',       30,  6.0, 18.00 FROM dim_date WHERE days_to_game = 1;
GO

-- Game Day: full crews -- same headcounts/rates as the original single-day version.
INSERT INTO fact_staffing_cost (department_id, vendor_id, date_id, crew_name, workers_scheduled, hours_per_worker, hourly_rate)
SELECT 1, 2, date_id, 'Security: Perimeter & Bag Check',          380, 10.0, 28.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 1, 2, date_id, 'Security: Interior / Seating Bowl',    320, 12.0, 30.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 1, 2, date_id, 'Security: K9 & Specialized Units',      45, 14.0, 58.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 2, 1, date_id, 'Guest Services: Ushers & Ticket Takers',280, 10.0, 19.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 2, 1, date_id, 'Guest Services: Guest Relations & ADA', 65, 12.0, 24.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 3, 3, date_id, 'Concessions: Stand Staff',             600, 10.0, 19.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 3, 8, date_id, 'Concessions: Merchandise Sales',       180, 10.0, 18.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 3, 3, date_id, 'Concessions: Suite / Premium Catering',  85, 11.0, 26.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 4, 5, date_id, 'Medical: EMT & First Aid Stations',      75, 12.0, 52.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 4, 5, date_id, 'Medical: Emergency Response Coordination',15, 14.0, 85.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 5, 7, date_id, 'Parking: Parking Attendants',          110, 10.0, 20.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 5, 7, date_id, 'Parking: Shuttle & Transit Operations', 45, 13.0, 27.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 6, 6, date_id, 'Broadcast: Production & Camera Crew',   80, 16.0, 52.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 6, 6, date_id, 'Broadcast: Technical / Engineering',    25, 18.0, 68.00 FROM dim_date WHERE days_to_game = 0
UNION ALL SELECT 7, 4, date_id, 'Cleaning: Game-Day Crew',              160, 10.0, 19.00 FROM dim_date WHERE days_to_game = 0;
GO

-- Teardown (1 day after game): breakdown crews only -- Medical, Broadcast, and Guest Services demobilize same-night.
INSERT INTO fact_staffing_cost (department_id, vendor_id, date_id, crew_name, workers_scheduled, hours_per_worker, hourly_rate)
SELECT 7, 4, date_id, 'Cleaning: Post-Event Teardown Crew',  90,  8.0, 22.00 FROM dim_date WHERE days_to_game = -1
UNION ALL SELECT 1, 2, date_id, 'Security: Overnight Sweep & Breakdown', 60,  6.0, 26.00 FROM dim_date WHERE days_to_game = -1
UNION ALL SELECT 5, 7, date_id, 'Parking: Shuttle Wind-Down',            25,  6.0, 26.00 FROM dim_date WHERE days_to_game = -1;
GO

-- ---------------------------------------------------------------------------
-- fact_concessions_sales: each gate/category's original daily total is
-- redistributed across entry_hour using a weight curve, then jittered +/-10%
-- so hours don't sum back to an exact round number. Food peaks pregame and
-- again at halftime; non-alcoholic beverage is steady with a halftime bump;
-- alcoholic beverage builds pregame/halftime and stops at hour 20 (typical
-- in-stadium alcohol sales cutoff); merchandise is flat with a small
-- post-game bump for souvenir buying.
-- ---------------------------------------------------------------------------
;WITH gate_totals AS (
    SELECT * FROM (VALUES
        (1, 'Food',                    145000.00, 11500),
        (1, 'Beverage - Non-Alcoholic',  62000.00, 14000),
        (1, 'Beverage - Alcoholic',      96000.00, 10800),
        (1, 'Merchandise',               87000.00,  1930),

        (2, 'Food',                    138000.00, 10900),
        (2, 'Beverage - Non-Alcoholic',  59000.00, 13400),
        (2, 'Beverage - Alcoholic',      92000.00, 10300),
        (2, 'Merchandise',               82000.00,  1820),

        (3, 'Food',                    102000.00,  8100),
        (3, 'Beverage - Non-Alcoholic',  46000.00, 10000),
        (3, 'Beverage - Alcoholic',      67000.00,  7600),
        (3, 'Merchandise',               61000.00,  1355),

        (4, 'Food',                     98000.00,  7750),
        (4, 'Beverage - Non-Alcoholic',  44000.00,  9600),
        (4, 'Beverage - Alcoholic',      64000.00,  7300),
        (4, 'Merchandise',               58000.00,  1290),

        (5, 'Food',                     76000.00,  3200),
        (5, 'Beverage - Non-Alcoholic',  21000.00,  3200),
        (5, 'Beverage - Alcoholic',     110000.00,  6600),
        (5, 'Merchandise',               54000.00,   900),

        (6, 'Food',                     51000.00,  1450),
        (6, 'Beverage - Non-Alcoholic',  12000.00,  1300),
        (6, 'Beverage - Alcoholic',      66000.00,  2900),
        (6, 'Merchandise',               29000.00,   380)
    ) AS t(gate_id, category, total_revenue, total_units)
),
hour_weights AS (
    SELECT * FROM (VALUES
        ('Food', 11, 0.03), ('Food', 12, 0.07), ('Food', 13, 0.11), ('Food', 14, 0.16), ('Food', 15, 0.19), ('Food', 16, 0.09),
        ('Food', 17, 0.04), ('Food', 18, 0.06), ('Food', 19, 0.13), ('Food', 20, 0.08), ('Food', 21, 0.04),

        ('Beverage - Non-Alcoholic', 11, 0.05), ('Beverage - Non-Alcoholic', 12, 0.08), ('Beverage - Non-Alcoholic', 13, 0.10),
        ('Beverage - Non-Alcoholic', 14, 0.11), ('Beverage - Non-Alcoholic', 15, 0.12), ('Beverage - Non-Alcoholic', 16, 0.08),
        ('Beverage - Non-Alcoholic', 17, 0.06), ('Beverage - Non-Alcoholic', 18, 0.08), ('Beverage - Non-Alcoholic', 19, 0.14),
        ('Beverage - Non-Alcoholic', 20, 0.10), ('Beverage - Non-Alcoholic', 21, 0.08),

        ('Beverage - Alcoholic', 11, 0.02), ('Beverage - Alcoholic', 12, 0.06), ('Beverage - Alcoholic', 13, 0.10),
        ('Beverage - Alcoholic', 14, 0.14), ('Beverage - Alcoholic', 15, 0.17), ('Beverage - Alcoholic', 16, 0.11),
        ('Beverage - Alcoholic', 17, 0.08), ('Beverage - Alcoholic', 18, 0.10), ('Beverage - Alcoholic', 19, 0.17),
        ('Beverage - Alcoholic', 20, 0.05),

        ('Merchandise', 11, 0.08), ('Merchandise', 12, 0.09), ('Merchandise', 13, 0.09), ('Merchandise', 14, 0.09),
        ('Merchandise', 15, 0.10), ('Merchandise', 16, 0.08), ('Merchandise', 17, 0.07), ('Merchandise', 18, 0.07),
        ('Merchandise', 19, 0.08), ('Merchandise', 20, 0.10), ('Merchandise', 21, 0.15)
    ) AS w(category, entry_hour, weight)
)
INSERT INTO fact_concessions_sales (gate_id, category, entry_hour, units_sold, revenue)
SELECT
    gt.gate_id,
    gt.category,
    hw.entry_hour,
    CAST(gt.total_units * hw.weight * (0.90 + (ABS(CHECKSUM(NEWID())) % 21) / 100.0) AS INT) AS units_sold,
    CAST(gt.total_revenue * hw.weight * (0.90 + (ABS(CHECKSUM(NEWID())) % 21) / 100.0) AS DECIMAL(12,2)) AS revenue
FROM gate_totals gt
JOIN hour_weights hw ON hw.category = gt.category;
GO

-- ---------------------------------------------------------------------------
-- fact_sponsorship_revenue: each original sponsor/category deal split into
-- installments across the contract timeline (deposit near the start of the
-- window, milestone mid-window, final payment close to game day). Per-deal
-- totals still match the original single-line amounts.
-- ---------------------------------------------------------------------------
INSERT INTO fact_sponsorship_revenue (sponsor_id, revenue_category, date_id, amount)
SELECT 1, 'Signage & Activation', (SELECT date_id FROM dim_date WHERE days_to_game = 58), 7400000.00
UNION ALL SELECT 1, 'Signage & Activation', (SELECT date_id FROM dim_date WHERE days_to_game = 30), 6475000.00
UNION ALL SELECT 1, 'Signage & Activation', (SELECT date_id FROM dim_date WHERE days_to_game = 7),  4625000.00

UNION ALL SELECT 1, 'Broadcast Ad Package', (SELECT date_id FROM dim_date WHERE days_to_game = 45), 5520000.00
UNION ALL SELECT 1, 'Broadcast Ad Package', (SELECT date_id FROM dim_date WHERE days_to_game = 14), 3680000.00

UNION ALL SELECT 2, 'Suite Package & Signage', (SELECT date_id FROM dim_date WHERE days_to_game = 55), 2560000.00
UNION ALL SELECT 2, 'Suite Package & Signage', (SELECT date_id FROM dim_date WHERE days_to_game = 28), 2240000.00
UNION ALL SELECT 2, 'Suite Package & Signage', (SELECT date_id FROM dim_date WHERE days_to_game = 6),  1600000.00

UNION ALL SELECT 3, 'Broadcast Ad Package', (SELECT date_id FROM dim_date WHERE days_to_game = 45), 4680000.00
UNION ALL SELECT 3, 'Broadcast Ad Package', (SELECT date_id FROM dim_date WHERE days_to_game = 14), 3120000.00

UNION ALL SELECT 4, 'Suite Package', (SELECT date_id FROM dim_date WHERE days_to_game = 50), 1860000.00
UNION ALL SELECT 4, 'Suite Package', (SELECT date_id FROM dim_date WHERE days_to_game = 20), 1240000.00
UNION ALL SELECT 4, 'Halftime Show Activation', (SELECT date_id FROM dim_date WHERE days_to_game = 5), 1800000.00

UNION ALL SELECT 5, 'Signage', (SELECT date_id FROM dim_date WHERE days_to_game = 52), 2550000.00
UNION ALL SELECT 5, 'Signage', (SELECT date_id FROM dim_date WHERE days_to_game = 18), 1700000.00

UNION ALL SELECT 6, 'Activation Space', (SELECT date_id FROM dim_date WHERE days_to_game = 40), 1740000.00
UNION ALL SELECT 6, 'Activation Space', (SELECT date_id FROM dim_date WHERE days_to_game = 12), 1160000.00

UNION ALL SELECT 7, 'Digital Streaming Rights', (SELECT date_id FROM dim_date WHERE days_to_game = 50), 2800000.00
UNION ALL SELECT 7, 'Digital Streaming Rights', (SELECT date_id FROM dim_date WHERE days_to_game = 10), 2800000.00;
GO

-- Incidents span pre-game (11:00-16:00), in-game/halftime (17:00-20:00), and
-- post-game egress (21:00-22:00) -- egress and halftime realistically see
-- more crowd-control and ejection incidents than the quiet pre-game hours.
INSERT INTO fact_security_incidents (gate_id, incident_type, severity, incident_hour, response_time_minutes) VALUES
    (1, 'Medical',         'Low',    14,  4.5),
    (2, 'Crowd Control',   'Medium', 15,  8.2),
    (3, 'Prohibited Item', 'Low',    13,  2.1),
    (1, 'Prohibited Item', 'Low',    14,  1.8),
    (2, 'Prohibited Item', 'Low',    11,  1.5),
    (4, 'Lost Child',      'Low',    12,  6.2),
    (6, 'Prohibited Item', 'Low',    12,  1.9),
    (3, 'Prohibited Item', 'Low',    16,  2.0),
    (5, 'Medical',         'Medium', 18,  6.4),
    (4, 'Medical',         'Medium', 18,  7.1),
    (5, 'Crowd Control',   'Low',    18,  5.0),
    (2, 'Lost Child',      'Medium', 17, 15.0),
    (6, 'Crowd Control',   'Low',    16,  5.5),
    (3, 'Medical',         'High',   20,  9.8),
    (6, 'Ejection',        'High',   20, 14.6),
    (1, 'Crowd Control',   'High',   19, 18.2),
    (4, 'Ejection',        'High',   19, 12.5),
    (2, 'Medical',         'Low',    16,  3.9),
    (5, 'Ejection',        'Medium', 20, 10.1),
    (3, 'Lost Child',      'Low',    14,  7.6),
    (6, 'Medical',         'Low',    17,  4.2),
    (1, 'Lost Child',      'Medium', 18, 11.3),
    (3, 'Crowd Control',   'Medium', 21,  9.5),
    (1, 'Crowd Control',   'High',   21, 16.8),
    (2, 'Ejection',        'Medium', 21, 11.2),
    (1, 'Medical',         'Low',    21,  5.3),
    (2, 'Crowd Control',   'Medium', 22, 10.0),
    (4, 'Medical',         'Low',    22,  4.8),
    (5, 'Prohibited Item', 'Low',    13,  2.4),
    (6, 'Lost Child',      'Low',    15,  5.9),
    (3, 'Ejection',        'Medium', 19, 10.8),
    (4, 'Crowd Control',   'Medium', 20,  9.1),
    (1, 'Ejection',        'High',   20, 13.9),
    (5, 'Lost Child',      'Medium', 17, 12.4),
    (2, 'Medical',         'Medium', 19,  7.8),
    (6, 'Crowd Control',   'Medium', 21,  8.6),
    (3, 'Medical',         'Low',    12,  3.5),
    (4, 'Prohibited Item', 'Low',    11,  1.6);
GO

-- ---------------------------------------------------------------------------
-- fact_department_budget: each department's original total decomposed into
-- category line items that sum to the same budgeted/actual totals as the
-- single-row version (e.g. Security: 3,200,000 budgeted / 3,354,000 actual).
-- ---------------------------------------------------------------------------
INSERT INTO fact_department_budget (department_id, category_id, budgeted_amount, actual_amount)
SELECT 1, 1, 2000000.00, 2120000.00     -- Security: Direct Labor
UNION ALL SELECT 1, 5,  450000.00,  468000.00     -- Security: Security Technology & K9
UNION ALL SELECT 1, 2,  150000.00,  142000.00     -- Security: Equipment & AV
UNION ALL SELECT 1, 3,  400000.00,  410000.00     -- Security: Insurance & Risk Management
UNION ALL SELECT 1, 6,  200000.00,  214000.00     -- Security: Coordination & Overhead

UNION ALL SELECT 2, 1,  950000.00,  906000.00     -- Guest Services: Direct Labor
UNION ALL SELECT 2, 2,  100000.00,   92000.00     -- Guest Services: Equipment & AV
UNION ALL SELECT 2, 6,  250000.00,  240600.00     -- Guest Services: Coordination & Overhead
UNION ALL SELECT 2, 7,  150000.00,  154000.00     -- Guest Services: Contingency Reserve

UNION ALL SELECT 3, 1, 1400000.00, 1462000.00     -- Concessions: Direct Labor
UNION ALL SELECT 3, 2,  200000.00,  210000.00     -- Concessions: Equipment & AV
UNION ALL SELECT 3, 4,  250000.00,  268400.00     -- Concessions: Facilities & Site Prep
UNION ALL SELECT 3, 6,  250000.00,  247000.00     -- Concessions: Coordination & Overhead

UNION ALL SELECT 4, 1,  420000.00,  405000.00     -- Medical: Direct Labor
UNION ALL SELECT 4, 2,   80000.00,   76000.00     -- Medical: Equipment & AV
UNION ALL SELECT 4, 3,   90000.00,   87500.00     -- Medical: Insurance & Risk Management
UNION ALL SELECT 4, 6,   30000.00,   30000.00     -- Medical: Coordination & Overhead

UNION ALL SELECT 5, 1,  620000.00,  660000.00     -- Parking: Direct Labor
UNION ALL SELECT 5, 2,   80000.00,   92000.00     -- Parking: Equipment & AV
UNION ALL SELECT 5, 4,  150000.00,  165300.00     -- Parking: Facilities & Site Prep
UNION ALL SELECT 5, 6,  130000.00,  125000.00     -- Parking: Coordination & Overhead

UNION ALL SELECT 6, 1,  850000.00,  815000.00     -- Broadcast: Direct Labor
UNION ALL SELECT 6, 2,  700000.00,  668000.00     -- Broadcast: Equipment & AV
UNION ALL SELECT 6, 6,  200000.00,  196600.00     -- Broadcast: Coordination & Overhead
UNION ALL SELECT 6, 7,  100000.00,  100000.00     -- Broadcast: Contingency Reserve

UNION ALL SELECT 7, 1,  480000.00,  500000.00     -- Cleaning: Direct Labor
UNION ALL SELECT 7, 2,   60000.00,   58000.00     -- Cleaning: Equipment & AV
UNION ALL SELECT 7, 4,  150000.00,  158900.00     -- Cleaning: Facilities & Site Prep
UNION ALL SELECT 7, 6,   50000.00,   46000.00;    -- Cleaning: Coordination & Overhead
GO
