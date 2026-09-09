/**
 * Shared, course-facing condition guides. These values are deliberately kept
 * out of UI components so wording changes cannot alter reaction behavior.
 */
export const CONJUGATED_DIENE_HX_TEMPERATURE_GUIDE = {
  /**
   * PocketChem uses the requested teaching windows: below 0 °C for the kinetic 1,2 side and above 40 °C for the thermodynamic side. The interval between them is intentionally not assigned a universal major product because actual ratios depend on substrate, acid, solvent, concentration, and reaction time.
   */
  courseCutoffCelsius: 40,
  kineticCondition: "< 0 °C (kinetic-control side)",
  thermodynamicCondition: "> 40 °C (thermodynamic-control side)",
  kineticNote:
    "Below 0 °C, faster 1,2 capture is shown as the kinetic-control product. The 0–40 °C interval is not assigned a universal major product because ratios are substrate- and condition-dependent.",
  thermodynamicNote:
    "Above 40 °C, reversible addition is shown on the thermodynamic-control side. The exact product ratio remains substrate- and condition-dependent.",
} as const;
