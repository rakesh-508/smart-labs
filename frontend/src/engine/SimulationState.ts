/* ───────────────────────────────────────────────────────
   Smart Lab – Simulation State Manager
   Manages the lab workspace state: materials,
   positions, connections, and circuit status.
   Now includes a high-level CanvasLabState for the
   dynamic HTML5 Canvas renderer.
   ─────────────────────────────────────────────────────── */

import type {
  PlacedMaterial,
  Material,
  CircuitState,
  CellData,
  MetricSnapshot,
} from '../types';
import { ChemistryEngine } from './ChemistryEngine';
import type { CanvasLabState } from '../components/ExperimentLab/LabCanvas';

let instanceCounter = 0;

export class SimulationState {
  private placedMaterials: PlacedMaterial[] = [];
  private circuitState: CircuitState;
  private cells: CellData[] = [];
  private listeners: Array<() => void> = [];
  private lemonRolled: Map<string, boolean> = new Map();

  // ── High-level lab flags (drives the Canvas) ─────
  private _labState: CanvasLabState = {
    lemons: 0,
    hasNail: false,
    hasCopper: false,
    hasLED: false,
    nailInserted: false,
    copperInserted: false,
    ledConnected: false,
    lemonRolled: false,
    circuitComplete: false,
    ledReversed: false,
  };

  constructor() {
    this.circuitState = {
      isComplete: false,
      totalVoltage: 0,
      current: 0,
      resistance: 100,
      power: 0,
      ledBrightness: 0,
      cells: [],
    };
  }

  // ── Public getters ─────────────────────────────────
  getLabState(): CanvasLabState { return { ...this._labState }; }

  getCircuitState(): CircuitState { return { ...this.circuitState }; }

  getMaterials(): PlacedMaterial[] { return [...this.placedMaterials]; }

  getMaterial(instanceId: string): PlacedMaterial | undefined {
    return this.placedMaterials.find(m => m.instanceId === instanceId);
  }

  getMaterialsByType(materialId: string): PlacedMaterial[] {
    return this.placedMaterials.filter(m => m.id === materialId);
  }

  getCells(): CellData[] { return [...this.cells]; }

  getMetricSnapshot(): MetricSnapshot {
    return {
      timestamp: new Date(),
      voltage: this.circuitState.totalVoltage,
      current: this.circuitState.current,
      resistance: this.circuitState.resistance,
      ledBrightness: this.circuitState.ledBrightness,
      cellCount: this.cells.length,
      notes: '',
    };
  }

  // ── Subscriptions ──────────────────────────────────
  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  // ── Core: recalculate everything dynamically ──────
  private recalc() {
    const ls = this._labState;

    // If no lemons, reset dependent state
    if (ls.lemons <= 0) {
      ls.lemons = 0;
      ls.nailInserted = false;
      ls.copperInserted = false;
      ls.lemonRolled = false;
      ls.ledConnected = false;
      ls.circuitComplete = false;
    }

    // Circuit is complete only when ALL conditions met AND LED is not reversed
    ls.circuitComplete = ls.lemons > 0
      && ls.nailInserted
      && ls.copperInserted
      && ls.hasLED
      && ls.ledConnected
      && !ls.ledReversed;

    // Rebuild cells array to match lemon count
    if (ls.circuitComplete || (ls.nailInserted && ls.copperInserted && ls.lemons > 0)) {
      // Ensure we have one cell per lemon
      while (this.cells.length < ls.lemons) {
        this.cells.push(ChemistryEngine.createLemonCell(ls.lemonRolled));
      }
      while (this.cells.length > ls.lemons) {
        this.cells.pop();
      }
    }

    // Calculate circuit
    if (ls.circuitComplete && this.cells.length > 0) {
      this.circuitState = ChemistryEngine.calculateCircuit(this.cells);
    } else if (ls.nailInserted && ls.copperInserted && ls.lemons > 0) {
      // Partial: show voltage potential even without LED connected
      const partial = ChemistryEngine.calculateCircuit(this.cells);
      this.circuitState = {
        ...partial,
        isComplete: false,
        current: 0,
        power: 0,
        ledBrightness: 0,
      };
    } else {
      this.circuitState = {
        isComplete: false,
        totalVoltage: 0,
        current: 0,
        resistance: 100,
        power: 0,
        ledBrightness: 0,
        cells: [],
      };
      this.cells = [];
    }

    this.notify();
  }

