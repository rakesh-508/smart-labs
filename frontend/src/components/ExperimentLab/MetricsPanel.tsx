/* ───────────────────────────────────────────────────────
   Smart Lab – Metrics Panel
   Live circuit measurements display
   ─────────────────────────────────────────────────────── */

import type { CircuitState } from '../../types';

interface Props {
  circuitState: CircuitState;
}

export default function MetricsPanel({ circuitState }: Props) {
  const { totalVoltage, current, resistance, power, ledBrightness, cells, isComplete } = circuitState;

  return (
    <div className="panel-section">
      <h3>📊 Live Metrics</h3>

      <div className="metric-row">
        <span className="metric-label">Status</span>
        <span className="metric-value" style={{ color: isComplete ? 'var(--success)' : 'var(--text-muted)' }}>
          {isComplete ? '● Active' : '○ Inactive'}
        </span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Cells</span>
        <span className="metric-value">{cells.length}</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Voltage</span>
        <span className="metric-value voltage">{totalVoltage.toFixed(3)} V</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Current</span>
        <span className="metric-value current">{(current * 1000).toFixed(3)} mA</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Resistance</span>
        <span className="metric-value">{resistance.toFixed(0)} Ω</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">Power</span>
        <span className="metric-value power">{(power * 1000).toFixed(4)} mW</span>
      </div>

      <div className="metric-row">
        <span className="metric-label">LED</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className={`led-indicator ${ledBrightness > 0.5 ? 'bright' : ledBrightness > 0 ? 'dim' : ''}`}
          />
          <span className="metric-value brightness">
            {(ledBrightness * 100).toFixed(0)}%
          </span>
        </span>
      </div>

      {/* Voltage bar */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          Voltage vs LED threshold
        </div>
        <div style={{
          height: 8,
          background: 'var(--bg-primary)',
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (totalVoltage / 3) * 100)}%`,
            background: totalVoltage >= 1.8 ? 'var(--success)' : totalVoltage >= 1.5 ? 'var(--warning)' : 'var(--danger)',
            borderRadius: 4,
            transition: 'width 0.5s ease, background 0.5s ease',
          }} />
          {/* LED threshold marker */}
          <div style={{
            position: 'absolute',
            left: `${(1.8 / 3) * 100}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'white',
            opacity: 0.5,
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.6rem',
          color: 'var(--text-muted)',
          marginTop: 2,
        }}>
          <span>0V</span>
          <span>1.8V (LED)</span>
          <span>3V</span>
        </div>
      </div>
    </div>
  );
}
