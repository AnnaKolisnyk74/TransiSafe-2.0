#include "statistics.h"

#include "analysis.h"
#include "common.h"
#include "logging.h"

#include <float.h>
#include <stdio.h>
#include <string.h>

void initialize_statistics(StatisticsResult* statistics)
{
    int i;

    memset(statistics, 0, sizeof(*statistics));
    statistics->max_tj = -DBL_MAX;
    statistics->highest_criticality_score = -DBL_MAX;
    statistics->most_critical_status = STATUS_SAFE;
    for (i = 0; i < MAX_TRANSISTORS; i++) {
        statistics->model_statistics[i].max_tj = -DBL_MAX;
    }
}

static int find_or_create_model_statistics(
    StatisticsResult* statistics,
    const char* transistor_id)
{
    int i;

    for (i = 0; i < statistics->model_statistics_count; i++) {
        if (text_equals_ignore_case(
                statistics->model_statistics[i].transistor_id,
                transistor_id)) {
            return i;
        }
    }

    if (statistics->model_statistics_count >= MAX_TRANSISTORS) {
        return -1;
    }

    i = statistics->model_statistics_count++;
    copy_text(statistics->model_statistics[i].transistor_id,
        sizeof(statistics->model_statistics[i].transistor_id), transistor_id);
    statistics->model_statistics[i].max_tj = -DBL_MAX;
    return i;
}

static double calculate_criticality_score(
    const OperatingPoint* point,
    const AnalysisResult* result)
{
    double power_utilization = result->p_loss / point->model->p_max;
    double temperature_utilization = result->t_j / point->model->t_j_max;
    return power_utilization > temperature_utilization
        ? power_utilization
        : temperature_utilization;
}

void update_statistics(
    StatisticsResult* statistics,
    int case_index,
    const OperatingPoint* point,
    const AnalysisResult* result)
{
    double criticality_score;
    int model_index;
    ModelStatistics* model_statistics;

    statistics->total_count++;
    statistics->sum_tj += result->t_j;
    statistics->sum_power_margin_w += result->power_margin_w;
    statistics->sum_temperature_margin_c += result->temperature_margin_c;

    if (result->t_j > statistics->max_tj) {
        statistics->max_tj = result->t_j;
        statistics->max_tj_index = case_index;
        copy_text(statistics->max_tj_transistor_id,
            sizeof(statistics->max_tj_transistor_id),
            point->model->transistor_id);
    }

    criticality_score = calculate_criticality_score(point, result);
    if (criticality_score > statistics->highest_criticality_score) {
        statistics->highest_criticality_score = criticality_score;
        statistics->most_critical_index = case_index;
        statistics->most_critical_status = result->status;
        copy_text(statistics->most_critical_transistor_id,
            sizeof(statistics->most_critical_transistor_id),
            point->model->transistor_id);
    }

    switch (result->status) {
    case STATUS_SAFE: statistics->safe_count++; break;
    case STATUS_CRITICAL: statistics->critical_count++; break;
    case STATUS_NOT_SAFE_POWER: statistics->not_safe_power_count++; break;
    case STATUS_NOT_SAFE_TEMPERATURE:
        statistics->not_safe_temperature_count++;
        break;
    case STATUS_NOT_SAFE_BOTH: statistics->not_safe_both_count++; break;
    default: break;
    }

    model_index = find_or_create_model_statistics(
        statistics, point->model->transistor_id);
    if (model_index < 0) {
        return;
    }

    model_statistics = &statistics->model_statistics[model_index];
    model_statistics->total_count++;
    model_statistics->sum_tj += result->t_j;
    if (result->t_j > model_statistics->max_tj) {
        model_statistics->max_tj = result->t_j;
    }
    if (result->status == STATUS_SAFE) {
        model_statistics->safe_count++;
    }
    else if (result->status == STATUS_CRITICAL) {
        model_statistics->critical_count++;
    }
    else {
        model_statistics->not_safe_count++;
    }
}

