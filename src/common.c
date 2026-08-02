#include "common.h"

#include <ctype.h>
#include <errno.h>
#include <float.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

void trim_text(char* text)
{
    char* start;
    size_t length;

    if (text == NULL) {
        return;
    }

    start = text;
    while (*start != '\0' && isspace((unsigned char)*start)) {
        start++;
    }

    if (start != text) {
        memmove(text, start, strlen(start) + 1);
    }

    length = strlen(text);
    while (length > 0 && isspace((unsigned char)text[length - 1])) {
        text[--length] = '\0';
    }
}

void text_to_upper(char* text)
{
    if (text == NULL) {
        return;
    }

    while (*text != '\0') {
        *text = (char)toupper((unsigned char)*text);
        text++;
    }
}

int copy_text(char* destination, size_t destination_size, const char* source)
{
    size_t length;

    if (destination == NULL || destination_size == 0 || source == NULL) {
        return 0;
    }

    length = strlen(source);
    if (length >= destination_size) {
        return 0;
    }

    memcpy(destination, source, length + 1);
    return 1;
}

int text_equals_ignore_case(const char* left, const char* right)
{
    if (left == NULL || right == NULL) {
        return 0;
    }

    while (*left != '\0' && *right != '\0') {
        if (toupper((unsigned char)*left) != toupper((unsigned char)*right)) {
            return 0;
        }
        left++;
        right++;
    }

    return *left == '\0' && *right == '\0';
}

int parse_double_token(const char* token, double* out_value)
{
    char* end_pointer;
    double value;

    if (token == NULL || out_value == NULL) {
        return 0;
    }

    while (*token != '\0' && isspace((unsigned char)*token)) {
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

    while (*end_pointer != '\0' && isspace((unsigned char)*end_pointer)) {
        end_pointer++;
    }

    if (*end_pointer != '\0' || errno == ERANGE || !isfinite(value) ||
        value > DBL_MAX || value < -DBL_MAX) {
        return 0;
    }

    *out_value = value;
    return 1;
}

char detect_delimiter(const char* line)
{
    return line != NULL && strchr(line, ';') != NULL ? ';' : ',';
}

int split_delimited(char* line, char delimiter, char** fields, int max_fields)
{
    int count = 0;
    char* cursor;

    if (line == NULL || fields == NULL || max_fields <= 0) {
        return 0;
    }

    fields[count++] = line;
    for (cursor = line; *cursor != '\0'; cursor++) {
        if (*cursor == delimiter) {
            *cursor = '\0';
            if (count >= max_fields) {
                return max_fields + 1;
            }
            fields[count++] = cursor + 1;
        }
    }

    return count;
}
