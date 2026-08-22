export type Mode = "LINEAR" | "SWITCHING";
export type TemperatureReference = "CASE" | "AMBIENT";
export type EngineState = "checking" | "ready" | "offline";

export interface ModelSummary {
  id: string;
  type: string;
  vds_max_v: number;
  id_continuous_max_a: number;
  id_pulse_max_a: number;
  tj_max_c: number;
  rth_jc_k_per_w: number;
  rds_on_25_ohm: number | null;
  datasheet_url: string;
  revision: string;
  retrieved_date: string;
  manufacturer: string;
  datasheet_type: string;
  package_name: string;
  product_url: string;
  image_path: string;
  development_fixture: boolean;
  verification_status: "REVIEW_PENDING" | "VERIFIED";
  curve_status: string;
}

export interface SoaCurve {
  pulse_duration_s: number;
  points: { vds_v: number; id_a: number }[];
}

export interface SoaCurveResponse {
  transistor_id: string;
  curve_type: "SOA";
  curves: SoaCurve[];
  source: string;
}

export interface AnalysisInput {
  transistor_id: string;
  vds_v: number;
  id_a: number;
  mode: Mode;
  pulse_duration_s: number;
  frequency_hz: number;
  duty_cycle: number;
  temperature_reference: TemperatureReference;
  temperature_c: number;
  rth_cs_k_per_w: number;
  rth_sa_k_per_w: number;
  safety_factor: number;
  e_on_j: number;
  e_off_j: number;
  gate_drive_voltage_v: number;
}

export interface AnalysisResponse {
  ok: true;
  schema_version: string;
  input: AnalysisInput;
  result: {
    status: string;
    reason: string;
    data_complete: boolean;
    p_total_w: number;
    p_conduction_w: number;
    p_switching_w: number;
    p_gate_w: number;
    tj_c: number;
    temperature_margin_c: number;
    power_margin_w: number;
    rds_on_ohm: number;
    soa_limit_a: number;
    current_limit_a: number;
    zth_jc_k_per_w: number;
    electrical_utilization: number;
    margins: {
      voltage_reserve_percent: number;
      current_reserve_percent: number;
      soa_reserve_percent: number;
      thermal_reserve_percent: number;
    };
    closest_constraint: { type: "VOLTAGE" | "CURRENT" | "SOA" | "TEMPERATURE"; reserve_percent: number };
    checks: Record<"voltage" | "current" | "soa" | "temperature", boolean>;
  };
  optimization: {
    max_current_available: boolean;
    max_current_a: number;
    max_voltage_available: boolean;
    max_voltage_v: number;
    thermal_power_limit_w: number;
  };
  source: {
    datasheet_url: string;
    revision: string;
    retrieved_date: string;
    vds_max_v: number;
    id_continuous_max_a: number;
    id_pulse_max_a: number;
    tj_max_c: number;
    dataset_version: string;
    engine_version: string;
    application_version: string;
    verification_status: "REVIEW_PENDING" | "VERIFIED";
    curve_status: string;
  };
  analysis_metadata: {
    timestamp: string;
    engine_version: string;
    dataset_version: string;
    application_version: string;
    warnings: string[];
    assumptions: string[];
    model_limitations: string[];
  };
}

export interface SavedAnalysis {
  id: string;
  name: string;
  parent_id: string | null;
  input: AnalysisInput;
  result: AnalysisResponse;
  created_at: string;
  updated_at: string;
}

export interface RecentAnalysis {
  id: string;
  timestamp: string;
  input: AnalysisInput;
  result: AnalysisResponse;
}

export type WorkspacePage = "analyze" | "batch" | "reports" | "lab";
