/* =============================================================================
   SUPER BOWL OPERATIONS — table creation (star schema)
   -----------------------------------------------------------------------------
   8 dimension tables + 6 fact tables. Every fact table joins straight back to
   one or more dimensions -- one hop -- so this is a star schema, same shape
   as the Cal Football workbook (Seasons at the center there; here it's
   Department / Vendor / Gate / Ticket_Tier / Sponsor / Date / Sales_Channel /
   Budget_Category). dim_date is the shared time dimension: ticket sale
   transactions, sponsorship payment installments, and staffing shifts all
   hang off it, so you can group any of those three by week/month/event phase
   without three separate date columns.
============================================================================= */

USE SuperBowlOps;
GO

-- ============================= DIMENSIONS ==================================

CREATE TABLE dim_department (
    department_id    INT IDENTITY(1,1) PRIMARY KEY,
    department_name  NVARCHAR(50) NOT NULL,
    department_group NVARCHAR(30) NOT NULL   -- Operations / Guest Experience / Revenue / Support
);
GO

CREATE TABLE dim_date (
    date_id        INT IDENTITY(1,1) PRIMARY KEY,
    calendar_date  DATE NOT NULL UNIQUE,
    day_name       NVARCHAR(10) NOT NULL,
    week_number    INT NOT NULL,
    month_name     NVARCHAR(10) NOT NULL,
    days_to_game   INT NOT NULL,             -- game day = 0, negative = after game day
    event_phase    NVARCHAR(20) NOT NULL     -- Ticket Sales Window / Setup / Game Day / Teardown
);
GO

CREATE TABLE dim_sales_channel (
    channel_id     INT IDENTITY(1,1) PRIMARY KEY,
    channel_name   NVARCHAR(50) NOT NULL,
    market_type    NVARCHAR(20) NOT NULL     -- Primary / Secondary
);
GO

CREATE TABLE dim_budget_category (
    category_id    INT IDENTITY(1,1) PRIMARY KEY,
    category_name  NVARCHAR(50) NOT NULL
);
GO

CREATE TABLE dim_vendor (
    vendor_id         INT IDENTITY(1,1) PRIMARY KEY,
    vendor_name       NVARCHAR(100) NOT NULL,
    vendor_category   NVARCHAR(50) NOT NULL,
    contract_amount   DECIMAL(12,2) NOT NULL
);
GO

CREATE TABLE dim_gate (
    gate_id               INT IDENTITY(1,1) PRIMARY KEY,
    gate_name             NVARCHAR(20) NOT NULL,
    zone                  NVARCHAR(20) NOT NULL,
    max_capacity_per_hour INT NOT NULL
);
GO

CREATE TABLE dim_ticket_tier (
    tier_id     INT IDENTITY(1,1) PRIMARY KEY,
    tier_name   NVARCHAR(50) NOT NULL,
    face_value  DECIMAL(10,2) NOT NULL,
    gate_id     INT NOT NULL,               -- primary entry point for this tier
    FOREIGN KEY (gate_id) REFERENCES dim_gate(gate_id)
);
GO

CREATE TABLE dim_sponsor (
    sponsor_id        INT IDENTITY(1,1) PRIMARY KEY,
    sponsor_name      NVARCHAR(100) NOT NULL,
    category          NVARCHAR(50) NOT NULL,
    sponsorship_tier  NVARCHAR(30) NOT NULL   -- Presenting / Official Partner / Suite Sponsor
);
GO

-- =============================== FACTS =====================================

-- Transaction grain: one row per tier/date/channel combination actually sold,
-- not one row per tier. gross_revenue is computed so unit_price can vary by
-- channel (season ticket holder face value vs. resale markup) instead of
-- being baked into a single total.
CREATE TABLE fact_ticket_sales (
    sale_id         INT IDENTITY(1,1) PRIMARY KEY,
    tier_id         INT NOT NULL,
    date_id         INT NOT NULL,
    channel_id      INT NOT NULL,
    quantity_sold   INT NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    gross_revenue   AS (quantity_sold * unit_price) PERSISTED,
    FOREIGN KEY (tier_id) REFERENCES dim_ticket_tier(tier_id),
    FOREIGN KEY (date_id) REFERENCES dim_date(date_id),
    FOREIGN KEY (channel_id) REFERENCES dim_sales_channel(channel_id)
);
GO

