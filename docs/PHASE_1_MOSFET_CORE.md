# Phase 1: MOSFET analysis core

## Scope

Phase 1 replaces the former `P = V * I` / `Tj = Tamb + P * RthJA`
demonstration with a data-driven MOSFET assessment. BJT analysis is intentionally
out of scope. In particular, BJT secondary breakdown must not be approximated by
the MOSFET model.

## Required input

Each operating point contains `VDS`, `ID`, operating mode, pulse duration,
frequency, duty cycle, ambient or case temperature, `RthCS`, `RthSA`, a safety
factor, switching energies `Eon` and `Eoff`, and gate-drive voltage. Switching
energies and gate-drive voltage may be zero only in linear mode.

## Device data and provenance

MOSFET master data contains absolute voltage/current limits, the maximum pulse
duration and duty cycle associated with `IDM`, the temperature at which the
stored SOA curves apply, `Tjmax`, `RthJC`, optional `RthJA`, gate charge,
datasheet URL, revision and retrieval date.
`mosfet_curves.csv` stores:

- `RDS_ON`: temperature [C] to resistance [ohm]
- `SOA`: pulse duration [s], `VDS` [V] to allowed `ID` [A]
- `ZTH_JC`: duty cycle, pulse duration [s] to transient impedance [K/W]

SOA and transient thermal values are interpolated in logarithmic coordinates.
An SOA curve parameter of `1e9` is the explicit DC sentinel; pulse durations
longer than the last finite pulse curve use this DC boundary without blending.
SOA voltage and pulse-duration requests outside the stored range use the nearest
conservative boundary. Transient thermal duty cycle is not extrapolated: an
unsupported duty cycle produces `INSUFFICIENT_DATA`. Continuous operation
(`duty_cycle = 1`) uses steady-state `RthJC`.

The included `ENGINEERING_FIXTURE` is synthetic and exists only for automated
engine tests. It is not a real component and must never be used for hardware
selection. A real device may only be added after its curve points have been
independently checked against the cited datasheet revision.

The development database also contains two real reference devices. Exact and
digitized inputs, confidence and release status are documented in
[`MOSFET_DATA_PROVENANCE.md`](MOSFET_DATA_PROVENANCE.md). They remain
engineering-review data until the required second-person check is completed.

## Loss model

Linear mode:

- peak device loss: `VDS * ID`
- average loss: `VDS * ID * duty_cycle`
- transient junction rise: peak loss multiplied by interpolated `ZthJC`
- external thermal rise: average loss multiplied by `RthCS + RthSA`

Switching mode:

- conduction loss: `ID^2 * RDS(on,T) * duty_cycle`
- switching loss: `(Eon + Eoff) * frequency`
- gate-drive loss: `Qg * Vgate * frequency`
- peak junction rise combines conduction pulse power with `ZthJC`, average
  switching/gate loss with `RthJC`, and all average device loss with the external
  case-to-ambient path

The safety factor scales electrical stress and calculated thermal rise.

## Decision rules

The engine independently checks absolute `VDS`, absolute `ID`, the duration and
duty-cycle conditions of the pulsed-current rating, interpolated SOA, and
calculated junction temperature. It does not invent a generic SOA temperature
derating: if the estimated case/SOA reference temperature exceeds the stored SOA
curve temperature, the result is `INSUFFICIENT_DATA`. A later dataset may add
manufacturer-provided hot SOA curves. Missing mandatory curve or switching-loss
data likewise results in `INSUFFICIENT_DATA`, never `SAFE`.

This remains an engineering decision-support calculation. It is not a component
qualification, certification, lifetime prediction, SPICE replacement, or proof
of functional safety.
