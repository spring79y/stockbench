# Ops (소유자 전용)

방문·유입은 **앱 안이 아니라 Vercel Analytics**에서 본다.  
`/ops`는 파이프라인·발행 상태와 푸시 알림 ON 수만 보여 준다. 공개 내비에 링크 없음 · `noindex`.

## 환경 변수

| 변수 | 설명 |
|------|------|
| `OPS_SECRET` | `/ops` 접근용 비밀 문자열. Vercel Project → Settings → Environment Variables 에 추가. 로컬은 `.env.local`. |

프로덕션에서 `OPS_SECRET`이 없으면 `/ops`는 503.  
로컬(development)에서는 시크릿 없이도 열리지만, 평소에는 `.env.local`에 넣어 두는 것을 권장.

`.env.example`에 placeholder만 있고 실제 값은 git에 넣지 않는다.

## `/ops` 열기

- **로컬:** `npm run dev` 후 `http://localhost:3000/ops?key=YOUR_SECRET`  
  (시크릿이 맞으면 쿠키가 잡히고 URL에서 `key`가 제거됨)
- **프로덕션:** `https://<배포도메인>/ops?key=YOUR_SECRET`
- 또는 `Authorization: Bearer YOUR_SECRET` 헤더

## Vercel Analytics (방문 · 유입)

