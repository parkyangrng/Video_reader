#!/usr/bin/env node
// Zero-dependency static file server for local development, plus an
// auto-open of the default browser once it's up.
//
// Why this exists: opening index.html directly via file:// often breaks
// YouTube playback. The IFrame Player API talks to its embedded iframe via
// postMessage, and file:// pages are treated as opaque/unique origins by
// most browsers, which can silently break that communication (the player
// never reports "ready", or playback controls stop working). Some proxy
// services used for transcript fetching also reject file:// origins.
// Serving the app from a real http://localhost origin avoids all of that.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const DEFAULT_PORT = 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Resolves a request URL to a path inside ROOT, rejecting anything that
// would escape it (e.g. "/../../etc/passwd").
function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = path.normalize(path.join(ROOT, decoded));
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (target !== ROOT && !target.startsWith(rootWithSep)) return null;
  return target;
}

function handleRequest(req, res) {
  let filePath = resolveSafePath(req.url === '/' ? '/index.html' : req.url);
  if (!filePath) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? `open "${url}"` : platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {
    /* best-effort; if it fails the console URL is still printed below */
  });
}

function startServer(port) {
  const server = http.createServer(handleRequest);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\nYouTube Video Reader is running at ${url}`);
    console.log('Press Ctrl+C to stop.\n');
    openBrowser(url);
  });
}

const portArg = parseInt(process.argv[2], 10);
startServer(Number.isFinite(portArg) ? portArg : DEFAULT_PORT);
