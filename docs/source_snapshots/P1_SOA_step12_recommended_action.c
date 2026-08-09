#define _CRT_SECURE_NO_WARNINGS

#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdlib.h>
#include <errno.h>
#include <float.h>
#include <time.h>
#include <stdarg.h>

/* =========================================================
   TransiSafe 2.0 - Entwicklungsschritt 12

   Bisher:
   - Sicherheitsreserven und Statusklassen
   - Logging und externe Konfiguration
   - Transistordatenbank
   - CSV-Mehrfachimport
   - automatische Optimierungsvorschlaege

   Neu:
   - Laufzeitmessung des CSV-Batch-Prozesses
   - Export der Verarbeitungszeit in summary.csv
   - Grundlage fuer einen dokumentierten Testkatalog
   - statistische Auswertung
   - KPI-Ausgabe in der Konsole
   - kritischster Betriebspunkt
   - haeufigste Fehlerursache
   - Auswertung je Transistormodell
   - Power-BI-freundliche Datei summary.csv
   - Management-Prioritaetsstufe 1-4 je Betriebspunkt
   - Export von priority und criticality_score in results.csv
   - Handlungsempfehlung je Sicherheitsstatus
   - Export von recommended_action in results.csv
   ========================================================= */

#define CONFIG_FILE_PATH "transisafe.ini"

#define CSV_LINE_SIZE 1024
#define CONFIG_LINE_SIZE 512
#define PATH_SIZE 260
#define ERROR_MESSAGE_SIZE 256
#define ID_SIZE 64
#define MAX_TRANSISTORS 100

#define DEFAULT_CRITICAL_POWER_MARGIN_PERCENT 10.0
#define DEFAULT_CRITICAL_TEMPERATURE_MARGIN_C 10.0
#define DEFAULT_OUTPUT_FILE_PATH "results.csv"
#define DEFAULT_SUMMARY_FILE_PATH "summary.csv"
#define DEFAULT_LOG_FILE_PATH "transisafe.log"
#define DEFAULT_TRANSISTOR_DATABASE_PATH "transistors.csv"

typedef enum
{
    TRANS_BJT = 1,
    TRANS_MOSFET = 2
} TransistorType;

typedef enum
{
    STATUS_SAFE = 1,
    STATUS_CRITICAL,
    STATUS_NOT_SAFE_POWER,
    STATUS_NOT_SAFE_TEMPERATURE,
    STATUS_NOT_SAFE_BOTH
} SafetyStatus;

typedef enum
{
    LOG_INFO = 1,
    LOG_WARNING,
    LOG_ERROR
} LogLevel;

typedef enum
{
    CONFIG_LOADED = 1,
    CONFIG_DEFAULTS_USED,
    CONFIG_LOADED_WITH_WARNINGS
} ConfigLoadStatus;

typedef struct
{
    double critical_power_margin_percent;
    double critical_temperature_margin_c;

    char output_file_path[PATH_SIZE];
    char summary_file_path[PATH_SIZE];
    char log_file_path[PATH_SIZE];
    char transistor_database_path[PATH_SIZE];
} AppConfig;

typedef struct
{
    char transistor_id[ID_SIZE];
    TransistorType type;
    double p_max;
    double rth_ja;
    double t_j_max;
} TransistorModel;

typedef struct
{
    TransistorModel models[MAX_TRANSISTORS];
    int count;
} TransistorDatabase;

typedef struct
{
    const TransistorModel* model;
    double voltage;
    double current;
    double t_amb;
} OperatingPoint;

typedef struct
{
    double p_loss;
    double t_j;
    double power_margin_w;
    double power_margin_percent;
    double temperature_margin_c;

    int safe_power;
    int safe_temperature;
    SafetyStatus status;
} AnalysisResult;

typedef struct
{
    double thermal_power_limit_w;
    double allowed_power_w;

    int max_current_available;
    double max_current_a;

    int max_voltage_available;
    double max_voltage_v;

    double current_reduction_percent;
    double voltage_reduction_percent;

    const char* limiting_factor;
} OptimizationResult;

typedef struct
{
    char transistor_id[ID_SIZE];

    int total_count;
    int safe_count;
    int critical_count;
    int not_safe_count;

    double sum_tj;
    double max_tj;
} ModelStatistics;

typedef struct
{
    int total_count;
    int skipped_count;

    double processing_time_ms;

    int safe_count;
    int critical_count;
    int not_safe_power_count;
    int not_safe_temperature_count;
    int not_safe_both_count;

    double sum_tj;
    double max_tj;
    int max_tj_index;
    char max_tj_transistor_id[ID_SIZE];

    double sum_power_margin_w;
    double sum_temperature_margin_c;

    double highest_criticality_score;
    int most_critical_index;
    char most_critical_transistor_id[ID_SIZE];
    SafetyStatus most_critical_status;

    ModelStatistics model_statistics[MAX_TRANSISTORS];
    int model_statistics_count;
} StatisticsResult;

static AppConfig g_config;
static TransistorDatabase g_database;

/* =========================================================
   Hilfsfunktionen
   ========================================================= */

static void trim(char* text)
{
    char* start;
    size_t length;

    if (text == NULL) {
        return;
    }

    start = text;

    while (*start != '\0' &&
        isspace((unsigned char)*start)) {
        start++;
    }

    if (start != text) {
        memmove(text, start, strlen(start) + 1);
    }

    length = strlen(text);

    while (length > 0 &&
        isspace((unsigned char)text[length - 1])) {
        text[length - 1] = '\0';
        length--;
    }
}

static void to_upper(char* text)
{
    if (text == NULL) {
        return;
    }

    while (*text != '\0') {
        *text = (char)toupper((unsigned char)*text);
        text++;
    }
}

static int copy_text(
    char* destination,
    size_t destination_size,
    const char* source)
{
    if (destination == NULL ||
        destination_size == 0 ||
        source == NULL) {
        return 0;
    }

    if (strlen(source) >= destination_size) {
        return 0;
    }

    strcpy_s(destination, destination_size, source);
    return 1;
}

static int parse_double_token(
    const char* token,
    double* out_value)
{
    char* end_pointer;
    double value;

    if (token == NULL || out_value == NULL) {
        return 0;
    }

    while (*token != '\0' &&
        isspace((unsigned char)*token)) {
        token++;
    }

    if (*token == '\0') {
        return 0;
    }

    errno = 0;
    value = strtod(token, &end_pointer);

    if (end_pointer == token) {
        return 0;
    }

    while (*end_pointer != '\0' &&
        isspace((unsigned char)*end_pointer)) {
        end_pointer++;
    }

    if (*end_pointer != '\0' ||
        errno == ERANGE ||
        value != value ||
        value > DBL_MAX ||
        value < -DBL_MAX) {
        return 0;
    }

    *out_value = value;
    return 1;
}

static char detect_delimiter(const char* line)
{
    if (line != NULL && strchr(line, ';') != NULL) {
        return ';';
    }

    return ',';
}

