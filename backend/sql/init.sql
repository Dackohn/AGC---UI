CREATE TABLE IF NOT EXISTS telemetry (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    speed FLOAT,
    battery FLOAT,
    mode VARCHAR(32),
    heading FLOAT,
    gps_accuracy FLOAT
);

CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type VARCHAR(32),
    message TEXT
);

CREATE TABLE IF NOT EXISTS commands (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    command_type VARCHAR(64),
    payload JSONB
);

CREATE TABLE IF NOT EXISTS route_sessions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    point_count INT NOT NULL DEFAULT 0,
    distance_m FLOAT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS route_points (
    id SERIAL PRIMARY KEY,
    session_id INT NOT NULL REFERENCES route_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    speed FLOAT,
    heading FLOAT,
    battery FLOAT
);

CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_route_points_session ON route_points(session_id, timestamp);
