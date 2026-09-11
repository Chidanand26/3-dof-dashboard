import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, RefreshCw, Search, Zap } from "lucide-react";
import {
  DEFAULT_BRIDGE,
  bridgeUrl,
  hardware,
  openTelemetry,
  setBridgeUrl,
  type BridgeStatus,
  type PortInfo,
  type ServoInfo,
} from "@/lib/hardware";
import type { Pose } from "@/lib/bench";

type Props = {
  pose: Pose;
  estop: boolean;
  onMeasured: (pose: Partial<Pose>) => void;
};

const BAUDS = [57600, 1000000, 115200, 2000000];

export function HardwarePanel({ pose, estop, onMeasured }: Props) {
  const [url, setUrl] = useState(DEFAULT_BRIDGE);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [port, setPort] = useState("");
  const [baud, setBaud] = useState(57600);
  const [found, setFound] = useState<ServoInfo[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [mirror, setMirror] = useState(true);

  const lastSent = useRef(0);
  const liveRef = useRef(live);
  liveRef.current = live;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [s, p] = await Promise.all([hardware.status(), hardware.ports()]);
      setNotice(null);
      setStatus(s);
      setPorts(p);
      if (!port && p[0]) setPort(s.path ?? p[0].path);
      if (s.baud) setBaud(s.baud);
    } catch {
      setStatus(null);
      setNotice("Offline — start the bridge on the lab PC to talk to the servos.");
    }
  }, [port]);

  useEffect(() => {
    setUrl(bridgeUrl());
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live telemetry from the servos.
  useEffect(() => {
    if (!status?.connected) return;
    let ws: WebSocket | null = null;
    try {
      ws = openTelemetry((m) => {
        if (m.type === "telemetry") onMeasured(m.pose);
        if (m.type === "status") setStatus(m);
      });
    } catch {
      /* bridge offline */
    }
    return () => ws?.close();
  }, [status?.connected, onMeasured]);

  // Mirror the commanded pose down to the servos at ~20 Hz.
  useEffect(() => {
    if (!live || !mirror || estop || !status?.connected) return;
    const now = performance.now();
    if (now - lastSent.current < 50) return;
    lastSent.current = now;
    void hardware.pose(pose).catch(() => {});
  }, [pose, live, mirror, estop, status?.connected]);

  useEffect(() => {
    if (!status?.connected) return;
    void hardware.estop(estop).catch(() => {});
  }, [estop, status?.connected]);

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const online = !!status?.connected;

  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="label-mono text-muted-foreground">Hardware · U2D2 TTL bus</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-muted-foreground"}`}
          aria-hidden
        />
        <span className="font-mono text-xs font-bold">
          {online ? `${status?.path} @ ${status?.baud} baud` : "Not connected"}
        </span>
      </div>

      <label className="mt-3 block">
        <span className="label-mono text-muted-foreground">Bridge address</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            setBridgeUrl(url);
            void refresh();
          }}
          className="mt-1 w-full rounded-sm border border-border bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-signal"
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label-mono text-muted-foreground">Serial port</span>
          <select
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="mt-1 w-full rounded-sm border border-border bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-signal"
          >
            {ports.length === 0 && <option value="">none detected</option>}
            {ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-mono text-muted-foreground">Baud</span>
          <select
            value={baud}
            onChange={(e) => setBaud(Number(e.target.value))}
            className="mt-1 w-full rounded-sm border border-border bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-signal"
          >
            {BAUDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!port || busy !== null}
          onClick={() =>
            run("connect", async () => {
              const s = online ? await hardware.disconnect() : await hardware.connect(port, baud);
              setStatus(s);
            })
          }
          className="rounded-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
        >
          {online ? "Disconnect" : "Connect"}
        </button>
        <button
          type="button"
          disabled={!port || busy !== null}
          onClick={() =>
            run("scan", async () => {
              const r = await hardware.scan(port);
              setFound(r.found);
              setConflicts(r.conflicts);
              await refresh();
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-sm border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:text-muted-foreground"
        >
          <Search className="h-3.5 w-3.5" /> {busy === "scan" ? "Scanning…" : "Scan bus"}
        </button>
      </div>

      {found.length > 0 && (
        <ul className="mt-3 space-y-1 font-mono text-xs">
          {found.map((f) => (
            <li key={`${f.baud}-${f.protocol}-${f.id}`} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                <Cpu className="mr-1 inline h-3 w-3" /> ID {f.id}
              </span>
              <span className="font-bold">
                {f.model} · P{f.protocol} · {f.baud}
              </span>
            </li>
          ))}
        </ul>
      )}

      {conflicts.map((c) => (
        <p
          key={c}
          className="label-mono mt-2 rounded-sm bg-destructive/10 px-2 py-1.5 text-destructive"
        >
          {c}
        </p>
      ))}

      {status && (
        <dl className="mt-3 space-y-1 font-mono text-xs">
          {(["j1", "j2", "j3"] as const).map((k) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k.toUpperCase()}</dt>
              <dd className="font-bold">
                {status.joints[k].label} · ID {status.joints[k].id}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!online || busy !== null}
          onClick={() => run("torque", () => hardware.torque(true))}
          className="inline-flex items-center justify-center gap-2 rounded-sm border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:text-muted-foreground"
        >
          <Zap className="h-3.5 w-3.5" /> Torque on
        </button>
        <button
          type="button"
          disabled={!online || busy !== null}
          onClick={() => run("torque", () => hardware.torque(false))}
          className="rounded-sm border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:text-muted-foreground"
        >
          Torque off
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Send motion to servos</span>
          <input
            type="checkbox"
            checked={live}
            disabled={!online}
            onChange={(e) => setLive(e.target.checked)}
            className="h-4 w-4 accent-[var(--signal)]"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Follow simulated pose</span>
          <input
            type="checkbox"
            checked={mirror}
            disabled={!online}
            onChange={(e) => setMirror(e.target.checked)}
            className="h-4 w-4 accent-[var(--signal)]"
          />
        </label>
      </div>

      {notice && !error && (
        <p className="label-mono mt-3 rounded-sm bg-muted px-2 py-1.5 text-muted-foreground">
          {notice}
        </p>
      )}

      {error && (
        <p className="label-mono mt-3 rounded-sm bg-destructive/10 px-2 py-1.5 text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