static char* next_token(
    char* text,
    char delimiter,
    char** context)
{
    char delimiter_text[2];

    delimiter_text[0] = delimiter;
    delimiter_text[1] = '\0';

    return strtok_s(text, delimiter_text, context);
}

/* =========================================================
   Konfiguration
   ========================================================= */

static void set_default_config(AppConfig* config)
{
    if (config == NULL) {
        return;
    }

    config->critical_power_margin_percent =
        DEFAULT_CRITICAL_POWER_MARGIN_PERCENT;

    config->critical_temperature_margin_c =
        DEFAULT_CRITICAL_TEMPERATURE_MARGIN_C;

    copy_text(
        config->output_file_path,
        sizeof(config->output_file_path),
        DEFAULT_OUTPUT_FILE_PATH);

    copy_text(
        config->summary_file_path,
        sizeof(config->summary_file_path),
        DEFAULT_SUMMARY_FILE_PATH);

    copy_text(
        config->log_file_path,
        sizeof(config->log_file_path),
        DEFAULT_LOG_FILE_PATH);

    copy_text(
        config->transistor_database_path,
        sizeof(config->transistor_database_path),
        DEFAULT_TRANSISTOR_DATABASE_PATH);
}

static int apply_config_value(
    AppConfig* config,
    const char* key,
    const char* value,
    char* error_message,
    size_t error_message_size)
{
    double numeric_value;

    if (strcmp(key, "critical_power_margin_percent") == 0) {
        if (!parse_double_token(value, &numeric_value) ||
            numeric_value < 0.0 ||
            numeric_value > 100.0) {
            snprintf(
                error_message,
                error_message_size,
                "critical_power_margin_percent muss zwischen 0 und 100 liegen.");

            return 0;
        }

        config->critical_power_margin_percent = numeric_value;
        return 1;
    }

    if (strcmp(key, "critical_temperature_margin_c") == 0) {
        if (!parse_double_token(value, &numeric_value) ||
            numeric_value < 0.0) {
            snprintf(
                error_message,
                error_message_size,
                "critical_temperature_margin_c darf nicht negativ sein.");

            return 0;
        }

        config->critical_temperature_margin_c = numeric_value;
        return 1;
    }

    if (strcmp(key, "output_file") == 0) {
        if (!copy_text(
            config->output_file_path,
            sizeof(config->output_file_path),
            value)) {
            snprintf(
                error_message,
                error_message_size,
                "Ungueltiger oder zu langer output_file-Pfad.");

            return 0;
        }

        return 1;
    }

    if (strcmp(key, "summary_file") == 0) {
        if (!copy_text(
            config->summary_file_path,
            sizeof(config->summary_file_path),
            value)) {
            snprintf(
                error_message,
                error_message_size,
                "Ungueltiger oder zu langer summary_file-Pfad.");

            return 0;
        }

        return 1;
    }

    if (strcmp(key, "log_file") == 0) {
        if (!copy_text(
            config->log_file_path,
            sizeof(config->log_file_path),
            value)) {
            snprintf(
                error_message,
                error_message_size,
                "Ungueltiger oder zu langer log_file-Pfad.");

            return 0;
        }

        return 1;
    }

    if (strcmp(key, "transistor_database") == 0) {
        if (!copy_text(
            config->transistor_database_path,
            sizeof(config->transistor_database_path),
            value)) {
            snprintf(
                error_message,
                error_message_size,
                "Ungueltiger oder zu langer transistor_database-Pfad.");

            return 0;
        }

        return 1;
    }

    snprintf(
        error_message,
        error_message_size,
        "Unbekannter Konfigurationsschluessel: %s",
        key);

    return 0;
}

static ConfigLoadStatus load_config(
    const char* file_path,
    AppConfig* config)
{
    FILE* config_file;
    char line[CONFIG_LINE_SIZE];
    char error_message[ERROR_MESSAGE_SIZE];

    int line_number = 0;
    int warning_count = 0;

    set_default_config(config);

    config_file = fopen(file_path, "r");

    if (config_file == NULL) {
        printf(
            "Hinweis: %s wurde nicht gefunden. Standardwerte werden verwendet.\n",
            file_path);

        return CONFIG_DEFAULTS_USED;
    }

    while (fgets(line, sizeof(line), config_file) != NULL) {
        char* separator;
        char* key;
        char* value;

        line_number++;
        trim(line);

        if (line[0] == '\0' ||
            line[0] == '#' ||
            line[0] == ';') {
            continue;
        }

        separator = strchr(line, '=');

        if (separator == NULL) {
            printf(
                "Konfigurationswarnung in Zeile %d: Kein '=' gefunden.\n",
                line_number);

            warning_count++;
            continue;
        }

        *separator = '\0';
        key = line;
        value = separator + 1;

        trim(key);
        trim(value);

        if (!apply_config_value(
            config,
            key,
            value,
            error_message,
            sizeof(error_message))) {
            printf(
                "Konfigurationswarnung in Zeile %d: %s\n",
                line_number,
                error_message);

            warning_count++;
        }
    }

    fclose(config_file);

    return warning_count > 0
        ? CONFIG_LOADED_WITH_WARNINGS
        : CONFIG_LOADED;
}

/* =========================================================
   Logging
   ========================================================= */

static const char* log_level_to_string(LogLevel level)
{
    switch (level) {
    case LOG_INFO:
        return "INFO";
    case LOG_WARNING:
        return "WARNING";
    case LOG_ERROR:
        return "ERROR";
    default:
        return "UNKNOWN";
    }
}

static void write_log(
    LogLevel level,
    const char* format,
    ...)
{
    FILE* log_file;
    time_t current_time;
    struct tm local_time;
    char timestamp[32];
    va_list arguments;

    log_file = fopen(g_config.log_file_path, "a");

    if (log_file == NULL) {
        fprintf(
            stderr,
            "Warnung: Logdatei konnte nicht geoeffnet werden: %s\n",
            g_config.log_file_path);

        return;
    }

    current_time = time(NULL);

    if (localtime_s(&local_time, &current_time) != 0) {
        strcpy_s(timestamp, sizeof(timestamp), "UNKNOWN_TIME");
    }
    else {
        strftime(
            timestamp,
            sizeof(timestamp),
            "%Y-%m-%d %H:%M:%S",
            &local_time);
    }

    fprintf(
        log_file,
        "%s | %-7s | ",
        timestamp,
        log_level_to_string(level));

    va_start(arguments, format);
    vfprintf(log_file, format, arguments);
    va_end(arguments);

    fprintf(log_file, "\n");
    fclose(log_file);
}

/* =========================================================
   Typen und Status
   ========================================================= */

