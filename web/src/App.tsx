import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  Check,
  ChevronRight,
  CircleAlert,
  Cpu,
  Database,
  Gauge,
  LoaderCircle,
  ShieldCheck,
  Thermometer,
  X,
  Zap,
} from "lucide-react";
import type { AnalysisInput, AnalysisResponse, ModelSummary, Mode } from "./types";

const API = import.meta.env.VITE_API_URL ?? "";
const API_DOCS = API ? `${API}/docs` : "http://localhost:8000/docs";

const fallbackModels: ModelSummary[] = [
  {
    id: "PSMN1R4-100ASE",
    type: "MOSFET",
    vds_max_v: 100,
    id_continuous_max_a: 340,
    id_pulse_max_a: 2186,
    tj_max_c: 175,
    datasheet_url: "https://assets.nexperia.com/documents/data-sheet/PSMN1R4-100ASE.pdf",
    revision: "20-OCT-2025",
    retrieved_date: "2026-08-15",
    development_fixture: false,
  },
  {
    id: "CSD19536KTT",
    type: "MOSFET",
    vds_max_v: 100,
    id_continuous_max_a: 200,
    id_pulse_max_a: 400,
    tj_max_c: 175,
    datasheet_url: "https://www.ti.com/lit/ds/symlink/csd19536ktt.pdf",
    revision: "SLPS540C-MAY-2025",
    retrieved_date: "2026-08-15",
    development_fixture: false,
  },
];

const initialInput: AnalysisInput = {
  transistor_id: "CSD19536KTT",
  vds_v: 48,
  id_a: 40,
  mode: "SWITCHING",
  pulse_duration_s: 0.00001,
  frequency_hz: 100000,
  duty_cycle: 0.5,
  temperature_reference: "CASE",
  temperature_c: 25,
  rth_cs_k_per_w: 0,
  rth_sa_k_per_w: 0,
  safety_factor: 1.2,
  e_on_j: 0.00002,
  e_off_j: 0.000015,
  gate_drive_voltage_v: 10,
};

const statusCopy: Record<string, { label: string; detail: string }> = {
  SAFE: { label: "Zulässig", detail: "Alle hinterlegten Grenzen werden eingehalten." },
  CRITICAL: { label: "Kritisch", detail: "Zulässig, aber mit geringer technischer Reserve." },
  NOT_SAFE_VOLTAGE: { label: "Nicht zulässig", detail: "Die maximale Drain-Source-Spannung wird überschritten." },
  NOT_SAFE_CURRENT: { label: "Nicht zulässig", detail: "Die Dauer- oder Pulsstrombedingung wird verletzt." },
  NOT_SAFE_SOA: { label: "Nicht zulässig", detail: "Der Betriebspunkt liegt außerhalb der gespeicherten SOA." },
  NOT_SAFE_TEMPERATURE: { label: "Nicht zulässig", detail: "Die berechnete Sperrschichttemperatur ist zu hoch." },
  NOT_SAFE_BOTH: { label: "Nicht zulässig", detail: "Leistungs- und Temperaturgrenze werden verletzt." },
  INSUFFICIENT_DATA: { label: "Daten fehlen", detail: "Für diese Bedingungen liegt keine belastbare Kurve vor." },
};

function Field({
  label,
  value,
  onChange,
  unit,
  step = "any",
  min,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: string;
  min?: number;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-shell">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className={`metric ${accent ? "metric-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}{unit && <small> {unit}</small>}</strong>
    </div>
  );
}

function format(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01) return value.toExponential(2);
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(value);
}

