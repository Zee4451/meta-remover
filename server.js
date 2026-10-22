/**
 * GhostMeta AI - Local Privacy-First HTTP Server
 * Serves static web assets and provides local Content-Disposition download endpoints
 * to guarantee that Chrome/Windows always saves files with their exact filename & extension.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

// In-memory temporary download cache (stores cleaned bytes on localhost for 5 minutes)
const downloadCache = new Map();

// Periodic cleanup of expired downloads
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of downloadCache.entries()) {
    if (now - data.timestamp > 300000) { // 5 minutes
      downloadCache.delete(id);
    }
  }
}, 60000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  console.log(`${new Date().toLocaleTimeString()} [${req.method}] ${pathname}`);

  // 1. API: Store Cleaned Download Temporarily
  if (req.method === 'POST' && pathname === '/api/store-download') {
    const rawFilename = req.headers['x-filename'] || 'cleaned_media.mp4';
    let filename = 'cleaned_media.mp4';
    try {
      filename = decodeURIComponent(rawFilename);
    } catch {
      filename = rawFilename;
    }
    const mimeType = req.headers['content-type'] || 'application/octet-stream';

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const downloadId = Math.random().toString(36).substring(2, 12);

      downloadCache.set(downloadId, {
        buffer,
        filename,
        mimeType,
        timestamp: Date.now()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, downloadId, filename }));
    });
    return;
  }

  // 2. API: Serve Download with Real Content-Disposition Attachment Header
  if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/get-download') {
    const id = parsedUrl.searchParams.get('id');
    const data = downloadCache.get(id);

    if (!data) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Download expired or not found.');
      return;
    }

    const safeFilename = data.filename.replace(/[<>:"/\\|?*]/g, '_');
    
    // Send standard RFC 6266 & RFC 5987 Content-Disposition header
    res.writeHead(200, {
      'Content-Type': data.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
      'Content-Length': data.buffer.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    res.end(data.buffer);
    // Cleanup after sending after 60s
    setTimeout(() => downloadCache.delete(id), 60000);
    return;
  }

  // 3. Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🛡️ GhostMeta AI Mobile & Desktop Server Running:`);
  console.log(`   • Desktop: http://localhost:${PORT}`);
  console.log(`   • Mobile:  http://192.168.1.5:${PORT}`);
  console.log(`======================================================\n`);
});
