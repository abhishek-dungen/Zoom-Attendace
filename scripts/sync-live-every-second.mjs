import { spawn } from "node:child_process";

const delayMs = Number(process.env.LIVE_SYNC_DELAY_MS || 1000);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  while (true) {
    const startedAt = new Date();
    console.log(`[${startedAt.toISOString()}] Starting live Zoom + payment sync`);
    try {
      await run("node", ["scripts/sync-reports.mjs"]);
      await run("node", ["scripts/build-payment-attendance-report.mjs"]);
      console.log(`[${new Date().toISOString()}] Live sync finished`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Live sync failed: ${error.message}`);
    }
    await sleep(delayMs);
  }
}

main();
