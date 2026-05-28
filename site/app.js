const summary = document.getElementById("summary");
const statusEl = document.getElementById("status");
const csvLink = document.getElementById("csvLink");
const resultsBody = document.getElementById("resultsBody");

const topicEl = document.getElementById("topic");
const webinarIdEl = document.getElementById("webinarId");
const uniqueAttendeesEl = document.getElementById("uniqueAttendees");
const sessionRecordsEl = document.getElementById("sessionRecords");
const generatedAtEl = document.getElementById("generatedAt");

function getUniqueAttendeeCount(participants) {
  const seen = new Set();

  for (const participant of participants) {
    const email = (participant.email || "").trim().toLowerCase();
    const name = (participant.name || "").trim().toLowerCase();
    const key = email || `name:${name}`;
    seen.add(key);
  }

  return seen.size;
}

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

function formatDuration(seconds) {
  const totalSeconds = Number(seconds || 0);
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

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function renderTable(participants) {
  const sortedParticipants = [...participants].sort(
    (left, right) => Number(right.durationMinutes || 0) - Number(left.durationMinutes || 0)
  );

  if (!sortedParticipants.length) {
    resultsBody.innerHTML = '<tr><td colspan="7" class="empty">No participants found in the latest published file.</td></tr>';
    return;
  }

  resultsBody.innerHTML = sortedParticipants
    .map(
      (participant) => `
        <tr>
          <td>${participant.name || "-"}</td>
          <td>${participant.email || "-"}</td>
          <td>${formatDate(participant.joinTime)}</td>
          <td>${formatDate(participant.leaveTime)}</td>
          <td>${formatDuration(participant.durationMinutes)}</td>
          <td>${participant.attentivenessScore || "-"}</td>
          <td>${participant.status || "-"}</td>
        </tr>
      `
    )
    .join("");
}

function render(payload) {
  const participants = payload.participants || [];
  const uniqueAttendees = getUniqueAttendeeCount(participants);

  summary.classList.remove("hidden");
  if (topicEl) {
    topicEl.textContent = payload.webinar.topic || "-";
  }
  if (webinarIdEl) {
    webinarIdEl.textContent = payload.webinar.id || "-";
  }
  if (uniqueAttendeesEl) {
    uniqueAttendeesEl.textContent = String(uniqueAttendees);
  }
  if (sessionRecordsEl) {
    sessionRecordsEl.textContent = String(participants.length);
  }
  if (generatedAtEl) {
    generatedAtEl.textContent = formatDate(payload.generatedAt);
  }
  if (csvLink) {
    csvLink.classList.remove("hidden");
  }
  renderTable(participants);
  setStatus(`Loaded ${uniqueAttendees} unique attendees from ${participants.length} Zoom session records for webinar ${payload.webinar.id}.`);
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
