import { Activity, Cable, Waves, Zap } from "lucide-react";
import type { AnalysisResponse } from "../types";
import { formatNumber } from "./format";

export function LossBreakdown({ result }: { result: AnalysisResponse }) {
  const total = Math.max(result.result.p_total_w, 0);
  const rows = [
    { label: "Conduction Losses", value: result.result.p_conduction_w, tone: "conduction", color: "#168BFF", icon: Waves },
    { label: "Switching Losses", value: result.result.p_switching_w, tone: "switching", color: "#22D3EE", icon: Activity },
    { label: "Gate-Drive Losses", value: result.result.p_gate_w, tone: "gate", color: "#8B5CF6", icon: Cable },
  ];
  const percentages = rows.map((row) => total > 0 ? Math.max(0, row.value / total * 100) : 0);
  const firstEnd = percentages[0];
  const secondEnd = firstEnd + percentages[1];
  const donutBackground = total > 0
    ? `conic-gradient(${rows[0].color} 0 ${firstEnd}%, ${rows[1].color} ${firstEnd}% ${secondEnd}%, ${rows[2].color} ${secondEnd}% 100%)`
    : "#e6edf5";
  return <section className="result-card loss-breakdown"><header><div><span><Zap size={14}/>Power Loss Breakdown</span><h3>{result.input.mode === "SWITCHING" ? "Switching Operating Point" : "Linear Operating Point"}</h3></div><strong>{formatNumber(total, 3)} W<small>Total Loss</small></strong></header><div className="loss-visual"><div className="loss-donut" style={{ background: donutBackground }}><div><strong>{formatNumber(total, 3)} W</strong><span>Total Loss</span></div></div><div className="loss-rows">{rows.map((row, index) => { const Icon = row.icon; return <div className={`loss-row ${row.tone}`} key={row.label}><div><span><i className="loss-type-icon"><Icon size={15}/></i>{row.label}</span><b>{formatNumber(row.value, 3)} W</b></div><strong>{formatNumber(percentages[index], 1)} %</strong><div className="loss-track"><i style={{ width: `${Math.min(100, percentages[index])}%` }}/></div></div>; })}</div></div><div className="loss-note"><b>Die Balken zeigen den Anteil der Verlustwerte.</b><span>Alle Werte kommen aus der C-Engine; im Browser werden keine Verluste neu berechnet oder geschätzt.</span></div></section>;
}
