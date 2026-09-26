# Audyt użytkowy aplikacji — jak działa każda funkcja i jak z niej korzystać

Data: 2026-09-26. Pomija się tabliczkę znamionową maszyny (osobny, nierozwiązany
wątek — patrz `docs/blind/` i sekcja "Model maszyny" niżej). Ten dokument
uzupełnia `docs/SPEC.md` (status etapów) i `docs/AUDIT_AR_AT.md` (AR 1–20,
PASS/PARTIAL/FAIL): tamte mówią, co jest zbudowane i przetestowane; ten mówi,
**jak z tego korzystać dziś** i **co jeszcze trzeba zrobić**, ekran po ekranie.

Konwencja w całej aplikacji: brak prawdziwych danych źródłowych nigdy nie jest
pokazywany jako sukces — widzisz `NOT AVAILABLE` / `NIEDOSTĘPNE`, nigdy fałszywe
zero czy PASS. To jest zamierzone, nie błąd.

---

## 1. Logowanie (`/login`)

**Jak działa:** e-mail + hasło (Supabase Auth), zakładka rejestracji i logowania
w jednym formularzu, przełącznik języka PL/EN w rogu. Zalogowany użytkownik
trafiający na `/login` jest automatycznie przekierowany na `/dashboard`.

**Jak korzystać:** wejdź na `/login`, wpisz e-mail i hasło, "Zarejestruj się"
przy pierwszym koncie (przyjdzie e-mail potwierdzający), potem "Zaloguj się"
przy każdym kolejnym wejściu.

**Czego brakuje:** zapraszanie kolejnych użytkowników i nadawanie ról odbywa
się dziś tylko przez panel Supabase (Auth admin), nie przez aplikację — patrz
sekcja Ustawienia niżej.

---

## 2. Dashboard (`/dashboard`)

**Jak działa:** jeśli konto nie ma jeszcze organizacji — formularz założenia
organizacji (nazwa + pierwsza lokalizacja). Jeśli organizacja istnieje — kafelki
liczbowe (maszyny, przebiegi, aktywne przebiegi, liczba zapieczętowanych
rekordów audytu, status silnika decyzyjnego), panele "ostatnie decyzje",
"ostatnie weryfikacje", alerty (zawsze NIEDOSTĘPNE — nie ma jeszcze źródła
alarmów), ostatni audyt, tabela ostatnich przebiegów.

**Jak korzystać:** to strona startowa po zalogowaniu. Nie wykonuje się tu
żadnych akcji poza założeniem organizacji przy pierwszym użyciu — to widok
przeglądowy, punkt wyjścia do nawigacji dalej.

**Czego brakuje:** źródło alarmów (nie zaprojektowane — świadomie poza V1).

---

## 3. Materiały / katalog surowców (`/materials`)

**Jak działa:** katalog referencyjny surowców białkowo-mlecznych (permeat,
maślanka, serwatka, kazeina, WPC/MCC/MCI, normy Codex) — każdy wiersz ma status
`verified`/`unverified`, źródło (organizacja + URL + data pobrania) albo notatkę
wyjaśniającą brak weryfikacji. To jest wiedza referencyjna do porównań, nie dane
z konkretnej partii surowca.

**Jak korzystać:** przeglądasz tabelę, klikasz link źródła przy zweryfikowanych
wierszach żeby zobaczyć dokument oryginalny. Nie edytujesz stąd nic — zapis jest
zablokowany dla wszystkich ról (nawet ADMIN), żeby wartości nie mogły być zgadywane
ani nadpisane przypadkowo; nowe wiersze dodaje się wyłącznie przez migrację z
cytowanym źródłem.

**Stan:** 208 wierszy / 36 kodów potwierdzone bezpośrednim zapytaniem do bazy.

---

## 4. Maszyny (`/machines`)

