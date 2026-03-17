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

  // Raw sensor values
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none font-mono text-xs">
      <div className="w-full max-w-md rounded-xl border shadow-xl overflow-hidden flex flex-col transition-colors bg-white dark:bg-[#0f121d] border-slate-200 dark:border-[#20273d] text-slate-800 dark:text-slate-200">
        {/* Header */}
        <div className="h-11 px-4 border-b flex items-center justify-between border-slate-200 dark:border-[#1e2439] bg-slate-50 dark:bg-[#131726]">
          <div className="flex items-center gap-2 font-semibold">
            <Plus className="w-4 h-4 text-sky-500" />
            <span>{isRu ? 'Новый замер инклинометрии' : 'Add Directional Station'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-3xs text-slate-500 uppercase mb-1">
                MD ({unitSystem === 'metric' ? 'm' : 'ft'})
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={md}
                onChange={(e) => setMd(parseFloat(e.target.value) || 0)}
                className="w-full bg-white dark:bg-[#161a29] border border-slate-200 dark:border-[#242c43] rounded-md px-2.5 py-1.5 font-semibold text-sky-600 dark:text-sky-400 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-3xs text-slate-500 uppercase mb-1">
                Inc (°)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={inc}
                onChange={(e) => setInc(parseFloat(e.target.value) || 0)}
                className="w-full bg-white dark:bg-[#161a29] border border-slate-200 dark:border-[#242c43] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-3xs text-slate-500 uppercase mb-1">
                Azim (°)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={azim}
                onChange={(e) => setAzim(parseFloat(e.target.value) || 0)}
                className="w-full bg-white dark:bg-[#161a29] border border-slate-200 dark:border-[#242c43] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Sensors */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-[#1e253c] bg-slate-50 dark:bg-[#121624] space-y-2.5">
            <div className="text-3xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-sky-500" />
              <span>{isRu ? 'MWD ДАТЧИКИ (ОПЦИОНАЛЬНО)' : 'MWD SENSORS (OPTIONAL)'}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-3xs text-slate-400">Gx (g)</label>
                <input
                  type="number"
                  step="0.001"
                  value={gx}
                  onChange={(e) => setGx(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-3xs text-slate-400">Gy (g)</label>
                <input
                  type="number"
                  step="0.001"
                  value={gy}
                  onChange={(e) => setGy(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-3xs text-slate-400">Gz (g)</label>
                <input
                  type="number"
                  step="0.001"
                  value={gz}
                  onChange={(e) => setGz(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-3xs text-slate-400">Bx (nT)</label>
                <input
                  type="number"
                  value={bx}
                  onChange={(e) => setBx(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-3xs text-slate-400">By (nT)</label>
                <input
                  type="number"
                  value={by}
                  onChange={(e) => setBy(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-3xs text-slate-400">Bz (nT)</label>
                <input
                  type="number"
                  value={bz}
                  onChange={(e) => setBz(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-white dark:bg-[#181c2d] border border-slate-200 dark:border-[#28324f] rounded px-2 py-1"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#1e2439]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1c2236] text-slate-600 dark:text-slate-400"
            >
              {isRu ? 'Отмена' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-xs"
            >
              {isRu ? 'Добавить' : 'Add Station'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
