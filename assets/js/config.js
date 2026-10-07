'use strict';

const isLocalFrontend = window.location.protocol === 'file:'
  || ['localhost', '127.0.0.1'].includes(window.location.hostname);

window.RRHH_API_BASE_URL = isLocalFrontend
  ? 'http://localhost:3001'
  : 'https://api.cracotech.com';