static int parse_type(
    const char* token,
    TransistorType* out_type)
{
    char buffer[32];

    if (token == NULL || out_type == NULL) {
        return 0;
    }

    if (!copy_text(buffer, sizeof(buffer), token)) {
        return 0;
    }

    trim(buffer);
    to_upper(buffer);

    if (strcmp(buffer, "BJT") == 0 ||
        strcmp(buffer, "1") == 0) {
        *out_type = TRANS_BJT;
        return 1;
    }

    if (strcmp(buffer, "MOSFET") == 0 ||
        strcmp(buffer, "2") == 0) {
        *out_type = TRANS_MOSFET;
        return 1;
    }

    return 0;
}

static const char* transistor_type_to_string(
    TransistorType type)
{
    switch (type) {
    case TRANS_BJT:
        return "BJT";
    case TRANS_MOSFET:
        return "MOSFET";
    default:
        return "UNKNOWN";
    }
}

static const char* status_to_string(
    SafetyStatus status)
{
    switch (status) {
    case STATUS_SAFE:
        return "SAFE";
    case STATUS_CRITICAL:
        return "CRITICAL";
    case STATUS_NOT_SAFE_POWER:
        return "NOT_SAFE_POWER";
    case STATUS_NOT_SAFE_TEMPERATURE:
        return "NOT_SAFE_TEMPERATURE";
    case STATUS_NOT_SAFE_BOTH:
        return "NOT_SAFE_BOTH";
    default:
        return "UNKNOWN";
    }
}

static const char* status_reason_to_string(
    SafetyStatus status)
{
    switch (status) {
    case STATUS_SAFE:
        return "NONE";
    case STATUS_CRITICAL:
        return "LOW_MARGIN";
    case STATUS_NOT_SAFE_POWER:
        return "POWER";
    case STATUS_NOT_SAFE_TEMPERATURE:
        return "TEMPERATURE";
    case STATUS_NOT_SAFE_BOTH:
        return "POWER_AND_TEMPERATURE";
    default:
        return "UNKNOWN";
    }
}

static int priority_from_status(
    SafetyStatus status)
{
    switch (status) {
    case STATUS_NOT_SAFE_BOTH:
        return 1;

    case STATUS_NOT_SAFE_POWER:
    case STATUS_NOT_SAFE_TEMPERATURE:
        return 2;

    case STATUS_CRITICAL:
        return 3;

    case STATUS_SAFE:
        return 4;

    default:
        return 99;
    }
}

static const char* recommended_action_from_status(
    SafetyStatus status)
{
    switch (status) {
    case STATUS_NOT_SAFE_BOTH:
        return "Immediate technical review";

    case STATUS_NOT_SAFE_TEMPERATURE:
        return "Correct thermal operating condition";

    case STATUS_NOT_SAFE_POWER:
        return "Correct electrical operating condition";

    case STATUS_CRITICAL:
        return "Monitor / investigate";

    case STATUS_SAFE:
        return "No immediate action";

    default:
        return "Review required";
    }
}

/* =========================================================
   Transistordatenbank
   ========================================================= */

static int find_transistor_by_id(
    const TransistorDatabase* database,
    const char* transistor_id,
    const TransistorModel** out_model)
{
    int i;

    if (database == NULL ||
        transistor_id == NULL ||
        out_model == NULL) {
        return 0;
    }

    for (i = 0; i < database->count; i++) {
        if (_stricmp(
            database->models[i].transistor_id,
            transistor_id) == 0) {
            *out_model = &database->models[i];
            return 1;
        }
    }

    return 0;
}

static int parse_transistor_model_line(
    char* line,
    TransistorModel* model,
    char* error_message,
    size_t error_message_size)
{
    char delimiter;
    char* context = NULL;
    char* token;

    delimiter = detect_delimiter(line);

    token = next_token(line, delimiter, &context);

    if (token == NULL) {
        snprintf(
            error_message,
            error_message_size,
            "transistor_id fehlt.");

        return 0;
    }

    trim(token);

    if (!copy_text(
        model->transistor_id,
        sizeof(model->transistor_id),
        token)) {
        snprintf(
            error_message,
            error_message_size,
            "transistor_id ist leer oder zu lang.");

        return 0;
    }

    token = next_token(NULL, delimiter, &context);

    if (token == NULL ||
        !parse_type(token, &model->type)) {
        snprintf(
            error_message,
            error_message_size,
            "Ungueltiger Transistortyp.");

        return 0;
    }

    token = next_token(NULL, delimiter, &context);

    if (token == NULL ||
        !parse_double_token(token, &model->p_max) ||
        model->p_max <= 0.0) {
        snprintf(
            error_message,
            error_message_size,
            "Ungueltiger Pmax-Wert.");

        return 0;
    }

    token = next_token(NULL, delimiter, &context);

    if (token == NULL ||
        !parse_double_token(token, &model->rth_ja) ||
        model->rth_ja <= 0.0) {
        snprintf(
            error_message,
            error_message_size,
            "Ungueltiger RthJA-Wert.");

        return 0;
    }

    token = next_token(NULL, delimiter, &context);

    if (token == NULL ||
        !parse_double_token(token, &model->t_j_max) ||
        model->t_j_max <= 0.0) {
        snprintf(
            error_message,
            error_message_size,
            "Ungueltiger Tjmax-Wert.");

        return 0;
    }

    token = next_token(NULL, delimiter, &context);

    if (token != NULL) {
        trim(token);

        if (token[0] != '\0') {
            snprintf(
                error_message,
                error_message_size,
                "Zu viele Felder in der Transistorzeile.");

            return 0;
        }
    }

    return 1;
}

static int load_transistor_database(
    const char* file_path,
    TransistorDatabase* database)
{
    FILE* file;
    char line[CSV_LINE_SIZE];
    char working_line[CSV_LINE_SIZE];
    char error_message[ERROR_MESSAGE_SIZE];

    int line_number = 0;

    if (database == NULL) {
        return 0;
    }

    database->count = 0;

    file = fopen(file_path, "r");

    if (file == NULL) {
        printf(
            "Fehler: Transistordatenbank konnte nicht geoeffnet werden: %s\n",
            file_path);

        write_log(
            LOG_ERROR,
            "Transistordatenbank konnte nicht geoeffnet werden: %s",
            file_path);

        return 0;
    }

    while (fgets(line, sizeof(line), file) != NULL) {
        TransistorModel model;
        const TransistorModel* duplicate;

        line_number++;
        trim(line);

        if (line[0] == '\0' ||
            line[0] == '#') {
            continue;
        }

        if (!copy_text(
            working_line,
            sizeof(working_line),
            line)) {
            continue;
        }

        to_upper(working_line);

        if (strstr(working_line, "TRANSISTOR_ID") != NULL &&
            strstr(working_line, "PMAX") != NULL) {
            continue;
        }

        if (database->count >= MAX_TRANSISTORS) {
            printf(
                "Warnung: Maximale Anzahl von %d Transistoren erreicht.\n",
                MAX_TRANSISTORS);

            write_log(
                LOG_WARNING,
                "Maximale Anzahl von %d Transistoren erreicht.",
                MAX_TRANSISTORS);

            break;
        }

        if (!copy_text(
            working_line,
            sizeof(working_line),
            line)) {
            continue;
        }

        if (!parse_transistor_model_line(
            working_line,
            &model,
            error_message,
            sizeof(error_message))) {
            printf(
                "Datenbankzeile %d uebersprungen: %s\n",
                line_number,
                error_message);

            write_log(
                LOG_ERROR,
                "Datenbankzeile %d uebersprungen | Fehler=%s | Inhalt=%s",
                line_number,
                error_message,
                line);

            continue;
        }

        if (find_transistor_by_id(
            database,
            model.transistor_id,
            &duplicate)) {
            printf(
                "Datenbankzeile %d uebersprungen: Doppelte ID %s\n",
                line_number,
                model.transistor_id);

            write_log(
                LOG_ERROR,
                "Doppelte Transistor-ID in Zeile %d: %s",
                line_number,
                model.transistor_id);

            continue;
        }

        database->models[database->count] = model;
        database->count++;
    }

    fclose(file);

    if (database->count == 0) {
        printf(
            "Fehler: Keine gueltigen Transistormodelle geladen.\n");

        write_log(
            LOG_ERROR,
            "Keine gueltigen Transistormodelle geladen.");

        return 0;
    }

    write_log(
        LOG_INFO,
        "Transistordatenbank geladen | Datei=%s | Modelle=%d",
        file_path,
        database->count);

    return 1;
}

