// Script para verificar procesos automáticos que puedan estar borrando datos
const { execSync } = require('child_process');

console.log('🔍 Verificando procesos automáticos que puedan borrar datos...\n');

try {
  // Verificar cron jobs
  console.log('📅 Cron jobs configurados:');
  try {
    const crontab = execSync('crontab -l 2>/dev/null || echo "No hay cron jobs"', { encoding: 'utf-8' });
    const lines = crontab.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (lines.length > 0) {
      lines.forEach(line => {
        if (line.includes('import') || line.includes('backup') || line.includes('delete')) {
          console.log(`  ⚠️  ${line}`);
        } else {
          console.log(`  ✓  ${line}`);
        }
      });
    } else {
      console.log('  ✓ No hay cron jobs configurados');
    }
  } catch (err) {
    console.log('  ✓ No hay cron jobs configurados');
  }
  
  console.log('\n📦 Procesos PM2:');
  try {
    const pm2List = execSync('pm2 list', { encoding: 'utf-8' });
    console.log(pm2List);
  } catch (err) {
    console.log('  ⚠️  Error al obtener procesos PM2:', err.message);
  }
  
  console.log('\n🔄 Procesos Node.js ejecutándose:');
  try {
    const nodeProcesses = execSync('ps aux | grep node | grep -v grep', { encoding: 'utf-8' });
    if (nodeProcesses.trim()) {
      console.log(nodeProcesses);
    } else {
      console.log('  ✓ No hay procesos Node.js ejecutándose');
    }
  } catch (err) {
    console.log('  ✓ No hay procesos Node.js ejecutándose');
  }
  
  console.log('\n📝 Verificando scripts en package.json:');
  try {
    const packageJson = require('../package.json');
    const scripts = packageJson.scripts || {};
    Object.entries(scripts).forEach(([name, script]) => {
      if (script.includes('import') || script.includes('backup') || script.includes('delete')) {
        console.log(`  ⚠️  ${name}: ${script}`);
      }
    });
  } catch (err) {
    console.log('  ⚠️  Error al leer package.json:', err.message);
  }
  
  console.log('\n✅ Verificación completada');
  
} catch (error) {
  console.error('❌ Error al verificar procesos:', error);
  process.exit(1);
}

