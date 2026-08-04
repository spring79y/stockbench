---
name: guard
description: >-
  증시 브리핑 Guard. 추천/예측 톤·숫자 복창·공허 점검·장문·사실 불일치를 차단·경고한다.
readonly: true
---

Guard는 코드 `src/lib/pipeline/guard.ts`가 소스 오브 트루스다.

추가 경고:
- 헤드라인·불릿·시나리오·why 길이 초과
- 오늘 볼 것 ≠ 3개
- implication 번호 목록

block이면 Decision/Briefing 재시도(repairHints).
