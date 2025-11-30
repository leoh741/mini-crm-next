# Configuración para Desarrollo Local

## ⚠️ PROBLEMA CRÍTICO: Borrado de Datos del VPS

Si ejecutas `npm run dev` localmente y te conectas a la misma base de datos del VPS, **puedes borrar accidentalmente todos los datos del VPS**.

## 🔒 Protecciones Implementadas

El sistema ahora incluye protecciones automáticas:

1. **Detección de desarrollo local conectando a base remota**: El sistema detecta cuando ejecutas `npm run dev` localmente pero te conectas a una base de datos remota (VPS).

2. **Bloqueo de importaciones**: Las importaciones de backup están **BLOQUEADAS** cuando se detecta desarrollo local conectando a base remota.

3. **Advertencias en consola**: Verás advertencias claras en la consola si hay un problema de configuración.

## ✅ Configuración Correcta para Desarrollo Local

### Opción 1: Base de Datos Local (Recomendado)

Crea un archivo `.env.local` en la raíz del proyecto:

```env
# Base de datos LOCAL para desarrollo
MONGODB_URI=mongodb://localhost:27017/mini-crm-dev
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Ventajas:**
- ✅ No afecta los datos del VPS
- ✅ Puedes experimentar sin riesgo
- ✅ Puedes borrar y recrear la base de datos cuando quieras

**Requisitos:**
- Debes tener MongoDB instalado localmente
- MongoDB debe estar corriendo en `localhost:27017`

### Opción 2: Base de Datos Remota Diferente

Si necesitas usar una base de datos remota, usa una **diferente** a la del VPS:

```env
# Base de datos REMOTA DIFERENTE para desarrollo
MONGODB_URI=mongodb://usuario:password@servidor-remoto:27017/mini-crm-dev
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Importante:** Usa un nombre de base de datos diferente (ej: `mini-crm-dev` en lugar de `mini-crm`).

## ❌ Configuración INCORRECTA (PELIGROSA)

**NO hagas esto:**

```env
# ❌ PELIGROSO: Misma base de datos del VPS
MONGODB_URI=mongodb://usuario:password@vps-servidor:27017/mini-crm
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Por qué es peligroso:**
- Si importas un backup vacío o corrupto, borrarás todos los datos del VPS
- Cualquier operación destructiva afectará producción
- Puedes perder datos críticos accidentalmente

## 🔍 Cómo Verificar tu Configuración

### 1. Verificar qué base de datos estás usando

Al ejecutar `npm run dev`, verás en la consola:

```
[MongoDB] Usando MONGODB_URI de variables de entorno - Base de datos: 'mini-crm'
```

### 2. Si ves una advertencia de seguridad

Si ves este mensaje:

```
⚠️  ADVERTENCIA CRÍTICA DE SEGURIDAD ⚠️
Estás ejecutando en MODO DESARROLLO LOCAL pero conectando a
una base de datos REMOTA (probablemente del VPS).
```

**Acción inmediata:**
1. Detén el servidor (`Ctrl+C`)
2. Crea o modifica `.env.local` con una base de datos local
3. Reinicia el servidor

### 3. Verificar que las protecciones funcionan

Intenta importar un backup desde desarrollo local. Si está correctamente configurado:
- ✅ Si usas base de datos local: Funcionará normalmente
- ❌ Si usas base de datos remota: Verás un error de bloqueo de seguridad

## 🛠️ Solución Rápida

Si ya tienes datos borrados o necesitas restaurar:

1. **En el VPS**, ejecuta:
   ```bash
   npm run import-backup
   ```
   Y selecciona un backup reciente.

2. **O desde la aplicación web en el VPS**, usa la función de importar backup.

## 📝 Checklist de Configuración

Antes de ejecutar `npm run dev` localmente:

- [ ] Tengo un archivo `.env.local` configurado
- [ ] La base de datos en `.env.local` es LOCAL o DIFERENTE a la del VPS
- [ ] Si uso MongoDB local, está instalado y corriendo
- [ ] He verificado que no hay advertencias de seguridad en la consola
- [ ] Entiendo que las importaciones están bloqueadas si conecto a base remota

## 🆘 Si Necesitas Ayuda

Si sigues teniendo problemas:

1. Verifica los logs de la consola al iniciar `npm run dev`
2. Revisa el archivo `.env.local` (si existe)
3. Verifica que MongoDB local esté corriendo (si usas opción 1)
4. Consulta los logs del VPS para ver qué pasó: `pm2 logs crm-nextjs`

## 🔐 Mejores Prácticas

1. **Nunca** uses la misma base de datos para desarrollo y producción
2. **Siempre** usa `.env.local` para desarrollo (está en `.gitignore`)
3. **Verifica** las advertencias en la consola antes de hacer operaciones destructivas
4. **Haz backups** regularmente del VPS antes de hacer cambios importantes
5. **Prueba** las importaciones primero en una base de datos de desarrollo

