import { Cpu, Thermometer, Box } from "lucide-react";
import type { AnalysisInput, AnalysisResponse } from "../types";
import { formatNumber } from "./format";

export function ThermalPathCompact({ result, input }: { result: AnalysisResponse; input: AnalysisInput }) {
  const reserve = result.result.margins.thermal_reserve_percent;
  return <section className="result-card thermal-path-compact">
    <header><div><span>Thermal path</span><h3>Junction to {input.temperature_reference === "CASE" ? "case" : "ambient"}</h3></div><Thermometer size={18}/></header>
    <div className="thermal-flow">
      <div className="thermal-node hot"><i><Cpu size={22}/></i><span>Junction (Tj)</span><strong>{formatNumber(result.result.tj_c, 1)} °C</strong><small>Limit {formatNumber(result.source.tj_max_c)} °C</small></div>
      <div className="thermal-delta"><span></span><small>ΔT</small><b>{formatNumber(result.result.tj_c - input.temperature_c, 1)} K</b></div>
      <div className="thermal-node cold"><i><Box size={22}/></i><span>{input.temperature_reference === "CASE" ? "Case (Tc)" : "Ambient (Ta)"}</span><strong>{formatNumber(input.temperature_c, 1)} °C</strong><small>Reference</small></div>
    </div>
    <div className="thermal-reserve"><div><span>Thermal reserve</span><b>{formatNumber(result.result.temperature_margin_c, 1)} K</b><strong>{formatNumber(reserve, 0)} %</strong></div><div className="reserve-track"><span style={{ width: `${Math.max(0, Math.min(100, reserve))}%` }}/></div><small>{formatNumber(result.result.tj_c, 1)} °C <em>{formatNumber(result.source.tj_max_c)} °C limit</em></small></div>
  </section>;
}