static void print_transistor_database(
    const TransistorDatabase* database)
{
    int i;

    printf("\n--- Verfuegbare Transistormodelle ---\n");

    for (i = 0; i < database->count; i++) {
        const TransistorModel* model =
            &database->models[i];

        printf(
            "%d) %-20s | %-6s | Pmax=%7.2f W | "
            "RthJA=%7.2f gradC/W | Tjmax=%7.2f gradC\n",
            i + 1,
            model->transistor_id,
            transistor_type_to_string(model->type),
            model->p_max,
            model->rth_ja,
            model->t_j_max);
    }

    printf("--------------------------------------\n");
}

/* =========================================================
   Analyse
   ========================================================= */

static AnalysisResult analyze_operating_point(
    const OperatingPoint* point)
{
    AnalysisResult result;
    const TransistorModel* model = point->model;

    result.p_loss =
        point->voltage * point->current;

    result.t_j =
        point->t_amb +
        result.p_loss * model->rth_ja;

    result.power_margin_w =
        model->p_max - result.p_loss;

    result.power_margin_percent =
        (result.power_margin_w / model->p_max) * 100.0;

    result.temperature_margin_c =
        model->t_j_max - result.t_j;

    result.safe_power =
        result.p_loss <= model->p_max;

    result.safe_temperature =
        result.t_j <= model->t_j_max;

    if (!result.safe_power &&
        !result.safe_temperature) {
        result.status = STATUS_NOT_SAFE_BOTH;
    }
    else if (!result.safe_power) {
        result.status = STATUS_NOT_SAFE_POWER;
    }
    else if (!result.safe_temperature) {
        result.status = STATUS_NOT_SAFE_TEMPERATURE;
    }
    else if (
        result.power_margin_percent <
        g_config.critical_power_margin_percent ||
        result.temperature_margin_c <
        g_config.critical_temperature_margin_c) {
        result.status = STATUS_CRITICAL;
    }
    else {
        result.status = STATUS_SAFE;
    }

    return result;
}


static OptimizationResult calculate_optimization(
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
        optimization.allowed_power_w =
            optimization.thermal_power_limit_w;
        optimization.limiting_factor = "TEMPERATURE";
    }
    else {
        optimization.allowed_power_w = model->p_max;
        optimization.limiting_factor = "POWER_AND_TEMPERATURE";
    }

    optimization.max_current_available =
        point->voltage > 0.0;

    optimization.max_current_a =
        optimization.max_current_available
        ? optimization.allowed_power_w / point->voltage
        : 0.0;

    optimization.max_voltage_available =
        point->current > 0.0;

    optimization.max_voltage_v =
        optimization.max_voltage_available
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

static void print_optimization_result(
    const OperatingPoint* point,
    const AnalysisResult* analysis,
    const OptimizationResult* optimization)
{
    if (analysis->status == STATUS_SAFE) {
        return;
    }

    printf("\n--- Optimierungsvorschlag ---\n");
    printf(
        "Begrenzender Faktor:       %s\n",
        optimization->limiting_factor);

    printf(
        "Thermische Leistungsgrenze: %.3f W\n",
        optimization->thermal_power_limit_w);

    printf(
        "Zulaessige Verlustleistung:  %.3f W\n",
        optimization->allowed_power_w);

    if (optimization->max_current_available) {
        printf(
            "Maximaler Strom bei %.3f V: %.6f A\n",
            point->voltage,
            optimization->max_current_a);
    }
    else {
        printf(
            "Maximaler Strom:            nicht berechenbar bei 0 V\n");
    }

    if (optimization->max_voltage_available) {
        printf(
            "Maximale Spannung bei %.3f A: %.6f V\n",
            point->current,
            optimization->max_voltage_v);
    }
    else {
        printf(
            "Maximale Spannung:          nicht berechenbar bei 0 A\n");
    }

    if (optimization->current_reduction_percent > 0.0) {
        printf(
            "Erforderliche Stromreduktion: %.2f %%\n",
            optimization->current_reduction_percent);
    }

    if (optimization->voltage_reduction_percent > 0.0) {
        printf(
            "Erforderliche Spannungsreduktion: %.2f %%\n",
            optimization->voltage_reduction_percent);
    }

    if (analysis->status == STATUS_CRITICAL) {
        printf(
            "Hinweis: Keine unmittelbare Reduktion erforderlich, "
            "aber die Sicherheitsreserve ist gering.\n");
    }

    printf("--------------------------------\n");
}

static void print_case_result(
    int index,
    const OperatingPoint* point,
    const AnalysisResult* result)
{
    const TransistorModel* model = point->model;

    printf("\n==================================================\n");
    printf("Betriebspunkt %d\n", index);
    printf("==================================================\n");

    printf(
        "Transistor-ID:             %s\n",
        model->transistor_id);

    printf(
        "Transistortyp:             %s\n",
        transistor_type_to_string(model->type));

    if (model->type == TRANS_BJT) {
        printf("Vce:                       %.3f V\n", point->voltage);
        printf("Ic:                        %.3f A\n", point->current);
    }
    else {
        printf("Vds:                       %.3f V\n", point->voltage);
        printf("Id:                        %.3f A\n", point->current);
    }

    printf("Pmax aus Datenbank:        %.3f W\n", model->p_max);
    printf("RthJA aus Datenbank:       %.3f gradC/W\n", model->rth_ja);
    printf("Tjmax aus Datenbank:       %.2f gradC\n", model->t_j_max);

    printf("Verlustleistung Ploss:     %.3f W\n", result->p_loss);
    printf("Leistungsreserve:          %.3f W\n", result->power_margin_w);
    printf("Leistungsreserve:          %.2f %%\n", result->power_margin_percent);
    printf("Umgebungstemperatur:       %.2f gradC\n", point->t_amb);
    printf("Sperrschichttemperatur Tj: %.2f gradC\n", result->t_j);
    printf("Temperaturreserve:         %.2f gradC\n", result->temperature_margin_c);
    printf("Status:                    %s\n", status_to_string(result->status));
    printf("Grund:                     %s\n", status_reason_to_string(result->status));
    printf("Prioritaet:                %d\n", priority_from_status(result->status));
    printf("Empfohlene Massnahme:      %s\n", recommended_action_from_status(result->status));
}

