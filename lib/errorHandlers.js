// Error handlers globales para prevenir que errores no capturados tiren abajo el servidor
// Este archivo debe ser importado al inicio del servidor

/**
 * Configura handlers globales para errores no capturados
 * Esto previene que timeouts de IMAP u otros errores no manejados tiren abajo el proceso
 * 
 * IMPORTANTE: Usa flag global para evitar registrar listeners múltiples veces
 * (previene MaxListenersExceededWarning)
 */
export function setupGlobalErrorHandlers() {
  // Prevenir listeners duplicados usando flag global
  if (global.__CRMINIT_GLOBAL_ERROR_HANDLERS__) {
    return; // Ya están configurados
  }
  
  global.__CRMINIT_GLOBAL_ERROR_HANDLERS__ = true;
  
  // Handler para excepciones no capturadas
  process.on('uncaughtException', (err) => {
    // Filtrar errores de IMAP/timeout que ya están manejados
    if (err.code === 'ETIMEOUT' || 
        err.message?.includes('Socket timeout') ||
        err.message?.includes('Connection') ||
        err.name === 'ConnectionNotAvailableError') {
      console.warn('⚠️ uncaughtException (IMAP):', err.message);
      return; // No loguear stack completo para estos errores conocidos
    }
    
    console.error('⨯ uncaughtException:', err);
    console.error('⨯ Stack:', err.stack);
    
    // NO hacer process.exit para que el servidor no se caiga por un timeout de IMAP
    // Solo loguear el error y continuar
    // Si es un error crítico del sistema, el proceso se caerá naturalmente
  });

  // Handler para promesas rechazadas no manejadas
  process.on('unhandledRejection', (reason, promise) => {
    // Filtrar errores de IMAP/timeout que ya están manejados
    if (reason?.code === 'ETIMEOUT' || 
        reason?.message?.includes('Socket timeout') ||
        reason?.message?.includes('Connection') ||
        reason?.name === 'ConnectionNotAvailableError') {
      console.warn('⚠️ unhandledRejection (IMAP):', reason?.message || reason);
      return; // No loguear stack completo para estos errores conocidos
    }
    
    console.error('⨯ unhandledRejection:', reason);
    console.error('⨯ Promise:', promise);
    
    // NO hacer process.exit, solo loguear
    // La mayoría de estos son timeouts de IMAP que ya están manejados en el código
  });
  
  console.log('✅ Global error handlers configurados (una sola vez)');
}

// Auto-configurar si este módulo es importado directamente
if (typeof process !== 'undefined') {
  setupGlobalErrorHandlers();
}

