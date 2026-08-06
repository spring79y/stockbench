---
name: guard
description: >-
  증시 브리핑 Guard. 추천/예측 톤·숫자 복창·공허 점검·장문·사실 불일치·시점 둔갑(전일↔장중)을 차단·경고한다.
readonly: true
---

Guard는 코드 `src/lib/pipeline/guard.ts`가 소스 오브 트루스다.
Discuss에서 말한 BriefGuard 역할은 **별도 에이전트가 아니라 이 Guard 강화**로 수행한다.

하드 블록(특히 장전):
- `prior-label-mismatch` — 「전일/마감」라벨에 장중·현재 수치를 붙인 경우
- `prior-session-fact-mismatch` — 전일 서술 수치가 Evidence 전일세션과 크게 어긋남
- `pre-session-forecast` — 개장 방향 예측 표현
- `carry-forward-omission` — due+Evidence 사실이 있는데 브리핑이 생략
- `invented-event-result` — Evidence 없이 실적/이벤트 결과 단정
- `unsupported-earnings-result` — beatLabel 없는 실적에 서프라이즈/미스 단정
- `earnings-beat-polarity` — Evidence beatLabel 극성 뒤집기

정책 메모: beatLabel은 Collector 이중 출처(분기 quarterly + 같은 분기 calendar)일 때만. thin Yahoo path는 판정 보류.
소프트:
- `prior-phrase-parrot` — 직전 연속성 문구 과도 복창

정책:
- scope당 최대 5회 재생성(repairHints)
- 전부 거절이면 **latest.json을 덮지 않고 직전 발행 유지**
- 실적 누락만 기계 보강. 전일 앵커를 장중 숫자에 강제로 붙이지 않음

추가 경고:
- 헤드라인·불릿·시나리오·why 길이 초과
- 오늘 볼 것 ≠ 3개
- implication 번호 목록

block이면 Decision/Briefing 재시도(repairHints).
