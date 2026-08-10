# 데이터 계약 — v1 (템플릿 방식)

기준: `ontology/table-column-mapping.yml`(version 1) · `ontology/*.ttl` · `data/`

---

## 1. 데이터 출처 구분 ★ 먼저 읽어야 할 것

이 패키지의 데이터는 **성격이 다릅니다.** 답변에서도 이를 구분 표시하는 것을 전제로
설계되었습니다.

| 표시 | 대상 | 성격 |
|---|---|---|
**[공개-실]** | 카드 상품·혜택·약관(R0~R4) · 서울/세종 소비(집계) | 공개 정보 기반 **실데이터** |
**[합성]** | 고객 · 거래 · reward ledger · 민원(D1·D2·D4·D6·D7) | **합성 데이터** — `is_synthetic` 플래그 |
**[추정]** | coverage/gap · 적합도 등 산출 지표 | 계산 결과 |
**[unsupported]** | 미파싱 규칙 등 | **"확인 필요"로 답하고 추측하지 않음** |

⚠️ **개인정보는 포함되어 있지 않습니다.** 고객·거래 축은 전부 합성입니다.

---

## 2. 테이블 → 온톨로지 매핑 (13테이블)

`ontology/table-column-mapping.yml`이 정본입니다.

### 2-1. R 계열 — 카드 상품 축 (공개 실데이터)

| 테이블 | RDF 클래스 | 컬럼 | 내용 |
|---|---|---|---|
`R0_card_product` | `co:CardProduct` | 5 | 카드 상품 마스터 |
`R1_benefit` | `co:Benefit` | 6 | 혜택 |
`R2_benefit_condition` | `co:BenefitCondition` | 6 | 혜택 적용 조건 |
`R3_spend_tier` | `co:SpendTier` | 5 | 실적 구간 |
`R4_merchant_reference` | `co:Merchant` | 3 | 가맹점 참조 |

### 2-2. D 계열 — 고객·거래 축 (합성 데이터)

| 테이블 | RDF 클래스 | 컬럼 | 내용 |
|---|---|---|---|
`D0_category` | `co:BenefitCategory` / `co:IndustryCategory` | — | 카테고리 노드·관계 |
`D1_customer` | `co:Customer` | 11 | 고객 |
`D2_account` | `co:Account` | 7 | 계좌/카드 보유 |
`D4_transaction` | `co:Transaction` | 22 | 거래 |
`D5_statement_monthly` | `co:StatementMonthly` | 11 | 월 명세 |
`D6_reward_ledger` | `co:RewardLedger` | 15 | 적립·사용 원장 |
`D7_complaint` | `co:Complaint` | 14 | 민원 |
`D8_golden_eligibility_case` | `co:GoldenEligibilityCase` | 11 | 자격 판정 정답셋 |

⚠️ `D0_category`는 한 테이블이 **두 클래스**(`BenefitCategory` / `IndustryCategory`)로
매핑됩니다 — 소비 시 분기가 필요합니다.

---

## 3. 온톨로지

```
ontology/
  domain.ttl              도메인 클래스·속성 (co: 네임스페이스)
  taxonomy.ttl            분류 체계
  crosswalk.ttl           체계 간 대응(crosswalk)
  area_mapping.ttl        지역 매핑
  segments.ttl            고객 세그먼트 정의
  glossary.skos.ttl       용어집 (SKOS)
  shapes/all.shacl.ttl    SHACL 검증 shapes
  rules/  seed/           규칙·시드
  table-column-mapping.yml  테이블 ↔ 클래스 매핑 (정본)
  validation_report.json  검증 결과
  coverage_report.json    커버리지
```

### 3-1. SHACL 검증

`shapes/all.shacl.ttl`의 `sh:targetClass` **8개**는 전부 **인스턴스(A-Box) 클래스**입니다:

```
Account · Benefit · BenefitCondition · CardProduct
Customer · RewardLedger · SpendTier · Transaction
```

역할 분담:

| 검증기 | 대상 | 시점 |
|---|---|---|
**SHACL** | 인스턴스 데이터(A-Box) — 필수 속성·타입·카디널리티 | 적재·발행 |
**OWL 추론기** | 클래스 계층(T-Box) — 일관성·충족불가 클래스 | 발행 |

예: `co:CardProduct`는 `cardProductId`·`name`이 **필수**(`sh:minCount 1`)입니다.

검증 실행:

```bash
pip install pyshacl rdflib
python -c "
import rdflib; from pyshacl import validate
d=rdflib.Graph(); d.parse('<데이터.ttl>', format='turtle')
s=rdflib.Graph(); s.parse('ontology/shapes/all.shacl.ttl', format='turtle')
ok,_,txt = validate(d, shacl_graph=s, advanced=True)
print(ok); print(txt[:2000])
"
```

---

## 4. 그래프 (Neptune)

카드 축은 그래프로도 서빙됩니다.

| 라벨 | 내용 |
|---|---|
`Clean_Card` | 카드 |
`Clean_Benefit` | 혜택 |
`Clean_Category` | 카테고리 |
`Onto_*` | 온톨로지 계층(업종·세그먼트·영역) |

**질의 템플릿이 이 라벨을 대상으로 합니다** — 라벨 이름을 바꾸면 템플릿을 함께 고쳐야 합니다.

---

## 5. 런타임 색인 (`data/`)

v1 백엔드가 읽는 것:

| 파일 | 용도 |
|---|---|
`card_tier_index.json` | 카드 등급 색인 |
`scenarios.json` | 데모 시나리오 |
`u8_exemplars.json` | 의도 분류 예시(시멘틱 라우터 학습 앵커) |
`vocab_sot.json` | 어휘 정본 — 질문 어휘와 데이터 어휘의 격차를 메움 |

⚠️ **`bff/data/`는 같은 파일의 사본**입니다. 컨테이너 내부 경로(`/app/bff/data`)와
리포 경로(`data/`)를 모두 지원하기 위한 구조로, `bff/enrich.py`가 두 경로를 순서대로 찾습니다.
**한쪽만 갱신하면 갈립니다.**

기타 색인(`condition_type_index.json` · `complaint_index.json` · `exclusion_norm.json` 등)은
분석·오프라인 용도입니다.

---

## 6. 색인 재생성

`data/`의 색인은 **스냅샷**입니다. 원천이 바뀌면 재생성이 필요하고, 재생성 없이 원천만
바꾸면 **답변이 옛 값을 말합니다.**

⚠️ 이 패키지에는 색인 생성 파이프라인이 포함되지 않았습니다 —
원천 스키마와 재생성 절차는 별도 협의가 필요합니다.

---

## 7. 수치 앵커

`ontology/coverage_report.json` · `validation_report.json`에 발행 시점의 커버리지와 검증
결과가 있습니다. 데이터를 교체한 뒤에는 이 값이 **더 이상 유효하지 않습니다** —
재측정해야 합니다.
