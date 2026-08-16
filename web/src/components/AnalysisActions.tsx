import { useState } from "react";
import { Activity, Clock3, FileText, LoaderCircle, Play, RadioTower, SlidersHorizontal, X } from "lucide-react";
import type { Mode, RecentAnalysis } from "../types";

export function AnalysisActions({ mode, onModeChange, disabled, loading, hasResult, recentAnalyses, onOpenRecent }: { mode: Mode; onModeChange: (mode: Mode) => void; disabled: boolean; loading: boolean; hasResult: boolean; recentAnalyses: RecentAnalysis[]; onOpenRecent: (analysis: RecentAnalysis) => void }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return <aside className="workflow-card action-card">
    <div className="workflow-heading"><span>3</span><h2>Analyse</h2><button className="history-trigger" type="button" onClick={() => setHistoryOpen((current) => !current)} aria-expanded={historyOpen} aria-label="Analyseverlauf öffnen" title="Zuletzt verwendete Analysen"><Clock3 size={16}/></button></div>
    <div className="analysis-mode"><span>Modus</span><div role="group" aria-label="Betriebsmodus"><button type="button" className={mode === "SWITCHING" ? "active" : ""} onClick={() => onModeChange("SWITCHING")}><RadioTower size={14}/>Switching</button><button type="button" className={mode === "LINEAR" ? "active" : ""} onClick={() => onModeChange("LINEAR")}><Activity size={14}/>Linear</button></div></div>
    <button className="run-analysis" form="operating-point-form" type="submit" disabled={disabled || loading}>{loading ? <LoaderCircle className="spin" size={17}/> : <Play size={17}/>}<span>{loading ? "C-Engine läuft…" : "Analyse starten"}</span></button>
    <button className="secondary-action" type="button" disabled><SlidersHorizontal size={15}/>What-if-Modus</button>
    <button className="secondary-action report-action" type="button" disabled><FileText size={15}/>Bericht nach Analyse erstellen</button>
    <div className="last-analysis"><Clock3 size={15}/><div><span>Aktueller Status</span><b>{hasResult ? "Ergebnis verfügbar" : "Bereit zur Analyse"}</b></div></div>
    {historyOpen && <section className="recent-analysis-panel" aria-label="Zuletzt verwendete Analysen"><header><div><span>Analyseverlauf</span><b>Zuletzt verwendet</b></div><button type="button" onClick={() => setHistoryOpen(false)} aria-label="Verlauf schließen"><X size={15}/></button></header><div>{recentAnalyses.length === 0 ? <p>Noch keine Analyse ausgeführt.</p> : recentAnalyses.map((analysis) => <button className="recent-analysis-item" type="button" key={analysis.id} onClick={() => { onOpenRecent(analysis); setHistoryOpen(false); }}><span><b>{analysis.input.transistor_id}</b><small>{new Date(analysis.timestamp).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</small></span><strong>{analysis.input.vds_v} V · {analysis.input.id_a} A</strong><em>{analysis.result.result.status}</em></button>)}</div></section>}
  </aside>;
}
