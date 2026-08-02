#include "analysis.h"

AnalysisResult analyze_operating_point(
    const OperatingPoint* point,
    const AppConfig* config)
{
    AnalysisResult result;
    const TransistorModel* model = point->model;

    result.p_loss = point->voltage * point->current;
    result.t_j = point->t_amb + result.p_loss * model->rth_ja;
    result.power_margin_w = model->p_max - result.p_loss;
    result.power_margin_percent =
        (result.power_margin_w / model->p_max) * 100.0;
    result.temperature_margin_c = model->t_j_max - result.t_j;
    result.safe_power = result.p_loss <= model->p_max;
    result.safe_temperature = result.t_j <= model->t_j_max;

    if (!result.safe_power && !result.safe_temperature) {
        result.status = STATUS_NOT_SAFE_BOTH;
    }
    else if (!result.safe_power) {
        result.status = STATUS_NOT_SAFE_POWER;
    }
    else if (!result.safe_temperature) {
        result.status = STATUS_NOT_SAFE_TEMPERATURE;
    }
    else if (result.power_margin_percent <
                 config->critical_power_margin_percent ||
             result.temperature_margin_c <
                 config->critical_temperature_margin_c) {
        result.status = STATUS_CRITICAL;
    }
    else {
        result.status = STATUS_SAFE;
    }

    return result;
}

OptimizationResult calculate_optimization(
    const OperatingPoint* point,
    const AnalysisResult* analysis)
{
    OptimizationResult optimization;
    const TransistorModel* model = point->model;

    optimization.thermal_power_limit_w =
        (model->t_j_max - point->t_amb) / model->rth_ja;
    if (optimization.thermal_power_limit_w < 0.0) {
        optimization.thermal_power_limit_w = 0.0;
    }

    if (model->p_max < optimization.thermal_power_limit_w) {
        optimization.allowed_power_w = model->p_max;
        optimization.limiting_factor = "POWER";
    }
    else if (model->p_max > optimization.thermal_power_limit_w) {
        optimization.allowed_power_w = optimization.thermal_power_limit_w;
        optimization.limiting_factor = "TEMPERATURE";
    }
    else {
        optimization.allowed_power_w = model->p_max;
        optimization.limiting_factor = "POWER_AND_TEMPERATURE";
    }

    optimization.max_current_available = point->voltage > 0.0;
    optimization.max_current_a = optimization.max_current_available
        ? optimization.allowed_power_w / point->voltage
        : 0.0;
    optimization.max_voltage_available = point->current > 0.0;
    optimization.max_voltage_v = optimization.max_voltage_available
        ? optimization.allowed_power_w / point->current
        : 0.0;

    optimization.current_reduction_percent = 0.0;
    if (optimization.max_current_available &&
        point->current > optimization.max_current_a &&
        point->current > 0.0) {
        optimization.current_reduction_percent =
            ((point->current - optimization.max_current_a) /
             point->current) * 100.0;
    }

    optimization.voltage_reduction_percent = 0.0;
    if (optimization.max_voltage_available &&
        point->voltage > optimization.max_voltage_v &&
        point->voltage > 0.0) {
        optimization.voltage_reduction_percent =
            ((point->voltage - optimization.max_voltage_v) /
             point->voltage) * 100.0;
    }

    (void)analysis;
    return optimization;
}

const char* transistor_type_to_string(TransistorType type)
{
    if (type == TRANS_BJT) {
        return "BJT";
    }
    if (type == TRANS_MOSFET) {
        return "MOSFET";
    }
    return "UNKNOWN";
}

const char* status_to_string(SafetyStatus status)
{
    switch (status) {
    case STATUS_SAFE: return "SAFE";
    case STATUS_CRITICAL: return "CRITICAL";
    case STATUS_NOT_SAFE_POWER: return "NOT_SAFE_POWER";
    case STATUS_NOT_SAFE_TEMPERATURE: return "NOT_SAFE_TEMPERATURE";
    case STATUS_NOT_SAFE_BOTH: return "NOT_SAFE_BOTH";
    default: return "UNKNOWN";
    }
}

const char* status_reason_to_string(SafetyStatus status)
{
    switch (status) {
    case STATUS_SAFE: return "NONE";
    case STATUS_CRITICAL: return "LOW_MARGIN";
    case STATUS_NOT_SAFE_POWER: return "POWER";
    case STATUS_NOT_SAFE_TEMPERATURE: return "TEMPERATURE";
    case STATUS_NOT_SAFE_BOTH: return "POWER_AND_TEMPERATURE";
    default: return "UNKNOWN";
    }
}
