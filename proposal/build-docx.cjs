// Builds proposal/ezpickle-proposal.docx, an editable Word version of the proposal.
//   node proposal/build-docx.cjs
// Placeholders like [Facility Name] are highlighted yellow in Word. Replace them,
// then select all and set highlight to "No Color" before sending.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat, LineRuleType,
  Header, Footer, PageNumber, TabStopType, VerticalAlign, HeadingLevel,
} = require("docx");

const dir = __dirname;
const img = (f) => fs.readFileSync(path.join(dir, "images", f));

const GREEN = "6FCF2B";
const GREEN_DARK = "3F7A17";
const TINT = "F0FCE9";
const SOFT = "F5F8F0";
const LINE = "E3E8DC";
const MUTED = "5B6455";
const INK = "0A0A0A";
const FONT = "Arial";

const CONTENT_W = 9866; // A4 width 11906 - 2 * 1020 margins (DXA)
const IMG_W = 560; // px
const IMG_H = 350;

// Text with [placeholders] highlighted yellow.
function runs(text, o = {}) {
  return text.split(/(\[[^\]]+\])/).filter(Boolean).map((part) =>
    new TextRun({
      text: part, font: FONT, ...o,
      ...(part.startsWith("[") ? { highlight: "yellow" } : {}),
    }));
}
const p = (text, o = {}, po = {}) =>
  new Paragraph({ children: runs(text, { size: 21, color: "1D2318", ...o }), spacing: { after: 120, line: 288, lineRule: LineRuleType.AUTO }, ...po });
const muted = (text, po = {}) => p(text, { color: MUTED }, po);
const eyebrow = (text, newPage = false) => new Paragraph({
  pageBreakBefore: newPage,
  children: [new TextRun({ text: text.toUpperCase(), font: FONT, bold: true, size: 16, color: GREEN_DARK, characterSpacing: 40 })],
  spacing: { before: 0, after: 80 },
});
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(text) });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(text) });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs(text) });
const bullet = (text, ref = "check") => new Paragraph({
  numbering: { reference: ref, level: 0 },
  children: runs(text, { size: 20 }), spacing: { after: 60, line: 264, lineRule: LineRuleType.AUTO },
});
const bulletRich = (bold, rest) => new Paragraph({
  numbering: { reference: "check", level: 0 },
  children: [new TextRun({ text: bold, font: FONT, bold: true, size: 20 }), ...runs(rest, { size: 20 })],
  spacing: { after: 60, line: 264, lineRule: LineRuleType.AUTO },
});
const tags = (...t) => new Paragraph({
  spacing: { before: 120, after: 40 },
  children: t.flatMap((x, i) => [
    ...(i ? [new TextRun({ text: "  ", font: FONT, size: 15 })] : []),
    new TextRun({ text: ` ${x.toUpperCase()} `, font: FONT, bold: true, size: 15, color: GREEN_DARK, shading: { type: ShadingType.CLEAR, fill: TINT, color: "auto" } }),
  ]),
});
const shot = (file, w = IMG_W, h = Math.round(IMG_W * 1000 / 1600), alt = file) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 },
  children: [new ImageRun({ type: "jpg", data: img(file), transformation: { width: w, height: h }, altText: { title: alt, description: alt, name: alt } })],
});
const spacer = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const lineBorders = (color = LINE) => {
  const b = { style: BorderStyle.SINGLE, size: 6, color };
  return { top: b, bottom: b, left: b, right: b };
};
const cellMargins = { top: 140, bottom: 140, left: 200, right: 200 };

// Grid of "cards" (a table with spacing columns removed; borders per cell).
function cards(columns, { fills = [], borders = [] } = {}) {
  const n = columns.length;
  const gap = 240;
  const w = Math.floor((CONTENT_W - gap * (n - 1)) / n);
  const widths = [];
  const cells = [];
  columns.forEach((children, i) => {
    if (i) { widths.push(gap); cells.push(new TableCell({ width: { size: gap, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph("")] })); }
    widths.push(w);
    cells.push(new TableCell({
      width: { size: w, type: WidthType.DXA },
      borders: borders[i] || lineBorders(),
      shading: fills[i] ? { type: ShadingType.CLEAR, fill: fills[i], color: "auto" } : undefined,
      margins: cellMargins,
      children,
    }));
  });
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows: [new TableRow({ children: cells })] });
}

