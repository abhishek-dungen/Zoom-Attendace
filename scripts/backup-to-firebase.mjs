import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const siteRoot = path.join(repoRoot, "site");
const uploadEntries = [
  "index.html",
  "app.js",
  "styles.css",
  "data",
];

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

function getStorageBucketName(serviceAccount) {
  return process.env.FIREBASE_STORAGE_BUCKET || serviceAccount.storageBucket || "";
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
  return files;
}

function getRemotePath(localPath) {
  const relativePath = path.relative(siteRoot, localPath).replaceAll(path.sep, "/");
  const prefix = (process.env.FIREBASE_STORAGE_PREFIX || "zoom-attendance").replace(/^\/+|\/+$/g, "");
  return `${prefix}/${relativePath}`;
}

async function main() {
  const serviceAccount = getServiceAccount();
  const storageBucket = getStorageBucketName(serviceAccount);
  if (!storageBucket) {
    fail("Missing FIREBASE_STORAGE_BUCKET and none was found in the service account.");
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket,
    });
  }

  const bucket = getStorage().bucket(storageBucket);
  const files = await collectUploadFiles();

  for (const localPath of files) {
    const destination = getRemotePath(localPath);
    await bucket.upload(localPath, {
      destination,
      resumable: false,
      gzip: false,
      metadata: {
        cacheControl: "no-cache",
      },
    });
    console.log(`Uploaded ${destination}`);
  }

  console.log(`Firebase backup complete. Uploaded ${files.length} files to gs://${storageBucket}/${process.env.FIREBASE_STORAGE_PREFIX || "zoom-attendance"}/`);
}

main().catch((error) => fail(error.message || "Firebase backup failed."));
