#ifndef TRANSISAFE_COMMON_H
#define TRANSISAFE_COMMON_H

#include <stddef.h>

void trim_text(char* text);
void text_to_upper(char* text);
int copy_text(char* destination, size_t destination_size, const char* source);
int text_equals_ignore_case(const char* left, const char* right);
int parse_double_token(const char* token, double* out_value);
char detect_delimiter(const char* line);
int split_delimited(char* line, char delimiter, char** fields, int max_fields);

#endif
