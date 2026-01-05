"use client";

import { useState } from "react";
import { Icons } from "../Icons";
import { getTemplateFields, getTemplateName, METRIC_TEMPLATES } from "../../lib/reportTemplates";

/**
 * Componente para editar un item (campaña) dentro de una sección
 * @param {Object} item - El item a editar
 * @param {Function} onChange - Callback cuando cambia el item
 * @param {Function} onDelete - Callback para eliminar el item
 */
export default function ItemEditor({ item, onChange, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [customMetrics, setCustomMetrics] = useState([]);
  const [showAddMetricInput, setShowAddMetricInput] = useState(false);
  const [newMetricKey, setNewMetricKey] = useState('');

  const templateFields = getTemplateFields(item.template || 'custom');

  const handleItemChange = (field, value) => {
    onChange({
      ...item,
      [field]: value
    });
  };

  const handleMetricChange = (key, value) => {
    const newMetrics = { ...(item.metrics || {}) };
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      newMetrics[key] = numValue;
    } else if (value === '' || value === null || value === undefined) {
      delete newMetrics[key];
    }
    handleItemChange('metrics', newMetrics);
  };

  const handleAddCustomMetric = () => {
    setShowAddMetricInput(true);
  };

  const handleConfirmAddMetric = () => {
    if (newMetricKey && newMetricKey.trim()) {
      const key = newMetricKey.trim();
      // Validar que la clave no esté vacía
      if (key && !item.metrics?.hasOwnProperty(key)) {
        // Verificar que no esté en el template
        const isInTemplate = templateFields.some(f => f.key === key);
        if (!isInTemplate) {
          setCustomMetrics([...customMetrics, key]);
          handleMetricChange(key, 0);
          setNewMetricKey('');
          setShowAddMetricInput(false);
        } else {
          alert('Esta métrica ya existe en el template seleccionado.');
        }
      } else if (item.metrics?.hasOwnProperty(key)) {
        alert('Esta métrica ya existe.');
      }
    }
  };

  const handleCancelAddMetric = () => {
    setNewMetricKey('');
    setShowAddMetricInput(false);
  };

  const handleRemoveCustomMetric = (key) => {
    setCustomMetrics(customMetrics.filter(k => k !== key));
    const newMetrics = { ...(item.metrics || {}) };
    delete newMetrics[key];
    handleItemChange('metrics', newMetrics);
  };

  // Detectar métricas personalizadas que no están en el template
  const existingCustomMetrics = Object.keys(item.metrics || {}).filter(key => {
    return !templateFields.some(f => f.key === key);
  });

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-slate-400 hover:text-slate-200"
          >
            {isExpanded ? (
              <Icons.ChevronDown className="w-4 h-4" />
            ) : (
              <Icons.ChevronRight className="w-4 h-4" />
            )}
          </button>
          <input
            type="text"
            placeholder="Nombre de la campaña *"
            value={item.campaignName || ''}
            onChange={(e) => handleItemChange('campaignName', e.target.value)}
            className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
            required
          />
        </div>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-slate-100 text-sm flex items-center gap-2"
        >
          <Icons.Trash className="w-4 h-4" />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Template</label>
              <select
                value={item.template || 'custom'}
                onChange={(e) => handleItemChange('template', e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
              >
                {Object.keys(METRIC_TEMPLATES).map(key => (
                  <option key={key} value={key}>{getTemplateName(key)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Objetivo (opcional)</label>
              <input
                type="text"
                placeholder="Objetivo de la campaña"
                value={item.objective || ''}
                onChange={(e) => handleItemChange('objective', e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
              />
            </div>
          </div>

          {/* Métricas del template */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Métricas</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {templateFields.map(field => {
                const isComputed = field.computed === true;
                const value = item.metrics?.[field.key];
                
                return (
                  <div key={field.key}>
                    <label className="block text-xs text-slate-400 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                      {isComputed && <span className="text-slate-500 ml-1">(calculado)</span>}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={value !== undefined && value !== null ? value : ''}
                      onChange={(e) => handleMetricChange(field.key, e.target.value)}
                      disabled={isComputed}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      required={field.required}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Métricas personalizadas adicionales */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs text-slate-400">Métricas Personalizadas</label>
              {!showAddMetricInput && (
                <button
                  onClick={handleAddCustomMetric}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-100 text-xs flex items-center gap-1"
                >
                  <Icons.Plus className="w-3 h-3" />
                  Agregar
                </button>
              )}
            </div>

            {/* Input para agregar nueva métrica */}
            {showAddMetricInput && (
              <div className="mb-3 p-3 bg-slate-800 border border-slate-700 rounded">
                <label className="block text-xs text-slate-400 mb-2">Nombre de la métrica</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ej: revenue, leads, etc."
                    value={newMetricKey}
                    onChange={(e) => setNewMetricKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleConfirmAddMetric();
                      } else if (e.key === 'Escape') {
                        handleCancelAddMetric();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleConfirmAddMetric}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-slate-100 text-sm flex items-center gap-1"
                  >
                    <Icons.Check className="w-4 h-4" />
                    Agregar
                  </button>
                  <button
                    onClick={handleCancelAddMetric}
                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-slate-100 text-sm"
                  >
                    <Icons.X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Lista de métricas personalizadas */}
            {(existingCustomMetrics.length > 0 || customMetrics.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...new Set([...existingCustomMetrics, ...customMetrics])].map(key => (
                  <div key={key}>
                    <label className="block text-xs text-slate-400 mb-1">{key}</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={item.metrics?.[key] !== undefined && item.metrics?.[key] !== null ? item.metrics[key] : ''}
                        onChange={(e) => handleMetricChange(key, e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
                      />
                      <button
                        onClick={() => handleRemoveCustomMetric(key)}
                        className="px-2 py-1.5 bg-red-600 hover:bg-red-700 rounded text-slate-100"
                        title="Eliminar métrica"
                      >
                        <Icons.X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Botón para agregar métrica personalizada si no hay ninguna */}
            {existingCustomMetrics.length === 0 && customMetrics.length === 0 && !showAddMetricInput && (
              <button
                onClick={handleAddCustomMetric}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-slate-100 text-sm flex items-center justify-center gap-2"
              >
                <Icons.Plus className="w-4 h-4" />
                Agregar Métrica Personalizada
              </button>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notas (opcional)</label>
            <textarea
              placeholder="Notas sobre esta campaña..."
              value={item.notes || ''}
              onChange={(e) => handleItemChange('notes', e.target.value)}
              rows={2}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

