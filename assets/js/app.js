'use strict';

// Endpoint de tu API que recibe la ficha (POST multipart: "datos" = JSON, "cedula_frente" y "cedula_reverso" = archivos)
const API_URL = `${window.RRHH_API_BASE_URL}/api/fichas-actualizacion`;
const MAX_ARCHIVO = 2 * 1024 * 1024;
const CENTRO_MAPA = [-25.2867, -57.647]; // Asunción; el mapa se mueve al marcar o usar el GPS

const DEPARTAMENTOS = ['Capital', 'Concepción', 'San Pedro', 'Cordillera', 'Guairá', 'Caaguazú', 'Caazapá', 'Itapúa',
  'Misiones', 'Paraguarí', 'Alto Paraná', 'Central', 'Ñeembucú', 'Amambay', 'Canindeyú', 'Presidente Hayes',
  'Boquerón', 'Alto Paraguay'];

// k = nombre de columna en la tabla hija · req = obligatorio si la fila tiene datos
// aux = campo que no cuenta para decidir si la fila está vacía
const GRUPOS = {
  contactos: { titulo: 'Contacto', filas: 2, campos: [
    { k: 'nombre', l: 'Nombre', req: true, req0: true },
    { k: 'apellido', l: 'Apellido' },
    { k: 'parentesco', l: 'Parentesco' },
    { k: 'celular', l: 'Celular Nº', t: 'tel', req0: true },
    { k: 'linea_baja', l: 'Línea baja', t: 'tel' },
    { k: 'correo', l: 'Correo electrónico', t: 'email' } ] },
  beneficiarios: { titulo: 'Beneficiario', filas: 4, campos: [
    { k: 'nombre_apellido', l: 'Nombre y apellido', req: true },
    { k: 'cedula', l: 'N° de cédula' },
    { k: 'fecha_nacimiento', l: 'Fecha de nacimiento', t: 'date' },
    { k: 'parentesco', l: 'Parentesco' } ] },
  familiares: { titulo: 'Familiar', filas: 6, campos: [
    { k: 'parentesco', l: 'Parentesco', aux: true, opciones: ['Cónyuge', 'Hijo/a', 'Otro'], defecto: i => (i === 0 ? 'Cónyuge' : 'Hijo/a') },
    { k: 'nombre_apellido', l: 'Nombre y apellido', req: true },
    { k: 'cedula', l: 'N° de cédula' },
    { k: 'fecha_nacimiento', l: 'Fecha de nacimiento', t: 'date' },
    { k: 'edad', l: 'Edad', t: 'number', aux: true, ro: true },
    { k: 'ocupacion', l: 'Ocupación' },
    { k: 'lugar_trabajo', l: 'Lugar de trabajo' },
    { k: 'a_cargo', l: '¿Está a su cargo?', opciones: [['1', 'Sí'], ['0', 'No']], vacio: true } ] },
  cursos: { titulo: 'Curso', filas: 3, campos: [
    { k: 'curso', l: 'Curso o capacitación' } ] }
};

const form = document.getElementById('ficha');
const estado = document.getElementById('estado');
const boton = document.getElementById('enviar');
const pasos = [...form.querySelectorAll('.seccion')];
const progreso = document.getElementById('progreso');
const progresoBarra = document.getElementById('progreso-barra');
const progresoTexto = document.getElementById('progreso-texto');
const progresoPorcentaje = document.getElementById('progreso-porcentaje');
const listaPasos = document.getElementById('lista-pasos');
const botonAnterior = document.getElementById('paso-anterior');
const botonSiguiente = document.getElementById('paso-siguiente');
let pasoActual = 0;

/* ---------- Construcción de la interfaz ---------- */

function crearCampo(c, i) {
  const label = document.createElement('label');
  label.className = 'campo';
  label.append(c.l);
  let el;
  if (c.opciones) {
    el = document.createElement('select');
    if (c.vacio) el.add(new Option('Seleccionar', ''));
    c.opciones.forEach(o => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      el.add(new Option(t, v, c.defecto && c.defecto(i) === v, c.defecto && c.defecto(i) === v));
    });
  } else {
    el = document.createElement('input');
    el.type = c.t || 'text';
    if (c.ro) { el.readOnly = true; el.tabIndex = -1; }
  }
  el.dataset.k = c.k;
  if (c.aux) el.dataset.aux = '1';
  if (c.req) el.dataset.req = '1';
  if (c.req0 && i === 0) el.required = true;
  label.append(el);
  return label;
}

