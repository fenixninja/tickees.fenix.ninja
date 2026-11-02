// Constantes de Integración WhatAuth (Línea dedicada FNX en WhatAuth Cloud)
const WHATAUTH_CONFIG = {
  phone: '34627118121',
  domain: 'tickees.fenix.ninja',
  wsUrl: 'https://api.whatauth.com',
  logoUrl: 'fenix_icons/apple-icon-60x60.png',
  storageKey: 'tickees_wallet'
};

// Estado global de la aplicación
const AppState = {
  currentLang: 'es',
  translations: {},
  concerts: [],
  wallet: [],
  activeSessions: {},         // sessionId -> concertId
  activeConcertSessions: {},  // concertId -> { sessionId, walink, qrDataUrl, pin }
  pendingConcertId: null,
  socket: null
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
  const btnBuy = serial.querySelector('.btn-buy-ticket');
  const qrWrapper = serial.querySelector('.ticket-qr-wrapper');
  const successBox = serial.querySelector('.ticket-success-box');

  if (existing && existing.units > 0) {
    serial.classList.remove('state-initial', 'state-qr-revealed');
    serial.classList.add('state-purchased');
    if (btnBuy) btnBuy.style.display = 'none';
    if (qrWrapper) qrWrapper.style.display = 'none';
    if (successBox) successBox.style.display = 'flex';
    if (unitsCountEl) {
      unitsCountEl.textContent = `${existing.units} ${t('ticketsInWallet')}`;
    }
  } else {
    serial.classList.remove('state-purchased', 'state-qr-revealed');
    serial.classList.add('state-initial');
    if (btnBuy) btnBuy.style.display = 'flex';
    if (qrWrapper) qrWrapper.style.display = 'none';
    if (successBox) successBox.style.display = 'none';
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

// 6. Conexión WebSocket y Generador de QR Pixel en Vivo
function getWhatAuthSocket() {
  if (AppState.socket) return AppState.socket;
  if (typeof io === 'undefined') {
    console.warn('[WhatAuth] Socket.io no está disponible');
    return null;
  }

  const socket = io(WHATAUTH_CONFIG.wsUrl, {
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('[WhatAuth WS] Conectado a', WHATAUTH_CONFIG.wsUrl, 'Socket ID:', socket.id);
  });

  // 1. Recepción del QR generado por el backend con sesión efímera
  socket.on('qr_ready', (data) => {
    console.log('[WhatAuth WS] qr_ready recibido:', data);
    if (!data || !data.success) {
      console.error('[WhatAuth WS] Error en qr_ready:', data?.error);
      return;
    }

    const concertId = AppState.pendingConcertId || 'c1';
    const sessionId = data.sessionId;

    if (sessionId) {
      AppState.activeSessions[sessionId] = concertId;
    }

    // Ajustar número de teléfono al número configurado (+34627118121) manteniendo intacto el mensaje y la sesión
    let finalWalink = data.walink || '';
    if (WHATAUTH_CONFIG.phone && finalWalink) {
      try {
        const u = new URL(finalWalink);
        u.searchParams.set('phone', WHATAUTH_CONFIG.phone);
        finalWalink = u.toString();
      } catch (_) {}
    }

    const sessionData = {
      sessionId,
      walink: finalWalink,
      qrDataUrl: data.qrDataUrl || data.qrBase64 || '',
      pin: data.pin || `TICK-${concertId.toUpperCase()}`
    };

    AppState.activeConcertSessions[concertId] = sessionData;
    renderQrInContainer(concertId, sessionData);
  });

  // 2. Recepción de confirmación cuando el usuario escanea y envía el WhatsApp
  const handleScanVerification = (data) => {
    console.log('[WhatAuth WS] 🎯 ¡Verificación de escaneo recibida en tiempo real!', data);
    const sessionId = data?.sessionId;
    const concertId = (sessionId && AppState.activeSessions[sessionId]) || AppState.pendingConcertId || 'c1';

    addTicketToWallet(concertId);
  };

  socket.on('res_pixel_qr', handleScanVerification);
  socket.on('qr_verified', handleScanVerification);

  socket.on('disconnect', (reason) => {
    console.log('[WhatAuth WS] Desconectado:', reason);
  });

  AppState.socket = socket;
  return socket;
}

function requestTicketQr(concertId) {
  const qrContainer = document.getElementById(`qr-container-${concertId}`);
  if (!qrContainer) return;

  AppState.pendingConcertId = concertId;

  // Si ya tenemos sesión activa para este concierto, la mostramos
  const cached = AppState.activeConcertSessions[concertId];
  if (cached && cached.walink) {
    renderQrInContainer(concertId, cached);
    return;
  }

  // Estado de carga mientras el backend emite qr_ready
  qrContainer.innerHTML = `
    <div class="qr-loading-box">
      <div class="qr-spinner"></div>
      <span class="qr-loading-text">${t('loadingTicket')}</span>
    </div>
  `;

  const socket = getWhatAuthSocket();
  if (socket && socket.connected) {
    socket.emit('req_pixel_qr', {
      domain: WHATAUTH_CONFIG.domain,
      id: concertId
    });
  } else if (socket) {
    socket.once('connect', () => {
      socket.emit('req_pixel_qr', {
        domain: WHATAUTH_CONFIG.domain,
        id: concertId
      });
    });
  }
}

function renderQrInContainer(concertId, sessionData) {
  const qrContainer = document.getElementById(`qr-container-${concertId}`);
  const serial = document.getElementById(`serial-${concertId}`);
  if (!qrContainer || !serial) return;

  qrContainer.innerHTML = '';

  if (typeof QRCodeStyling !== 'undefined' && sessionData.walink) {
    const qrCode = new QRCodeStyling({
      width: 140,
      height: 140,
      type: 'svg',
      data: sessionData.walink,
      image: WHATAUTH_CONFIG.logoUrl || undefined,
      dotsOptions: {
        color: '#111827',
        type: 'rounded'
      },
      backgroundOptions: {
        color: '#ffffff'
      },
      imageOptions: {
        crossOrigin: 'anonymous',
        margin: 2,
        imageSize: 0.28
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
  } else if (sessionData.qrDataUrl) {
    qrContainer.innerHTML = `<img src="${sessionData.qrDataUrl}" alt="QR Ticket" style="width: 140px; height: 140px; object-fit: contain; border-radius: 8px;">`;
  }

  // Actualizar botón Escanear en WhatsApp
  const btnScanWa = serial.querySelector('.btn-scan-wa');
  if (btnScanWa) {
    btnScanWa.href = sessionData.walink || '#';
  }

  // Actualizar PIN badge
  const pinBadge = serial.querySelector('.qr-pin-badge');
  if (pinBadge && sessionData.pin) {
    pinBadge.textContent = sessionData.pin;
  }
}

function renderConcerts() {
  const container = document.getElementById('concertsContainer');
  if (!container) return;

  container.innerHTML = '';

  AppState.concerts.forEach(concert => {
    const calculatedDate = getFutureDate(concert.daysOffset || 3);
    const serialHTML = generateSerialNumbersHTML(concert.serialNumber);
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
        <button type="button" class="btn-buy-ticket" data-concert-id="${concert.id}" style="${hasPurchased ? 'display: none;' : 'display: flex;'}">
          <span>🎟️</span> <span>${t('buyTicket')}</span>
        </button>

        <!-- Estado 2: QR Pixel Desplegado (Oculto inicialmente) -->
        <div class="ticket-qr-wrapper" style="display: none;">
          <div class="ticket-qr-container" id="qr-container-${concert.id}" title="${t('scanWithWhatsApp')}">
            <div class="qr-loading-box">
              <div class="qr-spinner"></div>
              <span class="qr-loading-text">${t('loadingTicket')}</span>
            </div>
          </div>
          <div class="ticket-qr-meta">
            <span class="qr-pin-badge">${pinCode}</span>
            <span class="qr-whatauth-badge">
              <span>🎟️</span>
              <span>Ticket Pixel</span>
            </span>
          </div>
          <div class="ticket-actions">
            <a href="#" target="_blank" rel="noopener noreferrer" class="btn-scan-wa" data-concert-id="${concert.id}">
              💬 ${t('scanWithWhatsApp')}
            </a>
            <button type="button" class="btn-cancel-qr" data-concert-id="${concert.id}">
              ${t('cancel')}
            </button>
          </div>
        </div>

        <!-- Estado 3: Compra Realizada / En Cartera -->
        <div class="ticket-success-box" style="${hasPurchased ? 'display: flex;' : 'display: none;'}">
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
    const qrWrapper = ticketCard.querySelector('.ticket-qr-wrapper');
    const successBox = ticketCard.querySelector('.ticket-success-box');
    const btnBuy = ticketCard.querySelector('.btn-buy-ticket');

    // 1. Al pulsar "COMPRAR ENTRADA": oculta el botón, revela el QR y solicita la sesión al servidor
    if (btnBuy) {
      btnBuy.addEventListener('click', () => {
        btnBuy.style.display = 'none';
        if (successBox) successBox.style.display = 'none';
        if (qrWrapper) qrWrapper.style.display = 'flex';
        serialEl.classList.remove('state-initial', 'state-purchased');
        serialEl.classList.add('state-qr-revealed');
        requestTicketQr(concert.id);
      });
    }

    // 2. Al pulsar "Volver / Cancelar": vuelve al estado inicial
    const btnCancel = ticketCard.querySelector('.btn-cancel-qr');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        if (qrWrapper) qrWrapper.style.display = 'none';
        if (successBox) successBox.style.display = 'none';
        if (btnBuy) btnBuy.style.display = 'flex';
        serialEl.classList.remove('state-qr-revealed', 'state-purchased');
        serialEl.classList.add('state-initial');
      });
    }

    // 3. Al pulsar "+ Comprar otra entrada": genera una nueva sesión y vuelve a mostrar el QR
    const btnBuyAnother = ticketCard.querySelector('.btn-buy-another');
    if (btnBuyAnother) {
      btnBuyAnother.addEventListener('click', () => {
        delete AppState.activeConcertSessions[concert.id];
        if (btnBuy) btnBuy.style.display = 'none';
        if (successBox) successBox.style.display = 'none';
        if (qrWrapper) qrWrapper.style.display = 'flex';
        serialEl.classList.remove('state-initial', 'state-purchased');
        serialEl.classList.add('state-qr-revealed');
        requestTicketQr(concert.id);
      });
    }

    // 4. Al hacer click en el QR o en "Escanear en WhatsApp": abre WhatsApp con el enlace real (la compra la confirma el escaneo)
    if (qrContainer) {
      qrContainer.addEventListener('click', () => {
        const session = AppState.activeConcertSessions[concert.id];
        if (session && session.walink) {
          window.open(session.walink, '_blank');
        }
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

  // Inicializar conexión WebSocket de WhatAuth
  getWhatAuthSocket();

  // Listener global de eventos de WhatAuth SDK (cubre eventos DOM emitidos por el SDK como fallback)
  const onWhatAuthVerified = (e) => {
    console.log('[WhatAuth SDK] Verificación recibida desde SDK:', e.detail);
    const sessionId = e.detail?.sessionId;
    const concertId = (sessionId && AppState.activeSessions[sessionId]) || AppState.pendingConcertId || 'c1';
    addTicketToWallet(concertId);
  };

  window.addEventListener('whatauth:success', onWhatAuthVerified);
  window.addEventListener('whatauth:pixel', onWhatAuthVerified);
  window.addEventListener('whatauth:pixel_verified', onWhatAuthVerified);
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  loadWallet();
  await initI18n();
  await loadConcerts();
  renderApp();
});