/* =========================================================
   Eingabe
   ========================================================= */

static int read_double(
    const char* prompt,
    double* out_value)
{
    printf("%s", prompt);

    if (scanf("%lf", out_value) != 1) {
        return 0;
    }

    return 1;
}

static int read_nonnegative_double(
    const char* prompt,
    double* out_value)
{
    if (!read_double(prompt, out_value)) {
        printf("Fehler: Keine gueltige Zahl.\n");
        return 0;
    }

    if (*out_value < 0.0) {
        printf("Fehler: Wert darf nicht negativ sein.\n");
        return 0;
    }

    return 1;
}

static int read_temperature(
    const char* prompt,
    double* out_value)
{
    if (!read_double(prompt, out_value)) {
        printf("Fehler: Keine gueltige Zahl.\n");
        return 0;
    }

    if (*out_value < -273.15) {
        printf("Fehler: Temperatur unter -273.15 gradC ist unzulaessig.\n");
        return 0;
    }

    return 1;
}

/* =========================================================
   Interaktiver Modus
   ========================================================= */

static int run_interactive(void)
{
    char transistor_id[ID_SIZE];
    const TransistorModel* model;
    OperatingPoint point;
    AnalysisResult result;
    OptimizationResult optimization;

    write_log(LOG_INFO, "Interaktiver Modus gestartet.");

    print_transistor_database(&g_database);

    printf("Transistor-ID eingeben: ");

    if (scanf("%63s", transistor_id) != 1) {
        printf("Fehler: Transistor-ID konnte nicht gelesen werden.\n");
        write_log(LOG_ERROR, "Transistor-ID konnte nicht gelesen werden.");
        return 1;
    }

    if (!find_transistor_by_id(
        &g_database,
        transistor_id,
        &model)) {
        printf(
            "Fehler: Transistor-ID nicht gefunden: %s\n",
            transistor_id);

        write_log(
            LOG_ERROR,
            "Transistor-ID nicht gefunden: %s",
            transistor_id);

        return 1;
    }

    point.model = model;

    if (model->type == TRANS_BJT) {
        if (!read_nonnegative_double("Vce [V]: ", &point.voltage) ||
            !read_nonnegative_double("Ic [A]: ", &point.current)) {
            return 1;
        }
    }
    else {
        if (!read_nonnegative_double("Vds [V]: ", &point.voltage) ||
            !read_nonnegative_double("Id [A]: ", &point.current)) {
            return 1;
        }
    }

    if (!read_temperature("Tamb [gradC]: ", &point.t_amb)) {
        return 1;
    }

    result = analyze_operating_point(&point);
    optimization = calculate_optimization(&point, &result);

    print_case_result(1, &point, &result);
    print_optimization_result(&point, &result, &optimization);

    write_log(
        LOG_INFO,
        "Interaktive Analyse | ID=%s | Typ=%s | "
        "Spannung=%.6f V | Strom=%.6f A | "
        "Ploss=%.6f W | Tj=%.6f gradC | Status=%s",
        model->transistor_id,
        transistor_type_to_string(model->type),
        point.voltage,
        point.current,
        result.p_loss,
        result.t_j,
        status_to_string(result.status));

    if (result.status != STATUS_SAFE) {
        write_log(
            LOG_WARNING,
            "Betriebspunkt nicht vollstaendig sicher | ID=%s | "
            "Status=%s | Limit=%s | AllowedPower=%.6f W | "
            "MaxCurrent=%.6f A | CurrentReduction=%.2f %% | "
            "MaxVoltage=%.6f V | VoltageReduction=%.2f %%",
            model->transistor_id,
            status_to_string(result.status),
            optimization.limiting_factor,
            optimization.allowed_power_w,
            optimization.max_current_a,
            optimization.current_reduction_percent,
            optimization.max_voltage_v,
            optimization.voltage_reduction_percent);
    }

    return 0;
}

/* =========================================================
   CSV-Modus
   ========================================================= */

static int parse_operating_point_line(
    char* line,
    OperatingPoint* point,
    char* error_message,
    size_t error_message_size)
{
    char delimiter;
    char* context = NULL;
    char* token;
    const TransistorModel* model;

    delimiter = detect_delimiter(line);

    token = next_token(line, delimiter, &context);

    if (token == NULL) {
        snprintf(error_message, error_message_size, "Transistor-ID fehlt.");
        return 0;
    }

    trim(token);

    if (!find_transistor_by_id(
        &g_database,
        token,
        &model)) {
        snprintf(
            error_message,
            error_message_size,
            "Transistor-ID nicht gefunden: %s",
            token);

        return 0;
    }

    point->model = model;

    token = next_token(NULL, delimiter, &context);

    if (token == NULL ||
        !parse_double_token(token, &point->voltage) ||
        point->voltage < 0.0) {
        snprintf(error_message, error_message_size, "Ungueltige Spannung.");
        return 0;
    }

    token = next_token(NULL, delimiter, &context);

    if (token == NULL ||
        !parse_double_token(token, &point->current) ||
        point->current < 0.0) {
        snprintf(error_message, error_message_size, "Ungueltiger Strom.");
        return 0;
    }

    token = next_token(NULL, delimiter, &context);

    if (token == NULL ||
        !parse_double_token(token, &point->t_amb) ||
        point->t_amb < -273.15) {
        snprintf(
            error_message,
            error_message_size,
            "Ungueltige Umgebungstemperatur.");

        return 0;
    }

    token = next_token(NULL, delimiter, &context);

    if (token != NULL) {
        trim(token);

        if (token[0] != '\0') {
            snprintf(
                error_message,
                error_message_size,
                "Zu viele CSV-Felder.");

            return 0;
        }
    }

    return 1;
}


