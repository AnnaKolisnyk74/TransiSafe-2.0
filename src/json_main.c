#include "analysis.h"
#include "config.h"
#include "csv_io.h"
#include "database.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define INPUT_LINE_SIZE 2048

static void print_json_string(const char* value)
{
    const unsigned char* cursor = (const unsigned char*)value;
    putchar('"');
    while (*cursor) {
        switch (*cursor) {
        case '"': fputs("\\\"", stdout); break;
        case '\\': fputs("\\\\", stdout); break;
        case '\n': fputs("\\n", stdout); break;
        case '\r': fputs("\\r", stdout); break;
        case '\t': fputs("\\t", stdout); break;
        default:
            if (*cursor < 0x20) printf("\\u%04x", *cursor);
            else putchar(*cursor);
        }
        cursor++;
    }
    putchar('"');
}

static int fail_json(const char* code, const char* message, int exit_code)
{
    fputs("{\"ok\":false,\"error\":{\"code\":", stdout);
    print_json_string(code);
    fputs(",\"message\":", stdout);
    print_json_string(message);
    fputs("}}\n", stdout);
    return exit_code;
}

static const char* boolean_json(int value)
{
    return value ? "true" : "false";
}

int main(int argc, char** argv)
{
    const char* transistor_path = "transistors.csv";
    const char* curve_path = "mosfet_curves.csv";
    TransistorDatabase* database;
    OperatingPoint point;
    AnalysisResult result;
    OptimizationResult optimization;
    AppConfig config;
    char line[INPUT_LINE_SIZE];
    char error[ERROR_MESSAGE_SIZE];
    int i;

    for (i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--transistors") == 0 && i + 1 < argc)
            transistor_path = argv[++i];
        else if (strcmp(argv[i], "--curves") == 0 && i + 1 < argc)
            curve_path = argv[++i];
        else
            return fail_json("INVALID_ARGUMENT",
                "Expected --transistors PATH or --curves PATH.", 2);
    }

    database = malloc(sizeof(*database));
    if (!database)
        return fail_json("OUT_OF_MEMORY",
            "The MOSFET database could not be allocated.", 3);
    if (!load_transistor_database(transistor_path, database) ||
        !load_mosfet_curves(curve_path, database)) {
        free(database);
        return fail_json("DATABASE_ERROR",
            "MOSFET master or curve data could not be loaded.", 4);
    }
    if (!fgets(line, sizeof(line), stdin)) {
        free(database);
        return fail_json("EMPTY_REQUEST",
            "One semicolon-delimited operating point is required on stdin.", 5);
    }
    if (!parse_operating_point_line(line, database, &point, error,
            sizeof(error))) {
        free(database);
        return fail_json("INVALID_OPERATING_POINT", error, 6);
    }

    set_default_config(&config);
    result = analyze_operating_point(&point, &config);
    optimization = calculate_optimization(&point, &result);

    fputs("{\"ok\":true,\"input\":{\"transistor_id\":", stdout);
    print_json_string(point.model->transistor_id);
    fputs(",\"mode\":", stdout);
    print_json_string(point.mode == MODE_LINEAR ? "LINEAR" : "SWITCHING");
    printf(",\"vds_v\":%.17g,\"id_a\":%.17g},", point.vds, point.id);

    fputs("\"result\":{\"status\":", stdout);
    print_json_string(status_to_string(result.status));
    fputs(",\"reason\":", stdout);
    print_json_string(status_reason_to_string(result.status));
    printf(",\"data_complete\":%s,\"p_total_w\":%.17g,"
           "\"p_conduction_w\":%.17g,\"p_switching_w\":%.17g,"
           "\"p_gate_w\":%.17g,\"tj_c\":%.17g,"
           "\"temperature_margin_c\":%.17g,\"power_margin_w\":%.17g,"
           "\"rds_on_ohm\":%.17g,\"soa_limit_a\":%.17g,"
           "\"zth_jc_k_per_w\":%.17g,\"electrical_utilization\":%.17g,"
           "\"checks\":{\"voltage\":%s,\"current\":%s,\"soa\":%s,"
           "\"temperature\":%s}},",
        boolean_json(result.data_complete), result.p_loss,
        result.conduction_loss_w, result.switching_loss_w,
        result.gate_drive_loss_w, result.t_j, result.temperature_margin_c,
        result.power_margin_w, result.rds_on_ohm,
        result.soa_current_limit_a, result.zth_jc_k_per_w,
        result.electrical_utilization, boolean_json(result.safe_voltage),
        boolean_json(result.safe_current), boolean_json(result.safe_soa),
        boolean_json(result.safe_temperature));

    printf("\"optimization\":{\"max_current_available\":%s,"
           "\"max_current_a\":%.17g,\"max_voltage_available\":%s,"
           "\"max_voltage_v\":%.17g,\"thermal_power_limit_w\":%.17g},",
        boolean_json(optimization.max_current_available),
        optimization.max_current_a,
        boolean_json(optimization.max_voltage_available),
        optimization.max_voltage_v, optimization.thermal_power_limit_w);

    fputs("\"source\":{\"datasheet_url\":", stdout);
    print_json_string(point.model->datasheet_url);
    fputs(",\"revision\":", stdout);
    print_json_string(point.model->datasheet_revision);
    fputs(",\"retrieved_date\":", stdout);
    print_json_string(point.model->retrieved_date);
    printf(",\"vds_max_v\":%.17g,\"id_continuous_max_a\":%.17g,"
           "\"id_pulse_max_a\":%.17g,\"tj_max_c\":%.17g}}\n",
        point.model->vds_max, point.model->id_max,
        point.model->id_pulse_max, point.model->t_j_max);

    free(database);
    return 0;
}
