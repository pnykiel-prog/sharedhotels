# Shared Hotels — pakiet wdrożeniowy (GitHub → Vercel)

> **Dla Claude Code.** To jest **gotowa do wdrożenia strona produkcyjna** — statyczny landing
> page + jedna funkcja serverless do wysyłki e-maili. To **nie** jest makieta do odtworzenia w
> innym frameworku. Zadanie: umieścić te pliki w repozytorium GitHub i wdrożyć na Vercel z
> działającą wysyłką maili. Nie przepisuj strony — wgraj ją jak jest.

---

## Co to jest

Jednostronicowy landing page programu benefitowego „Shared Hotels" (język polski) z:
- interaktywnym kalkulatorem korzyści (czysty JS, bez backendu),
- formularzem **„Pobierz prospekt"**,
- modalem **„Umów rozmowę"** (konsultacja telefoniczna z wyborem daty i pory dnia),
- dwoma podstronami prawnymi (polityka prywatności, RODO).

Oba formularze wysyłają dane do funkcji `/api/send`, która rozsyła e-maile przez **Resend**:

| Formularz | Na `MAIL_TO` (firma) | Do klienta |
|---|---|---|
| Pobierz prospekt | zgłoszenie z danymi | e-mail z **2 prospektami w załączniku** |
| Umów rozmowę | zgłoszenie + data i pora | **potwierdzenie terminu** rozmowy |

---

## Struktura plików

```
.
├── index.html                      # cała strona (HTML + CSS + JS inline). MAIL_ENDPOINT = '/api/send'
├── polityka-prywatnosci.html       # podstrona, linkowana ze stopki jako /polityka-prywatnosci.html
├── rodo.html                       # podstrona, linkowana ze stopki jako /rodo.html
├── api/
│   └── send.js                     # funkcja serverless (Node, CommonJS) — wysyłka przez Resend
├── prospekty/
│   ├── SH_Prospekt_1_HR.html       # załącznik 1 (prospekt programu)
│   └── SH_Prospekt_2_Informator.html # załącznik 2 (informator)
├── package.json                    # node >=18, brak zależności (Resend wołany przez fetch)
├── vercel.json                     # minimalna konfiguracja (cleanUrls:false)
├── .env.example                    # wzór zmiennych środowiskowych
└── .gitignore
```

Brak kroku build — to czysty statyczny hosting + funkcja w `api/`. Vercel wykrywa to automatycznie
(framework preset: **Other**). Nie ma `node_modules` ani zależności do zainstalowania.

---

## Krok 1 — repozytorium GitHub

```bash
git init
git add .
git commit -m "Shared Hotels — landing page + form email API"
git branch -M main
git remote add origin https://github.com/<konto>/sharedhotels-www.git
git push -u origin main
```

(Jeśli używasz `gh`: `gh repo create sharedhotels-www --private --source=. --push`.)

> Upewnij się, że `.env` **nie** trafia do repo — jest w `.gitignore`. Do repo idzie tylko `.env.example`.

---

## Krok 2 — usługa e-mail (Resend)

1. Załóż konto na <https://resend.com>.
2. **Domains → Add Domain** → `sharedhotels.com`. Dodaj wskazane rekordy DNS (SPF/DKIM) u operatora
   domeny i poczekaj na weryfikację. (Bez zweryfikowanej domeny maile do klientów nie wyjdą — można
   wstępnie testować z `onboarding@resend.dev` jako `MAIL_FROM`, ale na produkcję wymagana jest własna domena.)
3. **API Keys → Create** → skopiuj klucz `re_...`.

---

## Krok 3 — wdrożenie na Vercel

1. <https://vercel.com> → **Add New → Project → Import** repozytorium z GitHub.
2. Framework Preset: **Other**. Build Command: puste. Output: puste. (Zero-config.)
3. **Settings → Environment Variables** — dodaj (wartości z `.env.example`):
   - `RESEND_API_KEY` = `re_...`
   - `MAIL_TO` = `office@sharedhotels.com`
   - `MAIL_FROM` = `Shared Hotels <no-reply@sharedhotels.com>` (adres na zweryfikowanej domenie)
4. **Deploy**. Po chwili dostajesz adres `https://<projekt>.vercel.app`.
5. Podłącz domenę produkcyjną w **Settings → Domains** (opcjonalnie).

---

## Krok 4 — test po wdrożeniu

1. Otwórz stronę, zjedź do sekcji **„Pobierz prospekt"**, wyślij formularz na swój prawdziwy adres.
   - Sprawdź, czy przyszedł e-mail z **dwoma załącznikami**, a na `MAIL_TO` zgłoszenie.
2. Kliknij **„Umów rozmowę"**, wybierz datę i porę, wyślij.
   - Sprawdź **potwierdzenie z terminem** u klienta i zgłoszenie na `MAIL_TO`.
3. Jeśli front pokaże komunikat błędu — sprawdź logi funkcji w Vercel (**Deployments → Functions →
   `api/send`**). Najczęstsza przyczyna: brak/niepoprawny `RESEND_API_KEY` albo `MAIL_FROM` na
   niezweryfikowanej domenie.

---

## Uwagi techniczne

- **Endpoint:** `index.html` w tym pakiecie ma `const MAIL_ENDPOINT = '/api/send';` (szukaj w `<script>`
  na dole pliku). Jeśli kiedyś przenosicie stronę na hosting z PHP (OVH), zmień na `'send.php'` i użyj
  wariantu PHP (poza tym pakietem).
- **Funkcja `api/send.js`:** Node ≥18 (globalny `fetch`), CommonJS (`module.exports`). Bez zależności
  npm. Honeypot (ukryte pole `_honey`) odrzuca boty. Walidacja e-maila po stronie serwera.
- **Załączniki:** czytane z `prospekty/` przez `fs.readFileSync` i kodowane base64. Pliki są w repo,
  więc Vercel je dołącza. Chcesz PDF zamiast HTML — wrzuć PDF-y do `prospekty/` i podmień nazwy w
  tablicy `PROSPEKTY` na górze `api/send.js`.
- **Bez bazy danych** — zgłoszenia idą wyłącznie e-mailem. Jeśli potrzebny rejestr leadów, podłącz
  np. Vercel KV / Postgres w `api/send.js`.

---

## Czego NIE robić

- Nie przepisuj `index.html` na React/Next — to gotowa, samowystarczalna strona. Wgraj jak jest.
- Nie commituj prawdziwego `RESEND_API_KEY` do repo.
- Nie zmieniaj nazw plików w `prospekty/` bez aktualizacji `api/send.js`.