static void initialize_statistics(
    StatisticsResult* statistics)
{
    int i;

    memset(statistics, 0, sizeof(*statistics));

    statistics->max_tj = -DBL_MAX;
    statistics->highest_criticality_score = -DBL_MAX;
    statistics->max_tj_index = 0;
    statistics->most_critical_index = 0;
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

    for (i = 0;
        i < statistics->model_statistics_count;
        i++) {
        if (_stricmp(
            statistics->model_statistics[i].transistor_id,
            transistor_id) == 0) {
            return i;
        }
    }

    if (statistics->model_statistics_count >= MAX_TRANSISTORS) {
        return -1;
    }

    i = statistics->model_statistics_count;
    statistics->model_statistics_count++;

    copy_text(
        statistics->model_statistics[i].transistor_id,
        sizeof(statistics->model_statistics[i].transistor_id),
        transistor_id);

    statistics->model_statistics[i].total_count = 0;
    statistics->model_statistics[i].safe_count = 0;
    statistics->model_statistics[i].critical_count = 0;
    statistics->model_statistics[i].not_safe_count = 0;
    statistics->model_statistics[i].sum_tj = 0.0;
    statistics->model_statistics[i].max_tj = -DBL_MAX;

    return i;
}

static double calculate_criticality_score(
    const OperatingPoint* point,
    const AnalysisResult* result)
{
    double power_utilization;
    double temperature_utilization;

    power_utilization =
        result->p_loss / point->model->p_max;

    temperature_utilization =
        result->t_j / point->model->t_j_max;

    return power_utilization > temperature_utilization
        ? power_utilization
        : temperature_utilization;
}

