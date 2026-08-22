import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type PackageViewMode = "package" | "thermal";

export interface PackageSpec {
  id: "CCPAK1212" | "TO263" | "TOLL" | "GENERIC_POWER";
  label: string;
  body: { width: number; depth: number; height: number; radius: number };
  cameraDistance: number;
}

const PACKAGE_SPECS: PackageSpec[] = [
  { id: "CCPAK1212", label: "CCPAK1212 / SOT8000A", body: { width: 12, depth: 9.4, height: 2.5, radius: .45 }, cameraDistance: 20 },
  { id: "TO263", label: "D²PAK / TO-263", body: { width: 10.16, depth: 8.35, height: 4.55, radius: .5 }, cameraDistance: 23 },
  { id: "TOLL", label: "TOLL / PG-HSOF-8", body: { width: 11.9, depth: 9.9, height: 2.3, radius: .34 }, cameraDistance: 22 },
  { id: "GENERIC_POWER", label: "Power MOSFET package", body: { width: 10, depth: 8, height: 3.2, radius: .45 }, cameraDistance: 21 },
];

export function resolvePackageSpec(packageName: string): PackageSpec {
  const normalized = packageName.toUpperCase().replaceAll("²", "2");
  if (normalized.includes("CCPAK") || normalized.includes("SOT8000")) return PACKAGE_SPECS[0];
  if (normalized.includes("D2PAK") || normalized.includes("TO-263") || normalized.includes("KTT")) return PACKAGE_SPECS[1];
  if (normalized.includes("TOLL") || normalized.includes("HSOF")) return PACKAGE_SPECS[2];
  return PACKAGE_SPECS[3];
}

type PartOptions = {
  label: string;
  color: number;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  surface?: "molded";
  outline?: number;
  thermalRole?: "junction" | "attach" | "leadframe" | "case";
  assembledY?: number;
  explodedY?: number;
  assembledOpacity?: number;
  explodedOpacity?: number;
};

function moldedTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96; canvas.height = 96;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const grain = 196 + Math.floor(Math.random() * 34);
    image.data[index] = grain; image.data[index + 1] = grain; image.data[index + 2] = grain; image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function material({ color, metalness = 0, roughness = .55, opacity = 1, surface }: PartOptions) {
  const texture = surface === "molded" ? moldedTexture() : null;
  return new THREE.MeshStandardMaterial({ color, map: texture, bumpMap: texture, bumpScale: texture ? .018 : 0, metalness, roughness, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

function addPart(group: THREE.Group, geometry: THREE.BufferGeometry, position: [number, number, number], options: PartOptions) {
  const mesh = new THREE.Mesh(geometry, material(options));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.inspectorLabel = options.label;
  mesh.userData.thermalRole = options.thermalRole;
  mesh.userData.assembledY = options.assembledY;
  mesh.userData.explodedY = options.explodedY;
  mesh.userData.assembledOpacity = options.assembledOpacity;
  mesh.userData.explodedOpacity = options.explodedOpacity;
  group.add(mesh);
  if (options.outline !== undefined) {
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 24), new THREE.LineBasicMaterial({ color: options.outline, transparent: true, opacity: options.opacity === undefined ? .72 : Math.min(.42, options.opacity) }));
    outline.userData.inspectorLabel = options.label;
    outline.userData.thermalRole = options.thermalRole;
    outline.userData.assembledOpacity = options.assembledOpacity === undefined ? undefined : Math.min(.72, options.assembledOpacity);
    outline.userData.explodedOpacity = options.explodedOpacity === undefined ? undefined : Math.min(.32, options.explodedOpacity);
    mesh.add(outline);
  }
  return mesh;
}

function rounded(width: number, height: number, depth: number, radius: number) {
  return new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, height / 3));
}

