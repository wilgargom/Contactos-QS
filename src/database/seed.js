const { getDb, runTransaction } = require('./db');
const adminCredentials = require('../adminCredentials');

function seedDatabase() {
  const db = getDb();

  runTransaction((trx) => {
    // 1. Sedes Oficiales del TEC
    const sedesData = [
      { id: 'sede-cartago', codigo: 'CART', nombre: 'Campus Central Cartago' },
      { id: 'sede-sanjose', codigo: 'SJ', nombre: 'Campus Tecnológico Local San José' },
      { id: 'sede-sancarlos', codigo: 'SC', nombre: 'Campus Tecnológico Local San Carlos' },
      { id: 'sede-alajuela', codigo: 'AL', nombre: 'Centro Académico de Alajuela' },
      { id: 'sede-limon', codigo: 'LIM', nombre: 'Centro Académico de Limón' }
    ];

    const stmtSede = trx.prepare('INSERT OR IGNORE INTO sedes (id, codigo, nombre) VALUES (?, ?, ?)');
    for (const s of sedesData) {
      stmtSede.run(s.id, s.codigo, s.nombre);
    }

    // 2. Departamentos y Escuelas del TEC
    const deptosData = [
      { id: 'dep-comp', codigo: 'IC', nombre: 'Escuela de Ingeniería en Computación', sede: 'sede-cartago' },
      { id: 'dep-elec', codigo: 'IE', nombre: 'Escuela de Ingeniería Electrónica', sede: 'sede-cartago' },
      { id: 'dep-ind', codigo: 'PI', nombre: 'Escuela de Ingeniería en Producción Industrial', sede: 'sede-cartago' },
      { id: 'dep-biotech', codigo: 'IB', nombre: 'Escuela de Ingeniería en Biotecnología', sede: 'sede-cartago' },
      { id: 'dep-admin', codigo: 'AE', nombre: 'Escuela de Administración de Empresas', sede: 'sede-sanjose' },
      { id: 'dep-mecatr', codigo: 'IM', nombre: 'Escuela de Ingeniería Mecatrónica', sede: 'sede-cartago' },
      { id: 'dep-const', codigo: 'CO', nombre: 'Escuela de Ingeniería en Construcción', sede: 'sede-cartago' },
      { id: 'dep-inter', codigo: 'DCAI', nombre: 'Dirección de Cooperación y Asuntos Internacionales', sede: 'sede-cartago' }
    ];

    const stmtDepto = trx.prepare('INSERT OR IGNORE INTO departamentos (id, codigo, nombre, sede_id) VALUES (?, ?, ?, ?)');
    for (const d of deptosData) {
      stmtDepto.run(d.id, d.codigo, d.nombre, d.sede);
    }

    // 3. Retirar los accesos de demostración sin borrar su historial.
    const legacyIds = ['usr-admin-01', 'usr-admin-backup', 'usr-user-01', 'usr-user-02'];
    for (const id of legacyIds) {
      trx.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);
      trx.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(id);
    }

    // Una sola cuenta administrativa, validada exclusivamente en el servidor.
    const configured = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(adminCredentials.passwordHash);
    const previousAdmin = trx.prepare('SELECT * FROM usuarios WHERE id = ?').get(adminCredentials.id);
    if (previousAdmin && (previousAdmin.password_hash !== adminCredentials.passwordHash ||
        previousAdmin.email !== adminCredentials.username || !configured)) {
      trx.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(adminCredentials.id);
    }
    trx.prepare(`
      INSERT INTO usuarios (id, nombre_completo, email, password_hash, salt, rol, created_at, activo)
      VALUES (?, 'Administrador QS', ?, ?, '', 'ADMIN', ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash,
        salt = '', rol = 'ADMIN', activo = excluded.activo, sede_id = NULL, departamento_id = NULL
    `).run(adminCredentials.id, adminCredentials.username, adminCredentials.passwordHash, new Date().toISOString(), configured ? 1 : 0);

    // Ejemplos únicamente en pruebas aisladas; nunca en el arranque institucional.
    if (process.env.NODE_ENV !== 'test' || process.env.QS_SEED_DEMO !== '1') return;

    // 4. Contactos iniciales de prueba (para demostración inmediata de filtros, duplicados y exportación)
    const initialContacts = [
      {
        id: 'cnt-acad-01',
        tipo_contacto: 'ACADEMICO',
        source: 'Instituto Tecnológico de Costa Rica',
        title: 'Prof',
        first_name: 'David',
        last_name: 'Patterson',
        email: 'pattrsn@berkeley.edu',
        email_normalized: 'pattrsn@berkeley.edu',
        phone: '+15106421234',
        country_name: 'United States',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-comp',
        job_title: 'Professor Emeritus',
        department_unit: 'Computer Science Division',
        institution: 'University of California, Berkeley',
        subject_area: 'Computer Science & Information Systems',
        position: null,
        industry: null,
        company_name: null,
        estado: 'VALIDADO',
        metodo_ingreso: 'INDIVIDUAL',
        created_by: 'usr-admin-01',
        created_by_name: 'Lic. Administrador General QS',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        updated_by: null,
        updated_by_name: null,
        updated_at: null
      },
      {
        id: 'cnt-emp-01',
        tipo_contacto: 'EMPLEADOR',
        source: 'Instituto Tecnológico de Costa Rica',
        title: 'Ms',
        first_name: 'Sarah',
        last_name: 'Connor',
        email: 'sarah.connor@intel.com',
        email_normalized: 'sarah.connor@intel.com',
        phone: '+50622984000',
        country_name: 'Costa Rica',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-elec',
        job_title: null,
        department_unit: null,
        institution: null,
        subject_area: null,
        position: 'Engineering Director',
        industry: 'Technology / Software / IT',
        company_name: 'Intel Costa Rica',
        estado: 'VALIDADO',
        metodo_ingreso: 'INDIVIDUAL',
        created_by: 'usr-user-01',
        created_by_name: 'Ing. Carlos Brenes (Computación)',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        updated_by: null,
        updated_by_name: null,
        updated_at: null
      }
    ];

    const stmtContact = trx.prepare(`
      INSERT OR IGNORE INTO contactos (
        id, tipo_contacto, source, title, first_name, last_name, email, email_normalized, phone,
        country_name, sede_id, departamento_id, job_title, department_unit, institution, subject_area,
        position, industry, company_name, estado, metodo_ingreso, created_by, created_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of initialContacts) {
      stmtContact.run(
        c.id, c.tipo_contacto, c.source, c.title, c.first_name, c.last_name, c.email, c.email_normalized,
        c.phone, c.country_name, c.sede_id, c.departamento_id, c.job_title, c.department_unit,
        c.institution, c.subject_area, c.position, c.industry, c.company_name, c.estado,
        c.metodo_ingreso, c.created_by, c.created_by_name, c.created_at
      );
    }

    // 5. Padrón inicial de Funcionarios del TEC
    const initialFuncionarios = [
      {
        id: 'func-01',
        nombre: 'Dr. Carlos Brenes Solano',
        email: 'cbrenes@itcr.ac.cr',
        email_normalized: 'cbrenes@itcr.ac.cr',
        dependencia: 'Escuela de Ingeniería en Computación',
        sede: 'Campus Central Cartago',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-comp'
      },
      {
        id: 'func-02',
        nombre: 'Dra. Patricia Solís Gómez',
        email: 'psolis@itcr.ac.cr',
        email_normalized: 'psolis@itcr.ac.cr',
        dependencia: 'Escuela de Ingeniería Electrónica',
        sede: 'Campus Central Cartago',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-elec'
      },
      {
        id: 'func-03',
        nombre: 'Licda. Elena Vargas Castro',
        email: 'evargas@itcr.ac.cr',
        email_normalized: 'evargas@itcr.ac.cr',
        dependencia: 'Escuela de Administración de Empresas',
        sede: 'Campus Tecnológico Local San José',
        sede_id: 'sede-sanjose',
        departamento_id: 'dep-admin'
      },
      {
        id: 'func-04',
        nombre: 'Ing. Roberto Méndez Mora',
        email: 'rmendez@itcr.ac.cr',
        email_normalized: 'rmendez@itcr.ac.cr',
        dependencia: 'Escuela de Ingeniería en Producción Industrial',
        sede: 'Campus Central Cartago',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-ind'
      },
      {
        id: 'func-05',
        nombre: 'Dra. María Auxiliadora Gómez',
        email: 'mauxiliadora@itcr.ac.cr',
        email_normalized: 'mauxiliadora@itcr.ac.cr',
        dependencia: 'Dirección de Cooperación y Asuntos Internacionales',
        sede: 'Campus Central Cartago',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-inter'
      }
    ];

    const stmtFunc = trx.prepare(`
      INSERT OR IGNORE INTO funcionarios (
        id, nombre, email, email_normalized, dependencia, sede, sede_id, departamento_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const f of initialFuncionarios) {
      stmtFunc.run(f.id, f.nombre, f.email, f.email_normalized, f.dependencia, f.sede, f.sede_id, f.departamento_id, now, now);
      // La siembra no restituye dependencias que administración haya retirado.
      if (trx.prepare('SELECT changes() AS n').get().n) {
        trx.prepare('INSERT OR IGNORE INTO funcionario_departamentos VALUES (?, ?, ?)').run(f.id, f.departamento_id, 'PADRON');
      }
    }
  });

  console.log('✅ Base de datos inicializada y sembrada exitosamente.');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = {
  seedDatabase
};
