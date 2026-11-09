const KOD_TIMERA_1 = "{timer[00:45:00]{00:10-00:20-00:30}}";
const KOD_TIMERA_2 = "{timer{00:10-00:20-00:30}}";

const LOGS_KEY = "presentationLogs";
const RECORDING_SETTINGS_KEY = "recordingEnabledByPresentation";
const KEYS_OWNED_BY_EXTENSION = [LOGS_KEY, RECORDING_SETTINGS_KEY];
const CLEAR_DATA_CONFIRMATION = "USUŃ WSZYSTKIE ZAPISY";

let presentationId = null;
let currentLog = null;

function getPresentationId(url) {
  return url?.match(/\/presentation\/d\/(?:e\/)?([^/?#]+)/)?.[1] ?? null;
}

function formatClock(milliseconds, forceHours = false) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const pad = value => String(value).padStart(2, "0");

  if (forceHours || hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`;
  }
  return `${pad(minutes)}:${pad(remainder)}`;
}

function formatThreshold(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatLog(id, log) {
  const lines = [`Prezentacja: ${id}`];

  if (!log || !Array.isArray(log.slides)) {
    return lines.join("\n");
  }

  log.slides.forEach((slide, index) => {
    const duration = slide.milliseconds || 0;
    const thresholds = [
      formatThreshold(duration * 0.5),
      formatThreshold(duration * 0.75),
      formatThreshold(duration)
    ].join("-");

    if (index === 0) {
      lines.push(
        `1. {timer[${formatClock(log.totalMilliseconds || 0, true)}]{${thresholds}}}`
      );
    } else {
      lines.push(`${index + 1}. {timer{${thresholds}}}`);
    }
  });

  return lines.join("\n");
}

async function refreshPopup() {
  const result = await chrome.storage.local.get([
    LOGS_KEY,
    RECORDING_SETTINGS_KEY
  ]);
  const logs = result[LOGS_KEY] ?? {};
  const settings = result[RECORDING_SETTINGS_KEY] ?? {};

  currentLog = presentationId ? logs[presentationId] ?? null : null;

  document.getElementById("logActions").style.display =
    currentLog ? "flex" : "none";
  document.getElementById("overwriteWarning").hidden = !currentLog;
  document.getElementById("recordTimesCheckbox").checked =
    Boolean(presentationId && settings[presentationId]);
}

async function copyToClipboard(button, text) {
  if (button.dataset.isCopying === "true") return;
  button.dataset.isCopying = "true";
  const originalText = button.textContent;

  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "✅ Skopiowano do schowka!";
    button.style.backgroundColor = "#188038";

    setTimeout(() => {
      button.textContent = originalText;
      button.style.backgroundColor = "";
      delete button.dataset.isCopying;
    }, 1500);
  } catch (error) {
    delete button.dataset.isCopying;
    console.error("Błąd kopiowania do schowka:", error);
    alert("Nie udało się skopiować tekstu do schowka.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    presentationId = getPresentationId(tab?.url);

    const isPresentation = Boolean(presentationId);
    document.getElementById("mainContent").style.display =
      isPresentation ? "block" : "none";
    document.getElementById("wrongPageMsg").style.display =
      isPresentation ? "none" : "block";

    if (!isPresentation) return;

    await refreshPopup();

    document.getElementById("recordTimesCheckbox")
      .addEventListener("change", async event => {
        const enabled = event.currentTarget.checked;
        try {
          const stored = await chrome.storage.local.get(
            RECORDING_SETTINGS_KEY
          );
          const settings = { ...(stored[RECORDING_SETTINGS_KEY] ?? {}) };
          settings[presentationId] = enabled;

          await chrome.storage.local.set({
            [RECORDING_SETTINGS_KEY]: settings
          });
        } catch (error) {
          console.error("Błąd zapisu ustawienia rejestrowania:", error);
          alert("Nie udało się zapisać ustawienia rejestrowania.");
          await refreshPopup();
        }
      });

    document.getElementById("copyBtn1").addEventListener("click", event => {
      copyToClipboard(event.currentTarget, KOD_TIMERA_1);
    });

    document.getElementById("copyBtn2").addEventListener("click", event => {
      copyToClipboard(event.currentTarget, KOD_TIMERA_2);
    });

    document.getElementById("copyBtn3").addEventListener("click", event => {
      if (currentLog) {
        copyToClipboard(
          event.currentTarget,
          formatLog(presentationId, currentLog)
        );
      }
    });

    document.getElementById("deleteLogBtn")
      .addEventListener("click", async () => {
        if (!currentLog) return;
        if (!confirm("Usunąć zapis czasów tej prezentacji?")) return;

        try {
          const stored = await chrome.storage.local.get(LOGS_KEY);
          const logs = { ...(stored[LOGS_KEY] ?? {}) };
          delete logs[presentationId];
          await chrome.storage.local.set({ [LOGS_KEY]: logs });
          await refreshPopup();
        } catch (error) {
          console.error("Błąd usuwania zapisu prezentacji:", error);
          alert("Nie udało się usunąć zapisu tej prezentacji.");
        }
      });

    const confirmationInput =
      document.getElementById("clearDataConfirmation");
    const clearAllDataButton =
      document.getElementById("clearAllDataBtn");

    confirmationInput.addEventListener("input", () => {
      clearAllDataButton.disabled =
        confirmationInput.value !== CLEAR_DATA_CONFIRMATION;
    });

    clearAllDataButton.addEventListener("click", async () => {
      if (confirmationInput.value !== CLEAR_DATA_CONFIRMATION) return;
      if (!confirm("Usunąć wszystkie zapisy i ustawienia tej wtyczki?")) {
        return;
      }

      try {
        await chrome.storage.local.remove(KEYS_OWNED_BY_EXTENSION);
        confirmationInput.value = "";
        clearAllDataButton.disabled = true;
        await refreshPopup();
      } catch (error) {
        console.error("Błąd usuwania danych wtyczki:", error);
        alert("Nie udało się usunąć danych wtyczki.");
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName === "local" &&
        (changes[LOGS_KEY] || changes[RECORDING_SETTINGS_KEY])
      ) {
        refreshPopup().catch(error => {
          console.error("Błąd odświeżania danych popupu:", error);
        });
      }
    });
  } catch (error) {
    console.error("Błąd inicjalizacji popupu:", error);
    alert("Nie udało się wczytać danych prezentacji.");
  }
});
