#include "csv_io.h"

#include "analysis.h"
#include "common.h"
#include "database.h"
#include "logging.h"
#include "statistics.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

#define CSV_LINE_SIZE 1024

int parse_operating_point_line(
    char* line,
    const TransistorDatabase* database,
    OperatingPoint* point,
    char* error_message,
    size_t error_message_size)
{
    char* fields[5];
    const TransistorModel* model;
    int count;

    if (line == NULL || database == NULL || point == NULL) {
        return 0;
    }

    count = split_delimited(line, detect_delimiter(line), fields, 5);
    if (count != 4) {
        snprintf(error_message, error_message_size,
            "Erwartet werden genau 4 CSV-Felder.");
        return 0;
    }

    trim_text(fields[0]);
    if (!find_transistor_by_id(database, fields[0], &model)) {
        snprintf(error_message, error_message_size,
            "Transistor-ID nicht gefunden: %s", fields[0]);
        return 0;
    }
    point->model = model;

    if (!parse_double_token(fields[1], &point->voltage) || point->voltage < 0.0) {
        snprintf(error_message, error_message_size, "Ungueltige Spannung.");
        return 0;
    }
    if (!parse_double_token(fields[2], &point->current) || point->current < 0.0) {
        snprintf(error_message, error_message_size, "Ungueltiger Strom.");
        return 0;
    }
    if (!parse_double_token(fields[3], &point->t_amb) || point->t_amb < -273.15) {
        snprintf(error_message, error_message_size,
            "Ungueltige Umgebungstemperatur.");
        return 0;
    }
    return 1;
}

static void print_case_result(
    int index,
    const OperatingPoint* point,
    const AnalysisResult* result)
{
    printf("\n==================================================\n");
    printf("Betriebspunkt %d\n", index);
    printf("==================================================\n");
    printf("Transistor-ID:             %s\n", point->model->transistor_id);
    printf("Transistortyp:             %s\n",
        transistor_type_to_string(point->model->type));
    printf("Spannung:                  %.3f V\n", point->voltage);
    printf("Strom:                     %.3f A\n", point->current);
    printf("Verlustleistung Ploss:     %.3f W\n", result->p_loss);
    printf("Leistungsreserve:          %.3f W\n", result->power_margin_w);
    printf("Leistungsreserve:          %.2f %%\n", result->power_margin_percent);
    printf("Umgebungstemperatur:       %.2f gradC\n", point->t_amb);
    printf("Sperrschichttemperatur Tj: %.2f gradC\n", result->t_j);
    printf("Temperaturreserve:         %.2f gradC\n", result->temperature_margin_c);
    printf("Status:                    %s\n", status_to_string(result->status));
    printf("Grund:                     %s\n", status_reason_to_string(result->status));
}

static void print_optimization_result(
    const OperatingPoint* point,
    const AnalysisResult* analysis,
    const OptimizationResult* optimization)
{
    if (analysis->status == STATUS_SAFE) {
        return;
    }

    printf("\n--- Optimierungsvorschlag ---\n");
    printf("Begrenzender Faktor:        %s\n", optimization->limiting_factor);
    printf("Thermische Leistungsgrenze: %.3f W\n",
        optimization->thermal_power_limit_w);
    printf("Zulaessige Verlustleistung:  %.3f W\n",
        optimization->allowed_power_w);
    if (optimization->max_current_available) {
        printf("Maximaler Strom bei %.3f V: %.6f A\n",
            point->voltage, optimization->max_current_a);
    }
    if (optimization->max_voltage_available) {
        printf("Maximale Spannung bei %.3f A: %.6f V\n",
            point->current, optimization->max_voltage_v);
    }
    printf("--------------------------------\n");
}

