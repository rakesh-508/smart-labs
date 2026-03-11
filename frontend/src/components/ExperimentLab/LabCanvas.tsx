/* ───────────────────────────────────────────────────────
   Smart Lab – Lab Canvas (HTML5 Canvas Real-Time Rendering)
   Full animation loop with electron flow, LED glow,
   multi-lemon series, and 3 view modes (Lab / Molecule / Circuit)
   ─────────────────────────────────────────────────────── */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { CircuitState, Experiment } from '../../types';

// ── Simulation state fed in from parent ──────────────
export interface CanvasLabState {
  lemons: number;
  hasNail: boolean;
  hasCopper: boolean;
  hasLED: boolean;
  nailInserted: boolean;
  copperInserted: boolean;
  ledConnected: boolean;
  lemonRolled: boolean;
  circuitComplete: boolean;
  ledReversed: boolean;
}

interface Props {
  labState: CanvasLabState;
  circuitState: CircuitState;
  experiment: Experiment;
}

// ── Electron particle type ───────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
}

type ViewMode = 'lab' | 'molecule' | 'circuit';

export default function LabCanvas({ labState, circuitState, experiment }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const moleculeAngleRef = useRef(0);
  const [view, setView] = useState<ViewMode>('lab');

  // Stable refs so the animation loop always reads latest props
  const labRef = useRef(labState);
  const circRef = useRef(circuitState);
  const viewRef = useRef(view);

  useEffect(() => { labRef.current = labState; }, [labState]);
  useEffect(() => { circRef.current = circuitState; }, [circuitState]);
  useEffect(() => { viewRef.current = view; }, [view]);

  // ── Resize observer ────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wrap = canvas.parentElement!;
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
  }, []);

  // ── Drawing helpers ────────────────────────────────
  const lighten = (hex: string, amt: number) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + amt);
    const g = Math.min(255, ((n >> 8) & 0xff) + amt);
    const b = Math.min(255, (n & 0xff) + amt);
    return `rgb(${r},${g},${b})`;
  };

  // ── Main draw function ─────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const s = labRef.current;
    const cs = circRef.current;
    const v = viewRef.current;

    ctx.clearRect(0, 0, W, H);

    // Background table
    const tableGrad = ctx.createLinearGradient(0, H * 0.55, 0, H);
    tableGrad.addColorStop(0, '#1a2435');
    tableGrad.addColorStop(1, '#0d1520');
    ctx.fillStyle = tableGrad;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    ctx.fillStyle = '#243245';
    ctx.fillRect(0, H * 0.55, W, 3);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, H * 0.55); ctx.lineTo(x, H); ctx.stroke();
    }

    if (v === 'lab') drawLabView(ctx, W, H, s, cs);
    else if (v === 'molecule') drawMoleculeView(ctx, W, H);
    else if (v === 'circuit') drawCircuitView(ctx, W, H, s, cs);

    animRef.current = requestAnimationFrame(draw);
  }, []);

  // ── LAB VIEW ───────────────────────────────────────
  function drawLabView(
    ctx: CanvasRenderingContext2D, W: number, H: number,
    s: CanvasLabState, cs: CircuitState
  ) {
    const cx = W / 2, lemonY = H * 0.52 + 30;

    // Empty state
    if (s.lemons === 0 && !s.hasNail && !s.hasCopper && !s.hasLED) {
      ctx.fillStyle = '#64748b';
      ctx.font = '18px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔬 Your lab table is empty', cx, H * 0.45);
      ctx.font = '13px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('Use the chat to add materials — say "take a lemon"', cx, H * 0.45 + 28);
      ctx.textAlign = 'left';
      return;
    }

    // Draw lemons
    for (let i = 0; i < s.lemons; i++) {
      const lx = cx + (i - (s.lemons - 1) / 2) * 130;
      drawLemon(ctx, lx, lemonY, s.lemonRolled && i === 0);

      // For first lemon always, for extra lemons show electrodes implied
      if (s.nailInserted) drawNail(ctx, lx - 22, lemonY);
      if (s.copperInserted) drawCopper(ctx, lx + 22, lemonY);

      // Series wires between lemons
      if (s.lemons > 1 && i < s.lemons - 1) {
        const nextLx = cx + ((i + 1) - (s.lemons - 1) / 2) * 130;
        drawConnectionWire(ctx, lx + 50, lemonY - 12, nextLx - 50, lemonY - 12, s.circuitComplete);
      }

      // Label below each lemon
      if (s.lemons > 1) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Lemon #${i + 1}`, lx, lemonY + 62);
        ctx.textAlign = 'left';
      }
    }

    // Draw LED
    if (s.hasLED) {
      const ledX = cx + ((s.lemons || 1) * 0.5) * 130 + 50;
      const ledY = lemonY - 60;
      const ledOn = s.circuitComplete && cs.ledBrightness > 0;
      drawLED(ctx, ledX, ledY, ledOn, cs.ledBrightness, s.ledReversed);

      // Wires from electrodes to LED
      if (s.ledConnected && s.lemons > 0) {
        const firstLemonX = cx - ((s.lemons - 1) / 2) * 130;
        const lastLemonX  = cx + ((s.lemons - 1) / 2) * 130;
        // Zinc to LED (−)
        if (s.nailInserted) {
          drawConnectionWire(ctx, firstLemonX - 22, lemonY - 50, ledX - 8, ledY + 30, s.circuitComplete);
        }
        // Copper to LED (+)
        if (s.copperInserted) {
          drawConnectionWire(ctx, lastLemonX + 22, lemonY - 50, ledX + 8, ledY + 30, s.circuitComplete);
        }
      }

      // LED label
      ctx.fillStyle = '#888';
      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ledOn ? `LED (${(cs.ledBrightness * 100).toFixed(0)}%)` : 'LED', ledX, ledY + 50);
      ctx.textAlign = 'left';
    }

    // Electrode labels
    if (s.nailInserted) {
      const firstX = cx - ((s.lemons - 1) / 2) * 130;
      drawLabel(ctx, firstX - 55, lemonY + 75, '⊖ Zinc (Anode)', '#8a9ba8');
    }
    if (s.copperInserted) {
      const firstX = cx - ((s.lemons - 1) / 2) * 130;
      drawLabel(ctx, firstX + 10, lemonY + 75, '⊕ Copper (Cathode)', '#b87333');
    }

    // Electron flow
    if (s.circuitComplete && cs.current > 0) {
      drawElectronFlow(ctx, cx, lemonY, s);

      // Info text
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ Electron Flow: Zn → wire → LED → wire → Cu', cx, 30);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "Courier New", monospace';
      ctx.fillText(
        `V = ${cs.totalVoltage.toFixed(2)}V | I = ${(cs.current * 1000).toFixed(2)}mA | P = ${(cs.power * 1000).toFixed(3)}mW`,
        cx, 48
      );
      ctx.textAlign = 'left';
    }
  }

  // ── Draw individual items ──────────────────────────

  function drawLemon(ctx: CanvasRenderingContext2D, x: number, y: number, rolled: boolean) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;

    if (rolled) {
      ctx.translate(x, y);
      const t = Date.now() / 300;
      ctx.rotate(Math.sin(t) * 0.06);
      ctx.translate(-x, -y);
    }

    // Body
    ctx.beginPath();
    ctx.ellipse(x, y, 46, 34, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x - 12, y - 12, 2, x, y, 46);
    grad.addColorStop(0, '#fff9a0');
    grad.addColorStop(0.3, '#f5e642');
    grad.addColorStop(0.8, '#e8c820');
    grad.addColorStop(1, '#c9a800');
    ctx.fillStyle = grad;
    ctx.fill();

    // Tips
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(x - 42, y, 10, 7, -0.4, 0, Math.PI * 2); ctx.fillStyle = '#d4b800'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 42, y, 10, 7, 0.4, 0, Math.PI * 2); ctx.fill();

    // Texture dots
    for (let i = 0; i < 8; i++) {
      const tx = x + Math.cos(i * 0.9) * 28 + Math.sin(i) * 5;
      const ty = y + Math.sin(i * 0.9) * 18;
      ctx.beginPath(); ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,160,0,0.4)'; ctx.fill();
    }
    ctx.restore();
  }

  function drawNail(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10;
    const grad = ctx.createLinearGradient(x - 5, 0, x + 5, 0);
    grad.addColorStop(0, '#6a7d8e');
    grad.addColorStop(0.5, '#b0c0cc');
    grad.addColorStop(1, '#5a6e7e');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 5, y - 50, 10, 60);
    // Head
    ctx.fillStyle = '#8a9ba8';
    ctx.beginPath(); ctx.ellipse(x, y - 54, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#7a8b98';
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText('Zn', x - 8, y - 58);
  }

  function drawCopper(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x, y - 10 - i * 8, 6, 0, Math.PI * 2);
      const wg = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
      wg.addColorStop(0, '#7a4a1a');
      wg.addColorStop(0.5, '#d4844a');
      wg.addColorStop(1, '#7a4a1a');
      ctx.strokeStyle = wg;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#b87333';
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText('Cu', x - 8, y - 68);
  }

  function drawLED(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean, brightness: number, reversed?: boolean) {
    ctx.save();
    if (on && !reversed) {
      const glow = 0.5 + Math.sin(Date.now() / 200) * 0.3;
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 30 * glow * brightness;
    }
    // Dome
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    const ledGrad = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, 14);
    if (on && !reversed) {
      ledGrad.addColorStop(0, '#ffaaaa');
      ledGrad.addColorStop(0.4, '#ff4444');
      ledGrad.addColorStop(1, '#cc0000');
    } else {
      ledGrad.addColorStop(0, '#443333');
      ledGrad.addColorStop(1, '#221111');
    }
    ctx.fillStyle = ledGrad;
    ctx.fill();
    ctx.strokeStyle = (on && !reversed) ? '#ff6666' : '#443333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Legs — color-coded: left = anode(+, red/long), right = cathode(-, blue/short)
    // When reversed, the colors swap
    ctx.shadowBlur = 0;
    const leftColor = reversed ? '#5588cc' : '#cc5555';  // anode(+) or cathode(-)
    const rightColor = reversed ? '#cc5555' : '#5588cc';
    const leftLen = reversed ? 26 : 30;   // cathode=short, anode=long
    const rightLen = reversed ? 30 : 26;

    ctx.strokeStyle = leftColor; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - 6, y + 14); ctx.lineTo(x - 6, y + leftLen); ctx.stroke();
    ctx.strokeStyle = rightColor; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x + 6, y + 14); ctx.lineTo(x + 6, y + rightLen); ctx.stroke();

    // Polarity labels on legs
    ctx.font = '8px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = leftColor;
    ctx.fillText(reversed ? '−' : '+', x - 6, y + leftLen + 10);
    ctx.fillStyle = rightColor;
    ctx.fillText(reversed ? '+' : '−', x + 6, y + rightLen + 10);
    ctx.textAlign = 'left';
    ctx.restore();

    // Reversed indicator — red X over the LED
    if (reversed) {
      ctx.save();
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 400) * 0.3;
      ctx.beginPath(); ctx.moveTo(x - 10, y - 10); ctx.lineTo(x + 10, y + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 10, y - 10); ctx.lineTo(x - 10, y + 10); ctx.stroke();
      ctx.restore();
      // "REVERSED" label
      ctx.fillStyle = '#ff6666'; ctx.font = 'bold 9px "Courier New", monospace';
      ctx.textAlign = 'center'; ctx.fillText('REVERSED', x, y - 20); ctx.textAlign = 'left';
    }

    // Light rays when on (forward bias only)
    if (on && !reversed && brightness > 0.2) {
      ctx.save();
      const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.4;
      ctx.globalAlpha = brightness * pulse * 0.25;
      for (let a = 0; a < 360; a += 45) {
        const rad = (a * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(rad) * 16, y + Math.sin(rad) * 16);
        ctx.lineTo(x + Math.cos(rad) * (28 + brightness * 20), y + Math.sin(rad) * (28 + brightness * 20));
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawConnectionWire(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    active: boolean
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, y1 - 30, x2, y2 - 30, x2, y2);
    ctx.strokeStyle = active ? '#00e5ff' : '#334455';
    ctx.lineWidth = active ? 2.5 : 1.5;
    if (active) { ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 8; }
    ctx.stroke();
    ctx.restore();
  }

  function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
    ctx.fillStyle = color;
    ctx.font = '11px "Courier New", monospace';
    ctx.fillText(text, x, y);
  }

  function drawElectronFlow(
    ctx: CanvasRenderingContext2D,
    cx: number, lemonY: number,
    s: CanvasLabState
  ) {
    const particles = particlesRef.current;
    // Spawn
    if (Math.random() < 0.35) {
      const startX = cx - ((s.lemons - 1) / 2) * 130 - 22;
      particles.push({
        x: startX, y: lemonY - 20,
        vx: 2 + Math.random(), vy: -0.5 + Math.random() * 0.3,
        life: 80, maxLife: 80,
        size: 2.5,
      });
    }
    // Update & draw
    ctx.save();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const alpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,229,255,${alpha})`;
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.restore();
  }

  // ── MOLECULE VIEW ──────────────────────────────────
  function drawMoleculeView(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const cx = W / 2, cy = H / 2;
    moleculeAngleRef.current += 0.01;
    const t = moleculeAngleRef.current;

    ctx.fillStyle = 'rgba(0,229,255,0.7)';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.fillText('MOLECULAR VIEW — Electrochemical Cell', 20, 30);

    // Electrolyte box
    ctx.fillStyle = 'rgba(245,230,66,0.12)';
    ctx.fillRect(cx - 180, cy - 80, 360, 160);
    ctx.strokeStyle = 'rgba(245,230,66,0.2)';
    ctx.strokeRect(cx - 180, cy - 80, 360, 160);
    ctx.fillStyle = '#d4b80060';
    ctx.font = '11px "Courier New", monospace';
    ctx.fillText('Electrolyte (Citric Acid Solution)', cx - 100, cy + 75);

    // Zinc atom
    const znX = cx - 150, znY = cy;
    drawAtom(ctx, znX, znY, 30, '#8a9ba8', 'Zn', t);

    // Electrons leaving
    for (let i = 0; i < 3; i++) {
      const ex = znX + 40 + i * 40 + Math.sin(t + i) * 5;
      const ey = znY - 10 + Math.cos(t + i) * 10;
      ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#00e5ff';
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 12;
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '8px "Courier New", monospace';
      ctx.fillText('e⁻', ex - 5, ey + 3);
    }

    // Copper atom
    const cuX = cx + 150, cuY = cy;
    drawAtom(ctx, cuX, cuY, 30, '#b87333', 'Cu', -t);

    // H⁺ ions
    for (let i = 0; i < 5; i++) {
      const hx = cx - 100 + i * 50 + Math.sin(t + i * 1.3) * 15;
      const hy = cy + 20 + Math.cos(t + i) * 20;
      ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,180,50,0.7)'; ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = '8px sans-serif';
      ctx.fillText('H⁺', hx - 5, hy + 3);
    }

    // Zn²⁺ ion
    const znIonX = znX + 80 + Math.sin(t) * 30;
    ctx.beginPath(); ctx.arc(znIonX, cy + 10, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(138,155,168,0.8)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '8px "Courier New", monospace';
    ctx.fillText('Zn²⁺', znIonX - 10, cy + 14);

    // Labels
    ctx.fillStyle = '#8a9ba8'; ctx.font = '12px "Courier New", monospace';
    ctx.fillText('ANODE (−)', znX - 30, cy - 50);
    ctx.fillText('Zn→Zn²⁺+2e⁻', znX - 40, cy + 55);
    ctx.fillStyle = '#b87333';
    ctx.fillText('CATHODE (+)', cuX - 30, cy - 50);
    ctx.fillText('Cu²⁺+2e⁻→Cu', cuX - 40, cy + 55);
  }

  function drawAtom(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, r: number,
    color: string, label: string, angle: number
  ) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    g.addColorStop(0, lighten(color, 40));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.shadowColor = color; ctx.shadowBlur = 15;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 4); ctx.textAlign = 'left';

    // Electron orbits
    for (let e = 0; e < 2; e++) {
      const ea = angle + e * Math.PI;
      ctx.beginPath();
      ctx.ellipse(x, y, r + 20, r * 0.4, e * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1; ctx.stroke();
      const ex2 = x + Math.cos(ea) * (r + 20);
      const ey2 = y + Math.sin(ea * 0.5) * r * 0.4;
      ctx.beginPath(); ctx.arc(ex2, ey2, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }
  }

  // ── CIRCUIT VIEW ───────────────────────────────────
  function drawCircuitView(
    ctx: CanvasRenderingContext2D, W: number, H: number,
    s: CanvasLabState, cs: CircuitState
  ) {
    const cx = W / 2, cy = H / 2;
    ctx.fillStyle = 'rgba(0,229,255,0.6)';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.fillText('CIRCUIT DIAGRAM', 20, 30);

    const battR = 40;

    // Battery (lemon)
    ctx.beginPath();
    ctx.arc(cx - 120, cy, battR, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(cx - 120, cy, 5, cx - 120, cy, battR);
    bg.addColorStop(0, '#fff9a0'); bg.addColorStop(1, '#c9a800');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = '#e8c820'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#222'; ctx.font = '18px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('🍋', cx - 120, cy + 6);
    ctx.font = '11px "Courier New", monospace';
    const voltsPerCell = cs.cells.length > 0 ? (cs.totalVoltage / cs.cells.length).toFixed(1) : '0.9';
    ctx.fillText(`${s.lemons}× ~${voltsPerCell}V`, cx - 120, cy + 22);
    // Terminals
    ctx.fillStyle = '#8a9ba8'; ctx.font = '12px "Courier New", monospace';
    ctx.fillText('−', cx - 158, cy + 4);
    ctx.fillStyle = '#b87333';
    ctx.fillText('+', cx - 87, cy + 4);
    ctx.textAlign = 'left';

    // LED
    const isOn = s.circuitComplete && cs.ledBrightness > 0 && !s.ledReversed;
    ctx.beginPath();
    ctx.arc(cx + 120, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = isOn ? '#ff4444' : '#442222';
    if (isOn) { ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 30; }
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.ledReversed ? 'REV' : (isOn ? 'ON' : 'OFF'), cx + 120, cy + 4);
    if (s.ledReversed) {
      ctx.fillStyle = '#ff6666'; ctx.font = '8px "Courier New", monospace';
      ctx.fillText('(no current)', cx + 120, cy + 16);
    }
    ctx.textAlign = 'left';

    // Wires
    const wireColor = s.circuitComplete ? '#00e5ff' : '#334455';
    ctx.strokeStyle = wireColor;
    ctx.lineWidth = s.circuitComplete ? 3 : 1.5;
    if (s.circuitComplete) { ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 10; }
    ctx.beginPath();
    ctx.moveTo(cx - 80, cy - battR * 0.7);
    ctx.lineTo(cx + 100, cy - battR * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 80, cy + battR * 0.7);
    ctx.lineTo(cx + 100, cy + battR * 0.7);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Arrow
    if (s.circuitComplete) {
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(cx + 30, cy - battR * 0.7 - 5);
      ctx.lineTo(cx + 45, cy - battR * 0.7);
      ctx.lineTo(cx + 30, cy - battR * 0.7 + 5);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '10px "Courier New", monospace';
      ctx.fillText('e⁻ flow →', cx - 20, cy - battR * 0.7 - 10);
    }

    // Resistance label
    if (s.ledConnected) {
      ctx.fillStyle = '#aaa'; ctx.font = '10px "Courier New", monospace';
      ctx.fillText(`R≈${cs.resistance.toFixed(0)}Ω`, cx + 100, cy - battR - 10);
    }

    // Readout
    if (cs.totalVoltage > 0) {
      ctx.fillStyle = 'rgba(0,229,255,0.8)'; ctx.font = '12px "Courier New", monospace';
      ctx.fillText(`V = ${cs.totalVoltage.toFixed(2)} V`, cx - 160, cy + 100);
      ctx.fillText(`I = ${(cs.current * 1000).toFixed(2)} mA`, cx - 160, cy + 118);
      ctx.fillText(`P = ${(cs.power * 1000).toFixed(3)} mW`, cx - 160, cy + 136);
      ctx.fillText(`Cells = ${s.lemons}`, cx - 160, cy + 154);
    }
  }

  // ── Animation loop lifecycle ───────────────────────
  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    animRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [draw, resize]);

  // Derive step progress from labState
  const stepProgress = labState.circuitComplete ? 5
    : labState.ledConnected ? 4
    : (labState.nailInserted && labState.copperInserted) ? 3
    : labState.lemonRolled ? 2
    : labState.lemons > 0 ? 1
    : 0;

  return (
    <div className="lab-canvas-container">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* View mode toggle */}
      <div className="canvas-view-toggle">
        <button
          className={`canvas-view-btn ${view === 'lab' ? 'active' : ''}`}
          onClick={() => setView('lab')}
        >🔬 Lab View</button>
        <button
          className={`canvas-view-btn ${view === 'molecule' ? 'active' : ''}`}
          onClick={() => setView('molecule')}
        >⚛ Molecule</button>
        <button
          className={`canvas-view-btn ${view === 'circuit' ? 'active' : ''}`}
          onClick={() => setView('circuit')}
        >⚡ Circuit</button>
      </div>

      {/* Step indicator dots */}
      <div className="canvas-step-dots">
        {experiment.steps.map((step, i) => (
          <div
            key={step.id}
            className={`canvas-sdot ${i < stepProgress ? 'done' : ''} ${i === stepProgress ? 'active' : ''}`}
            title={step.title}
          />
        ))}
      </div>
    </div>
  );
}
