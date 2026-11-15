# Testing guide

This guide gets the app running on your machine with realistic test data, simulated payments and a local mail inbox, so you can click through every flow and send feedback.

## 1. Start the test environment

You only need Docker Desktop.

```bash
docker compose -f compose.test.yml up --build
```

The first build takes a few minutes. When the log shows `Ready`, open:

| What | URL |
| --- | --- |
| The app | http://localhost:3000 |
| Mailpit, the inbox with every e-mail the app sends (with PDF attachments) | http://localhost:8025 |

Stop with `Ctrl+C`. To reset all data to the seed state at any time:

```bash
docker compose -f compose.test.yml run --rm setup
```

Test mode is visible through a yellow banner. Payments are simulated and nothing is charged.

## 2. Test accounts

The password for every account is `Stellplatz-Test-2026!`.

On the login page, test mode also shows **one-click login buttons** for every account. They skip the password and 2FA, so you can switch roles quickly.

| Account | Role | Owns | Notes |
| --- | --- | --- | --- |
| admin@example.org | Admin (Verena Verwaltung) | – | 2FA is mandatory, see below |
| anna@example.org | Resident (Anna Bauer) | 501, 502 | Payout account connected, paid spots |
| ben@example.org | Resident (Ben Schmidt) | 503, 504 | Payout account connected, **English UI** |
| clara@example.org | Resident (Clara Weber) | 505, 525 | No payout account, free spots |
| david@example.org | Resident (David Müller) | 526–529 | No payout account; 527 paused; currently renting 503 |
| emma@example.org | Resident (Emma Fischer) | – | Pure tenant |
| neu@example.org | Invited, not yet active | – | Use "Einladung erneut senden" as admin, then open the link from Mailpit |

**Admin 2FA via the normal login form:** add the secret `JBSWY3DPEHPK3PXPJBSWY3DP` to any authenticator app (Aegis, Google Authenticator, 1Password …). If you have Node installed, `npm run dev:totp` prints the current code instead.

### What the seed data contains

| Spot | Release rule | Price | Confirmation |
| --- | --- | --- | --- |
| 501 | Mon–Fri 08:00–18:00 | €2/h, €12/day | manual |
| 502 | always (blocked in 3 days) | €1.50/h, €10/day | instant up to 4 h |
| 503 | always, with wallbox | €2/h, €15/day | instant up to 1 day |
| 504 | every weekend | €1/h, €8/day | manual |
| 505 | always | free | instant up to 365 days |
| 525 | the next 7 days | free | manual |
| 526 | Mon–Fri overnight 18:00–08:00 | free | manual |
| 527 | always, but paused | free | manual |
| 528, 529 | no releases | – | – |

The garage is the real one: level UG -1 with spots 501–524 and level UG -2 with spots 525–564. The 54 spots not listed above have no owner yet and show as occupied.

Bookings already present: Emma has 502 tomorrow 10–12 (paid). Ben has an open request for 502 tomorrow 13–19, waiting for Anna. David's 503 booking is running now. Emma's 505 booking from yesterday is completed. Clara's 503 booking was cancelled by Ben.

## 3. Test tools (menu "Testwerkzeuge")

- **Simulated payment page:** for paid requests you are sent to a page that imitates Stripe. Choose a test card that succeeds, one that is declined when charged, or a SEPA direct debit.
- **Clock:** move the app clock forward by 1 h to 72 h. Use it to test request expiry, reminders ("starts in 1 h", "ends in 30 min") and the 12-hour payment deadline. "Echte Zeit" resets it.
- **SEPA:** direct debits that are still processing can be marked as received or bounced.
- **Background jobs:** run expiry, auto-cancellation and reminders immediately instead of waiting a minute.
- **Sent e-mails:** a short list of recent mails. Mailpit shows the full mails with attachments.

## 4. Suggested test scenarios

Requirement IDs refer to the specification.

