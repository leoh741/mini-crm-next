"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { Icons } from "../../../components/Icons";

function SendEmailPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [formData, setFormData] = useState({
    to: "",
    subject: "",
    text: "",
    html: "",
    replyTo: null,
  });

  // Cargar parámetros de URL cuando el componente se monta (para respuestas)
  useEffect(() => {
    if (searchParams) {
      const to = searchParams.get('to');
      const subject = searchParams.get('subject');
      const text = searchParams.get('text');
      const replyTo = searchParams.get('replyTo');
      
      if (to || subject || text) {
        setFormData({
          to: to || "",
          subject: subject || "",
          text: text || "",
          html: "",
          replyTo: replyTo || null,
        });
      }
    }
  }, [searchParams]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const newAttachments = files.map(file => ({
      file,
      name: file.name,
      size: file.size,
      type: file.type,
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    // Limpiar el input para permitir seleccionar el mismo archivo nuevamente
    e.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      // Preparar FormData para enviar archivos
      const formDataToSend = new FormData();
      formDataToSend.append('to', formData.to);
      formDataToSend.append('subject', formData.subject);
      formDataToSend.append('text', formData.text);
      if (formData.html) {
        formDataToSend.append('html', formData.html);
      }
      if (formData.replyTo) {
        formDataToSend.append('replyTo', formData.replyTo);
      }
      
      // Agregar archivos adjuntos
      attachments.forEach((attachment, index) => {
        formDataToSend.append(`attachment_${index}`, attachment.file);
      });

      const res = await fetch("/api/email/send", {
        method: "POST",
        body: formDataToSend, // No establecer Content-Type, el navegador lo hace automáticamente con FormData
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Error al enviar el correo");
      }

      setSuccess(true);
      // Limpiar formulario
      setFormData({
        to: "",
        subject: "",
        text: "",
        html: "",
        replyTo: null,
      });
      setAttachments([]);

      // Esperar un poco más para que el correo se guarde y el cache se actualice
      // Luego redirigir a la carpeta Sent con forceRefresh para asegurar que se vea el correo
      setTimeout(() => {
        // Redirigir a Sent con un parámetro para forzar actualización
        router.push("/email/inbox?carpeta=Sent&refresh=true");
      }, 4000); // Aumentado a 4 segundos para dar tiempo a que se actualice el cache
    } catch (err) {
      console.error("Error enviando correo:", err);
      setError(err.message || "Error desconocido al enviar el correo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Icons.X className="text-slate-400" />
        </button>
        <h1 className="text-2xl font-semibold text-slate-100">Nuevo correo</h1>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-red-400">
            <Icons.X className="text-lg" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-red-300 text-sm mt-2">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Para:</label>
          <input
            type="email"
            name="to"
            value={formData.to}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="correo@ejemplo.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Asunto:</label>
          <input
            type="text"
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Asunto del correo"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Mensaje (texto plano):</label>
          <textarea
            name="text"
            value={formData.text}
            onChange={handleChange}
            required
            rows={10}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Escribe tu mensaje aquí..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Mensaje (HTML) - Opcional:
          </label>
          <textarea
            name="html"
            value={formData.html}
            onChange={handleChange}
            rows={10}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            placeholder="<p>Contenido HTML opcional...</p>"
          />
          <p className="text-xs text-slate-500 mt-1">
            Si proporcionas HTML, se usará en lugar del texto plano
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Archivos adjuntos:
          </label>
          <div className="space-y-2">
            <label className="flex items-center justify-center w-full px-4 py-3 bg-slate-800 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
              <div className="flex flex-col items-center gap-2">
                <Icons.Document className="text-2xl text-slate-400" />
                <span className="text-sm text-slate-300">Haz clic para seleccionar archivos</span>
                <span className="text-xs text-slate-500">o arrastra y suelta aquí</span>
              </div>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
                accept="*/*"
              />
            </label>
            
            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Icons.Document className="text-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">{attachment.name}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(attachment.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors flex-shrink-0"
                      title="Eliminar archivo"
                    >
                      <Icons.X className="text-sm text-slate-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
          >
            {loading ? "Enviando..." : "Enviar correo"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-100 font-medium transition-colors"
          >
            Cancelar
          </button>
        </div>

        {success && (
          <div className="bg-green-900/50 border-2 border-green-600 rounded-lg p-4 animate-pulse">
            <div className="flex items-center gap-2 text-green-300">
              <Icons.Check className="text-xl" />
              <span className="font-semibold text-lg">¡Correo enviado exitosamente!</span>
            </div>
            <p className="text-green-200 text-sm mt-2">El correo ha sido enviado y guardado en la carpeta Enviados. Redirigiendo a la bandeja de entrada...</p>
          </div>
        )}
      </form>
    </div>
  );
}

export default function SendEmailPage() {
  return (
    <ProtectedRoute>
      <SendEmailPageContent />
    </ProtectedRoute>
  );
}