  // ── Material Management ────────────────────────────
  addMaterial(material: Material, x?: number, y?: number): PlacedMaterial {
    const placed: PlacedMaterial = {
      ...material,
      instanceId: `${material.id}-${++instanceCounter}`,
      x: x ?? 250 + Math.random() * 200,
      y: y ?? 200 + Math.random() * 100,
      rotation: 0,
      state: 'idle',
      connectedTo: [],
    };
    this.placedMaterials.push(placed);
    this.notify();
    return placed;
  }

  removeMaterial(instanceId: string) {
    this.placedMaterials = this.placedMaterials.filter(m => m.instanceId !== instanceId);
    this.recalc();
  }

  moveMaterial(instanceId: string, x: number, y: number) {
    const m = this.placedMaterials.find(m => m.instanceId === instanceId);
    if (m) { m.x = x; m.y = y; this.notify(); }
  }

  // ── High-level experiment actions ──────────────────

  addLemon(): { success: boolean; message: string } {
    if (this._labState.lemons >= 3) {
      return { success: false, message: '⚠ Maximum 3 lemons in series! That\'s the optimal setup.' };
    }
    this._labState.lemons++;
    this.recalc();
    const vc = this.circuitState;
    return {
      success: true,
      message: `🍋 **Lemon #${this._labState.lemons} added!**\n\n` +
        `• Total lemons: ${this._labState.lemons}\n` +
        `• Theoretical EMF per cell: ~1.10 V\n` +
        `• Total voltage: ~${vc.totalVoltage > 0 ? vc.totalVoltage.toFixed(2) : (this._labState.lemons * 0.9).toFixed(2)} V`,
    };
  }

  removeLemon(): { success: boolean; message: string } {
    if (this._labState.lemons <= 0) {
      return { success: false, message: '⚠ No lemons to remove!' };
    }
    this._labState.lemons--;
    this.recalc();
    const vc = this.circuitState;
    const ledOn = this._labState.circuitComplete && vc.ledBrightness > 0;
    return {
      success: true,
      message: this._labState.lemons === 0
        ? `🗑 **Lemon removed.** No lemons left! Circuit broken. All inserted components removed.`
        : `🗑 **Lemon removed.** Now ${this._labState.lemons} lemon(s).\n` +
          `• New voltage: **${vc.totalVoltage > 0 ? vc.totalVoltage.toFixed(2) : (this._labState.lemons * 0.9).toFixed(2)} V**\n` +
          `• LED: ${ledOn ? '🔴 Still glowing' : '💤 OFF (not enough voltage)'}`,
    };
  }

  setHasNail(v: boolean) { this._labState.hasNail = v; this.recalc(); }
  setHasCopper(v: boolean) { this._labState.hasCopper = v; this.recalc(); }
  setHasLED(v: boolean) { this._labState.hasLED = v; this.recalc(); }

  rollLemon(): { success: boolean; message: string } {
    if (this._labState.lemons === 0) {
      return { success: false, message: 'No lemon found to roll.' };
    }
    this._labState.lemonRolled = true;
    this.recalc();
    return {
      success: true,
      message: '🍋 Rolling the lemon... Juice vesicles are breaking, releasing more citric acid!\n' +
        '• Juice volume: 30mL → 45mL\n• Conductivity improved by ~10%',
    };
  }

  insertNail(): { success: boolean; message: string } {
    if (this._labState.lemons === 0) return { success: false, message: '⚠ Take a lemon first!' };
    if (!this._labState.hasNail) return { success: false, message: '⚠ Take a galvanized nail first!' };
    this._labState.nailInserted = true;
    this.recalc();
    return {
      success: true,
      message: '⬇ **Zinc nail inserted into lemon!**\nZinc surface now contacts citric acid. Oxidation begins immediately.',
    };
  }

