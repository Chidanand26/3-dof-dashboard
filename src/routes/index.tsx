import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Gauge, ShieldCheck } from "lucide-react";
import { BenchHeader } from "@/components/BenchHeader";
import armHero from "@/assets/arm-hero.png.asset.json";
import { BOARD, JOINT_LIMITS, LINKS, MAX_REACH } from "@/lib/bench";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ARMBENCH — 3-DOF Planar Robot Arm Motion Bench" },
      {
        name: "description",
        content:
          "Human-machine interface and data acquisition dashboard for a three-joint Dynamixel planar robot arm: kinematics, trajectory execution and joint telemetry.",
      },
      { property: "og:title", content: "ARMBENCH — 3-DOF Planar Robot Arm Motion Bench" },
      {
        property: "og:description",
        content:
          "Human-machine interface and data acquisition dashboard for a three-joint Dynamixel planar robot arm: kinematics, trajectory execution and joint telemetry.",
      },
    ],
  }),
  component: Overview,
});

const MODES = [
  {
    tag: "Mode 1",
    icon: BookOpen,
    title: "Familiarization",
    body: "Study the 3R planar kinematics chain and the safety protocols governing the bench against a MockRobotInterface. Mandatory prerequisite before energizing physical actuators.",
    to: "/familiarization" as const,
  },
  {
    tag: "Mode 2",
    icon: Gauge,
    title: "Experiment",
    body: "Jog & homing, inverse kinematics, joint-space and Cartesian trajectory execution with live telemetry, fault reporting and CSV logging.",
    to: "/experiment" as const,
  },
  {
    tag: "Safety",
    icon: ShieldCheck,
    title: "E-Stop & Limits",
    body: "Software E-Stop, joint-limit enforcement per J1/J2/J3, workspace-boundary checks and fault escalation to the operator HUD.",
    to: null,
  },
];

const SPECS = [
  { label: `Link L1 · Base → Elbow`, value: `${LINKS.l1}`, unit: "mm" },
  { label: `Link L2 · Elbow → Wrist`, value: `${LINKS.l2}`, unit: "mm" },
  { label: `Link L3 · Wrist → Tool`, value: `${LINKS.l3}`, unit: "mm" },
  { label: "Max reach (L1+L2+L3)", value: `${MAX_REACH}`, unit: "mm" },
  { label: "Work board", value: `${BOARD} × ${BOARD}`, unit: "mm" },
  { label: "J1 range", value: `±${JOINT_LIMITS.j1[1]}`, unit: "deg" },
  { label: "J2 range", value: `±${JOINT_LIMITS.j2[1]}`, unit: "deg" },
  { label: "J3 range", value: `±${JOINT_LIMITS.j3[1]}`, unit: "deg" },
];

function Overview() {
  return (
    <div className="min-h-screen bg-background">
      <BenchHeader />
      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        <section className="panel relative overflow-hidden">
          <img
            src={armHero.url}
            alt="3-DOF planar robotic arm mounted on the bench board"
            className="pointer-events-none absolute right-0 top-0 h-full w-[46%] object-cover object-[80%_center] opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/95 via-60% to-card/20" />
          <div className="relative grid gap-6 p-10 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="max-w-2xl">
              <p className="label-mono text-signal">Phase I · Prototype Development · v1.0</p>
              <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight">
                3-DOF Planar Robot Arm
                <span className="mt-1 block text-signal-strong">Motion Architecture Bench</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Central Human-Machine Interface and data acquisition platform for a three-joint
                Dynamixel smart-actuator arm (J1 Base Yaw · J2 Elbow Yaw · J3 Wrist Yaw). Serial
                link via U2D2 TTL / RS-485. Kinematics, trajectory execution and joint-level
                telemetry.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/familiarization"
                  className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <BookOpen className="h-4 w-4" /> Familiarization Mode{" "}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/experiment"
                  className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
                >
                  <Gauge className="h-4 w-4" /> Enter Experiment Mode{" "}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <dl className="label-mono hidden shrink-0 space-y-1 text-right text-muted-foreground lg:block">
              <div>SYS: ARMBENCH-3DOF</div>
              <div>REV: 2026.07</div>
              <div>LINK: TTL / RS-485</div>
            </dl>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {MODES.map((m) => (
            <article key={m.title} className="panel flex flex-col p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-sm bg-accent text-accent-foreground">
                  <m.icon className="h-4 w-4" />
                </span>
                <span className="label-mono text-muted-foreground">{m.tag}</span>
              </div>
              <h2 className="mt-4 text-lg font-semibold">{m.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
              {m.to && (
                <Link
                  to={m.to}
                  className="label-mono mt-4 inline-flex items-center gap-1 text-signal"
                >
                  Open <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </article>
          ))}
        </section>

        <section className="panel p-6">
          <p className="label-mono text-muted-foreground">Mechanical sizing</p>
          <h2 className="mt-2 text-lg font-semibold">Link Lengths &amp; Workspace</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {SPECS.map((s) => (
              <div key={s.label} className="rounded-sm border border-border p-4">
                <p className="label-mono text-muted-foreground">{s.label}</p>
                <p className="mt-2 font-mono text-2xl font-bold text-signal-strong">
                  {s.value}
                  <span className="ml-1 text-xs text-muted-foreground">{s.unit}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
