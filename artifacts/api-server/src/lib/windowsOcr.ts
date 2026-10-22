import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

// Reads text from images with the OCR built into Windows (Windows.Media.Ocr), through PowerShell. It runs
// on this PC and nothing leaves it. The recognized text is returned to the caller and never written
// anywhere by this module.

/** Text of each image, in the same order as the paths given. An empty string when nothing was read. */
export type Ocr = (imagePaths: string[]) => Promise<string[]>;

export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrUnavailableError";
  }
}

// One JSON line per image on stdout: {"file":"x.jpg","text":"..."}. English and Arabic recognizers, for
// whichever of them the machine has installed.
const SCRIPT = [
  "param([string]$Dir)",
  "$ErrorActionPreference = 'Stop'",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "Add-Type -AssemblyName System.Runtime.WindowsRuntime",
  "$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]",
  "$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]",
  "$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]",
  "$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]",
  "$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics, ContentType = WindowsRuntime]",
  "$null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]",
  "$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]",
  "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
  "function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }",
  "$engines = @()",
  "foreach ($tag in 'en-US', 'ar-SA') { $e = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($tag)); if ($e) { $engines += $e } }",
  "if ($engines.Count -eq 0) { [Console]::Error.WriteLine('NO_OCR_ENGINE'); exit 3 }",
  "Get-ChildItem $Dir -Filter *.jpg | Sort-Object Name | ForEach-Object {",
  "  $text = ''",
  "  try {",
  "    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($_.FullName)) ([Windows.Storage.StorageFile])",
  "    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])",
  "    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])",
  "    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])",
  "    foreach ($engine in $engines) {",
  "      $r = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])",
  "      $text += ' ' + [string]$r.Text",
  "    }",
  "  } catch { $text = '' }",
  "  ([pscustomobject]@{ file = $_.Name; text = $text.Trim() } | ConvertTo-Json -Compress)",
  "}",
].join("\n");

/** Parses the script's output into the text of each expected file name (missing files give ""). */
export function parseOcrOutput(stdout: string, fileNames: string[]): string[] {
  const byName = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.replace(/^﻿/, "").trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const j = JSON.parse(trimmed) as { file?: string; text?: string };
      if (j.file) byName.set(j.file, j.text ?? "");
    } catch {
      /* a line that is not our JSON is ignored */
    }
  }
  return fileNames.map((n) => byName.get(n) ?? "");
}

/** The Windows OCR. Frames must be in one folder; each call writes its script next to them and removes nothing else. */
export const windowsOcr: Ocr = async (imagePaths) => {
  if (process.platform !== "win32") throw new OcrUnavailableError("Windows OCR is only available on Windows");
  if (imagePaths.length === 0) return [];
  const dir = path.dirname(imagePaths[0]);
  const script = path.join(dir, "ocr.ps1");
  await fs.writeFile(script, SCRIPT, "utf8");
  const stdout = await new Promise<string>((resolve, reject) => {
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Dir", dir], {
      windowsHide: true,
    });
    let out = "";
    let err = "";
    p.stdout.setEncoding("utf8").on("data", (d) => (out += d));
    p.stderr.setEncoding("utf8").on("data", (d) => (err += d));
    const timer = setTimeout(() => p.kill(), 120_000);
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(new OcrUnavailableError(`Could not start PowerShell: ${e.message}`));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 3 || err.includes("NO_OCR_ENGINE")) return reject(new OcrUnavailableError("Windows has no OCR language installed"));
      if (code !== 0) return reject(new Error(`OCR script exited with code ${code}`));
      resolve(out);
    });
  });
  return parseOcrOutput(stdout, imagePaths.map((p) => path.basename(p)));
};
