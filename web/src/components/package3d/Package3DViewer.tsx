import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildPackageModel, resolvePackageSpec, type PackageViewMode } from "./packageLibrary";

type PackageCameraView = "3d" | "top" | "bottom" | "side";

export function Package3DViewer({ packageName, transistorId, variant = "thermal", mode: controlledMode }: { packageName: string; transistorId: string; variant?: "thermal" | "component"; mode?: PackageViewMode }) {
  const inspectorRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const zoomRef = useRef<(factor: number) => void>(() => undefined);
  const [internalMode, setInternalMode] = useState<PackageViewMode>("package");
  const mode = controlledMode ?? internalMode;
  const [view, setView] = useState<PackageCameraView>("3d");
  const [thumbnails, setThumbnails] = useState<Partial<Record<PackageCameraView,string>>>({});
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null);
  const spec = useMemo(() => resolvePackageSpec(packageName), [packageName]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hostElement = host;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 120);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: variant === "component" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", `${spec.label} interactive 3D package model`);
    renderer.domElement.setAttribute("role", "img");
    hostElement.prepend(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xd8ecff, 0x102033, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2); keyLight.position.set(9, 15, 11); keyLight.castShadow = true; scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x35a7ff, 1.7); rimLight.position.set(-10, 7, -9); scene.add(rimLight);
    const model = buildPackageModel(spec, mode, transistorId); scene.add(model);
    const grid = new THREE.GridHelper(30, 15, 0x36556f, 0x29435b); grid.position.y = -.03; (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .22; scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09; controls.enablePan = false; controls.rotateSpeed = .62; controls.zoomSpeed = .75;
    function frameView(cameraView: PackageCameraView) {
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 1);
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.18;
      camera.up.set(0, 1, 0);
      const direction = cameraView === "top" ? new THREE.Vector3(0, 1, .001) : cameraView === "bottom" ? new THREE.Vector3(0, -1, .001) : cameraView === "side" ? new THREE.Vector3(1, .12, 0) : new THREE.Vector3(.72, .58, .86);
      if (cameraView === "top") camera.up.set(0, 0, -1);
      if (cameraView === "bottom") camera.up.set(0, 0, 1);
      camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
      controls.target.copy(center); controls.minDistance = radius * 1.35; controls.maxDistance = radius * 7; controls.update();
    }
    function resetView() { frameView(view); }
    function zoom(factor: number) { const offset = camera.position.clone().sub(controls.target); const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance)); controls.update(); }
    resetRef.current = resetView; resetView();
    zoomRef.current = zoom;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function pointerMove(event: PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(model.children, true).find((entry) => entry.object.userData.inspectorLabel);
      renderer.domElement.style.cursor = hit ? "help" : "grab";
      setTooltip(hit ? { label: String(hit.object.userData.inspectorLabel), x: event.clientX - bounds.left, y: event.clientY - bounds.top } : null);
    }
    function leave() { setTooltip(null); renderer.domElement.style.cursor = "grab"; }
    function resetOnDoubleClick() { if (view !== "3d") setView("3d"); else resetView(); }
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("dblclick", resetOnDoubleClick);

    function resize() {
      const width = Math.max(1, hostElement.clientWidth); const height = Math.max(1, hostElement.clientHeight);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      if (variant === "component") {
        const next: Partial<Record<PackageCameraView,string>> = {};
        for (const preset of ["3d","top","bottom","side"] as PackageCameraView[]) { frameView(preset); renderer.render(scene,camera); next[preset]=renderer.domElement.toDataURL("image/webp",.72); }
        setThumbnails(next);
      }
      resetView();
    }
    const observer = new ResizeObserver(resize); observer.observe(hostElement); resize();
    let frame = 0;
    function render() { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(render); }
    render();

    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerleave", leave); renderer.domElement.removeEventListener("dblclick", resetOnDoubleClick);
      scene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((item) => { const mapped = item as THREE.Material & { map?: THREE.Texture }; mapped.map?.dispose(); item.dispose(); }); } });
      renderer.dispose(); renderer.domElement.remove(); setTooltip(null);
    };
  }, [mode, spec, transistorId, view]);

  async function expand() { const inspector = inspectorRef.current; if (!inspector) return; if (document.fullscreenElement) await document.exitFullscreen(); else await inspector.requestFullscreen?.(); }

  function resetDefault() { if (view !== "3d") setView("3d"); else resetRef.current(); }

  return <div ref={inspectorRef} className={`package-inspector ${variant === "component" ? "component-package-inspector" : "thermal-package-inspector"}`}>
    {variant === "thermal"&&controlledMode===undefined&&<div className="package-inspector-modes" role="group" aria-label="3D view mode"><button type="button" className={mode === "package" ? "active" : ""} aria-pressed={mode === "package"} onClick={() => setInternalMode("package")}>Package View</button><button type="button" className={mode === "thermal" ? "active" : ""} aria-pressed={mode === "thermal"} onClick={() => setInternalMode("thermal")}>Thermal Layers</button></div>}
    <div className="package-canvas" ref={hostRef} onContextMenu={(event) => event.preventDefault()}>{variant==="component"&&<svg className="package-axis" viewBox="0 0 50 50" aria-label="XYZ orientation axes"><line className="axis-x" x1="14" y1="37" x2="37" y2="43"/><line className="axis-y" x1="14" y1="37" x2="36" y2="25"/><line className="axis-z" x1="14" y1="37" x2="14" y2="10"/><text className="axis-x" x="40" y="46">X</text><text className="axis-y" x="38" y="25">Y</text><text className="axis-z" x="10" y="9">Z</text></svg>}{tooltip&&<span className="package-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.label}</span>}<div className="package-viewer-actions"><button type="button" onClick={resetDefault} title="Ausgangsansicht" aria-label="3D-Ausgangsansicht wiederherstellen"><RotateCcw size={12}/></button>{variant === "component"&&<><button type="button" className={view==="3d"?"active":""} onClick={()=>setView("3d")} title="Freie 3D-Ansicht" aria-label="Freie 3D-Ansicht"><Box size={12}/></button><button type="button" onClick={()=>zoomRef.current(.78)} title="Vergrößern" aria-label="3D-Modell vergrößern"><ZoomIn size={12}/></button><button type="button" onClick={()=>zoomRef.current(1.28)} title="Verkleinern" aria-label="3D-Modell verkleinern"><ZoomOut size={12}/></button></>}<button type="button" onClick={() => void expand()} title="Viewer vergrößern" aria-label="3D-Viewer vergrößern"><Maximize2 size={12}/></button></div><small>Drag to rotate · Scroll to zoom · Double-click to reset</small></div>
    {variant === "component"&&<div className="package-view-presets" role="group" aria-label="Package views">{([['3d','3D View'],['top','Top View'],['bottom','Bottom View'],['side','Side View']] as [PackageCameraView,string][]).map(([value,label])=><button type="button" key={value} className={view===value?"active":""} aria-pressed={view===value} onClick={()=>setView(value)}>{thumbnails[value]?<img src={thumbnails[value]} alt=""/>:<i aria-hidden="true"></i>}<span>{label}</span></button>)}</div>}
  </div>;
}
