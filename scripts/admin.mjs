import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = 3001;
const ROOT = resolve(import.meta.dirname, '..');
const MINIATURES_DIR = join(ROOT, 'src/content/miniatures');
const PHOTOS_DIR = join(ROOT, 'src/assets/photos');
const LOGOS_DIR = join(ROOT, 'src/assets/logos');

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getMetadata() {
  const manufacturers = new Set();
  const games = new Set();
  const factions = new Set();
  const scales = new Set();

  const files = readdirSync(MINIATURES_DIR).filter(f => f.endsWith('.yaml'));
  for (const file of files) {
    const content = readFileSync(join(MINIATURES_DIR, file), 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^(\w+):\s*"?([^"]+)"?\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (key === 'manufacturer') manufacturers.add(value);
      else if (key === 'game') games.add(value);
      else if (key === 'faction') factions.add(value);
      else if (key === 'scale') scales.add(value);
    }
  }

  const slugs = files.map(f => f.replace(/\.yaml$/, ''));

  return {
    manufacturers: [...manufacturers].sort(),
    games: [...games].sort(),
    factions: [...factions].sort(),
    scales: [...scales].sort(),
    slugs,
  };
}

function handleSave(body) {
  const data = JSON.parse(body);
  const { title, manufacturer, date, scale, game, faction, order, photos } = data;

  if (!title || !manufacturer || !date || !scale || !photos?.length) {
    return { status: 400, body: { error: 'Missing required fields' } };
  }

  const slug = slugify(title);
  if (!slug) {
    return { status: 400, body: { error: 'Title produces an empty slug' } };
  }

  const yamlPath = join(MINIATURES_DIR, `${slug}.yaml`);
  if (existsSync(yamlPath)) {
    return { status: 409, body: { error: `A miniature with slug "${slug}" already exists` } };
  }

  // Check all photo paths before writing anything
  const photoFilenames = [];
  for (let i = 0; i < photos.length; i++) {
    const suffix = i === 0 ? '' : `-${i + 1}`;
    const filename = `${slug}${suffix}.png`;
    const photoPath = join(PHOTOS_DIR, filename);
    if (existsSync(photoPath)) {
      return { status: 409, body: { error: `Photo file "${filename}" already exists` } };
    }
    photoFilenames.push({ filename, photoPath, data: photos[i] });
  }

  // Save photos
  for (const { photoPath, data: photoData } of photoFilenames) {
    const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
    writeFileSync(photoPath, Buffer.from(base64Data, 'base64'));
  }

  // Build YAML
  const photoLines = photoFilenames
    .map(({ filename }) => `  - "../../assets/photos/${filename}"`)
    .join('\n');

  let yaml = `title: "${title}"
photos:
${photoLines}
manufacturer: "${manufacturer}"
date: ${date}
scale: "${scale}"`;

  if (game) yaml += `\ngame: "${game}"`;
  if (faction) yaml += `\nfaction: "${faction}"`;
  if (order) yaml += `\norder: ${order}`;
  yaml += '\n';

  writeFileSync(yamlPath, yaml);

  // Check for missing logos
  const warnings = [];
  const mfrSlug = slugify(manufacturer);
  if (!existsSync(join(LOGOS_DIR, 'manufacturers', `${mfrSlug}.png`))) {
    warnings.push(`Missing logo: manufacturers/${mfrSlug}.png`);
  }
  if (game) {
    const gameSlug = slugify(game);
    if (!existsSync(join(LOGOS_DIR, 'games', `${gameSlug}.png`))) {
      warnings.push(`Missing logo: games/${gameSlug}.png`);
    }
  }
  if (faction) {
    const factionSlug = slugify(faction);
    if (!existsSync(join(LOGOS_DIR, 'factions', `${factionSlug}.png`))) {
      warnings.push(`Missing logo: factions/${factionSlug}.png`);
    }
  }

  return {
    status: 200,
    body: {
      message: `Saved "${title}" (${photoFilenames.length} photo${photoFilenames.length > 1 ? 's' : ''})`,
      slug,
      files: [yamlPath, ...photoFilenames.map(({ photoPath }) => photoPath)],
      warnings,
    },
  };
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin - Add Miniature</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js"><\/script>
<style>
  :root {
    --color-bg: #1a1a1a;
    --color-text: #e0e0e0;
    --color-text-muted: #666;
    --color-border: #333;
    --color-accent: #4a9eff;
    --color-accent-hover: #3a8eef;
    --color-danger: #e54545;
    --color-success: #45b35a;
    --color-surface: #222;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --color-bg: #f5f3f0;
      --color-text: #2c2c2c;
      --color-text-muted: #888;
      --color-border: #d4d0cc;
      --color-accent: #2a7de1;
      --color-accent-hover: #1a6dd1;
      --color-danger: #d43333;
      --color-success: #2d8f42;
      --color-surface: #eae8e5;
    }
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: var(--color-bg);
    color: var(--color-text);
    min-height: 100vh;
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  h1 { margin-bottom: 1.5rem; font-size: 1.5rem; }
  h2 { margin: 2rem 0 1rem; font-size: 1.15rem; color: var(--color-text-muted); }

  .form-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 180px;
  }

  label {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  input, select {
    padding: 0.5rem 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text);
    font-size: 0.95rem;
    font-family: inherit;
  }

  input[type="number"] { -moz-appearance: textfield; }
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

  input:focus, select:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .slug-preview {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin-top: 0.15rem;
    font-family: monospace;
  }

  .slug-preview.slug-conflict {
    color: var(--color-danger);
  }

  .new-value-input {
    display: none;
    margin-top: 0.35rem;
  }

  .new-value-input.visible { display: block; }

  .new-value-warning {
    display: none;
    font-size: 0.8rem;
    color: var(--color-danger);
    margin-top: 0.15rem;
  }

  .new-value-warning.visible { display: block; }

  /* Drop zone */
  .drop-zone {
    border: 2px dashed var(--color-border);
    border-radius: 8px;
    padding: 3rem 2rem;
    text-align: center;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
  }

  .drop-zone.drag-over {
    border-color: var(--color-accent);
    background: rgba(74, 158, 255, 0.05);
  }

  .drop-zone input { display: none; }

  /* Thumbnails */
  .thumbnails {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-top: 1rem;
  }

  .thumb-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
  }

  .thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 6px;
    overflow: hidden;
    border: 2px solid var(--color-border);
    cursor: grab;
    transition: border-color 0.2s;
  }

  .thumb-wrapper:first-child .thumb { border-color: var(--color-accent); }
  .thumb.dragging { opacity: 0.4; }
  .thumb.drag-target { border-color: var(--color-accent); }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .thumb-filename {
    font-size: 0.8rem;
    font-family: monospace;
    color: var(--color-text-muted);
  }

  .thumb-label {
    position: absolute;
    top: 4px;
    left: 4px;
    background: var(--color-accent);
    color: #fff;
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 3px;
    display: none;
  }

  .thumb-wrapper:first-child .thumb-label { display: block; }

  .thumb-actions {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 4px;
    background: rgba(0,0,0,0.6);
    padding: 6px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .thumb:hover .thumb-actions { opacity: 1; }

  .thumb-actions button {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    font-size: 1.5rem;
    padding: 4px 10px;
    border-radius: 3px;
  }

  .thumb-actions button:hover { background: rgba(255,255,255,0.2); }
  .thumb-actions .remove-btn:hover { background: rgba(229,69,69,0.6); }

  /* Crop modal */
  .modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    z-index: 1000;
    align-items: center;
    justify-content: center;
  }

  .modal-overlay.visible { display: flex; }

  .modal {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 1.5rem;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h3 { font-size: 1rem; }

  .crop-container {
    max-width: 70vw;
    max-height: 60vh;
    overflow: hidden;
  }

  .crop-container img {
    display: block;
    max-width: 100%;
  }

  .modal-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  /* Buttons */
  .btn {
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9rem;
    transition: background 0.2s;
  }

  .btn-primary {
    background: var(--color-accent);
    color: #fff;
  }

  .btn-primary:hover { background: var(--color-accent-hover); }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover { background: var(--color-border); }

  .btn-danger {
    background: var(--color-danger);
    color: #fff;
  }

  /* Status messages */
  .status {
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 6px;
    display: none;
  }

  .status.visible { display: block; }

  .status.success {
    background: rgba(69, 179, 90, 0.15);
    border: 1px solid var(--color-success);
    color: var(--color-success);
  }

  .status.error {
    background: rgba(229, 69, 69, 0.15);
    border: 1px solid var(--color-danger);
    color: var(--color-danger);
  }

  .status .warnings {
    margin-top: 0.5rem;
    color: #c90;
    font-size: 0.9rem;
  }
</style>
</head>
<body>

<h1>Add Miniature</h1>

<section>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
    <h2 style="margin:0">Metadata</h2>
    <button class="btn btn-secondary" id="clear-btn" type="button" style="font-size:0.8rem;padding:0.3rem 0.75rem">Clear</button>
  </div>

  <div class="form-row">
    <div class="form-group" style="flex:2">
      <label for="title">Title *</label>
      <input type="text" id="title" placeholder="e.g. Space Marine Intercessor">
      <div class="slug-preview" id="slug-preview"></div>
    </div>
    <div class="form-group">
      <label for="date">Date *</label>
      <input type="date" id="date" lang="en-GB">
    </div>
    <div class="form-group" style="flex:0 0 80px;min-width:80px">
      <label for="order">Order</label>
      <input type="number" id="order" min="1" step="1" placeholder="-">
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="manufacturer">Manufacturer *</label>
      <select id="manufacturer"><option value="">Loading...</option></select>
      <input type="text" class="new-value-input" id="manufacturer-new" placeholder="New manufacturer name">
      <span class="new-value-warning" id="manufacturer-warning"></span>
    </div>
    <div class="form-group">
      <label for="scale">Scale *</label>
      <select id="scale"><option value="">Loading...</option></select>
      <input type="text" class="new-value-input" id="scale-new" placeholder="e.g. 32mm">
      <span class="new-value-warning" id="scale-warning"></span>
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="game">Game</label>
      <select id="game"><option value="">Loading...</option></select>
      <input type="text" class="new-value-input" id="game-new" placeholder="New game name">
      <span class="new-value-warning" id="game-warning"></span>
    </div>
    <div class="form-group">
      <label for="faction">Faction</label>
      <select id="faction"><option value="">Loading...</option></select>
      <input type="text" class="new-value-input" id="faction-new" placeholder="New faction name">
      <span class="new-value-warning" id="faction-warning"></span>
    </div>
  </div>
</section>

<section>
  <h2>Photos</h2>
  <div class="drop-zone" id="drop-zone">
    <p>Drag & drop photos here, or click to select</p>
    <p style="font-size:0.85rem; margin-top:0.5rem">PNG, JPG, or WEBP</p>
    <input type="file" id="file-input" multiple accept="image/png,image/jpeg,image/webp">
  </div>
  <div class="thumbnails" id="thumbnails"></div>
</section>

<section>
  <button class="btn btn-primary" id="save-btn" disabled>Save Miniature</button>
  <div class="status" id="status"></div>
</section>

<!-- Crop Modal -->
<div class="modal-overlay" id="crop-modal">
  <div class="modal">
    <div class="modal-header">
      <h3>Crop Photo</h3>
      <button class="btn btn-secondary" id="crop-cancel">Cancel</button>
    </div>
    <div class="crop-container">
      <img id="crop-image" src="">
    </div>
    <div class="modal-actions">
      <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--color-text-muted)">
        <input type="checkbox" id="crop-aspect-lock"> Lock aspect ratio
      </label>
      <button class="btn btn-primary" id="crop-apply">Apply Crop</button>
    </div>
  </div>
