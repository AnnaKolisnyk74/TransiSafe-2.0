import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildPackageModel, resolvePackageSpec, type PackageViewMode } from "./packageLibrary";

export function Package3DViewer({ packageName, transistorId }: { packageName: string; transistorId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const [mode, setMode] = useState<PackageViewMode>("package");
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null);
  const spec = useMemo(() => resolvePackageSpec(packageName), [packageName]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hostElement = host;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 120);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
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
    controls.enableDamping = true; controls.dampingFactor = .075; controls.enablePan = false; controls.minDistance = spec.cameraDistance * .55; controls.maxDistance = spec.cameraDistance * 1.8;
    function resetView() { camera.position.set(spec.cameraDistance * .72, spec.cameraDistance * .62, spec.cameraDistance * .82); controls.target.set(0, mode === "thermal" ? 2.1 : 1.25, 0); controls.update(); }
    resetRef.current = resetView; resetView();

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
    function resetOnDoubleClick() { resetView(); }
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("dblclick", resetOnDoubleClick);

    function resize() { const width = Math.max(1, hostElement.clientWidth); const height = Math.max(1, hostElement.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
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
  }, [mode, spec, transistorId]);

  async function expand() { const host = hostRef.current; if (!host) return; if (document.fullscreenElement) await document.exitFullscreen(); else await host.requestFullscreen?.(); }

  return <div className="package-inspector">
    <div className="package-inspector-modes" role="group" aria-label="3D view mode"><button type="button" className={mode === "package" ? "active" : ""} aria-pressed={mode === "package"} onClick={() => setMode("package")}>Package</button><button type="button" className={mode === "thermal" ? "active" : ""} aria-pressed={mode === "thermal"} onClick={() => setMode("thermal")}>Thermal Layers</button></div>
    <div className="package-canvas" ref={hostRef} onContextMenu={(event) => event.preventDefault()}>{tooltip&&<span className="package-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.label}</span>}<div className="package-viewer-actions"><button type="button" onClick={() => resetRef.current()} title="Ausgangsansicht" aria-label="3D-Ausgangsansicht wiederherstellen"><RotateCcw size={12}/></button><button type="button" onClick={() => void expand()} title="Viewer vergrößern" aria-label="3D-Viewer vergrößern"><Maximize2 size={12}/></button></div><small>Drag rotate · Scroll zoom · Double-click reset</small></div>
  </div>;
}
