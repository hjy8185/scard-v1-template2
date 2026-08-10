# 아키텍처 — v1 (템플릿 방식)

## 1. 전체 구조

```
 브라우저
   │
   ▼
 frontend-app (Next.js)          ← 화면 + BFF 프록시
   │  /api/*  →  ${BFF_URL}/api/*
   ▼
 bff (FastAPI)                   ← 이 패키지의 백엔드
   │
   ├─→ AgentCore Runtime         ← 의도 분류 + 템플릿 선택 + 실행 (에이전트)
   │      │
   │      ├─→ Neptune            그래프 질의 (카드·혜택·카테고리)
   │      └─→ Athena             집계 질의 (소비·상권)
   │
   ├─→ Neptune (직접)            그래프 조회 API
   └─→ 메트릭 캐시               지표 질의 캐시
```

**BFF는 얇습니다.** 의도 분류와 질의 실행은 **AgentCore Runtime의 에이전트**가 담당하고,
BFF는 그 결과를 프론트 계약으로 변환·중계합니다.

---

## 2. 템플릿 방식이란

이 시스템의 핵심 선택은 **"질의문을 LLM이 쓰지 않는다"** 입니다.

```
질문: "스타벅스 할인되는 카드 알려줘"

  ① 시멘틱 라우터 — 질문을 임베딩해 의도(frame)를 분류
       → frame = "benefit_by_merchant"
  ② 템플릿 선택 — 그 의도에 대응하는 질의가 코드에 미리 있다
       → Gremlin: g.V().hasLabel('Clean_Benefit').has('merchant', X)...
  ③ 파라미터 채우기 — 질문에서 추출한 값만 바인딩
       → X = "스타벅스"
  ④ 실행 → 결과
  ⑤ LLM이 결과를 문장으로 서술
```

LLM이 개입하는 지점은 **①의 보조**(모호한 표현 해석)와 **⑤**(서술)뿐입니다.
**무엇을 조회할지는 코드가 결정**합니다.

### 왜 이렇게 하는가

| 문제 | 템플릿 방식의 답 |
|---|---|
LLM이 없는 테이블·컬럼을 지어냄 | 질의를 LLM이 쓰지 않으므로 발생하지 않음 |
같은 질문에 다른 답 | 같은 의도 → 같은 템플릿 → 결정론적 |
질의 생성 비용·지연 | 없음 |

### 무엇을 포기하는가

**템플릿이 없는 질문에는 답하지 않습니다.** 이것이 이 방식의 본질적 한계이고,
`scard-v2-llm` 패키지가 다루는 문제입니다.

⚠️ 답하지 못할 때 **지어내지 않고 기권**합니다 — 정확도 숫자가 의미를 갖게 하려면
"모른다"와 "틀렸다"가 구분되어야 합니다.

---

## 3. 모듈 경계

| 모듈 | 책임 |
|---|---|
`bff/main.py` | FastAPI 앱 · 라우터 등록 · CORS |
`bff/api/chat.py` | `POST /api/chat` — AgentCore SSE를 프론트 스트림으로 중계. 스트리밍 실패 시 full 모드로 폴백 |
`bff/api/graph.py` | Neptune 직접 조회(카드 상세) |
`bff/api/metrics.py` | 지표 질의 + 캐시 |
`bff/api/rule.py` | 혜택 규칙 시뮬레이션 |
`bff/api/anatomy.py` | 카테고리 해부(구성 분석) |
`bff/api/catalog.py` | 데이터 카탈로그 조회 |
`bff/api/routing.py` | 라우팅 판정 통계 |
`bff/api/scenarios.py` | 데모 시나리오 목록 |
`bff/api/cache.py` | 캐시 상태·예열 |
`bff/clients/agentcore_client.py` | AgentCore Runtime 호출(boto3) · SSE 파싱 |
`bff/clients/neptune_client.py` | Gremlin 실행 |
`bff/clients/metric_cache.py` | 지표 캐시(Valkey) |
`bff/enrich.py` | 어휘 보강 — 질문 어휘와 데이터 어휘의 격차를 메움 |
`bff/card_tier.py` | 카드 등급 색인 |
`bff/routing_log.py` | 라우팅 판정 기록(정확도 분석용) |
`bff/stage_mapper.py` | 진행 단계 → UI 표시 매핑 |

---

## 4. 데이터 경로

```
Neptune (그래프)              Athena (집계)
  Clean_Card                    소비·상권 테이블
  Clean_Benefit                 카드 상품 마스터
  Clean_Category
  Onto_* (온톨로지 계층)
```

- **그래프**: 카드-혜택-카테고리 관계 탐색
- **집계**: 금액·건수 등 수치 계산
- 두 경로의 결과를 한 답변에 합칠 때는 **엔티티 동일성**을 확인합니다

색인 스냅샷은 `data/`와 `bff/data/`에 있습니다 — 후자는 컨테이너 내부 경로용 사본입니다.

---

## 5. 배포 형태

```
EKS
  ├─ bff (Deployment + Service)
  ├─ frontend-app (Deployment + Service)
  └─ Ingress (ALB)

AWS
  ├─ AgentCore Runtime    에이전트 호스팅
  ├─ Neptune              그래프
  ├─ Athena + Glue        집계
  └─ Valkey/ElastiCache   캐시
```

⚠️ **VPC 제약**: Neptune과 AOSS는 VPC 내부에서만 접근 가능하도록 구성하는 것을 전제합니다.
BFF 파드가 같은 VPC에 있어야 합니다.

---

## 6. 관측

| 항목 | 위치 |
|---|---|
라우팅 판정 | `bff/routing_log.py` → `GET /api/routing/insights` |
캐시 적중 | `GET /api/cache/status` |
단계 진행 | SSE `step` 이벤트 |

라우팅 판정 기록이 이 방식의 **품질 관리 지점**입니다 — 어떤 질문이 어느 의도로
분류됐고 기권했는지가 템플릿 보강 대상을 정합니다.
