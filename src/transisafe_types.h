#ifndef TRANSISAFE_TYPES_H
#define TRANSISAFE_TYPES_H

#define PATH_SIZE 260
#define ERROR_MESSAGE_SIZE 256
#define ID_SIZE 64
#define MAX_TRANSISTORS 100
#define MAX_CURVE_POINTS 128
#define MAX_PARAMETERIZED_CURVES 16

typedef enum { TRANS_MOSFET = 1 } TransistorType;
typedef enum { MODE_LINEAR = 1, MODE_SWITCHING } OperatingMode;
typedef enum { TEMPERATURE_AMBIENT = 1, TEMPERATURE_CASE } TemperatureReference;

typedef enum {
    STATUS_SAFE = 1, STATUS_CRITICAL, STATUS_NOT_SAFE_POWER,
    STATUS_NOT_SAFE_TEMPERATURE, STATUS_NOT_SAFE_BOTH,
    STATUS_NOT_SAFE_VOLTAGE, STATUS_NOT_SAFE_CURRENT,
    STATUS_NOT_SAFE_SOA, STATUS_INSUFFICIENT_DATA
} SafetyStatus;

typedef enum { LOG_INFO = 1, LOG_WARNING, LOG_ERROR } LogLevel;
typedef enum { CONFIG_LOADED = 1, CONFIG_DEFAULTS_USED,
    CONFIG_LOADED_WITH_WARNINGS } ConfigLoadStatus;

typedef struct {
    double critical_power_margin_percent;
    double critical_temperature_margin_c;
    char output_file_path[PATH_SIZE];
    char summary_file_path[PATH_SIZE];
    char log_file_path[PATH_SIZE];
    char transistor_database_path[PATH_SIZE];
    char curve_database_path[PATH_SIZE];
} AppConfig;

typedef struct { double x; double y; } CurvePoint;
typedef struct {
    double parameter;
    CurvePoint points[MAX_CURVE_POINTS];
    int count;
} ParameterizedCurve;

typedef struct {
    char transistor_id[ID_SIZE];
    TransistorType type;
    double vds_max;
    double id_max;
    double id_pulse_max;
    double id_pulse_duration_max_s;
    double id_pulse_duty_max;
    double soa_reference_temperature_c;
    double t_j_max;
    double rth_jc;
    double rth_ja;
    double gate_charge_c;
    char datasheet_url[PATH_SIZE];
    char datasheet_revision[ID_SIZE];
    char retrieved_date[32];
    CurvePoint rds_on_curve[MAX_CURVE_POINTS];
    int rds_on_curve_count;
    ParameterizedCurve soa_curves[MAX_PARAMETERIZED_CURVES];
    int soa_curve_count;
    ParameterizedCurve zth_curves[MAX_PARAMETERIZED_CURVES];
    int zth_curve_count;
} TransistorModel;

typedef struct { TransistorModel models[MAX_TRANSISTORS]; int count; }
    TransistorDatabase;

typedef struct {
    const TransistorModel* model;
    double vds;
    double id;
    OperatingMode mode;
    double pulse_duration_s;
    double frequency_hz;
    double duty_cycle;
    TemperatureReference temperature_reference;
    double reference_temperature_c;
    double rth_cs;
    double rth_sa;
    double safety_factor;
    double e_on_j;
    double e_off_j;
    double gate_drive_voltage_v;
} OperatingPoint;

typedef struct {
    double p_loss;
    double conduction_loss_w;
    double switching_loss_w;
    double gate_drive_loss_w;
    double t_j;
    double power_margin_w;
    double power_margin_percent;
    double temperature_margin_c;
    double soa_current_limit_a;
    double rds_on_ohm;
    double zth_jc_k_per_w;
    double electrical_utilization;
    int safe_power;
    int safe_temperature;
    int safe_voltage;
    int safe_current;
    int safe_soa;
    int data_complete;
    SafetyStatus status;
} AnalysisResult;

typedef struct {
    double thermal_power_limit_w;
    double allowed_power_w;
    int max_current_available;
    double max_current_a;
    int max_voltage_available;
    double max_voltage_v;
    double current_reduction_percent;
    double voltage_reduction_percent;
    const char* limiting_factor;
} OptimizationResult;

typedef struct {
    char transistor_id[ID_SIZE];
    int total_count, safe_count, critical_count, not_safe_count;
    double sum_tj, max_tj;
} ModelStatistics;

typedef struct {
    int total_count, skipped_count;
    double processing_time_ms;
    int safe_count, critical_count, not_safe_power_count;
    int not_safe_temperature_count, not_safe_both_count;
    int not_safe_voltage_count, not_safe_current_count, not_safe_soa_count;
    int insufficient_data_count;
    double sum_tj, max_tj;
    int max_tj_index;
    char max_tj_transistor_id[ID_SIZE];
    double sum_power_margin_w, sum_temperature_margin_c;
    double highest_criticality_score;
    int most_critical_index;
    char most_critical_transistor_id[ID_SIZE];
    SafetyStatus most_critical_status;
    ModelStatistics model_statistics[MAX_TRANSISTORS];
    int model_statistics_count;
} StatisticsResult;

#endif
