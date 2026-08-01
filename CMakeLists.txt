cmake_minimum_required(VERSION 3.20)

project(
    TransiSafe
    VERSION 2.0
    DESCRIPTION "Engineering safety analysis and decision-support tool"
    LANGUAGES C
)

add_executable(
    transisafe
    src/transisafe.c
)

target_compile_features(
    transisafe
    PRIVATE
    c_std_11
)

if(MSVC)
    target_compile_options(
        transisafe
        PRIVATE
        /W4
    )
else()
    message(
        FATAL_ERROR
        "TransiSafe currently requires Microsoft Visual C."
    )
endif()
