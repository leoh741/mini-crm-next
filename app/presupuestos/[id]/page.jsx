"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPresupuestoById, actualizarPresupuesto, eliminarPresupuesto, calcularTotales, calcularTotalConDescuento } from "../../../lib/presupuestosUtils";
import { generarPresupuestoPDF } from "../../../lib/pdfGenerator";
import Link from "next/link";
import ProtectedRoute from "../../../components/ProtectedRoute";

function PresupuestoDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const [presupuesto, setPresupuesto] = useState(null);
  const [editando, setEditando] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Estados para edición
  const [formData, setFormData] = useState(null);
  const [items, setItems] = useState([]);
  const [porcentajeDescuento, setPorcentajeDescuento] = useState(0);

  useEffect(() => {
    const cargarPresupuesto = async () => {
      try {
        setLoading(true);
        setError("");
        
        if (!id) {
          setError("ID de presupuesto no proporcionado");
          setLoading(false);
          return;
        }
        
        const presupuestoData = await getPresupuestoById(id, false);
        
        if (presupuestoData) {
          setPresupuesto(presupuestoData);
          setFormData({
            cliente: {
              nombre: presupuestoData.cliente?.nombre || '',
              rubro: presupuestoData.cliente?.rubro || '',
              ciudad: presupuestoData.cliente?.ciudad || '',
              email: presupuestoData.cliente?.email || '',
              telefono: presupuestoData.cliente?.telefono || ''
            },
            fecha: presupuestoData.fecha ? new Date(presupuestoData.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            validez: presupuestoData.validez || 30,
            estado: presupuestoData.estado || 'borrador',
            observaciones: presupuestoData.observaciones || '',
            notasInternas: presupuestoData.notasInternas || ''
          });
          setItems(presupuestoData.items || []);
          setPorcentajeDescuento(presupuestoData.porcentajeDescuento || 0);
        } else {
          setError("Presupuesto no encontrado");
        }
      } catch (err) {
        console.error('Error al cargar presupuesto:', err);
        setError(`Error al cargar el presupuesto: ${err.message || 'Error desconocido'}`);
      } finally {
        setLoading(false);
      }
    };
    cargarPresupuesto();
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.startsWith('cliente.')) {
      const campoCliente = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        cliente: {
          ...prev.cliente,
          [campoCliente]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
    setError("");
  };

  const handleItemChange = (index, field, value) => {
    const nuevosItems = [...items];
    nuevosItems[index] = { ...nuevosItems[index], [field]: value };
    setItems(nuevosItems);
  };

  const agregarItem = () => {
    setItems([...items, { descripcion: "", cantidad: 1, precioUnitario: "" }]);
  };

  const eliminarItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  // Calcular totales
  const { items: itemsCalculados, subtotal } = calcularTotales(items);
  const { descuento, total } = calcularTotalConDescuento(subtotal, porcentajeDescuento);

  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(monto);
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getEstadoColor = (estado) => {
    const colores = {
      borrador: 'bg-gray-900/30 text-gray-400 border-gray-700',
      enviado: 'bg-blue-900/30 text-blue-400 border-blue-700',
      aceptado: 'bg-green-900/30 text-green-400 border-green-700',
      rechazado: 'bg-red-900/30 text-red-400 border-red-700',
      vencido: 'bg-orange-900/30 text-orange-400 border-orange-700'
    };
    return colores[estado] || colores.borrador;
  };

  const getEstadoTexto = (estado) => {
    const textos = {
      borrador: 'Borrador',
      enviado: 'Enviado',
      aceptado: 'Aceptado',
      rechazado: 'Rechazado',
      vencido: 'Vencido'
    };
    return textos[estado] || estado;
  };

  const handleGuardar = async () => {
    if (!formData) return;

    setError("");
    setGuardando(true);

    // Validaciones
    if (!formData.cliente.nombre?.trim()) {
      setError("El nombre del cliente es requerido");
      setGuardando(false);
      return;
    }

    const itemsValidos = items.filter(item => item.descripcion?.trim() && item.precioUnitario);
    if (itemsValidos.length === 0) {
      setError("Debe agregar al menos un item con descripción y precio");
      setGuardando(false);
      return;
    }

    try {
      const itemsFormateados = itemsValidos.map(item => ({
        descripcion: item.descripcion.trim(),
        cantidad: parseInt(item.cantidad) || 1,
        precioUnitario: parseFloat(item.precioUnitario),
        subtotal: (parseInt(item.cantidad) || 1) * parseFloat(item.precioUnitario)
      }));

      // Parsear fecha correctamente para evitar problemas de timezone
      let fechaPresupuesto;
      if (formData.fecha) {
        // Si es string en formato YYYY-MM-DD, extraer componentes directamente
        if (typeof formData.fecha === 'string' && formData.fecha.match(/^\d{4}-\d{2}-\d{2}/)) {
          const partes = formData.fecha.split('-');
          const año = parseInt(partes[0], 10);
          const mes = parseInt(partes[1], 10) - 1; // Los meses en JS son 0-indexed
          const dia = parseInt(partes[2], 10);
          fechaPresupuesto = new Date(año, mes, dia);
        } else {
          fechaPresupuesto = new Date(formData.fecha);
        }
      } else {
        fechaPresupuesto = new Date();
      }

      const datosActualizados = {
        cliente: {
          nombre: formData.cliente.nombre.trim(),
          rubro: formData.cliente.rubro?.trim() || undefined,
          ciudad: formData.cliente.ciudad?.trim() || undefined,
          email: formData.cliente.email?.trim() || undefined,
          telefono: formData.cliente.telefono?.trim() || undefined
        },
        fecha: fechaPresupuesto,
        validez: parseInt(formData.validez) || 30,
        items: itemsFormateados,
        subtotal: subtotal,
        descuento: descuento,
        porcentajeDescuento: porcentajeDescuento,
        total: total,
        estado: formData.estado,
        observaciones: formData.observaciones?.trim() || undefined,
        notasInternas: formData.notasInternas?.trim() || undefined
      };

      const resultado = await actualizarPresupuesto(id, datosActualizados);
      
      if (resultado) {
        // Recargar presupuesto
        const presupuestoActualizado = await getPresupuestoById(id, false);
        if (presupuestoActualizado) {
          setPresupuesto(presupuestoActualizado);
          setEditando(false);
        }
      }
    } catch (err) {
      setError(err.message || "Error al guardar el presupuesto. Por favor, intenta nuevamente.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    try {
      setEliminando(true);
      const resultado = await eliminarPresupuesto(id);
      
      if (resultado) {
        router.push("/presupuestos");
      } else {
        alert("Error al eliminar el presupuesto. Por favor, intenta nuevamente.");
        setEliminando(false);
        setMostrarConfirmacion(false);
      }
    } catch (error) {
      console.error('Error al eliminar presupuesto:', error);
      alert("Error al eliminar el presupuesto. Por favor, intenta nuevamente.");
      setEliminando(false);
      setMostrarConfirmacion(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando presupuesto...</div>
      </div>
    );
  }

  if (error && !presupuesto) {
    return (
      <div>
        <p className="text-red-400 mb-4">{error}</p>
        <Link href="/presupuestos" className="text-blue-400 hover:text-blue-300">
          ← Volver a Presupuestos
        </Link>
      </div>
    );
  }

  if (!presupuesto) {
    return null;
  }

  return (
    <div>
      <Link href="/presupuestos" className="text-sm text-slate-400 hover:text-slate-200">
        ← Volver a Presupuestos
      </Link>

      <div className="mt-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold">
              Presupuesto #{presupuesto.numero}
            </h2>
            <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-medium border ${getEstadoColor(presupuesto.estado)}`}>
              {getEstadoTexto(presupuesto.estado)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <button
              onClick={async () => await generarPresupuestoPDF(presupuesto)}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
            >
              📄 PDF
            </button>
            {!editando ? (
              <>
                <button
                  onClick={() => setEditando(true)}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => setMostrarConfirmacion(true)}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
                >
                  🗑️ Eliminar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleGuardar}
                  disabled={guardando}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap disabled:opacity-50"
                >
                  {guardando ? "Guardando..." : "💾 Guardar"}
                </button>
                <button
                  onClick={() => {
                    setEditando(false);
                    // Recargar datos originales
                  setFormData({
                    cliente: {
                      nombre: presupuesto.cliente?.nombre || '',
                      rubro: presupuesto.cliente?.rubro || '',
                      ciudad: presupuesto.cliente?.ciudad || '',
                      email: presupuesto.cliente?.email || '',
                      telefono: presupuesto.cliente?.telefono || ''
                    },
                    fecha: presupuesto.fecha ? new Date(presupuesto.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    validez: presupuesto.validez || 30,
                    estado: presupuesto.estado || 'borrador',
                    observaciones: presupuesto.observaciones || '',
                    notasInternas: presupuesto.notasInternas || ''
                  });
                    setItems(presupuesto.items || []);
                    setPorcentajeDescuento(presupuesto.porcentajeDescuento || 0);
                    setError("");
                  }}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
                >
                  ✕ Cancelar
                </button>
              </>
            )}
          </div>
        </div>

        {mostrarConfirmacion && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400 font-medium mb-2">
              ¿Estás seguro de que deseas eliminar este presupuesto?
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

        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Información del Cliente */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Información del Cliente</h3>
          {editando ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nombre *</label>
                <input
                  type="text"
                  name="cliente.nombre"
                  value={formData.cliente.nombre || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Rubro</label>
                <input
                  type="text"
                  name="cliente.rubro"
                  value={formData.cliente.rubro || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Ciudad</label>
                <input
                  type="text"
                  name="cliente.ciudad"
                  value={formData.cliente.ciudad || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  name="cliente.email"
                  value={formData.cliente.email || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p><strong className="text-slate-300">Nombre:</strong> <span className="text-slate-200">{presupuesto.cliente?.nombre || 'N/A'}</span></p>
              {presupuesto.cliente?.rubro && (
                <p><strong className="text-slate-300">Rubro:</strong> <span className="text-slate-200">{presupuesto.cliente.rubro}</span></p>
              )}
              {presupuesto.cliente?.ciudad && (
                <p><strong className="text-slate-300">Ciudad:</strong> <span className="text-slate-200">{presupuesto.cliente.ciudad}</span></p>
              )}
              {presupuesto.cliente?.email && (
                <p><strong className="text-slate-300">Email:</strong> <span className="text-slate-200">{presupuesto.cliente.email}</span></p>
              )}
              {presupuesto.cliente?.telefono && (
                <p><strong className="text-slate-300">Teléfono:</strong> <span className="text-slate-200">{presupuesto.cliente.telefono}</span></p>
              )}
            </div>
          )}
        </div>

        {/* Información del Presupuesto */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Información del Presupuesto</h3>
          {editando ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Fecha *</label>
                <input
                  type="date"
                  name="fecha"
                  value={formData.fecha}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Validez (días) *</label>
                <input
                  type="number"
                  name="validez"
                  value={formData.validez}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Estado *</label>
                <select
                  name="estado"
                  value={formData.estado}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="borrador">Borrador</option>
                  <option value="enviado">Enviado</option>
                  <option value="aceptado">Aceptado</option>
                  <option value="rechazado">Rechazado</option>
                  <option value="vencido">Vencido</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p><strong className="text-slate-300">Fecha:</strong> <span className="text-slate-200">{formatearFecha(presupuesto.fecha)}</span></p>
              <p><strong className="text-slate-300">Validez:</strong> <span className="text-slate-200">{presupuesto.validez || 30} días</span></p>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Items del Presupuesto</h3>
          {editando ? (
            <>
              <div className="flex justify-end mb-4">
                <button
                  type="button"
                  onClick={agregarItem}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                >
                  + Agregar Item
                </button>
              </div>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="p-3 bg-slate-700 rounded-lg border border-slate-600">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-5">
                        <label className="block text-sm font-medium text-slate-300 mb-2">Descripción *</label>
                        <input
                          type="text"
                          value={item.descripcion || ''}
                          onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                          required
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-300 mb-2">Cantidad</label>
                        <input
                          type="number"
                          value={item.cantidad || 1}
                          onChange={(e) => handleItemChange(index, 'cantidad', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                          min="1"
                          required
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-slate-300 mb-2">Precio Unitario *</label>
                        <input
                          type="number"
                          value={item.precioUnitario || ''}
                          onChange={(e) => handleItemChange(index, 'precioUnitario', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                          min="0"
                          step="0.01"
                          required
                        />
                      </div>
                      <div className="md:col-span-2 flex items-end gap-2">
                        <div className="flex-1 text-right">
                          <label className="block text-sm font-medium text-slate-300 mb-2">Subtotal</label>
                          <p className="text-slate-200 font-semibold">
                            {formatearMoneda((item.cantidad || 1) * (parseFloat(item.precioUnitario) || 0))}
                          </p>
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => eliminarItem(index)}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-4 bg-slate-700 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-300">Subtotal:</span>
                  <span className="text-slate-200 font-semibold">{formatearMoneda(subtotal)}</span>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Descuento (%)</label>
                  <input
                    type="number"
                    value={porcentajeDescuento}
                    onChange={(e) => setPorcentajeDescuento(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>
                {descuento > 0 && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-300">Descuento:</span>
                    <span className="text-red-400 font-semibold">-{formatearMoneda(descuento)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t border-slate-600">
                  <span className="text-lg font-semibold text-slate-200">Total:</span>
                  <span className="text-2xl font-bold text-slate-100">{formatearMoneda(total)}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Descripción</th>
                      <th className="text-center py-2 px-3 text-slate-300 font-semibold">Cantidad</th>
                      <th className="text-right py-2 px-3 text-slate-300 font-semibold">Precio Unit.</th>
                      <th className="text-right py-2 px-3 text-slate-300 font-semibold">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {presupuesto.items?.map((item, index) => (
                      <tr key={index} className="border-b border-slate-700">
                        <td className="py-2 px-3 text-slate-200">{item.descripcion}</td>
                        <td className="py-2 px-3 text-center text-slate-300">{item.cantidad || 1}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{formatearMoneda(item.precioUnitario)}</td>
                        <td className="py-2 px-3 text-right text-slate-200 font-semibold">{formatearMoneda(item.subtotal || (item.cantidad || 1) * item.precioUnitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-4 bg-slate-700 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-300">Subtotal:</span>
                  <span className="text-slate-200 font-semibold">{formatearMoneda(presupuesto.subtotal)}</span>
                </div>
                {presupuesto.descuento > 0 && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-300">Descuento ({presupuesto.porcentajeDescuento}%):</span>
                    <span className="text-red-400 font-semibold">-{formatearMoneda(presupuesto.descuento)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t border-slate-600">
                  <span className="text-lg font-semibold text-slate-200">Total:</span>
                  <span className="text-2xl font-bold text-slate-100">{formatearMoneda(presupuesto.total)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Observaciones */}
        {(presupuesto.observaciones || presupuesto.notasInternas || editando) && (
          <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">Observaciones</h3>
            {editando ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Observaciones (visibles para el cliente)</label>
                  <textarea
                    name="observaciones"
                    value={formData.observaciones}
                    onChange={handleChange}
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Notas Internas</label>
                  <textarea
                    name="notasInternas"
                    value={formData.notasInternas}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {presupuesto.observaciones && (
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-2">Observaciones:</p>
                    <p className="text-slate-200 whitespace-pre-wrap">{presupuesto.observaciones}</p>
                  </div>
                )}
                {presupuesto.notasInternas && (
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-2">Notas Internas:</p>
                    <p className="text-slate-400 text-sm whitespace-pre-wrap">{presupuesto.notasInternas}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PresupuestoDetailPage() {
  return (
    <ProtectedRoute>
      <PresupuestoDetailPageContent />
    </ProtectedRoute>
  );
}

