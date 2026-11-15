# Stellplatz-Sharing – Anforderungsspezifikation

Oct 16, 2026 · @Felix Krauter

Gebaut wird eine kostenlose Open-Source-Web-App, mit der Bewohner einer Wohnanlage ihre Tiefgaragenplätze zeitweise untereinander teilen, bezahlt per Kreditkarte oder SEPA-Lastschrift und ausgezahlt aufs Girokonto. Sie läuft selbst gehostet auf einem Hetzner-Server.

## Ziel und Leitprinzipien

- **User first:** Bei jedem Zielkonflikt gewinnt die Variante, die für Bewohner einfacher, fairer oder günstiger ist.
- **Kostenlos:** Keine Plattformgebühr, kein Abo. Es fallen nur die Gebühren des Zahlungsdienstleisters an, vom Anbieter getragen und transparent ausgewiesen.
- **Open Source:** Gesamter Code öffentlich, selbst hostbar per Docker Compose.
- **Geschlossener Kreis:** Keine Registrierung. Nur Konten, die der Admin anlegt, können sich anmelden.
- **Sicher im Internet:** Öffentlich erreichbar, gehärtet nach Abschnitt „Betrieb und Sicherheit“.

Anforderungen tragen IDs (z. B. H-03) und sind als prüfbare Aussagen formuliert. **Muss** gilt, wenn nicht anders vermerkt.

## Rollen und Anmeldung

Es gibt zwei Rollen: **Admin** (Verwaltung/Beirat) und **Bewohner**. Ein Bewohner kann suchen und, wenn ihm ein Platz zugeordnet ist, anbieten.

| ID | Anforderung |
| --- | --- |
| R-01 | Es gibt keine Registrierungsseite und keinen Registrierungs-Endpunkt. Konten entstehen nur durch den Admin. |
| R-02 | Der Admin legt ein Konto mit Name, E-Mail und Wohnung an. Das System schickt einen Einladungslink zum Setzen des Passworts, gültig 72 h, nur einmal nutzbar. |
| R-03 | Login mit E-Mail und Passwort. Mindestens 12 Zeichen; Abgleich gegen bekannte geleakte Passwörter. |
| R-04 | Zwei-Faktor (TOTP-App) ist für Admins Pflicht und für Bewohner optional. |
| R-05 | „Passwort vergessen“ per E-Mail-Link (gültig 1 h). Die Antwort verrät nicht, ob die E-Mail existiert. |
| R-06 | Gesperrte Konten können sich nicht anmelden; laufende Sitzungen enden sofort. |
| R-07 | Bewohner sehen ihre aktiven Sitzungen und können sie abmelden. |
| R-08 | Bewohner können Name, Telefon, Sprache und Benachrichtigungen selbst ändern; E-Mail und Wohnung nur der Admin. |
| R-09 | Bewohner können ihre Kontolöschung beantragen. Der Admin führt sie aus; offene Buchungen müssen vorher abgeschlossen sein. |

## Stellplätze und Freigaben

Nur der Eigentümer eines Platzes kann ihn freigeben; welcher Platz wem gehört, legt der Admin fest.

