#include "database.h"

#include "analysis.h"
#include "common.h"
#include "logging.h"

#include <stdio.h>
#include <string.h>

#define CSV_LINE_SIZE 2048

int find_transistor_by_id(const TransistorDatabase* database,
    const char* transistor_id, const TransistorModel** out_model)
{
    int i;
    if (!database || !transistor_id || !out_model) return 0;
    for (i = 0; i < database->count; ++i) {
        if (text_equals_ignore_case(database->models[i].transistor_id,
                transistor_id)) {
            *out_model = &database->models[i];
            return 1;
        }
    }
    return 0;
}

static TransistorModel* find_mutable(TransistorDatabase* database,
    const char* id)
{
    int i;
    for (i = 0; i < database->count; ++i)
        if (text_equals_ignore_case(database->models[i].transistor_id, id))
            return &database->models[i];
    return NULL;
}

static int positive(const char* text, double* value)
{
    return parse_double_token(text, value) && *value > 0.0;
}

static int nonnegative(const char* text, double* value)
{
    return parse_double_token(text, value) && *value >= 0.0;
}

int load_transistor_database(const char* file_path,
    TransistorDatabase* database)
{
    FILE* file;
    char line[CSV_LINE_SIZE];
    int line_number = 0, errors = 0;
    if (!database) return 0;
    database->count = 0;
    file = fopen(file_path, "r");
    if (!file) return 0;

    while (fgets(line, sizeof(line), file)) {
        char* fields[16];
        int count;
        TransistorModel model = {0};
        line_number++;
        trim_text(line);
        if (!line[0] || line[0] == '#' || strstr(line, "transistor_id")) continue;
        count = split_delimited(line, detect_delimiter(line), fields, 16);
        if (count != 15 || database->count >= MAX_TRANSISTORS) {
            write_log(LOG_ERROR, "Ungueltige MOSFET-Stammzeile %d", line_number);
            errors++;
            continue;
        }
        trim_text(fields[1]);
        if (!text_equals_ignore_case(fields[1], "MOSFET") ||
            !copy_text(model.transistor_id, sizeof(model.transistor_id), fields[0]) ||
            !positive(fields[2], &model.vds_max) ||
            !positive(fields[3], &model.id_max) ||
            !positive(fields[4], &model.id_pulse_max) ||
            !positive(fields[5], &model.id_pulse_duration_max_s) ||
            !nonnegative(fields[6], &model.id_pulse_duty_max) ||
            model.id_pulse_duty_max > 1.0 ||
            !parse_double_token(fields[7], &model.soa_reference_temperature_c) ||
            !positive(fields[8], &model.t_j_max) ||
            !positive(fields[9], &model.rth_jc) ||
            !nonnegative(fields[10], &model.rth_ja) ||
            !nonnegative(fields[11], &model.gate_charge_c) ||
            !copy_text(model.datasheet_url, sizeof(model.datasheet_url), fields[12]) ||
            !copy_text(model.datasheet_revision, sizeof(model.datasheet_revision), fields[13]) ||
            !copy_text(model.retrieved_date, sizeof(model.retrieved_date), fields[14])) {
            write_log(LOG_ERROR, "Ungueltige MOSFET-Stammzeile %d", line_number);
            errors++;
            continue;
        }
        model.type = TRANS_MOSFET;
        if (find_mutable(database, model.transistor_id)) {
            write_log(LOG_ERROR, "Doppelte MOSFET-ID in Stammzeile %d", line_number);
            errors++;
            continue;
        }
        database->models[database->count++] = model;
    }
    fclose(file);
    return database->count > 0 && errors == 0;
}

static ParameterizedCurve* find_or_add_curve(ParameterizedCurve* curves,
    int* curve_count, double parameter)
{
    int i;
    for (i = 0; i < *curve_count; ++i)
        if (curves[i].parameter == parameter) return &curves[i];
    if (*curve_count >= MAX_PARAMETERIZED_CURVES) return NULL;
    curves[*curve_count].parameter = parameter;
    curves[*curve_count].count = 0;
    return &curves[(*curve_count)++];
}

static void sort_points(CurvePoint* points, int count)
{
    int i;
    for (i = 1; i < count; ++i) {
        CurvePoint value = points[i];
        int j = i - 1;
        while (j >= 0 && points[j].x > value.x) {
            points[j + 1] = points[j];
            --j;
        }
        points[j + 1] = value;
    }
}

