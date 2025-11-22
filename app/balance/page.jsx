"use client";

import { useState, useEffect } from "react";
import { getClientes, getEstadoPagoMes } from "../../lib/clientesUtils";
import { getTotalCliente } from "../../lib/clienteHelpers";
import { getGastosMes, agregarGasto, eliminarGasto, getMesesConGastos } from "../../lib/gastosUtils";
import { getIngresosMes, agregarIngreso, eliminarIngreso } from "../../lib/ingresosUtils";
import ProtectedRoute from "../../components/ProtectedRoute";

function BalancePageContent() {
  const [fechaActual, setFechaActual] = useState(new Date());
  const [clientes, setClientes] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  });
  const [mostrarFormularioGasto, setMostrarFormularioGasto] = useState(false);
  const [mostrarFormularioIngreso, setMostrarFormularioIngreso] = useState(false);
  const [formGasto, setFormGasto] = useState({
    descripcion: '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    categoria: ''
  });
  const [formIngreso, setFormIngreso] = useState({
    descripcion: '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    categoria: ''
  });

  useEffect(() => {
    const cargarDatos = async () => {
      const clientesData = await getClientes();
      setClientes(clientesData);
      
      const [año, mes] = mesSeleccionado.split('-').map(Number);
      const mesIndex = mes - 1;
      const gastosData = await getGastosMes(mesIndex, año);
      const ingresosData = await getIngresosMes(mesIndex, año);
      setGastos(gastosData);
      setIngresos(ingresosData);
    };
    
    cargarDatos();
    const timer = setInterval(() => {
      setFechaActual(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [mesSeleccionado]);

  // Parsear mes seleccionado
  const [añoSeleccionado, mesSeleccionadoNum] = mesSeleccionado.split('-').map(Number);
  const mesIndex = mesSeleccionadoNum - 1;

  const [clientesConEstado, setClientesConEstado] = useState([]);

  useEffect(() => {
    const cargarEstadosPago = async () => {
      const [año, mes] = mesSeleccionado.split('-').map(Number);
      const mesIndex = mes - 1;
      const esMesActual = año === fechaActual.getFullYear() && mesIndex === fechaActual.getMonth();
      
      const clientesConEstados = await Promise.all(
        clientes.map(async (cliente) => {
          const estadoMes = await getEstadoPagoMes(cliente.id, mesIndex, año);
          return {
            ...cliente,
            pagado: estadoMes ? estadoMes.pagado : (esMesActual ? cliente.pagado : false)
          };
        })
      );
      setClientesConEstado(clientesConEstados);
    };
    
    if (clientes.length > 0) {
      cargarEstadosPago();
    }
  }, [clientes, mesSeleccionado, fechaActual]);

  // Ingresos calculados automáticamente (clientes pagados)
  const ingresosAutomaticos = clientesConEstado
    .filter(cliente => cliente.pagado)
    .reduce((sum, cliente) => sum + getTotalCliente(cliente), 0);
  
  // Ingresos manuales
  const ingresosManuales = ingresos.reduce((sum, ingreso) => sum + (parseFloat(ingreso.monto) || 0), 0);
  
  // Total de ingresos (automáticos + manuales)
  const totalIngresos = ingresosAutomaticos + ingresosManuales;

  // Calcular gastos
  const totalGastos = gastos.reduce((sum, gasto) => sum + (parseFloat(gasto.monto) || 0), 0);

  // Utilidad neta
  const utilidadNeta = totalIngresos - totalGastos;
  const porcentajeUtilidad = totalIngresos > 0 ? ((utilidadNeta / totalIngresos) * 100).toFixed(1) : 0;

  // Generar opciones de meses
  const generarOpcionesMeses = async () => {
    const opciones = [];
    const hoy = new Date();
    const mesesConRegistros = await getMesesConGastos();
    
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
    
    return opciones.sort((a, b) => b.value.localeCompare(a.value));
  };

  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(monto);
  };

  const handleSubmitGasto = async (e) => {
    e.preventDefault();
    if (!formGasto.descripcion || !formGasto.monto) {
      alert('Por favor completa la descripción y el monto');
      return;
    }

    const resultado = await agregarGasto(formGasto);
    if (resultado) {
      const [año, mes] = mesSeleccionado.split('-').map(Number);
      const mesIndex = mes - 1;
      const gastosData = await getGastosMes(mesIndex, año);
      setGastos(gastosData);
      setFormGasto({
        descripcion: '',
        monto: '',
        fecha: new Date().toISOString().split('T')[0],
        categoria: ''
      });
      setMostrarFormularioGasto(false);
    } else {
      alert('Error al agregar el gasto');
    }
  };

  const handleSubmitIngreso = async (e) => {
    e.preventDefault();
    if (!formIngreso.descripcion || !formIngreso.monto) {
      alert('Por favor completa la descripción y el monto');
      return;
    }

    const resultado = await agregarIngreso(formIngreso);
    if (resultado) {
      const [año, mes] = mesSeleccionado.split('-').map(Number);
      const mesIndex = mes - 1;
      const ingresosData = await getIngresosMes(mesIndex, año);
      setIngresos(ingresosData);
      setFormIngreso({
        descripcion: '',
        monto: '',
        fecha: new Date().toISOString().split('T')[0],
        categoria: ''
      });
      setMostrarFormularioIngreso(false);
    } else {
      alert('Error al agregar el ingreso');
    }
  };

  const handleEliminarGasto = async (gastoId) => {
    if (confirm('¿Estás seguro de eliminar este gasto?')) {
      const resultado = await eliminarGasto(gastoId, mesIndex, añoSeleccionado);
      if (resultado) {
        const [año, mes] = mesSeleccionado.split('-').map(Number);
        const mesIdx = mes - 1;
        const gastosData = await getGastosMes(mesIdx, año);
        setGastos(gastosData);
      } else {
        alert('Error al eliminar el gasto');
      }
    }
  };

  const handleEliminarIngreso = async (ingresoId) => {
    if (confirm('¿Estás seguro de eliminar este ingreso?')) {
      const resultado = await eliminarIngreso(ingresoId, mesIndex, añoSeleccionado);
      if (resultado) {
        const [año, mes] = mesSeleccionado.split('-').map(Number);
        const mesIdx = mes - 1;
        const ingresosData = await getIngresosMes(mesIdx, año);
        setIngresos(ingresosData);
      } else {
        alert('Error al eliminar el ingreso');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Balance</h1>
        <div className="flex gap-4 items-center">
          <select
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm"
          >
            {generarOpcionesMeses().map(opcion => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setMostrarFormularioIngreso(false);
              setMostrarFormularioGasto(!mostrarFormularioGasto);
            }}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
          >
            {mostrarFormularioGasto ? 'Cancelar' : '+ Agregar Gasto'}
          </button>
          <button
            onClick={() => {
              setMostrarFormularioGasto(false);
              setMostrarFormularioIngreso(!mostrarFormularioIngreso);
            }}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-medium"
          >
            {mostrarFormularioIngreso ? 'Cancelar' : '+ Agregar Ingreso'}
          </button>
        </div>
      </div>

      {/* Formulario de ingreso */}
      {mostrarFormularioIngreso && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Nuevo Ingreso Manual</h2>
          <form onSubmit={handleSubmitIngreso} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Descripción *</label>
                <input
                  type="text"
                  value={formIngreso.descripcion}
                  onChange={(e) => setFormIngreso({ ...formIngreso, descripcion: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formIngreso.monto}
                  onChange={(e) => setFormIngreso({ ...formIngreso, monto: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Fecha</label>
                <input
                  type="date"
                  value={formIngreso.fecha}
                  onChange={(e) => setFormIngreso({ ...formIngreso, fecha: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Categoría (opcional)</label>
                <input
                  type="text"
                  value={formIngreso.categoria}
                  onChange={(e) => setFormIngreso({ ...formIngreso, categoria: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                  placeholder="Ej: Venta, Servicio, etc."
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-medium"
              >
                Guardar Ingreso
              </button>
              <button
                type="button"
                onClick={() => setMostrarFormularioIngreso(false)}
                className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Formulario de gasto */}
      {mostrarFormularioGasto && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Nuevo Gasto</h2>
          <form onSubmit={handleSubmitGasto} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Descripción *</label>
                <input
                  type="text"
                  value={formGasto.descripcion}
                  onChange={(e) => setFormGasto({ ...formGasto, descripcion: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formGasto.monto}
                  onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Fecha</label>
                <input
                  type="date"
                  value={formGasto.fecha}
                  onChange={(e) => setFormGasto({ ...formGasto, fecha: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Categoría (opcional)</label>
                <input
                  type="text"
                  value={formGasto.categoria}
                  onChange={(e) => setFormGasto({ ...formGasto, categoria: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                  placeholder="Ej: Servicios, Marketing, etc."
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-medium"
              >
                Guardar Gasto
              </button>
              <button
                type="button"
                onClick={() => setMostrarFormulario(false)}
                className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-1">Ingresos Totales</div>
          <div className="text-2xl font-bold text-green-400">{formatearMoneda(totalIngresos)}</div>
          <div className="text-xs text-slate-500 mt-2">
            {clientesConEstado.filter(c => c.pagado).length} cliente(s) pagado(s)
            {ingresosManuales > 0 && ` + ${ingresos.length} ingreso(s) manual(es)`}
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-1">Gastos Totales</div>
          <div className="text-2xl font-bold text-red-400">{formatearMoneda(totalGastos)}</div>
          <div className="text-xs text-slate-500 mt-2">
            {gastos.length} gasto(s) registrado(s)
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-1">Utilidad Neta</div>
          <div className={`text-2xl font-bold ${utilidadNeta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatearMoneda(utilidadNeta)}
          </div>
          <div className={`text-xs mt-2 ${utilidadNeta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {utilidadNeta >= 0 ? '+' : ''}{porcentajeUtilidad}% del total
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-1">Margen de Utilidad</div>
          <div className={`text-2xl font-bold ${parseFloat(porcentajeUtilidad) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {porcentajeUtilidad}%
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {totalIngresos > 0 ? 'Sobre ingresos' : 'Sin ingresos'}
          </div>
        </div>
      </div>

      {/* Lista de ingresos manuales */}
      {ingresos.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Ingresos Manuales del Mes</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Fecha</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Descripción</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Categoría</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Monto</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ingresos.map((ingreso) => (
                  <tr key={ingreso.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-3 px-4 text-sm">
                      {new Date(ingreso.fecha).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-3 px-4 text-sm">{ingreso.descripcion}</td>
                    <td className="py-3 px-4 text-sm text-slate-400">
                      {ingreso.categoria || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-green-400">
                      {formatearMoneda(parseFloat(ingreso.monto))}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleEliminarIngreso(ingreso.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700">
                  <td colSpan="3" className="py-3 px-4 text-sm font-semibold text-right">
                    Total Ingresos Manuales:
                  </td>
                  <td className="py-3 px-4 text-sm font-bold text-right text-green-400">
                    {formatearMoneda(ingresosManuales)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Lista de gastos */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Gastos del Mes</h2>
        {gastos.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            No hay gastos registrados para este mes
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Fecha</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Descripción</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Categoría</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Monto</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((gasto) => (
                  <tr key={gasto.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-3 px-4 text-sm">
                      {new Date(gasto.fecha).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-3 px-4 text-sm">{gasto.descripcion}</td>
                    <td className="py-3 px-4 text-sm text-slate-400">
                      {gasto.categoria || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-red-400">
                      {formatearMoneda(parseFloat(gasto.monto))}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleEliminarGasto(gasto.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700">
                  <td colSpan="3" className="py-3 px-4 text-sm font-semibold text-right">
                    Total:
                  </td>
                  <td className="py-3 px-4 text-sm font-bold text-right text-red-400">
                    {formatearMoneda(totalGastos)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BalancePage() {
  return (
    <ProtectedRoute>
      <BalancePageContent />
    </ProtectedRoute>
  );
}

