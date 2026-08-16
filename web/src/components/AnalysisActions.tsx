import { Activity, Clock3, FileText, LoaderCircle, Play, RadioTower, SlidersHorizontal } from "lucide-react";
import type { Mode } from "../types";

export function AnalysisActions({ mode, onModeChange, disabled, loading, hasResult }: { mode: Mode; onModeChange: (mode: Mode) => void; disabled: boolean; loading: boolean; hasResult: boolean }) {
  return <aside className="workflow-card action-card">
    <div className="workflow-heading"><span>3</span><h2>Analyse</h2><Clock3 size={16}/></div>
    <div className="analysis-mode"><span>Modus</span><div role="group" aria-label="Betriebsmodus"><button type="button" className={mode === "SWITCHING" ? "active" : ""} onClick={() => onModeChange("SWITCHING")}><RadioTower size={14}/>Switching</button><button type="button" className={mode === "LINEAR" ? "active" : ""} onClick={() => onModeChange("LINEAR")}><Activity size={14}/>Linear</button></div></div>
    <button className="run-analysis" form="operating-point-form" type="submit" disabled={disabled || loading}>{loading ? <LoaderCircle className="spin" size={17}/> : <Play size={17}/>}<span>{loading ? "C-Engine läuft…" : "Analyse starten"}</span></button>
    <button className="secondary-action" type="button" disabled><SlidersHorizontal size={15}/>What-if-Modus</button>
    <button className="secondary-action report-action" type="button" disabled><FileText size={15}/>Bericht nach Analyse erstellen</button>
    <div className="last-analysis"><Clock3 size={15}/><div><span>Aktueller Status</span><b>{hasResult ? "Ergebnis verfügbar" : "Bereit zur Analyse"}</b></div></div>
  </aside>;
}
