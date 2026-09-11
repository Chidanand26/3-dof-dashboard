import { SerialPort } from "serialport";
import {
  INST,
  build,
  parse,
  pingPacket,
  readPacket,
  writePacket,
  paramsToInt,
  toSigned32,
} from "./protocol.js";
import { profileFor, degToTicks, ticksToDeg } from "./models.js";

export const BAUD_CANDIDATES = [57600, 1000000, 115200, 2000000, 3000000, 9600, 1000000];

export class Bus {
  constructor() {
    this.port = null;
    this.path = null;
    this.baud = null;
    this.rx = Buffer.alloc(0);
    this.queue = Promise.resolve();
  }

  get isOpen() {
    return !!this.port?.isOpen;
  }

  async open(path, baudRate) {
    await this.close();
    await new Promise((resolve, reject) => {
      const port = new SerialPort({ path, baudRate, autoOpen: false });
      port.open((err) => (err ? reject(err) : resolve()));
      port.on("data", (d) => {
        this.rx = Buffer.concat([this.rx, d]);
      });
      port.on("error", () => {});
      this.port = port;
    });
    this.path = path;
    this.baud = baudRate;
    return { path, baudRate };
  }

  async close() {
    const p = this.port;
    this.port = null;
    this.path = null;
    this.baud = null;
    if (p?.isOpen) await new Promise((r) => p.close(() => r()));
  }

  // Serialize every transaction — the TTL bus is half duplex.
  transact(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async txrx(protocol, packet, expectBytes, timeoutMs = 60) {
    if (!this.isOpen) throw new Error("Serial port is not open");
    return this.transact(async () => {
      this.rx = Buffer.alloc(0);
      await new Promise((res, rej) => this.port.write(packet, (e) => (e ? rej(e) : res())));
      await new Promise((res) => {
        let done = false;
        const to = setTimeout(() => { if (!done) { done = true; res(); } }, 25);
        this.port.drain(() => { if (!done) { done = true; clearTimeout(to); res(); } });
      });
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const pkt = parse(protocol, this.rx);
        if (pkt && (expectBytes === undefined || pkt.params.length >= expectBytes)) return pkt;
        await new Promise((r) => setTimeout(r, 2));
      }
      return null;
    });
  }

  async ping(protocol, id, timeoutMs = 30) {
    const pkt = await this.txrx(protocol, pingPacket(protocol, id), undefined, timeoutMs);
    if (!pkt || pkt.id !== id) return null;
    let modelNumber = null;
    if (protocol === 2 && pkt.params.length >= 2) modelNumber = pkt.params[0] | (pkt.params[1] << 8);
    if (modelNumber === null) {
      const r = await this.txrx(protocol, readPacket(protocol, id, 0, 2), 2, timeoutMs);
      if (r) modelNumber = paramsToInt(r.params.slice(0, 2));
    }
    return { id, protocol, modelNumber: modelNumber ?? 0 };
  }

  // Sweep baud rates and IDs on both protocols.
  async scan({ path, bauds = [57600, 1000000, 115200, 2000000], maxId = 20, onProgress } = {}) {
    const found = [];
    for (const baud of bauds) {
      await this.open(path, baud);
      for (const protocol of [1, 2]) {
        for (let id = 1; id <= maxId; id++) {
          const res = await this.ping(protocol, id, 20);
          if (res) {
            const profile = profileFor(res.modelNumber, protocol);
            found.push({ ...res, baud, model: profile.name });
            onProgress?.({ stage: "found", id, baud, protocol, model: profile.name });
          }
        }
      }
      onProgress?.({ stage: "baud-done", baud });
    }
    return found;
  }

  async readValue(servo, field) {
    const profile = profileFor(servo.modelNumber, servo.protocol);
    const entry = profile.table[field];
    if (!entry) return null;
    const pkt = await this.txrx(
      servo.protocol,
      readPacket(servo.protocol, servo.id, entry.addr, entry.size),
      entry.size,
    );
    if (!pkt) return null;
    return paramsToInt(pkt.params.slice(0, entry.size));
  }

  async writeValue(servo, field, value) {
    const profile = profileFor(servo.modelNumber, servo.protocol);
    const entry = profile.table[field];
    if (!entry) throw new Error(`${field} not available on ${profile.name}`);
    const pkt = await this.txrx(
      servo.protocol,
      writePacket(servo.protocol, servo.id, entry.addr, value >>> 0, entry.size),
      undefined,
      40,
    );
    return !!pkt;
  }

  async setTorque(servo, on) {
    if (on) {
      try {
        const speedField = servo.protocol === 2 ? "profileVelocity" : "movingSpeed";
        const speedVal = servo.protocol === 2 ? 100 : 50;
        await this.writeValue(servo, speedField, speedVal);
      } catch {}
    }
    return this.writeValue(servo, "torqueEnable", on ? 1 : 0);
  }

  async setGoalDegrees(servo, deg) {
    const profile = profileFor(servo.modelNumber, servo.protocol);
    return this.writeValue(servo, "goalPosition", degToTicks(profile, deg));
  }

  async readDegrees(servo) {
    const profile = profileFor(servo.modelNumber, servo.protocol);
    const raw = await this.readValue(servo, "presentPosition");
    if (raw === null) return null;
    return ticksToDeg(profile, servo.protocol === 2 ? toSigned32(raw) : raw);
  }

  async readState(servo) {
    const [deg, load, temp, volt] = [
      await this.readDegrees(servo),
      await this.readValue(servo, "presentLoad"),
      await this.readValue(servo, "presentTemp"),
      await this.readValue(servo, "presentVoltage"),
    ];
    return { id: servo.id, deg, load, temp, volt };
  }

  async reboot(servo) {
    if (servo.protocol !== 2) return false;
    const pkt = await this.txrx(2, build(2, servo.id, 0x08, []), undefined, 60);
    return !!pkt;
  }

  async pingInstruction(protocol, id) {
    return this.ping(protocol, id);
  }
}

export { INST };
