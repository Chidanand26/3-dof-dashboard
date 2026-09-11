import ArmViewer from "@/components/urdf/ArmViewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Home, Play, Power, Square, OctagonX } from "lucide-react";
import { BenchHeader } from "@/components/BenchHeader";
import { HardwarePanel } from "@/components/HardwarePanel";
import {
  BOARD,
  JOINT_LIMITS,
  LINKS,
  MAX_REACH,
  forward,
  inverse,
  profileScale,
  type Pose,
} from "@/lib/bench";

export const Route = createFileRoute("/experiment")({
  head: () => ({
    meta: [
      { title: "Experiment Mode — ARMBENCH 3-DOF Bench" },
      {
        name: "description",
        content:
          "Run jog & homing, inverse kinematics, trajectory profiles and Cartesian tracking on the 3-DOF planar arm with live telemetry and CSV data logging.",
      },
      { property: "og:title", content: "Experiment Mode — ARMBENCH 3-DOF Bench" },
      {
        property: "og:description",
        content:
          "Live joint telemetry, IK solving, PID gains and trajectory execution for a 3-DOF planar robot arm.",
      },
    ],
  }),
  component: Experiment,
});

const EXPERIMENTS = [
  {
    id: "jog",
    name: "Joint Jog & Homing",
    group: "Position (per joint)",
    aim: "Verify joint axes, directions, limits and zero references.",
    metrics: "Zero-offset repeatability, joint range verification",
  },
  {
    id: "fk",
    name: "Forward Kinematics",
    group: "Pose mapping",
    aim: "Map commanded joint angles to the tool pose and compare against measured geometry.",
    metrics: "Position error at tool centre point",
  },
  {
    id: "ik",
    name: "Inverse Kinematics",
    group: "Pose mapping",
    aim: "Solve joint angles for a Cartesian target and validate both elbow configurations.",
    metrics: "Solve residual, configuration continuity",
  },
  {
    id: "ptp",
    name: "Joint-Space Point-to-Point",
    group: "Trajectory",
    aim: "Execute synchronized point-to-point motion under the selected velocity profile.",
    metrics: "Settling time, overshoot, path duration",
  },
  {
    id: "line",
    name: "Cartesian Straight-Line Tracking",
    group: "Trajectory",
    aim: "Track a straight line in task space with per-sample IK.",
    metrics: "Cross-track deviation, tracking lag",
  },
  {
    id: "circle",
    name: "Circle Drawing",
    group: "Trajectory",
    aim: "Trace a circular path and characterize contour accuracy.",
    metrics: "Radial error RMS, roundness",
  },
  {
    id: "profile",
    name: "Trajectory Profile Comparison",
    group: "Trajectory",
    aim: "Compare constant, trapezoidal and S-curve profiles over an identical move.",
    metrics: "Peak velocity, jerk, cycle time",
  },
  {
    id: "cal",
    name: "Calibration Error Study",
    group: "Characterization",
    aim: "Quantify link-length and zero-offset error contributions to tool pose.",
    metrics: "Absolute accuracy, repeatability",
  },
] as const;

type ProfileKind = "constant" | "trapezoidal" | "s-curve";
type Sample = { t: number; j1: number; j2: number; j3: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function StatusItem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label-mono text-muted-foreground">{label}</span>
      <span className={`font-mono text-xs font-bold ${tone ?? ""}`}>{value}</span>
    </span>
  );
}

