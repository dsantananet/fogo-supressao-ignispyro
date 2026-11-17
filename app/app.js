'use strict';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const panel = page => {
  document.querySelectorAll('main > section').forEach(section => section.hidden = section.id !== page);
  document.querySelectorAll('[data-page]').forEach(button => {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
};
const feedback = message => { $('feedback').textContent = message; };
const native = globalThis.Capacitor?.getPlatform() === 'android';
const documents = native ? globalThis.Capacitor.registerPlugin('DocumentFiles') : null;
const key = () => crypto.randomUUID();
const caseFields = [
  ['occurrence','Número de ocorrência'], ['location','Local'], ['parish','Freguesia'],
  ['town','Concelho'], ['district','Distrito'], ['date','Data','date'], ['start','Início da manobra','time'],
  ['end','Fim da manobra','time'], ['book','Livro n.º'], ['page','Folha n.º','number'],
  ['action','Ação de fogo'], ['length','Extensão (m)','number'], ['purpose','Objetivo da manobra','textarea'],
  ['vegetation','Formação vegetal'], ['authorization','Autorização do COS'], ['timeline','Fita do tempo'],
  ['personnel','Equipa, técnicos, credenciação e operacionais','textarea'], ['means','Meios envolvidos','textarea']
];
const reportFields = [
  ['terrain','Topografia, combustíveis e infraestruturas DFCI','textarea'],
  ['fireHistory','Histórico de incêndios na área','textarea'],
  ['weather','Situação meteorológica e fontes','textarea'],
  ['fire','Descrição e comportamento observado','textarea'],
  ['ignition','Tipo de ignição'], ['spotting','Ocorrência de saltos'],
  ['chronology','Cronologia observada','textarea'], ['result','Efeitos e avaliação da intervenção','textarea'],
  ['notes','Observações finais','textarea']
];
const sectorFields = [
  ['name','Setor'], ['location','Localização / referência cartográfica'], ['fuel','Combustível / exposição'],
  ['activity','Descrição da intervenção','textarea'], ['result','Resultado e observações','textarea']
];
const textFields = [...caseFields, ...reportFields];
const fresh = () => ({id:key(), sectors:[], photos:[], ...Object.fromEntries(textFields.map(([name]) => [name, '']))});
let active;
let archive = [];
let workbookFile;
let existingRecords = [];
let db;

function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ignispyro-fogo-supressao', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeValue(mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', mode);
    const request = action(transaction.objectStore('state'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

function save() {
  return storeValue('readwrite', store => store.put({active, archive}, 'project'));
}

function autosave() {
  save().catch(() => feedback('Não foi possível guardar no dispositivo. Exporta uma cópia JSON.'));
}

function field([name, label, type = 'text'], object, changed = autosave) {
  const element = document.createElement('label');
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  if (type === 'number') { input.min = '0'; input.step = name === 'length' ? 'any' : '1'; }
  input.value = object[name] ?? '';
  input.addEventListener('input', () => { object[name] = input.value; changed(); });
  element.append(label, input);
  return element;
}

function button(text, click) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  element.addEventListener('click', click);
  return element;
}

function renderArchive() {
  $('archive').replaceChildren();
  if (!archive.length) { $('archive').textContent = 'Sem ocorrências arquivadas.'; return; }
  for (const record of archive) {
    const row = document.createElement('div');
    row.className = 'archive-row';
    const text = document.createElement('span');
    text.textContent = [record.occurrence, record.location, record.date].filter(Boolean).join(' · ');
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(button('Abrir', () => {
      if (!confirm('Abrir esta ocorrência arquivada e substituir a ficha em edição?')) return;
      active = structuredClone(record);
      autosave();
      render();
      panel('case');
    }), button('Eliminar', () => {
      if (!confirm('Eliminar esta ocorrência do histórico local?')) return;
      archive = archive.filter(item => item.id !== record.id);
      autosave();
      renderArchive();
    }));
    row.append(text, actions);
    $('archive').append(row);
  }
}

function renderSectors() {
  $('sectorList').replaceChildren();
  for (const sector of active.sectors) {
    const row = document.createElement('article');
    row.className = 'sector';
    const fields = document.createElement('div');
    fields.className = 'fields';
    fields.append(...sectorFields.map(def => field(def, sector, () => {
      autosave();
      if (def[0] === 'name') renderPhotos();
    })));
    row.append(fields, button('Remover setor', () => {
      if (!confirm('Remover este setor? As fotografias mantêm-se na ficha.')) return;
      active.sectors = active.sectors.filter(item => item.id !== sector.id);
      for (const photo of active.photos) if (photo.sector === sector.id) photo.sector = '';
      autosave();
      renderSectors();
      renderPhotos();
    }));
    $('sectorList').append(row);
  }
}

function renderPhotos() {
  $('photoList').replaceChildren();
  for (const photo of active.photos) {
    const row = document.createElement('article');
    row.className = 'photo';
    const image = document.createElement('img');
    image.src = photo.data;
    image.alt = photo.name;
    const sector = document.createElement('select');
    sector.append(new Option('Sem setor associado', ''));
    for (const item of active.sectors) sector.append(new Option(item.name || 'Setor por identificar', item.id));
    sector.value = photo.sector;
    sector.addEventListener('change', () => { photo.sector = sector.value; autosave(); });
    const label = document.createElement('label');
    label.append('Setor da fotografia', sector);
    row.append(image, label, field(['caption','Legenda'], photo), button('Remover fotografia', () => {
      active.photos = active.photos.filter(item => item.id !== photo.id);
      autosave();
      renderPhotos();
    }));
    $('photoList').append(row);
  }
}

function render() {
  $('caseFields').replaceChildren(...caseFields.map(def => field(def, active)));
  $('reportFields').replaceChildren(...reportFields.map(def => field(def, active)));
  renderArchive();
  renderSectors();
  renderPhotos();
}

function validate() {
  if (!active.occurrence.trim() || !active.date) throw new Error('Indica o número e a data da ocorrência.');
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({id:key(), name:file.name, data:canvas.toDataURL('image/jpeg', .83), sector:'', caption:''});
      } catch (error) { reject(error); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato de imagem indisponível. Usa JPEG ou PNG.')); };
    image.src = url;
  });
}

