import ArmViewer from "@/components/urdf/ArmViewer";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, RotateCcw, ShieldAlert } from "lucide-react";
import { BenchHeader } from "@/components/BenchHeader";
import { BOARD, JOINT_LIMITS, LINKS, MAX_REACH, forward } from "@/lib/bench";

export const Route = createFileRoute("/familiarization")({
  head: () => ({
    meta: [
      { title: "Familiarization Mode — ARMBENCH 3-DOF Bench" },
      {
        name: "description",
        content:
          "Mock-interface familiarization for the 3-DOF planar arm: kinematics joint walkthrough and safety protocols, with physical actuators de-energized.",
      },
      { property: "og:title", content: "Familiarization Mode — ARMBENCH 3-DOF Bench" },
      {
        property: "og:description",
        content:
          "Kinematics joint walkthrough and safety protocols on a simulated 3-DOF planar robot arm.",
      },
    ],
  }),
  component: Familiarization,
});

const STEPS = [
  { id: 1, title: "Kinematics Joint" },
  { id: 2, title: "Safety Protocols" },
];

const SAFETY = [
  {
    code: "SP-01",
    title: "Workspace clearance",
    body: `Confirm the ${BOARD} × ${BOARD} mm board is clear of hands, tools and fixtures before any motion command is issued.`,
  },
  {
    code: "SP-02",
    title: "E-Stop reachability",
    body: "The software E-Stop must remain visible on the operator HUD; the hardware switch stays within arm's reach of the station.",
  },
  {
    code: "SP-03",
    title: "Joint-limit enforcement",
    body: `Commands are clamped to J1 ±${JOINT_LIMITS.j1[1]}°, J2 ±${JOINT_LIMITS.j2[1]}°, J3 ±${JOINT_LIMITS.j3[1]}°. Any request beyond a limit is rejected, not saturated silently.`,
  },
  {
    code: "SP-04",
    title: "Fault escalation",
    body: "Overload, overheat and bus-timeout faults halt trajectory execution and latch until an explicit operator reset.",
  },
];