  insertCopper(): { success: boolean; message: string } {
    if (this._labState.lemons === 0) return { success: false, message: '⚠ Take a lemon first!' };
    if (!this._labState.hasCopper) return { success: false, message: '⚠ Take copper wire first!' };
    this._labState.copperInserted = true;
    this.recalc();
    const vc = this.circuitState;
    return {
      success: true,
      message: `⬇ **Copper wire inserted into lemon!**\nElectrochemical cell formed!\n` +
        `• Voltage: ~${vc.totalVoltage > 0 ? vc.totalVoltage.toFixed(2) : '0.90'} V\n` +
        `• ⚠ Metals must NOT touch inside!`,
    };
  }

  connectLED(): { success: boolean; message: string } {
    if (!this._labState.nailInserted || !this._labState.copperInserted) {
      return { success: false, message: '⚠ Insert both metals into the lemon first!' };
    }
    if (!this._labState.hasLED) {
      return { success: false, message: '⚠ Take an LED light first!' };
    }
    this._labState.ledConnected = true;
    this.recalc();
    const cs = this.circuitState;
    const ledOn = cs.ledBrightness > 0;
    return {
      success: true,
      message: `🔌 **Circuit ${ledOn ? 'complete! 💡 LED GLOWING!' : 'closed, but not enough voltage.'}**\n` +
        `• Voltage: **${cs.totalVoltage.toFixed(2)} V**\n` +
        `• Current: **${(cs.current * 1000).toFixed(2)} mA**\n` +
        `• LED needs 1.8V → ${ledOn ? '✅ Sufficient!' : `❌ Need ${(1.8 - cs.totalVoltage).toFixed(2)}V more! Try adding lemons.`}`,
    };
  }

  addSeriesCell(): { success: boolean; message: string } {
    return this.addLemon();
  }

  reverseLEDPolarity(): { success: boolean; message: string } {
    if (!this._labState.hasLED) {
      return { success: false, message: '⚠ No LED on the workspace! Say "take the LED" first.' };
    }
    this._labState.ledReversed = !this._labState.ledReversed;
    this.recalc();
    const reversed = this._labState.ledReversed;
    const cs = this.circuitState;
    if (reversed) {
      return {
        success: true,
        message: `🔄 **LED polarity reversed!**\n\n` +
          `• Anode (+) now connects to **Zinc** (wrong!)\n` +
          `• Cathode (−) now connects to **Copper** (wrong!)\n` +
          `• 💡 LED is now reverse-biased — **no current can flow!**\n\n` +
          `📖 LEDs are polarity-sensitive diodes. Current only flows in the forward direction (anode → cathode). Reversing the legs blocks the circuit.`,
      };
    } else {
      const ledOn = cs.isComplete && cs.ledBrightness > 0;
      return {
        success: true,
        message: `🔄 **LED polarity restored to correct orientation!**\n\n` +
          `• Anode (+, long leg) → **Copper** ✅\n` +
          `• Cathode (−, short leg) → **Zinc** ✅\n` +
          `• LED: ${ledOn ? '💡 Glowing!' : '💤 Not enough voltage yet.'}`,
      };
    }
  }

  // kept for backward compat w/ agent
  completeCircuit(): { success: boolean; message: string; circuitState: CircuitState } {
    // Just recalc
    this.recalc();
    const cs = this.circuitState;
    const msg = cs.isComplete
      ? `⚡ Circuit complete!\n📊 Voltage: ${cs.totalVoltage.toFixed(3)}V | Current: ${(cs.current * 1000).toFixed(3)}mA | LED: ${(cs.ledBrightness * 100).toFixed(0)}%`
      : '❌ Circuit not complete — make sure you have a lemon with both electrodes inserted and an LED connected.';
    return { success: cs.isComplete, message: msg, circuitState: cs };
  }

  reset() {
    this.placedMaterials = [];
    this.cells = [];
    this.lemonRolled.clear();
    instanceCounter = 0;
    this._labState = {
      lemons: 0, hasNail: false, hasCopper: false, hasLED: false,
      nailInserted: false, copperInserted: false, ledConnected: false,
      lemonRolled: false, circuitComplete: false, ledReversed: false,
    };
    this.circuitState = {
      isComplete: false, totalVoltage: 0, current: 0,
      resistance: 100, power: 0, ledBrightness: 0, cells: [],
    };
    this.notify();
  }
}
