/* =============================================================================
   SUPER BOWL OPERATIONS — sample database (SQL Server / T-SQL)
   -----------------------------------------------------------------------------
   SYNTHETIC / ILLUSTRATIVE DATA. This models a hypothetical upcoming Super Bowl
   from an Operations Analyst / Business Analyst point of view -- staffing,
   gate & security operations, concessions, sponsorship, and department budget.
   Every figure is fabricated for realism and practice; none of it is a real
   attendance, revenue, or cost figure from any actual NFL game.

   Run these four scripts in order in SSMS:
     01_create_database.sql   <- you are here
     02_create_tables.sql
     03_insert_sample_data.sql
     04_sample_queries.sql
============================================================================= */

IF DB_ID('SuperBowlOps') IS NOT NULL
BEGIN
    ALTER DATABASE SuperBowlOps SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE SuperBowlOps;
END
GO

CREATE DATABASE SuperBowlOps;
GO

USE SuperBowlOps;
GO
