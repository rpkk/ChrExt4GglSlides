// =================================================================
// WTYCZKA: STOPER PREZENTACJI GOOGLE (timer-prez-ggl.js)
// =================================================================

if (!window.__stoperSkryptZaladowany) {
  window.__stoperSkryptZaladowany = true;
  uruchomOczekiwanieNaPanel();
}

/**
 * Szuka panelu zegara Google Slides w pętli.
 */
function uruchomOczekiwanieNaPanel() {
  let licznikProba = 0;
  const maxProby = 60;

  const czujnik = setInterval(() => {
    licznikProba++;
    const fabrycznyPanel = document.querySelector(".punch-viewer-speakernotes-timer-panel");

    if (fabrycznyPanel) {
      clearInterval(czujnik);
      podmienPanelTimerow(fabrycznyPanel);
    } else if (licznikProba >= maxProby) {
      clearInterval(czujnik);
    }
  }, 500);
}

// =================================================================
// STAN APLIKACJI I ZMIENNE GLOBALNE 📊
// =================================================================
let intervalGlowny = null;
let czyUruchomiony = false;
const LOGS_KEY = "presentationLogs";
const RECORDING_SETTINGS_KEY = "recordingEnabledByPresentation";
let presentationId = null;
let nagrywanie = null;
let recordingSaveQueue = Promise.resolve();
let lastPeriodicSave = 0;
let notesObserver = null;
let observedNotesNode = null;
let slideChangeTimeout = null;
const invalidatedRecordingIds = new Set();

// T1 - Czas całkowity (liczy w górę wg Date.now() - bez dryfu)
let t1Sekundy = 0;
let t1AccumulatedMs = 0;
let t1SegmentStartedAt = null;

// T2 - Czas prezentacji (liczy w dół, potem w górę na czerwono)
let t2StartSekundy = null;
let t2PozostaloSekund = null;

// T3 - Czas slajdu (progi kolorów, bez dryfu)
let t3ProgowneSekundy = null; // { green: sec, yellow: sec, red: sec }
let t3PozostaloSekund = null;
let t3AccumulatedMs = 0;
let t3SegmentStartedAt = null;

// =================================================================
// FUNKCJE POMOCNICZE CZASU ⏱️
// =================================================================

// Konwertuje ciąg "HH:MM:SS" lub "MM:SS" na sekundy
function czasNaSekundy(str) {
  if (!str) return 0;
  const czesci = str.trim().split(':').map(Number);
  if (czesci.length === 3) {
    return czesci[0] * 3600 + czesci[1] * 60 + czesci[2];
  } else if (czesci.length === 2) {
    return czesci[0] * 60 + czesci[1];
  }
  return 0;
}