**Search and booking**

1. As Emma, pick a period on the start page and switch between garage map and list (K-02, K-04). Tap a green spot.
2. Request 503 for 3 hours. It is confirmed instantly and you pay with the succeeding test card (B-02, Z-05).
3. Request 503 for 2 days. The request waits for Ben. Log in as Ben, look at "Meine Buchungen → Als Anbieter" and confirm (B-03). Check the contract PDF in Mailpit (V-02).
4. Watch the tier hint while changing dates. Try a start too far ahead, a 5-week booking, or a time that is not on a 15-minute step (T-01 to T-14).
5. Cancel a confirmed booking as tenant (B-06), and as owner with a reason (B-07). Check the refund status.
6. Book with the declined card, then pay again within the deadline (Z-06). Repeat, move the clock 13 h forward and see the automatic cancellation.
7. Book with SEPA, then bounce it in the test tools (Z-07). Tenant, owner and admin get a mail.
8. As David, extend the running 503 booking (B-09).
9. Report a problem with a photo (D-02). As admin, mark it resolved (A-07).

**Offering a spot (as Anna, Clara or David)**

1. "Meine Plätze → Verwalten": change prices, switch instant booking and its threshold, shorten the horizon (P-03, P-07, T-05).
2. Add rules: weekly, every weekend, always, one-off (P-04, P-05).
3. Add a block that overlaps a confirmed booking. You must cancel it explicitly with a reason (P-06, P-09).
4. Pause the spot and see the list of bookings that stay valid (P-08).
5. As David, connect the simulated payout account under "Einnahmen & Ausgaben", then set a price (Z-03).
6. Download the annual statement as PDF and CSV (Z-10).

**Account and admin**

1. Profile: change name, phone and language; switch notifications per type and channel; log out other sessions; export your data; request deletion (R-07, R-08, N-03, S-08, R-09).
2. As admin: create a resident and accept the invitation from Mailpit (R-02); import residents via CSV; lock an account while it is logged in elsewhere (R-06).
3. As admin, open "Hallenplan": both levels (UG -1, UG -2) are there. Upload a single level such as `docs/plans/ug-1.svg` with its level name (or the Draw.io drawing with all levels, if you have it; it is not part of the repository), and check the plan report. Delete a spot under "Plätze" and recreate it from the plan with "fehlende Plätze anlegen" (K-01, A-02, A-03).
4. As admin: change the time rules (A-04), edit the contract template (V-01), filter and export bookings (A-06), read the audit log (A-08).
5. Try 6 wrong passwords in a row for one account and see the lockout (S-03). That account stays locked from your machine for 15 minutes; resetting the data clears it.
6. Open the app on your phone, or narrow the browser to 360 px (Q-03, K-05).

## 5. Automated tests

```bash
npm install
npm test                       # unit tests: horizon, prices, overlaps, rules, SVG, translations
npx playwright install chromium
E2E_SKIP_SEED=1 npm run test:e2e   # against the running Docker test environment
docker compose -f compose.test.yml run --rm setup   # reset the data afterwards
```

`npm run test:e2e` without `E2E_SKIP_SEED=1` reseeds through your local `.env` database instead.

## 6. Giving feedback

Short notes are fine. For each point, it helps to include:

- the account you used and the page, ideally the URL;
- what you did, what you expected, and what happened;
- a screenshot for anything visual;
- the requirement ID, if it relates to one.

Feedback about wording, flows that feel clumsy, or requirements that should behave differently is just as useful as bug reports.

## 7. Known limits of the test environment

- Payments run through the simulator. The Stripe Connect adapter is implemented but has not run against a real Stripe test account yet, because that needs your Stripe keys. See the requirements status for details.
- Web push needs VAPID keys and HTTPS (or localhost) and is not configured in the test environment. All notifications are visible as e-mails.
- The leaked-password check is switched off in test mode, so the seed password works offline.