int run_csv_mode(
    const AppConfig* config,
    const TransistorDatabase* database)
{
    char input_path[PATH_SIZE];
    FILE* input_file;
    FILE* output_file;
    char line[CSV_LINE_SIZE];
    char working_line[CSV_LINE_SIZE];
    char upper_line[CSV_LINE_SIZE];
    char error_message[ERROR_MESSAGE_SIZE];
    int file_line_number = 0;
    int case_index = 0;
    clock_t start_clock;
    clock_t end_clock;
    StatisticsResult statistics;

    initialize_statistics(&statistics);
    write_log(LOG_INFO, "CSV-Modus gestartet.");
    printf("\n=== CSV-Import mit Statistik und KPIs ===\n");
    printf("Format: transistor_id,voltage,current,tamb\n");
    printf("Komma und Semikolon werden akzeptiert.\n\n");
    printf("Pfad zur CSV-Datei: ");

    if (scanf("%259s", input_path) != 1) {
        printf("Fehler: Dateipfad konnte nicht gelesen werden.\n");
        return 1;
    }

    input_file = fopen(input_path, "r");
    if (input_file == NULL) {
        printf("Fehler: Datei konnte nicht geoeffnet werden: %s\n", input_path);
        write_log(LOG_ERROR, "CSV-Datei konnte nicht geoeffnet werden: %s",
            input_path);
        return 1;
    }

    output_file = fopen(config->output_file_path, "w");
    if (output_file == NULL) {
        fclose(input_file);
        return 1;
    }

    start_clock = clock();
    fprintf(output_file,
        "idx,transistor_id,type,voltage,current,p_loss,pmax,"
        "power_margin_w,power_margin_pct,tamb,rthja,tj,tjmax,"
        "temperature_margin_c,status,reason,thermal_power_limit_w,"
        "allowed_power_w,limiting_factor,max_current_available,"
        "max_current_a,current_reduction_pct,max_voltage_available,"
        "max_voltage_v,voltage_reduction_pct\n");

    while (fgets(line, sizeof(line), input_file) != NULL) {
        OperatingPoint point;
        AnalysisResult result;
        OptimizationResult optimization;

        file_line_number++;
        trim_text(line);
        if (line[0] == '\0' || line[0] == '#') {
            continue;
        }

        copy_text(upper_line, sizeof(upper_line), line);
        text_to_upper(upper_line);
        if (strstr(upper_line, "TRANSISTOR_ID") != NULL &&
            strstr(upper_line, "VOLTAGE") != NULL) {
            continue;
        }

        copy_text(working_line, sizeof(working_line), line);
        if (!parse_operating_point_line(working_line, database, &point,
                error_message, sizeof(error_message))) {
            statistics.skipped_count++;
            printf("CSV-Zeile %d uebersprungen: %s\n",
                file_line_number, error_message);
            write_log(LOG_ERROR,
                "CSV-Zeile %d uebersprungen | Fehler=%s | Inhalt=%s",
                file_line_number, error_message, line);
            continue;
        }

        case_index++;
        result = analyze_operating_point(&point, config);
        optimization = calculate_optimization(&point, &result);
        print_case_result(case_index, &point, &result);
        print_optimization_result(&point, &result, &optimization);
        update_statistics(&statistics, case_index, &point, &result);

        fprintf(output_file,
            "%d,%s,%s,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,"
            "%.6f,%.6f,%.6f,%.6f,%s,%s,%.6f,%.6f,%s,%d,%.6f,"
            "%.6f,%d,%.6f,%.6f\n",
            case_index, point.model->transistor_id,
            transistor_type_to_string(point.model->type),
            point.voltage, point.current, result.p_loss, point.model->p_max,
            result.power_margin_w, result.power_margin_percent, point.t_amb,
            point.model->rth_ja, result.t_j, point.model->t_j_max,
            result.temperature_margin_c, status_to_string(result.status),
            status_reason_to_string(result.status),
            optimization.thermal_power_limit_w, optimization.allowed_power_w,
            optimization.limiting_factor, optimization.max_current_available,
            optimization.max_current_a, optimization.current_reduction_percent,
            optimization.max_voltage_available, optimization.max_voltage_v,
            optimization.voltage_reduction_percent);
    }

    fclose(input_file);
    fclose(output_file);
    end_clock = clock();
    statistics.processing_time_ms =
        ((double)(end_clock - start_clock) * 1000.0) / CLOCKS_PER_SEC;

    printf("\n--- Zusammenfassung ---\n");
    printf("Ausgewertet:   %d\n", statistics.total_count);
    printf("SAFE:          %d\n", statistics.safe_count);
    printf("CRITICAL:      %d\n", statistics.critical_count);
    printf("NOT SAFE:      %d\n", total_not_safe_count(&statistics));
    printf("Uebersprungen: %d\n", statistics.skipped_count);
    printf("Ergebnisdatei: %s\n", config->output_file_path);
    printf("Laufzeit:      %.3f ms\n", statistics.processing_time_ms);
    print_statistics(&statistics);

    if (write_summary_csv(config->summary_file_path, &statistics)) {
        printf("KPI-Datei:     %s\n", config->summary_file_path);
    }

    write_log(LOG_INFO,
        "CSV-Analyse abgeschlossen | Ausgewertet=%d | SAFE=%d | "
        "CRITICAL=%d | NOT_SAFE=%d | Uebersprungen=%d | LaufzeitMs=%.3f",
        statistics.total_count, statistics.safe_count, statistics.critical_count,
        total_not_safe_count(&statistics), statistics.skipped_count,
        statistics.processing_time_ms);
    return 0;
}