1. [Vercel Dashboard](https://vercel.com/dashboard) → 해당 프로젝트 선택  
2. 상단 **Analytics** 탭 (또는 좌측 Analytics)  
3. **Web Analytics**가 꺼져 있으면 Enable (Hobby도 기본 Web Analytics 제공)  
4. 기간: 상단 날짜 범위에서 **Day / Week / Month**(또는 Custom) 선택 → Visitors·Pageviews 확인  
5. **Referrers**(또는 Top Referrers)에서 유입 경로 확인  

앱 안에 PV/UV·리퍼러 카운터는 두지 않는다. `@vercel/analytics`는 루트 레이아웃에만 심어 두었다.

## 검색엔진 등록 (Google · 네이버)

`robots.txt` / `sitemap.xml` 및 Search Console·서치어드바이저 제출 절차는 [`docs/seo-search-engines.md`](./seo-search-engines.md)를 본다.

## `/ops`에 보이는 것

- **Slot health** (배지): 오늘(KST) 기대 슬롯이 +45분 이상 비었는지. `ok` / `stale`(캐치업 창) / `missed`(창 지나도 비었거나 catch-up 후에도 비어 있음). 복구 힌트(Publish → `noon` 등) 표시. Slack 알림 없음 — 배지만.
- **Push notifications ON**: 활성 구독 endpoint 수(집계만 · endpoint/키/PII 비노출). 페이지 로드 시 Redis 인덱스로 재집계해 카운터 드리프트를 보정하고, 재집계 시각을 함께 표시한다. ON = `push:sub:*` 레코드에 시장이 있고 ≥1 슬롯이 켜진 경우. 구독 ON 전환 시 +1, 완전 해제(또는 슬롯 없는 상태) 시 −1. 슬롯만 바꾸거나 같은 ON 상태 재저장은 카운트 불변.
- `latest.json` 신선도: slot, publishedAt, mode  
- Guard 통과/차단 + 짧은 summary  
- `status.json`: 최근 파이프라인 성공/실패·에러 한 줄 (Actions가 커밋). 탭 keep-previous면 `ok=false`, `keepPreviousScopes`/`keepPreviousCodes` (루트 `kr-pre`만 보고 한국 탭이 어제인 상태를 숨기지 않음).

Catch-up·Slot health는 **views.kr / views.us 스탬프**만 본다. `views.all`·루트가 오늘 `kr-pre`여도 한국 탭이 `kr-post`(어제)면 morning은 미완료 → 재시도. 같은 날 더 늦은 같은 시장 슬롯(예: `kr-mid`)은 앞 슬롯을 충족한 것으로 본다.

장전 `fact-mismatch`/`fx-mismatch`는 프리마켓 라이브 틱을 전일 사실로 쓰지 않는다. 강세/약세는 전일 마감이 기본, 「현재」 단서만 라이브.

유입·방문 퍼널·리퍼러는 `/ops`에 두지 않는다(Vercel Analytics).

GitHub Actions 로그 자체는 Vercel에서 읽지 못한다. 커밋된 `latest.json` / `status.json`이 신호다.

## Publish briefing (GitHub Actions)

워크플로: [`.github/workflows/pipeline.yml`](../.github/workflows/pipeline.yml) · 이름 **Publish briefing**.

### 스케줄은 서로 독립

각 cron(`us-post`+`kr-pre`, `us-noon`+`kr-mid`, `kr-post`, `us-pre`)은 **별도 `schedule` 트리거**다. 이전 실행이 실패해도 다음 슬롯 cron이 막히지 않는다.  
`us-mid`(02:00)는 **자동 cron·자동 catch-up 없음** — Actions에서 `us-mid`/`all`로만 수동 실행.

수동 실행: Actions → Publish briefing → **Run workflow** → `morning` / `noon` / 개별 슬롯 / `all`.

**오늘(또는 방금) noon이 비었을 때:** Actions에 `us-noon`/`kr-mid` run이 없고 latest가 아침(`kr-pre`/`us-post`)에 멈춰 있으면 → **Run workflow → `noon`**. Catch-up watchdog는 remote에 있어야 자동 복구한다(로컬만 있으면 push 필요).

### Hosted runner 미획득 · Internal server error

앱·파이프라인 코드가 돌기 **전에** job이 죽을 수 있다. 증상 예:

- `Internal server error. Correlation ID: …`
- `The job was not acquired by Runner of type hosted even after multiple attempts`

원인: GitHub **hosted runner 풀 고갈·인프라 ISE** (저장소/ANTHROPIC 키/pipeline 버그가 아님). Checkout·`npm ci`·`npm run pipeline` 로그가 없으면 이 케이스다.

대응 (앱에서 runner 풀을 고칠 수 없음):

1. 해당 run에서 **Re-run all jobs** (또는 Re-run failed jobs)
2. 아침 슬롯이 비었으면 **Run workflow** → `morning` (`us-post` → `kr-pre`)
3. YAML로 “runner 미획득만 자동 재시도”는 사실상 불가 → 위 수동 재실행이 정답

동시 실행: `concurrency.group: publish-briefing`, `cancel-in-progress: false` — 겹치면 대기하고, 진행 중 run을 취소해 슬롯을 버리지 않는다. `timeout-minutes: 60`.

웹 푸시 순서: pipeline → `latest.json` 커밋·push → `/api/published`로 프로덕션 반영 대기 → `push:slot`. 로컬 파이프라인 직후 푸시하지 않는다.  
`wait:published-live`가 타임아웃·불일치로 **실패(exit 1)** 하면 Publish job이 실패하고 **슬롯 푸시는 스킵**된다(배포 미반영인데 알림만 가는 것 방지). 보드 복구는 Vercel Redeploy 후 `/api/published` 스탬프 확인.

홈(PWA·브라우저)이 백그라운드에서 돌아올 때는 발행 버전 비교 없이 `location.reload()`로 셸을 갱신한다(짧은 탭 blip·자기 reload 루프는 제외). Cache API는 백그라운드에서 비우지 않는다. 알림 클릭 hard navigate는 그대로.

## Catch-up watchdog (누락·지연 복구)

워크플로: [`.github/workflows/catchup-watchdog.yml`](../.github/workflows/catchup-watchdog.yml) · 이름 **Catch-up watchdog**.

**하는 일:** 기대 KST 슬롯 시각 이후 **45분**이 지났는데 `latest.json`(루트·탭 `slot`/`publishedAt`)에 같은 서울 날짜의 해당 슬롯 발행이 없으면, 그 슬롯(또는 `morning`/`noon` 묶음)을 **하루 1회** 다시 돌린다. `GITHUB_TOKEN`만 사용하며 Publish briefing을 `workflow_call`로 호출한다(`workflow_dispatch` 체인은 토큰 제한으로 불가).

**하지 않는 일:** 분 단위 정시 보장, hosted runner 미획득 0건, 제품 UI 추가.

### 외부 트리거 (Cloudflare) — GHA schedule SPOF 완화

GHA `schedule`이 멈추면 primary와 catch-up 프로브가 같이 안 뜬다.  
`ops/cf-catchup-cron` Cloudflare Worker가 **같은 프로브 시각**에 Catch-up watchdog만 `workflow_dispatch`로 깨운다(이미 발행·당일 1회면 스킵). 배포·PAT: [`ops/cf-catchup-cron/README.md`](../ops/cf-catchup-cron/README.md).

`/ops` **Slot health** 배지로 stale/missed를 본다(Slack 없음). runner 고갈·ISE면 배지가 `missed`여도 자동 복구는 안 되니 수동 Publish가 필요.

### 프로브 cron (UTC · 슬롯 +≈45/+65분)

| 슬롯(KST) | catch-up probes (UTC) |
|-----------|------------------------|
| morning 07:00 | `45 22` · `5 23` (Sun–Thu) |
| noon 12:30 | `15 4` · `35 4` (Mon–Fri) |
| kr-post 15:40 | `25 7` · `45 7` (Mon–Fri) |
| us-pre 21:50 | `35 13` · `55 13` (Mon–Fri) |

주말은 스크립트가 스킵. 탐지 창은 대략 **슬롯+45분 ~ +180분**. `us-mid`는 자동 탐지하지 않는다.

### 중복 방지

1. Publish briefing이 `in_progress`/`queued`이거나 다른 catch-up run이 진행 중이면 스킵  
2. `src/data/published/catchup.json`에 당일 target 마커를 남기고 같은 target은 재디스패치하지 않음  
3. Publish briefing과 동일 `concurrency.group: publish-briefing`

### 한계 (약속하지 말 것)

- 워치독 GHA 스케줄도 늦을 수 있음 → **Cloudflare 외부 dispatch**로 완화(완전 제거는 아님)
- hosted runner 고갈·ISE면 catch-up도 막힐 수 있음 → `/ops` Slot health 배지 + 수동 Re-run / `workflow_dispatch`
- catch-up 1회 실패 후 자동 재시도 없음(당일 마커)
- 정시 SLA 없음 — “비어 있는 브리핑을 늦게라도 채움”

로직·단위 테스트: `src/lib/pipeline/catchup.ts`, `npm run test:unit`(catchup 포함). 수동 점검: Actions → Catch-up watchdog → Run workflow.

## 실적 beat/miss (정확성)

- `beatLabel`(서프라이즈/미스)은 **Collector만** 설정한다 (`src/lib/market/earningsBeat.ts` → `fetchEarningsCalendar`).
- 조건: 같은 분기 `earningsChart.quarterly`에서 `reportedDate`가 발표일과 매칭되고, actual·estimate가 모두 유한수이며, **같은 분기 calendar 컨센서스가 극성을 이중 확인**할 때만.
- **이중 출처 필수:** Yahoo quarterly 단독(포스트프린트 calendar가 다음 분기로 롤된 thin path)이면 숫자만 두고 `beatLabel` 생략. EventList `oneLiner`는 EPS 숫자·「결과 미확인」등 **최소 사실만** (「판정 보류」 금지).
- **영업이익 컨센서스:** KR은 네이버 금융 `finance/quarter`의 `isConsensus=Y` **영업이익**만 사용 (`fetchNaverOpConsensus.ts`). 발표일→분기 키(YYYYMM) 매칭 실패·파싱 실패면 **생략**(창작 금지). 매칭 시 같은 열 매출도 붙여 매출·영업이익을 동일 회사 규모 단위(조원/억원)로 표시. EPS·beat는 Yahoo 유지. US는 네이버에 영업이익 컨센서스 행이 없어 현재 미수집.
- **역할 분리:** Collector = 숫자·플래그·Evidence. Briefing LLM = 결과+시장 반응 서술. 숫자+`contextNews`면 **이중 서술**(예: EPS 숫자 + 가이던스 실망 → 주가/섹터 반응) 허용. 뉴스 없으면 반응 서술 **생략**(「반응 근거 부족」등 메타 금지). LLM/Guard 실패 시 **같은 시장 직전 본문 유지** — facts-only는 보드 「오늘의 브리핑」으로 쓰지 않음.
- **가이던스·반응 Evidence:** Collector가 임박/직후 실적에 Google News RSS(KO·US EN) 헤드라인을 `contextNews`로 붙인다 (`fetchEarningsContextNews.ts`). 최소 근거: ≥1 헤드라인 + 숫자(또는 가격 반응). 뉴스 톤으로 beat/miss 창작 금지.
- **발표됨·집계 대기:** Yahoo 시각 전이라도 같은 KST일 + 결과 헤드라인, 또는 시각 경과 후 API 숫자 없으면 EventList oneLiner는 「발표됨 · 결과 집계 대기」(숫자 창작 금지). pending+`contextNews`도 Briefing must-cover·이중 서술(뉴스 기반) 대상.
- **영업이익 실제:** 1순위는 네이버 `finance/quarter`에서 `isConsensus≠Y` 분기 열 → `operatingProfitActual`. 발표 직후 열이 아직 컨센서스(`isConsensus=Y`)만이면 2순위 **네이버 공정공시** `GET /api/stock/{code}/disclosure`(+ detail)의 **연결재무제표 영업(잠정)실적**만 사용 (`fetchNaverEarningsDisclosure.ts`). 조건: 연결 제목·단위 억원·당기 분기 키 일치·매출+영업이익 둘 다·컨센서스 대비 자릿수/규모(0.25×~4×) 검증. **별도** 잠정실적·모호한 헤드라인/뉴스 title regex로 실제 채우지 않음. 실패 시 soft-fail → 「발표됨 · 결과 집계 대기」.
- **금지:** `quarterlies[0]` 폴백, 동일 시 미스 처리, Yahoo `calendarEvents.earningsAverage`가 다음 분기로 롤된 값을 이번 발표 컨센서스로 붙이기, UI/LLM이 beatLabel 재계산, Evidence에 없는 영업이익 창작.
- Guard: `invented-event-result` · `unsupported-earnings-result` · `earnings-beat-polarity` · `unsupported-guidance-claim` · `earnings-reaction-omission`(숫자|집계대기+뉴스인데 가이던스/반응 누락 — forceCite/mustCover·라이브 due면 hard fail) · `carry-forward-no-reeval` · `slot-tone-mismatch` · `empty-briefing` (브리핑·시나리오·체크리스트 전부). 숫자+뉴스 이중 서술은 허용·필수. 재생성 시 `findingsToRepairHints`가 코드별 수정 지시를 프롬프트에 넣는다.
- 단위 테스트: `npm run test:unit` (`earningsBeat.test.ts`, `earningsAnnounced.test.ts`, `fetchNaverOpConsensus.test.ts`, `fetchNaverEarningsDisclosure.test.ts`, `guard.earnings.test.ts`, `guard.quality.test.ts`).

### 오늘 브리핑 품질 (제품 베팅)

- 차별점 = **오늘 브리핑 호흡**: 온도 → 브리핑 → 시나리오 A/B → 오늘 볼 것 (Decision 동일 우선순위).
- 불릿 패턴: 사실 → 왜 → 체감 → 관찰. 슬롯 JOB(장전≠장중≠장후) 톤 분리.
- 실적: 숫자+`contextNews`면 개미용 이중 서술 1불릿(매출/주당순이익 + 예상대비 + 가이던스/반응).
- 품질 게이트: Guard + unit/fixture. 사람 샘플 리뷰는 ops 후속.

### 발행 노트 (역할 분리 반영)

- EventList oneLiner는 즉시 facts-only로 스크럽 가능. **LLM 이중 서술 브리핑 불릿**은 다음 풀 파이프라인(예: `us-noon` / `kr-mid` 12:30) 재실행 후 반영.
