import React, { useState } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { X, Plus, Radio } from 'lucide-react';

interface AddSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddSurveyModal: React.FC<AddSurveyModalProps> = ({ isOpen, onClose }) => {
  const { stations, addStation, unitSystem, language } = useWellbore();

  const lastStn = stations[stations.length - 1] || { md: 0, inc: 0, azim: 0 };

  const [md, setMd] = useState<number>(Math.round(lastStn.md + 30));
  const [inc, setInc] = useState<number>(lastStn.inc);
  const [azim, setAzim] = useState<number>(lastStn.azim);

  // Raw MWD sensor readings
  const [gx, setGx] = useState<number>(0.513);
  const [gy, setGy] = useState<number>(0.865);
  const [gz, setGz] = useState<number>(0.0);
  const [bx, setBx] = useState<number>(17690);
  const [by, setBy] = useState<number>(4380);
  const [bz, setBz] = useState<number>(50200);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addStation({
      md,
      inc,
      azim,
      sensor: { gx, gy, gz, bx, by, bz },
    });
    onClose();
  };

  const isRu = language === 'ru';
  const lenUnit = unitSystem === 'metric' ? 'm' : 'ft';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 select-none font-mono text-[11.5px]">
      <div className="w-full max-w-md rounded-[var(--r3)] border border-[var(--line-strong)] bg-[var(--bg-1)] text-[var(--fg-0)] shadow-[var(--shadow-2)] overflow-hidden flex flex-col transition-colors">
        {/* Modal Header */}
        <div className="h-10 px-4 border-b border-[var(--line)] bg-[var(--bg-2)] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[12px] font-sans text-[var(--fg-0)]">
            <Plus className="w-4 h-4 text-[var(--accent)]" />
            <span>{isRu ? 'Новый замер инклинометрии' : 'Add Directional Station'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--fg-2)] hover:text-[var(--fg-0)] p-1 rounded-[var(--r1)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Entry Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Main Trajectory Geometry */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[9.5px] uppercase font-semibold text-[var(--fg-3)] mb-1">
                MD ({lenUnit})
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={md}
                onChange={(e) => setMd(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r1)] px-2.5 py-1.5 font-semibold text-[var(--accent)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--bg-1)] transition-all"
              />
            </div>

            <div>
              <label className="block text-[9.5px] uppercase font-semibold text-[var(--fg-3)] mb-1">
                Inc (°)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={inc}
                onChange={(e) => setInc(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r1)] px-2.5 py-1.5 text-[var(--fg-0)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--bg-1)] transition-all"
              />
            </div>

            <div>
              <label className="block text-[9.5px] uppercase font-semibold text-[var(--fg-3)] mb-1">
                Azim (°)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={azim}
                onChange={(e) => setAzim(parseFloat(e.target.value) || 0)}
                className="w-full bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r1)] px-2.5 py-1.5 text-[var(--fg-0)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--bg-1)] transition-all"
              />
            </div>
          </div>

          {/* Optional MWD Sensors Readings */}
          <div className="p-3 rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-2)] space-y-2.5">
            <div className="text-[10px] font-semibold text-[var(--fg-2)] flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-[var(--accent)]" />
              <span>{isRu ? 'MWD ДАТЧИКИ (ОПЦИОНАЛЬНО)' : 'MWD SENSORS (OPTIONAL)'}</span>
            </div>

            {/* Accelerometers Gx, Gy, Gz */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9.5px] text-[var(--fg-3)]">Gx (g)</label>
                <input
                  type="number"
                  step="0.001"
                  value={gx}
                  onChange={(e) => setGx(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--r1)] px-2 py-1 text-[var(--fg-0)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-[9.5px] text-[var(--fg-3)]">Gy (g)</label>
                <input
                  type="number"
                  step="0.001"
                  value={gy}
                  onChange={(e) => setGy(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--r1)] px-2 py-1 text-[var(--fg-0)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-[9.5px] text-[var(--fg-3)]">Gz (g)</label>
                <input
                  type="number"
                  step="0.001"
                  value={gz}
                  onChange={(e) => setGz(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--r1)] px-2 py-1 text-[var(--fg-0)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {/* Magnetometers Bx, By, Bz */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9.5px] text-[var(--fg-3)]">Bx (nT)</label>
                <input
                  type="number"
                  value={bx}
                  onChange={(e) => setBx(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--r1)] px-2 py-1 text-[var(--fg-0)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-[9.5px] text-[var(--fg-3)]">By (nT)</label>
                <input
                  type="number"
                  value={by}
                  onChange={(e) => setBy(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--r1)] px-2 py-1 text-[var(--fg-0)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-[9.5px] text-[var(--fg-3)]">Bz (nT)</label>
                <input
                  type="number"
                  value={bz}
                  onChange={(e) => setBz(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--r1)] px-2 py-1 text-[var(--fg-0)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-[var(--r1)] text-[var(--fg-1)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] transition-colors"
            >
              {isRu ? 'Отмена' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-[var(--r1)] bg-[var(--accent)] hover:brightness-110 text-white font-medium shadow-[var(--shadow-1)] transition-all"
            >
              {isRu ? 'Добавить замер' : 'Add Station'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};