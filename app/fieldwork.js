'use strict';

const fieldCollections = [
  ['meteorology', 'Série meteorológica', 'observação', [
    ['time','Data e hora local','datetime-local'], ['temperature','Temperatura (°C)','decimal'],
    ['humidity','Humidade relativa (%)','decimal'], ['wind','Vento (km/h)','decimal'],
    ['gust','Rajada (km/h)','decimal'], ['direction','Direção de origem (° / ponto cardeal)'],
    ['source','Local / estação / fonte'], ['notes','Observações']
  ]],
  ['teams', 'Equipas', 'equipa', [
    ['name','Equipa'], ['entity','Entidade'], ['sector','Setor'], ['notes','Missão / observações']
  ]],
  ['technicians', 'Técnicos e operacionais', 'elemento', [
    ['name','Nome'], ['role','Função'], ['credential','N.º de credenciação'], ['team','Equipa']
  ]],
  ['resources', 'Meios de apoio', 'meio', [
    ['name','Designação'], ['type','Tipo'], ['quantity','Quantidade','number'], ['entity','Entidade'],
    ['sector','Setor'], ['notes','Observações']
  ]]
];
const photoFields = [
  ['caption','Legenda'], ['reference','Referência'], ['time','Data e hora da fotografia','datetime-local'],
  ['latitude','Latitude','decimal'], ['longitude','Longitude','decimal']
];
const geometryTypes = {Point:'Ponto', LineString:'Linha', Polygon:'Polígono'};
const geometryFields = [['name','Designação'], ['coordinates','Vértices (longitude,latitude), um por linha','textarea']];

function localDateTime(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function renderObservations() {
  $('observations').replaceChildren();
  for (const [collection, title, itemLabel, definitions] of fieldCollections) {
    const group = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = title;
    group.append(heading, button('Adicionar ' + itemLabel, () => {
      const item = {id:key()};
      if (collection === 'meteorology') item.time = localDateTime();
      active[collection].push(item);
      autosave();
      renderObservations();
    }));
    for (const item of active[collection]) {
      const card = document.createElement('article');
      card.className = 'sector';
      const fields = document.createElement('div');
      fields.className = 'fields';
      fields.append(...definitions.map(def => field(def, item)));
      card.append(fields, button('Remover ' + itemLabel, () => {
        if (!confirm('Remover este registo?')) return;
        active[collection] = active[collection].filter(entry => entry !== item);
        autosave();
        renderObservations();
      }));
      group.append(card);
    }
    $('observations').append(group);
  }
}

function vertices(geometry) {
  return (geometry.coordinates ?? '').trim().split(/\s+/).filter(Boolean).map(tuple => {
    const parts = tuple.split(',');
    const [longitude, latitude] = parts.map(Number);
    if (parts.length < 2 || parts.slice(0, 2).some(part => !part) ||
        !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      throw new Error('Coordenadas inválidas em ' + (geometry.name || 'geometria sem nome') + '.');
    }
    return [longitude, latitude];
  });
}

function kmlCoordinates(geometry) {
  const points = vertices(geometry);
  const minimum = {Point:1, LineString:2, Polygon:3}[geometry.type];
  if (!minimum || new Set(points.map(point => point.join(','))).size < minimum ||
      (geometry.type === 'Point' && points.length !== 1)) {
    throw new Error('Verifica o número de vértices em ' + (geometry.name || 'geometria sem nome') + '.');
  }
  if (geometry.type === 'Polygon' && points[0].join(',') !== points.at(-1).join(',')) points.push(points[0]);
  return points.map(point => point.join(',')).join(' ');
}

function importGeometries(xml) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'kml') {
    throw new Error('Ficheiro KML inválido.');
  }
  const geometries = [];
  for (const placemark of document.getElementsByTagNameNS('*', 'Placemark')) {
    const name = [...placemark.children].find(node => node.localName === 'name')?.textContent ?? '';
    for (const node of placemark.getElementsByTagNameNS('*', '*')) {
      if (!Object.hasOwn(geometryTypes, node.localName)) continue;
      if (node.getElementsByTagNameNS('*', 'innerBoundaryIs').length) {
        throw new Error('Este KML tem polígonos com anéis interiores, que esta edição não suporta.');
      }
      const coordinates = node.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent.trim()
        .split(/\s+/).join('\n') ?? '';
      const geometry = {id:key(), type:node.localName, name, coordinates};
      kmlCoordinates(geometry);
      geometries.push(geometry);
    }
  }
  if (!geometries.length) throw new Error('O KML não contém pontos, linhas ou polígonos editáveis.');
  return geometries;
}

