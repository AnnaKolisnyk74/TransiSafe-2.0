import { lazy, Suspense, useRef } from "react";
import { ArrowUpRight, Database, LoaderCircle, Maximize2 } from "lucide-react";
import type { ModelSummary } from "../types";
import { formatNumber } from "./format";

const Package3DViewer = lazy(() => import("./package3d/Package3DViewer").then((module) => ({ default: module.Package3DViewer })));

export function ComponentSelector({ models, selectedModel, onSelect, loading }: { models: ModelSummary[]; selectedModel: ModelSummary | null; onSelect: (id: string) => void; loading: boolean }) {
  const cardRef = useRef<HTMLElement>(null);
  async function expandViewer() { const viewer = cardRef.current?.querySelector<HTMLElement>(".component-package-inspector"); if (viewer?.requestFullscreen) await viewer.requestFullscreen(); }
  return <article ref={cardRef} className="workflow-card component-card">
    <div className="workflow-heading"><span>1</span><h2>Komponente</h2><Database size={16}/></div>
    {loading ? <div className="component-loading"><LoaderCircle className="spin" size={18}/>Modelldaten werden geladen</div> : selectedModel ? <>
      <label className="model-select"><span>Bestellnummer / OPN</span><select value={selectedModel.id} onChange={(event) => onSelect(event.target.value)}>{models.map((model) => <option key={model.id} value={model.id}>{model.id}{model.datasheet_type !== model.id ? " (OPN)" : ""}</option>)}</select></label>
      <div className="component-inspector-layout">
        <Suspense fallback={<div className="package-viewer-loading">3D package loading…</div>}><Package3DViewer packageName={selectedModel.package_name} transistorId={selectedModel.id} variant="component"/></Suspense>
        <div className="component-specification"><div className="component-identity"><div><span className="documented">Dokumentiert · Review ausstehend</span><h3>{selectedModel.id}</h3><p>{selectedModel.manufacturer}</p><b>{selectedModel.package_name}</b>{selectedModel.datasheet_type !== selectedModel.id && <p className="datasheet-type">Datenblatt-Typ: <strong>{selectedModel.datasheet_type}</strong></p>}</div></div>
        <dl className="component-limits"><div><dt>VDS max</dt><dd>{formatNumber(selectedModel.vds_max_v)} V</dd></div><div><dt>ID continuous</dt><dd>{formatNumber(selectedModel.id_continuous_max_a)} A</dd></div><div><dt>RDS(on) · 25 °C</dt><dd>{selectedModel.rds_on_25_ohm === null ? "UNKNOWN" : `${formatNumber(selectedModel.rds_on_25_ohm * 1000, 2)} mΩ`}</dd></div><div><dt>Tj max</dt><dd>{formatNumber(selectedModel.tj_max_c)} °C</dd></div></dl></div>
      </div>
      <div className="component-inspector-actions"><a href={selectedModel.datasheet_url} target="_blank" rel="noreferrer">Datenblatt<ArrowUpRight size={12}/></a><button type="button" onClick={() => void expandViewer()}><Maximize2 size={12}/>3D in neuem Fenster</button></div>
    </> : <div className="component-empty">Keine realen MOSFET-Modelle verfügbar.</div>}
  </article>;
}
