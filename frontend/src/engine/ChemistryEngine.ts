/* ───────────────────────────────────────────────────────
   Smart Lab – Chemistry Engine
   Real electrochemistry calculations for the Lemon Battery
   ─────────────────────────────────────────────────────── */

import type {
  ElectrodeData,
  ElectrolyteData,
  CellData,
  CircuitState,
  ReactionStep,
} from '../types';

// ── Constants ──────────────────────────────────────────
const R = 8.314;          // Gas constant J/(mol·K)
const F = 96485;          // Faraday constant C/mol
const T = 298.15;         // Room temp K (25°C)
const LN10 = Math.log(10);

// ── Standard Electrode Potentials (V vs SHE) ──────────
const STANDARD_POTENTIALS: Record<string, number> = {
  zinc: -0.76,
  copper: 0.34,
  iron: -0.44,
  aluminum: -1.66,
  magnesium: -2.37,
  lead: -0.13,
  tin: -0.14,
  silver: 0.80,
  gold: 1.50,
  carbon: 0.207,
};

// ── Molar masses (g/mol) ──────────────────────────────
const MOLAR_MASSES: Record<string, number> = {
  zinc: 65.38,
  copper: 63.55,
  iron: 55.85,
  aluminum: 26.98,
  magnesium: 24.31,
};

// ── LED characteristics ───────────────────────────────
const LED_FORWARD_VOLTAGE = 1.8;   // V (red LED)
const LED_FORWARD_CURRENT = 0.020; // A (20mA)
const LED_MIN_VOLTAGE = 1.5;       // minimum to see faint glow
const LED_RESISTANCE = 100;        // Ohm (internal + wires)

export class ChemistryEngine {

  /**
   * Calculate Nernst equation voltage for a half-cell
   * E = E° - (RT/nF) * ln(Q)
   */
  static nernstPotential(
    standardPotential: number,
    electronsTransferred: number,
    ionConcentration: number = 1.0
  ): number {
    if (ionConcentration <= 0) return standardPotential;
    const E = standardPotential -
      (R * T) / (electronsTransferred * F) * Math.log(1 / ionConcentration);
    return Math.round(E * 10000) / 10000;
  }

  /**
   * Calculate cell EMF from two half-cells
   * E_cell = E_cathode - E_anode
   */
  static cellVoltage(
    cathode: ElectrodeData,
    anode: ElectrodeData,
    electrolyte: ElectrolyteData
  ): number {
    const ionConc = electrolyte.concentration;
    const eCathode = this.nernstPotential(
      cathode.standardPotential,
      cathode.electronsTransferred,
      ionConc
    );
    const eAnode = this.nernstPotential(
      anode.standardPotential,
      anode.electronsTransferred,
      ionConc
    );
    return Math.round((eCathode - eAnode) * 10000) / 10000;
  }

  /**
   * Calculate Gibbs Free Energy
   * ΔG = -nFE
   */
  static gibbsFreeEnergy(
    electronsTransferred: number,
    cellVoltage: number
  ): number {
    return Math.round(-electronsTransferred * F * cellVoltage) / 1000; // kJ/mol
  }

  /**
   * Calculate current from cell voltage and circuit resistance
   * I = V / R (Ohm's law), capped by electrochemical limits
   */
  static cellCurrent(voltage: number, resistance: number): number {
    if (resistance <= 0) return 0;
    const maxElectrochemicalCurrent = 0.001; // ~1mA typical for lemon
    const ohmCurrent = voltage / resistance;
    return Math.min(ohmCurrent, maxElectrochemicalCurrent);
  }

  /**
   * Calculate LED brightness based on voltage and current
   */
  static ledBrightness(voltage: number, current: number): number {
    if (voltage < LED_MIN_VOLTAGE) return 0;
    if (voltage < LED_FORWARD_VOLTAGE) {
      // dim glow range
      return Math.max(0, (voltage - LED_MIN_VOLTAGE) / (LED_FORWARD_VOLTAGE - LED_MIN_VOLTAGE) * 0.3);
    }
    // bright range - based on current
    const brightness = Math.min(1.0, 0.3 + (current / LED_FORWARD_CURRENT) * 0.7);
    return Math.round(brightness * 100) / 100;
  }

