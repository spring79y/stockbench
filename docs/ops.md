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
