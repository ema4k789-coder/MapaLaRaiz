const map = L.map('map').setView([-34.921, -57.954], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
}).addTo(map);

// Pane para contorno difuminado de límites
map.createPane('boundariesGlowPane');
map.getPane('boundariesGlowPane').style.zIndex = 350;
map.getPane('boundariesGlowPane').style.pointerEvents = 'none';
map.getPane('boundariesGlowPane').style.filter = 'blur(5px)';
// Pane para contorno nítido encima del glow
map.createPane('boundariesPane');
map.getPane('boundariesPane').style.zIndex = 351;
map.getPane('boundariesPane').style.pointerEvents = 'none';
function notify(msg){
  try{
    var id='app-notify';
    var el=document.getElementById(id);
    if(!el){
      el=document.createElement('div');
      el.id=id;
      document.body.appendChild(el);
    }
    el.textContent=msg;
    el.style.cssText='position:fixed;bottom:12px;right:12px;background:#111;color:#fff;border:1px solid #000;border-radius:10px;padding:10px 14px;box-shadow:0 2px 12px rgba(0,0,0,0.35);z-index:2000;font-size:14px;';
    el.style.display='block';
    if(el._t) clearTimeout(el._t);
    el._t=setTimeout(function(){ el.style.display='none'; },6000);
  }catch(e){}
}
if(location&&location.protocol==='file:'){
  notify('Abrir en http://localhost:8080/main.html para evitar bloqueos');
}
try{
  window.addEventListener('unhandledrejection',function(){ notify('No se pudo cargar datos. Use http://localhost:8080'); });
  window.addEventListener('error',function(){ notify('Error de carga. Use http://localhost:8080'); });
}catch(e){}

function styleBoundaryGlow() {
  return { color: '#ff0033', weight: 28, opacity: 0.22, fill: false, pane: 'boundariesGlowPane' };
}
function styleBoundarySharp() {
  return { color: '#ff0033', weight: 3, opacity: 0.9, fill: false, pane: 'boundariesPane' };
}
function setBoundariesHidden(flag){
  boundariesHidden = !!flag;
  const btn = document.getElementById('toggleBoundariesVisibilityBtn');
  if (btn) btn.title = boundariesHidden ? 'Mostrar límites' : 'Ocultar límites';
  updateDisplayForSelectedDistrict();
}

function addBoundaryGeoJSON(geojson) {
  try {
    const g = filterBoundaryRegion(geojson);
    if (!g) return;
    const glow = L.geoJSON(g, styleBoundaryGlow()).addTo(map);
    const sharp = L.geoJSON(g, styleBoundarySharp()).addTo(map);
    boundaryLayers.push(glow);
    boundaryLayers.push(sharp);
  } catch (e) {}
}
function filterBoundaryRegion(geojson){
  try{
    const REGION = { minLat: -35.10, maxLat: -34.60, minLon: -58.20, maxLon: -57.50 };
    function ringBBox(r){ let minLat=90,maxLat=-90,minLon=180,maxLon=-180; for(let i=0;i<r.length;i++){ const lon=r[i][0], lat=r[i][1]; if(lat<minLat)minLat=lat; if(lat>maxLat)maxLat=lat; if(lon<minLon)minLon=lon; if(lon>maxLon)maxLon=lon; } return {minLat,maxLat,minLon,maxLon}; }
    function boxCenter(b){ return { lat:(b.minLat+b.maxLat)/2, lon:(b.minLon+b.maxLon)/2 }; }
    function inRegion(c){ return c.lat>=REGION.minLat && c.lat<=REGION.maxLat && c.lon>=REGION.minLon && c.lon<=REGION.maxLon; }
    const g = geojson;
    if (g.type==='Polygon'){ const b = ringBBox(g.coordinates[0]||[]); const c = boxCenter(b); return inRegion(c)? g : null; }
    if (g.type==='MultiPolygon'){
      const polys = [];
      for(let p=0;p<g.coordinates.length;p++){
        const poly = g.coordinates[p]; const outer = poly[0]||[]; const b = ringBBox(outer); const c = boxCenter(b); if(inRegion(c)) polys.push(poly);
      }
      if (polys.length===0) return null;
      return { type:'MultiPolygon', coordinates: polys };
    }
    return g;
  }catch(e){ return geojson; }
}

function norm(s){ return (s||'').toLowerCase(); }
function isPolygonGeojson(g){ return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon'); }
async function fetchBoundaryNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const arr = await res.json();
    const filtered = (arr || []).filter(x => x && x.geojson && isPolygonGeojson(x.geojson));
    const preferAdmin = filtered.find(x => (x.class === 'boundary' || x.type === 'administrative')) || filtered[0];
    if (preferAdmin && preferAdmin.geojson) addBoundaryGeoJSON(preferAdmin.geojson);
  } catch (e) {}
}
async function fetchBoundaryByCandidates(candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const q = candidates[i];
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const arr = await res.json();
      const filtered = (arr || []).filter(x => x && isPolygonGeojson(x.geojson));
      const partido = filtered.find(x => norm(x.display_name).includes('partido')) || filtered.find(x => (x.class === 'boundary' || x.type === 'administrative')) || filtered[0];
      if (partido && partido.geojson) { addBoundaryGeoJSON(partido.geojson); return true; }
    } catch (e) {}
  }
  return false;
}

async function tryLoadLocalMunicipalBoundaries(){
  try {
    const res = await fetch('municipios_boundaries.geojson', { cache: 'no-store' });
    if (!res.ok) return false;
    const gj = await res.json();
    const feats = Array.isArray(gj.features) ? gj.features : [];
    let found = false;
    feats.forEach(f => {
      const g = f && f.geometry;
      const n = f && f.properties && f.properties.name;
      if (g && isPolygonGeojson(g)) { municipioGeomByName[norm(n)]=g; found = true; }
    });
    return found;
  } catch (e) { return false; }
}
async function loadMunicipioBoundaryCached(name, candidates) {
  const key = 'municipioBoundary:' + norm(name);
  try {
    const cached = localStorage.getItem(key);
    if (cached) { municipioGeomByName[norm(name)] = JSON.parse(cached); return true; }
  } catch (e) {}
  for (let i = 0; i < candidates.length; i++) {
    const q = candidates[i];
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const arr = await res.json();
      const filtered = (arr || []).filter(x => x && isPolygonGeojson(x.geojson));
      const partido = filtered.find(x => norm(x.display_name).includes('partido')) || filtered.find(x => (x.class === 'boundary' || x.type === 'administrative')) || filtered[0];
      if (partido && partido.geojson) {
        try { localStorage.setItem(key, JSON.stringify(partido.geojson)); } catch (e) {}
        municipioGeomByName[norm(name)] = partido.geojson;
        return true;
      }
    } catch (e) {}
  }
  return false;
}
(async function addMunicipalBoundaries(){
  const usedLocal = await tryLoadLocalMunicipalBoundaries();
  if (!usedLocal && !boundariesLocalOnly) {
    await loadMunicipioBoundaryCached('La Plata', [
      'Partido de La Plata, Buenos Aires, Argentina',
      'La Plata Partido, Buenos Aires, Argentina',
      'La Plata, Buenos Aires, Argentina'
    ]);
    await loadMunicipioBoundaryCached('Berisso', [
      'Partido de Berisso, Buenos Aires, Argentina',
      'Berisso Partido, Buenos Aires, Argentina',
      'Berisso, Buenos Aires, Argentina'
    ]);
    await loadMunicipioBoundaryCached('Ensenada', [
      'Partido de Ensenada, Buenos Aires, Argentina',
      'Ensenada Partido, Buenos Aires, Argentina',
      'Ensenada, Buenos Aires, Argentina'
    ]);
  }
  updateDisplayForSelectedDistrict();
})();

function clearMunicipioBoundaryLayers(){ try{ boundaryLayers.forEach(l=>map.removeLayer(l)); boundaryLayers=[]; }catch(e){} }
function drawBoundaryGeom(g){ try{ const f = filterBoundaryRegion(g); if(!f) return; const glow = L.geoJSON(f, styleBoundaryGlow()).addTo(map); const sharp = L.geoJSON(f, styleBoundarySharp()).addTo(map); boundaryLayers.push(glow); boundaryLayers.push(sharp); }catch(e){} }
function drawMunicipioBoundary(name){ try{ const g = municipioGeomByName[norm(name)]; if(!g) return; drawBoundaryGeom(g); }catch(e){} }
function drawAllMunicipioBoundaries(){ try{ Object.keys(municipioGeomByName).forEach(k=>{ const g = municipioGeomByName[k]; if(g) drawBoundaryGeom(g); }); }catch(e){} }
function setPaneVisible(pane, show){ try{ map.getPane(pane).style.display = show? '' : 'none'; }catch(e){} }
function updateDisplayForSelectedDistrict(){ const d = document.getElementById('filterDistrito').value; clearMunicipioBoundaryLayers(); if(boundariesHidden){ setPaneVisible('boundariesGlowPane', false); setPaneVisible('boundariesPane', false); setPaneVisible('localitiesGlowPane', false); setPaneVisible('localitiesPane', false); setPaneVisible('railwaysPane', false); clearRailways(); return; } if(!d){ drawAllMunicipioBoundaries(); setPaneVisible('boundariesGlowPane', true); setPaneVisible('boundariesPane', true); setPaneVisible('localitiesGlowPane', false); setPaneVisible('localitiesPane', false); setPaneVisible('railwaysPane', false); clearRailways(); return; } if(d==='La Plata'){ drawMunicipioBoundary('La Plata'); setPaneVisible('boundariesGlowPane', true); setPaneVisible('boundariesPane', true); setPaneVisible('localitiesGlowPane', true); setPaneVisible('localitiesPane', true); setPaneVisible('railwaysPane', true); return; } if(d==='Berisso'){ drawMunicipioBoundary('Berisso'); setPaneVisible('boundariesGlowPane', true); setPaneVisible('boundariesPane', true); setPaneVisible('localitiesGlowPane', false); setPaneVisible('localitiesPane', false); setPaneVisible('railwaysPane', false); clearRailways(); return; } if(d==='Ensenada'){ drawMunicipioBoundary('Ensenada'); setPaneVisible('boundariesGlowPane', true); setPaneVisible('boundariesPane', true); setPaneVisible('localitiesGlowPane', false); setPaneVisible('localitiesPane', false); setPaneVisible('railwaysPane', false); clearRailways(); return; } }

map.createPane('localitiesGlowPane');
map.getPane('localitiesGlowPane').style.zIndex = 352;
map.getPane('localitiesGlowPane').style.pointerEvents = 'none';
map.getPane('localitiesGlowPane').style.filter = 'blur(3px)';
map.createPane('localitiesPane');
map.getPane('localitiesPane').style.zIndex = 353;
map.getPane('localitiesPane').style.pointerEvents = 'none';
map.createPane('railwaysPane');
map.getPane('railwaysPane').style.zIndex = 354;
map.getPane('railwaysPane').style.pointerEvents = 'none';

