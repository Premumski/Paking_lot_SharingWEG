# Umsetzungsstand je Anforderung

Stand: 16.10.2026. Legende:

- **✅ umgesetzt**, mit Nachweis (automatischer Test oder Vorführung im Testsetup)
- **◐ umgesetzt mit Einschränkung**, siehe Anmerkung
- **☐ Betrieb/Organisation**, also eine Aufgabe beim Livegang, vorbereitet durch Skripte oder Doku

Testnachweise: `tests/unit` (Vitest), `tests/integration` (Datenbank), `tests/e2e` (Playwright).

## Rollen und Anmeldung

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| R-01 | ✅ | Keine Registrierungsseite oder -route. E2E `auth.spec.ts` prüft `/register` = 404 |
| R-02 | ✅ | Einladung 72 h, einmal nutzbar (`src/lib/invitations.ts`, `tokens.ts`). E2E `more-flows.spec.ts` |
| R-03 | ✅ | Mindestens 12 Zeichen, HIBP-Abgleich per k-Anonymität plus lokale Liste (`passwords.ts`). Im Testsetup abgeschaltet |
| R-04 | ✅ | TOTP Pflicht für Admins (Erzwingung in `auth.ts`), optional für Bewohner. E2E `auth.spec.ts` |
| R-05 | ✅ | Link 1 h gültig, neutrale Antwort, 3 Anfragen pro Stunde |
| R-06 | ✅ | Sperren löscht alle Sitzungen. Jede Anfrage prüft den Kontostatus |
| R-07 | ✅ | Profil: Sitzungsliste, einzeln oder alle anderen abmelden |
| R-08 | ✅ | Profil: Name, Telefon, Sprache, Benachrichtigungen. E-Mail und Wohnung nur lesbar |
| R-09 | ✅ | Antrag im Profil. Admin löscht (anonymisiert) nur ohne offene Buchungen und ohne Plätze. E2E `admin-owner.spec.ts` |

## Stellplätze, Freigaben, Hallenkarte

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| P-01 | ✅ | Nur der Admin legt Plätze an und ordnet zu. Mehrere Plätze je Bewohner |
| P-02 | ✅ | `requireOwnedSpot` in jeder Aktion des Eigentümers |
| P-03 | ✅ | Preis pro Stunde und Tag, 0 € erlaubt. Beschreibung; Zugangshinweise erst nach Zusage |
| P-04 | ✅ | 15-Minuten-Raster, serverseitig geprüft. Unit `horizon.test.ts` |
| P-05 | ✅ | Wöchentlich (auch über Nacht), Wochenende, immer, jeweils mit optionalem Enddatum. Unit `availability.test.ts` |
| P-06 | ✅ | Blockierungen werden abgezogen. Unit-Test |
| P-07 | ✅ | Sofortzusage mit Schwelle von 15 min bis 365 Tagen, Standard manuell. E2E |
| P-08 | ✅ | Pausieren mit einem Klick. Bestehende Zusagen werden aufgelistet. E2E |
| P-09 | ✅ | Kollidierende Zusagen werden angezeigt und nur nach ausdrücklicher Stornierung mit Begründung entfernt. Laufende Buchungen blockieren die Änderung. E2E |
| K-01 | ✅ | Ein Plan je Ebene (Umschalter auf der Karte, Ebene in der Liste). Upload als SVG je Ebene oder direkt als Draw.io-Datei mit allen Ebenen (`src/lib/drawio.ts`), strenge Allow-List. Plan-Nummer als `id` oder Draw.io-`data-cell-id`. Unsere Garage: `Lageplan.drawio` (nur lokal, nicht im Repository) → `docs/plans/` (`npm run plan:build`). Unit `svg.test.ts`, `drawio.test.ts`, E2E |
| K-02 | ✅ | Frei grün, belegt grau, eigener Platz blau gestrichelt |
| K-03 | ✅ | Klick oder Tastatur öffnet Preis, Beschreibung und „Anfragen“ |
| K-04 | ✅ | Listenansicht: Tabelle ab Tablet, Karten auf dem Smartphone. Beschriftete Bedienelemente |
| K-05 | ✅ | Zoom-Knöpfe, Pinch-Zoom, Verschieben per Scroll. E2E `mobile.spec.ts` (360 px) |

