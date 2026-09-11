import { Suspense, lazy, useEffect, useState } from "react";
import type { ArmPanelProps } from "./ArmPanel";

const ArmPanel = lazy(() => import("./ArmPanel"));

/** Client-only wrapper: three.js must not be imported during SSR. */
export default function ArmViewer(props: ArmPanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const placeholder = (
    <div
      className="label-mono flex items-center justify-center rounded-sm border border-border text-muted-foreground"
      style={{ height: props.height ?? "440px" }}
    >
      Initialising 3D viewer…
    </div>
  );

  if (!mounted) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <ArmPanel {...props} />
    </Suspense>
  );
}