// Simple data table. cols = [{ label, width, align }]
function dataTable(cols, rows, { totalRow = false } = {}) {
  const head = new TableRow({
    tableHeader: true,
    children: cols.map((c) => new TableCell({
      width: { size: c.width, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: SOFT, color: "auto" },
      borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE } },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      children: [new Paragraph({ alignment: c.align, children: [new TextRun({ text: c.label.toUpperCase(), font: FONT, bold: true, size: 15, color: MUTED })] })],
    })),
  });
  const body = rows.map((r, ri) => {
    const isTotal = totalRow && ri === rows.length - 1;
    return new TableRow({
      children: r.map((val, ci) => new TableCell({
        width: { size: cols[ci].width, type: WidthType.DXA },
        borders: {
          ...noBorders,
          top: isTotal ? { style: BorderStyle.SINGLE, size: 12, color: INK } : noBorder,
          bottom: isTotal ? noBorder : { style: BorderStyle.SINGLE, size: 6, color: LINE },
        },
        margins: { top: 80, bottom: 80, left: 140, right: 140 },
        children: [new Paragraph({ alignment: cols[ci].align, children: runs(val, { size: 19, bold: isTotal }) })],
      })),
    });
  });
  return new Table({ width: { size: cols.reduce((a, c) => a + c.width, 0), type: WidthType.DXA }, columnWidths: cols.map((c) => c.width), rows: [head, ...body] });
}

const stat = (big, small) => [
  new Paragraph({ children: [new TextRun({ text: big, font: FONT, bold: true, size: 32, color: GREEN_DARK })], spacing: { after: 40 } }),
  new Paragraph({ children: [new TextRun({ text: small, font: FONT, size: 16, color: MUTED })] }),
];

const pkg = (name, price, per, items, best = false) => [
  ...(best ? [new Paragraph({ children: [new TextRun({ text: " RECOMMENDED ", font: FONT, bold: true, size: 14, color: INK, shading: { type: ShadingType.CLEAR, fill: GREEN, color: "auto" } })], spacing: { after: 80 } })] : []),
  new Paragraph({ children: [new TextRun({ text: name, font: FONT, bold: true, size: 24 })], spacing: { after: 60 } }),
  new Paragraph({ children: runs(price, { bold: true, size: 32 }), spacing: { after: 20 } }),
  new Paragraph({ children: runs(per, { size: 16, color: MUTED }), spacing: { after: 120 } }),
  ...items.map((i) => bullet(i)),
];

// ---------------- Content ----------------
const cover = [
  new Paragraph({ children: [new ImageRun({ type: "png", data: img("logo.png"), transformation: { width: 130, height: 130 }, altText: { title: "EzPickle", description: "EzPickle logo", name: "logo" } })], spacing: { after: 360 } }),
  eyebrow("Business proposal"),
  new Paragraph({ children: runs("A complete booking & facility system for [Facility Name]", { bold: true, size: 52, color: INK }), spacing: { before: 60, after: 240, line: 252, lineRule: LineRuleType.AUTO } }),
  p("Live court availability, GCash / Maya payments, QR check-in, self-organizing Open Play and a full back office, in one platform built for pickleball in the Philippines.", { size: 24, color: MUTED }),
  shot("1-homepage.jpg", IMG_W, IMG_H, "EzPickle homepage"),
  spacer(240),
  cards([
    [p("PREPARED FOR", { size: 15, bold: true, color: MUTED }), p("[Client name, position]", { bold: true })],
    [p("PREPARED BY", { size: 15, bold: true, color: MUTED }), p("[Your name], EzPickle", { bold: true })],
    [p("DATE · REF", { size: 15, bold: true, color: MUTED }), p("[11 Nov 2026] · [EZP-2026-001]", { bold: true })],
  ], { fills: [SOFT, SOFT, SOFT], borders: [noBorders, noBorders, noBorders] }),
];

