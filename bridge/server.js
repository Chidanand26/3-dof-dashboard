import http from "node:http";
import { SerialPort } from "serialport";
import { WebSocketServer } from "ws";
import { Bus } from "./bus.js";
import { profileFor } from "./models.js";

const PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const bus = new Bus();

/**
 * Joint map. Each joint points at one servo on the bus.
 * Defaults match the ARMBENCH build: two MX-28 (base + link 1) and one AX-12A at the gripper end.
 * `/api/scan` rewrites this automatically from what is actually on the chain.
 */
let joints = {
  j1: { id: 1, protocol: 1, modelNumber: 29, label: "Base MX-28", invert: false, offset: 0 },
  j2: { id: 2, protocol: 1, modelNumber: 29, label: "Link 1 MX-28", invert: false, offset: 0 },
  j3: { id: 3, protocol: 1, modelNumber: 12, label: "Gripper AX-12A", invert: false, offset: 0 },
};

let estop = false;
let lastError = null;

const clients = new Set();
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === 1) c.send(s);
}

const json = (res, code, body) => {
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

function status() {
  return {
    connected: bus.isOpen,
    path: bus.path,
    baud: bus.baud,
    estop,
    joints,
    lastError,
  };
}

function assignJoints(found) {
  // Two highest-resolution servos (MX) drive J1/J2 in ID order; AX-12A drives the gripper joint.
  const mx = found.filter((f) => f.modelNumber !== 12).sort((a, b) => a.id - b.id);
  const ax = found.filter((f) => f.modelNumber === 12).sort((a, b) => a.id - b.id);
  const next = { ...joints };
  if (mx[0]) next.j1 = { ...next.j1, ...pick(mx[0]), label: `Base ${mx[0].model}` };
  if (mx[1]) next.j2 = { ...next.j2, ...pick(mx[1]), label: `Link 1 ${mx[1].model}` };
  if (ax[0]) next.j3 = { ...next.j3, ...pick(ax[0]), label: `Gripper ${ax[0].model}` };
  else if (mx[2]) next.j3 = { ...next.j3, ...pick(mx[2]), label: `Link 2 ${mx[2].model}` };
  joints = next;
}

const pick = (f) => ({ id: f.id, protocol: f.protocol, modelNumber: f.modelNumber });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") return json(res, 204, {});

  try {
    if (url.pathname === "/api/status") return json(res, 200, status());

    if (url.pathname === "/api/ports") {
      const ports = await SerialPort.list();
      return json(
        res,
        200,
        ports.map((p) => ({
          path: p.path,
          manufacturer: p.manufacturer ?? null,
          serialNumber: p.serialNumber ?? null,
        })),
      );
    }

    if (url.pathname === "/api/connect" && req.method === "POST") {
      const { path, baud = 57600 } = await readBody(req);
      await bus.open(path, Number(baud));
      lastError = null;
      broadcast({ type: "status", ...status() });
      return json(res, 200, status());
    }

    if (url.pathname === "/api/disconnect" && req.method === "POST") {
      await bus.close();
      broadcast({ type: "status", ...status() });
      return json(res, 200, status());
    }

    if (url.pathname === "/api/scan" && req.method === "POST") {
      const body = await readBody(req);
      const path = body.path ?? bus.path;
      if (!path) return json(res, 400, { error: "No serial port given" });
      const bauds = body.bauds ?? [57600, 1000000, 115200, 2000000];
      const found = await bus.scan({
        path,
        bauds,
        maxId: body.maxId ?? 20,
        onProgress: (p) => broadcast({ type: "scan", ...p }),
      });
      // Re-open on the baud where most servos answered.
      const tally = {};
      for (const f of found) tally[f.baud] = (tally[f.baud] ?? 0) + 1;
      const best = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
      if (best) await bus.open(path, Number(best));
      else await bus.close();
      assignJoints(found.filter((f) => String(f.baud) === String(best)));
      const conflicts = [];
      const seen = new Map();
      for (const f of found) {
        const key = `${f.baud}:${f.id}`;
        if (seen.has(key)) conflicts.push(`ID ${f.id} answered twice at ${f.baud} baud`);
        seen.set(key, f);
      }
      const bauds_seen = [...new Set(found.map((f) => f.baud))];
      if (bauds_seen.length > 1) {
        conflicts.push(
          `Servos answered at different baud rates (${bauds_seen.join(", ")}). One TTL chain can only run one baud rate — set every servo to the same value.`,
        );
      }
      broadcast({ type: "status", ...status() });
      return json(res, 200, { found, joints, conflicts, connected: bus.isOpen, baud: bus.baud });
    }

    if (url.pathname === "/api/joints" && req.method === "POST") {
      const body = await readBody(req);
      joints = { ...joints, ...body.joints };
      broadcast({ type: "status", ...status() });
      return json(res, 200, status());
    }

    if (url.pathname === "/api/torque" && req.method === "POST") {
      const { on = true } = await readBody(req);
      const out = {};
      for (const [k, s] of Object.entries(joints)) out[k] = await bus.setTorque(s, on);
      return json(res, 200, out);
    }

    if (url.pathname === "/api/estop" && req.method === "POST") {
      const { active } = await readBody(req);
      estop = !!active;
      if (estop && bus.isOpen) for (const s of Object.values(joints)) await bus.setTorque(s, false);
      broadcast({ type: "status", ...status() });
      return json(res, 200, status());
    }

    if (url.pathname === "/api/pose" && req.method === "POST") {
      if (estop) return json(res, 409, { error: "E-Stop active" });
      const { j1, j2, j3 } = await readBody(req);
      const target = { j1, j2, j3 };
      const out = {};
      for (const [k, deg] of Object.entries(target)) {
        if (typeof deg !== "number" || !joints[k]) continue;
        const s = joints[k];
        const cmd = (s.invert ? -deg : deg) + (s.offset ?? 0);
        out[k] = await bus.setGoalDegrees(s, cmd);
      }
      return json(res, 200, out);
    }

    if (url.pathname === "/api/read") {
      const out = {};
      for (const [k, s] of Object.entries(joints)) out[k] = await bus.readState(s);
      return json(res, 200, out);
    }

    return json(res, 404, { error: "Not found" });
  } catch (err) {
    lastError = String(err?.message ?? err);
    return json(res, 500, { error: lastError });
  }
});

