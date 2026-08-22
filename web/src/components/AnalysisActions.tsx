import { useCallback, useState } from "react";
import { Activity, FileText, LoaderCircle, Play, RadioTower, SlidersHorizontal } from "lucide-react";
import type { AnalysisInput, AnalysisResponse, Mode } from "../types";
import { WhatIfModal } from "./WhatIfModal";

export function AnalysisActions({ input, mode, onModeChange, disabled, loading, result, onRunWhatIf, onApplyWhatIf, onCreateReport }: { input: AnalysisInput; mode: Mode; onModeChange: (mode: Mode) => void; disabled: boolean; loading: boolean; result: AnalysisResponse | null; onRunWhatIf: (scenario: AnalysisInput) => Promise<AnalysisResponse | null>; onApplyWhatIf: (result: AnalysisResponse) => void; onCreateReport: () => void }) {
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const closeWhatIf = useCallback(() => setWhatIfOpen(false), []);
  function openWhatIf() { setWhatIfOpen(true); }
  return <aside className="workflow-card action-card">
    <div className="workflow-heading"><span>3</span><h2>Analyse</h2></div>
    <div className="analysis-mode"><span>Modus</span><div role="group" aria-label="Betriebsmodus"><button type="button" className={mode === "SWITCHING" ? "active" : ""} onClick={() => onModeChange("SWITCHING")}><RadioTower size={14}/>Switching</button><button type="button" className={mode === "LINEAR" ? "active" : ""} onClick={() => onModeChange("LINEAR")}><Activity size={14}/>Linear</button></div></div>
    <button className={`run-analysis${loading ? " loading" : ""}`} form="operating-point-form" type="submit" disabled={disabled || loading}>{loading ? <LoaderCircle className="spin" size={17}/> : <Play size={17}/>}<span>{loading ? "C-Engine läuft…" : "Analyse starten"}</span></button>
    <button className="secondary-action" type="button" disabled={disabled || loading} onClick={openWhatIf}><SlidersHorizontal size={15}/>What-if-Modus</button>
    <button className="secondary-action report-action" type="button" disabled={!result || loading} onClick={onCreateReport}><FileText size={15}/>Bericht nach Analyse erstellen</button>
    <WhatIfModal open={whatIfOpen} input={input} baselineResult={result} loading={loading} onClose={closeWhatIf} onRun={onRunWhatIf} onApply={onApplyWhatIf}/>
  </aside>;
}
