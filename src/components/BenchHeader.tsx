import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Cpu, Moon, ShieldAlert, Sun, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import kleLogo from "@/assets/kle-logo.png.asset.json";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/familiarization", label: "Familiarization" },
  { to: "/experiment", label: "Experiment" },
] as const;

function Pill({
  icon: Icon,
  label,
  value,
  tone = "muted",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: "muted" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-muted-foreground";
  return (
    <div className="hidden items-center gap-2 rounded-sm border border-border px-3 py-1.5 lg:flex">
      <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
      <span className="label-mono text-muted-foreground">{label}</span>
      <span className={`label-mono font-bold ${toneClass}`}>{value}</span>
    </div>
  );
}

export function BenchHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-6">
        <img src={kleLogo.url} alt="KLE Technological University" className="h-9 w-auto" />
        <div className="flex items-center gap-2.5 border-l border-border pl-5">
          <span className="grid h-8 w-8 place-items-center rounded-sm bg-accent text-accent-foreground">
            <Cpu className="h-4 w-4" />
          </span>
          <span className="leading-tight">
            <span className="block font-mono text-sm font-bold tracking-wide">ARMBENCH</span>
            <span className="label-mono block text-[10px] text-muted-foreground">
              3-DOF · Dashboard v1.0
            </span>
          </span>
        </div>

        <nav className="ml-4 flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`label-mono rounded-sm px-3 py-2 transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Pill icon={Activity} label="Mode" value="Idle" />
          <Pill icon={Wifi} label="Link" value="Offline" tone="warn" />
          <Pill icon={ShieldAlert} label="E-Stop" value="Armed" tone="ok" />
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-label="Toggle theme"
            className="grid h-9 w-9 place-items-center rounded-sm border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
