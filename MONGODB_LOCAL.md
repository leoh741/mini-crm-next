# Configuración de MongoDB Local para Desarrollo

Esta guía te ayudará a configurar una base de datos MongoDB local para desarrollo y testing, separada de la base de datos de producción en el VPS.

## ¿Por qué usar MongoDB local?

- ✅ **Seguridad**: No afectas la base de datos de producción
- ✅ **Rapidez**: Sin latencia de red
- ✅ **Testing**: Puedes probar cambios sin riesgo
- ✅ **Desarrollo offline**: No necesitas conexión al VPS
- ✅ **Datos de prueba**: Puedes crear y borrar datos sin preocupaciones

## Requisitos Previos

1. **MongoDB instalado localmente**
   - Windows: [Descargar MongoDB Community Server](https://www.mongodb.com/try/download/community)
   - macOS: `brew install mongodb-community`
   - Linux: [Instrucciones oficiales](https://www.mongodb.com/docs/manual/installation/)

2. **MongoDB corriendo**
   - Windows: `net start MongoDB` (si está como servicio)
   - macOS: `brew services start mongodb-community`
   - Linux: `sudo systemctl start mongod`

## Configuración Rápida

### Opción 1: Script Automático (Recomendado)

```bash
npm run setup-local-mongodb
```

Este script te guiará paso a paso para:
- Verificar que MongoDB esté instalado
- Verificar que MongoDB esté corriendo
- Crear archivo `.env.local` con configuración local
- Verificar la conexión
- Crear índices necesarios

### Opción 2: Configuración Manual

1. **Crear archivo `.env.local`** en la raíz del proyecto:

```env
# Base de datos local para desarrollo
MONGODB_URI=mongodb://127.0.0.1:27017/mini-crm-dev
```

2. **Si MongoDB tiene autenticación habilitada**:

```env
MONGODB_URI=mongodb://usuario:password@127.0.0.1:27017/mini-crm-dev?authSource=admin
```

3. **Verificar conexión**:

```bash
mongosh mongodb://127.0.0.1:27017/mini-crm-dev
```

## Uso

### Desarrollo Normal

```bash
npm run dev
```

La aplicación automáticamente usará la base de datos local si existe `.env.local`.

### Verificar qué base de datos se está usando

Al iniciar la aplicación, verás en la consola:

```
[MongoDB] Usando MONGODB_URI de variables de entorno - Base de datos: 'mini-crm-dev'
```

### Importar datos de producción

1. **Exportar backup desde producción**:
   - Ve a la aplicación en producción
   - Usa el botón "Exportar" para descargar un backup

2. **Importar en local**:
   - Ejecuta la aplicación local: `npm run dev`
   - Ve a http://localhost:3000
   - Usa el botón "Importar" y selecciona el archivo de backup
   - ⚠️ **Importante**: Esto importará a tu base de datos LOCAL, no a producción

## Scripts Útiles

```bash
# Configurar MongoDB local
npm run setup-local-mongodb

# Verificar estado de la base de datos local
npm run check-db

# Crear índices en la base de datos local
npm run create-indexes

# Crear usuario en MongoDB local (si usas autenticación)
npm run create-user
```

## Estructura de Archivos

```
mini-crm-next/
├── .env.local              # Configuración local (NO se sube a git)
├── .env.local.example      # Plantilla de ejemplo
├── scripts/
│   └── setup-local-mongodb.js  # Script de configuración
└── MONGODB_LOCAL.md        # Esta documentación
```

## Protecciones de Seguridad

El proyecto tiene protecciones integradas para evitar conectar accidentalmente a producción desde desarrollo:

- ⚠️ **Advertencia automática**: Si intentas conectar a una base remota desde desarrollo local, verás una advertencia
- 🔒 **Separación de entornos**: `.env.local` es para desarrollo, `.env` es para producción
- ✅ **Fallback seguro**: Si no hay `.env.local`, usa `mongodb://127.0.0.1:27017/mini-crm` (local)

## Solución de Problemas

### MongoDB no está corriendo

**Windows:**
```bash
net start MongoDB
```

**macOS:**
```bash
brew services start mongodb-community
```

**Linux:**
```bash
sudo systemctl start mongod
```

### Error de conexión

1. Verifica que MongoDB esté corriendo:
   ```bash
   mongosh --eval "db.adminCommand('ping')"
   ```

2. Verifica que el puerto 27017 esté libre:
   ```bash
   # Windows
   netstat -an | findstr 27017
   
   # macOS/Linux
   lsof -i :27017
   ```

3. Verifica la URI en `.env.local`:
   ```bash
   cat .env.local | grep MONGODB_URI
   ```

### Error de autenticación

Si MongoDB local tiene autenticación:

1. Crea un usuario:
   ```bash
   mongosh
   use admin
   db.createUser({
     user: "devuser",
     pwd: "devpassword",
     roles: [{ role: "readWrite", db: "mini-crm-dev" }]
   })
   ```

2. Actualiza `.env.local`:
   ```env
   MONGODB_URI=mongodb://devuser:devpassword@127.0.0.1:27017/mini-crm-dev?authSource=admin
   ```

### Limpiar base de datos local

Si quieres empezar de cero:

```bash
mongosh mongodb://127.0.0.1:27017/mini-crm-dev
use mini-crm-dev
db.dropDatabase()
```

## Mejores Prácticas

1. ✅ **Siempre usa `.env.local` para desarrollo**
2. ✅ **Nunca subas `.env.local` a git** (ya está en `.gitignore`)
3. ✅ **Usa nombres de base de datos diferentes**: `mini-crm-dev` para local, `mini-crm` para producción
4. ✅ **Haz backups regulares** de tu base de datos local si tienes datos importantes
5. ✅ **Prueba cambios en local** antes de aplicar a producción

## Comandos Rápidos

```bash
# Iniciar MongoDB (Windows)
net start MongoDB

# Iniciar MongoDB (macOS)
brew services start mongodb-community

# Conectarse a MongoDB local
mongosh mongodb://127.0.0.1:27017/mini-crm-dev

# Ver bases de datos
mongosh --eval "show dbs"

# Ver colecciones
mongosh mongodb://127.0.0.1:27017/mini-crm-dev --eval "show collections"

# Contar documentos
mongosh mongodb://127.0.0.1:27017/mini-crm-dev --eval "db.clients.countDocuments({})"
```

## Siguiente Paso

Una vez configurado, ejecuta:

```bash
npm run dev
```

Y la aplicación usará automáticamente tu base de datos MongoDB local. 🚀

