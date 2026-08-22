import { lazy, Suspense, useState } from "react";
import { Box, ChevronRight, Cpu, Info, Layers3, Shield, Thermometer, Waves } from "lucide-react";
import type { AnalysisInput, AnalysisResponse, ModelSummary } from "../types";
import { formatNumber } from "./format";
import type { ThermalRole } from "./package3d/Package3DViewer";

const Package3DViewer = lazy(() => import("./package3d/Package3DViewer").then((module) => ({ default: module.Package3DViewer })));

export function ThermalPathCompact({ result, input, model, onDetails }: { result: AnalysisResponse; input: AnalysisInput; model: ModelSummary; onDetails?: () => void }) {
  const reserve = result.result.margins.thermal_reserve_percent;
  const delta = result.result.tj_c - input.temperature_c;
  const [viewMode, setViewMode] = useState<"package" | "thermal">("thermal");
  const [selectedLayer, setSelectedLayer] = useState<ThermalRole | null>(null);
  const layerInfo: Record<ThermalRole, { label: string; value: string; detail: string }> = {
    junction: { label: "Silicon Junction", value: `${formatNumber(result.result.tj_c, 1)} °C`, detail: `Calculated Tj · limit ${formatNumber(result.source.tj_max_c)} °C` },
    attach: { label: "Die Attach", value: `${formatNumber(delta, 1)} K path ΔT`, detail: "Part of the calculated junction-to-reference path" },
    leadframe: { label: "Leadframe / Package", value: `${formatNumber(result.result.p_total_w, 2)} W`, detail: "Calculated heat flow through the package path" },
    case: { label: input.temperature_reference === "CASE" ? "Case Reference" : "Ambient Path", value: `${formatNumber(input.temperature_c, 1)} °C`, detail: `${input.temperature_reference === "CASE" ? "Tc" : "Ta"} analysis reference` },
  };
  const activeLayer = selectedLayer ? layerInfo[selectedLayer] : null;
  return <section className="result-card thermal-path-compact">
    <header><div><span>Thermal path</span><h3>Junction to {input.temperature_reference === "CASE" ? "case" : "ambient"}</h3></div><Thermometer size={18}/></header>
    <div className="thermal-flow">
      <div className="thermal-node hot"><i><Cpu size={22}/></i><span>Junction (Tj)</span><strong>{formatNumber(result.result.tj_c, 1)} °C</strong><small>Limit {formatNumber(result.source.tj_max_c)} °C</small></div>
      <div className="thermal-delta"><span></span><i><Waves size={20}/></i><small>ΔT</small><b>{formatNumber(result.result.tj_c - input.temperature_c, 1)} K</b></div>
      <div className="thermal-node cold"><i><Box size={22}/></i><span>{input.temperature_reference === "CASE" ? "Case (Tc)" : "Ambient (Ta)"}</span><strong>{formatNumber(input.temperature_c, 1)} °C</strong><small>Reference</small></div>
    </div>
    <div className="thermal-facts">
      <article><Shield size={19}/><span>Thermal resistance<small>ZθJC</small></span><strong>{formatNumber(result.result.zth_jc_k_per_w, 2)} K/W</strong></article>
      <article><Waves size={19}/><span>Heat flow<small>Q</small></span><strong>{formatNumber(result.result.p_total_w, 2)} W</strong></article>
      <article className="thermal-model-fact"><Layers3 size={19}/><span>Thermal model<small>{model.package_name}</small></span><strong title={`${model.id} · ${input.temperature_reference === "CASE" ? "Junction–Case" : "Junction–Ambient"}`}>{input.temperature_reference === "CASE" ? "Junction–Case" : "Junction–Ambient"}</strong></article>
    </div>
    <div className="thermal-stack" aria-label={`3D thermal model for ${model.id}`}>
      <div className="thermal-stack-heading"><strong>THERMAL STACK 3D</strong><Info size={13} aria-label="Package-specific thermal construction"/></div>
      <div className="thermal-stack-body">
        <Suspense fallback={<div className="package-viewer-loading">3D thermal stack loading…</div>}><Package3DViewer packageName={model.package_name} transistorId={model.id} mode={viewMode} activeThermalRole={selectedLayer} thermalTemperatureC={result.result.tj_c} thermalLimitC={result.source.tj_max_c} onModeChange={setViewMode} onThermalRoleSelect={(role) => { setSelectedLayer(role); setViewMode("thermal"); }}/></Suspense>
        <div className="thermal-layer-legend"><button type="button" className={`all ${selectedLayer === null ? "active" : ""}`} aria-pressed={selectedLayer === null} onClick={() => { setSelectedLayer(null); setViewMode("thermal"); }}><Layers3 size={13}/><span><b>Complete Stack</b><small>Show all layers together</small></span></button>{(Object.keys(layerInfo) as ThermalRole[]).map((role) => <button type="button" className={`${role} ${selectedLayer === role ? "active" : ""}`} aria-pressed={selectedLayer === role} key={role} onClick={() => { setSelectedLayer((current) => current === role ? null : role); setViewMode("thermal"); }}><i></i><span><b>{layerInfo[role].label}</b><small>{layerInfo[role].value}</small></span></button>)}</div>
      </div>
      {activeLayer ? <div className={`thermal-layer-readout ${selectedLayer}`}><span><i></i><b>{activeLayer.label}</b></span><strong>{activeLayer.value}</strong><small>{activeLayer.detail} · click again to return to the complete stack</small></div> : <div className="thermal-layer-readout all"><span><Layers3 size={13}/><b>Complete thermal stack</b></span><strong>All layers</strong><small>Junction → die attach → leadframe/package → {input.temperature_reference === "CASE" ? "case" : "ambient"}. Select a layer to isolate it.</small></div>}
      <div className="thermal-stack-metrics"><span>RθJC<b>{formatNumber(model.rth_jc_k_per_w, 2)} K/W</b></span><span>Heat Flow (Q)<b>{formatNumber(result.result.p_total_w, 2)} W</b></span><span>ΔT (Tj − T{input.temperature_reference === "CASE" ? "c" : "a"})<b>{formatNumber(result.result.tj_c - input.temperature_c, 1)} K</b></span></div>
      <button type="button" className="thermal-details-button" onClick={onDetails}>Thermal details<ChevronRight size={13}/></button>
    </div>
    <div className={`thermal-reserve ${reserve < 0 ? "reserve-critical" : ""}`}><div><span>Thermal reserve</span><b>{formatNumber(result.result.temperature_margin_c, 1)} K</b><strong>{formatNumber(reserve, 0)} %</strong></div><div className="reserve-track"><span style={{ width: `${Math.max(0, Math.min(100, reserve))}%` }}/></div><small>{formatNumber(result.result.tj_c, 1)} °C <em>{formatNumber(result.source.tj_max_c)} °C limit</em></small></div>
  </section>;
}