double percentage(int part, int total)
{
    return total <= 0 ? 0.0 : ((double)part / (double)total) * 100.0;
}

int total_not_safe_count(const StatisticsResult* statistics)
{
    return statistics->not_safe_power_count +
        statistics->not_safe_temperature_count +
        statistics->not_safe_both_count;
}

static const char* most_frequent_failure_reason(
    const StatisticsResult* statistics)
{
    int power = statistics->not_safe_power_count;
    int temperature = statistics->not_safe_temperature_count;
    int both = statistics->not_safe_both_count;
    int maximum = power;

    if (temperature > maximum) maximum = temperature;
    if (both > maximum) maximum = both;
    if (maximum == 0) return "NONE";
    if ((power == maximum && temperature == maximum) ||
        (power == maximum && both == maximum) ||
        (temperature == maximum && both == maximum)) {
        return "TIE";
    }
    if (power == maximum) return "POWER";
    if (temperature == maximum) return "TEMPERATURE";
    return "POWER_AND_TEMPERATURE";
}

void print_statistics(const StatisticsResult* statistics)
{
    int i;
    int not_safe_count;

    if (statistics->total_count <= 0) {
        printf("\nKeine gueltigen Betriebspunkte fuer die Statistik vorhanden.\n");
        return;
    }

    not_safe_count = total_not_safe_count(statistics);
    printf("\n==================================================\n");
    printf("Statistische Auswertung und KPIs\n");
    printf("==================================================\n");
    printf("Gesamtzahl Betriebspunkte:       %d\n", statistics->total_count);
    printf("Verarbeitungszeit:               %.3f ms\n", statistics->processing_time_ms);
    printf("SAFE-Anteil:                    %.2f %%\n",
        percentage(statistics->safe_count, statistics->total_count));
    printf("CRITICAL-Anteil:                %.2f %%\n",
        percentage(statistics->critical_count, statistics->total_count));
    printf("NOT-SAFE-Anteil:                %.2f %%\n",
        percentage(not_safe_count, statistics->total_count));
    printf("Durchschnittliche Tj:           %.2f gradC\n",
        statistics->sum_tj / statistics->total_count);
    printf("Hoechste Tj:                    %.2f gradC\n", statistics->max_tj);
    printf("Hoechste Tj bei Index:          %d\n", statistics->max_tj_index);
    printf("Hoechste Tj bei Transistor:     %s\n", statistics->max_tj_transistor_id);
    printf("Durchschnittliche P-Reserve:    %.3f W\n",
        statistics->sum_power_margin_w / statistics->total_count);
    printf("Durchschnittliche T-Reserve:    %.2f gradC\n",
        statistics->sum_temperature_margin_c / statistics->total_count);
    printf("Kritischster Betriebspunkt:     %d\n", statistics->most_critical_index);
    printf("Kritischster Transistor:        %s\n",
        statistics->most_critical_transistor_id);
    printf("Status des kritischsten Punkts: %s\n",
        status_to_string(statistics->most_critical_status));
    printf("Kritikalitaetswert:             %.4f\n",
        statistics->highest_criticality_score);
    printf("Haeufigste Fehlerursache:       %s\n",
        most_frequent_failure_reason(statistics));

    printf("\n--- Auswertung je Transistormodell ---\n");
    for (i = 0; i < statistics->model_statistics_count; i++) {
        const ModelStatistics* model = &statistics->model_statistics[i];
        printf("%-20s | Gesamt=%d | SAFE=%d | CRITICAL=%d | "
               "NOT_SAFE=%d | AvgTj=%.2f | MaxTj=%.2f\n",
            model->transistor_id, model->total_count,
            model->safe_count, model->critical_count, model->not_safe_count,
            model->sum_tj / model->total_count, model->max_tj);
    }
}

static void write_summary_numeric(
    FILE* file,
    const char* scope,
    const char* transistor_id,
    const char* kpi,
    double numeric_value)
{
    fprintf(file, "%s,%s,%s,%.6f,\n",
        scope, transistor_id, kpi, numeric_value);
}

