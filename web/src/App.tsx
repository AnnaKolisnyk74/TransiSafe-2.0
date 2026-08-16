import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { Navigation } from "./components/Navigation";
import { ComponentSelector } from "./components/ComponentSelector";
import { OperatingPointForm } from "./components/OperatingPointForm";
import { AnalysisResult } from "./components/AnalysisResult";
import { AnalysisActions } from "./components/AnalysisActions";
import { ThermalSettings } from "./components/ThermalSettings";
import { BatchWorkspace } from "./components/BatchWorkspace";
import { SavedAnalyses } from "./components/SavedAnalyses";
import type { AnalysisInput, AnalysisResponse, EngineState, ModelSummary, Mode, RecentAnalysis, SavedAnalysis, SoaCurve, SoaCurveResponse, WorkspacePage } from "./types";

const API = import.meta.env.VITE_API_URL ?? "";
const RECENT_ANALYSES_KEY = "transisafe-recent-analyses";
const initialInput: AnalysisInput = {
  transistor_id: "CSD19536KTT", vds_v: 48, id_a: 40, mode: "SWITCHING",
  pulse_duration_s: 0.00001, frequency_hz: 100000, duty_cycle: 0.5,
  temperature_reference: "CASE", temperature_c: 25, rth_cs_k_per_w: 0,
  rth_sa_k_per_w: 0, safety_factor: 1.2, e_on_j: 0.00002,
  e_off_j: 0.000015, gate_drive_voltage_v: 10,
};

function isAnalysisResponse(payload: unknown): payload is AnalysisResponse {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<AnalysisResponse>;
  return candidate.ok === true
    && Boolean(candidate.input)
    && Boolean(candidate.optimization)
    && Boolean(candidate.source)
    && Boolean(candidate.result?.margins)
    && Boolean(candidate.result?.closest_constraint)
    && Boolean(candidate.result?.checks);
}

