-- MindMesh ClickHouse schema (Person C / sponsor integration)
-- Run against your ClickHouse instance (HTTP port 8123 by default):
--   cat sql/schema.sql | clickhouse-client --multiquery
-- Or via clickhouse-connect (Python) using utils.db_client.WellnessDBClient.init_schema()

CREATE TABLE IF NOT EXISTS wellness_events (
    timestamp DateTime,
    session_id String,
    mood_score Int32,
    stress_score Int32,
    anxiety_score Int32,
    risk_level String,
    typing_speed Int32,
    deletion_frequency Int32,
    sleep_hours Int32,
    intervention_type String,
    monitoring_level String,
    emotional_volatility Float32
) ENGINE = MergeTree()
PARTITION BY toDate(timestamp)
ORDER BY (session_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS wellness_hourly_agg
ENGINE = AggregatingMergeTree()
ORDER BY (session_id, hour)
AS SELECT
    session_id,
    toStartOfHour(timestamp) AS hour,
    avg(stress_score) AS avg_stress,
    avg(anxiety_score) AS avg_anxiety,
    avg(mood_score) AS avg_mood,
    max(risk_level) AS max_risk,
    count() AS event_count
FROM wellness_events
GROUP BY session_id, hour;
