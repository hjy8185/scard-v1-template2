# Onedata AI Agent

신한금융그룹 원데이터 AI 에이전트 - 자연어 질의를 통한 통합 금융 데이터 분석 시스템

## 개요

Onedata AI Agent는 신한금융그룹의 4개 계열사(은행, 카드, 라이프, 증권) 데이터를 통합 분석할 수 있는 AI 기반 질의 시스템입니다. 사용자는 한국어 자연어로 질문하면, 시스템이 자동으로 적절한 SQL 쿼리를 생성하고 실행하여 결과를 제공합니다.

### 주요 기능

- **자연어 → SQL 변환**: 한국어 비즈니스 질문을 Athena SQL로 자동 변환
- **온톨로지 기반 추론**: Neptune 그래프 DB의 도메인 온톨로지를 활용한 지능적 쿼리 생성
- **시맨틱 검색**: OpenSearch를 통한 테이블/컬럼 메타데이터 의미 검색
- **크로스 계열사 분석**: 그룹md번호 기반 4개 계열사 통합 데이터 조회
- **안전한 실행**: 읽기 전용 SQL, 행 수 제한, 타임아웃 보호

## 아키텍처

```
[사용자] → [Frontend (Next.js)] → [Backend (FastAPI)]
                                         ↓
                        ┌─────────────────┼─────────────────┐
                        ↓                 ↓                 ↓
                  [Neptune]        [OpenSearch]         [Athena]
                  (온톨로지)       (시맨틱검색)        (SQL 실행)
                                                          ↓
                                                    [AWS Glue]
                                                    (53개 테이블)
```

### 기술 스택

| 구성요소 | 기술 | 용도 |
|---------|------|------|
| Frontend | Next.js 14, React, TailwindCSS | 채팅 UI, 그래프 시각화 |
| Backend | Python, FastAPI | API 서버, 에이전트 로직 |
| Graph DB | Amazon Neptune | 도메인 온톨로지 저장/쿼리 |
| 검색엔진 | OpenSearch Serverless | 테이블 메타데이터 벡터 검색 |
| 쿼리엔진 | Amazon Athena | SQL 쿼리 실행 (ai_ready_v2 DB) |
| AI 모델 | Amazon Bedrock (Claude) | NL→SQL 변환, 결과 해석 |
| IaC | AWS CDK (TypeScript) | 인프라 배포 자동화 |

## 데이터 모델

### 계열사별 테이블 구조

| 계열사 | 테이블 수 | 주요 데이터 |
|--------|----------|------------|
| 통합(igd) | 12 | 통합 고객마스터, RFM, 보유현황 |
| 은행(bank) | 8 | 수신/여신, 계좌거래, 자산 |
| 카드(card) | 12 | 카드이용, 가맹점, 대출, 배달 |
| 보험(life) | 4 | 보험계약, 보험료, 보험금 |
| 증권(sec) | 6 | 예탁자산, 매매거래, 수익률 |
| 공통(com) | 3 | 우편번호, 프랜차이즈, 기준정보 |
| 기타 | 8 | 마케팅, 멤버십, 디멘전 |

### 핵심 조인 키

- **그룹md번호**: 4개 계열사를 연결하는 통합 고객 식별자
- **기준년월** (YYYYMM): 월별 데이터 파티션 키
- **기준일자** (YYYYMMDD): 일별 데이터 파티션 키
- **개인사업자번호**: 개인사업자 식별자

## 프로젝트 구조

```
onedata-agent/
├── backend/           # FastAPI 백엔드 서비스
│   ├── app/
│   │   ├── agents/    # AI 에이전트 로직
│   │   ├── api/       # API 라우터
│   │   ├── models/    # 데이터 모델
│   │   ├── ontology/  # 온톨로지 연동
│   │   ├── services/  # 비즈니스 서비스
│   │   └── config.py  # 설정
│   ├── data/          # 로컬 캐시 데이터
│   └── tests/         # 테스트
├── frontend/          # Next.js 프론트엔드
│   ├── app/           # App Router 페이지
│   ├── components/    # React 컴포넌트
│   └── lib/           # 유틸리티
├── ontology/          # 도메인 온톨로지 정의
│   ├── domain.ttl     # OWL/RDF 온톨로지 (Turtle)
│   ├── table-mapping.yml  # 53개 테이블 매핑
│   └── glossary.yml   # 한국어 비즈니스 용어집
├── infra/             # AWS CDK 인프라
│   ├── bin/app.ts     # CDK 앱 진입점
│   └── lib/           # CDK 스택 정의
├── scripts/           # 유틸리티 스크립트
│   ├── load_ontology_to_neptune.py
│   ├── index_opensearch.py
│   └── sample_queries.py
├── docker-compose.yml # 로컬 개발 환경
├── Makefile           # 공통 명령어
└── README.md          # 이 파일
```

