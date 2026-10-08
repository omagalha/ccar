'use strict';

(() => {
  const config = window.CCAR_CONFIG || {};
  const pixelId = String(config.metaPixelId || '').trim();
  const storageKey = 'ccar-cookie-consent-v1';
  const pendingEvents = [];
  let pixelLoaded = false;
  let choice = readChoice();

  function readChoice() {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'accepted' || value === 'rejected' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function saveChoice(value) {
    choice = value;
    try { localStorage.setItem(storageKey, value); } catch (_) {}
  }

  function installFacebookQueue() {
    if (window.fbq) return;
    const fbq = window.fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
  }

  function loadPixel() {
    if (!pixelId || pixelLoaded || choice !== 'accepted') return;
    pixelLoaded = true;
    installFacebookQueue();
    window.fbq('init', pixelId);
    window.fbq('set', 'autoConfig', false, pixelId);
    window.fbq('track', 'PageView');
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/pt_BR/fbevents.js';
    document.head.appendChild(script);
    while (pendingEvents.length) {
      const [eventName, parameters] = pendingEvents.shift();
      window.fbq('track', eventName, parameters);
    }
  }

  function clearMarketingCookies() {
    for (const name of ['_fbp', '_fbc']) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    }
  }

  window.ccarHasAnalyticsConsent = () => choice === 'accepted';
  window.ccarTrackMeta = (eventName, parameters = {}) => {
    if (!pixelId || !eventName || choice === 'rejected') return;
    if (choice !== 'accepted') {
      pendingEvents.push([eventName, parameters]);
      return;
    }
    loadPixel();
    window.fbq('track', eventName, parameters);
  };

  function createBanner() {
    if (!pixelId || document.getElementById('cookieBanner')) return;
    const banner = document.createElement('section');
    banner.id = 'cookieBanner';
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-labelledby', 'cookieTitle');
    banner.setAttribute('aria-describedby', 'cookieDescription');
    banner.hidden = true;
    banner.innerHTML = `
      <div class="cookie-copy">
        <strong id="cookieTitle">Sua privacidade na C CAR</strong>
        <p id="cookieDescription">Usamos cookies opcionais da Meta para medir campanhas e entender quais veículos despertam interesse. Você pode aceitar ou recusar sem afetar o funcionamento do site.</p>
        <a href="privacidade.html">Privacidade e cookies</a>
      </div>
      <div class="cookie-actions">
        <button class="outline" type="button" data-cookie-choice="rejected">Recusar opcionais</button>
        <button class="gold" type="button" data-cookie-choice="accepted">Aceitar opcionais</button>
      </div>`;
    document.body.appendChild(banner);

    banner.addEventListener('click', event => {
      const button = event.target.closest('[data-cookie-choice]');
      if (!button) return;
      const nextChoice = button.dataset.cookieChoice;
      saveChoice(nextChoice);
      banner.hidden = true;
      if (nextChoice === 'accepted') {
        loadPixel();
        window.dispatchEvent(new CustomEvent('ccar:analytics-consent-granted'));
      } else {
        pendingEvents.length = 0;
        if (window.fbq) window.fbq('consent', 'revoke');
        clearMarketingCookies();
      }
    });

    const footerLinks = document.querySelector('.footer-links');
    if (footerLinks) {
      const settings = document.createElement('button');
      settings.type = 'button';
      settings.className = 'cookie-settings';
      settings.textContent = 'Cookies';
      settings.onclick = () => {
        banner.hidden = false;
        banner.querySelector('[data-cookie-choice="accepted"]').focus();
      };
      footerLinks.appendChild(settings);
    }

    if (!choice) banner.hidden = false;
  }

  if (choice === 'accepted') loadPixel();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createBanner, { once: true });
  } else {
    createBanner();
  }
})();
