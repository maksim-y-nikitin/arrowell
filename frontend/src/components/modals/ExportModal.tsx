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

  // Format definitions with metadata
  const exportFormats = useMemo(() => [
    {
      id: 'compass' as ExportFormatKey,
      name: isRu ? 'Landmark COMPASS (.txt)' : 'Landmark COMPASS (.txt)',
      desc: isRu
        ? 'Стандарт Halliburton Landmark COMPASS (MCM, RKB, истинный север)'
        : 'Halliburton Landmark COMPASS format (MCM, RKB datum)',
      icon: <FileText className="w-4 h-4 text-[var(--accent)]" />,
      ext: '.txt',
      mime: 'text/plain',
    },
    {
      id: 'csv' as ExportFormatKey,
      name: isRu ? 'Таблица CSV / Excel (.csv)' : 'CSV Spreadsheet (.csv)',
      desc: isRu
        ? 'Полная таблица инклинометрии: координаты, углы, DLS, датчики MWD и поправки'
        : 'Full directional survey table: coordinates, angles, DLS, MWD sensors & corrections',
      icon: <Table className="w-4 h-4 text-[var(--ok)]" />,
      ext: '.csv',
      mime: 'text/csv',
    },
    {
      id: 'las' as ExportFormatKey,
      name: isRu ? 'Каротажный формат CWLS LAS 2.0 (.las)' : 'CWLS LAS 2.0 Log (.las)',
      desc: isRu
        ? 'Отраслевой стандарт каротажа и геонавигации для передачи в геологические пакеты'
        : 'Industry standard log ASCII format for geological modeling software',
      icon: <FileCode className="w-4 h-4 text-[var(--warn)]" />,
      ext: '.las',
      mime: 'text/plain',
    },
    {
      id: 'json' as ExportFormatKey,
      name: isRu ? 'Структурированный JSON (.json)' : 'Structured JSON (.json)',
      desc: isRu
        ? 'Машиночитаемый JSON с метаданными скважины, невязками QC и телеметрией'
        : 'Machine-readable JSON with well metadata, QC residuals, and telemetry',
      icon: <FileJson className="w-4 h-4 text-[var(--mag)]" />,
      ext: '.json',
      mime: 'application/json',
    },
    {
      id: 'report' as ExportFormatKey,
      name: isRu ? 'Печатный отчет инклинометрии (.html)' : 'Printable Survey Report (.html)',
      desc: isRu
        ? 'Готовый к печати и сохранению в PDF официальный отчет по скважине'
        : 'Ready-to-print official wellbore survey report for PDF archiving',
      icon: <Printer className="w-4 h-4 text-[var(--crit)]" />,
      ext: '.html',
      mime: 'text/html',
    },
  ], [isRu]);

  const activeFormatInfo = exportFormats.find((f) => f.id === selectedFormat) || exportFormats[0];

  // Dynamic file content generation based on active format
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] font-mono text-[11.5px] select-none">
      <div className="w-full max-w-3xl rounded-[var(--r3)] border border-[var(--line-strong)] bg-[var(--bg-1)] text-[var(--fg-0)] shadow-[var(--shadow-2)] overflow-hidden flex flex-col max-h-[90vh] transition-colors">
        {/* Modal Header */}
        <div className="h-10 px-4 border-b border-[var(--line)] bg-[var(--bg-2)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[var(--accent)]" />
            <div>
              <span className="font-semibold text-[12px] font-sans text-[var(--fg-0)]">
                {isRu ? 'Экспорт данных инклинометрии' : 'Export Directional Survey Data'}
              </span>
              <span className="text-[10px] text-[var(--fg-3)] ml-2">
                {activeWell.name} · {targetStations.length} {isRu ? 'замеров' : 'stations'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--fg-2)] hover:text-[var(--fg-0)] p-1 rounded-[var(--r1)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* 1. Format Selection Grid */}
          <div>
            <label className="block text-[10px] font-semibold text-[var(--fg-3)] uppercase tracking-wider mb-2">
              {isRu ? '1. Выберите формат экспорта:' : '1. Choose Export Format:'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {exportFormats.map((fmt) => {
                const isSelected = selectedFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={`p-2.5 rounded-[var(--r2)] border text-left flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-1)]'
                        : 'border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {fmt.icon}
                      <span className={`font-semibold text-[11px] font-sans ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--fg-0)]'}`}>
                        {fmt.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--fg-2)] line-clamp-2 leading-tight">
                      {fmt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Dataset Option: Corrected vs Raw Baseline */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-2)]">
            <div className="text-[11px] text-[var(--fg-1)]">
              <span className="font-semibold uppercase text-[10px] text-[var(--fg-3)] mr-2">
                {isRu ? 'Состояние данных:' : 'Data Dataset:'}
              </span>
              {useCorrected
                ? (isRu ? 'Скорректированные замеры (MSA / SAG / SCC)' : 'Corrected Survey (MSA/SAG/SCC applied)')
                : (isRu ? 'Исходная сырая телеметрия MWD (без поправок)' : 'Raw MWD Telemetry (uncorrected)')}
            </div>

            <div className="inline-flex p-[2px] bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--r1)] gap-[1px]">
              <button
                onClick={() => setUseCorrected(true)}
                className={`px-2 py-0.5 rounded-[var(--r1)] text-[10.5px] font-medium transition-colors ${
                  useCorrected
                    ? 'bg-[var(--accent)] text-white font-semibold'
                    : 'text-[var(--fg-2)] hover:text-[var(--fg-0)]'
                }`}
              >
                {isRu ? 'Скорректированные' : 'Corrected'}
              </button>
              <button
                onClick={() => setUseCorrected(false)}
                className={`px-2 py-0.5 rounded-[var(--r1)] text-[10.5px] font-medium transition-colors ${
                  !useCorrected
                    ? 'bg-[var(--accent)] text-white font-semibold'
                    : 'text-[var(--fg-2)] hover:text-[var(--fg-0)]'
                }`}
              >
                {isRu ? 'Исходные (Raw)' : 'Raw MWD'}
              </button>
            </div>
          </div>

          {/* 3. Live File Preview Terminal */}
          <div>
            <div className="flex items-center justify-between mb-1 text-[10px] text-[var(--fg-3)]">
              <span className="font-semibold uppercase tracking-wider">
                {isRu ? 'Предпросмотр файла:' : 'File Preview:'} ({activeFormatInfo.ext})
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[var(--accent)] hover:underline"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? (isRu ? 'Скопировано' : 'Copied') : (isRu ? 'Копировать текст' : 'Copy Preview')}</span>
              </button>
            </div>
            <pre className="w-full h-40 p-3 rounded-[var(--r2)] border border-[var(--line)] bg-[var(--bg-2)] text-[var(--fg-1)] text-[10px] leading-relaxed overflow-auto font-mono">
              {generatedContent.slice(0, 3000)}
              {generatedContent.length > 3000 && '\n\n... [Truncated preview: full content will be downloaded]'}
            </pre>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="h-11 px-4 border-t border-[var(--line)] bg-[var(--bg-2)] flex items-center justify-between shrink-0">
          <div className="text-[10px] text-[var(--fg-3)] hidden sm:block">
            {isRu ? 'Готов к импорту в ПО Landmark, Petrel, Techlog, Excel' : 'Ready for Landmark, Petrel, Techlog & Excel'}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-[var(--r1)] border border-[var(--line)] bg-[var(--bg-1)] text-[var(--fg-1)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] transition-colors"
            >
              {isRu ? 'Отмена' : 'Cancel'}
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 rounded-[var(--r1)] bg-[var(--accent)] hover:brightness-110 text-white font-semibold flex items-center gap-1.5 shadow-[var(--shadow-1)] transition-all"
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