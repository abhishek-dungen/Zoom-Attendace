import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const siteDataDir = path.join(repo, "site", "data");
const paymentRepo = process.env.PAYMENT_ANALYSIS_REPO || "/Users/abhishekkumar/Desktop/Instamojo Analysis/repo";
const paymentOutputs = path.join(paymentRepo, "outputs");
const outputJson = path.join(siteDataDir, "payment-attendance-report.json");
const weeklyDir = path.join(siteDataDir, "payment-weekly");
const istOffsetMs = 5.5 * 60 * 60 * 1000;

const sourceFiles = {
  instamojo: path.join(paymentOutputs, "instamojo-credit-sales-firestore-after-backfill-2025-11-01-to-2026-05-31.csv"),
  payu: path.join(paymentOutputs, "payu-cashfree-live-api-2025-11-01-to-2026-05-31", "payu_legacy_raw.json"),
  cashfreeOverlap: path.join(paymentOutputs, "cashfree_instamojo_overlap_report.json"),
};

function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || ["nan", "none", "null", "undefined"].includes(text.toLowerCase())) {
    return "";
  }
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  const [headers = [], ...records] = rows;
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [clean(header), clean(record[index])])));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows) {
  const headers = [
    "Name",
    "Email",
    "Phone",
    "Registration Date",
    "Registration Type",
    "Gateway",
    "Payment ID",
    "Amount",
    "Join Time",
    "Final Drop Time",
    "Total Present",
    "Attendance %",
    "Match Method",
    "Purpose",
  ];
  const csvRows = [headers.join(",")];
  for (const row of rows) {
    csvRows.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `${csvRows.join("\n")}\n`, "utf8");
}

function parseDate(value) {
  const text = clean(value).replace(/^'/, "");
  if (!text) {
    return null;
  }
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, dd, mm, yyyy, hh = "00", min = "00", ss = "00"] = match;
    return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh) - 5, Number(min) - 30, Number(ss)));
  }
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [, yyyy, mm, dd, hh, min, ss = "00"] = match;
    return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh) - 5, Number(min) - 30, Number(ss)));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function istParts(date) {
  const shifted = new Date(date.getTime() + istOffsetMs);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function startOfIstDayUtc(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day) - istOffsetMs;
}

