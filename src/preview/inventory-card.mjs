// Cada ficha mantém nome e valor como texto mesmo sem os ícones decorativos.
export function inventoryCard(kind, name, value, caption = '') {
  const item = document.createElement('li');
  item.className = 'inventory-card';
  const icon = document.createElement('i');
  icon.className = kind;
  icon.setAttribute('aria-hidden', 'true');
  const title = document.createElement('strong');
  title.textContent = name;
  const amount = document.createElement('span');
  amount.className = 'inventory-amount';
  amount.textContent = value;
  item.append(icon, title, amount);
  if (caption) {
    const description = document.createElement('small');
    description.textContent = caption;
    item.append(description);
  }
  return item;
}