function construirGrupos() {
  Object.entries(GRUPOS).forEach(([nombre, g]) => {
    const cont = document.getElementById('g-' + nombre);
    for (let i = 0; i < g.filas; i++) {
      const fila = document.createElement('div');
      fila.className = 'fila';
      fila.innerHTML = `<p class="fila-titulo">${g.titulo} ${i + 1}</p>`;
      if ((nombre === 'familiares' || nombre === 'beneficiarios') && i >= 2) {
        fila.hidden = true;
      }
      const grid = document.createElement('div');
      grid.className = 'grid';
      g.campos.forEach(c => grid.append(crearCampo(c, i)));
      fila.append(grid);
      cont.append(fila);
    }
  });
  actualizarFilasCondicionales('#g-familiares');
  actualizarFilasCondicionales('#g-beneficiarios');
}

function construirSiNo() {
  document.querySelectorAll('.sino').forEach(div => {
    const texto = div.textContent.trim();
    const n = div.dataset.name;
    div.innerHTML = '';
    const p = document.createElement('span');
    p.textContent = texto;
    const op = document.createElement('div');
    op.className = 'sino-opciones';
    op.setAttribute('role', 'radiogroup');
    op.setAttribute('aria-label', texto);
    [['1', 'Sí'], ['0', 'No']].forEach(([v, t]) => {
      op.insertAdjacentHTML('beforeend', `<label><input type="radio" name="${n}" value="${v}" required> ${t}</label>`);
    });
    div.append(p, op);
  });
}

function cargarDepartamentos() {
  const sel = form.elements.departamento;
  DEPARTAMENTOS.forEach(d => sel.add(new Option(d, d)));
}

/* ---------- Navegación por secciones ---------- */

function mostrarPaso(indice) {
  pasoActual = indice;
  pasos.forEach((paso, i) => {
    paso.hidden = i !== pasoActual;
    const item = listaPasos.children[i];
    item.classList.toggle('actual', i === pasoActual);
    item.classList.toggle('completado', i < pasoActual);
    if (i === pasoActual) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });

  const numero = pasoActual + 1;
  const total = pasos.length;
  const porcentaje = Math.round(numero / total * 100);
  const titulo = pasos[pasoActual].querySelector('legend').textContent.trim();
  progreso.setAttribute('aria-valuenow', String(numero));
  progreso.setAttribute('aria-valuetext', `Paso ${numero} de ${total}: ${titulo}`);
  progresoBarra.style.width = `${porcentaje}%`;
  progresoTexto.textContent = `Paso ${numero} de ${total}: ${titulo}`;
  progresoPorcentaje.textContent = `${porcentaje} %`;
  botonAnterior.hidden = pasoActual === 0;
  botonSiguiente.hidden = pasoActual === total - 1;
  boton.hidden = pasoActual !== total - 1;
  estado.textContent = '';
  estado.className = 'estado';

  if (pasos[pasoActual].contains(document.getElementById('mapa'))) {
    if (!mapa) iniciarMapa();
    if (mapa) requestAnimationFrame(() => mapa.invalidateSize({ pan: false }));
  }
}

function construirNavegacionPasos() {
  pasos.forEach((paso, i) => {
    const item = document.createElement('li');
    const titulo = paso.querySelector('legend').textContent.trim();
    item.textContent = String(i + 1);
    item.title = titulo;
    item.setAttribute('aria-label', `Paso ${i + 1}: ${titulo}`);
    listaPasos.append(item);
  });
  botonAnterior.addEventListener('click', () => mostrarPaso(pasoActual - 1));
  botonSiguiente.addEventListener('click', () => {
    if (validarPaso(pasoActual)) mostrarPaso(pasoActual + 1);
  });
  mostrarPaso(0);
}

