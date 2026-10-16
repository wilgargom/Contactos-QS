const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build', 'azure');

// Lista explícita: no publicar ejecutables locales, ZIP, credenciales ni datos.
const runtimeFiles = ['server.js', 'package.json', 'web.config', 'src', 'public'];
for (const name of runtimeFiles) {
  if (!fs.existsSync(path.join(root, name))) {
    throw new Error(`Falta un archivo de ejecución: ${name}`);
  }
}
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of runtimeFiles) {
  fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
// La aplicación actual solo utiliza módulos integrados de Node.js 24.
console.log(`Paquete Azure creado en ${output}`);