function markingTexture(marking: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center"; context.textBaseline = "middle";
  context.shadowColor = "rgba(0, 0, 0, .72)"; context.shadowBlur = 3;
  context.fillStyle = "#e0e3e5"; context.font = "600 54px IBM Plex Mono, monospace";
  context.fillText(marking.slice(0, 18), 256, 96);
  context.font = "700 38px IBM Plex Mono, monospace"; context.fillStyle = "#b7bec4";
  context.fillText(marking.toUpperCase().startsWith("CSD") ? "TI" : marking.toUpperCase().startsWith("PSMN") ? "NXP" : marking.toUpperCase().startsWith("IP") ? "INFINEON" : "POWER MOSFET", 256, 157);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function addMarking(group: THREE.Group, spec: PackageSpec, marking: string, y: number, assembledY = y, explodedY = y) {
  const surfaceLift = .055;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(spec.body.width * .82, spec.body.depth * .54), new THREE.MeshBasicMaterial({
    map: markingTexture(marking), transparent: true, opacity: .96, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    side: THREE.DoubleSide, toneMapped: false,
  }));
  plane.rotation.x = -Math.PI / 2;
  plane.rotation.z = Math.PI;
  plane.position.set(0, y + surfaceLift, 0);
  plane.renderOrder = 6;
  plane.userData.inspectorLabel = `${marking} device marking`;
  plane.userData.assembledY = assembledY + surfaceLift;
  plane.userData.explodedY = explodedY + surfaceLift;
  plane.userData.assembledOpacity = 1;
  plane.userData.explodedOpacity = .28;
  group.add(plane);
}

function addThermalCore(group: THREE.Group, spec: PackageSpec, mode: PackageViewMode, caseY: number) {
  const exploded = mode === "thermal";
  const leadframeAssembled = caseY + .3; const leadframeExploded = caseY + 1.15;
  const attachAssembled = caseY + .48; const attachExploded = caseY + 2.25;
  const junctionAssembled = caseY + .65; const junctionExploded = caseY + 3.25;
  const leadframeY = exploded ? leadframeExploded : leadframeAssembled;
  const attachY = exploded ? attachExploded : attachAssembled;
  const junctionY = exploded ? junctionExploded : junctionAssembled;
  addPart(group, rounded(spec.body.width * .68, .22, spec.body.depth * .62, .08), [0, leadframeY, 0], { label: "Copper leadframe / thermal pad", color: 0x168bff, metalness: .72, roughness: .27, outline: 0x0b5fba, thermalRole: "leadframe", assembledY: leadframeAssembled, explodedY: leadframeExploded });
  addPart(group, rounded(spec.body.width * .42, .12, spec.body.depth * .38, .04), [0, attachY, 0], { label: "Solder / silver die attach", color: 0xf5a623, metalness: .38, roughness: .3, outline: 0xb86f00, thermalRole: "attach", assembledY: attachAssembled, explodedY: attachExploded });
  addPart(group, rounded(spec.body.width * .36, .22, spec.body.depth * .32, .04), [0, junctionY, 0], { label: "Silicon junction (Tj)", color: 0xd94559, metalness: .08, roughness: .28, outline: 0x8e1728, thermalRole: "junction", assembledY: junctionAssembled, explodedY: junctionExploded });
  if (exploded) {
    const heatPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, junctionY + .2, 0), new THREE.Vector3(0, caseY - .35, 0)]), new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: .8 }));
    heatPath.userData.inspectorLabel = "Primary junction-to-case heat path";
    heatPath.userData.thermalPath = true;
    group.add(heatPath);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.16, .42, 16), new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x063946, emissiveIntensity: .45, roughness: .3, transparent: true, opacity: .9 }));
    arrow.position.set(0, caseY + .05, 0); arrow.rotation.z = Math.PI; arrow.userData.inspectorLabel = "Heat-flow direction: junction to case"; arrow.userData.thermalPath = true; group.add(arrow);
  }
}