function validarPaso(indice) {
  const paso = pasos[indice];
  const invalido = [...paso.querySelectorAll('input, select, textarea')]
    .find(campo => !campo.disabled && !campo.checkValidity());
  if (invalido) {
    invalido.reportValidity();
    return false;
  }
  if (paso.contains(document.getElementById('mapa')) && !form.elements.ubicacion_lat.value) {
    mostrar('error', 'Marque en el mapa la ubicación de su vivienda.');
    document.getElementById('mapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  return true;
}

/* ---------- Mapa de ubicación (Leaflet) ---------- */

let mapa = null;
let marcador = null;
const coords = document.getElementById('coords');

function fijarUbicacion(lat, lng) {
  lat = Number(lat.toFixed(6));
  lng = Number(lng.toFixed(6));
  form.elements.ubicacion_lat.value = lat;
  form.elements.ubicacion_lng.value = lng;
  coords.textContent = `Ubicación marcada: ${lat}, ${lng}`;
  coords.className = 'coords ok';
  if (!marcador) {
    marcador = L.marker([lat, lng], { draggable: true }).addTo(mapa);
    marcador.on('dragend', () => { const p = marcador.getLatLng(); fijarUbicacion(p.lat, p.lng); });
  } else {
    marcador.setLatLng([lat, lng]);
  }
}

function limpiarUbicacion() {
  if (marcador) { marcador.remove(); marcador = null; }
  coords.textContent = 'Sin ubicación marcada';
  coords.className = 'coords';
}

function iniciarMapa() {
  if (typeof L === 'undefined') {
    coords.textContent = 'No se pudo cargar el mapa. Revise su conexión a internet y vuelva a abrir este paso.';
    return;
  }
  mapa = L.map('mapa').setView(CENTRO_MAPA, 11);
  const capa = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);
  capa.once('tileerror', () => {
    if (!form.elements.ubicacion_lat.value) {
      coords.textContent = 'No se pudieron cargar las calles del mapa. Revise su conexión e intente marcar la ubicación nuevamente.';
    }
  });
  mapa.on('click', e => fijarUbicacion(e.latlng.lat, e.latlng.lng));

  document.getElementById('btn-ubicacion').addEventListener('click', () => {
    if (!navigator.geolocation) { coords.textContent = 'Su navegador no permite obtener la ubicación.'; return; }
    if (!window.isSecureContext) {
      coords.textContent = 'Chrome solo permite usar el GPS desde una conexión segura (HTTPS o localhost).';
      coords.className = 'coords';
      return;
    }
    coords.textContent = 'Buscando su ubicación…';
    navigator.geolocation.getCurrentPosition(
      pos => {
        fijarUbicacion(pos.coords.latitude, pos.coords.longitude);
        mapa.setView([pos.coords.latitude, pos.coords.longitude], 17);
      },
      error => {
        if (error.code === 1) {
          coords.textContent = 'Chrome no autorizó la ubicación. Permita el acceso a la ubicación para este sitio o márquela tocando el mapa.';
        } else if (error.code === 2) {
          coords.textContent = 'No se pudo determinar la ubicación del teléfono. Márquela tocando el mapa.';
        } else if (error.code === 3) {
          coords.textContent = 'Se agotó el tiempo para obtener la ubicación. Intente otra vez o márquela tocando el mapa.';
        } else {
          coords.textContent = 'No se pudo obtener la ubicación. Márquela tocando el mapa.';
        }
        coords.className = 'coords';
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

function fechaHoy() {
  const d = new Date();
  form.elements.firma_fecha.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calcularEdad(iso) {
  if (!iso) return '';
  const n = new Date(iso), h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) e--;
  return e >= 0 ? e : '';
}

/* ---------- Comportamiento de las filas ---------- */

function filaConDatos(fila) {
  return [...fila.querySelectorAll('[data-k]')].some(el => !el.dataset.aux && el.value.trim() !== '');
}

function filaRepetibleCompleta(fila) {
  const nombre = fila.querySelector('[data-k="nombre_apellido"]');
  return Boolean(nombre?.value.trim())
    && [...fila.querySelectorAll('input, select, textarea')]
      .filter(campo => !campo.disabled)
      .every(campo => campo.checkValidity());
}

function actualizarFilasCondicionales(selector) {
  const filas = [...document.querySelectorAll(`${selector} .fila`)];
  filas.forEach((fila, index) => {
    if (index < 2) return;
    const visible = filaRepetibleCompleta(filas[index - 1]);
    fila.hidden = !visible;
    fila.querySelectorAll('input, select, textarea').forEach(campo => {
      campo.disabled = !visible;
      if (!visible) {
        if (campo.type === 'checkbox' || campo.type === 'radio') campo.checked = false;
        else campo.value = '';
        if (campo.dataset.req) campo.required = false;
      }
    });
  });
}

function actualizarFilaRepetible(e) {
  const el = e.target;
  const fila = el.closest('.fila');
  if (!fila) return;
  if (el.dataset.k === 'fecha_nacimiento') {
    const edad = fila.querySelector('[data-k="edad"]');
    if (edad) edad.value = calcularEdad(el.value);
  }
  const req = fila.querySelector('[data-req]');
  if (req) req.required = filaConDatos(fila);
  if (fila.closest('#g-familiares')) actualizarFilasCondicionales('#g-familiares');
  if (fila.closest('#g-beneficiarios')) actualizarFilasCondicionales('#g-beneficiarios');
}

form.addEventListener('input', actualizarFilaRepetible);
form.addEventListener('change', actualizarFilaRepetible);

/* ---------- Envío ---------- */

function recogerGrupo(nombre) {
  return [...document.querySelectorAll(`#g-${nombre} .fila`)].map((fila, i) => {
    if (!filaConDatos(fila)) return null;
    const fila_ = { orden: i + 1 };
    fila.querySelectorAll('[data-k]').forEach(el => {
      const v = el.value.trim();
      fila_[el.dataset.k] = v === '' ? null : v;
    });
    return fila_;
  }).filter(Boolean);
}

function recogerDatos() {
  const datos = {};
  for (const [k, v] of new FormData(form)) {
    if (v instanceof File) continue;
    datos[k] = String(v).trim() === '' ? null : String(v).trim();
  }
  form.querySelectorAll('input[type="radio"]:checked').forEach(r => { datos[r.name] = Number(r.value); });
  form.querySelectorAll('input[type="checkbox"]').forEach(c => { datos[c.name] = c.checked ? 1 : 0; });
  datos.ubicacion_lat = Number(datos.ubicacion_lat);
  datos.ubicacion_lng = Number(datos.ubicacion_lng);
  Object.keys(GRUPOS).forEach(g => { datos[g] = recogerGrupo(g); });
  return datos;
}

function mostrar(tipo, texto) {
  estado.className = 'estado ' + tipo;
  estado.textContent = texto;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  for (let i = 0; i < pasos.length; i++) {
    if (!validarPaso(i)) {
      mostrarPaso(i);
      validarPaso(i);
      return;
    }
  }
  const archivos = { cedula_frente: 'frente', cedula_reverso: 'reverso' };
  const cuerpo = new FormData();
  for (const [campo, lado] of Object.entries(archivos)) {
    const archivo = form.elements[campo].files[0];
    if (!['image/png', 'image/jpeg'].includes(archivo.type)) {
      mostrar('error', `La cédula (${lado}) debe estar en formato PNG, JPG o JPEG.`);
      return;
    }
    if (archivo.size > MAX_ARCHIVO) {
      mostrar('error', `La cédula (${lado}) supera los 2 MB. Elija una imagen más liviana.`);
      return;
    }
    cuerpo.append(campo, archivo);
  }
  cuerpo.append('datos', JSON.stringify(recogerDatos()));

  boton.disabled = true;
  mostrar('', 'Enviando…');
  try {
    const r = await fetch(API_URL, { method: 'POST', body: cuerpo, credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    form.reset();
    setTimeout(() => mostrar('ok', 'Ficha enviada correctamente.'), 0);
  } catch (err) {
    mostrar('error', `No se pudo enviar la ficha (${err.message}). Revise la conexión e intente de nuevo.`);
  } finally {
    boton.disabled = false;
  }
});

form.addEventListener('reset', () => setTimeout(() => {
  const mensajeExito = estado.classList.contains('ok') ? estado.textContent : '';
  fechaHoy();
  limpiarUbicacion();
  actualizarFilasCondicionales('#g-familiares');
  actualizarFilasCondicionales('#g-beneficiarios');
  mostrarPaso(0);
  if (mensajeExito) mostrar('ok', mensajeExito);
}));

construirGrupos();
construirSiNo();
cargarDepartamentos();
construirNavegacionPasos();
fechaHoy();
