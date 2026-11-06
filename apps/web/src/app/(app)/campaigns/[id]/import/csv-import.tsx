'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CircleAlert, CircleCheck, FileUp, RotateCcw } from 'lucide-react';
import {
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  guessMapping,
  importFieldLabel,
  parseCsv,
  validateRows,
  type ColumnMapping,
  type ImportField,
  type ParsedCsv,
} from '@prospectnest/core';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { Button, buttonClass } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { importCsv, type ImportOutcome } from '../../actions';

type Loaded = { fileName: string; text: string; parsed: ParsedCsv };

const PREVIEW_ROWS = 5;
const MAX_LISTED_ERRORS = 50;

/** Excel in Turkish locales often saves Windows-1254; fall back when UTF-8 decoding produces replacement characters. */
async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  return utf8.includes('�') ? new TextDecoder('windows-1254').decode(buffer) : utf8;
}

export function CsvImport({ campaignId }: { campaignId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (loaded ? validateRows(loaded.parsed.rows, mapping) : []), [loaded, mapping]);
  const invalid = results.filter((r) => !r.ok);
  const hasName = mapping.includes('name');

  const reset = () => {
    setLoaded(null);
    setMapping([]);
    setOutcome(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    setOutcome(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setFileError('Dosya en fazla 2 MB olabilir. Büyük listeleri parçalara bölün.');
      return;
    }
    const text = await readText(file);
    const parsed = parseCsv(text);
    if (parsed.header.length === 0 || parsed.rows.length === 0) {
      setFileError('Dosyada başlık satırı ve en az bir kayıt bulunamadı.');
      return;
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      setFileError(`Dosyada ${formatNumber(parsed.rows.length)} satır var; tek seferde en fazla ${formatNumber(MAX_IMPORT_ROWS)} satır içe aktarılabilir.`);
      return;
    }
    setLoaded({ fileName: file.name, text, parsed });
    setMapping(guessMapping(parsed.header));
  };

  const setColumn = (index: number, field: ImportField | null) => {
    setMapping((current) => current.map((value, i) => (i === index ? field : value === field && field !== null ? null : value)));
  };

  const submit = () => {
    if (!loaded) return;
    startTransition(async () => {
      try {
        setOutcome(await importCsv(campaignId, { csv: loaded.text, mapping, fileName: loaded.fileName }));
      } catch {
        setOutcome({ ok: false, error: 'İçe aktarma tamamlanamadı. Bağlantıyı kontrol edip yeniden deneyin; aynı dosyayı tekrar yüklemek güvenlidir.' });
      }
    });
  };

  if (outcome?.ok) return <ImportReport outcome={outcome} campaignId={campaignId} onReset={reset} />;

  if (!loaded) {
    return (
      <Panel>
        <label
          htmlFor="csv-file"
          className="flex cursor-pointer flex-col items-center gap-2 px-6 py-12 text-center transition-colors duration-150 hover:bg-surface-hover"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files[0]);
          }}
        >
          <span className="flex size-10 items-center justify-center rounded-control border border-border bg-surface-muted text-fg-muted">
            <FileUp className="size-5" aria-hidden />
          </span>
          <span className="text-[14px] font-medium text-fg">CSV dosyası seçin veya buraya sürükleyin</span>
          <span className="max-w-md text-[13px] text-fg-muted">
            Virgül, noktalı virgül veya sekmeyle ayrılmış; ilk satır başlık. En fazla {formatNumber(MAX_IMPORT_ROWS)} satır ve 2 MB.
            Yalnızca size ait veya kullanım izniniz olan listeleri yükleyin.
          </span>
          <input
            ref={inputRef}
            id="csv-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        {fileError ? (
          <p role="alert" className="flex items-center gap-2 border-t border-border px-4 py-3 text-[13px] text-danger">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {fileError}
          </p>
        ) : null}
      </Panel>
    );
  }

  const { parsed } = loaded;
  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <PanelHeader
          title="Kolon eşleme"
          description={`${loaded.fileName} · ${formatNumber(parsed.rows.length)} satır. Eşlenmeyen kolonlar içe aktarılmaz.`}
          action={
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw aria-hidden />
              Başka dosya
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted">
                {parsed.header.map((column, index) => (
                  <th key={index} scope="col" className="min-w-[160px] px-3 py-2 align-top font-normal">
                    <span className="mb-1.5 block truncate font-medium text-fg" title={column}>
                      {column || `Kolon ${index + 1}`}
                    </span>
                    <Select
                      value={mapping[index] ?? ''}
                      onChange={(e) => setColumn(index, (e.target.value || null) as ImportField | null)}
                      className="h-8 text-[13px]"
                      aria-label={`${column || `Kolon ${index + 1}`} eşlemesi`}
                    >
                      <option value="">Kullanma</option>
                      {IMPORT_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {importFieldLabel[field]}
                        </option>
                      ))}
                    </Select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border last:border-b-0">
                  {parsed.header.map((_, index) => (
                    <td key={index} className={cn('max-w-[220px] truncate px-3 py-2', mapping[index] ? 'text-fg' : 'text-fg-subtle')}>
                      {row[index] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Doğrulama" />
        <div className="flex flex-col gap-3 px-4 py-4 text-[13px]">
          {!hasName ? (
            <p className="flex items-center gap-2 text-danger">
              <CircleAlert className="size-4" aria-hidden />
              İçe aktarmak için &quot;İşletme adı&quot; kolonunu eşleyin.
            </p>
          ) : (
            <p className="text-fg tabular-nums">
              <span className="font-medium">{formatNumber(results.length - invalid.length)}</span> satır içe aktarılacak
              {invalid.length > 0 ? (
                <>
                  , <span className="font-medium text-warning">{formatNumber(invalid.length)}</span> satır hatalı olduğu için atlanacak.
                </>
              ) : (
                '.'
              )}
            </p>
          )}
          {hasName && invalid.length > 0 ? (
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-control border border-border">
              {invalid.slice(0, MAX_LISTED_ERRORS).map((result) =>
                result.ok ? null : (
                  <li key={result.row} className="flex gap-3 px-3 py-2">
                    <span className="w-16 shrink-0 text-fg-muted tabular-nums">Satır {result.row}</span>
                    <span className="text-fg">{result.errors.join(' · ')}</span>
                  </li>
                ),
              )}
              {invalid.length > MAX_LISTED_ERRORS ? (
                <li className="px-3 py-2 text-fg-muted">ve {formatNumber(invalid.length - MAX_LISTED_ERRORS)} satır daha…</li>
              ) : null}
            </ul>
          ) : null}
          <p className="text-[12px] text-fg-muted">
            Mevcut işletmelerle eşleşen satırlar yeni kayıt açmaz; aynı web sitesini kullanan farklı şubeler ayrı kalır.
          </p>
          {outcome && !outcome.ok ? (
            <p role="alert" className="flex items-center gap-2 text-danger">
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              {outcome.error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button variant="primary" onClick={submit} loading={pending} disabled={!hasName || results.length === invalid.length}>
            İçe aktar
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function ImportReport({
  outcome,
  campaignId,
  onReset,
}: {
  outcome: Extract<ImportOutcome, { ok: true }>;
  campaignId: string;
  onReset: () => void;
}) {
  const { counters, errors } = outcome;
  const rows: [string, number, string?][] = [
    ['Yeni işletme', counters.created],
    ['Mevcut kayıtla eşleşen', counters.matched],
    ['Kampanyaya eklenen', counters.linked],
    ['Zaten kampanyada', counters.alreadyInCampaign],
    ['Dosyada tekrar eden satır', counters.repeatedInFile],
    ['İnceleme bekleyen olası eşleşme', counters.possibleDuplicates, 'warning'],
    ['Hatalı satır', counters.invalid, 'warning'],
  ];
  return (
    <Panel>
      <PanelHeader title="İçe aktarma tamamlandı" />
      <div className="px-4 py-4">
        <p className="mb-4 flex items-center gap-2 text-[14px] text-fg">
          <CircleCheck className="size-4 text-success" aria-hidden />
          Sonuçlar kaydedildi. Aynı dosyayı yeniden yüklemek mevcut kayıtları çoğaltmaz.
        </p>
        <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[13px]">
          {rows.map(([label, value, tone]) => (
            <div key={label} className="contents">
              <dt className="text-fg-muted">{label}</dt>
              <dd className={cn('text-right font-medium tabular-nums', tone === 'warning' && value > 0 ? 'text-warning' : 'text-fg')}>
                {formatNumber(value)}
              </dd>
            </div>
          ))}
        </dl>
        {errors.length > 0 ? (
          <details className="mt-4 text-[13px]">
            <summary className="cursor-pointer text-fg-muted hover:text-fg">Hatalı satırları göster</summary>
            <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-control border border-border">
              {errors.slice(0, MAX_LISTED_ERRORS).map((error) => (
                <li key={error.row} className="flex gap-3 px-3 py-2">
                  <span className="w-16 shrink-0 text-fg-muted tabular-nums">Satır {error.row}</span>
                  <span>{error.errors.join(' · ')}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="ghost" onClick={onReset}>
          Başka dosya yükle
        </Button>
        <Link href={`/businesses?campaign=${campaignId}`} className={buttonClass({ variant: 'primary' })}>
          İşletmeleri gör
        </Link>
      </div>
    </Panel>
  );
}
