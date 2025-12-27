// IMAP Connection Manager
// Gestiona conexiones IMAP de forma centralizada para evitar múltiples conexiones simultáneas
// y manejar errores de conexión de manera robusta

import { ImapFlow } from "imapflow";
import { emailConfig } from "./emailConfig.js";

/**
 * Error personalizado para cuando la conexión IMAP no está disponible
 */
class ConnectionNotAvailableError extends Error {
  constructor(message = "Conexión IMAP no disponible temporalmente") {
    super(message);
    this.name = "ConnectionNotAvailableError";
    this.status = "offline";
  }
}

class ImapConnectionManager {
  constructor() {
    this.client = null;
    this.isConnecting = false;
    this.connectionAvailable = true;
    this.connectionBlockedUntil = null;
    this.offlineUntil = 0; // timestamp en ms - NUEVO: cooldown offline
    this.operationQueue = [];
    this.processingQueue = false;
    this.lastError = null;
    this.connectionTimeout = 30000; // 30 segundos de bloqueo después de un error
    this.consecutiveTimeouts = 0; // Contador de timeouts consecutivos para backoff
    this.lastTimeoutAt = 0; // Timestamp del último timeout
  }

  /**
   * Verifica si el sistema está en modo offline (cooldown activo)
   */
  isOffline() {
    return Date.now() < this.offlineUntil;
  }

  /**
   * Marca el sistema como offline por un tiempo determinado
   * Implementa backoff progresivo: 10s -> 30s -> 60s
   */
  markOffline(ms, reason) {
    const ahora = Date.now();
    
    // Si el último timeout fue hace más de 2 minutos, resetear contador
    if (ahora - this.lastTimeoutAt > 120000) {
      this.consecutiveTimeouts = 0;
    }
    
    // Backoff progresivo basado en timeouts consecutivos
    let cooldownMs = ms;
    if (this.consecutiveTimeouts === 0) {
      cooldownMs = 10000; // 10 segundos para primer timeout
    } else if (this.consecutiveTimeouts === 1) {
      cooldownMs = 30000; // 30 segundos para segundo timeout
    } else {
      cooldownMs = 60000; // 60 segundos para tercer timeout y siguientes
    }
    
    this.offlineUntil = ahora + cooldownMs;
    this.consecutiveTimeouts++;
    this.lastTimeoutAt = ahora;
    
    console.warn(
      `⚠️ IMAP Connection Manager - Marcando sistema como offline por ${cooldownMs / 1000}s (timeout #${this.consecutiveTimeouts}) debido a: ${reason}`
    );
    this.closeConnection();
  }
  
  /**
   * Resetea el contador de timeouts cuando hay una conexión exitosa
   */
  resetTimeoutCounter() {
    if (this.consecutiveTimeouts > 0) {
      console.log(`✅ IMAP: Conexión exitosa, reseteando contador de timeouts (estaba en ${this.consecutiveTimeouts})`);
      this.consecutiveTimeouts = 0;
      this.lastTimeoutAt = 0;
    }
  }

  /**
   * Detecta si un error es de red/timeout
   */
  isNetworkOrTimeoutError(err) {
    if (!err) return false;
    
    const msg = (err && err.message) || '';
    const code = err && err.code;
    
    return (
      code === 'ETIMEOUT' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      /timeout/i.test(msg) ||
      /Connection not available/i.test(msg) ||
      /ECONNRESET/i.test(msg) ||
      /ENOTFOUND/i.test(msg) ||
      /Handshake inactivity timeout/i.test(msg) ||
      err.name === 'ConnectionNotAvailableError'
    );
  }

