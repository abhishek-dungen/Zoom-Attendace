import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "site", "data");
const stayedTillEndToleranceSeconds = 5 * 60;
const pitchWindowMinutes = 30;

function parseDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function fixedStartFor(webinarStartTime) {
  const start = parseDate(webinarStartTime);
  if (!start) return webinarStartTime || "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(start);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 13, 30, 0)).toISOString();
}

function addMinutes(value, minutes) {
  const date = parseDate(value);
  return date ? new Date(date.getTime() + minutes * 60 * 1000).toISOString() : "";
}

function getClippedInterval(joinTime, leaveTime, windowStartTime, windowEndTime) {
  const joinDate = parseDate(joinTime);
  const leaveDate = parseDate(leaveTime);
  const startDate = parseDate(windowStartTime);
  const endDate = parseDate(windowEndTime);
  if (!joinDate || !leaveDate || !startDate || !endDate) return null;
  const start = Math.max(joinDate.getTime(), startDate.getTime());
  const end = Math.min(leaveDate.getTime(), endDate.getTime());
  return end > start ? { start, end } : null;
}

function unionDurationSeconds(intervals) {
  if (!intervals.length) return 0;
  const sorted = [...intervals].sort((left, right) => left.start - right.start);
  const merged = [sorted[0]];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged.reduce((sum, interval) => sum + Math.floor((interval.end - interval.start) / 1000), 0);
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function attendeeKey(row) {
  const email = String(row.email || "").trim().toLowerCase();
  const phone = String(row.phoneNumber || "").replace(/\D/g, "").slice(-10);
  const name = String(row.name || "").trim().toLowerCase();
  return email || phone || name;
}

function recalcParticipants(payload) {
  const startTime = fixedStartFor(payload.webinar?.startTime);
  const endTime = payload.webinar?.endTime || "";
  const startDate = parseDate(startTime);
  const endDate = parseDate(endTime);
  const durationSeconds = startDate && endDate ? Math.max(0, Math.floor((endDate - startDate) / 1000)) : 0;
  const byKey = new Map();

  for (const row of payload.rawSessionParticipants || []) {
    const key = attendeeKey(row);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: row.name || "",
        email: row.email || "",
        phoneNumber: row.phoneNumber || "",
        firstJoinTime: row.joinTime || "",
        finalDropTime: row.leaveTime || endTime,
        joins: 0,
        intervals: [],
      });
    }
    const attendee = byKey.get(key);
    attendee.joins += 1;
    if (!attendee.phoneNumber && row.phoneNumber) attendee.phoneNumber = row.phoneNumber;
    if (!parseDate(attendee.firstJoinTime) || (parseDate(row.joinTime) && parseDate(row.joinTime) < parseDate(attendee.firstJoinTime))) {
      attendee.firstJoinTime = row.joinTime || attendee.firstJoinTime;
    }
    if (!parseDate(attendee.finalDropTime) || (parseDate(row.leaveTime || endTime) && parseDate(row.leaveTime || endTime) > parseDate(attendee.finalDropTime))) {
      attendee.finalDropTime = row.leaveTime || endTime || attendee.finalDropTime;
    }
    const interval = getClippedInterval(row.joinTime, row.leaveTime || endTime, startTime, endTime);
    if (interval) attendee.intervals.push(interval);
  }

  const oldByKey = new Map((payload.uniqueParticipants || []).map((participant) => [attendeeKey(participant), participant]));
  const courseRevealTime = payload.courseReveal?.time || "";
  const pitchWindowEndTime = addMinutes(courseRevealTime, pitchWindowMinutes);
  const courseRevealDate = parseDate(courseRevealTime);
  const pitchWindowEndDate = parseDate(pitchWindowEndTime);
  const stayedCutoff = endDate ? new Date(endDate.getTime() - stayedTillEndToleranceSeconds * 1000) : null;

  const participants = [...byKey.values()].map((attendee) => {
    const totalPresentSeconds = unionDurationSeconds(attendee.intervals);
    const old = oldByKey.get(attendee.key) || {};
    const finalDropDate = parseDate(attendee.finalDropTime);
    return {
      name: attendee.name,
      email: attendee.email,
      phoneNumber: attendee.phoneNumber,
      firstJoinTime: attendee.firstJoinTime,
      finalDropTime: attendee.finalDropTime,
      totalPresentSeconds,
      totalPresentFormatted: formatDuration(totalPresentSeconds),
      attendancePercent: durationSeconds ? Number(Math.min(100, (totalPresentSeconds / durationSeconds) * 100).toFixed(2)) : 0,
      joins: attendee.joins,
      chatComments: old.chatComments || [],
      chatCommentsCount: old.chatCommentsCount || 0,
      droppedBeforeCourse: Boolean(finalDropDate && courseRevealDate && finalDropDate < courseRevealDate),
      droppedDuringPitchWindow: Boolean(finalDropDate && courseRevealDate && pitchWindowEndDate && finalDropDate >= courseRevealDate && finalDropDate < pitchWindowEndDate),
      stayedTillEnd: Boolean(finalDropDate && stayedCutoff && finalDropDate >= stayedCutoff),
    };
  }).sort((left, right) => right.totalPresentSeconds - left.totalPresentSeconds || left.name.localeCompare(right.name));

  const percent = (count) => participants.length ? Number(((count / participants.length) * 100).toFixed(2)) : 0;
  const cohorts = {
    droppedBeforeCourse: participants.filter((participant) => participant.droppedBeforeCourse),
    droppedDuringPitchWindow: participants.filter((participant) => participant.droppedDuringPitchWindow),
    stayedTillEnd: participants.filter((participant) => participant.stayedTillEnd),
  };

  payload.methodology = {
    ...(payload.methodology || {}),
    webinarLengthRule: "Attendance calculations use fixed 7:00 PM IST through webinar end.",
  };
  payload.effectiveWindow = {
    startTime,
    endTime,
    durationSeconds,
    durationFormatted: formatDuration(durationSeconds),
    startSource: "fixed_7pm_ist",
  };
  payload.uniqueParticipants = participants;
  payload.cohorts = cohorts;
  payload.summary = {
    ...(payload.summary || {}),
    uniqueParticipants: participants.length,
    droppedBeforeCourseCount: cohorts.droppedBeforeCourse.length,
    droppedBeforeCoursePercent: percent(cohorts.droppedBeforeCourse.length),
    droppedDuringPitchWindowCount: cohorts.droppedDuringPitchWindow.length,
    droppedDuringPitchWindowPercent: percent(cohorts.droppedDuringPitchWindow.length),
    stayedTillEndCount: cohorts.stayedTillEnd.length,
    stayedTillEndPercent: percent(cohorts.stayedTillEnd.length),
  };
  return payload;
}

