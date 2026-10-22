import { useAutoReviewAgreement, useAutoReviewGroups } from "@workspace/api-client-react";
import type { AgreementOutcome, AgreementTally, AutoReviewGroup } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Check, X, Minus } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const OUTCOME_LABEL: Record<AgreementOutcome, string> = {
  agreed: "Agreed",
  false_clean: "False clean",
  held_correctly: "Held correctly",
  unnecessary_hold: "Unnecessary hold",
  pending: "Not reviewed yet",
  not_comparable: "Not comparable",
};

const OUTCOME_CLASS: Record<AgreementOutcome, string> = {
  agreed: "text-green-600 dark:text-green-400",
  false_clean: "text-red-600 dark:text-red-400 font-semibold",
  held_correctly: "text-green-600 dark:text-green-400",
  unnecessary_hold: "text-muted-foreground",
  pending: "text-muted-foreground",
  not_comparable: "text-muted-foreground",
};

function Tally({ title, t }: { title: string; t: AgreementTally }) {
  return (
    <tr className="border-t">
      <td className="py-1.5 pr-4 font-medium">{title}</td>
      <td className="pr-4">{t.days}</td>
      <td className="pr-4">{t.agreed}</td>
      <td className={`pr-4 ${t.falseClean ? "text-red-600 dark:text-red-400 font-semibold" : ""}`}>{t.falseClean}</td>
      <td className="pr-4">{t.heldCorrectly}</td>
      <td className="pr-4">{t.unnecessaryHold}</td>
      <td className="pr-4">{t.pending}</td>
      <td>{t.notComparable}</td>
    </tr>
  );
}

function TallyTable({ rows }: { rows: [string, AgreementTally][] }) {
  return (
    <table className="text-sm font-mono">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="pr-4 font-normal"></th>
          <th className="pr-4 font-normal">Days</th>
          <th className="pr-4 font-normal">Agreed</th>
          <th className="pr-4 font-normal">False clean</th>
          <th className="pr-4 font-normal">Held correctly</th>
          <th className="pr-4 font-normal">Unnecessary hold</th>
          <th className="pr-4 font-normal">Pending</th>
          <th className="font-normal">Not comparable</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([title, t]) => (
          <Tally key={title} title={title} t={t} />
        ))}
      </tbody>
    </table>
  );
}

function GroupRow({ g }: { g: AutoReviewGroup }) {
  const teachers = [...new Set(Object.values(g.teachers ?? {}).filter(Boolean))];
  return (
    <TableRow>
      <TableCell className="font-mono whitespace-nowrap align-top">
        {g.date}
        <div className="text-xs text-muted-foreground">{g.meetingCode}</div>
      </TableCell>
      <TableCell className="align-top">
        <Badge variant={g.verdict === "clean" ? "default" : "secondary"}>{g.verdict === "clean" ? "Would approve" : "Would hold"}</Badge>
        <div className="text-xs text-muted-foreground mt-1">{g.fileCount} recordings</div>
      </TableCell>
      <TableCell className="align-top text-sm space-y-1">
        {g.reasons.map((r, i) => (
          <div key={i}>{r.message}</div>
        ))}
        {g.verdict === "clean" && g.lectures.map((l) => (
          <div key={l.slotIndex} className="font-mono text-xs">
            {l.titles.map((t) => (
              <div key={t.jobId}>#{t.jobId} {t.title}</div>
            ))}
          </div>
        ))}
        {g.titleChanges.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Would change {g.titleChanges.length} title{g.titleChanges.length === 1 ? "" : "s"} still in review.
          </div>
        )}
      </TableCell>
      <TableCell className="align-top text-xs text-muted-foreground">{teachers.length ? teachers.join(", ") : "none read"}</TableCell>
    </TableRow>
  );
}

export default function AutoReview() {
  const groups = useAutoReviewGroups();
  const agreement = useAutoReviewAgreement();
  const report = agreement.data;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight text-foreground">Auto-review</h1>
        <p className="text-muted-foreground mt-1">
          What the day-approval rules say, and how often they agree with you. Nothing here approves, rejects or uploads.
          {groups.data && <> Recording mode: <span className="font-mono">{groups.data.mode}</span>.</>}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gate for turning the rules on</CardTitle>
        </CardHeader>
        <CardContent>
          {agreement.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {agreement.error && <p className="text-sm text-destructive">{(agreement.error as Error).message}</p>}
          {report && (
            <ul className="space-y-2 text-sm">
              {report.gate.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  {item.met === true && <Check className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />}
                  {item.met === false && <X className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />}
                  {item.met === null && <Minus className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                  <span>
                    {item.text} <span className="text-muted-foreground font-mono">({item.met === null ? "needs a person or a test run" : item.value})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agreement with your decisions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 overflow-x-auto">
            <TallyTable
              rows={[
                ["All days", report.totals],
                ...Object.entries(report.byCode),
                ...Object.entries(report.byWeekday).map(([d, t]): [string, AgreementTally] => [WEEKDAYS[Number(d)] ?? d, t]),
              ]}
            />
            <p className="text-xs text-muted-foreground">
              A false clean is a day the rules would have approved but you changed or rejected something. An unnecessary hold is a day
              the rules would have held that you approved as it was; it measures work not saved, not an error.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Days waiting for your review</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {groups.error && <p className="text-sm text-destructive">{(groups.error as Error).message}</p>}
          {groups.data && groups.data.groups.length === 0 && <p className="text-sm text-muted-foreground">No day is waiting.</p>}
          {groups.data && groups.data.groups.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Rules say</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead>Teachers read</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.data.groups.map((g) => (
                  <GroupRow key={g.group} g={g} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Days with a recorded verdict</CardTitle>
          </CardHeader>
          <CardContent>
            {report.days.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet. Verdicts are recorded while the recording mode is dry_run.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Rules said</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Why</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...report.days].reverse().map((d) => (
                    <TableRow key={d.key}>
                      <TableCell className="font-mono whitespace-nowrap">
                        {d.date}
                        <div className="text-xs text-muted-foreground">{WEEKDAYS[d.weekday]} {d.code}</div>
                      </TableCell>
                      <TableCell>{d.verdict === "clean" ? "Would approve" : d.verdict === "hold" ? `Would hold${d.hard ? " (hard)" : ""}` : "none"}</TableCell>
                      <TableCell className={OUTCOME_CLASS[d.outcome]}>{OUTCOME_LABEL[d.outcome]}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.why}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
