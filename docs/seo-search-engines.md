# 검색엔진 등록 (Google · 네이버)

프로덕션 기준 호스트: **https://www.stock-bench.com**  
(`stock-bench.com` → www로 리다이렉트)

> 이전에 안내했던 `robots.ts` / `sitemap.ts` 원문은 저장소·채팅 기록에서 찾지 못해, Next.js App Router 표준 방식으로 `src/app/`에 구현했습니다.

## 배포 후 확인

배포가 반영되면 브라우저에서 열어 보세요.

| URL | 기대 |
|-----|------|
| https://www.stock-bench.com/robots.txt | `Allow: /`, `Disallow: /ops`, `Disallow: /api/`, `Sitemap: …/sitemap.xml` |
| https://www.stock-bench.com/sitemap.xml | 홈·`/?view=kr`·`/?view=us`·일정(`/events/…`) URL 목록 |

제출용 사이트맵 URL (복붙):

```text
https://www.stock-bench.com/sitemap.xml
```

`/ops`는 robots에서 막고, 페이지 메타에도 `noindex`가 걸려 있습니다.

---

## Google Search Console

1. [Google Search Console](https://search.google.com/search-console) 접속 · Google 계정 로그인  
2. **속성 추가**  
   - 권장: **도메인** 속성 → `stock-bench.com` (www·비www 모두 커버, DNS TXT 인증)  
   - 또는 **URL 접두어** → `https://www.stock-bench.com` (HTML 파일 / meta 태그 / Google Analytics 등으로 인증)  
3. 안내에 따라 **소유권 확인** 완료  
4. 왼쪽 **Sitemaps**(사이트맵) → 새 사이트맵 추가  
5. 위에 적은 URL을 입력 → **제출**  
6. (선택) **URL 검사**에서 `https://www.stock-bench.com/` 색인 요청

반영·색인까지는 수 일 걸릴 수 있습니다.

---

## 네이버 서치어드바이저

1. [네이버 서치어드바이저](https://searchadvisor.naver.com/) 접속 · 네이버 계정 로그인  
2. **웹마스터 도구** → **사이트 등록**  
3. 사이트 URL: `https://www.stock-bench.com` (www 기준 권장)  
4. **소유 확인** (HTML 파일 업로드 또는 meta 태그 — 안내에 따름)  
5. **요청** → **사이트맵 제출** (또는 동등 메뉴)  
6. 사이트맵 URL: `https://www.stock-bench.com/sitemap.xml` 제출  
7. (선택) **웹 페이지 수집**에서 홈 URL 수집 요청

네이버도 반영에 시간이 걸릴 수 있습니다.

---

## 참고

- 앱 라우트: `src/app/robots.ts`, `src/app/sitemap.ts`  
- 비공개: `/ops`(시크릿), `/api/*`  
- Analytics·ops UI는 `docs/ops.md` 참고