**Jak działa:** lista maszyn organizacji (producent, model, nr seryjny, kod
katalogowy modelu, średnica ślimaka, L/D, moc, obroty/ciśnienie max, liczba
stref), formularz dodania maszyny, słownik sygnałów (`signal_definitions`),
mapowanie tagów czujnika → sygnał kanoniczny, oraz **nowy katalog modeli
Evolum** (dodany w tej sesji): tabela referencyjna modeli Clextral Evolum
(25/32/44/53/62/HT25/HU88/inny) z parametrami fizycznymi tam, gdzie są
zweryfikowane z opublikowanego źródła, i notatką "brak danych" tam, gdzie nie.

**Jak korzystać:**
1. Dodaj maszynę: wybierz lokalizację, wpisz producenta/model/wariant/nr
   seryjny, **wybierz kod katalogowy modelu z listy** (jeśli wiesz, jaki to
   Evolum — jeśli nie wiesz, zostaw puste albo wybierz "inny/nieznany"),
   podaj parametry fizyczne jeśli je znasz.
2. Dodaj definicję sygnału (kod, kategoria, jednostka, opis) — to jest słownik
   pojęć, np. `SCREW_SPEED_RPM`.
3. Zmapuj tag czujnika z Fitsys+/HMI na sygnał kanoniczny — to jest krok, który
   sprawia, że import CSV wie, która kolumna to co.
4. Panel katalogu modeli na dole strony pokazuje, co jest zweryfikowane (z linkiem
   źródła) a co nie (z notatką).

**Dlaczego to dodano:** tabliczka znamionowa maszyny nie mogła zostać
sfotografowana na miejscu, więc zamiast zgadywać model, aplikacja pozwala
wybrać go z listy, a każda wartość w katalogu ma jawne źródło albo jawny brak
źródła — nigdy zmyśloną liczbę.

**Czego brakuje:** dopóki nikt nie wybierze modelu (albo wybierze "inny"), żadne
limity bezpieczeństwa specyficzne dla modelu nie są stosowane automatycznie —
`machine_confirmed_limits` (osobna tabela, patrz Preflight) to nadal jedyne
źródło twardych limitów używane przy sprawdzaniu bezpieczeństwa.

---

## 5. Konsola maszyny (`/machine-console/[id]`)

**Jak działa:** panel "Źródło" pokazuje dwie karty obok siebie: "Ręcznie
dostępne" (CSV z eksportu) i "Automatycznie — niepodłączone" (na wyłączony,
bo nie ma żywego źródła telemetrycznego). Panel "Widok na żywo" **zawsze**
pokazuje NIEDOSTĘPNE — to jest zaprojektowane, nie błąd: w V1 nie ma
podłączenia do PLC w czasie rzeczywistym (zgodnie z zasadą braku zapisu/odczytu
na żywo z PLC bez przejścia całego łańcucha CSV → AUDIT 0 → silnik). Dalej:
stan zarejestrowany, konfiguracja/parametry, limity (dodawanie z `CATALOG` lub
`CONFIRMED_ON_MACHINE`), tagi czujników przypisane do tej maszyny, historia
przebiegów z nazwą zaimportowanego pliku i czasem importu.

**Jak korzystać:** wybierz maszynę z listy na `/machine-console`, potem na
stronie maszyny:
1. Dodaj potwierdzony limit (np. max obroty na tej konkretnej maszynie),
   wskazując źródło: katalog albo "potwierdzone na maszynie" (odczyt z
   tabliczki/dokumentacji fizycznej).
2. Sprawdź historię — każdy import CSV zostawia tu ślad z nazwą pliku i SHA-256.

**Czego brakuje:** żywe podłączenie telemetryczne — świadomie poza V1, wymaga
najpierw działającego łańcucha CSV → silnik na prawdziwym eksporcie.

---

## 6. Nowy produkt / kreator (`/new-product`)

**Jak działa:** krok 1 kreatora: cele produktu (np. docelowa ekspansja,
twardość) + wartości docelowe, wybór głównych składników z katalogu białek
(`PROTEIN_CATALOG`), pasek postępu kreatora (`SetupSteps`).