function makeKml(record) {
  const placemarks = record.geometries.map(geometry => {
    const coordinates = '<coordinates>' + kmlCoordinates(geometry) + '</coordinates>';
    const body = geometry.type === 'Polygon'
      ? '<outerBoundaryIs><LinearRing>' + coordinates + '</LinearRing></outerBoundaryIs>' : coordinates;
    return '<Placemark><name>' + esc(geometry.name) + '</name><' + geometry.type + '>' +
      body + '</' + geometry.type + '></Placemark>';
  });
  return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    placemarks.join('') + '</Document></kml>';
}

function drawMap() {
  const canvas = $('map');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  const shapes = active.geometries.map(geometry => {
    try { return {type:geometry.type, points:vertices(geometry)}; }
    catch { return {points:[]}; }
  }).filter(shape => shape.points.length);
  if (!shapes.length) {
    context.fillStyle = '#66323a';
    context.font = '20px system-ui';
    context.fillText('Sem coordenadas para mostrar', 20, 35);
    return;
  }
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const {points} of shapes) for (const [x, y] of points) {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }
  const [west, south, east, north] = bounds;
  const longitudeFactor = Math.max(0.000001, Math.cos((north + south) * Math.PI / 360));
  const scale = Math.min((canvas.width - 48) / Math.max((east - west) * longitudeFactor, .000001),
    (canvas.height - 48) / Math.max(north - south, .000001));
  context.lineWidth = 3;
  context.strokeStyle = '#811c28';
  for (const {type, points} of shapes) {
    context.beginPath();
    points.forEach(([longitude, latitude], index) => {
      const x = canvas.width / 2 + (longitude - (west + east) / 2) * longitudeFactor * scale;
      const y = canvas.height / 2 - (latitude - (south + north) / 2) * scale;
      if (points.length === 1) context.arc(x, y, 5, 0, 2 * Math.PI);
      else if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    if (type === 'Polygon' && points.length > 2) {
      context.closePath();
      context.fillStyle = '#811c2833';
      context.fill();
    }
    context.stroke();
  }
}

function renderGeometries() {
  $('geometryList').replaceChildren();
  for (const geometry of active.geometries) {
    const card = document.createElement('article');
    card.className = 'sector';
    const type = document.createElement('select');
    for (const [value, title] of Object.entries(geometryTypes)) type.append(new Option(title, value));
    type.value = geometry.type;
    type.addEventListener('change', () => { geometry.type = type.value; autosave(); drawMap(); });
    const label = document.createElement('label');
    label.append('Tipo de geometria', type);
    card.append(label, ...geometryFields.map(def => field(def, geometry, () => { autosave(); drawMap(); })),
      button('Adicionar vértice GPS', async () => {
        try {
          const {longitude, latitude} = await currentCoordinates();
          if (!active.geometries.includes(geometry)) return;
          const point = longitude.toFixed(6) + ',' + latitude.toFixed(6);
          geometry.coordinates = geometry.type === 'Point' ? point : [geometry.coordinates.trim(), point].filter(Boolean).join('\n');
          await save();
          renderGeometries();
          feedback('Vértice GPS guardado.');
        } catch (error) { feedback(error.message); }
      }),
      button('Remover geometria', () => {
        if (!confirm('Remover esta geometria?')) return;
        active.geometries = active.geometries.filter(entry => entry !== geometry);
        autosave();
        renderGeometries();
      }));
    $('geometryList').append(card);
  }
  drawMap();
}

async function currentCoordinates() {
  if (documents) return documents.locate();
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(position => resolve(position.coords),
      () => reject(new Error('Localização indisponível. Verifica a permissão e o sinal GPS.')),
      {enableHighAccuracy:true, timeout:20000, maximumAge:0});
  });
}

function fieldworkReport(record, rows) {
  return fieldCollections.map(([collection, title, , definitions]) => {
    if (!record[collection]?.length) return '';
    return '<h2>' + esc(title) + '</h2>' + record[collection].map(item => '<table>' +
      rows(definitions.map(([name, label]) => [label, item[name] ?? ''])) + '</table>').join('');
  }).join('');
}
