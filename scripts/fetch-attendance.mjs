import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const webinarId = process.env.WEBINAR_ID || process.argv[2];
const webinarUuid = process.env.WEBINAR_UUID || process.argv[3] || "";
const outputBasename = process.env.OUTPUT_BASENAME || "latest";
const outputDir = path.resolve("site", "data");
const istTimeZone = "Asia/Kolkata";
const pitchWindowMinutes = 30;
const fallbackCourseRevealHourIst = 20;
const fallbackCourseRevealMinuteIst = 40;
const stayedTillEndToleranceSeconds = 5 * 60;
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
    const error = new Error(data.reason || data.message || `Zoom request failed: ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoString(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

function getIstDateParts(isoString) {
  const date = parseIsoDate(isoString);
  if (!date) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: istTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function formatDateIst(isoString) {
  const date = parseIsoDate(isoString);
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: istTimeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDurationHoursMinutes(totalSeconds) {
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

function addSeconds(isoString, seconds) {
  const date = parseIsoDate(isoString);
  if (!date) {
    return "";
  }

  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function addMinutes(isoString, minutes) {
  return addSeconds(isoString, minutes * 60);
}

function buildFallbackCourseRevealTime(webinarStartTime) {
  const parts = getIstDateParts(webinarStartTime);
  if (!parts) {
    return "";
  }

  return `${parts.year}-${parts.month}-${parts.day}T${String(fallbackCourseRevealHourIst).padStart(2, "0")}:${String(fallbackCourseRevealMinuteIst).padStart(2, "0")}:00+05:30`;
}

function convertOffsetToAbsoluteTime(webinarStartTime, offsetTime) {
  const webinarStart = parseIsoDate(webinarStartTime);
  const match = String(offsetTime || "").match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!webinarStart || !match) {
    return "";
  }

  const [, hours, minutes, seconds] = match;
  const totalSeconds = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return new Date(webinarStart.getTime() + totalSeconds * 1000).toISOString();
}

function normalizeParticipant(participant = {}) {
  return {
    id: participant.id || participant.user_id || "",
    name: participant.name || participant.user_name || "",
    email: participant.user_email || participant.email || "",
    phoneNumber:
      participant.phone_number ||
      participant.phone ||
      participant.user_phone ||
      participant.registrant_phone ||
      "",
    joinTime: participant.join_time || "",
    leaveTime: participant.leave_time || "",
    durationSeconds: Number(participant.duration || 0),
    attentivenessScore: participant.attentiveness_score ?? "",
    customerKey: participant.customer_key || "",
    status: participant.status || "",
  };
}

function attendeeKeyFromParticipant(participant = {}) {
  const email = normalizeText(participant.email);
  if (email) {
    return `email:${email}`;
  }

  const phone = normalizeText(participant.phoneNumber);
  if (phone) {
    return `phone:${phone}`;
  }

  return `name:${normalizeText(participant.name)}`;
}

function attendeeKeyFromIdentity(name = "") {
  return `name:${normalizeText(name)}`;
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

  return participants;
}

async function getRecordingFiles(token, id, uuid = "") {
  const recordingTarget = uuid || id;
  const data = await zoomRequest(token, `/meetings/${encodeURIComponent(recordingTarget)}/recordings`);
  return Array.isArray(data.recording_files) ? data.recording_files : [];
}

function parseChatTranscript(text) {
  const entries = [];
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  let current = null;

  const pushCurrent = () => {
    if (!current) {
      return;
    }

    current.message = current.message.trim();
    if (current.message) {
      entries.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const match = line.match(/^(\d{2}:\d{2}:\d{2})\t([^:]+):\t?(.*)$/);
    if (match) {
      pushCurrent();
      current = {
        offsetTime: match[1],
        senderName: match[2].trim(),
        message: match[3] || "",
      };
      continue;
    }

    if (!current) {
      continue;
    }

    current.message += current.message ? `\n${line}` : line;
  }

  pushCurrent();
  return entries;
}

async function getChatMessages(token, id, uuid = "", webinarStartTime = "") {
  let recordingFiles = [];
  try {
    recordingFiles = await getRecordingFiles(token, id, uuid);
  } catch (error) {
    if (error.status === 404) {
      return [];
    }
    throw error;
  }

  const chatFile = recordingFiles.find((file) => file.file_type === "CHAT" && file.download_url);
  if (!chatFile) {
    return [];
  }

  const response = await fetch(chatFile.download_url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    fail(`Failed to download webinar chat transcript: ${text}`);
  }

  return parseChatTranscript(text).map((entry) => ({
    ...entry,
    absoluteTime: convertOffsetToAbsoluteTime(webinarStartTime, entry.offsetTime),
  }));
}

function getOverlapSeconds(joinTime, leaveTime, windowStartTime, windowEndTime) {
  const joinDate = parseIsoDate(joinTime);
  const leaveDate = parseIsoDate(leaveTime);
  const windowStartDate = parseIsoDate(windowStartTime);
  const windowEndDate = parseIsoDate(windowEndTime);

  if (!joinDate || !leaveDate || !windowStartDate || !windowEndDate) {
    return 0;
  }

  const overlapStart = Math.max(joinDate.getTime(), windowStartDate.getTime());
  const overlapEnd = Math.min(leaveDate.getTime(), windowEndDate.getTime());
  if (overlapEnd <= overlapStart) {
    return 0;
  }

  return Math.floor((overlapEnd - overlapStart) / 1000);
}

function getClippedInterval(joinTime, leaveTime, windowStartTime, windowEndTime) {
  const joinDate = parseIsoDate(joinTime);
  const leaveDate = parseIsoDate(leaveTime);
  const windowStartDate = parseIsoDate(windowStartTime);
  const windowEndDate = parseIsoDate(windowEndTime);

  if (!joinDate || !leaveDate || !windowStartDate || !windowEndDate) {
    return null;
  }

  const start = Math.max(joinDate.getTime(), windowStartDate.getTime());
  const end = Math.min(leaveDate.getTime(), windowEndDate.getTime());
  if (end <= start) {
    return null;
  }

  return { start, end };
}

function getUnionDurationSeconds(intervals) {
  if (!intervals.length) {
    return 0;
  }

  const sortedIntervals = [...intervals].sort((left, right) => left.start - right.start);
  const merged = [sortedIntervals[0]];

  for (const interval of sortedIntervals.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
      continue;
    }

    merged.push({ ...interval });
  }

  return merged.reduce((total, interval) => total + Math.floor((interval.end - interval.start) / 1000), 0);
}

function buildEffectiveWebinarWindow(webinar, chatMessages) {
  const firstChatTime = chatMessages
    .map((message) => message.absoluteTime)
    .find((absoluteTime) => Boolean(absoluteTime));

  return {
    effectiveStartTime: firstChatTime || webinar.start_time || "",
    effectiveEndTime: webinar.end_time || "",
    effectiveStartSource: firstChatTime ? "first_chat_detected" : "webinar_start_time",
  };
}

function detectCourseReveal(chatMessages, webinarStartTime, hostName) {
  const hostNameKey = normalizeText(hostName);
  const keywords = [
    "http",
    "https",
    "discount",
    "price",
    "enroll",
    "course",
    "₹",
    "rs",
    "payu",
  ];

  const matchingMessage = chatMessages.find((message) => {
    if (normalizeText(message.senderName) !== hostNameKey) {
      return false;
    }

    const body = normalizeText(message.message);
    return keywords.some((keyword) => body.includes(keyword));
  });

  if (matchingMessage?.absoluteTime) {
    return {
      courseRevealTime: matchingMessage.absoluteTime,
      courseRevealSource: "admin_chat_detected",
      courseRevealOffsetTime: matchingMessage.offsetTime,
      courseRevealMessage: matchingMessage.message,
    };
  }

  return {
    courseRevealTime: buildFallbackCourseRevealTime(webinarStartTime),
    courseRevealSource: "fallback_20_40_ist",
    courseRevealOffsetTime: "",
    courseRevealMessage: "",
  };
}

function buildUniqueParticipants(participants, webinarWindow, webinarEndTime) {
  const attendeeMap = new Map();
  const webinarEndFallback = webinarEndTime || "";

  for (const participant of participants) {
    const key = attendeeKeyFromParticipant(participant);
    if (!attendeeMap.has(key)) {
      attendeeMap.set(key, {
        key,
        name: participant.name || "",
        email: participant.email || "",
        phoneNumber: participant.phoneNumber || "",
        firstJoinTime: participant.joinTime || "",
        finalDropTime: participant.leaveTime || webinarEndFallback,
        joins: 0,
        totalSessionSeconds: 0,
        effectiveIntervals: [],
      });
    }

    const attendee = attendeeMap.get(key);
    attendee.joins += 1;
    attendee.totalSessionSeconds += Number(participant.durationSeconds || 0);

    if (!attendee.phoneNumber && participant.phoneNumber) {
      attendee.phoneNumber = participant.phoneNumber;
    }

    const firstJoinDate = parseIsoDate(attendee.firstJoinTime);
    const participantJoinDate = parseIsoDate(participant.joinTime);
    if (!firstJoinDate || (participantJoinDate && participantJoinDate < firstJoinDate)) {
      attendee.firstJoinTime = participant.joinTime || attendee.firstJoinTime;
    }

    const attendeeDropDate = parseIsoDate(attendee.finalDropTime);
    const participantDropDate = parseIsoDate(participant.leaveTime || webinarEndFallback);
    if (!attendeeDropDate || (participantDropDate && participantDropDate > attendeeDropDate)) {
      attendee.finalDropTime = participant.leaveTime || webinarEndFallback || attendee.finalDropTime;
    }

    const clippedInterval = getClippedInterval(
      participant.joinTime,
      participant.leaveTime || webinarEndFallback,
      webinarWindow.effectiveStartTime,
      webinarWindow.effectiveEndTime
    );
    if (clippedInterval) {
      attendee.effectiveIntervals.push(clippedInterval);
    }
  }

  const effectiveDurationSeconds = getOverlapSeconds(
    webinarWindow.effectiveStartTime,
    webinarWindow.effectiveEndTime,
    webinarWindow.effectiveStartTime,
    webinarWindow.effectiveEndTime
  );

  return [...attendeeMap.values()]
    .map((attendee) => ({
      ...attendee,
      totalPresentSeconds: getUnionDurationSeconds(attendee.effectiveIntervals),
      attendancePercent: effectiveDurationSeconds
        ? Number(
            Math.min(100, (getUnionDurationSeconds(attendee.effectiveIntervals) / effectiveDurationSeconds) * 100).toFixed(2)
          )
        : 0,
    }))
    .sort((left, right) => {
      const durationDelta = right.totalPresentSeconds - left.totalPresentSeconds;
      if (durationDelta !== 0) {
        return durationDelta;
      }

      return left.name.localeCompare(right.name);
    });
}

function buildChatCommentsIndex(uniqueParticipants, chatMessages) {
  const byKey = new Map(uniqueParticipants.map((participant) => [participant.key, []]));
  const byName = new Map(uniqueParticipants.map((participant) => [attendeeKeyFromIdentity(participant.name), participant.key]));

  for (const message of chatMessages) {
    const exactKey = attendeeKeyFromIdentity(message.senderName);
    const attendeeKey = byKey.has(exactKey) ? exactKey : byName.get(exactKey);
    if (!attendeeKey || !byKey.has(attendeeKey)) {
      continue;
    }

    byKey.get(attendeeKey).push({
      offsetTime: message.offsetTime,
      absoluteTime: message.absoluteTime,
      senderName: message.senderName,
      message: message.message,
    });
  }

  return byKey;
}

function markParticipantCohorts(uniqueParticipants, chatCommentsIndex, courseRevealTime, webinarEndTime) {
  const courseRevealDate = parseIsoDate(courseRevealTime);
  const pitchWindowEndTime = addMinutes(courseRevealTime, pitchWindowMinutes);
  const pitchWindowEndDate = parseIsoDate(pitchWindowEndTime);
  const webinarEndDate = parseIsoDate(webinarEndTime);
  const stayedTillEndCutoff = webinarEndDate
    ? new Date(webinarEndDate.getTime() - stayedTillEndToleranceSeconds * 1000)
    : null;

  const enrichedParticipants = uniqueParticipants.map((participant) => {
    const finalDropDate = parseIsoDate(participant.finalDropTime);
    const droppedBeforeCourse = Boolean(
      finalDropDate && courseRevealDate && finalDropDate < courseRevealDate
    );
    const droppedDuringPitchWindow = Boolean(
      finalDropDate &&
        courseRevealDate &&
        pitchWindowEndDate &&
        finalDropDate >= courseRevealDate &&
        finalDropDate < pitchWindowEndDate
    );
    const stayedTillEnd = Boolean(
      finalDropDate && stayedTillEndCutoff && finalDropDate >= stayedTillEndCutoff
    );

    return {
      ...participant,
      chatComments: chatCommentsIndex.get(participant.key) || [],
      chatCommentsCount: (chatCommentsIndex.get(participant.key) || []).length,
      droppedBeforeCourse,
      droppedDuringPitchWindow,
      stayedTillEnd,
    };
  });

  return {
    pitchWindowEndTime,
    participants: enrichedParticipants,
  };
}

function buildCohorts(uniqueParticipants) {
  return {
    droppedBeforeCourse: uniqueParticipants.filter((participant) => participant.droppedBeforeCourse),
    droppedDuringPitchWindow: uniqueParticipants.filter((participant) => participant.droppedDuringPitchWindow),
    stayedTillEnd: uniqueParticipants.filter((participant) => participant.stayedTillEnd),
  };
}

function buildSummary(uniqueParticipants, sessionRecords, cohorts) {
  const totalUniqueParticipants = uniqueParticipants.length || 0;
  const percent = (count) =>
    totalUniqueParticipants ? Number(((count / totalUniqueParticipants) * 100).toFixed(2)) : 0;

  return {
    uniqueParticipants: totalUniqueParticipants,
    sessionRecords,
    droppedBeforeCourseCount: cohorts.droppedBeforeCourse.length,
    droppedBeforeCoursePercent: percent(cohorts.droppedBeforeCourse.length),
    droppedDuringPitchWindowCount: cohorts.droppedDuringPitchWindow.length,
    droppedDuringPitchWindowPercent: percent(cohorts.droppedDuringPitchWindow.length),
    stayedTillEndCount: cohorts.stayedTillEnd.length,
    stayedTillEndPercent: percent(cohorts.stayedTillEnd.length),
  };
}

function buildParticipantRow(participant) {
  return {
    name: participant.name,
    email: participant.email,
    phoneNumber: participant.phoneNumber,
    firstJoinTime: participant.firstJoinTime,
    finalDropTime: participant.finalDropTime,
    totalPresentSeconds: participant.totalPresentSeconds,
    totalPresentFormatted: formatDurationHoursMinutes(participant.totalPresentSeconds),
    attendancePercent: participant.attendancePercent,
    joins: participant.joins,
  };
}

function buildCsv(headers, rows) {
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function buildParticipantCsvRows(participants) {
  const headers = [
    "Name",
    "Email",
    "Phone Number",
    "First Join Time (IST)",
    "Final Drop Time (IST)",
    "Total Present",
    "Attendance %",
    "Join Count",
  ];

  const rows = participants.map((participant) => [
    participant.name,
    participant.email,
    participant.phoneNumber,
    formatDateIst(participant.firstJoinTime),
    formatDateIst(participant.finalDropTime),
    formatDurationHoursMinutes(participant.totalPresentSeconds),
    participant.attendancePercent,
    participant.joins,
  ]);

  return buildCsv(headers, rows);
}

async function writeOutputs(payload) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${outputBasename}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, `${outputBasename}.csv`), `${buildParticipantCsvRows(payload.uniqueParticipants)}\n`);
  await fs.writeFile(
    path.join(outputDir, `${outputBasename}-before-course.csv`),
    `${buildParticipantCsvRows(payload.cohorts.droppedBeforeCourse)}\n`
  );
  await fs.writeFile(
    path.join(outputDir, `${outputBasename}-after-course-30m.csv`),
    `${buildParticipantCsvRows(payload.cohorts.droppedDuringPitchWindow)}\n`
  );
  await fs.writeFile(
    path.join(outputDir, `${outputBasename}-stayed-till-end.csv`),
    `${buildParticipantCsvRows(payload.cohorts.stayedTillEnd)}\n`
  );
}

async function main() {
  requireEnv();

  if (!webinarId) {
    fail("Provide a webinar ID with WEBINAR_ID=... or as the first CLI argument.");
  }

  const token = await getAccessToken();
  const webinar = await zoomRequest(token, `/report/webinars/${encodeURIComponent(webinarId)}`);
  const participants = await getParticipants(token, webinarId);
  const chatMessages = await getChatMessages(token, webinarId, webinarUuid, webinar.start_time || "");
  const webinarWindow = buildEffectiveWebinarWindow(webinar, chatMessages);
  const effectiveDurationSeconds = getOverlapSeconds(
    webinarWindow.effectiveStartTime,
    webinarWindow.effectiveEndTime,
    webinarWindow.effectiveStartTime,
    webinarWindow.effectiveEndTime
  );
  const courseReveal = detectCourseReveal(chatMessages, webinar.start_time || "", webinar.user_name || "");
  const uniqueParticipantsBase = buildUniqueParticipants(participants, webinarWindow, webinar.end_time || "");
  const chatCommentsIndex = buildChatCommentsIndex(uniqueParticipantsBase, chatMessages);
  const cohortMarked = markParticipantCohorts(
    uniqueParticipantsBase,
    chatCommentsIndex,
    courseReveal.courseRevealTime,
    webinar.end_time || ""
  );
  const uniqueParticipants = cohortMarked.participants.map(buildParticipantRow).map((row, index) => ({
    ...row,
    chatComments: cohortMarked.participants[index].chatComments,
    chatCommentsCount: cohortMarked.participants[index].chatCommentsCount,
    droppedBeforeCourse: cohortMarked.participants[index].droppedBeforeCourse,
    droppedDuringPitchWindow: cohortMarked.participants[index].droppedDuringPitchWindow,
    stayedTillEnd: cohortMarked.participants[index].stayedTillEnd,
  }));
  const cohorts = buildCohorts(uniqueParticipants);
  const summary = buildSummary(uniqueParticipants, participants.length, cohorts);

  const payload = {
    generatedAt: new Date().toISOString(),
    webinar: {
      id: webinar.id || webinarId,
      uuid: webinar.uuid || webinarUuid || "",
      topic: webinar.topic || "",
      hostName: webinar.user_name || "",
      hostEmail: webinar.user_email || "",
      startTime: webinar.start_time || "",
      endTime: webinar.end_time || "",
      durationMinutes: Number(webinar.duration || 0),
      participantsCount: webinar.participants_count ?? participants.length,
    },
    methodology: {
      webinarLengthRule:
        webinarWindow.effectiveStartSource === "first_chat_detected"
          ? "Attendance calculations use the first saved chat message time through webinar end."
          : "Attendance calculations use webinar start time through webinar end because no chat was available.",
      courseRevealRule:
        courseReveal.courseRevealSource === "admin_chat_detected"
          ? "Course reveal time was detected from the first admin chat message containing course/price/link details."
          : "Course reveal time fell back to 8:40 PM IST because no matching admin chat message was available.",
      stayedTillEndRule: `Stayed till end means the final drop time was within ${Math.floor(
        stayedTillEndToleranceSeconds / 60
      )} minutes of webinar end.`,
    },
    effectiveWindow: {
      startTime: webinarWindow.effectiveStartTime,
      endTime: webinarWindow.effectiveEndTime,
      durationSeconds: effectiveDurationSeconds,
      durationFormatted: formatDurationHoursMinutes(effectiveDurationSeconds),
      startSource: webinarWindow.effectiveStartSource,
    },
    courseReveal: {
      time: courseReveal.courseRevealTime,
      source: courseReveal.courseRevealSource,
      offsetTime: courseReveal.courseRevealOffsetTime,
      message: courseReveal.courseRevealMessage,
      pitchWindowEndTime: cohortMarked.pitchWindowEndTime,
    },
    summary,
    chatSummary: {
      totalChatMessages: chatMessages.length,
      attendeesWithChatComments: uniqueParticipants.filter((participant) => participant.chatCommentsCount > 0).length,
    },
    uniqueParticipants,
    cohorts,
    rawSessionParticipants: participants,
  };

  await writeOutputs(payload);
  console.log(
    `Attendance written for webinar ${payload.webinar.id} with ${payload.summary.uniqueParticipants} unique participants.`
  );
}

main().catch((error) => fail(error.message || "Unexpected error."));