**Jak korzystać:** wpisz nazwę produktu, zaznacz cele i wartości docelowe,
zaznacz składniki główne, zapisz — to tworzy rekord produktu, od którego
zaczyna się dalszy łańcuch: PRODUKT → RECEPTURA → MASZYNA → PREFLIGHT →
DECYZJA → ZATWIERDZENIE → PRZEBIEG.

**Czego brakuje:** nic krytycznego — kreator działa end-to-end na poziomie
zapisu do bazy; nie zweryfikowano jeszcze renderowania end-to-end w
zalogowanej sesji na prawdziwym koncie testowym (brak takiego konta w tym
audycie).

---

## 7. Receptury (`/recipes`, `/recipes/[id]`)

**Jak działa:** receptura ma wersje; każda wersja ma składniki (komponenty),
które muszą sumować się do 100%, zanim wersję można "sfinalizować" (status
FINAL). Edycja składu jest możliwa tylko dopóki wersja jest w stanie DRAFT —
po finalizacji wersja jest zamrożona (nie można jej już zmieniać, tylko
stworzyć nową wersję).

**Jak korzystać:**
1. Dodaj komponenty do wersji DRAFT (surowiec + procent), aż suma da 100%.
2. Kliknij "Finalizuj" — od tej chwili ta wersja receptury jest niezmienna i
   może być użyta w Preflight/planie procesowym.
3. Jeśli trzeba zmienić skład — utwórz nową wersję, nie edytuj sfinalizowanej.

**Dlaczego tak:** to gwarantuje, że przebieg produkcyjny zawsze odnosi się do
receptury, która nie mogła się zmienić pod nim po fakcie (integralność audytu).

---

## 8. Preflight — plan procesowy (`/preflight`, `/preflight/[id]`)

**Jak działa:** lista istniejących planów + kreator 5-krokowy: cel produktu →
wersja receptury (musi być FINAL) → maszyna → konfiguracja (pola tekstowe
opisujące ustawienie fizyczne) → parametry planu (obroty, podawanie, woda,
para, obroty noża, nastawy stref). Jawna notatka "brak zapisu do PLC" widoczna
na stronie. Na stronie planu:
- tabela wprowadzonych parametrów,
- wynik `checkKnownLimits` — sprawdzenie planu wobec znanych, potwierdzonych
  limitów maszyny (PASS/FAIL/NEEDS_DATA — brak danych o limicie nigdy nie daje
  PASS),
- panel decyzji silnika — **zablokowany**, dopóki silnik nie jest podłączony
  (`engine.connected` = false w V1 bez sekretów), z przyciskiem "zapytaj
  silnik" gdy będzie podłączony,
- panel zatwierdzenia — widoczny wg roli, lista dozwolonych statusów do
  zatwierdzenia.

**Jak korzystać:**
1. Utwórz plan: cel → receptura FINAL → maszyna → konfiguracja → parametry.
2. Sprawdź wynik known-limits — jeśli FAIL, popraw parametry przed dalszym
   krokiem; jeśli NEEDS_DATA, brakuje potwierdzonego limitu (dodaj go w
   Konsoli maszyny albo zaakceptuj ryzyko świadomie).
3. Zatwierdź plan (rola ADMIN/ENGINEER) — dopiero zatwierdzony plan może
   zostać użyty do uruchomienia przebiegu (to jest wymuszone przez bazę, nie
   tylko przez UI).

**Czego brakuje:** decyzja silnika (AI/reguły procesowe) nie jest jeszcze
NIGDY zapisywana naprawdę — bo nie ma jeszcze prawdziwego adresu URL, tokena
i klucza zapisu silnika. Dopóki to nie zostanie skonfigurowane jako sekret
środowiskowy, ten panel zawsze pokazuje NIEDOSTĘPNE.

---

## 9. Przebiegi / Runs (`/runs`, `/runs/[id]`)

**Jak działa:** lista przebiegów + formularz utworzenia nowego. Szczegóły
przebiegu to najbardziej rozbudowana strona w aplikacji:
- **Cykl życia** (`setRunPlan`/`startRun`/`endRun`/`cancelPlannedRun`):
  PLANNED → RUNNING → COMPLETED/ABORTED, wymuszony przez bazę (start tylko na
  zatwierdzonym planie, brak cofania po starcie).
