/* =============================================================================
   SUPER BOWL OPERATIONS — sample data (all figures fabricated for practice)
   -----------------------------------------------------------------------------
   Revised: staffing is now split into realistic sub-crews per department
   instead of one row each (Security in particular was too light for a
   71,000-attendee mega-event at the original single-crew headcount -- real
   large-stadium events run security-to-attendee ratios well above what a
   single 450-person crew implies). Gate entries now span a 6-hour pre-game
   window, concessions splits Beverage into Alcoholic/Non-Alcoholic, and
   security incidents now cover pre-game, halftime, and post-game egress
   instead of just the pre-game window.

   Note: fact_department_budget's totals (below) are the FULL department
   operating budget -- staffing, equipment, insurance, coordination overhead,
   everything. fact_staffing_cost is only the direct hourly labor portion, so
   it will always be smaller than the matching department's budget line.
   That's intentional, not an error -- same distinction as Games vs.
   Ticket_Sales in the Cal Football workbook (different operational scope,
   not the same number measured twice).
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

INSERT INTO fact_ticket_sales (tier_id, quantity_sold, gross_revenue) VALUES
    (1, 28000, 26600000.00),
    (2, 32000, 76800000.00),
    (3,  6000, 28800000.00),
    (4,  1800, 17100000.00),
    (5,  3200,  2080000.00);
GO

-- Gate entries now span a 6-hour pre-game window (11:00-16:59), not just the
-- last 4 hours -- early arrivals are light, volume and wait times build as
-- kickoff approaches.
INSERT INTO fact_gate_entries (gate_id, entry_hour, fans_entered, avg_wait_time_minutes) VALUES
    (1, 11,  400, 1.2), (1, 12,  900, 1.8), (1, 13, 1500, 2.1), (1, 14, 2600, 3.8), (1, 15, 2900, 6.5), (1, 16,  900, 11.2),
    (2, 11,  380, 1.3), (2, 12,  850, 2.0), (2, 13, 1400, 2.4), (2, 14, 2500, 4.1), (2, 15, 3000, 7.2), (2, 16, 1000, 12.8),
    (3, 11,  300, 1.1), (3, 12,  650, 1.7), (3, 13, 1100, 2.0), (3, 14, 1900, 3.5), (3, 15, 2200, 6.0), (3, 16,  700, 10.5),
    (4, 11,  290, 1.2), (4, 12,  620, 1.8), (4, 13, 1050, 2.2), (4, 14, 1850, 3.7), (4, 15, 2150, 6.3), (4, 16,  750, 10.9),
    (5, 11,  150, 0.8), (5, 12,  350, 1.3), (5, 13,  600, 1.5), (5, 14, 1000, 2.8), (5, 15, 1100, 4.2), (5, 16,  250,  6.0),
    (6, 11,   80, 0.6), (6, 12,  180, 0.9), (6, 13,  300, 1.0), (6, 14,  500, 1.8), (6, 15,  550, 2.5), (6, 16,  120,  3.2);
GO

-- Staffing is split into realistic sub-crews per department. Security in
-- particular is scaled up (745 total workers across 3 crews vs. a single
-- 450-person crew) to be proportionate to a 71,000-attendee mega-event.
INSERT INTO fact_staffing_cost (department_id, vendor_id, workers_scheduled, hours_per_worker, hourly_rate) VALUES
    (1, 2, 380, 10.0, 28.00),   -- Security: Perimeter & Bag Check          <- Summit Security Services
    (1, 2, 320, 12.0, 30.00),   -- Security: Interior / Seating Bowl        <- Summit Security Services
    (1, 2,  45, 14.0, 58.00),   -- Security: K9 & Specialized Units         <- Summit Security Services
    (2, 1, 280, 10.0, 19.00),   -- Guest Services: Ushers & Ticket Takers   <- Apex Staffing Solutions
    (2, 1,  65, 12.0, 24.00),   -- Guest Services: Guest Relations & ADA    <- Apex Staffing Solutions
    (3, 3, 600, 10.0, 19.00),   -- Concessions: Stand Staff                 <- Gameday Catering Co.
    (3, 8, 180, 10.0, 18.00),   -- Concessions: Merchandise Sales           <- Premier Merchandise Group
    (3, 3,  85, 11.0, 26.00),   -- Concessions: Suite / Premium Catering    <- Gameday Catering Co.
    (4, 5,  75, 12.0, 52.00),   -- Medical: EMT & First Aid Stations        <- Rapid Response Medical
    (4, 5,  15, 14.0, 85.00),   -- Medical: Emergency Response Coordination <- Rapid Response Medical
    (5, 7, 110, 10.0, 20.00),   -- Parking: Parking Attendants              <- Metro Shuttle Transit
    (5, 7,  45, 13.0, 27.00),   -- Parking: Shuttle & Transit Operations    <- Metro Shuttle Transit
    (6, 6,  80, 16.0, 52.00),   -- Broadcast: Production & Camera Crew      <- Skyline AV Productions
    (6, 6,  25, 18.0, 68.00),   -- Broadcast: Technical / Engineering       <- Skyline AV Productions
    (7, 4, 160, 10.0, 19.00),   -- Cleaning: Game-Day Crew                  <- CleanSweep Facilities
    (7, 4,  90,  8.0, 22.00);   -- Cleaning: Post-Event Teardown Crew       <- CleanSweep Facilities
GO

-- Beverage is split into Alcoholic / Non-Alcoholic (premium zones skew
-- toward alcoholic; general zones skew toward non-alcoholic).
INSERT INTO fact_concessions_sales (gate_id, category, units_sold, revenue) VALUES
    (1, 'Food',                    11500, 145000.00),
    (1, 'Beverage - Non-Alcoholic', 14000,  62000.00),
    (1, 'Beverage - Alcoholic',     10800,  96000.00),
    (1, 'Merchandise',               1930,  87000.00),

    (2, 'Food',                    10900, 138000.00),
    (2, 'Beverage - Non-Alcoholic', 13400,  59000.00),
    (2, 'Beverage - Alcoholic',     10300,  92000.00),
    (2, 'Merchandise',               1820,  82000.00),

    (3, 'Food',                     8100, 102000.00),
    (3, 'Beverage - Non-Alcoholic', 10000,  46000.00),
    (3, 'Beverage - Alcoholic',      7600,  67000.00),
    (3, 'Merchandise',               1355,  61000.00),

    (4, 'Food',                     7750,  98000.00),
    (4, 'Beverage - Non-Alcoholic',  9600,  44000.00),
    (4, 'Beverage - Alcoholic',      7300,  64000.00),
    (4, 'Merchandise',               1290,  58000.00),

    (5, 'Food',                     3200,  76000.00),
    (5, 'Beverage - Non-Alcoholic',  3200,  21000.00),
    (5, 'Beverage - Alcoholic',      6600, 110000.00),
    (5, 'Merchandise',                900,  54000.00),

    (6, 'Food',                     1450,  51000.00),
    (6, 'Beverage - Non-Alcoholic',  1300,  12000.00),
    (6, 'Beverage - Alcoholic',      2900,  66000.00),
    (6, 'Merchandise',                380,  29000.00);
GO

INSERT INTO fact_sponsorship_revenue (sponsor_id, revenue_category, amount) VALUES
    (1, 'Signage & Activation',    18500000.00),
    (1, 'Broadcast Ad Package',     9200000.00),
    (2, 'Suite Package & Signage',  6400000.00),
    (3, 'Broadcast Ad Package',     7800000.00),
    (4, 'Suite Package',            3100000.00),
    (4, 'Halftime Show Activation', 1800000.00),
    (5, 'Signage',                  4250000.00),
    (6, 'Activation Space',         2900000.00),
    (7, 'Digital Streaming Rights', 5600000.00);
GO

-- Incidents now span pre-game (11:00-16:00), in-game/halftime (17:00-20:00),
-- and post-game egress (21:00-22:00) -- egress and halftime realistically
-- see more crowd-control and ejection incidents than the quiet pre-game hours.
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
    (4, 'Medical',         'Low',    22,  4.8);
GO

INSERT INTO fact_department_budget (department_id, budgeted_amount, actual_amount) VALUES
    (1, 3200000.00, 3354000.00),
    (2, 1450000.00, 1392600.00),
    (3, 2100000.00, 2187400.00),
    (4,  620000.00,  598500.00),
    (5,  980000.00, 1042300.00),
    (6, 1850000.00, 1779600.00),
    (7,  740000.00,  762900.00);
GO