static void sort_parameterized_curves(ParameterizedCurve* curves, int count)
{
    int i;
    for (i = 1; i < count; ++i) {
        ParameterizedCurve value = curves[i];
        int j = i - 1;
        while (j >= 0 && curves[j].parameter > value.parameter) {
            curves[j + 1] = curves[j];
            --j;
        }
        curves[j + 1] = value;
    }
    for (i = 0; i < count; ++i)
        sort_points(curves[i].points, curves[i].count);
}

static int points_are_strictly_increasing(const CurvePoint* points, int count)
{
    int i;
    if (count <= 0) return 0;
    for (i = 1; i < count; ++i)
        if (points[i].x <= points[i - 1].x) return 0;
    return 1;
}

static int parameterized_curves_are_valid(const ParameterizedCurve* curves,
    int count)
{
    int i;
    if (count <= 0) return 0;
    for (i = 0; i < count; ++i) {
        if ((i > 0 && curves[i].parameter <= curves[i - 1].parameter) ||
            !points_are_strictly_increasing(curves[i].points, curves[i].count))
            return 0;
    }
    return 1;
}

int load_mosfet_curves(const char* file_path, TransistorDatabase* database)
{
    FILE* file = fopen(file_path, "r");
    char line[CSV_LINE_SIZE];
    int loaded = 0, errors = 0, line_number = 0;
    if (!file || !database) return 0;
    while (fgets(line, sizeof(line), file)) {
        char* f[6];
        double parameter, x, y;
        int count;
        TransistorModel* model;
        ParameterizedCurve* curve = NULL;
        line_number++;
        trim_text(line);
        if (!line[0] || line[0] == '#' || strstr(line, "curve_type")) continue;
        count = split_delimited(line, detect_delimiter(line), f, 6);
        if (count != 5 || !nonnegative(f[2], &parameter) ||
            !parse_double_token(f[3], &x) || !positive(f[4], &y)) {
            write_log(LOG_ERROR, "Ungueltige MOSFET-Kurvenzeile %d", line_number);
            errors++;
            continue;
        }
        model = find_mutable(database, f[0]);
        if (!model) {
            write_log(LOG_ERROR, "Unbekannte MOSFET-ID in Kurvenzeile %d",
                line_number);
            errors++;
            continue;
        }
        trim_text(f[1]);
        if (text_equals_ignore_case(f[1], "RDS_ON")) {
            if (model->rds_on_curve_count >= MAX_CURVE_POINTS) {
                errors++;
                continue;
            }
            model->rds_on_curve[model->rds_on_curve_count++] =
                (CurvePoint){x, y};
            loaded++;
            continue;
        }
        if (x <= 0.0) {
            errors++;
            continue;
        }
        if (text_equals_ignore_case(f[1], "SOA"))
            curve = find_or_add_curve(model->soa_curves,
                &model->soa_curve_count, parameter);
        else if (text_equals_ignore_case(f[1], "ZTH_JC"))
            curve = find_or_add_curve(model->zth_curves,
                &model->zth_curve_count, parameter);
        if (!curve || curve->count >= MAX_CURVE_POINTS) {
            errors++;
            continue;
        }
        curve->points[curve->count++] = (CurvePoint){x, y};
        loaded++;
    }
    fclose(file);
    {
        int i;
        for (i = 0; i < database->count; ++i) {
            TransistorModel* model = &database->models[i];
            sort_points(model->rds_on_curve, model->rds_on_curve_count);
            sort_parameterized_curves(model->soa_curves,
                model->soa_curve_count);
            sort_parameterized_curves(model->zth_curves,
                model->zth_curve_count);
            if (!points_are_strictly_increasing(model->rds_on_curve,
                    model->rds_on_curve_count) ||
                !parameterized_curves_are_valid(model->soa_curves,
                    model->soa_curve_count) ||
                !parameterized_curves_are_valid(model->zth_curves,
                    model->zth_curve_count)) {
                write_log(LOG_ERROR, "Unvollstaendige oder mehrdeutige Kurvendaten fuer %s",
                    model->transistor_id);
                errors++;
            }
        }
    }
    return loaded > 0 && errors == 0;
}

void print_transistor_database(const TransistorDatabase* database)
{
    int i;
    printf("\n--- Verfuegbare MOSFET-Modelle ---\n");
    for (i = 0; i < database->count; ++i) {
        const TransistorModel* m = &database->models[i];
        printf("%d) %-20s | VDSmax=%g V | IDmax=%g A | IDpulse=%g A | Tjmax=%g C | Quelle=%s %s\n",
            i + 1, m->transistor_id, m->vds_max, m->id_max,
            m->id_pulse_max, m->t_j_max,
            m->datasheet_revision, m->retrieved_date);
    }
}
