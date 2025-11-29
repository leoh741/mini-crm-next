// Sistema de auditoría para registrar todas las operaciones críticas
// Esto ayuda a identificar cuándo y por qué se borran datos

import fs from 'fs';
import path from 'path';

const AUDIT_LOG_DIR = path.join(process.cwd(), 'logs');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'audit.log');

// Asegurar que el directorio de logs existe
// Usar try-catch para manejar errores de permisos
try {
  if (!fs.existsSync(AUDIT_LOG_DIR)) {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    console.log(`[AUDIT] Directorio de logs creado: ${AUDIT_LOG_DIR}`);
  }
} catch (error) {
  console.error(`[AUDIT] Error al crear directorio de logs: ${error.message}`);
  // Continuar de todas formas, el log fallará pero no romperá la aplicación
}

function formatTimestamp() {
  return new Date().toISOString();
}

function formatLogEntry(level, operation, details) {
  const timestamp = formatTimestamp();
  const detailsStr = typeof details === 'object' ? JSON.stringify(details, null, 2) : details;
  return `[${timestamp}] [${level}] [${operation}] ${detailsStr}\n`;
}

export function logOperation(operation, details) {
  try {
    const entry = formatLogEntry('INFO', operation, details);
    fs.appendFileSync(AUDIT_LOG_FILE, entry, 'utf8');
    console.log(`[AUDIT] ${operation}:`, details);
  } catch (error) {
    console.error('[AUDIT] Error al escribir log:', error);
  }
}

export function logWarning(operation, details) {
  try {
    const entry = formatLogEntry('WARNING', operation, details);
    fs.appendFileSync(AUDIT_LOG_FILE, entry, 'utf8');
    console.warn(`[AUDIT WARNING] ${operation}:`, details);
  } catch (error) {
    console.error('[AUDIT] Error al escribir log:', error);
  }
}

export function logError(operation, details) {
  try {
    const entry = formatLogEntry('ERROR', operation, details);
    fs.appendFileSync(AUDIT_LOG_FILE, entry, 'utf8');
    console.error(`[AUDIT ERROR] ${operation}:`, details);
  } catch (error) {
    console.error('[AUDIT] Error al escribir log:', error);
  }
}

export function logDeleteOperation(collection, count, reason, metadata = {}) {
  const details = {
    collection,
    count,
    reason,
    metadata,
    timestamp: formatTimestamp()
  };
  logWarning('DELETE_OPERATION', details);
  return details;
}

export function logDatabaseState(operation, state) {
  logOperation(`DB_STATE_${operation}`, state);
}

export async function getDatabaseCounts(connectDB, models) {
  try {
    await connectDB();
    const counts = {};
    for (const [name, Model] of Object.entries(models)) {
      try {
        counts[name] = await Model.countDocuments({});
      } catch (error) {
        counts[name] = `ERROR: ${error.message}`;
      }
    }
    return counts;
  } catch (error) {
    return { error: error.message };
  }
}

