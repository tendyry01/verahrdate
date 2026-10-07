'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.FRONTEND_PORT || 3000);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Solicitud inválida.');
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`) || relativePath.split(/[\\/]/).some(part => part.startsWith('.'))) {
    res.writeHead(403).end('Acceso denegado.');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    const resolvedPath = stats?.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    fs.readFile(resolvedPath, (readError, content) => {
      if (statError || readError) {
        res.writeHead(404).end('Recurso no encontrado.');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentTypes[path.extname(resolvedPath).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Frontend local disponible en http://localhost:${port}`);
});
