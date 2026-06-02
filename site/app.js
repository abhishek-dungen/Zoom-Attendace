const istTimeZone = "Asia/Kolkata";

const webinarSelectEl = document.getElementById("webinarSelect");
const uniqueParticipantsEl = document.getElementById("uniqueParticipants");
const webinarDateEl = document.getElementById("webinarDate");
const courseRevealTimeEl = document.getElementById("courseRevealTime");
const effectiveDurationEl = document.getElementById("effectiveDuration");
const droppedBeforeCourseMetricEl = document.getElementById("droppedBeforeCourseMetric");
const droppedAfterCourseMetricEl = document.getElementById("droppedAfterCourseMetric");
const stayedTillEndMetricEl = document.getElementById("stayedTillEndMetric");
const courseRevealSourceEl = document.getElementById("courseRevealSource");
const overviewPanelEl = document.querySelector(".overview-panel");
const reportTilesEl = document.getElementById("reportTiles");
const uniqueParticipantsTableEl = document.getElementById("uniqueParticipantsTable");
const beforeCourseTableEl = document.getElementById("beforeCourseTable");
const afterCourseTableEl = document.getElementById("afterCourseTable");
const stayedTillEndTableEl = document.getElementById("stayedTillEndTable");
const paymentKpisEl = document.getElementById("paymentKpis");
const paymentReportTitleEl = document.getElementById("paymentReportTitle");
const paymentReportTableEl = document.getElementById("paymentReportTable");
const paymentReportCsvLinkEl = document.getElementById("paymentReportCsvLink");
const historicalPaymentKpisEl = document.getElementById("historicalPaymentKpis");
const historicalPaymentTableEl = document.getElementById("historicalPaymentTable");
const conversionMethodologyEl = document.getElementById("conversionMethodology");
const conversionKpisEl = document.getElementById("conversionKpis");
const conversionTableEl = document.getElementById("conversionTable");
const historicalConversionMethodologyEl = document.getElementById("historicalConversionMethodology");
const historicalConversionKpisEl = document.getElementById("historicalConversionKpis");
const historicalConversionTableEl = document.getElementById("historicalConversionTable");
const uniqueCsvLinkEl = document.getElementById("uniqueCsvLink");
const beforeCourseCsvLinkEl = document.getElementById("beforeCourseCsvLink");
const afterCourseCsvLinkEl = document.getElementById("afterCourseCsvLink");
const stayedTillEndCsvLinkEl = document.getElementById("stayedTillEndCsvLink");
const aggregateWebinarsEl = document.getElementById("aggregateWebinars");
const aggregateAvgWebinarLengthEl = document.getElementById("aggregateAvgWebinarLength");
const aggregateAvgUniqueEl = document.getElementById("aggregateAvgUnique");
const aggregateAvgEffectiveLengthEl = document.getElementById("aggregateAvgEffectiveLength");
const aggregateAvgBeforeEl = document.getElementById("aggregateAvgBefore");
const aggregateAvgAfterEl = document.getElementById("aggregateAvgAfter");
const aggregateAvgStayedEl = document.getElementById("aggregateAvgStayed");
const aggregatePctBeforeEl = document.getElementById("aggregatePctBefore");
const aggregatePctAfterEl = document.getElementById("aggregatePctAfter");
const aggregatePctStayedEl = document.getElementById("aggregatePctStayed");
const chartUniqueParticipantsEl = document.getElementById("chartUniqueParticipants");
const chartBeforePercentEl = document.getElementById("chartBeforePercent");
const chartAfterPercentEl = document.getElementById("chartAfterPercent");
const chartStayedPercentEl = document.getElementById("chartStayedPercent");
const chartFifteenMinuteSelectedJoinsEl = document.getElementById("chartFifteenMinuteSelectedJoins");
const chartFifteenMinuteSelectedDropsEl = document.getElementById("chartFifteenMinuteSelectedDrops");
const chartFifteenMinuteHistoricalJoinsEl = document.getElementById("chartFifteenMinuteHistoricalJoins");
const chartFifteenMinuteHistoricalDropsEl = document.getElementById("chartFifteenMinuteHistoricalDrops");
const chartHistoricalOnlyJoinsEl = document.getElementById("chartHistoricalOnlyJoins");
const chartHistoricalOnlyDropsEl = document.getElementById("chartHistoricalOnlyDrops");
const fifteenMinuteSelectedNoteEl = document.getElementById("fifteenMinuteSelectedNote");
const fifteenMinuteSelectedDropNoteEl = document.getElementById("fifteenMinuteSelectedDropNote");
const fifteenMinuteHistoricalJoinNoteEl = document.getElementById("fifteenMinuteHistoricalJoinNote");
const fifteenMinuteHistoricalNoteEl = document.getElementById("fifteenMinuteHistoricalNote");
const historicalOnlyJoinNoteEl = document.getElementById("historicalOnlyJoinNote");
const historicalOnlyDropNoteEl = document.getElementById("historicalOnlyDropNote");
const groupButtons = [...document.querySelectorAll("[data-report-group]")];
const reportViews = [...document.querySelectorAll(".report-view")];

