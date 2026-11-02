// Constantes de Integración WhatAuth (Línea dedicada FNX en WhatAuth Cloud)
const WHATAUTH_CONFIG = {
  phone: '34627118121',
  logoUrl: 'img/whatauth-logo.png',
  storageKey: 'tickees_wallet'
};

// Estado global de la aplicación
const AppState = {
  currentLang: 'es',
  translations: {},
  concerts: [],
  wallet: []
};

// 1. Selector e inicializador de idioma (Detección automática + fallback + localStorage)
async function initI18n() {
  try {
    const res = await fetch('data/translations.json');
    AppState.translations = await res.json();
  } catch (e) {
    console.error('Error cargando traducciones:', e);
    AppState.translations = {};
  }

  const savedLang = localStorage.getItem('tickees_lang');
  const browserLang = (navigator.language || navigator.userLanguage || 'es').slice(0, 2).toLowerCase();
  
  if (savedLang && AppState.translations[savedLang]) {
    AppState.currentLang = savedLang;
  } else if (AppState.translations[browserLang]) {
    AppState.currentLang = browserLang;
  } else {
    AppState.currentLang = 'es';
  }

  // Sincronizar select si existe
  const langSelect = document.getElementById('langSelect');
  if (langSelect) {
    langSelect.value = AppState.currentLang;
    langSelect.addEventListener('change', (e) => {
      setLanguage(e.target.value);
    });
  }

  updateStaticTranslations();
}

function setLanguage(lang) {
  if (AppState.translations[lang]) {
    AppState.currentLang = lang;
    localStorage.setItem('tickees_lang', lang);
    updateStaticTranslations();
    renderApp();
  }
}

function t(key) {
  return AppState.translations[AppState.currentLang]?.[key] || AppState.translations['es']?.[key] || key;
}

function updateStaticTranslations() {
  const lblMyTickets = document.getElementById('lblMyTickets');
  if (lblMyTickets) lblMyTickets.textContent = t('myTickets');

  const drawerTitle = document.getElementById('drawerTitle');
  if (drawerTitle) drawerTitle.textContent = t('myTickets');

  const lblTotalSpent = document.getElementById('lblTotalSpent');
  if (lblTotalSpent) lblTotalSpent.textContent = t('totalSpent');

  const btnClearTickets = document.getElementById('btnClearTickets');
  if (btnClearTickets) btnClearTickets.textContent = t('clearTickets');
}

// 2. Motor de Fechas Automáticas (Siempre posteriores al día en que se abre la web)
function getFutureDate(daysOffset = 3) {
  const now = new Date();
  const future = new Date(now);
  future.setDate(now.getDate() + Math.max(1, daysOffset));

  const options = { year: '2-digit', month: '2-digit', day: '2-digit' };
  try {
    return new Intl.DateTimeFormat(AppState.currentLang, options).format(future);
  } catch (e) {
    return `${future.getDate()}/${future.getMonth() + 1}/${String(future.getFullYear()).slice(-2)}`;
  }
}

// Renderizado de números seriales
function generateSerialNumbersHTML(serialNumber) {
  const digits = serialNumber.split('');
  const cells = digits.map(d => `<td>${d}</td>`).join('');
  return `<table class="numbers-table"><tr>${cells}</tr></table>`;
}

// 3. Gestor de Cartera / Wallet en localStorage
function loadWallet() {
  try {
    const raw = localStorage.getItem(WHATAUTH_CONFIG.storageKey);
    AppState.wallet = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(AppState.wallet)) AppState.wallet = [];
  } catch (e) {
    console.warn('Error leyendo wallet de localStorage:', e);
    AppState.wallet = [];
  }
  updateBadgeCount();
}

function saveWallet() {
  try {
    localStorage.setItem(WHATAUTH_CONFIG.storageKey, JSON.stringify(AppState.wallet));
  } catch (e) {
    console.error('Error guardando wallet en localStorage:', e);
  }
  updateBadgeCount();
}

function getTotalUnits() {
  return AppState.wallet.reduce((sum, item) => sum + (item.units || 1), 0);
}

function updateBadgeCount(animate = false) {
  const total = getTotalUnits();
  const badgeHeader = document.getElementById('badgeMyTickets');
  const badgeDrawer = document.getElementById('drawerBadgeTotal');

  if (badgeHeader) {
    badgeHeader.textContent = total;
    if (animate) {
      badgeHeader.classList.add('bump');
      setTimeout(() => badgeHeader.classList.remove('bump'), 300);
    }
  }

  if (badgeDrawer) {
    badgeDrawer.textContent = `${total} ${t('units')}`;
  }

  calculateTotalSpent();
}

