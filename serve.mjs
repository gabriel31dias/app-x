// Servidor de desenvolvimento: arquivos do site + /api/* repassado pra API Nest (porta 3100).
// Uma porta só, então funciona igual pelo ngrok no celular.  Uso: node serve.mjs
import { createServer, request } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { connect } from 'node:net';
import { extname, join, normalize } from 'node:path';

const ROOT = import.meta.dirname, PORT = 8765, API = { host: '127.0.0.1', port: 3100 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const up = request({ ...API, path: req.url.slice(4), method: req.method, headers: { ...req.headers, host: `${API.host}:${API.port}` } }, r => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    up.on('error', () => { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"message":"API fora do ar"}'); });
    return req.pipe(up);
  }
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
  // só arquivos do projeto; nada de api/, .env ou node_modules
  if (!file.startsWith(ROOT) || /[\\/](api|node_modules)[\\/]|[\\/]\./.test(file.slice(ROOT.length))) { res.writeHead(404); return res.end(); }
  try {
    if (!statSync(file).isFile()) throw 0;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('não encontrado'); }
})
  // WebSocket (painel ao vivo, /api/socket.io): repassa a conexão crua pra API, tirando o /api do caminho
  .on('upgrade', (req, sock, head) => {
    if (!req.url.startsWith('/api/')) return sock.destroy();
    const up = connect(API.port, API.host, () => {
      const headers = [];
      for (let i = 0; i < req.rawHeaders.length; i += 2) headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(`${req.method} ${req.url.slice(4)} HTTP/${req.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`);
      up.write(head);
      sock.pipe(up).pipe(sock);
    });
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
  })
  .listen(PORT, '0.0.0.0', () => console.log(`site em http://localhost:${PORT} (API em /api → :${API.port})`));
