#include "analysis.h"
#include "config.h"
#include "csv_io.h"
#include "database.h"
#include "logging.h"
#include "transisafe_types.h"

#include <stdio.h>

static int read_nonnegative_double(const char* prompt, double* out_value)
{
    printf("%s", prompt);
    if (scanf("%lf", out_value) != 1 || *out_value < 0.0) {
        printf("Fehler: Bitte eine nichtnegative Zahl eingeben.\n");
        return 0;
    }
    return 1;
}

static int read_temperature(const char* prompt, double* out_value)
{
    printf("%s", prompt);
    if (scanf("%lf", out_value) != 1 || *out_value < -273.15) {
        printf("Fehler: Ungueltige Temperatur.\n");
        return 0;
    }
    return 1;
}

static void print_result(
    const OperatingPoint* point,
    const AnalysisResult* result,
    const OptimizationResult* optimization)
{
    printf("\n--- Analyseergebnis ---\n");
    printf("Transistor-ID:             %s\n", point->model->transistor_id);
    printf("Verlustleistung Ploss:     %.3f W\n", result->p_loss);
    printf("Sperrschichttemperatur Tj: %.2f gradC\n", result->t_j);
    printf("Leistungsreserve:          %.2f %%\n", result->power_margin_percent);
    printf("Temperaturreserve:         %.2f gradC\n", result->temperature_margin_c);
    printf("Status:                    %s\n", status_to_string(result->status));
    printf("Grund:                     %s\n", status_reason_to_string(result->status));
    if (result->status != STATUS_SAFE) {
        printf("Begrenzender Faktor:       %s\n", optimization->limiting_factor);
        if (optimization->max_current_available) {
            printf("Maximaler Strom:           %.6f A\n",
                optimization->max_current_a);
        }
        if (optimization->max_voltage_available) {
            printf("Maximale Spannung:         %.6f V\n",
                optimization->max_voltage_v);
        }
    }
}

static int run_interactive(
    const AppConfig* config,
    const TransistorDatabase* database)
{
    char transistor_id[ID_SIZE];
    const TransistorModel* model;
    OperatingPoint point;
    AnalysisResult result;
    OptimizationResult optimization;

    print_transistor_database(database);
    printf("Transistor-ID eingeben: ");
    if (scanf("%63s", transistor_id) != 1 ||
        !find_transistor_by_id(database, transistor_id, &model)) {
        printf("Fehler: Transistor-ID nicht gefunden.\n");
        return 1;
    }

    point.model = model;
    if (!read_nonnegative_double("Spannung [V]: ", &point.voltage) ||
        !read_nonnegative_double("Strom [A]: ", &point.current) ||
        !read_temperature("Tamb [gradC]: ", &point.t_amb)) {
        return 1;
    }

    result = analyze_operating_point(&point, config);
    optimization = calculate_optimization(&point, &result);
    print_result(&point, &result, &optimization);
    write_log(LOG_INFO,
        "Interaktive Analyse | ID=%s | Ploss=%.6f W | Tj=%.6f | Status=%s",
        model->transistor_id, result.p_loss, result.t_j,
        status_to_string(result.status));
    return 0;
}

int main(void)
{
    AppConfig config;
    TransistorDatabase database;
    ConfigLoadStatus config_status;
    int mode;
    int return_code;

    config_status = load_config(CONFIG_FILE_PATH, &config);
    logging_set_path(config.log_file_path);
    write_log(LOG_INFO, "TransiSafe 2.0 gestartet | Konfigurationsstatus=%d",
        config_status);

    printf("\n--- Aktive Konfiguration ---\n");
    printf("Kritische Leistungsreserve:  %.2f %%\n",
        config.critical_power_margin_percent);
    printf("Kritische Temperaturreserve: %.2f gradC\n",
        config.critical_temperature_margin_c);
    printf("Ergebnisdatei:                %s\n", config.output_file_path);
    printf("KPI-Datei:                    %s\n", config.summary_file_path);
    printf("Logdatei:                     %s\n", config.log_file_path);
    printf("Transistordatenbank:          %s\n",
        config.transistor_database_path);

    if (!load_transistor_database(config.transistor_database_path, &database)) {
        printf("Programm wird beendet: keine Transistordatenbank verfuegbar.\n");
        return 1;
    }

    printf("\n==================================================\n");
    printf("TransiSafe 2.0\n");
    printf("Simplified Thermal and Power-Based Assessment\n");
    printf("==================================================\n");
    printf("1) Interaktiv: einzelner Betriebspunkt\n");
    printf("2) CSV-Import: mehrere Betriebspunkte\n");
    printf("Modus waehlen: ");

    if (scanf("%d", &mode) != 1) {
        return 1;
    }

    if (mode == 1) {
        return_code = run_interactive(&config, &database);
    }
    else if (mode == 2) {
        return_code = run_csv_mode(&config, &database);
    }
    else {
        printf("Fehler: Bitte Modus 1 oder 2 auswaehlen.\n");
        return_code = 1;
    }

    write_log(LOG_INFO, "TransiSafe mit Rueckgabecode %d beendet.", return_code);
    return return_code;
}