let webinarManifest = [];
let aggregatePayload = null;
let paymentAttendancePayload = null;
let historicalReportPayloads = [];
let currentPayload = null;
let activePaymentReportKey = "sameWeekRegisteredAttended";
let activeReportGroup = "webinar";
let activeViewByGroup = {
  webinar: "uniqueParticipantsView",
  historical: "historicalPaymentAttendanceView",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTimeIst(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: istTimeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnlyIst(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: istTimeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatRegistrationType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("combo") || text.includes("bundle")) {
    return "Combo";
  }
  if (text.includes("webinar")) {
    return "Webinar";
  }
  return value || "-";
}

function formatTimeOnlyIst(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: istTimeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .toLowerCase();
}

function formatShortTimeRangeLabel(value) {
  return String(value || "")
    .replaceAll(" to ", "-")
    .replaceAll(" am", "")
    .replaceAll(" pm", "");
}

function formatFixedSlotLabel(slotNumber) {
  const startMinutes = 19 * 60 + (slotNumber - 1) * 15;
  const endMinutes = startMinutes + 15;
  const format = (totalMinutes) => {
    const hours24 = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const hours12 = hours24 % 12 || 12;
    const suffix = hours24 < 12 ? "am" : "pm";
    return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
  };
  return `${format(startMinutes)}-${format(endMinutes)}`;
}

function formatDurationSeconds(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatDurationMinutes(totalMinutes) {
  return formatDurationSeconds(Number(totalMinutes || 0) * 60);
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatAverageNumber(value) {
  return Number(value || 0).toFixed(2);
}

function countWithPercent(count, percent) {
  return `${count} (${formatPercent(percent)})`;
}

function adjustedPercentages(counts) {
  const total = counts.reduce((sum, count) => sum + Number(count || 0), 0);
  if (!total) {
    return counts.map(() => 0);
  }
  let used = 0;
  return counts.map((count, index) => {
    if (index === counts.length - 1) {
      return Number(Math.max(0, 100 - used).toFixed(2));
    }
    const percent = Number(((Number(count || 0) / total) * 100).toFixed(2));
    used += percent;
    return percent;
  });
}

function paymentOutcomeCounts(report) {
  return [
    Number(report?.summary?.sameWeekRegisteredAttended || 0),
    Number(report?.summary?.priorWeekRegisteredAttended || 0),
    Number(report?.summary?.outsideRegistrationAttended || 0),
    Number(report?.summary?.registeredNotAttended || 0),
  ];
}

function renderMetricText(element, count, percent) {
  element.textContent = `${count} (${formatPercent(percent)})`;
}

function buildTable(headers, rows, emptyMessage) {
  if (!rows.length) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }

  const tableHeaders = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          ${row.map((value) => `<td>${value}</td>`).join("")}
        </tr>
      `
    )
    .join("");

  return `
    <table class="list-table">
      <thead>
        <tr>${tableHeaders}</tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
}

function participantRows(participants) {
  return participants.map((participant) => [
    escapeHtml(participant.name || "-"),
    escapeHtml(participant.email || "-"),
    escapeHtml(participant.phoneNumber || "-"),
    escapeHtml(formatTimeOnlyIst(participant.firstJoinTime)),
    escapeHtml(formatTimeOnlyIst(participant.finalDropTime)),
    escapeHtml(participant.totalPresentFormatted || formatDurationSeconds(participant.totalPresentSeconds)),
    escapeHtml(formatPercent(participant.attendancePercent)),
  ]);
}

function paymentRows(rows) {
  return rows.map((row) => [
    escapeHtml(row.name || "-"),
    escapeHtml(row.email || "-"),
    escapeHtml(row.phone || "-"),
    escapeHtml(formatDateOnlyIst(row.registrationDate)),
    escapeHtml(formatRegistrationType(row.registrationType)),
    escapeHtml(formatTimeOnlyIst(row.joinTime)),
    escapeHtml(formatTimeOnlyIst(row.finalDropTime)),
    escapeHtml(row.totalPresent || "-"),
    escapeHtml(formatPercent(row.attendancePercent)),
  ]);
}

function chatRows(rows) {
  return rows.map((row) => [
    escapeHtml(row.name || "-"),
    escapeHtml(row.email || "-"),
    escapeHtml(row.phone || "-"),
    escapeHtml(formatDateTimeIst(row.time)),
    escapeHtml(row.offsetTime || "-"),
    `<div class="chat-message">${escapeHtml(row.message || "-").replaceAll("\n", "<br>")}</div>`,
  ]);
}

function buildKpis(items, activeKey = "") {
  return items
    .map(
      (item) => `
        <button class="kpi-card ${item.key === activeKey ? "is-active" : ""}" type="button" data-payment-report="${escapeHtml(item.key || "")}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </button>
      `
    )
    .join("");
}

function tileLabel(label, count, showCount = true) {
  return showCount ? `${label} (${count})` : label;
}

function renderReportTiles() {
  if (!currentPayload) {
    reportTilesEl.innerHTML = "";
    return;
  }
  const conversion = paymentAttendancePayload?.conversionAnalysis;
  const currentReport = currentPaymentReport();
  const weeklyCourseBuyers = getWeeklyCourseBuyers(currentReport).length;
  const tiles =
    activeReportGroup === "webinar"
      ? [
          { view: "uniqueParticipantsView", label: tileLabel("Unique participants list", currentPayload.summary?.uniqueParticipants || 0) },
          { view: "beforeCourseView", label: tileLabel("Dropped before course", currentPayload.summary?.droppedBeforeCourseCount || 0) },
          { view: "afterCourseView", label: tileLabel("Dropped in next 30 min", currentPayload.summary?.droppedDuringPitchWindowCount || 0) },
          { view: "stayedTillEndView", label: tileLabel("Stayed till end", currentPayload.summary?.stayedTillEndCount || 0) },
          { view: "paymentAttendanceView", label: "Payment + attendance" },
          { view: "conversionView", label: tileLabel("Course conversion", weeklyCourseBuyers) },
          { view: "fifteenMinuteView", label: "15-minute analysis" },
        ]
      : [
          { view: "historicalPaymentAttendanceView", label: "Historical payment + attendance" },
          { view: "historicalConversionView", label: tileLabel("Historical course conversion", conversion?.coursePurchases || 0) },
          { view: "historicalFifteenMinuteView", label: "Historical 15-minute analysis" },
          { view: "consolidatedView", label: "Consolidated report" },
        ];

  const activeView = activeViewByGroup[activeReportGroup];
  reportTilesEl.innerHTML = tiles
    .map(
      (tile) => `
        <button class="tile-button ${tile.view === activeView ? "is-active" : ""}" data-view="${escapeHtml(tile.view)}" type="button">
          ${escapeHtml(tile.label)}
        </button>
      `
    )
    .join("");
}

function renderTables(payload) {
  const headers = [
    "Name",
    "Email",
    "Phone Number",
    "First Join",
    "Final Drop",
    "Total Present",
    "Attendance %",
  ];

  uniqueParticipantsTableEl.innerHTML = buildTable(headers, participantRows(payload.uniqueParticipants || []), "No unique participants found.");
  beforeCourseTableEl.innerHTML = buildTable(headers, participantRows(payload.cohorts?.droppedBeforeCourse || []), "Nobody dropped before the course reveal cutoff.");
  afterCourseTableEl.innerHTML = buildTable(headers, participantRows(payload.cohorts?.droppedDuringPitchWindow || []), "Nobody dropped in the 30-minute window after course reveal.");
  stayedTillEndTableEl.innerHTML = buildTable(headers, participantRows(payload.cohorts?.stayedTillEnd || []), "No participants matched the stayed-till-end rule.");
}

function currentPaymentReport() {
  if (!paymentAttendancePayload || !currentReportPath) {
    return null;
  }
  return (paymentAttendancePayload.reports || []).find((report) => report.reportJson === currentReportPath) || null;
}

function renderPaymentAttendance() {
  const report = currentPaymentReport();
  if (!report) {
    paymentKpisEl.innerHTML = "";
    paymentReportTableEl.innerHTML = `<p class="empty">No payment-attendance report has been generated for this webinar yet.</p>`;
    return;
  }

  const [
    sameWeekRegisteredAttendedPct,
    priorWeekRegisteredAttendedPct,
    outsideRegistrationAttendedPct,
    registeredNotAttendedPct,
  ] = adjustedPercentages(paymentOutcomeCounts(report));
  const paymentReports = {
    sameWeekRegistrations: {
      title: "Total registrations this week",
      value: report.summary.sameWeekRegistrations,
      rows: report.sameWeekRegistrations || [],
      csvPath: report.csvPaths?.sameWeekRegistrations,
      empty: "No registrations found for this week.",
      type: "payment",
    },
    sameWeekRegisteredAttended: {
      title: "Registered this week and attended",
      value: countWithPercent(report.summary.sameWeekRegisteredAttended, sameWeekRegisteredAttendedPct),
      rows: report.sameWeekRegisteredAttended || [],
      csvPath: report.csvPaths?.sameWeekAttended,
      empty: "No same-week registrants attended this webinar.",
      type: "payment",
    },
    priorWeekRegisteredAttended: {
      title: "Previous-week registrants attended",
      value: countWithPercent(report.summary.priorWeekRegisteredAttended, priorWeekRegisteredAttendedPct),
      rows: report.priorWeekRegisteredAttended || [],
      csvPath: report.csvPaths?.priorWeekAttended,
      empty: "No prior-week registrants attended this webinar.",
      type: "payment",
    },
    outsideRegistrationAttended: {
      title: "Attended without payment match",
      value: countWithPercent(report.summary.outsideRegistrationAttended, outsideRegistrationAttendedPct),
      rows: report.outsideRegistrationAttended || [],
      csvPath: report.csvPaths?.outsideRegistration,
      empty: "No attendees were outside the payment gateway records.",
      type: "payment",
    },
    registeredNotAttended: {
      title: "Registered but not attended",
      value: countWithPercent(report.summary.registeredNotAttended, registeredNotAttendedPct),
      rows: report.registeredNotAttended || [],
      csvPath: report.csvPaths?.registeredNotAttended,
      empty: "Every same-week registrant attended at least once.",
      type: "payment",
    },
    participantChats: {
      title: "Participant chats captured",
      value: report.summary.participantChats,
      rows: report.participantChats || [],
      csvPath: report.csvPaths?.chat,
      empty: "No participant chats were captured for this webinar.",
      type: "chat",
    },
  };

  if (!paymentReports[activePaymentReportKey]) {
    activePaymentReportKey = "sameWeekRegisteredAttended";
  }

  paymentKpisEl.innerHTML = buildKpis(
    Object.entries(paymentReports).map(([key, item]) => ({ key, label: item.title, value: item.value })),
    activePaymentReportKey
  );

  const paymentHeaders = [
    "Name",
    "Email",
    "Phone",
    "Registration Date",
    "Registration Type",
    "Join Time",
    "Final Drop",
    "Total Present",
    "Attendance %",
  ];
  const selected = paymentReports[activePaymentReportKey];
  paymentReportTitleEl.textContent = selected.title;
  paymentReportCsvLinkEl.href = selected.csvPath || "#";
  paymentReportTableEl.innerHTML =
    selected.type === "chat"
      ? buildTable(["Name", "Email", "Phone", "Chat Time", "Offset", "Message"], chatRows(selected.rows), selected.empty)
      : buildTable(paymentHeaders, paymentRows(selected.rows), selected.empty);
}

function getWeeklyCourseBuyers(report) {
  const conversion = paymentAttendancePayload?.conversionAnalysis;
  if (!conversion || !report) {
    return [];
  }
  const start = new Date(report.weekStart || "");
  const end = new Date(report.weekEnd || "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }
  return (conversion.buyers || []).filter((buyer) => {
    const date = new Date(buyer.coursePurchaseDate || "");
    return !Number.isNaN(date.getTime()) && date >= start && date <= end;
  });
}

function renderHistoricalPaymentAttendance() {
  if (!paymentAttendancePayload?.reports?.length) {
    historicalPaymentKpisEl.innerHTML = "";
    historicalPaymentTableEl.innerHTML = `<p class="empty">No historical payment-attendance data has been generated yet.</p>`;
    return;
  }

  const reports = paymentAttendancePayload.reports;
  const totals = reports.reduce(
    (acc, report) => {
      acc.sameWeekRegistrations += Number(report.summary?.sameWeekRegistrations || 0);
      acc.sameWeekRegisteredAttended += Number(report.summary?.sameWeekRegisteredAttended || 0);
      acc.priorWeekRegisteredAttended += Number(report.summary?.priorWeekRegisteredAttended || 0);
      acc.outsideRegistrationAttended += Number(report.summary?.outsideRegistrationAttended || 0);
      acc.registeredNotAttended += Number(report.summary?.registeredNotAttended || 0);
      return acc;
    },
    {
      sameWeekRegistrations: 0,
      sameWeekRegisteredAttended: 0,
      priorWeekRegisteredAttended: 0,
      outsideRegistrationAttended: 0,
      registeredNotAttended: 0,
    }
  );
  const webinarCount = reports.length || 1;
  const percentages = adjustedPercentages([
    totals.sameWeekRegisteredAttended,
    totals.priorWeekRegisteredAttended,
    totals.outsideRegistrationAttended,
    totals.registeredNotAttended,
  ]);

  historicalPaymentKpisEl.innerHTML = buildKpis([
    { label: "Total registrations", value: `${totals.sameWeekRegistrations} avg ${formatAverageNumber(totals.sameWeekRegistrations / webinarCount)}` },
    { label: "Registered same week and attended", value: `${totals.sameWeekRegisteredAttended} (${formatPercent(percentages[0])}) avg ${formatAverageNumber(totals.sameWeekRegisteredAttended / webinarCount)}` },
    { label: "Previous-week registrants attended", value: `${totals.priorWeekRegisteredAttended} (${formatPercent(percentages[1])}) avg ${formatAverageNumber(totals.priorWeekRegisteredAttended / webinarCount)}` },
    { label: "Attended without payment match", value: `${totals.outsideRegistrationAttended} (${formatPercent(percentages[2])}) avg ${formatAverageNumber(totals.outsideRegistrationAttended / webinarCount)}` },
    { label: "Registered but not attended", value: `${totals.registeredNotAttended} (${formatPercent(percentages[3])}) avg ${formatAverageNumber(totals.registeredNotAttended / webinarCount)}` },
  ]);

  const rows = reports.map((report) => {
    const rowPercentages = adjustedPercentages(paymentOutcomeCounts(report));
    return [
      escapeHtml(report.weekLabel || "-"),
      escapeHtml(report.summary?.sameWeekRegistrations || 0),
      escapeHtml(`${report.summary?.sameWeekRegisteredAttended || 0} (${formatPercent(rowPercentages[0])})`),
      escapeHtml(`${report.summary?.priorWeekRegisteredAttended || 0} (${formatPercent(rowPercentages[1])})`),
      escapeHtml(`${report.summary?.outsideRegistrationAttended || 0} (${formatPercent(rowPercentages[2])})`),
      escapeHtml(`${report.summary?.registeredNotAttended || 0} (${formatPercent(rowPercentages[3])})`),
    ];
  });

  historicalPaymentTableEl.innerHTML = buildTable(
    [
      "Week",
      "Total registrations",
      "Registered same week attended",
      "Previous-week attended",
      "Attended without payment match",
      "Registered not attended",
    ],
    rows,
    "No historical payment-attendance rows found."
  );
}

function renderConversion() {
  const conversion = paymentAttendancePayload?.conversionAnalysis;
  if (!conversion) {
    conversionMethodologyEl.textContent = "No conversion report has been generated yet.";
    historicalConversionMethodologyEl.textContent = "No conversion report has been generated yet.";
    return;
  }

  const weeklyBuyers = getWeeklyCourseBuyers(currentPaymentReport());
  const buildRows = (buyers) => buyers.map((buyer) => [
    escapeHtml(buyer.name || "-"),
    escapeHtml(buyer.email || "-"),
    escapeHtml(buyer.phone || "-"),
    escapeHtml(formatRegistrationType(buyer.registrationType)),
    escapeHtml(formatDateOnlyIst(buyer.registrationDate)),
    escapeHtml(formatDateTimeIst(buyer.coursePurchaseDate)),
    escapeHtml(buyer.gateway || "-"),
    escapeHtml(buyer.paymentId || "-"),
    escapeHtml(formatCurrency(buyer.amount)),
  ]);

  const countByType = (buyers) =>
    buyers.reduce((acc, buyer) => {
      const type = formatRegistrationType(buyer.registrationType);
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

  const weeklyBreakdown = countByType(weeklyBuyers);
  conversionMethodologyEl.textContent = "Course buyers in the selected webinar week, matched back to prior webinar or combo registrations using email first, then phone number.";
  conversionKpisEl.innerHTML = buildKpis([
    { label: "Course purchases", value: weeklyBuyers.length },
    { label: "From webinar", value: weeklyBreakdown.Webinar || 0 },
    { label: "From combo", value: weeklyBreakdown.Combo || 0 },
    { label: "No prior registration found", value: weeklyBreakdown["No prior webinar/bundle registration found"] || 0 },
  ]);
  conversionTableEl.innerHTML = buildTable(
    ["Name", "Email", "Phone", "Prior Registration Type", "Registration Date", "Course Purchase Date", "Gateway", "Payment ID", "Amount"],
    buildRows(weeklyBuyers),
    "No course purchases found for this webinar week."
  );

  const historicalBreakdown = conversion.byRegistrationType || {};
  historicalConversionMethodologyEl.textContent = "All course buyers across the historical payment data, matched back using email first, then phone number.";
  historicalConversionKpisEl.innerHTML = buildKpis([
    { label: "Course purchases", value: conversion.coursePurchases || 0 },
    { label: "From webinar", value: historicalBreakdown.Webinar || 0 },
    { label: "From combo", value: historicalBreakdown.Combo || 0 },
    { label: "No prior registration found", value: historicalBreakdown["No prior webinar/bundle registration found"] || 0 },
  ]);
  historicalConversionTableEl.innerHTML = buildTable(
    ["Name", "Email", "Phone", "Prior Registration Type", "Registration Date", "Course Purchase Date", "Gateway", "Payment ID", "Amount"],
    buildRows(conversion.buyers || []),
    "No historical course purchases found."
  );
}

function renderSummary(payload) {
  uniqueParticipantsEl.textContent = String(payload.summary?.uniqueParticipants || 0);
  webinarDateEl.textContent = formatDateOnlyIst(payload.webinar?.startTime);
  courseRevealTimeEl.textContent = formatDateTimeIst(payload.courseReveal?.time);
  effectiveDurationEl.textContent = payload.effectiveWindow?.durationFormatted || "-";

  renderMetricText(droppedBeforeCourseMetricEl, payload.summary?.droppedBeforeCourseCount || 0, payload.summary?.droppedBeforeCoursePercent || 0);
  renderMetricText(droppedAfterCourseMetricEl, payload.summary?.droppedDuringPitchWindowCount || 0, payload.summary?.droppedDuringPitchWindowPercent || 0);
  renderMetricText(stayedTillEndMetricEl, payload.summary?.stayedTillEndCount || 0, payload.summary?.stayedTillEndPercent || 0);

  courseRevealSourceEl.textContent =
    payload.courseReveal?.source === "admin_chat_detected"
      ? "Detected from admin chat"
      : "No Zoom chat file found; fallback 8:40 PM IST";

  uniqueCsvLinkEl.href = webinarManifest.find((item) => item.reportJson === currentReportPath)?.uniqueCsv || "#";
  beforeCourseCsvLinkEl.href = webinarManifest.find((item) => item.reportJson === currentReportPath)?.beforeCourseCsv || "#";
  afterCourseCsvLinkEl.href = webinarManifest.find((item) => item.reportJson === currentReportPath)?.afterCourseCsv || "#";
  stayedTillEndCsvLinkEl.href = webinarManifest.find((item) => item.reportJson === currentReportPath)?.stayedCsv || "#";
}

function createLineChart(series, valueKey, labelKey = "date", isPercent = false) {
  if (!series.length) {
    return `<p class="empty">No chart data available.</p>`;
  }

  const width = 620;
  const height = 220;
  const padding = 28;
  const values = series.map((item) => Number(item[valueKey] || 0));
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;

  const points = series.map((item, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(series.length - 1, 1);
    const y = height - padding - ((Number(item[valueKey] || 0) - minValue) / range) * (height - padding * 2);
    return { x, y, label: item[labelKey], value: item[valueKey] };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const circles = points
    .map(
      (point) => `
        <circle cx="${point.x}" cy="${point.y}" r="4" fill="#9a3412" />
        <text x="${point.x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#6b625d">${escapeHtml(point.label)}</text>
        <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" font-size="10" fill="#1f1a17">${escapeHtml(
          isPercent ? formatPercent(point.value) : String(point.value)
        )}</text>
      `
    )
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Line chart">
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#d7cabd" />
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#d7cabd" />
      <polyline fill="none" stroke="#9a3412" stroke-width="3" points="${polyline}" />
      ${circles}
    </svg>
  `;
}

function createBarChart(series, valueKey, labelKey, isPercent = false) {
  if (!series.length) {
    return `<p class="empty">No chart data available.</p>`;
  }

  const width = Math.max(1200, series.length * 132);
  const height = 330;
  const paddingLeft = 36;
  const paddingRight = 16;
  const chartTop = 24;
  const chartBottom = 116;
  const chartHeight = height - chartTop - chartBottom;
  const chartWidth = width - paddingLeft - paddingRight;
  const values = series.map((item) => Number(item[valueKey] || 0));
  const maxValue = Math.max(...values, 1);
  const gap = 26;
  const barWidth = Math.max(28, (chartWidth - gap * (series.length - 1)) / series.length);
  const step = barWidth + gap;

  const bars = series
    .map((item, index) => {
      const value = Number(item[valueKey] || 0);
      const barHeight = maxValue ? (value / maxValue) * chartHeight : 0;
      const x = paddingLeft + index * step;
      const y = chartTop + (chartHeight - barHeight);
      const valueLabel = isPercent ? formatPercent(value) : String(value);
      return `
        <g>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8" fill="#b45322" />
          <text x="${x + barWidth / 2}" y="${Math.max(16, y - 8)}" text-anchor="middle" font-size="11" fill="#1f1a17">${escapeHtml(valueLabel)}</text>
          <text x="${x + barWidth / 2}" y="${height - 54}" text-anchor="middle" font-size="10" fill="#6b625d">${escapeHtml(
            String(item[labelKey] || "")
          )}</text>
          <text x="${x + barWidth / 2}" y="${height - 30}" text-anchor="middle" font-size="10" fill="#8b7a6d">${escapeHtml(
            String(item.slotLabel || "")
          )}</text>
        </g>
      `;
    })
    .join("");

  return `
    <div class="chart-scroll">
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg chart-svg-wide" role="img" aria-label="Bar chart">
        <line x1="${paddingLeft}" y1="${chartTop}" x2="${paddingLeft}" y2="${height - chartBottom}" stroke="#d7cabd" />
        <line x1="${paddingLeft}" y1="${height - chartBottom}" x2="${width - paddingRight}" y2="${height - chartBottom}" stroke="#d7cabd" />
        ${bars}
      </svg>
    </div>
  `;
}

function fixedWebinarStartFor(dateValue) {
  const date = new Date(dateValue || "");
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: istTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 13, 30, 0));
}

function buildFixedSlotSeries(payloads, fieldName) {
  const slotMap = new Map();
  for (const payload of payloads.filter(Boolean)) {
    const fixedStart = fixedWebinarStartFor(payload.webinar?.startTime);
    if (!fixedStart) {
      continue;
    }
    for (const participant of payload.uniqueParticipants || []) {
      const value = participant[fieldName];
      if (!value) {
        continue;
      }
      const eventDate = new Date(value);
      if (Number.isNaN(eventDate.getTime()) || eventDate < fixedStart) {
        continue;
      }
      const offsetMinutes = Math.floor((eventDate.getTime() - fixedStart.getTime()) / 60000);
      const slotNumber = Math.floor(offsetMinutes / 15) + 1;
      if (slotNumber < 1 || slotNumber > 24) {
        continue;
      }
      const current = slotMap.get(slotNumber) || { slotNumber, timeLabel: formatFixedSlotLabel(slotNumber), count: 0 };
      current.count += 1;
      slotMap.set(slotNumber, current);
    }
  }

  const maxSlot = Math.max(16, ...slotMap.keys());
  return Array.from({ length: maxSlot }, (_, index) => {
    const slotNumber = index + 1;
    return slotMap.get(slotNumber) || { slotNumber, timeLabel: formatFixedSlotLabel(slotNumber), count: 0 };
  });
}

function renderFifteenMinuteAnalysis(payload) {
  const selectedJoinSeries = buildFixedSlotSeries([payload], "firstJoinTime");
  const selectedDropSeries = buildFixedSlotSeries([payload], "finalDropTime");
  const historicalJoinSeries = buildFixedSlotSeries(historicalReportPayloads, "firstJoinTime");
  const historicalDropSeries = buildFixedSlotSeries(historicalReportPayloads, "finalDropTime");

  chartFifteenMinuteSelectedJoinsEl.innerHTML = createBarChart(selectedJoinSeries, "count", "timeLabel", false);
  chartFifteenMinuteSelectedDropsEl.innerHTML = createBarChart(selectedDropSeries, "count", "timeLabel", false);
  chartFifteenMinuteHistoricalJoinsEl.innerHTML = createBarChart(historicalJoinSeries, "count", "timeLabel", false);
  chartFifteenMinuteHistoricalDropsEl.innerHTML = createBarChart(historicalDropSeries, "count", "timeLabel", false);
  chartHistoricalOnlyJoinsEl.innerHTML = createBarChart(historicalJoinSeries, "count", "timeLabel", false);
  chartHistoricalOnlyDropsEl.innerHTML = createBarChart(historicalDropSeries, "count", "timeLabel", false);

  fifteenMinuteSelectedNoteEl.textContent = "Unique first joins are counted in fixed 15-minute slots from 7:00 PM IST.";
  fifteenMinuteSelectedDropNoteEl.textContent = "Final drops are counted in fixed 15-minute slots from 7:00 PM IST.";
  fifteenMinuteHistoricalJoinNoteEl.textContent = historicalReportPayloads.length
    ? `Historical first joins across ${historicalReportPayloads.length} webinars, using fixed 7:00 PM IST slots.`
    : "No historical join data available yet.";
  fifteenMinuteHistoricalNoteEl.textContent = historicalReportPayloads.length
    ? `Historical final drops across ${historicalReportPayloads.length} webinars, using fixed 7:00 PM IST slots.`
    : "No historical dropout data available yet.";
  historicalOnlyJoinNoteEl.textContent = fifteenMinuteHistoricalJoinNoteEl.textContent;
  historicalOnlyDropNoteEl.textContent = fifteenMinuteHistoricalNoteEl.textContent;
}

function renderAggregate() {
  if (!aggregatePayload) {
    return;
  }

  aggregateWebinarsEl.textContent = String(aggregatePayload.webinarsConsidered || 0);
  aggregateAvgWebinarLengthEl.textContent = formatDurationMinutes(aggregatePayload.averages?.webinarLengthMinutes || 0);
  aggregateAvgUniqueEl.textContent = formatAverageNumber(aggregatePayload.averages?.uniqueParticipants || 0);
  aggregateAvgEffectiveLengthEl.textContent = formatDurationSeconds(aggregatePayload.averages?.effectiveWebinarLengthSeconds || 0);
  aggregateAvgBeforeEl.textContent = formatAverageNumber(aggregatePayload.averages?.droppedBeforeCourse || 0);
  aggregateAvgAfterEl.textContent = formatAverageNumber(aggregatePayload.averages?.droppedDuringPitchWindow || 0);
  aggregateAvgStayedEl.textContent = formatAverageNumber(aggregatePayload.averages?.stayedTillEnd || 0);
  aggregatePctBeforeEl.textContent = formatPercent(aggregatePayload.aggregatePercentages?.droppedBeforeCourse || 0);
  aggregatePctAfterEl.textContent = formatPercent(aggregatePayload.aggregatePercentages?.droppedDuringPitchWindow || 0);
  aggregatePctStayedEl.textContent = formatPercent(aggregatePayload.aggregatePercentages?.stayedTillEnd || 0);

  chartUniqueParticipantsEl.innerHTML = createLineChart(aggregatePayload.series || [], "uniqueParticipants", "serial", false);
  chartBeforePercentEl.innerHTML = createLineChart(aggregatePayload.series || [], "droppedBeforeCoursePercent", "serial", true);
  chartAfterPercentEl.innerHTML = createLineChart(aggregatePayload.series || [], "droppedDuringPitchWindowPercent", "serial", true);
  chartStayedPercentEl.innerHTML = createLineChart(aggregatePayload.series || [], "stayedTillEndPercent", "serial", true);
  if (currentPayload) {
    renderFifteenMinuteAnalysis(currentPayload);
  }
}

let currentReportPath = "";

function render(payload) {
  currentPayload = payload;
  renderSummary(payload);
  renderTables(payload);
  renderFifteenMinuteAnalysis(payload);
  renderPaymentAttendance();
  renderHistoricalPaymentAttendance();
  renderConversion();
  renderReportTiles();
}

async function loadManifest() {
  const response = await fetch(`data/index.json?ts=${Date.now()}`);
  if (!response.ok) {
    throw new Error("No webinar manifest found.");
  }

  const payload = await response.json();
  webinarManifest = payload.webinars || [];
  webinarSelectEl.innerHTML = webinarManifest
    .map(
      (webinar) => `
        <option value="${escapeHtml(webinar.reportJson)}">
          ${escapeHtml(`${webinar.serial}. ${webinar.weekday} | ${webinar.date} | ${webinar.durationLabel}`)}
        </option>
      `
    )
    .join("");
}

async function loadAggregate() {
  const response = await fetch(`data/aggregate.json?ts=${Date.now()}`);
  if (!response.ok) {
    throw new Error("No aggregate report found.");
  }

  aggregatePayload = await response.json();
  renderAggregate();
}

async function loadPaymentAttendance() {
  const response = await fetch(`data/payment-attendance-report.json?ts=${Date.now()}`);
  if (!response.ok) {
    paymentAttendancePayload = null;
    return;
  }

  paymentAttendancePayload = await response.json();
}

async function loadHistoricalReportPayloads() {
  const responses = await Promise.all(
    webinarManifest.map(async (webinar) => {
      try {
        const response = await fetch(`${webinar.reportJson}?ts=${Date.now()}`);
        return response.ok ? response.json() : null;
      } catch {
        return null;
      }
    })
  );
  historicalReportPayloads = responses.filter(Boolean);
}

async function loadReport(reportJsonPath) {
  const response = await fetch(`${reportJsonPath}?ts=${Date.now()}`);
  if (!response.ok) {
    throw new Error("No published webinar report found yet.");
  }

  currentReportPath = reportJsonPath;
  const payload = await response.json();
  render(payload);
}

async function refreshCurrentReport() {
  if (!currentReportPath) {
    return;
  }
  const selectedReportPath = currentReportPath;
  await Promise.all([loadAggregate(), loadPaymentAttendance()]);
  await loadHistoricalReportPayloads();
  await loadReport(selectedReportPath);
}

function setActiveView(viewId) {
  activeViewByGroup[activeReportGroup] = viewId;
  for (const view of reportViews) {
    view.classList.toggle("is-active", view.id === viewId);
  }
  renderReportTiles();
}

function setActiveGroup(group) {
  activeReportGroup = group;
  for (const button of groupButtons) {
    button.classList.toggle("is-active", button.dataset.reportGroup === group);
  }
  overviewPanelEl.style.display = group === "webinar" ? "" : "none";
  renderReportTiles();
  setActiveView(activeViewByGroup[group]);
}

function attachInteractions() {
  webinarSelectEl.addEventListener("change", async (event) => {
    await loadReport(event.target.value);
  });

  for (const button of groupButtons) {
    button.addEventListener("click", () => {
      setActiveGroup(button.dataset.reportGroup);
    });
  }

  reportTilesEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) {
      return;
    }
    setActiveView(button.dataset.view);
  });

  paymentKpisEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-payment-report]");
    if (!button) {
      return;
    }
    activePaymentReportKey = button.dataset.paymentReport;
    renderPaymentAttendance();
  });
}

async function init() {
  await Promise.all([loadManifest(), loadAggregate(), loadPaymentAttendance()]);
  await loadHistoricalReportPayloads();
  attachInteractions();
  if (webinarManifest[0]) {
    webinarSelectEl.value = webinarManifest[0].reportJson;
    await loadReport(webinarManifest[0].reportJson);
  }
  setActiveGroup("webinar");
  window.setInterval(() => {
    refreshCurrentReport().catch(() => {
      // Keep the current dashboard visible if a background refresh races with a file write.
    });
  }, 1000);
}

init().catch((error) => {
  uniqueParticipantsTableEl.innerHTML = `<p class="empty">${escapeHtml(error.message || "Failed to load dashboard.")}</p>`;
});
