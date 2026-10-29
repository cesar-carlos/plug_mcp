// Static, hash-authorized enhancement. No credentials, storage or network calls.
export const consentScript = `
document.querySelectorAll('[data-choice-group]').forEach(function(group) {
  var boxes = Array.from(group.querySelectorAll('input[type="checkbox"]'));
  var toolbar = group.querySelector('.bulk');
  if (!toolbar) return;
  toolbar.hidden = false;
  function update() {
    var count = boxes.filter(function(box) { return box.checked; }).length;
    group.querySelector('[data-count]').textContent = count + ' de ' + boxes.length + ' selecionados';
    group.querySelector('[data-select="all"]').disabled = count === boxes.length;
    group.querySelector('[data-select="none"]').disabled = count === 0;
  }
  toolbar.addEventListener('click', function(event) {
    var button = event.target.closest('button[data-select]');
    if (!button) return;
    boxes.forEach(function(box) { if (!box.disabled) box.checked = button.dataset.select === 'all'; });
    update();
  });
  group.addEventListener('change', update);
  update();
});
`;

export const consentStyle = `
main { max-width: 860px; }
p { line-height: 1.55; }
.consent-persona { display: flex; gap: 1rem; align-items: center; margin-block: 1rem; }
.consent-persona img { flex: 0 0 48px; border-radius: 10px; }
.consent-persona p { margin: 0; overflow-wrap: anywhere; }
.consent-help { padding: 0 1rem 1rem; }
.consent-group { margin: 1rem 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
.consent-group summary { padding: 1rem; cursor: pointer; font-weight: 650; overflow-wrap: anywhere; }
.consent-group .section { border: 0; margin: 0; padding: .5rem 1rem 1rem; min-width: 0; }
.consent-group legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.choice { padding: .65rem; border-bottom: 1px solid var(--line); }
.choice span { min-width: 0; overflow-wrap: anywhere; }
.choice input { flex: 0 0 1rem; }
.bulk:not([hidden]) { display: flex; gap: .65rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
.bulk button { width: auto; font-size: .85rem; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.actions { margin-top: 1.5rem; }
@media (min-width: 600px) { .actions { grid-template-columns: 2fr 1fr; } }
`;