- tabela parametrów planu,
- podsumowanie werdyktu jakości,
- **Przewidywane vs Rzeczywiste** (Predicted vs Actual) — porównanie przez
  kontrakt silnika na medianie z ostatniego odświeżenia stanu,
- formularze pomiarów/próbek produktu (**tylko dopisywanie** — dane surowe są
  append-only, nigdy nie edytowane; problem z jakością danych idzie przez
  kwarantannę, nie przez poprawkę wstecz),
- panel kontroli produktu wobec celów,
- panel weryfikacji z linkiem do otwarcia sprawy FAIL, jeśli weryfikacja
  wypadnie negatywnie,
- panel pieczęci audytowej (przycisk zapieczętowania).

**Jak korzystać:**
1. Utwórz przebieg na zatwierdzonym planie.
2. Uruchom go (`startRun`) — zapisuje czas startu.
3. Importuj dane (patrz punkt 10) w trakcie lub po przebiegu.
4. Zakończ przebieg (`endRun`) — COMPLETED albo ABORTED, to jest stan
   końcowy, nie do cofnięcia.
5. Wprowadź pomiary/próbki laboratoryjne ręcznie (formularz append-only).
6. Sprawdź jakość danych (patrz punkt 11), diagnozę (punkt 12), weryfikację.
7. Zapieczętuj przebieg do audytu, gdy wszystko jest gotowe (patrz punkt 15).

**Czego brakuje:** Predicted vs Actual i panel weryfikacji pokazują
NIEDOSTĘPNE, dopóki nie ma podłączonego silnika — bo przewidywania i
weryfikacje **zapisuje wyłącznie silnik**, nie użytkownik (nawet ADMIN nie
może ich wpisać ręcznie — to jest wymuszone przez bazę).

---

## 10. Import CSV (`/runs/[id]/import`)

**Jak działa:** formularz importu z jawną notatką o wymaganych tagach
(zmapowanych w Maszynach). Każdy zaimportowany plik trafia na listę z nazwą i
skrótem SHA-256 (dowód integralności). Wartości, które wyglądają jak formuła
arkusza kalkulacyjnego, są oznaczane SUSPECT i zapisywane jako surowy tekst —
**nigdy nie są przeliczane** (ryzyko np. `=SUM(...)` potraktowanego jako
liczba). Znaczniki czasu bez strefy/offsetu są odrzucane. Separatory tysięcy
są odrzucane (dwuznaczność formatu).

**Jak korzystać:** wyeksportuj CSV z Fitsys+/HMI za okres przebiegu, wgraj tu
plik. Kolumny bez zmapowanego tagu wpadają jako UNMAPPED (widoczne, nie
ukrywane). Sprawdź w historii konsoli maszyny, że plik się pojawił z
poprawnym SHA-256.

**Czego brakuje:** nic po stronie kodu — to jedna z lepiej przetestowanych
części (8 testów jednostkowych). Prawdziwy test end-to-end czeka na
prawdziwy eksport z Fitsys+ z próby na chrupkę (case 04) — dotąd żaden
prawdziwy plik nie przeszedł przez ten import.

---

## 11. Jakość danych (`/runs/[id]/quality`)

**Jak działa:** przycisk `runQualityCheck` uruchamia sprawdzenie każdej serii
sygnałowej wobec reguł jakości (`lib/quality/rules.ts`), wynik per sygnał:
werdykt, powód kwarantanny (jeśli dotyczy), liczniki. Historia poprzednich
ocen jakości jest widoczna niżej.

**Jak korzystać:** po imporcie CSV kliknij "sprawdź jakość" — zobaczysz, które
sygnały są VALID, które QUARANTINED (z powodem — np. wartość poza fizycznym
zakresem, luka czasowa) i które dają INSUFFICIENT_DATA. Kwarantanna nigdy nie
kasuje danych surowych — tylko oznacza je do pominięcia w dalszej analizie.

