#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OUTPUT_DIR = "outputs/sora";
const POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const allowedModels = new Set([
  "sora-2",
  "sora-2-pro",
  "sora-2-2025-10-06",
  "sora-2-pro-2025-10-06",
  "sora-2-2025-12-08",
]);
const allowedSeconds = new Set(["4", "8", "12"]);
const allowedSizes = new Set(["720x1280", "1280x720", "1024x1792", "1792x1024"]);

function printHelp() {
  console.log(`
Generate a Sora video with the OpenAI Videos API.

Usage:
  npm run video:sora -- --prompt "A cinematic shot of a glass storefront at sunset"

Options:
  --prompt <text>       Required. Video prompt.
  --model <model>       Optional. Default: sora-2. Try sora-2-pro for higher quality.
  --seconds <4|8|12>    Optional. Default: 4.
  --size <size>         Optional. Default: 1280x720.
                        Allowed: 720x1280, 1280x720, 1024x1792, 1792x1024.
  --out <file>          Optional. Output .mp4 path.
  --timeout <seconds>   Optional. Poll timeout. Default: 600.
  --no-download         Optional. Create and poll the job without downloading the MP4.
  --help                Show this help.

Environment:
  OPENAI_API_KEY must be set in your shell, .env.local, or .env.
`);
}

function parseArgs(argv) {
  const options = {
    model: "sora-2",
    seconds: "4",
    size: "1280x720",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    download: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--no-download") {
      options.download = false;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--prompt") options.prompt = next;
    else if (arg === "--model") options.model = next;
    else if (arg === "--seconds") options.seconds = next;
    else if (arg === "--size") options.size = next;
    else if (arg === "--out") options.out = next;
    else if (arg === "--timeout") options.timeoutMs = Number(next) * 1000;
    else throw new Error(`Unknown option: ${arg}`);

    index += 1;
  }

  return options;
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const contents = await readFile(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function loadLocalEnv() {
  await loadEnvFile(path.resolve(".env.local"));
  await loadEnvFile(path.resolve(".env"));
}

function validateOptions(options) {
  if (options.help) return;
  if (!options.prompt) throw new Error("Missing required --prompt.");
  if (!allowedModels.has(options.model)) {
    throw new Error(`Unsupported model "${options.model}".`);
  }
  if (!allowedSeconds.has(options.seconds)) {
    throw new Error("--seconds must be one of: 4, 8, 12.");
  }
  if (!allowedSizes.has(options.size)) {
    throw new Error("--size must be one of: 720x1280, 1280x720, 1024x1792, 1792x1024.");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive number of seconds.");
  }
}

async function openAiRequest(apiKey, endpoint, init = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${detail}`);
  }

  return response;
}

async function createVideo(apiKey, options) {
  const response = await openAiRequest(apiKey, "/videos", {
    method: "POST",
    body: JSON.stringify({
      model: options.model,
      prompt: options.prompt,
      seconds: options.seconds,
      size: options.size,
    }),
  });

  return response.json();
}

async function retrieveVideo(apiKey, videoId) {
  const response = await openAiRequest(apiKey, `/videos/${encodeURIComponent(videoId)}`);
  return response.json();
}

async function waitForVideo(apiKey, videoId, timeoutMs) {
  const startedAt = Date.now();
  let lastStatus = "";

  while (Date.now() - startedAt < timeoutMs) {
    const video = await retrieveVideo(apiKey, videoId);
    const progress = typeof video.progress === "number" ? ` (${video.progress}%)` : "";
    const statusLine = `${video.status}${progress}`;

    if (statusLine !== lastStatus) {
      console.log(`Status: ${statusLine}`);
      lastStatus = statusLine;
    }

    if (video.status === "completed") return video;
    if (video.status === "failed") {
      const message = video.error?.message ?? "Video generation failed.";
      throw new Error(message);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for video ${videoId}.`);
}

function defaultOutputPath(video) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(DEFAULT_OUTPUT_DIR, `${timestamp}-${video.id}.mp4`);
}

async function downloadVideo(apiKey, videoId, outputPath) {
  const response = await openAiRequest(
    apiKey,
    `/videos/${encodeURIComponent(videoId)}/content?variant=video`,
    {
      headers: { Accept: "video/mp4" },
    },
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  return outputPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  validateOptions(options);
  await loadLocalEnv();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local or export it in your shell.");
  }

  console.log(`Creating video with ${options.model} (${options.seconds}s, ${options.size})...`);
  const created = await createVideo(apiKey, options);
  console.log(`Video job created: ${created.id}`);

  const completed = await waitForVideo(apiKey, created.id, options.timeoutMs);
  console.log(`Video completed: ${completed.id}`);

  if (options.download) {
    const outputPath = path.resolve(options.out ?? defaultOutputPath(completed));
    await downloadVideo(apiKey, completed.id, outputPath);
    console.log(`Saved: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
