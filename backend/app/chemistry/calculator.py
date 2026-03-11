# ───────────────────────────────────────────────────────
#  Smart Lab – Chemistry Calculator
#  Real electrochemistry calculations
# ───────────────────────────────────────────────────────

import math
from typing import Dict, Any, List

R = 8.314      # Gas constant J/(mol·K)
F = 96485      # Faraday constant C/mol
T = 298.15     # Room temperature K

STANDARD_POTENTIALS = {
    "zinc": -0.76,
    "copper": 0.34,
    "iron": -0.44,
    "aluminum": -1.66,
    "magnesium": -2.37,
    "carbon": 0.207,
    "silver": 0.80,
    "hydrogen": 0.00,
}

MOLAR_MASSES = {
    "zinc": 65.38,
    "copper": 63.55,
    "iron": 55.85,
    "aluminum": 26.98,
    "magnesium": 24.31,
}


class ChemistryCalculator:

    def nernst_potential(
        self,
        standard_potential: float,
        n_electrons: int = 2,
        ion_concentration: float = 1.0,
        temperature: float = T,
    ) -> float:
        """Nernst equation: E = E° - (RT/nF)·ln(1/[ion])"""
        if ion_concentration <= 0:
            return standard_potential
        E = standard_potential - (R * temperature) / (n_electrons * F) * math.log(1 / ion_concentration)
        return round(E, 4)

    def cell_voltage(
        self,
        cathode_potential: float,
        anode_potential: float,
        ion_concentration: float = 0.03,
        n_electrons: int = 2,
    ) -> float:
        """E_cell = E_cathode - E_anode (with Nernst correction)"""
        e_cath = self.nernst_potential(cathode_potential, n_electrons, ion_concentration)
        e_ano = self.nernst_potential(anode_potential, n_electrons, ion_concentration)
        return round(e_cath - e_ano, 4)

    def gibbs_free_energy(self, n_electrons: int, cell_voltage: float) -> float:
        """ΔG = -nFE (kJ/mol)"""
        return round(-n_electrons * F * cell_voltage / 1000, 1)

    def cell_current(self, voltage: float, resistance: float) -> float:
        """Ohm's law, capped at electrochemical limit."""
        if resistance <= 0:
            return 0
        max_current = 0.001  # ~1mA typical max for lemon cell
        return min(voltage / resistance, max_current)

    def led_brightness(self, voltage: float, current: float) -> float:
        """LED brightness 0-1 based on voltage and current."""
        LED_MIN = 1.5
        LED_FORWARD = 1.8
        LED_CURRENT = 0.020

        if voltage < LED_MIN:
            return 0.0
        if voltage < LED_FORWARD:
            return max(0, (voltage - LED_MIN) / (LED_FORWARD - LED_MIN) * 0.3)
        return min(1.0, 0.3 + (current / LED_CURRENT) * 0.7)

    def calculate_circuit(
        self,
        num_cells: int = 1,
        rolled: bool = True,
        external_resistance: float = 100.0,
    ) -> Dict[str, Any]:
        """Full circuit calculation for lemon battery."""
        # Electrolyte properties
        concentration = 0.035 if rolled else 0.03
        internal_resistance_per_cell = 500  # Ohm

        # Single cell voltage
        # Using Hydrogen reduction at copper (practical lemon battery)
        cathode_pot = STANDARD_POTENTIALS["hydrogen"]  # 0.00V at copper
        anode_pot = STANDARD_POTENTIALS["zinc"]         # -0.76V
        single_v = self.cell_voltage(cathode_pot, anode_pot, concentration)

        # Series connection
        total_voltage = single_v * num_cells
        total_resistance = external_resistance + (internal_resistance_per_cell * num_cells)
        current = self.cell_current(total_voltage, total_resistance)
        power = total_voltage * current
        brightness = self.led_brightness(total_voltage, current)

        # LED status
        if brightness > 0.5:
            led_status = "Glowing brightly ✨"
        elif brightness > 0:
            led_status = "Glowing dimly 💡"
        else:
            led_status = "Not lit ❌ — need more voltage"

        # Per-cell details
        cells = []
        for i in range(num_cells):
            cells.append({
                "cell_number": i + 1,
                "voltage": round(single_v, 4),
                "anode": {"material": "Zinc", "E°": anode_pot},
                "cathode": {"material": "Copper (H₂ reduction)", "E°": cathode_pot},
                "electrolyte": {
                    "name": "Citric acid (lemon juice)",
                    "concentration_mol_L": concentration,
                    "pH": round(-math.log10(concentration), 2),
                },
            })

        explanation = (
            f"With {num_cells} lemon cell{'s' if num_cells > 1 else ''} in series: "
            f"Total EMF = {num_cells} × {single_v:.3f}V = {total_voltage:.3f}V. "
            f"Total resistance = {external_resistance}Ω (external) + {internal_resistance_per_cell * num_cells}Ω (internal) = {total_resistance}Ω. "
            f"Current I = V/R = {total_voltage:.3f}/{total_resistance} = {current * 1000:.3f}mA. "
            f"LED needs ≥1.5V for faint glow, ≥1.8V for bright. Status: {led_status}"
        )

        return {
            "total_voltage": round(total_voltage, 4),
            "current_amps": round(current, 6),
            "current_mA": round(current * 1000, 4),
            "resistance_ohms": round(total_resistance, 2),
            "power_watts": round(power, 6),
            "power_mW": round(power * 1000, 4),
            "led_brightness": round(brightness, 2),
            "led_status": led_status,
            "cells": cells,
            "explanation": explanation,
        }

    def calculate_runtime(
        self,
        mass_grams: float,
        current_amps: float,
        n_electrons: int = 2,
        molar_mass: float = 65.38,
    ) -> Dict[str, Any]:
        """Faraday's law: t = (m·n·F)/(M·I)"""
        if current_amps <= 0:
            return {"runtime_seconds": float("inf"), "runtime_human": "∞", "explanation": "No current flowing."}

        seconds = (mass_grams * n_electrons * F) / (molar_mass * current_amps)
        hours = seconds / 3600
        days = hours / 24

        if days > 1:
            human = f"{days:.1f} days"
        elif hours > 1:
            human = f"{hours:.1f} hours"
        else:
            human = f"{seconds / 60:.1f} minutes"

        return {
            "runtime_seconds": round(seconds, 0),
            "runtime_hours": round(hours, 2),
            "runtime_human": human,
            "mass_consumed_g": mass_grams,
            "current_A": current_amps,
            "explanation": (
                f"Using Faraday's law: t = mₐnF/(MI) = "
                f"({mass_grams}×{n_electrons}×{F})/({molar_mass}×{current_amps}) = "
                f"{seconds:.0f}s ≈ {human}"
            ),
        }