---

## 12. Diagnoza (`/runs/[id]/diagnosis`)

**Jak działa:** przycisk `refreshState` buduje migawkę stanu (Snapshot) z
aktualnych, ważnych danych i liczy SHA-256 (dowód, co dokładnie było
analizowane). Tabela statystyk per sygnał z limitami i liczbą wartości poza
zakresem. Przycisk `runDiagnosis` pokazuje wynik bramek diagnostycznych po
kolei: dane wiarygodne → maszyna stabilna → odchylenie trwałe → sygnały
sprzężone → rozdzielność (receptura/surowiec/maszyna) — każda bramka
PASS/UNKNOWN/inne, z powodem. Ostrzeżenie o nieaktualności, jeśli migawka jest
stara.

**Jak korzystać:** po sprawdzeniu jakości, odśwież stan, potem uruchom
diagnozę. Jeśli krytyczna bramka da UNKNOWN — wynik to INSUFFICIENT_DATA albo
INCONCLUSIVE, **nigdy wymuszona przyczyna**. To jest zamierzone: brak danych
nigdy nie zamienia się w wiedzę.

**Stan bramek:** trzy z nich są dziś zawsze UNKNOWN, dopóki ich wejścia nie
istnieją (brak wystarczających prawdziwych przebiegów w bazie) — to nie błąd,
to stan "czekamy na dane".

---

## 13. Sprawy FAIL / pętla naprawcza (`/fail-cases`, `/fail-cases/[id]`)

To jest serce **Kanonu A** (`docs/CANON.md`) — pełna, zamrożona pętla
naprawcza po nieudanej weryfikacji.

**Jak działa lista:** każda sprawa pokazuje ostatni wykonany krok pętli i
wynik.

**Jak działa szczegół sprawy:** tabela podsumowania (status, wynik, kiedy
otwarta, przez kogo), tabela **wszystkich kroków** wykonanych po kolei
(numer, nazwa kroku po polsku + nazwa z dokumentu źródłowego, treść —
np. dla EXTRACT: werdykt + wersja reguł + lista sygnałów/pozycji poprawnych i
błędnych; dla INTERVENTION: lista zmian parametr/z/na; dla AUDIT: link do
zapieczętowanego rekordu), oraz — jeśli dostępny — panel "następny krok":

Kolejność kroków (`nextStep()` w `lib/fail-loop/steps.ts`) jest wymuszona
programowo, krok po kroku:

    FAIL → ROZPAD I (DECOMPOSITION) → SZCZEGÓŁOWA DIAGNOZA (DIAGNOSIS)
    → 3 ODDZIELENIE (EXTRACT) → 6 FILTR/WYKLUCZENIE (PURGE)
    → 28 KONSOLIDACJA (CONSOLIDATE) → ODŚWIEŻENIE (STATE_REFRESH)
    → NAPRAWA (INTERVENTION) → TEST (CONTROLLED_TEST) → WERYFIKACJA (VERIFICATION)
    → 38 FILTR DOWODÓW (FILTER) → 39 WERYFIKACJA+UTRWALENIE (VERIFY_PERSIST)
    → 40 LOCK (LOCK) → CROSS → AUDIT

**Jak korzystać (rola ADMIN/ENGINEER):**
1. Aplikacja pokazuje, jaki krok jest następny, i **tylko te rekordy z bazy,
   które mogą być prawnie do niego przypisane** (np. przy kroku
   VERIFICATION pokazuje tylko weryfikacje z testowego przebiegu — nie da się
   podpiąć czegokolwiek).
2. Jeśli lista opcji jest pusta, aplikacja mówi to wprost i linkuje, gdzie
   stworzyć brakujący rekord (np. "brak diagnozy — utwórz ją tutaj").
3. Krok INTERVENTION wymaga wpisania zmian (parametr, z, na, jednostka) i
   uzasadnienia — to jedyny krok z polem tekstowym "dlaczego".