static void write_summary_text(
    FILE* file,
    const char* scope,
    const char* transistor_id,
    const char* kpi,
    const char* text_value)
{
    fprintf(file, "%s,%s,%s,,%s\n",
        scope, transistor_id, kpi, text_value);
}

int write_summary_csv(
    const char* file_path,
    const StatisticsResult* statistics)
{
    FILE* file = fopen(file_path, "w");
    int not_safe_count;
    int i;

    if (file == NULL) {
        write_log(LOG_ERROR, "KPI-Datei konnte nicht geschrieben werden: %s",
            file_path);
        return 0;
    }

    fprintf(file, "scope,transistor_id,kpi,numeric_value,text_value\n");
    not_safe_count = total_not_safe_count(statistics);
    write_summary_numeric(file, "overall", "ALL", "total_points",
        statistics->total_count);
    write_summary_numeric(file, "overall", "ALL", "skipped_points",
        statistics->skipped_count);
    write_summary_numeric(file, "overall", "ALL", "processing_time_ms",
        statistics->processing_time_ms);
    write_summary_numeric(file, "overall", "ALL", "safe_count",
        statistics->safe_count);
    write_summary_numeric(file, "overall", "ALL", "safe_percent",
        percentage(statistics->safe_count, statistics->total_count));
    write_summary_numeric(file, "overall", "ALL", "critical_count",
        statistics->critical_count);
    write_summary_numeric(file, "overall", "ALL", "critical_percent",
        percentage(statistics->critical_count, statistics->total_count));
    write_summary_numeric(file, "overall", "ALL", "not_safe_count",
        not_safe_count);
    write_summary_numeric(file, "overall", "ALL", "not_safe_percent",
        percentage(not_safe_count, statistics->total_count));

    if (statistics->total_count > 0) {
        write_summary_numeric(file, "overall", "ALL", "average_tj_c",
            statistics->sum_tj / statistics->total_count);
        write_summary_numeric(file, "overall", "ALL", "max_tj_c",
            statistics->max_tj);
        write_summary_numeric(file, "overall", "ALL", "average_power_margin_w",
            statistics->sum_power_margin_w / statistics->total_count);
        write_summary_numeric(file, "overall", "ALL", "average_temperature_margin_c",
            statistics->sum_temperature_margin_c / statistics->total_count);
        write_summary_numeric(file, "overall", "ALL", "most_critical_index",
            statistics->most_critical_index);
        write_summary_numeric(file, "overall", "ALL", "criticality_score",
            statistics->highest_criticality_score);
        write_summary_text(file, "overall", "ALL", "most_critical_transistor_id",
            statistics->most_critical_transistor_id);
        write_summary_text(file, "overall", "ALL", "most_critical_status",
            status_to_string(statistics->most_critical_status));
        write_summary_text(file, "overall", "ALL", "most_frequent_failure_reason",
            most_frequent_failure_reason(statistics));
    }

    for (i = 0; i < statistics->model_statistics_count; i++) {
        const ModelStatistics* model = &statistics->model_statistics[i];
        write_summary_numeric(file, "model", model->transistor_id,
            "total_points", model->total_count);
        write_summary_numeric(file, "model", model->transistor_id,
            "safe_count", model->safe_count);
        write_summary_numeric(file, "model", model->transistor_id,
            "critical_count", model->critical_count);
        write_summary_numeric(file, "model", model->transistor_id,
            "not_safe_count", model->not_safe_count);
        write_summary_numeric(file, "model", model->transistor_id,
            "safe_percent", percentage(model->safe_count, model->total_count));
        write_summary_numeric(file, "model", model->transistor_id,
            "average_tj_c", model->sum_tj / model->total_count);
        write_summary_numeric(file, "model", model->transistor_id,
            "max_tj_c", model->max_tj);
    }

    fclose(file);
    return 1;
}
