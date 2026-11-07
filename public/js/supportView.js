const SupportModule = {
  init() {
    const container = document.getElementById('support-view');
    if (!container) return;
    const people = [
      { name: 'Wilson Garita Gómez', role: 'Unidad de Análisis y Gestión de la Información', email: 'wgarita@tec.ac.cr', phone: '2550 2820' },
      { name: 'Raquel Mejías Elizondo', role: 'Coordinación', email: 'rmejias@tec.ac.cr', phone: '2550 2844' }
    ];
    container.innerHTML = `<article class="support-page">
      <header class="support-header"><h2><i class="fa-solid fa-headset" aria-hidden="true"></i> Contacto y soporte</h2><p>Si presenta un inconveniente con la identificación, el registro de contactos, una carga masiva o la consulta de información, comuníquese con alguna de las personas responsables.</p></header>
      <div class="support-grid">${people.map(person => `<section class="support-card"><h3>${person.name}</h3><p class="support-role">${person.role}</p><ul class="support-list">
        <li><i class="fa-regular fa-envelope" aria-hidden="true"></i><span>Correo: <a href="mailto:${person.email}">${person.email}</a></span></li>
        <li><i class="fa-solid fa-phone" aria-hidden="true"></i><span>Teléfono: <a href="tel:+506${person.phone.replace(/\s/g,'')}">${person.phone}</a></span></li>
        <li><i class="fa-regular fa-comment-dots" aria-hidden="true"></i><span><a href="https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(person.email)}" target="_blank" rel="noopener noreferrer">Chatear por Microsoft Teams</a></span></li>
        <li><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>Campus Tecnológico Central Cartago</span></li>
      </ul></section>`).join('')}</div>
      <p class="support-note"><strong>Para agilizar la atención:</strong> indique la organización seleccionada, el correo utilizado y el mensaje mostrado por la aplicación, sin incluir contraseñas.</p>
    </article>`;
  }
};

if (typeof module !== 'undefined') module.exports = SupportModule;