| ID | Anforderung |
| --- | --- |
| P-01 | Nur der Admin legt Plätze an, ändert Plan-Nummer, Bezeichnung und Typ und löscht sie; Bewohner können keine Plätze anlegen. Der Admin ordnet jeden Platz einem Bewohner zu; ein Bewohner kann mehrere Plätze haben und verwaltet jeden einzeln. |
| P-02 | Jede Freigabe- und Änderungsaktion prüft serverseitig, dass der Nutzer Eigentümer des Platzes ist. |
| P-03 | Der Eigentümer legt für jeden seiner Plätze selbst den Preis fest (pro Stunde und pro Tag in Euro, jeweils 0 € erlaubt) und pflegt Beschreibung und Zugangshinweise (sichtbar erst nach Zusage). Weder Admin noch System schreiben Preise vor. |
| P-04 | Manuelle Freigabe: Zeitraum von–bis, minutengenau in 15-Minuten-Schritten. |
| P-05 | Automatische Freigabe per Regel: wöchentliche Wiederholung mit Wochentagen und Uhrzeit (z. B. Mo–Fr 08–17 Uhr), „jedes Wochenende“ oder „immer, außer blockiert“. Optional mit Enddatum. |
| P-06 | Blockierungen des Eigentümers haben Vorrang vor jeder Regel. |
| P-07 | Pro Platz wählbar: **Sofortzusage** mit Dauer-Schwelle X oder **manuell bestätigen**. Bei Sofortzusage werden Anfragen in einer Freigabe mit Dauer bis einschließlich X automatisch bestätigt; längere Anfragen gehen als normale Anfrage an den Eigentümer und müssen gesondert zugesagt werden. X legt der Eigentümer je Platz fest (15 min bis 365 Tage, z. B. 4 h). Standard: manuell. |
| P-08 | Pausieren mit einem Klick: keine neuen Anfragen und keine Sofortzusagen mehr. Bestehende Zusagen bleiben gültig und werden beim Pausieren aufgelistet. |
| P-09 | Freigaben, die mit bestehenden Zusagen kollidieren, können nicht gelöscht oder verkürzt werden, ohne diese Buchungen zu stornieren (Regeln siehe Abschnitt Buchung). |

### Hallenkarte

| ID | Anforderung |
| --- | --- |
| K-01 | Der Admin lädt einen SVG-Plan der Tiefgarage hoch (Export aus Draw.io). Jede Platzfläche trägt eine ID, die der Plan-Nummer entspricht. |
| K-02 | Für einen gewählten Zeitraum färbt die Karte jeden Platz: frei = grün, belegt/nicht freigegeben = grau, eigener Platz = umrandet. |
| K-03 | Klick auf einen freien Platz öffnet Preis, Beschreibung und „Anfragen“. |
| K-04 | Alternative Listenansicht mit denselben Informationen, per Tastatur und Screenreader bedienbar. |
| K-05 | Auf Smartphones zoom- und verschiebbar. |

## Buchungshorizont und Zeitregeln

Wie weit im Voraus gebucht werden kann, hängt von der Buchungsdauer ab: je länger die Buchung, desto weiter im Voraus. Maßgeblich ist der Abstand zwischen jetzt und Buchungsbeginn. Alle Werte sind im Admin-Bereich einstellbar; „Standard“ gilt bei Auslieferung.

| ID | Regel | Standard | Bereich |
| --- | --- | --- | --- |
| T-01 | **Stufe 1:** Buchungen kürzer als 1 Tag dürfen höchstens so weit im Voraus beginnen | 2 Tage | 1 h–30 Tage |
| T-02 | **Stufe 2:** Buchungen von 1 Tag bis unter 1 Woche | 2 Wochen | 1–90 Tage |
| T-03 | **Stufe 3:** Buchungen von 1 Woche bis 1 Monat | 1 Monat | 1–12 Monate |
| T-04 | **Höchstdauer** einer Buchung | 1 Monat | 1 Tag–12 Monate |
| T-05 | **Je Platz:** Eigentümer kann jede Stufe für seinen Platz verkürzen; es gilt der kleinere Wert | wie global | bis global |
| T-06 | **Mindestvorlauf:** frühester Beginn ab jetzt | 0 min | 0–48 h |
| T-07 | **Mindestdauer** einer Buchung | 1 h | 15 min–24 h |
| T-08 | **Fairness-Grenze:** zugesagte, noch nicht begonnene Buchungen je Bewohner | 3 | 0 = unbegrenzt |
| T-09 | **Offene Anfragen** je Bewohner gleichzeitig | 5 | 1–20 |
| T-10 | **Ablauf unbeantworteter Anfragen:** früherer Zeitpunkt von Buchungsbeginn oder X Stunden nach Eingang | 48 h | 1–168 h |

