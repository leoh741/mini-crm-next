"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReport } from "../../../lib/reportsUtils";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { Icons } from "../../../components/Icons";
import SectionEditor from "../../../components/reports/SectionEditor";

function NuevoInformePageContent() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    clienteNombre: "",
    clienteEmail: "",
    titulo: "",
    periodo: {
      from: "",
      to: ""
    },
    moneda: "ARS",
    porcentajeImpuestos: 0,
    estado: "borrador",
    sections: [],
    reportNotes: {
      observaciones: "",
      recomendaciones: ""
    }
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError("");
  };

  const handlePeriodoChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      periodo: {
        ...prev.periodo,
        [field]: value
      }
    }));
  };

  const handleReportNotesChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      reportNotes: {
        ...prev.reportNotes,
        [field]: value
      }
    }));
  };

  const handleSectionChange = (sectionIndex, sectionData) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex] = sectionData;
    setFormData(prev => ({
      ...prev,
      sections: newSections
    }));
  };

  const handleAddSection = () => {
    setFormData(prev => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          platform: 'meta',
          name: '',
          items: []
        }
      ]
    }));
  };

  const handleDeleteSection = (sectionIndex) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== sectionIndex)
    }));
  };

  const validateStep1 = () => {
    if (!formData.clienteNombre.trim()) {
      setError("El nombre del cliente es requerido");
      return false;
    }
    if (!formData.titulo.trim()) {
      setError("El título es requerido");
      return false;
    }
    if (!formData.periodo.from || !formData.periodo.to) {
      setError("El período (fecha desde y hasta) es requerido");
      return false;
    }
    const from = new Date(formData.periodo.from + 'T00:00:00');
    const to = new Date(formData.periodo.to + 'T23:59:59');
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      setError("Las fechas deben ser válidas");
      return false;
    }
    if (from > to) {
      setError("La fecha desde debe ser anterior a la fecha hasta");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (formData.sections.length === 0) {
      setError("Debe agregar al menos una sección (plataforma)");
      return false;
    }
    for (const section of formData.sections) {
      if (section.items && section.items.length === 0) {
        setError("Cada sección debe tener al menos una campaña");
        return false;
      }
      if (section.items) {
        for (const item of section.items) {
          if (!item.campaignName || !item.campaignName.trim()) {
            setError("Todas las campañas deben tener un nombre");
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    setError("");
    if (step === 1 && !validateStep1()) {
      return;
    }
    if (step === 2 && !validateStep2()) {
      return;
    }
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep(step - 1);
      setError("");
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validaciones finales
      if (!validateStep1() || !validateStep2()) {
        setLoading(false);
        return;
      }

      // Validar que todos los campos requeridos estén presentes
      if (!formData.clienteNombre || !formData.clienteNombre.trim()) {
        setError("El nombre del cliente es requerido");
        setLoading(false);
        return;
      }

      if (!formData.titulo || !formData.titulo.trim()) {
        setError("El título es requerido");
        setLoading(false);
        return;
      }

      if (!formData.periodo || !formData.periodo.from || !formData.periodo.to) {
        setError("El período (fecha desde y hasta) es requerido");
        setLoading(false);
        return;
      }

      // Validar y convertir fechas
      // Crear fechas en hora local para evitar problemas de zona horaria
      const fechaFrom = new Date(formData.periodo.from + 'T00:00:00');
      const fechaTo = new Date(formData.periodo.to + 'T23:59:59');
      
      if (isNaN(fechaFrom.getTime()) || isNaN(fechaTo.getTime())) {
        setError("Las fechas deben ser válidas");
        setLoading(false);
        return;
      }

      if (fechaFrom > fechaTo) {
        setError("La fecha desde debe ser anterior a la fecha hasta");
        setLoading(false);
        return;
      }

      const reportData = {
        clienteNombre: formData.clienteNombre.trim(),
        clienteEmail: formData.clienteEmail ? formData.clienteEmail.trim() : undefined,
        titulo: formData.titulo.trim(),
        periodo: {
          from: fechaFrom.toISOString(),
          to: fechaTo.toISOString()
        },
        moneda: formData.moneda || 'ARS',
        porcentajeImpuestos: formData.porcentajeImpuestos ? Number(formData.porcentajeImpuestos) : 0,
        estado: formData.estado || 'borrador',
        sections: formData.sections || [],
        reportNotes: formData.reportNotes || {}
      };

      console.log('[NuevoInforme] Enviando datos:', {
        clienteNombre: reportData.clienteNombre,
        titulo: reportData.titulo,
        periodo: reportData.periodo,
        sectionsCount: reportData.sections.length
      });

      const nuevoInforme = await createReport(reportData);
      if (nuevoInforme) {
        router.push(`/informes/${nuevoInforme._id || nuevoInforme.reportId}`);
      } else {
        setError("Error al crear el informe. No se recibió respuesta del servidor.");
        setLoading(false);
      }
    } catch (err) {
      console.error('Error al crear informe:', err);
      const errorMessage = err.message || "Error al crear el informe. Por favor, intenta nuevamente.";
      setError(errorMessage);
      setLoading(false);
    }
  };

  const steps = [
    { number: 1, title: "Datos Base", description: "Información general del informe" },
    { number: 2, title: "Secciones y Campañas", description: "Agregar métricas por plataforma" },
    { number: 3, title: "Notas y Recomendaciones", description: "Observaciones y recomendaciones" },
    { number: 4, title: "Compartir y Publicar", description: "Estado y compartir" }
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">Nuevo Informe</h1>
        <p className="text-slate-400 text-sm">Crea un informe profesional con métricas de campañas publicitarias</p>
      </div>

      {/* Steps indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {steps.map((s, index) => (
            <div key={s.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step === s.number
                    ? 'bg-blue-600 text-white'
                    : step > s.number
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {step > s.number ? <Icons.Check className="w-5 h-5" /> : s.number}
                </div>
                <div className="mt-2 text-center">
                  <div className={`text-xs font-medium ${step >= s.number ? 'text-slate-200' : 'text-slate-500'}`}>
                    {s.title}
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`h-1 flex-1 mx-2 ${step > s.number ? 'bg-green-600' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Step 1: Datos Base */}
      {step === 1 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Datos Base</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Nombre del Cliente *
              </label>
              <input
                type="text"
                name="clienteNombre"
                value={formData.clienteNombre}
                onChange={handleChange}
                placeholder="Ej: Cliente S.A."
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Email del Cliente (opcional)
              </label>
              <input
                type="email"
                name="clienteEmail"
                value={formData.clienteEmail}
                onChange={handleChange}
                placeholder="cliente@ejemplo.com"
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Título del Informe *
              </label>
              <input
                type="text"
                name="titulo"
                value={formData.titulo}
                onChange={handleChange}
                placeholder="Ej: Informe Mensual - Enero 2026"
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Fecha Desde *
                </label>
                <input
                  type="date"
                  value={formData.periodo.from}
                  onChange={(e) => handlePeriodoChange('from', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Fecha Hasta *
                </label>
                <input
                  type="date"
                  value={formData.periodo.to}
                  onChange={(e) => handlePeriodoChange('to', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Moneda
              </label>
              <select
                name="moneda"
                value={formData.moneda}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="ARS">ARS - Peso Argentino</option>
                <option value="USD">USD - Dólar Estadounidense</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Secciones y Campañas */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Secciones y Campañas</h2>
              <button
                onClick={handleAddSection}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white flex items-center gap-2"
              >
                <Icons.Plus className="w-4 h-4" />
                Agregar Sección
              </button>
            </div>
            {formData.sections.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="mb-4">No hay secciones agregadas</p>
                <button
                  onClick={handleAddSection}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white"
                >
                  Agregar Primera Sección
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {formData.sections.map((section, index) => (
                  <SectionEditor
                    key={index}
                    section={section}
                    onChange={(sectionData) => handleSectionChange(index, sectionData)}
                    onDelete={() => handleDeleteSection(index)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Notas y Recomendaciones */}
      {step === 3 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Notas y Recomendaciones</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Observaciones (opcional)
              </label>
              <textarea
                value={formData.reportNotes.observaciones}
                onChange={(e) => handleReportNotesChange('observaciones', e.target.value)}
                placeholder="Observaciones sobre el informe..."
                rows={6}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Recomendaciones (opcional)
              </label>
              <textarea
                value={formData.reportNotes.recomendaciones}
                onChange={(e) => handleReportNotesChange('recomendaciones', e.target.value)}
                placeholder="Recomendaciones para el cliente..."
                rows={6}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Compartir y Publicar */}
      {step === 4 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Compartir y Publicar</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Estado
              </label>
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="borrador">Borrador</option>
                <option value="publicado">Publicado</option>
              </select>
              <p className="mt-2 text-sm text-slate-400">
                {formData.estado === 'borrador' 
                  ? "El informe se guardará como borrador. Podrás publicarlo más tarde."
                  : "El informe se publicará inmediatamente. Podrás compartirlo después de guardarlo."}
              </p>
            </div>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-300">
                <strong>Nota:</strong> Después de crear el informe, podrás activar el compartir y obtener un enlace de solo lectura para enviar al cliente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between mt-6">
        <button
          onClick={handlePrevious}
          disabled={step === 1 || loading}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
        >
          <Icons.ArrowUturnLeft className="w-4 h-4" />
          Anterior
        </button>
        {step < 4 ? (
          <button
            onClick={handleNext}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            Siguiente
            <Icons.ArrowUturnLeft className="w-4 h-4 rotate-180" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            {loading ? "Guardando..." : "Crear Informe"}
            <Icons.Check className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function NuevoInformePage() {
  return (
    <ProtectedRoute>
      <NuevoInformePageContent />
    </ProtectedRoute>
  );
}

