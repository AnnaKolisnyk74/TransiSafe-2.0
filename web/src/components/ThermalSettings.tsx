import { Thermometer } from "lucide-react";
import type { AnalysisInput, ModelSummary } from "../types";
import { NumberField, StaticField } from "./OperatingPointForm";

export function ThermalSettings({ input, model, update }: { input: AnalysisInput; model: ModelSummary | null; update: <K extends keyof AnalysisInput>(key: K, value: AnalysisInput[K]) => void }) {
  return <aside className="workflow-card thermal-settings">
    <div className="workflow-heading"><span>4</span><h2>Thermal</h2><Thermometer size={16}/></div>
    <div className="reference-control"><button type="button" className={input.temperature_reference === "CASE" ? "active" : ""} onClick={() => update("temperature_reference", "CASE")}>Case</button><button type="button" className={input.temperature_reference === "AMBIENT" ? "active" : ""} onClick={() => update("temperature_reference", "AMBIENT")}>Ambient</button></div>
    <div className="thermal-settings-fields">
      <NumberField label={input.temperature_reference === "CASE" ? "Case temperature" : "Ambient temperature"} value={input.temperature_c} unit="°C" onChange={(value) => update("temperature_c", value)}/>
      <StaticField label="Tj max" value={model?.tj_max_c ?? "—"} unit="°C"/>
      <StaticField label="RθJC" value={model?.rth_jc_k_per_w ?? "—"} unit="°C/W"/>
      <NumberField label="Sicherheitsfaktor" value={input.safety_factor} unit="×" min={1} step="0.1" onChange={(value) => update("safety_factor", value)}/>
      {input.temperature_reference === "AMBIENT" && <><NumberField label="RθCS" value={input.rth_cs_k_per_w} unit="K/W" min={0} onChange={(value) => update("rth_cs_k_per_w", value)}/><NumberField label="RθSA" value={input.rth_sa_k_per_w} unit="K/W" min={0} onChange={(value) => update("rth_sa_k_per_w", value)}/></>}
    </div>
  </aside>;
}
