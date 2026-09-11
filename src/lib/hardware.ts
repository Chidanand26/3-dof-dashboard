// Browser-side client for the local ARMBENCH hardware bridge (see /bridge).
import type { Pose } from "@/lib/bench";

export const DEFAULT_BRIDGE = "http://127.0.0.1:8787";

export function bridgeUrl() {
  if (typeof window === "undefined") return DEFAULT_BRIDGE;
  return window.localStorage.getItem("armbench.bridge") || DEFAULT_BRIDGE;
}

export function setBridgeUrl(url: string) {
  window.localStorage.setItem("armbench.bridge", url.replace(/\/$/, ""));
}

export type PortInfo = { path: string; manufacturer: string | null; serialNumber: string | null };
export type ServoInfo = {
  id: number;
  protocol: 1 | 2;
  modelNumber: number;
  model: string;
  baud: number;
};
export type JointMap = Record<
  "j1" | "j2" | "j3",
  {
    id: number;
    protocol: 1 | 2;
    modelNumber: number;
    label: string;
    invert: boolean;
    offset: number;
  }
>;
export type BridgeStatus = {
  connected: boolean;
  path: string | null;
  baud: number | null;
  estop: boolean;
  joints: JointMap;
  lastError: string | null;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${bridgeUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const hardware = {
  status: () => call<BridgeStatus>("/api/status"),
  ports: () => call<PortInfo[]>("/api/ports"),
  connect: (path: string, baud: number) => post<BridgeStatus>("/api/connect", { path, baud }),
  disconnect: () => post<BridgeStatus>("/api/disconnect"),
  scan: (path?: string) =>
    post<{ found: ServoInfo[]; joints: JointMap; conflicts: string[]; baud: number | null }>(
      "/api/scan",
      { path },
    ),
  torque: (on: boolean) => post<Record<string, boolean>>("/api/torque", { on }),
  estop: (active: boolean) => post<BridgeStatus>("/api/estop", { active }),
  pose: (pose: Pose) => post<Record<string, boolean>>("/api/pose", pose),
  read: () =>
    call<
      Record<string, { id: number; deg: number | null; load: number | null; temp: number | null }>
    >("/api/read"),
};

export type TelemetryMsg =
  | ({ type: "status" } & BridgeStatus)
  | { type: "telemetry"; t: number; pose: Partial<Pose> }
  | { type: "scan"; stage: string; id?: number; baud?: number; model?: string };

export function openTelemetry(onMessage: (m: TelemetryMsg) => void) {
  const ws = new WebSocket(`${bridgeUrl().replace(/^http/, "ws")}/ws`);
  ws.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      /* ignore malformed frame */
    }
  };
  return ws;
}
