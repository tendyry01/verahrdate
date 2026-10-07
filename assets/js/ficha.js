'use strict';

const state = document.getElementById('estado');
const documentFrame = document.getElementById('documento');
const id = new URLSearchParams(window.location.search).get('id');
const tokenAuthMode = window.location.protocol === 'file:'
  || window.location.hostname === 'tendyry01.github.io';
const localFileMode = window.location.protocol === 'file:';
const localFileToken = window.location.protocol === 'file:'
  ? new URLSearchParams(window.location.hash.slice(1)).get('token')
  : window.location.hostname === 'tendyry01.github.io'
    ? window.sessionStorage.getItem('rrhh.report.token')
    : null;

if (localFileMode && localFileToken) {
  document.querySelectorAll('a[href="./index.html"]').forEach(link => {
    link.href = `./index.html#token=${encodeURIComponent(localFileToken)}`;
  });
}

if (!id || !/^[1-9]\d*$/.test(id)) {
  state.textContent = 'El identificador de la ficha no es válido.';
  documentFrame.hidden = true;
} else if (tokenAuthMode && !localFileToken) {
  state.textContent = 'Inicie sesión nuevamente desde los reportes para ver el PDF.';
  documentFrame.hidden = true;
} else {
  const pdfUrl = `${window.RRHH_API_BASE_URL}/api/fichas/${encodeURIComponent(id)}/pdf`;
  if (localFileToken) {
    if (localFileMode) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    fetch(pdfUrl, {
      credentials: 'omit',
      headers: { Authorization: `Bearer ${localFileToken}` }
    })
      .then(async response => {
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || `Error HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then(pdf => {
        const objectUrl = URL.createObjectURL(pdf);
        documentFrame.src = objectUrl;
        window.addEventListener('pagehide', () => URL.revokeObjectURL(objectUrl), { once: true });
        state.textContent = '';
      })
      .catch(error => {
        state.textContent = error.message;
        documentFrame.hidden = true;
      });
  } else {
    documentFrame.src = pdfUrl;
    documentFrame.addEventListener('load', () => {
      state.textContent = '';
    }, { once: true });
  }
}
