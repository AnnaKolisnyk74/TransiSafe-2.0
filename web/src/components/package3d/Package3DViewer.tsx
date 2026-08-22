import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildPackageModel, resolvePackageSpec, type PackageViewMode } from "./packageLibrary";

type PackageCameraView = "3d" | "top" | "bottom" | "side";
export type ThermalRole = "junction" | "attach" | "leadframe" | "case";

type ViewerProps = {
  packageName: string;
  transistorId: string;
  variant?: "thermal" | "component";
  mode?: PackageViewMode;
  activeThermalRole?: ThermalRole | null;
  thermalTemperatureC?: number;
  thermalLimitC?: number;
  onModeChange?: (mode: PackageViewMode) => void;
  onThermalRoleSelect?: (role: ThermalRole) => void;
};

type CameraTransition = {
  started: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromFov: number;
  toFov: number;
};

const CAMERA_VIEWS: Array<[PackageCameraView, string]> = [["3d", "3D View"], ["top", "Top View"], ["bottom", "Bottom View"], ["side", "Side View"]];

function setObjectOpacity(object: THREE.Object3D, opacity: number, blend = 1) {
  if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.forEach((item) => { item.transparent = opacity < 1; item.opacity = THREE.MathUtils.lerp(item.opacity, opacity, blend); item.depthWrite = item.opacity > .55; });
}

function applyThermalProgress(model: THREE.Group, progress: number) {
  model.traverse((object) => {
    const assembledY = object.userData.assembledY as number | undefined;
    const explodedY = object.userData.explodedY as number | undefined;
    if (assembledY !== undefined && explodedY !== undefined) object.position.y = THREE.MathUtils.lerp(assembledY, explodedY, progress);
  });
  model.updateMatrixWorld(true);
}

