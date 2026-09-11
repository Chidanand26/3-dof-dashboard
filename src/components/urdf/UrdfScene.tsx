import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import URDFLoader from "urdf-loader";
import type { URDFRobot, URDFJoint } from "urdf-loader";

import urdfRaw from "@/data/arm.urdf?raw";
import baseMesh from "@/assets/base_link.STL.asset.json";
import link1Mesh from "@/assets/Link-1.STL.asset.json";
import link2Mesh from "@/assets/Link-2.STL.asset.json";
import link3Mesh from "@/assets/Link-3.STL.asset.json";

const MESH_URLS: Record<string, string> = {
  "base_link.STL": baseMesh.url,
  "Link-1.STL": link1Mesh.url,
  "Link-2.STL": link2Mesh.url,
  "Link-3.STL": link3Mesh.url,
};

const LINK_COLORS: Record<string, string> = {
  base_link: "#4b5563",
  "Link-1": "#0f8a8a",
  "Link-2": "#1f9dd6",
  "Link-3": "#e0913a",
};

/** Loads the URDF exactly as authored, resolving package:// meshes to CDN STL files. */
function loadRobot(): Promise<URDFRobot> {
  const manager = new THREE.LoadingManager();
  const loader = new URDFLoader(manager);
  const stl = new STLLoader(manager);

  const state = { pending: 0, parsed: false, settle: undefined as undefined | (() => void) };
  const meshDone = () => {
    state.pending -= 1;
    if (state.parsed && state.pending === 0) state.settle?.();
  };

  loader.loadMeshCb = (path, _m, _material, done) => {
    const file = path.split("/").pop() ?? "";
    const url = MESH_URLS[file];
    if (!url) {
      done(null as unknown as THREE.Object3D, new Error(`Unknown mesh ${file}`));
      return;
    }
    state.pending += 1;
    stl.load(
      url,
      (geometry) => {
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: "#9ca3af", metalness: 0.25, roughness: 0.55 }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        done(mesh);
        meshDone();
      },
      undefined,
      (err) => {
        done(null as unknown as THREE.Object3D, err as Error);
        meshDone();
      },
    );
  };

  const robot = loader.parse(urdfRaw) as URDFRobot;
  state.parsed = true;

  return new Promise((resolve) => {
    state.settle = () => resolve(robot);
    // Every mesh already resolved synchronously (cached) — nothing left to wait for.
    if (state.pending === 0) resolve(robot);
    // Hard safety net: never leave the viewer stuck on the loading label.
    setTimeout(() => resolve(robot), 8000);
  });
}

export type JointInfo = { name: string; axis: [number, number, number] };

export function useUrdfRobot() {
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadRobot()
      .then((r) => {
        if (!alive) return;
        // Colour links, keep geometry/scale/hierarchy untouched.
        Object.entries(r.links).forEach(([name, link]) => {
          const color = LINK_COLORS[name];
          if (!color) return;
          link.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
              m.material = new THREE.MeshStandardMaterial({
                color,
                metalness: 0.3,
                roughness: 0.45,
              });
            }
          });
        });
        Object.values(r.joints).forEach((j) => {
          const joint = j as URDFJoint;
          // The exported URDF carries lower=upper=0 placeholder limits; free them
          // so the real joint frames/axes can be exercised from the sliders.
          joint.ignoreLimits = true;
          if (joint.axis.lengthSq() === 0) joint.axis.set(1, 0, 0);
        });
        setRobot(r);
      })
      .catch((e) => setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  return { robot, error };
}

export const ORIENTATION_PRESETS = [
  { id: "A", label: "A · X +90°", rotation: [Math.PI / 2, 0, 0] },
  { id: "B", label: "B · X −90°", rotation: [-Math.PI / 2, 0, 0] },
  { id: "C", label: "C · Y +90°", rotation: [0, Math.PI / 2, 0] },
  { id: "D", label: "D · Y −90°", rotation: [0, -Math.PI / 2, 0] },
  { id: "E", label: "E · Original", rotation: [0, 0, 0] },
  { id: "F", label: "F · X 180°", rotation: [Math.PI, 0, 0] },
  { id: "G", label: "G · Y −90° + Z 180°", rotation: [0, -Math.PI / 2, Math.PI] },
  { id: "H", label: "H · Y −90° + X 180°", rotation: [Math.PI, -Math.PI / 2, 0] },
] as const;

