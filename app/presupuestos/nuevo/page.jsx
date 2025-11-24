"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearPresupuesto, calcularTotales, calcularTotalConDescuento } from "../../../lib/presupuestosUtils";
import ProtectedRoute from "../../../components/ProtectedRoute";

function NuevoPresupuestoPageContent() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    cliente: {
      nombre: "",
      rubro: "",
      ciudad: "",
      email: "",
      telefono: ""
    },
    fecha: new Date().toISOString().split('T')[0],
    validez: 30,
    estado: "borrador",
    observaciones: "",
    notasInternas: ""
  });
  const [items, setItems] = useState([
    { descripcion: "", cantidad: 1, precioUnitario: "" }
  ]);
  const [porcentajeDescuento, setPorcentajeDescuento] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validaciones
    if (!formData.cliente.nombre.trim()) {
      setError("El nombre del cliente es requerido");
      setLoading(false);
      return;
    }

    // Validar items
    const itemsValidos = items.filter(item => item.descripcion.trim() && item.precioUnitario);
    if (itemsValidos.length === 0) {
      setError("Debe agregar al menos un item con descripción y precio");
      setLoading(false);
      return;
    }

    // Validar que todos los items tengan precio válido
    for (const item of itemsValidos) {
      if (!item.precioUnitario || parseFloat(item.precioUnitario) <= 0) {
        setError("Todos los items deben tener un precio mayor a 0");
        setLoading(false);
        return;
      }
    }

    // Preparar items
    const itemsFormateados = itemsValidos.map(item => ({
      descripcion: item.descripcion.trim(),
      cantidad: parseInt(item.cantidad) || 1,
      precioUnitario: parseFloat(item.precioUnitario),
      subtotal: (parseInt(item.cantidad) || 1) * parseFloat(item.precioUnitario)
    }));

    // Preparar datos del presupuesto
    const nuevoPresupuesto = {
      cliente: {
        nombre: formData.cliente.nombre.trim(),
        ...(formData.cliente.rubro?.trim() && { rubro: formData.cliente.rubro.trim() }),
        ...(formData.cliente.ciudad?.trim() && { ciudad: formData.cliente.ciudad.trim() }),
        ...(formData.cliente.email?.trim() && { email: formData.cliente.email.trim() }),
        ...(formData.cliente.telefono?.trim() && { telefono: formData.cliente.telefono.trim() })
      },
      fecha: formData.fecha ? new Date(formData.fecha) : new Date(),
      validez: parseInt(formData.validez) || 30,
      items: itemsFormateados,
      subtotal: subtotal,
      descuento: descuento,
      porcentajeDescuento: porcentajeDescuento,
      total: total,
      estado: formData.estado || 'borrador',
      ...(formData.observaciones?.trim() && { observaciones: formData.observaciones.trim() }),
      ...(formData.notasInternas?.trim() && { notasInternas: formData.notasInternas.trim() })
    };

    try {
      const resultado = await crearPresupuesto(nuevoPresupuesto);
      
      if (resultado) {
        setSuccess(true);
        setTimeout(() => {
          router.push("/presupuestos");
        }, 1500);
      }
    } catch (err) {
      setError(err.message || "Error al guardar el presupuesto. Por favor, intenta nuevamente.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-slate-400 hover:text-slate-200 mb-4"
        >
          ← Volver
        </button>
        <h2 className="text-2xl font-semibold">Nuevo Presupuesto</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-900/30 border border-green-700 rounded-lg text-green-400">
            ✓ Presupuesto creado exitosamente. Redirigiendo...
          </div>
        )}

        {/* Información del Cliente */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Información del Cliente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cliente.nombre" className="block text-sm font-medium text-slate-300 mb-2">
                Nombre del Cliente *
              </label>
              <input
                type="text"
                id="cliente.nombre"
                name="cliente.nombre"
                value={formData.cliente.nombre}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                placeholder="Ej: Panadería La Espiga"
                required
              />
            </div>

            <div>
              <label htmlFor="cliente.rubro" className="block text-sm font-medium text-slate-300 mb-2">
                Rubro
              </label>
              <input
                type="text"
                id="cliente.rubro"
                name="cliente.rubro"
                value={formData.cliente.rubro}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                placeholder="Ej: Gastronomía"
              />
            </div>

            <div>
              <label htmlFor="cliente.ciudad" className="block text-sm font-medium text-slate-300 mb-2">
                Ciudad
              </label>
              <input
                type="text"
                id="cliente.ciudad"
                name="cliente.ciudad"
                value={formData.cliente.ciudad}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                placeholder="Ej: Rosario"
              />
            </div>

            <div>
              <label htmlFor="cliente.email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                id="cliente.email"
                name="cliente.email"
                value={formData.cliente.email}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                placeholder="contacto@empresa.com"
              />
            </div>

            <div>
              <label htmlFor="cliente.telefono" className="block text-sm font-medium text-slate-300 mb-2">
                Teléfono
              </label>
              <input
                type="tel"
                id="cliente.telefono"
                name="cliente.telefono"
                value={formData.cliente.telefono}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                placeholder="+54 9 11 1234-5678"
              />
            </div>
          </div>
        </div>

        {/* Información del Presupuesto */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Información del Presupuesto</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="fecha" className="block text-sm font-medium text-slate-300 mb-2">
                Fecha *
              </label>
              <input
                type="date"
                id="fecha"
                name="fecha"
                value={formData.fecha}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label htmlFor="validez" className="block text-sm font-medium text-slate-300 mb-2">
                Validez (días) *
              </label>
              <input
                type="number"
                id="validez"
                name="validez"
                value={formData.validez}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                min="1"
                required
              />
            </div>

            <div>
              <label htmlFor="estado" className="block text-sm font-medium text-slate-300 mb-2">
                Estado *
              </label>
              <select
                id="estado"
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
              </select>
            </div>
          </div>
        </div>

        {/* Items del Presupuesto */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Items del Presupuesto</h3>
            <button
              type="button"
              onClick={agregarItem}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
            >
              + Agregar Item
            </button>
          </div>
          
          <div className="space-y-3 mb-4">
            {items.map((item, index) => (
              <div key={index} className="p-3 bg-slate-700 rounded-lg border border-slate-600">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Descripción *
                    </label>
                    <input
                      type="text"
                      value={item.descripcion}
                      onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                      placeholder="Ej: Diseño Web, Desarrollo, etc."
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      value={item.cantidad}
                      onChange={(e) => handleItemChange(index, 'cantidad', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                      min="1"
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Precio Unitario *
                    </label>
                    <input
                      type="number"
                      value={item.precioUnitario}
                      onChange={(e) => handleItemChange(index, 'precioUnitario', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                      placeholder="50000"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <div className="md:col-span-2 flex items-end gap-2">
                    <div className="flex-1 text-right">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Subtotal
                      </label>
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
        </div>

        {/* Descuento */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Descuento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="porcentajeDescuento" className="block text-sm font-medium text-slate-300 mb-2">
                Porcentaje de Descuento (%)
              </label>
              <input
                type="number"
                id="porcentajeDescuento"
                value={porcentajeDescuento}
                onChange={(e) => setPorcentajeDescuento(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                min="0"
                max="100"
                step="0.01"
              />
            </div>
            <div className="flex items-end">
              <div className="w-full">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Descuento Aplicado
                </label>
                <p className="text-xl font-semibold text-slate-200">
                  {formatearMoneda(descuento)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Totales */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-300">Subtotal:</span>
            <span className="text-slate-200 font-semibold">{formatearMoneda(subtotal)}</span>
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

        {/* Observaciones */}
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Observaciones</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="observaciones" className="block text-sm font-medium text-slate-300 mb-2">
                Observaciones (visibles para el cliente)
              </label>
              <textarea
                id="observaciones"
                name="observaciones"
                value={formData.observaciones}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Notas adicionales sobre el presupuesto..."
              />
            </div>
            <div>
              <label htmlFor="notasInternas" className="block text-sm font-medium text-slate-300 mb-2">
                Notas Internas (solo para uso interno)
              </label>
              <textarea
                id="notasInternas"
                name="notasInternas"
                value={formData.notasInternas}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Notas internas que no se mostrarán al cliente..."
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || success}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando..." : "Guardar Presupuesto"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NuevoPresupuestoPage() {
  return (
    <ProtectedRoute>
      <NuevoPresupuestoPageContent />
    </ProtectedRoute>
  );
}

