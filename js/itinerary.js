(function() {
  const modal = document.getElementById('itinModal');
  if (!modal) return;
  const trigger = document.querySelector('.invite .inv-link');
  const closeBtn = modal.querySelector('.itin-close');
  const backdrop = modal.querySelector('.itin-backdrop');

  window.openItineraryModal = function() {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('itin-lock');
    if (closeBtn) closeBtn.focus();
  };
  window.closeItineraryModal = function() {
    if (!modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    modal.classList.add('is-closing');
    setTimeout(function() {
      modal.classList.remove('is-closing');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('itin-lock');
      if (trigger) trigger.focus();
    }, 220);
  };

  if (trigger) trigger.addEventListener('click', openItineraryModal);
  const moreLink = modal.querySelector('.itin-foot a');
  if (moreLink) moreLink.addEventListener('click', e => e.preventDefault());
  closeBtn.addEventListener('click', closeItineraryModal);
  backdrop.addEventListener('click', closeItineraryModal);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeItineraryModal();
  });
})();

// Hide the FAB + heart ring when the footer scrolls into view,
// so guests can read the "with all my love, Dad" message and credits.
(function() {
  const footer = document.querySelector('footer');
  if (!footer || !('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      document.body.classList.toggle('fab-hide', e.isIntersecting);
    });
  }, { rootMargin: '0px 0px -20px 0px', threshold: 0 });
  obs.observe(footer);
})();