const summary = [
  eyebrow("Executive summary"),
  h1("Fewer Messenger replies. Fuller courts. Cleaner books."),
  p("Thank you for the opportunity to work with [Facility Name]. This proposal outlines how EzPickle will run your court bookings, payments, Open Play and front desk from one system, starting [target go-live date].", { size: 23, color: MUTED }),
  spacer(80),
  cards([
    [h3("What we heard"),
      bullet("Bookings come in through Messenger, calls and walk-ins, and staff confirm each slot by hand."),
      bullet("Double-bookings and “available pa po ba?” back-and-forth cost time and customers."),
      bullet("Payments are checked manually against screenshots."),
      bullet("Open Play groups are sorted on paper and some players wait too long."),
      bullet("[Add a pain point specific to this client, or delete]")],
    [h3("What EzPickle changes"),
      bullet("Customers see live availability and book in under 60 seconds, 24/7."),
      bullet("Double-booking is blocked at the database level, not just on screen."),
      bullet("Payment is collected up front via PayMongo: GCash, Maya, GrabPay, QR Ph and cards."),
      bullet("The auto-stacker builds skill-balanced Open Play courts in one click."),
      bullet("You see revenue, bookings, utilization and stock on one dashboard.")],
  ], { fills: [null, TINT], borders: [lineBorders(), lineBorders("CDEEB2")] }),
  spacer(200),
  cards([
    stat("< 60s", "to book and pay for a court"),
    stat("0", "double-bookings, enforced by the database"),
    stat("5", "payment methods via PayMongo"),
    stat("24/7", "online booking, no staff needed"),
  ], { fills: [SOFT, SOFT, SOFT, SOFT], borders: [noBorders, noBorders, noBorders, noBorders] }),
  spacer(200),
  h3("Scope for [Facility Name]"),
  dataTable(
    [{ label: "Item", width: 3000 }, { label: "Details", width: CONTENT_W - 3000 }],
    [
      ["Courts", "[4] courts · [indoor / outdoor]"],
      ["Operating hours", "[6:00 AM – 11:00 PM daily]"],
      ["Court rates", "[₱500–₱700/hr, peak and off-peak]"],
      ["Staff accounts", "[1 owner, 2 managers, 4 front desk]"],
      ["Domain", "[book.yourfacility.ph]"],
    ]),
];

const players = [
  eyebrow("Feature highlights", true),
  h1("What your players get"),
  shot("2-live-booking.jpg", IMG_W, IMG_H, "Live court availability and booking flow"),
  tags("Booking", "Payments"),
  h2("Live availability and a 5-step booking flow"),
  p("Players pick a date, court and time on a grid that updates in real time as others book. Their slot is held for 15 minutes while they pay with GCash, Maya, GrabPay, QR Ph or card through PayMongo’s secure checkout. Peak and off-peak rates are priced automatically, even across a booking that spans both."),
  spacer(160),
  (() => {
    const left = 3300, gap = 300, right = CONTENT_W - left - gap;
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [left, gap, right],
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: left, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER,
          children: [shot("7-mobile.jpg", 190, 323, "EzPickle on mobile")] }),
        new TableCell({ width: { size: gap, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph("")] }),
        new TableCell({ width: { size: right, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER, children: [
          tags("Mobile", "QR check-in"),
          h2("Made for phones, with QR check-in"),
          p("Most bookings happen on a phone, so every screen is designed mobile-first. No app to download."),
          bullet("Booking confirmation by email with a signed QR code."),
          bullet("Front desk scans it with a phone camera or handheld scanner."),
          bullet("Customer dashboard with upcoming bookings, payment history and profile."),
          bullet("Promo codes for launches, loyal players and partners."),
        ] }),
      ] })],
    });
  })(),
];

const openPlay = [
  eyebrow("Feature highlights", true),
  h1("Open Play that sorts itself out"),
  shot("3-open-play.jpg", IMG_W, IMG_H, "Open Play sessions"),
  tags("Open Play"),
  h2("Join solo, with a waitlist when it’s full"),
  p("Players browse sessions by skill level, join and pay as individuals, and are added to a waitlist automatically when the session fills. When someone drops out, the next player is promoted."),
  spacer(160),
  shot("4-auto-stacker.jpg", IMG_W, IMG_H, "Open Play auto-stacker"),
  tags("Staff tool"),
  h2("One-click, skill-balanced court stacking"),
  p("The auto-stacker groups players by rating and avoids repeating the same pairings across rounds. Courts never go over capacity, leftovers go to a clearly marked bench, and staff can move anyone by hand afterwards."),
];

const owners = [
  eyebrow("Feature highlights", true),
  h1("Run the whole facility from one place"),
  shot("5-admin-dashboard.jpg", IMG_W, IMG_H, "Owner dashboard"),
  tags("Dashboard"),
  h2("Today at a glance"),
  p("Revenue, bookings, court utilization, active Open Play, pending payments and low-stock alerts the moment you sign in, plus the next bookings coming up."),
  spacer(160),
  shot("6-reports.jpg", IMG_W, IMG_H, "Sales reports"),
  tags("Reports", "CSV export"),
  h2("Sales, utilization and inventory reports"),
  p("Break revenue down by category, payment method and court. Every report exports to CSV for your accountant."),
];