function calculateTotalSpent() {
  const total = AppState.wallet.reduce((sum, item) => sum + (item.price * (item.units || 1)), 0);
  const elTotal = document.getElementById('drawerTotalPrice');
  if (elTotal) {
    elTotal.textContent = `${total.toFixed(2)} €`;
  }
}

function updateTicketCardState(concertId) {
  const serial = document.getElementById(`serial-${concertId}`);
  if (!serial) return;

  const existing = AppState.wallet.find(item => item.id === concertId);
  const unitsCountEl = serial.querySelector('.success-units-count');

  if (existing && existing.units > 0) {
    serial.classList.remove('state-initial', 'state-qr-revealed');
    serial.classList.add('state-purchased');
    if (unitsCountEl) {
      unitsCountEl.textContent = `${existing.units} ${t('ticketsInWallet')}`;
    }
  } else {
    serial.classList.remove('state-purchased', 'state-qr-revealed');
    serial.classList.add('state-initial');
  }
}

function updateAllTicketCards() {
  AppState.concerts.forEach(c => updateTicketCardState(c.id));
}

function addTicketToWallet(concertId) {
  const concert = AppState.concerts.find(c => c.id === concertId);
  if (!concert) return;

  const calculatedDate = getFutureDate(concert.daysOffset || 3);
  const existing = AppState.wallet.find(item => item.id === concertId);

  if (existing) {
    existing.units = (existing.units || 1) + 1;
    existing.updatedAt = Date.now();
  } else {
    AppState.wallet.unshift({
      id: concert.id,
      artist: concert.artist,
      tour: concert.tour,
      poster: concert.poster,
      screen: concert.screen,
      row: concert.row,
      seat: concert.seat,
      price: concert.price,
      currency: concert.currency || '€',
      time: concert.time,
      date: calculatedDate,
      units: 1,
      ticketCode: `TICK-${concert.id.toUpperCase()}-${concert.seat}`,
      addedAt: Date.now()
    });
  }

  saveWallet();
  updateTicketCardState(concertId);
  showToast(`🎟️ ${t('ticketAdded')} — ${concert.artist} (${existing ? existing.units : 1}x)`);
  renderDrawerTickets();
}

function changeUnits(concertId, delta) {
  const idx = AppState.wallet.findIndex(item => item.id === concertId);
  if (idx === -1) return;

  const item = AppState.wallet[idx];
  item.units = (item.units || 1) + delta;

  if (item.units <= 0) {
    AppState.wallet.splice(idx, 1);
  }

  saveWallet();
  updateTicketCardState(concertId);
  renderDrawerTickets();
}

function clearWallet() {
  AppState.wallet = [];
  saveWallet();
  updateAllTicketCards();
  renderDrawerTickets();
  showToast(`🗑️ ${t('clearTickets')}`);
}

// 4. Toast de notificación flotante
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('active');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('active');
  }, 2800);
}

