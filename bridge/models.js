// Control-table maps per Dynamixel model / protocol.

export const MODEL_NUMBERS = {
  12: "AX-12A",
  29: "MX-28 (protocol 1.0)",
  30: "MX-28 (protocol 2.0)",
  310: "MX-64",
  311: "MX-28(2.0)",
  1030: "XM430-W210",
  1020: "XM430-W350",
};

// Protocol 1.0 control table (AX / legacy MX).
const V1 = {
  torqueEnable: { addr: 24, size: 1 },
  goalPosition: { addr: 30, size: 2 },
  movingSpeed: { addr: 32, size: 2 },
  presentPosition: { addr: 36, size: 2 },
  presentSpeed: { addr: 38, size: 2 },
  presentLoad: { addr: 40, size: 2 },
  presentVoltage: { addr: 42, size: 1 },
  presentTemp: { addr: 43, size: 1 },
  pGain: { addr: 28, size: 1 },
  iGain: { addr: 27, size: 1 },
  dGain: { addr: 26, size: 1 },
};

// Protocol 2.0 control table (MX-28 2.0 / X-series).
const V2 = {
  torqueEnable: { addr: 64, size: 1 },
  goalPosition: { addr: 116, size: 4 },
  profileVelocity: { addr: 112, size: 4 },
  presentPosition: { addr: 132, size: 4 },
  presentSpeed: { addr: 128, size: 4 },
  presentLoad: { addr: 126, size: 2 },
  presentVoltage: { addr: 144, size: 2 },
  presentTemp: { addr: 146, size: 1 },
  pGain: { addr: 84, size: 2 },
  iGain: { addr: 82, size: 2 },
  dGain: { addr: 80, size: 2 },
};

// resolution: ticks per full turn, range: usable tick span, span: degrees over that span.
export function profileFor(modelNumber, protocol) {
  if (modelNumber === 12) {
    return { name: "AX-12A", protocol: 1, table: V1, ticks: 1024, degrees: 300 };
  }
  if (protocol === 2) {
    return { name: MODEL_NUMBERS[modelNumber] ?? `model ${modelNumber}`, protocol: 2, table: V2, ticks: 4096, degrees: 360 };
  }
  return { name: MODEL_NUMBERS[modelNumber] ?? `model ${modelNumber}`, protocol: 1, table: V1, ticks: 4096, degrees: 360 };
}

export function degToTicks(profile, deg) {
  const center = Math.floor(profile.ticks / 2);
  const t = Math.round(center + (deg / profile.degrees) * profile.ticks);
  return Math.min(profile.ticks - 1, Math.max(0, t));
}

export function ticksToDeg(profile, ticks) {
  const center = Math.floor(profile.ticks / 2);
  return ((ticks - center) / profile.ticks) * profile.degrees;
}