## Buchungshorizont und Zeitregeln

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| T-01 … T-07 | ✅ | `src/lib/domain/horizon.ts`, alle Werte im Admin-Bereich einstellbar. Unit-Tests inkl. Beispiel aus der Spezifikation |
| T-08, T-09 | ✅ | Geprüft bei Anfrage und bei Zusage |
| T-10 | ✅ | Hintergrundjob jede Minute. E2E mit Test-Uhr |
| T-11 | ✅ | Kalendermonat, bei fehlendem Tag der Monatsletzte. Unit-Test |
| T-12 | ✅ | Verlängerung zählt die Gesamtdauer der Kette. Unit-Test, E2E |
| T-13 | ◐ | Regeln werden bei jeder Abfrage bis zur längsten Stufe berechnet statt täglich gespeichert; das Ergebnis ist gleich |
| T-14 | ✅ | Zeitauswahl zeigt Stufe und spätesten Beginn; spätere Startdaten sind gesperrt. Server prüft identisch |
| T-15 | ✅ | Änderungen wirken nur auf neue Anfragen |
| T-16 | ✅ | Europe/Berlin, echte Dauer über die Zeitumstellung. Unit-Tests am 25.10.2026 |
| T-17 | ✅ | Günstigste Variante; je volle 24 h auch höchstens 24 × Stundenpreis. Unit `pricing.test.ts` |
| T-18 | ✅ | PostgreSQL-Exclusion-Constraint `Booking_no_overlap`. Integrationstest `db-constraints.test.ts` |

## Anfrage und Buchung

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| B-01 | ✅ | Zusammenfassung mit Endpreis und Hinweis auf kostenloses Stornieren. Optional Besuch und Kennzeichen |
| B-02 | ✅ | Vorab wird angezeigt, ob die Anfrage sofort bestätigt wird. E2E |
| B-03 | ✅ | Zusagen oder Ablehnen ohne Begründung |
| B-04 | ✅ | Überlappende Anfragen werden abgelehnt, mit Link auf andere freie Plätze im selben Zeitraum |
| B-05, B-06 | ✅ | Zurückziehen bzw. Stornieren bis Beginn, volle Erstattung. E2E |
| B-07 | ✅ | Begründung Pflicht, sofortige Erstattung. Admin sieht Anbieter-Stornos je Platz |
| B-08 | ✅ | „Meine Buchungen“ in beiden Rollen: Status, Zahlung, Preis, Vertrag, Aktionen |
| B-09 | ✅ | Anschluss-Anfrage für laufende Buchungen; der Preis wird über die Gesamtdauer berechnet. E2E |

## Zahlung und Auszahlung

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| Z-01 | ◐ | Stripe Connect mit Direct Charges ohne Application Fee (`payments/stripe.ts`). **Noch nicht gegen ein echtes Stripe-Testkonto gelaufen**, weil dafür Schlüssel nötig sind |
| Z-02 | ✅ | `PaymentAdapter`-Schnittstelle mit Stripe- und Mock-Implementierung |
| Z-03 | ✅ | Ohne verbundenes Konto nur 0 € möglich. Onboarding über einen von Stripe gehosteten Link. E2E (Mock) |
| Z-04 | ✅ | Karte und SEPA ausschließlich in Stripe Checkout; 3-D Secure und Mandat übernimmt Stripe |
| Z-05 | ✅ | Zahlungsmittel bei Anfrage, Belastung bei Zusage. Der Anbieter sieht seinen Betrag nach geschätzter Gebühr |
| Z-06 | ✅ | 12 h Nachzahlfrist, danach automatische Stornierung. E2E mit Test-Uhr |
| Z-07 | ✅ | Status „in Bearbeitung“. Bei Rücklastschrift werden Mieter, Anbieter und Admin benachrichtigt. E2E |
| Z-08 | ✅ | Jede Stornierung vor Beginn erstattet automatisch. Bei Direct Charges trägt der Anbieter die Gebühr |
| Z-09 | ✅ | Zahlungsstatus ändert sich nur in `handleWebhook`: Signatur geprüft, Ereignis-ID idempotent |
| Z-10 | ◐ | Einnahmen je Buchung, Jahresauszug als PDF/CSV, Belege für Mieter. Gebühr ist geschätzt. Auszahlungen zeigt Stripe als Liste je Konto, nicht je Buchung |
| Z-11 | ✅ | Kein Zahlungsschritt bei 0 €. E2E |