export type OrientationId = (typeof ORIENTATION_PRESETS)[number]["id"];

export type CameraView = "top" | "iso";

type Props = {
  robot: URDFRobot;
  values: Record<string, number>;
  orientation: OrientationId;
  view?: CameraView;
  className?: string;
  height?: string;
};

function Robot({
  robot,
  values,
  offset,
  rotation,
}: {
  robot: URDFRobot;
  values: Record<string, number>;
  offset: [number, number, number];
  rotation: readonly [number, number, number];
}) {
  useEffect(() => {
    Object.entries(values).forEach(([name, v]) => robot.setJointValue(name, v));
  }, [robot, values]);

  return (
    <group position={offset}>
      <group rotation={[...rotation]}>
        <primitive object={robot} />
      </group>
    </group>
  );
}

function CameraRig({
  position,
  target,
}: {
  position: [number, number, number];
  target: [number, number, number];
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as {
    target: THREE.Vector3;
    update: () => void;
  } | null;

  useEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.up.set(0, 1, 0);
    if (controls) {
      controls.target.set(target[0], target[1], target[2]);
      controls.update();
    } else {
      camera.lookAt(target[0], target[1], target[2]);
    }
    camera.updateProjectionMatrix();
  }, [camera, controls, position[0], position[1], position[2], target[0], target[1], target[2]]);

  return null;
}

export default function UrdfScene({
  robot,
  values,
  orientation,
  view = "top",
  className,
  height = "440px",
}: Props) {
  const rotation =
    ORIENTATION_PRESETS.find((preset) => preset.id === orientation)?.rotation ??
    ORIENTATION_PRESETS[0].rotation;
  const frame = useMemo(() => {
    const probe = new THREE.Group();
    probe.rotation.set(rotation[0], rotation[1], rotation[2]);
    probe.add(robot);
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(probe);
    probe.remove(robot);
    const center = box.getCenter(new THREE.Vector3());
    const dim = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
    return {
      // Recentre on the origin and rest the model on the ground plane.
      offset: [-center.x, -box.min.y, -center.z] as [number, number, number],
      h: dim.y,
      maxDim,
    };
  }, [robot, rotation]);

  const { offset, h, maxDim } = frame;
  const dist = maxDim * 3.2;
  const cameraPosition: [number, number, number] =
    view === "top" ? [0, dist, 0.0001] : [dist, dist * 0.7, dist];
  const target: [number, number, number] = view === "top" ? [0, 0, 0] : [0, h * 0.45, 0];

  return (
    <div className={className} style={{ height }}>
      <Canvas shadows camera={{ position: cameraPosition, fov: 40, near: 0.01, far: maxDim * 80 }}>
        <CameraRig position={cameraPosition} target={target} />

        <color attach="background" args={["#0d1117"]} />
        <hemisphereLight intensity={0.45} groundColor="#111827" />
        <directionalLight
          castShadow
          position={[maxDim, maxDim * 2, maxDim]}
          intensity={2}
          shadow-mapSize={[2048, 2048]}
        />
        <directionalLight position={[-maxDim, maxDim, -maxDim]} intensity={0.5} />
        <Suspense fallback={null}>
          <Robot robot={robot} values={values} offset={offset} rotation={rotation} />
          <Environment preset="city" />
        </Suspense>
        <Grid
          args={[maxDim * 6, maxDim * 6]}
          cellSize={maxDim / 20}
          cellColor="#334155"
          sectionSize={maxDim / 4}
          sectionColor="#0ea5a5"
          infiniteGrid
          fadeDistance={maxDim * 10}
        />
        <axesHelper args={[maxDim * 0.6]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]}>
          <planeGeometry args={[maxDim * 8, maxDim * 8]} />
          <shadowMaterial opacity={0.25} />
        </mesh>
        <OrbitControls makeDefault enableDamping target={target} />
      </Canvas>
    </div>
  );
}