// 5. Drawer de Mis Entradas
function toggleDrawer(open) {
  const drawer = document.getElementById('ticketsDrawer');
  const overlay = document.getElementById('ticketsDrawerOverlay');
  if (!drawer || !overlay) return;

  const shouldOpen = open !== undefined ? open : !drawer.classList.contains('active');

  if (shouldOpen) {
    renderDrawerTickets();
    drawer.classList.add('active');
    overlay.classList.add('active');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  } else {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

function renderDrawerTickets() {
  const container = document.getElementById('drawerTicketsList');
  if (!container) return;

  if (!AppState.wallet || AppState.wallet.length === 0) {
    container.innerHTML = `
      <div class="drawer-empty-state">
        <span class="drawer-empty-icon">🎟️</span>
        <p>${t('emptyTickets')}</p>
      </div>
    `;
    calculateTotalSpent();
    return;
  }

  container.innerHTML = AppState.wallet.map(ticket => {
    const totalForTicket = (ticket.price * ticket.units).toFixed(2);
    return `
      <article class="wallet-ticket-card">
        <div class="wallet-card-header">
          <img src="${ticket.poster}" alt="${ticket.artist}" class="wallet-poster-thumb" />
          <div class="wallet-card-details">
            <h3 class="wallet-card-artist">${ticket.artist}</h3>
            <div class="wallet-card-tour">${ticket.tour}</div>
            <div class="wallet-card-badge-row">
              <span class="wallet-chip-verified">✓ ${t('verifiedBy')}</span>
            </div>
          </div>
        </div>

        <div class="wallet-card-body">
          <div class="wallet-info-grid">
            <div class="wallet-info-cell">
              <span class="wallet-info-label">${t('screen')}</span>
              <span class="wallet-info-val">${ticket.screen}</span>
            </div>
            <div class="wallet-info-cell">
              <span class="wallet-info-label">${t('row')}</span>
              <span class="wallet-info-val">${ticket.row}</span>
            </div>
            <div class="wallet-info-cell">
              <span class="wallet-info-label">${t('seat')}</span>
              <span class="wallet-info-val">${ticket.seat}</span>
            </div>
          </div>

          <div class="wallet-pricing-row">
            <div class="units-stepper">
              <button type="button" class="btn-unit-step btn-step-down" data-id="${ticket.id}" aria-label="Reducir">–</button>
              <span class="unit-count-display">${ticket.units}x</span>
              <button type="button" class="btn-unit-step btn-step-up" data-id="${ticket.id}" aria-label="Aumentar">+</button>
            </div>
            <div class="wallet-total-for-ticket">
              ${totalForTicket} ${ticket.currency}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Event listeners para los botones de stepper
  container.querySelectorAll('.btn-step-down').forEach(btn => {
    btn.addEventListener('click', () => changeUnits(btn.dataset.id, -1));
  });
  container.querySelectorAll('.btn-step-up').forEach(btn => {
    btn.addEventListener('click', () => changeUnits(btn.dataset.id, 1));
  });

  calculateTotalSpent();
}

// 6. Generación de QR Pixel y Renderizado de Conciertos
function buildWhatsAppUrl(concert) {
  const pinCode = `TICK-${concert.id.toUpperCase()}-${concert.seat}`;
  const message = `PIXEL TRACK ${pinCode} 📊✨`;
  return `https://api.whatsapp.com/send/?phone=${WHATAUTH_CONFIG.phone}&text=${encodeURIComponent(message)}`;
}

function renderConcerts() {
  const container = document.getElementById('concertsContainer');
  if (!container) return;

  container.innerHTML = '';

  AppState.concerts.forEach(concert => {
    const calculatedDate = getFutureDate(concert.daysOffset || 3);
    const serialHTML = generateSerialNumbersHTML(concert.serialNumber);
    const waLink = buildWhatsAppUrl(concert);
    const pinCode = `TICK-${concert.id.toUpperCase()}-${concert.seat}`;

    const existingInWallet = AppState.wallet.find(item => item.id === concert.id);
    const hasPurchased = existingInWallet && existingInWallet.units > 0;
    const initialStateClass = hasPurchased ? 'state-purchased' : 'state-initial';
    const initialUnitsText = hasPurchased ? `${existingInWallet.units} ${t('ticketsInWallet')}` : '';

    const ticketCard = document.createElement('article');
    ticketCard.className = 'ticket-card';
    ticketCard.innerHTML = `
      <div class="ticket-holes-top"></div>
      
      <div class="ticket-header">
        <p class="ticket-venue">${concert.tour} ${t('presents')}</p>
        <h2 class="ticket-artist">${concert.artist}</h2>
      </div>

      <div class="ticket-poster">
        <img src="${concert.poster}" alt="${concert.artist}" loading="lazy" />
      </div>

      <div class="ticket-info">
        <table class="ticket-data-table">
          <thead>
            <tr>
              <th>${t('screen')}</th>
              <th>${t('row')}</th>
              <th>${t('seat')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="bigger">${concert.screen}</td>
              <td class="bigger">${concert.row}</td>
              <td class="bigger">${concert.seat}</td>
            </tr>
          </tbody>
        </table>

        <table class="ticket-data-table">
          <thead>
            <tr>
              <th>${t('price')}</th>
              <th>${t('date')}</th>
              <th>${t('time')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${concert.currency}${concert.price.toFixed(2)}</td>
              <td>${calculatedDate}</td>
              <td>${concert.time}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ticket-holes-lower"></div>

      <!-- Zona de acción y QR Pixel de WhatAuth con 3 estados fluidos -->
      <div class="ticket-serial ${initialStateClass}" id="serial-${concert.id}">
        <!-- Estado 1: Botón Inicial Comprar Entrada -->
        <button type="button" class="btn-buy-ticket" data-concert-id="${concert.id}">
          <span>🎟️</span> <span>${t('buyTicket')}</span>
        </button>

        <!-- Estado 2: QR Pixel Desplegado -->
        <div class="ticket-qr-wrapper">
          <div class="ticket-qr-container" id="qr-container-${concert.id}" title="${t('scanWithWhatsApp')}">
            <!-- QR Pixel generado dinámicamente -->
          </div>
          <div class="ticket-qr-meta">
            <span class="qr-pin-badge">${pinCode}</span>
            <span class="qr-whatauth-badge">
              <img src="${WHATAUTH_CONFIG.logoUrl}" alt="WhatAuth" class="whatauth-mini-icon">
              WhatAuth Pixel
            </span>
          </div>
          <div class="ticket-actions">
            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-scan-wa" data-concert-id="${concert.id}">
              💬 ${t('scanWithWhatsApp')}
            </a>
            <button type="button" class="btn-cancel-qr" data-concert-id="${concert.id}">
              ${t('cancel')}
            </button>
          </div>
        </div>

        <!-- Estado 3: Compra Realizada / En Cartera -->
        <div class="ticket-success-box">
          <div class="success-badge-title">
            <span>✓</span> <span>${t('purchaseCompleted')}</span>
          </div>
          <div class="success-units-count">
            ${initialUnitsText}
          </div>
          <button type="button" class="btn-buy-another" data-concert-id="${concert.id}">
            ${t('buyAnotherTicket')}
          </button>
        </div>

        <div class="numbers-wrapper">
          ${serialHTML}
        </div>
      </div>
    `;

    container.appendChild(ticketCard);

    const serialEl = ticketCard.querySelector(`#serial-${concert.id}`);
    const qrContainer = ticketCard.querySelector(`#qr-container-${concert.id}`);
    let qrRendered = false;

    // Función auxiliar para renderizar el QR cuando se solicita
    const ensureQrRendered = () => {
      if (qrRendered || !qrContainer) return;
      qrRendered = true;

      if (typeof QRCodeStyling !== 'undefined') {
        const qrCode = new QRCodeStyling({
          width: 140,
          height: 140,
          type: 'svg',
          data: waLink,
          image: WHATAUTH_CONFIG.logoUrl,
          dotsOptions: {
            color: '#111827',
            type: 'rounded'
          },
          backgroundOptions: {
            color: '#ffffff'
          },
          imageOptions: {
            crossOrigin: 'anonymous',
            margin: 3,
            imageSize: 0.32
          },
          cornersSquareOptions: {
            color: '#0f766e',
            type: 'extra-rounded'
          },
          cornersDotOptions: {
            color: '#111827',
            type: 'dot'
          }
        });
        qrCode.append(qrContainer);
      } else {
        qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(waLink)}" alt="QR Code" style="width: 100%; height: 100%; object-fit: contain;">`;
      }
    };

    // 1. Al pulsar "COMPRAR ENTRADA": oculta el botón y revela el QR
    const btnBuy = ticketCard.querySelector('.btn-buy-ticket');
    if (btnBuy) {
      btnBuy.addEventListener('click', () => {
        ensureQrRendered();
        serialEl.classList.remove('state-initial', 'state-purchased');
        serialEl.classList.add('state-qr-revealed');
      });
    }

    // 2. Al pulsar "Volver / Cancelar": vuelve al estado inicial
    const btnCancel = ticketCard.querySelector('.btn-cancel-qr');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        serialEl.classList.remove('state-qr-revealed', 'state-purchased');
        serialEl.classList.add('state-initial');
      });
    }

    // 3. Al pulsar "+ Comprar otra entrada": vuelve a mostrar el QR
    const btnBuyAnother = ticketCard.querySelector('.btn-buy-another');
    if (btnBuyAnother) {
      btnBuyAnother.addEventListener('click', () => {
        ensureQrRendered();
        serialEl.classList.remove('state-initial', 'state-purchased');
        serialEl.classList.add('state-qr-revealed');
      });
    }

    // 4. Al hacer click en el QR o en "Escanear en WhatsApp": abre WhatsApp y registra la compra
    if (qrContainer) {
      qrContainer.addEventListener('click', () => {
        window.open(waLink, '_blank');
        addTicketToWallet(concert.id);
      });
    }

    const btnScanWa = ticketCard.querySelector('.btn-scan-wa');
    if (btnScanWa) {
      btnScanWa.addEventListener('click', () => {
        addTicketToWallet(concert.id);
      });
    }
  });
}

