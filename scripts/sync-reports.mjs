import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);
const outputDir = path.resolve("site", "data");
const recentDays = Number(process.env.REPORT_SYNC_DAYS || 60);

function fail(message) {
  console.error(message);
  process.exit(1);
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
    throw new Error(data.reason || data.message || `Zoom request failed: ${response.status}`);
  }

  return data;
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(isoString) {
  const date = parseDate(isoString);
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatWeekday(isoString) {
  const date = parseDate(isoString);
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(date);
}

function formatDurationLabel(minutes) {
  const totalMinutes = Number(minutes || 0);
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (hours === 0) {
    return `${remainingMinutes}m`;
  }
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getHistoryMeetings(token) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - recentDays);
  const from = fromDate.toISOString().slice(0, 10);
  const meetings = [];
  let nextPageToken = "";

  do {
    const data = await zoomRequest(token, "/report/history_meetings", {
      from,
      to,
      page_size: 300,
      next_page_token: nextPageToken,
    });

    meetings.push(...(data.history_meetings || []));
    nextPageToken = data.next_page_token || "";
  } while (nextPageToken);

  return meetings;
}

function selectPublishableWebinars(historyMeetings) {
  return historyMeetings
    .filter((meeting) => meeting.type === "Webinar")
    .filter((meeting) => Number(meeting.duration || 0) >= 30 || Number(meeting.participants || 0) >= 10)
    .sort((left, right) => new Date(right.start_time) - new Date(left.start_time));
}

async function generateReport(entry) {
  const startDate = parseDate(entry.start_time.replace(" ", "T") + "Z");
  const dateSlug = startDate ? startDate.toISOString().slice(0, 10) : "unknown-date";
  const basename = slugify(`${dateSlug}-${entry.meeting_id}`);

  await execFileAsync(
    "node",
    ["scripts/fetch-attendance.mjs", String(entry.meeting_id), entry.meeting_uuid],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OUTPUT_BASENAME: basename,
      },
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  const reportPath = path.join(outputDir, `${basename}.json`);
  const payload = JSON.parse(await fs.readFile(reportPath, "utf8"));
  return {
    serial: 0,
    webinarId: payload.webinar.id,
    webinarUuid: payload.webinar.uuid,
    basename,
    topic: payload.webinar.topic,
    date: formatDateLabel(payload.webinar.startTime),
    weekday: formatWeekday(payload.webinar.startTime),
    durationLabel: payload.effectiveWindow?.durationFormatted || formatDurationLabel(payload.webinar.durationMinutes),
    startTime: payload.webinar.startTime,
    reportJson: `data/${basename}.json`,
    uniqueCsv: `data/${basename}.csv`,
    beforeCourseCsv: `data/${basename}-before-course.csv`,
    afterCourseCsv: `data/${basename}-after-course-30m.csv`,
    stayedCsv: `data/${basename}-stayed-till-end.csv`,
  };
}

async function main() {
  const token = await getAccessToken();
  const historyMeetings = await getHistoryMeetings(token);
  const webinars = selectPublishableWebinars(historyMeetings);

  if (!webinars.length) {
    fail("No webinar history found to publish.");
  }

  await fs.mkdir(outputDir, { recursive: true });
  const manifest = [];

  for (const [index, webinar] of webinars.entries()) {
    const report = await generateReport(webinar);
    report.serial = index + 1;
    manifest.push(report);
  }

  await fs.writeFile(path.join(outputDir, "index.json"), `${JSON.stringify({ webinars: manifest }, null, 2)}\n`);

  const latest = manifest[0];
  const latestPayload = await fs.readFile(path.join(outputDir, path.basename(latest.reportJson)), "utf8");
  await fs.writeFile(path.join(outputDir, "latest.json"), latestPayload);
  await fs.copyFile(path.join(outputDir, path.basename(latest.uniqueCsv)), path.join(outputDir, "latest.csv"));
  await fs.copyFile(path.join(outputDir, path.basename(latest.beforeCourseCsv)), path.join(outputDir, "latest-before-course.csv"));
  await fs.copyFile(path.join(outputDir, path.basename(latest.afterCourseCsv)), path.join(outputDir, "latest-after-course-30m.csv"));
  await fs.copyFile(path.join(outputDir, path.basename(latest.stayedCsv)), path.join(outputDir, "latest-stayed-till-end.csv"));

  console.log(`Published ${manifest.length} webinar reports. Latest webinar: ${latest.webinarId}`);
}

main().catch((error) => fail(error.message || "Failed to sync webinar reports."));
