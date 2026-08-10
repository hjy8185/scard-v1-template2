# API 계약 — v1 (템플릿 방식)

기준: `bff/api/*.py` · `bff/models.py`
Base URL: `${BFF_URL}` (기본 `http://localhost:8000`)

프론트엔드는 `frontend-app/app/api/*`에서 이 엔드포인트로 프록시합니다.

---

## 1. 엔드포인트 목록

| 메서드 | 경로 | 용도 |
|---|---|---|
POST | `/api/chat` | 자연어 질의 — **스트리밍** |
POST | `/api/chat/orchestrated` | 자연어 질의 — 단계 오케스트레이션 |
POST | `/api/metrics/query` | 명명된 지표 조회 |
POST | `/api/rule/simulate` | 혜택 규칙 시뮬레이션 |
GET | `/api/graph/{card_id}` | 카드 그래프(Cytoscape 형식) |
GET | `/api/anatomy` | 카테고리 해부 |
GET | `/api/catalog` | 데이터 카탈로그 |
GET | `/api/scenarios` | 데모 시나리오 목록 |
GET | `/api/routing/insights` | 라우팅 판정 통계 |
GET | `/api/cache/status` | 캐시 상태 |
POST | `/api/cache/warm` | 캐시 예열 |

---

## 2. POST /api/chat — 스트리밍 질의

### 요청

```json
{
  "query": "스타벅스 할인되는 카드 알려줘",
  "session_id": "optional-session-id",
  "preset_card_id": "optional-card-id"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
`query` | string | ✅ | 자연어 질문 |
`session_id` | string | | 대화 세션 |
`preset_card_id` | string | | 카드 컨텍스트 주입(자격 판정 등) |

### 응답 — AI SDK v1 data stream

```
Content-Type: text/plain; charset=utf-8
x-vercel-ai-data-stream: v1
```

프레임 형식:

| 프레임 | 의미 | 예 |
|---|---|---|
`0:` | 답변 토큰 | `0:"스타벅스 5% 할인은..."\n` |
`8:` | annotation(단계·근거) | `8:[{"stage":"traverse","status":"done","ms":412}]\n` |
`d:` | 종료 | `d:{"finishReason":"stop"}\n` |

**단계(stage) 값**: `glossary` · `classify` · `search` · `traverse` · `prune` ·
`generate` · `validate` · `correct` · `verify`

**상태(status) 값**: `done` · `active` · `blocked` · `skip` · `pending`

⚠️ **AgentCore 스트리밍이 실패하면 full 모드로 폴백**합니다 — 응답은 같은 프레임 형식으로
한 번에 옵니다.

⚠️ **템플릿이 없는 질문**은 답변 대신 기권 메시지가 옵니다. 지어내지 않습니다.

---

## 3. POST /api/metrics/query — 지표 조회

```json
{ "name": "card_benefit_coverage", "filters": { "category": "커피/음료" } }
```

| 필드 | 타입 | 필수 |
|---|---|---|
`name` | string | ✅ **명명된 지표만** |
`filters` | object | |

⚠️ **임의 SQL을 받지 않습니다.** `name`은 영숫자+`_`만 허용되고
(`400 invalid metric name`), 실제 질의는 서버가 정의한 지표에만 매핑됩니다.

---

## 4. POST /api/rule/simulate — 규칙 시뮬레이션

```json
{
  "base_rule": "<허용된 프리셋 중 하나>",
  "cohort": "<대상 집단>",
  "delta": { "rate": 0.07 },
  "query": "optional natural language"
}
```

⚠️ `base_rule`은 **서버가 정의한 프리셋만** 허용합니다(`_ALLOWED_BASE_RULES`).
임의 규칙 실행은 불가합니다.

---

## 5. GET /api/graph/{card_id}

Cytoscape 형식으로 카드 주변 그래프를 반환합니다.

```json
{
  "nodes": [ { "data": { "id": "...", "label": "..." } } ],
  "edges": [ { "data": { "source": "...", "target": "..." } } ]
}
```

---

## 6. GET /api/scenarios

```json
[
  {
    "id": "sc-01",
    "title": "가맹점 혜택 탐색",
    "query": "스타벅스 할인되는 카드 알려줘",
    "category": "benefit",
    "description": "optional"
  }
]
```

---

## 7. GET /api/routing/insights

라우팅 판정 통계입니다. **이 방식의 품질 관리 지점**입니다 — 어떤 질문이 어느 의도로
분류됐고 기권했는지를 보여줍니다.

---

## 8. GET /api/cache/status · POST /api/cache/warm

캐시 상태 조회와 예열. 지표 질의 캐시(Valkey)를 대상으로 합니다.

---

## 9. 오류

| 상태 | 의미 |
|---|---|
400 | 요청 검증 실패(지표명 형식, 허용되지 않은 프리셋 등) |
500 | 내부 오류 |
502/503 | 상위 의존성(AgentCore·Neptune) 실패 |

⚠️ 오류 응답에 내부 질의문·스택·엔드포인트를 담지 않습니다.

---

## 10. 환경변수

| 변수 | 용도 |
|---|---|
`AGENTCORE_RUNTIME_ARN` | AgentCore Runtime ARN — **반드시 실제 값으로 교체** |
`NEPTUNE_ENDPOINT` · `NEPTUNE_PORT` | 그래프 |
`ATHENA_DATABASE` · `ATHENA_WORKGROUP` | 집계 |
`AWS_REGION` | 리전 |
`BFF_URL` | (프론트) 백엔드 주소 |

⚠️ 기본값에 남아 있는 `000000000000` · `EXAMPLE*`는 **플레이스홀더**입니다.
