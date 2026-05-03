const runOnce = process.argv.includes("--once");
const pollMs = Number(process.env.POLL_MS ?? "1000");

function reportIdle() {
  console.log("Document processor is not implemented yet. No work was performed.");
}

reportIdle();

if (!runOnce) {
  setInterval(() => undefined, pollMs);
}
