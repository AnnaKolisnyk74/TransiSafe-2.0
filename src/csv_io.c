#include "csv_io.h"
#include "analysis.h"
#include "common.h"
#include "database.h"
#include "statistics.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

#define CSV_LINE_SIZE 2048

static int parse_mode(const char* s, OperatingMode* mode)
{
    if (text_equals_ignore_case(s, "LINEAR")) { *mode = MODE_LINEAR; return 1; }
    if (text_equals_ignore_case(s, "SWITCHING")) { *mode = MODE_SWITCHING; return 1; }
    return 0;
}

static int parse_temperature_reference(const char* s, TemperatureReference* ref)
{
    if (text_equals_ignore_case(s, "AMBIENT")) { *ref = TEMPERATURE_AMBIENT; return 1; }
    if (text_equals_ignore_case(s, "CASE")) { *ref = TEMPERATURE_CASE; return 1; }
    return 0;
}

int parse_operating_point_line(char* line, const TransistorDatabase* database,
    OperatingPoint* p, char* error, size_t error_size)
{
    char* f[16];
    const TransistorModel* model;
    int n = split_delimited(line, detect_delimiter(line), f, 16);
    memset(p, 0, sizeof(*p));
    if (n != 15) {
        snprintf(error, error_size, "Erwartet werden genau 15 CSV-Felder.");
        return 0;
    }
    if (!find_transistor_by_id(database, f[0], &model)) {
        snprintf(error, error_size, "MOSFET-ID nicht gefunden: %s", f[0]);
        return 0;
    }
    p->model = model;
    if (!parse_double_token(f[1], &p->vds) || p->vds < 0.0 ||
        !parse_double_token(f[2], &p->id) || p->id < 0.0 ||
        !parse_mode(f[3], &p->mode) ||
        !parse_double_token(f[4], &p->pulse_duration_s) || p->pulse_duration_s <= 0.0 ||
        !parse_double_token(f[5], &p->frequency_hz) || p->frequency_hz < 0.0 ||
        !parse_double_token(f[6], &p->duty_cycle) || p->duty_cycle <= 0.0 || p->duty_cycle > 1.0 ||
        !parse_temperature_reference(f[7], &p->temperature_reference) ||
        !parse_double_token(f[8], &p->reference_temperature_c) || p->reference_temperature_c < -273.15 ||
        !parse_double_token(f[9], &p->rth_cs) || p->rth_cs < 0.0 ||
        !parse_double_token(f[10], &p->rth_sa) || p->rth_sa < 0.0 ||
        !parse_double_token(f[11], &p->safety_factor) || p->safety_factor < 1.0 ||
        !parse_double_token(f[12], &p->e_on_j) || p->e_on_j < 0.0 ||
        !parse_double_token(f[13], &p->e_off_j) || p->e_off_j < 0.0 ||
        !parse_double_token(f[14], &p->gate_drive_voltage_v) || p->gate_drive_voltage_v < 0.0) {
        snprintf(error, error_size, "Ungueltiger oder unplausibler Eingabewert.");
        return 0;
    }
    return 1;
}

int run_csv_mode(const AppConfig* config, const TransistorDatabase* database)
{
    char path[PATH_SIZE], line[CSV_LINE_SIZE], work[CSV_LINE_SIZE];
    char error[ERROR_MESSAGE_SIZE];
    FILE *in, *out;
    int line_no = 0, index = 0;
    StatisticsResult stats;
    clock_t start = clock();
    initialize_statistics(&stats);
    printf("CSV-Format: transistor_id,vds,id,mode,pulse_s,frequency_hz,duty_cycle,temperature_reference,temperature_c,rth_cs,rth_sa,safety_factor,e_on_j,e_off_j,gate_drive_voltage_v\n");
    printf("Pfad zur CSV-Datei: ");
    if (scanf("%259s", path) != 1 || !(in = fopen(path, "r"))) return 1;
    out = fopen(config->output_file_path, "w");
    if (!out) { fclose(in); return 1; }
    fprintf(out, "idx,transistor_id,mode,vds,id,p_conduction_w,p_switching_w,p_gate_w,p_total_w,rds_on_ohm,soa_limit_a,zth_jc_k_per_w,tj_c,tjmax_c,temp_margin_c,electrical_utilization,status,reason,datasheet_revision,retrieved_date,datasheet_url\n");
    while (fgets(line, sizeof(line), in)) {
        OperatingPoint p;
        AnalysisResult r;
        line_no++;
        trim_text(line);
        if (!line[0] || line[0] == '#' || strstr(line, "transistor_id")) continue;
        copy_text(work, sizeof(work), line);
        if (!parse_operating_point_line(work, database, &p, error, sizeof(error))) {
            stats.skipped_count++;
            printf("Zeile %d uebersprungen: %s\n", line_no, error);
            continue;
        }
        r = analyze_operating_point(&p, config);
        update_statistics(&stats, ++index, &p, &r);
        fprintf(out, "%d,%s,%s,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%s,%s,%s,%s,%s\n",
            index, p.model->transistor_id, p.mode == MODE_LINEAR ? "LINEAR" : "SWITCHING",
            p.vds, p.id, r.conduction_loss_w, r.switching_loss_w,
            r.gate_drive_loss_w, r.p_loss, r.rds_on_ohm, r.soa_current_limit_a,
            r.zth_jc_k_per_w, r.t_j, p.model->t_j_max,
            r.temperature_margin_c, r.electrical_utilization,
            status_to_string(r.status), status_reason_to_string(r.status),
            p.model->datasheet_revision, p.model->retrieved_date,
            p.model->datasheet_url);
    }
    fclose(in); fclose(out);
    stats.processing_time_ms = 1000.0 * (clock() - start) / CLOCKS_PER_SEC;
    write_summary_csv(config->summary_file_path, &stats);
    print_statistics(&stats);
    return 0;
}
