#ifndef TRANSISAFE_ANALYSIS_H
#define TRANSISAFE_ANALYSIS_H

#include "transisafe_types.h"

AnalysisResult analyze_operating_point(
    const OperatingPoint* point,
    const AppConfig* config);

OptimizationResult calculate_optimization(
    const OperatingPoint* point,
    const AnalysisResult* analysis);

const char* transistor_type_to_string(TransistorType type);
const char* status_to_string(SafetyStatus status);
const char* status_reason_to_string(SafetyStatus status);

#endif
