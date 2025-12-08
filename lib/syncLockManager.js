// Sistema de locks por carpeta para prevenir sincronizaciones simultáneas
// Evita que múltiples requests de sync para la misma carpeta se ejecuten al mismo tiempo

/**
 * Lock por carpeta con información de estado
 */
class FolderSyncLock {
  constructor(carpeta) {
    this.carpeta = carpeta;
    this.iniciado = Date.now();
    this.promesa = null;
    this.timeout = null;
  }

  /**
   * Verifica si el lock está activo (no expirado)
   */
  isActive(maxAge = 20000) {
    return Date.now() - this.iniciado < maxAge;
  }
}

/**
 * Manager de locks de sincronización
 * Singleton para evitar múltiples syncs simultáneas por carpeta
 */
class SyncLockManager {
  constructor() {
    // Map<carpeta, FolderSyncLock>
    this.locks = new Map();
    
    // Tiempo máximo que un lock puede estar activo (20 segundos)
    this.MAX_LOCK_AGE = 20000;
    
    // Limpiar locks expirados cada 5 segundos
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks();
    }, 5000);
  }

  /**
   * Intenta adquirir un lock para una carpeta
   * @param {string} carpeta - Nombre de la carpeta
   * @returns {Promise<{acquired: boolean, waitForResult?: Promise}>}
   *   - acquired: true si se adquirió el lock, false si ya hay una sync en curso
   *   - waitForResult: Promise que resuelve cuando la sync en curso termine (si acquired=false)
   */
  async acquireLock(carpeta) {
    const normalizedCarpeta = this.normalizeCarpeta(carpeta);
    
    // Limpiar locks expirados antes de verificar
    this.cleanupExpiredLocks();
    
    const existingLock = this.locks.get(normalizedCarpeta);
    
    // Si hay un lock activo, esperar a que termine
    if (existingLock && existingLock.isActive(this.MAX_LOCK_AGE)) {
      console.log(`🔒 Lock activo para ${normalizedCarpeta}, esperando resultado de sync en curso...`);
      
      // Retornar la promesa de la sync en curso
      return {
        acquired: false,
        waitForResult: existingLock.promesa || Promise.resolve(null)
      };
    }
    
    // Crear nuevo lock
    const lock = new FolderSyncLock(normalizedCarpeta);
    this.locks.set(normalizedCarpeta, lock);
    
    console.log(`✅ Lock adquirido para ${normalizedCarpeta}`);
    
    return {
      acquired: true,
      lock
    };
  }

  /**
   * Libera un lock y guarda el resultado de la sync
   * @param {string} carpeta - Nombre de la carpeta
   * @param {any} resultado - Resultado de la sincronización
   */
  releaseLock(carpeta, resultado) {
    const normalizedCarpeta = this.normalizeCarpeta(carpeta);
    const lock = this.locks.get(normalizedCarpeta);
    
    if (lock) {
      // Resolver la promesa con el resultado
      if (lock.promesaResolver) {
        lock.promesaResolver(resultado);
      }
      
      // Eliminar el lock
      this.locks.delete(normalizedCarpeta);
      console.log(`🔓 Lock liberado para ${normalizedCarpeta}`);
    }
  }

  /**
   * Establece la promesa de una sync en curso
   * @param {string} carpeta - Nombre de la carpeta
   * @param {Promise} promesa - Promesa de la sincronización
   */
  setSyncPromise(carpeta, promesa) {
    const normalizedCarpeta = this.normalizeCarpeta(carpeta);
    const lock = this.locks.get(normalizedCarpeta);
    
    if (lock) {
      lock.promesa = promesa;
      
      // Crear un resolver para la promesa
      let resolver;
      const promiseWithResolver = new Promise((resolve) => {
        resolver = resolve;
      });
      lock.promesaResolver = resolver;
      
      // Cuando la promesa se resuelva, resolver también el resolver
      promesa
        .then((resultado) => {
          resolver(resultado);
        })
        .catch((error) => {
          resolver({ error });
        });
    }
  }

  /**
   * Limpia locks expirados
   */
  cleanupExpiredLocks() {
    const now = Date.now();
    for (const [carpeta, lock] of this.locks.entries()) {
      if (!lock.isActive(this.MAX_LOCK_AGE)) {
        console.warn(`⚠️ Limpiando lock expirado para ${carpeta}`);
        this.locks.delete(carpeta);
      }
    }
  }

  /**
   * Normaliza el nombre de la carpeta para consistencia
   */
  normalizeCarpeta(carpeta) {
    if (!carpeta) return 'INBOX';
    return carpeta.toUpperCase();
  }

  /**
   * Obtiene el estado de los locks (útil para debugging)
   */
  getStatus() {
    const status = {};
    for (const [carpeta, lock] of this.locks.entries()) {
      status[carpeta] = {
        iniciado: new Date(lock.iniciado).toISOString(),
        edad: Date.now() - lock.iniciado,
        activo: lock.isActive(this.MAX_LOCK_AGE)
      };
    }
    return status;
  }

  /**
   * Limpia todos los locks (útil para testing o shutdown)
   */
  clearAll() {
    this.locks.clear();
  }
}

// Singleton
export const syncLockManager = new SyncLockManager();

