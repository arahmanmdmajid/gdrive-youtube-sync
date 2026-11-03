import { test } from "node:test";
import assert from "node:assert/strict";
import { screenAgreesWith, screenSeenFor, subjectFromFileName } from "./screenSubject";

// File names as they appear in the PDF viewer's toolbar on real shared screens, and as the OCR garbled them.
const serials = (name: string) => subjectFromFileName(name)?.serials;

test("Jalalain: the library code in the file name gives the volume, hence the serial", () => {
  assert.deepEqual(serials("6.1.1 TafseerUl Jalalain Vol1 AlBushraColor 040726.pdf"), ["1.1"]);
  assert.deepEqual(serials("6.1.2 TafseerUl Jalalain Vol2 AlBushraColor 160626.pdf"), ["1.2"]);
  assert.deepEqual(serials("6.1.3 TafseerUl Jalalain Vol3 AlBushraColor 040726.pdf"), ["1.3"]);
});

test("Jalalain: the OCR dropping a dot or garbling a letter still reads", () => {
  assert.deepEqual(serials("6-13 TafseerUl Jalalain v013 AIBushracolor 40726.pdf"), ["1.3"]);
  assert.deepEqual(serials("6.12 Tafseerul Jalalain v012 AIBushracolor 160626.pdf"), ["1.2"]);
  assert.deepEqual(serials("6.1.1 TatseerUl Jalalair Vol1.pdf"), ["1.1"]);
});

test("Jalalain with no readable code could be any of its three volumes; a date in the name is not a code", () => {
  assert.deepEqual(serials("TafseerUl Jalalain AlBushraColor 160626.pdf"), ["1.1", "1.2", "1.3"]);
});

test("Al Fawz ul Kabir, Khair ul Usool and Kitab ul Asar (Latin and Arabic)", () => {
  assert.deepEqual(serials("6.2.1.1 Faoz ul Kabeer (Bushra) 290726.pdf"), ["2.1"]);
  assert.deepEqual(serials("6.2.1.1 FaozuIKabeer (Bushra).pdf"), ["2.1"]);
  assert.deepEqual(serials("6.2.2.2 Khair ul Usool (Bushra).pdf"), ["2.4"]);
  assert.deepEqual(serials("6.2.4.1 Kitab ul Asaar 290726.pdf"), ["2.2"]);
  assert.deepEqual(serials("كتاب الآثار لمحمد بن الحسن الشيباني"), ["2.2"]);
});

test("Hidaya Sani covers its three parts; Ulama-e-Deoband is 5.3", () => {
  assert.deepEqual(serials("6.3-1.1 and 2 Hidaya Sani-2 v013 AIBushrac010r 2011 290726.pdf"), ["3.1", "3.2", "3.3"]);
  assert.deepEqual(serials("6.3.2.O%20Hidaya%20Sani.pdf"), ["3.1", "3.2", "3.3"]);
  assert.deepEqual(serials("Ulama-e-Deoband ka Deeni Rukh aur Maslaki Mizaj.pdf"), ["5.3"]);
});

test("a name that names no subject, or two, gives nothing", () => {
  assert.equal(subjectFromFileName("20vol.pdf"), null);
  assert.equal(subjectFromFileName("Daily Jang Urdu Ne.."), null);
  assert.equal(subjectFromFileName(""), null);
  assert.equal(subjectFromFileName("Jalalain and Hidaya Sani.pdf"), null);
});

test("the screen agrees when the title's serial is one it allows", () => {
  const screen = subjectFromFileName("6.1.2 TafseerUl Jalalain Vol2.pdf")!;
  assert.equal(screenAgreesWith("1.2 Jalalain Part 2 | Ustad Haseeb | 03-11-2026", screen), true);
  // job 786: proposed as Al Fawz ul Kabir while the screen showed Jalalain Vol 2
  assert.equal(screenAgreesWith("2.1 Al Fawz ul Kabir | Ustad Haseeb | 03-11-2026", screen), false);
  assert.equal(screenAgreesWith(null, screen), false);
  // job 692: titled Siraji while the screen showed Ulama-e-Deoband
  assert.equal(screenAgreesWith("2.3 Siraji | Ustad Khalid Zaman | 12-10-2026", subjectFromFileName("Ulama-e-Deoband ka.pdf")!), false);
});

test("screenSeenFor: the subject the screen showed and whether the title agrees; nothing when no subject was seen", () => {
  const jalalain2 = { subject: "Jalalain", serials: ["1.2"] };
  assert.deepEqual(screenSeenFor(jalalain2, "1.2 Jalalain Part 2 | Ustad Haseeb | 03-11-2026"), { subject: "Jalalain", agrees: true });
  assert.deepEqual(screenSeenFor(jalalain2, "2.1 Al Fawz ul Kabir | Ustad Haseeb | 03-11-2026"), { subject: "Jalalain", agrees: false });
  assert.deepEqual(screenSeenFor(jalalain2, ""), { subject: "Jalalain", agrees: false });
  assert.equal(screenSeenFor({ subject: null, serials: [] }, "1.2 Jalalain Part 2 | X | 03-11-2026"), null);
});
