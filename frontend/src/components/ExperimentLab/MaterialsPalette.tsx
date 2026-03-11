/* ───────────────────────────────────────────────────────
   Smart Lab – Materials Palette
   Quick-add materials to the workspace
   ─────────────────────────────────────────────────────── */

import type { Material } from '../../types';

interface Props {
  materials: Material[];
  onSelect: (materialId: string) => void;
}

export default function MaterialsPalette({ materials, onSelect }: Props) {
  return (
    <div className="panel-section">
      <h3>🧪 Materials</h3>
      <div className="materials-palette">
        {materials.map(mat => (
          <div
            key={mat.id}
            className="material-chip"
            onClick={() => onSelect(mat.id)}
            title={mat.description}
          >
            <span className="emoji">{mat.emoji}</span>
            <span className="name">{mat.name.split('(')[0].trim()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
