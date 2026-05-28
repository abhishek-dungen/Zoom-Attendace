import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const webinarId = process.env.WEBINAR_ID || process.argv[2];
const outputDir = path.resolve("site", "data");
const requiredEnvVars = [
  "ZOOM_ACCOUNT_ID",
  "ZOOM_CLIENT_ID",
  "ZOOM_CLIENT_SECRET",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireEnv() {
  const missing = requiredEnvVars.filter((name) => !process.env[name]);
  if (missing.length) {
    fail(`Missing environment variables: ${missing.join(", ")}`);
  }
}

function createBasicAuthHeader() {
  const credentials = `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`;
  return Buffer.from(credentials).toString("base64");
}

async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type: "account_credentials",
    account_id: process.env.ZOOM_ACCOUNT_ID,
  });

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${createBasicAuthHeader()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    fail(data.reason || data.message || "Failed to create Zoom access token.");
  }

  return data.access_token;
}

async function zoomRequest(token, endpoint, query = {}) {
  const url = new URL(`https://api.zoom.us/v2${endpoint}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(data.reason || data.message || `Zoom request failed: ${response.status}`);
  }

  return data;
}

function normalizeParticipant(participant = {}) {
  return {
    id: participant.id || participant.user_id || "",
    name: participant.name || participant.user_name || "",
    email: participant.user_email || participant.email || "",
    joinTime: participant.join_time || "",
    leaveTime: participant.leave_time || "",
    durationMinutes: Number(participant.duration || 0),
    attentivenessScore: participant.attentiveness_score ?? "",
    customerKey: participant.customer_key || "",
    status: participant.status || "",
  };
}

async function getParticipants(token, id) {
  const participants = [];
  let nextPageToken = "";

  do {
    const page = await zoomRequest(
      token,
      `/report/webinars/${encodeURIComponent(id)}/participants`,
      {
        page_size: 300,
        next_page_token: nextPageToken,
      }
    );

    const rows = Array.isArray(page.participants) ? page.participants : [];
    participants.push(...rows.map(normalizeParticipant));
    nextPageToken = page.next_page_token || "";
  } while (nextPageToken);

  return participants.sort(
    (left, right) => Number(right.durationMinutes || 0) - Number(left.durationMinutes || 0)
  );
}

function buildCsvRows(rows) {
  const headers = [
    "Name",
    "Email",
    "Join Time",
    "Leave Time",
    "Duration (min)",
    "Attentiveness Score",
    "Status",
    "Customer Key",
  ];

  const csvRows = rows.map((row) => [
    row.name,
    row.email,
    row.joinTime,
    row.leaveTime,
    row.durationMinutes,
    row.attentivenessScore,
    row.status,
    row.customerKey,
  ]);

  return [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

async function writeOutputs(payload) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "latest.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "latest.csv"), `${buildCsvRows(payload.participants)}\n`);
}

async function main() {
  requireEnv();

  if (!webinarId) {
    fail("Provide a webinar ID with WEBINAR_ID=... or as the first CLI argument.");
  }

  const token = await getAccessToken();
  const webinar = await zoomRequest(token, `/report/webinars/${encodeURIComponent(webinarId)}`);
  const participants = await getParticipants(token, webinarId);
  const totalDurationMinutes = participants.reduce((sum, row) => sum + row.durationMinutes, 0);

  const payload = {
    generatedAt: new Date().toISOString(),
    webinar: {
      id: webinar.id || webinarId,
      uuid: webinar.uuid || "",
      topic: webinar.topic || "",
      hostName: webinar.user_name || "",
      hostEmail: webinar.user_email || "",
      startTime: webinar.start_time || "",
      endTime: webinar.end_time || "",
      durationMinutes: Number(webinar.duration || 0),
      participantsCount: webinar.participants_count ?? participants.length,
    },
    summary: {
      attendees: participants.length,
      totalDurationMinutes,
      averageDurationMinutes: participants.length
        ? Number((totalDurationMinutes / participants.length).toFixed(2))
        : 0,
    },
    participants,
  };

  await writeOutputs(payload);
  console.log(`Attendance written for webinar ${payload.webinar.id} with ${participants.length} attendees.`);
}

main().catch((error) => fail(error.message || "Unexpected error."));
