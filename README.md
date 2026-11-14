# Welingkar Purchase Analysis Portal

Eight interactive sections cover the four April-September 2026 purchase registers:

1. Overview with monthly and unit comparisons.
2. Spend analysis by unit, account, sub-account and goods/service classification.
3. Counterparty portfolio, concentration, monthly history, voucher drill-downs and identity-review groups.
4. Tax and TDS schedules with GST component, code and classification review.
5. Voucher reconciliation, including all 212 net exceptions and eight unvalued vouchers.
6. Data-quality findings and their supporting source rows.
7. All 2,632 detail rows and 2,339 internal vouchers, with search, pagination and CSV export.
8. The complete narrative analysis and the 68-page PDF report.

## Open immediately

Open `public/index.html` in a modern browser. The built application and reviewed data are embedded in this file. No Node installation, database, external API key or CDN is required to use the portal. The PDF is in `public/reports/`.

## Run a local web server

With Python 3.9 or newer, from this extracted folder:

```sh
python3 serve.py
```

On Windows you can use `py serve.py`. Open http://127.0.0.1:8080/ . Stop with Ctrl+C.

For a different local port:

```sh
python3 serve.py --port 8090
```

The server exposes only `public/`, blocks directory listings and makes no changes to the data.

## Docker

Copy `.env.example` to `.env`, choose a username and a strong password, then:

```sh
docker compose up --build -d
```

Open http://127.0.0.1:8080/ and sign in using those credentials. The default Docker port binds only to localhost. The image build needs access to the Python image registry; the running portal needs no external data service.

## Your own web host

Upload the **contents of `public/`** to the document root of an authenticated static web host, or put the included server behind your HTTPS reverse proxy. Do not upload the entire project root as a public document root. For access beyond localhost, set `PORTAL_USERNAME` and `PORTAL_PASSWORD` before starting `serve.py --host 0.0.0.0`. Use HTTPS at the reverse proxy because Basic authentication by itself does not encrypt the connection.

The portal contains institution financial data. Keep the hosted files behind your organisation's authentication. This package does not contain a multiuser account database or organisation-wide saved review decisions.

## Using the portal

- Each tab has independent unit and posting-date selections. Use Reset view to restore its authored filters.
- Spend analysis also filters account head and goods/service classification.
- Search within a table to narrow its records. CSV downloads include the entire searched and filtered result, not only the visible page.
- Select a voucher row to inspect all original detail lines, amounts, source workbook, Excel rows and relevant narration.
- Counterparty selection opens the party's history and original vouchers.
- Quality findings open their supporting original rows; findings overlap and have explicit counting grains.
- Browser-local presentation edits and selections stay in that browser. ChatGPT-specific collaboration, Ask and publication controls require their supported ChatGPT host and are not a replacement for your own authentication.

## Financial scope

The combined source contains INR 279,999,103.9312 in **recorded gross detail**. This is not independently reconciled supplier-bill value, cash paid or accounts payable. TDS is signed. Eight vouchers have no amounts and remain unvalued. Department is blank throughout. GST-label semantics, source-code validity and legal treatment have not been established by this export.

The snapshot is fixed to the four supplied Excel files; there is no live ERP connection or new-file upload workflow. Original workbooks have not been modified. Counterparty tax identifiers are masked and contact/payment references are omitted from narration. Supplier bill references and source row numbers remain available.

## Package contents

- `public/index.html`: complete ready-to-host interactive portal.
- `public/reports/`: detailed PDF report.
- `serve.py`: optional Python server, including environment-based Basic authentication.
- `Dockerfile`, `compose.yaml`, `.env.example`: optional container deployment.
- `source/content/`: authored React components, calculation functions and report sections.
- `source/reviewed-data.json`: exact reviewed portal snapshot for inspection and future development.
- `source/theme.css`: theme tokens.
- `verification.json`: checked source totals, record counts and artifact hashes.

The source files document the authored content and calculations. The supported Data runtime is bundled into `public/index.html`; the source folder is not advertised as a separate npm/Vite application. Self-hosting the ready-built public folder needs no build step.
