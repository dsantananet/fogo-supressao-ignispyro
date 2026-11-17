'use strict';

const suppHeaders = [
  'Livro n.º', 'Folha n.º', 'Número de Ocorrência', 'Local', 'Freguesia', 'Concelho',
  'Distrito', 'Ação de fogo', 'Data', 'Início da manobra', 'Fim da manobra',
  'Total de Horas de Manobra', 'Objetivo da manobra', 'Formação vegetal', 'Extensão',
  'Autorização do COS', 'Inscrição na fita do tempo da ocorrência', 'OUTROS ELEMENTOS', 'NOTAS'
];
const sheetNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const column = index => String.fromCharCode(65 + index);
const epoch = Date.UTC(1899, 11, 30);
const excelDate = date => date ? (Date.parse(date + 'T00:00:00Z') - epoch) / 86400000 : '';
const excelTime = time => {
  if (!time) return '';
  const [hours, minutes, seconds = 0] = time.split(':').map(Number);
  return (hours * 3600 + minutes * 60 + seconds) / 86400;
};

function operationsDuration(start, end) {
  const from = excelTime(start);
  const to = excelTime(end);
  return from === '' || to === '' ? '' : (to - from + 1) % 1;
}

function readWorkbookPart(files, path) {
  const contents = files.get(path);
  if (!contents) throw new Error('O livro está incompleto.');
  const xml = new DOMParser().parseFromString(TD.decode(contents), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('O livro contém XML inválido.');
  return xml;
}

async function readSuppressionWorkbook(file) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Seleciona um livro .xlsx.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Seleciona um livro até 15 MB.');
  const files = await unzipFile(file);
  const workbook = readWorkbookPart(files, 'xl/workbook.xml');
  const sheet = [...workbook.getElementsByTagNameNS(sheetNS, 'sheet')]
    .find(element => element.getAttribute('name') === 'Folha1');
  if (!sheet) throw new Error('O livro deve conter a folha Folha1 do modelo de supressão.');
  const relationships = readWorkbookPart(files, 'xl/_rels/workbook.xml.rels');
  const relation = [...relationships.documentElement.children]
    .find(element => element.getAttribute('Id') === sheet.getAttributeNS(relNS, 'id'));
  if (relation?.getAttribute('TargetMode') === 'External') throw new Error('A folha deve fazer parte do livro.');
  const target = relation?.getAttribute('Target');
  if (!target) throw new Error('Folha de registo indisponível.');
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
  const xml = readWorkbookPart(files, path);
  const data = xml.getElementsByTagNameNS(sheetNS, 'sheetData')[0];
  if (!data) throw new Error('Folha de registo vazia.');
  const strings = files.has('xl/sharedStrings.xml')
    ? [...readWorkbookPart(files, 'xl/sharedStrings.xml').getElementsByTagNameNS(sheetNS, 'si')]
          .map(element => [...element.getElementsByTagNameNS(sheetNS, 't')].map(t => t.textContent).join(''))
    : [];
  const rows = [...data.children].filter(row => row.localName === 'row');

  function cell(row, index) {
    const ref = column(index) + row?.getAttribute('r');
    return row && [...row.children].find(child => child.getAttribute('r') === ref);
  }

  function value(row, index) {
    const item = cell(row, index);
    if (!item) return '';
    const raw = item.getElementsByTagNameNS(sheetNS, 'v')[0]?.textContent ?? '';
    if (item.getAttribute('t') === 's') return strings[Number(raw)] ?? '';
    if (item.getAttribute('t') === 'inlineStr') {
      return [...item.getElementsByTagNameNS(sheetNS, 't')].map(t => t.textContent).join('');
    }
    return raw;
  }

  const headers = rows.find(row => row.getAttribute('r') === '3');
  if (!suppHeaders.every((header, index) => value(headers, index).trim().replace(/\s+/g, ' ').startsWith(header))) {
    throw new Error('As colunas A–S não correspondem ao modelo de Fogo de Supressão.');
  }
  const records = rows.filter(row => +row.getAttribute('r') > 3 && value(row, 2).trim()).map(row => ({
    row: +row.getAttribute('r'),
    values: suppHeaders.map((_, index) => value(row, index))
  }));
  return { files, xml, data, path, rows, records, cell };
}

function fromExcelDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d\d-\d\d$/.test(value)) return value;
  if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(value)) return value.split(/[/-]/).reverse().join('-');
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? new Date(epoch + Math.round(numeric) * 86400000).toISOString().slice(0, 10)
    : '';
}

function fromExcelTime(value) {
  if (/^\d\d:\d\d(?::\d\d)?$/.test(value)) return value.slice(0, 5);
  if (value === '' || !Number.isFinite(Number(value))) return '';
  const minutes = Math.round(Number(value) * 1440) % 1440;
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}

function rowToSuppression(record) {
  const [book, page, occurrence, location, parish, town, district, action, date, start, end,
    , purpose, vegetation, length, authorization, timeline, personnel, notes] = record.values;
  return { book, page, occurrence, location, parish, town, district, action, date: fromExcelDate(date),
    start: fromExcelTime(start), end: fromExcelTime(end), purpose, vegetation, length,
    authorization, timeline, personnel, notes };
}