</div>

<script>
(function() {
  // --- State ---
  let photos = []; // { id, originalDataUrl, dataUrl, file? }
  let nextId = 0;
  let cropper = null;
  let cropTargetId = null;
  let metadata = null;

  // --- DOM refs ---
  const titleInput = document.getElementById('title');
  const dateInput = document.getElementById('date');
  const orderInput = document.getElementById('order');
  const clearBtn = document.getElementById('clear-btn');
  const slugPreview = document.getElementById('slug-preview');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const thumbnailsEl = document.getElementById('thumbnails');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  const cropModal = document.getElementById('crop-modal');
  const cropImage = document.getElementById('crop-image');
  const cropCancel = document.getElementById('crop-cancel');
  const cropApply = document.getElementById('crop-apply');
  const cropAspectLock = document.getElementById('crop-aspect-lock');

  // --- Init ---
  dateInput.value = new Date().toISOString().split('T')[0];

  function loadMetadata() {
    return fetch('/api/metadata')
      .then(r => r.json())
      .then(data => {
        metadata = data;
        populateDropdown('manufacturer', data.manufacturers, true);
        populateDropdown('scale', data.scales, true, '28mm');
        populateDropdown('game', data.games, false);
        populateDropdown('faction', data.factions, false);
      });
  }

  loadMetadata();

  const dropdownValues = {};

  function populateDropdown(id, values, required, defaultValue) {
    const select = document.getElementById(id);
    const normalizedValues = values.map(v => v.toLowerCase());
    dropdownValues[id] = normalizedValues;
    select.innerHTML = '';

    if (!required) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(none)';
      select.appendChild(opt);
    } else {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Select...';
      select.appendChild(opt);
    }

    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === defaultValue) opt.selected = true;
      select.appendChild(opt);
    }

    const addOpt = document.createElement('option');
    addOpt.value = '__new__';
    addOpt.textContent = '+ Add new...';
    select.appendChild(addOpt);

    const newInput = document.getElementById(id + '-new');
    const warning = document.getElementById(id + '-warning');

    select.addEventListener('change', () => {
      if (select.value === '__new__') {
        newInput.classList.add('visible');
        newInput.focus();
      } else {
        newInput.classList.remove('visible');
        newInput.value = '';
        warning.classList.remove('visible');
      }
      updateSaveBtn();
    });

    if (newInput) {
      newInput.addEventListener('input', () => {
        const val = newInput.value.trim().toLowerCase();
        if (val && normalizedValues.includes(val)) {
          warning.textContent = 'Already exists — select it from the dropdown instead';
          warning.classList.add('visible');
        } else {
          warning.classList.remove('visible');
        }
        updateSaveBtn();
      });
    }
  }

  function getFieldValue(id) {
    const select = document.getElementById(id);
    if (select.value === '__new__') {
      return document.getElementById(id + '-new').value.trim();
    }
    return select.value;
  }

  function setDropdownValue(id, value) {
    const select = document.getElementById(id);
    const newInput = document.getElementById(id + '-new');
    const warning = document.getElementById(id + '-warning');
    // Try to find the value in the dropdown options
    const option = Array.from(select.options).find(o => o.value === value);
    if (option) {
      select.value = value;
    } else {
      select.value = '';
    }
    // Always hide the new-value input and clear it
    newInput.classList.remove('visible');
    newInput.value = '';
    warning.classList.remove('visible');
  }

  function isNewValueDuplicate(id) {
    const select = document.getElementById(id);
    if (select.value !== '__new__') return false;
    const val = document.getElementById(id + '-new').value.trim().toLowerCase();
    return val && dropdownValues[id]?.includes(val);
  }

  // --- Slug ---
  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9\\s-]/g, '').replace(/\\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  function isSlugTaken(slug) {
    return slug && metadata?.slugs?.includes(slug);
  }

  titleInput.addEventListener('input', () => {
    const slug = slugify(titleInput.value);
    if (!slug) {
      slugPreview.textContent = '';
      slugPreview.classList.remove('slug-conflict');
    } else if (isSlugTaken(slug)) {
      slugPreview.textContent = 'Slug: ' + slug + ' (already exists!)';
      slugPreview.classList.add('slug-conflict');
    } else {
      slugPreview.textContent = 'Slug: ' + slug;
      slugPreview.classList.remove('slug-conflict');
    }
    renderThumbnails();
    updateSaveBtn();
  });

  // --- Drop zone ---
  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    addFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  function addFiles(fileList) {
    for (const file of fileList) {
      if (!file.type.match(/^image\\/(png|jpeg|webp)$/)) continue;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        photos.push({ id: nextId++, originalDataUrl: dataUrl, dataUrl });
        renderThumbnails();
        updateSaveBtn();
      };
      reader.readAsDataURL(file);
    }
  }

  // --- Thumbnails ---
  let dragSrcId = null;

  function renderThumbnails() {
    thumbnailsEl.innerHTML = '';
    const slug = slugify(titleInput.value) || 'untitled';

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const suffix = i === 0 ? '' : '-' + (i + 1);
      const filename = slug + suffix + '.png';

      const wrapper = document.createElement('div');
      wrapper.className = 'thumb-wrapper';

      const div = document.createElement('div');
      div.className = 'thumb';
      div.draggable = true;
      div.dataset.id = photo.id;

      div.innerHTML = \`
        <img src="\${photo.dataUrl}">
        <div class="thumb-label">Primary</div>
        <div class="thumb-actions">
          <button title="Rotate left" data-action="rotl">&#8634;</button>
          <button title="Rotate right" data-action="rotr">&#8635;</button>
          <button title="Crop" data-action="crop">&#9986;</button>
          <button class="remove-btn" title="Remove" data-action="remove">&times;</button>
        </div>
      \`;

      const fnLabel = document.createElement('span');
      fnLabel.className = 'thumb-filename';
      fnLabel.textContent = filename;

      wrapper.appendChild(div);
      wrapper.appendChild(fnLabel);

      // Drag events for reordering
      wrapper.addEventListener('dragstart', (e) => {
        dragSrcId = photo.id;
        div.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      wrapper.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        document.querySelectorAll('.thumb.drag-target').forEach(el => el.classList.remove('drag-target'));
      });

      wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        div.classList.add('drag-target');
      });

      wrapper.addEventListener('dragleave', () => {
        div.classList.remove('drag-target');
      });

      wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        div.classList.remove('drag-target');
        if (dragSrcId === null || dragSrcId === photo.id) return;
        const fromIdx = photos.findIndex(p => p.id === dragSrcId);
        const toIdx = photos.findIndex(p => p.id === photo.id);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = photos.splice(fromIdx, 1);
        photos.splice(toIdx, 0, moved);
        renderThumbnails();
      });

      // Action buttons
      div.addEventListener('click', (e) => {
        const action = e.target.dataset?.action;
        if (!action) return;
        if (action === 'remove') {
          photos = photos.filter(p => p.id !== photo.id);
          renderThumbnails();
          updateSaveBtn();
        } else if (action === 'crop') {
          openCropModal(photo.id);
        } else if (action === 'rotl') {
          rotatePhoto(photo.id, -90);
        } else if (action === 'rotr') {
          rotatePhoto(photo.id, 90);
        }
      });

      thumbnailsEl.appendChild(wrapper);
    }
  }

  // --- Rotate ---
  function rotatePhoto(id, degrees) {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const isPortrait = degrees % 180 !== 0;
      canvas.width = isPortrait ? img.height : img.width;
      canvas.height = isPortrait ? img.width : img.height;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      photo.dataUrl = canvas.toDataURL('image/png');
      renderThumbnails();
    };
    img.src = photo.dataUrl;
  }

  // --- Crop modal ---
  function openCropModal(id) {
    cropTargetId = id;
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    cropImage.src = photo.dataUrl;
    cropModal.classList.add('visible');
    cropAspectLock.checked = false;

    if (cropper) cropper.destroy();
    // Wait for image to render before initializing cropper
    setTimeout(() => {
      cropper = new Cropper(cropImage, {
        viewMode: 1,
        autoCropArea: 1,
        responsive: true,
      });
    }, 100);
  }

  cropCancel.addEventListener('click', closeCropModal);

  cropModal.addEventListener('click', (e) => {
    if (e.target === cropModal) closeCropModal();
  });

  function closeCropModal() {
    cropModal.classList.remove('visible');
    if (cropper) { cropper.destroy(); cropper = null; }
    cropTargetId = null;
  }

  cropAspectLock.addEventListener('change', () => {
    if (!cropper) return;
    if (cropAspectLock.checked) {
      const data = cropper.getCropBoxData();
      const ratio = data.width / data.height;
      cropper.setAspectRatio(ratio);
    } else {
      cropper.setAspectRatio(NaN);
    }
  });

  cropApply.addEventListener('click', () => {
    if (!cropper || cropTargetId === null) return;
    const photo = photos.find(p => p.id === cropTargetId);
    if (!photo) return;

    const canvas = cropper.getCroppedCanvas({ imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
    photo.dataUrl = canvas.toDataURL('image/png');
    closeCropModal();
    renderThumbnails();
  });

  // --- Save ---
  function updateSaveBtn() {
    const title = titleInput.value.trim();
    const slug = slugify(title);
    const manufacturer = getFieldValue('manufacturer');
    const date = dateInput.value;
    const scale = getFieldValue('scale');
    const hasPhotos = photos.length > 0;
    const hasDuplicate = ['manufacturer', 'scale', 'game', 'faction'].some(isNewValueDuplicate);
    saveBtn.disabled = !(title && manufacturer && date && scale && hasPhotos && !isSlugTaken(slug) && !hasDuplicate);
  }

  dateInput.addEventListener('change', updateSaveBtn);
  orderInput.addEventListener('input', updateSaveBtn);

  clearBtn.addEventListener('click', () => {
    titleInput.value = '';
    slugPreview.textContent = '';
    dateInput.value = new Date().toISOString().split('T')[0];
    orderInput.value = '';
    setDropdownValue('manufacturer', '');
    setDropdownValue('scale', '28mm');
    setDropdownValue('game', '');
    setDropdownValue('faction', '');
    updateSaveBtn();
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    statusEl.className = 'status';
    statusEl.style.display = 'none';

    try {
      // Export all photos from canvas as PNG data URLs
      const photoDataUrls = photos.map(p => p.dataUrl);

      const orderVal = orderInput.value ? parseInt(orderInput.value, 10) : null;

      const payload = {
        title: titleInput.value.trim(),
        manufacturer: getFieldValue('manufacturer'),
        date: dateInput.value,
        scale: getFieldValue('scale'),
        game: getFieldValue('game'),
        faction: getFieldValue('faction'),
        order: orderVal,
        photos: photoDataUrls,
      };

      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        statusEl.className = 'status error visible';
        statusEl.innerHTML = data.error || 'Save failed';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Miniature';
        return;
      }

      let html = data.message;
      if (data.warnings?.length) {
        html += '<div class="warnings">' + data.warnings.map(w => '&#9888; ' + w).join('<br>') + '</div>';
      }
      statusEl.className = 'status success visible';
      statusEl.innerHTML = html;

      // Remember current values before refreshing dropdowns
      const keepDate = payload.date;
      const keepManufacturer = payload.manufacturer;
      const keepScale = payload.scale;
      const keepGame = payload.game;
      const keepFaction = payload.faction;

      // Clear title and photos
      titleInput.value = '';
      slugPreview.textContent = '';
      photos = [];
      renderThumbnails();

      // Refresh metadata (new slugs, new dropdown values)
      await loadMetadata();

      // Restore kept values in the refreshed dropdowns
      dateInput.value = keepDate;
      setDropdownValue('manufacturer', keepManufacturer);
      setDropdownValue('scale', keepScale);
      setDropdownValue('game', keepGame);
      setDropdownValue('faction', keepFaction);
      orderInput.value = orderVal ? orderVal + 1 : '';

      saveBtn.textContent = 'Save Miniature';
      updateSaveBtn();

    } catch (err) {
      statusEl.className = 'status error visible';
      statusEl.innerHTML = 'Network error: ' + err.message;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Miniature';
    }
  });
})();
<\/script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
    return;
  }

  if (url.pathname === '/api/metadata' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getMetadata()));
    return;
  }

  if (url.pathname === '/api/save' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const result = handleSave(body);
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Admin tool running at http://0.0.0.0:${PORT}`);
});