export default function App() {
  const [input, setInput] = useState<AnalysisInput>(initialInput);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [soaCurves, setSoaCurves] = useState<SoaCurve[]>([]);
  const [engineState, setEngineState] = useState<EngineState>("checking");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [page, setPage] = useState<WorkspacePage>("analyze");
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [currentSaved, setCurrentSaved] = useState<{id:string;name:string}|null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_ANALYSES_KEY) ?? "[]");
      return Array.isArray(stored) ? stored.slice(0, 5) : [];
    } catch { return []; }
  });

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/models`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Model database unavailable"))),
      fetch(`${API}/api/health`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Health endpoint unavailable"))),
    ]).then(([catalog, health]) => {
      const available = (catalog.models as ModelSummary[]).filter((model) => !model.development_fixture);
      setModels(available);
      if (available.length && !available.some((model) => model.id === input.transistor_id)) setInput((current) => ({ ...current, transistor_id: available[0].id }));
      setEngineState(health.engine_available ? "ready" : "offline");
    }).catch(() => setEngineState("offline"));
  }, []);

  useEffect(() => {
    if (!input.transistor_id) return;
    setSoaCurves([]);
    fetch(`${API}/api/models/${encodeURIComponent(input.transistor_id)}/soa-curves`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("SOA curves unavailable")))
      .then((payload: SoaCurveResponse) => setSoaCurves(payload.curves))
      .catch(() => setSoaCurves([]));
  }, [input.transistor_id]);

  const selectedModel = useMemo(() => models.find((model) => model.id === input.transistor_id) ?? null, [models, input.transistor_id]);
  function update<K extends keyof AnalysisInput>(key: K, value: AnalysisInput[K]) { setInput((current) => ({ ...current, [key]: value })); setResult(null); setError(null); }

  function rememberAnalysis(nextInput: AnalysisInput, nextResult: AnalysisResponse) {
    const inputKey = JSON.stringify(nextInput);
    const entry: RecentAnalysis = { id: crypto.randomUUID?.() ?? `recent-${Date.now()}`, timestamp: new Date().toISOString(), input: nextInput, result: nextResult };
    setRecentAnalyses((current) => {
      const next = [entry, ...current.filter((item) => JSON.stringify(item.input) !== inputKey)].slice(0, 5);
      localStorage.setItem(RECENT_ANALYSES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function selectMode(mode: Mode) {
    setInput((current) => ({
      ...current, mode,
      frequency_hz: mode === "LINEAR" ? 0 : Math.max(current.frequency_hz, 100000),
      e_on_j: mode === "LINEAR" ? 0 : Math.max(current.e_on_j, 0.00002),
      e_off_j: mode === "LINEAR" ? 0 : Math.max(current.e_off_j, 0.000015),
      gate_drive_voltage_v: mode === "LINEAR" ? 0 : Math.max(current.gate_drive_voltage_v, 10),
    }));
    setResult(null); setError(null);
  }

  async function runAnalysis(analysisInput: AnalysisInput = input) {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${API}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(analysisInput) });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "detail" in payload ? String(payload.detail) : "Analyse fehlgeschlagen";
        throw new Error(detail);
      }
      if (!isAnalysisResponse(payload)) throw new Error("API und C-Engine haben unterschiedliche Versionen. Bitte die API neu bauen und starten.");
      setInput(payload.input); setResult(payload); rememberAnalysis(payload.input, payload); setCurrentSaved(null); setEngineState("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Analyse-API ist nicht erreichbar."); setEngineState("offline");
    } finally { setLoading(false); }
  }

  async function saveCurrentAnalysis(saveAs = false) {
    if (!result) return;
    const suggested = `${input.transistor_id} – ${input.vds_v} V / ${input.id_a} A`;
    const name = !saveAs && currentSaved ? currentSaved.name : window.prompt(saveAs ? "Name für Save As" : "Name der Analyse", currentSaved?.name ?? suggested)?.trim(); if (!name) return;
    const updateExisting = Boolean(currentSaved && !saveAs); const url=updateExisting?`${API}/api/analyses/${currentSaved!.id}`:`${API}/api/analyses`;
    const response = await fetch(url, { method: updateExisting ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input, result, parent_id: saveAs ? currentSaved?.id ?? null : null }) });
    if (!response.ok) { setError("Analyse konnte nicht gespeichert werden."); return; }
    const saved=await response.json();setCurrentSaved({id:saved.id,name:saved.name});
    setSavedRefresh((current) => current + 1);
  }

  function openSaved(analysis: SavedAnalysis) { setInput(analysis.input); setResult(analysis.result); rememberAnalysis(analysis.input, analysis.result); setCurrentSaved({id:analysis.id,name:analysis.name}); setError(null); setPage("analyze"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openBatchResult(nextInput: AnalysisInput, nextResult: AnalysisResponse) { setInput(nextInput); setResult(nextResult); rememberAnalysis(nextInput, nextResult); setCurrentSaved(null); setError(null); setPage("analyze"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openRecent(analysis: RecentAnalysis) { setInput(analysis.input); setResult(analysis.result); setCurrentSaved(null); setError(null); setPage("analyze"); window.scrollTo({ top: 0, behavior: "smooth" }); }

  return <div className={`engineering-shell ${navigationCollapsed ? "nav-collapsed" : ""}`}>
    <Navigation collapsed={navigationCollapsed} onToggle={() => setNavigationCollapsed((current) => !current)} page={page} onNavigate={setPage}/>
    <div className="application-frame">
      <AppHeader engineState={engineState} apiDocsUrl={API ? `${API}/docs` : "http://localhost:8000/docs"} model={selectedModel}/>
      {page === "analyze" && <main className="analyze-workspace" id="top">
        <div className="workspace-context"><span>ANALYZE</span><p>Component → Operating point → Analysis → Limits → Margins → Source</p><b>Native C11 calculation core</b></div>
        <section className="workflow-grid" aria-label="Analysekonfiguration">
          <ComponentSelector models={models} selectedModel={selectedModel} onSelect={(transistorId) => { update("transistor_id", transistorId); setResult(null); }} loading={engineState === "checking"}/>
          <OperatingPointForm input={input} update={update} error={error} onSubmit={runAnalysis}/>
          <AnalysisActions input={input} mode={input.mode} onModeChange={selectMode} disabled={!selectedModel || engineState !== "ready"} loading={loading} hasResult={Boolean(result)} recentAnalyses={recentAnalyses} onOpenRecent={openRecent} onRunWhatIf={runAnalysis}/>
          <ThermalSettings input={input} model={selectedModel} update={update}/>
        </section>
        <AnalysisResult result={result} input={input} model={selectedModel} soaCurves={soaCurves} savedName={currentSaved?.name} onSave={() => void saveCurrentAnalysis()} onSaveAs={() => void saveCurrentAnalysis(true)}/>
      </main>}
      {page === "batch" && <BatchWorkspace onOpen={openBatchResult}/>}
      {page === "reports" && <SavedAnalyses refreshToken={savedRefresh} onOpen={openSaved}/>}
      <footer className="app-footer"><span>TransiSafe 2.1.0 · Engineering Decision Support</span><span>Not certification software · Validate against datasheet and laboratory measurements</span></footer>
    </div>
  </div>;
}
