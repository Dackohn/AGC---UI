import asyncio
import json
import logging
import math
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt
from databases import Database
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("agc-backend")

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://agc:agcpassword@localhost:5432/agcdb"
)

database = Database(DATABASE_URL)

# ------- Auth -------
# In-memory token store; cleared on restart (intentional — forces re-auth after deploy)
active_tokens: set[str] = set()


def _valid_token(token: str | None) -> bool:
    return bool(token and token in active_tokens)


def _test_mqtt(broker: str, port: int, username: str, password: str) -> bool:
    """Blocking MQTT connection test; run in a thread pool."""
    connected: list[bool] = [False]
    failed: list[bool] = [False]

    def on_connect(client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            connected[0] = True
        else:
            failed[0] = True

    test_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    test_client.on_connect = on_connect
    if username:
        test_client.username_pw_set(username, password)
    if port == 8883:
        test_client.tls_set()
    try:
        test_client.connect(broker, port, keepalive=5)
        test_client.loop_start()
        deadline = time.time() + 8
        while time.time() < deadline and not connected[0] and not failed[0]:
            time.sleep(0.05)
        test_client.loop_stop()
        test_client.disconnect()
        return connected[0]
    except Exception:
        return False


# ------- WebSocket connection manager -------


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
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

# ------- Per-vehicle state -------
# Keyed by vehicle_id (e.g. "vehicle", "cart-01")


def _default_vehicle_state() -> dict[str, Any]:
    return {
        "telemetry": {},
        "sensors": {"front": [0, 0, 0, 0], "rear": [0, 0, 0, 0]},
        "alerts": [],
        "status": {"state": "unknown", "message": "Waiting for vehicle..."},
        "last_seen": None,
    }


vehicles_state: dict[str, dict[str, Any]] = {}


def _vstate(vehicle_id: str) -> dict[str, Any]:
    if vehicle_id not in vehicles_state:
        vehicles_state[vehicle_id] = _default_vehicle_state()
    return vehicles_state[vehicle_id]


# Route recording state (global — records whichever vehicle is active)
recording_session_id: int | None = None
last_route_point: dict | None = None

loop: asyncio.AbstractEventLoop | None = None

# ------- Helpers -------


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


# ------- MQTT -------


def on_mqtt_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
    except Exception:
        return

    # Topic format: agc/{vehicle_id}/{msg_type}
    parts = msg.topic.split("/")
    if len(parts) < 3 or parts[0] != "agc":
        return

    vehicle_id = parts[1]
    msg_type = parts[2]

    vs = _vstate(vehicle_id)
    vs["last_seen"] = datetime.now(timezone.utc).isoformat()

    if msg_type == "telemetry":
        # Normalize agent_pix field names to frontend-expected names
        if "groundspeed" in payload and "speed" not in payload:
            payload["speed"] = payload["groundspeed"]
        if "battery_level" in payload and "battery" not in payload:
            payload["battery"] = payload["battery_level"]
        vs["telemetry"] = payload
        asyncio.run_coroutine_threadsafe(_handle_telemetry(vehicle_id, payload), loop)

    elif msg_type == "sensors":
        vs["sensors"] = payload
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(
                {"type": "sensors", "vehicle_id": vehicle_id, "data": payload}
            ),
            loop,
        )

    elif msg_type == "alerts":
        alert = {
            **payload,
            "timestamp": payload.get(
                "timestamp", datetime.now(timezone.utc).isoformat()
            ),
        }
        vs["alerts"] = [alert] + vs["alerts"][:49]
        asyncio.run_coroutine_threadsafe(_handle_alert(vehicle_id, alert), loop)

    elif msg_type == "status":
        vs["status"] = payload
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(
                {"type": "status", "vehicle_id": vehicle_id, "data": payload}
            ),
            loop,
        )


