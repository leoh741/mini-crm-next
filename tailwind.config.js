/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Clases de etiquetas dinámicas (de tagColors.js): bg-{color}-900/30, text-{color}-400, border-{color}-700
    'bg-blue-900/30', 'text-blue-400', 'border-blue-700',
    'bg-purple-900/30', 'text-purple-400', 'border-purple-700',
    'bg-green-900/30', 'text-green-400', 'border-green-700',
    'bg-yellow-900/30', 'text-yellow-400', 'border-yellow-700',
    'bg-pink-900/30', 'text-pink-400', 'border-pink-700',
    'bg-indigo-900/30', 'text-indigo-400', 'border-indigo-700',
    'bg-teal-900/30', 'text-teal-400', 'border-teal-700',
    'bg-orange-900/30', 'text-orange-400', 'border-orange-700',
    'bg-cyan-900/30', 'text-cyan-400', 'border-cyan-700',
    'bg-rose-900/30', 'text-rose-400', 'border-rose-700',
    'bg-emerald-900/30', 'text-emerald-400', 'border-emerald-700',
    'bg-amber-900/30', 'text-amber-400', 'border-amber-700',
    'bg-violet-900/30', 'text-violet-400', 'border-violet-700',
    'bg-fuchsia-900/30', 'text-fuchsia-400', 'border-fuchsia-700',
    'bg-sky-900/30', 'text-sky-400', 'border-sky-700',
    'bg-lime-900/30', 'text-lime-400', 'border-lime-700',
    // Clases adicionales usadas en el código estático
    'bg-red-900/30', 'text-red-400', 'border-red-700',
    'bg-slate-800/50', 'bg-slate-900/30', 'text-slate-300', 'text-slate-400', 'border-slate-700',
    'text-blue-200', 'text-blue-300', 'text-blue-300/80', 'text-blue-300/70', 'border-blue-800',
    'text-indigo-200', 'text-indigo-300', 'text-indigo-300/80', 'text-indigo-300/70', 'border-indigo-800',
    'bg-amber-500/30', 'border-amber-500/30',
    'text-blue-100/90', 'text-green-100/90', 'text-purple-100/90', 'text-orange-100/90',
    'text-cyan-100/90', 'text-pink-100/90', 'text-emerald-100/90', 'text-red-100/90',
    'border-blue-500/20', 'border-green-500/20', 'border-purple-500/20', 'border-orange-500/20',
    'border-cyan-500/20', 'border-pink-500/20', 'border-emerald-500/20', 'border-red-500/20',
    'border-indigo-500/30', 'border-violet-500/30', 'border-red-800',
    // Hover states para botones
    'hover:bg-blue-600', 'hover:bg-blue-700', 'hover:bg-indigo-600', 'hover:bg-indigo-700', 'hover:bg-indigo-800',
    'hover:bg-violet-700', 'hover:bg-violet-800', 'hover:bg-green-600', 'hover:bg-green-700',
    'hover:bg-red-600', 'hover:bg-red-700', 'hover:bg-slate-600', 'hover:bg-slate-700',
    'hover:bg-amber-700',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

