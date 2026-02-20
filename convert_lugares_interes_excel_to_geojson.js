const fs = require('fs');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'EditorGeojsonMapa', 'node_modules', 'xlsx'));

const BASE_DIR = __dirname;
const EXCEL_PATH = path.resolve(BASE_DIR, 'Lugares_de_interes.xlsx');
const GEOJSON_PATH = path.resolve(BASE_DIR, 'camposfiltrados.geojson');

function parseNumberFlexible(str) {
  if (typeof str === 'number') return str;
  if (!str && str !== 0) return NaN;
  let s = String(str).trim();
  if (!s) return NaN;
  s = s.replace(/\s+/g, '');
  if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }
  return parseFloat(s);
}

function parseCoordenadas(raw) {
  if (!raw && raw !== 0) return null;
  let s = String(raw).trim();
  if (!s) return null;

  const wktMatch = s.match(/POINT\s*\(\s*([^\s,]+)\s+([^\s,]+)\s*\)/i);
  if (wktMatch) {
    const lon = parseNumberFlexible(wktMatch[1]);
    const lat = parseNumberFlexible(wktMatch[2]);
    if (isNaN(lat) || isNaN(lon)) return null;
    return [lon, lat];
  }

  s = s.replace(/[;]/g, ',');
  let parts;
  if (s.includes(',')) {
    parts = s.split(',').map(x => x.trim()).filter(Boolean);
  } else {
    parts = s.split(/\s+/).map(x => x.trim()).filter(Boolean);
  }
  if (parts.length < 2) return null;

  const lat = parseNumberFlexible(parts[0]);
  const lon = parseNumberFlexible(parts[1]);
  if (isNaN(lat) || isNaN(lon)) return null;
  return [lon, lat];
}

function loadExcelRows(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows;
}

function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('No se encontró el Excel de lugares de interés:', EXCEL_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(GEOJSON_PATH)) {
    console.error('No se encontró camposfiltrados.geojson en', GEOJSON_PATH);
    process.exit(1);
  }

  const rows = loadExcelRows(EXCEL_PATH);
  if (!rows.length) {
    console.error('El Excel de lugares de interés no tiene filas de datos.');
    process.exit(1);
  }

  let raw = fs.readFileSync(GEOJSON_PATH, 'utf8');
  let text = raw.replace(/^\uFEFF/, '');
  const firstBrace = text.indexOf('{');
  if (firstBrace > 0) {
    text = text.slice(firstBrace);
  }
  const data = JSON.parse(text);
  const features = Array.isArray(data.features) ? data.features : [];

  const backupPath = GEOJSON_PATH.replace(
    /\.geojson$/i,
    `_backup_before_lugares_${Date.now()}.geojson`
  );
  fs.writeFileSync(backupPath, raw, 'utf8');

  let added = 0;
  rows.forEach(row => {
    const keys = Object.keys(row);
    if (!keys.length) return;

    const lowerKeys = {};
    keys.forEach(k => { lowerKeys[k.toLowerCase()] = k; });

    const latKey =
      lowerKeys['latitud'] ||
      lowerKeys['lat'] ||
      lowerKeys['latitude'];
    const lonKey =
      lowerKeys['longitud'] ||
      lowerKeys['long'] ||
      lowerKeys['lon'] ||
      lowerKeys['longitude'];

    let lon, lat;

    if (latKey && lonKey) {
      lat = parseNumberFlexible(row[latKey]);
      lon = parseNumberFlexible(row[lonKey]);
    }

    if (isNaN(lat) || isNaN(lon)) {
      const coordKey = keys.find(
        k => String(k).trim().toLowerCase() === 'coordenadas'
      );
      if (!coordKey) return;
      const coords = parseCoordenadas(row[coordKey]);
      if (!coords) return;
      lon = coords[0];
      lat = coords[1];
    }

    if (isNaN(lat) || isNaN(lon)) return;

    const props = {};
    keys.forEach(k => {
      props[k] = row[k];
    });
    props.tipo_lugar = 'lugar_interes_docente';
    props.origen_lugar = 'excel_lugares_interes';

    const feature = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      },
      properties: props
    };
    features.push(feature);
    added++;
  });

  data.type = 'FeatureCollection';
  data.features = features;
  fs.writeFileSync(GEOJSON_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Lugares de interés agregados: ${added}`);
}

if (require.main === module) {
  main();
}
