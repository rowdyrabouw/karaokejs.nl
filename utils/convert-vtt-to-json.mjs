import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const parseTimestamp = (timestamp) => {
  const parts = timestamp.split(':');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error(`Invalid VTT timestamp: ${timestamp}`);
  }

  const secondsPart = parts.at(-1);
  const match = /^(\d{2})\.(\d{3})$/.exec(secondsPart);
  if (!match || parts.slice(0, -1).some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Invalid VTT timestamp: ${timestamp}`);
  }

  const seconds = Number(match[1]);
  const milliseconds = Number(match[2]);
  const minutes = Number(parts.at(-2));
  const hours = parts.length === 3 ? Number(parts[0]) : 0;

  if (
    !Number.isInteger(minutes) ||
    !Number.isInteger(hours) ||
    seconds > 59 ||
    (parts.length === 3 && minutes > 59)
  ) {
    throw new Error(`Invalid VTT timestamp: ${timestamp}`);
  }

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
};

export const convertVttToJson = (vttContent) => {
  if (typeof vttContent !== 'string') {
    throw new TypeError('VTT content must be a string');
  }

  const blocks = vttContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/);
  const lines = [];

  for (const block of blocks) {
    const blockLines = block.trim().split('\n');
    const firstLine = blockLines[0]?.trim() ?? '';

    if (
      !firstLine ||
      /^WEBVTT(?:[ \t].*)?$/.test(firstLine) ||
      /^(NOTE|STYLE|REGION)(?:[ \t]|$)/.test(firstLine)
    ) {
      continue;
    }

    const timingLineIndex = blockLines.findIndex((line) => line.includes('-->'));
    if (timingLineIndex === -1) {
      throw new Error(`VTT cue is missing a timing line: ${firstLine}`);
    }

    const timingMatch = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(
      blockLines[timingLineIndex],
    );
    if (!timingMatch) {
      throw new Error(`Invalid VTT timing line: ${blockLines[timingLineIndex]}`);
    }

    const startTime = parseTimestamp(timingMatch[1]);
    const endTime = parseTimestamp(timingMatch[2]);
    if (endTime < startTime) {
      throw new Error(`VTT cue ends before it starts: ${blockLines[timingLineIndex]}`);
    }

    const text = blockLines.slice(timingLineIndex + 1).join(' ').trim();
    const words = text ? text.split(/\s+/) : [];
    const wordDuration = words.length ? (endTime - startTime) / words.length : 0;

    lines.push({
      startTime,
      endTime,
      words: words.map((word, index) => ({
        text: word,
        start: startTime + index * wordDuration,
        end: index === words.length - 1
          ? endTime
          : startTime + (index + 1) * wordDuration,
      })),
    });
  }

  return { lines };
};

export const convertVttFileToJson = async (inputPath, outputPath) => {
  const vttContent = await readFile(inputPath, 'utf8');
  const result = convertVttToJson(vttContent);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
};

const runCli = async () => {
  const [, , inputPath, requestedOutputPath] = process.argv;
  if (!inputPath) {
    throw new Error('Usage: node utils/convert-vtt-to-json.mjs <input.vtt> [output.json]');
  }

  const inputName = basename(inputPath, extname(inputPath));
  const outputPath = requestedOutputPath ?? join(dirname(inputPath), `${inputName}.json`);
  await convertVttFileToJson(inputPath, outputPath);
  console.log(`Wrote ${outputPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