export function Package3DViewer({ packageName, transistorId, variant = "thermal", mode: controlledMode, activeThermalRole, thermalTemperatureC, thermalLimitC, onModeChange, onThermalRoleSelect }: ViewerProps) {
  const inspectorRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const zoomRef = useRef<(factor: number) => void>(() => undefined);
  const fitRef = useRef<(view: PackageCameraView, animate?: boolean) => void>(() => undefined);
  const modeTargetRef = useRef(1);
  const thermalProgressRef = useRef(1);
  const viewRef = useRef<PackageCameraView>("3d");
  const hoveredRoleRef = useRef<ThermalRole | null>(null);
  const selectedRoleRef = useRef<ThermalRole | null>(null);
  const controlledRoleRef = useRef<ThermalRole | null>(activeThermalRole ?? null);
  const thermalTemperatureRef = useRef(thermalTemperatureC ?? 25);
  const thermalLimitRef = useRef(thermalLimitC ?? 175);
  const [internalMode, setInternalMode] = useState<PackageViewMode>("package");
  const mode = controlledMode ?? internalMode;
  const [view, setView] = useState<PackageCameraView>("3d");
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null);
  const [selectedRole, setSelectedRole] = useState<ThermalRole | null>(null);
  const spec = useMemo(() => resolvePackageSpec(packageName), [packageName]);

  useEffect(() => { setView("3d"); setSelectedRole(null); selectedRoleRef.current = null; }, [transistorId, variant]);
  useEffect(() => { controlledRoleRef.current = activeThermalRole ?? null; }, [activeThermalRole]);
  useEffect(() => { thermalTemperatureRef.current = thermalTemperatureC ?? 25; thermalLimitRef.current = thermalLimitC ?? 175; }, [thermalTemperatureC, thermalLimitC]);
  useEffect(() => { modeTargetRef.current = mode === "thermal" ? 1 : 0; viewRef.current = view; fitRef.current(view, true); }, [mode, view]);

  function selectMode(nextMode: PackageViewMode) {
    if (controlledMode === undefined) setInternalMode(nextMode);
    onModeChange?.(nextMode);
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hostElement = host;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 160);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-label", `${spec.label} interactive 3D package model`);
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.style.cursor = "grab";
    hostElement.prepend(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xd8ecff, 0x102033, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2); keyLight.position.set(9, 15, 11); keyLight.castShadow = true; scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x35a7ff, variant === "component" ? .62 : 1.25); rimLight.position.set(-10, 7, -9); scene.add(rimLight);
    const model = buildPackageModel(spec, variant === "thermal" ? "thermal" : "package", transistorId); scene.add(model);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.userData.baseOpacity = materials[0]?.opacity ?? 1;
    });
    if (variant === "component") model.traverse((object) => {
      const role = object.userData.thermalRole as ThermalRole | undefined;
      if (role === "junction" || role === "attach" || role === "leadframe") object.visible = false;
    });
    thermalProgressRef.current = variant === "thermal" ? modeTargetRef.current : 0;
    if (variant === "thermal") applyThermalProgress(model, thermalProgressRef.current);
    const grid = new THREE.GridHelper(34, 17, 0x8296a8, 0xcbd6df); grid.position.y = -.03; (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .48; scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .085; controls.enablePan = false; controls.rotateSpeed = .58; controls.zoomSpeed = .72;
    let transition: CameraTransition | null = null;

    function directionFor(cameraView: PackageCameraView) {
      if (cameraView === "top") return new THREE.Vector3(0, 1, .0001);
      if (cameraView === "bottom") return new THREE.Vector3(0, -1, .0001);
      if (cameraView === "side") return new THREE.Vector3(1, .0001, 0);
      return variant === "thermal" ? new THREE.Vector3(.78, .72, -1) : new THREE.Vector3(.78, .64, -1);
    }

    function targetFrame(cameraView: PackageCameraView) {
      const previousProgress = thermalProgressRef.current;
      if (variant === "thermal") applyThermalProgress(model, modeTargetRef.current);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const focusBounds = new THREE.Box3();
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.visible) return;
        const role = object.userData.thermalRole as ThermalRole | undefined;
        const label = String(object.userData.inspectorLabel ?? "");
        const isFocusPart = variant === "thermal" ? role === "junction" || role === "attach" || role === "leadframe" : label.includes("molded compound");
        if (isFocusPart) focusBounds.expandByObject(object);
      });
      if (!focusBounds.isEmpty()) center.lerp(focusBounds.getCenter(new THREE.Vector3()), variant === "thermal" ? .42 : .28);
      center.x = 0;
      if (variant === "component" && (cameraView === "top" || cameraView === "bottom")) center.x -= size.x * .27;
      if (variant === "component" && cameraView === "3d") {
        center.x -= size.x * .18;
        center.y -= Math.min(size.y, 2.8);
      }
      if (variant === "thermal") {
        const aspectScale = camera.aspect < .7 ? 0 : THREE.MathUtils.clamp(camera.aspect / 1.2, 0, 1);
        center.x -= size.x * .3 * aspectScale;
        center.y -= Math.min(size.y, 4.2 * aspectScale);
      }
      if (variant === "thermal") applyThermalProgress(model, previousProgress);
      const direction = directionFor(cameraView).normalize();
      const targetFov = cameraView === "3d" ? 32 : 25;
      const verticalFov = THREE.MathUtils.degToRad(targetFov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const fullscreenPadding = document.fullscreenElement === inspectorRef.current ? 1.25 : 1;
      const padding = (variant === "thermal" ? 1.06 : cameraView === "3d" ? .9 : 1.62) * fullscreenPadding;
      let distance: number;
      if (cameraView === "top" || cameraView === "bottom") distance = Math.max((size.z / 2) / Math.tan(verticalFov / 2), (size.x / 2) / Math.tan(horizontalFov / 2)) * padding + size.y / 2;
      else if (cameraView === "side") distance = Math.max((size.y / 2) / Math.tan(verticalFov / 2), (size.z / 2) / Math.tan(horizontalFov / 2)) * padding + size.x / 2;
      else { const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 1); distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * padding; }
      const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 1);
      camera.near = Math.max(.05, distance - radius * 2.2); camera.far = distance + radius * 8; camera.updateProjectionMatrix();
      return { center, position: center.clone().add(direction.multiplyScalar(distance)), fov: targetFov, radius };
    }

    function fitModelToView(cameraView: PackageCameraView, animate = true) {
      const target = targetFrame(cameraView);
      const targetDistance = target.position.distanceTo(target.center);
      controls.minDistance = target.radius * 1.12;
      controls.maxDistance = Math.max(target.radius * 7, targetDistance * 1.2);
      camera.up.set(0, 1, 0);
      if (cameraView === "top") camera.up.set(0, 0, 1);
      if (cameraView === "bottom") camera.up.set(0, 0, -1);
      if (!animate) { transition = null; camera.position.copy(target.position); camera.fov = target.fov; controls.target.copy(target.center); camera.updateProjectionMatrix(); controls.update(); return; }
      transition = { started: performance.now(), duration: 2400, fromPosition: camera.position.clone(), toPosition: target.position, fromTarget: controls.target.clone(), toTarget: target.center, fromFov: camera.fov, toFov: target.fov };
    }

    fitRef.current = fitModelToView;
    resetRef.current = () => fitModelToView(viewRef.current, true);
    zoomRef.current = (factor: number) => { transition = null; const offset = camera.position.clone().sub(controls.target); const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance)); controls.update(); };
    controls.addEventListener("start", () => { transition = null; });

    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    function hitAt(event: PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1; pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1; raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(model.children, true).find((entry) => entry.object.userData.inspectorLabel);
    }
    function pointerMove(event: PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect(); const hit = hitAt(event); hoveredRoleRef.current = (hit?.object.userData.thermalRole as ThermalRole | undefined) ?? null; renderer.domElement.style.cursor = hit ? "pointer" : "grab";
      setTooltip(hit ? { label: String(hit.object.userData.inspectorLabel), x: event.clientX - bounds.left, y: event.clientY - bounds.top } : null);
    }
    function selectLayer(event: PointerEvent) { const role = hitAt(event)?.object.userData.thermalRole as ThermalRole | undefined; if (!role || variant !== "thermal") return; selectedRoleRef.current = role; setSelectedRole(role); onThermalRoleSelect?.(role); }
    function leave() { hoveredRoleRef.current = null; setTooltip(null); renderer.domElement.style.cursor = "grab"; }
    function resetOnDoubleClick() { if (view !== "3d") setView("3d"); else fitModelToView("3d", true); }
    renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerleave", leave); renderer.domElement.addEventListener("click", selectLayer); renderer.domElement.addEventListener("dblclick", resetOnDoubleClick);

    function resize() { const width = Math.max(1, hostElement.clientWidth); const height = Math.max(1, hostElement.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); fitModelToView(viewRef.current, false); }
    const observer = new ResizeObserver(resize); observer.observe(hostElement); resize();

    function updateSelection() {
      const activeRole = activeThermalRole === undefined ? selectedRoleRef.current : controlledRoleRef.current;
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
        const role = object.userData.thermalRole as ThermalRole | undefined;
        const assembledOpacity = object.userData.assembledOpacity as number | undefined;
        const explodedOpacity = object.userData.explodedOpacity as number | undefined;
        let baseOpacity = object.userData.baseOpacity as number;
        if (assembledOpacity !== undefined && explodedOpacity !== undefined) baseOpacity = THREE.MathUtils.lerp(assembledOpacity, explodedOpacity, thermalProgressRef.current);
        if (object.userData.thermalPath) baseOpacity = thermalProgressRef.current * .86;
        const targetOpacity = activeRole && role !== activeRole ? Math.min(baseOpacity, .065) : baseOpacity;
        setObjectOpacity(object, targetOpacity, .012);
        if (!(object instanceof THREE.Mesh) || !role) return;
        const selected = role === activeRole; const hovered = role === hoveredRoleRef.current;
        const emphasized = selected ? 1.055 : hovered ? 1.022 : 1; const scale = THREE.MathUtils.lerp(object.scale.x, emphasized, .12); object.scale.setScalar(scale);
        const material = object.material as THREE.MeshStandardMaterial;
        if (role === "junction") {
          const heat = THREE.MathUtils.clamp((thermalTemperatureRef.current - 25) / Math.max(1, thermalLimitRef.current - 25), 0, 1);
          const heatColor = new THREE.Color().setHSL(0, .9, .48 - heat * .16);
          material.color.lerp(heatColor, .09);
          material.emissive.copy(heatColor).multiplyScalar(selected ? .28 : .08 + heat * .18);
          material.emissiveIntensity = selected ? .72 : .28 + heat * .5;
        } else if ("emissive" in material) {
          material.emissive.setHex(selected ? 0x195b83 : hovered ? 0x153a52 : 0x000000);
          material.emissiveIntensity = selected ? .52 : hovered ? .22 : 0;
        }
      });
    }

    let frame = 0;
    function render(now: number) {
      if (variant === "thermal") { thermalProgressRef.current = THREE.MathUtils.lerp(thermalProgressRef.current, modeTargetRef.current, .012); applyThermalProgress(model, thermalProgressRef.current); }
      if (transition) { const raw = Math.min(1, (now - transition.started) / transition.duration); const eased = 1 - Math.pow(1 - raw, 3); camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased); controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased); camera.fov = THREE.MathUtils.lerp(transition.fromFov, transition.toFov, eased); camera.updateProjectionMatrix(); if (raw >= 1) transition = null; }
      updateSelection(); controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerleave", leave); renderer.domElement.removeEventListener("click", selectLayer); renderer.domElement.removeEventListener("dblclick", resetOnDoubleClick);
      scene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((item) => { const mapped = item as THREE.Material & { map?: THREE.Texture; bumpMap?: THREE.Texture }; mapped.map?.dispose(); if (mapped.bumpMap !== mapped.map) mapped.bumpMap?.dispose(); item.dispose(); }); } });
      renderer.dispose(); renderer.domElement.remove(); setTooltip(null);
    };
  }, [onThermalRoleSelect, spec, transistorId, variant]);

  useEffect(() => { selectedRoleRef.current = selectedRole; }, [selectedRole]);
  async function expand() { const inspector = inspectorRef.current; if (!inspector) return; if (document.fullscreenElement) await document.exitFullscreen(); else await inspector.requestFullscreen?.(); }
  function resetDefault() { if (view !== "3d") setView("3d"); else resetRef.current(); }

  return <div ref={inspectorRef} className={`package-inspector ${variant === "component" ? "component-package-inspector" : "thermal-package-inspector"}`}>
    <div className="package-fullscreen-meta"><strong>{transistorId}</strong><span>{spec.label} · interactive engineering model</span></div>
    {variant === "thermal" && <div className="package-inspector-modes" role="group" aria-label="3D view mode"><button type="button" className={mode === "package" ? "active" : ""} aria-pressed={mode === "package"} onClick={() => selectMode("package")}>Package View</button><button type="button" className={mode === "thermal" ? "active" : ""} aria-pressed={mode === "thermal"} onClick={() => selectMode("thermal")}>Thermal Layers</button></div>}
    <div className="package-canvas" ref={hostRef} onContextMenu={(event) => event.preventDefault()}>
      <svg className="package-axis" viewBox="0 0 58 58" aria-label="Stable XYZ view reference"><defs><marker id={`axis-arrow-x-${variant}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path className="axis-x" d="M0,0 L5,2.5 L0,5 Z"/></marker><marker id={`axis-arrow-y-${variant}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path className="axis-y" d="M0,0 L5,2.5 L0,5 Z"/></marker><marker id={`axis-arrow-z-${variant}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path className="axis-z" d="M0,0 L5,2.5 L0,5 Z"/></marker></defs><circle cx="17" cy="43" r="3"/><line className="axis-x" x1="17" y1="43" x2="45" y2="50" markerEnd={`url(#axis-arrow-x-${variant})`}/><line className="axis-y" x1="17" y1="43" x2="43" y2="25" markerEnd={`url(#axis-arrow-y-${variant})`}/><line className="axis-z" x1="17" y1="43" x2="17" y2="10" markerEnd={`url(#axis-arrow-z-${variant})`}/><text className="axis-x" x="49" y="54">X</text><text className="axis-y" x="45" y="23">Y</text><text className="axis-z" x="13" y="8">Z</text></svg>
      {tooltip && <span className="package-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.label}</span>}
      <div className="package-viewer-actions"><button type="button" onClick={resetDefault} title="Ausgangsansicht" aria-label="3D-Ausgangsansicht wiederherstellen"><RotateCcw size={13}/></button><button type="button" className={view === "3d" ? "active" : ""} onClick={() => setView("3d")} title="Freie 3D-Perspektive" aria-label="Freie 3D-Ansicht"><Box size={13}/></button><button type="button" onClick={() => zoomRef.current(.78)} title="Vergrößern" aria-label="3D-Modell vergrößern"><ZoomIn size={13}/></button><button type="button" onClick={() => zoomRef.current(1.28)} title="Verkleinern" aria-label="3D-Modell verkleinern"><ZoomOut size={13}/></button><button type="button" onClick={() => void expand()} title="Fit to View / Fullscreen" aria-label="3D-Viewer vergrößern"><Maximize2 size={13}/></button></div>
      <small>Drag to rotate · Scroll / pinch to zoom · Double-click to reset{variant === "thermal" ? " · Click a layer for values" : ""}</small>
    </div>
    {variant === "component" && <div className="package-view-presets" role="group" aria-label="Package views">{CAMERA_VIEWS.map(([value, label]) => <button type="button" key={value} className={view === value ? "active" : ""} aria-pressed={view === value} onClick={() => setView(value)}><span>{label}</span></button>)}</div>}
  </div>;
}
