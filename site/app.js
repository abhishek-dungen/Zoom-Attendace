const istTimeZone = "Asia/Kolkata";

const webinarSelectEl = document.getElementById("webinarSelect");
const uniqueParticipantsEl = document.getElementById("uniqueParticipants");
const webinarDateEl = document.getElementById("webinarDate");
const courseRevealTimeEl = document.getElementById("courseRevealTime");
const effectiveDurationEl = document.getElementById("effectiveDuration");
const droppedBeforeCourseMetricEl = document.getElementById("droppedBeforeCourseMetric");
const droppedAfterCourseMetricEl = document.getElementById("droppedAfterCourseMetric");
const stayedTillEndMetricEl = document.getElementById("stayedTillEndMetric");
const lengthSourceTextEl = document.getElementById("lengthSourceText");
const courseRevealSourceEl = document.getElementById("courseRevealSource");
const uniqueParticipantsTableEl = document.getElementById("uniqueParticipantsTable");
const beforeCourseTableEl = document.getElementById("beforeCourseTable");
const afterCourseTableEl = document.getElementById("afterCourseTable");
const stayedTillEndTableEl = document.getElementById("stayedTillEndTable");
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
const chartFifteenMinuteSelectedEl = document.getElementById("chartFifteenMinuteSelected");
const chartFifteenMinuteHistoricalEl = document.getElementById("chartFifteenMinuteHistorical");
const fifteenMinuteSelectedNoteEl = document.getElementById("fifteenMinuteSelectedNote");
const fifteenMinuteHistoricalNoteEl = document.getElementById("fifteenMinuteHistoricalNote");
const tileButtons = [...document.querySelectorAll(".tile-button")];
const reportViews = [...document.querySelectorAll(".report-view")];

let webinarManifest = [];
let aggregatePayload = null;
let currentPayload = null;

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

function formatAverageNumber(value) {
  return Number(value || 0).toFixed(2);
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

function renderSummary(payload) {
  uniqueParticipantsEl.textContent = String(payload.summary?.uniqueParticipants || 0);
  webinarDateEl.textContent = formatDateOnlyIst(payload.webinar?.startTime);
  courseRevealTimeEl.textContent = formatDateTimeIst(payload.courseReveal?.time);
  effectiveDurationEl.textContent = payload.effectiveWindow?.durationFormatted || "-";

  renderMetricText(droppedBeforeCourseMetricEl, payload.summary?.droppedBeforeCourseCount || 0, payload.summary?.droppedBeforeCoursePercent || 0);
  renderMetricText(droppedAfterCourseMetricEl, payload.summary?.droppedDuringPitchWindowCount || 0, payload.summary?.droppedDuringPitchWindowPercent || 0);
  renderMetricText(stayedTillEndMetricEl, payload.summary?.stayedTillEndCount || 0, payload.summary?.stayedTillEndPercent || 0);

  lengthSourceTextEl.textContent =
    payload.effectiveWindow?.startSource === "first_participant_chat_detected"
      ? "Calculated from first participant chat"
      : "Calculated from webinar start time";
  courseRevealSourceEl.textContent =
    payload.courseReveal?.source === "admin_chat_detected"
      ? "Detected from admin chat"
      : "Fallback 8:40 PM IST";

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

  const width = Math.max(760, series.length * 82);
  const height = 280;
  const paddingLeft = 36;
  const paddingRight = 16;
  const chartTop = 24;
  const chartBottom = 76;
  const chartHeight = height - chartTop - chartBottom;
  const chartWidth = width - paddingLeft - paddingRight;
  const values = series.map((item) => Number(item[valueKey] || 0));
  const maxValue = Math.max(...values, 1);
  const gap = 16;
  const barWidth = Math.max(24, (chartWidth - gap * (series.length - 1)) / series.length);
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
          <text x="${x + barWidth / 2}" y="${height - 34}" text-anchor="middle" font-size="10" fill="#6b625d">${escapeHtml(
            String(item[labelKey] || "")
          )}</text>
          <text x="${x + barWidth / 2}" y="${height - 18}" text-anchor="middle" font-size="10" fill="#8b7a6d">${escapeHtml(
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

function renderFifteenMinuteAnalysis(payload) {
  const buckets = payload?.fifteenMinuteAnalysis?.buckets || [];
  const selectedSeries = buckets.map((bucket) => ({
    slotLabel: `Slot ${bucket.slotNumber}`,
    timeLabel: bucket.timeRangeLabel,
    permanentDropouts: bucket.permanentDropouts,
  }));
  chartFifteenMinuteSelectedEl.innerHTML = createBarChart(selectedSeries, "permanentDropouts", "timeLabel", false);
  fifteenMinuteSelectedNoteEl.textContent = buckets.length
    ? `Permanent dropouts are counted in 15-minute slots from ${formatTimeOnlyIst(payload.effectiveWindow?.startTime)} to ${formatTimeOnlyIst(payload.effectiveWindow?.endTime)}.`
    : "No 15-minute dropout data available for this webinar.";

  const historical = aggregatePayload?.historicalFifteenMinuteAnalysis || {};
  const historicalBuckets = historical.buckets || [];
  const historicalSeries = historicalBuckets.map((bucket) => ({
    slotLabel: `Slot ${bucket.slotNumber}`,
    timeLabel: bucket.offsetRangeLabel,
    permanentDropoutPercent: bucket.permanentDropoutPercent,
  }));
  chartFifteenMinuteHistoricalEl.innerHTML = createBarChart(historicalSeries, "permanentDropoutPercent", "timeLabel", true);

  if (!historicalBuckets.length) {
    fifteenMinuteHistoricalNoteEl.textContent = "No historical 15-minute data available yet.";
    return;
  }

  const highest = historical.highestDropSlot;
  const lowest = historical.lowestDropSlot;
  const parts = [];
  if (highest) {
    parts.push(`Highest historical drop: ${highest.offsetRangeLabel} (${formatPercent(highest.permanentDropoutPercent)})`);
  }
  if (lowest) {
    parts.push(`Lowest historical drop: ${lowest.offsetRangeLabel} (${formatPercent(lowest.permanentDropoutPercent)})`);
  }
  parts.push("Historical percentages use only webinars that lasted into each slot.");
  fifteenMinuteHistoricalNoteEl.textContent = parts.join(" • ");
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

async function loadReport(reportJsonPath) {
  const response = await fetch(`${reportJsonPath}?ts=${Date.now()}`);
  if (!response.ok) {
    throw new Error("No published webinar report found yet.");
  }

  currentReportPath = reportJsonPath;
  const payload = await response.json();
  render(payload);
}

function setActiveView(viewId) {
  for (const button of tileButtons) {
    button.classList.toggle("is-active", button.dataset.view === viewId);
  }
  for (const view of reportViews) {
    view.classList.toggle("is-active", view.id === viewId);
  }
}

function attachInteractions() {
  webinarSelectEl.addEventListener("change", async (event) => {
    await loadReport(event.target.value);
  });

  for (const button of tileButtons) {
    button.addEventListener("click", () => {
      setActiveView(button.dataset.view);
    });
  }
}

async function init() {
  await Promise.all([loadManifest(), loadAggregate()]);
  attachInteractions();
  if (webinarManifest[0]) {
    webinarSelectEl.value = webinarManifest[0].reportJson;
    await loadReport(webinarManifest[0].reportJson);
  }
  setActiveView("uniqueParticipantsView");
}

init().catch((error) => {
  uniqueParticipantsTableEl.innerHTML = `<p class="empty">${escapeHtml(error.message || "Failed to load dashboard.")}</p>`;
});
