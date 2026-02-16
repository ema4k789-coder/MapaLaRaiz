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

function saveJsonPretty(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
}

const bbox = {
  minLat: -35.20,
  maxLat: -34.60,
  minLon: -58.30,
  maxLon: -57.30
};

function inBBoxLatLng(lat, lon) {
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lon >= bbox.minLon &&
    lon <= bbox.maxLon
  );
}

function clipLineLonLat(coords) {
  const segments = [];
  let current = [];
  for (let i = 0; i < coords.length; i++) {
    const lon = coords[i][0];
    const lat = coords[i][1];
    if (inBBoxLatLng(lat, lon)) {
      current.push([lon, lat]);
    } else {
      if (current.length > 1) {
        segments.push(current);
      }
      current = [];
    }
  }
  if (current.length > 1) {
    segments.push(current);
  }
  return segments;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function simplifyLineLonLat(coords, tolMeters) {
  if (!Array.isArray(coords) || coords.length <= 2) return coords;
  const res = [coords[0]];
  let last = coords[0];
  for (let i = 1; i < coords.length - 1; i++) {
    const cur = coords[i];
    const d = haversineMeters(
      last[1],
      last[0],
      cur[1],
      cur[0]
    );
    if (d >= tolMeters) {
      res.push(cur);
      last = cur;
    }
  }
  const lastOrig = coords[coords.length - 1];
  if (res[res.length - 1][0] !== lastOrig[0] || res[res.length - 1][1] !== lastOrig[1]) {
    res.push(lastOrig);
  }
  if (res.length < 2) return coords.slice(0, 2);
  return res;
}

function main() {
  const filePath = path.join(__dirname, 'recorridos_lp.geojson');
  const backupPath = path.join(
    __dirname,
    'recorridos_lp_backup_' + getTimestamp() + '.geojson'
  );

  const originalText = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(backupPath, originalText, 'utf8');

  const data = JSON.parse(originalText);
  const feats = Array.isArray(data.features) ? data.features : [];
  const tol = 20;

  const newFeatures = [];

  feats.forEach(f => {
    if (!f || !f.geometry) return;
    const g = f.geometry;
    if (g.type === 'LineString') {
      const coords = Array.isArray(g.coordinates) ? g.coordinates : [];
      if (coords.length < 2) return;
      const clipped = clipLineLonLat(coords);
      if (!clipped.length) return;
      const simplifiedLines = clipped
        .map(seg => simplifyLineLonLat(seg, tol))
        .filter(seg => seg && seg.length > 1);
      if (!simplifiedLines.length) return;
      if (simplifiedLines.length === 1) {
        newFeatures.push({
          type: 'Feature',
          properties: f.properties || {},
          geometry: {
            type: 'LineString',
            coordinates: simplifiedLines[0]
          }
        });
      } else {
        newFeatures.push({
          type: 'Feature',
          properties: f.properties || {},
          geometry: {
            type: 'MultiLineString',
            coordinates: simplifiedLines
          }
        });
      }
    } else if (g.type === 'MultiLineString') {
      const lines = Array.isArray(g.coordinates) ? g.coordinates : [];
      const collected = [];
      lines.forEach(line => {
        if (!Array.isArray(line) || line.length < 2) return;
        const clipped = clipLineLonLat(line);
        clipped.forEach(seg => {
          const simp = simplifyLineLonLat(seg, tol);
          if (simp && simp.length > 1) {
            collected.push(simp);
          }
        });
      });
      if (!collected.length) return;
      newFeatures.push({
        type: 'Feature',
        properties: f.properties || {},
        geometry: {
          type: 'MultiLineString',
          coordinates: collected
        }
      });
    } else {
      // Otros tipos de geometría no aportan a los recorridos y se omiten
    }
  });

  const out = {
    type: 'FeatureCollection',
    features: newFeatures
  };
  saveJsonPretty(filePath, out);
  console.log('Recorte COMPLETO');
  console.log('Backup creado en:', backupPath);
  console.log('Features originales:', feats.length);
  console.log('Features resultantes:', newFeatures.length);
}

main();

