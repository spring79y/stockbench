import type { Metadata } from "next";
import { formatBriefingUpdatedAt } from "@/lib/events/catalog";
import { loadOpsSnapshot } from "@/lib/pipeline/loadOpsSnapshot";
import {
  PIPELINE_MANUAL_ROWS,
  pipelineScheduleRows,
} from "@/lib/pipeline/schedule";

export const metadata: Metadata = {
  title: "Ops — StockBench",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

function fmtAge(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}분 전`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default async function OpsPage() {
  const ops = await loadOpsSnapshot();
  const last = ops.lastRun;
  const schedule = pipelineScheduleRows();

  return (
    <main className="ops">
      <header className="ops__header">
        <p className="ops__eyebrow">owner only · noindex</p>
        <h1 className="ops__title">Ops</h1>
        <p className="ops__lede">파이프라인·발행 상태만. 방문 수는 Vercel Analytics.</p>
      </header>

      <section className="ops__section" aria-labelledby="ops-schedule">
        <h2 id="ops-schedule" className="ops__h2">
          Publish briefing schedule
        </h2>
        <p className="ops__muted">평일(KST) · GitHub Actions cron · workflow_dispatch</p>
        <div className="ops__table-wrap">
          <table className="ops__table">
            <thead>
              <tr>
                <th scope="col">KST</th>
                <th scope="col">슬롯</th>
                <th scope="col">모드</th>
                <th scope="col">스크립트</th>
                <th scope="col">갱신 탭</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                <tr key={`${row.kst}-${row.slot}`}>
                  <td>{row.kst}</td>
                  <td>
                    <code>{row.slot}</code>
                    <span className="ops__meta"> · {row.label}</span>
                  </td>
                  <td>{row.mode}</td>
                  <td>
                    <code className="ops__script">{row.script}</code>
                  </td>
                  <td>{row.tabs}</td>
                </tr>
              ))}
              {PIPELINE_MANUAL_ROWS.map((row) => (
                <tr key={row.slot}>
                  <td>{row.kst}</td>
                  <td>
                    <code>{row.slot}</code>
                    <span className="ops__meta"> · {row.label}</span>
                  </td>
                  <td>{row.mode}</td>
                  <td>
                    <code className="ops__script">{row.script}</code>
                  </td>
                  <td>{row.tabs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ops__section" aria-labelledby="ops-publish">
        <h2 id="ops-publish" className="ops__h2">
          latest.json
        </h2>
        <dl className="ops__dl">
          <div>
            <dt>slot</dt>
            <dd>{ops.published.slot ?? "—"}</dd>
          </div>
          <div>
            <dt>publishedAt</dt>
            <dd>
              {ops.published.publishedAt
                ? formatBriefingUpdatedAt(ops.published.publishedAt)
                : "—"}
              {ops.published.publishedAt ? (
                <span className="ops__meta"> · {ops.published.publishedAt}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>freshness</dt>
            <dd>{fmtAge(ops.published.ageMinutes)}</dd>
          </div>
          <div>
            <dt>mode / source</dt>
            <dd>
              {ops.published.mode ?? "—"} / {ops.published.source ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="ops__section" aria-labelledby="ops-guard">
        <h2 id="ops-guard" className="ops__h2">
          Guard
        </h2>
        <p className={ops.guard.blocked ? "ops__badge ops__badge--bad" : "ops__badge ops__badge--ok"}>
          {ops.guard.blocked ? "block" : "pass"} · {ops.guard.summary}
        </p>
        {ops.guard.findings.length > 0 ? (
          <ul className="ops__list">
            {ops.guard.findings.map((f, i) => (
              <li key={`${f.code}-${i}`}>
                <span className="ops__code">[{f.severity}] {f.code}</span>{" "}
                {f.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ops__muted">findings 없음</p>
        )}
      </section>

      <section className="ops__section" aria-labelledby="ops-run">
        <h2 id="ops-run" className="ops__h2">
          Last pipeline run
        </h2>
        {last ? (
          <>
            <p className={last.ok ? "ops__badge ops__badge--ok" : "ops__badge ops__badge--bad"}>
              {last.ok ? "success" : "fail"}
              {last.slot ? ` · ${last.slot}` : ""}
              {last.mode ? ` · ${last.mode}` : ""}
            </p>
            <dl className="ops__dl">
              <div>
                <dt>updatedAt</dt>
                <dd>
                  {formatBriefingUpdatedAt(last.updatedAt)}
                  <span className="ops__meta"> · {last.updatedAt}</span>
                </dd>
              </div>
              {last.guardSummary ? (
                <div>
                  <dt>guard</dt>
                  <dd>{last.guardSummary}</dd>
                </div>
              ) : null}
              {last.error ? (
                <div>
                  <dt>error</dt>
                  <dd className="ops__error">{last.error}</dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : (
          <p className="ops__muted">
            status.json 없음 — 다음 파이프라인 실행부터 기록됩니다.
          </p>
        )}
      </section>
    </main>
  );
}