async def _handle_telemetry(vehicle_id: str, payload: dict):
    global last_route_point
    await manager.broadcast(
        {"type": "telemetry", "vehicle_id": vehicle_id, "data": payload}
    )

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
                extra_m = haversine_m(
                    last_route_point["lat"], last_route_point["lon"], lat, lon
                )
            last_route_point = {"lat": lat, "lon": lon}
            await database.execute(
                """UPDATE route_sessions
                   SET point_count = point_count + 1, distance_m = distance_m + :extra
                   WHERE id = :sid""",
                {"extra": extra_m, "sid": recording_session_id},
            )
        except Exception as e:
            log.warning(f"Route point insert error: {e}")


async def _handle_alert(vehicle_id: str, alert: dict):
    await manager.broadcast({"type": "alert", "vehicle_id": vehicle_id, "data": alert})
    try:
        await database.execute(
            "INSERT INTO alerts (type, message) VALUES (:type, :message)",
            {"type": alert.get("type", "info"), "message": alert.get("message", "")},
        )
    except Exception as e:
        log.warning(f"DB alert insert error: {e}")


def start_mqtt(broker: str, port: int, username: str, password: str) -> mqtt.Client:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_message = on_mqtt_message
    if username:
        client.username_pw_set(username, password)
    if port == 8883:
        client.tls_set()
    client.connect(broker, port, 60)
    client.subscribe(
        [
            ("agc/+/telemetry", 0),
            ("agc/+/sensors", 0),
            ("agc/+/alerts", 0),
            ("agc/+/status", 0),
        ]
    )
    client.loop_start()
    return client


mqtt_client: mqtt.Client | None = None

# ------- Schema migration -------


