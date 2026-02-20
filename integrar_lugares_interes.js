const fs = require('fs');
const path = require('path');

function getTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
}

function normalizePoiFeature(f) {
  if (!f || typeof f !== 'object') return null;
  const properties = Object.assign({}, f.properties || {});
  properties.tipo_lugar = 'lugar_interes_docente';
  let lat = null;
  let lng = null;
  if (f.geometry && f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
    lng = Number(f.geometry.coordinates[0]);
    lat = Number(f.geometry.coordinates[1]);
  } else {
    lat = Number(properties.latitud || properties.lat || properties.latitude);
    lng = Number(properties.longitud || properties.lng || properties.longitude);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const geometry = {
    type: 'Point',
    coordinates: [lng, lat]
  };
  return {
    type: 'Feature',
    geometry,
    properties
  };
}

function main() {
  const basePath = path.join(__dirname, 'camposfiltrados.geojson');
  const poiPath = path.join(__dirname, 'lugares_interes_docente.geojson');

  if (!fs.existsSync(basePath)) {
    console.error('No se encontró camposfiltrados.geojson en esta carpeta.');
    process.exit(1);
  }
  if (!fs.existsSync(poiPath)) {
    console.error('No se encontró lugares_interes_docente.geojson en esta carpeta.');
    process.exit(1);
  }

  const backupPath = path.join(
    __dirname,
    'camposfiltrados_backup_' + getTimestamp() + '.geojson'
  );

  const originalBaseText = fs.readFileSync(basePath, 'utf8');
  fs.writeFileSync(backupPath, originalBaseText, 'utf8');

  const base = JSON.parse(originalBaseText);
  const poiRaw = loadJson(poiPath);

  const baseFeatures = Array.isArray(base.features) ? base.features.slice() : [];
  const poiSource = Array.isArray(poiRaw.features) ? poiRaw.features : [];

  const poiNormalized = [];
  poiSource.forEach(f => {
    const nf = normalizePoiFeature(f);
    if (nf) poiNormalized.push(nf);
  });

  const merged = {
    type: 'FeatureCollection',
    features: baseFeatures.concat(poiNormalized)
  };

  saveJson(basePath, merged);

  console.log('Integración completa.');
  console.log('Backup creado en:', backupPath);
  console.log('Escuelas originales:', baseFeatures.length);
  console.log('Lugares de interés agregados:', poiNormalized.length);
}

main();