CREATE TABLE fact_gate_entries (
    entry_id               INT IDENTITY(1,1) PRIMARY KEY,
    gate_id                INT NOT NULL,
    entry_hour             INT NOT NULL,        -- 24hr clock, pre-game window sample
    fans_entered            INT NOT NULL,
    avg_wait_time_minutes   DECIMAL(5,2) NOT NULL,
    FOREIGN KEY (gate_id) REFERENCES dim_gate(gate_id)
);
GO

-- Crew grain now carries its own shift date, so the same crew definition can
-- recur across Setup / Game Day / Teardown with different headcounts instead
-- of a single game-day-only row.
CREATE TABLE fact_staffing_cost (
    staffing_id       INT IDENTITY(1,1) PRIMARY KEY,
    department_id     INT NOT NULL,
    vendor_id         INT NOT NULL,
    date_id           INT NOT NULL,
    crew_name         NVARCHAR(60) NOT NULL,
    workers_scheduled INT NOT NULL,
    hours_per_worker  DECIMAL(5,2) NOT NULL,
    hourly_rate       DECIMAL(8,2) NOT NULL,
    total_cost        AS (workers_scheduled * hours_per_worker * hourly_rate) PERSISTED,
    FOREIGN KEY (department_id) REFERENCES dim_department(department_id),
    FOREIGN KEY (vendor_id) REFERENCES dim_vendor(vendor_id),
    FOREIGN KEY (date_id) REFERENCES dim_date(date_id)
);
GO

-- entry_hour added so concessions can be sliced the same way gate entries
-- and security incidents already are (pregame build-up / game & halftime /
-- post-game egress) instead of one lump total per gate per category.
CREATE TABLE fact_concessions_sales (
    concessions_id  INT IDENTITY(1,1) PRIMARY KEY,
    gate_id         INT NOT NULL,
    category        NVARCHAR(30) NOT NULL,   -- Food / Beverage - Alcoholic / Beverage - Non-Alcoholic / Merchandise
    entry_hour      INT NOT NULL,
    units_sold      INT NOT NULL,
    revenue         DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (gate_id) REFERENCES dim_gate(gate_id)
);
GO

-- Each sponsor/category deal is now paid in installments over the contract
-- timeline rather than a single lump amount, so revenue can be grouped by
-- month or event phase (e.g. "how much sponsorship revenue is recognized
-- before vs. after game day").
CREATE TABLE fact_sponsorship_revenue (
    revenue_id        INT IDENTITY(1,1) PRIMARY KEY,
    sponsor_id        INT NOT NULL,
    revenue_category  NVARCHAR(50) NOT NULL,  -- Signage / Suite Package / Broadcast Ad Package / Activation Space
    date_id           INT NOT NULL,
    amount            DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (sponsor_id) REFERENCES dim_sponsor(sponsor_id),
    FOREIGN KEY (date_id) REFERENCES dim_date(date_id)
);
GO

CREATE TABLE fact_security_incidents (
    incident_id             INT IDENTITY(1,1) PRIMARY KEY,
    gate_id                 INT NOT NULL,
    incident_type           NVARCHAR(30) NOT NULL,  -- Medical / Crowd Control / Prohibited Item / Ejection / Lost Child
    severity                NVARCHAR(10) NOT NULL,  -- Low / Medium / High
    incident_hour           INT NOT NULL,
    response_time_minutes   DECIMAL(5,2) NOT NULL,
    FOREIGN KEY (gate_id) REFERENCES dim_gate(gate_id)
);
GO

-- Line-item grain: each department's budget is now several category rows
-- (Labor, Equipment & AV, Insurance, ...) that sum to the department total,
-- instead of one pre-aggregated row per department.
CREATE TABLE fact_department_budget (
    budget_id         INT IDENTITY(1,1) PRIMARY KEY,
    department_id     INT NOT NULL,
    category_id       INT NOT NULL,
    budgeted_amount   DECIMAL(14,2) NOT NULL,
    actual_amount     DECIMAL(14,2) NOT NULL,
    variance_amount   AS (actual_amount - budgeted_amount) PERSISTED,
    FOREIGN KEY (department_id) REFERENCES dim_department(department_id),
    FOREIGN KEY (category_id) REFERENCES dim_budget_category(category_id)
);
GO
