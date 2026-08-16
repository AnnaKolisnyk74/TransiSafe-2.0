import { lazy, Suspense } from "react";
import { Box, Cpu, Layers3, Shield, Thermometer, Waves } from "lucide-react";
import type { AnalysisInput, AnalysisResponse, ModelSummary } from "../types";
import { formatNumber } from "./format";

const Package3DViewer = lazy(() => import("./package3d/Package3DViewer").then((module) => ({ default: module.Package3DViewer })));

export function ThermalPathCompact({ result, input, model }: { result: AnalysisResponse; input: AnalysisInput; model: ModelSummary }) {
  const reserve = result.result.margins.thermal_reserve_percent;
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
      <Suspense fallback={<div className="package-viewer-loading">3D package loading…</div>}><Package3DViewer packageName={model.package_name} transistorId={model.id}/></Suspense>
      <div className="thermal-stack-copy"><span>3D THERMAL STACK · {model.package_name}</span><strong>{model.id}</strong><div><b>Silicon junction</b><i>Die attach</i><i>Leadframe / package</i><i>{input.temperature_reference === "CASE" ? "Case reference" : "Ambient path"}</i></div><small>RθJC {formatNumber(model.rth_jc_k_per_w, 2)} K/W · ZθJC {formatNumber(result.result.zth_jc_k_per_w, 2)} K/W</small></div>
    </div>
    <div className={`thermal-reserve ${reserve < 0 ? "reserve-critical" : ""}`}><div><span>Thermal reserve</span><b>{formatNumber(result.result.temperature_margin_c, 1)} K</b><strong>{formatNumber(reserve, 0)} %</strong></div><div className="reserve-track"><span style={{ width: `${Math.max(0, Math.min(100, reserve))}%` }}/></div><small>{formatNumber(result.result.tj_c, 1)} °C <em>{formatNumber(result.source.tj_max_c)} °C limit</em></small></div>
  </section>;
}
