export type Mode = "LINEAR" | "SWITCHING";
export type TemperatureReference = "CASE" | "AMBIENT";

export interface ModelSummary {
  id: string;
  type: string;
  vds_max_v: number;
  id_continuous_max_a: number;
  id_pulse_max_a: number;
  tj_max_c: number;
  datasheet_url: string;
  revision: string;
  retrieved_date: string;
  development_fixture: boolean;
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
  input: { transistor_id: string; mode: Mode; vds_v: number; id_a: number };
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
    zth_jc_k_per_w: number;
    electrical_utilization: number;
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
  };
}
