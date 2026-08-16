import { ArrowUpRight, Database, LoaderCircle } from "lucide-react";
import type { ModelSummary } from "../types";
import { formatNumber } from "./format";

export function ComponentSelector({ models, selectedModel, onSelect, loading }: { models: ModelSummary[]; selectedModel: ModelSummary | null; onSelect: (id: string) => void; loading: boolean }) {
  return <article className="workflow-card component-card">
    <div className="workflow-heading"><span>1</span><h2>Komponente</h2><Database size={16}/></div>
    {loading ? <div className="component-loading"><LoaderCircle className="spin" size={18}/>Modelldaten werden geladen</div> : selectedModel ? <>
      <label className="model-select"><span>Bestellnummer / OPN</span><select value={selectedModel.id} onChange={(event) => onSelect(event.target.value)}>{models.map((model) => <option key={model.id} value={model.id}>{model.id}{model.datasheet_type !== model.id ? " (OPN)" : ""}</option>)}</select></label>
      <div className="component-identity">
        <div className="product-image"><img src={selectedModel.image_path} alt={`${selectedModel.id} ${selectedModel.package_name}`}/></div>
        <div><span className="documented">Dokumentiert · Review ausstehend</span><h3>{selectedModel.id}</h3><p>{selectedModel.manufacturer}</p><b>{selectedModel.package_name}</b>{selectedModel.datasheet_type !== selectedModel.id && <p className="datasheet-type">Datenblatt-Typ: <strong>{selectedModel.datasheet_type}</strong></p>}</div>
      </div>
      <dl className="component-limits"><div><dt>VDS max</dt><dd>{formatNumber(selectedModel.vds_max_v)} V</dd></div><div><dt>ID continuous</dt><dd>{formatNumber(selectedModel.id_continuous_max_a)} A</dd></div><div><dt>RDS(on) · 25 °C</dt><dd>{selectedModel.rds_on_25_ohm === null ? "UNKNOWN" : `${formatNumber(selectedModel.rds_on_25_ohm * 1000, 2)} mΩ`}</dd></div><div><dt>Tj max</dt><dd>{formatNumber(selectedModel.tj_max_c)} °C</dd></div></dl>
      <a className="datasheet-mini" href={selectedModel.datasheet_url} target="_blank" rel="noreferrer">Datenblatt {selectedModel.datasheet_type} · {selectedModel.revision}<ArrowUpRight size={13}/></a>
    </> : <div className="component-empty">Keine realen MOSFET-Modelle verfügbar.</div>}
  </article>;
}
