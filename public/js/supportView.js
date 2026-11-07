const SupportModule = {
  init() {
    const container = document.getElementById('support-view');
    if (!container) return;

    const people = [
      {
        name: 'Wilson Garita Gómez',
        role: 'Unidad de Análisis y Gestión de la Información',
        email: 'wgarita@itcr.ac.cr',
        phone: '2550 2820'
      },
      {
        name: 'Raquel Mejías Elizondo',
        role: 'Coordinación',
        email: 'rmejias@itcr.ac.cr',
        phone: '2550 2844'
      }
    ];

    const html = `
      <article class="support-page">
        <header class="support-header">
          <h2><i class="fa-solid fa-headset" aria-hidden="true"></i> Contacto y soporte</h2>
          <p>Si presenta un inconveniente con la identificación, el registro de contactos, la actualización de información o el acceso a la plataforma, puede comunicarse con la persona encargada de su unidad.</p>
        </header>

        <div class="support-grid">
          ${people.map((person) => {
            const cleanPhone = String(person.phone || '').replace(/\s+/g, '');
            const mailto = `mailto:${person.email}`;
            const teamsLink = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(person.email)}`;

            return `
              <section class="support-card">
                <h3>${String(person.name || '')}</h3>
                <p class="support-role">${String(person.role || '')}</p>
                <ul class="support-list">
                  <li><i class="fa-regular fa-envelope" aria-hidden="true"></i><span>Correo: <a href="${mailto}">${person.email}</a></span></li>
                  <li><i class="fa-solid fa-phone" aria-hidden="true"></i><span>Teléfono: <a href="tel:+506${cleanPhone}">${person.phone}</a></span></li>
                  <li><i class="fa-regular fa-comment-dots" aria-hidden="true"></i><span><a href="${teamsLink}" target="_blank" rel="noopener noreferrer">Chatear por Microsoft Teams</a></span></li>
                  <li><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>Campus Tecnológico Central Cartago</span></li>
                </ul>
              </section>
            `;
          }).join('')}
        </div>

        <p class="support-note"><strong>Para agilizar la atención:</strong> indique la organización seleccionada, el correo utilizado y el mensaje mostrado por la aplicación, sin incluir contraseñas ni información confidencial.</p>
      </article>
    `;

    container.innerHTML = html;
  }
};

if (typeof module !== 'undefined') {
  module.exports = SupportModule;
}

