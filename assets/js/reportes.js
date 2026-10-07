'use strict';

const loginPanel = document.getElementById('login-panel');
const reportesPanel = document.getElementById('reportes-panel');
const loginForm = document.getElementById('login-form');
const loginEstado = document.getElementById('login-estado');
const reportesEstado = document.getElementById('reportes-estado');
const filas = document.getElementById('fichas');
const apiBaseUrl = window.RRHH_API_BASE_URL;
const tokenAuthMode = window.location.protocol === 'file:'
  || window.location.hostname === 'tendyry01.github.io';
let localFileToken = window.location.protocol === 'file:'
  ? new URLSearchParams(window.location.hash.slice(1)).get('token')
  : window.location.hostname === 'tendyry01.github.io'
    ? window.sessionStorage.getItem('rrhh.report.token')
    : null;
if (localFileToken) {
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}
const filtros = {
  q: document.getElementById('busqueda-general'),
  empresa: document.getElementById('filtro-empresa'),
  nombre: document.getElementById('filtro-nombre'),
  apellido: document.getElementById('filtro-apellido'),
  nro_cedula: document.getElementById('filtro-cedula')
};
let solicitudFichas = 0;
let temporizadorFiltro;

async function api(url, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(window.location.protocol === 'file:' && localFileToken ? { Authorization: `Bearer ${localFileToken}` } : {}),
    ...options.headers
  };
  if (tokenAuthMode && localFileToken) {
    headers.Authorization = `Bearer ${localFileToken}`;
  }
  const response = await fetch(`${apiBaseUrl}${url}`, {
    credentials: tokenAuthMode ? 'omit' : 'include',
    ...options,
    headers
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result.error || `Error HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function mostrarLogin(mensaje = '') {
  loginPanel.hidden = false;
  reportesPanel.hidden = true;
  loginEstado.textContent = mensaje;
  loginEstado.className = 'estado';
}

function mostrarReportes(usuario) {
  loginPanel.hidden = true;
  reportesPanel.hidden = false;
  document.getElementById('usuario-actual').textContent = `Sesión: ${usuario.username}`;
  cargarFichas();
}

async function cargarFichas() {
  const solicitud = ++solicitudFichas;
  filas.replaceChildren();
  reportesEstado.textContent = 'Cargando fichas…';
  try {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([key, input]) => {
      if (input.value.trim()) params.set(key, input.value.trim());
    });
    const fichas = await api(`/api/fichas?${params}`);
    if (solicitud !== solicitudFichas) return;
    reportesEstado.textContent = '';
    if (fichas.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'vacio';
      td.textContent = 'No hay fichas para mostrar.';
      tr.append(td);
      filas.append(tr);
      return;
    }
    fichas.forEach(ficha => {
      const tr = document.createElement('tr');
      for (const value of [ficha.empresa, ficha.nombres, ficha.apellidos]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      const cedula = document.createElement('td');
      const contenido = document.createElement('div');
      contenido.className = 'celda-cedula';
      const numero = document.createElement('span');
      numero.textContent = ficha.nro_cedula;
      const enlace = document.createElement('a');
      enlace.className = 'boton-pdf';
      enlace.href = `ficha.html?id=${encodeURIComponent(ficha.id)}`;
      if (window.location.protocol === 'file:' && localFileToken) {
        enlace.href += `#token=${encodeURIComponent(localFileToken)}`;
      }
      enlace.textContent = 'Ver ficha PDF';
      enlace.setAttribute('aria-label', `Ver ficha de ${ficha.nombres} ${ficha.apellidos} en PDF`);
      contenido.append(numero, enlace);
      cedula.append(contenido);
      tr.append(cedula);
      filas.append(tr);
    });
  } catch (error) {
    if (solicitud === solicitudFichas) {
      if (error.status === 401) {
        filas.replaceChildren();
        mostrarLogin('La sesión expiró. Inicie sesión nuevamente para consultar los reportes.');
        return;
      }
      reportesEstado.textContent = error.message;
    }
  }
}

function programarBusqueda() {
  clearTimeout(temporizadorFiltro);
  temporizadorFiltro = setTimeout(cargarFichas, 250);
}

Object.values(filtros).forEach(input => {
  input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', programarBusqueda);
});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  loginEstado.textContent = 'Verificando acceso…';
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    localFileToken = tokenAuthMode ? result.token : null;
    if (window.location.hostname === 'tendyry01.github.io' && localFileToken) {
      window.sessionStorage.setItem('rrhh.report.token', localFileToken);
    }
    loginForm.reset();
    mostrarReportes(result);
  } catch (error) {
    mostrarLogin(error.message);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('cerrar-sesion').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    localFileToken = null;
    if (window.location.hostname === 'tendyry01.github.io') {
      window.sessionStorage.removeItem('rrhh.report.token');
    }
    mostrarLogin('La sesión se cerró correctamente.');
  } catch (error) {
    reportesEstado.textContent = error.message;
  }
});

api('/api/auth/session')
  .then(result => result.authenticated ? mostrarReportes(result.user) : mostrarLogin())
  .catch(error => mostrarLogin(error.message));
