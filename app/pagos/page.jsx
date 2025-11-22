"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getClientes, getEstadosPagoMes, guardarEstadoPagoMes, getMesesConRegistros, limpiarCacheClientes, actualizarCliente } from "../../lib/clientesUtils";
import { getTotalCliente } from "../../lib/clienteHelpers";
import ProtectedRoute from "../../components/ProtectedRoute";

function PagosPageContent() {
  const [fechaActual, setFechaActual] = useState(new Date());
  const [clientes, setClientes] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  });

  const [clientesConEstado, setClientesConEstado] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opcionesMeses, setOpcionesMeses] = useState([]);
  const [actualizandoClientes, setActualizandoClientes] = useState(new Set());

  useEffect(() => {
    const cargarOpcionesMeses = async () => {
      try {
        const opciones = [];
        const hoy = new Date();
        const mesesConRegistros = await getMesesConRegistros();
        
        // Agregar últimos 12 meses
        for (let i = 0; i < 12; i++) {
          const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
          const año = fecha.getFullYear();
          const mes = fecha.getMonth() + 1;
          const valor = `${año}-${String(mes).padStart(2, '0')}`;
          const nombreMes = fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
          
          if (!opciones.find(o => o.value === valor)) {
            opciones.push({ value: valor, label: nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1) });
          }
        }
        
        // Agregar meses con registros que no estén en los últimos 12
        mesesConRegistros.forEach(mesKey => {
          if (!opciones.find(o => o.value === mesKey)) {
            const [año, mes] = mesKey.split('-');
            const fecha = new Date(parseInt(año), parseInt(mes) - 1, 1);
            const nombreMes = fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            opciones.push({ value: mesKey, label: nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1) });
          }
        });
        
        setOpcionesMeses(opciones.sort((a, b) => b.value.localeCompare(a.value)));
      } catch (err) {
        console.error('Error al cargar opciones de meses:', err);
      }
    };
    cargarOpcionesMeses();
  }, []);

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        setError("");
        
        // Calcular mes y año una vez
        const [añoSeleccionado, mesSeleccionadoNum] = mesSeleccionado.split('-').map(Number);
        const mesIndex = mesSeleccionadoNum - 1;
        const mesActual = fechaActual.getMonth();
        const añoActual = fechaActual.getFullYear();
        const esMesActual = añoSeleccionado === añoActual && mesIndex === mesActual;
        
        // OPTIMIZACIÓN CRÍTICA: NO limpiar caché al cargar, solo al actualizar
        // Cargar clientes y estados en paralelo para mayor velocidad
        const clientesData = await getClientes();
        
        // Mientras tanto, preparar IDs para la query de estados
        const clientesIds = (clientesData || []).map(c => c._id || c.id);
        
        // Cargar estados en paralelo (o inmediatamente después si no hay clientes)
        const estadosMap = clientesIds.length > 0 
          ? await getEstadosPagoMes(clientesIds, mesIndex, añoSeleccionado, true) // usar caché
          : {};
        
        setClientes(clientesData || []);
        
        const clientesConEstados = (clientesData || []).map(cliente => {
          const clienteId = cliente._id || cliente.id;
          const estadoMes = estadosMap[clienteId];
          return {
            ...cliente,
            pagado: estadoMes ? estadoMes.pagado : (esMesActual ? cliente.pagado : false)
          };
        });
        setClientesConEstado(clientesConEstados);
      } catch (err) {
        console.error('Error al cargar datos de pagos:', err);
        setError('Error al cargar los datos. Por favor, recarga la página.');
        setClientes([]);
        setClientesConEstado([]);
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
    // Optimización: actualizar fecha cada 10 segundos en lugar de cada segundo
    const timer = setInterval(() => {
      setFechaActual(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, [mesSeleccionado]);

  // Parsear mes seleccionado
  const [añoSeleccionado, mesSeleccionadoNum] = mesSeleccionado.split('-').map(Number);
  const mesIndex = mesSeleccionadoNum - 1;

  // Calcular métricas del mes seleccionado
  const mesActual = fechaActual.getMonth();
  const añoActual = fechaActual.getFullYear();
  const diaActual = fechaActual.getDate();
  
  // Determinar si estamos viendo el mes actual
  const esMesActual = añoSeleccionado === añoActual && mesIndex === mesActual;

  // Métricas para TODOS los clientes (mensuales + pago único) del mes seleccionado (memoizadas para actualización inmediata)
  const { totalEsperado, totalPagado, totalPendiente, cantidadPagados, cantidadPendientes } = useMemo(() => {
    const totalEsp = clientesConEstado.reduce((sum, cliente) => sum + getTotalCliente(cliente), 0);
    const totalPag = clientesConEstado
      .filter(cliente => cliente.pagado)
      .reduce((sum, cliente) => sum + getTotalCliente(cliente), 0);
    const totalPend = totalEsp - totalPag;
    const cantPagados = clientesConEstado.filter(cliente => cliente.pagado).length;
    const cantPendientes = clientesConEstado.length - cantPagados;
    
    return {
      totalEsperado: totalEsp,
      totalPagado: totalPag,
      totalPendiente: totalPend,
      cantidadPagados: cantPagados,
      cantidadPendientes: cantPendientes
    };
  }, [clientesConEstado]);

  // Separar clientes mensuales de pago único solo para alertas
  const clientesMensuales = clientesConEstado.filter(cliente => !cliente.pagoUnico);
  const clientesConAlerta = esMesActual ? clientesMensuales.filter(cliente => {
    if (cliente.pagado) return false;
    
    let diasHastaPago = cliente.fechaPago - diaActual;
    
    // Si el pago corresponde al mes siguiente y ya pasó la fecha este mes
    if (cliente.pagoMesSiguiente && diasHastaPago < 0) {
      const ultimoDiaMes = new Date(añoActual, mesActual + 1, 0).getDate();
      diasHastaPago = (ultimoDiaMes - diaActual) + cliente.fechaPago;
    }
    
    return diasHastaPago <= 3 && diasHastaPago >= -3; // 3 días antes o después
  }) : [];


  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(monto);
  };

  const getEstadoPago = (cliente) => {
    if (cliente.pagado) {
      return { texto: "Pagado", tipo: "pagado", color: "text-green-400", bg: "bg-green-900/30", border: "border-green-700" };
    }
    
    // Para clientes de pago único
    if (cliente.pagoUnico) {
      return { texto: "Pago Único", tipo: "pago-unico", color: "text-purple-400", bg: "bg-purple-900/30", border: "border-purple-700" };
    }
    
    // Si no es el mes actual, solo mostrar estado pendiente o pagado
    if (!esMesActual) {
      return { texto: "Pendiente", tipo: "pendiente", color: "text-slate-400", bg: "bg-slate-800", border: "border-slate-700" };
    }
    
    let diasHastaPago = cliente.fechaPago - diaActual;
    
    // Si el pago corresponde al mes siguiente y ya pasó la fecha este mes
    if (cliente.pagoMesSiguiente && diasHastaPago < 0) {
      // Calcular días hasta el pago del mes siguiente
      const ultimoDiaMes = new Date(añoActual, mesActual + 1, 0).getDate();
      diasHastaPago = (ultimoDiaMes - diaActual) + cliente.fechaPago;
    }
    
    if (diasHastaPago < 0) {
      return { texto: "Vencido", tipo: "vencido", color: "text-red-400", bg: "bg-red-900/30", border: "border-red-700" };
    } else if (diasHastaPago === 0) {
      return { texto: "Hoy", tipo: "hoy", color: "text-yellow-400", bg: "bg-yellow-900/30", border: "border-yellow-700" };
    } else if (diasHastaPago <= 3) {
      return { texto: `En ${diasHastaPago} días`, tipo: "proximo", color: "text-orange-400", bg: "bg-orange-900/30", border: "border-orange-700" };
    } else {
      const texto = cliente.pagoMesSiguiente && diasHastaPago > 28 
        ? `Día ${cliente.fechaPago} (mes siguiente)`
        : `Día ${cliente.fechaPago}`;
      return { texto, tipo: "pendiente", color: "text-slate-400", bg: "bg-slate-800", border: "border-slate-700" };
    }
  };

  // Función para toggle rápido del estado de pago
  const handleTogglePagado = async (cliente) => {
    // Obtener ID del cliente de forma robusta
    const clienteId = cliente._id || cliente.id || cliente.crmId;
    const clienteKey = cliente.id || cliente._id || cliente.crmId;
    
    if (actualizandoClientes.has(clienteKey) || cliente.pagoUnico) return;
    
    const nuevoEstado = !cliente.pagado;
    
    // Actualización optimista: cambiar estado inmediatamente en la UI
    setClientesConEstado(prev => prev.map(c => {
      const cId = c._id || c.id || c.crmId;
      if (cId === clienteId) {
        return { ...c, pagado: nuevoEstado };
      }
      return c;
    }));
    
    // Agregar a la lista de clientes actualizando
    setActualizandoClientes(prev => new Set(prev).add(clienteKey));
    
    try {
      // Obtener mes y año seleccionado
      const [añoSeleccionado, mesSeleccionadoNum] = mesSeleccionado.split('-').map(Number);
      const mesIndex = mesSeleccionadoNum - 1;
      
      // Actualizar también la lista de clientes base inmediatamente para mejor UX
      const hoy = new Date();
      const mesActual = hoy.getMonth();
      const añoActual = hoy.getFullYear();
      const esMesActual = añoSeleccionado === añoActual && mesIndex === mesActual;
      
      if (esMesActual) {
        setClientes(prev => prev.map(c => {
          const cId = c._id || c.id || c.crmId;
          if (cId === clienteId) {
            return { ...c, pagado: nuevoEstado };
          }
          return c;
        }));
      }
      
      // Actualizar ambas cosas en paralelo para mayor velocidad
      const promesas = [
        guardarEstadoPagoMes(clienteId, mesIndex, añoSeleccionado, nuevoEstado)
      ];
      
      // Solo actualizar cliente si es mes actual (sin limpiar caché dentro de la función)
      if (esMesActual) {
        promesas.push(actualizarCliente(clienteId, { pagado: nuevoEstado }, false)); // false = no limpiar caché aquí
      }
      
      const resultados = await Promise.allSettled(promesas);
      
      // Verificar si la actualización mensual fue exitosa (es la más importante)
      const resultadoMensual = resultados[0];
      const mensualExitoso = resultadoMensual.status === 'fulfilled' && resultadoMensual.value === true;
      
      if (!mensualExitoso) {
        // Revertir cambio si falló
        setClientesConEstado(prev => prev.map(c => {
          const cId = c._id || c.id || c.crmId;
          if (cId === clienteId) {
            return { ...c, pagado: !nuevoEstado };
          }
          return c;
        }));
        
        if (esMesActual) {
          setClientes(prev => prev.map(c => {
            const cId = c._id || c.id || c.crmId;
            if (cId === clienteId) {
              return { ...c, pagado: !nuevoEstado };
            }
            return c;
          }));
        }
        
        alert("Error al actualizar el estado de pago. Por favor, intenta nuevamente.");
        return;
      }
      
      // Si la actualización del cliente falló pero la mensual fue exitosa, registrar pero no revertir
      if (esMesActual && resultados[1] && resultados[1].status === 'rejected') {
        console.error('Error al actualizar estado del cliente:', resultados[1].reason);
      }
      
      // Limpiar caché solo una vez después de actualizar
      limpiarCacheClientes();
    } catch (err) {
      console.error('Error al actualizar estado de pago:', err);
      // Revertir cambio si falló
      setClientesConEstado(prev => prev.map(c => {
        const cId = c._id || c.id || c.crmId;
        if (cId === clienteId) {
          return { ...c, pagado: !nuevoEstado };
        }
        return c;
      }));
      alert("Error al actualizar el estado de pago. Por favor, intenta nuevamente.");
    } finally {
      // Remover de la lista de clientes actualizando
      setActualizandoClientes(prev => {
        const nuevo = new Set(prev);
        nuevo.delete(clienteKey);
        return nuevo;
      });
    }
  };

  // Filtrar clientes por estado y búsqueda (memoizado)
  const clientesFiltrados = useMemo(() => {
    return clientesConEstado.filter(cliente => {
    // Filtro por estado
    if (filtroEstado !== "todos") {
      const estado = getEstadoPago(cliente);
      
      if (filtroEstado === "pagado" && estado.tipo !== "pagado") return false;
      if (filtroEstado === "vencido" && estado.tipo !== "vencido") return false;
      if (filtroEstado === "hoy" && estado.tipo !== "hoy") return false;
      if (filtroEstado === "proximo" && estado.tipo !== "proximo") return false;
      if (filtroEstado === "pendiente" && estado.tipo !== "pendiente") return false;
      if (filtroEstado === "pago-unico" && estado.tipo !== "pago-unico") return false;
    }
    
    // Filtro por búsqueda
    if (busqueda.trim()) {
      const termino = busqueda.toLowerCase();
      const nombreMatch = cliente.nombre?.toLowerCase().includes(termino);
      const rubroMatch = cliente.rubro?.toLowerCase().includes(termino);
      
      if (!nombreMatch && !rubroMatch) return false;
    }
    
    return true;
    });
  }, [clientesConEstado, filtroEstado, busqueda, añoSeleccionado, mesIndex, diaActual, añoActual, mesActual]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando datos de pagos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg">
        <p className="text-red-200">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
        >
          Recargar página
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-semibold">Pagos</h2>
        <div className="w-full sm:w-auto">
          <select
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 text-sm"
          >
            {opcionesMeses.map(opcion => (
              <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Métricas del mes */}
      <div>
        <p className="text-sm text-slate-400 mb-2">
          Métricas de {new Date(añoSeleccionado, mesIndex, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
          {!esMesActual && <span className="ml-2 text-xs text-slate-500">(Histórico)</span>}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="p-3 md:p-4 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-xs md:text-sm text-slate-400 mb-1">Total Esperado</p>
          <p className="text-lg md:text-2xl font-bold text-blue-400 break-words">{formatearMoneda(totalEsperado)}</p>
        </div>
        
        <div className="p-3 md:p-4 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-xs md:text-sm text-slate-400 mb-1">Total Pagado</p>
          <p className="text-lg md:text-2xl font-bold text-green-400 break-words">{formatearMoneda(totalPagado)}</p>
        </div>
        
        <div className="p-3 md:p-4 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-xs md:text-sm text-slate-400 mb-1">Total Pendiente</p>
          <p className="text-lg md:text-2xl font-bold text-orange-400 break-words">{formatearMoneda(totalPendiente)}</p>
        </div>
        
        <div className="p-3 md:p-4 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-xs md:text-sm text-slate-400 mb-1">Clientes</p>
          <p className="text-lg md:text-2xl font-bold text-slate-300">
            <span className="text-green-400">{cantidadPagados}</span>
            <span className="text-slate-500 mx-1">/</span>
            <span className="text-orange-400">{cantidadPendientes}</span>
          </p>
        </div>
        </div>
      </div>

      {/* Alertas de fechas de pago */}
      {clientesConAlerta.length > 0 && (
        <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">⚠️ Alertas de Pago</h3>
          <div className="space-y-2">
            {clientesConAlerta.map(cliente => {
              const estado = getEstadoPago(cliente);
              const diasHastaPago = cliente.fechaPago - diaActual;
              return (
                <Link
                  key={cliente.id}
                  href={`/clientes/${cliente.id}?from=pagos`}
                  prefetch={true}
                  className="block flex justify-between items-center p-2 bg-slate-800 rounded hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <div>
                    <p className="font-medium">{cliente.nombre}</p>
                    <p className="text-sm text-slate-400">
                      {diasHastaPago < 0 
                        ? `Vencido hace ${Math.abs(diasHastaPago)} día(s)` 
                        : diasHastaPago === 0 
                        ? "Vence hoy" 
                        : `Vence en ${diasHastaPago} día(s)`}
                    </p>
                  </div>
                  <p className="font-semibold text-yellow-400">{formatearMoneda(getTotalCliente(cliente))}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros y búsqueda */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Clientes y Pagos</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Buscador */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Buscar:
            </label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o rubro..."
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
              autoComplete="off"
            />
          </div>

          {/* Filtro por estado */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Filtrar por estado:
            </label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="todos">Todos</option>
              <option value="pagado">Pagado</option>
              <option value="vencido">Vencido</option>
              <option value="hoy">Vence Hoy</option>
              <option value="proximo">Próximos (1-3 días)</option>
              <option value="pendiente">Pendiente</option>
              <option value="pago-unico">Pago Único</option>
            </select>
          </div>
        </div>

        {(filtroEstado !== "todos" || busqueda.trim()) && (
          <p className="text-sm text-slate-400 mb-4">
            Mostrando {clientesFiltrados.length} de {clientesConEstado.length} clientes
          </p>
        )}
        <div className="space-y-3">
          {clientesFiltrados.map(cliente => {
            const estado = getEstadoPago(cliente);
            const estaActualizando = actualizandoClientes.has(cliente.id);
            return (
              <div
                key={cliente.id}
                className={`block p-3 md:p-4 rounded-lg border ${estado.border} ${estado.bg} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3`}
              >
                <Link
                  href={`/clientes/${cliente.id}?from=pagos`}
                  prefetch={true}
                  className="flex-1 w-full sm:w-auto hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                    <h4 className="font-semibold text-base md:text-lg">{cliente.nombre}</h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${estado.color} ${estado.bg} self-start sm:self-auto`}>
                      {estado.texto}
                    </span>
                  </div>
                  {cliente.rubro && <p className="text-xs md:text-sm text-slate-400">{cliente.rubro}</p>}
                  <p className="text-xs md:text-sm text-slate-400 mt-1">
                    {cliente.pagoUnico 
                      ? "Pago único - No recurrente"
                      : cliente.pagoMesSiguiente
                      ? `Fecha de pago: día ${cliente.fechaPago} del mes siguiente`
                      : `Fecha de pago: día ${cliente.fechaPago} de cada mes`
                    }
                  </p>
                </Link>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <div className="text-left sm:text-right">
                    <p className="text-xl md:text-2xl font-bold text-slate-200">
                      {formatearMoneda(getTotalCliente(cliente))}
                    </p>
                    {cliente.servicios && cliente.servicios.length > 1 && (
                      <p className="text-xs text-slate-400 mt-1">
                        {cliente.servicios.length} servicios
                      </p>
                    )}
                  </div>
                  {!cliente.pagoUnico && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTogglePagado(cliente);
                      }}
                      disabled={estaActualizando}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        cliente.pagado
                          ? "bg-orange-600 hover:bg-orange-700 text-white"
                          : "bg-green-600 hover:bg-green-700 text-white"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={cliente.pagado ? "Marcar como pendiente" : "Marcar como pagado"}
                    >
                      {estaActualizando ? "..." : cliente.pagado ? "Pendiente" : "Pagado"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {clientesFiltrados.length === 0 && (
            <p className="text-slate-400 text-center py-4">
              {filtroEstado !== "todos" 
                ? `No hay clientes con estado "${filtroEstado}"`
                : "No hay clientes"
              }
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PagosPage() {
  return (
    <ProtectedRoute>
      <PagosPageContent />
    </ProtectedRoute>
  );
}

