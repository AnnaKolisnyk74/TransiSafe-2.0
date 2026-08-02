#ifndef TRANSISAFE_STATISTICS_H
#define TRANSISAFE_STATISTICS_H

#include "transisafe_types.h"

void initialize_statistics(StatisticsResult* statistics);
void update_statistics(
    StatisticsResult* statistics,
    int case_index,
    const OperatingPoint* point,
    const AnalysisResult* result);
int total_not_safe_count(const StatisticsResult* statistics);
double percentage(int part, int total);
void print_statistics(const StatisticsResult* statistics);
int write_summary_csv(
    const char* file_path,
    const StatisticsResult* statistics);

#endif
