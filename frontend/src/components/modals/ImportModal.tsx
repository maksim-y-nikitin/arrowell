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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 select-none font-mono text-[11.5px]">
      <div className="w-full max-w-lg rounded-[var(--r3)] border border-[var(--line-strong)] bg-[var(--bg-1)] text-[var(--fg-0)] shadow-[var(--shadow-2)] overflow-hidden flex flex-col transition-colors">
        {/* Modal Header */}
        <div className="h-10 px-4 border-b border-[var(--line)] bg-[var(--bg-2)] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[12px] font-sans text-[var(--fg-0)]">
            <Upload className="w-4 h-4 text-[var(--accent)]" />
            <span>{isRu ? 'Импорт инклинометрии (CSV / COMPASS / LAS)' : 'Import Directional Survey'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--fg-2)] hover:text-[var(--fg-0)] p-1 rounded-[var(--r1)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3">
          {/* File Upload Drag & Drop Area */}
          <div className="border border-dashed border-[var(--line-strong)] hover:border-[var(--accent)] rounded-[var(--r2)] p-4 text-center transition-colors bg-[var(--bg-2)]">
            <input
              type="file"
              accept=".csv,.txt,.las"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-1">
              <FileText className="w-6 h-6 text-[var(--accent)]" />
              <span className="font-semibold text-[var(--fg-0)] font-sans text-[12px]">
                {isRu ? 'Выберите файл или перетащите его сюда' : 'Click to browse or drop survey file'}
              </span>
              <span className="text-[10px] text-[var(--fg-3)]">
                CSV, Landmark COMPASS (.txt), CWLS LAS 2.0
              </span>
            </label>
          </div>

          <div className="text-[10px] text-[var(--fg-3)] uppercase font-semibold">
            {isRu ? 'Или вставьте текст таблицы напрямую:' : 'Or paste text directly:'}
          </div>

          {/* Raw Text Input */}
          <textarea
            rows={6}
            value={textInput}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="MD, Inc, Azim&#10;0, 0, 0&#10;150, 0.12, 42.1&#10;320, 0.25, 45.3"
            className="w-full bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r1)] p-2.5 text-[11px] text-[var(--fg-0)] placeholder-[var(--fg-3)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--bg-1)] font-mono transition-all"
          />

          {/* Station Detection Feedback */}
          {parsedCount !== null && (
            <div className="flex items-center gap-1.5 text-[var(--ok)] text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isRu ? `Распознано замеров: ${parsedCount}` : `Detected ${parsedCount} survey stations`}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-[var(--r1)] text-[var(--fg-1)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] transition-colors"
            >
              {isRu ? 'Отмена' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!parsedCount}
              className="px-4 py-1.5 rounded-[var(--r1)] bg-[var(--accent)] hover:brightness-110 disabled:opacity-40 text-white font-medium shadow-[var(--shadow-1)] transition-all"
            >
              {isRu ? `Импортировать ${parsedCount ? `(${parsedCount})` : ''}` : `Import ${parsedCount ? `(${parsedCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};