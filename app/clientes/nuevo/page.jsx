"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarCliente, guardarEstadoPagoMes, limpiarCacheClientes } from "../../../lib/clientesUtils";
import { todosLosServiciosPagados } from "../../../lib/clienteHelpers";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { Icons } from "../../../components/Icons";

function NuevoClientePageContent() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    nombre: "",
    rubro: "",
    fechaPago: "",
    pagoUnico: false,
    pagado: false,
    pagoMesSiguiente: false,
    observaciones: ""
  });
  const [servicios, setServicios] = useState([
    { nombre: "", precio: "" }
  ]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviciosPagados, setServiciosPagados] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setError("");
  };

  const handleServicioChange = (index, field, value) => {
    const nuevosServicios = [...servicios];
    nuevosServicios[index] = { ...nuevosServicios[index], [field]: value };
    setServicios(nuevosServicios);
  };

  const agregarServicio = () => {
    setServicios([...servicios, { nombre: "", precio: "" }]);
  };

  const eliminarServicio = (index) => {
    if (servicios.length > 1) {
      setServicios(servicios.filter((_, i) => i !== index));
      // Eliminar también el estado de pago de ese servicio si existe
      const nuevosServiciosPagados = { ...serviciosPagados };
      // Reindexar servicios pagados
      const reindexados = {};
      Object.keys(nuevosServiciosPagados).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum < index) {
          reindexados[keyNum] = nuevosServiciosPagados[key];
        } else if (keyNum > index) {
          reindexados[keyNum - 1] = nuevosServiciosPagados[key];
        }
        // keyNum === index se omite (se elimina)
      });
      setServiciosPagados(reindexados);
    }
  };

  const handleToggleServicioPagado = (index) => {
    setServiciosPagados(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validaciones
    if (!formData.nombre.trim()) {
      setError("El nombre es requerido");
      setLoading(false);
      return;
    }

    // Validar servicios
    const serviciosValidos = servicios.filter(s => s.nombre.trim() && s.precio);
    if (serviciosValidos.length === 0) {
      setError("Debe agregar al menos un servicio con nombre y precio");
      setLoading(false);
      return;
    }

    // Validar que todos los servicios tengan precio válido
    for (const servicio of serviciosValidos) {
      if (!servicio.precio || parseFloat(servicio.precio) <= 0) {
        setError("Todos los servicios deben tener un precio mayor a 0");
        setLoading(false);
        return;
      }
    }

    // Validar fecha de pago solo si NO es pago único
    if (!formData.pagoUnico) {
      if (!formData.fechaPago || parseInt(formData.fechaPago) < 1 || parseInt(formData.fechaPago) > 28) {
        setError("La fecha de pago debe ser entre 1 y 28");
        setLoading(false);
        return;
      }
    }

    // Preparar servicios
    const serviciosFormateados = serviciosValidos.map(s => ({
      nombre: s.nombre.trim(),
      precio: parseInt(s.precio)
    }));

    // Calcular si todos los servicios están pagados
    const todosPagados = serviciosFormateados.every((_, index) => serviciosPagados[index] === true);
    
    // Preparar datos
    const nuevoCliente = {
      nombre: formData.nombre.trim(),
      rubro: formData.rubro.trim() || undefined,
      servicios: serviciosFormateados,
      fechaPago: formData.pagoUnico ? undefined : parseInt(formData.fechaPago),
      pagoUnico: formData.pagoUnico,
      pagado: formData.pagado || todosPagados,
      pagoMesSiguiente: formData.pagoMesSiguiente && !formData.pagoUnico,
      observaciones: formData.observaciones.trim() || undefined
    };

    // Guardar cliente
    const resultado = await agregarCliente(nuevoCliente);

    if (resultado) {
      // Guardar estados de pago por servicio si hay servicios marcados como pagados
      if (Object.keys(serviciosPagados).length > 0 && Object.values(serviciosPagados).some(p => p === true)) {
        // Esperar un momento para que el cliente se guarde, luego obtenerlo y guardar estados
        try {
          // Preparar serviciosPagados: solo incluir índices válidos
          const serviciosPagadosFinal = {};
          serviciosFormateados.forEach((_, index) => {
            if (serviciosPagados[index] === true) {
              serviciosPagadosFinal[index] = true;
            }
          });
          
          // Obtener el cliente recién creado
          const { getClientes } = await import('../../../lib/clientesUtils');
          // Esperar un poco para que MongoDB guarde el cliente
          await new Promise(resolve => setTimeout(resolve, 800));
          const clientes = await getClientes(true); // Forzar recarga
          const clienteGuardado = clientes.find(c => c.nombre === nuevoCliente.nombre && c.rubro === nuevoCliente.rubro);
          
          if (clienteGuardado) {
            const hoy = new Date();
            const mesActual = hoy.getMonth();
            const añoActual = hoy.getFullYear();
            const clienteId = clienteGuardado._id || clienteGuardado.id || clienteGuardado.crmId;
            
            await guardarEstadoPagoMes(clienteId, mesActual, añoActual, todosPagados, serviciosPagadosFinal);
            limpiarCacheClientes();
          }
        } catch (err) {
          console.error('Error al guardar estados de pago por servicio:', err);
          // No fallar la creación del cliente si falla esto
        }
      }
      
      setSuccess(true);
      setTimeout(() => {
        router.push("/clientes");
      }, 1500);
    } else {
      setError("Error al guardar el cliente. Por favor, intenta nuevamente.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-slate-400 hover:text-slate-200 mb-4"
        >
          ← Volver
        </button>
        <h2 className="text-2xl font-semibold">Agregar Nuevo Cliente</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-900/30 border border-green-700 rounded-lg text-green-400">
            <span className="flex items-center gap-2"><Icons.Check className="inline" /> Cliente agregado exitosamente. Redirigiendo...</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-300 mb-2">
              Nombre de la Empresa *
            </label>
            <input
              type="text"
              id="nombre"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder="Ej: Panadería La Espiga"
              required
            />
          </div>

          <div>
            <label htmlFor="rubro" className="block text-sm font-medium text-slate-300 mb-2">
              Rubro
            </label>
            <input
              type="text"
              id="rubro"
              name="rubro"
              value={formData.rubro}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder="Ej: Gastronomía"
            />
          </div>

          <div>
            <label htmlFor="fechaPago" className="block text-sm font-medium text-slate-300 mb-2">
              Día de Pago del Mes {!formData.pagoUnico && '*'}
            </label>
            <input
              type="number"
              id="fechaPago"
              name="fechaPago"
              value={formData.fechaPago}
              onChange={handleChange}
              disabled={formData.pagoUnico}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="5"
              min="1"
              max="28"
              required={!formData.pagoUnico}
            />
            <p className="text-xs text-slate-400 mt-1">Día del mes (1-28)</p>
          </div>
        </div>

        {/* Sección de Servicios */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="block text-sm font-medium text-slate-300">
              Servicios *
            </label>
            <button
              type="button"
              onClick={agregarServicio}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
            >
              + Agregar Servicio
            </button>
          </div>
          
          <div className="space-y-3">
            {servicios.map((servicio, index) => (
              <div key={index} className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Nombre del Servicio
                    </label>
                    <input
                      type="text"
                      value={servicio.nombre}
                      onChange={(e) => handleServicioChange(index, 'nombre', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                      placeholder="Ej: Diseño Web, Mantenimiento, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Precio (ARS)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={servicio.precio}
                        onChange={(e) => handleServicioChange(index, 'precio', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                        placeholder="50000"
                        min="1"
                      />
                      {servicios.length > 1 && (
                        <button
                          type="button"
                          onClick={() => eliminarServicio(index)}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {/* Checkbox para marcar servicio como pagado */}
                <div className="mt-3 pt-3 border-t border-slate-600">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-300">Estado de pago del servicio:</label>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        serviciosPagados[index] === true
                          ? 'bg-green-900/30 text-green-400 border border-green-700'
                          : 'bg-orange-900/30 text-orange-400 border border-orange-700'
                      }`}>
                        {serviciosPagados[index] === true ? 'Pagado' : 'Pendiente'}
                      </span>
                      <input
                        type="checkbox"
                        checked={serviciosPagados[index] === true}
                        onChange={() => handleToggleServicioPagado(index)}
                        className="w-4 h-4 bg-slate-800 border-slate-700 rounded focus:ring-blue-500"
                      />
                      <label className="text-xs text-slate-400">Marcar como pagado</label>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="pagoUnico"
              name="pagoUnico"
              checked={formData.pagoUnico}
              onChange={handleChange}
              className="w-4 h-4 bg-slate-800 border-slate-700 rounded focus:ring-blue-500"
            />
            <label htmlFor="pagoUnico" className="ml-2 text-sm text-slate-300">
              Pago único (no mensual)
            </label>
          </div>

          {!formData.pagoUnico && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="pagoMesSiguiente"
                name="pagoMesSiguiente"
                checked={formData.pagoMesSiguiente}
                onChange={handleChange}
                className="w-4 h-4 bg-slate-800 border-slate-700 rounded focus:ring-blue-500"
              />
              <label htmlFor="pagoMesSiguiente" className="ml-2 text-sm text-slate-300">
                Pago corresponde al mes siguiente
              </label>
            </div>
          )}

          {servicios.filter(s => s.nombre.trim() && s.precio).length > 1 ? (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="pagado"
                name="pagado"
                checked={todosLosServiciosPagados({ servicios: servicios.filter(s => s.nombre.trim() && s.precio) }, serviciosPagados)}
                onChange={(e) => {
                  // Si se marca, marcar todos; si se desmarca, desmarcar todos
                  const nuevoEstado = e.target.checked;
                  const serviciosValidos = servicios.filter(s => s.nombre.trim() && s.precio);
                  const nuevosServiciosPagados = {};
                  serviciosValidos.forEach((_, index) => {
                    nuevosServiciosPagados[index] = nuevoEstado;
                  });
                  setServiciosPagados(nuevosServiciosPagados);
                  setFormData(prev => ({ ...prev, pagado: nuevoEstado }));
                }}
                className="w-4 h-4 bg-slate-800 border-slate-700 rounded focus:ring-blue-500"
              />
              <label htmlFor="pagado" className="ml-2 text-sm text-slate-300">
                Marcar todos los servicios como pagados
              </label>
            </div>
          ) : (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="pagado"
                name="pagado"
                checked={formData.pagado || serviciosPagados[0] === true}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, pagado: e.target.checked }));
                  setServiciosPagados({ 0: e.target.checked });
                }}
                className="w-4 h-4 bg-slate-800 border-slate-700 rounded focus:ring-blue-500"
              />
              <label htmlFor="pagado" className="ml-2 text-sm text-slate-300">
                Marcar como pagado
              </label>
            </div>
          )}
        </div>

        {/* Campo de observaciones */}
        <div>
          <label htmlFor="observaciones" className="block text-sm font-medium text-slate-300 mb-2">
            Observaciones
          </label>
          <textarea
            id="observaciones"
            name="observaciones"
            value={formData.observaciones}
            onChange={handleChange}
            rows={4}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            placeholder="Notas adicionales sobre el cliente..."
          />
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || success}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando..." : "Guardar Cliente"}
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

export default function NuevoClientePage() {
  return (
    <ProtectedRoute>
      <NuevoClientePageContent />
    </ProtectedRoute>
  );
}

