"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { Icons } from "../../../components/Icons";

function SendEmailPageContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    to: "",
    subject: "",
    text: "",
    html: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: formData.to,
          subject: formData.subject,
          text: formData.text,
          html: formData.html || undefined,
        }),
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
      });

      // Redirigir después de 2 segundos
      setTimeout(() => {
        router.push("/email/inbox");
      }, 2000);
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

      {success && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-green-400">
            <Icons.Check className="text-lg" />
            <span className="font-medium">Correo enviado exitosamente</span>
          </div>
          <p className="text-green-300 text-sm mt-2">Redirigiendo a la bandeja de entrada...</p>
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

