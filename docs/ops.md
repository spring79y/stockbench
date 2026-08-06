# Ops (소유자 전용)

방문·유입은 **앱 안이 아니라 Vercel Analytics**에서 본다.  
`/ops`는 파이프라인·발행 상태만 보여 준다. 공개 내비에 링크 없음 · `noindex`.

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

- `latest.json` 신선도: slot, publishedAt, mode  
- Guard 통과/차단 + 짧은 summary  
- `status.json`: 최근 파이프라인 성공/실패·에러 한 줄 (Actions가 커밋)

GitHub Actions 로그 자체는 Vercel에서 읽지 못한다. 커밋된 `latest.json` / `status.json`이 신호다.

웹 푸시 순서: pipeline → `latest.json` 커밋·push → `/api/published`로 프로덕션 반영 대기 → `push:slot`. 로컬 파이프라인 직후 푸시하지 않는다.

## 실적 beat/miss (정확성)

- `beatLabel`(서프라이즈/미스)은 **Collector만** 설정한다 (`src/lib/market/earningsBeat.ts` → `fetchEarningsCalendar`).
- 조건: 같은 분기 `earningsChart.quarterly`에서 `reportedDate`가 발표일과 매칭되고, actual·estimate가 모두 유한수이며, **같은 분기 calendar 컨센서스가 극성을 이중 확인**할 때만.
- **이중 출처 필수:** Yahoo quarterly 단독(포스트프린트 calendar가 다음 분기로 롤된 thin path)이면 숫자만 두고 `beatLabel` 생략. EventList `oneLiner`는 EPS 숫자·「결과 미확인」등 **최소 사실만** (「판정 보류」 금지).
- **역할 분리:** Collector = 숫자·플래그·Evidence. Briefing LLM = 결과+시장 반응 서술. 숫자+`contextNews`면 **이중 서술**(예: EPS 숫자 + 가이던스 실망 → 주가/섹터 반응) 허용. 뉴스 없으면 반응 풍부 서술 생략·must-cover 강제 시 「반응 근거 부족」.
- **가이던스·반응 Evidence:** Collector가 임박/직후 실적에 Google News RSS(KO·US EN) 헤드라인을 `contextNews`로 붙인다 (`fetchEarningsContextNews.ts`). 최소 근거: ≥1 헤드라인 + 숫자(또는 가격 반응). 뉴스 톤으로 beat/miss 창작 금지.
- **금지:** `quarterlies[0]` 폴백, 동일 시 미스 처리, Yahoo `calendarEvents.earningsAverage`가 다음 분기로 롤된 값을 이번 발표 컨센서스로 붙이기, UI/LLM이 beatLabel 재계산.
- Guard: `invented-event-result` · `unsupported-earnings-result` · `earnings-beat-polarity` · `unsupported-guidance-claim` · `earnings-reaction-omission`(숫자+뉴스인데 가이던스/반응 누락 — forceCite/mustCover·라이브 due면 hard fail) (브리핑·시나리오·체크리스트 전부). 숫자+뉴스 이중 서술은 허용·필수.
- 단위 테스트: `npm run test:unit` (`earningsBeat.test.ts`, `guard.earnings.test.ts`).

### 발행 노트 (역할 분리 반영)

- EventList oneLiner는 즉시 facts-only로 스크럽 가능. **LLM 이중 서술 브리핑 불릿**은 다음 풀 파이프라인(예: `us-noon` / `kr-mid` 12:30) 재실행 후 반영.
