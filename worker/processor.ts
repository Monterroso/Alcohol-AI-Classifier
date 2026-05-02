const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const pollMs = Number(process.env.POLL_MS ?? "1000");
const runOnce = process.argv.includes("--once");

async function processNext() {
  const response = await fetch(`${appUrl}/api/applications/process-next`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Processor request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    processedApplicationId: string | null;
    idle: boolean;
  };

  if (payload.idle) {
    console.log("No pending applications.");
    return;
  }

  console.log(`Processed ${payload.processedApplicationId}`);
}

async function main() {
  if (runOnce) {
    await processNext();
    return;
  }

  console.log(`Polling ${appUrl} every ${pollMs}ms.`);
  setInterval(() => {
    void processNext().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }, pollMs);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
