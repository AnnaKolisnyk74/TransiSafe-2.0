import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, FlaskConical, LoaderCircle, Play, RotateCcw, SlidersHorizontal, Thermometer, TrendingUp, X, Zap } from "lucide-react";
import type { AnalysisInput, AnalysisResponse } from "../types";
import { formatNumber } from "./format";

type ScenarioFields = Pick<AnalysisInput, "vds_v" | "id_a" | "temperature_c">;
type PointFocus = "both" | "baseline" | "scenario";

function signed(value: number, digits = 1) {
  if (Math.abs(value) < 1e-9) return "±0";
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value), digits)}`;
}

function WhatIfPointMap({ baseline, scenario }: { baseline: ScenarioFields; scenario: ScenarioFields }) {
  const [focus, setFocus] = useState<PointFocus>("both");
  const [zoom, setZoom] = useState(1);
  useEffect(() => { setFocus("both"); setZoom(1); }, [baseline.vds_v, baseline.id_a, scenario.vds_v, scenario.id_a]);
  const bx = Math.log10(Math.max(.01, baseline.vds_v)); const by = Math.log10(Math.max(.01, baseline.id_a));
  const sx = Math.log10(Math.max(.01, scenario.vds_v)); const sy = Math.log10(Math.max(.01, scenario.id_a));
  const centerX = focus === "baseline" ? bx : focus === "scenario" ? sx : (bx + sx) / 2;
  const centerY = focus === "baseline" ? by : focus === "scenario" ? sy : (by + sy) / 2;
  const naturalX = Math.max(1.2, Math.abs(sx - bx) + .72); const naturalY = Math.max(1.2, Math.abs(sy - by) + .72);
  const spanX = (focus === "both" ? naturalX : 1.25) / zoom; const spanY = (focus === "both" ? naturalY : 1.25) / zoom;
  const xMin = centerX - spanX / 2; const xMax = centerX + spanX / 2; const yMin = centerY - spanY / 2; const yMax = centerY + spanY / 2;
  const left = 48; const right = 508; const top = 18; const bottom = 165;
  const px = (value: number) => left + (value - xMin) / (xMax - xMin) * (right - left);
  const py = (value: number) => bottom - (value - yMin) / (yMax - yMin) * (bottom - top);
  const ticks = [0,1,2,3,4];
  function select(next: PointFocus) { setFocus(next); setZoom(next === "both" ? 1 : 2.1); }
  function wheel(event: React.WheelEvent<SVGSVGElement>) { event.preventDefault(); setZoom((current) => Math.max(1, Math.min(7, current * (event.deltaY < 0 ? 1.2 : .84)))); }
  return <section className="what-if-point-map"><header><div><span>BETRIEBSPUNKTKARTE</span><b>Baseline und Szenario gezielt untersuchen</b></div><div role="group" aria-label="Betriebspunkt fokussieren"><button type="button" className={focus === "baseline" ? "active baseline" : ""} onClick={() => select("baseline")}>Baseline</button><button type="button" className={focus === "scenario" ? "active scenario" : ""} onClick={() => select("scenario")}>Szenario</button><button type="button" className={focus === "both" ? "active" : ""} onClick={() => select("both")}>Beide zeigen</button></div></header><svg viewBox="0 0 530 190" role="img" aria-label="Logarithmische Betriebspunktkarte mit Baseline und Szenario" onWheel={wheel}>
    <rect className="what-if-map-paper" x={left} y={top} width={right-left} height={bottom-top} rx="4"/>
    {ticks.map((tick) => { const x=left+(right-left)*tick/4; const value=10**(xMin+(xMax-xMin)*tick/4); return <g key={`x-${tick}`}><line className="what-if-map-grid" x1={x} y1={top} x2={x} y2={bottom}/><text x={x} y="180" textAnchor="middle">{formatNumber(value, value < 10 ? 2 : 0)}</text></g>; })}
    {ticks.map((tick) => { const y=bottom-(bottom-top)*tick/4; const value=10**(yMin+(yMax-yMin)*tick/4); return <g key={`y-${tick}`}><line className="what-if-map-grid" x1={left} y1={y} x2={right} y2={y}/><text x="41" y={y+3} textAnchor="end">{formatNumber(value, value < 10 ? 2 : 0)}</text></g>; })}
    <line className="what-if-map-axis" x1={left} y1={bottom} x2={right} y2={bottom}/><line className="what-if-map-axis" x1={left} y1={bottom} x2={left} y2={top}/><line className="what-if-map-change" x1={px(bx)} y1={py(by)} x2={px(sx)} y2={py(sy)}/>
    <g className="what-if-map-point baseline" role="button" tabIndex={0} onClick={() => select("baseline")}><circle cx={px(bx)} cy={py(by)} r="10"/><circle cx={px(bx)} cy={py(by)} r="4"/><text x={px(bx)+13} y={py(by)-8}>Baseline</text></g><g className="what-if-map-point scenario" role="button" tabIndex={0} onClick={() => select("scenario")}><circle cx={px(sx)} cy={py(sy)} r="10"/><circle cx={px(sx)} cy={py(sy)} r="4"/><text x={px(sx)+13} y={py(sy)+16}>Szenario</text></g>
    <text className="what-if-map-x-title" x={right} y="188" textAnchor="end">VDS [V]</text><text className="what-if-map-y-title" x="12" y={top} transform={`rotate(-90 12 ${top})`} textAnchor="end">ID [A]</text>
  </svg><footer><span>Klick auf einen Punkt = fokussieren</span><span>Mausrad = Zoom</span><b>{formatNumber(zoom,1)}×</b></footer></section>;
}


export function WhatIfModal({ open, input, baselineResult, loading, onClose, onRun, onApply }: {
  open: boolean;
  input: AnalysisInput;
  baselineResult: AnalysisResponse | null;
  loading: boolean;
  onClose: () => void;
  onRun: (scenario: AnalysisInput) => Promise<AnalysisResponse | null>;
  onApply: (result: AnalysisResponse) => void;
}) {
  const [scenario, setScenario] = useState<ScenarioFields>({ vds_v: input.vds_v, id_a: input.id_a, temperature_c: input.temperature_c });
  const [scenarioResult, setScenarioResult] = useState<AnalysisResponse | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setScenario({ vds_v: input.vds_v, id_a: input.id_a, temperature_c: input.temperature_c });
    setScenarioResult(null); setModalError(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function escape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", escape); };
  }, [open, input, onClose]);

  const baselineStress = input.vds_v * input.id_a;
  const scenarioStress = scenario.vds_v * scenario.id_a;
  const stressDelta = baselineStress === 0 ? 0 : (scenarioStress / baselineStress - 1) * 100;
  const changed = scenario.vds_v !== input.vds_v || scenario.id_a !== input.id_a || scenario.temperature_c !== input.temperature_c;
  const resultTone = scenarioResult?.result.status === "SAFE" ? "safe" : scenarioResult?.result.status === "CRITICAL" ? "critical" : scenarioResult ? "unsafe" : "";
  const rationale = useMemo(() => {
    const reasons: string[] = [];
    if (scenario.vds_v !== input.vds_v) reasons.push("VDS verschiebt den Betriebspunkt horizontal innerhalb der SOA-Grenzen.");
    if (scenario.id_a !== input.id_a) reasons.push("ID verändert Strombelastung und Leitverluste besonders stark.");
    if (scenario.temperature_c !== input.temperature_c) reasons.push("Die Referenztemperatur verändert direkt die verbleibende thermische Reserve.");
    return reasons.length ? reasons : ["Ändere mindestens einen Wert, um seine Wirkung gegenüber der aktuellen Baseline sichtbar zu machen."];
  }, [input, scenario]);

  if (!open) return null;

  async function runScenario() {
    setScenarioResult(null); setModalError(null);
    const next = await onRun({ ...input, ...scenario });
    if (next) setScenarioResult(next); else setModalError("Das Szenario konnte nicht berechnet werden. API-Status und Eingabewerte prüfen.");
  }

  return createPortal(<div className="what-if-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
    <section className="what-if-dialog" role="dialog" aria-modal="true" aria-labelledby="what-if-title">
      <header><div className="what-if-title-icon"><SlidersHorizontal size={20}/></div><div><span>WHAT-IF SCENARIO</span><h2 id="what-if-title">Auswirkung eines veränderten Betriebspunkts</h2><p>{input.transistor_id} · {input.mode === "SWITCHING" ? "Switching" : "Linear"} · {input.temperature_reference === "CASE" ? "Case reference" : "Ambient reference"}</p></div><button type="button" onClick={onClose} disabled={loading} aria-label="What-if schließen"><X size={19}/></button></header>

      <div className={`what-if-engine-flow ${loading ? "running" : scenarioResult ? "complete" : ""}`} aria-label="Berechnungsablauf">
        <div><i>1</i><span><b>Baseline</b><small>Aktueller Betriebspunkt</small></span></div><ArrowRight size={18}/><div className="engine-node"><i><FlaskConical size={15}/></i><span><b>Native C11 Engine</b><small>Identisches Modell und Grenzen</small></span></div><ArrowRight size={18}/><div><i>{scenarioResult ? <Check size={14}/> : "3"}</i><span><b>Szenario</b><small>{scenarioResult ? "Berechnet" : "Neue Eingaben"}</small></span></div><em aria-hidden="true"/>
      </div>

      <div className="what-if-comparison">
        <article className="what-if-baseline-card"><span>AKTUELLE BASELINE</span><strong>{formatNumber(input.vds_v)} V · {formatNumber(input.id_a)} A · {formatNumber(input.temperature_c)} °C</strong><small>VDS × ID Belastungsindikator</small><b>{formatNumber(baselineStress, 1)} VA</b></article>
        <div className="what-if-fields">
          <label><span>VDS</span><div><input type="number" min="0" step="any" value={scenario.vds_v} onChange={(event) => { setScenarioResult(null); setScenario((current) => ({ ...current, vds_v: Number(event.target.value) })); }}/><b>V</b></div><small>{signed(scenario.vds_v - input.vds_v)} V</small></label>
          <label><span>ID</span><div><input type="number" min="0" step="any" value={scenario.id_a} onChange={(event) => { setScenarioResult(null); setScenario((current) => ({ ...current, id_a: Number(event.target.value) })); }}/><b>A</b></div><small>{signed(scenario.id_a - input.id_a)} A</small></label>
          <label><span>{input.temperature_reference === "CASE" ? "Tc" : "Ta"}</span><div><input type="number" step="any" value={scenario.temperature_c} onChange={(event) => { setScenarioResult(null); setScenario((current) => ({ ...current, temperature_c: Number(event.target.value) })); }}/><b>°C</b></div><small>{signed(scenario.temperature_c - input.temperature_c)} K</small></label>
          <div className="what-if-stress"><span>VDS × ID</span><strong>{formatNumber(scenarioStress, 1)} VA</strong><small className={stressDelta > 0 ? "higher" : stressDelta < 0 ? "lower" : ""}>{signed(stressDelta, 0)} %</small></div>
        </div>
      </div>

      <WhatIfPointMap baseline={{ vds_v: input.vds_v, id_a: input.id_a, temperature_c: input.temperature_c }} scenario={scenario}/>

      <div className="what-if-rationale"><div><TrendingUp size={18}/><span><b>Warum dieses Szenario relevant ist</b><small>Die Engine berechnet keine Hochrechnung, sondern bewertet den neuen Punkt vollständig neu.</small></span></div><ul>{rationale.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>

      {loading && <div className="what-if-calculating"><span><i/><i/><i/></span><div><b>C11-Engine bewertet den Szenariopunkt</b><small>SOA → Verluste → thermischer Pfad → Reserven → engste Grenze</small></div></div>}
      {modalError && <p className="what-if-error">{modalError}</p>}
      {scenarioResult && <div className={`what-if-result ${resultTone}`} aria-live="polite"><header><div><span>SCENARIO RESULT</span><b>{scenarioResult.result.status}</b></div><strong>{scenarioResult.result.closest_constraint.type}<small>engste Grenze · {formatNumber(scenarioResult.result.closest_constraint.reserve_percent, 1)} % Reserve</small></strong></header><div>
        <article><Thermometer size={17}/><span>Tj</span><b>{formatNumber(scenarioResult.result.tj_c, 1)} °C</b><small>{baselineResult ? `${signed(scenarioResult.result.tj_c - baselineResult.result.tj_c)} K` : "Szenario"}</small></article>
        <article><Zap size={17}/><span>Total loss</span><b>{formatNumber(scenarioResult.result.p_total_w, 3)} W</b><small>{baselineResult ? `${signed(scenarioResult.result.p_total_w - baselineResult.result.p_total_w, 3)} W` : "C-Engine"}</small></article>
        <article><TrendingUp size={17}/><span>SOA reserve</span><b>{formatNumber(scenarioResult.result.margins.soa_reserve_percent, 1)} %</b><small>{baselineResult ? `${signed(scenarioResult.result.margins.soa_reserve_percent - baselineResult.result.margins.soa_reserve_percent)} pp` : "Szenario"}</small></article>
        <article><FlaskConical size={17}/><span>Thermal reserve</span><b>{formatNumber(scenarioResult.result.margins.thermal_reserve_percent, 1)} %</b><small>{baselineResult ? `${signed(scenarioResult.result.margins.thermal_reserve_percent - baselineResult.result.margins.thermal_reserve_percent)} pp` : "Szenario"}</small></article>
      </div></div>}

      <footer><button className="what-if-reset" type="button" disabled={loading} onClick={() => { setScenario({ vds_v: input.vds_v, id_a: input.id_a, temperature_c: input.temperature_c }); setScenarioResult(null); setModalError(null); }}><RotateCcw size={15}/>Zurücksetzen</button><button className="what-if-run" type="button" disabled={loading || !changed || scenario.vds_v < 0 || scenario.id_a < 0} onClick={() => void runScenario()}>{loading ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>}Szenario berechnen</button>{scenarioResult && <button className="what-if-apply" type="button" onClick={() => { onApply(scenarioResult); onClose(); }}><Check size={16}/>Szenario übernehmen</button>}</footer>
    </section>
  </div>, document.body);
}
