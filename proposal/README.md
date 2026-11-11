# EzPickle proposal template

A ready-to-send, 8-page A4 sales proposal for pitching EzPickle to a pickleball facility. It covers the features and includes screenshots of the app.

| File | What it is |
| --- | --- |
| `ezpickle-proposal.html` | The template. Edit this one. |
| `ezpickle-proposal-template.pdf` | PDF preview of the blank template, with placeholders highlighted. |
| `images/` | Screenshots (taken from demo data) and the logo used in the proposal. |
| `build-pdf.mjs` | Turns the HTML into a PDF. |

## Pages

1. **Cover**: client name, your name, date and reference number
2. **Executive summary**: the client's problems and how EzPickle solves them, key numbers, scope (courts, hours, rates)
3. **Features for players**: live booking and payments, mobile and QR check-in *(screenshots)*
4. **Open Play**: sessions and waitlist, auto-stacker *(screenshots)*
5. **For owners and staff**: dashboard and reports *(screenshots)*
6. **Full feature list** and why it's reliable
7. **Investment**: three packages, quotation table, rollout timeline
8. **Next steps**: what you need from the client, terms, contact details, signatures

## How to fill it in

1. Open `ezpickle-proposal.html` in a text editor and search for `fill`. Each yellow-highlighted `[...]` field needs replacing: facility name, contact, courts, prices, dates, terms.
2. Delete any package, pain point or line item you don't need.
3. Open the file in Chrome to check it.

## Export to PDF

From the repo root:

```bash
node proposal/build-pdf.mjs --final
```

This writes `proposal/ezpickle-proposal.pdf` with the yellow highlights removed. Without `--final` it rebuilds the preview with highlights left on.

You can also use Chrome → Print → Save as PDF, with paper size A4, margins **None** and **Background graphics** ticked.