function buildCcPak(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = new THREE.Group();
  const assembledBodyY = 1.55; const explodedBodyY = 4.8; const bodyY = mode === "thermal" ? explodedBodyY : assembledBodyY;
  addPart(group, rounded(spec.body.width, spec.body.height, spec.body.depth, spec.body.radius), [0, bodyY, 0], { label: "CCPAK1212 molded compound", color: 0x080b0e, metalness: .01, roughness: .7, opacity: mode === "thermal" ? .18 : 1, surface: "molded", outline: 0x252d33, thermalRole: "case", assembledY: assembledBodyY, explodedY: explodedBodyY, assembledOpacity: 1, explodedOpacity: .18 });
  const terminalGeometry = rounded(1.02, .18, 1.35, .06);
  for (let index = 0; index < 6; index += 1) {
    const z = -5 + index * 2;
    addPart(group, terminalGeometry.clone(), [-6.15, .22, z], { label: `Terminal ${index + 1}`, color: 0xb8c0c8, metalness: .92, roughness: .18 });
    addPart(group, terminalGeometry.clone(), [6.15, .22, z], { label: `Terminal ${12 - index}`, color: 0xb8c0c8, metalness: .92, roughness: .18 });
  }
  addPart(group, rounded(7.1, .16, 7.35, .08), [0, .12, 0], { label: "Exposed thermal pad / terminal 13", color: 0xc88442, metalness: .9, roughness: .2, thermalRole: "case" });
  addPart(group, new THREE.CylinderGeometry(.24, .24, .08, 24), [-4.9, bodyY + spec.body.height / 2 + .04, -3.6], { label: "Pin 1 orientation mark", color: 0x343b41, metalness: .08, roughness: .78, assembledY: assembledBodyY + spec.body.height / 2 + .04, explodedY: explodedBodyY + spec.body.height / 2 + .04 });
  addThermalCore(group, spec, mode, .35);
  addMarking(group, spec, marking, bodyY + spec.body.height / 2 + .015, assembledBodyY + spec.body.height / 2 + .015, explodedBodyY + spec.body.height / 2 + .015);
  return group;
}

function buildTo263(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = new THREE.Group();
  const assembledBodyY = 2.65; const explodedBodyY = 6.1; const bodyY = mode === "thermal" ? explodedBodyY : assembledBodyY;
  addPart(group, rounded(spec.body.width, spec.body.height, spec.body.depth, spec.body.radius), [0, bodyY, .7], { label: "D²PAK molded compound", color: 0x080b0e, metalness: .01, roughness: .7, opacity: mode === "thermal" ? .18 : 1, surface: "molded", outline: 0x252d33, thermalRole: "case", assembledY: assembledBodyY, explodedY: explodedBodyY, assembledOpacity: 1, explodedOpacity: .18 });
  const bodyTravel = explodedBodyY - assembledBodyY;
  addPart(group, rounded(spec.body.width * .98, 1.18, 1.55, .24), [0, mode === "thermal" ? 1.16 + bodyTravel : 1.16, -3.62], { label: "Molded terminal apron", color: 0x06080a, metalness: .01, roughness: .72, opacity: mode === "thermal" ? .18 : 1, surface: "molded", outline: 0x20272c, thermalRole: "case", assembledY: 1.16, explodedY: 1.16 + bodyTravel, assembledOpacity: 1, explodedOpacity: .18 });

  // The tab is a real part of the common package model and remains visible from
  // rear, bottom and thermal views instead of being implied by a flat texture.
  addPart(group, rounded(8.75, .32, 8.5, .1), [0, .28, 3.45], { label: "Drain tab / exposed case reference", color: 0xc3cbd1, metalness: .94, roughness: .19, outline: 0x727d86, thermalRole: "case" });
  addPart(group, rounded(8.55, .55, 1.05, .12), [0, .52, 7.25], { label: "Rear thermal-tab shoulder", color: 0xb8c1c8, metalness: .93, roughness: .2, outline: 0x727d86, thermalRole: "case" });

  const sevenPin = marking.toUpperCase().startsWith("IPB017N10N5");
  const leadLayout: Array<[number, string, number]> = sevenPin
    ? [[-3.6, "Gate lead (pin 1)", -7.7], [-2.4, "Source lead (pin 2)", -7.7], [-1.2, "Source lead (pin 3)", -7.7], [0, "Drain lead (pin 4)", -7.28], [1.2, "Source lead (pin 5)", -7.7], [2.4, "Source lead (pin 6)", -7.7], [3.6, "Source lead (pin 7)", -7.7]]
    : [[-3.25, "Gate lead (pin 1)", -7.7], [0, "Drain lead / tab (pin 2)", -7.28], [3.25, "Source lead (pin 3)", -7.7]];
  const leadWidth = sevenPin ? .68 : 1.02;
  for (const [x, label, endZ] of leadLayout) {
    addPart(group, rounded(leadWidth, .28, 2.25, .08), [x, .84, -4.4], { label, color: 0xc7ced3, metalness: .94, roughness: .18, outline: 0x737d85 });
    // The drain is duplicated by the large rear tab and therefore remains a short stub.
    if (x === 0) continue;
    const bend = addPart(group, rounded(leadWidth, .28, 2.15, .08), [x, .5, -5.92], { label: `${label} formed bend`, color: 0xc7ced3, metalness: .94, roughness: .18, outline: 0x737d85 });
    bend.rotation.x = -.27;
    addPart(group, rounded(leadWidth, .25, x === 0 ? 1.75 : 2.25, .08), [x, .18, endZ], { label: `${label} solder foot`, color: 0xc7ced3, metalness: .94, roughness: .18, outline: 0x737d85 });
  }
  addPart(group, new THREE.CylinderGeometry(.26, .26, .08, 24), [-3.9, bodyY + spec.body.height / 2 + .04, -2.1], { label: "Pin 1 orientation mark", color: 0x343b41, metalness: .08, roughness: .78, assembledY: assembledBodyY + spec.body.height / 2 + .04, explodedY: explodedBodyY + spec.body.height / 2 + .04 });
  addThermalCore(group, spec, mode, .5);
  addMarking(group, spec, marking, bodyY + spec.body.height / 2 + .015, assembledBodyY + spec.body.height / 2 + .015, explodedBodyY + spec.body.height / 2 + .015);
  return group;
}