function weekWindow(date) {
  const parts = istParts(date);
  const startDayMs = startOfIstDayUtc(parts);
  const daysSinceMonday = (parts.weekday + 6) % 7;
  const start = new Date(startDayMs - daysSinceMonday * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

function isoIstDate(date) {
  const parts = istParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function normalizePhone(value) {
  const digits = clean(value).replace(/^'/, "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function normalizeName(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function amountNumber(value) {
  const number = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function classify(amount, purpose) {
  const text = clean(purpose).toLowerCase();
  const value = amountNumber(amount);
  if (value >= 1500 || text.includes("basic to advance excel course") || text.includes("basic-to-advance-excel-course")) {
    return "course";
  }
  if (190 <= value && value <= 250) {
    return "combo";
  }
  if (90 <= value && value <= 110 && text.includes("resource bundle")) {
    return "bundle_only";
  }
  if (90 <= value && value <= 110 && (text.includes("masterclass") || text.includes("webinar"))) {
    return "webinar_only";
  }
  return "other";
}

function labelClassification(value) {
  return {
    webinar_only: "Webinar only",
    combo: "Combo: webinar + bundle",
    bundle_only: "Bundle only",
    course: "Course",
    other: "Other",
  }[value] || "Other";
}

function registrationRank(record) {
  if (record.classification === "combo") return 4;
  if (record.classification === "bundle_only") return 3;
  if (record.classification === "webinar_only") return 2;
  if (record.classification === "course") return 1;
  return 0;
}

function identityKeys(record) {
  const keys = [];
  if (record.emailKey) keys.push(`email:${record.emailKey}`);
  if (record.phoneKey) keys.push(`phone:${record.phoneKey}`);
  if (record.nameKey && record.nameKey.length >= 5) keys.push(`name:${record.nameKey}`);
  return keys;
}

function primaryRecordKey(record) {
  if (record.emailKey) return `email:${record.emailKey}`;
  if (record.phoneKey) return `phone:${record.phoneKey}`;
  if (record.nameKey && record.nameKey.length >= 5) return `name:${record.nameKey}`;
  return `payment:${record.source}:${record.paymentId || record.date.toISOString()}`;
}

function bestRegistration(records) {
  return [...records]
    .filter((record) => ["webinar_only", "combo", "bundle_only"].includes(record.classification))
    .sort((a, b) => {
      const rankDelta = registrationRank(b) - registrationRank(a);
      if (rankDelta) return rankDelta;
      return a.date.getTime() - b.date.getTime();
    })[0] || null;
}

function uniqueRegistrantRecords(records) {
  const byIdentity = new Map();
  for (const record of records) {
    const key = primaryRecordKey(record);
    const current = byIdentity.get(key);
    byIdentity.set(key, current ? bestRegistration([current, record]) || current : record);
  }
  return [...byIdentity.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function participantIdentityKeys(participant) {
  const keys = [];
  const emailKey = normalizeEmail(participant.email);
  const phoneKey = normalizePhone(participant.phoneNumber);
  const nameKey = normalizeName(participant.name);
  if (emailKey) keys.push({ key: `email:${emailKey}`, method: "email" });
  if (phoneKey) keys.push({ key: `phone:${phoneKey}`, method: "phone" });
  if (nameKey && nameKey.length >= 5) keys.push({ key: `name:${nameKey}`, method: "name fallback" });
  return keys;
}

function makePaymentRecord({ source, paymentId, date, status, purpose, name, email, phone, amount }) {
  const parsedDate = parseDate(date);
  if (!parsedDate) return null;
  const numericAmount = amountNumber(amount);
  return {
    source,
    paymentId: clean(paymentId),
    date: parsedDate,
    status: clean(status),
    purpose: clean(purpose),
    name: clean(name),
    email: clean(email),
    phone: clean(phone).replace(/^'/, ""),
    amount: numericAmount,
    classification: classify(numericAmount, purpose),
    emailKey: normalizeEmail(email),
    phoneKey: normalizePhone(phone),
    nameKey: normalizeName(name),
  };
}

function loadInstamojo() {
  return parseCsv(fs.readFileSync(sourceFiles.instamojo, "utf8"))
    .map((row) =>
      makePaymentRecord({
        source: "Instamojo",
        paymentId: row["Payment ID"],
        date: row["Transaction Date"],
        status: row["Transaction Type"],
        purpose: row["Link/Purpose"],
        name: row["Buyer Name"],
        email: row["Buyer Email Address"],
        phone: row["Buyer Phone Number"],
        amount: row["Sale Amount"],
      })
    )
    .filter(Boolean);
}

function loadPayu() {
  return JSON.parse(fs.readFileSync(sourceFiles.payu, "utf8"))
    .filter((row) => ["captured", "success"].includes(clean(row.status).toLowerCase()))
    .map((row) =>
      makePaymentRecord({
        source: "PayU",
        paymentId: row.id || row.txnid,
        date: row.addedon,
        status: row.status,
        purpose: row.productinfo || row.field9,
        name: `${clean(row.firstname)} ${clean(row.lastname)}`.trim(),
        email: row.email,
        phone: row.phone,
        amount: row.amount || row.transaction_fee,
      })
    )
    .filter(Boolean);
}

function loadCashfreeUnique() {
  const overlap = JSON.parse(fs.readFileSync(sourceFiles.cashfreeOverlap, "utf8"));
  return (overlap.unmatched_cashfree || [])
    .map((row) =>
      makePaymentRecord({
        source: "Cashfree",
        paymentId: row.cashfree_id,
        date: row.date,
        status: "SUCCESS",
        purpose: row.purpose || row.order_id,
        name: "",
        email: row.email,
        phone: row.phone,
        amount: row.amount,
      })
    )
    .filter(Boolean);
}

function buildIdentityIndex(records) {
  const index = new Map();
  for (const record of records) {
    for (const key of identityKeys(record)) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(record);
    }
  }
  for (const values of index.values()) {
    values.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  return index;
}

function matchParticipant(participant, paymentIndex) {
  for (const { key, method } of participantIdentityKeys(participant)) {
    const records = paymentIndex.get(key) || [];
    if (records.length) {
      return { records, method };
    }
  }
  return { records: [], method: "" };
}

function paymentDisplayName(record, participant = {}) {
  return clean(participant.name) || record?.name || "-";
}

function paymentDisplayEmail(record, participant = {}) {
  return clean(participant.email) || record?.email || "-";
}

function paymentDisplayPhone(record, participant = {}) {
  return clean(participant.phoneNumber) || record?.phone || "-";
}

function participantReportRow(participant, registration, matchMethod) {
  return {
    name: paymentDisplayName(registration, participant),
    email: paymentDisplayEmail(registration, participant),
    phone: paymentDisplayPhone(registration, participant),
    registrationDate: registration ? registration.date.toISOString() : "",
    registrationType: registration ? labelClassification(registration.classification) : "Not found in payment gateways",
    gateway: registration?.source || "",
    paymentId: registration?.paymentId || "",
    amount: registration?.amount ?? "",
    joinTime: participant.firstJoinTime || "",
    finalDropTime: participant.finalDropTime || "",
    totalPresent: participant.totalPresentFormatted || "",
    totalPresentSeconds: Number(participant.totalPresentSeconds || 0),
    attendancePercent: Number(participant.attendancePercent || 0),
    matchMethod,
    purpose: registration?.purpose || "",
  };
}

function csvRowFromReport(row) {
  return {
    "Name": row.name,
    "Email": row.email,
    "Phone": row.phone,
    "Registration Date": row.registrationDate,
    "Registration Type": row.registrationType,
    "Gateway": row.gateway,
    "Payment ID": row.paymentId,
    "Amount": row.amount,
    "Join Time": row.joinTime,
    "Final Drop Time": row.finalDropTime,
    "Total Present": row.totalPresent,
    "Attendance %": row.attendancePercent,
    "Match Method": row.matchMethod,
    "Purpose": row.purpose,
  };
}

function summarizeCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.registrationType] = (counts[row.registrationType] || 0) + 1;
    return counts;
  }, {});
}

function dedupeReportRows(rows) {
  const byIdentity = new Map();
  for (const row of rows) {
    const key =
      row.paymentId && row.gateway
        ? `payment:${row.gateway}:${row.paymentId}`
        : `person:${normalizeEmail(row.email)}:${normalizePhone(row.phone)}:${normalizeName(row.name)}`;
    const current = byIdentity.get(key);
    if (!current || Number(row.totalPresentSeconds || 0) > Number(current.totalPresentSeconds || 0)) {
      byIdentity.set(key, row);
    }
  }
  return [...byIdentity.values()];
}

function conversionAnalysis(records, paymentIndex) {
  const coursePurchases = records.filter((record) => record.classification === "course");
  const byRegistrationType = {};
  const buyers = [];

  for (const course of coursePurchases) {
    const related = new Set();
    for (const key of identityKeys(course)) {
      for (const row of paymentIndex.get(key) || []) {
        if (row !== course) related.add(row);
      }
    }
    const priorRegistrations = [...related].filter(
      (row) => ["webinar_only", "combo", "bundle_only"].includes(row.classification) && row.date <= course.date
    );
    const registration = bestRegistration(priorRegistrations);
    const registrationType = registration ? labelClassification(registration.classification) : "No prior webinar/bundle registration found";
    byRegistrationType[registrationType] = (byRegistrationType[registrationType] || 0) + 1;
    buyers.push({
      name: course.name || registration?.name || "-",
      email: course.email || registration?.email || "-",
      phone: course.phone || registration?.phone || "-",
      registrationDate: registration?.date.toISOString() || "",
      registrationType,
      coursePurchaseDate: course.date.toISOString(),
      gateway: course.source,
      paymentId: course.paymentId,
      amount: course.amount,
    });
  }

  return {
    coursePurchases: coursePurchases.length,
    byRegistrationType,
    buyers,
  };
}

function buildChatRows(participants) {
  const rows = [];
  for (const participant of participants) {
    for (const chat of participant.chatComments || []) {
      rows.push({
        name: participant.name || chat.senderName || "-",
        email: participant.email || "",
        phone: participant.phoneNumber || "",
        time: chat.absoluteTime || "",
        offsetTime: chat.offsetTime || "",
        message: chat.message || "",
      });
    }
  }
  rows.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return rows;
}

function writeChatCsv(filePath, rows) {
  const headers = ["Name", "Email", "Phone", "Chat Time", "Offset Time", "Message"];
  const csvRows = [headers.join(",")];
  for (const row of rows) {
    csvRows.push([row.name, row.email, row.phone, row.time, row.offsetTime, row.message].map(csvEscape).join(","));
  }
  fs.writeFileSync(filePath, `${csvRows.join("\n")}\n`, "utf8");
}

function main() {
  fs.mkdirSync(weeklyDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(siteDataDir, "index.json"), "utf8"));
  const payments = [...loadInstamojo(), ...loadPayu(), ...loadCashfreeUnique()].sort((a, b) => a.date - b.date);
  const paymentIndex = buildIdentityIndex(payments);
  const conversion = conversionAnalysis(payments, paymentIndex);
  const reports = [];

  for (const webinar of manifest.webinars || []) {
    const reportPath = path.join(repo, "site", webinar.reportJson);
    const payload = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const webinarDate = parseDate(payload.webinar?.startTime);
    const { start, end } = weekWindow(webinarDate);
    const baseName = path.basename(webinar.reportJson, ".json");
    const participants = payload.uniqueParticipants || [];

    const sameWeekPayments = uniqueRegistrantRecords(payments.filter(
      (record) =>
        record.date >= start &&
        record.date <= end &&
        ["webinar_only", "combo", "bundle_only"].includes(record.classification)
    ));

    const sameWeekAttended = [];
    const priorWeekAttended = [];
    const outsideRegistration = [];
    const attendedRegistrantKeys = new Set();

    for (const participant of participants) {
      const match = matchParticipant(participant, paymentIndex);
      const sameWeekRegistration = bestRegistration(match.records.filter((record) => record.date >= start && record.date <= end));
      const priorRegistration = bestRegistration(match.records.filter((record) => record.date < start));
      const registration = sameWeekRegistration || priorRegistration || bestRegistration(match.records);
      if (!registration) {
        outsideRegistration.push(participantReportRow(participant, null, "not matched"));
        continue;
      }

      const row = participantReportRow(participant, registration, match.method);
      attendedRegistrantKeys.add(primaryRecordKey(registration));
      if (registration.date >= start && registration.date <= end) {
        sameWeekAttended.push(row);
      } else if (registration.date < start) {
        priorWeekAttended.push(row);
      } else {
        outsideRegistration.push({ ...row, matchMethod: `${match.method}; registration after webinar week` });
      }
    }

    const registeredNotAttended = sameWeekPayments
      .filter((record) => !attendedRegistrantKeys.has(primaryRecordKey(record)))
      .map((record) => ({
        name: record.name || "-",
        email: record.email || "-",
        phone: record.phone || "-",
        registrationDate: record.date.toISOString(),
        registrationType: labelClassification(record.classification),
        gateway: record.source,
        paymentId: record.paymentId,
        amount: record.amount,
        joinTime: "",
        finalDropTime: "",
        totalPresent: "",
        totalPresentSeconds: 0,
        attendancePercent: 0,
        matchMethod: "not attended",
        purpose: record.purpose,
      }));

    const sameWeekAttendedUnique = dedupeReportRows(sameWeekAttended);
    const priorWeekAttendedUnique = dedupeReportRows(priorWeekAttended);
    const outsideRegistrationUnique = dedupeReportRows(outsideRegistration);
    const chatRows = buildChatRows(participants);
    const csvPaths = {
      sameWeekAttended: `data/payment-weekly/${baseName}-same-week-registered-attended.csv`,
      priorWeekAttended: `data/payment-weekly/${baseName}-prior-week-registered-attended.csv`,
      outsideRegistration: `data/payment-weekly/${baseName}-outside-registration.csv`,
      registeredNotAttended: `data/payment-weekly/${baseName}-registered-not-attended.csv`,
      chat: `data/payment-weekly/${baseName}-participant-chat.csv`,
    };

    writeCsv(path.join(repo, "site", csvPaths.sameWeekAttended), sameWeekAttendedUnique.map(csvRowFromReport));
    writeCsv(path.join(repo, "site", csvPaths.priorWeekAttended), priorWeekAttendedUnique.map(csvRowFromReport));
    writeCsv(path.join(repo, "site", csvPaths.outsideRegistration), outsideRegistrationUnique.map(csvRowFromReport));
    writeCsv(path.join(repo, "site", csvPaths.registeredNotAttended), registeredNotAttended.map(csvRowFromReport));
    writeChatCsv(path.join(repo, "site", csvPaths.chat), chatRows);

    reports.push({
      reportJson: webinar.reportJson,
      serial: webinar.serial,
      webinarId: payload.webinar?.id || webinar.id,
      webinarDate: payload.webinar?.startTime,
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      weekLabel: `${isoIstDate(start)} to ${isoIstDate(end)} IST`,
      summary: {
        sameWeekRegistrations: sameWeekPayments.length,
        sameWeekRegisteredAttended: sameWeekAttendedUnique.length,
        priorWeekRegisteredAttended: priorWeekAttendedUnique.length,
        outsideRegistrationAttended: outsideRegistrationUnique.length,
        registeredNotAttended: registeredNotAttended.length,
        sameWeekAttendancePercent: sameWeekPayments.length ? (sameWeekAttendedUnique.length / sameWeekPayments.length) * 100 : 0,
        participantChats: chatRows.length,
      },
      classificationBreakdown: {
        sameWeekRegistrations: summarizeCounts(sameWeekPayments.map((record) => ({ registrationType: labelClassification(record.classification) }))),
        sameWeekRegisteredAttended: summarizeCounts(sameWeekAttendedUnique),
        priorWeekRegisteredAttended: summarizeCounts(priorWeekAttendedUnique),
        registeredNotAttended: summarizeCounts(registeredNotAttended),
      },
      csvPaths,
      sameWeekRegisteredAttended: sameWeekAttendedUnique,
      priorWeekRegisteredAttended: priorWeekAttendedUnique,
      outsideRegistrationAttended: outsideRegistrationUnique,
      registeredNotAttended,
      participantChats: chatRows,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    methodology: {
      paymentSources:
        "Instamojo credit CSV plus PayU captured rows plus Cashfree rows retained after removing Cashfree records marked as Instamojo backend duplicates.",
      weekDefinition: "Monday 00:00:00 IST to Sunday 23:59:59 IST, matched to the selected webinar's week.",
      attendeeMatchOrder: "Email, then phone last 10 digits, then normalized name fallback.",
      attendanceTime: "Uses the existing Zoom report totalPresentSeconds, which sums actual join segments instead of first-join-to-last-drop span.",
    },
    sourceFiles,
    paymentUniverse: {
      uniqueRows: payments.length,
      byGateway: payments.reduce((acc, record) => {
        acc[record.source] = (acc[record.source] || 0) + 1;
        return acc;
      }, {}),
      byClassification: payments.reduce((acc, record) => {
        const label = labelClassification(record.classification);
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {}),
    },
    conversionAnalysis: conversion,
    reports,
  };

  fs.writeFileSync(outputJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Payment attendance report written: ${outputJson}`);
  console.log(`Weekly CSV exports written: ${weeklyDir}`);
}

main();
