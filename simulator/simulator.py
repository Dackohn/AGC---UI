"""
AGC Vehicle Simulator
Publishes realistic MQTT telemetry for the AGC dashboard without real hardware.
Simulates: GPS movement along a patrol route, ultrasonic sensors, battery drain,
mode changes, obstacle events, and alerts.
"""

import json
import math
import os
import random
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

BROKER = os.environ.get("MQTT_BROKER", "localhost")
PORT = int(os.environ.get("MQTT_PORT", 1883))
USERNAME = os.environ.get("MQTT_USERNAME", "")
PASSWORD = os.environ.get("MQTT_PASSWORD", "")

# Patrol waypoints near Anenii Noi, Republic of Moldova
WAYPOINTS = [
    (46.8750, 29.2300),
    (46.8760, 29.2320),
    (46.8770, 29.2310),
    (46.8765, 29.2290),
    (46.8750, 29.2300),
]


def connect_mqtt() -> mqtt.Client:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if USERNAME:
        client.username_pw_set(USERNAME, PASSWORD)
    if PORT == 8883:
        client.tls_set()
    while True:
        try:
            client.connect(BROKER, PORT, 60)
            print(f"[SIM] Connected to MQTT broker {BROKER}:{PORT}")
            return client
        except Exception as e:
            print(f"[SIM] Waiting for broker... {e}")
            time.sleep(3)


def interpolate(a: tuple, b: tuple, t: float) -> tuple:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def heading_between(a: tuple, b: tuple) -> float:
    dlat = b[0] - a[0]
    dlon = b[1] - a[1]
    angle = math.degrees(math.atan2(dlon, dlat))
    return angle % 360


def simulate():
    client = connect_mqtt()
    client.loop_start()
    time.sleep(2)

    battery = 95.0
    wp_idx = 0
    t = 0.0
    step = 0.01
    mode = "autonomous"
    obstacle_countdown = 0
    tick = 0

    client.publish(
        "agc/vehicle/status",
        json.dumps({"state": "active", "message": "Vehicle simulator started"}),
    )

    while True:
        # Move along waypoints
        wp_from = WAYPOINTS[wp_idx % len(WAYPOINTS)]
        wp_to = WAYPOINTS[(wp_idx + 1) % len(WAYPOINTS)]
        lat, lon = interpolate(wp_from, wp_to, t)
        hdg = heading_between(wp_from, wp_to)

        # Add slight GPS noise
        lat += random.gauss(0, 0.00001)
        lon += random.gauss(0, 0.00001)

        speed = 2.5 + random.gauss(0, 0.2)  # ~2.5 m/s
        battery = max(0, battery - 0.003)
        gps_acc = round(random.uniform(0.04, 0.12), 3)  # RTK ~7cm

        # Obstacle simulation
        if obstacle_countdown > 0:
            obstacle_countdown -= 1
            speed = 0.0
            mode = "stopped"
        else:
            mode = "autonomous"

        if random.random() < 0.005:  # 0.5% chance per tick
            obstacle_countdown = 15
            client.publish(
                "agc/vehicle/alerts",
                json.dumps(
                    {
                        "type": "obstacle",
                        "message": "Obstacle detected — vehicle stopped",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                ),
            )

        # Sensor readings (cm) — simulate front obstacles sometimes
        front = [random.randint(150, 400) for _ in range(4)]
        rear = [random.randint(150, 400) for _ in range(4)]
        if obstacle_countdown > 0:
            front[1] = random.randint(30, 80)
            front[2] = random.randint(30, 80)

        telemetry = {
            "lat": round(lat, 7),
            "lon": round(lon, 7),
            "speed": round(max(0, speed), 2),
            "battery": round(battery, 1),
            "mode": mode,
            "heading": round(hdg, 1),
            "gps_accuracy": gps_acc,
        }

        sensors = {"front": front, "rear": rear}

        client.publish("agc/vehicle/telemetry", json.dumps(telemetry))
        client.publish("agc/vehicle/sensors", json.dumps(sensors))

        # Periodic alerts
        if tick % 300 == 0 and tick > 0:
            client.publish(
                "agc/vehicle/alerts",
                json.dumps(
                    {
                        "type": "info",
                        "message": f"Battery at {battery:.0f}%",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                ),
            )

        if battery < 20 and tick % 100 == 0:
            client.publish(
                "agc/vehicle/alerts",
                json.dumps(
                    {
                        "type": "warning",
                        "message": "Low battery — consider returning home",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                ),
            )

        # Advance along route
        t += step
        if t >= 1.0:
            t = 0.0
            wp_idx = (wp_idx + 1) % len(WAYPOINTS)

        tick += 1
        time.sleep(0.5)


if __name__ == "__main__":
    simulate()
