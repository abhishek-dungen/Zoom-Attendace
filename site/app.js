const summary = document.getElementById("summary");
const statusEl = document.getElementById("status");
const csvLink = document.getElementById("csvLink");
const resultsBody = document.getElementById("resultsBody");

const topicEl = document.getElementById("topic");
const webinarIdEl = document.getElementById("webinarId");
const attendeesEl = document.getElementById("attendees");
const generatedAtEl = document.getElementById("generatedAt");

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function renderTable(participants) {
  if (!participants.length) {
    resultsBody.innerHTML = '<tr><td colspan="7" class="empty">No participants found in the latest published file.</td></tr>';
    return;
  }

  resultsBody.innerHTML = participants
    .map(
      (participant) => `
        <tr>
          <td>${participant.name || "-"}</td>
          <td>${participant.email || "-"}</td>
          <td>${formatDate(participant.joinTime)}</td>
          <td>${formatDate(participant.leaveTime)}</td>
          <td>${participant.durationMinutes || 0}</td>
          <td>${participant.attentivenessScore || "-"}</td>
          <td>${participant.status || "-"}</td>
        </tr>
      `
    )
    .join("");
}

function render(payload) {
  summary.classList.remove("hidden");
  topicEl.textContent = payload.webinar.topic || "-";
  webinarIdEl.textContent = payload.webinar.id || "-";
  attendeesEl.textContent = String(payload.summary.attendees || 0);
  generatedAtEl.textContent = formatDate(payload.generatedAt);
  csvLink.classList.remove("hidden");
  renderTable(payload.participants || []);
  setStatus(`Loaded attendance for webinar ${payload.webinar.id}.`);
}

async function loadAttendance() {
  try {
    const response = await fetch(`data/latest.json?ts=${Date.now()}`);
    if (!response.ok) {
      throw new Error("No published attendance file found yet.");
    }

    const payload = await response.json();
    render(payload);
  } catch (error) {
    setStatus(error.message, true);
  }
}

loadAttendance();