static void update_statistics(
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
    statistics->sum_power_margin_w +=
        result->power_margin_w;
    statistics->sum_temperature_margin_c +=
        result->temperature_margin_c;

    if (result->t_j > statistics->max_tj) {
        statistics->max_tj = result->t_j;
        statistics->max_tj_index = case_index;

        copy_text(
            statistics->max_tj_transistor_id,
            sizeof(statistics->max_tj_transistor_id),
            point->model->transistor_id);
    }

    criticality_score =
        calculate_criticality_score(point, result);

    if (criticality_score >
        statistics->highest_criticality_score) {
        statistics->highest_criticality_score =
            criticality_score;

        statistics->most_critical_index =
            case_index;

        statistics->most_critical_status =
            result->status;

        copy_text(
            statistics->most_critical_transistor_id,
            sizeof(statistics->most_critical_transistor_id),
            point->model->transistor_id);
    }

    switch (result->status) {
    case STATUS_SAFE:
        statistics->safe_count++;
        break;

    case STATUS_CRITICAL:
        statistics->critical_count++;
        break;

    case STATUS_NOT_SAFE_POWER:
        statistics->not_safe_power_count++;
        break;

    case STATUS_NOT_SAFE_TEMPERATURE:
        statistics->not_safe_temperature_count++;
        break;

    case STATUS_NOT_SAFE_BOTH:
        statistics->not_safe_both_count++;
        break;

    default:
        break;
    }

    model_index =
        find_or_create_model_statistics(
            statistics,
            point->model->transistor_id);

    if (model_index < 0) {
        return;
    }

    model_statistics =
        &statistics->model_statistics[model_index];

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

static double percentage(
    int part,
    int total)
{
    if (total <= 0) {
        return 0.0;
    }

    return ((double)part / (double)total) * 100.0;
}

static int total_not_safe_count(
    const StatisticsResult* statistics)
{
    return
        statistics->not_safe_power_count +
        statistics->not_safe_temperature_count +
        statistics->not_safe_both_count;
}

static const char* most_frequent_failure_reason(
    const StatisticsResult* statistics)
{
    int power_count =
        statistics->not_safe_power_count;

    int temperature_count =
        statistics->not_safe_temperature_count;

    int both_count =
        statistics->not_safe_both_count;

    int maximum = power_count;

    if (temperature_count > maximum) {
        maximum = temperature_count;
    }

    if (both_count > maximum) {
        maximum = both_count;
    }

    if (maximum == 0) {
        return "NONE";
    }

    if ((power_count == maximum &&
        temperature_count == maximum) ||
        (power_count == maximum &&
            both_count == maximum) ||
        (temperature_count == maximum &&
            both_count == maximum)) {
        return "TIE";
    }

    if (power_count == maximum) {
        return "POWER";
    }

    if (temperature_count == maximum) {
        return "TEMPERATURE";
    }

    return "POWER_AND_TEMPERATURE";
}

static void print_statistics(
    const StatisticsResult* statistics)
{
    int not_safe_count;
    int i;

    if (statistics->total_count <= 0) {
        printf(
            "\nKeine gueltigen Betriebspunkte fuer "
            "die Statistik vorhanden.\n");

        return;
    }

    not_safe_count =
        total_not_safe_count(statistics);

    printf("\n==================================================\n");
    printf("Statistische Auswertung und KPIs\n");
    printf("==================================================\n");

    printf(
        "Gesamtzahl Betriebspunkte:       %d\n",
        statistics->total_count);

    printf(
        "Verarbeitungszeit:               %.3f ms\n",
        statistics->processing_time_ms);

    printf(
        "SAFE-Anteil:                    %.2f %%\n",
        percentage(
            statistics->safe_count,
            statistics->total_count));

    printf(
        "CRITICAL-Anteil:                %.2f %%\n",
        percentage(
            statistics->critical_count,
            statistics->total_count));

    printf(
        "NOT-SAFE-Anteil:                %.2f %%\n",
        percentage(
            not_safe_count,
            statistics->total_count));

    printf(
        "Durchschnittliche Tj:           %.2f gradC\n",
        statistics->sum_tj /
        statistics->total_count);

    printf(
        "Hoechste Tj:                    %.2f gradC\n",
        statistics->max_tj);

    printf(
        "Hoechste Tj bei Index:          %d\n",
        statistics->max_tj_index);

    printf(
        "Hoechste Tj bei Transistor:     %s\n",
        statistics->max_tj_transistor_id);

    printf(
        "Durchschnittliche P-Reserve:    %.3f W\n",
        statistics->sum_power_margin_w /
        statistics->total_count);

    printf(
        "Durchschnittliche T-Reserve:    %.2f gradC\n",
        statistics->sum_temperature_margin_c /
        statistics->total_count);

    printf(
        "Kritischster Betriebspunkt:     %d\n",
        statistics->most_critical_index);

    printf(
        "Kritischster Transistor:        %s\n",
        statistics->most_critical_transistor_id);

    printf(
        "Status des kritischsten Punkts: %s\n",
        status_to_string(
            statistics->most_critical_status));

    printf(
        "Kritikalitaetswert:             %.4f\n",
        statistics->highest_criticality_score);

    printf(
        "Haeufigste Fehlerursache:       %s\n",
        most_frequent_failure_reason(statistics));

    printf("\n--- Auswertung je Transistormodell ---\n");

    for (i = 0;
        i < statistics->model_statistics_count;
        i++) {
        const ModelStatistics* model =
            &statistics->model_statistics[i];

        printf(
            "%-20s | Gesamt=%d | SAFE=%d | "
            "CRITICAL=%d | NOT_SAFE=%d | "
            "AvgTj=%.2f | MaxTj=%.2f\n",
            model->transistor_id,
            model->total_count,
            model->safe_count,
            model->critical_count,
            model->not_safe_count,
            model->sum_tj / model->total_count,
            model->max_tj);
    }
}

static void write_summary_numeric(
    FILE* file,
    const char* scope,
    const char* transistor_id,
    const char* kpi,
    double numeric_value)
{
    fprintf(
        file,
        "%s,%s,%s,%.6f,\n",
        scope,
        transistor_id,
        kpi,
        numeric_value);
}

static void write_summary_text(
    FILE* file,
    const char* scope,
    const char* transistor_id,
    const char* kpi,
    const char* text_value)
{
    fprintf(
        file,
        "%s,%s,%s,,%s\n",
        scope,
        transistor_id,
        kpi,
        text_value);
}

static int write_summary_csv(
    const char* file_path,
    const StatisticsResult* statistics)
{
    FILE* file;
    int not_safe_count;
    int i;

    file = fopen(file_path, "w");

    if (file == NULL) {
        printf(
            "Fehler: KPI-Datei konnte nicht geschrieben werden: %s\n",
            file_path);

        write_log(
            LOG_ERROR,
            "KPI-Datei konnte nicht geschrieben werden: %s",
            file_path);

        return 0;
    }

    fprintf(
        file,
        "scope,transistor_id,kpi,numeric_value,text_value\n");

    not_safe_count =
        total_not_safe_count(statistics);

    write_summary_numeric(
        file, "overall", "ALL",
        "total_points",
        statistics->total_count);

    write_summary_numeric(
        file, "overall", "ALL",
        "skipped_points",
        statistics->skipped_count);

    write_summary_numeric(
        file, "overall", "ALL",
        "processing_time_ms",
        statistics->processing_time_ms);

    write_summary_numeric(
        file, "overall", "ALL",
        "safe_count",
        statistics->safe_count);

    write_summary_numeric(
        file, "overall", "ALL",
        "safe_percent",
        percentage(
            statistics->safe_count,
            statistics->total_count));

    write_summary_numeric(
        file, "overall", "ALL",
        "critical_count",
        statistics->critical_count);

    write_summary_numeric(
        file, "overall", "ALL",
        "critical_percent",
        percentage(
            statistics->critical_count,
            statistics->total_count));

    write_summary_numeric(
        file, "overall", "ALL",
        "not_safe_count",
        not_safe_count);

    write_summary_numeric(
        file, "overall", "ALL",
        "not_safe_percent",
        percentage(
            not_safe_count,
            statistics->total_count));

    if (statistics->total_count > 0) {
        write_summary_numeric(
            file, "overall", "ALL",
            "average_tj_c",
            statistics->sum_tj /
            statistics->total_count);

        write_summary_numeric(
            file, "overall", "ALL",
            "max_tj_c",
            statistics->max_tj);

        write_summary_numeric(
            file, "overall", "ALL",
            "average_power_margin_w",
            statistics->sum_power_margin_w /
            statistics->total_count);

        write_summary_numeric(
            file, "overall", "ALL",
            "average_temperature_margin_c",
            statistics->sum_temperature_margin_c /
            statistics->total_count);

        write_summary_numeric(
            file, "overall", "ALL",
            "most_critical_index",
            statistics->most_critical_index);

        write_summary_numeric(
            file, "overall", "ALL",
            "criticality_score",
            statistics->highest_criticality_score);

        write_summary_text(
            file, "overall", "ALL",
            "most_critical_transistor_id",
            statistics->most_critical_transistor_id);

        write_summary_text(
            file, "overall", "ALL",
            "most_critical_status",
            status_to_string(
                statistics->most_critical_status));

        write_summary_text(
            file, "overall", "ALL",
            "most_frequent_failure_reason",
            most_frequent_failure_reason(
                statistics));
    }

    for (i = 0;
        i < statistics->model_statistics_count;
        i++) {
        const ModelStatistics* model =
            &statistics->model_statistics[i];

        write_summary_numeric(
            file, "model",
            model->transistor_id,
            "total_points",
            model->total_count);

        write_summary_numeric(
            file, "model",
            model->transistor_id,
            "safe_count",
            model->safe_count);

        write_summary_numeric(
            file, "model",
            model->transistor_id,
            "critical_count",
            model->critical_count);

        write_summary_numeric(
            file, "model",
            model->transistor_id,
            "not_safe_count",
            model->not_safe_count);

        write_summary_numeric(
            file, "model",
            model->transistor_id,
            "safe_percent",
            percentage(
                model->safe_count,
                model->total_count));

        write_summary_numeric(
            file, "model",
            model->transistor_id,
            "average_tj_c",
            model->sum_tj /
            model->total_count);

        write_summary_numeric(
            file, "model",
            model->transistor_id,
            "max_tj_c",
            model->max_tj);
    }

    fclose(file);
    return 1;
}

static int run_csv(void)
{
    char input_path[PATH_SIZE];

    FILE* input_file;
    FILE* output_file;

    char line[CSV_LINE_SIZE];
    char working_line[CSV_LINE_SIZE];
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
        printf(
            "Fehler: Datei konnte nicht geoeffnet werden: %s\n",
            input_path);

        write_log(
            LOG_ERROR,
            "CSV-Datei konnte nicht geoeffnet werden: %s",
            input_path);

        return 1;
    }

    output_file = fopen(g_config.output_file_path, "w");

    if (output_file == NULL) {
        fclose(input_file);

        printf(
            "Fehler: Ergebnisdatei konnte nicht geschrieben werden: %s\n",
            g_config.output_file_path);

        return 1;
    }

    start_clock = clock();

    fprintf(
        output_file,
        "idx,transistor_id,type,voltage,current,p_loss,pmax,"
        "power_margin_w,power_margin_pct,tamb,rthja,tj,tjmax,"
        "temperature_margin_c,status,reason,priority,criticality_score,"
        "recommended_action,thermal_power_limit_w,allowed_power_w,limiting_factor,"
        "max_current_available,max_current_a,current_reduction_pct,"
        "max_voltage_available,max_voltage_v,voltage_reduction_pct\n");

    while (fgets(line, sizeof(line), input_file) != NULL) {
        OperatingPoint point;
        AnalysisResult result;
        OptimizationResult optimization;
        int priority;
        double criticality_score;

        file_line_number++;
        trim(line);

        if (line[0] == '\0' ||
            line[0] == '#') {
            continue;
        }

        copy_text(
            working_line,
            sizeof(working_line),
            line);

        to_upper(working_line);

        if (strstr(
            working_line,
            "TRANSISTOR_ID") != NULL &&
            strstr(
                working_line,
                "VOLTAGE") != NULL) {
            continue;
        }

        copy_text(
            working_line,
            sizeof(working_line),
            line);

        if (!parse_operating_point_line(
            working_line,
            &point,
            error_message,
            sizeof(error_message))) {
            statistics.skipped_count++;

            printf(
                "CSV-Zeile %d uebersprungen: %s\n",
                file_line_number,
                error_message);

            write_log(
                LOG_ERROR,
                "CSV-Zeile %d uebersprungen | "
                "Fehler=%s | Inhalt=%s",
                file_line_number,
                error_message,
                line);

            continue;
        }

        case_index++;

        result =
            analyze_operating_point(&point);

        optimization =
            calculate_optimization(
                &point,
                &result);

        priority =
            priority_from_status(result.status);

        criticality_score =
            calculate_criticality_score(
                &point,
                &result);

        print_case_result(
            case_index,
            &point,
            &result);

        print_optimization_result(
            &point,
            &result,
            &optimization);

        update_statistics(
            &statistics,
            case_index,
            &point,
            &result);

        fprintf(
            output_file,
            "%d,%s,%s,%.6f,%.6f,%.6f,%.6f,"
            "%.6f,%.6f,%.6f,%.6f,%.6f,%.6f,"
            "%.6f,%s,%s,%d,%.6f,%s,"
            "%.6f,%.6f,%s,%d,%.6f,%.6f,%d,%.6f,%.6f\n",
            case_index,
            point.model->transistor_id,
            transistor_type_to_string(
                point.model->type),
            point.voltage,
            point.current,
            result.p_loss,
            point.model->p_max,
            result.power_margin_w,
            result.power_margin_percent,
            point.t_amb,
            point.model->rth_ja,
            result.t_j,
            point.model->t_j_max,
            result.temperature_margin_c,
            status_to_string(result.status),
            status_reason_to_string(result.status),
            priority,
            criticality_score,
            recommended_action_from_status(result.status),
            optimization.thermal_power_limit_w,
            optimization.allowed_power_w,
            optimization.limiting_factor,
            optimization.max_current_available,
            optimization.max_current_a,
            optimization.current_reduction_percent,
            optimization.max_voltage_available,
            optimization.max_voltage_v,
            optimization.voltage_reduction_percent);

        if (result.status != STATUS_SAFE) {
            write_log(
                LOG_INFO,
                "Optimierung berechnet | Index=%d | ID=%s | "
                "Limit=%s | AllowedPower=%.6f W | "
                "MaxCurrent=%.6f A | CurrentReduction=%.2f %% | "
                "MaxVoltage=%.6f V | VoltageReduction=%.2f %%",
                case_index,
                point.model->transistor_id,
                optimization.limiting_factor,
                optimization.allowed_power_w,
                optimization.max_current_a,
                optimization.current_reduction_percent,
                optimization.max_voltage_v,
                optimization.voltage_reduction_percent);
        }
    }

    fclose(input_file);
    fclose(output_file);

    end_clock = clock();

    statistics.processing_time_ms =
        ((double)(end_clock - start_clock) * 1000.0) /
        CLOCKS_PER_SEC;

    printf("\n--- Zusammenfassung ---\n");
    printf(
        "Ausgewertet:   %d\n",
        statistics.total_count);

    printf(
        "SAFE:          %d\n",
        statistics.safe_count);

    printf(
        "CRITICAL:      %d\n",
        statistics.critical_count);

    printf(
        "NOT SAFE:      %d\n",
        total_not_safe_count(&statistics));

    printf(
        "Uebersprungen: %d\n",
        statistics.skipped_count);

    printf(
        "Ergebnisdatei: %s\n",
        g_config.output_file_path);

    printf(
        "Laufzeit:      %.3f ms\n",
        statistics.processing_time_ms);

    print_statistics(&statistics);

    if (write_summary_csv(
        g_config.summary_file_path,
        &statistics)) {
        printf(
            "KPI-Datei:     %s\n",
            g_config.summary_file_path);
    }

    write_log(
        LOG_INFO,
        "CSV-Analyse mit KPIs abgeschlossen | "
        "Ausgewertet=%d | SAFE=%d | CRITICAL=%d | "
        "NOT_SAFE=%d | Uebersprungen=%d | "
        "AvgTj=%.6f | MaxTj=%.6f | "
        "LaufzeitMs=%.3f | "
        "KritischsterIndex=%d | KritischsterID=%s | "
        "SummaryFile=%s",
        statistics.total_count,
        statistics.safe_count,
        statistics.critical_count,
        total_not_safe_count(&statistics),
        statistics.skipped_count,
        statistics.total_count > 0
        ? statistics.sum_tj /
        statistics.total_count
        : 0.0,
        statistics.total_count > 0
        ? statistics.max_tj
        : 0.0,
        statistics.processing_time_ms,
        statistics.most_critical_index,
        statistics.most_critical_transistor_id,
        g_config.summary_file_path);

    return 0;
}

