const istTimeZone = "Asia/Kolkata";

const webinarSelectEl = document.getElementById("webinarSelect");
const uniqueParticipantsEl = document.getElementById("uniqueParticipants");
const webinarDateEl = document.getElementById("webinarDate");
const courseRevealTimeEl = document.getElementById("courseRevealTime");
const effectiveDurationEl = document.getElementById("effectiveDuration");
const droppedBeforeCourseMetricEl = document.getElementById("droppedBeforeCourseMetric");
const droppedAfterCourseMetricEl = document.getElementById("droppedAfterCourseMetric");
const stayedTillEndMetricEl = document.getElementById("stayedTillEndMetric");
const effectiveWindowTextEl = document.getElementById("effectiveWindowText");
const courseRevealSourceEl = document.getElementById("courseRevealSource");
const chatAvailabilityEl = document.getElementById("chatAvailability");
const uniqueParticipantsTableEl = document.getElementById("uniqueParticipantsTable");
const beforeCourseTableEl = document.getElementById("beforeCourseTable");
const afterCourseTableEl = document.getElementById("afterCourseTable");
const stayedTillEndTableEl = document.getElementById("stayedTillEndTable");
const tileButtons = [...document.querySelectorAll(".tile-button")];

let webinarManifest = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateIst(value) {
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

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
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
    <table>
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
    escapeHtml(formatDateIst(participant.firstJoinTime)),
    escapeHtml(formatDateIst(participant.finalDropTime)),
    escapeHtml(participant.totalPresentFormatted || formatDuration(participant.totalPresentSeconds)),
    escapeHtml(formatPercent(participant.attendancePercent)),
    escapeHtml(String(participant.joins || 0)),
  ]);
}

function renderTables(payload) {
  const headers = [
    "Name",
    "Email",
    "Phone Number",
    "First Join (IST)",
    "Final Drop (IST)",
    "Total Present",
    "Attendance %",
    "Joins",
  ];

  uniqueParticipantsTableEl.innerHTML = buildTable(
    headers,
    participantRows(payload.uniqueParticipants || []),
    "No unique participants found."
  );
  beforeCourseTableEl.innerHTML = buildTable(
    headers,
    participantRows(payload.cohorts?.droppedBeforeCourse || []),
    "Nobody dropped before the course reveal cutoff."
  );
  afterCourseTableEl.innerHTML = buildTable(
    headers,
    participantRows(payload.cohorts?.droppedDuringPitchWindow || []),
    "Nobody dropped in the 30-minute window after course reveal."
  );
  stayedTillEndTableEl.innerHTML = buildTable(
    headers,
    participantRows(payload.cohorts?.stayedTillEnd || []),
    "No participants matched the stayed-till-end rule."
  );
}

function renderSummary(payload) {
  uniqueParticipantsEl.textContent = String(payload.summary?.uniqueParticipants || 0);
  webinarDateEl.textContent = formatDateOnlyIst(payload.webinar?.startTime);
  courseRevealTimeEl.textContent = formatDateIst(payload.courseReveal?.time);
  effectiveDurationEl.textContent = payload.effectiveWindow?.durationFormatted || "-";

  renderMetricText(
    droppedBeforeCourseMetricEl,
    payload.summary?.droppedBeforeCourseCount || 0,
    payload.summary?.droppedBeforeCoursePercent || 0
  );
  renderMetricText(
    droppedAfterCourseMetricEl,
    payload.summary?.droppedDuringPitchWindowCount || 0,
    payload.summary?.droppedDuringPitchWindowPercent || 0
  );
  renderMetricText(
    stayedTillEndMetricEl,
    payload.summary?.stayedTillEndCount || 0,
    payload.summary?.stayedTillEndPercent || 0
  );

  effectiveWindowTextEl.textContent = `${formatDateIst(payload.effectiveWindow?.startTime)} to ${formatDateIst(payload.effectiveWindow?.endTime)}`;
  courseRevealSourceEl.textContent =
    payload.courseReveal?.source === "admin_chat_detected"
      ? "Detected from admin chat"
      : "Fallback 8:40 PM IST";
  chatAvailabilityEl.textContent = `${payload.chatSummary?.totalChatMessages || 0} chat messages, ${payload.chatSummary?.attendeesWithChatComments || 0} attendees with saved chat`;
}

function render(payload) {
  renderSummary(payload);
  renderTables(payload);
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

async function loadReport(reportJsonPath) {
  try {
    const response = await fetch(`${reportJsonPath}?ts=${Date.now()}`);
    if (!response.ok) {
      throw new Error("No published webinar report found yet.");
    }

    const payload = await response.json();
    render(payload);
  } catch (error) {
    uniqueParticipantsTableEl.innerHTML = `<p class="empty">${escapeHtml(error.message || "Failed to load webinar report.")}</p>`;
  }
}

function attachInteractions() {
  webinarSelectEl.addEventListener("change", (event) => {
    loadReport(event.target.value);
  });

  for (const button of tileButtons) {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
}

async function init() {
  await loadManifest();
  attachInteractions();
  if (webinarManifest[0]) {
    webinarSelectEl.value = webinarManifest[0].reportJson;
    await loadReport(webinarManifest[0].reportJson);
  }
}

init();
