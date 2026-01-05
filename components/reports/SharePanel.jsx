"use client";

import { useState } from "react";
import { Icons } from "../Icons";
import { shareReport } from "../../lib/reportsUtils";

/**
 * Componente para gestionar el compartir de un informe
 * @param {Object} informe - El informe con datos de share
 * @param {Function} onUpdate - Callback cuando se actualiza el estado
 */
export default function SharePanel({ informe, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (!informe || !informe._id) {
    return null;
  }

  const isShared = informe.share?.enabled === true;
  const token = informe.share?.token;

  const handleToggleShare = async () => {
    try {
      setLoading(true);
      setError("");
      const enabled = !isShared;
      const updated = await shareReport(informe._id || informe.reportId, enabled);
      if (updated && onUpdate) {
        onUpdate(updated);
      }
    } catch (err) {
      console.error('Error al actualizar compartir:', err);
      setError(err.message || "Error al actualizar el estado de compartir");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!token) return;

    const shareUrl = `${window.location.origin}/informes/compartido/${token}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
      setError("No se pudo copiar el enlace. Por favor, cópialo manualmente.");
    }
  };

  const shareUrl = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/informes/compartido/${token}` : '';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <Icons.Share className="w-5 h-5" />
        Compartir Informe
      </h3>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-300 mb-1">
              {isShared ? "El informe está compartido" : "El informe no está compartido"}
            </p>
            <p className="text-sm text-slate-400">
              {isShared 
                ? "Cualquier persona con el enlace puede ver este informe (solo lectura)"
                : "Habilita el compartir para generar un enlace de solo lectura"}
            </p>
          </div>
          <button
            onClick={handleToggleShare}
            disabled={loading}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isShared
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Cargando...' : isShared ? 'Desactivar' : 'Activar'}
          </button>
        </div>

        {isShared && token && (
          <div className="bg-slate-900/50 rounded p-4 border border-slate-700">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Enlace compartible:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-100 text-sm font-medium flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Icons.Check className="w-4 h-4" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Icons.Link className="w-4 h-4" />
                    Copiar
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Este enlace permite ver el informe en modo de solo lectura sin necesidad de iniciar sesión.
            </p>
          </div>
        )}

        {informe.share?.expiresAt && (
          <p className="text-xs text-slate-400">
            El enlace expira el: {new Date(informe.share.expiresAt).toLocaleDateString('es-AR')}
          </p>
        )}
      </div>
    </div>
  );
}

