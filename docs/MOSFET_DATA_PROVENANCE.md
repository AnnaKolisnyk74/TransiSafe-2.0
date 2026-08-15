# MOSFET data provenance and confidence

This file is part of the analysis input audit trail. A device row is not a
certification of the device or of a hardware design.

## PSMN1R4-100ASE

- Manufacturer: Nexperia
- Intended reference use: enhanced-SOA linear operation / hot swap
- Source: <https://assets.nexperia.com/documents/data-sheet/PSMN1R4-100ASE.pdf>
- Source revision: product data sheet dated 20 October 2025
- Retrieved: 2026-08-15
- Exact table values: 100 V `VDS`, 340 A continuous `ID`, 2186 A pulsed
  `IDM` for `tp <= 10 us`, 175 C `Tjmax`, 0.16 K/W maximum `Rth(j-mb)`,
  58 K/W typical minimum-footprint `Rth(j-a)`, 366 nC maximum total gate
  charge, and maximum `RDS(on)` values at 25/100/175 C.
- Digitized graphs: Figure 3 SOA and Figure 5 transient thermal impedance.
- Confidence: engineering digitization, approximately +/-10% away from curve
  intersections and potentially worse at intersections. Values were rounded in
  the conservative direction where the graph was ambiguous.
- SOA basis: stored curves are the solid black `Tmb = 25 C` curves. Additional
  hot-temperature operation is reported as `INSUFFICIENT_DATA` until the
  manufacturer's `Tmb = 125 C` curves are stored and independently checked.
- Pulsed-current duty limit: no independently verified duty condition is stored,
  so the engine does not use the 2186 A rating above the continuous-current limit.

## CSD19536KTT

- Manufacturer: Texas Instruments
- Intended reference use: low-loss power switching
- Source: <https://www.ti.com/lit/ds/symlink/csd19536ktt.pdf>
- Source revision: SLPS540C, revised May 2025
- Retrieved: 2026-08-15
- Exact table values: 100 V `VDS`, 200 A package-limited continuous `ID`,
  400 A pulsed `IDM` for `tp <= 100 us` and duty cycle <= 1%, 175 C `Tjmax`,
  0.4 C/W `RthetaJC`, 62 C/W `RthetaJA`, 153 nC maximum total gate charge,
  and 2.4 milliohm maximum `RDS(on)` at 25 C and 10 V gate drive.
- Digitized graphs: Figure 4-10 maximum SOA and Figure 4-1 normalized transient
  thermal impedance. Figure 4-1 values were multiplied by 0.4 C/W.
- Temperature `RDS(on)`: the 25 C maximum is scaled by approximate typical
  normalized factors from Figure 4-8. These are derived values, not guaranteed
  maximum-temperature specifications.
- Confidence: engineering digitization, approximately +/-10% away from curve
  intersections and potentially worse at intersections.

## Release rule

Digitized points are suitable for developing and testing the workflow but are
not yet `VERIFIED` commercial data. Before a production release, a second-person
review must compare every point with the named datasheet revision. The product
UI must expose source, revision, retrieval date, derivation method and confidence.