function csvRows(participants) {
  const headers = ["Name", "Email", "Phone Number", "First Join Time", "Final Drop Time", "Total Present", "Attendance %", "Joins"];
  const rows = participants.map((participant) => [
    participant.name,
    participant.email,
    participant.phoneNumber,
    participant.firstJoinTime,
    participant.finalDropTime,
    participant.totalPresentFormatted,
    participant.attendancePercent,
    participant.joins,
  ]);
  return [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function buildAggregate(reports) {
  const totalUniqueParticipants = reports.reduce((sum, report) => sum + Number(report.summary?.uniqueParticipants || 0), 0);
  const totalDroppedBefore = reports.reduce((sum, report) => sum + Number(report.summary?.droppedBeforeCourseCount || 0), 0);
  const totalDroppedAfter = reports.reduce((sum, report) => sum + Number(report.summary?.droppedDuringPitchWindowCount || 0), 0);
  const totalStayed = reports.reduce((sum, report) => sum + Number(report.summary?.stayedTillEndCount || 0), 0);
  return {
    webinarsConsidered: reports.length,
    averages: {
      webinarLengthMinutes: Number(average(reports.map((report) => Number(report.webinar?.durationMinutes || 0))).toFixed(2)),
      sessionRecords: Number(average(reports.map((report) => Number(report.summary?.sessionRecords || 0))).toFixed(2)),
      uniqueParticipants: Number(average(reports.map((report) => Number(report.summary?.uniqueParticipants || 0))).toFixed(2)),
      effectiveWebinarLengthSeconds: Number(average(reports.map((report) => Number(report.effectiveWindow?.durationSeconds || 0))).toFixed(2)),
      droppedBeforeCourse: Number(average(reports.map((report) => Number(report.summary?.droppedBeforeCourseCount || 0))).toFixed(2)),
      droppedDuringPitchWindow: Number(average(reports.map((report) => Number(report.summary?.droppedDuringPitchWindowCount || 0))).toFixed(2)),
      stayedTillEnd: Number(average(reports.map((report) => Number(report.summary?.stayedTillEndCount || 0))).toFixed(2)),
    },
    aggregatePercentages: {
      droppedBeforeCourse: totalUniqueParticipants ? Number(((totalDroppedBefore / totalUniqueParticipants) * 100).toFixed(2)) : 0,
      droppedDuringPitchWindow: totalUniqueParticipants ? Number(((totalDroppedAfter / totalUniqueParticipants) * 100).toFixed(2)) : 0,
      stayedTillEnd: totalUniqueParticipants ? Number(((totalStayed / totalUniqueParticipants) * 100).toFixed(2)) : 0,
    },
    totals: {
      uniqueParticipants: totalUniqueParticipants,
      droppedBeforeCourse: totalDroppedBefore,
      droppedDuringPitchWindow: totalDroppedAfter,
      stayedTillEnd: totalStayed,
    },
    series: reports.map((report, index) => ({
      serial: index + 1,
      date: report.webinar?.startTime || "",
      weekday: "",
      uniqueParticipants: report.summary?.uniqueParticipants || 0,
      droppedBeforeCoursePercent: report.summary?.droppedBeforeCoursePercent || 0,
      droppedDuringPitchWindowPercent: report.summary?.droppedDuringPitchWindowPercent || 0,
      stayedTillEndPercent: report.summary?.stayedTillEndPercent || 0,
    })),
  };
}

const index = JSON.parse(fs.readFileSync(path.join(dataDir, "index.json"), "utf8"));
const reports = [];
for (const webinar of index.webinars || []) {
  const file = path.join(process.cwd(), "site", webinar.reportJson);
  const payload = recalcParticipants(JSON.parse(fs.readFileSync(file, "utf8")));
  reports.push(payload);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  const basename = path.basename(file, ".json");
  fs.writeFileSync(path.join(dataDir, `${basename}.csv`), `${csvRows(payload.uniqueParticipants)}\n`);
  fs.writeFileSync(path.join(dataDir, `${basename}-before-course.csv`), `${csvRows(payload.cohorts.droppedBeforeCourse)}\n`);
  fs.writeFileSync(path.join(dataDir, `${basename}-after-course-30m.csv`), `${csvRows(payload.cohorts.droppedDuringPitchWindow)}\n`);
  fs.writeFileSync(path.join(dataDir, `${basename}-stayed-till-end.csv`), `${csvRows(payload.cohorts.stayedTillEnd)}\n`);
  Object.assign(webinar, {
    summary: payload.summary,
    effectiveDurationSeconds: payload.effectiveWindow?.durationSeconds || 0,
    effectiveDurationFormatted: payload.effectiveWindow?.durationFormatted || "",
    webinarDurationMinutes: payload.webinar?.durationMinutes || 0,
    fifteenMinuteAnalysis: payload.fifteenMinuteAnalysis || { bucketMinutes: 15, bucketCount: 0, buckets: [] },
  });
}
fs.writeFileSync(path.join(dataDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(dataDir, "aggregate.json"), `${JSON.stringify(buildAggregate(reports), null, 2)}\n`);
if (index.webinars?.[0]) {
  const latestBase = path.basename(index.webinars[0].reportJson);
  fs.copyFileSync(path.join(dataDir, latestBase), path.join(dataDir, "latest.json"));
  fs.copyFileSync(path.join(dataDir, latestBase.replace(".json", ".csv")), path.join(dataDir, "latest.csv"));
  fs.copyFileSync(path.join(dataDir, latestBase.replace(".json", "-before-course.csv")), path.join(dataDir, "latest-before-course.csv"));
  fs.copyFileSync(path.join(dataDir, latestBase.replace(".json", "-after-course-30m.csv")), path.join(dataDir, "latest-after-course-30m.csv"));
  fs.copyFileSync(path.join(dataDir, latestBase.replace(".json", "-stayed-till-end.csv")), path.join(dataDir, "latest-stayed-till-end.csv"));
}
console.log(`Applied fixed 7 PM webinar window to ${index.webinars?.length || 0} reports.`);
