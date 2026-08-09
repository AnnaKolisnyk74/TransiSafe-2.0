#ifndef TRANSISAFE_TYPES_H
#define TRANSISAFE_TYPES_H

#define PATH_SIZE 260
#define ERROR_MESSAGE_SIZE 256
#define ID_SIZE 64
#define MAX_TRANSISTORS 100

typedef enum
{
    TRANS_BJT = 1,
    TRANS_MOSFET = 2
} TransistorType;

typedef enum
{
    STATUS_SAFE = 1,
    STATUS_CRITICAL,
    STATUS_NOT_SAFE_POWER,
    STATUS_NOT_SAFE_TEMPERATURE,
    STATUS_NOT_SAFE_BOTH
} SafetyStatus;

typedef enum
{
    LOG_INFO = 1,
    LOG_WARNING,
    LOG_ERROR
} LogLevel;

typedef enum
{
    CONFIG_LOADED = 1,
    CONFIG_DEFAULTS_USED,
    CONFIG_LOADED_WITH_WARNINGS
} ConfigLoadStatus;

typedef struct
{
    double critical_power_margin_percent;
    double critical_temperature_margin_c;
    char output_file_path[PATH_SIZE];
    char summary_file_path[PATH_SIZE];
    char management_summary_file_path[PATH_SIZE];
    char log_file_path[PATH_SIZE];
    char transistor_database_path[PATH_SIZE];
} AppConfig;

typedef struct
{
    char transistor_id[ID_SIZE];
    TransistorType type;
    double p_max;
    double rth_ja;
    double t_j_max;
} TransistorModel;

typedef struct
{
    TransistorModel models[MAX_TRANSISTORS];
    int count;
} TransistorDatabase;

typedef struct
{
    const TransistorModel* model;
    double voltage;
    double current;
    double t_amb;
} OperatingPoint;

typedef struct
{
    double p_loss;
    double t_j;
    double power_margin_w;
    double power_margin_percent;
    double temperature_margin_c;
    int safe_power;
    int safe_temperature;
    SafetyStatus status;
} AnalysisResult;

typedef struct
{
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

typedef struct
{
    char transistor_id[ID_SIZE];
    int total_count;
    int safe_count;
    int critical_count;
    int not_safe_count;
    double sum_tj;
    double max_tj;
} ModelStatistics;

typedef struct
{
    int total_count;
    int skipped_count;
    double processing_time_ms;
    int safe_count;
    int critical_count;
    int not_safe_power_count;
    int not_safe_temperature_count;
    int not_safe_both_count;
    double sum_tj;
    double max_tj;
    int max_tj_index;
    char max_tj_transistor_id[ID_SIZE];
    double sum_power_margin_w;
    double sum_temperature_margin_c;
    double highest_criticality_score;
    int most_critical_index;
    char most_critical_transistor_id[ID_SIZE];
    SafetyStatus most_critical_status;

    int priority_1_count;
    int priority_2_count;
    int priority_3_count;
    int priority_4_count;
    int highest_priority_value;
    double highest_priority_criticality_score;
    int highest_priority_case_index;
    char highest_priority_transistor_id[ID_SIZE];
    SafetyStatus highest_priority_status;

    double lowest_safety_margin_score;
    double highest_safety_margin_score;
    char lowest_safety_margin_transistor_id[ID_SIZE];
    char highest_safety_margin_transistor_id[ID_SIZE];

    ModelStatistics model_statistics[MAX_TRANSISTORS];
    int model_statistics_count;
} StatisticsResult;

#endif
