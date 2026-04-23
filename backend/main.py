import asyncio
import json
import logging
import math
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt
from databases import Database
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("agc-backend")

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://agc:agcpassword@localhost:5432/agcdb")
MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", 1883))

database = Database(DATABASE_URL)

# ------- WebSocket connection manager -------

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: dict):
        data = json.dumps(message)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)

manager = ConnectionManager()

# ------- State -------

latest_state: dict[str, Any] = {
    "telemetry": {},
    "sensors": {"front": [0, 0, 0, 0], "rear": [0, 0, 0, 0]},
    "alerts": [],
    "status": {"state": "unknown", "message": "Waiting for vehicle..."},
}

# Route recording state
recording_session_id: int | None = None
last_route_point: dict | None = None  # for distance accumulation

loop: asyncio.AbstractEventLoop | None = None

# ------- Helpers -------

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))

# ------- MQTT -------

def on_mqtt_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
    except Exception:
        return

    topic = msg.topic

    if topic == "agc/vehicle/telemetry":
        latest_state["telemetry"] = payload
        asyncio.run_coroutine_threadsafe(_handle_telemetry(payload), loop)

    elif topic == "agc/vehicle/sensors":
        latest_state["sensors"] = payload
        asyncio.run_coroutine_threadsafe(
            manager.broadcast({"type": "sensors", "data": payload}), loop
        )

    elif topic == "agc/vehicle/alerts":
        alert = {**payload, "timestamp": payload.get("timestamp", datetime.now(timezone.utc).isoformat())}
        latest_state["alerts"] = [alert] + latest_state["alerts"][:49]
        asyncio.run_coroutine_threadsafe(_handle_alert(alert), loop)

    elif topic == "agc/vehicle/status":
        latest_state["status"] = payload
        asyncio.run_coroutine_threadsafe(
            manager.broadcast({"type": "status", "data": payload}), loop
        )

async def _handle_telemetry(payload: dict):
    global last_route_point
    await manager.broadcast({"type": "telemetry", "data": payload})

    # Persist to telemetry table
    try:
        await database.execute(
            """INSERT INTO telemetry (lat, lon, speed, battery, mode, heading, gps_accuracy)
               VALUES (:lat, :lon, :speed, :battery, :mode, :heading, :gps_accuracy)""",
            {
                "lat": payload.get("lat"),
                "lon": payload.get("lon"),
                "speed": payload.get("speed"),
                "battery": payload.get("battery"),
                "mode": payload.get("mode"),
                "heading": payload.get("heading"),
                "gps_accuracy": payload.get("gps_accuracy"),
            },
        )
    except Exception as e:
        log.warning(f"DB telemetry insert error: {e}")

    # If recording a route, append point and update distance
    if recording_session_id is not None and payload.get("lat") and payload.get("lon"):
        lat, lon = payload["lat"], payload["lon"]
        try:
            await database.execute(
                """INSERT INTO route_points (session_id, lat, lon, speed, heading, battery)
                   VALUES (:session_id, :lat, :lon, :speed, :heading, :battery)""",
                {
                    "session_id": recording_session_id,
                    "lat": lat,
                    "lon": lon,
                    "speed": payload.get("speed"),
                    "heading": payload.get("heading"),
                    "battery": payload.get("battery"),
                },
            )

            extra_m = 0.0
            if last_route_point:
                extra_m = haversine_m(last_route_point["lat"], last_route_point["lon"], lat, lon)

            last_route_point = {"lat": lat, "lon": lon}

            await database.execute(
                """UPDATE route_sessions
                   SET point_count = point_count + 1,
                       distance_m  = distance_m  + :extra
                   WHERE id = :sid""",
                {"extra": extra_m, "sid": recording_session_id},
            )
        except Exception as e:
            log.warning(f"Route point insert error: {e}")

async def _handle_alert(alert: dict):
    await manager.broadcast({"type": "alert", "data": alert})
    try:
        await database.execute(
            "INSERT INTO alerts (type, message) VALUES (:type, :message)",
            {"type": alert.get("type", "info"), "message": alert.get("message", "")},
        )
    except Exception as e:
        log.warning(f"DB alert insert error: {e}")

def start_mqtt():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_message = on_mqtt_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.subscribe([
        ("agc/vehicle/telemetry", 0),
        ("agc/vehicle/sensors", 0),
        ("agc/vehicle/alerts", 0),
        ("agc/vehicle/status", 0),
    ])
    client.loop_start()
    return client

mqtt_client: mqtt.Client | None = None

# ------- Schema migration -------

async def ensure_schema():
    """Create any missing tables so the backend works against an existing DB volume."""
    statements = [
        """CREATE TABLE IF NOT EXISTS telemetry (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            lat DOUBLE PRECISION, lon DOUBLE PRECISION,
            speed FLOAT, battery FLOAT, mode VARCHAR(32),
            heading FLOAT, gps_accuracy FLOAT
        )""",
        """CREATE TABLE IF NOT EXISTS alerts (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            type VARCHAR(32), message TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS commands (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            command_type VARCHAR(64), payload JSONB
        )""",
        """CREATE TABLE IF NOT EXISTS route_sessions (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128),
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            point_count INT NOT NULL DEFAULT 0,
            distance_m FLOAT NOT NULL DEFAULT 0
        )""",
        """CREATE TABLE IF NOT EXISTS route_points (
            id SERIAL PRIMARY KEY,
            session_id INT NOT NULL REFERENCES route_sessions(id) ON DELETE CASCADE,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL,
            speed FLOAT, heading FLOAT, battery FLOAT
        )""",
        "CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_route_points_session ON route_points(session_id, timestamp)",
    ]
    for stmt in statements:
        await database.execute(stmt)
    log.info("Schema verified/migrated")

