import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const siteRoot = path.join(repoRoot, "site");
const uploadEntries = ["index.html", "app.js", "styles.css", "data"];
const MAX_INLINE_BYTES = 700_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
  if (!raw) {
    fail("Missing FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_JSON.");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Failed to parse Firebase service account JSON: ${error.message}`);
  }
}

async function listFiles(entryPath) {
  const stats = await fs.stat(entryPath);
  if (stats.isFile()) {
    return [entryPath];
  }

  const files = [];
  const items = await fs.readdir(entryPath, { withFileTypes: true });
  for (const item of items) {
    const childPath = path.join(entryPath, item.name);
    if (item.isDirectory()) {
      files.push(...(await listFiles(childPath)));
      continue;
    }
    if (item.isFile()) {
      files.push(childPath);
    }
  }
  return files;
}

async function collectUploadFiles() {
  const files = [];
  for (const entry of uploadEntries) {
    const entryPath = path.join(siteRoot, entry);
    files.push(...(await listFiles(entryPath)));
  }
  return files.sort();
}

function toPosix(relativePath) {
  return relativePath.replaceAll(path.sep, "/");
}

function fileDocumentId(relativePath) {
  return toPosix(relativePath).replace(/[/.]/g, "_");
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function backupFile(runRef, localPath) {
  const relativePath = toPosix(path.relative(siteRoot, localPath));
  const content = await fs.readFile(localPath, "utf8");
  const contentBytes = Buffer.byteLength(content, "utf8");
  const fileRef = runRef.collection("files").doc(fileDocumentId(relativePath));

  await fileRef.set({
    relativePath,
    byteLength: contentBytes,
    sha256: sha256(content),
    updatedAt: FieldValue.serverTimestamp(),
    chunked: contentBytes > MAX_INLINE_BYTES,
    content: contentBytes > MAX_INLINE_BYTES ? null : content,
  });

  if (contentBytes <= MAX_INLINE_BYTES) {
    return {
      relativePath,
      byteLength: contentBytes,
      chunkCount: 0,
    };
  }

  const chunks = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(content.length, start + MAX_INLINE_BYTES);
    while (Buffer.byteLength(content.slice(start, end), "utf8") > MAX_INLINE_BYTES && end > start) {
      end -= 1;
    }
    chunks.push(content.slice(start, end));
    start = end;
  }

  for (let index = 0; index < chunks.length; index += 1) {
    await fileRef.collection("chunks").doc(String(index).padStart(4, "0")).set({
      index,
      content: chunks[index],
    });
  }

  return {
    relativePath,
    byteLength: contentBytes,
    chunkCount: chunks.length,
  };
}

async function main() {
  const serviceAccount = getServiceAccount();
  const firestoreDatabase = process.env.FIREBASE_FIRESTORE_DATABASE || "(default)";

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  const db = getFirestore(undefined, firestoreDatabase);
  const files = await collectUploadFiles();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runRef = db.collection("zoomAttendanceBackups").doc(runId);

  await runRef.set({
    runId,
    projectId: serviceAccount.project_id,
    source: "github-actions",
    createdAt: FieldValue.serverTimestamp(),
    fileCount: files.length,
    firestoreDatabase,
  });

  const manifest = [];
  for (const localPath of files) {
    const result = await backupFile(runRef, localPath);
    manifest.push(result);
    console.log(`Backed up ${result.relativePath}`);
  }

  await runRef.update({
    manifest,
    completedAt: FieldValue.serverTimestamp(),
  });

  await db.collection("zoomAttendanceMeta").doc("latest").set({
    latestRunId: runId,
    latestRunAt: FieldValue.serverTimestamp(),
    fileCount: files.length,
  });

  console.log(`Firebase Firestore backup complete. Saved ${files.length} files in run ${runId}.`);
}

main().catch((error) => fail(error.message || "Firebase backup failed."));
