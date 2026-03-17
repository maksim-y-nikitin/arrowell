import React, { useState } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import { parseSurveyFileContent } from '@/utils/fileParsers';
import { X, Upload, FileText, CheckCircle2 } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose }) => {
  const { importStations, notify, language } = useWellbore();
  const [textInput, setTextInput] = useState('');
  const [parsedCount, setParsedCount] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleTextChange = (val: string) => {
    setTextInput(val);
    const parsed = parseSurveyFileContent(val);
    setParsedCount(parsed.length > 0 ? parsed.length : null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleTextChange(content);
    };
    reader.readAsText(file);
  };

  const handleApply = () => {
    const parsed = parseSurveyFileContent(textInput);
    if (parsed.length === 0) {
      notify(language === 'ru' ? 'Не найдены корректные замеры' : 'No valid survey stations found', 'error');
      return;
    }
    importStations(parsed);
    onClose();
  };

  const isRu = language === 'ru';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none font-mono text-xs">
      <div className="w-full max-w-lg rounded-xl border shadow-xl overflow-hidden flex flex-col transition-colors bg-white dark:bg-[#0f121d] border-slate-200 dark:border-[#20273d] text-slate-800 dark:text-slate-200">
        {/* Header */}
        <div className="h-11 px-4 border-b flex items-center justify-between border-slate-200 dark:border-[#1e2439] bg-slate-50 dark:bg-[#131726]">
          <div className="flex items-center gap-2 font-semibold">
            <Upload className="w-4 h-4 text-sky-500" />
            <span>{isRu ? 'Импорт инклинометрии (CSV / COMPASS)' : 'Import Directional Survey'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* File Upload Box */}
          <div className="border border-dashed border-slate-300 dark:border-[#263150] rounded-lg p-4 text-center hover:border-sky-500 transition-colors bg-slate-50/50 dark:bg-[#121626]">
            <input
              type="file"
              accept=".csv,.txt,.las"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-1">
              <FileText className="w-7 h-7 text-sky-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {isRu ? 'Нажмите для выбора файла или перетащите' : 'Click to browse or drop survey file'}
              </span>
              <span className="text-3xs text-slate-400">CSV, Landmark COMPASS .txt, LAS</span>
            </label>
          </div>

          <div className="text-3xs text-slate-500 uppercase font-semibold">
            {isRu ? 'Или вставьте текст:' : 'Or paste text directly:'}
          </div>

          <textarea
            rows={6}
            value={textInput}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="MD, Inc, Azim&#10;0, 0, 0&#10;150, 0.12, 45.0&#10;300, 0.35, 48.2"
            className="w-full bg-white dark:bg-[#131726] border border-slate-200 dark:border-[#22293f] rounded-lg p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
          />

          {parsedCount !== null && (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-3xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isRu ? `Распознано замеров: ${parsedCount}` : `Detected ${parsedCount} survey stations`}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#1e2439]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1c2236] text-slate-600 dark:text-slate-400"
            >
              {isRu ? 'Отмена' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!parsedCount}
              className="px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium shadow-xs"
            >
              {isRu ? `Импортировать ${parsedCount ? `(${parsedCount})` : ''}` : `Import ${parsedCount ? `(${parsedCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
