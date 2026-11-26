export function setupPasswordVisibility(container, getLanguage) {
  const fields = [...container.querySelectorAll('input[type="password"]')].map((input) => {
    const label = input.closest('label');
    const wrapper = document.createElement('div');
    wrapper.className = 'password-control';
    label.before(wrapper);
    wrapper.append(label);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-visibility';
    button.setAttribute('aria-controls', input.id);
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '👁︎';
    button.append(icon);
    wrapper.append(button);

    const update = () => {
      const shown = input.type === 'text';
      const fieldName = label.querySelector('span').textContent;
      const action = getLanguage() === 'en'
        ? (shown ? 'Hide' : 'Show')
        : (shown ? 'Ocultar' : 'Mostrar');
      button.setAttribute('aria-label', `${action} ${fieldName}`);
      button.setAttribute('aria-pressed', String(shown));
    };
    button.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      update();
    });
    input.form.addEventListener('reset', () => { input.type = 'password'; update(); });
    update();
    return { input, update };
  });
  return {
    update: () => fields.forEach(({ update }) => update()),
    conceal: () => fields.forEach(({ input, update }) => { input.type = 'password'; update(); }),
  };
}
