# ⏱️ Stoper Prezentacji Google (Google Slides Timer)

> Zaawansowane rozszerzenie do przeglądarki Google Chrome, które integruje 3-poziomowy stoper i inteligentny licznik czasu bezpośrednio w **Widoku Prelegenta (Speaker Notes)** w Prezentacjach Google.

![Wersja](https://img.shields.io/badge/wersja-1.5-blue.svg)
![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-brightgreen.svg)
![Licencja](https://img.shields.io/badge/licencja-MIT-orange.svg)

---

## 🌟 Dlaczego ta wtyczka?

Domyślny stoper w Google Slides odlicza jedynie prosty czas i łatwo stracić kontrolę nad tempem wystąpienia.  
**Stoper Prezentacji Google** pozwala prelegentowi kontrolować czas na 3 poziomach jednocześnie:

```
+---------------------------------------------------------------+
| [ T1: Całkowity 00:14:23 ]   [ T2: Prezentacja 00:30:37 ] [▶] |
+---------------------------------------------------------------+
| [ T3: Slajd 00:45 🟢 ]                    [🔄 Slajd]  [⏹ Stop] |
+---------------------------------------------------------------+
```

1. **T1 (Czas całkowity)** – zlicza w górę rzeczywisty czas od startu wystąpienia (bez dryfu czasowego, odporny na throttling kart w tle).
2. **T2 (Czas prezentacji)** – odlicza w dół zaplanowany łączny czas wystąpienia (np. 45 minut). Po przekroczeniu zera zaczyna odliczać czas przekroczenia na czerwono.
3. **T3 (Czas slajdu z sygnalizacją świetlną 🚦)** – odlicza w dół czas zaplanowany na bieżący slajd i dynamicznie zmienia kolory:
   - ⚪ **Domyślny/Biały** – swobodne omawianie początku slajdu.
   - 🟢 **Zielony** – optymalne tempo.
   - 🟡 **Żółty** – ostrzeżenie: zbliżasz się do limitu slajdu.
   - 🔴 **Czerwony** – przekroczono zaplanowany czas slajdu.

---

## 🚀 Jak to działa? (Konfiguracja z notatek)

Wtyczka nie wymaga żadnych zewnętrznych baz danych ani skomplikowanej konfiguracji. Wystarczy wpisać prosty kod **na samym początku notatek prelegenta**:

### 1. Pierwszy slajd (definiuje czas całej prezentacji oraz 1. slajdu):
```text
{timer[00:45:00]{00:10-00:20-00:30}}
```
* `[00:45:00]` – zaplanowany łączny czas wystąpienia (45 minut).
* `{00:10-00:20-00:30}` – progi kolorystyczne slajdu:
  - do 10 sekund: biały ⚪
  - od 10 do 20 sekund: zielony 🟢
  - od 20 do 30 sekund: żółty 🟡
  - powyżej 30 sekund: czerwony 🔴

### 2. Kolejne slajdy (tylko czas bieżącego slajdu):
```text
{timer{00:15-00:30-00:45}}
```

### 3. Warianty opcjonalne:
* Możesz podać tylko czas całej prezentacji bez progów slajdu: `{timer[00:30:00]}`.
* Obsługiwane są formaty minutowe `MM:SS` oraz godzinowe `HH:MM:SS`.
* Nawet jeśli przez pomyłkę wpiszesz progi w innej kolejności, wtyczka automatycznie posortuje je rosnąco.

---

## 🎙️ Tryb Próby Generalnej (Rejestrowanie czasów)

Wtyczka posiada funkcję automatycznego mierzenia czasów podczas próbnego wystąpienia:

1. Kliknij ikonę wtyczki na pasku Chrome i zaznacz opcję **„Zapisuj czasy podczas prezentacji”**.
2. Przeprowadź próbę prezentacji normalnie zmieniając slajdy.
3. Po zakończeniu kliknij przycisk **⏹ (Stop)**.
4. Otwórz menu wtyczki i kliknij **„📋 Kopiuj zapis czasów”**.
5. Wtyczka wygeneruje gotowe kody stoperów dla każdego slajdu, automatycznie obliczając progi (50% 🟢, 75% 🟡, 100% 🔴) dopasowane do Twojego rzeczywistego tempa mowy!

---

## 📦 Instalacja w przeglądarce Google Chrome

Wtyczka działa w oparciu o najnowszy standard **Manifest V3**.

1. Pobierz to repozytorium (jako plik `.zip` z zakładki [Releases](../../releases) lub sklonuj za pomocą `git clone`).
2. Rozpakuj archiwum na dysku (jeśli pobrano ZIP).
3. Otwórz przeglądarkę Chrome i wpisz w pasku adresu:
   ```text
   chrome://extensions/
   ```
4. W prawym górnym rogu włącz przełącznik **„Tryb programisty” (Developer mode)**.
5. Kliknij przycisk **„Załaduj rozpakowane” (Load unpacked)** w lewym górnym rogu.
6. Wskaż folder zawierający pliki wtyczki (ten z plikiem `manifest.json`).
7. Gotowe! Otwórz dowolną prezentację w Google Slides i uruchom **Widok prelegenta**.

---

## 🔒 Bezpieczeństwo i Prywatność

* **100% lokalne działanie**: Wtyczka działa całkowicie w Twojej przeglądarce.
* **Brak telemetrii**: Zero analityki, zero śledzenia, brak połączeń z zewnętrznymi serwerami.
* **Minimalne uprawnienia**:
  * `storage` – lokalne zapisywanie czasów prób na Twoim komputerze (`chrome.storage.local`).
  * `activeTab` – wykrywanie identyfikatora aktywnej prezentacji po kliknięciu ikony.
  * `clipboardWrite` – wygodne kopiowanie kodów stoperów do schowka.
  * Ograniczenie domenowe wyłącznie do `https://docs.google.com/presentation/d/*`.

---

## 🛠️ Struktura projektu

```text
├── manifest.json         # Konfiguracja wtyczki (Manifest V3)
├── timer-prez-ggl.js     # Główny skrypt wstrzykiwany do widoku prelegenta
├── popup.html            # Interfejs okna podręcznego wtyczki
├── popup.js              # Logika okna podręcznego i zarządzanie zapisami
├── Icons/                # Ikony wtyczki w różnych rozdzielczościach
├── README.md             # Dokumentacja projektu
└── LICENSE               # Licencja MIT
```

---

## 📄 Licencja

Projekt jest udostępniony na warunkach otwartoźródłowej licencji [MIT](LICENSE).  
Możesz go swobodnie używać, modyfikować i rozpowszechniać, zachowując informację o autorze.

