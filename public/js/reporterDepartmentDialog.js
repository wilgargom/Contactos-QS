// Elección explícita por aporte, ligada a la ficha, consulta y sesión vigentes.
const ReporterDepartmentDialog = {
  context: null,

  close(owner = null) {
    if (owner && this.context?.owner !== owner) return;
    this.context = null;
    const dialog = document.getElementById('reporter-department-dialog');
    if (dialog?.open) dialog.close();
  },

  open(owner, tab) {
    if (!owner.isReporterVerified() || App.suspended || !App.currentUser ||
        (App.activeTab && App.activeTab !== tab)) return false;
    const departments = owner.reporterDepartments();
    if (departments.length <= 1) return false;
    const dialog = document.getElementById('reporter-department-dialog');
    if (!dialog) return false;
    this.close();
    const context = this.context = { owner, funcionario: owner.funcionarioIdentificado,
      email: owner.recomiendaEmail, lookup: owner.reporterLookupVersion, session: App.sessionVersion, tab };
    const current = () => this.context === context && !App.suspended && App.currentUser &&
      App.sessionVersion === context.session && owner.reporterLookupVersion === context.lookup &&
      owner.funcionarioIdentificado === context.funcionario && owner.recomiendaEmail === context.email &&
      owner.isReporterVerified() && (!App.activeTab || App.activeTab === tab);
    document.getElementById('reporter-department-person').textContent = owner.funcionarioIdentificado.nombre;
    document.getElementById('reporter-department-help').textContent = tab === 'bulk'
      ? 'Seleccione la dependencia a la que corresponden todos los contactos de este archivo. Para reportar otra dependencia, realice una carga separada.'
      : 'Seleccione la escuela o departamento al que corresponde este contacto.';
    const choices = document.getElementById('reporter-department-choices');
    const confirm = document.getElementById('reporter-department-confirm');
    choices.replaceChildren();
    confirm.disabled = true;
    for (const department of departments) {
      const label = document.createElement('label'); label.className = 'reporter-department-option';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'reporter-department-choice'; input.value = department.id;
      input.required = true; input.checked = department.id === owner.selectedDeptoId;
      const name = document.createElement('span'); name.textContent = department.nombre;
      label.appendChild(input); label.appendChild(name); choices.appendChild(label);
      input.onchange = () => { if (current()) confirm.disabled = false; };
      if (input.checked) confirm.disabled = false;
    }
    const cancel = () => {
      if (this.context !== context) return;
      this.close();
      document.getElementById(tab === 'bulk' ? 'bulk-choose-department' : 'reg-choose-department')?.focus();
    };
    dialog.oncancel = event => { event.preventDefault(); cancel(); };
    document.getElementById('reporter-department-cancel').onclick = cancel;
    document.getElementById('reporter-department-form').onsubmit = event => {
      event.preventDefault();
      if (!current()) { if (this.context === context) this.close(); return; }
      const selected = choices.querySelector('input:checked')?.value;
      if (!owner.reporterDepartments().some(d => d.id === selected)) return;
      this.close();
      owner.selectReporterDepartment(selected);
    };
    dialog.showModal();
    return true;
  }
};
