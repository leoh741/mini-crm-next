#!/usr/bin/env node
// Script wrapper para iniciar el servidor Next.js standalone escuchando en 0.0.0.0

// Configurar variables de entorno antes de cargar el servidor
process.env.HOSTNAME = '0.0.0.0';
process.env.HOST = '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Cargar y ejecutar el servidor standalone
require('../.next/standalone/server.js');

