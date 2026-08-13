# Cloudflare Catch-up cron (GHA schedule SPOF break)

외부에서 **Catch-up watchdog**만 `workflow_dispatch`로 깨운다.  
Publish briefing primary cron은 그대로 GitHub Actions에 둔다.

## 왜

GHA `schedule`이 멈추면 primary와 catch-up 프로브가 **같이** 안 뜬다.  
이 Worker는 Cloudflare cron으로 같은 시각 창에 catch-up만 한 번 더 깨운다.  
이미 발행·당일 1회면 워크플로 게이트가 스킵하므로 LLM을 불필요하게 안 돌린다.

## 배포

```bash
cd ops/cf-catchup-cron
npx wrangler login
npx wrangler secret put GITHUB_TOKEN   # PAT: actions:write (또는 classic repo+workflow)
# optional:
# npx wrangler secret put GITHUB_REPO  # default spring79y/stockbench
npx wrangler deploy
```

수동 스모크: Worker URL에 `GET /?run=1` 또는 `POST /dispatch`.

예: `curl "https://stockbench-catchup-cron.spring79y-stockbench.workers.dev/?run=1"`

**Cron:** Cloudflare는 요일 `0` 불가(1=SUN…7=SAT). `wrangler.toml`은 `SUN-THU` / `MON-FRI` 사용(GitHub의 `0-4`/`1-5`를 그대로 쓰면 실패).

## PAT 최소 권한

- Fine-grained: Actions **Read and write**, Contents read(필요 시)
- Classic: `repo` + `workflow`

토큰은 git에 넣지 않는다.
