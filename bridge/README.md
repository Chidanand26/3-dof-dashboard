# ARMBENCH hardware bridge

Small local program that connects the dashboard to the Dynamixel servos on the U2D2 (TTL) chain.
The browser cannot open a USB serial port, so this runs on the lab PC and the dashboard talks to it
over `http://127.0.0.1:8787`.

## Run it

```bash
cd bridge
npm install
npm start
```

Quick command-line check of what is on the chain:

```bash
npm run scan                     # scans the first adapter at 57600 / 1M / 115200 / 2M baud
npm run scan -- --port COM5      # or /dev/ttyUSB0 on Linux, /dev/tty.usbserial-* on macOS
```

Linux: add yourself to the serial group once, then log out and back in.

```bash
sudo usermod -a -G dialout $USER
```

## Run the dashboard locally

```bash
npm install
npm run dev          # http://localhost:8080
```

Open the Experiment page, find the **Hardware · U2D2 TTL bus** panel, pick the adapter,
press **Scan bus**, then **Connect**.

## Bus rules for this build

- Base joint: MX-28, link 1: MX-28, gripper end: AX-12A.
- One TTL chain runs **one baud rate**. The AX-12A default 1,000,000 baud and the MX-28 default
  57,600 baud cannot coexist — set all three to the same value (57,600 is the safe choice) in
  Dynamixel Wizard 2.0 before wiring them in series.
- Every servo needs a **unique ID**. The two MX-28 are ID 1 and 2, so the AX-12A must be changed
  from ID 1 to ID 3. The scanner reports both problems if they are still present.
- Protocols may be mixed on one chain: the bridge speaks protocol 1.0 to the AX-12A and
  protocol 2.0 to the MX-28 (it falls back to 1.0 if the MX firmware is the older one).

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/status` | connection state, joint map, last error |
| GET | `/api/ports` | list USB serial adapters |
| POST | `/api/connect` | `{ path, baud }` |
| POST | `/api/disconnect` | close the port |
| POST | `/api/scan` | sweep baud rates + IDs 1-20 on both protocols, auto-assign joints |
| POST | `/api/joints` | override the joint → servo map (`id`, `protocol`, `invert`, `offset`) |
| POST | `/api/torque` | `{ on: true｜false }` for all joints |
| POST | `/api/estop` | `{ active: true }` cuts torque and refuses motion |
| POST | `/api/pose` | `{ j1, j2, j3 }` in degrees |
| GET | `/api/read` | present position, load, temperature, voltage |
| WS | `/ws` | joint telemetry at 20 Hz |

Joint angles are degrees, zero at the servo centre position (AX-12A 512 / MX-28 2048).
Use `offset` and `invert` in `/api/joints` to match the mechanical zero of your build.