// 7. Renderizado del Announcement Bar (Top Bar dinámico con conciertos y multi-idioma)
function renderAnnouncements() {
  const track = document.getElementById('announcementTrack');
  const badgeText = document.getElementById('announcementBadgeText');
  if (badgeText) {
    badgeText.textContent = t('liveNow');
  }
  if (!track) return;

  if (!AppState.concerts || AppState.concerts.length === 0) {
    track.innerHTML = '';
    return;
  }

  const concertItems = AppState.concerts.map((concert, index) => {
    const formattedDate = getFutureDate(concert.daysOffset || 3);
    return `
      <div class="announcement-item" data-concert-index="${index}">
        <span class="announcement-ticket-icon">🎟️</span>
        <strong class="announcement-artist">${concert.artist}</strong>
        <span class="announcement-separator">•</span>
        <span class="announcement-tour">${concert.tour}</span>
        <span class="announcement-badge-stage">${concert.screen}</span>
        <span class="announcement-date">📅 ${formattedDate}</span>
        <span class="announcement-price">${t('fromPrice')} ${concert.currency}${concert.price.toFixed(2)}</span>
        <span class="announcement-btn">${t('buyTicket')} →</span>
      </div>
    `;
  }).join('<span class="announcement-bullet">★</span>');

  track.innerHTML = `
    <div class="announcement-content">${concertItems}</div>
    <div class="announcement-content" aria-hidden="true">${concertItems}</div>
  `;

  track.querySelectorAll('.announcement-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = el.getAttribute('data-concert-index');
      const cards = document.querySelectorAll('.ticket-card');
      if (cards && cards[idx]) {
        cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        cards[idx].classList.add('ticket-highlight');
        setTimeout(() => {
          cards[idx].classList.remove('ticket-highlight');
        }, 1800);
      }
    });
  });
}

