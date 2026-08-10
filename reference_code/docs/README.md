# 카드 데이터 질의응답 시스템 — v1 (템플릿 방식)

자연어 질문을 **미리 정의된 질의 템플릿**에 매칭해 답하는 시스템입니다.
정확도가 높고 응답이 결정론적인 대신, 템플릿이 없는 질문은 답하지 않습니다.

> 같은 문제를 **LLM이 질의를 조립하는 방식**으로 푼 패키지가 별도로 제공됩니다
> (`scard-v2-llm`). 두 방식은 서로 독립이며 같은 데이터를 씁니다.

---

## 1. 무엇을 하는가

```
사용자 질문
   → 시멘틱 라우터가 의도(frame)를 분류
   → 해당 의도의 질의 템플릿을 선택
   → 파라미터를 채워 실행 (Neptune / Athena)
   → 근거와 함께 답변
```

**핵심 설계**: 질의문을 LLM이 쓰지 않습니다. LLM은 **의도 분류와 답변 서술**에만 쓰고,
**무엇을 조회할지는 코드가 결정**합니다.

| | |
|---|---|
정확도 | 템플릿이 있는 질문에 대해 높음 |
응답 범위 | **템플릿이 정의된 의도만** — 밖의 질문은 기권 |
결정론성 | 같은 질문 → 같은 질의 → 같은 결과 |
비용·지연 | 낮음(질의 생성 LLM 호출 없음) |

---

## 2. 구성

```
bff/                   백엔드 (FastAPI)
  api/                 엔드포인트 9종
  clients/             AgentCore · Neptune · 메트릭 캐시
  enrich.py            어휘 보강
  card_tier.py         카드 등급 색인
  routing_log.py       라우팅 판정 기록
  stage_mapper.py      단계 매핑
  data/                런타임이 읽는 색인 사본

frontend-app/          화면 (Next.js 15 / React 19)
  app/page.tsx         단일 화면
  app/api/*            BFF 프록시 8종
  components/          UI

data/                  색인·시나리오·사전
ontology/              온톨로지 TTL + SHACL shapes
infra/                 CDK (TypeScript)
k8s/                   배포 매니페스트
docs/                  이 문서 집합
```

---

## 3. 실행

### 3-1. 사전 준비

| 항목 | 값을 채워야 하는 곳 |
|---|---|
AWS 계정·리전 | `infra/cdk.context.json` · `k8s/services/*.yaml` |
AgentCore Runtime ARN | `bff/clients/agentcore_client.py` `AGENTCORE_RUNTIME_ARN` |
Neptune 엔드포인트 | 환경변수 `NEPTUNE_ENDPOINT` |
Athena 워크그룹·DB | 환경변수 `ATHENA_WORKGROUP` · `ATHENA_DATABASE` |

> ⚠️ 이 패키지의 AWS 식별자는 모두 **플레이스홀더로 치환**되어 있습니다
> (`000000000000` · `EXAMPLE*` · `vpce-EXAMPLE*`). 실제 값으로 바꿔야 동작합니다.
> 치환 대상을 찾으려면 `grep -rn "EXAMPLE\|000000000000" .` 를 실행하세요.

### 3-2. 백엔드

```bash
cd bff
pip install -r requirements.txt
uvicorn bff.main:app --host 0.0.0.0 --port 8000
```

### 3-3. 프론트엔드

```bash
cd frontend-app
npm install                       # node_modules는 포함되지 않았습니다
BFF_URL=http://localhost:8000 npm run dev
```

`http://localhost:3000` 접속.

### 3-4. 배포

```bash
cd infra && npm install && npx cdk deploy --all
kubectl apply -f k8s/services/ -f k8s/ingress/
```

---

## 4. 문서

| 문서 | 내용 |
|---|---|
[architecture.md](architecture.md) | 구조 · 경계 · 라우팅 방식 |
[api-spec.md](api-spec.md) | 엔드포인트 요청/응답 계약 |
[data-contract.md](data-contract.md) | 테이블 · 온톨로지 · 색인 |

---

## 5. 알려진 제약

- **템플릿 밖 질문은 답하지 않습니다.** 이것은 결함이 아니라 설계입니다 —
  지어내기보다 기권을 택합니다.
- 새 질문 유형을 지원하려면 **템플릿을 추가**해야 합니다(코드 변경).
- `data/`의 색인은 스냅샷입니다. 원천이 바뀌면 재생성이 필요합니다.
- 고객·거래 관련 데이터는 **합성 데이터**입니다. 카드 상품·혜택·약관은 공개 정보 기반입니다.
