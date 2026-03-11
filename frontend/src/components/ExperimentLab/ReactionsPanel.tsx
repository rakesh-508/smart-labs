/* ───────────────────────────────────────────────────────
   Smart Lab – Reactions Panel
   Shows chemical equations when circuit is active
   ─────────────────────────────────────────────────────── */

import type { ReactionStep, CircuitState } from '../../types';

interface Props {
  reactions: ReactionStep[];
  circuitState: CircuitState;
}

export default function ReactionsPanel({ reactions, circuitState }: Props) {
  if (!circuitState.isComplete) {
    return (
      <div className="panel-section">
        <h3>⚗️ Reactions</h3>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Complete the circuit to see the chemical reactions in action...
        </div>
      </div>
    );
  }

  return (
    <div className="panel-section">
      <h3>⚗️ Active Reactions</h3>
      {reactions.map((rxn, i) => (
        <div key={i} className={`reaction-equation ${rxn.type}`}>
          <div style={{ fontWeight: 600, marginBottom: 2, fontSize: '0.75rem', textTransform: 'capitalize' }}>
            {rxn.type === 'oxidation' ? '🔴' : rxn.type === 'reduction' ? '🔵' : '🟢'} {rxn.type}
          </div>
          <div style={{ fontSize: '0.85rem' }}>{rxn.equation}</div>
          {rxn.deltaG !== undefined && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
              ΔG = {rxn.deltaG.toFixed(1)} kJ/mol
            </div>
          )}
        </div>
      ))}

      {/* Overall cell info */}
      <div style={{
        marginTop: 10,
        padding: '8px',
        background: 'var(--bg-primary)',
        borderRadius: 6,
        fontSize: '0.75rem',
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Cell EMF Calculation:</div>
        <div style={{ fontFamily: 'Courier New', color: 'var(--info)' }}>
          E°cell = E°cathode − E°anode
        </div>
        <div style={{ fontFamily: 'Courier New', color: 'var(--info)' }}>
          E°cell = 0.00V − (−0.76V) = +0.76V
        </div>
        <div style={{ fontFamily: 'Courier New', color: 'var(--text-muted)', marginTop: 4 }}>
          Practical: ~{circuitState.totalVoltage.toFixed(2)}V ({circuitState.cells.length} cell{circuitState.cells.length > 1 ? 's' : ''})
        </div>
      </div>
    </div>
  );
}