## Vertrag, Benachrichtigungen, Sprache, Datenschutz

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| V-01 | ✅ | Markdown-Vorlage mit Platzhaltern, versioniert, DE/EN |
| V-02 | ✅ | PDF bei Zusage, je Sprache der Parteien, per DB-Trigger unveränderbar, an beide Parteien. Integrationstest |
| V-03 | ✅ | Nicht vorausgewählte Checkbox, Vertragstext mit Buchungsdaten aufrufbar. Zeitpunkt und Version werden gespeichert. E2E |
| N-01 | ✅ | E-Mail und Web-Push für alle Ereignisse inkl. „Beginn in 1 h“ und „Ende in 30 min“ |
| N-02 | ◐ | Signierter, einmal gültiger Link mit Anmeldung. Er führt auf eine Seite mit **einem** Bestätigungsknopf statt sofort zu handeln, damit Link-Scanner in Mailprogrammen keine Zusage auslösen |
| N-03 | ✅ | Jede Benachrichtigungsart je Kanal abschaltbar |
| L-01 | ✅ | Oberfläche, E-Mails und PDFs auf DE/EN. Browsersprache als Standard, Sprache im Profil gespeichert. E2E |
| L-02 | ✅ | Texte nur in `messages/`. `npm run i18n:check` und ein Unit-Test prüfen beide Sprachen |
| D-01 | ✅ | Telefon und Zugangshinweise ab Zusage bis 7 Tage nach Ende sichtbar |
| D-02 | ✅ | Text und bis zu 3 Fotos (Dateityp geprüft), an Gegenüber und Admin. E2E |

## Admin-Bereich

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| A-01 | ✅ | Anlegen, erneut einladen, bearbeiten, sperren, entsperren, löschen, CSV-Import. E2E |
| A-02 | ✅ | Eigentümerwechsel setzt Preise und Freigaben zurück und pausiert. Bestehende Zusagen bleiben beim bisherigen Eigentümer |
| A-03 | ✅ | Abgleich über alle Ebenen: Plätze ohne Fläche, Flächen ohne Platz; fehlende Plätze lassen sich mit einem Klick (ohne Eigentümer) anlegen. E2E |
| A-04 | ✅ | Alle Werte mit Bereichsprüfung im Browser und auf dem Server |
| A-05 | ✅ | Vertrag, Impressum und Datenschutz auf DE/EN |
| A-06 | ✅ | Filter nach Zeitraum, Platz, Bewohner, Status und Zahlung, CSV-Export. E2E |
| A-07 | ✅ | Meldungen ansehen und erledigen. E2E |
| A-08 | ✅ | Nur lesend. Ein DB-Trigger verhindert Änderungen, Löschen ist erst nach 2 Jahren möglich. Integrationstest |
| A-09 | ✅ | Mehrere Admins möglich. Der letzte Admin kann Rechte nicht verlieren und nicht gesperrt oder gelöscht werden |