# ------- Lifespan -------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global loop, mqtt_client
    loop = asyncio.get_event_loop()
    await database.connect()
    await ensure_schema()
    import time; time.sleep(2)
    mqtt_client = start_mqtt()
    yield
    if mqtt_client:
        mqtt_client.loop_stop()
    await database.disconnect()

app = FastAPI(title="AGC Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------- REST: state & telemetry -------

@app.get("/api/state")
async def get_state():
    return {**latest_state, "recording": recording_session_id is not None}

@app.get("/api/telemetry/history")
async def get_telemetry_history(limit: int = 200, offset: int = 0):
    rows = await database.fetch_all(
        "SELECT * FROM telemetry ORDER BY timestamp DESC LIMIT :limit OFFSET :offset",
        {"limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows]

@app.get("/api/alerts/history")
async def get_alerts_history(limit: int = 50):
    rows = await database.fetch_all(
        "SELECT * FROM alerts ORDER BY timestamp DESC LIMIT :limit",
        {"limit": limit},
    )
    return [dict(r) for r in rows]

# ------- REST: commands -------

class MissionPayload(BaseModel):
    waypoints: list[dict]

class ManualPayload(BaseModel):
    direction: str
    speed: float = 0.5

@app.post("/api/command/mission")
async def send_mission(payload: MissionPayload):
    data = payload.model_dump()
    mqtt_client.publish("agc/command/mission", json.dumps(data))
    await _log_command("mission", data)
    return {"status": "sent"}

@app.post("/api/command/emergency_stop")
async def emergency_stop():
    mqtt_client.publish("agc/command/emergency_stop", json.dumps({}))
    await _log_command("emergency_stop", {})
    return {"status": "sent"}

@app.post("/api/command/home")
async def go_home():
    mqtt_client.publish("agc/command/home", json.dumps({}))
    await _log_command("home", {})
    return {"status": "sent"}

@app.post("/api/command/manual")
async def manual_control(payload: ManualPayload):
    data = payload.model_dump()
    mqtt_client.publish("agc/command/manual", json.dumps(data))
    return {"status": "sent"}

async def _log_command(command_type: str, payload: dict):
    try:
        await database.execute(
            "INSERT INTO commands (command_type, payload) VALUES (:command_type, :payload)",
            {"command_type": command_type, "payload": json.dumps(payload)},
        )
    except Exception as e:
        log.warning(f"Command log error: {e}")

# ------- REST: route recording & history -------

class RouteStartPayload(BaseModel):
    name: str = ""

@app.post("/api/routes/start")
async def start_recording(payload: RouteStartPayload):
    global recording_session_id, last_route_point
    if recording_session_id is not None:
        return {"status": "already_recording", "session_id": recording_session_id}

    name = payload.name or f"Route {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"
    row = await database.fetch_one(
        "INSERT INTO route_sessions (name) VALUES (:name) RETURNING id",
        {"name": name},
    )
    recording_session_id = row["id"]
    last_route_point = None
    await manager.broadcast({"type": "recording", "data": {"active": True, "session_id": recording_session_id}})
    return {"status": "started", "session_id": recording_session_id}

@app.post("/api/routes/stop")
async def stop_recording():
    global recording_session_id, last_route_point
    if recording_session_id is None:
        return {"status": "not_recording"}

    sid = recording_session_id
    recording_session_id = None
    last_route_point = None

    await database.execute(
        "UPDATE route_sessions SET ended_at = NOW() WHERE id = :id",
        {"id": sid},
    )
    await manager.broadcast({"type": "recording", "data": {"active": False, "session_id": sid}})
    return {"status": "stopped", "session_id": sid}

@app.get("/api/routes")
async def list_routes():
    rows = await database.fetch_all(
        """SELECT id, name, started_at, ended_at, point_count,
                  ROUND(distance_m::numeric, 1) AS distance_m
           FROM route_sessions
           ORDER BY started_at DESC
           LIMIT 100"""
    )
    return [dict(r) for r in rows]

@app.get("/api/routes/{session_id}")
async def get_route(session_id: int):
    session = await database.fetch_one(
        "SELECT * FROM route_sessions WHERE id = :id", {"id": session_id}
    )
    if not session:
        return {"error": "not found"}

    points = await database.fetch_all(
        """SELECT timestamp, lat, lon, speed, heading, battery
           FROM route_points WHERE session_id = :sid ORDER BY timestamp""",
        {"sid": session_id},
    )
    return {
        "session": dict(session),
        "points": [dict(p) for p in points],
    }

@app.delete("/api/routes/{session_id}")
async def delete_route(session_id: int):
    await database.execute("DELETE FROM route_sessions WHERE id = :id", {"id": session_id})
    return {"status": "deleted"}

# ------- WebSocket -------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await websocket.send_text(json.dumps({
        "type": "state",
        "data": {**latest_state, "recording": recording_session_id is not None},
    }))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
