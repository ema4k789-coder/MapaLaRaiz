# Mapa de Escuelas La Raíz

Una aplicación web interactiva que muestra la ubicación de escuelas en La Plata y alrededores, con un splash screen animado y filtros avanzados.

## 🌐 Demo Online

Puedes ver la aplicación funcionando en: **https://ema4k789-coder.github.io/MapaDeEscuelasLaRaizV2/**

## ✨ Características

### Splash Screen
- **Animación de círculo** con efecto de rebote
- **Bandera con cañas** y textura de tela rústica
- **Easter egg** (doble click en el círculo para ver la bandera)
- **Transición suave** al mapa principal

### Mapa Interactivo
- **Filtros por distrito** (La Plata, Berisso, Ensenada)
- **Filtros por localidad** (se actualizan según el distrito)
- **Filtros por nivel educativo** (Inicial, Primaria, Secundaria, etc.)
- **Búsqueda por texto** (nombre, número, dirección)
- **Colores por nivel** cada tipo de escuela tiene un color distintivo
- **Información detallada** al hacer clic en cada escuela

### Datos Incluidos
- 📍 **Ubicación** de escuelas con coordenadas GPS
- 🏫 **Información** de nivel, dirección, número de escuela
- 📊 **Datos de desfavorabilidad** y otros detalles
- 🗺️ **Límites municipales** y de localidades

## 🚀 Cómo usar

1. **Abrir la aplicación** - El splash screen aparecerá automáticamente
2. **Explorar el easter egg** - Haz 7 clicks fuera del círculo o doble click en el círculo
3. **Entrar al mapa** - Haz clic en el botón "INGRESAR AL MAPA"
4. **Usar los filtros** - Selecciona distrito, localidad y nivel educativo
5. **Buscar escuelas** - Usa el buscador para encontrar escuelas específicas
6. **Ver información** - Haz clic en cualquier punto del mapa para ver detalles

## 🛠️ Tecnologías utilizadas

- **HTML5/CSS3** - Estructura y estilos
- **JavaScript vanilla** - Lógica de la aplicación
- **Leaflet.js** - Mapas interactivos
- **GeoJSON** - Datos geográficos
- **Fuentes personalizadas** - Cooper Black y Calibri

## 📁 Estructura de archivos

```
├── index.html              # Página principal
├── app.js                  # Lógica de la aplicación
├── style.css               # Estilos
├── leaflet.js/.css         # Biblioteca de mapas
├── camposfiltrados.geojson # Datos de escuelas
├── localidades_*.geojson   # Datos de localidades
├── municipios_boundaries.geojson # Límites municipales
├── CooperBlackCustom.otf   # Fuente personalizada
├── CalibriCustom.TTF       # Fuente personalizada
└── pizarron.png           # Imagen para popups
```

## 🔄 Desarrollo local

Si quieres ejecutar la aplicación localmente:

1. **Clona el repositorio**
   ```bash
   git clone https://github.com/ema4k789-coder/MapaDeEscuelasLaRaizV2.git
   ```

2. **Navega al directorio**
   ```bash
   cd MapaDeEscuelasLaRaizV2
   ```

3. **Inicia un servidor local**
   ```bash
   npx serve -l 8080
   ```

4. **Abre en tu navegador**
   Ve a `http://localhost:8080/main.html`

## 📋 Notas importantes

- La aplicación debe abrirse desde un servidor web (http://localhost) y no directamente desde archivos locales (file://)
- Todos los datos geográficos están en formato GeoJSON
- El splash screen se oculta automáticamente al entrar al mapa
- Los filtros se aplican en tiempo real

## 📄 Licencia

Este proyecto es de código abierto y está disponible para uso educativo y comercial.

---

**Desarrollado con ❤️ para la comunidad educativa de La Plata**