function validPhoto(data) {
  return typeof data === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data);
}

function restoreRecord(record) {
  if (!record || typeof record.id !== 'string' || !Array.isArray(record.sectors) || !Array.isArray(record.photos)) {
    throw new Error('Ficha inválida.');
  }
  const fields = {};
  for (const [name] of textFields) fields[name] = typeof record[name] === 'string' ? record[name] : '';
  const sectors = record.sectors.map(item => {
    if (!item || typeof item.id !== 'string') throw new Error('Setor inválido.');
    return {id:item.id, ...Object.fromEntries(sectorFields.map(([name]) => [name, String(item[name] ?? '')]))};
  });
  const photos = record.photos.map(photo => {
    if (!photo || !validPhoto(photo.data)) throw new Error('Fotografia inválida.');
    return {id:key(), name:String(photo.name ?? ''), sector:String(photo.sector ?? ''),
      caption:String(photo.caption ?? ''), data:photo.data};
  });
  return {id:record.id, ...fields, sectors, photos};
}

function reportHtml(record) {
  const rows = items => items.filter(([,value]) => value !== '').map(([label, value]) =>
    '<tr><th>' + esc(label) + '</th><td>' + esc(value) + '</td></tr>').join('');
  const minutes = operationsDuration(record.start, record.end);
  const duration = minutes === '' ? '' : Math.round(minutes * 1440) + ' min';
  const sectors = record.sectors.map((sector, index) =>
    '<h3>' + esc(sector.name || 'Setor ' + (index + 1)) + '</h3><table>' +
    rows(sectorFields.slice(1).map(([id,label]) => [label, sector[id]])) + '</table>').join('');
  const photos = record.photos.filter(photo => validPhoto(photo.data)).map((photo, index) => {
    const sector = record.sectors.find(item => item.id === photo.sector)?.name;
    const caption = [photo.caption || photo.name, sector].filter(Boolean).join(' · ');
    return '<figure><img src="' + photo.data + '" alt=""><figcaption>Fotografia ' + (index + 1) +
      ' · ' + esc(caption) + '</figcaption></figure>';
  }).join('');
  return '<!doctype html><html lang="pt-PT"><meta charset="utf-8"><title>Relatório de Fogo de Supressão</title>' +
    '<style>@page{size:A4;margin:15mm}body{font:11pt Arial,sans-serif;color:#38181d}h1{color:#811c28;font-size:21pt}' +
    'h2,h3{break-after:avoid}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dbc8ca;padding:6pt;text-align:left;white-space:pre-wrap}' +
    'th{width:32%;background:#f8edef}tr,figure{break-inside:avoid}figure{margin:12pt 0}img{max-width:100%;max-height:110mm}' +
    'figcaption{font-size:9pt;color:#66323a}</style><body><h1>Relatório de Fogo de Supressão</h1>' +
    '<p>Made by IgnisPyro · Ocorrência ' + esc(record.occurrence) + '</p><h2>Identificação, equipa e intervenção</h2><table>' +
    rows([...caseFields.map(([id,label]) => [label, record[id]]), ['Duração da manobra', duration]]) + '</table>' +
    '<h2>Caracterização e avaliação</h2><table>' +
    rows(reportFields.map(([id,label]) => [label, record[id]])) + '</table>' +
    (sectors ? '<h2>Setores</h2>' + sectors : '') +
    (photos ? '<h2>Registo fotográfico</h2>' + photos : '') + '</body></html>';
}