## 시작하기

### 사전 요구사항

- Docker & Docker Compose
- Python 3.11+
- Node.js 18+
- AWS CLI (배포 시)

### 로컬 개발 환경 실행

```bash
# 1. 환경 시작 (Docker Compose)
make dev

# 2. 온톨로지 로드 (로컬 Fuseki에)
make load-ontology-local

# 3. OpenSearch 인덱싱 (로컬, 임베딩 없이)
make index-opensearch-local

# 4. 접속
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# OpenSearch: http://localhost:9200
```

### AWS 배포

```bash
# 1. 인프라 배포
make infra-deploy

# 2. Docker 이미지 빌드 & 푸시
make build
make push-images

# 3. 온톨로지 로드
make load-ontology

# 4. 메타데이터 인덱싱
make index-opensearch

# 5. 데이터 접근 검증
make sample-queries
```

## 온톨로지

### 클래스 계층

```
Customer (고객)
├── SoleProprietor (개인사업자)
Account (계좌)
├── DepositAccount (수신계좌)
Card (카드)
Loan (대출)
Insurance (보험)
├── InsuranceContract (보험계약)
Securities (증권)
├── SecuritiesHolding (증권보유)
Transaction (거래)
Merchant (가맹점)
Product (상품)
├── CardProduct (카드상품)
├── LoanProduct (대출상품)
Membership (멤버십)
```

### 주요 관계

| 관계 | 도메인 | 레인지 | 설명 |
|------|--------|--------|------|
| hasAccount | Customer | Account | 고객→계좌 |
| hasCard | Customer | Card | 고객→카드 |
| hasLoan | Customer | Loan | 고객→대출 |
| hasInsurance | Customer | Insurance | 고객→보험 |
| hasSecurities | Customer | Securities | 고객→증권 |
| hasMembership | Customer | Membership | 고객→멤버십 |
| transactionAtMerchant | Transaction | Merchant | 거래→가맹점 |
| operatesMerchant | SoleProprietor | Merchant | 사업자→가맹점 |

## 환경 변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `AWS_REGION` | ap-northeast-2 | AWS 리전 |
| `NEPTUNE_ENDPOINT` | https://localhost:8182 | Neptune 엔드포인트 |
| `OPENSEARCH_ENDPOINT` | https://localhost:9200 | OpenSearch 엔드포인트 |
| `OPENSEARCH_INDEX` | onedata-ontology | OpenSearch 인덱스명 |
| `ATHENA_DATABASE` | ai_ready_v2 | Athena 데이터베이스 |
| `ATHENA_OUTPUT_BUCKET` | s3://onedata-athena-results/ | Athena 결과 S3 버킷 |
| `BEDROCK_MODEL_ID` | anthropic.claude-sonnet-4-20250514 | Bedrock 모델 ID |
| `APP_PORT` | 8000 | 백엔드 포트 |
| `SQL_READ_ONLY` | true | SQL 읽기전용 모드 |

## 사용 예시

### 질문 예시

```
"탑스클럽 VIP 고객 중 카드 월이용금액 상위 10명은?"
"지난 3개월간 배달업종 매출이 가장 많이 증가한 프랜차이즈는?"
"은행과 증권 동시 이용 고객의 평균 총자산은?"
"개인사업자 중 카드매출 대비 대출잔액 비율이 높은 업종은?"
"RFM 점수 기준 이탈 위험 고객의 보험 계약 유지율은?"
```

## 라이선스

Shinhan Financial Group - Internal Use Only
