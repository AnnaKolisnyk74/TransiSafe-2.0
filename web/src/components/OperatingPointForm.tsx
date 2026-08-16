import { useEffect, useState, type FormEvent } from "react";
import { CircleAlert, Gauge, Zap } from "lucide-react";
import type { AnalysisInput } from "../types";

export function NumberField({ label, value, unit, onChange, min, max, step = "any", help }: { label: string; value: number; unit: string; onChange: (value: number) => void; min?: number; max?: number; step?: string; help?: string }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);

  function parsedDraft(text: string) {
    const normalized = text.trim().replace(",", ".");
    if (!normalized || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function commit() {
    setEditing(false);
    const parsed = parsedDraft(draft);
    if (parsed === null) { setDraft(String(value)); return; }
    const bounded = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed));
    setDraft(String(bounded));
    onChange(bounded);
  }

  return <label className="number-field"><span>{label}{help && <i title={help}>i</i>}</span><div><input
    type="text"
    inputMode="decimal"
    value={draft}
    data-step={step}
    onFocus={(event) => { setEditing(true); event.currentTarget.select(); }}
    onChange={(event) => { const next = event.target.value; setDraft(next); const parsed = parsedDraft(next); if (parsed !== null && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)) onChange(parsed); }}
    onBlur={commit}
    aria-label={`${label} in ${unit}`}
  /><b>{unit}</b></div></label>;
}

export function StaticField({ label, value, unit }: { label: string; value: number | string; unit: string }) {
  return <div className="number-field static-field"><span>{label}</span><div><strong>{value}</strong><b>{unit}</b></div></div>;
}

export function OperatingPointForm({ input, update, error, onSubmit }: { input: AnalysisInput; update: <K extends keyof AnalysisInput>(key: K, value: AnalysisInput[K]) => void; error: string | null; onSubmit: () => Promise<void> }) {
  async function submit(event: FormEvent) { event.preventDefault(); await onSubmit(); }
  return <form id="operating-point-form" className="workflow-card operating-card" onSubmit={submit}>
    <div className="workflow-heading"><span>2</span><h2>Betriebspunkt</h2><Gauge size={16}/></div>
    <section className="operating-primary"><h3><Zap size={15}/>Elektrischer Betriebspunkt</h3><div className="operating-input-grid">
        <NumberField label="VDS" value={input.vds_v} unit="V" min={0} onChange={(value) => update("vds_v", value)}/>
        <NumberField label="Pulsdauer" value={input.pulse_duration_s * 1_000_000} unit="µs" min={0.001} onChange={(value) => update("pulse_duration_s", value / 1_000_000)} help="Pulsdauer für SOA- und Transient-Thermal-Daten."/>
        <NumberField label="ID" value={input.id_a} unit="A" min={0} onChange={(value) => update("id_a", value)}/>
        <NumberField label="Duty Cycle" value={input.duty_cycle * 100} unit="%" min={0.0001} max={100} onChange={(value) => update("duty_cycle", value / 100)}/>
        {input.mode === "SWITCHING" && <><NumberField label="VGS" value={input.gate_drive_voltage_v} unit="V" min={0} onChange={(value) => update("gate_drive_voltage_v", value)}/><NumberField label="Frequency" value={input.frequency_hz / 1000} unit="kHz" min={0} onChange={(value) => update("frequency_hz", value * 1000)}/></>}
        {input.mode === "SWITCHING" && <><NumberField label="Eon" value={input.e_on_j * 1_000_000} unit="µJ" min={0} onChange={(value) => update("e_on_j", value / 1_000_000)}/><NumberField label="Eoff" value={input.e_off_j * 1_000_000} unit="µJ" min={0} onChange={(value) => update("e_off_j", value / 1_000_000)}/></>}
      </div></section>
    {error && <div className="analysis-error"><CircleAlert size={15}/><span>{error}</span></div>}
  </form>;
}