function styleLocalityGlow() { return { color: '#0062cc', weight: 10, opacity: 0.08, fill: false, pane: 'localitiesGlowPane' }; }
function styleLocalitySharp() { return { color: '#0062cc', weight: 2, opacity: 0.8, fill: false, pane: 'localitiesPane' }; }
function styleRailway() { return { color: '#0062cc', weight: 2, opacity: 0.9, pane: 'railwaysPane' }; }
function addLocalityGeoJSON(geojson) { try { L.geoJSON(geojson, styleLocalityGlow()).addTo(map); L.geoJSON(geojson, styleLocalitySharp()).addTo(map); } catch (e) {} }
const localityGeomByName = {};
function addLocalityFeature(geojson, name){ try { addLocalityGeoJSON(geojson); const nm = normalizeLocalidadName(name||''); if(nm) localityGeomByName[nm]=geojson; } catch(e){} }
async function fetchLocalityByCandidates(name) {
  const key = 'locBoundary:' + (normalizeLocalidadName(name) || name).toLowerCase();
  try {
    const cached = localStorage.getItem(key);
    if (cached) { addLocalityFeature(JSON.parse(cached), name); return true; }
  } catch (e) {}
  const candidates = [
    `${name}, La Plata, Buenos Aires, Argentina`,
    `${name} La Plata, Buenos Aires, Argentina`,
    `${name} barrio, La Plata, Buenos Aires, Argentina`
  ];
  for (let i = 0; i < candidates.length; i++) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&q=${encodeURIComponent(candidates[i])}`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const arr = await res.json();
      const filtered = (arr || []).filter(x => x && isPolygonGeojson(x.geojson));
      const item = filtered.find(x => (x.class === 'boundary' || x.type === 'administrative')) || filtered[0];
      if (item && item.geojson) {
        try { localStorage.setItem(key, JSON.stringify(item.geojson)); } catch (e) {}
        addLocalityFeature(item.geojson, name);
        return true;
      }
    } catch (e) {}
  }
  return false;
}
async function tryLoadLocalLocalitiesBoundaries() {
  try {
    const res = await fetch('localidades_la_plata.geojson', { cache: 'no-store' });
    if (!res.ok) return false;
    const gj = await res.json();
    const feats = Array.isArray(gj.features) ? gj.features : [];
    let found = false;
    feats.forEach(f => { const g = f && f.geometry; const n = f && f.properties && f.properties.name; if (!g) return; if (isPolygonGeojson(g)) { addLocalityFeature(g, n); found = true; } else if (g.type==='LineString' && Array.isArray(g.coordinates)) { const latlngs = g.coordinates.map(c=>[c[1],c[0]]); const layer = L.polyline(latlngs, styleRailway()).addTo(map); railwayLayers.push(layer); found = true; } });
    return found;
  } catch (e) { return false; }
}
async function addLocalityBoundariesLaPlata() {
  if (localityBoundariesLoaded) return;
  localityBoundariesLoaded = true;
  try {
    const usedLocal = await tryLoadLocalLocalitiesBoundaries();
    
    if (usedLocal) { return; }
    if (boundariesLocalOnly) return;
    const set = new Set();
    (allSchools || []).forEach(f => { const p = f.properties || {}; if ((p.distrito || '') === 'La Plata') { const n = normalizeLocalidadName(p.localidad || p.localidad_norm || ''); if (n && n.toLowerCase() !== 'la plata') set.add(n); } });
    const locs = Array.from(set);
    for (let i = 0; i < locs.length; i++) { await fetchLocalityByCandidates(locs[i]); await new Promise(r => setTimeout(r, 350)); }
  } catch (e) {}
}
function geomBBox(g){ try{ let minLat=90,maxLat=-90,minLon=180,maxLon=-180; function addCoord(c){ const lon=c[0], lat=c[1]; if(lat<minLat)minLat=lat; if(lat>maxLat)maxLat=lat; if(lon<minLon)minLon=lon; if(lon>maxLon)maxLon=lon; } if(g.type==='Polygon'){ (g.coordinates[0]||[]).forEach(addCoord); } else if(g.type==='MultiPolygon'){ (g.coordinates||[]).forEach(poly=>{ (poly[0]||[]).forEach(addCoord); }); } return {minLat,maxLat,minLon,maxLon}; }catch(e){ return null; } }
function mergeBBoxes(a,b){ return { minLat: Math.min(a.minLat,b.minLat), maxLat: Math.max(a.maxLat,b.maxLat), minLon: Math.min(a.minLon,b.minLon), maxLon: Math.max(a.maxLon,b.maxLon) }; }
function expandBBox(b,deg){ return { minLat: b.minLat-deg, maxLat: b.maxLat+deg, minLon: b.minLon-deg, maxLon: b.maxLon+deg }; }
function intersectBBox(a,b){ const minLat = Math.max(a.minLat,b.minLat), maxLat = Math.min(a.maxLat,b.maxLat), minLon = Math.max(a.minLon,b.minLon), maxLon = Math.min(a.maxLon,b.maxLon); if (minLat>maxLat || minLon>maxLon) return null; return { minLat, maxLat, minLon, maxLon }; }
function inBBox(pt,b){ const lat=pt[0], lon=pt[1]; return lat>=b.minLat && lat<=b.maxLat && lon>=b.minLon && lon<=b.maxLon; }
function clipPolylineToBBox(latlngs,b){ const segs=[]; let cur=[]; for(let i=0;i<latlngs.length;i++){ const pt=latlngs[i]; if(inBBox(pt,b)){ cur.push(pt); } else { if(cur.length>1){ segs.push(cur); } cur=[]; } } if(cur.length>1) segs.push(cur); return segs; }

const modoEdicion = false; 
if (modoEdicion) {
  document.getElementById('geojsonInput').style.display = '';
  let eliminarPrivadasBtn = document.getElementById('eliminarPrivadasBtn');
  if (!eliminarPrivadasBtn) {
    eliminarPrivadasBtn = document.createElement('button');
    eliminarPrivadasBtn.id = 'eliminarPrivadasBtn';
    eliminarPrivadasBtn.textContent = 'Eliminar escuelas privadas';
    eliminarPrivadasBtn.style.marginLeft = '12px';
    document.getElementById('admin-panel').appendChild(eliminarPrivadasBtn);
  }
  eliminarPrivadasBtn.style.display = '';
  eliminarPrivadasBtn.onclick = function() {
    if (!Array.isArray(allSchools)) return;
    const antes = allSchools.length;
    allSchools = allSchools.filter(f => (f.properties.sector || '').trim().toLowerCase() !== 'privado');
    filterSchools();
    alert('Escuelas privadas eliminadas: ' + (antes - allSchools.length));
  };
  document.getElementById('geojsonInput').addEventListener('change', function(e) {
  });
}

let allSchools = [];
let markers = [];
let localityBoundariesLoaded = false;
let boundariesLocalOnly = true;
let boundariesHidden = false;
let railwayLayers = [];
let boundaryLayers = [];
const municipioGeomByName = {};

function getColorByLevel(nivel) {
  if (!nivel) return '#757575';
  const n = nivel.toLowerCase();
  if (n.includes('inicial')) return '#0074D9';
  if (n.includes('primaria')) return '#2ECC40';
  if (n.includes('secundaria')) return '#FF4136';
  if (n.includes('superior')) return '#FFDC00';
  if (n.includes('artística')) return '#B10DC9';
  if (n.includes('técnicas y agrarias')) return '#3D9970';
  if (n.includes('técnica')) return '#FF851B';
  if (n.includes('ciclo medio')) return '#7FDBFF';
  if (n.includes('ciclo de iniciación')) return '#39CCCC';
  if (n.includes('cursos y talleres')) return '#F012BE';
  if (n.includes('adultos')) return '#8E44AD';
  if (n.includes('jardín maternal') || n.includes('jardin maternal')) return '#3399FF';
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = n.charCodeAt(i) + ((hash << 5) - hash);
  const color = `hsl(${hash % 360}, 70%, 55%)`;
  return color;
}

function normalizeStr(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeLocalidadName(s) {
  if (!s) return '';
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const m = {
    'josé melchor romero': 'melchor romero',
    'jose melchor romero': 'melchor romero',
    'melchor romero': 'melchor romero',
    'villa montoro': 'villa elvira',
    'la cumbre': 'san carlos'
  };
  const canon = m[t] || t;
  return canon.replace(/(^|\s)\S/g, function(x){ return x.toUpperCase(); });
}

function getBaseFeatures() {
  const base = editModeActive
    ? ((editGeojsonData && Array.isArray(editGeojsonData.features)) ? editGeojsonData.features : [])
    : allSchools;
  return base.map(function(f){
    const p = f.properties || {};
    p.localidad_norm = normalizeLocalidadName(p.localidad || '');
    f.properties = p;
    return f;
  });
}

function sanitizeFeature(feature) {
  const f = feature || {};
  f.type = 'Feature';
  f.properties = f.properties || {};
  const p = f.properties;
  const hasGeom = f.geometry && Array.isArray(f.geometry.coordinates);
  let lat = hasGeom ? Number(f.geometry.coordinates[1]) : Number(p.latitud ?? p.lat ?? p.latitude);
  let lng = hasGeom ? Number(f.geometry.coordinates[0]) : Number(p.longitud ?? p.lng ?? p.longitude);
  if (isNaN(lat) || isNaN(lng)) {
    // Intento calcular por localidad
    const centroid = getLocalidadCentroid(normalizeLocalidadName(p.localidad || ''));
    if (centroid) { lat = centroid[0]; lng = centroid[1]; }
  }
  if (isNaN(lat) || isNaN(lng)) { lat = -34.92; lng = -57.95; }
  f.geometry = { type: 'Point', coordinates: [lng, lat] };
  p.localidad_norm = normalizeLocalidadName(p.localidad || '');
  return f;
}

function sanitizeGeojson(gj) {
  const data = gj || {};
  data.type = 'FeatureCollection';
  data.features = Array.isArray(data.features) ? data.features.map(sanitizeFeature) : [];
  return data;
}

function getLocalidadCentroid(locNorm) {
  if (!locNorm) return null;
  const base = Array.isArray(allSchools) ? allSchools : [];
  let sumLat = 0, sumLng = 0, count = 0;
  base.forEach(f => {
    const p = f.properties || {};
    const loc = (p.localidad_norm || normalizeLocalidadName(p.localidad || '')).trim().toLowerCase();
    if (loc === locNorm.trim().toLowerCase()) {
      const coords = f.geometry && f.geometry.coordinates;
      if (coords && !isNaN(coords[1]) && !isNaN(coords[0])) {
        sumLat += Number(coords[1]);
        sumLng += Number(coords[0]);
        count++;
      }
    }
  });
  if (count === 0) return null;
  return [sumLat / count, sumLng / count];
}

function clearMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
}

function renderMarkers(schools) {
  if (editModeActive) return;
  console.log('renderMarkers recibido:', schools.length, schools.slice(0,3));
  clearMarkers();
  schools.forEach(school => {
    const coords = school.geometry.coordinates;
    const props = school.properties;
    const nivel = props.nivel || '';
    let color = getColorByLevel(nivel);
    const nombreStr = typeof props.nombre === 'string' ? props.nombre : '';
    const tipoStr = typeof props.tipo_organizacion === 'string' ? props.tipo_organizacion : '';
    if (nombreStr.includes('adultos') || nombreStr.includes('Adultos') || nombreStr.includes('ADULTOS')) {
      color = '#8E44AD';
    }
    if (
      nombreStr.includes('JARDÍN MATERNAL') ||
      nombreStr.includes('JARDIN MATERNAL') ||
      nombreStr.includes('Jardín Maternal') ||
      nombreStr.includes('Jardin Maternal') ||
      tipoStr.includes('JARDÍN MATERNAL') ||
      tipoStr.includes('JARDIN MATERNAL')
    ) {
      color = '#3399FF';
    }

    const marker = L.circleMarker([coords[1], coords[0]], {
      color: color,
      fillColor: color,
      radius: 12,
      weight: 3,
      fillOpacity: 0.85,
      opacity: 1
    }).addTo(map);

    let nombreBase = props.nombre || '';
let numeroBase = props.numero || '';
let nivelBase = nivel.toLowerCase();
let sigla = '';
if (nivelBase.includes('primaria')) sigla = 'EP';
else if (nivelBase.includes('secundaria')) sigla = 'ES';
else if (nivelBase.includes('inicial')) sigla = 'JI';
else if (nivelBase.includes('terciario') || nivelBase.includes('isfd') || nivelBase.includes('instituto superior')) sigla = 'ISFD';
    let nombreFinal = '';
    if (sigla) nombreFinal = `${sigla} ${numeroBase} - ${nombreBase}`;
    else nombreFinal = `${numeroBase} - ${nombreBase}`;
    let datosHtml = `<div class='popup-frame'><img class='frame-img' src='pizarron.png' alt=''><button class='popup-dl-btn' title='Descargar imagen'>⬇</button><div class='frame-content'>`;
    datosHtml += `<div class='name-tag'>${nombreFinal}</div>`;
    datosHtml += `<div class='field-line'><b>Nivel:</b> ${nivel}</div>`;
    datosHtml += `<div class='field-line'><b>Número:</b> ${props.numero || ''}</div>`;
    datosHtml += `<div class='field-line'><b>Localidad:</b> ${props.localidad || ''}</div>`;
    for (const clave in props) {
      if (!["nombre","numero","nivel","localidad"].includes(clave)) {
        datosHtml += `<div class='field-line'><b>${clave}:</b> ${props[clave]}</div>`;
      }
    }
    datosHtml += `</div><button type='button' class='popup-volver-btn'>VOLVER</button></div>`;
    marker.bindPopup(datosHtml, { closeButton: false, autoClose: true, closeOnClick: true });
  marker.on('popupopen', function() {
    try{
      const w = window.innerWidth || 1024;
      if (w <= 600) {
        // Cerrar panel de filtros principal
        const panel = document.getElementById('filterLevelPanel');
        const panelContent = document.getElementById('panelContent');
        if (panel && !panel.classList.contains('collapsed')) {
          panel.classList.add('collapsed');
        }
        if (panelContent && !panelContent.classList.contains('hidden')) {
          panelContent.classList.add('hidden');
        }
        // Cerrar admin panel
        const admin = document.getElementById('admin-panel');
        if (admin && window.getComputedStyle(admin).display !== 'none') { 
          window.adminPanelOpen = false; 
          admin.style.display = 'none'; 
        }
      }
    }catch(e){}
    const content = document.querySelector('.leaflet-popup-content');
      if (!content) return;
      const frame = content.querySelector('.popup-frame');
      const imgEl = content.querySelector('.frame-img');
      if (frame && imgEl) {
        imgEl.onerror = function(){ imgEl.remove(); };
        if (window.getFrameURL) {
          window.getFrameURL().then(function(url){ if (url) imgEl.src = url; });
        }
      }
      const frameContent = content.querySelector('.frame-content');
      if (frameContent) {
        let scrollTimeout = null;
        frameContent.addEventListener('scroll', function() {
          if (scrollTimeout) clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(function() {
            let ultimoCompleto = null;
            for (const child of frameContent.children) {
              const childBottom = child.offsetTop + child.offsetHeight;
              if (childBottom <= frameContent.scrollTop + frameContent.clientHeight) {
                ultimoCompleto = child;
              }
            }
            if (ultimoCompleto) {
              const nuevoScroll = ultimoCompleto.offsetTop + ultimoCompleto.offsetHeight - frameContent.clientHeight;
              if (frameContent.scrollTop !== nuevoScroll) {
                frameContent.scrollTop = nuevoScroll;
              }
            }
          }, 120);
        });
      }
      const dlBtn = content.querySelector('.popup-dl-btn');
      if (dlBtn) {
        dlBtn.onclick = async function(ev) {
          ev.stopPropagation();
          const targetFrame = content.querySelector('.popup-frame');
          if (!targetFrame) return;
          const frameContent = targetFrame.querySelector('.frame-content');
          if (!frameContent) return;
          const isMobile = ((window.innerWidth || 1024) <= 600) || (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
          const scaleVal = isMobile ? 1.25 : 2;
          const originalScroll = frameContent.scrollTop;
          frameContent.scrollTop = 0;
          const visibleCanvas = await html2canvas(targetFrame, { backgroundColor: null, useCORS: true, scale: scaleVal });
          let hiddenCanvas = null;
          if (frameContent.scrollHeight > frameContent.clientHeight) {
            let saltoScroll = frameContent.clientHeight;
            let ultimoCompleto = null;
            for (const child of frameContent.children) {
              const childBottom = child.offsetTop + child.offsetHeight;
              if (childBottom <= frameContent.clientHeight) {
                ultimoCompleto = child;
              }
            }
            if (ultimoCompleto) {
              saltoScroll = ultimoCompleto.offsetTop + ultimoCompleto.offsetHeight;
            }
            frameContent.scrollTop = saltoScroll;
            hiddenCanvas = await html2canvas(targetFrame, { backgroundColor: null, useCORS: true, scale: scaleVal });
          } else {
            hiddenCanvas = visibleCanvas;
          }
          frameContent.scrollTop = originalScroll;
          const pizarronImg = new window.Image();
          pizarronImg.src = targetFrame.querySelector('.frame-img')?.src || 'pizarron.png';
          pizarronImg.onload = function() {
            const width = pizarronImg.width;
            const height = pizarronImg.height;
            const totalWidth = hiddenCanvas ? width * 2 : width;
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = totalWidth;
            finalCanvas.height = height;
            const ctx = finalCanvas.getContext('2d');
            ctx.drawImage(pizarronImg, 0, 0, width, height);
            ctx.drawImage(visibleCanvas, 0, 0, width, height);
            if (hiddenCanvas) {
              ctx.drawImage(pizarronImg, width, 0, width, height);
              ctx.drawImage(hiddenCanvas, width, 0, width, height);
            }
            finalCanvas.toBlob(function(blob) {
              const url = URL.createObjectURL(blob);
              const fname = `${(props.nombre || 'escuela').toString().replace(/[^a-z0-9\- ]/gi,'_')}_doble.jpg`;
              const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
              if (isIOS) {
                try { window.open(url, '_blank'); } catch(e){}
                setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(e){} }, 5000);
              } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = fname;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }
            }, 'image/jpeg', 0.92);
          };
        };
      }
      const volverBtn = content.querySelector('.popup-volver-btn');
      if (volverBtn) {
        volverBtn.onclick = function(ev) {
          ev.stopPropagation();
          map.closePopup();
        };
      }
    });
    markers.push(marker);
  });
  document.getElementById('counter').textContent = String(schools.length);
}

function filterSchools() {
  let filtered = getBaseFeatures();
  console.log('filterSchools llamado, allSchools:', allSchools.length);

  const gestionPrivadaBtn = document.getElementById('gestionPrivadaBtn');
const gestionPrivadaActivo = gestionPrivadaBtn ? gestionPrivadaBtn.classList.contains('activo') : false;
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const distrito = document.getElementById('filterDistrito').value;
  const localidad = document.getElementById('filterLocalidad').value;
  const sublocalidad = document.getElementById('filterSubLocalidad').value;

  if (!gestionPrivadaActivo) {
    filtered = filtered.filter(f => (f.properties.sector || '').trim() !== 'Privado');
  } else {
    filtered = filtered.filter(f => (f.properties.sector || '').trim() === 'Privado');
  }

  const levelChecks = Array.from(document.querySelectorAll('.levelCheck'));
  const selectedLevels = levelChecks.filter(cb => cb.checked).map(cb => cb.value);
  const allChecked = document.getElementById('levelAll').checked;

  const tecnicaSolo = selectedLevels.length === 1 && selectedLevels[0] === 'Técnica';
  if (!allChecked && selectedLevels.length === 0) {
    filtered = [];
  } else if (!allChecked && tecnicaSolo) {
    filtered = filtered.filter(f => (f.properties.nombre || '') === 'escuela de educacion tecnica');
  } else if (!allChecked && selectedLevels.length > 0) {
    const selectedNorms = selectedLevels.map(l => normalizeStr(l));
    filtered = filtered.filter(f => {
      const n = normalizeStr(f.properties.nivel || '');
      const torg = (f.properties.tipo_organizacion || '');
      const tecnAgraSel = normalizeStr('Técnicas y Agrarias');
      const adultosSel = normalizeStr('ADULTOS');
      const jardinMatSel = normalizeStr('JARDIN MATERNAL');
      const agrariaName = (f.properties.nombre || '').includes('ESCUELA DE EDUCACIÓN SECUNDARIA AGRARIA');
      const nombreVal = (f.properties.nombre || '');
      const adultosName = nombreVal.includes('adultos') || nombreVal.includes('Adultos') || nombreVal.includes('ADULTOS');
      const jmName = nombreVal.includes('JARDÍN MATERNAL') || nombreVal.includes('JARDIN MATERNAL') || nombreVal.includes('Jardín Maternal') || nombreVal.includes('Jardin Maternal');
      const inicialSel = normalizeStr('Nivel Inicial');
      return selectedNorms.some(l => {
        if (adultosName) { return l === adultosSel; }
        if (agrariaName) { return l === tecnAgraSel; }
        if (l === jardinMatSel) { return jmName; }
        if (l === 'artistica') { return n.includes('artistica') || n.includes('ciclo medio'); }
        if (l === tecnAgraSel) {
          return torg === 'ESCUELA DE EDUCACIÓN SECUNDARIA TÉCNICA' || torg === 'ESCUELA DE EDUCACIÓN SECUNDARIA AGRARIA' || (f.properties.nivel || '') === 'AGRARIA' || n === 'centro de educacion agraria';
        }
        if (l === inicialSel) { return n.includes(l) && !jmName; }
        return n.includes(l);
      });
    });
  }

  if (distrito) {
    filtered = filtered.filter(f => (f.properties.distrito || '') === distrito);
  }
  if (localidad) {
    const locSel = localidad.trim().toLowerCase();
    if (locSel === 'casco urbano') {
      filtered = filtered.filter(f => (f.properties.localidad_norm || '').trim().toLowerCase() === 'la plata');
    } else {
      filtered = filtered.filter(f => (f.properties.localidad_norm || '').trim().toLowerCase() === locSel);
    }
  }
  if (sublocalidad && distrito === 'La Plata') {
    filtered = filtered.filter(f => (f.properties.localidad_norm || '').trim().toLowerCase() === sublocalidad.trim().toLowerCase());
  }
  if (search) {
    filtered = filtered.filter(f => {
      const props = f.properties;
      return (
        (props.nombre || '').toLowerCase().includes(search) ||
        (props.numero || '').toLowerCase().includes(search) ||
        (props.nivel || '').toLowerCase().includes(search) ||
        (props.localidad || '').toLowerCase().includes(search) ||
        (props.localidad_norm || '').toLowerCase().includes(search)
      );
    });
  }
  // 'Todos los niveles' incluye absolutamente todos los puntos
  console.log('render desde filterSchools, cantidad:', filtered.length, filtered.slice(0,3));
  const counterEl = document.getElementById('counter');
  if (counterEl) counterEl.textContent = String(filtered.length);
  updateLevelsBadgeCount();
  if (editModeActive) {
    clearMarkers();
    limpiarEditMarkers();
    renderEditMarkers(filtered);
  } else {
    renderMarkers(filtered);
  }
}

function filtrarEditMarkers() { filterSchools(); }
function actualizarPanelLocalidades() { actualizarFiltros(); }

fetch('camposfiltrados.geojson')
  .then(async response => {
    const tryBackup = async () => {
      try {
        const res2 = await fetch('buckupgeojson/camposfiltrados.geojson', { cache: 'no-store' });
        if (!res2.ok) return { features: [] };
        const text2 = await res2.text();
        try { return JSON.parse(text2); } catch(_) { return { features: [] }; }
      } catch(_) { return { features: [] }; }
    };
    if (!response.ok) {
      return await tryBackup();
    }
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(_) { data = await tryBackup(); }
    if (!data || !data.features) data = { features: [] };
    return data;
  })
  .then(data => {
    console.log('GeoJSON cargado, features:', data.features.length, data.features.slice(0,3));
    allSchools = data.features.map(function(f){
      const p = f.properties || {};
      p.localidad_norm = normalizeLocalidadName(p.localidad || '');
      f.properties = p;
      return f;
    });
    const nivelesUnicos = Array.from(new Set(data.features.map(e => (e.properties.nivel || '').trim()))).filter(n => n);
    const nivelesLower = new Set(nivelesUnicos.map(n => normalizeStr(n)));
    const nivelesFiltrados = nivelesUnicos.filter(n => {
      const nn = normalizeStr(n);
      if (nn.includes('psicologia comunitaria y pedagogia social')) return false;
      return nn !== 'ciclo medio' && nn !== 'centro de educacion agricola' && nn !== 'centro de educacion agraria' && nn !== 'agraria' && nn !== 'modalidad: psicologia comunitaria y pedagogia social' && nn !== 'nivenl secundario';
    });
    if (!nivelesLower.has(normalizeStr('Artística'))) { nivelesFiltrados.push('Artística'); }
    if (!nivelesLower.has(normalizeStr('Técnicas y Agrarias'))) { nivelesFiltrados.push('Técnicas y Agrarias'); }
    if (!nivelesLower.has(normalizeStr('ADULTOS'))) { nivelesFiltrados.push('ADULTOS'); }
    if (!nivelesLower.has(normalizeStr('JARDIN MATERNAL'))) { nivelesFiltrados.push('JARDIN MATERNAL'); }
    const orden = [
      'NIVEL INICIAL',
      'JARDIN MATERNAL',
      'NIVEL PRIMARIO',
      'NIVEL SECUNDARIO',
      'TÉCNICAS Y AGRARIAS',
      'ARTÍSTICA',
      'FORMACIÓN INTEGRAL',
      'ADULTOS',
      'EDUCACIÓN FÍSICA (C.E.F.)',
      'NIVEL SUPERIOR',
      'FORMACIÓN PROFESIONAL'
    ];
    const ordenMap = new Map(orden.map((n, i) => [normalizeStr(n), i]));
    nivelesFiltrados.sort((a, b) => {
      const ia = ordenMap.has(normalizeStr(a)) ? ordenMap.get(normalizeStr(a)) : Number.MAX_SAFE_INTEGER;
      const ib = ordenMap.has(normalizeStr(b)) ? ordenMap.get(normalizeStr(b)) : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return normalizeStr(a).localeCompare(normalizeStr(b));
    });
    const panelContent = document.getElementById('panelContent');
    panelContent.innerHTML = '';
    const allLabel = document.createElement('label');
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.id = 'levelAll';
    allCheckbox.checked = true;
    allLabel.appendChild(allCheckbox);
    allLabel.appendChild(document.createTextNode(' Todos los niveles'));
    panelContent.appendChild(allLabel);
    nivelesFiltrados.forEach(nivel => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'levelCheck';
      cb.value = nivel;
      cb.checked = true;
      const color = getColorByLevel(nivel);
      label.style.borderLeft = `12px solid ${color}`;
      label.style.paddingLeft = '8px';
      label.appendChild(cb);
      const normNivel = normalizeStr(nivel);
      const displayName = (normNivel === normalizeStr('PLAN FINES (TRAYECTOS Y DEUDORES)')) ? 'FINES' : nivel.toUpperCase();
      label.appendChild(document.createTextNode(' ' + displayName));
      panelContent.appendChild(label);
    });
    setTimeout(() => {
      console.log('Ejecutando actualizarCheckboxesNivel tras crear checkboxes');
      actualizarCheckboxesNivel();
    }, 0);

function actualizarCheckboxesNivel() {
  const allCheckbox = document.getElementById('levelAll');
  const levelChecks = Array.from(document.querySelectorAll('.levelCheck'));

  allCheckbox.addEventListener('change', function() {
    levelChecks.forEach(cb => cb.checked = allCheckbox.checked);
    filterSchools();
    updateLevelsBadgeCount();
  });

  levelChecks.forEach(cb => {
    cb.addEventListener('change', function(e) {
      e.stopPropagation();
      if (!cb.checked) {
        allCheckbox.checked = false;
      } else if (levelChecks.every(c => c.checked)) {
        allCheckbox.checked = true;
      }
      filterSchools();
      updateLevelsBadgeCount();
  });
});

// edición de coordenadas deshabilitada: solo visualización
}

const distritoSelect = document.getElementById('filterDistrito');
distritoSelect && document.getElementById('boundariesLocalOnlyToggle') && document.getElementById('boundariesLocalOnlyToggle').addEventListener('change', () => {
  boundariesLocalOnly = document.getElementById('boundariesLocalOnlyToggle').checked;
  if (distritoSelect.value === 'La Plata' && boundariesLocalOnly) {
    localityBoundariesLoaded = false;
    addLocalityBoundariesLaPlata();
  }
});
document.getElementById('toggleBoundariesVisibilityBtn') && document.getElementById('toggleBoundariesVisibilityBtn').addEventListener('click', ()=>{
  setBoundariesHidden(!boundariesHidden);
});
const locSelect = document.getElementById('filterLocalidad');

function actualizarFiltros() {
  const distrito = distritoSelect.value;
  locSelect.innerHTML = '';
  locSelect.style.display = 'none';

  if (!distrito) {
    return;
  }

  if (distrito === 'La Plata') {
    const localidadesSet = new Set();
    let tieneCascoUrbano = false;
    getBaseFeatures().forEach(f => {
      const props = f.properties || {};
      if (props.distrito === 'La Plata') {
        const locNorm = (props.localidad_norm || '').trim().toLowerCase();
        if (locNorm === 'la plata') {
          tieneCascoUrbano = true;
        } else if (props.localidad_norm && locNorm !== 'la plata') {
          localidadesSet.add(props.localidad_norm.trim());
        }
      }
    });
    localidadesSet.add('ALTOS DE SAN LORENZO');
    localidadesSet.add('Gorina');
    if (localidadesSet.size > 0 || tieneCascoUrbano) {
      const todasLocOption = document.createElement('option');
      todasLocOption.value = '';
      todasLocOption.textContent = 'Todas las localidades';
      locSelect.appendChild(todasLocOption);
      if (tieneCascoUrbano) {
        const cascoOption = document.createElement('option');
        cascoOption.value = 'CASCO URBANO';
        cascoOption.textContent = 'CASCO URBANO';
        locSelect.appendChild(cascoOption);
      }
      Array.from(localidadesSet).sort().forEach(loc => {
        const locNorm = loc.trim().toLowerCase();
        if (locNorm !== 'la plata') {
          const opt = document.createElement('option');
          if (locNorm === 'san carlos') {
            opt.value = 'SAN CARLOS';
            opt.textContent = 'SAN CARLOS';
          } else {
            opt.value = loc;
            opt.textContent = loc;
          }
          locSelect.appendChild(opt);
        }
      });
      locSelect.style.display = '';
    } else {
      locSelect.innerHTML = '';
      locSelect.style.display = 'none';
    }
  } else if (distrito === 'Berisso' || distrito === 'Ensenada') {
    locSelect.innerHTML = '';
    locSelect.style.display = 'none';
  }
}

distritoSelect.addEventListener('change', () => {
  actualizarFiltros();
  filterSchools();
  clearRailways();
  updateDisplayForSelectedDistrict();
  if (distritoSelect.value === 'La Plata') {
    setTimeout(() => { addLocalityBoundariesLaPlata(); }, 600);
  }
});


async function tryLoadLocalBoundaryLines(){
  async function loadFrom(path){ try{ const res = await fetch(path, { cache:'no-store' }); if(!res.ok) return false; const gj = await res.json(); const feats = Array.isArray(gj.features)? gj.features : []; let found=false; feats.forEach(f=>{ const g=f&&f.geometry; if(g && g.type==='LineString' && Array.isArray(g.coordinates)){ const latlngs = g.coordinates.map(c=>[c[1],c[0]]); const layer = L.polyline(latlngs, styleRailway()).addTo(map); railwayLayers.push(layer); found=true; } }); return found; }catch(e){ return false; } }
  const okRoot = await loadFrom('localidades_limites_lineas.geojson');
  if (okRoot) return true;
  const okBackup = await loadFrom('buckupgeojson/localidades_limites_lineas.geojson');
  return !!okBackup;
}
locSelect.addEventListener('change', filterSchools);
actualizarFiltros();
    console.log('Llamando render inicial, modo edición:', editModeActive);
    if (!editModeActive) {
      renderMarkers(allSchools);
    }
    document.getElementById('levelAll').checked = true;
    Array.from(document.querySelectorAll('.levelCheck')).forEach(cb => cb.checked = true);
  console.log('Llamando filterSchools tras inicialización');
  filterSchools();


    const panel = document.getElementById('filterLevelPanel');
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragMoved = false;
    let downX = 0;
    let downY = 0;
    panel.style.position = 'fixed';
    (function(){
      try{
        const admin = document.getElementById('admin-panel');
        const rect = admin ? admin.getBoundingClientRect() : null;
        const safeTop = rect ? (rect.bottom + 8) : 60;
        panel.style.top = safeTop + 'px';
      }catch(e){ panel.style.top = '60px'; }
    })();
    panel.style.left = '20px';
    panel.style.zIndex = 1000;
    const dragBtn = document.getElementById('togglePanelBtn');
    dragBtn.style.cursor = 'grab';
    dragBtn.addEventListener('mousedown', function(e) {
      const w = window.innerWidth || 1024;
      const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
      if (panel.classList.contains('collapsed')) { return; }
      isDragging = true;
      dragMoved = false;
      downX = e.clientX;
      downY = e.clientY;
      dragOffsetX = e.clientX - panel.offsetLeft;
      dragOffsetY = e.clientY - panel.offsetTop;
      dragBtn.style.cursor = 'grabbing';
      if (w <= 600 && isLandscape) { panel.style.right = ''; }
    });
    dragBtn.addEventListener('touchstart', function(e) {
      const t = e.touches && e.touches[0];
      if (!t) return;
      const w = window.innerWidth || 1024;
      const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
      if (panel.classList.contains('collapsed')) { return; }
      isDragging = true;
      dragMoved = false;
      downX = t.clientX;
      downY = t.clientY;
      dragOffsetX = t.clientX - panel.offsetLeft;
      dragOffsetY = t.clientY - panel.offsetTop;
      if (w <= 600 && isLandscape) { panel.style.right = ''; }
    }, { passive: true });
    panel.addEventListener('mousedown', function(e) {
      const w = window.innerWidth || 1024;
      if (w <= 600) return;
      if (panel.classList.contains('collapsed')) return;
      if (e.button !== 0) return;
      const threshold = 20;
      const nearCorner = (e.offsetX >= panel.clientWidth - threshold) && (e.offsetY >= panel.clientHeight - threshold);
      if (nearCorner) return;
      if (!e.target.classList.contains('levelCheck')) {
        isDragging = true;
        dragOffsetX = e.clientX - panel.offsetLeft;
        dragOffsetY = e.clientY - panel.offsetTop;
      }
    });
    panel.addEventListener('touchstart', function(e) {
      isDragging = false;
    }, { passive: true });
    const pcTouch = document.getElementById('panelContent');
    if (pcTouch) {
      pcTouch.addEventListener('touchstart', function(){ isDragging = false; }, { passive: true });
      pcTouch.addEventListener('wheel', function(ev){ ev.stopPropagation(); }, { passive: false });
    }
    document.addEventListener('mousemove', function(e) {
      if (isDragging) {
        if (panel.classList.contains('collapsed')) { isDragging = false; return; }
        if (!dragMoved && (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 4)) {
          dragMoved = true;
        }
        const topbar = document.getElementById('topbar');
        const th = topbar ? (topbar.offsetHeight||0) : 0;
        const vw = window.innerWidth || 1024;
        const vh = window.innerHeight || 768;
        const newL = e.clientX - dragOffsetX;
        const newT = e.clientY - dragOffsetY;
        const minL = 8;
        const admin = document.getElementById('admin-panel');
        const aRect = admin ? admin.getBoundingClientRect() : null;
        const safeTop = aRect ? Math.max(8, aRect.bottom + 8) : 8;
        const minT = (vw <= 600) ? (th + 8) : safeTop;
        const maxL = Math.max(8, vw - panel.offsetWidth - 8);
        const maxT = Math.max(8, vh - panel.offsetHeight - 8);
        panel.style.left = Math.min(Math.max(newL, minL), maxL) + 'px';
        panel.style.top = Math.min(Math.max(newT, minT), maxT) + 'px';
      }
    });
    document.addEventListener('touchmove', function(e) {
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (isDragging) {
        if (panel.classList.contains('collapsed')) { isDragging = false; return; }
        e.preventDefault();
        if (!dragMoved && (Math.abs(t.clientX - downX) + Math.abs(t.clientY - downY) > 4)) {
          dragMoved = true;
        }
        const topbar = document.getElementById('topbar');
        const th = topbar ? (topbar.offsetHeight||0) : 0;
        const vw = window.innerWidth || 1024;
        const vh = window.innerHeight || 768;
        const newL = t.clientX - dragOffsetX;
        const newT = t.clientY - dragOffsetY;
        const minL = 8;
        const minT = (vw <= 600) ? (th + 8) : 8;
        const maxL = Math.max(8, vw - panel.offsetWidth - 8);
        const maxT = Math.max(8, vh - panel.offsetHeight - 8);
        panel.style.left = Math.min(Math.max(newL, minL), maxL) + 'px';
        panel.style.top = Math.min(Math.max(newT, minT), maxT) + 'px';
      }
    }, { passive: false });
    document.addEventListener('mouseup', function() {
      isDragging = false;
      dragBtn.style.cursor = 'grab';
    });
    document.addEventListener('touchend', function() {
      isDragging = false;
      dragBtn.style.cursor = 'grab';
    }, { passive: true });
    let panelCollapsed = false;
    dragBtn.addEventListener('click', function(e) {
      if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; return; }
      if (!panelCollapsed) {
        panelCollapsed = true;
        panelContent.style.display = 'none';
        panel.classList.add('collapsed');
        isDragging = false;
        try { const rz = document.getElementById('panelResizer'); if (rz) rz.style.display = 'none'; } catch(_){ }
        if ((window.innerWidth || 1024) <= 600) { panel.style.display = 'none'; }
        panel.dataset.prevWidth = panel.style.width;
        panel.dataset.prevMinWidth = panel.style.minWidth;
        panel.dataset.prevMinHeight = panel.style.minHeight;
        panel.dataset.prevResize = panel.style.resize;
        panel.dataset.prevPadding = panel.style.padding;
        panel.dataset.prevBackground = panel.style.background;
        panel.dataset.prevBoxShadow = panel.style.boxShadow;
        panel.dataset.prevTextAlign = panel.style.textAlign;
        panel.dataset.prevBorder = panel.style.border;
        panel.dataset.prevBtnFloat = dragBtn.style.float;
        panel.dataset.prevBtnMargin = dragBtn.style.margin;
        var btnW = dragBtn.offsetWidth || 120;
        var btnH = dragBtn.offsetHeight || 32;
        panel.style.width = (btnW + 16) + 'px';
        panel.style.minWidth = (btnW + 16) + 'px';
        panel.style.minHeight = (btnH + 12) + 'px';
        panel.style.resize = 'none';
        panel.style.background = 'transparent';
        panel.style.boxShadow = 'none';
        panel.style.border = 'none';
        panel.style.padding = '6px 8px';
        panel.style.textAlign = 'center';
        dragBtn.style.float = 'none';
        dragBtn.style.margin = '2px 0';
        panel.style.transition = 'width 0.15s ease, height 0.15s ease, padding 0.15s ease';
      } else {
        panelCollapsed = false;
        panel.style.display = '';
        panelContent.style.display = 'block';
        panel.classList.remove('collapsed');
        isDragging = false;
        try { const rz = document.getElementById('panelResizer'); if (rz) rz.style.display = ''; } catch(_){ }
        panel.style.width = panel.dataset.prevWidth || '';
        panel.style.minWidth = panel.dataset.prevMinWidth || '';
        panel.style.minHeight = panel.dataset.prevMinHeight || '';
        panel.style.resize = panel.dataset.prevResize || '';
        panel.style.background = panel.dataset.prevBackground || '';
        panel.style.boxShadow = panel.dataset.prevBoxShadow || '';
        panel.style.padding = panel.dataset.prevPadding || '';
        panel.style.textAlign = panel.dataset.prevTextAlign || '';
        panel.style.border = panel.dataset.prevBorder || '';
        dragBtn.style.float = panel.dataset.prevBtnFloat || '';
        dragBtn.style.margin = panel.dataset.prevBtnMargin || '';
      }
    });

    const resizer = document.getElementById('panelResizer');
    let resizing = false;
    let startW = 0, startH = 0, startX = 0, startY = 0;
    function clampPanelSize(w,h){
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const minW = 140, minH = 100;
      const maxW = Math.max(180, vw - 32);
      const maxH = Math.max(140, vh - 32);
      return { w: Math.min(Math.max(w, minW), maxW), h: Math.min(Math.max(h, minH), maxH) };
    }
    function onResizeMove(cx, cy){
      const dW = cx - startX; const dH = cy - startY;
      const target = clampPanelSize(startW + dW, startH + dH);
      panel.style.width = target.w + 'px';
      panel.style.height = target.h + 'px';
    }
    if (resizer){
      resizer.addEventListener('mousedown', function(e){ resizing = true; startX = e.clientX; startY = e.clientY; startW = panel.offsetWidth; startH = panel.offsetHeight; e.preventDefault(); });
      document.addEventListener('mousemove', function(e){ if(resizing){ onResizeMove(e.clientX, e.clientY); } });
      document.addEventListener('mouseup', function(){ resizing = false; });
      resizer.addEventListener('touchstart', function(e){ const t=e.touches&&e.touches[0]; if(!t) return; resizing=true; startX=t.clientX; startY=t.clientY; startW=panel.offsetWidth; startH=panel.offsetHeight; }, { passive:true });
      document.addEventListener('touchmove', function(e){ const t=e.touches&&e.touches[0]; if(!t) return; if(resizing){ e.preventDefault(); onResizeMove(t.clientX, t.clientY); } }, { passive:false });
      document.addEventListener('touchend', function(){ resizing=false; }, { passive:true });
    }

    if ((window.innerWidth || 1024) <= 600) {
      setTimeout(function(){ try { dragBtn.click(); } catch(e){} }, 0);
    }

    const mapEl = document.getElementById('map');
  if (mapEl){
    function collapseOnMap(){
      const w = window.innerWidth || 1024;
      if (w <= 600){
        if (panelContent && panelContent.style.display !== 'none' && !window.panelDocked) {
          if (!panelCollapsed) { dragBtn.click(); }
        }
        const admin = document.getElementById('admin-panel');
        if (admin && window.adminPanelOpen && !window.keepAdminVisible) {
          window.adminPanelOpen = false;
          admin.style.display = 'none';
        }
      }
    }
      mapEl.addEventListener('click', collapseOnMap);
      mapEl.addEventListener('touchstart', collapseOnMap, { passive: true });
    }

  });

document.getElementById('searchInput').addEventListener('input', filterSchools);

function applyMobilePanelPosition(){
  const panel = document.getElementById('filterLevelPanel');
  if (!panel) return;
  const panelContent = document.getElementById('panelContent');
  const resizer = document.getElementById('panelResizer');
  const topbar = document.getElementById('topbar');
  const th = topbar ? topbar.offsetHeight : 0;
  const w = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
  const sizeMode = panel.dataset.sizeMode === 'expanded' ? 'expanded' : 'compact';
  panel.style.top = (th + 8) + 'px';
  const isCollapsed = panelContent && panelContent.style.display === 'none';
  panel.classList.toggle('collapsed', !!isCollapsed);
  if (resizer) resizer.style.display = isCollapsed ? 'none' : '';
  if (isLandscape) {
    panel.style.left = '8px';
    panel.style.right = '';
    if (!isCollapsed) {
      if (sizeMode === 'expanded') {
        panel.style.minWidth = '50vw';
        panel.style.width = '75vw';
        panel.style.maxWidth = '95vw';
      } else {
        panel.style.minWidth = '36vw';
        panel.style.width = '52vw';
        panel.style.maxWidth = '88vw';
      }
      const targetH = Math.max(140, vh - (th + 16));
      const usedH = sizeMode === 'expanded' ? Math.round(vh * 0.62) : Math.round(vh * 0.5);
      const finalH = Math.min(targetH, usedH);
      panel.style.maxHeight = targetH + 'px';
      panel.style.height = finalH + 'px';
      panel.style.overflow = 'hidden';
      panel.style.resize = 'both';
      if (panelContent) {
        const headerH = (document.getElementById('togglePanelBtn')?.offsetHeight || 32) + (document.getElementById('dockPanelBtn')?.offsetHeight || 28) + 16;
        const contentMax = Math.max(120, finalH - headerH);
        panelContent.style.maxHeight = contentMax + 'px';
        panelContent.style.overflowY = 'auto';
      }
    }
    if (resizer) resizer.style.display = '';
  } else {
    panel.style.left = 'auto';
    panel.style.right = '8px';
    if (!isCollapsed) {
      if (sizeMode === 'expanded') {
        panel.style.minWidth = '80vw';
        panel.style.width = '90vw';
        panel.style.maxWidth = '98vw';
        panel.style.maxHeight = '80vh';
        panel.style.height = '56vh';
      } else {
        panel.style.minWidth = '70vw';
        panel.style.width = '80vw';
        panel.style.maxWidth = '98vw';
        panel.style.maxHeight = '60vh';
        panel.style.height = '52vh';
      }
      panel.style.overflowY = 'scroll';
      panel.style.resize = 'vertical';
    }
    if (resizer) resizer.style.display = isCollapsed ? 'none' : '';
  }
}

function applyFixedUI(){
  const topbar = document.getElementById('topbar');
  const admin = document.getElementById('admin-panel');
  const mapEl = document.getElementById('map');
  if (!topbar || !mapEl) return;
  topbar.style.position = 'fixed';
  topbar.style.left = '0';
  topbar.style.right = '0';
  topbar.style.top = '0';
  topbar.style.zIndex = '1005';
  if (admin) admin.style.zIndex = '1006';
}

function updateTopbarHeightVar(){
  const tb = document.getElementById('topbar');
  if (!tb) return;
  const h = tb.offsetHeight || 48;
  try { tb.style.setProperty('--topbar-h', h + 'px'); } catch(e){}
  try { document.documentElement.style.setProperty('--topbar-h', h + 'px'); } catch(e){}
}

function updateBrandSizeByIcon(){
  const topbar = document.getElementById('topbar');
  if (!topbar) return;
  const w = window.innerWidth || 1024;
  if (w <= 600) return;
  const icons = Array.from(topbar.querySelectorAll('.icon-btn'));
  let iconH = 0;
  for (let i = 0; i < icons.length; i++){
    const h = icons[i].offsetHeight || 0;
    if (h > 0) { iconH = h; break; }
  }
  if (iconH <= 0) iconH = 28;
  const brandPx = Math.round(iconH * 1.15);
  topbar.style.setProperty('--icon-size', iconH + 'px');
  topbar.style.setProperty('--brand-size', brandPx + 'px');
}

window.addEventListener('resize', function(){ try{ map.invalidateSize(); }catch(e){} applyFixedUI(); applyMobilePanelPosition(); updateTopbarHeightVar(); updateBrandSizeByIcon(); });
window.addEventListener('orientationchange', function(){ setTimeout(function(){ try{ map.invalidateSize(); }catch(e){} applyFixedUI(); applyMobilePanelPosition(); updateTopbarHeightVar(); updateBrandSizeByIcon(); }, 200); });
applyFixedUI();
applyMobilePanelPosition();
updateTopbarHeightVar();
updateBrandSizeByIcon();
try{ map.invalidateSize(); }catch(e){}

window.panelDocked = false;
window.keepAdminVisible = false;
function dockPanel(){
  const panel = document.getElementById('filterLevelPanel');
  const resizer = document.getElementById('panelResizer');
  const admin = document.getElementById('admin-panel');
  if (!panel || !admin) return;
  window.panelDocked = true;
  if (resizer) resizer.style.display = (document.getElementById('panelContent')?.style.display === 'none') ? 'none' : '';
  const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
  const w = window.innerWidth || 1024;
  if (isLandscape) {
    const topbar = document.getElementById('topbar');
    const th = topbar ? (topbar.offsetHeight||48) : 48;
    panel.style.position = 'fixed';
    panel.style.top = (th + 4) + 'px';
    panel.style.left = '8px';
    panel.style.right = '';
    panel.style.zIndex = '1006';
    panel.style.width = '52vw';
    panel.style.minWidth = '36vw';
    panel.style.maxWidth = '88vw';
    panel.style.height = '';
    panel.style.maxHeight = '60vh';
    const pc = document.getElementById('panelContent');
    if (!(pc && pc.style.display === 'none')) { panel.style.overflowY = 'scroll'; } else { panel.style.overflow = 'hidden'; }
    panel.style.resize = 'both';
    if (resizer) resizer.style.display = (pc && pc.style.display === 'none') ? 'none' : '';
  } else {
    panel.style.position = 'relative';
    panel.style.top = '';
    panel.style.left = '';
    panel.style.right = '';
    panel.style.zIndex = '1003';
    panel.style.width = 'auto';
    panel.style.minWidth = 'auto';
    panel.style.maxWidth = '100%';
    panel.style.height = '';
    panel.style.maxHeight = 'none';
    admin.appendChild(panel);
  }
  const btn = document.getElementById('dockPanelBtn');
  if (btn) btn.textContent = 'Liberar panel';
}
function undockPanel(){
  const panel = document.getElementById('filterLevelPanel');
  const resizer = document.getElementById('panelResizer');
  if (!panel) return;
  window.panelDocked = false;
  if (resizer) resizer.style.display = '';
  panel.style.position = 'fixed';
  applyMobilePanelPosition();
  const btn = document.getElementById('dockPanelBtn');
  if (btn) btn.textContent = 'Fijar arriba';
}
const dockBtn = document.getElementById('dockPanelBtn');
if (dockBtn){
  dockBtn.addEventListener('click', function(){ if (!window.panelDocked) { dockPanel(); } else { undockPanel(); } });
}

// Drag-resize con Pointer Events desde la esquina superior derecha
(function(){
  const resizer = document.getElementById('panelResizer');
  const panel = document.getElementById('filterLevelPanel');
  if (!resizer || !panel) return;
  let resizing = false;
  let startX = 0, startY = 0, startW = 0, startH = 0;
  function startResize(e){
    const rect = panel.getBoundingClientRect();
    resizing = true;
    startX = e.clientX; startY = e.clientY;
    startW = rect.width; startH = rect.height;
    document.body.style.userSelect = 'none';
    resizer.setPointerCapture(e.pointerId);
  }
  function doResize(e){
    if (!resizing) return;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
    const minW = Math.max(240, Math.round(vw * (isLandscape ? 0.36 : 0.7)));
    const maxW = Math.round(vw * 0.95);
    const th = (document.getElementById('topbar')?.offsetHeight || 48);
    const maxH = Math.round(vh * 0.85) - th;
    const newW = Math.min(Math.max(startW + dx, minW), maxW);
    const newH = Math.min(Math.max(startH + dy, 140), Math.max(140, maxH));
    panel.style.width = newW + 'px';
    panel.style.height = newH + 'px';
    if (!panel.classList.contains('collapsed')) { panel.style.overflowY = 'scroll'; }
  }
  function endResize(e){
    resizing = false;
    document.body.style.userSelect = '';
    try { resizer.releasePointerCapture(e.pointerId); } catch(_){}
  }
  resizer.addEventListener('pointerdown', function(e){ e.preventDefault(); startResize(e); });
  resizer.addEventListener('pointermove', function(e){ if (resizing) { e.preventDefault(); doResize(e); } });
  resizer.addEventListener('pointerup', function(e){ if (resizing) endResize(e); });
  resizer.addEventListener('pointercancel', function(e){ if (resizing) endResize(e); });
})();

function applyAdminPanelMobile(){
  const admin = document.getElementById('admin-panel');
  const topbar = document.getElementById('topbar');
  const filtersBtn = document.getElementById('filtersBtn');
  const filtersHeaderBtn = document.getElementById('filtersHeaderBtn');
  const levelsHeaderBtn = document.getElementById('levelsHeaderBtn');
  const editModeBtn = document.getElementById('geojsonEditModeBtn');
  const editHeaderBtn = document.getElementById('editHeaderBtn');
  if (!admin || !topbar || !filtersBtn) return;
  const w = window.innerWidth || 1024;
  const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
  if (w <= 600){
    if (isLandscape){
      filtersBtn.style.display = 'none';
      if (levelsHeaderBtn) levelsHeaderBtn.style.display = '';
      if (typeof window.adminPanelOpen === 'undefined') window.adminPanelOpen = false;
      admin.style.display = (window.keepAdminVisible || window.adminPanelOpen) ? '' : 'none';
      admin.style.position = 'fixed';
      const th = topbar.offsetHeight || 28;
      admin.style.top = (th + 4) + 'px';
      admin.style.left = '0';
      admin.style.right = '0';
      admin.style.zIndex = '1006';
      admin.style.maxHeight = '60vh';
      admin.style.overflowY = 'auto';
      if (filtersHeaderBtn) filtersHeaderBtn.style.display = '';
      if (editModeBtn) editModeBtn.style.display = 'none';
      if (editHeaderBtn) editHeaderBtn.style.display = 'none';
      filtersBtn.onclick = null;
      if (!window.panelDocked) { dockPanel(); }
      const pc = document.getElementById('panelContent');
      if (pc && pc.style.display !== 'none') {
        const tb = document.getElementById('togglePanelBtn');
        if (tb) tb.click();
      }
    } else {
      filtersBtn.style.display = 'none';
      if (levelsHeaderBtn) { levelsHeaderBtn.style.display = ''; }
      if (filtersHeaderBtn) { filtersHeaderBtn.style.display = ''; }
      if (typeof window.adminPanelOpen === 'undefined') window.adminPanelOpen = false;
      admin.style.display = (window.keepAdminVisible || window.adminPanelOpen) ? '' : 'none';
      admin.style.position = 'fixed';
      const th = topbar.offsetHeight || 48;
      admin.style.top = (th + 4) + 'px';
      admin.style.left = '0';
      admin.style.right = '0';
      admin.style.zIndex = '1006';
      admin.style.maxHeight = '60vh';
      admin.style.overflowY = 'auto';
      filtersBtn.onclick = function(){ window.adminPanelOpen = !window.adminPanelOpen; admin.style.display = window.adminPanelOpen ? '' : 'none'; };
      if (editModeBtn) editModeBtn.style.display = 'none';
      if (editHeaderBtn) editHeaderBtn.style.display = 'none';
      if (filtersHeaderBtn) { filtersHeaderBtn.style.display = 'none'; filtersHeaderBtn.onclick = null; }
      if (window.panelDocked) { undockPanel(); }
    }
  } else {
    filtersBtn.style.display = 'none';
    if (levelsHeaderBtn) { levelsHeaderBtn.style.display = 'none'; levelsHeaderBtn.onclick = null; }
    admin.style.display = '';
    admin.style.position = 'relative';
    admin.style.top = '';
    admin.style.left = '';
    admin.style.right = '';
    admin.style.maxHeight = '';
    admin.style.overflow = '';
    filtersBtn.onclick = null;
    if (filtersHeaderBtn) { filtersHeaderBtn.style.display = 'none'; filtersHeaderBtn.onclick = null; }
  }
}

applyAdminPanelMobile();
updateTopbarHeightVar();
updateBrandSizeByIcon();
window.addEventListener('resize', function(){ applyAdminPanelMobile(); updateTopbarHeightVar(); updateBrandSizeByIcon(); });
window.addEventListener('orientationchange', function(){ setTimeout(function(){ applyAdminPanelMobile(); updateTopbarHeightVar(); updateBrandSizeByIcon(); }, 200); });

// Mantener abierto el panel al enfocar la barra de búsqueda en móvil
const searchInputEl = document.getElementById('searchInput');
if (searchInputEl){
  searchInputEl.addEventListener('focus', function(){
    const admin = document.getElementById('admin-panel');
    const w = window.innerWidth || 1024;
    window.adminPanelOpen = true;
    window.keepAdminVisible = true;
    if (admin) admin.style.display = '';
  });
  searchInputEl.addEventListener('blur', function(){
    window.keepAdminVisible = false;
  });
}

// No cambiar texto del botón de límites; solo actualizar el título
function setBoundariesHiddenTitle(){
  const btn = document.getElementById('toggleBoundariesVisibilityBtn');
  if (!btn) return;
  const title = (window.boundariesHidden ? 'Mostrar límites' : 'Ocultar límites');
  btn.title = title;
}
setBoundariesHiddenTitle();

const levelsHeaderBtn = document.getElementById('levelsHeaderBtn');
if (levelsHeaderBtn){
  levelsHeaderBtn.addEventListener('click', function(){
    const admin = document.getElementById('admin-panel');
    const w = window.innerWidth || 1024;
    if (w <= 600) {
      if (typeof window.adminPanelOpen === 'undefined') window.adminPanelOpen = false;
      if (!window.adminPanelOpen) {
        window.adminPanelOpen = true;
        if (admin) admin.style.display = '';
      }
      if (!window.panelDocked) { try { dockPanel(); } catch(e){} }
    }
    const tb = document.getElementById('togglePanelBtn');
    if (tb) tb.click();
    const resizer = document.getElementById('panelResizer');
    const panel = document.getElementById('filterLevelPanel');
    const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
    if (resizer) resizer.style.display = '';
    if (panel) panel.style.resize = isLandscape ? 'both' : 'vertical';
  });
}

const editHeaderBtn = document.getElementById('editHeaderBtn');
if (editHeaderBtn){
  editHeaderBtn.addEventListener('click', function(){
    const geoBtn = document.getElementById('geojsonEditModeBtn');
    if (geoBtn) geoBtn.click();
  });
}

const filtersHeaderBtn = document.getElementById('filtersHeaderBtn');
if (filtersHeaderBtn){
  filtersHeaderBtn.addEventListener('click', function(){
    const admin = document.getElementById('admin-panel');
    if (!admin) return;
    if (typeof window.adminPanelOpen === 'undefined') window.adminPanelOpen = false;
    window.adminPanelOpen = !window.adminPanelOpen;
    admin.style.display = window.adminPanelOpen ? '' : 'none';
  });
}

const levelsHeaderBtnEl = document.getElementById('levelsHeaderBtn');
if (levelsHeaderBtnEl){
  levelsHeaderBtnEl.addEventListener('click', function(){
    const tb = document.getElementById('togglePanelBtn');
    const panel = document.getElementById('filterLevelPanel');
    const pc = document.getElementById('panelContent');
    if (panel && window.panelDocked) { undockPanel(); }
    if (panel) { panel.style.display = ''; }
    if (pc) { pc.style.display = 'block'; }
    const isCollapsed = pc && pc.style.display === 'none';
    if (tb && isCollapsed) { try { tb.click(); } catch(e){} }
  });
}

function updateLevelsBadgeCount(){
  const btn = document.getElementById('levelsHeaderBtn');
  if (!btn) return;
  const levelChecks = Array.from(document.querySelectorAll('.levelCheck'));
  const count = levelChecks.filter(cb => cb.checked).length;
  btn.setAttribute('data-count', String(count));
}
updateLevelsBadgeCount();

let editModeActive = false;
let editGeojsonData = null;
let editMarkers = [];
let currentEditIdx = null;
const criticalFields = new Set(['distrito','localidad','nivel','nombre','latitud','longitud']);
let lastImportedFileName = '';
const systemFields = new Set(['localidad_norm','editable_coords']);

const geojsonEditBtn = document.getElementById('geojsonEditModeBtn');
geojsonEditBtn.addEventListener('click', () => {
  if (!editModeActive) {
    activarModoEdicionGeojson();
  } else {
    salirModoEdicionGeojson();
  }
});

function activarModoEdicionGeojson() {
  editModeActive = true;
  geojsonEditBtn.textContent = 'Salir de edición GeoJSON';
  document.body.classList.add('edit-mode');
  mostrarControlesEdicion();
  clearMarkers();
  limpiarEditMarkers();
}

function salirModoEdicionGeojson() {
  editModeActive = false;
  geojsonEditBtn.textContent = 'Modo edición GeoJSON';
  ocultarControlesEdicion();
  mostrarControlesNormales();
  limpiarEditMarkers();
  filterSchools();
  document.body.classList.remove('edit-mode');
}

function mostrarControlesEdicion() {
  let globalFieldsPanel = document.getElementById('globalFieldsPanel');
  if (!globalFieldsPanel) {
    globalFieldsPanel = document.createElement('div');
    globalFieldsPanel.id = 'globalFieldsPanel';
    globalFieldsPanel.className = 'panel-flotante';
    globalFieldsPanel.style = 'position:fixed;top:260px;right:16px;z-index:1002;background:#fff;padding:10px;border-radius:8px;box-shadow:0 2px 8px #aaa;min-width:240px;max-height:320px;overflow-y:auto;display:none;';
    document.body.appendChild(globalFieldsPanel);
  } else {
    globalFieldsPanel.style.display = 'none';
    globalFieldsPanel.innerHTML = '';
  }

  if (!(editGeojsonData && editGeojsonData.features)) {
    let gestionPrivadaBtn = document.getElementById('gestionPrivadaBtn');
    if (gestionPrivadaBtn) gestionPrivadaBtn.style.display = 'none';
  }

  let importBtn = document.getElementById('importGeojsonBtn');
  if (!importBtn) {
    importBtn = document.createElement('input');
    importBtn.type = 'file';
    importBtn.id = 'importGeojsonBtn';
    importBtn.accept = '.geojson,.json';
    importBtn.style = 'position:absolute;top:90px;right:16px;z-index:1003;background:#fff;padding:4px;border-radius:6px;box-shadow:0 2px 6px #aaa;';
    importBtn.addEventListener('change', handleImportGeojson);
    document.body.appendChild(importBtn);
  } else {
    importBtn.style.display = '';
  }

  let reiniciarBtn = document.getElementById('reiniciarEditBtn');
if (!reiniciarBtn) {
  reiniciarBtn = document.createElement('button');
  reiniciarBtn.id = 'reiniciarEditBtn';
  reiniciarBtn.textContent = 'Reiniciar visualización';
  reiniciarBtn.style = 'position:absolute;top:170px;right:16px;z-index:1003;background:#2980b9;color:#fff;padding:6px 16px;border-radius:6px;box-shadow:0 2px 6px #aaa;';
  reiniciarBtn.onclick = function() {
    filtrarEditMarkers();
  };
  document.body.appendChild(reiniciarBtn);
  } else {
    reiniciarBtn.style.display = '';
  }

  // Sin botón extra para carpeta: el diálogo de guardado permite elegir carpeta en el momento.

  let addPointBtn = document.getElementById('addEditPointBtn');
  if (!addPointBtn) {
    addPointBtn = document.createElement('button');
    addPointBtn.id = 'addEditPointBtn';
    addPointBtn.textContent = 'Agregar punto';
    addPointBtn.style = 'position:absolute;top:260px;right:16px;z-index:1003;background:#8e44ad;color:#fff;padding:6px 16px;border-radius:6px;box-shadow:0 2px 6px #aaa;';
    addPointBtn.onclick = addNewEditPoint;
    document.body.appendChild(addPointBtn);
  } else {
    addPointBtn.style.display = '';
  }

let exportBtn = document.getElementById('exportGeojsonBtn');
  if (!exportBtn) {
    exportBtn = document.createElement('button');
    exportBtn.id = 'exportGeojsonBtn';
    exportBtn.textContent = 'Exportar GeoJSON';
    exportBtn.style = 'position:absolute;top:130px;right:16px;z-index:1003;background:#27ae60;color:#fff;padding:6px 16px;border-radius:6px;box-shadow:0 2px 6px #aaa;';
    exportBtn.onclick = exportEditGeojson;
    document.body.appendChild(exportBtn);
  } else {
    exportBtn.style.display = '';
  }

  let exportReplaceBtn = document.getElementById('exportReplaceBtn');
  if (!exportReplaceBtn) {
    exportReplaceBtn = document.createElement('button');
    exportReplaceBtn.id = 'exportReplaceBtn';
    exportReplaceBtn.textContent = 'Exportar y reemplazar…';
    exportReplaceBtn.style = 'position:absolute;top:130px;right:184px;z-index:1003;background:#34495e;color:#fff;padding:6px 16px;border-radius:6px;box-shadow:0 2px 6px #aaa;';
    exportReplaceBtn.onclick = exportAndReplaceInProject;
    document.body.appendChild(exportReplaceBtn);
    let exportPanel = document.getElementById('exportReplacePanel');
    if (!exportPanel) {
      exportPanel = document.createElement('div');
      exportPanel.id = 'exportReplacePanel';
      exportPanel.style = 'position:absolute;top:166px;right:184px;z-index:1004;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 2px 8px #aaa;padding:8px;display:none;';
      const btnCampos = document.createElement('button');
      btnCampos.textContent = 'Guardar como camposfiltrados.geojson';
      btnCampos.style = 'display:block;margin:4px 0;background:#2c3e50;color:#fff;padding:6px 10px;border-radius:6px;width:100%;text-align:left;';
      btnCampos.onclick = function() { exportAndReplacePreset('camposfiltrados.geojson'); };
      const btnInfo = document.createElement('button');
      btnInfo.textContent = 'Guardar como infoescuelas.geojson';
      btnInfo.style = 'display:block;margin:4px 0;background:#2c3e50;color:#fff;padding:6px 10px;border-radius:6px;width:100%;text-align:left;';
      btnInfo.onclick = function() { exportAndReplacePreset('infoescuelas.geojson'); };
      exportPanel.appendChild(btnCampos);
      exportPanel.appendChild(btnInfo);
      document.body.appendChild(exportPanel);
      exportReplaceBtn.onclick = function(e) {
        e.stopPropagation();
        exportPanel.style.display = exportPanel.style.display === 'none' ? '' : 'none';
      };
      document.addEventListener('click', function(ev) {
        const t = ev.target;
        if (exportPanel && exportPanel.style.display !== 'none') {
          if (t !== exportPanel && t !== exportReplaceBtn && !exportPanel.contains(t)) {
            exportPanel.style.display = 'none';
          }
        }
      });
    }
  } else {
    exportReplaceBtn.style.display = '';
  }

  let globalFieldsToggleBtn = document.getElementById('globalFieldsToggleBtn');
  if (!globalFieldsToggleBtn) {
    const toggleWrapper = document.createElement('div');
    toggleWrapper.id = 'globalFieldsToggleWrapper';
    toggleWrapper.style = 'position:absolute;top:220px;right:16px;z-index:1003;';
    globalFieldsToggleBtn = document.createElement('button');
    globalFieldsToggleBtn.id = 'globalFieldsToggleBtn';
    globalFieldsToggleBtn.textContent = 'Campos globales';
    globalFieldsToggleBtn.style = 'background:#f39c12;color:#fff;padding:6px 16px;border-radius:6px;box-shadow:0 2px 6px #aaa;margin-right:6px;';
    const clearAllBtn = document.createElement('button');
    clearAllBtn.id = 'clearAllFieldsBtn';
    clearAllBtn.textContent = 'Vaciar críticos';
    clearAllBtn.style = 'background:#e74c3c;color:#fff;padding:6px 16px;border-radius:6px;box-shadow:0 2px 6px #aaa;';
    toggleWrapper.appendChild(globalFieldsToggleBtn);
    toggleWrapper.appendChild(clearAllBtn);
    document.body.appendChild(toggleWrapper);

    globalFieldsToggleBtn.onclick = function() {
      if (!globalFieldsPanel) return;
      globalFieldsPanel.style.display = (globalFieldsPanel.style.display === 'none') ? '' : 'none';
      if (globalFieldsPanel.style.display !== 'none') {
        renderGlobalFieldsPanel();
      }
    };

    clearAllBtn.onclick = function() {
      if (!editGeojsonData || !editGeojsonData.features) return;
      editGeojsonData.features.forEach(f => {
        const p = f.properties || (f.properties = {});
        ['distrito','localidad','nivel','nombre'].forEach(k => { p[k] = ''; });
      });
      const aviso = document.createElement('div');
      aviso.textContent = '✔ Campos críticos vaciados';
      aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#e74c3c;color:#fff;padding:8px 18px;border-radius:8px;box-shadow:0 2px 8px #aaa;font-weight:bold;opacity:0;transition:opacity 0.2s;';
      document.body.appendChild(aviso);
      setTimeout(function() { aviso.style.opacity = '1'; }, 30);
      setTimeout(function() { aviso.style.opacity = '0'; aviso.remove(); }, 1200);
      if (currentEditIdx !== null && editMarkers[currentEditIdx]) {
        editMarkers[currentEditIdx].setPopupContent(generarPopupEdicion(editGeojsonData.features[currentEditIdx], currentEditIdx));
        editMarkers[currentEditIdx].openPopup();
      }
    };
  } else {
    globalFieldsToggleBtn.style.display = '';
    const clearAllBtn = document.getElementById('clearAllFieldsBtn');
    if (clearAllBtn) clearAllBtn.style.display = '';
    const toggleWrapper = document.getElementById('globalFieldsToggleWrapper');
    if (toggleWrapper) toggleWrapper.style.display = '';
  }

  function renderGlobalFieldsPanel() {
    if (!globalFieldsPanel) return;
    globalFieldsPanel.innerHTML = '';
    if (!editGeojsonData || !editGeojsonData.features || editGeojsonData.features.length === 0) {
      const aviso = document.createElement('div');
      aviso.textContent = 'No hay datos cargados';
      aviso.style = 'color:#888;';
      globalFieldsPanel.appendChild(aviso);
      return;
    }
    const camposSet = new Set();
    editGeojsonData.features.forEach(f => {
      const p = f.properties || {};
      Object.keys(p).forEach(k => camposSet.add(k));
    });
    const resumen = document.createElement('div');
    resumen.textContent = 'Campos globales detectados:';
    resumen.style = 'font-weight:bold;margin-bottom:6px;';
    globalFieldsPanel.appendChild(resumen);
    Array.from(camposSet).sort().forEach(field => {
      const row = document.createElement('div');
      row.style = 'display:flex;align-items:center;justify-content:space-between;margin:6px 0;';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = field;
      row.appendChild(nameSpan);
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Eliminar';
      delBtn.style = 'background:#c0392b;color:#fff;padding:4px 8px;border-radius:6px;';
      delBtn.setAttribute('data-field', field);
      row.appendChild(delBtn);
      globalFieldsPanel.appendChild(row);
    });

    const ayuda = document.createElement('div');
    ayuda.innerHTML = 'Ayuda: Usa "Vaciar críticos" para limpiar distrito, localidad, nivel y nombre en todos los puntos.';
    ayuda.style = 'color:#888;margin-top:8px;font-size:0.9em;';
    globalFieldsPanel.appendChild(ayuda);

    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveGlobalChangesBtn';
    saveBtn.textContent = 'Guardar cambios';
    saveBtn.style = 'display:block;margin-top:10px;background:#27ae60;color:#fff;padding:6px 16px;border-radius:6px;box-shadow:0 2px 6px #aaa;';
    saveBtn.onclick = exportAndReplaceInProject;
    globalFieldsPanel.appendChild(saveBtn);
    globalFieldsPanel.style.display = '';

    Array.from(globalFieldsPanel.querySelectorAll('button[data-field]')).forEach(btn => {
      btn.onclick = function() {
        const field = btn.getAttribute('data-field');
        if (field) {
          editGeojsonData.features.forEach(f => { if (f && f.properties) delete f.properties[field]; });
          const toggle = document.getElementById('globalFieldsToggleBtn');
          if (toggle) { toggle.click(); toggle.click(); }
          const panel = document.getElementById('globalFieldsPanel');
          if (panel) {
            const aviso = document.createElement('div');
            aviso.textContent = 'Campo eliminado';
            aviso.style = 'margin-top:6px;color:#e74c3c;font-weight:bold;';
            panel.appendChild(aviso);
            setTimeout(() => { aviso.remove(); }, 1200);
          }
          if (currentEditIdx !== null && editMarkers[currentEditIdx]) {
            editMarkers[currentEditIdx].setPopupContent(generarPopupEdicion(editGeojsonData.features[currentEditIdx], currentEditIdx));
            editMarkers[currentEditIdx].openPopup();
          }
        }
      };
    });
  }
}

function ocultarControlesEdicion() {
  const importBtn = document.getElementById('importGeojsonBtn');
  if (importBtn) importBtn.style.display = 'none';
  const reiniciarBtn = document.getElementById('reiniciarEditBtn');
  if (reiniciarBtn) reiniciarBtn.style.display = 'none';
  const exportBtn = document.getElementById('exportGeojsonBtn');
  if (exportBtn) exportBtn.style.display = 'none';
  const exportReplaceBtn = document.getElementById('exportReplaceBtn');
  if (exportReplaceBtn) exportReplaceBtn.style.display = 'none';
  const toggleBtn = document.getElementById('globalFieldsToggleBtn');
  if (toggleBtn) toggleBtn.style.display = 'none';
  const clearAllBtn = document.getElementById('clearAllFieldsBtn');
  if (clearAllBtn) clearAllBtn.style.display = 'none';
  const toggleWrapper = document.getElementById('globalFieldsToggleWrapper');
  if (toggleWrapper) toggleWrapper.style.display = 'none';
  const panel = document.getElementById('globalFieldsPanel');
  if (panel) panel.style.display = 'none';
  const addPointBtn = document.getElementById('addEditPointBtn');
  if (addPointBtn) addPointBtn.style.display = 'none';
}

function ocultarControlesNormales() {
  const admin = document.getElementById('admin-panel');
  if (admin) admin.style.display = 'none';
}

function mostrarControlesNormales() {
  document.getElementById('admin-panel').style.display = '';
}

function handleImportGeojson(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const geojson = JSON.parse(evt.target.result);
      if (!geojson.features) {
        alert('Archivo GeoJSON inválido');
        return;
      }
      editGeojsonData = sanitizeGeojson(geojson);
      lastImportedFileName = file.name || '';
      mostrarControlesEdicion();
      clearMarkers();
      renderEditMarkers(editGeojsonData.features);
    } catch (err) {
      alert('Error al leer el archivo: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function limpiarEditMarkers() {
  editMarkers.forEach(m => map.removeLayer(m));
  editMarkers = [];
}

function renderEditMarkers(features) {
  limpiarEditMarkers();
  features.forEach((feature, idx) => {
    const p = feature.properties || {};
    const hasGeom = feature.geometry && Array.isArray(feature.geometry.coordinates);
    const coords = hasGeom ? feature.geometry.coordinates : null;
    let color = getColorByLevel(p.nivel || '');
    const nombreStr2 = typeof p.nombre === 'string' ? p.nombre : '';
    const tipoStr2 = typeof p.tipo_organizacion === 'string' ? p.tipo_organizacion : '';
    if (nombreStr2.includes('adultos') || nombreStr2.includes('Adultos') || nombreStr2.includes('ADULTOS')) {
      color = '#8E44AD';
    }
    if (
      nombreStr2.includes('JARDÍN MATERNAL') ||
      nombreStr2.includes('JARDIN MATERNAL') ||
      nombreStr2.includes('Jardín Maternal') ||
      nombreStr2.includes('Jardin Maternal') ||
      tipoStr2.includes('JARDÍN MATERNAL') ||
      tipoStr2.includes('JARDIN MATERNAL')
    ) {
      color = '#3399FF';
    }
    let lat = hasGeom ? Number(coords[1]) : Number(p.latitud ?? p.lat ?? p.latitude);
    let lng = hasGeom ? Number(coords[0]) : Number(p.longitud ?? p.lng ?? p.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      console.warn('Coordenadas faltantes/invalidas; usando fallback', idx, coords, p.latitud, p.longitud);
      lat = -34.92;
      lng = -57.95;
    }
    feature.geometry = feature.geometry || { type: 'Point', coordinates: [lng, lat] };
    feature.geometry.coordinates = [lng, lat];
    let marker;
    if (p.editable_coords === true) {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', function() {
        const ll = marker.getLatLng();
        feature.geometry.coordinates = [ll.lng, ll.lat];
        const iHtml = (typeof marker.featureIndex === 'number') ? marker.featureIndex : idx;
        marker.setPopupContent(generarPopupEdicion(feature, iHtml));
      });
    } else {
      marker = L.circleMarker([lat, lng], {
        color: color,
        fillColor: color,
        radius: 12,
        weight: 3,
        fillOpacity: 0.85,
        opacity: 1
      }).addTo(map);
    }
    const idxOriginal = editGeojsonData && editGeojsonData.features ? editGeojsonData.features.indexOf(feature) : idx;
    marker.featureIndex = idxOriginal;
    marker.bindPopup(generarPopupEdicion(feature, idxOriginal), { autoClose: false, closeOnClick: false });
    marker.on('popupopen', function() {
      setTimeout(() => {
        const nombreInput = document.getElementById('edit-nombre-' + idx);
        if (nombreInput) {
          nombreInput.onchange = function() {
            feature.properties.nombre = nombreInput.value;
          };
        }
      }, 200);
    });
    editMarkers.push(marker);
  });
}

function addNewEditPoint() {
  if (!editGeojsonData || !Array.isArray(editGeojsonData.features)) {
    editGeojsonData = { type: 'FeatureCollection', features: [] };
  }
  const c = map.getCenter();
  const camposSet = new Set();
  if (Array.isArray(editGeojsonData.features)) {
    editGeojsonData.features.forEach(f => {
      const p = f.properties || {};
      Object.keys(p).forEach(k => camposSet.add(k));
    });
  }
  const newProps = {};
  Array.from(camposSet).forEach(k => { newProps[k] = ''; });
  newProps.editable_coords = true;
  const f = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    properties: newProps
  };
  editGeojsonData.features.push(f);
  renderEditMarkers(editGeojsonData.features);
}

function generarPopupEdicion(feature, idx) {
  const props = feature.properties || {};
  let camposHtml = '';
  for (const clave in props) {
    if (systemFields.has(clave)) { continue; }
    let valor = props[clave];
    if (Array.isArray(valor)) {
      camposHtml += `<div style='margin-bottom:4px;'><label>${clave}: <textarea class='edit-campo-array' data-idx='${idx}' data-clave='${clave}' style='width:70%;height:38px;'>${JSON.stringify(valor)}</textarea></label> <button class='del-campo-btn' data-idx='${idx}' data-clave='${clave}' style='color:#e74c3c;'>✕</button></div>`;
    } else {
      camposHtml += `<div style='margin-bottom:4px;'><label>${clave}: <input type='text' class='edit-campo' data-idx='${idx}' data-clave='${clave}' value='${valor ?? ''}' style='width:70%;'></label> <button class='del-campo-btn' data-idx='${idx}' data-clave='${clave}' style='color:#e74c3c;'>✕</button></div>`;
    }
  }
  camposHtml += `<div style='margin-bottom:4px;'><input type='text' id='nuevo-campo-nombre-${idx}' placeholder='Nuevo campo' style='width:40%;'> <input type='text' id='nuevo-campo-valor-${idx}' placeholder='Valor' style='width:30%;'> <button class='add-campo-btn' data-idx='${idx}' style='color:#27ae60;'>+</button></div>`;
  camposHtml += `<div style='margin-top:12px;text-align:center;'><button class='actualizar-punto-btn' data-idx='${idx}' style='background:linear-gradient(90deg,#27ae60,#2980b9);color:#fff;padding:8px 24px;border:none;border-radius:8px;font-size:1.08em;box-shadow:0 2px 8px #aaa;cursor:pointer;transition:background 0.2s;margin-right:8px;'>💾 Guardar cambios</button><button class='eliminar-punto-btn' data-idx='${idx}' style='background:#c0392b;color:#fff;padding:8px 18px;border:none;border-radius:8px;font-size:1.02em;box-shadow:0 2px 8px #aaa;cursor:pointer;'>🗑 Eliminar punto</button></div>`;
  const coords = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : [null, null];
  return `<div style='min-width:240px;max-height:260px;overflow-y:auto;'>
    <label>Lat:<br><input type='number' step='0.00001' id='edit-lat-${idx}' value='${coords[1] ?? ''}' style='width:96%;background:#f5f5f5;color:#888;' disabled></label><br>
    <label>Lng:<br><input type='number' step='0.00001' id='edit-lng-${idx}' value='${coords[0] ?? ''}' style='width:96%;background:#f5f5f5;color:#888;' disabled></label>
    <hr>
    <div style='margin-bottom:6px;'><b>Propiedades:</b></div>
    ${camposHtml}
  </div>`;
}

function attachEditPopupHandlers(marker) {
  const idx = (typeof marker.featureIndex === 'number') ? marker.featureIndex : editMarkers.indexOf(marker);
  if (idx === -1) return;
  Array.from(document.querySelectorAll('.edit-campo')).forEach(input => {
    input.onchange = function() {
      const i = parseInt(input.getAttribute('data-idx'));
      const clave = input.getAttribute('data-clave');
      editGeojsonData.features[i].properties[clave] = input.value;
    };
  });
  Array.from(document.querySelectorAll('.edit-campo-array')).forEach(textarea => {
    textarea.onchange = function() {
      const i = parseInt(textarea.getAttribute('data-idx'));
      const clave = textarea.getAttribute('data-clave');
      try { editGeojsonData.features[i].properties[clave] = JSON.parse(textarea.value); } catch (e) { alert('Formato de array inválido. Usa JSON válido.'); }
    };
  });
  Array.from(document.querySelectorAll('.del-campo-btn')).forEach(btn => {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const i = parseInt(btn.getAttribute('data-idx'));
      const clave = btn.getAttribute('data-clave');
      if (!editGeojsonData || !Array.isArray(editGeojsonData.features)) return;
      editGeojsonData.features.forEach(f => { if (f && f.properties) delete f.properties[clave]; });
      const aviso = document.createElement('div');
      aviso.textContent = '✔ Campo eliminado en todos los puntos: ' + clave;
      aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#e74c3c;color:#fff;padding:10px 20px;border-radius:10px;box-shadow:0 2px 8px #aaa;font-weight:bold;opacity:0;transition:opacity 0.2s;';
      document.body.appendChild(aviso);
      setTimeout(function(){ aviso.style.opacity = '1'; }, 50);
      setTimeout(function(){ aviso.style.opacity = '0'; aviso.remove(); }, 1500);
      marker.setPopupContent(generarPopupEdicion(editGeojsonData.features[i], i));
      attachEditPopupHandlers(marker);
    });
  });
  Array.from(document.querySelectorAll('.add-campo-btn')).forEach(btn => {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const i = parseInt(btn.getAttribute('data-idx'));
      const nombre = document.getElementById('nuevo-campo-nombre-' + i).value.trim();
      const valor = document.getElementById('nuevo-campo-valor-' + i).value;
      if (nombre) {
        const f = editGeojsonData.features[i];
        if (f && f.properties) {
          f.properties[nombre] = valor;
          marker.setPopupContent(generarPopupEdicion(f, i));
          attachEditPopupHandlers(marker);
        }
      }
    });
  });
  Array.from(document.querySelectorAll('.actualizar-punto-btn')).forEach(btn => {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const i = parseInt(btn.getAttribute('data-idx'));
      let punto = editGeojsonData.features[i];
      let filterKeyChanged = false;
      let localidadChanged = false;
      Array.from(document.querySelectorAll('.edit-campo')).forEach(input => {
        if (parseInt(input.getAttribute('data-idx')) === i) {
          const clave = input.getAttribute('data-clave');
          punto.properties[clave] = input.value;
          if (clave === 'distrito' || clave === 'localidad' || clave === 'nivel') filterKeyChanged = true;
          if (clave === 'localidad') localidadChanged = true;
        }
      });
      Array.from(document.querySelectorAll('.edit-campo-array')).forEach(textarea => {
        if (parseInt(textarea.getAttribute('data-idx')) === i) {
          const clave = textarea.getAttribute('data-clave');
          try { punto.properties[clave] = JSON.parse(textarea.value); } catch (e) { alert('Formato de array inválido. Usa JSON válido.'); }
        }
      });
      punto.properties.localidad_norm = normalizeLocalidadName(punto.properties.localidad || '');
      marker.setPopupContent(generarPopupEdicion(editGeojsonData.features[i], i));
      attachEditPopupHandlers(marker);
      renderEditMarkers(editGeojsonData.features);
      const mk2 = editMarkers.find(m => m.featureIndex === i);
      if (mk2) mk2.openPopup();
      if (filterKeyChanged) {
        actualizarPanelLocalidades();
        filterSchools();
        const mk = editMarkers.find(m => m.featureIndex === i);
        if (mk) mk.openPopup();
      }
      setTimeout(function() {
        const aviso = document.createElement('div');
        aviso.textContent = '✔ Cambios guardados';
        aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:linear-gradient(90deg,#27ae60,#2980b9);color:#fff;padding:12px 32px;border-radius:12px;box-shadow:0 4px 16px #aaa;font-size:1.15em;font-weight:bold;opacity:0;transition:opacity 0.3s;';
        document.body.appendChild(aviso);
        setTimeout(function() { aviso.style.opacity = '1'; }, 50);
        setTimeout(function() { aviso.style.opacity = '0'; aviso.remove(); }, 1500);
      }, 300);
    });
  });
  Array.from(document.querySelectorAll('.eliminar-punto-btn')).forEach(btn => {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const i = parseInt(btn.getAttribute('data-idx'));
      if (isNaN(i)) return;
      if (!editGeojsonData || !Array.isArray(editGeojsonData.features)) return;
      const ok = window.confirm ? window.confirm('Eliminar punto') : true;
      if (!ok) return;
      editGeojsonData.features.splice(i, 1);
      currentEditIdx = null;
      renderEditMarkers(editGeojsonData.features);
      setTimeout(function() {
        const aviso = document.createElement('div');
        aviso.textContent = '✔ Punto eliminado';
        aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#c0392b;color:#fff;padding:12px 32px;border-radius:12px;box-shadow:0 4px 16px #aaa;font-size:1.15em;font-weight:bold;opacity:0;transition:opacity 0.3s;';
        document.body.appendChild(aviso);
        setTimeout(function() { aviso.style.opacity = '1'; }, 50);
        setTimeout(function() { aviso.style.opacity = '0'; aviso.remove(); }, 1500);
      }, 100);
    });
  });
}

map.on('popupopen', function(e) {
  const marker = e.popup._source;
  const idx = editMarkers.indexOf(marker);
  if (idx === -1) return;
  if (typeof marker.featureIndex === 'number') currentEditIdx = marker.featureIndex;
  attachEditPopupHandlers(marker);
  return;
  Array.from(document.querySelectorAll('.edit-campo')).forEach(input => {
    input.onchange = function() {
      const i = parseInt(input.getAttribute('data-idx'));
      const clave = input.getAttribute('data-clave');
      editGeojsonData.features[i].properties[clave] = input.value;
    };
  });
  Array.from(document.querySelectorAll('.edit-campo-array')).forEach(textarea => {
    textarea.onchange = function() {
      const i = parseInt(textarea.getAttribute('data-idx'));
      const clave = textarea.getAttribute('data-clave');
      try {
        editGeojsonData.features[i].properties[clave] = JSON.parse(textarea.value);
      } catch (e) {
        alert('Formato de array inválido. Usa JSON válido.');
      }
    };
  });
  Array.from(document.querySelectorAll('.del-campo-btn')).forEach(btn => {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const i = parseInt(btn.getAttribute('data-idx'));
      const clave = btn.getAttribute('data-clave');
      if (criticalFields.has(clave)) {
        const aviso = document.createElement('div');
        aviso.textContent = 'Campo crítico, usa "Vaciar"';
        aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#e74c3c;color:#fff;padding:8px 18px;border-radius:8px;box-shadow:0 2px 8px #aaa;font-weight:bold;opacity:0;transition:opacity 0.2s;';
        document.body.appendChild(aviso);
        setTimeout(function() { aviso.style.opacity = '1'; }, 30);
        setTimeout(function() { aviso.style.opacity = '0'; aviso.remove(); }, 1200);
        return;
      }
      const ff = editGeojsonData.features[i];
      if (ff && ff.properties) { delete ff.properties[clave]; }
      marker.setPopupContent(generarPopupEdicion(ff, i));
      marker.openPopup();
    });
  });
  Array.from(document.querySelectorAll('.add-campo-btn')).forEach(btn => {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const i = parseInt(btn.getAttribute('data-idx'));
      const nombre = document.getElementById('nuevo-campo-nombre-' + i).value.trim();
      const valor = document.getElementById('nuevo-campo-valor-' + i).value;
      if (nombre) {
        const f = editGeojsonData.features[i];
        if (f && f.properties) {
          f.properties[nombre] = valor;
          marker.setPopupContent(generarPopupEdicion(f, i));
          marker.openPopup();
        }
      }
    });
  });
  Array.from(document.querySelectorAll('.actualizar-punto-btn')).forEach(btn => {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const i = parseInt(btn.getAttribute('data-idx'));
      let punto = editGeojsonData.features[i];
      let filterKeyChanged = false;
      let localidadChanged = false;
      Array.from(document.querySelectorAll('.edit-campo')).forEach(input => {
        if (parseInt(input.getAttribute('data-idx')) === i) {
          const clave = input.getAttribute('data-clave');
          punto.properties[clave] = input.value;
          if (clave === 'distrito' || clave === 'localidad' || clave === 'nivel') filterKeyChanged = true;
          if (clave === 'localidad') localidadChanged = true;
        }
      });
      Array.from(document.querySelectorAll('.edit-campo-array')).forEach(textarea => {
        if (parseInt(textarea.getAttribute('data-idx')) === i) {
          const clave = textarea.getAttribute('data-clave');
          try {
            punto.properties[clave] = JSON.parse(textarea.value);
          } catch (e) {
            alert('Formato de array inválido. Usa JSON válido.');
          }
        }
      });
      punto.properties.localidad_norm = normalizeLocalidadName(punto.properties.localidad || '');
      if (localidadChanged) {
        // no changes to geometry; only filters will reflect locality change
      }
      marker.setPopupContent(generarPopupEdicion(editGeojsonData.features[i], i));
       if (filterKeyChanged) {
         actualizarPanelLocalidades();
         filterSchools();
         const mk = editMarkers.find(m => m.featureIndex === i);
         if (mk) mk.openPopup();
       }

       setTimeout(function() {
         const aviso = document.createElement('div');
         aviso.textContent = '✔ Cambios guardados';
         aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:linear-gradient(90deg,#27ae60,#2980b9);color:#fff;padding:12px 32px;border-radius:12px;box-shadow:0 4px 16px #aaa;font-size:1.15em;font-weight:bold;opacity:0;transition:opacity 0.3s;';
         document.body.appendChild(aviso);
         setTimeout(function() { aviso.style.opacity = '1'; }, 50);
         setTimeout(function() { aviso.style.opacity = '0'; aviso.remove(); }, 1500);
       }, 300);
      
    });
  });
  Array.from(document.querySelectorAll('.eliminar-punto-btn')).forEach(btn => {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const i = parseInt(btn.getAttribute('data-idx'));
      if (isNaN(i)) return;
      if (!editGeojsonData || !Array.isArray(editGeojsonData.features)) return;
      const ok = window.confirm ? window.confirm('Eliminar punto') : true;
      if (!ok) return;
      editGeojsonData.features.splice(i, 1);
      currentEditIdx = null;
      renderEditMarkers(editGeojsonData.features);
      setTimeout(function() {
        const aviso = document.createElement('div');
        aviso.textContent = '✔ Punto eliminado';
        aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#c0392b;color:#fff;padding:12px 32px;border-radius:12px;box-shadow:0 4px 16px #aaa;font-size:1.15em;font-weight:bold;opacity:0;transition:opacity 0.3s;';
        document.body.appendChild(aviso);
        setTimeout(function() { aviso.style.opacity = '1'; }, 50);
        setTimeout(function() { aviso.style.opacity = '0'; aviso.remove(); }, 1500);
      }, 100);
    });
  });
  const actBtn = document.querySelector('.actualizar-punto-btn');
  if (actBtn) {
    const v = parseInt(actBtn.getAttribute('data-idx'));
    if (!isNaN(v)) currentEditIdx = v;
  }
});

function exportEditGeojson() {
  if (!editGeojsonData) {
    alert('No hay datos GeoJSON cargados para exportar.');
    return;
  }
  let reparado = false;
  if (editGeojsonData && Array.isArray(editGeojsonData.features)) {
    editGeojsonData = sanitizeGeojson(editGeojsonData);
    reparado = true;
  }
  const text = JSON.stringify(editGeojsonData, null, 2);
  if (!text || text.length === 0) {
    alert('Sin contenido para exportar');
    return;
  }
  const useFS = typeof window.showSaveFilePicker === 'function';
  if (useFS) {
    const opts = { suggestedName: 'editado.geojson', types: [{ description: 'GeoJSON', accept: { 'application/json': ['.geojson','.json'] } }] };
    if (window.exportDirHandle) opts.startIn = window.exportDirHandle;
    window.showSaveFilePicker(opts).then(async function(fileHandle){
      const w = await fileHandle.createWritable();
      const blob = new Blob([text], { type: 'application/json' });
      await w.write(blob);
      await w.close();
      setTimeout(function() {
        const aviso = document.createElement('div');
        aviso.textContent = '✔ Archivo guardado: ' + (fileHandle.name || 'editado.geojson');
        aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#34495e;color:#fff;padding:10px 20px;border-radius:10px;box-shadow:0 2px 8px #aaa;font-weight:bold;opacity:0;transition:opacity 0.2s;';
        document.body.appendChild(aviso);
        setTimeout(function(){ aviso.style.opacity = '1'; }, 50);
        setTimeout(function(){ aviso.style.opacity = '0'; aviso.remove(); }, 1500);
      }, 200);
    }).catch(function(){
      const href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'editado.geojson';
      a.target = '_self';
      a.style = 'position:fixed;left:-9999px;top:-9999px;';
      document.body.appendChild(a);
      requestAnimationFrame(function(){
        try { a.click(); } catch(e) { a.dispatchEvent(new MouseEvent('click')); }
        setTimeout(function(){ a.remove(); }, 1000);
      });
    });
  } else {
    const href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'editado.geojson';
    a.target = '_self';
    a.style = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(a);
    requestAnimationFrame(function(){
      try { a.click(); } catch(e) { a.dispatchEvent(new MouseEvent('click')); }
      setTimeout(function(){ a.remove(); }, 1000);
    });
  }
  if (reparado) {
    setTimeout(function() {
      const aviso = document.createElement('div');
      aviso.textContent = '✔ Campos críticos reparados al exportar';
      aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#27ae60;color:#fff;padding:8px 18px;border-radius:8px;box-shadow:0 2px 8px #aaa;font-weight:bold;opacity:0;transition:opacity 0.2s;';
      document.body.appendChild(aviso);
      setTimeout(function() { aviso.style.opacity = '1'; }, 50);
      setTimeout(function() { aviso.style.opacity = '0'; aviso.remove(); }, 1500);
    }, 150);
  }
}

async function exportAndReplaceInProject() {
  if (!editGeojsonData) {
    alert('No hay datos GeoJSON cargados para exportar.');
    return;
  }
  let reparado = false;
  if (editGeojsonData && Array.isArray(editGeojsonData.features)) {
    editGeojsonData = sanitizeGeojson(editGeojsonData);
    reparado = true;
  }
  const suggested = (lastImportedFileName && /\.geojson$/i.test(lastImportedFileName)) ? lastImportedFileName : 'camposfiltrados.geojson';
  const text = JSON.stringify(editGeojsonData, null, 2);
  if (!text || text.length === 0) {
    alert('Sin contenido para exportar');
    return;
  }
  const useFS = typeof window.showSaveFilePicker === 'function';
  if (useFS) {
    const opts = { suggestedName: suggested, types: [{ description: 'GeoJSON', accept: { 'application/json': ['.geojson','.json'] } }] };
    if (window.exportDirHandle) opts.startIn = window.exportDirHandle;
    try {
      const fileHandle = await window.showSaveFilePicker(opts);
      const w = await fileHandle.createWritable();
      const blob = new Blob([text], { type: 'application/json' });
      await w.write(blob);
      await w.close();
      setTimeout(function(){
        const aviso = document.createElement('div');
        aviso.textContent = '✔ Archivo guardado: ' + (fileHandle.name || suggested);
        aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#34495e;color:#fff;padding:10px 20px;border-radius:10px;box-shadow:0 2px 8px #aaa;font-weight:bold;opacity:0;transition:opacity 0.2s;';
        document.body.appendChild(aviso);
        setTimeout(function(){ aviso.style.opacity = '1'; }, 50);
        setTimeout(function(){ aviso.style.opacity = '0'; aviso.remove(); }, 1500);
      }, 200);
      return;
    } catch(e) {}
  }
  const href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
  const a = document.createElement('a');
  a.href = href;
  a.download = suggested;
  a.target = '_self';
  a.style = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(a);
  requestAnimationFrame(function(){
    try { a.click(); } catch(e) { a.dispatchEvent(new MouseEvent('click')); }
    setTimeout(function(){ a.remove(); }, 1000);
    setTimeout(function(){
      const aviso = document.createElement('div');
      aviso.textContent = '✔ Archivo exportado: ' + suggested;
      aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#34495e;color:#fff;padding:10px 20px;border-radius:10px;box-shadow:0 2px 8px #aaa;font-weight:bold;opacity:0;transition:opacity 0.2s;';
      document.body.appendChild(aviso);
      setTimeout(function(){ aviso.style.opacity = '1'; }, 50);
      setTimeout(function(){ aviso.style.opacity = '0'; aviso.remove(); }, 1500);
    }, 200);
  });
}

async function exportAndReplacePreset(filename) {
  if (!editGeojsonData) {
    alert('No hay datos GeoJSON cargados para exportar.');
    return;
  }
  let reparado = false;
  if (editGeojsonData && Array.isArray(editGeojsonData.features)) {
    editGeojsonData = sanitizeGeojson(editGeojsonData);
    reparado = true;
  }
  const suggested = filename || 'camposfiltrados.geojson';
  const text = JSON.stringify(editGeojsonData, null, 2);
  if (!text || text.length === 0) {
    alert('Sin contenido para exportar');
    return;
  }
  const useFS = typeof window.showSaveFilePicker === 'function';
  if (useFS) {
    const opts = { suggestedName: suggested, types: [{ description: 'GeoJSON', accept: { 'application/json': ['.geojson','.json'] } }] };
    if (window.exportDirHandle) opts.startIn = window.exportDirHandle;
    try {
      const fileHandle = await window.showSaveFilePicker(opts);
      const w = await fileHandle.createWritable();
      const blob = new Blob([text], { type: 'application/json' });
      await w.write(blob);
      await w.close();
      return;
    } catch(e) {}
  }
  const href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
  const a = document.createElement('a');
  a.href = href;
  a.download = suggested;
  a.target = '_self';
  a.style = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(a);
  requestAnimationFrame(function(){
    try { a.click(); } catch(e) { a.dispatchEvent(new MouseEvent('click')); }
    setTimeout(function(){ a.remove(); }, 1000);
  });
}

async function chooseExportDirectory() {
  try {
    if (!window.showDirectoryPicker) {
      alert('Tu navegador no permite elegir carpeta de guardado.');
      return;
    }
    const dir = await window.showDirectoryPicker();
    window.exportDirHandle = dir;
    const dirName = dir && dir.name ? dir.name : '';
    const status = document.getElementById('exportDirStatus');
    if (status) { status.textContent = dirName ? ('Carpeta: ' + dirName) : ''; }
    setTimeout(function(){
      const aviso = document.createElement('div');
      aviso.textContent = '✔ Carpeta seleccionada: ' + dirName;
      aviso.style = 'position:fixed;top:32px;right:32px;z-index:2000;background:#2c3e50;color:#fff;padding:10px 20px;border-radius:10px;box-shadow:0 2px 8px #aaa;font-weight:bold;opacity:0;transition:opacity 0.2s;';
      document.body.appendChild(aviso);
      setTimeout(function(){ aviso.style.opacity = '1'; }, 50);
      setTimeout(function(){ aviso.style.opacity = '0'; aviso.remove(); }, 1500);
    }, 200);
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    alert('Error seleccionando carpeta: ' + (e && e.message ? e.message : e));
  }
}
// --- FIN MODO EDICIÓN GEOJSON ---
function clearRailways(){ try{ railwayLayers.forEach(l=>map.removeLayer(l)); railwayLayers = []; }catch(e){} }
