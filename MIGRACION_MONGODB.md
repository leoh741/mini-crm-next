# Migración a MongoDB - Guía de Uso

## 📋 Pasos para migrar el CRM a MongoDB

### 1. Configurar variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto con:

```
MONGODB_URI=tu_uri_de_mongodb_aqui
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Ejemplo de MONGODB_URI:**
```
MONGODB_URI=mongodb://localhost:27017/crm-digitalspace
```
o para MongoDB Atlas:
```
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/crm-digitalspace
```

### 2. Importar datos del backup JSON

Asegúrate de tener tu archivo de backup en `data/crm_backup.json`.

Luego ejecuta:

```bash
npm run import-backup
```

Este script:
- Conecta a MongoDB
- Limpia las colecciones existentes
- Importa todos los datos del backup JSON
- Muestra un resumen de lo importado

### 3. Iniciar el servidor

```bash
npm run dev
```

El CRM ahora funcionará completamente con MongoDB.

## 📁 Estructura de la migración

### Modelos creados:
- `models/Client.js` - Clientes
- `models/MonthlyPayment.js` - Pagos mensuales
- `models/Expense.js` - Gastos
- `models/Income.js` - Ingresos
- `models/User.js` - Usuarios

### APIs creadas:
- `app/api/clientes/route.js` - CRUD de clientes
- `app/api/pagos/route.js` - Gestión de pagos mensuales
- `app/api/gastos/route.js` - CRUD de gastos
- `app/api/ingresos/route.js` - CRUD de ingresos
- `app/api/usuarios/route.js` - CRUD de usuarios

### Utils actualizados:
- `lib/clientesUtils.js` - Ahora usa fetch a la API
- `lib/gastosUtils.js` - Ahora usa fetch a la API
- `lib/ingresosUtils.js` - Ahora usa fetch a la API
- `lib/usuariosUtils.js` - Ahora usa fetch a la API
- `lib/authUtils.js` - Actualizado para usar async/await

## ⚠️ Notas importantes

1. **Todas las funciones de utils ahora son async** - Asegúrate de usar `await` cuando las llames.

2. **El frontend ha sido actualizado** para usar async/await en todos los componentes.

3. **Los datos ya no se guardan en localStorage** - Todo se guarda en MongoDB.

4. **El script de importación** solo debe ejecutarse una vez para migrar los datos iniciales.

## 🔄 Flujo de datos

```
Frontend (React) 
  ↓ fetch()
API Routes (Next.js)
  ↓ connectDB()
MongoDB (Mongoose)
```

## 🐛 Solución de problemas

Si encuentras errores:

1. Verifica que `MONGODB_URI` esté correctamente configurada en `.env.local`
2. Asegúrate de que MongoDB esté corriendo (si es local)
3. Verifica que el archivo `data/crm_backup.json` exista
4. Revisa la consola del navegador y del servidor para ver errores específicos

