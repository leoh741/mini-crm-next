# Mini CRM Next.js

Mini CRM construido con Next.js 14 (JavaScript), React y Tailwind CSS.

## Estructura del proyecto

```
mini-crm-next/
 ├─ app/
 │   ├─ page.jsx (Home)
 │   ├─ layout.jsx
 │   ├─ globals.css
 │   └─ clientes/
 │        ├─ page.jsx
 │        └─ [id]/page.jsx
 ├─ components/
 │    └─ ClientList.jsx
 ├─ lib/
 │    └─ clientes.js
 └─ package.json
```

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Rutas

- `/` - Página de inicio
- `/clientes` - Lista de clientes
- `/clientes/[id]` - Detalle de un cliente

## Tecnologías

- Next.js 14
- React 18
- Tailwind CSS

