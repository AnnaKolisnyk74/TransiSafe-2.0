import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, CircleAlert, Save, ShieldCheck, ShieldX, Thermometer, TrendingUp, Zap } from "lucide-react";
import type { AnalysisInput, AnalysisResponse, ModelSummary, SoaCurve } from "../types";
import { EmptyState } from "./EmptyState";
import { EngineeringDetails } from "./EngineeringDetails";
import { ExportMenu } from "./ExportMenu";
import { LossBreakdown } from "./LossBreakdown";
import { SOAChart } from "./SOAChart";
import { ThermalPathCompact } from "./ThermalPathCompact";
import { formatNumber } from "./format";

const statusMeta: Record<string, { title: string; eyebrow: string; detail: string; tone: string }> = {
  SAFE: { title: "Operating point admissible", eyebrow: "ASSESSMENT COMPLETE", detail: "Der Betriebspunkt liegt innerhalb aller gespeicherten Grenzen.", tone: "safe" },
  CRITICAL: { title: "Operating point critical", eyebrow: "ATTENTION REQUIRED", detail: "Der Punkt ist zulässig, mindestens eine technische Reserve ist jedoch gering.", tone: "critical" },
  NOT_SAFE_VOLTAGE: { title: "Voltage limit exceeded", eyebrow: "NOT ADMISSIBLE", detail: "Die Drain-Source-Spannungsgrenze wurde verletzt.", tone: "unsafe" },
  NOT_SAFE_CURRENT: { title: "Current limit exceeded", eyebrow: "NOT ADMISSIBLE", detail: "Die gespeicherte Stromgrenze wurde verletzt.", tone: "unsafe" },
  NOT_SAFE_SOA: { title: "Outside stored SOA", eyebrow: "NOT ADMISSIBLE", detail: "Der Betriebspunkt liegt außerhalb der gespeicherten SOA-Grenze.", tone: "unsafe" },
  NOT_SAFE_TEMPERATURE: { title: "Junction temperature exceeded", eyebrow: "NOT ADMISSIBLE", detail: "Die berechnete Sperrschichttemperatur überschreitet die Modellgrenze.", tone: "unsafe" },
  NOT_SAFE_BOTH: { title: "Power and thermal limits exceeded", eyebrow: "NOT ADMISSIBLE", detail: "Leistungs- und Temperaturgrenzen wurden verletzt.", tone: "unsafe" },
  INSUFFICIENT_DATA: { title: "Analysis incomplete", eyebrow: "NO SAFE CLASSIFICATION", detail: "Erforderliche Engineering-Daten sind für diese Bedingung nicht verfügbar.", tone: "incomplete" },
};

export function AnalysisResult({ result, input, model, soaCurves, savedName, onSave, onSaveAs }: { result: AnalysisResponse | null; input: AnalysisInput; model: ModelSummary | null; soaCurves: SoaCurve[]; savedName?: string; onSave: () => void; onSaveAs: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!result || !model) return <section className="analysis-zone"><EmptyState/></section>;
  const meta = statusMeta[result.result.status] ?? statusMeta.INSUFFICIENT_DATA;
  const Icon = meta.tone === "safe" ? Check : meta.tone === "critical" ? AlertTriangle : meta.tone === "incomplete" ? CircleAlert : ShieldX;
  const margins = result.result.margins;
  return <section className="analysis-zone result-ready" aria-live="polite">
    <div className={`result-status-strip ${meta.tone}`}>
      <div className="status-assessment"><span className="status-icon"><Icon size={23}/></span><div><small>Assessment</small><strong>{meta.tone === "safe" ? "ADMISSIBLE" : meta.title.toUpperCase()}</strong><p>{meta.detail}</p></div></div>
      <div className="status-metric"><Thermometer size={20}/><div><span>TJ</span><strong>{formatNumber(result.result.tj_c, 1)} °C</strong><small>+{formatNumber(result.result.temperature_margin_c, 1)} K reserve</small></div></div>
      <div className="status-metric"><Zap size={20}/><div><span>Total Power Loss</span><strong>{formatNumber(result.result.p_total_w, 2)} W</strong></div></div>
      <div className="status-metric"><TrendingUp size={20}/><div><span>SOA Reserve</span><strong>{formatNumber(margins.soa_reserve_percent, 0)} %</strong><small>engine result</small></div></div>
      <div className="status-metric"><ShieldCheck size={20}/><div><span>Closest constraint</span><strong>{result.result.closest_constraint.type}</strong><small>{formatNumber(result.result.closest_constraint.reserve_percent, 0)} % reserve</small></div></div>
      <button type="button" onClick={() => setDetailsOpen(true)}>Engineering Details<ChevronRight size={15}/></button>
    </div>
    <div className="result-main-grid engineering-visuals">
      <SOAChart curves={soaCurves} input={input} result={result}/>
      <LossBreakdown result={result}/>
      <ThermalPathCompact result={result} input={input}/>
    </div>
    {meta.tone === "incomplete" && <div className="incomplete-notice"><CircleAlert size={17}/><div><b>Technische Unsicherheit wird nicht als Sicherheit dargestellt.</b><span>Für diesen Betriebspunkt wurde keine SAFE-Klassifikation ausgegeben.</span></div></div>}
    <div className="result-actions-row"><button type="button" onClick={onSave}><Save size={15}/>{savedName ? `Speichern · ${savedName}` : "Analyse speichern"}</button>{savedName&&<button type="button" onClick={onSaveAs}><Save size={15}/>Save As</button>}<ExportMenu input={input} result={result} name={savedName}/><button type="button" onClick={() => setDetailsOpen(true)}>Traceability & Details<ChevronRight size={15}/></button></div>
    <EngineeringDetails open={detailsOpen} onClose={() => setDetailsOpen(false)} result={result} input={input} model={model}/>
  </section>;
}