/* =========================================================
   Hauptprogramm
   ========================================================= */

int main(void)
{
    int mode;
    int return_code;
    ConfigLoadStatus config_status;

    config_status =
        load_config(CONFIG_FILE_PATH, &g_config);

    write_log(
        LOG_INFO,
        "TransiSafe 2.0 gestartet | Konfigurationsstatus=%d",
        config_status);

    printf("\n--- Aktive Konfiguration ---\n");
    printf(
        "Kritische Leistungsreserve:   %.2f %%\n",
        g_config.critical_power_margin_percent);

    printf(
        "Kritische Temperaturreserve: %.2f gradC\n",
        g_config.critical_temperature_margin_c);

    printf(
        "Ergebnisdatei:                %s\n",
        g_config.output_file_path);

    printf(
        "KPI-Datei:                    %s\n",
        g_config.summary_file_path);

    printf(
        "Logdatei:                     %s\n",
        g_config.log_file_path);

    printf(
        "Transistordatenbank:          %s\n",
        g_config.transistor_database_path);

    printf("--------------------------------\n");

    if (!load_transistor_database(
        g_config.transistor_database_path,
        &g_database)) {
        printf(
            "Programm wird beendet, weil keine Transistordatenbank verfuegbar ist.\n");

        write_log(
            LOG_ERROR,
            "Programmabbruch: Transistordatenbank nicht verfuegbar.");

        return 1;
    }

    printf(
        "%d Transistormodelle erfolgreich geladen.\n\n",
        g_database.count);

    printf("==================================================\n");
    printf("TransiSafe 2.0\n");
    printf("Engineering Safety Analysis\n");
    printf("==================================================\n");
    printf("1) Interaktiv: Betriebspunkt mit Datenbankmodell\n");
    printf("2) CSV-Import: mehrere Betriebspunkte\n");

    printf("Modus waehlen: ");

    if (scanf("%d", &mode) != 1) {
        printf("Fehler: Ungueltige Eingabe.\n");
        return 1;
    }

    switch (mode) {
    case 1:
        return_code = run_interactive();
        break;

    case 2:
        return_code = run_csv();
        break;

    default:
        printf("Fehler: Bitte Modus 1 oder 2 auswaehlen.\n");
        return_code = 1;
        break;
    }

    write_log(
        LOG_INFO,
        "TransiSafe mit Rueckgabecode %d beendet.",
        return_code);

    return return_code;
}