## Betrieb und Sicherheit

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| O-01 | ✅ | `docker-compose.yml`: App, PostgreSQL, Caddy mit Let's Encrypt |
| O-02 | ☐ | Standort bei der Servererstellung wählen; AV-Verträge mit Hetzner und Stripe abschließen |
| O-03 | ✅/☐ | Datenbank ohne veröffentlichten Port. `ops/server-setup.sh` schaltet den Passwort-Login für SSH ab. Die Cloud Firewall wird in der Konsole eingerichtet |
| O-04 | ✅ | Unattended-upgrades, versionierte Images, Dependabot |
| O-05 | ✅/☐ | `ops/backup.sh` (verschlüsselt, Storage Box, 30 Tage) und `ops/restore.sh`. Den Test einmal pro Quartal organisieren |
| O-06 | ✅ | Nur `.env`, im Repository ignoriert |
| O-07 | ✅/☐ | `/api/health` und Docker-Healthcheck. Externen Monitor mit E-Mail-Alarm einrichten |
| O-08 | ☐ | SMTP-Anbieter mit SPF, DKIM und DMARC wählen |
| S-01 | ✅ | HSTS (Caddy und App), CSP mit Nonce, X-Frame-Options, Referrer-Policy |
| S-02 | ✅ | Argon2id; Cookies HttpOnly, Secure (unter HTTPS) und SameSite=Lax. CSRF: Origin-Prüfung für Server Actions und API |
| S-03 | ◐ | 5 Fehlversuche je Konto+IP mit ansteigender Sperre. Zusätzlich 30 je IP und 20 je Konto, damit Nachbarn hinter einer gemeinsamen IP nicht gesperrt werden. Passwort-Reset 3 pro Stunde. E2E |
| S-04 | ✅ | UUIDs und Rechteprüfung in jeder Seite, Aktion und API. E2E |
| S-05 | ✅ | Keine personenbezogenen Daten in URLs; IPs nur als gekürzter, verschlüsselter Hash; Caddy ohne Access-Log; Logs 30 Tage |
| S-06 | ✅ | Dependabot und `npm audit` im CI. Offene Hinweise betreffen nur Entwicklungswerkzeuge (Vitest, Prisma-CLI) |
| S-07 | ☐ | Vor dem Livegang OWASP-ZAP-Scan gegen die Staging-Instanz |
| S-08 | ✅ | Datenexport (JSON), Löschkonzept (Anonymisierung), Impressum und Datenschutz ohne Login |

## Technik und Abnahme

| ID | Status | Umsetzung / Nachweis |
| --- | --- | --- |
| Q-01 | ✅ | MIT-Lizenz, keine Telemetrie (`NEXT_TELEMETRY_DISABLED`) |
| Q-02 | ✅ | README mit Installation auf einem frischen Hetzner-Server |
| Q-03 | ◐ | Mobil zuerst, getestet bei 360 px; Labels, Fokus und Tastaturbedienung. Ein formales WCAG-2.1-AA-Audit steht noch aus |
| Q-04 | ◐ | Unit- und Integrationstests sowie E2E-Ablauf Anfrage → Zusage → Zahlung → Stornierung, grün im CI-Workflow. Die E2E laufen gegen den Zahlungssimulator; ein Lauf im Stripe-Testmodus braucht Testschlüssel |
| Q-05 | ✅ | Seed: unsere Garage mit beiden Ebenen (`docs/plans/`) und allen 64 Plätzen; 10 davon (501–505, 525–529) gehören den Test-Bewohnern, die übrigen haben noch keinen Eigentümer. 1 Admin, 5 Bewohner (plus ein eingeladenes Konto) |

## Offene Punkte für die Abnahme

1. Stripe-Testmodus: Schlüssel eintragen, mit `PAYMENT_PROVIDER=stripe` den E2E-Ablauf wiederholen, danach eine Probe-Buchung mit echter Karte und Lastschrift bis zur Auszahlung.
2. OWASP-ZAP-Scan (S-07) und ein WCAG-Audit (Q-03).
3. Rechtliche Prüfung von Vertrag, Datenschutz und Impressum sowie die Zustimmung der WEG.
