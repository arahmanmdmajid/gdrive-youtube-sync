// Reads playlist via yt-dlp (no API quota), shows sorted order
import { execSync } from "child_process";

const raw = execSync(
  `python -m yt_dlp --flat-playlist --print "%(playlist_index)s\t%(id)s\t%(title)s" "https://www.youtube.com/playlist?list=PL6DTkmzRqnL6J6ShD6vzOdAKmxpBIKN4I"`,
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
);

const videos = raw.split("\n")
  .filter(l => l.trim() && !l.startsWith("["))
  .map(l => {
    const [idx, id, ...t] = l.split("\t");
    return { idx: parseInt(idx), id: id?.trim(), title: t.join("\t").trim() };
  })
  .filter(v => v.id);

function parseDate(title) {
  // "18 April 2026 Lecture X" or "... | 18 April 2026"
  const months = { January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12 };
  let m = title.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m) return { date: new Date(`${m[3]}-${String(months[m[2]]).padStart(2,"0")}-${m[1].padStart(2,"0")}`), tkey: "00:00" };
  // "Subject | Teacher | DD-MM-YYYY"
  m = title.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) return { date: new Date(`${m[3]}-${m[2]}-${m[1]}`), tkey: "00:00" };
  // "Subject | Teacher | YYYY-MM-DD"
  m = title.match(/(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { date: new Date(`${m[1]}-${m[2]}-${m[3]}`), tkey: "00:00" };
  // "code YYYY MM DD HH MM GMT+5..."
  m = title.match(/(\d{4}) (\d{2}) (\d{2}) (\d{2}) (\d{2}) GMT/);
  if (m) return { date: new Date(`${m[1]}-${m[2]}-${m[3]}`), tkey: `${m[4]}:${m[5]}` };
  return null;
}

const parsed = videos.map(v => ({ ...v, ...parseDate(v.title) }));
const APR_21 = new Date("2026-04-21");
const withDate = parsed.filter(v => v.date).sort((a, b) => a.date - b.date || a.tkey.localeCompare(b.tkey));
const noDate = parsed.filter(v => !v.date);
const insertAfterIdx = withDate.reduce((last, v, i) => v.date?.getTime() === APR_21.getTime() ? i : last, -1);

const sorted = [...withDate];
const tawzeehIntro = noDate.find(v => v.title?.includes("Tawzeeh 2 Intro"));
const otherNoDate = noDate.filter(v => !v.title?.includes("Tawzeeh 2 Intro"));
if (tawzeehIntro && insertAfterIdx >= 0) sorted.splice(insertAfterIdx + 1, 0, tawzeehIntro);
else if (tawzeehIntro) sorted.push(tawzeehIntro);
sorted.push(...otherNoDate);

let lastDate = null;
sorted.forEach((v, i) => {
  const d = v.date
    ? `${String(v.date.getUTCDate()).padStart(2,"0")}-${String(v.date.getUTCMonth()+1).padStart(2,"0")}-${v.date.getUTCFullYear()}`
    : "no-date";
  if (d !== lastDate) { console.log(`\n── ${d} ──`); lastDate = d; }
  console.log(`${String(i + 1).padStart(3)}. ${v.title}`);
});
console.log(`\nTotal: ${sorted.length} videos`);
console.log(`Can't parse date: ${parsed.filter(v => !v.date).length}`);