Weitere Regeln:

- T-11 „1 Monat“ heißt: bis zum gleichen Kalendertag im Folgemonat, gleiche Uhrzeit.
- T-12 Für die Stufe zählt die Gesamtdauer; eine Verlängerung (B-09) wird mit der bisherigen Dauer zusammengerechnet.
- T-13 Freigaben dürfen weiter in die Zukunft reichen als die Stufen; nur Buchungen sind begrenzt. Automatische Regeln erzeugen Zeitfenster bis zur längsten Stufe, täglich neu berechnet.
- T-14 Sobald Beginn und Ende gewählt sind, nennt die Zeitauswahl die gültige Stufe und das späteste mögliche Startdatum; spätere Daten sind gesperrt. Serverseitig wird dieselbe Prüfung erzwungen.
- T-15 Ändert der Admin einen Wert, bleiben bestehende Buchungen und Anfragen unberührt.
- T-16 Zeitzone ist Europe/Berlin; Sommer-/Winterzeit wird korrekt behandelt (gerechnet wird mit der echten Dauer).
- T-17 **Preis (günstigste Variante):** je volle 24 h der Tagespreis; für den Rest Stundenpreis × angefangene Stunden, höchstens ein Tagespreis. Der Endpreis steht vor dem Absenden fest.
- T-18 Überschneidungen sind ausgeschlossen: zwei bestätigte Buchungen desselben Platzes dürfen sich nicht überlappen (Datenbank-Constraint, nicht nur Anwendungslogik).

Beispiel: Jetzt ist Freitag, 16.10.2026, 16:00. Eine Buchung über 3 Stunden kann spätestens am 18.10. um 16:00 beginnen, eine über 3 Tage spätestens am 30.10., eine über 2 Wochen spätestens am 16.11.2026. Eine Buchung über 5 Wochen ist nicht möglich (Höchstdauer).

## Anfrage und Buchung

Eine Anfrage wird mit der Zusage verbindlich; bis zum Beginn bleibt sie trotzdem jederzeit kostenlos stornierbar.

&#91;embedded content: Buchungsstatus · 6 Zustände\]

Jeder Statuswechsel landet im Audit-Log und löst die passende Benachrichtigung aus.

| ID | Anforderung |
| --- | --- |
| B-01 | Anfrage = Platz (aus Karte oder Liste), Zeitraum, optional Name des Besuchs und Kennzeichen, bei Preis > 0 ein Zahlungsmittel. Vor dem Absenden: Zusammenfassung mit Endpreis und dem Hinweis, dass Stornieren bis zum Beginn kostenlos ist. |
| B-02 | Liegt die Anfrage vollständig in einer Freigabe, hat der Platz Sofortzusage aktiv, ist die Dauer höchstens X (P-07) und überschneidet sie sich mit nichts, ist sie sofort zugesagt. Vor dem Absenden sieht der Mieter, ob seine Anfrage sofort bestätigt wird oder auf den Eigentümer wartet. |
| B-03 | Sonst sagt der Eigentümer zu oder lehnt ab, ohne Begründung. |
| B-04 | Mehrere Anfragen für denselben Platz und Zeitraum sind möglich. Mit einer Zusage werden überlappende Anfragen automatisch abgelehnt, mit Hinweis auf andere freie Plätze. |
| B-05 | Der Mieter kann bis zur Zusage zurückziehen, ohne Kosten. |
| B-06 | Der Mieter kann nach Zusage jederzeit bis zum Beginn kostenlos stornieren und erhält den vollen Betrag zurück. |
| B-07 | Der Eigentümer kann vor Beginn stornieren, mit kurzer Begründung; der Mieter erhält sofort die volle Erstattung und eine Nachricht. Der Admin sieht die Zahl der Anbieter-Stornierungen je Platz. |
| B-08 | „Meine Buchungen“ zeigt kommende und vergangene Buchungen in beiden Rollen mit Status, Preis, Vertrag und Aktionen. |
| B-09 | Verlängern: eine aktive Buchung kann per Anschluss-Anfrage verlängert werden, wenn der Platz frei ist (Horizont gilt). |

