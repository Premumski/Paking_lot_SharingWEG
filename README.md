# Stellplatz-Sharing

Kostenlose Open-Source-Web-App, mit der Bewohner einer Wohnanlage ihre Tiefgaragenplätze zeitweise untereinander teilen. Bezahlt wird per Kreditkarte oder SEPA-Lastschrift über Stripe Connect, ausgezahlt direkt aufs Girokonto des Anbieters. Keine Plattformgebühr, keine Telemetrie, selbst gehostet per Docker Compose.

- Anforderungen: [Stellplatz-Sharing – Anforderungsspezifikation.md](Stellplatz-Sharing%20–%20Anforderungsspezifikation.md)
- Umsetzungsstand je Anforderungs-ID: [docs/ANFORDERUNGEN-STATUS.md](docs/ANFORDERUNGEN-STATUS.md)
- Lokal ausprobieren und testen: [TESTING.md](TESTING.md)
- Lizenz: [MIT](LICENSE)

## Technik

| Bereich | Umsetzung |
| --- | --- |
| Web-App | Next.js 15 (App Router, Server Actions), TypeScript, Tailwind CSS 4, installierbare PWA |
| Datenbank | PostgreSQL 16 mit Prisma 6; Überschneidungsschutz als Exclusion-Constraint |
| Anmeldung | Eigene Sitzungsverwaltung (DB-Sitzungen, Argon2id, TOTP), siehe „Abweichungen“ |
| Sprachen | next-intl, alle Texte in `messages/de/*.json` und `messages/en/*.json` |
| Zahlung | Adapter-Schnittstelle (`src/lib/payments`), Stripe Connect und ein Test-Simulator |
| PDF | pdfkit (Mietvertrag, Beleg, Jahresauszug) |
| Betrieb | Docker Compose: App, PostgreSQL, Caddy mit Let's Encrypt |

Wichtige Verzeichnisse:

```
src/lib/domain/      Reine Logik: Zeitzone, Preis, Freigaberegeln, Buchungshorizont (Unit-Tests)
src/lib/booking/     Anfrage, Zusage, Stornierung, Verlängerung, Kollisionen
src/lib/payments/    Zahlungsadapter (Stripe, Mock) und Webhook-Verarbeitung
src/app/             Seiten, Server Actions und API-Routen
prisma/              Schema, Migrationen (inkl. Constraints und Triggern), Seed-Daten
ops/                 Caddyfile, Backup/Restore, Server-Einrichtung
tests/               Unit-, Integrations- und End-to-End-Tests
```

## Installation auf einem frischen Hetzner-Server (ca. 20–30 Minuten)

**Voraussetzungen:** eine Domain, ein SMTP-Konto mit SPF, DKIM und DMARC für die Domain, ein Stripe-Konto mit aktiviertem Connect.

### 1. Server anlegen (5 Minuten)

1. Hetzner Cloud Console: Projekt anlegen, Server **CX22** (oder größer) mit **Ubuntu 24.04**, Standort **Nürnberg** oder **Falkenstein**, eigenen SSH-Schlüssel hinterlegen.
2. **Firewall** anlegen und dem Server zuweisen: eingehend nur TCP 22, TCP 80, TCP 443 und UDP 443.
3. Bei der Domain einen A-Eintrag (und ggf. AAAA) auf die Server-IP setzen, z. B. `parken.example.org`.

### 2. Server vorbereiten (5 Minuten)

```bash
ssh root@<server-ip>
git clone https://github.com/<euer-konto>/stellplatz-sharing.git /opt/stellplatz
cd /opt/stellplatz
./ops/server-setup.sh   # Sicherheitsupdates, SSH nur mit Schlüssel, Docker, Log-Aufbewahrung 30 Tage
```

### 3. Konfigurieren (10 Minuten)

```bash
cp .env.example .env
openssl rand -hex 32     # Wert für SESSION_SECRET
openssl rand -hex 24     # Wert für POSTGRES_PASSWORD
docker run --rm node:24-alpine npx -y web-push generate-vapid-keys   # VAPID-Schlüssel für Web-Push
nano .env
```

Stripe einrichten:

1. Im Stripe-Dashboard unter **Connect** das Modell „Stripe handles pricing“ wählen (verbundene Konten zahlen die Gebühren selbst, keine Connect-Gebühren für die Plattform).
2. Unter **Entwickler → Webhooks** einen Endpunkt für **verbundene Konten** anlegen: `https://<DOMAIN>/api/webhooks/stripe` mit den Ereignissen `checkout.session.completed`, `payment_intent.processing`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` und `account.updated`.
3. `STRIPE_SECRET_KEY` und das Signing-Secret als `STRIPE_WEBHOOK_SECRET` in `.env` eintragen.

### 4. Starten (5 Minuten)

```bash
docker compose up -d --build
docker compose ps                     # alle Dienste "healthy"
curl https://<DOMAIN>/api/health      # {"status":"ok"}
```

Das erste Admin-Konto anlegen (danach Einladungslink aus der E-Mail öffnen; die Zwei-Faktor-Anmeldung wird beim ersten Login eingerichtet):

```bash
docker compose run --rm migrate npx tsx scripts/create-admin.ts "Vorname Nachname" admin@example.org "Verwaltung"
```

Danach im Admin-Bereich: Vertragsvorlage, Impressum und Datenschutzerklärung pflegen, Hallenplan hochladen, Plätze anlegen und Bewohner einladen (einzeln oder per CSV).

**Hallenplan:** Unter „Hallenplan“ entweder die Draw.io-Zeichnung `Lageplan.drawio` hochladen (legt beide Ebenen UG -1 und UG -2 an; die Datei enthält auch die Elektroplanung und liegt deshalb nicht im Repository) oder je Ebene ein SVG aus `docs/plans/`. Danach „fehlende Plätze anlegen“ klicken: Die App legt alle 64 Plätze ohne Eigentümer an, die Eigentümer werden unter „Plätze“ zugeordnet. Ändert sich die Zeichnung, die Datei einfach erneut hochladen; `npm run plan:build` aktualisiert zusätzlich die SVGs in `docs/plans/`, die der Seed verwendet. Welche Layer und Formen der Konverter auswertet, steht in `src/lib/drawio.ts`; ein minimales SVG-Beispiel für andere Anlagen liegt in `docs/example-garage.svg`.

### Backups (O-05)

In `.env` ergänzen: `BACKUP_PASSPHRASE=<langes Passwort>` und `BACKUP_TARGET=u123456@u123456.your-storagebox.de`. Den SSH-Schlüssel des Servers in der Storage Box hinterlegen. Dann:

```bash
crontab -e
15 3 * * * /opt/stellplatz/ops/backup.sh >> /var/log/stellplatz-backup.log 2>&1
```

Wiederherstellung: `ops/restore.sh backups/<datei>.sql.gz.gpg`. Einmal pro Quartal auf einem zweiten, temporären Server testen und das Datum dokumentieren.

### Updates (O-04)

```bash
cd /opt/stellplatz && git pull && docker compose up -d --build
```

Dependabot öffnet Pull-Requests für npm-Pakete (wöchentlich) und Container-Images (monatlich).

### Überwachung (O-07)

`https://<DOMAIN>/api/health` liefert `200`, solange App und Datenbank laufen. Diesen Endpunkt bei einem externen Monitor eintragen (z. B. Uptime Kuma auf einem anderen Rechner, healthchecks.io oder UptimeRobot) und als Alarm die E-Mail-Adresse der Verwaltung hinterlegen. Ein Monitor auf demselben Server würde einen Serverausfall nicht melden.

## Entwicklung

```bash
npm install
docker run -d --name parking-dev-db -e POSTGRES_USER=parking -e POSTGRES_PASSWORD=parking -e POSTGRES_DB=parking -p 5433:5432 postgres:16-alpine
docker run -d --name parking-dev-mail -p 8025:8025 -p 1025:1025 axllent/mailpit:v1.27
cp .env.dev.example .env
npx prisma migrate dev
npm run db:seed
npm run dev
```

| Befehl | Zweck |
| --- | --- |
| `npm test` | Unit-Tests; mit `TEST_DATABASE_URL` zusätzlich die Datenbank-Integrationstests |
| `npm run test:e2e` | End-to-End-Tests gegen eine laufende App (**setzt die Datenbank per Seed zurück**) |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run i18n:check` | Prüft, dass jeder im Code verwendete Text in Deutsch und Englisch existiert |
| `npm run dev:totp` | Aktueller 2FA-Code des Seed-Admins |
| `npm run plan:build` | Erzeugt aus `Lageplan.drawio` (lokal im Projektordner, nicht im Repository) die SVG-Pläne je Ebene in `docs/plans/` |

## Abweichungen vom empfohlenen Stack

- **Anmeldung ohne Auth.js:** Gefordert sind DB-Sitzungen, die man einsehen und einzeln beenden kann (R-07), sofortiges Beenden beim Sperren (R-06) und TOTP-Pflicht für Admins (R-04). Mit dem Credentials-Provider von Auth.js geht das nur über JWT-Sitzungen, die sich nicht serverseitig widerrufen lassen. Deshalb gibt es eine kleine eigene Sitzungsverwaltung in `src/lib/auth.ts`.
- **Next.js 15.5 statt 16** und **Prisma 6 statt 7**, weil beides stabil und gut dokumentiert ist. Ein Upgrade ist später möglich.
- **Freigabe-Zeitfenster** (T-13) werden bei jeder Abfrage bis zur längsten Stufe berechnet statt einmal täglich gespeichert. Das Ergebnis ist dasselbe, ist aber immer aktuell.

## Rechtlicher Hinweis

Vertragsvorlage, Datenschutzerklärung und Impressum in den Seed-Daten sind Platzhalter. Vor dem Livegang müssen sie und die Zustimmung der WEG zur Untervermietung rechtlich geprüft werden.