4. Sprawę można zamknąć bez wyniku (`closeFailCase`) z notatką wyjaśniającą —
   to zostaje w audycie jako "zamknięta bez wyniku", nigdy nie znika.
5. Panel "wiedza" (`knowledge_entries`) pokazuje utrwaloną wiedzę tylko wtedy,
   gdy sprawa faktycznie doszła do kroku 40 — to jest jedyne miejsce, gdzie
   wynik naprawy staje się "wiedzą", a nie tylko zapisem próby.

**Reguła nadrzędna widoczna w panelu:** krok 6 (FILTR/WYKLUCZENIE) filtruje i
umieszcza w kwarantannie, **nigdy nie usuwa** danych surowych.

**Czego brakuje:** żaden łańcuch dziś nie dochodzi do NAPRAWY, bo `DIAGNOSED`
(model przyczyny) to rola zaufana wyłącznie dla silnika, a silnik nie jest
podłączony. To znaczy: cała struktura jest gotowa i przetestowana (40/40
testów bazy), ale żadna prawdziwa sprawa FAIL nie przeszła jeszcze przez nią
od początku do końca na rzeczywistych danych.

---

## 14. Historia (`/history`)

**Jak działa:** dla każdego przebiegu pokazuje łańcuch DECYZJA → ZATWIERDZENIE
→ PRZEBIEG → RZECZYWISTE → WERYFIKACJA, budowany wyłącznie z zapisanych
rekordów (`lib/history/timeline.ts`) — brakujący krok to NIEDOSTĘPNE, nigdy
domyślna wartość. Osobno: płaski dziennik zdarzeń z imieniem/nazwiskiem
osoby i czasem (`peopleNames`).

**Jak korzystać:** to widok tylko do odczytu — przeglądasz, żeby zrozumieć,
co się wydarzyło z danym przebiegiem od decyzji do weryfikacji, bez
przełączania się między stronami.

---

## 15. Audyt (`/audit`, `/audit/[id]`)

**Jak działa lista:** wszystkie zapieczętowane rekordy audytu + podsumowanie
integralności (`audit_integrity` RPC — sprawdza hash i łańcuch `previous_hash`
przy każdym wyświetleniu, nie tylko raz).

**Jak działa szczegół rekordu:** dokładnie to, co zawierałby eksport — pełna
migawka: dane organizacji/lokalizacji/maszyny/wersji receptury, plan procesowy
z decyzją silnika i zatwierdzeniem, lista zaimportowanych plików z SHA-256,
wpisy jakości/diagnozy, przewidywania, pomiary, weryfikacje. Na górze: stan
integralności (INTACT/inne), numer sekwencyjny, hash, poprzedni hash, kto i
kiedy zapieczętował, oraz **hash policzony niezależnie przez kontrakt silnika**
(`contractAuditExport`) — dwa niezależne sposoby liczenia tego samego hasha,
które muszą się zgadzać.

**Jak korzystać:**
1. Otwórz konkretny rekord, sprawdź stan integralności na górze.
2. Przycisk "drukuj" — widok do wydruku/PDF.
3. Link "eksportuj JSON" (`/api/audit/[id]/export`) — dokładnie te same pola,
   z listy dozwolonej (allowlist), nieznane pola są odrzucane i liczone.

**Zapieczętowanie przebiegu** dzieje się na stronie przebiegu (`/runs/[id]`),
nie tutaj — tu tylko przeglądasz i eksportujesz to, co już zapieczętowane.

**Czego brakuje:** nic w kodzie — to jedna z najlepiej przetestowanych części
(16/16 testów bazy z wykrywaniem edytowanego/przehaszowanego/usuniętego
rekordu). Po prostu nie ma jeszcze żadnego prawdziwego przebiegu do
zapieczętowania.

---

## 16. Ustawienia (`/settings`)

**Jak działa:** zmiana nazwy organizacji, CRUD lokalizacji (dodaj/usuń),
lista członków z rolami, statyczna tabela macierzy uprawnień (12 akcji × role),
panel konfiguracji pokazujący status silnika, wersję zestawu reguł, wersję
bramek, format audytu.