function buildGeneric(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = buildTo263(spec, mode, marking);
  group.userData.genericPackage = true;
  return group;
}

function buildToll(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = new THREE.Group();
  const assembledBodyY = 1.55; const explodedBodyY = 5.15; const bodyY = mode === "thermal" ? explodedBodyY : assembledBodyY;
  addPart(group, rounded(spec.body.width, spec.body.height, spec.body.depth, spec.body.radius), [0, bodyY, .35], { label: "TOLL molded compound", color: 0x080b0e, metalness: .01, roughness: .72, opacity: mode === "thermal" ? .18 : 1, surface: "molded", outline: 0x252d33, thermalRole: "case", assembledY: assembledBodyY, explodedY: explodedBodyY, assembledOpacity: 1, explodedOpacity: .18 });
  addPart(group, rounded(10.7, .18, 8.65, .1), [0, .31, .72], { label: "TOLL exposed copper drain pad", color: 0xc68a4e, metalness: .91, roughness: .22, outline: 0x76502d, thermalRole: "case" });
  addPart(group, rounded(10.55, .3, 1, .1), [0, .24, 5.25], { label: "Rear drain-tab edge", color: 0xb9c2c9, metalness: .92, roughness: .2, outline: 0x707a82, thermalRole: "case" });
  for (let index = 0; index < 8; index += 1) {
    const x = -4.55 + index * 1.3;
    addPart(group, rounded(.72, .38, .82, .06), [x, .38, -4.72], { label: `TOLL terminal ${index + 1} package connection`, color: 0xc8cfd4, metalness: .94, roughness: .18, outline: 0x737d85 });
    addPart(group, rounded(.72, .2, 1.85, .06), [x, .18, -5.38], { label: `TOLL terminal ${index + 1}`, color: 0xc8cfd4, metalness: .94, roughness: .18, outline: 0x737d85 });
  }
  addPart(group, new THREE.CylinderGeometry(.22, .22, .08, 24), [-4.72, bodyY + spec.body.height / 2 + .04, -3.55], { label: "Pin 1 orientation mark", color: 0x343b41, metalness: .08, roughness: .78, assembledY: assembledBodyY + spec.body.height / 2 + .04, explodedY: explodedBodyY + spec.body.height / 2 + .04 });
  addThermalCore(group, spec, mode, .38);
  addMarking(group, spec, marking, bodyY + spec.body.height / 2 + .015, assembledBodyY + spec.body.height / 2 + .015, explodedBodyY + spec.body.height / 2 + .015);
  return group;
}

export function buildPackageModel(spec: PackageSpec, mode: PackageViewMode, marking: string) {
  const group = spec.id === "CCPAK1212" ? buildCcPak(spec, mode, marking) : spec.id === "TO263" ? buildTo263(spec, mode, marking) : spec.id === "TOLL" ? buildToll(spec, mode, marking) : buildGeneric(spec, mode, marking);
  return group;
}
