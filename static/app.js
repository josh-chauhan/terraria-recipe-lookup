const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const emptyState = document.getElementById('empty-state');
const itemPanel = document.getElementById('item-panel');
const itemHeader = document.getElementById('item-header');
const recipesSection = document.getElementById('recipes-section');
const usedInSection = document.getElementById('used-in-section');
const treeSection = document.getElementById('tree-section');

let debounceTimer = null;

function onImgError(img) {
  // A handful of item sprites (mostly animated tiles) are .gif instead of
  // .png - try that once before giving up and hiding the broken icon.
  if (img.src.endsWith('.png') && !img.dataset.triedGif) {
    img.dataset.triedGif = '1';
    img.src = img.src.slice(0, -4) + '.gif';
    return;
  }
  img.style.visibility = 'hidden';
}

function imgTag(name, image, cls) {
  const img = document.createElement('img');
  img.src = image;
  img.alt = name;
  img.className = cls || '';
  img.onerror = () => onImgError(img);
  return img;
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (!q) {
    searchResults.classList.add('hidden');
    return;
  }
  debounceTimer = setTimeout(() => runSearch(q), 200);
});

document.addEventListener('click', (e) => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.classList.add('hidden');
  }
});

async function runSearch(q) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const items = await res.json();
    renderSearchResults(items);
  } catch (err) {
    console.error('Search failed', err);
  }
}

function renderSearchResults(items) {
  searchResults.innerHTML = '';
  if (!items.length) {
    searchResults.classList.add('hidden');
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'search-result-item';
    row.appendChild(imgTag(item.name, item.image));
    const label = document.createElement('span');
    label.textContent = item.name;
    row.appendChild(label);
    if (item.type) {
      const type = document.createElement('span');
      type.className = 'type';
      type.textContent = item.type;
      row.appendChild(type);
    }
    row.addEventListener('click', () => {
      searchInput.value = item.name;
      searchResults.classList.add('hidden');
      loadItem(item.name);
    });
    searchResults.appendChild(row);
  });
  searchResults.classList.remove('hidden');
}

async function loadItem(name) {
  emptyState.classList.add('hidden');
  itemPanel.classList.remove('hidden');
  itemHeader.innerHTML = '<p class="muted">Loading...</p>';
  recipesSection.innerHTML = '';
  usedInSection.innerHTML = '';
  treeSection.innerHTML = '';

  try {
    const res = await fetch(`/api/item/${encodeURIComponent(name)}`);
    if (!res.ok) {
      itemHeader.innerHTML = `<p class="muted">Item "${escapeHtml(name)}" not found.</p>`;
      return;
    }
    const data = await res.json();
    renderItemHeader(data);
    renderRecipes(data.recipes);
    renderUsedIn(data.used_in);
    loadTree(name);
  } catch (err) {
    console.error(err);
    itemHeader.innerHTML = '<p class="muted">Something went wrong loading this item.</p>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderItemHeader(data) {
  itemHeader.innerHTML = '';
  itemHeader.appendChild(imgTag(data.name, data.image));
  const info = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = data.name;
  info.appendChild(h3);
  const meta = document.createElement('div');
  meta.className = 'item-meta';
  const bits = [];
  if (data.type) bits.push(data.type);
  if (data.rarity) bits.push(`Rarity: ${data.rarity}`);
  if (data.sell_value) bits.push(`Sell: ${data.sell_value}`);
  meta.textContent = bits.join(' • ') || 'No extra stats on file';
  info.appendChild(meta);
  itemHeader.appendChild(info);
}

function ingredientRow(ing) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.appendChild(imgTag(ing.name, ing.image));
  const amount = document.createElement('span');
  amount.className = 'amount';
  amount.textContent = `${ing.amount}x`;
  row.appendChild(amount);
  const link = document.createElement('a');
  link.href = '#';
  link.textContent = ing.name;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    searchInput.value = ing.name;
    loadItem(ing.name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  row.appendChild(link);
  return row;
}

function renderRecipes(recipes) {
  if (!recipes || !recipes.length) {
    recipesSection.innerHTML = '<p class="muted">This item has no known crafting recipe (it may be found, dropped, bought, or otherwise obtained instead).</p>';
    return;
  }
  recipesSection.innerHTML = '';
  recipes.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    const station = document.createElement('div');
    station.className = 'recipe-station';
    station.textContent = `Crafted at: ${r.station}${r.result_amount > 1 ? ` (yields ${r.result_amount})` : ''}`;
    card.appendChild(station);
    r.ingredients.forEach((ing) => card.appendChild(ingredientRow(ing)));
    recipesSection.appendChild(card);
  });
}