// Formatowanie sekund do formatu "HH:MM:SS" lub "MM:SS"
function formatujCzas(sekundy, wymuszajGodziny = false) {
  const bezwzgledneSekundy = Math.abs(sekundy);
  const h = Math.floor(bezwzgledneSekundy / 3600);
  const m = Math.floor((bezwzgledneSekundy % 3600) / 60);
  const s = bezwzgledneSekundy % 60;

  const pad = (num) => String(num).padStart(2, '0');

  if (h > 0 || wymuszajGodziny) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

function pobierzIdPrezentacji() {
  const matchCurrent = window.location.pathname.match(/\/presentation\/d\/([^/]+)/)?.[1];
  if (matchCurrent) return matchCurrent;
  try {
    const matchTop = window.top?.location.pathname.match(/\/presentation\/d\/([^/]+)/)?.[1];
    if (matchTop) return matchTop;
  } catch (e) {
    // Zabezpieczenie przed ewentualnym błędem cross-origin
  }
  return null;
}

function pobierzMigawkeNagrania() {
  const elapsed = nagrywanie.segmentStartedAt === null
    ? 0
    : Math.max(0, Date.now() - nagrywanie.segmentStartedAt);
  const slides = nagrywanie.slides.map(slide => ({
    milliseconds: slide.milliseconds
  }));

  if (slides.length > 0) {
    slides[slides.length - 1].milliseconds += elapsed;
  }

  return {
    totalMilliseconds: nagrywanie.totalMilliseconds + elapsed,
    slides
  };
}

function zapiszMigawkeNagrania() {
  if (!nagrywanie) return Promise.resolve();

  const id = nagrywanie.presentationId;
  const snapshot = pobierzMigawkeNagrania();

  const operation = recordingSaveQueue.then(async () => {
    if (
      invalidatedRecordingIds.has(id) ||
      nagrywanie?.presentationId !== id
    ) {
      return;
    }

    const result = await chrome.storage.local.get(LOGS_KEY);
    const logs = { ...(result[LOGS_KEY] ?? {}) };
    logs[id] = snapshot;
    await chrome.storage.local.set({ [LOGS_KEY]: logs });
  });

  recordingSaveQueue = operation.catch(error => {
    console.error("Błąd zapisu pomiaru prezentacji:", error);
  });

  return operation;
}

async function rozpocznijNagrywanie() {
  presentationId = pobierzIdPrezentacji();
  if (!presentationId) return;

  invalidatedRecordingIds.delete(presentationId);
  nagrywanie = {
    presentationId,
    totalMilliseconds: 0,
    slides: [{ milliseconds: 0 }],
    segmentStartedAt: Date.now()
  };

  await zapiszMigawkeNagrania();
}

async function zamknijOdcinekNagrania(przejdzDoNastepnegoSlajdu = false) {
  if (!nagrywanie || nagrywanie.segmentStartedAt === null) return;

  const now = Date.now();
  const elapsed = Math.max(0, now - nagrywanie.segmentStartedAt);
  const currentSlide = nagrywanie.slides[nagrywanie.slides.length - 1];

  currentSlide.milliseconds += elapsed;
  nagrywanie.totalMilliseconds += elapsed;
  nagrywanie.segmentStartedAt = null;

  if (przejdzDoNastepnegoSlajdu) {
    nagrywanie.slides.push({ milliseconds: 0 });
    nagrywanie.segmentStartedAt = now;
  }

  await zapiszMigawkeNagrania();
}

function wznowNagrywanie() {
  if (nagrywanie && nagrywanie.segmentStartedAt === null) {
    nagrywanie.segmentStartedAt = Date.now();
  }
}

function zaplanujZapisZmianySlajdu() {
  if (!nagrywanie) return;

  clearTimeout(slideChangeTimeout);
  slideChangeTimeout = setTimeout(() => {
    if (!nagrywanie) return;
    if (!czyUruchomiony) {
      nagrywanie.slides.push({ milliseconds: 0 });
      zapiszMigawkeNagrania().catch(error => {
        console.error("Błąd zapisu zmiany slajdu:", error);
      });
    } else {
      zamknijOdcinekNagrania(true).catch(error => {
        console.error("Błąd zapisu czasu slajdu:", error);
      });
    }
  }, 150);
}

async function usunLogBiezacejPrezentacji() {
  if (!presentationId) return;

  await recordingSaveQueue;
  const result = await chrome.storage.local.get(LOGS_KEY);
  const logs = { ...(result[LOGS_KEY] ?? {}) };
  delete logs[presentationId];
  await chrome.storage.local.set({ [LOGS_KEY]: logs });
  nagrywanie = null;
}

function usunUniewaznionyLog(id) {
  const operation = recordingSaveQueue.then(async () => {
    invalidatedRecordingIds.delete(id);
    const result = await chrome.storage.local.get(LOGS_KEY);
    const logs = { ...(result[LOGS_KEY] ?? {}) };
    if (!Object.hasOwn(logs, id)) return;

    delete logs[id];
    await chrome.storage.local.set({ [LOGS_KEY]: logs });
  });

  recordingSaveQueue = operation.catch(error => {
    console.error("Błąd finalnego usuwania zapisu:", error);
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[LOGS_KEY]) return;

  const logs = changes[LOGS_KEY].newValue ?? {};
  if (nagrywanie && !Object.hasOwn(logs, nagrywanie.presentationId)) {
    invalidatedRecordingIds.add(nagrywanie.presentationId);
    nagrywanie = null;
    clearTimeout(slideChangeTimeout);
  }

  for (const id of invalidatedRecordingIds) {
    if (Object.hasOwn(logs, id)) {
      usunUniewaznionyLog(id);
    }
  }
});

// =================================================================
// PARSER NOTATEK SLAJDU 🔍
// =================================================================

/**
 * Pobiera tekst notatek z interfejsu Google Slides i wyciąga kody konfiguracji.
 */
function parsujNotatkiSlajdu() {
  const nodeNotatek = document.querySelector(".punch-viewer-speakernotes-text-body");
  const tekstNotatek = nodeNotatek ? nodeNotatek.textContent : "";

  // Wyrażenie regularne dopasowujące dwa warianty (z tolerancją na spacje, wielkość liter i format MM:SS):
  // {timer[00:45:00]{00:10-00:20-00:30}} oraz {timer{00:10-00:20-00:30}}
  const wzorzec = /\{timer\s*(?:\[\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\])?\s*\{\s*(\d{1,3}:\d{2})\s*-\s*(\d{1,3}:\d{2})\s*-\s*(\d{1,3}:\d{2})\s*\}\}/i;
  const dopasowanie = tekstNotatek.match(wzorzec);

  if (!dopasowanie) {
    return { t2Czas: null, t3Progi: null };
  }

  const t2Czas = dopasowanie[1] ? czasNaSekundy(dopasowanie[1]) : null;
  const t3Progi = {
    green: czasNaSekundy(dopasowanie[2]),
    yellow: czasNaSekundy(dopasowanie[3]),
    red: czasNaSekundy(dopasowanie[4])
  };

  return { t2Czas, t3Progi };
}

// =================================================================
// INICJALIZACJA STRUKTURY W DOM 🎨
// =================================================================

function podmienPanelTimerow(kontener) {
  kontener.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = `
    .punch-viewer-speakernotes-timer-panel {
      width: 98% !important;
      padding: 0 !important;
      position: inherit !important;
    }
    #custom-timer-container {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      grid-gap: 4px;
      align-items: center;
      width: 100%;
      background: var(--gm3-sys-color-surface-container-high, #e9eef6);
      color: var(--gm3-sys-color-on-surface, #1f1f1f);
      padding: 5px;
      border-radius: 4px;
      box-sizing: border-box;
      font-family: Roboto, Arial, sans-serif;
    }
    .timer-box {
      background: var(--gm3-sys-color-surface-container-high, #ffffff);
      border: 1px var(--gm3-sys-color-outline-variant, #c4c7c5) solid;
      border-radius: 4px;
      padding: 4px 2px;
      text-align: center;
      transition: background-color 0.3s, color 0.3s;
    }
    .timer-disabled {
      opacity: 0.4;
      background-color: #e0e0e0 !important;
      color: #888888 !important;
    }
    .timer-label {
      font-size: 9px;
      color: var(--gm3-sys-color-on-surface-variant, #444746);
      text-transform: uppercase;
    }
    .timer-value {
      font-size: 15px;
      font-weight: bold;
    }
    .t1-box { grid-column: span 4; grid-row: 1; }
    .t2-box { grid-column: span 4; grid-row: 1; }
    .btn-timer {
      border: 1px solid #c4c7c5;
      border-radius: 4px;
      cursor: pointer;
      padding: 4px;
      font-size: 12px;
      background: #ffffff;
    }
    .btn-main-play {
      grid-column: span 2;
      grid-row: 1;
      height: 100%;
      background: #1a73e8;
      color: white;
      border: none;
    }
    .t3-box { grid-column: span 7; grid-row: 2; }
    .btn-t3-reset { grid-column: span 1; grid-row: 2; }
    .btn-main-reset { grid-column: span 2; grid-row: 2; }

    /* Style kolorów progowych dla T3 oraz T2 🎨 */
    .stoper-zielony {
      background-color: #d4edda !important;
    }
    .stoper-zielony .timer-value,
    .stoper-zielony .timer-label {
      color: #155724 !important;
    }

    .stoper-zolty {
      background-color: #fff3cd !important;
    }
    .stoper-zolty .timer-value,
    .stoper-zolty .timer-label {
      color: #856404 !important;
    }

    .stoper-czerwony {
      background-color: #f8d7da !important;
    }
    .stoper-czerwony .timer-value,
    .stoper-czerwony .timer-label {
      color: #721c24 !important;
    }
  `;
  document.head.appendChild(style);

  const panelHTML = document.createElement("div");
  panelHTML.id = "custom-timer-container";
  panelHTML.innerHTML = `
    <div class="timer-box t1-box" id="t1-box"
         title="Czas całkowity (T1) – rzeczywisty czas trwania prezentacji liczony w górę od momentu startu">
      <div class="timer-label">Całkowity</div>
      <div class="timer-value" id="t1-val">00:00:00</div>
    </div>
    <div class="timer-box t2-box timer-disabled" id="t2-box"
         title="Czas prezentacji (T2) – zaplanowany łączny czas wystąpienia odliczany w dół (po przekroczeniu zera odlicza na czerwono)">
      <div class="timer-label">Prezentacja</div>
      <div class="timer-value" id="t2-val">00:00:00</div>
    </div>
    <button class="btn-timer btn-main-play" id="btn-play-pause"
            title="Uruchom stoper (PLAY) – rozpoczyna lub wznawia odmierzanie czasu prezentacji i slajdów oraz rejestrowanie próby"
            aria-label="Start / Pauza">▶</button>

    <div class="timer-box t3-box timer-disabled" id="t3-box"
         title="Czas slajdu (T3) – odlicza zaplanowany czas bieżącego slajdu ze zmianą kolorów progowych (zielony, żółty, czerwony)">
      <div class="timer-label">Slajd</div>
      <div class="timer-value" id="t3-val">00:00</div>
    </div>
    <button class="btn-timer btn-t3-reset" id="btn-t3-reset" disabled
            title="Resetuj czas slajdu (T3) – restartuje odliczanie bieżącego slajdu od nowa (np. gdy chcesz powtórzyć omawianie tego slajdu bez resetowania całej prezentacji)"
            aria-label="Resetuj czas slajdu">🔄</button>
    <button class="btn-timer btn-main-reset" id="btn-reset-all"
            title="Zatrzymaj i zresetuj (STOP) – kończy wystąpienie, zeruje zegary i zachowuje zarejestrowane czasy w pamięci wtyczki (możesz je skopiować w popupie)"
            aria-label="Zatrzymaj i zresetuj wszystko">⏹</button>
  `;

  kontener.appendChild(panelHTML);
  podepnijObslugeZdarzen();
  zaladujKonfiguracjeNotatek();
}

/**
 * Odświeża stan wizualny wszystkich timerów i aplikuje kolory progowe 🖥️
 */
function odswiezWidok() {
  // ---------------------------------------------------------------
  // 1. T1 - Czas całkowity (zawsze aktywny, liczy w górę) ⏱️
  // ---------------------------------------------------------------
  document.getElementById("t1-val").textContent = formatujCzas(t1Sekundy, true);

  // ---------------------------------------------------------------
  // 2. T2 - Minutnik Prezentacji ⏳
  // ---------------------------------------------------------------
  const t2Box = document.getElementById("t2-box");
  const t2Val = document.getElementById("t2-val");

  if (t2PozostaloSekund !== null) {
    t2Box.classList.remove("timer-disabled");
    t2Val.textContent = formatujCzas(t2PozostaloSekund, true);

    // Po przekroczeniu 0 (czas ujemny) zmiana na kolor czerwony 🔴
    if (t2PozostaloSekund < 0) {
      t2Box.classList.add("stoper-czerwony");
    } else {
      t2Box.classList.remove("stoper-czerwony");
    }
  } else {
    t2Box.classList.add("timer-disabled");
    t2Box.classList.remove("stoper-czerwony");
    t2Val.textContent = "00:00:00";
  }

  // ---------------------------------------------------------------
  // 3. T3 - Minutnik Slajdu z progami (g, y, r) 🚦
  // ---------------------------------------------------------------
  const t3Box = document.getElementById("t3-box");
  const t3Val = document.getElementById("t3-val");
  const btnT3Reset = document.getElementById("btn-t3-reset");

  if (t3PozostaloSekund !== null && t3ProgowneSekundy !== null) {
    t3Box.classList.remove("timer-disabled");
    btnT3Reset.disabled = false;
    t3Val.textContent = formatujCzas(t3PozostaloSekund, false);

    // Resetujemy klasy kolorów przed nałożeniem nowej
    t3Box.classList.remove("stoper-zielony", "stoper-zolty", "stoper-czerwony");

    const g = t3ProgowneSekundy.green;
    const y = t3ProgowneSekundy.yellow;
    const r = t3ProgowneSekundy.red;
    const t = t3PozostaloSekund;

    // Wyznaczenie wartości progowych
    const progZielony = r - g;
    const progZolty = r - y;

    // Warunki zmiany kolorów 🎨
    if (t <= 0) {
      // Osiągnięto 00:00 lub czas przekroczony -> Czerwony 🔴
      t3Box.classList.add("stoper-czerwony");
    } else if (t <= progZolty) {
      // Osiągnięto r - y -> Żółty 🟡
      t3Box.classList.add("stoper-zolty");
    } else if (t <= progZielony) {
      // Osiągnięto r - g -> Zielony 🟢
      t3Box.classList.add("stoper-zielony");
    }
    // Jeśli t > progZielony: brak klasy, kolor pozostaje bez zmian ⚪

  } else {
    t3Box.classList.add("timer-disabled");
    t3Box.classList.remove("stoper-zielony", "stoper-zolty", "stoper-czerwony");
    btnT3Reset.disabled = true;
    t3Val.textContent = "00:00";
  }
}

/**
 * Aktualizuje stan T3 przy zmianie slajdu
 */
function zaktualizujT3DlaSlajdu() {
  const { t3Progi } = parsujNotatkiSlajdu();

  t3AccumulatedMs = 0;
  t3SegmentStartedAt = czyUruchomiony ? Date.now() : null;

  if (t3Progi) {
    // Slajd posiada kod: przeładowujemy progi i startujemy T3 od nowa
    t3ProgowneSekundy = t3Progi;
    t3PozostaloSekund = t3Progi.red;
  } else {
    // Slajd nie posiada kodu: czyszczymy i wyłączamy T3
    t3ProgowneSekundy = null;
    t3PozostaloSekund = null;
  }
  odswiezWidok();
}

/**
 * Śledzi zmiany w treści notatek slajdu (mysz + klawiatura)
 */
function obserwujZmianyNotatek() {
  const nodeNotatek = document.querySelector(".punch-viewer-speakernotes-text-body");
  if (!nodeNotatek) return;
  if (nodeNotatek === observedNotesNode) return;

  notesObserver?.disconnect();
  observedNotesNode = nodeNotatek;
  const rootNotatek = nodeNotatek.parentElement || nodeNotatek;

  notesObserver = new MutationObserver((mutations) => {
    const aktualnyNodeNotatek =
      document.querySelector(".punch-viewer-speakernotes-text-body");
    const nodeZostalZastapiony =
      aktualnyNodeNotatek && aktualnyNodeNotatek !== observedNotesNode;
    const zmianaNotatek = mutations.some(mutation => {
      if (
        mutation.target === observedNotesNode ||
        observedNotesNode.contains(mutation.target)
      ) {
        return true;
      }

      return [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node === observedNotesNode ||
          node.contains(observedNotesNode) ||
          node.matches(".punch-viewer-speakernotes-text-body") ||
          node.querySelector(".punch-viewer-speakernotes-text-body"))
      );
    });

    if (!zmianaNotatek && !nodeZostalZastapiony) return;

    if (nodeZostalZastapiony) {
      obserwujZmianyNotatek();
    }
    zaktualizujT3DlaSlajdu();
    zaplanujZapisZmianySlajdu();
  });

  notesObserver.observe(rootNotatek, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

// Obsługa zmiany slajdów w prezentacji (zarówno hashchange jak i zamykanie okna)
window.addEventListener("hashchange", () => {
  zaktualizujT3DlaSlajdu();
  zaplanujZapisZmianySlajdu();
  setTimeout(zaktualizujT3DlaSlajdu, 120);
});

window.addEventListener("beforeunload", () => {
  if (nagrywanie) {
    zamknijOdcinekNagrania();
  }
});

// =================================================================
// CYKL PRACY TIMERÓW (TICK) 🔄
// =================================================================

function wykonajKrok() {
  const now = Date.now();

  // T1 - dokładne liczenie w górę wg Date.now() (brak dryfu i odporność na throttling)
  if (t1SegmentStartedAt !== null) {
    const elapsedMs = t1AccumulatedMs + (now - t1SegmentStartedAt);
    t1Sekundy = Math.floor(elapsedMs / 1000);
  }

  // T2 - odlicza w dół od zaplanowanego czasu
  if (t2StartSekundy !== null) {
    t2PozostaloSekund = t2StartSekundy - t1Sekundy;
  }

  // T3 - odlicza w dół od wartości czerwonego progu
  if (t3ProgowneSekundy !== null && t3SegmentStartedAt !== null) {
    const slideElapsedMs = t3AccumulatedMs + (now - t3SegmentStartedAt);
    t3PozostaloSekund = t3ProgowneSekundy.red - Math.floor(slideElapsedMs / 1000);
  }

  // Okresowy zapis migawki pomiaru z throttlingiem (co 10 s) zamiast co 1000 ms
  if (nagrywanie && nagrywanie.segmentStartedAt !== null) {
    if (now - lastPeriodicSave >= 10000) {
      lastPeriodicSave = now;
      zapiszMigawkeNagrania().catch(error => {
        console.error("Błąd aktualizacji zapisu czasu:", error);
      });
    }
  }

  odswiezWidok();
}

function zaladujKonfiguracjeNotatek() {
  const { t2Czas, t3Progi } = parsujNotatkiSlajdu();

  // Ustawienie T2 (tylko jeśli podano w notatkach)
  if (t2Czas !== null) {
    t2StartSekundy = t2Czas;
    t2PozostaloSekund = t2Czas;
  }

  // Ustawienie T3
  t3AccumulatedMs = 0;
  t3SegmentStartedAt = czyUruchomiony ? Date.now() : null;
  if (t3Progi !== null) {
    t3ProgowneSekundy = t3Progi;
    t3PozostaloSekund = t3Progi.red; // Czas początkowy T3 to wartość czerwonego progu
  } else {
    t3ProgowneSekundy = null;
    t3PozostaloSekund = null;
  }

  odswiezWidok();
}

// =================================================================
// OBSŁUGA ZDARZEŃ I PRZYCISKÓW 🖱️
// =================================================================

/**
 * Podpina zdarzenia kliknięcia dla przycisków oraz uruchamia obserwatora notatek 🖱️
 */
function podepnijObslugeZdarzen() {
  const btnPlay = document.getElementById("btn-play-pause");
  const btnResetAll = document.getElementById("btn-reset-all");
  const btnT3Reset = document.getElementById("btn-t3-reset");
  presentationId = pobierzIdPrezentacji();

  // 1. Przycisk PLAY / PAUSE ▶️ ⏸️
  btnPlay.addEventListener("click", async () => {
    btnPlay.disabled = true;
    try {
      const now = Date.now();
      if (czyUruchomiony) {
        // PAUZA: zatrzymujemy liczniki i zapamiętujemy upływ czasu
        czyUruchomiony = false;
        clearInterval(intervalGlowny);

        if (t1SegmentStartedAt !== null) {
          t1AccumulatedMs += (now - t1SegmentStartedAt);
          t1SegmentStartedAt = null;
        }
        if (t3SegmentStartedAt !== null) {
          t3AccumulatedMs += (now - t3SegmentStartedAt);
          t3SegmentStartedAt = null;
        }

        btnPlay.textContent = "▶";
        btnPlay.style.backgroundColor = "#1a73e8";
        btnPlay.title = "Wznów stoper (PLAY) – wznawia odmierzanie czasu po pauzie";
        await zamknijOdcinekNagrania();
      } else {
        // WZNOWIENIE / START:
        // Konfigurację ładujemy z notatek tylko przy pierwszym starcie
        if (t1Sekundy === 0 && t2StartSekundy === null) {
          zaladujKonfiguracjeNotatek();
        }

        t1SegmentStartedAt = now;
        t3SegmentStartedAt = now;

        if (nagrywanie) {
          wznowNagrywanie();
        } else {
          const result = await chrome.storage.local.get(
            RECORDING_SETTINGS_KEY
          );
          const settings = result[RECORDING_SETTINGS_KEY] ?? {};

          if (presentationId && settings[presentationId]) {
            await rozpocznijNagrywanie();
          }
        }

        czyUruchomiony = true;
        intervalGlowny = setInterval(wykonajKrok, 500);
        btnPlay.textContent = "⏸";
        btnPlay.style.backgroundColor = "#d93025"; // Czerwony kolor dla aktywnej pauzy 🔴
        btnPlay.title = "Wstrzymaj stoper (PAUZA) – zatrzymuje odliczanie bez zerowania dotychczasowych czasów (np. na dyskusję lub przerwę)";
      }
    } catch (error) {
      console.error("Błąd obsługi rejestrowania prezentacji:", error);
      if (czyUruchomiony) {
        czyUruchomiony = false;
        clearInterval(intervalGlowny);
      }
      btnPlay.textContent = "▶";
      btnPlay.style.backgroundColor = "#1a73e8";
      btnPlay.title = "Uruchom stoper (PLAY) – rozpoczyna lub wznawia odmierzanie czasu prezentacji i slajdów oraz rejestrowanie próby";
      alert("Nie udało się zapisać pomiaru. Stoper nie został uruchomiony lub został wstrzymany.");
    } finally {
      btnPlay.disabled = false;
    }
  });

  // 2. Przycisk RESET T3 (resetuje odliczanie bieżącego slajdu) 🔄
  btnT3Reset.addEventListener("click", () => {
    if (t3ProgowneSekundy !== null) {
      t3AccumulatedMs = 0;
      t3SegmentStartedAt = czyUruchomiony ? Date.now() : null;
      t3PozostaloSekund = t3ProgowneSekundy.red;
      odswiezWidok();
    }
  });

  // 3. Przycisk RESET ALL (zatrzymuje i zeruje timery bez kasowania logu) ⏹️
  btnResetAll.addEventListener("click", async () => {
    czyUruchomiony = false;
    clearInterval(intervalGlowny);
    clearTimeout(slideChangeTimeout);

    // Finalizujemy aktywne nagranie i zachowujemy je w chrome.storage.local,
    // aby prelegent mógł je skopiować w oknie wtyczki (popupie).
    if (nagrywanie) {
      await zamknijOdcinekNagrania();
      nagrywanie = null;
    }

    t1Sekundy = 0;
    t1AccumulatedMs = 0;
    t1SegmentStartedAt = null;
    t3AccumulatedMs = 0;
    t3SegmentStartedAt = null;
    t2StartSekundy = null;
    t2PozostaloSekund = null;
    t3ProgowneSekundy = null;
    t3PozostaloSekund = null;

    btnPlay.textContent = "▶";
    btnPlay.style.backgroundColor = "#1a73e8";
    btnPlay.title = "Uruchom stoper (PLAY) – rozpoczyna lub wznawia odmierzanie czasu prezentacji i slajdów oraz rejestrowanie próby";

    zaladujKonfiguracjeNotatek();
    odswiezWidok();
  });

  // 4. Uruchomienie automatycznego obserwatora zmian treści notatek 👁️
  obserwujZmianyNotatek();
}