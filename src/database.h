#ifndef TRANSISAFE_DATABASE_H
#define TRANSISAFE_DATABASE_H

#include "transisafe_types.h"

int find_transistor_by_id(
    const TransistorDatabase* database,
    const char* transistor_id,
    const TransistorModel** out_model);

int load_transistor_database(
    const char* file_path,
    TransistorDatabase* database);

void print_transistor_database(const TransistorDatabase* database);

#endif