  /**
   * Verifica si la conexión está disponible y recupera automáticamente si el tiempo expiró
   */
  maybeRecoverFromOffline() {
    // Verificar cooldown offline primero
    if (this.isOffline()) {
      return false; // Todavía en cooldown
    }
    
      // Si el cooldown expiró, limpiar estado offline
      if (this.offlineUntil > 0 && Date.now() >= this.offlineUntil) {
        this.offlineUntil = 0;
        // NO resetear consecutiveTimeouts aquí - solo se resetea en conexión exitosa
        console.log('✅ IMAP: cooldown offline expirado, permitiendo reintentos');
      }
    
    // Verificar bloqueo por error
    if (!this.connectionAvailable && this.connectionBlockedUntil && Date.now() > this.connectionBlockedUntil) {
      this.connectionAvailable = true;
      this.connectionBlockedUntil = null;
      this.lastError = null;
      console.log('✅ IMAP: saliendo de modo offline, reintentando conexiones');
    }
  }

  /**
   * Verifica si la conexión está disponible
   */
  isAvailable() {
    // GATE: Si está en cooldown offline, NO está disponible
    if (this.isOffline()) {
      return false;
    }
    
    this.maybeRecoverFromOffline();
    if (!this.connectionAvailable) {
      if (this.connectionBlockedUntil && Date.now() < this.connectionBlockedUntil) {
        return false;
      }
      // Tiempo de bloqueo expirado, permitir reintento
      this.connectionAvailable = true;
      this.connectionBlockedUntil = null;
      this.lastError = null;
    }
    return this.connectionAvailable;
  }

  /**
   * Método público para verificar disponibilidad (alias para compatibilidad)
   */
  isConnectionAvailable() {
    return this.isAvailable();
  }

  /**
   * Detecta si un error es de red/conexión
   */
  isNetworkError(err) {
    if (!err) return false;
    
    const networkCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'];
    const networkMessages = [
      'timed out',
      'getaddrinfo',
      'Handshake inactivity timeout',
      'Connection not available',
      'NoConnection'
    ];
    
    return (
      networkCodes.includes(err.code) ||
      networkMessages.some(msg => err.message?.includes(msg)) ||
      err.name === 'ConnectionNotAvailableError'
    );
  }

  /**
   * Marca la conexión como no disponible temporalmente (método legacy, usar markOffline)
   */
  markAsUnavailable(error, timeoutMs = null) {
    const timeout = timeoutMs || this.connectionTimeout;
    this.connectionAvailable = false;
    this.connectionBlockedUntil = Date.now() + timeout;
    this.lastError = error;
    // También marcar como offline con cooldown
    if (this.isNetworkOrTimeoutError(error)) {
      this.markOffline(timeout, error?.message || error);
    } else {
      console.warn(`⚠️ IMAP Connection Manager - Marcando sistema como no disponible por ${timeout / 1000}s debido a: ${error?.message || error}`);
    }
    
    // Cerrar conexión actual si existe
    this.closeConnection();
  }

  /**
   * Cierra la conexión actual
   */
  async closeConnection() {
    if (this.client) {
      try {
        if (this.client.authenticated) {
          await this.client.logout();
        }
      } catch (e) {
        // Ignorar errores al cerrar
      }
      this.client = null;
    }
    this.isConnecting = false;
  }

  /**
   * Crea una nueva conexión IMAP
   */
  async createConnection() {
    if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
      throw new Error("Configuración de correo incompleta. Verifica las variables de entorno.");
    }

    if (this.client && this.client.authenticated) {
      return this.client;
    }

