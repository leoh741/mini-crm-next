/**
 * Plantillas de métricas para diferentes tipos de campañas
 */

export const METRIC_TEMPLATES = {
  meta_conversaciones: {
    name: 'Meta Ads - Conversaciones',
    fields: [
      { key: 'spend', label: 'Spend (Inversión)', required: true, type: 'number' },
      { key: 'conversations', label: 'Conversaciones', required: true, type: 'number' },
      { key: 'cost_per_conversation', label: 'Costo por Conversación', required: false, type: 'number', computed: true },
      { key: 'reach', label: 'Alcance (Reach)', required: false, type: 'number' },
      { key: 'impressions', label: 'Impresiones', required: false, type: 'number' },
      { key: 'cpm', label: 'CPM', required: false, type: 'number', computed: true },
      { key: 'ctr', label: 'CTR (%)', required: false, type: 'number', computed: true },
      { key: 'clicks', label: 'Clicks', required: false, type: 'number' },
      { key: 'frequency', label: 'Frecuencia', required: false, type: 'number' }
    ]
  },
  google_search: {
    name: 'Google Ads - Búsqueda',
    fields: [
      { key: 'spend', label: 'Spend (Inversión)', required: true, type: 'number' },
      { key: 'clicks', label: 'Clicks', required: true, type: 'number' },
      { key: 'cpc', label: 'CPC', required: false, type: 'number', computed: true },
      { key: 'impressions', label: 'Impresiones', required: false, type: 'number' },
      { key: 'ctr', label: 'CTR (%)', required: false, type: 'number', computed: true },
      { key: 'conversions', label: 'Conversiones', required: false, type: 'number' },
      { key: 'cpa', label: 'CPA', required: false, type: 'number', computed: true }
    ]
  },
  custom: {
    name: 'Personalizado',
    fields: [
      { key: 'spend', label: 'Spend (Inversión)', required: false, type: 'number' }
    ]
  }
};

/**
 * Obtiene los campos de una plantilla
 */
export function getTemplateFields(template) {
  return METRIC_TEMPLATES[template]?.fields || METRIC_TEMPLATES.custom.fields;
}

/**
 * Obtiene el nombre de una plantilla
 */
export function getTemplateName(template) {
  return METRIC_TEMPLATES[template]?.name || 'Personalizado';
}

