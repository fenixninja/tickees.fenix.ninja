# 🎟️ TICKEES — Smart Concert Tickets (WhatAuth Pixel Integration)

Demostración de ticketing interactivo, diseño de boletos troquelados y compra sin contraseñas en tiempo real mediante **WhatAuth Pixel QR** y **WhatsApp**.

> 🌐 **Demo en producción:** [https://tickees.fenix.ninja/](https://tickees.fenix.ninja/)

---

## 📌 Propósito y Arquitectura

El proyecto ilustra la integración del **Pixel QR de WhatAuth** en una Single Page Application estática (GitHub Pages) sin backend propio:

* **Compra y Verificación en Tiempo Real:** El usuario pulsa *"COMPRAR ENTRADA"*, el frontend solicita una sesión efímera al backend de WhatAuth mediante WebSocket (`req_pixel_qr`), y al escanear desde WhatsApp el evento `res_pixel_qr` confirma la adquisición en milisegundos.
* **Modo Adaptativo Inteligente (Escritorio vs Móvil):**
  * **En Escritorio (`> 768px`):** Se renderiza un QR de alta definición (190x190px con `QRCodeStyling`) para escanear directamente con el móvil.
  * **En Móvil (`<= 768px`):** Como el usuario no puede escanear la pantalla de su propio dispositivo, el QR se oculta automáticamente y se muestra de forma destacada el botón **"💬 Comprar en WhatsApp"**.
* **Ciclo de Vida del Boleto en 3 Estados:**
  1. **Estado Inicial:** Muestra los datos del concierto, precio, fecha dinámica, número de serie y el botón verde *"COMPRAR ENTRADA"*.
  2. **Estado de Compra (QR / WhatsApp):** Al pulsar comprar, el código de barras inferior se oculta automáticamente para dejar espacio limpio al QR grande (escritorio) o al botón directo (móvil).
  3. **Estado Confirmado:** Tras enviar el mensaje de WhatsApp y recibir la confirmación por WebSocket, la tarjeta pasa a **`✓ COMPRA REALIZADA`**, muestra el número de entradas adquiridas y habilita la opción de comprar otra unidad.
* **Cartera / Wallet en `localStorage`:** Los boletos adquiridos se guardan de forma persistente en el navegador, con Drawer deslizante lateral, desglose por concierto, cálculo de importe total y contador reactivo en el header.
* **Deduplicación Criptográfica Estricta:** Manejo defensivo por `sessionId` y debounce para garantizar que cada escaneo físico añada exactamente **1 entrada** a la cartera.

---

## 🚀 Características Principales

* **Integración Nativa WhatAuth Pixel:** Conexión Socket.IO con `https://api.whatauth.com` vinculada a la línea WhatsApp Cloud dedicada (`+34627118121`).
* **Diseño Troquelado Físico (Die-Cut Effect):** Muescas semicirculares superiores e inferiores y línea de perforado discontinua simulando entradas clásicas mediante CSS puro.
* **Desacoplamiento de Datos (JSON-Driven):** Catálogo de conciertos alimentado desde [`data/concerts.json`](file:///Users/fenixrios/Documents/CODIGO/ticket/data/concerts.json).
* **Motor de Fechas Dinámicas:** Fechas calculadas en tiempo de ejecución a partir de `daysOffset` para que los eventos figuren siempre a futuro.
* **Internacionalización (i18n) en 7 Idiomas:** Soporte declarativo con selector y detección automática del navegador (`es`, `en`, `de`, `fr`, `hi`, `zh`, `ja`) en [`data/translations.json`](file:///Users/fenixrios/Documents/CODIGO/ticket/data/translations.json).
* **Código de Barras y Seriales por Software:** Generación procedural de números de serie y patrones de barras binarias en CSS/HTML.

---

## 📂 Estructura del Repositorio

```plaintext
ticket/
├── index.html              # Estructura semántica, favicons, Socket.IO y QR Code Styling
├── style.css               # Diseño troquelado, layout responsive, animaciones y adaptación móvil
├── index.js                # Lógica de compra, WebSocket WhatAuth, Wallet y deduplicación
├── data/
│   ├── concerts.json       # Catálogo de conciertos y metadatos de asientos
│   └── translations.json   # Diccionario completo en 7 idiomas
├── img/
│   ├── fnx_paradise.jpeg   # Poster del concierto principal
│   ├── disco_nights.jpeg   # Poster temático retro
│   ├── velazqeus_pop.jpeg  # Poster de pop experience
│   └── fnxrasta.jpeg       # Poster reggae
└── fenix_icons/            # Favicons e iconos de marca
```

---

## 🛠️ Instalación y Uso Local

No requiere dependencias ni transpiladores:

```bash
git clone https://github.com/fenixninja/tickees.fenix.ninja.git
cd tickees.fenix.ninja
python3 -m http.server 8080
```

Accede en tu navegador a `http://localhost:8080`.

---

## ⚖️ Licencia y Atribución

Este proyecto está publicado bajo licencia no comercial con atribución. Basado en conceptos de diseño de boletos troquelados clásicos e integrado con la plataforma de autenticación y pixels de [WhatAuth](https://whatauth.com).
