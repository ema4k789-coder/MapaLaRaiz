const fs = require('fs');
const path = require('path');

function loadText(p) {
  return fs.readFileSync(p, 'utf8');
}

function loadJson(p) {
  return JSON.parse(loadText(p));
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function getTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function pointToSegmentDistance(lat, lon, aLat, aLon, bLat, bLon) {
  const toRad = x => x * Math.PI / 180;
  const R = 6371000;
  const φ1 = toRad(aLat);
  const φ2 = toRad(bLat);
  const λ1 = toRad(aLon);
  const λ2 = toRad(bLon);
  const φp = toRad(lat);
  const λp = toRad(lon);
  const Ax = R * Math.cos(φ1) * Math.cos(λ1);
  const Ay = R * Math.cos(φ1) * Math.sin(λ1);
  const Az = R * Math.sin(φ1);
  const Bx = R * Math.cos(φ2) * Math.cos(λ2);
  const By = R * Math.cos(φ2) * Math.sin(λ2);
  const Bz = R * Math.sin(φ2);
  const Px = R * Math.cos(φp) * Math.cos(λp);
  const Py = R * Math.cos(φp) * Math.sin(λp);
  const Pz = R * Math.sin(φp);
  const ABx = Bx - Ax;
  const ABy = By - Ay;
  const ABz = Bz - Az;
  const APx = Px - Ax;
  const APy = Py - Ay;
  const APz = Pz - Az;
  const ab2 = ABx * ABx + ABy * ABy + ABz * ABz;
  if (!ab2) {
    const dx = Px - Ax;
    const dy = Py - Ay;
    const dz = Pz - Az;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const t = Math.max(0, Math.min(1, (APx * ABx + APy * ABy + APz * ABz) / ab2));
  const Cx = Ax + ABx * t;
  const Cy = Ay + ABy * t;
  const Cz = Az + ABz * t;
  const dx = Px - Cx;
  const dy = Py - Cy;
  const dz = Pz - Cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function normalizeBusLabel(props) {
  const rawName = String(props.name || '').trim();
  const rawRef = String(props.ref || '').trim();
  const rawOp = String(props.operator || '').trim();
  if (rawName) {
    const idx = rawName.indexOf(':');
    if (idx !== -1) {
      let base = rawName.slice(0, idx).trim();
      base = base.replace(/\bRamal\b/gi, '').replace(/\s{2,}/g, ' ').trim();
      base = base.replace(/^\s*L[ií]nea\s+/i, '').trim();
      return base;
    }
    let base = rawName.replace(/\bRamal\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    base = base.replace(/^\s*L[ií]nea\s+/i, '').trim();
    return base;
  }
  if (rawRef) {
    const upper = rawRef.toUpperCase();
    const m = upper.match(/^(\d+)\s*([A-ZÁÉÍÓÚÑ0-9]+)?$/);
    if (m) {
      const num = m[1];
      const suf = m[2] || '';
      if (suf) return `${num} ${suf}`;
      return `${num}`;
    }
    const onlyDigits = /^[0-9]+$/.test(upper);
    if (onlyDigits) return upper;
    return upper;
  }
  if (rawOp) return rawOp;
  return 'Desconocida';
}

function getBusKey(props) {
  const rawRef = String(props.ref || '').trim().toUpperCase();
  if (rawRef) return rawRef;
  const rawName = String(props.name || '').trim();
  if (rawName) return rawName;
  const rawOp = String(props.operator || '').trim();
  if (rawOp) return rawOp;
  return 'SIN_IDENTIFICADOR';
}

function extractRouteNumbers(str) {
  const m = String(str || '').match(/\d{2,4}/g);
  return new Set(m || []);
}

function dedupByLabel(arr) {
  const map = new Map();
  arr.forEach(x => {
    const key = x.label;
    if (!map.has(key) || x.dist < map.get(key).dist) {
      map.set(key, x);
    }
  });
  return Array.from(map.values());
}

function main() {
  const rutasPath = path.join(__dirname, 'recorridos_lp.geojson');
  const escuelasPath = path.join(__dirname, 'camposfiltrados.geojson');

  const rawEscuelas = loadText(escuelasPath);
  const backupName = 'camposfiltrados_backup_' + getTimestamp() + '.geojson';
  const backupPath = path.join(__dirname, backupName);
  fs.writeFileSync(backupPath, rawEscuelas, 'utf8');

  const rutas = JSON.parse(loadText(rutasPath));
  const escuelas = JSON.parse(rawEscuelas);

  const segmentos = [];
  (rutas.features || []).forEach(f => {
    const g = f.geometry;
    if (!g) return;
    const props = f.properties || {};
    const label = normalizeBusLabel(props);
    const key = getBusKey(props);
    const segProps = Object.assign({}, props, { _label: label, _key: key });
    if (g.type === 'LineString') {
      const coords = g.coordinates || [];
      for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i];
        const [lon2, lat2] = coords[i + 1];
        segmentos.push({ lat1, lon1, lat2, lon2, props: segProps });
      }
    } else if (g.type === 'MultiLineString') {
      (g.coordinates || []).forEach(line => {
        for (let i = 0; i < line.length - 1; i++) {
          const [lon1, lat1] = line[i];
          const [lon2, lat2] = line[i + 1];
          segmentos.push({ lat1, lon1, lat2, lon2, props: segProps });
        }
      });
    }
  });

  const MAX_CERCA = 300;
  const MAX_LEJOS = 1000;
  const METROS_POR_CUADRA = 100;

  const feats = Array.isArray(escuelas.features) ? escuelas.features : [];
  let actualizadas = 0;
  let sinCambioPorDiferencia = 0;

  feats.forEach(f => {
    const p = f.properties || {};
    let lat;
    let lon;
    if (f.geometry && Array.isArray(f.geometry.coordinates)) {
      lon = Number(f.geometry.coordinates[0]);
      lat = Number(f.geometry.coordinates[1]);
    } else {
      lat = Number(p.latitud || p.lat || p.latitude);
      lon = Number(p.longitud || p.lng || p.longitude);
    }
    if (isNaN(lat) || isNaN(lon)) return;

    const cercanas = [];
    const lejanas = [];

    segmentos.forEach(seg => {
      const d = pointToSegmentDistance(
        lat, lon,
        seg.lat1, seg.lon1,
        seg.lat2, seg.lon2
      );
      const label = seg.props._label;
      if (d <= MAX_CERCA) {
        cercanas.push({ label, dist: d });
      } else if (d <= MAX_LEJOS) {
        lejanas.push({ label, dist: d });
      }
    });

    let nuevoTexto = '';
    if (cercanas.length > 0) {
      const únicos = dedupByLabel(cercanas);
      const lista = únicos.map(x => x.label);
      nuevoTexto = 'Colectivos cerca (≤ 300 m): ' + lista.join('; ');
    } else if (lejanas.length > 0) {
      const únicos = dedupByLabel(lejanas);
      const lista = únicos.map(x => {
        const cuadras = Math.round(x.dist / METROS_POR_CUADRA);
        return `${x.label} (a ~${cuadras} cuadras)`;
      });
      nuevoTexto = 'Colectivos a distancia caminable (≤ 1000 m): ' + lista.join('; ');
    } else {
      return;
    }

    const viejo = String(p['COMO LLEGO'] || '').trim();
    if (!viejo) {
      p['COMO LLEGO'] = nuevoTexto;
      f.properties = p;
      actualizadas++;
      return;
    }

    const numsNuevo = extractRouteNumbers(nuevoTexto);
    const numsViejo = extractRouteNumbers(viejo);
    let similar = false;
    numsNuevo.forEach(n => {
      if (numsViejo.has(n)) similar = true;
    });

    if (similar) {
      p['COMO LLEGO'] = nuevoTexto;
      f.properties = p;
      actualizadas++;
    } else {
      const base = viejo.replace(/\s+$/,'');
      if (!base) {
        p['COMO LLEGO'] = nuevoTexto;
      } else if (/[.!?]$/.test(base)) {
        p['COMO LLEGO'] = base + ' ' + nuevoTexto;
      } else {
        p['COMO LLEGO'] = base + '. ' + nuevoTexto;
      }
      f.properties = p;
      actualizadas++;
    }
  });

  saveJson(escuelasPath, escuelas);
  console.log('Actualización COMPLETA');
  console.log('Escuelas con COMO LLEGO actualizado:', actualizadas);
  console.log('Escuelas con COMO LLEGO conservado por diferencias:', sinCambioPorDiferencia);
  console.log('Backup creado en:', backupPath);
}

main();