  /**
   * Build a full circuit state from cells array
   */
  static calculateCircuit(cells: CellData[], externalResistance: number = LED_RESISTANCE): CircuitState {
    if (cells.length === 0) {
      return {
        isComplete: false,
        totalVoltage: 0,
        current: 0,
        resistance: externalResistance,
        power: 0,
        ledBrightness: 0,
        cells: [],
      };
    }

    // Series connection: voltages add
    let totalVoltage = 0;
    const calculatedCells: CellData[] = cells.map(cell => {
      const v = this.cellVoltage(cell.cathode, cell.anode, cell.electrolyte);
      totalVoltage += v;
      return { ...cell, cellVoltage: v, cellCurrent: 0 };
    });

    // Internal resistance ~ 500 Ohm per lemon cell
    const internalResistance = cells.length * 500;
    const totalResistance = externalResistance + internalResistance;
    const current = this.cellCurrent(totalVoltage, totalResistance);
    const power = totalVoltage * current;
    const brightness = this.ledBrightness(totalVoltage, current);

    // Update per-cell current
    calculatedCells.forEach(c => { c.cellCurrent = current; });

    return {
      isComplete: true,
      totalVoltage: Math.round(totalVoltage * 10000) / 10000,
      current: Math.round(current * 1000000) / 1000000,
      resistance: Math.round(totalResistance * 100) / 100,
      power: Math.round(power * 1000000) / 1000000,
      ledBrightness: brightness,
      cells: calculatedCells,
    };
  }

  /**
   * Get default electrode data for common metals
   */
  static getElectrode(metal: string, massGrams: number = 10): ElectrodeData {
    const key = metal.toLowerCase();
    return {
      material: metal,
      standardPotential: STANDARD_POTENTIALS[key] ?? 0,
      massGrams,
      molarMass: MOLAR_MASSES[key] ?? 1,
      electronsTransferred: key === 'aluminum' ? 3 : 2,
    };
  }

  /**
   * Get lemon electrolyte data
   * Citric acid ~0.03 mol/L in fresh lemon, pH ~2.0
   */
  static getLemonElectrolyte(juiceVolume: number = 30): ElectrolyteData {
    return {
      name: 'Citric Acid (Lemon Juice)',
      concentration: 0.03,
      pH: 2.0,
      conductivity: 0.38,
      volume: juiceVolume,
    };
  }

  /**
   * Get lemon electrolyte with increased juice after rolling
   */
  static getRolledLemonElectrolyte(): ElectrolyteData {
    return {
      ...this.getLemonElectrolyte(45), // more juice released
      concentration: 0.035,  // slightly higher concentration
      conductivity: 0.42,    // better conductivity
    };
  }

  /**
   * Create a single lemon battery cell
   */
  static createLemonCell(rolled: boolean = false): CellData {
    const cathode = this.getElectrode('copper', 5);
    const anode = this.getElectrode('zinc', 8);
    const electrolyte = rolled
      ? this.getRolledLemonElectrolyte()
      : this.getLemonElectrolyte();

    const voltage = this.cellVoltage(cathode, anode, electrolyte);
    return {
      cathode,
      anode,
      electrolyte,
      cellVoltage: voltage,
      cellCurrent: 0,
    };
  }

  /**
   * Get chemical reaction equations for lemon battery
   */
  static getLemonBatteryReactions(): ReactionStep[] {
    return [
      {
        equation: 'Zn → Zn²⁺ + 2e⁻',
        description: 'Zinc is oxidized at the anode, losing 2 electrons. The zinc nail dissolves slowly as zinc atoms become zinc ions in the lemon juice.',
        type: 'oxidation',
        deltaG: this.gibbsFreeEnergy(2, 0.76),
      },
      {
        equation: '2H⁺ + 2e⁻ → H₂↑',
        description: 'Hydrogen ions from citric acid gain electrons at the copper cathode, producing hydrogen gas bubbles.',
        type: 'reduction',
        deltaG: this.gibbsFreeEnergy(2, 0.34),
      },
      {
        equation: 'Zn + 2H⁺ → Zn²⁺ + H₂↑',
        description: 'Overall: Zinc reacts with hydrogen ions to produce zinc ions and hydrogen gas. The electron flow through the external wire powers the LED.',
        type: 'overall',
        deltaG: this.gibbsFreeEnergy(2, 1.10),
      },
    ];
  }

  /**
   * Calculate theoretical maximum runtime
   * Using Faraday's law: t = (m * n * F) / (M * I)
   */
  static calculateRuntime(cell: CellData, current: number): number {
    if (current <= 0) return Infinity;
    const m = cell.anode.massGrams;
    const n = cell.anode.electronsTransferred;
    const M = cell.anode.molarMass;
    const seconds = (m * n * F) / (M * current);
    return Math.round(seconds); // seconds
  }

  /**
   * Format runtime as human-readable
   */
  static formatRuntime(seconds: number): string {
    if (!isFinite(seconds)) return '∞';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins} minutes`;
  }

  /**
   * Calculate how adding substances changes the reaction
   */
  static calculateConcentrationEffect(
    baseElectrolyte: ElectrolyteData,
    additionalAcidMoles: number
  ): ElectrolyteData {
    const newConc = baseElectrolyte.concentration + additionalAcidMoles / (baseElectrolyte.volume / 1000);
    const newPH = -Math.log10(newConc);
    return {
      ...baseElectrolyte,
      concentration: Math.round(newConc * 10000) / 10000,
      pH: Math.round(newPH * 100) / 100,
      conductivity: Math.round((baseElectrolyte.conductivity * (newConc / baseElectrolyte.concentration)) * 1000) / 1000,
    };
  }
}
