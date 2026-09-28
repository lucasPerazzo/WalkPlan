import { ENVIRONMENTS, ENVIRONMENT_IDS } from '../environment/presets.ts';
import type { Season } from '../geometry/sun.ts';
import type { EnvironmentPreset } from '../model/schema.ts';

const SEASONS: { id: Season; label: string }[] = [
  { id: 'summer', label: 'Verano' },
  { id: 'equinox', label: 'Otoño / primavera' },
  { id: 'winter', label: 'Invierno' },
];

const fmt = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

interface Props {
  hour: number;
  season: Season;
  onHour: (h: number) => void;
  onSeason: (s: Season) => void;
  roof: boolean | null; // null: el botón no aplica en esta vista
  onRoof: (v: boolean) => void;
  environment: EnvironmentPreset;
  onEnvironment: (e: EnvironmentPreset) => void;
  surroundings: boolean | null; // maqueta: mostrar árboles y edificios (null: no aplica)
  onSurroundings: (v: boolean) => void;
}

// Panel de abajo: entorno exterior, sol (hora y estación) y, en maqueta, techo y entorno.
export function SunPanel({ hour, season, onHour, onSeason, roof, onRoof, environment, onEnvironment, surroundings, onSurroundings }: Props) {
  return (
    <div className="panel sun-panel">
      <select value={environment} onChange={(e) => onEnvironment(e.target.value as EnvironmentPreset)} aria-label="Entorno">
        {ENVIRONMENT_IDS.map((id) => (
          <option key={id} value={id}>
            {ENVIRONMENTS[id].label}
          </option>
        ))}
      </select>
      <label className="sun-hour">
        <span className="eyebrow">Sol</span>
        <input type="range" min={6} max={20} step={0.25} value={hour} onChange={(e) => onHour(Number(e.target.value))} aria-label="Hora solar" />
        <output>{fmt(hour)} h</output>
      </label>
      <select value={season} onChange={(e) => onSeason(e.target.value as Season)} aria-label="Estación">
        {SEASONS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {roof !== null && (
        <button type="button" className="btn toggle" aria-pressed={roof} onClick={() => onRoof(!roof)} title={roof ? 'Ocultar techo' : 'Mostrar techo'}>
          Techo
        </button>
      )}
      {surroundings !== null && (
        <button
          type="button"
          className="btn toggle"
          aria-pressed={surroundings}
          onClick={() => onSurroundings(!surroundings)}
          title={surroundings ? 'Ocultar árboles y edificios' : 'Mostrar árboles y edificios'}
        >
          Entorno
        </button>
      )}
    </div>
  );
}
