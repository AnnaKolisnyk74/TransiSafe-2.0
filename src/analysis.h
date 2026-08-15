#ifndef TRANSISAFE_ANALYSIS_H
#define TRANSISAFE_ANALYSIS_H

#include "transisafe_types.h"

AnalysisResult analyze_operating_point(
    const OperatingPoint* point,
    const AppConfig* config);

OptimizationResult calculate_optimization(
    const OperatingPoint* point,
    const AnalysisResult* analysis);

double interpolate_rds_on(const TransistorModel* model, double temperature_c);
double interpolate_soa_current(const TransistorModel* model,
    double pulse_duration_s, double vds);
double interpolate_zth_jc(const TransistorModel* model,
    double duty_cycle, double pulse_duration_s);

const char* transistor_type_to_string(TransistorType type);
const char* status_to_string(SafetyStatus status);
const char* status_reason_to_string(SafetyStatus status);

#endif
