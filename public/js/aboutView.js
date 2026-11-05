const AboutModule = {
  init() {
    const container = document.getElementById('about-view');
    if (!container) return;
    container.innerHTML = `<article class="about-page">
      <header class="about-hero"><span class="about-icon" aria-hidden="true"><i class="fa-solid fa-ranking-star"></i></span><div><h2>Sistema de Gestión de Contactos para el Ranking Internacional QS</h2><p>Tecnológico de Costa Rica</p></div></header>
      <section><p>Esta aplicación web fue desarrollada para fortalecer la participación del Tecnológico de Costa Rica (TEC) en el Ranking QS, mediante la recopilación y gestión estandarizada de contactos externos para los procesos de evaluación de reputación académica y entre empleadores.</p><p>La herramienta facilita la recomendación de contactos mediante un formulario intuitivo, con identificación automática de información institucional a partir del correo electrónico, promoviendo la eficiencia, trazabilidad y confiabilidad de los registros.</p></section>
      <section><h3>Créditos y desarrollo</h3><h4>Iniciativa, conceptualización, diseño funcional y desarrollo</h4><div class="about-credit"><strong>Wilson Garita Gómez</strong><span>Unidad de Análisis y Gestión de la Información</span><span>Oficina de Planificación Institucional</span></div><p>La aplicación surge como una iniciativa propia de innovación y mejora de los procesos institucionales, desarrollada con el apoyo de herramientas de inteligencia artificial.</p></section>
      <section><h4>Colaboración en el desarrollo</h4><div class="about-credit"><strong>Eddye Carrillo Ulloa</strong><span>Estudiante de Administración de Tecnologías de Información</span></div></section>
      <footer>Año de creación: <strong>2026</strong></footer>
    </article>`;
  }
};
