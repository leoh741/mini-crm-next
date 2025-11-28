#!/usr/bin/env node
// Script wrapper para iniciar el servidor Next.js standalone escuchando en 0.0.0.0

// Configurar variables de entorno ANTES de cargar cualquier módulo
process.env.HOSTNAME = '0.0.0.0';
process.env.HOST = '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Interceptar http.createServer y net.createServer para forzar hostname
const http = require('http');
const https = require('https');
const net = require('net');

function patchServerListen(server) {
  const originalListen = server.listen.bind(server);
  
  server.listen = function(...listenArgs) {
    // Si el primer argumento es un número (puerto), agregar hostname
    if (typeof listenArgs[0] === 'number') {
      // Si solo hay puerto, agregar hostname antes
      if (listenArgs.length === 1 || (listenArgs.length === 2 && typeof listenArgs[1] === 'function')) {
        listenArgs = ['0.0.0.0', ...listenArgs];
      } else if (listenArgs.length >= 2 && typeof listenArgs[1] !== 'function') {
        // Ya tiene hostname, reemplazarlo
        listenArgs[1] = '0.0.0.0';
      }
    } else if (typeof listenArgs[0] === 'object' && listenArgs[0] !== null) {
      // Si es un objeto de opciones, asegurar host
      listenArgs[0].host = '0.0.0.0';
      listenArgs[0].hostname = '0.0.0.0';
      listenArgs[0].address = '0.0.0.0';
    }
    return originalListen(...listenArgs);
  };
  
  return server;
}

const originalHttpCreateServer = http.createServer;
http.createServer = function(...args) {
  const server = originalHttpCreateServer.apply(this, args);
  return patchServerListen(server);
};

const originalHttpsCreateServer = https.createServer;
https.createServer = function(...args) {
  const server = originalHttpsCreateServer.apply(this, args);
  return patchServerListen(server);
};

const originalNetCreateServer = net.createServer;
net.createServer = function(...args) {
  const server = originalNetCreateServer.apply(this, args);
  return patchServerListen(server);
};

// Cargar y ejecutar el servidor standalone
require('../.next/standalone/server.js');

