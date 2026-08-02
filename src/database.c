#include "database.h"

#include "analysis.h"
#include "common.h"
#include "logging.h"

#include <stdio.h>
#include <string.h>

#define CSV_LINE_SIZE 1024

static int parse_type(const char* token, TransistorType* out_type)
{
    char buffer[32];

    if (token == NULL || out_type == NULL ||
        !copy_text(buffer, sizeof(buffer), token)) {
        return 0;
    }

    trim_text(buffer);
    if (text_equals_ignore_case(buffer, "BJT") || strcmp(buffer, "1") == 0) {
        *out_type = TRANS_BJT;
        return 1;
    }
    if (text_equals_ignore_case(buffer, "MOSFET") || strcmp(buffer, "2") == 0) {
        *out_type = TRANS_MOSFET;
        return 1;
    }
    return 0;
}

int find_transistor_by_id(
    const TransistorDatabase* database,
    const char* transistor_id,
    const TransistorModel** out_model)
{
    int i;

    if (database == NULL || transistor_id == NULL || out_model == NULL) {
        return 0;
    }

    for (i = 0; i < database->count; i++) {
        if (text_equals_ignore_case(
                database->models[i].transistor_id, transistor_id)) {
            *out_model = &database->models[i];
            return 1;
        }
    }
    return 0;
}

static int parse_model_line(
    char* line,
    TransistorModel* model,
    char* error_message,
    size_t error_message_size)
{
    char* fields[6];
    int count = split_delimited(line, detect_delimiter(line), fields, 6);

    if (count != 5) {
        snprintf(error_message, error_message_size,
            "Erwartet werden genau 5 Felder.");
        return 0;
    }

    trim_text(fields[0]);
    if (fields[0][0] == '\0' ||
        !copy_text(model->transistor_id, sizeof(model->transistor_id), fields[0])) {
        snprintf(error_message, error_message_size,
            "transistor_id ist leer oder zu lang.");
        return 0;
    }
    if (!parse_type(fields[1], &model->type)) {
        snprintf(error_message, error_message_size, "Ungueltiger Transistortyp.");
        return 0;
    }
    if (!parse_double_token(fields[2], &model->p_max) || model->p_max <= 0.0) {
        snprintf(error_message, error_message_size, "Ungueltiger Pmax-Wert.");
        return 0;
    }
    if (!parse_double_token(fields[3], &model->rth_ja) || model->rth_ja <= 0.0) {
        snprintf(error_message, error_message_size, "Ungueltiger RthJA-Wert.");
        return 0;
    }
    if (!parse_double_token(fields[4], &model->t_j_max) || model->t_j_max <= 0.0) {
        snprintf(error_message, error_message_size, "Ungueltiger Tjmax-Wert.");
        return 0;
    }
    return 1;
}

int load_transistor_database(
    const char* file_path,
    TransistorDatabase* database)
{
    FILE* file;
    char line[CSV_LINE_SIZE];
    char working_line[CSV_LINE_SIZE];
    char upper_line[CSV_LINE_SIZE];
    char error_message[ERROR_MESSAGE_SIZE];
    int line_number = 0;

    if (database == NULL) {
        return 0;
    }
    database->count = 0;
    file = fopen(file_path, "r");
    if (file == NULL) {
        printf("Fehler: Transistordatenbank konnte nicht geoeffnet werden: %s\n",
            file_path);
        write_log(LOG_ERROR,
            "Transistordatenbank konnte nicht geoeffnet werden: %s", file_path);
        return 0;
    }

    while (fgets(line, sizeof(line), file) != NULL) {
        TransistorModel model;
        const TransistorModel* duplicate;

        line_number++;
        trim_text(line);
        if (line[0] == '\0' || line[0] == '#') {
            continue;
        }

        copy_text(upper_line, sizeof(upper_line), line);
        text_to_upper(upper_line);
        if (strstr(upper_line, "TRANSISTOR_ID") != NULL &&
            strstr(upper_line, "PMAX") != NULL) {
            continue;
        }

        if (database->count >= MAX_TRANSISTORS) {
            write_log(LOG_WARNING,
                "Maximale Anzahl von %d Transistoren erreicht.", MAX_TRANSISTORS);
            break;
        }

        copy_text(working_line, sizeof(working_line), line);
        if (!parse_model_line(working_line, &model,
                error_message, sizeof(error_message))) {
            printf("Datenbankzeile %d uebersprungen: %s\n",
                line_number, error_message);
            write_log(LOG_ERROR,
                "Datenbankzeile %d uebersprungen | Fehler=%s | Inhalt=%s",
                line_number, error_message, line);
            continue;
        }

        if (find_transistor_by_id(database, model.transistor_id, &duplicate)) {
            write_log(LOG_ERROR, "Doppelte Transistor-ID in Zeile %d: %s",
                line_number, model.transistor_id);
            continue;
        }

        database->models[database->count++] = model;
    }

    fclose(file);
    if (database->count == 0) {
        write_log(LOG_ERROR, "Keine gueltigen Transistormodelle geladen.");
        return 0;
    }

    write_log(LOG_INFO, "Transistordatenbank geladen | Datei=%s | Modelle=%d",
        file_path, database->count);
    return 1;
}

void print_transistor_database(const TransistorDatabase* database)
{
    int i;

    printf("\n--- Verfuegbare Transistormodelle ---\n");
    for (i = 0; i < database->count; i++) {
        const TransistorModel* model = &database->models[i];
        printf("%d) %-20s | %-6s | Pmax=%7.2f W | "
               "RthJA=%7.2f gradC/W | Tjmax=%7.2f gradC\n",
            i + 1, model->transistor_id,
            transistor_type_to_string(model->type),
            model->p_max, model->rth_ja, model->t_j_max);
    }
    printf("--------------------------------------\n");
}