// 8. Cargar conciertos desde JSON
async function loadConcerts() {
  try {
    const res = await fetch('data/concerts.json');
    AppState.concerts = await res.json();
  } catch (e) {
    console.error('Error cargando conciertos:', e);
    AppState.concerts = [];
  }
}

function renderApp() {
  renderAnnouncements();
  renderConcerts();
  updateBadgeCount();
}

// 9. Inicialización de Listeners y SDK WhatAuth
function setupEventListeners() {
  const btnMyTickets = document.getElementById('btnMyTickets');
  if (btnMyTickets) {
    btnMyTickets.addEventListener('click', () => toggleDrawer(true));
  }

  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
  }

  const overlay = document.getElementById('ticketsDrawerOverlay');
  if (overlay) {
    overlay.addEventListener('click', () => toggleDrawer(false));
  }

  const btnClearTickets = document.getElementById('btnClearTickets');
  if (btnClearTickets) {
    btnClearTickets.addEventListener('click', () => {
      if (AppState.wallet.length > 0) {
        clearWallet();
      }
    });
  }

  // Cerrar Drawer con tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleDrawer(false);
    }
  });

  // Listener global de eventos de WhatAuth SDK (cubre eventos DOM emitidos por el SDK)
  const onWhatAuthVerified = (e) => {
    console.log('[WhatAuth SDK] Verificación recibida desde SDK:', e.detail);
    const pin = e.detail?.qrData?.pin || e.detail?.pin || '';
    const matched = AppState.concerts.find(c => pin && pin.toUpperCase().includes(c.id.toUpperCase()));
    if (matched) {
      addTicketToWallet(matched.id);
    } else if (AppState.concerts.length > 0) {
      addTicketToWallet(AppState.concerts[0].id);
    }
  };

  window.addEventListener('whatauth:success', onWhatAuthVerified);
  window.addEventListener('whatauth:pixel', onWhatAuthVerified);
  window.addEventListener('whatauth:pixel_verified', onWhatAuthVerified);

  // Conexión WebSocket en vivo para WhatAuth Pixel (res_pixel_qr y qr_verified)
  if (typeof io !== 'undefined') {
    try {
      const socket = io('https://api.whatauth.com', {
        transports: ['websocket', 'polling']
      });

      const handlePixelVerified = (data) => {
        console.log('[WhatAuth Pixel] Evento de escaneo recibido en tiempo real:', data);
        const pin = data?.qrData?.pin || data?.pin || '';
        const matched = AppState.concerts.find(c => pin.toUpperCase().includes(c.id.toUpperCase()));
        if (matched) {
          addTicketToWallet(matched.id);
        } else if (AppState.concerts.length > 0) {
          addTicketToWallet(AppState.concerts[0].id);
        }
      };

      socket.on('res_pixel_qr', handlePixelVerified);
      socket.on('qr_verified', handlePixelVerified);
    } catch (err) {
      console.warn('[WhatAuth Pixel] WebSocket init fallback:', err);
    }
  }
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  loadWallet();
  await initI18n();
  await loadConcerts();
  renderApp();
});