const features = [
  eyebrow("Everything included", true),
  h1("Full feature list"),
  cards([
    [h3("Customer side"),
      ...[
        "Homepage with facility slideshow, court cards, pricing and Open Play preview",
        "Live availability grid, updating as other people book",
        "Five-step booking: date → court → time → details → payment",
        "PayMongo checkout: GCash, Maya, GrabPay, QR Ph, cards",
        "Booking confirmation email with a signed QR code",
        "Customer dashboard: bookings, payment history, profile",
        "Open Play: join solo, waitlist, see your stack",
      ].map((t) => bullet(t))],
    [h3("Staff & owner side"),
      ...[
        "Dashboard: revenue, bookings, utilization, pending payments, low stock",
        "Calendar: day grid, week and month views",
        "Walk-ins, rescheduling, cancellations and refunds",
        "QR check-in by camera or handheld scanner",
        "Courts, peak/off-peak pricing rules, maintenance blocks",
        "Open Play sessions with auto-stacker and manual overrides",
        "Inventory with movement ledger and counter sales",
        "Sales, utilization and inventory reports (CSV)",
        "Staff roles, promo codes, media manager, audit log",
      ].map((t) => bullet(t))],
  ]),
  spacer(240),
  h1("Built to be trusted with your money"),
  cards([
    [h3("No double-bookings, ever"),
      muted("Overlaps are blocked in three layers, ending with a database rule that no bug, second device or staff mistake can get around."),
      h3("Accurate to the centavo"),
      muted("All amounts are stored as whole centavos and all times in Asia/Manila, so totals and reports always match.")],
    [h3("Secure payments"),
      muted("Card and e-wallet details never touch our servers. PayMongo handles them, and every payment notification is signature-verified."),
      h3("Role-based access and audit log"),
      muted("Front desk, managers and owners each see only what they need, and every sensitive change is recorded.")],
  ], { borders: [noBorders, noBorders] }),
];

const investment = [
  eyebrow("Investment", true),
  h1("Packages"),
  muted("Edit or remove packages to suit this client. Prices exclude PayMongo transaction fees, which are charged by PayMongo directly."),
  spacer(80),
  cards([
    pkg("Starter", "₱[0,000]", "per month · up to [2] courts", ["Online booking & payments", "QR check-in", "Dashboard & calendar", "Email support"]),
    pkg("Club", "₱[0,000]", "per month · up to [6] courts", ["Everything in Starter", "Open Play & auto-stacker", "Inventory & counter sales", "Reports & promo codes", "Priority support"], true),
    pkg("Pro", "₱[0,000]", "per month · unlimited courts", ["Everything in Club", "Custom domain & branding", "Multi-location ready", "On-site staff training"]),
  ], { borders: [lineBorders(), lineBorders(GREEN), lineBorders()] }),
  spacer(200),
  h3("Quotation"),
  dataTable(
    [{ label: "Item", width: 6266 }, { label: "Qty", width: 1200, align: AlignmentType.RIGHT }, { label: "Amount", width: 2400, align: AlignmentType.RIGHT }],
    [
      ["One-time setup & data migration", "1", "₱[0,000]"],
      ["[Club] plan, first [12] months", "[12]", "₱[0,000]"],
      ["Staff training ([2] sessions)", "[2]", "₱[0,000]"],
      ["Discount [launch partner, remove if none]", "", "−₱[0,000]"],
      ["Total", "", "₱[00,000]"],
    ], { totalRow: true }),
  spacer(200),
  eyebrow("Timeline"),
  dataTable(
    [{ label: "When", width: 2000 }, { label: "Milestone", width: CONTENT_W - 2000 }],
    [
      ["Week 1", "Kick-off & setup. Courts, rates, hours, branding and staff accounts configured. PayMongo account connected."],
      ["Week 2", "Data & testing. Existing bookings and products imported. Test bookings and payments run end to end."],
      ["Week 3", "Training & soft launch. Front desk trained on check-in, walk-ins and Open Play. Regulars invited first."],
      ["[Go-live date]", "Public launch. Booking link shared on your Facebook page and Messenger auto-reply."],
    ]),
];