/* -------------------------- telemetry over WebSocket ------------------------ */

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "status", ...status() }));
  ws.on("close", () => clients.delete(ws));
});

let telemetryBusy = false;
setInterval(async () => {
  if (!bus.isOpen || clients.size === 0 || telemetryBusy) return;
  telemetryBusy = true;
  try {
    const pose = {};
    for (const [k, s] of Object.entries(joints)) {
      const d = await bus.readDegrees(s);
      if (d !== null) pose[k] = s.invert ? -(d - (s.offset ?? 0)) : d - (s.offset ?? 0);
    }
    broadcast({ type: "telemetry", t: Date.now() / 1000, pose });
  } catch (err) {
    lastError = String(err?.message ?? err);
  } finally {
    telemetryBusy = false;
  }
}, 50);

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`ARMBENCH bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`  GET  /api/ports    list USB serial adapters`);
  console.log(`  POST /api/scan     sweep baud rates + IDs on the U2D2 chain`);
  console.log(`  WS   /ws           live joint telemetry`);

  try {
    const ports = await SerialPort.list();
    const defaultPort = ports.find((p) => p.path === "/dev/ttyUSB0") ?? ports[0];
    if (defaultPort) {
      console.log(`Auto-connecting to ${defaultPort.path} @ 57600 baud...`);
      await bus.open(defaultPort.path, 57600);
      console.log(`Connected to ${defaultPort.path}!`);
    }
  } catch (err) {
    console.warn("Auto-connect warning:", err.message);
  }
});

export { profileFor };
