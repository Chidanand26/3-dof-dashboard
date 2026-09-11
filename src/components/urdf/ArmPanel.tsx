import { useEffect, useState } from "react";
import UrdfScene, { useUrdfRobot, type CameraView } from "./UrdfScene";

const JOINTS = ["J1", "J2", "J3"] as const;

const VIEWS: { id: CameraView; label: string }[] = [
  { id: "top", label: "Top view" },
  { id: "iso", label: "3D view" },
];

export type ArmPanelProps = {
  /** Joint angles in radians, keyed by URDF joint name. */
  values?: Partial<Record<(typeof JOINTS)[number], number>>;
  showSliders?: boolean;
  height?: string;
};

export default function ArmPanel({ values, showSliders = true, height = "440px" }: ArmPanelProps) {
  const { robot, error } = useUrdfRobot();
  const [local, setLocal] = useState<Record<string, number>>({ J1: 0, J2: 0, J3: 0 });
  const [view, setView] = useState<CameraView>("top");

  const j1 = values?.["J1"];
  const j2 = values?.["J2"];
  const j3 = values?.["J3"];

  // Depend on the numbers, not the object identity — a fresh object literal
  // from the parent would otherwise re-set state on every render.
  useEffect(() => {
    setLocal((prev) => {
      const next: Record<string, number> = { ...prev };
      if (j1 !== undefined) next["J1"] = j1;
      if (j2 !== undefined) next["J2"] = j2;
      if (j3 !== undefined) next["J3"] = j3;
      if (next["J1"] === prev["J1"] && next["J2"] === prev["J2"] && next["J3"] === prev["J3"])
        return prev;
      return next;
    });
  }, [j1, j2, j3]);

  if (error) {
    return (
      <div className="label-mono flex h-40 items-center justify-center text-destructive">
        URDF load failed · {error}
      </div>
    );
  }

  if (!robot) {
    return (
      <div
        className="label-mono flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        Loading URDF meshes…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono text-muted-foreground">Camera</span>
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`label-mono rounded-sm border px-2 py-1 transition-colors ${
                view === v.id
                  ? "border-[var(--signal)] text-[var(--signal)]"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <UrdfScene
        robot={robot}
        values={local}
        orientation="G"
        view={view}
        height={height}
        className="overflow-hidden rounded-sm border border-border"
      />

      {showSliders && (
        <div className="grid gap-3 sm:grid-cols-3">
          {JOINTS.map((j) => (
            <label key={j} className="block">
              <span className="label-mono flex justify-between text-muted-foreground">
                <span>{j} · revolute</span>
                <span className="text-foreground">
                  {(((local[j] ?? 0) * 180) / Math.PI).toFixed(1)}°
                </span>
              </span>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.5}
                value={((local[j] ?? 0) * 180) / Math.PI}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, [j]: (Number(e.target.value) * Math.PI) / 180 }))
                }
                className="mt-1 w-full accent-[var(--signal)]"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
