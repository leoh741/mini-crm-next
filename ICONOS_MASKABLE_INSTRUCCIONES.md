# Instrucciones para Generar Iconos Maskable

## 🎯 Objetivo
Generar iconos maskable en 192x192 y 512x512 con:
- **Fondo azul**: `#1c3d82`
- **Logo blanco**: `#FFFFFF`
- **Safe zone**: El logo debe estar dentro del 80% central del icono

## 📋 Opción 1: Herramienta Online (Recomendado)

### Usar Maskable.app Editor
1. Ve a: https://maskable.app/editor
2. Sube tu logo actual (`/public/icons/icon-512.png`)
3. Configura:
   - **Background color**: `#1c3d82`
   - **Foreground color**: `#FFFFFF`
   - Asegúrate de que el logo esté dentro del **safe zone** (80% central)
4. Descarga los iconos en tamaños 192x192 y 512x512
5. Renómbralos y guárdalos en `/public/icons/`:
   - `icon-192-maskable.png`
   - `icon-512-maskable.png`

### Usar PWA Builder Image Generator
1. Ve a: https://www.pwabuilder.com/imageGenerator
2. Sube tu logo
3. Selecciona "Maskable" y configura el fondo azul `#1c3d82`
4. Descarga y guarda en `/public/icons/`

## 📋 Opción 2: Manual con Photoshop/GIMP

1. Crea una imagen cuadrada del tamaño deseado (192x192 o 512x512)
2. Rellena el fondo con color `#1c3d82`
3. Coloca tu logo blanco centrado
4. **IMPORTANTE**: El logo debe estar dentro del **80% central** (safe zone)
   - Para 192x192: logo máximo 153x153px, centrado
   - Para 512x512: logo máximo 409x409px, centrado
5. Exporta como PNG sin transparencia
6. Guarda como `icon-192-maskable.png` o `icon-512-maskable.png` en `/public/icons/`

## 📋 Opción 3: Script Node.js (Requiere sharp)

```bash
# Instalar sharp
npm install sharp --save-dev

# Ejecutar script
node scripts/generateMaskableIcons.js
```

**Nota**: El script requiere que exista `/public/icons/icon-512.png` como base.

## ✅ Verificación

Después de generar los iconos, verifica que:
- ✅ `icon-192-maskable.png` existe en `/public/icons/`
- ✅ `icon-512-maskable.png` existe en `/public/icons/`
- ✅ Ambos tienen fondo azul `#1c3d82`
- ✅ El logo está centrado y dentro del safe zone (80% central)
- ✅ No tienen transparencia (fondo sólido)

## 🚀 Después de Generar

1. Los iconos ya están configurados en `manifest.json`
2. Los colores ya están actualizados a `#1c3d82`
3. Limpia la caché del navegador
4. Desinstala y reinstala la PWA
5. Prueba en un dispositivo Samsung Galaxy

## 📱 Especificaciones Técnicas

### Safe Zone para Iconos Maskable
- **Área total**: 100% del icono
- **Safe zone**: 80% central (deja 10% de padding en cada lado)
- El logo debe estar completamente dentro del safe zone para evitar recortes

### Ejemplo de Safe Zone:
```
┌─────────────────────┐
│  (10% padding)      │
│  ┌───────────────┐  │
│  │               │  │
│  │  Safe Zone    │  │ ← Logo aquí (80%)
│  │  (80%)        │  │
│  │               │  │
│  └───────────────┘  │
│  (10% padding)      │
└─────────────────────┘
```