## Zahlung und Auszahlung

Bezahlt wird per Kreditkarte oder SEPA-Lastschrift, ausgezahlt direkt aufs Girokonto des Anbieters, über Stripe Connect im Modell „Stripe handles pricing“. In diesem Modell berechnet Stripe der Plattform keine Connect-Gebühren und zieht die Zahlungsgebühren direkt beim Anbieter ein ([Stripe Connect Preise](https://stripe.com/fr-us/connect/pricing)). Die App selbst hält nie Geld und speichert keine Karten- oder IBAN-Daten.

| ID | Anforderung |
| --- | --- |
| Z-01 | Zahlungsdienstleister: Stripe Connect, Direct Charges auf das verbundene Konto des Anbieters, Plattformgebühr (application fee) = 0. |
| Z-02 | Die Zahlungsanbindung liegt hinter einer Adapter-Schnittstelle, damit später z. B. Mollie Connect ergänzt werden kann. |
| Z-03 | Anbieter ohne verbundenes Konto können nur 0-€-Preise setzen. Für bezahlte Plätze durchläuft der Anbieter einmal das Stripe-Onboarding (Identität, IBAN) über einen von Stripe gehosteten Link. |
| Z-04 | Zahlarten: Kreditkarte (mit 3-D Secure) und SEPA-Lastschrift (mit Online-Mandat). Eingabe nur in Stripe-Elementen oder Stripe Checkout. |
| Z-05 | Bei der Anfrage hinterlegt der Mieter ein Zahlungsmittel; belastet wird erst bei Zusage. Die Stripe-Gebühr trägt der Anbieter: Der Mieter zahlt genau den angezeigten Preis, der Anbieter erhält ihn abzüglich Gebühr. Beim Festlegen des Preises und bei jeder Anfrage sieht der Anbieter seinen Betrag nach Gebühr (geschätzt). |
| Z-06 | Schlägt die Belastung bei Zusage fehl, hat der Mieter 12 h zum Nachholen; sonst wird die Buchung automatisch storniert und der Platz wieder frei. |
| Z-07 | SEPA: Die Buchung gilt ab Zusage. Status „Zahlung in Bearbeitung“ bis Stripe den Eingang bestätigt. Platzt die Lastschrift, werden Mieter, Anbieter und Admin benachrichtigt. |
| Z-08 | Jede Stornierung vor Beginn, durch Mieter oder Anbieter, löst automatisch die volle Rückerstattung an den Mieter aus. Erstattet Stripe die Zahlungsgebühr nicht, trägt sie der Anbieter. |
| Z-09 | Zahlungsstatus wird nur über signierte Stripe-Webhooks geändert (Signatur geprüft, idempotent verarbeitet). |
| Z-10 | Anbieter sehen Einnahmen je Buchung, Auszahlungsstatus und einen Jahresauszug (PDF, CSV). Mieter sehen Ausgaben und Belege. |
| Z-11 | 0-€-Buchungen laufen ohne Zahlungsschritt. |

## Vertrag, Benachrichtigungen, Sprache

| ID | Anforderung |
| --- | --- |
| V-01 | Der Admin hinterlegt eine Vorlage für den Stellplatz-Mietvertrag (Markdown mit Platzhaltern: Parteien, Platz, Zeitraum, Preis). |
| V-02 | Bei Zusage erzeugt das System daraus ein PDF, speichert es unveränderbar und schickt es beiden Parteien. |
| V-03 | Es gibt genau einen Standardvertrag für alle Plätze. Im Bezahlschritt muss der Mieter ihn bestätigen (nicht vorausgewählte Checkbox, Vertragstext mit seinen Buchungsdaten aufrufbar); ohne Bestätigung ist die Zahlung nicht möglich. Bei 0-€-Buchungen erfolgt die Bestätigung beim Absenden. Gespeichert werden Zeitpunkt und Vertragsversion. |
| N-01 | Benachrichtigung per E-Mail und Web-Push bei: neuer Anfrage, Zusage, Ablehnung, Ablauf, Stornierung, Zahlungsproblem, Beginn in 1 h, Ende in 30 min. |
| N-02 | Aus der Anfrage-Benachrichtigung kann der Anbieter mit einem Klick zusagen oder ablehnen (signierter, einmal gültiger Link mit erneuter Anmeldung, falls keine Sitzung besteht). |
| N-03 | Jeder Bewohner kann jeden Benachrichtigungstyp pro Kanal abschalten. |
| L-01 | Die gesamte Oberfläche, alle E-Mails und PDFs gibt es auf Deutsch und Englisch. Standard nach Browsersprache, umschaltbar, im Profil gespeichert. |
| L-02 | Keine fest verdrahteten Texte im Code; alle Texte in Sprachdateien. |
| D-01 | Telefonnummer und Zugangshinweise sieht das Gegenüber erst nach Zusage, und nur bis 7 Tage nach Buchungsende. |
| D-02 | Problem melden zu einer Buchung (Platz belegt, Überziehung, Schaden) mit Text und bis zu 3 Fotos; geht an Gegenüber und Admin, mit Zeitstempel gespeichert. |

## Admin-Bereich

| ID | Anforderung |
| --- | --- |
| A-01 | Bewohner anlegen, Einladung erneut senden, bearbeiten, sperren, entsperren, löschen. CSV-Import für die Erstbefüllung. |
| A-02 | Plätze anlegen, Eigentümer zuordnen und wechseln (z. B. bei Verkauf). |
| A-03 | Hallenplan (SVG) hochladen und Plan-Nummern prüfen: Plätze ohne Fläche im Plan und Flächen ohne Platz werden angezeigt. |
| A-04 | Alle Werte aus „Buchungshorizont und Zeitregeln“ einstellen. |
| A-05 | Vertragsvorlage, Impressum und Datenschutzerklärung pflegen (DE/EN). |
| A-06 | Übersicht aller Buchungen mit Filter (Zeitraum, Platz, Bewohner, Status) und CSV-Export. |
| A-07 | Problemmeldungen sehen und als erledigt markieren. |
| A-08 | Audit-Log aller sicherheits- und buchungsrelevanten Aktionen (Login, Rechteänderung, Freigabe, Zusage, Stornierung, Zahlungsereignis): wer, wann, was. Nur lesend, 2 Jahre aufbewahrt. |
| A-09 | Mindestens zwei Admin-Konten sind möglich; der letzte Admin kann sich nicht selbst die Rechte entziehen. |

## Betrieb auf Hetzner und Sicherheit

Die App läuft auf einem einzelnen Hetzner-Cloud-Server in Deutschland per Docker Compose und ist öffentlich über HTTPS erreichbar; Ziel ist OWASP ASVS Level 2.

### Betrieb

| ID | Anforderung |
| --- | --- |
| O-01 | Auslieferung als Docker Compose: App, PostgreSQL, Reverse Proxy (Caddy mit automatischem Let's-Encrypt-Zertifikat). Ein Befehl startet alles. |
| O-02 | Server-Standort Deutschland (Nürnberg oder Falkenstein). Auftragsverarbeitungsvertrag mit Hetzner und Stripe abschließen. |
| O-03 | Hetzner Cloud Firewall: eingehend nur 80, 443 und SSH (22, nur per Schlüssel, Passwort-Login aus). Datenbank nie öffentlich. |
| O-04 | Automatische Sicherheitsupdates des Betriebssystems; Container-Images versioniert und monatlich aktualisiert. |
| O-05 | Tägliches verschlüsseltes Datenbank-Backup auf einen zweiten Ort (z. B. Hetzner Storage Box), 30 Tage aufbewahrt; Wiederherstellung dokumentiert und einmal pro Quartal getestet. |
| O-06 | Konfiguration und Geheimnisse nur über eine `.env`-Datei, nie im Repository. |
| O-07 | Health-Check-Endpunkt und Uptime-Überwachung mit Alarm per E-Mail an den Admin. |
| O-08 | E-Mails über einen SMTP-Anbieter mit SPF, DKIM und DMARC für die eigene Domain. |

### Sicherheit

| ID | Anforderung |
| --- | --- |
| S-01 | Nur HTTPS (HSTS), sichere Header: Content-Security-Policy, X-Frame-Options, Referrer-Policy. |
| S-02 | Passwörter mit Argon2id gehasht. Sitzungscookies HttpOnly, Secure, SameSite=Lax; CSRF-Schutz für alle ändernden Anfragen. |
| S-03 | Rate-Limits: Login 5 Versuche / 15 min je Konto und IP, danach Sperre mit Ansteigen; Passwort-Reset 3 / h. |
| S-04 | Jede API-Anfrage prüft serverseitig Rolle und Besitz; kein Zugriff auf Daten anderer Bewohner über erratbare IDs (UUIDs + Rechteprüfung). |
| S-05 | Keine personenbezogenen Daten in URLs oder Logs; Logs 30 Tage. |
| S-06 | Abhängigkeiten werden automatisch auf Schwachstellen geprüft (z. B. Dependabot, `npm audit` im CI). |
| S-07 | Vor Livegang ein externer Sicherheitstest oder mindestens ein Scan mit OWASP ZAP; gefundene hohe Risiken werden behoben. |
| S-08 | DSGVO: Datenauskunft als Export je Bewohner, Löschkonzept, Datenschutzerklärung und Impressum erreichbar ohne Login. |

## Technik, Open Source, Abnahme

**Empfohlener Stack** (Abweichung nach Absprache): Next.js mit TypeScript, PostgreSQL mit Prisma, Auth.js, next-intl für DE/EN, Stripe-SDK, als installierbare Web-App (PWA). Kern-Datenmodell: User, ParkingSpot, AvailabilityRule, Booking, Payment, Contract, AuditLog.

| ID | Anforderung |
| --- | --- |
| Q-01 | Code öffentlich in einem Git-Repository unter der MIT-Lizenz. Keine Telemetrie. |
| Q-02 | README mit Installation auf einem frischen Hetzner-Server in unter 30 Minuten. |
| Q-03 | Mobil zuerst: alle Funktionen ab 360 px Breite; Barrierefreiheit nach WCAG 2.1 AA. |
| Q-04 | Automatisierte Tests für Horizont-, Preis-, Überschneidungs- und Regel-Logik (Unit) sowie den Ablauf Anfrage → Zusage → Zahlung → Stornierung (End-to-End, Stripe-Testmodus). |
| Q-05 | Seed-Daten: eine Anlage mit 10 Plätzen passend zu einem Beispiel-SVG, 1 Admin, 5 Bewohner. |

**Abnahme:** Alle Muss-Anforderungen sind nachweislich erfüllt (Testfall oder Vorführung), Q-04 läuft grün im CI, S-07 ohne offene hohe Risiken, und eine Probe-Buchung mit echter Karte und echter Lastschrift wurde bis zur Auszahlung aufs Girokonto durchgespielt.

## Rechtlicher Hinweis

Vor dem Livegang sind Vertragsvorlage, Datenschutzerklärung, Impressum und die Zustimmung der WEG zur Untervermietung rechtlich zu prüfen. Das ist nicht Teil der Umsetzung, muss aber beachtet werden.
