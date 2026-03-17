'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

function createHttpServer(rootDir, port) {
  const server = http.createServer((req, res) => {
    let filePath = req.url.split('?')[0];
    if (filePath === '/') filePath = '/index.html';

    const fullPath = path.join(rootDir, filePath);
    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (!fullPath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end();
      return;
    }

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        if (ext === '.png' || ext === '.jpg' || ext === '.gif') {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end();
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`HTTP server listening on http://localhost:${port}`);
  });

  return server;
}

module.exports = createHttpServer;
