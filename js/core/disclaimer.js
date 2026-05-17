const KEY = 'disclaimerAcknowledged';

function createModal() {
  if (document.getElementById('disclaimer-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'disclaimer-overlay';
  overlay.innerHTML = `
    <div class="disclaimer-modal" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <h2 id="disclaimer-title">Educational Use Notice</h2>
      <p>This database is intended to support engineering education at UVic. Data has been
      compiled from published sources, but transcription errors may be present and cited
      references may not always correspond to the values shown.</p>
      <p>Do not use this data as the sole basis for safety-critical design decisions. Always
      verify material properties against primary sources, applicable standards, and
      manufacturer datasheets before use.</p>
      <button id="disclaimer-btn" class="btn btn-primary">I understand — continue</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('disclaimer-btn').addEventListener('click', () => {
    localStorage.setItem(KEY, '1');
    overlay.remove();
  });
}

// Show on first visit
if (!localStorage.getItem(KEY)) createModal();

// Re-show when the disclaimer nav link is clicked
document.addEventListener('click', e => {
  if (e.target.closest('[data-action="show-disclaimer"]')) {
    e.preventDefault();
    createModal();
  }
});
