#!/usr/bin/env node
/**
 * Instant-start proxy for port 5000.
 * Holds port 5000 immediately so the Replit canvas never sees ECONNREFUSED.
 * Shows a loading page until Next.js is ready on port 5001, then proxies all traffic.
 */
const http = require("http");
const net = require("net");

const PROXY_PORT = 5000;
const NEXT_PORT = 5001;

let nextReady = false;

const LOADING_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="refresh" content="1"/>
  <title>Starting...</title>
  <style>
    body { margin:0; display:flex; align-items:center; justify-content:center;
           min-height:100vh; background:#f1f1ef; font-family:sans-serif; }
    .dot { width:8px; height:8px; background:#3dc3ff; border-radius:50%;
           display:inline-block; margin:0 3px; animation:pulse 1s infinite alternate; }
    .dot:nth-child(2){animation-delay:.3s}
    .dot:nth-child(3){animation-delay:.6s}
    @keyframes pulse{to{opacity:.2}}
  </style>
</head>
<body>
  <div>
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </div>
</body>
</html>`;

function checkNext(callback) {
  const socket = net.createConnection(NEXT_PORT, "127.0.0.1");
  socket.once("connect", () => { socket.destroy(); callback(true); });
  socket.once("error", () => { socket.destroy(); callback(false); });
}

function pollUntilReady() {
  checkNext((ready) => {
    if (ready) {
      nextReady = true;
      console.log("[proxy] Next.js is ready — proxying all traffic");
    } else {
      setTimeout(pollUntilReady, 200);
    }
  });
}

function proxyRequest(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: NEXT_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", () => {
    nextReady = false;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(LOADING_HTML);
    pollUntilReady();
  });
  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  if (nextReady) {
    proxyRequest(req, res);
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(LOADING_HTML);
  }
});

// Also proxy WebSocket connections (needed for HMR / Fast Refresh)
server.on("upgrade", (req, socket, head) => {
  const proxySocket = net.createConnection(NEXT_PORT, "127.0.0.1");
  proxySocket.once("connect", () => {
    proxySocket.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
      `\r\n\r\n`
    );
    if (head && head.length) proxySocket.write(head);
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });
  proxySocket.once("error", () => socket.destroy());
  socket.once("error", () => proxySocket.destroy());
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`[proxy] Holding port ${PROXY_PORT} — waiting for Next.js on ${NEXT_PORT}`);
  pollUntilReady();
});
