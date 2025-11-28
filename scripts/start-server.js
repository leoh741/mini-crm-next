#!/usr/bin/env node
// Script wrapper para iniciar el servidor Next.js standalone escuchando en 0.0.0.0

// Configurar variables de entorno ANTES de cargar cualquier módulo
process.env.HOSTNAME = '0.0.0.0';
process.env.HOST = '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Interceptar http.createServer para forzar hostname
const http = require('http');
const originalCreateServer = http.createServer;

http.createServer = function(...args) {
  const server = originalCreateServer.apply(this, args);
  const originalListen = server.listen.bind(server);
  
  server.listen = function(...listenArgs) {
    // Si el primer argumento es un número (puerto), agregar hostname
    if (typeof listenArgs[0] === 'number') {
      listenArgs = ['0.0.0.0', ...listenArgs];
    } else if (typeof listenArgs[0] === 'object' && listenArgs[0].port) {
      // Si es un objeto de opciones, asegurar host
      listenArgs[0].host = '0.0.0.0';
      listenArgs[0].hostname = '0.0.0.0';
    }
    return originalListen(...listenArgs);
  };
  
  return server;
};

// Cargar y ejecutar el servidor standalone
require('../.next/standalone/server.js');

