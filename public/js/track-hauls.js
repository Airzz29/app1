(function () {
  'use strict';

  var TAB_ACTIVE = 'active';
  var TAB_FINISHED = 'finished';

  function isMobileOrPWA() {
    return (
      window.matchMedia('(max-width: 768px)').matches ||
      'standalone' in window.navigator ||
      window.navigator.maxTouchPoints > 0
    );
  }

  function openTrackingUrl(url) {
    if (!url) return;
    if (isMobileOrPWA()) {
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        window.location.href = url;
      }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function setupTabs() {
    var tablist = document.querySelector('.track-hauls-tabs');
    if (!tablist) return;

    var tabs = tablist.querySelectorAll('[data-track-tab]');
    var panels = document.querySelectorAll('.track-hauls-panel');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-track-tab');
        tabs.forEach(function (t) {
          t.classList.toggle('track-hauls-tab-active', t.getAttribute('data-track-tab') === target);
          t.setAttribute('aria-selected', t.getAttribute('data-track-tab') === target ? 'true' : 'false');
        });
        panels.forEach(function (panel) {
          var isActive = panel.id === 'panel-' + target;
          panel.classList.toggle('track-hauls-panel-active', isActive);
          panel.hidden = !isActive;
        });
      });
    });
  }

  function setupCardClicks() {
    var cards = document.querySelectorAll('.track-haul-card-clickable[data-tracking-number]');
    cards.forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (
          e.target.closest('a[href^="http"]') ||
          e.target.closest('button[data-copy-tracking]') ||
          e.target.closest('form') ||
          e.target.closest('button')
        ) {
          return;
        }
        var num = card.getAttribute('data-tracking-number');
        if (num) {
          var url = 'https://auspost.com.au/mypost/track/details/' + encodeURIComponent(num);
          openTrackingUrl(url);
        }
      });
    });
  }

  function setupTrackButtons() {
    var trackBtns = document.querySelectorAll('.track-haul-track-btn[data-track-url]');
    trackBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var url = btn.getAttribute('data-track-url');
        if (!url) return;
        e.preventDefault();
        openTrackingUrl(url);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setupTabs();
      setupCardClicks();
      setupTrackButtons();
    });
  } else {
    setupTabs();
    setupCardClicks();
    setupTrackButtons();
  }
})();
