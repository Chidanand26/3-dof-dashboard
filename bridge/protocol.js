// Dynamixel wire protocol helpers (v1.0 for AX-12A / legacy MX, v2.0 for MX-28 fw>=39).

export const INST = {
  PING: 0x01,
  READ: 0x02,
  WRITE: 0x03,
};

/* ------------------------------- protocol 1.0 ------------------------------ */

export function buildV1(id, instruction, params = []) {
  const len = params.length + 2;
  const body = [id, len, instruction, ...params];
  let sum = 0;
  for (const b of body) sum += b;
  const checksum = (~sum) & 0xff;
  return Buffer.from([0xff, 0xff, ...body, checksum]);
}

// Returns { id, error, params } or null.
export function parseV1(buf) {
  for (let i = 0; i + 5 < buf.length; i++) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xff || buf[i + 2] === 0xff) continue;
    const id = buf[i + 2];
    const len = buf[i + 3];
    const end = i + 4 + len;
    if (end > buf.length) continue;
    const error = buf[i + 4];
    const params = [...buf.subarray(i + 5, end - 1)];
    return { id, error, params };
  }
  return null;
}

/* ------------------------------- protocol 2.0 ------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x8005 : crc << 1;
    t[i] = crc & 0xffff;
  }
  return t;
})();

function crc16(data) {
  let crc = 0;
  for (const b of data) crc = ((crc << 8) ^ CRC_TABLE[((crc >> 8) ^ b) & 0xff]) & 0xffff;
  return crc;
}

function stuff(params) {
  const out = [];
  for (let i = 0; i < params.length; i++) {
    out.push(params[i]);
    if (
      out.length >= 3 &&
      out[out.length - 3] === 0xff &&
      out[out.length - 2] === 0xff &&
      out[out.length - 1] === 0xfd
    ) {
      out.push(0xfd);
    }
  }
  return out;
}

function unstuff(params) {
  const out = [];
  for (let i = 0; i < params.length; i++) {
    if (
      i >= 3 &&
      params[i] === 0xfd &&
      params[i - 1] === 0xfd &&
      params[i - 2] === 0xff &&
      params[i - 3] === 0xff
    ) {
      continue;
    }
    out.push(params[i]);
  }
  return out;
}

export function buildV2(id, instruction, params = []) {
  const p = stuff(params);
  const len = p.length + 3;
  const head = [0xff, 0xff, 0xfd, 0x00, id, len & 0xff, (len >> 8) & 0xff, instruction, ...p];
  const crc = crc16(head);
  return Buffer.from([...head, crc & 0xff, (crc >> 8) & 0xff]);
}

export function parseV2(buf) {
  for (let i = 0; i + 10 <= buf.length; i++) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xff || buf[i + 2] !== 0xfd || buf[i + 3] !== 0x00) continue;
    const id = buf[i + 4];
    const len = buf[i + 5] | (buf[i + 6] << 8);
    const end = i + 7 + len;
    if (end > buf.length) continue;
    const error = buf[i + 8];
    const params = unstuff([...buf.subarray(i + 9, end - 2)]);
    return { id, error, params };
  }
  return null;
}

/* --------------------------------- helpers -------------------------------- */

export function build(protocol, id, instruction, params) {
  return protocol === 2 ? buildV2(id, instruction, params) : buildV1(id, instruction, params);
}

export function parse(protocol, buf) {
  return protocol === 2 ? parseV2(buf) : parseV1(buf);
}

export function readPacket(protocol, id, addr, size) {
  return protocol === 2
    ? buildV2(id, INST.READ, [addr & 0xff, (addr >> 8) & 0xff, size & 0xff, (size >> 8) & 0xff])
    : buildV1(id, INST.READ, [addr, size]);
}

export function writePacket(protocol, id, addr, value, size) {
  const bytes = [];
  for (let i = 0; i < size; i++) bytes.push((value >> (8 * i)) & 0xff);
  return protocol === 2
    ? buildV2(id, INST.WRITE, [addr & 0xff, (addr >> 8) & 0xff, ...bytes])
    : buildV1(id, INST.WRITE, [addr, ...bytes]);
}

export function pingPacket(protocol, id) {
  return build(protocol, id, INST.PING, []);
}

export function paramsToInt(params) {
  let v = 0;
  for (let i = 0; i < params.length; i++) v |= params[i] << (8 * i);
  return v;
}

export function toSigned32(v) {
  return v & 0x80000000 ? v - 0x100000000 : v;
}
