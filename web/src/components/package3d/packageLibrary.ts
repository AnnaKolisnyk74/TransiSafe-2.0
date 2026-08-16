import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type PackageViewMode = "package" | "thermal";

export interface PackageSpec {
  id: "CCPAK1212" | "TO263" | "GENERIC_POWER";
  label: string;
  body: { width: number; depth: number; height: number; radius: number };
  cameraDistance: number;
}

const PACKAGE_SPECS: PackageSpec[] = [
  { id: "CCPAK1212", label: "CCPAK1212 / SOT8000A", body: { width: 12, depth: 9.4, height: 2.5, radius: .45 }, cameraDistance: 20 },
  { id: "TO263", label: "D²PAK / TO-263", body: { width: 10.16, depth: 8.35, height: 4.55, radius: .5 }, cameraDistance: 23 },
  { id: "GENERIC_POWER", label: "Power MOSFET package", body: { width: 10, depth: 8, height: 3.2, radius: .45 }, cameraDistance: 21 },
];

export function resolvePackageSpec(packageName: string): PackageSpec {
  const normalized = packageName.toUpperCase().replaceAll("²", "2");
  if (normalized.includes("CCPAK") || normalized.includes("SOT8000")) return PACKAGE_SPECS[0];
  if (normalized.includes("D2PAK") || normalized.includes("TO-263") || normalized.includes("KTT")) return PACKAGE_SPECS[1];
  return PACKAGE_SPECS[2];
}

type PartOptions = {
  label: string;
  color: number;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  thermalRole?: "junction" | "attach" | "leadframe" | "case";
};

function material({ color, metalness = 0, roughness = .55, opacity = 1 }: PartOptions) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

function addPart(group: THREE.Group, geometry: THREE.BufferGeometry, position: [number, number, number], options: PartOptions) {
  const mesh = new THREE.Mesh(geometry, material(options));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.inspectorLabel = options.label;
  mesh.userData.thermalRole = options.thermalRole;
  group.add(mesh);
  return mesh;
}

function rounded(width: number, height: number, depth: number, radius: number) {
  return new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, height / 3));
}

function markingTexture(marking: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#171b20"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#c6ccd2"; context.textAlign = "center"; context.textBaseline = "middle";
  context.font = "600 38px IBM Plex Mono, monospace";
  context.fillText(marking.slice(0, 18), 256, 104);
  context.font = "500 24px IBM Plex Mono, monospace";
  context.fillStyle = "#7f8992"; context.fillText("TRANSISAFE PACKAGE INSPECTOR", 256, 158);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addMarking(group: THREE.Group, spec: PackageSpec, marking: string, y: number) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(spec.body.width * .72, spec.body.depth * .5), new THREE.MeshBasicMaterial({ map: markingTexture(marking), transparent: true, opacity: .88 }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, y, 0);
  plane.userData.inspectorLabel = `${marking} device marking`;
  group.add(plane);
}

function addThermalCore(group: THREE.Group, spec: PackageSpec, mode: PackageViewMode, caseY: number) {
  const exploded = mode === "thermal";
  const leadframeY = caseY + (exploded ? 1.15 : .3);
  const attachY = caseY + (exploded ? 2.25 : .48);
  const junctionY = caseY + (exploded ? 3.25 : .65);
  addPart(group, rounded(spec.body.width * .68, .22, spec.body.depth * .62, .08), [0, leadframeY, 0], { label: "Copper leadframe / thermal pad", color: 0xb86f2d, metalness: .88, roughness: .25, thermalRole: "leadframe" });
  addPart(group, rounded(spec.body.width * .42, .12, spec.body.depth * .38, .04), [0, attachY, 0], { label: "Solder / silver die attach", color: 0xd6b66b, metalness: .62, roughness: .3, thermalRole: "attach" });
  addPart(group, rounded(spec.body.width * .36, .22, spec.body.depth * .32, .04), [0, junctionY, 0], { label: "Silicon junction (Tj)", color: 0xd94559, metalness: .08, roughness: .28, thermalRole: "junction" });
  if (exploded) {
    const heatPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, junctionY + .2, 0), new THREE.Vector3(0, caseY - .35, 0)]), new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: .8 }));
    heatPath.userData.inspectorLabel = "Primary junction-to-case heat path";
    group.add(heatPath);
  }
}