const nextSteps = [
  eyebrow("Next steps", true),
  h1("What we need from you"),
  bullet("Court names, rates (peak / off-peak) and operating hours"),
  bullet("A PayMongo business account (we’ll help you apply if you don’t have one)"),
  bullet("Logo, facility photos and your preferred domain"),
  bullet("Names and emails of staff who need access"),
  bullet("Products you sell at the counter, with prices and current stock"),
  spacer(200),
  cards([
    [h3("Terms"),
      bullet("This proposal is valid until [11 Dec 2026].", "dots"),
      bullet("Payment terms: [50% on signing, 50% on go-live; monthly plan billed in advance].", "dots"),
      bullet("Minimum term: [12 months].", "dots"),
      bullet("Your customer data stays yours and can be exported at any time.", "dots"),
      bullet("[Any other terms]", "dots")],
    [h3("See it live"),
      p("Book a walkthrough and we’ll show you EzPickle running with your own courts and rates."),
      p("[Your name]", { bold: true }, { spacing: { after: 20 } }),
      p("[mobile number]", {}, { spacing: { after: 20 } }),
      p("[email address]", {}, { spacing: { after: 20 } }),
      p("[facebook.com/yourpage]")],
  ], { fills: [null, TINT], borders: [lineBorders(), lineBorders("CDEEB2")] }),
  spacer(240),
  h1("Acceptance"),
  muted("By signing below, [Facility Name] accepts this proposal and the [Club] package as quoted."),
  spacer(600),
  (() => {
    const w = Math.floor((CONTENT_W - 600) / 2);
    const sig = (who) => new TableCell({
      width: { size: w, type: WidthType.DXA },
      borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 8, color: INK } },
      margins: { top: 100, bottom: 0, left: 0, right: 0 },
      children: [p(who, { size: 18 }), p("Date: ____________________", { size: 18, color: MUTED })],
    });
    return new Table({
      width: { size: w * 2 + 600, type: WidthType.DXA }, columnWidths: [w, 600, w],
      rows: [new TableRow({ children: [
        sig("[Client name], [Position], [Facility Name]"),
        new TableCell({ width: { size: 600, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph("")] }),
        sig("[Your name], EzPickle"),
      ] })],
    });
  })(),
  spacer(400),
  p("Screenshots show EzPickle with sample demo data, not real customer information.", { size: 16, color: MUTED }),
];

// ---------------- Document ----------------
const header = new Header({ children: [new Paragraph({
  tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 6 } },
  children: [
    new TextRun({ text: "Ez", font: FONT, bold: true, size: 20, color: GREEN }),
    new TextRun({ text: "Pickle", font: FONT, bold: true, size: 20, color: INK }),
    new TextRun({ text: "\t", font: FONT }),
    ...runs("Proposal for [Facility Name]", { size: 16, color: MUTED }),
  ],
})] });
const footer = new Footer({ children: [new Paragraph({
  tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
  children: [
    new TextRun({ text: "EzPickle · Play Easy. Play More.", font: FONT, size: 16, color: MUTED }),
    new TextRun({ text: "\t", font: FONT }),
    new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }),
  ],
})] });

const doc = new Document({
  creator: "EzPickle",
  title: "EzPickle Proposal",
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 36, bold: true, color: INK }, paragraph: { spacing: { before: 0, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 26, bold: true, color: INK }, paragraph: { spacing: { before: 60, after: 80 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 22, bold: true, color: INK }, paragraph: { spacing: { before: 80, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: "check", levels: [{ level: 0, format: LevelFormat.BULLET, text: "●", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 340, hanging: 280 } }, run: { color: GREEN, font: FONT, size: 16 } } }] },
    { reference: "dots", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 340, hanging: 280 } } } }] },
  ] },
  sections: [
    { // Cover: no header/footer
      properties: { page: { margin: { top: 1020, bottom: 1020, left: 1020, right: 1020 } } },
      children: cover,
    },
    {
      properties: { page: { margin: { top: 1020, bottom: 900, left: 1020, right: 1020, header: 500, footer: 450 }, pageNumbers: { start: 2 } } },
      headers: { default: header },
      footers: { default: footer },
      children: [...summary, ...players, ...openPlay, ...owners, ...features, ...investment, ...nextSteps],
    },
  ],
});

Packer.toBuffer(doc).then(async (buf) => {
  // docx emits <w:highlightCs/>, which Word's schema rejects; drop it.
  const JSZip = require("module").createRequire(require.resolve("docx"))("jszip");
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    const xml = await zip.file(name).async("string");
    zip.file(name, xml.replace(/<w:highlightCs [^>]*\/>/g, ""));
  }
  const out = path.join(dir, "ezpickle-proposal.docx");
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("Wrote", out);
});
