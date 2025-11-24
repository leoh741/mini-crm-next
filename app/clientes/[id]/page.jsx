"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getClienteById, eliminarCliente, guardarEstadoPagoMes, guardarEstadoPagoServicio, limpiarCacheClientes, getEstadoPagoMes } from "../../../lib/clientesUtils";
import { getTotalCliente, getTotalPagadoCliente, getTotalPendienteCliente, todosLosServiciosPagados } from "../../../lib/clienteHelpers";
import { generarResumenPagoPDF } from "../../../lib/pdfGenerator";
import Link from "next/link";
import ProtectedRoute from "../../../components/ProtectedRoute";

function ClienteDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id;
  const [cliente, setCliente] = useState(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actualizandoPago, setActualizandoPago] = useState(false);
  const [estadoPagoMes, setEstadoPagoMes] = useState(null);
  const [actualizandoServicio, setActualizandoServicio] = useState(null);
  
  const fromPagos = searchParams.get('from') === 'pagos';

  useEffect(() => {
    const cargarCliente = async () => {
      try {
        setLoading(true);
        setError("");
        
        if (!id) {
          setError("ID de cliente no proporcionado");
          setLoading(false);
          return;
        }
        
        console.log('Buscando cliente con ID:', id);
        
        // Intentar cargar sin caché primero para obtener datos frescos
        let clienteData = await getClienteById(id, false);
        
        // Si no se encuentra, intentar con caché
        if (!clienteData) {
          console.warn('Cliente no encontrado sin caché, intentando con caché...');
          clienteData = await getClienteById(id, true);
        }
        
        if (clienteData) {
          // Asegurar que pagado sea un booleano
          clienteData.pagado = Boolean(clienteData.pagado);
          setCliente(clienteData);
          setError("");
          console.log('Cliente cargado exitosamente:', clienteData.nombre);
          
          // Cargar estado de pago del mes actual SIN CACHÉ para obtener datos frescos
          const hoy = new Date();
          const mesActual = hoy.getMonth();
          const añoActual = hoy.getFullYear();
          const clienteId = clienteData._id || clienteData.id || clienteData.crmId;
          
          // Cargar sin caché para asegurar datos actualizados
          const estado = await getEstadoPagoMes(clienteId, mesActual, añoActual, false);
          
          // Si el cliente tiene servicios, sincronizar el estado pagado general con serviciosPagados
          if (clienteData.servicios && Array.isArray(clienteData.servicios) && clienteData.servicios.length > 0) {
            const serviciosPagados = estado?.serviciosPagados || {};
            const todosPagadosCalculados = todosLosServiciosPagados(clienteData, serviciosPagados);
            
            // Si el estado calculado difiere del estado general, actualizar
            if (clienteData.pagado !== todosPagadosCalculados) {
              clienteData.pagado = todosPagadosCalculados;
              setCliente(clienteData);
            }
          }
          
          setEstadoPagoMes(estado || { serviciosPagados: {} });
        } else {
          console.error('Cliente no encontrado con ID:', id);
          setError(`Cliente no encontrado. ID: ${id}`);
        }
      } catch (err) {
        console.error('Error al cargar cliente:', err);
        setError(`Error al cargar el cliente: ${err.message || 'Error desconocido'}`);
      } finally {
        setLoading(false);
      }
    };
    cargarCliente();
    
    // Recargar cuando cambia el parámetro refresh en la URL
    const refreshParam = searchParams.get('refresh');
    if (refreshParam) {
      // Forzar recarga después de un pequeño delay para asegurar que la BD se actualizó
      const timer = setTimeout(() => {
        cargarCliente();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [id, searchParams]);

  // Calcular estado real del cliente basado en serviciosPagados
  const estadoRealCliente = cliente && cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 0
    ? todosLosServiciosPagados(cliente, estadoPagoMes?.serviciosPagados || {})
    : cliente?.pagado || false;

  const handleEliminar = async () => {
    setEliminando(true);
    const resultado = await eliminarCliente(id);
    
    if (resultado) {
      router.push(fromPagos ? "/pagos" : "/clientes");
    } else {
      alert("Error al eliminar el cliente. Por favor, intenta nuevamente.");
      setEliminando(false);
      setMostrarConfirmacion(false);
    }
  };

  const handleTogglePagado = async () => {
    if (!cliente || actualizandoPago) return;
    
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const añoActual = hoy.getFullYear();
    const clienteId = cliente._id || cliente.id || cliente.crmId;
    const serviciosPagados = estadoPagoMes?.serviciosPagados || {};
    
    // Si hay servicios, marcar/desmarcar todos según el estado actual
    if (cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 0) {
      const todosPagados = todosLosServiciosPagados(cliente, serviciosPagados);
      const nuevosServiciosPagados = {};
      
      // Marcar todos como pagados o no pagados según el estado
      cliente.servicios.forEach((_, index) => {
        nuevosServiciosPagados[index] = !todosPagados;
      });
      
      await handleActualizarServiciosPagados(nuevosServiciosPagados);
      return;
    }
    
    // Para clientes sin servicios (compatibilidad)
    // Calcular estado actual basado en serviciosPagados si tiene servicios
    const estadoActual = cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 0
      ? todosLosServiciosPagados(cliente, serviciosPagados)
      : cliente.pagado;
    const nuevoEstado = !estadoActual;
    
    // Actualización optimista: cambiar estado inmediatamente en la UI
    setCliente(prev => prev ? { ...prev, pagado: nuevoEstado } : null);
    setActualizandoPago(true);
    
    try {
      const { actualizarCliente } = await import('../../../lib/clientesUtils');
      
      const [resultadoMensual, resultadoCliente] = await Promise.allSettled([
        guardarEstadoPagoMes(clienteId, mesActual, añoActual, nuevoEstado),
        actualizarCliente(id, { pagado: nuevoEstado }, false) // false = no limpiar caché aquí
      ]);
      
      // Verificar si al menos una actualización fue exitosa
      const mensualExitoso = resultadoMensual.status === 'fulfilled' && resultadoMensual.value === true;
      const clienteExitoso = resultadoCliente.status === 'fulfilled' && resultadoCliente.value === true;
      
      if (!mensualExitoso && !clienteExitoso) {
        // Revertir cambio si ambas fallaron
        setCliente(prev => prev ? { ...prev, pagado: !nuevoEstado } : null);
        const errorMensual = resultadoMensual.status === 'rejected' ? resultadoMensual.reason?.message : '';
        const errorCliente = resultadoCliente.status === 'rejected' ? resultadoCliente.reason?.message : '';
        console.error('Error al actualizar estado mensual:', resultadoMensual.reason);
        console.error('Error al actualizar estado del cliente:', resultadoCliente.reason);
        alert(`Error al actualizar el estado de pago. ${errorCliente || errorMensual || 'Por favor, intenta nuevamente.'}`);
        return;
      }
      
      // Si solo una falló, registrar pero no revertir
      if (!mensualExitoso) {
        console.error('Error al actualizar estado mensual:', resultadoMensual.reason);
      }
      if (!clienteExitoso) {
        console.error('Error al actualizar estado del cliente:', resultadoCliente.reason);
        // Mostrar error más específico
        const errorMsg = resultadoCliente.reason?.message || 'Error desconocido';
        console.error('Detalles del error:', errorMsg);
      }
      
      // Limpiar caché solo una vez después de actualizar
      limpiarCacheClientes();
    } catch (err) {
      console.error('Error al actualizar estado de pago:', err);
      // Revertir cambio si falló
      setCliente(prev => prev ? { ...prev, pagado: !nuevoEstado } : null);
      alert("Error al actualizar el estado de pago. Por favor, intenta nuevamente.");
    } finally {
      setActualizandoPago(false);
    }
  };

  const handleToggleServicioPagado = async (indiceServicio) => {
    if (!cliente || actualizandoServicio === indiceServicio || actualizandoPago) return;
    
    setActualizandoServicio(indiceServicio);
    
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const añoActual = hoy.getFullYear();
    const clienteId = cliente._id || cliente.id || cliente.crmId;
    
    const serviciosPagados = estadoPagoMes?.serviciosPagados || {};
    const estadoAnterior = serviciosPagados[indiceServicio] === true;
    const nuevoEstado = !estadoAnterior;
    
    // Actualización optimista inmediata
    const nuevosServiciosPagados = { ...serviciosPagados, [indiceServicio]: nuevoEstado };
    const estadoAnteriorCompleto = { ...estadoPagoMes };
    setEstadoPagoMes(prev => ({ 
      ...prev, 
      serviciosPagados: nuevosServiciosPagados 
    }));
    
    // Calcular nuevo estado general
    const todosPagados = todosLosServiciosPagados(cliente, nuevosServiciosPagados);
    const clienteAnterior = cliente;
    if (cliente.pagado !== todosPagados) {
      setCliente(prev => prev ? { ...prev, pagado: todosPagados } : null);
    }
    
    try {
      // Guardar en el servidor
      await guardarEstadoPagoServicio(clienteId, mesActual, añoActual, indiceServicio, nuevoEstado);
      
      // Actualizar estado general del cliente si cambió
      if (clienteAnterior.pagado !== todosPagados) {
        try {
          const { actualizarCliente } = await import('../../../lib/clientesUtils');
          await actualizarCliente(id, { pagado: todosPagados }, false);
        } catch (err) {
          console.warn('Error al actualizar estado general del cliente (no crítico):', err);
          // No revertir si solo falla esto
        }
      }
      
      // Esperar un poco para que el servidor procese, luego verificar
      setTimeout(async () => {
        try {
          const estadoVerificado = await getEstadoPagoMes(clienteId, mesActual, añoActual, false);
          if (estadoVerificado) {
            // Verificar que el estado se guardó correctamente
            const servicioGuardado = estadoVerificado.serviciosPagados?.[indiceServicio];
            if (servicioGuardado !== nuevoEstado) {
              console.warn('Estado del servicio no coincide con el guardado, sincronizando...');
              // Sincronizar si hay diferencia
              setEstadoPagoMes(prev => ({
                ...prev,
                serviciosPagados: estadoVerificado.serviciosPagados || prev.serviciosPagados
              }));
            }
          }
        } catch (err) {
          console.warn('Error al verificar estado guardado:', err);
        }
      }, 500);
      
      // Limpiar caché después de un pequeño delay para permitir que la BD se actualice
      setTimeout(() => {
        limpiarCacheClientes();
      }, 300);
      
    } catch (err) {
      console.error('Error al actualizar estado de pago del servicio:', err);
      
      // Revertir actualización optimista
      setEstadoPagoMes(estadoAnteriorCompleto);
      setCliente(clienteAnterior);
      
      alert(`Error al actualizar el estado de pago del servicio: ${err.message || 'Error desconocido'}. Por favor, intenta nuevamente.`);
      
      // Intentar recargar estado desde el servidor para sincronizar
      try {
        const estadoRecargado = await getEstadoPagoMes(clienteId, mesActual, añoActual, false);
        if (estadoRecargado) {
          setEstadoPagoMes(estadoRecargado);
          const todosPagadosRecargados = todosLosServiciosPagados(cliente, estadoRecargado.serviciosPagados || {});
          setCliente(prev => prev ? { ...prev, pagado: todosPagadosRecargados } : null);
        }
      } catch (reloadErr) {
        console.error('Error al recargar estado después de fallo:', reloadErr);
      }
    } finally {
      setActualizandoServicio(null);
    }
  };

  const handleActualizarServiciosPagados = async (nuevosServiciosPagados) => {
    if (!cliente || actualizandoPago) return;
    
    setActualizandoPago(true);
    
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const añoActual = hoy.getFullYear();
    const clienteId = cliente._id || cliente.id || cliente.crmId;
    
    // Guardar estado anterior para rollback
    const estadoAnteriorCompleto = { ...estadoPagoMes };
    const clienteAnterior = cliente;
    
    // Calcular nuevo estado
    const todosPagados = todosLosServiciosPagados(cliente, nuevosServiciosPagados);
    
    // Actualización optimista
    setEstadoPagoMes(prev => ({ ...prev, serviciosPagados: nuevosServiciosPagados }));
    setCliente(prev => prev ? { ...prev, pagado: todosPagados } : null);
    
    try {
      // Guardar estados de pago
      await guardarEstadoPagoMes(clienteId, mesActual, añoActual, todosPagados, nuevosServiciosPagados);
      
      // Actualizar estado general del cliente
      try {
        const { actualizarCliente } = await import('../../../lib/clientesUtils');
        await actualizarCliente(id, { pagado: todosPagados }, false);
      } catch (err) {
        console.warn('Error al actualizar estado general del cliente (no crítico):', err);
        // No revertir si solo falla esto
      }
      
      // Limpiar caché después de un pequeño delay
      setTimeout(() => {
        limpiarCacheClientes();
      }, 300);
      
    } catch (err) {
      console.error('Error al actualizar estados de pago:', err);
      
      // Revertir actualización optimista
      setEstadoPagoMes(estadoAnteriorCompleto);
      setCliente(clienteAnterior);
      
      alert(`Error al actualizar los estados de pago: ${err.message || 'Error desconocido'}. Por favor, intenta nuevamente.`);
      
      // Intentar recargar estado desde el servidor
      try {
        const estadoRecargado = await getEstadoPagoMes(clienteId, mesActual, añoActual, false);
        if (estadoRecargado) {
          setEstadoPagoMes(estadoRecargado);
          const todosPagadosRecargados = todosLosServiciosPagados(cliente, estadoRecargado.serviciosPagados || {});
          setCliente(prev => prev ? { ...prev, pagado: todosPagadosRecargados } : null);
        }
      } catch (reloadErr) {
        console.error('Error al recargar estado después de fallo:', reloadErr);
      }
    } finally {
      setActualizandoPago(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando cliente...</div>
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div>
        <p className="text-red-400 mb-4">{error || "Cliente no encontrado."}</p>
        <Link href={fromPagos ? "/pagos" : "/clientes"} className="text-blue-400 hover:text-blue-300">
          ← Volver
        </Link>
      </div>
    );
  }

  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(monto);
  };

  return (
    <div>
      <Link href={fromPagos ? "/pagos" : "/clientes"} className="text-sm text-slate-400 hover:text-slate-200">
        ← Volver {fromPagos ? "a Pagos" : "a Clientes"}
      </Link>

      <div className="mt-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-semibold break-words pr-2">{cliente.nombre}</h2>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <button
              onClick={() => generarResumenPagoPDF(cliente)}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
            >
              📄 PDF
            </button>
            <Link
              href={`/clientes/${id}/editar`}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap text-center"
            >
              ✏️ Editar
            </Link>
            <button
              onClick={() => setMostrarConfirmacion(true)}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
            >
              🗑️ Eliminar
            </button>
          </div>
        </div>

        {mostrarConfirmacion && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400 font-medium mb-2">
              ¿Estás seguro de que deseas eliminar a "{cliente.nombre}"?
            </p>
            <p className="text-sm text-slate-400 mb-4">
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleEliminar}
                disabled={eliminando}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {eliminando ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                onClick={() => {
                  setMostrarConfirmacion(false);
                  setEliminando(false);
                }}
                disabled={eliminando}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
          {cliente.rubro && (
            <p><strong className="text-slate-300">Rubro:</strong> <span className="text-slate-200">{cliente.rubro}</span></p>
          )}
          {cliente.ciudad && (
            <p><strong className="text-slate-300">Ciudad:</strong> <span className="text-slate-200">{cliente.ciudad}</span></p>
          )}
          {cliente.email && (
            <p><strong className="text-slate-300">Email:</strong> <span className="text-slate-200">{cliente.email}</span></p>
          )}
          <div>
            <p className="text-slate-300 font-medium mb-2">Servicios:</p>
            {cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 0 ? (
              <div className="space-y-2">
                {cliente.servicios.map((servicio, index) => {
                  const serviciosPagados = estadoPagoMes?.serviciosPagados || {};
                  const servicioPagado = serviciosPagados[index] === true;
                  const estaActualizando = actualizandoServicio === index;
                  
                  return (
                    <div 
                      key={index} 
                      className={`p-3 bg-slate-700 rounded border ${
                        servicioPagado ? 'border-green-700' : 'border-slate-600'
                      }`}
                    >
                      <div className="flex justify-between items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-200 font-medium">{servicio.nombre}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              servicioPagado 
                                ? 'bg-green-900/30 text-green-400 border border-green-700' 
                                : 'bg-orange-900/30 text-orange-400 border border-orange-700'
                            }`}>
                              {servicioPagado ? "Pagado" : "Pendiente"}
                            </span>
                          </div>
                          <span className="text-slate-200 font-semibold">{formatearMoneda(servicio.precio)}</span>
                        </div>
                        <button
                          onClick={() => handleToggleServicioPagado(index)}
                          disabled={estaActualizando || actualizandoPago}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                            servicioPagado
                              ? "bg-orange-600 hover:bg-orange-700 text-white"
                              : "bg-green-600 hover:bg-green-700 text-white"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={servicioPagado ? "Marcar como pendiente" : "Marcar como pagado"}
                        >
                          {estaActualizando ? "..." : servicioPagado ? "Marcar Pendiente" : "Marcar Pagado"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-slate-600 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-semibold">Total:</span>
                    <span className="text-slate-100 font-bold text-lg">{formatearMoneda(getTotalCliente(cliente))}</span>
                  </div>
                  {estadoPagoMes && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300">Pagado:</span>
                        <span className="text-green-400 font-semibold">{formatearMoneda(getTotalPagadoCliente(cliente, estadoPagoMes.serviciosPagados))}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300">Pendiente:</span>
                        <span className="text-orange-400 font-semibold">{formatearMoneda(getTotalPendienteCliente(cliente, estadoPagoMes.serviciosPagados))}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-slate-400">Sin servicios cargados</p>
            )}
          </div>
          {cliente.pagoUnico ? (
            <p><strong className="text-slate-300">Tipo de Pago:</strong> 
              <span className="ml-2 px-2 py-1 rounded text-xs font-medium bg-purple-900/30 text-purple-400 border border-purple-700">
                Pago Único
              </span>
            </p>
          ) : (
            <div>
              <p><strong className="text-slate-300">Fecha de Pago:</strong> 
                <span className="text-slate-200">
                  {cliente.pagoMesSiguiente 
                    ? ` Día ${cliente.fechaPago} del mes siguiente`
                    : ` Día ${cliente.fechaPago} de cada mes`
                  }
                </span>
              </p>
              {cliente.pagoMesSiguiente && (
                <p className="text-xs text-slate-400 mt-1">
                  El pago corresponde al mes siguiente, no aparecerá como vencido
                </p>
              )}
            </div>
          )}
          {cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 1 && (
            <div className="flex items-center justify-between">
              <p><strong className="text-slate-300">Estado General:</strong> 
                <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                  todosLosServiciosPagados(cliente, estadoPagoMes?.serviciosPagados || {})
                    ? "bg-green-900/30 text-green-400 border border-green-700" 
                    : "bg-orange-900/30 text-orange-400 border border-orange-700"
                }`}>
                  {todosLosServiciosPagados(cliente, estadoPagoMes?.serviciosPagados || {}) ? "Todos Pagados" : "Pendiente"}
                </span>
              </p>
              <button
                onClick={handleTogglePagado}
                disabled={actualizandoPago}
                className={`ml-4 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  todosLosServiciosPagados(cliente, estadoPagoMes?.serviciosPagados || {})
                    ? "bg-orange-600 hover:bg-orange-700 text-white"
                    : "bg-green-600 hover:bg-green-700 text-white"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={todosLosServiciosPagados(cliente, estadoPagoMes?.serviciosPagados || {}) ? "Marcar todos como pendientes" : "Marcar todos como pagados"}
              >
                {actualizandoPago ? "..." : todosLosServiciosPagados(cliente, estadoPagoMes?.serviciosPagados || {}) ? "Desmarcar Todos" : "Marcar Todos"}
              </button>
            </div>
          )}
          {(!cliente.servicios || !Array.isArray(cliente.servicios) || cliente.servicios.length <= 1) && (
            <div className="flex items-center justify-between">
              <p><strong className="text-slate-300">Estado:</strong> 
                <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                  estadoRealCliente
                    ? "bg-green-900/30 text-green-400 border border-green-700" 
                    : "bg-orange-900/30 text-orange-400 border border-orange-700"
                }`}>
                  {estadoRealCliente ? "Pagado" : "Pendiente"}
                </span>
              </p>
              <button
                onClick={handleTogglePagado}
                disabled={actualizandoPago}
                className={`ml-4 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  estadoRealCliente
                    ? "bg-orange-600 hover:bg-orange-700 text-white"
                    : "bg-green-600 hover:bg-green-700 text-white"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={estadoRealCliente ? "Marcar como pendiente" : "Marcar como pagado"}
              >
                {actualizandoPago ? "..." : estadoRealCliente ? "Marcar Pendiente" : "Marcar Pagado"}
              </button>
            </div>
          )}
          {cliente.observaciones && (
            <div className="mt-4 pt-4 border-t border-slate-600">
              <p className="text-slate-300 font-medium mb-2">Observaciones:</p>
              <p className="text-slate-200 whitespace-pre-wrap">{cliente.observaciones}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClienteDetailPage() {
  return (
    <ProtectedRoute>
      <ClienteDetailPageContent />
    </ProtectedRoute>
  );
}

