import React, { useState, useMemo } from 'react';
import { useWellbore } from '@/context/WellboreContext';
import {
  exportLandmarkCompassFormat,
  exportSurveyToCsv,
  exportSurveyToLasFormat,
  exportSurveyToJsonFormat,
  exportSurveyToHtmlReport,
} from '@/utils/fileParsers';
import {
  Download,
  Copy,
  Check,
  X,
  FileText,
  Table,
  FileCode,
  FileJson,
  Printer,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportFormatKey = 'compass' | 'csv' | 'las' | 'json' | 'report';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { stations, rawStations, activeWell, language, notify } = useWellbore();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormatKey>('compass');
  const [useCorrected, setUseCorrected] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const isRu = language === 'ru';
  const targetStations = useCorrected ? stations : rawStations;

  const exportFormats = useMemo(() => [
    {
      id: 'compass' as ExportFormatKey,
      name: isRu ? 'Landmark COMPASS (.txt)' : 'Landmark COMPASS (.txt)',
      desc: isRu
        ? 'Стандарт Halliburton Landmark COMPASS (MCM, RKB, истинный север)'
        : 'Halliburton Landmark COMPASS standard format (MCM, RKB datum)',
      icon: <FileText className="w-4 h-4 text-sky-500" />,
      ext: '.txt',
      mime: 'text/plain',
    },
    {
      id: 'csv' as ExportFormatKey,
      name: isRu ? 'Таблица CSV / Excel (.csv)' : 'CSV Spreadsheet (.csv)',
      desc: isRu
        ? 'Полная таблица инклинометрии: координаты, углы, DLS, датчики MWD и поправки'
        : 'Full directional survey table: coordinates, angles, DLS, MWD sensors & corrections',
      icon: <Table className="w-4 h-4 text-emerald-500" />,
      ext: '.csv',
      mime: 'text/csv',
    },
    {
      id: 'las' as ExportFormatKey,
      name: isRu ? 'Каротажный формат CWLS LAS 2.0 (.las)' : 'CWLS LAS 2.0 Log (.las)',
      desc: isRu
        ? 'Отраслевой стандарт каротажа и геонавигации для передачи в геологические пакеты'
        : 'Industry standard log ASCII format for geological modeling software',
      icon: <FileCode className="w-4 h-4 text-amber-500" />,
      ext: '.las',
      mime: 'text/plain',
    },
    {
      id: 'json' as ExportFormatKey,
      name: isRu ? 'Структурированный JSON (.json)' : 'Structured JSON (.json)',
      desc: isRu
        ? 'Машиночитаемый JSON с метаданными скважины, невязками QC и телеметрией'
        : 'Machine-readable JSON with well metadata, QC residuals, and telemetry',
      icon: <FileJson className="w-4 h-4 text-purple-500" />,
      ext: '.json',
      mime: 'application/json',
    },
    {
      id: 'report' as ExportFormatKey,
      name: isRu ? 'Печатный отчет инклинометрии (.html)' : 'Printable Survey Report (.html)',
      desc: isRu
        ? 'Готовый к печати и сохранению в PDF официальный отчет по скважине'
        : 'Ready-to-print official wellbore survey report for PDF archiving',
      icon: <Printer className="w-4 h-4 text-rose-500" />,
      ext: '.html',
      mime: 'text/html',
    },
  ], [isRu]);

  const activeFormatInfo = exportFormats.find((f) => f.id === selectedFormat) || exportFormats[0];

  const generatedContent = useMemo(() => {
    switch (selectedFormat) {
      case 'compass':
        return exportLandmarkCompassFormat(targetStations, activeWell.name);
      case 'csv':
        return exportSurveyToCsv(targetStations, activeWell.name);
      case 'las':
        return exportSurveyToLasFormat(targetStations, activeWell.name);
      case 'json':
        return exportSurveyToJsonFormat(targetStations, activeWell.name);
      case 'report':
        return exportSurveyToHtmlReport(targetStations, activeWell.name);
      default:
        return '';
    }
  }, [selectedFormat, targetStations, activeWell.name]);

  if (!isOpen) return null;

  const handleDownload = () => {
    const filename = `${activeWell.name}_${selectedFormat}${activeFormatInfo.ext}`;
    const blob = new Blob([generatedContent], { type: `${activeFormatInfo.mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    notify(
      isRu ? `Файл ${filename} успешно экспортирован` : `File ${filename} exported successfully`,
      'success'
    );
    onClose();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    notify(isRu ? 'Содержимое скопировано в буфер' : 'Copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-mono select-none">
      <div className="w-full max-w-3xl rounded-xl border shadow-2xl overflow-hidden flex flex-col transition-colors bg-white dark:bg-[#0e111a] border-slate-200 dark:border-[#1e253c] text-slate-800 dark:text-slate-200 max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b flex items-center justify-between transition-colors bg-slate-50 dark:bg-[#121522] border-slate-200 dark:border-[#1e253c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-sm text-slate-900 dark:text-white">
                {isRu ? 'Экспорт данных инклинометрии' : 'Export Directional Survey Data'}
              </div>
              <div className="text-3xs text-slate-500 dark:text-slate-400">
                {activeWell.name} • {targetStations.length} {isRu ? 'замеров' : 'stations'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1a2035] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* Format selection cards */}
          <div>
            <label className="block text-3xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase">
              {isRu ? '1. Выберите формат экспорта:' : '1. Choose Export Format:'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {exportFormats.map((fmt) => {
                const isSelected = selectedFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500/10 shadow-xs'
                        : 'border-slate-200 dark:border-[#1c2236] bg-slate-50/50 dark:bg-[#121522]/50 hover:bg-slate-100 dark:hover:bg-[#161a29]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {fmt.icon}
                      <span className="font-semibold text-xs text-slate-900 dark:text-white">
                        {fmt.name}
                      </span>
                    </div>
                    <p className="text-3xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-tight">
                      {fmt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dataset option: Raw vs Corrected */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-[#1c2236] bg-slate-50 dark:bg-[#121522]">
            <div className="text-3xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold uppercase text-slate-400 mr-2">
                {isRu ? 'Состояние данных:' : 'Data Dataset:'}
              </span>
              {useCorrected
                ? (isRu ? 'Скорректированные замеры (с учетом MSA / SAG / SCC)' : 'Corrected Survey (with MSA/SAG/SCC applied)')
                : (isRu ? 'Исходная сырая телеметрия MWD (без поправок)' : 'Raw MWD Telemetry (uncorrected)')}
            </div>

            <div className="flex items-center gap-1 bg-white dark:bg-[#181d2e] p-0.5 rounded-md border border-slate-200 dark:border-[#222b44]">
              <button
                onClick={() => setUseCorrected(true)}
                className={`px-2 py-0.5 rounded text-3xs font-medium transition-colors ${
                  useCorrected
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {isRu ? 'Скорректированные' : 'Corrected'}
              </button>
              <button
                onClick={() => setUseCorrected(false)}
                className={`px-2 py-0.5 rounded text-3xs font-medium transition-colors ${
                  !useCorrected
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {isRu ? 'Исходные (Raw)' : 'Raw MWD'}
              </button>
            </div>
          </div>

          {/* Code/File Preview Box */}
          <div>
            <div className="flex items-center justify-between mb-1.5 text-3xs text-slate-400">
              <span className="font-semibold uppercase">
                {isRu ? 'Предпросмотр файла:' : 'File Preview:'} ({activeFormatInfo.ext})
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? (isRu ? 'Скопировано' : 'Copied') : (isRu ? 'Копировать текст' : 'Copy Preview')}</span>
              </button>
            </div>
            <pre className="w-full h-44 p-3 rounded-lg border text-3xs leading-relaxed overflow-auto font-mono bg-slate-900 text-slate-200 border-slate-700">
              {generatedContent.slice(0, 3000)}
              {generatedContent.length > 3000 && '\n\n... [Truncated preview: full file will be downloaded]'}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t flex items-center justify-between transition-colors bg-slate-50 dark:bg-[#121522] border-slate-200 dark:border-[#1e253c]">
          <div className="text-3xs text-slate-400">
            {isRu ? 'Готов к импорту в ПО Landmark, Petrel, Techlog, Excel' : 'Ready for Landmark, Petrel, Techlog & Excel'}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#1e253c] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1b2135] text-xs transition-colors"
            >
              {isRu ? 'Отмена' : 'Cancel'}
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isRu ? 'Скачать файл' : 'Download File'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