async function saveFile(blob, name) {
  if (documents) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    await documents.save({name, mime:blob.type, base64});
  } else {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  }
}

function handle(id, event, action) {
  $(id).addEventListener(event, async e => {
    try { await action(e); }
    catch (error) { feedback(error.message ?? String(error)); }
  });
}

async function boot() {
  db = await openStorage();
  const local = await storeValue('readonly', store => store.get('project'));
  active = local?.active ?? fresh();
  archive = local?.archive ?? [];
  render();
  document.querySelectorAll('[data-page]').forEach(node =>
    node.addEventListener('click', () => { panel(node.dataset.page); feedback(''); }));
  handle('newCase','click', () => {
    if (active.occurrence && !confirm('Substituir a ficha em edição? Arquiva-a primeiro se quiseres guardá-la.')) return;
    active = fresh(); autosave(); render(); panel('case');
  });
  handle('addSector','click', () => {
    active.sectors.push({id:key(), ...Object.fromEntries(sectorFields.map(([id]) => [id,'']))});
    autosave(); renderSectors(); renderPhotos();
  });
  handle('photos','change', async e => {
    const files = [...e.target.files];
    if (files.length + active.photos.length > 18) throw new Error('Limite de 18 fotografias por ficha.');
    const destination = active;
    const photos = await Promise.all(files.map(readPhoto));
    if (destination !== active) throw new Error('A ficha mudou antes de as fotografias terminarem de carregar.');
    active.photos.push(...photos);
    e.target.value = '';
    await save(); renderPhotos();
  });
  handle('saveCase','click', async () => {
    validate();
    const copy = structuredClone(active);
    const index = archive.findIndex(item => item.id === copy.id);
    if (index < 0) archive.push(copy);
    else archive[index] = copy;
    await save(); renderArchive(); feedback('Ocorrência arquivada.');
  });
  handle('backup','click', async () => {
    const content = JSON.stringify({format:'ignispyro-supressao-v1', active, archive});
    await saveFile(new Blob([content], {type:'application/json'}), 'fogo-supressao-copia.json');
    feedback('Cópia JSON exportada.');
  });
  handle('restore','change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'ignispyro-supressao-v1' || !Array.isArray(backup.archive)) throw new Error('Cópia inválida.');
    const nextActive = restoreRecord(backup.active);
    const nextArchive = backup.archive.map(restoreRecord);
    if (!confirm('Substituir a ficha e o histórico locais pela cópia?')) return;
    active = nextActive; archive = nextArchive; await save(); render();
    e.target.value = '';
    feedback('Cópia importada.');
  });
  handle('workbook','change', async e => {
    workbookFile = undefined; existingRecords = [];
    $('rowPicker').hidden = true; $('prefill').disabled = true; $('exportExcel').disabled = true;
    const file = e.target.files[0];
    if (!file) return;
    const book = await readSuppressionWorkbook(file);
    workbookFile = file; existingRecords = book.records;
    $('existingRow').replaceChildren(...existingRecords.map((item, index) =>
      new Option([item.values[2], item.values[3], fromExcelDate(item.values[8]), fromExcelTime(item.values[9])]
        .filter(Boolean).join(' · '), index)));
    $('rowPicker').hidden = !existingRecords.length;
    $('prefill').disabled = !existingRecords.length;
    $('exportExcel').disabled = false;
    feedback('Livro carregado. Escolhe uma linha para pré-preencher ou grava uma cópia com a ficha atual.');
  });
  handle('prefill','click', async () => {
    if (active.occurrence && !confirm('Substituir a ficha em edição pelos dados da linha selecionada?')) return;
    active = {...fresh(), ...rowToSuppression(existingRecords[Number($('existingRow').value)])};
    await save(); render(); panel('case'); feedback('Ficha pré-preenchida a partir do Excel.');
  });
  handle('exportExcel','click', async () => {
    validate();
    const copy = structuredClone(active);
    const blob = await saveSuppressionWorkbook(workbookFile, copy);
    const occurrence = copy.occurrence.replace(/[^a-zA-Z0-9_-]/g, '_');
    await saveFile(blob, 'Fogo-Supressao-' + occurrence + '.xlsx');
    feedback('Cópia preenchida gravada.');
  });
  handle('printReport','click', async () => {
    validate();
    const html = reportHtml(active);
    if (documents) await documents.print({html});
    else {
      const page = window.open('', '_blank');
      if (!page) throw new Error('Permite abrir uma janela para imprimir o relatório.');
      page.document.open(); page.document.write(html); page.document.close();
      setTimeout(() => page.print(), 500);
    }
  });
  if (!native && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot().catch(() => feedback('O armazenamento local está indisponível. Reabre a aplicação.'));
