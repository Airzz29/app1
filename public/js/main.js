(function () {
  var splash = document.getElementById('appSplash');
  var shell = document.getElementById('appShell');

  function showAppShell() {
    if (!shell) return;
    shell.classList.remove('app-shell-hidden');
    shell.classList.add('app-shell-visible');
    if (splash) {
      splash.classList.add('app-splash-hide');
      setTimeout(function () {
        if (splash && splash.parentNode) {
          splash.parentNode.removeChild(splash);
        }
      }, 450);
    }
  }

  window.addEventListener('load', function () {
    // Small delay so the splash feels intentional
    setTimeout(showAppShell, 400);
  });

  // Modal handling (generic, with basic focus management)
  var modals = document.querySelectorAll('[data-modal]');
  var openModalCount = 0;

  var savedScrollY = 0;

  function syncOpenModalCount() {
    openModalCount = document.querySelectorAll('[data-modal].modal-open').length;
  }

  function unlockPageScrollIfNeeded() {
    syncOpenModalCount();
    if (openModalCount > 0) return;
    document.documentElement.classList.remove('has-open-modal');
    document.body.classList.remove('has-open-modal');
    document.body.style.top = '';
  }

  function forceCloseAllModals() {
    document.querySelectorAll('[data-modal].modal-open').forEach(function (m) {
      m.classList.remove('modal-open');
      m.setAttribute('aria-hidden', 'true');
    });
    openModalCount = 0;
    unlockPageScrollIfNeeded();
  }

  function openModalById(id, trigger) {
    if (!id) return;
    // Never allow stacked/ghost backdrops (this is what blocks clicks + causes “keyboard only” on iOS/PWA).
    forceCloseAllModals();
    var selector = String(id).trim();
    if (selector && selector.charAt(0) !== '#') {
      selector = '#' + selector;
    }
    var modal = document.querySelector(selector);
    if (!modal) return;
    var wasOpen = modal.classList.contains('modal-open');
    modal.__trigger = trigger || null;
    modal.setAttribute('aria-hidden', 'false');

    // Portal modal to body so position:fixed is relative to viewport, not a transformed parent
    if (modal.parentNode !== document.body) {
      modal.__modalRestoreParent = modal.parentNode;
      modal.__modalRestoreNext = modal.nextSibling;
      document.body.appendChild(modal);
    }

    modal.classList.add('modal-open');

    syncOpenModalCount();
    if (!wasOpen && openModalCount === 1) {
      savedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      document.documentElement.classList.add('has-open-modal');
      document.body.classList.add('has-open-modal');
      document.body.style.top = '-' + savedScrollY + 'px';
    }

    // Avoid auto-focusing inputs on open (mobile keyboards + scroll can make the modal feel "missing").
    // Instead, focus the dialog container for accessibility.
    var dialog = modal.querySelector('.modal');
    if (dialog) {
      if (!dialog.hasAttribute('tabindex')) {
        dialog.setAttribute('tabindex', '-1');
      }
      window.requestAnimationFrame(function () {
        try {
          dialog.focus({ preventScroll: true });
        } catch (_e) {
          dialog.focus();
        }
      });
    }
  }

  function closeModal(modal) {
    // Move focus back to the trigger before hiding the modal
    if (modal.__trigger && typeof modal.__trigger.focus === 'function') {
      modal.__trigger.focus();
    } else {
      if (shell) {
        shell.focus && shell.focus();
      }
    }

    var wasOpen = modal.classList.contains('modal-open');
    modal.setAttribute('aria-hidden', 'true');
    if (wasOpen) {
      modal.classList.remove('modal-open');
      syncOpenModalCount();
      if (openModalCount === 0) {
        unlockPageScrollIfNeeded();
        window.scrollTo(0, savedScrollY);
      }
      // Restore modal back to its original place in the DOM
      var parent = modal.__modalRestoreParent;
      var next = modal.__modalRestoreNext;
      if (parent && modal.parentNode === document.body) {
        if (next) {
          parent.insertBefore(modal, next);
        } else {
          parent.appendChild(modal);
        }
        modal.__modalRestoreParent = null;
        modal.__modalRestoreNext = null;
      }
    }
  }

  // Use event delegation so all buttons/links work reliably (desktop/mobile/PWA, bfcache restores, portaled modals).
  // Use CAPTURE phase so nothing can stopPropagation() and break clicks.
  document.addEventListener('click', function (e) {
    var openTrigger = e.target && e.target.closest ? e.target.closest('[data-modal-target]') : null;
    if (openTrigger) {
      e.preventDefault();
      var target = openTrigger.getAttribute('data-modal-target');
      if (target) {
        openModalById(target, openTrigger);
      }
      return;
    }

    var closeTrigger = e.target && e.target.closest ? e.target.closest('[data-modal-close]') : null;
    if (closeTrigger) {
      e.preventDefault();
      var backdrop = closeTrigger.closest ? closeTrigger.closest('[data-modal]') : null;
      if (backdrop) {
        closeModal(backdrop);
      }
      return;
    }

    var backdropClick = e.target && e.target.matches ? (e.target.matches('[data-modal]') ? e.target : null) : null;
    if (backdropClick) {
      closeModal(backdropClick);
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      modals.forEach(function (modal) {
        if (modal.classList.contains('modal-open')) {
          closeModal(modal);
        }
      });
    }
  });

  // Wallet UI refresh: keep wallet balances fresh when navigating back (bfcache/PWA can show stale DOM).
  function formatMoney(value) {
    var n = Number(value || 0);
    if (!isFinite(n)) n = 0;
    return '$' + n.toFixed(2);
  }

  function refreshWalletBalance() {
    var els = document.querySelectorAll('[data-wallet-balance]');
    if (!els.length) return;
    fetch('/api/wallet-summary', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        var balance = data.balance;
        els.forEach(function (el) {
          el.textContent = formatMoney(balance);
        });
      })
      .catch(function () {
        // ignore
      });
  }

  window.addEventListener('pageshow', function (e) {
    if (e && e.persisted) {
      // If restored from bfcache/PWA, ensure no stale overlay blocks clicks.
      forceCloseAllModals();
      refreshWalletBalance();
    }
  });

  // Also cleanup on initial load so a previously-stuck backdrop can’t block the dashboard.
  // (Some PWA shells restore DOM without triggering persisted pageshow reliably.)
  forceCloseAllModals();

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      refreshWalletBalance();
    }
  });

  // Previous hauls "load more"
  var loadMoreBtn = document.querySelector('[data-previous-load-more]');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', function () {
      var hidden = document.querySelectorAll('.previous-haul-hidden');
      hidden.forEach(function (row) {
        row.classList.remove('previous-haul-hidden');
      });
      loadMoreBtn.parentElement.removeChild(loadMoreBtn);
    });
  }

  // Countdown timers (hauls and issues)
  var countdownEls = document.querySelectorAll('[data-countdown-end]');
  if (countdownEls.length) {
    var hasRequestedReload = false;

    function formatRemaining(ms) {
      if (ms <= 0) return 'Expired';
      var totalSec = Math.floor(ms / 1000);
      var days = Math.floor(totalSec / 86400);
      var hours = Math.floor((totalSec % 86400) / 3600);
      var mins = Math.floor((totalSec % 3600) / 60);

      if (days > 0) {
        return days + 'd ' + String(hours).padStart(2, '0') + 'h';
      }
      if (hours > 0) {
        return hours + 'h ' + String(mins).padStart(2, '0') + 'm';
      }
      return mins + 'm';
    }

    function tickCountdowns() {
      var now = Date.now();
      countdownEls.forEach(function (el) {
        var end = el.getAttribute('data-countdown-end');
        if (!end) return;
        var endTime = Date.parse(end);
        if (Number.isNaN(endTime)) return;
        var remaining = endTime - now;

        if (remaining <= 0) {
          el.textContent = 'Expired';
          el.classList.add('countdown-expired');
          if (!hasRequestedReload && el.getAttribute('data-reload-on-expire') === 'true') {
            hasRequestedReload = true;
            setTimeout(function () {
              window.location.reload();
            }, 800);
          }
        } else {
          el.textContent = formatRemaining(remaining);
        }
      });
    }

    tickCountdowns();
    setInterval(tickCountdowns, 60000); // minute-level resolution is enough
  }

  // Sold item tracking code: show only for Depop and eBay in "Mark sold" modals.
  (function setupTrackingCodeVisibility() {
    var platformSelects = document.querySelectorAll('select[name="platform"]');
    if (!platformSelects.length) return;

    function updateForSelect(sel) {
      var form = sel.closest('form');
      if (!form) return;
      var group = form.querySelector('.sold-tracking-group');
      if (!group) return;
      var v = (sel.value || '').toLowerCase();
      var show = v === 'depop'.toLowerCase() || v === 'ebay'.toLowerCase();
      group.style.display = show ? '' : 'none';
    }

    platformSelects.forEach(function (sel) {
      sel.addEventListener('change', function () {
        updateForSelect(sel);
      });
      // Ensure correct initial state if a platform is preselected.
      updateForSelect(sel);
    });
  })();

  // Live search/filter for sold items (all sold items + haul-specific).
  (function setupSoldItemLiveSearch() {
    function attach(inputSelector) {
      var input = document.querySelector(inputSelector);
      if (!input) return;
      var form = input.closest('form');
      var containerSection = form ? form.closest('.dashboard-section') : null;
      var list = containerSection
        ? containerSection.parentNode.querySelector('.wallet-list')
        : null;
      if (!list) return;
      var items = Array.prototype.slice.call(
        list.querySelectorAll('[data-sold-text]'),
      );
      if (!items.length) return;

      input.addEventListener('input', function () {
        var term = (input.value || '').trim().toLowerCase();
        items.forEach(function (li) {
          var text = (li.getAttribute('data-sold-text') || '')
            .toLowerCase();
          var match = !term || text.indexOf(term) !== -1;
          li.style.display = match ? '' : 'none';
        });
      });
    }

    attach('[data-sold-search=\"all\"]');
    attach('[data-sold-search=\"haul\"]');
  })();

  // Copy tracking code in sold item detail modals.
  (function setupTrackingCopyButtons() {
    var buttons = document.querySelectorAll('[data-copy-tracking]');
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-copy-tracking') || '';
        if (!code) return;

        function onCopied() {
          var original = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(function () {
            btn.textContent = original;
          }, 1200);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(onCopied).catch(function () {
            // ignore
          });
        } else {
          var tmp = document.createElement('textarea');
          tmp.value = code;
          tmp.style.position = 'fixed';
          tmp.style.opacity = '0';
          document.body.appendChild(tmp);
          tmp.select();
          try {
            document.execCommand('copy');
            onCopied();
          } catch (_e) {
            // ignore
          }
          document.body.removeChild(tmp);
        }
      });
    });
  })();
})();