    if (this.isConnecting) {
      // Esperar a que termine la conexión en progreso
      let attempts = 0;
      while (this.isConnecting && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      if (this.client && this.client.authenticated) {
        return this.client;
      }
    }

    this.isConnecting = true;

    try {
      const client = new ImapFlow({
        host: emailConfig.host,
        port: emailConfig.imapPort,
        secure: emailConfig.secure,
        auth: {
          user: emailConfig.user,
          pass: emailConfig.pass,
        },
        logger: false,
      });

      // 🔴 CRÍTICO: Configurar listeners de error ANTES de conectar
      // Esto previene que errores de IMAP se conviertan en uncaughtException
      client.on('error', (err) => {
        console.warn(`⚠️ IMAP Client error event: ${err.message || err}`);
        
        // Si es timeout o error de conexión, marcar como offline
        if (this.isNetworkOrTimeoutError(err)) {
          this.markOffline(60000, `Client error: ${err.message || err}`);
        }
        
        // NO re-lanzar el error - ya está manejado
      });

      // Timeout para la conexión
      const connectPromise = client.connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("ETIMEDOUT")), 10000); // 10 segundos timeout
      });

      await Promise.race([connectPromise, timeoutPromise]);

      if (!client.authenticated) {
        throw new Error("Conexión IMAP no autenticada");
      }

      this.client = client;
      this.connectionAvailable = true;
      this.connectionBlockedUntil = null;
      this.lastError = null;
      this.isConnecting = false;
      
      // Resetear contador de timeouts en conexión exitosa
      this.resetTimeoutCounter();

      console.log("✅ IMAP Connection Manager - Conexión establecida exitosamente");
      return client;
    } catch (error) {
      this.isConnecting = false;
      
      // Detectar errores de conexión usando el helper
      if (this.isNetworkOrTimeoutError(error)) {
        this.markOffline(60000, error.message || 'Error de conexión IMAP'); // 60 segundos offline
        const connError = new ConnectionNotAvailableError(`Error de conexión IMAP: ${error.message}`);
        connError.status = 'offline';
        throw connError;
      }

      throw error;
    }
  }

  /**
   * Obtiene o crea una conexión IMAP
   */
  async getConnection() {
    // GATE: Si está offline, NO intentar conectar
    if (this.isOffline()) {
      const error = new ConnectionNotAvailableError('Conexión IMAP no disponible (modo offline)');
      error.status = 'offline';
      throw error;
    }
    
    if (!this.isAvailable()) {
      const error = new ConnectionNotAvailableError(
        `Conexión IMAP bloqueada hasta ${new Date(this.connectionBlockedUntil || this.offlineUntil).toISOString()}`
      );
      error.status = 'offline';
      throw error;
    }

    if (this.client && this.client.authenticated) {
      return this.client;
    }

    return await this.createConnection();
  }

  /**
   * Ejecuta una operación con un cliente IMAP, manejando la conexión automáticamente
   * @param {Function} operation - Función async que recibe el cliente IMAP
   * @returns {Promise<any>} - Resultado de la operación
   */
  async withImapClient(operation) {
    // Agregar a la cola
    return new Promise((resolve, reject) => {
      this.operationQueue.push({ operation, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Procesa la cola de operaciones de forma serializada
   */
  async processQueue() {
    if (this.processingQueue || this.operationQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.operationQueue.length > 0) {
      const { operation, resolve, reject } = this.operationQueue.shift();

      try {
        // Verificar disponibilidad antes de cada operación
        this.maybeRecoverFromOffline();
        if (!this.isAvailable()) {
          reject(new ConnectionNotAvailableError("Conexión IMAP no disponible"));
          continue;
        }

        // Obtener o crear conexión
        const client = await this.getConnection();

        // Ejecutar operación
        const result = await operation(client);
        resolve(result);
      } catch (error) {
        // Si es error de conexión, marcar como no disponible
        if (this.isNetworkOrTimeoutError(error) && !(error instanceof ConnectionNotAvailableError)) {
          this.markOffline(60000, error.message || 'Error de conexión'); // 60 segundos offline
          const connError = new ConnectionNotAvailableError(`Error de conexión: ${error.message}`);
          connError.status = 'offline';
          reject(connError);
        } else {
          reject(error);
        }
      }
    }

    this.processingQueue = false;
  }

  /**
   * Fuerza el cierre de la conexión (útil para testing o reinicio)
   */
  async forceClose() {
    await this.closeConnection();
    this.connectionAvailable = true;
    this.connectionBlockedUntil = null;
  }

  /**
   * Obtiene el estado actual de la conexión
   */
  getStatus() {
    return {
      available: this.isAvailable(),
      connected: this.client?.authenticated || false,
      blockedUntil: this.connectionBlockedUntil,
      queueLength: this.operationQueue.length,
      lastError: this.lastError?.message || null,
    };
  }
}

// Singleton instance
const imapManager = new ImapConnectionManager();

export { imapManager, ConnectionNotAvailableError };

