"use client";

import { useState } from "react";
import { Icons } from "../Icons";
import ItemEditor from "./ItemEditor";

/**
 * Componente para editar una sección (plataforma) del informe
 * @param {Object} section - La sección a editar
 * @param {Function} onChange - Callback cuando cambia la sección
 * @param {Function} onDelete - Callback para eliminar la sección
 */
export default function SectionEditor({ section, onChange, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSectionChange = (field, value) => {
    onChange({
      ...section,
      [field]: value
    });
  };

  const handleItemChange = (itemIndex, itemData) => {
    const newItems = [...(section.items || [])];
    newItems[itemIndex] = itemData;
    handleSectionChange('items', newItems);
  };

  const handleAddItem = () => {
    const newItems = [...(section.items || []), {
      campaignName: '',
      objective: '',
      template: 'custom',
      metrics: {},
      notes: ''
    }];
    handleSectionChange('items', newItems);
  };

  const handleDeleteItem = (itemIndex) => {
    const newItems = (section.items || []).filter((_, i) => i !== itemIndex);
    handleSectionChange('items', newItems);
  };

  const getPlataformaNombre = (platform) => {
    const nombres = {
      meta: 'Meta Ads',
      google: 'Google Ads',
      otro: 'Otro'
    };
    return nombres[platform] || platform;
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-slate-400 hover:text-slate-200"
          >
            {isExpanded ? (
              <Icons.ChevronDown className="w-5 h-5" />
            ) : (
              <Icons.ChevronRight className="w-5 h-5" />
            )}
          </button>
          <select
            value={section.platform || 'otro'}
            onChange={(e) => handleSectionChange('platform', e.target.value)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-medium"
          >
            <option value="meta">Meta Ads</option>
            <option value="google">Google Ads</option>
            <option value="otro">Otro</option>
          </select>
          <input
            type="text"
            placeholder="Nombre de la sección (opcional)"
            value={section.name || ''}
            onChange={(e) => handleSectionChange('name', e.target.value)}
            className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm"
          />
        </div>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-slate-100 text-sm flex items-center gap-2"
        >
          <Icons.Trash className="w-4 h-4" />
          Eliminar
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {(section.items || []).length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              No hay campañas en esta sección
            </div>
          ) : (
            (section.items || []).map((item, itemIndex) => (
              <ItemEditor
                key={itemIndex}
                item={item}
                onChange={(itemData) => handleItemChange(itemIndex, itemData)}
                onDelete={() => handleDeleteItem(itemIndex)}
              />
            ))
          )}

          <button
            onClick={handleAddItem}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-slate-100 text-sm flex items-center justify-center gap-2"
          >
            <Icons.Plus className="w-4 h-4" />
            Agregar Campaña
          </button>
        </div>
      )}
    </div>
  );
}

