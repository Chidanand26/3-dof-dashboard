export const LINKS = { l1: 300, l2: 250, l3: 100 } as const;
export const MAX_REACH = LINKS.l1 + LINKS.l2 + LINKS.l3;
export const BOARD = 800;
export const JOINT_LIMITS = {
  j1: [-150, 150],
  j2: [-135, 135],
  j3: [-120, 120],
} as const;

export type Pose = { j1: number; j2: number; j3: number };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function forward(pose: Pose) {
  const a1 = rad(pose.j1);
  const a12 = rad(pose.j1 + pose.j2);
  const a123 = rad(pose.j1 + pose.j2 + pose.j3);
  const p0 = { x: 0, y: 0 };
  const p1 = { x: LINKS.l1 * Math.cos(a1), y: LINKS.l1 * Math.sin(a1) };
  const p2 = { x: p1.x + LINKS.l2 * Math.cos(a12), y: p1.y + LINKS.l2 * Math.sin(a12) };
  const p3 = { x: p2.x + LINKS.l3 * Math.cos(a123), y: p2.y + LINKS.l3 * Math.sin(a123) };
  return { p0, p1, p2, p3, phi: pose.j1 + pose.j2 + pose.j3 };
}

export function inverse(
  x: number,
  y: number,
  phi: number,
  elbow: "up" | "down",
): { ok: true; pose: Pose } | { ok: false; reason: string } {
  const pr = rad(phi);
  const wx = x - LINKS.l3 * Math.cos(pr);
  const wy = y - LINKS.l3 * Math.sin(pr);
  const d2 = wx * wx + wy * wy;
  const d = Math.sqrt(d2);
  if (d > LINKS.l1 + LINKS.l2 || d < Math.abs(LINKS.l1 - LINKS.l2)) {
    return { ok: false, reason: "Target outside reachable workspace" };
  }
  let c2 = (d2 - LINKS.l1 ** 2 - LINKS.l2 ** 2) / (2 * LINKS.l1 * LINKS.l2);
  c2 = Math.min(1, Math.max(-1, c2));
  const s2 = (elbow === "up" ? 1 : -1) * Math.sqrt(1 - c2 * c2);
  const t2 = Math.atan2(s2, c2);
  const t1 = Math.atan2(wy, wx) - Math.atan2(LINKS.l2 * s2, LINKS.l1 + LINKS.l2 * c2);
  const pose = { j1: deg(t1), j2: deg(t2), j3: phi - deg(t1) - deg(t2) };
  const within =
    pose.j1 >= JOINT_LIMITS.j1[0] &&
    pose.j1 <= JOINT_LIMITS.j1[1] &&
    pose.j2 >= JOINT_LIMITS.j2[0] &&
    pose.j2 <= JOINT_LIMITS.j2[1] &&
    pose.j3 >= JOINT_LIMITS.j3[0] &&
    pose.j3 <= JOINT_LIMITS.j3[1];
  if (!within) return { ok: false, reason: "Solution violates joint limits" };
  return { ok: true, pose };
}

export function profileScale(kind: "constant" | "trapezoidal" | "s-curve", t: number) {
  const u = Math.min(1, Math.max(0, t));
  if (kind === "constant") return u;
  if (kind === "trapezoidal") {
    const a = 0.25;
    if (u < a) return (u * u) / (2 * a * (1 - a));
    if (u < 1 - a) return (u - a / 2) / (1 - a);
    const r = 1 - u;
    return 1 - (r * r) / (2 * a * (1 - a));
  }
  return u * u * (3 - 2 * u);
}