function buildCcPak(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = new THREE.Group();
  const bodyY = mode === "thermal" ? 4.8 : 1.55;
  addPart(group, rounded(spec.body.width, spec.body.height, spec.body.depth, spec.body.radius), [0, bodyY, 0], { label: "CCPAK1212 molded compound", color: 0x20262d, metalness: .03, roughness: .72, opacity: mode === "thermal" ? .18 : 1, thermalRole: "case" });
  const terminalGeometry = rounded(1.02, .18, 1.35, .06);
  for (let index = 0; index < 6; index += 1) {
    const z = -5 + index * 2;
    addPart(group, terminalGeometry.clone(), [-6.15, .22, z], { label: `Terminal ${index + 1}`, color: 0xb8c0c8, metalness: .92, roughness: .18 });
    addPart(group, terminalGeometry.clone(), [6.15, .22, z], { label: `Terminal ${12 - index}`, color: 0xb8c0c8, metalness: .92, roughness: .18 });
  }
  addPart(group, rounded(7.1, .16, 7.35, .08), [0, .12, 0], { label: "Exposed thermal pad / terminal 13", color: 0xc88442, metalness: .9, roughness: .2, thermalRole: "case" });
  addPart(group, new THREE.CylinderGeometry(.24, .24, .12, 24), [-4.9, bodyY + spec.body.height / 2 + .08, -3.6], { label: "Pin 1 / gate index", color: 0xd5d9dc, metalness: .3, roughness: .4 });
  addThermalCore(group, spec, mode, .35);
  if (mode === "package") addMarking(group, spec, marking, bodyY + spec.body.height / 2 + .015);
  return group;
}

function buildTo263(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = new THREE.Group();
  const bodyY = mode === "thermal" ? 6.1 : 2.65;
  addPart(group, rounded(spec.body.width, spec.body.height, spec.body.depth, spec.body.radius), [0, bodyY, .7], { label: "D²PAK molded compound", color: 0x20262d, metalness: .03, roughness: .72, opacity: mode === "thermal" ? .18 : 1, thermalRole: "case" });
  addPart(group, rounded(8.45, .3, 7.25, .08), [0, .27, 2.7], { label: "Drain tab / exposed case reference", color: 0xb9c2ca, metalness: .94, roughness: .16, thermalRole: "case" });
  for (const [x,label] of [[-3.25,"Gate lead (pin 1)"],[3.25,"Source lead (pin 3)"]] as [number,string][]) {
    addPart(group, rounded(1.15,.25,2.5,.07), [x,.8,-4.35], { label, color:0xb9c2ca,metalness:.94,roughness:.16 });
    const bend=addPart(group, rounded(1.15,.25,2.25,.07), [x,.48,-6.05], { label, color:0xb9c2ca,metalness:.94,roughness:.16 }); bend.rotation.x=-.24;
    addPart(group, rounded(1.15,.25,2.2,.07), [x,.18,-7.65], { label:`${label} solder foot`,color:0xb9c2ca,metalness:.94,roughness:.16 });
  }
  addPart(group, rounded(1.15,.38,1.25,.07), [0,.75,-4.05], { label:"Drain lead / tab (pin 2)",color:0xb9c2ca,metalness:.94,roughness:.16 });
  addPart(group, new THREE.CylinderGeometry(.26, .26, .12, 24), [-3.9, bodyY + spec.body.height / 2 + .08, -2.1], { label: "Pin 1 / gate index", color: 0xd5d9dc, metalness: .3, roughness: .4 });
  addThermalCore(group, spec, mode, .5);
  if (mode === "package") addMarking(group, spec, marking, bodyY + spec.body.height / 2 + .015);
  return group;
}

function buildGeneric(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = buildTo263(spec, mode, marking);
  group.userData.genericPackage = true;
  return group;
}

export function buildPackageModel(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = spec.id === "CCPAK1212" ? buildCcPak(spec, mode, marking) : spec.id === "TO263" ? buildTo263(spec, mode, marking) : buildGeneric(spec, mode, marking);
  group.rotation.y = -.28;
  return group;
}