async def ensure_schema():
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
        """CREATE TABLE IF NOT EXISTS missions (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            waypoints JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS vehicles (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            vehicle_id VARCHAR(64) NOT NULL UNIQUE,
            color VARCHAR(16) NOT NULL DEFAULT '#3b82f6',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        # Default vehicle for backward compatibility
        """INSERT INTO vehicles (name, vehicle_id, color)
           VALUES ('AGC Golf Cart', 'vehicle', '#3b82f6')
           ON CONFLICT (vehicle_id) DO NOTHING""",
        "CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_route_points_session ON route_points(session_id, timestamp)",
        """CREATE TABLE IF NOT EXISTS mqtt_config (
            id INT PRIMARY KEY DEFAULT 1,
            broker VARCHAR(256) NOT NULL,
            port INT NOT NULL DEFAULT 8883,
            username VARCHAR(128) NOT NULL DEFAULT '',
            password VARCHAR(256) NOT NULL DEFAULT '',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (id = 1)
        )""",
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
    await asyncio.sleep(2)
    row = await database.fetch_one("SELECT broker, port, username, password FROM mqtt_config WHERE id = 1")
    if row:
        try:
            mqtt_client = start_mqtt(row["broker"], row["port"], row["username"], row["password"])
            log.info("MQTT reconnected to %s:%s from saved config", row["broker"], row["port"])
        except Exception as e:
            log.warning("MQTT reconnect failed (%s) — waiting for user to connect via UI", e)
    else:
        log.info("No saved MQTT config — waiting for user to connect via UI")
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
async def get_state(vehicle_id: str = "vehicle"):
    state = vehicles_state.get(vehicle_id, _default_vehicle_state())
    return {**state, "recording": recording_session_id is not None}


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
    vehicle_id: str = "vehicle"


class ManualPayload(BaseModel):
    direction: str = "stop"
    speed: float = 0.0
    throttle: float | None = None   # analog joystick: -1..1
    steering: float | None = None   # analog joystick: -1..1
    vehicle_id: str = "vehicle"


class EmergencyPayload(BaseModel):
    vehicle_id: str = "vehicle"


@app.post("/api/command/mission")
async def send_mission(payload: MissionPayload):
    data = {"waypoints": payload.waypoints}
    mqtt_client.publish(f"agc/{payload.vehicle_id}/command/mission", json.dumps(data))
    await _log_command("mission", {**data, "vehicle_id": payload.vehicle_id})
    return {"status": "sent"}


@app.post("/api/command/emergency_stop")
async def emergency_stop(payload: EmergencyPayload = EmergencyPayload()):
    mqtt_client.publish(
        f"agc/{payload.vehicle_id}/command/emergency_stop", json.dumps({})
    )
    await _log_command("emergency_stop", {"vehicle_id": payload.vehicle_id})
    return {"status": "sent"}


@app.post("/api/command/home")
async def go_home(payload: EmergencyPayload = EmergencyPayload()):
    mqtt_client.publish(f"agc/{payload.vehicle_id}/command/home", json.dumps({}))
    await _log_command("home", {"vehicle_id": payload.vehicle_id})
    return {"status": "sent"}


@app.post("/api/command/manual")
async def manual_control(payload: ManualPayload):
    if payload.throttle is not None or payload.steering is not None:
        data = {
            "throttle": payload.throttle if payload.throttle is not None else 0.0,
            "steering": payload.steering if payload.steering is not None else 0.0,
        }
    else:
        data = {"direction": payload.direction, "speed": payload.speed}
    mqtt_client.publish(f"agc/{payload.vehicle_id}/command/manual", json.dumps(data))
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
    name = (
        payload.name or f"Route {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"
    )
    row = await database.fetch_one(
        "INSERT INTO route_sessions (name) VALUES (:name) RETURNING id",
        {"name": name},
    )
    recording_session_id = row["id"]
    last_route_point = None
    await manager.broadcast(
        {
            "type": "recording",
            "data": {"active": True, "session_id": recording_session_id},
        }
    )
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
        "UPDATE route_sessions SET ended_at = NOW() WHERE id = :id", {"id": sid}
    )
    await manager.broadcast(
        {"type": "recording", "data": {"active": False, "session_id": sid}}
    )
    return {"status": "stopped", "session_id": sid}


@app.get("/api/routes")
async def list_routes():
    rows = await database.fetch_all(
        """SELECT id, name, started_at, ended_at, point_count,
                  ROUND(distance_m::numeric, 1) AS distance_m
           FROM route_sessions ORDER BY started_at DESC LIMIT 100"""
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
    return {"session": dict(session), "points": [dict(p) for p in points]}


@app.delete("/api/routes/{session_id}")
async def delete_route(session_id: int):
    await database.execute(
        "DELETE FROM route_sessions WHERE id = :id", {"id": session_id}
    )
    return {"status": "deleted"}


# ------- REST: saved missions -------


class MissionSavePayload(BaseModel):
    name: str
    waypoints: list[dict]


@app.get("/api/missions")
async def list_missions():
    rows = await database.fetch_all(
        "SELECT id, name, waypoints, created_at FROM missions ORDER BY created_at DESC LIMIT 100"
    )
    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d["waypoints"], str):
            d["waypoints"] = json.loads(d["waypoints"])
        result.append(d)
    return result


@app.post("/api/missions")
async def save_mission(payload: MissionSavePayload):
    row = await database.fetch_one(
        "INSERT INTO missions (name, waypoints) VALUES (:name, :waypoints) RETURNING id, created_at",
        {"name": payload.name, "waypoints": json.dumps(payload.waypoints)},
    )
    return {"id": row["id"], "created_at": row["created_at"], "status": "saved"}


@app.post("/api/missions/{mission_id}/execute")
async def execute_mission(mission_id: int, vehicle_id: str = "vehicle"):
    row = await database.fetch_one(
        "SELECT name, waypoints FROM missions WHERE id = :id", {"id": mission_id}
    )
    if not row:
        return {"error": "not found"}
    waypoints = row["waypoints"]
    if isinstance(waypoints, str):
        waypoints = json.loads(waypoints)
    data = {"waypoints": waypoints}
    mqtt_client.publish(f"agc/{vehicle_id}/command/mission", json.dumps(data))
    await _log_command("mission", {**data, "vehicle_id": vehicle_id})
    return {"status": "sent", "waypoint_count": len(waypoints)}


@app.delete("/api/missions/{mission_id}")
async def delete_mission(mission_id: int):
    await database.execute("DELETE FROM missions WHERE id = :id", {"id": mission_id})
    return {"status": "deleted"}


# ------- REST: vehicles registry -------


class VehicleRegisterPayload(BaseModel):
    name: str
    vehicle_id: str
    color: str = "#3b82f6"


@app.get("/api/vehicles")
async def list_vehicles():
    rows = await database.fetch_all(
        "SELECT id, name, vehicle_id, color, created_at FROM vehicles ORDER BY created_at"
    )
    result = []
    for r in rows:
        d = dict(r)
        state = vehicles_state.get(d["vehicle_id"])
        d["last_seen"] = state["last_seen"] if state else None
        result.append(d)
    return result


@app.post("/api/vehicles")
async def register_vehicle(payload: VehicleRegisterPayload):
    try:
        row = await database.fetch_one(
            """INSERT INTO vehicles (name, vehicle_id, color)
               VALUES (:name, :vehicle_id, :color)
               RETURNING id, created_at""",
            {
                "name": payload.name,
                "vehicle_id": payload.vehicle_id,
                "color": payload.color,
            },
        )
        return {"id": row["id"], "status": "registered"}
    except Exception as e:
        return {"error": str(e)}


@app.delete("/api/vehicles/{vehicle_id}")
async def remove_vehicle(vehicle_id: str):
    if vehicle_id == "vehicle":
        return {"error": "cannot remove default vehicle"}
    await database.execute(
        "DELETE FROM vehicles WHERE vehicle_id = :id", {"id": vehicle_id}
    )
    vehicles_state.pop(vehicle_id, None)
    return {"status": "removed"}


# ------- Auth endpoints -------


class ConnectPayload(BaseModel):
    broker: str
    port: int = 8883
    username: str = ""
    password: str = ""


@app.post("/api/auth/connect")
async def auth_connect(payload: ConnectPayload):
    global mqtt_client
    ok = await asyncio.to_thread(
        _test_mqtt, payload.broker, payload.port, payload.username, payload.password
    )
    if not ok:
        raise HTTPException(status_code=401, detail="MQTT authentication failed")
    await database.execute(
        """INSERT INTO mqtt_config (id, broker, port, username, password, updated_at)
           VALUES (1, :broker, :port, :username, :password, NOW())
           ON CONFLICT (id) DO UPDATE
           SET broker = EXCLUDED.broker, port = EXCLUDED.port,
               username = EXCLUDED.username, password = EXCLUDED.password,
               updated_at = NOW()""",
        {"broker": payload.broker, "port": payload.port,
         "username": payload.username, "password": payload.password},
    )
    if mqtt_client:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
    try:
        mqtt_client = start_mqtt(payload.broker, payload.port, payload.username, payload.password)
    except Exception as e:
        log.warning("Global MQTT listener failed to start: %s", e)
    token = str(uuid.uuid4())
    active_tokens.add(token)
    return {"token": token}


@app.post("/api/auth/logout")
async def auth_logout(token: str = ""):
    active_tokens.discard(token)
    return {"status": "ok"}


# ------- WebSocket -------


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    if not _valid_token(token):
        await websocket.accept()
        await websocket.close(code=4401)
        return
    await manager.connect(websocket)

    # Send registered vehicles list
    rows = await database.fetch_all(
        "SELECT id, name, vehicle_id, color FROM vehicles ORDER BY created_at"
    )
    registered = []
    for r in rows:
        d = dict(r)
        state = vehicles_state.get(d["vehicle_id"])
        d["last_seen"] = state["last_seen"] if state else None
        registered.append(d)
    await websocket.send_text(json.dumps({"type": "vehicles", "data": registered}))

    # Send current state for default vehicle (backward compat)
    default_state = vehicles_state.get("vehicle", _default_vehicle_state())
    await websocket.send_text(
        json.dumps(
            {
                "type": "state",
                "data": {
                    **default_state,
                    "recording": recording_session_id is not None,
                },
            }
        )
    )

    try:
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
                if msg.get("type") == "manual" and mqtt_client:
                    vehicle_id = msg.get("vehicle_id", "vehicle")
                    data = {k: v for k, v in msg.items() if k not in ("type", "vehicle_id")}
                    mqtt_client.publish(f"agc/{vehicle_id}/command/manual", json.dumps(data))
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