export default function App() {
  const [input, setInput] = useState<AnalysisInput>(initialInput);
  const [models, setModels] = useState<ModelSummary[]>(fallbackModels);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/models`).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch(`${API}/api/health`).then((response) => response.ok ? response.json() : Promise.reject()),
    ])
      .then(([catalog, health]) => {
        const realModels = catalog.models.filter((model: ModelSummary) => !model.development_fixture);
        if (realModels.length) setModels(realModels);
        setEngineOnline(Boolean(health.engine_available));
      })
      .catch(() => setEngineOnline(false));
  }, []);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === input.transistor_id) ?? models[0],
    [models, input.transistor_id],
  );

  function update<K extends keyof AnalysisInput>(key: K, value: AnalysisInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function setMode(mode: Mode) {
    setInput((current) => ({
      ...current,
      mode,
      transistor_id: mode === "LINEAR" ? "PSMN1R4-100ASE" : "CSD19536KTT",
      frequency_hz: mode === "LINEAR" ? 0 : 100000,
      e_on_j: mode === "LINEAR" ? 0 : 0.00002,
      e_off_j: mode === "LINEAR" ? 0 : 0.000015,
      gate_drive_voltage_v: mode === "LINEAR" ? 0 : 10,
    }));
    setResult(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Analyse fehlgeschlagen");
      setResult(payload);
      setEngineOnline(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Analyse-API ist nicht erreichbar.");
      setEngineOnline(false);
    } finally {
      setLoading(false);
    }
  }

  const status = result ? statusCopy[result.result.status] ?? statusCopy.INSUFFICIENT_DATA : null;
  const statusClass = result?.result.status === "SAFE" ? "safe" : result?.result.status === "CRITICAL" ? "critical" : "unsafe";
  const utilization = result ? Math.min(result.result.electrical_utilization * 100, 120) : 0;
  const temperaturePercent = result ? Math.min((result.result.tj_c / result.source.tj_max_c) * 100, 120) : 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TransiSafe Startseite">
          <span className="brand-mark"><ShieldCheck size={21} /></span>
          <span>TransiSafe</span>
          <b>LAB</b>
        </a>
        <div className={`engine-state ${engineOnline ? "online" : ""}`}>
          <span />
          {engineOnline === null ? "Verbindung wird geprüft" : engineOnline ? "C-Engine bereit" : "API noch nicht gestartet"}
        </div>
        <a className="docs-link" href={API_DOCS} target="_blank" rel="noreferrer">
          API-Dokumentation <ArrowUpRight size={15} />
        </a>
      </header>

      <main id="top">
        <section className="intro">
          <div>
            <p className="eyebrow"><Activity size={15} /> MOSFET OPERATING POINT ANALYSIS</p>
            <h1>Belastbarkeit sichtbar machen,<br /><em>bevor Hardware entscheidet.</em></h1>
            <p className="intro-copy">
              Datenblattbasierte Prüfung von Spannung, Strom, SOA und thermischem Pfad –
              nachvollziehbar bis zur Quellenrevision.
            </p>
          </div>
          <div className="scope-note">
            <span>PHASE 2 · WEB INTERFACE</span>
            <strong>Engineering decision support</strong>
            <p>Keine Bauteilqualifikation oder Zertifizierung. Digitalisierte Kurven bleiben prüfpflichtige Entwicklungsdaten.</p>
          </div>
        </section>

        <div className="workspace">
          <form className="panel input-panel" onSubmit={submit}>
            <div className="panel-heading">
              <div><span>01</span><div><h2>Betriebspunkt</h2><p>Lastfall und thermische Randbedingungen</p></div></div>
              <Cpu size={22} />
            </div>

            <div className="mode-switch" role="group" aria-label="Betriebsmodus">
              {(["SWITCHING", "LINEAR"] as Mode[]).map((mode) => (
                <button type="button" className={input.mode === mode ? "active" : ""} onClick={() => setMode(mode)} key={mode}>
                  {mode === "SWITCHING" ? "Schaltend" : "Linear"}
                </button>
              ))}
            </div>

            <label className="field field-wide">
              <span className="field-label">MOSFET-Modell</span>
              <span className="select-shell">
                <Database size={17} />
                <select value={input.transistor_id} onChange={(event) => update("transistor_id", event.target.value)}>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
                </select>
                <ChevronRight size={16} />
              </span>
              {selectedModel && <small>{selectedModel.vds_max_v} V · {selectedModel.id_continuous_max_a} A kontinuierlich · Tj max {selectedModel.tj_max_c} °C</small>}
            </label>

            <div className="section-label"><Zap size={15} /> Elektrischer Stress</div>
            <div className="field-grid">
              <Field label="VDS" value={input.vds_v} unit="V" min={0} onChange={(value) => update("vds_v", value)} />
              <Field label="ID" value={input.id_a} unit="A" min={0} onChange={(value) => update("id_a", value)} />
              <Field label="Pulsdauer" value={input.pulse_duration_s} unit="s" min={0} onChange={(value) => update("pulse_duration_s", value)} />
              <Field label="Tastverhältnis" value={input.duty_cycle} unit="0…1" step="0.01" min={0.000001} onChange={(value) => update("duty_cycle", value)} />
              {input.mode === "SWITCHING" && <>
                <Field label="Frequenz" value={input.frequency_hz} unit="Hz" min={0} onChange={(value) => update("frequency_hz", value)} />
                <Field label="Gate-Spannung" value={input.gate_drive_voltage_v} unit="V" min={0} onChange={(value) => update("gate_drive_voltage_v", value)} />
                <Field label="Eon" value={input.e_on_j} unit="J" min={0} onChange={(value) => update("e_on_j", value)} />
                <Field label="Eoff" value={input.e_off_j} unit="J" min={0} onChange={(value) => update("e_off_j", value)} />
              </>}
            </div>

            <div className="section-label"><Thermometer size={15} /> Thermischer Pfad</div>
            <div className="reference-switch">
              <button type="button" className={input.temperature_reference === "CASE" ? "active" : ""} onClick={() => update("temperature_reference", "CASE")}>Gehäuse</button>
              <button type="button" className={input.temperature_reference === "AMBIENT" ? "active" : ""} onClick={() => update("temperature_reference", "AMBIENT")}>Umgebung</button>
            </div>
            <div className="field-grid">
              <Field label={input.temperature_reference === "CASE" ? "Gehäusetemperatur" : "Umgebungstemperatur"} value={input.temperature_c} unit="°C" onChange={(value) => update("temperature_c", value)} />
              <Field label="Sicherheitsfaktor" value={input.safety_factor} unit="×" step="0.1" min={1} onChange={(value) => update("safety_factor", value)} />
              {input.temperature_reference === "AMBIENT" && <>
                <Field label="RθCS" value={input.rth_cs_k_per_w} unit="K/W" min={0} onChange={(value) => update("rth_cs_k_per_w", value)} />
                <Field label="RθSA" value={input.rth_sa_k_per_w} unit="K/W" min={0} onChange={(value) => update("rth_sa_k_per_w", value)} />
              </>}
            </div>

            {error && <div className="form-error"><CircleAlert size={17} /><span>{error}</span></div>}
            <button className="analyze-button" type="submit" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={19} /> : <Gauge size={19} />}
              {loading ? "Analyse läuft" : "Betriebspunkt analysieren"}
              {!loading && <ChevronRight size={18} />}
            </button>
          </form>

          <section className="panel result-panel" aria-live="polite">
            <div className="panel-heading">
              <div><span>02</span><div><h2>Analyse</h2><p>Entscheidung und technische Reserven</p></div></div>
              <Activity size={22} />
            </div>

            {!result ? (
              <div className="empty-result">
                <span className="radar"><span /><span /><ShieldCheck size={34} /></span>
                <h3>Bereit für die Analyse</h3>
                <p>Die Entscheidung erscheint hier mit Verlustaufteilung, Grenzprüfungen und Quellenbezug.</p>
                <div className="empty-steps">
                  <span><b>1</b> Lastfall eingeben</span>
                  <span><b>2</b> C-Kern berechnet</span>
                  <span><b>3</b> Grenzen prüfen</span>
                </div>
              </div>
            ) : (
              <div className="result-content">
                <div className={`status-card ${statusClass}`}>
                  <div className="status-icon">{statusClass === "safe" ? <Check size={26} /> : <X size={26} />}</div>
                  <div><span>{result.result.status}</span><h3>{status?.label}</h3><p>{status?.detail}</p></div>
                  <strong>{format(result.result.electrical_utilization * 100, 1)}<small>% Nutzung</small></strong>
                </div>

                <div className="metric-grid">
                  <Metric label="Gesamtverlust" value={format(result.result.p_total_w, 3)} unit="W" accent />
                  <Metric label="Sperrschicht" value={format(result.result.tj_c, 1)} unit="°C" />
                  <Metric label="SOA-Grenze" value={format(result.result.soa_limit_a, 2)} unit="A" />
                  <Metric label="Temperaturreserve" value={format(result.result.temperature_margin_c, 1)} unit="K" />
                </div>

                <div className="bars">
                  <div className="bar-row">
                    <div><span>Elektrische Auslastung</span><b>{format(result.result.electrical_utilization * 100, 1)} %</b></div>
                    <div className="bar"><i style={{ width: `${utilization}%` }} /></div>
                  </div>
                  <div className="bar-row thermal">
                    <div><span>Sperrschichttemperatur</span><b>{format(result.result.tj_c, 1)} / {format(result.source.tj_max_c, 0)} °C</b></div>
                    <div className="bar"><i style={{ width: `${temperaturePercent}%` }} /></div>
                  </div>
                </div>

                <div className="checks">
                  {Object.entries(result.result.checks).map(([key, passed]) => (
                    <div key={key}><span className={passed ? "pass" : "fail"}>{passed ? <Check size={14} /> : <X size={14} />}</span><span>{({ voltage: "Spannung", current: "Strom", soa: "SOA", temperature: "Temperatur" } as Record<string, string>)[key]}</span><b>{passed ? "bestanden" : "verletzt"}</b></div>
                  ))}
                </div>

                <div className="loss-card">
                  <h4>Verlustaufteilung</h4>
                  <div><span>Leitung</span><b>{format(result.result.p_conduction_w, 3)} W</b></div>
                  <div><span>Schalten</span><b>{format(result.result.p_switching_w, 3)} W</b></div>
                  <div><span>Gate-Treiber</span><b>{format(result.result.p_gate_w, 3)} W</b></div>
                </div>

                <a className="source-card" href={result.source.datasheet_url} target="_blank" rel="noreferrer">
                  <BookOpenText size={19} />
                  <div><span>Datenblattquelle</span><strong>{result.input.transistor_id} · {result.source.revision}</strong><small>Abgerufen am {result.source.retrieved_date}</small></div>
                  <ArrowUpRight size={17} />
                </a>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer><span>TransiSafe Phase 2</span><p>Native C analysis core · auditable engineering inputs · browser interface</p></footer>
    </div>
  );
}