function Familiarization() {
  const [step, setStep] = useState(1);
  const [pose, setPose] = useState({ j1: 25, j2: -40, j3: 15 });
  const [visited, setVisited] = useState<Record<number, boolean>>({ 1: false, 2: false });
  const [ack, setAck] = useState<Record<string, boolean>>({});

  const fk = useMemo(() => forward(pose), [pose]);
  const done = Object.values(visited).filter(Boolean).length;
  const allAck = SAFETY.every((s) => ack[s.code]);

  const view = 2 * MAX_REACH * 1.05;
  const toSvg = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });

  const setJoint = (k: "j1" | "j2" | "j3", v: number) => {
    setPose((p) => ({ ...p, [k]: v }));
    setVisited((s) => ({ ...s, 1: true }));
  };

  return (
    <div className="min-h-screen bg-background">
      <BenchHeader />
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <p className="label-mono text-muted-foreground">
          Mode 1 · Mock interface · Physical actuators de-energized
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Familiarization Mode</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Build an accurate mental model of the 3R planar kinematic chain and the safety
              protocols that govern the bench. All motion below is simulated — no physical hardware
              is driven.
            </p>
          </div>
          <span className="label-mono rounded-sm border border-border bg-card px-4 py-2.5">
            Progress {done + (allAck ? 1 : 0)} / 3
          </span>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <nav className="panel h-fit p-3">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-sm transition-colors ${
                  step === s.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full border border-current font-mono text-[11px]">
                  {s.id}
                </span>
                {s.title}
              </button>
            ))}
          </nav>

          <section className="panel p-6">
            <p className="label-mono text-muted-foreground">Step {step}</p>

            {step === 1 ? (
              <>
                <h2 className="mt-2 text-xl font-semibold">Kinematics Joint Walkthrough</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Jog each joint and observe how the 3R chain (L1 {LINKS.l1} · L2 {LINKS.l2} · L3{" "}
                  {LINKS.l3} mm) maps joint space to the tool pose. Tool orientation φ is the sum of
                  the three joint angles.
                </p>

                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="rounded-sm border border-border bg-muted/30 p-2">
                    <ArmViewer
                      height="380px"
                      showSliders={false}
                      values={{
                        J1: (pose.j1 * Math.PI) / 180,
                        J2: (pose.j2 * Math.PI) / 180,
                        J3: (pose.j3 * Math.PI) / 180,
                      }}
                    />
                  </div>

                  <div className="space-y-5">
                    {(
                      [
                        ["j1", "J1 · Base yaw", JOINT_LIMITS.j1],
                        ["j2", "J2 · Elbow yaw", JOINT_LIMITS.j2],
                        ["j3", "J3 · Wrist yaw", JOINT_LIMITS.j3],
                      ] as const
                    ).map(([key, label, lim]) => (
                      <div key={key}>
                        <div className="flex items-baseline justify-between">
                          <span className="label-mono text-muted-foreground">{label}</span>
                          <span className="font-mono text-sm font-bold text-signal-strong">
                            {pose[key].toFixed(1)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={lim[0]}
                          max={lim[1]}
                          step={0.5}
                          value={pose[key]}
                          onChange={(e) => setJoint(key, Number(e.target.value))}
                          className="mt-2 w-full accent-[var(--signal)]"
                          aria-label={label}
                        />
                      </div>
                    ))}
                    <dl className="rounded-sm border border-border p-3 font-mono text-xs">
                      {[
                        ["X", `${fk.p3.x.toFixed(1)} mm`],
                        ["Y", `${fk.p3.y.toFixed(1)} mm`],
                        ["φ", `${fk.phi.toFixed(1)} °`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-0.5">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="font-bold">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-2 text-xl font-semibold">Safety Protocols</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Acknowledge every protocol below. Sign-off is refused until all four are
                  acknowledged.
                </p>
                <ul className="mt-5 space-y-3">
                  {SAFETY.map((s) => (
                    <li key={s.code}>
                      <button
                        type="button"
                        onClick={() => {
                          setAck((a) => ({ ...a, [s.code]: !a[s.code] }));
                          setVisited((v) => ({ ...v, 2: true }));
                        }}
                        className={`flex w-full gap-3 rounded-sm border p-4 text-left transition-colors ${
                          ack[s.code]
                            ? "border-signal bg-accent/50"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {ack[s.code] ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                        ) : (
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span>
                          <span className="label-mono text-muted-foreground">{s.code}</span>
                          <span className="mt-1 block text-sm font-medium">{s.title}</span>
                          <span className="mt-1 block text-sm text-muted-foreground">{s.body}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <aside className="space-y-4">
            <div className="panel p-5">
              <p className="label-mono text-muted-foreground">Exit criteria</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {[
                  ["Kinematics joint walkthrough", visited[1]],
                  ["All safety protocols acknowledged", allAck],
                  ["Actuators de-energized", true],
                ].map(([label, ok]) => (
                  <li key={label as string} className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${ok ? "bg-ok" : "bg-muted-foreground/40"}`}
                    />
                    <span className={ok ? "" : "text-muted-foreground"}>{label as string}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/experiment"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
              >
                <ShieldAlert className="h-4 w-4" />
                Enter Experiment Mode
              </Link>
              <button
                type="button"
                onClick={() => {
                  setVisited({ 1: false, 2: false });
                  setAck({});
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset certification
              </button>
            </div>

            <div className="panel p-5">
              <p className="label-mono text-muted-foreground">Bench reference</p>
              <dl className="mt-4 space-y-2 font-mono text-xs">
                {[
                  ["Chain", "3R planar (J1·J2·J3)"],
                  ["Links", `${LINKS.l1} / ${LINKS.l2} / ${LINKS.l3} mm`],
                  ["Reach", `${MAX_REACH} mm`],
                  ["Bus", "TTL half-duplex, Protocol 2.0"],
                  ["IDs", "1 · 2 · 3"],
                  ["Board", `${BOARD} × ${BOARD} mm`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