function Experiment() {
  const [selected, setSelected] = useState<string>("jog");
  const [profile, setProfile] = useState<ProfileKind>("trapezoidal");
  const [pose, setPose] = useState<Pose>({ j1: 0, j2: 0, j3: 0 });
  const [target, setTarget] = useState<Pose | null>(null);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [estop, setEstop] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [tx, setTx] = useState(400);
  const [ty, setTy] = useState(150);
  const [tphi, setTphi] = useState(0);
  const [elbow, setElbow] = useState<"up" | "down">("down");
  const [rate, setRate] = useState(100);
  const [studentId, setStudentId] = useState("");
  const [logging, setLogging] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [measured, setMeasured] = useState<Partial<Pose>>({});
  const [trace, setTrace] = useState<Sample[]>([]);
  const [gains, setGains] = useState({
    j1: { p: 6, i: 0.4, d: 0.6 },
    j2: { p: 6, i: 0.4, d: 0.6 },
    j3: { p: 6, i: 0.4, d: 0.6 },
  });

  const anim = useRef<{ from: Pose; to: Pose; start: number } | null>(null);
  const loggingRef = useRef(logging);
  loggingRef.current = logging;

  const fk = useMemo(() => forward(pose), [pose]);
  const jointRadians = useMemo(
    () => ({
      J1: (pose.j1 * Math.PI) / 180,
      J2: (pose.j2 * Math.PI) / 180,
      J3: (pose.j3 * Math.PI) / 180,
    }),
    [pose.j1, pose.j2, pose.j3],
  );
  const active = EXPERIMENTS.find((e) => e.id === selected)!;

  // Motion + telemetry loop
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = anim.current;
      if (a) {
        const u = Math.min(1, (performance.now() - a.start) / 2200);
        const s = profileScale(profile, u);
        const next: Pose = {
          j1: a.from.j1 + (a.to.j1 - a.from.j1) * s,
          j2: a.from.j2 + (a.to.j2 - a.from.j2) * s,
          j3: a.from.j3 + (a.to.j3 - a.from.j3) * s,
        };
        setPose(next);
        if (u >= 1) {
          anim.current = null;
          setRunning(false);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [profile]);

  // telemetry sampling — one stable interval, reads the latest pose from a ref
  const poseRef = useRef(pose);
  poseRef.current = pose;

  useEffect(() => {
    const id = setInterval(() => {
      const t = performance.now() / 1000;
      const s: Sample = { t, ...poseRef.current };
      setTrace((prev) => {
        const last = prev[prev.length - 1];
        // Skip redundant samples while the arm is idle and nothing is logging.
        if (!loggingRef.current && last && last.j1 === s.j1 && last.j2 === s.j2 && last.j3 === s.j3)
          return prev;
        return [...prev.slice(-240), s];
      });
      if (loggingRef.current) setSamples((prev) => [...prev, s]);
    }, 1000 / 30);
    return () => clearInterval(id);
  }, []);

  const moveTo = (to: Pose) => {
    if (estop) {
      setFault("E-Stop active — motion refused");
      return;
    }
    setFault(null);
    anim.current = { from: pose, to, start: performance.now() };
    setRunning(true);
  };

  const onMeasured = useCallback((p: Partial<Pose>) => setMeasured(p), []);

  const solveIk = () => {
    const res = inverse(tx, ty, tphi, elbow);
    if (!res.ok) {
      setFault(res.reason);
      return;
    }
    moveTo(res.pose);
  };

  const runExperiment = () => {
    if (selected === "ik") return solveIk();
    if (selected === "circle" || selected === "line") {
      const res = inverse(tx, ty, tphi, elbow);
      if (!res.ok) return setFault(res.reason);
      return moveTo(res.pose);
    }
    moveTo({
      j1: clamp(pose.j1 === 0 ? 60 : 0, ...JOINT_LIMITS.j1),
      j2: clamp(pose.j2 === 0 ? -70 : 0, ...JOINT_LIMITS.j2),
      j3: clamp(pose.j3 === 0 ? 35 : 0, ...JOINT_LIMITS.j3),
    });
  };

  const downloadCsv = () => {
    const header = `# student_id=${studentId || "n/a"} rate=${rate}Hz experiment=${active.name}\nt_s,j1_deg,j2_deg,j3_deg\n`;
    const body = samples
      .map((s) => `${s.t.toFixed(3)},${s.j1.toFixed(3)},${s.j2.toFixed(3)},${s.j3.toFixed(3)}`)
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `armbench_${selected}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const view = 2 * MAX_REACH * 1.1;
  const sv = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });

  const chartW = 900;
  const chartH = 220;
  const chartPath = (key: "j1" | "j2" | "j3") => {
    if (trace.length < 2) return "";
    const t0 = trace[0]!.t;
    const t1 = trace[trace.length - 1]!.t || t0 + 1;
    const span = Math.max(0.5, t1 - t0);
    return trace
      .map((s, i) => {
        const x = ((s.t - t0) / span) * chartW;
        const y = chartH / 2 - (s[key] / 180) * (chartH / 2 - 10);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  return (
    <div className="min-h-screen bg-background">
      <BenchHeader />
      <div className="sticky top-16 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <StatusItem
            label="Mode"
            value={running ? "RUN" : "IDLE"}
            tone={running ? "text-signal" : ""}
          />
          <StatusItem
            label="Link"
            value={connected ? "ONLINE" : "OFFLINE"}
            tone={connected ? "text-ok" : "text-warn"}
          />
          <StatusItem label="Bus RTT" value={connected ? "1.42 ms" : "0.00 ms"} />
          <StatusItem
            label="Log"
            value={logging ? "REC" : "IDLE"}
            tone={logging ? "text-destructive" : ""}
          />
          <StatusItem
            label="E-Stop"
            value={estop ? "ACTIVE" : "CLEAR"}
            tone={estop ? "text-destructive" : "text-ok"}
          />
          <StatusItem
            label="Faults"
            value={fault ? "1" : "NONE"}
            tone={fault ? "text-destructive" : ""}
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConnected((c) => !c)}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
            >
              <Power className="h-3.5 w-3.5" /> {connected ? "Disconnect" : "Connect"}
            </button>
            <button
              type="button"
              onClick={() => moveTo({ j1: 0, j2: 0, j3: 0 })}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
            >
              <Home className="h-3.5 w-3.5" /> Home all
            </button>
            <button
              type="button"
              onClick={() => {
                setEstop((e) => !e);
                anim.current = null;
                setRunning(false);
                setFault(estop ? null : "E-Stop engaged by operator");
              }}
              className="inline-flex items-center gap-2 rounded-sm bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground"
            >
              <OctagonX className="h-3.5 w-3.5" /> {estop ? "Reset E-Stop" : "E-Stop"}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-[1600px] gap-4 px-6 py-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        {/* Left */}
        <div className="space-y-4">
          <section className="panel p-4">
            <p className="label-mono text-muted-foreground">Experiment</p>
            <ul className="mt-3 space-y-0.5">
              {EXPERIMENTS.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(e.id)}
                    className={`w-full rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                      selected === e.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-sm bg-muted/50 p-3">
              <p className="label-mono text-muted-foreground">{active.group}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{active.aim}</p>
              <p className="mt-2 text-sm font-medium">Metrics: {active.metrics}</p>
            </div>
          </section>

          <section className="panel p-4">
            <p className="label-mono text-muted-foreground">Trajectory profile</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["constant", "trapezoidal", "s-curve"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProfile(p)}
                  className={`label-mono rounded-sm border px-2 py-2 transition-colors ${
                    profile === p
                      ? "border-signal bg-accent text-accent-foreground"
                      : "border-border"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <svg viewBox="0 0 200 70" className="mt-4 h-20 w-full">
              <path
                d={Array.from({ length: 60 }, (_, i) => {
                  const u = i / 59;
                  const x = u * 200;
                  const y = 65 - profileScale(profile, u) * 58;
                  return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ")}
                fill="none"
                stroke="var(--signal)"
                strokeWidth="2.5"
              />
            </svg>
            <button
              type="button"
              onClick={runExperiment}
              disabled={estop}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
            >
              <Play className="h-4 w-4" /> Run experiment
            </button>
            <button
              type="button"
              onClick={() => {
                anim.current = null;
                setRunning(false);
              }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          </section>
        </div>

        {/* Center */}
        <div className="space-y-4">
          <section className="panel p-4">
            <div className="flex items-center justify-between">
              <p className="label-mono text-muted-foreground">Workspace · 3D URDF model</p>
              <p className="label-mono text-muted-foreground">
                {BOARD} × {BOARD} mm board
              </p>
            </div>
            <ArmViewer height="440px" showSliders={false} values={jointRadians} />
            {fault && (
              <p className="label-mono mt-2 rounded-sm bg-destructive/10 px-3 py-2 text-destructive">
                Fault · {fault}
              </p>
            )}
          </section>

          <section className="panel p-4">
            <div className="flex items-center justify-between">
              <p className="label-mono text-muted-foreground">Live telemetry</p>
              <div className="flex gap-3">
                {(
                  [
                    ["J1", "var(--joint-1)"],
                    ["J2", "var(--joint-2)"],
                    ["J3", "var(--joint-3)"],
                  ] as const
                ).map(([l, c]) => (
                  <span key={l} className="label-mono flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-full" style={{ backgroundColor: c }} />
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="mt-3 h-56 w-full">
              <line
                x1="0"
                y1={chartH / 2}
                x2={chartW}
                y2={chartH / 2}
                stroke="var(--grid-line)"
                strokeWidth="2"
              />
              {[0.25, 0.75].map((f) => (
                <line
                  key={f}
                  x1="0"
                  y1={chartH * f}
                  x2={chartW}
                  y2={chartH * f}
                  stroke="var(--grid-line)"
                  strokeWidth="1"
                  strokeDasharray="6 8"
                />
              ))}
              {(
                [
                  ["j1", "var(--joint-1)"],
                  ["j2", "var(--joint-2)"],
                  ["j3", "var(--joint-3)"],
                ] as const
              ).map(([k, c]) => (
                <path key={k} d={chartPath(k)} fill="none" stroke={c} strokeWidth="2.5" />
              ))}
            </svg>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {(["j1", "j2", "j3"] as const).map((k) => (
                <div key={k} className="rounded-sm border border-border px-3 py-2">
                  <p className="label-mono text-muted-foreground">{k.toUpperCase()} position</p>
                  <p className="font-mono text-lg font-bold text-signal-strong">
                    {pose[k].toFixed(1)}°
                  </p>
                  <p className="label-mono text-muted-foreground">
                    measured {measured[k] !== undefined ? `${measured[k]!.toFixed(1)}°` : "—"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right */}
        <div className="space-y-4">
          <section className="panel p-4">
            <p className="label-mono text-muted-foreground">Cartesian target (IK)</p>
            <div className="mt-3 space-y-4">
              {(
                [
                  ["X", tx, setTx, -MAX_REACH, MAX_REACH, "mm"],
                  ["Y", ty, setTy, -MAX_REACH, MAX_REACH, "mm"],
                  ["φ", tphi, setTphi, -180, 180, "deg"],
                ] as const
              ).map(([label, value, set, lo, hi, unit]) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between">
                    <span className="label-mono text-muted-foreground">{label}</span>
                    <span className="font-mono text-xs font-bold">
                      {value} {unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={lo}
                    max={hi}
                    step={1}
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                    className="mt-1.5 w-full accent-[var(--signal)]"
                    aria-label={`Target ${label}`}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                {(["down", "up"] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setElbow(e)}
                    className={`label-mono rounded-sm border px-2 py-2 transition-colors ${
                      elbow === e
                        ? "border-signal bg-accent text-accent-foreground"
                        : "border-border"
                    }`}
                  >
                    Elbow {e}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={solveIk}
                disabled={estop}
                className="w-full rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
              >
                Solve IK &amp; move
              </button>
            </div>
          </section>

          <section className="panel p-4">
            <p className="label-mono text-muted-foreground">PID gains</p>
            <div className="mt-3 space-y-4">
              {(
                [
                  ["j1", JOINT_LIMITS.j1],
                  ["j2", JOINT_LIMITS.j2],
                  ["j3", JOINT_LIMITS.j3],
                ] as const
              ).map(([k, lim]) => (
                <div key={k}>
                  <p className="label-mono text-signal">
                    {k.toUpperCase()} ({lim[0]}° … {lim[1]}°)
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {(["p", "i", "d"] as const).map((g) => (
                      <label
                        key={g}
                        className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1.5"
                      >
                        <span className="label-mono text-muted-foreground">{g}</span>
                        <input
                          type="number"
                          step={0.1}
                          value={gains[k][g]}
                          onChange={(ev) =>
                            setGains((prev) => ({
                              ...prev,
                              [k]: { ...prev[k], [g]: Number(ev.target.value) },
                            }))
                          }
                          className="w-full bg-transparent font-mono text-xs outline-none"
                          aria-label={`${k} ${g} gain`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-4">
            <p className="label-mono text-muted-foreground">Data logging</p>
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="label-mono text-muted-foreground">Rate</span>
                <span className="font-mono text-xs font-bold">{rate} Hz</span>
              </div>
              <input
                type="range"
                min={20}
                max={200}
                step={10}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="mt-1.5 w-full accent-[var(--signal)]"
                aria-label="Logging rate"
              />
            </div>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="Student ID"
              className="mt-3 w-full rounded-sm border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-signal"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!logging) setSamples([]);
                  setLogging((l) => !l);
                }}
                className={`rounded-sm px-3 py-2.5 text-sm font-medium ${
                  logging
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {logging ? "Stop log" : "Start log"}
              </button>
              <button
                type="button"
                onClick={downloadCsv}
                disabled={samples.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-sm border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted disabled:text-muted-foreground"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
            <p className="label-mono mt-3 text-muted-foreground">
              {samples.length} samples buffered
            </p>
          </section>

          <HardwarePanel pose={pose} estop={estop} onMeasured={onMeasured} />

          <section className="panel p-4">
            <p className="label-mono text-muted-foreground">Bench reference</p>
            <dl className="mt-3 space-y-1.5 font-mono text-xs">
              {[
                ["Links", `${LINKS.l1} / ${LINKS.l2} / ${LINKS.l3} mm`],
                ["Reach", `${MAX_REACH} mm`],
                ["Profile", profile],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
}