function renderUsedIn(usedIn) {
  if (!usedIn || !usedIn.length) {
    usedInSection.innerHTML = '<p class="muted">Not used as an ingredient in any known recipe.</p>';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'used-in-grid';
  usedIn.forEach((u) => {
    const chip = document.createElement('div');
    chip.className = 'used-in-chip';
    chip.appendChild(imgTag(u.name, u.image));
    const label = document.createElement('span');
    label.textContent = u.name;
    chip.appendChild(label);
    chip.addEventListener('click', () => {
      searchInput.value = u.name;
      loadItem(u.name);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    grid.appendChild(chip);
  });
  usedInSection.appendChild(grid);
}

async function loadTree(name) {
  treeSection.innerHTML = '<p class="muted">Loading tree...</p>';
  try {
    const res = await fetch(`/api/tree/${encodeURIComponent(name)}`);
    const tree = await res.json();
    treeSection.innerHTML = '';
    treeSection.appendChild(renderTreeNode(tree, true));
  } catch (err) {
    console.error(err);
    treeSection.innerHTML = '<p class="muted">Could not load the crafting tree.</p>';
  }
}

function renderTreeNode(node, isRoot) {
  if (node.base_material || (!node.recipes && !node.circular && !node.truncated)) {
    const wrap = document.createElement('div');
    wrap.className = 'tree-node-leaf ingredient-row';
    wrap.appendChild(imgTag(node.name, node.image));
    const label = document.createElement('span');
    label.textContent = node.name;
    wrap.appendChild(label);
    const tag = document.createElement('span');
    tag.className = 'tree-base';
    tag.textContent = 'base material';
    wrap.appendChild(tag);
    return wrap;
  }

  if (node.circular || node.truncated) {
    const wrap = document.createElement('div');
    wrap.className = 'ingredient-row';
    wrap.appendChild(imgTag(node.name, node.image));
    const label = document.createElement('span');
    label.textContent = node.name;
    wrap.appendChild(label);
    const tag = document.createElement('span');
    tag.className = 'tree-base';
    tag.textContent = node.circular ? '(already shown above)' : '(tree truncated)';
    wrap.appendChild(tag);
    return wrap;
  }

  const details = document.createElement('details');
  details.className = 'tree-node';
  if (isRoot) details.open = true;

  const summary = document.createElement('summary');
  summary.appendChild(imgTag(node.name, node.image));
  const label = document.createElement('span');
  label.textContent = node.name;
  summary.appendChild(label);
  details.appendChild(summary);

  node.recipes.forEach((r, idx) => {
    if (node.recipes.length > 1) {
      const altLabel = document.createElement('div');
      altLabel.className = 'tree-station';
      altLabel.textContent = `Option ${idx + 1} — at ${r.station}`;
      details.appendChild(altLabel);
    } else {
      const stationLabel = document.createElement('div');
      stationLabel.className = 'tree-station';
      stationLabel.textContent = `at ${r.station}`;
      details.appendChild(stationLabel);
    }
    r.ingredients.forEach((ing) => {
      details.appendChild(renderTreeNode(ing, false));
    });
  });

  return details;
}