function suppressionValues(record) {
  const summaries = Object.fromEntries(fieldCollections.map(([name, title, , definitions]) => {
    const details = (record[name] ?? []).map(item => definitions.map(([field, label]) =>
      item[field] && label + ': ' + item[field]).filter(Boolean).join(', ')).filter(Boolean);
    return [name, details.length ? title + ': ' + details.join(' | ') : ''];
  }));
  const photoReferences = record.photos.map(photo =>
    [photo.reference || photo.name, photo.time, photo.latitude, photo.longitude].filter(Boolean).join(' · ')).filter(Boolean);
  const notes = [record.notes, record.means && 'Meios: ' + record.means,
    record.ignition && 'Tipo de ignição: ' + record.ignition,
    record.spotting && 'Saltos: ' + record.spotting,
    record.terrain && 'Terreno: ' + record.terrain,
    record.fireHistory && 'Histórico de incêndios: ' + record.fireHistory,
    record.weather && 'Meteorologia: ' + record.weather,
    record.fire && 'Comportamento observado: ' + record.fire,
    record.chronology && 'Cronologia: ' + record.chronology,
    record.result && 'Resultado: ' + record.result,
    summaries.meteorology, summaries.resources,
    photoReferences.length && 'Fotografias: ' + photoReferences.join(' | '),
    record.sectors.length && 'Setores: ' + record.sectors.map(s => [s.name, s.activity].filter(Boolean).join(' — ')).join(' | ')
  ].filter(Boolean).join('\n');
  const personnel = [record.personnel, summaries.teams, summaries.technicians].filter(Boolean).join('\n');
  return [record.book, record.page ? Number(record.page) : '', record.occurrence, record.location,
    record.parish, record.town, record.district, record.action, excelDate(record.date), excelTime(record.start),
    excelTime(record.end), operationsDuration(record.start, record.end), record.purpose, record.vegetation,
    record.length ? Number(record.length) : '', record.authorization, record.timeline, personnel, notes];
}

function suppressionCsv(record) {
  const values = suppressionValues(record);
  const duration = values[11] === '' ? '' : Math.round(values[11] * 1440);
  values.splice(8, 4, record.date, record.start, record.end,
    duration === '' ? '' : String(Math.floor(duration / 60)).padStart(2, '0') + ':' +
      String(duration % 60).padStart(2, '0'));
  const cell = value => {
    const text = String(value ?? '');
    const safe = typeof value === 'string' && /^\s*[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [suppHeaders, values].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

async function saveSuppressionWorkbook(file, record) {
  const book = await readSuppressionWorkbook(file);
  const matches = book.records.filter(item => item.values[2].trim() === record.occurrence.trim() &&
    fromExcelDate(item.values[8]) === record.date && fromExcelTime(item.values[9]) === record.start);
  if (matches.length > 1) throw new Error('Há mais de uma linha com esta ocorrência, data e hora. Revê o livro.');
  const lastRecord = book.records.at(-1)?.row;
  const target = matches[0]?.row ?? (lastRecord ?? 3) + 1;
  const row = book.rows.find(item => +item.getAttribute('r') === target) ??
    book.xml.createElementNS(sheetNS, 'row');
  if (!row.parentNode) {
    row.setAttribute('r', String(target));
    const next = book.rows.find(item => +item.getAttribute('r') > target);
    book.data.insertBefore(row, next ?? null);
  }

  const styleRow = book.rows.find(item => +item.getAttribute('r') === (lastRecord ?? 4));
  suppressionValues(record).forEach((value, index) => {
    if (value === '') return;
    if (typeof value === 'string' && value.length > 32767) {
      throw new Error('O campo «' + suppHeaders[index] + '» ultrapassa o limite de uma célula Excel. Exporta também o CSV.');
    }
    const item = book.xml.createElementNS(sheetNS, 'c');
    const previous = book.cell(row, index);
    const previousFormula = previous?.getElementsByTagNameNS(sheetNS, 'f')[0];
    if (previousFormula && index !== 11) return;
    item.setAttribute('r', column(index) + target);
    const style = previous?.getAttribute('s') ?? book.cell(styleRow, index)?.getAttribute('s');
    if (style) item.setAttribute('s', style);
    if (typeof value === 'number') {
      if (index === 11 && previousFormula) {
        const formula = book.xml.createElementNS(sheetNS, 'f');
        formula.textContent = 'MOD(K' + target + '-J' + target + ',1)';
        item.append(formula);
      }
      const node = book.xml.createElementNS(sheetNS, 'v');
      node.textContent = String(value);
      item.append(node);
    } else {
      item.setAttribute('t', 'inlineStr');
      const inline = book.xml.createElementNS(sheetNS, 'is');
      const text = book.xml.createElementNS(sheetNS, 't');
      text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      text.textContent = value;
      inline.append(text);
      item.append(inline);
    }
    if (previous) previous.replaceWith(item);
    else {
      const next = [...row.children].find(child => {
        const nextColumn = child.getAttribute('r')?.match(/^[A-Z]+/)?.[0];
        return nextColumn && (nextColumn.length > 1 || nextColumn > column(index));
      });
      row.insertBefore(item, next ?? null);
    }
  });
  const dimension = book.xml.getElementsByTagNameNS(sheetNS, 'dimension')[0];
  const reference = dimension?.getAttribute('ref')?.match(/^(.*:)?([A-Z]+)(\d+)$/);
  if (reference && target > Number(reference[3])) {
    dimension.setAttribute('ref', (reference[1] ?? 'A1:') + reference[2] + target);
  }
  book.files.set(book.path, enc(new XMLSerializer().serializeToString(book.xml)));
  return zipWrite(book.files);
}