**Jak korzystać:** tu zarządzasz strukturą organizacji (nazwa, lokalizacje) i
sprawdzasz, kto ma jaką rolę oraz co dana rola może zrobić (macierz uprawnień
jest tylko do odczytu — potwierdzona testem bazy 12×4, zero rozbieżności).

**Czego brakuje (potwierdzone, nie zmieniło się od ostatniego audytu
technicznego):**
- zapraszanie nowych użytkowników i zmiana ich ról — wymaga uprawnień Auth
  admin, dziś robi się to tylko przez panel Supabase, nie przez aplikację;
- włączenie ochrony przed przeciekłymi hasłami — to przełącznik w panelu
  Supabase (Advisor to zgłasza), nie w aplikacji.

---

## 17. Sekcje-zaślepki (`/[section]`)

**Jak działa:** dowolna sekcja z nawigacji, która nie ma jeszcze własnej
strony, trafia tu — pokazuje jawny komunikat "jeszcze nie zbudowane", a dla
`machine-console`/`preflight` dodatkowo notatkę o braku zapisu do PLC.

**Po co to jest:** żeby nawigacja nigdy nie prowadziła do pustej strony albo
błędu 404 — tylko do jawnej informacji o stanie.

---

## Podsumowanie: co jeszcze zostało do zrobienia (poza tabliczką znamionową)

Uszeregowane od najważniejszego:

1. **Prawdziwy eksport CSV z Fitsys+.** Żaden krok od importu CSV w dół
   (jakość → diagnoza → FAIL-loop → weryfikacja → audyt) nie przeszedł jeszcze
   przez prawdziwe dane produkcyjne. To jest pojedynczy najważniejszy
   brakujący element — bez niego cała reszta zostaje "zbudowane i
   przetestowane syntetycznie", nie "zweryfikowane na produkcji". Czeka na
   próbę chrupki (case 04, karta `docs/blind/trial-sheet-case-04.md`).
2. **Podłączenie silnika decyzyjnego** (URL, token, `ENGINE_WRITE_KEY`) — bez
   tego: brak decyzji w Preflight, brak Predicted vs Actual, brak weryfikacji,
   żadna sprawa FAIL nie dojdzie do kroku NAPRAWA. Kod i testy bazy są gotowe
   (25/25), czeka tylko na sekrety środowiskowe i uzgodniony format żądania
   z drugą stroną.
3. **Term guard z prawdziwymi terminami** (`TERM_GUARD_KEY` + digesty) —
   mechanizm zbudowany i przetestowany na sztucznych danych, ale realne
   sprawdzenie chronionych terminów jest NOT RUN, dopóki ktoś nie poda kluczy.
4. **Zapraszanie użytkowników / zmiana ról w aplikacji** — dziś tylko przez
   panel Supabase.
5. **Ochrona przed przeciekłymi hasłami** — przełącznik w panelu Supabase,
   jednorazowa czynność właściciela projektu.
6. **Model maszyny.** Pomijając zgodnie z poleceniem — ale zapisuję dla
   porządku: katalog wyboru modelu jest gotowy (`/machines`), lecz nikt jeszcze
   nie wybrał konkretnego modelu dla realnej maszyny w bazie, bo tabliczka nie
   została jeszcze odczytana.
7. **Rendering end-to-end na zalogowanym koncie testowym** — nigdy nie
   zweryfikowany w tym środowisku (brak testowego konta z realnymi danymi);
   wszystkie dotychczasowe PASS-y opierają się na testach kodu/bazy, nie na
   obejrzeniu ekranu w przeglądarce z prawdziwym zalogowaniem.

Wszystko powyżej to rzeczy **poza kodem aplikacji** (sekrety, dane od klienta,
działania administracyjne w Supabase) albo **rzeczy czekające na pierwszy
prawdziwy przebieg** — nie brakujące funkcje w kodzie. Sam kod pokrywa cały
łańcuch od produktu do zapieczętowanego audytu, z testami na każdym kroku.
