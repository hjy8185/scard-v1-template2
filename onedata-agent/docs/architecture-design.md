# Onedata AI Agent 아키텍처 설계서

## 신한금융그룹 그룹사 횡단 데이터 분석 플랫폼

---

## 목차

1. [시스템 개요 및 목표](#1-시스템-개요-및-목표)
2. [데이터 도메인 분류 및 관계 모델](#2-데이터-도메인-분류-및-관계-모델)
3. [시맨틱 레이어 설계](#3-시맨틱-레이어-설계)
4. [에이전트 아키텍처](#4-에이전트-아키텍처)
5. [기술 스택 상세](#5-기술-스택-상세)
6. [프론트엔드 시각화 요구사항](#6-프론트엔드-시각화-요구사항)
7. [구현 단계](#7-구현-단계)

---

## 1. 시스템 개요 및 목표

### 1.1 배경

신한금융그룹의 Onedata 플랫폼은 은행, 카드, 증권, 라이프(보험) 4개 관계사의 데이터를 통합 분석하기 위한 그룹사 횡단 데이터 분석 플랫폼이다. AWS Glue Catalog(database: `ai_ready_v2`)에 53개의 합성 데이터 테이블이 구축되어 있으며, 이를 자연어 질의로 분석할 수 있는 Text-to-SQL AI Agent 시스템을 구축한다.

### 1.2 목표

| 구분 | 목표 | 설명 |
|------|------|------|
| 핵심 | 자연어 → SQL 변환 | 비개발 직군 사용자가 자연어로 그룹사 횡단 데이터 분석 가능 |
| 핵심 | 시맨틱 레이어 기반 정확도 | 도메인 온톨로지를 활용하여 SQL 생성 정확도 향상 |
| 핵심 | 추론 과정 시각화 | 에이전트의 사고 과정을 실시간으로 사용자에게 노출 |
| 부가 | 그룹사 횡단 분석 | 4개 관계사 데이터를 JOIN하여 고객 360도 뷰 제공 |
| 부가 | 확장 가능한 구조 | 새로운 테이블/도메인 추가 시 최소한의 변경으로 대응 |

### 1.3 시스템 구성도 (High-Level)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                            │
│  ┌──────────┐  ┌───────────────────┐  ┌──────────────────────────┐  │
│  │ Chat UI  │  │ Reasoning Trace   │  │ Result Visualization     │  │
│  │          │  │ (Step-by-step)    │  │ (Table/Chart)            │  │
│  └──────────┘  └───────────────────┘  └──────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ WebSocket / REST
┌────────────────────────────┴────────────────────────────────────────┐
│                      BFF Layer (FastAPI)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ Session  │  │ Agent    │  │ Query    │  │ Result             │  │
│  │ Manager  │  │ Router   │  │ Executor │  │ Formatter          │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────────┘  │
└───────┬──────────────┬──────────────┬──────────────┬────────────────┘
        │              │              │              │
   ┌────┴────┐   ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
   │ Neptune │   │OpenSearch│   │ Athena  │   │  LLM    │
   │Graph DB │   │         │   │         │   │(Bedrock)│
   │(Ontology)│  │(Semantic │   │(SQL     │   │         │
   │         │   │ Search)  │   │Execution)│  │         │
   └─────────┘   └─────────┘   └─────────┘   └─────────┘
                                     │
                              ┌──────┴──────┐
                              │  AWS Glue   │
                              │  Catalog    │
                              │(ai_ready_v2)│
                              └─────────────┘
```

---

## 2. 데이터 도메인 분류 및 관계 모델

### 2.1 도메인 분류 체계

53개 테이블을 10개 도메인으로 분류하며, 각 도메인은 그룹 통합(IGD), 관계사별(CLN/TRS/PDT), 리포트(RPT) 레이어로 구분된다.

#### 도메인 구조도

```
                        ┌─────────────────────┐
                        │   고객 마스터 (11)    │
                        │  Customer Master     │
                        └──────────┬──────────┘
                                   │ 그룹md번호
              ┌────────────────────┼────────────────────┐
              │                    │                    │
   ┌──────────┴──────┐  ┌────────┴────────┐  ┌───────┴───────┐
   │ 개인사업자 (9)   │  │ 거래/이용 (9)    │  │ 보유/자산 (2)  │
   │ Sole Proprietor │  │ Transaction     │  │ Holding/Asset │
   └──────────┬──────┘  └────────┬────────┘  └───────────────┘
              │                    │
              │ 사업자등록번호       │ 거래식별번호
              │                    │
   ┌──────────┴──────┐  ┌────────┴────────┐
   │ 가맹점/상권 (3)  │  │ 상품 (7)        │
   │ Merchant        │  │ Product         │
   └─────────────────┘  └─────────────────┘

   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │ 멤버십 (2)       │  │ 리포트 (3)       │  │ 공통 (3)        │
   │ Membership      │  │ Report          │  │ Common          │
   └─────────────────┘  └─────────────────┘  └─────────────────┘

   ┌─────────────────┐
   │ 은행 마케팅 (2)   │
   │ Bank Marketing  │
   └─────────────────┘
```

### 2.2 테이블 상세 분류

#### 2.2.1 고객 마스터 (Customer Master) - 11개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `igd_d_cust_mas` | 그룹통합(일별) | 그룹 통합 고객 마스터 | 그룹md번호, 기준일자 |
| `igd_m_cust_base` | 그룹통합(월별) | 그룹 통합 고객 기본 | 그룹md번호, 기준년월 |
| `rpt_d_cust_mas` | 리포트 | 리포트용 고객 마스터 | 그룹md번호, 기준일자 |
| `m_cust_dim` | 디멘전 | 고객 디멘전 | 그룹md번호 |
| `cln_d_cust_mas_bank` | 은행(일별) | 은행 고객 마스터 | 그룹md번호, 기준일자 |
| `cln_d_cust_mas_card` | 카드(일별) | 카드 고객 마스터 | 그룹md번호, 기준일자 |
| `cln_d_cust_mas_life` | 라이프(일별) | 라이프 고객 마스터 | 그룹md번호, 기준일자 |
| `cln_d_cust_mas_sec` | 증권(일별) | 증권 고객 마스터 | 그룹md번호, 기준일자 |
| `cln_m_cust_base_bank` | 은행(월별) | 은행 고객 기본 | 그룹md번호, 기준년월 |
| `cln_m_cust_base_card` | 카드(월별) | 카드 고객 기본 | 그룹md번호, 기준년월 |
| `cln_m_cust_base_life` | 라이프(월별) | 라이프 고객 기본 | 그룹md번호, 기준년월 |

#### 2.2.2 개인사업자 (Sole Proprietor) - 9개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `igd_d_soleprop_mas` | 그룹통합(일별) | 개인사업자 마스터 | 사업자등록번호, 기준일자 |
| `igd_m_soleprop_base` | 그룹통합(월별) | 개인사업자 기본 | 사업자등록번호, 기준년월 |
| `igd_m_soleprop_asset` | 그룹통합(월별) | 개인사업자 자산 | 사업자등록번호, 기준년월 |
| `cln_d_soleprop_mas_bank` | 은행(일별) | 은행 개인사업자 마스터 | 사업자등록번호, 기준일자 |
| `cln_d_soleprop_mas_card` | 카드(일별) | 카드 개인사업자 마스터 | 사업자등록번호, 기준일자 |
| `cln_m_soleprop_base_bank` | 은행(월별) | 은행 개인사업자 기본 | 사업자등록번호, 기준년월 |
| `cln_m_soleprop_base_card` | 카드(월별) | 카드 개인사업자 기본 | 사업자등록번호, 기준년월 |
| `trs_m_soleprop_asset_bank` | 은행(월별) | 은행 개인사업자 자산 | 사업자등록번호, 기준년월 |
| `trs_m_soleprop_asset_card` | 카드(월별) | 카드 개인사업자 자산 | 사업자등록번호, 기준년월 |
| `trs_m_soleprop_merchant_sales_card` | 카드(월별) | 카드 가맹점 매출 | 사업자등록번호, 기준년월 |

#### 2.2.3 상품 (Product) - 7개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `card_prod` | 카드 | 카드 상품 정보 | 카드상품번호 |
| `pdt_m_acct_holding_base_bank` | 은행(월별) | 은행 계좌 보유 기본 | 그룹md번호, 기준년월 |
| `pdt_m_autoloan_prod_base_card` | 카드(월별) | 오토론 상품 기본 | 그룹md번호, 기준년월 |
| `pdt_m_card_prod_base_card` | 카드(월별) | 카드 상품 기본 | 그룹md번호, 카드상품번호, 기준년월 |
| `pdt_m_contract_holding_base_life` | 라이프(월별) | 보험 계약 보유 기본 | 그룹md번호, 기준년월 |
| `pdt_m_loan_prod_base_card` | 카드(월별) | 카드론 상품 기본 | 그룹md번호, 기준년월 |
| `m_card_dim` | 디멘전 | 카드 디멘전 | 카드상품번호 |

#### 2.2.4 거래/이용 (Transaction) - 9개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `igd_m_cust_txn` | 그룹통합(월별) | 그룹 통합 고객 거래 | 그룹md번호, 기준년월 |
| `igd_m_cust_txn_bank` | 은행(월별) | 은행 고객 거래(통합) | 그룹md번호, 기준년월 |
| `igd_m_cust_txn_card` | 카드(월별) | 카드 고객 거래(통합) | 그룹md번호, 기준년월 |
| `igd_m_cust_txn_life` | 라이프(월별) | 라이프 고객 거래(통합) | 그룹md번호, 기준년월 |
| `igd_m_cust_txn_sec` | 증권(월별) | 증권 고객 거래(통합) | 그룹md번호, 기준년월 |
| `trs_m_cust_acct_txn_bank` | 은행(월별) | 은행 계좌 거래 상세 | 그룹md번호, 거래식별번호, 기준년월 |
| `trs_m_cust_acct_txn_sec` | 증권(월별) | 증권 계좌 거래 상세 | 그룹md번호, 거래식별번호, 기준년월 |
| `trs_m_cust_card_txn_card` | 카드(월별) | 카드 이용 거래 상세 | 그룹md번호, 카드대체번호, 기준년월 |
| `trs_m_cust_contract_txn_life` | 라이프(월별) | 보험 계약 거래 상세 | 그룹md번호, 기준년월 |

#### 2.2.5 보유/자산 (Holding/Asset) - 2개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `igd_m_cust_holding_base` | 그룹통합(월별) | 고객 보유 기본 | 그룹md번호, 기준년월 |
| `igd_m_shg_rfm_base_ledger` | 그룹통합(월별) | RFM 기본 원장 | 그룹md번호, 기준년월 |

#### 2.2.6 가맹점/상권 (Merchant) - 3개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `com_m_merchant_franchise` | 공통(월별) | 가맹점 프랜차이즈 | 사업자등록번호, 기준년월 |
| `trs_m_merchant_delivery` | 거래(월별) | 가맹점 배달 매출 | 사업자등록번호, 기준년월 |
| `rpt_d_merchant_industry_index` | 리포트(일별) | 가맹점 업종 지수 | 기준일자 |

#### 2.2.7 공통 (Common) - 3개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `com_manual_base` | 공통 | 매뉴얼 기본 정보 | - |
| `com_postal_base` | 공통 | 우편번호 기본 | 우편번호 |
| `gba_acct_daily` | 공통(일별) | 계좌 일별 정보 | 기준일자 |

#### 2.2.8 멤버십 (Membership) - 2개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `jaz_sh_fanclub_membership_chghist` | 멤버십 | 팬클럽 멤버십 변경이력 | 그룹md번호 |
| `shg_membership_cust_hist` | 멤버십 | 멤버십 고객 이력 | 그룹md번호 |

#### 2.2.9 리포트 (Report) - 3개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `rpt_d_cust_mas` | 리포트(일별) | 고객 마스터 리포트 | 그룹md번호, 기준일자 |
| `rpt_d_assetsize_sec` | 리포트(일별) | 증권 자산규모 | 기준일자 |
| `rpt_d_assetsize_sec_excl` | 리포트(일별) | 증권 자산규모(제외) | 기준일자 |

#### 2.2.10 은행 마케팅 (Bank Marketing) - 2개 테이블

| 테이블명 | 레이어 | 설명 | 키 컬럼 |
|----------|--------|------|---------|
| `vam_cus_mkt_mas_m` | 은행(월별) | 고객 마케팅 마스터 | 그룹md번호, 기준년월 |
| `vam_cus_prdt_mas_m` | 은행(월별) | 고객 상품 마케팅 마스터 | 그룹md번호, 기준년월 |

### 2.3 핵심 관계 모델 (ERD-Like)

```
┌─────────────────┐         ┌──────────────────┐
│  고객 마스터      │         │  개인사업자 마스터  │
│  (igd_d_cust_   │         │  (igd_d_soleprop_│
│   mas)          │         │   mas)           │
│                 │         │                  │
│ PK: 그룹md번호   │◄───────►│ FK: 그룹md번호    │
│ PK: 기준일자     │         │ PK: 사업자등록번호 │
└───────┬─────────┘         └────────┬─────────┘
        │                            │
        │ 그룹md번호                    │ 사업자등록번호
        │                            │
        ▼                            ▼
┌─────────────────┐         ┌──────────────────┐
│  거래/이용       │         │  가맹점/상권      │
│  (igd_m_cust_   │         │  (com_m_merchant_│
│   txn)          │         │   franchise)     │
│                 │         │                  │
│ FK: 그룹md번호   │         │ FK: 사업자등록번호 │
│ PK: 기준년월     │         │ PK: 기준년월      │
│ FK: 거래식별번호  │         └──────────────────┘
└───────┬─────────┘
        │
        │ 그룹md번호 + 카드상품번호
        ▼
┌─────────────────┐         ┌──────────────────┐
│  상품            │         │  보유/자산        │
│  (pdt_m_card_   │         │  (igd_m_cust_    │
│   prod_base_    │         │   holding_base)  │
│   card)         │◄───────►│                  │
│                 │         │ FK: 그룹md번호    │
│ FK: 그룹md번호   │         │ PK: 기준년월      │
│ FK: 카드상품번호  │         └──────────────────┘
└─────────────────┘
```

### 2.4 조인 패턴 정의

| 조인 패턴 | 키 컬럼 | 설명 | 예시 |
|-----------|---------|------|------|
| 고객 횡단 조인 | `그룹md번호` | 관계사 간 동일 고객 연결 | 은행 고객 + 카드 고객 통합 |
| 시점 조인 | `기준년월` / `기준일자` | 동일 시점 데이터 연결 | 월별 거래 + 월별 보유 |
| 사업자 조인 | `사업자등록번호` | 개인사업자-가맹점 연결 | 사업자 정보 + 가맹점 매출 |
| 상품 조인 | `카드상품번호` | 카드 상품 정보 연결 | 카드 거래 + 카드 상품 정보 |
| 복합 조인 | `그룹md번호` + `기준년월` | 고객별 시점별 데이터 | 고객 월별 거래 + 보유 현황 |

---

## 3. 시맨틱 레이어 설계

### 3.1 설계 원칙

시맨틱 레이어는 자연어 질의와 물리적 데이터 모델 사이의 번역 계층 역할을 수행한다. 두 가지 핵심 컴포넌트로 구성된다:

1. **Neptune Graph DB**: 온톨로지 (구조적 메타데이터, 관계, 비즈니스 규칙)
2. **OpenSearch**: 시맨틱 검색 (유사 용어 매칭, 동의어, 자연어 → 개념 매핑)

### 3.2 온톨로지 설계 (Neptune Graph DB)

#### 3.2.1 온톨로지 구조 (TTL 형식)

```turtle
@prefix od: <http://onedata.shinhan.com/ontology#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# ============================================================
# 도메인 클래스 정의
# ============================================================

od:Customer a rdfs:Class ;
    rdfs:label "고객"@ko ;
    rdfs:comment "신한금융그룹 통합 고객"@ko ;
    od:primaryKey "그룹md번호" ;
    od:tables "igd_d_cust_mas, igd_m_cust_base, rpt_d_cust_mas, m_cust_dim" .

od:BankCustomer a rdfs:Class ;
    rdfs:subClassOf od:Customer ;
    rdfs:label "은행고객"@ko ;
    od:tables "cln_d_cust_mas_bank, cln_m_cust_base_bank" .

od:CardCustomer a rdfs:Class ;
    rdfs:subClassOf od:Customer ;
    rdfs:label "카드고객"@ko ;
    od:tables "cln_d_cust_mas_card, cln_m_cust_base_card" .

od:SecuritiesCustomer a rdfs:Class ;
    rdfs:subClassOf od:Customer ;
    rdfs:label "증권고객"@ko ;
    od:tables "cln_d_cust_mas_sec" .

od:LifeCustomer a rdfs:Class ;
    rdfs:subClassOf od:Customer ;
    rdfs:label "라이프고객"@ko ;
    od:tables "cln_d_cust_mas_life, cln_m_cust_base_life" .

od:SoleProprietor a rdfs:Class ;
    rdfs:label "개인사업자"@ko ;
    od:primaryKey "사업자등록번호" ;
    od:tables "igd_d_soleprop_mas, igd_m_soleprop_base, igd_m_soleprop_asset" .

od:Transaction a rdfs:Class ;
    rdfs:label "거래"@ko ;
    od:primaryKey "거래식별번호" ;
    od:tables "igd_m_cust_txn" .

od:Product a rdfs:Class ;
    rdfs:label "상품"@ko ;
    od:tables "card_prod, m_card_dim" .

od:Merchant a rdfs:Class ;
    rdfs:label "가맹점"@ko ;
    od:primaryKey "사업자등록번호" ;
    od:tables "com_m_merchant_franchise" .

od:Holding a rdfs:Class ;
    rdfs:label "보유자산"@ko ;
    od:tables "igd_m_cust_holding_base" .

# ============================================================
# 속성(Property) 정의
# ============================================================

od:hasTransaction a rdf:Property ;
    rdfs:domain od:Customer ;
    rdfs:range od:Transaction ;
    rdfs:label "거래를 보유"@ko ;
    od:joinKey "그룹md번호" ;
    od:joinCondition "기준년월 = 기준년월" .

od:hasProduct a rdf:Property ;
    rdfs:domain od:Customer ;
    rdfs:range od:Product ;
    rdfs:label "상품을 보유"@ko ;
    od:joinKey "그룹md번호" .

od:operatesMerchant a rdf:Property ;
    rdfs:domain od:SoleProprietor ;
    rdfs:range od:Merchant ;
    rdfs:label "가맹점 운영"@ko ;
    od:joinKey "사업자등록번호" .

od:hasHolding a rdf:Property ;
    rdfs:domain od:Customer ;
    rdfs:range od:Holding ;
    rdfs:label "자산 보유"@ko ;
    od:joinKey "그룹md번호" .

# ============================================================
# 비즈니스 규칙 정의
# ============================================================

od:CrossSubsidiaryJoinRule a od:BusinessRule ;
    rdfs:label "그룹사 횡단 조인 규칙"@ko ;
    od:description "관계사 간 조인 시 반드시 그룹md번호와 기준년월/기준일자를 함께 사용"@ko ;
    od:sqlPattern "A.그룹md번호 = B.그룹md번호 AND A.기준년월 = B.기준년월" .

od:DateGranularityRule a od:BusinessRule ;
    rdfs:label "날짜 단위 규칙"@ko ;
    od:description "일별(d) 테이블은 기준일자, 월별(m) 테이블은 기준년월 사용"@ko ;
    od:condition "테이블명에 _d_가 포함되면 기준일자, _m_이 포함되면 기준년월" .
```

#### 3.2.2 Neptune 그래프 모델

```
(Customer)──hasTransaction──►(Transaction)
    │                              │
    │ hasProduct                    │ belongsTo
    ▼                              ▼
(Product)                    (Subsidiary)
    │                              ▲
    │ categorizedBy                │ belongsTo
    ▼                              │
(ProductCategory)            (Merchant)
                                   ▲
                                   │ operatesMerchant
                                   │
                            (SoleProprietor)
```

#### 3.2.3 Neptune 쿼리 활용 예시 (Gremlin)

```groovy
// 질문: "카드 고객의 거래 관련 테이블은?"
g.V().has('class', 'CardCustomer')
  .out('hasTransaction')
  .values('tables')

// 질문: "개인사업자와 가맹점을 조인하려면?"
g.V().has('class', 'SoleProprietor')
  .outE('operatesMerchant')
  .values('joinKey', 'joinCondition')
```

### 3.3 OpenSearch 시맨틱 검색 설계

#### 3.3.1 인덱스 구조

```json
{
  "onedata_semantic_index": {
    "mappings": {
      "properties": {
        "table_name": { "type": "keyword" },
        "column_name": { "type": "keyword" },
        "domain": { "type": "keyword" },
        "subsidiary": { "type": "keyword" },
        "description_ko": { "type": "text", "analyzer": "nori" },
        "description_en": { "type": "text" },
        "synonyms": { "type": "text", "analyzer": "nori" },
        "business_terms": { "type": "text", "analyzer": "nori" },
        "sample_values": { "type": "text" },
        "data_type": { "type": "keyword" },
        "embedding_vector": {
          "type": "knn_vector",
          "dimension": 1024,
          "method": {
            "name": "hnsw",
            "engine": "nmslib"
          }
        }
      }
    }
  }
}
```

#### 3.3.2 시맨틱 검색 활용 시나리오

| 사용자 입력 | 매칭 결과 | 매칭 방식 |
|------------|-----------|-----------|
| "고객 나이" | `igd_d_cust_mas.연령대코드` | 동의어 (나이 → 연령) |
| "카드 쓴 금액" | `trs_m_cust_card_txn_card.이용금액` | 자연어 매핑 |
| "대출 잔액" | `pdt_m_loan_prod_base_card.대출잔액` | 직접 매칭 |
| "사장님 매출" | `trs_m_soleprop_merchant_sales_card` | 비즈니스 용어 (사장님 → 개인사업자) |
| "투자 성향" | `cln_d_cust_mas_sec.투자성향코드` | 시맨틱 유사도 |

#### 3.3.3 동의어 사전 설계

```yaml
synonyms:
  # 고객 관련
  - "고객, 회원, 사용자, 유저, 가입자"
  - "나이, 연령, 나이대, 연령대"
  - "성별, 남녀, 젠더"
  
  # 거래 관련
  - "거래, 이용, 사용, 결제, 지출"
  - "금액, 돈, 액수, 비용"
  - "건수, 횟수, 빈도, 카운트"
  
  # 상품 관련
  - "상품, 제품, 서비스, 프로덕트"
  - "대출, 론, 차입"
  - "예금, 적금, 저축"
  
  # 사업자 관련
  - "사업자, 사장님, 자영업자, 소상공인, 개인사업자"
  - "가맹점, 매장, 점포, 상점"
  - "매출, 수익, 수입, 판매액"
  
  # 자산 관련
  - "자산, 재산, 보유액, 잔고"
  - "AUM, 운용자산, 투자자산"
```

### 3.4 시맨틱 레이어 연동 흐름

```
사용자 질의
    │
    ▼
┌─────────────────────┐
│ 1. OpenSearch       │  자연어 → 관련 테이블/컬럼 후보 검색
│    시맨틱 검색       │  (kNN + BM25 하이브리드)
└──────────┬──────────┘
           │ 후보 목록
           ▼
┌─────────────────────┐
│ 2. Neptune          │  후보 간 관계/조인 경로 탐색
│    그래프 탐색       │  비즈니스 규칙 조회
└──────────┬──────────┘
           │ 컨텍스트 (테이블, 컬럼, 조인조건, 규칙)
           ▼
┌─────────────────────┐
│ 3. LLM SQL 생성     │  컨텍스트 기반 SQL 생성
│    (Bedrock Claude) │
└─────────────────────┘
```

---

## 4. 에이전트 아키텍처

### 4.1 에이전트 처리 흐름 (전체)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Agent Pipeline                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐            │
│  │ STEP 1  │   │ STEP 2  │   │ STEP 3  │   │ STEP 4  │            │
│  │ Intent  │──►│ Context │──►│   SQL   │──►│ Execute │            │
│  │Analysis │   │Retrieval│   │Generate │   │& Answer │            │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘            │
│       │              │              │              │                  │
│       ▼              ▼              ▼              ▼                  │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐            │
│  │질의 의도 │   │테이블/   │   │SQL 쿼리  │   │결과 해석 │            │
│  │분류/분해 │   │컬럼/조인 │   │생성/검증 │   │자연어 응답│            │
│  │         │   │조건 확보 │   │         │   │         │            │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Reasoning Trace (모든 단계 기록)                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 각 단계 상세

#### STEP 1: Intent Analysis (의도 분석)

```python
class IntentAnalyzer:
    """
    사용자 질의를 분석하여 의도를 파악하고,
    필요한 경우 질문을 분해한다.
    """
    
    async def analyze(self, query: str) -> IntentResult:
        """
        Returns:
            - intent_type: SIMPLE_QUERY | CROSS_SUBSIDIARY | AGGREGATION | COMPARISON
            - target_domains: ["고객", "거래", ...]
            - target_subsidiaries: ["bank", "card", ...]
            - time_scope: DAILY | MONTHLY
            - sub_queries: [분해된 하위 질문들] (복합 질문의 경우)
        """
```

**의도 분류 체계:**

| 의도 유형 | 설명 | 예시 |
|-----------|------|------|
| `SIMPLE_QUERY` | 단일 테이블 조회 | "30대 은행 고객 수" |
| `CROSS_SUBSIDIARY` | 관계사 횡단 분석 | "은행과 카드 동시 보유 고객" |
| `AGGREGATION` | 집계/통계 | "월별 카드 이용 금액 추이" |
| `COMPARISON` | 비교 분석 | "은행 vs 증권 고객 자산 비교" |
| `TREND` | 추세/시계열 | "최근 6개월 거래 추이" |
| `RANKING` | 순위/TOP-N | "거래 금액 상위 10 고객" |

#### STEP 2: Context Retrieval (컨텍스트 확보)

```python
class ContextRetriever:
    """
    OpenSearch + Neptune을 조합하여
    SQL 생성에 필요한 모든 컨텍스트를 확보한다.
    """
    
    async def retrieve(self, intent: IntentResult) -> SQLContext:
        # 1. OpenSearch: 관련 테이블/컬럼 시맨틱 검색
        candidates = await self.opensearch.semantic_search(
            query=intent.original_query,
            domains=intent.target_domains,
            subsidiaries=intent.target_subsidiaries
        )
        
        # 2. Neptune: 테이블 간 관계 및 조인 경로 탐색
        join_paths = await self.neptune.find_join_paths(
            tables=[c.table_name for c in candidates]
        )
        
        # 3. Neptune: 비즈니스 규칙 조회
        rules = await self.neptune.get_business_rules(
            domains=intent.target_domains
        )
        
        # 4. 컨텍스트 조합
        return SQLContext(
            tables=candidates,
            join_paths=join_paths,
            business_rules=rules,
            time_scope=intent.time_scope
        )
```

#### STEP 3: SQL Generation (SQL 생성)

```python
class SQLGenerator:
    """
    LLM을 활용하여 컨텍스트 기반 SQL을 생성하고 검증한다.
    """
    
    SYSTEM_PROMPT = """
    당신은 신한금융그룹 Onedata 데이터 분석 전문가입니다.
    주어진 컨텍스트를 기반으로 Athena SQL을 생성합니다.
    
    규칙:
    1. 반드시 제공된 테이블과 컬럼만 사용할 것
    2. 관계사 횡단 조인 시 그룹md번호 + 기준년월/기준일자 필수
    3. 일별 테이블(_d_)은 기준일자, 월별 테이블(_m_)은 기준년월 사용
    4. Athena SQL 문법 준수 (Presto/Trino 기반)
    5. 대용량 테이블 조회 시 LIMIT 포함
    6. 파티션 키(기준년월/기준일자) 조건 필수 포함
    """
    
    async def generate(self, context: SQLContext, query: str) -> SQLResult:
        # LLM에 컨텍스트와 질문 전달
        prompt = self._build_prompt(context, query)
        sql = await self.llm.generate(prompt)
        
        # SQL 검증
        validation = await self._validate_sql(sql, context)
        if not validation.is_valid:
            # 자동 수정 시도
            sql = await self._fix_sql(sql, validation.errors)
        
        return SQLResult(sql=sql, explanation=self._explain_sql(sql))
    
    async def _validate_sql(self, sql: str, context: SQLContext) -> ValidationResult:
        """
        검증 항목:
        - 사용된 테이블/컬럼이 컨텍스트에 존재하는지
        - 조인 조건이 올바른지
        - 파티션 키 조건이 포함되어 있는지
        - Athena SQL 문법 오류 여부
        """
```

#### STEP 4: Execute & Answer (실행 및 응답)

```python
class QueryExecutor:
    """
    Athena에서 SQL을 실행하고 결과를 해석하여 자연어 답변을 생성한다.
    """
    
    async def execute_and_answer(self, sql_result: SQLResult, query: str) -> FinalAnswer:
        # 1. Athena 실행
        execution = await self.athena.start_query(
            sql=sql_result.sql,
            database="ai_ready_v2",
            output_location="s3://onedata-query-results/"
        )
        
        # 2. 결과 대기 및 수집
        results = await self.athena.get_results(execution.query_execution_id)
        
        # 3. 결과 해석 및 자연어 응답 생성
        answer = await self.llm.interpret_results(
            query=query,
            sql=sql_result.sql,
            results=results,
            explanation=sql_result.explanation
        )
        
        # 4. 시각화 추천
        viz_recommendation = self._recommend_visualization(results)
        
        return FinalAnswer(
            text=answer,
            data=results,
            sql=sql_result.sql,
            visualization=viz_recommendation
        )
```

### 4.3 에러 핸들링 및 자기 교정

```
┌──────────────────────────────────────────────────────┐
│                Self-Correction Loop                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  SQL 생성 ──► 검증 실패? ──► 자동 수정 (최대 3회)      │
│       │                          │                   │
│       │                          │ 실패              │
│       │                          ▼                   │
│       │                   사용자에게 질문              │
│       │                   (모호한 부분 확인)           │
│       ▼                                              │
│  Athena 실행 ──► 실행 오류? ──► SQL 수정 후 재실행     │
│       │                          │                   │
│       │                          │ 실패              │
│       │                          ▼                   │
│       │                   대안 쿼리 제안              │
│       ▼                                              │
│  결과 해석 ──► 결과 없음? ──► 조건 완화 제안           │
│       │                                              │
│       ▼                                              │
│  최종 응답 생성                                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 4.4 Reasoning Trace 구조

모든 단계의 추론 과정을 기록하여 프론트엔드에서 시각화한다.

```typescript
interface ReasoningTrace {
  id: string;
  timestamp: string;
  steps: ReasoningStep[];
}

interface ReasoningStep {
  step_number: number;
  step_type: "INTENT" | "CONTEXT" | "SQL_GEN" | "VALIDATE" | "EXECUTE" | "ANSWER";
  status: "IN_PROGRESS" | "COMPLETED" | "ERROR" | "RETRYING";
  title: string;           // e.g., "의도 분석 중..."
  detail: string;          // e.g., "관계사 횡단 분석으로 판단"
  artifacts?: {
    intent?: IntentResult;
    tables?: string[];
    join_paths?: JoinPath[];
    sql?: string;
    validation?: ValidationResult;
    results?: QueryResult;
  };
  duration_ms: number;
  children?: ReasoningStep[];  // 하위 단계 (재시도 등)
}
```

### 4.5 BFF API 설계

```python
# FastAPI BFF Layer

@app.post("/api/v1/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """
    메인 채팅 엔드포인트.
    SSE(Server-Sent Events)로 추론 과정을 실시간 스트리밍.
    """
    
@app.get("/api/v1/sessions/{session_id}/history")
async def get_history(session_id: str) -> ChatHistory:
    """대화 이력 조회"""
    
@app.get("/api/v1/ontology/explore")
async def explore_ontology(domain: str = None) -> OntologyView:
    """온톨로지 탐색 (시각화용)"""
    
@app.post("/api/v1/sql/validate")
async def validate_sql(request: SQLValidateRequest) -> ValidationResult:
    """SQL 사전 검증"""
    
@app.get("/api/v1/metadata/tables")
async def list_tables(domain: str = None, subsidiary: str = None) -> List[TableInfo]:
    """테이블 메타데이터 조회"""
    
@app.get("/api/v1/metadata/columns/{table_name}")
async def get_columns(table_name: str) -> List[ColumnInfo]:
    """컬럼 메타데이터 조회"""
```

---

## 5. 기술 스택 상세

### 5.1 전체 기술 스택

| 레이어 | 기술 | 버전/상세 | 역할 |
|--------|------|-----------|------|
| **Frontend** | Next.js | 14+ (App Router) | 채팅 UI + 추론 시각화 |
| | React | 18+ | UI 컴포넌트 |
| | TailwindCSS | 3.x | 스타일링 |
| | Recharts / D3.js | - | 결과 차트 시각화 |
| | React Flow | - | 온톨로지/추론 그래프 시각화 |
| **BFF** | FastAPI | 0.100+ | API 게이트웨이 / 오케스트레이션 |
| | Python | 3.11+ | 런타임 |
| | Pydantic | 2.x | 데이터 검증 |
| | SSE (sse-starlette) | - | 실시간 스트리밍 |
| **AI/ML** | Amazon Bedrock | Claude 3.5 Sonnet | LLM (SQL 생성, 응답 생성) |
| | Amazon Titan Embeddings | v2 | 임베딩 생성 |
| **Data Store** | Amazon Neptune | - | 온톨로지 그래프 DB |
| | Amazon OpenSearch | 2.x | 시맨틱 검색 (kNN + BM25) |
| | Amazon Athena | v3 | SQL 실행 엔진 |
| | AWS Glue Catalog | - | 데이터 카탈로그 (ai_ready_v2) |
| **Infra** | AWS CDK | 2.x | IaC |
| | Amazon ECS / Fargate | - | 컨테이너 실행 |
| | Amazon S3 | - | 쿼리 결과 저장 |
| | Amazon CloudWatch | - | 모니터링/로깅 |
| | AWS WAF | - | API 보안 |

### 5.2 LLM 활용 상세

| 용도 | 모델 | Temperature | Max Tokens | 비고 |
|------|------|-------------|------------|------|
| 의도 분석 | Claude 3.5 Sonnet | 0.0 | 1024 | 정확한 분류 필요 |
| SQL 생성 | Claude 3.5 Sonnet | 0.0 | 4096 | 결정적 출력 필요 |
| SQL 검증/수정 | Claude 3.5 Sonnet | 0.0 | 2048 | - |
| 결과 해석 | Claude 3.5 Sonnet | 0.3 | 2048 | 자연스러운 설명 |
| 대화 관리 | Claude 3.5 Haiku | 0.3 | 1024 | 비용 효율 |

### 5.3 보안 아키텍처

```
┌────────────────────────────────────────────────────────┐
│                    보안 레이어                           │
├────────────────────────────────────────────────────────┤
│                                                        │
│  1. 인증: AWS Cognito / SAML 2.0 (그룹사 SSO 연동)     │
│  2. 인가: RBAC (관계사별 데이터 접근 권한)               │
│  3. 네트워크: VPC + Private Subnet                     │
│  4. 데이터: 합성 데이터 사용 (개인정보 비식별화)          │
│  5. 감사: CloudTrail + 쿼리 로그 전수 보관              │
│  6. SQL 인젝션: LLM 생성 SQL 화이트리스트 검증           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 5.4 SQL 안전장치

```python
class SQLSafetyGuard:
    """LLM이 생성한 SQL의 안전성을 검증"""
    
    BLOCKED_KEYWORDS = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "CREATE", "TRUNCATE"]
    MAX_RESULT_ROWS = 10000
    QUERY_TIMEOUT_SECONDS = 300
    
    def validate(self, sql: str) -> SafetyResult:
        # 1. DML/DDL 차단 (SELECT만 허용)
        # 2. LIMIT 강제 삽입
        # 3. 파티션 키 조건 확인 (풀스캔 방지)
        # 4. 조인 깊이 제한 (최대 5 테이블)
        # 5. 서브쿼리 깊이 제한
```

---

## 6. 프론트엔드 시각화 요구사항

### 6.1 화면 구성 (scard-v1 참조 + 확장)

scard-v1의 채팅 UI + 추론 과정 시각화 패턴을 차용하되, Onedata의 그룹사 횡단 분석 특성을 반영하여 확장한다.

```
┌──────────────────────────────────────────────────────────────────┐
│  Onedata AI Agent                                    [사용자명]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────┐  ┌───────────────────────────┐  │
│  │                             │  │                           │  │
│  │     Chat Panel              │  │    Reasoning Panel        │  │
│  │                             │  │                           │  │
│  │  [User] 은행과 카드 동시     │  │  ┌─ 의도 분석 ✓           │  │
│  │  보유 고객 중 30대의 월평균  │  │  │  → 관계사 횡단 분석     │  │
│  │  카드 이용금액은?           │  │  │  → 대상: 은행, 카드     │  │
│  │                             │  │  │                         │  │
│  │  [Agent] 분석 결과를         │  │  ├─ 컨텍스트 확보 ✓        │  │
│  │  말씀드리겠습니다.           │  │  │  → 테이블 4개 식별      │  │
│  │                             │  │  │  → 조인 경로 확인       │  │
│  │  30대 은행+카드 동시 보유    │  │  │                         │  │
│  │  고객의 월평균 카드 이용     │  │  ├─ SQL 생성 ✓            │  │
│  │  금액은 **1,234,567원**     │  │  │  → SELECT ...           │  │
│  │  입니다.                    │  │  │  → [SQL 보기]           │  │
│  │                             │  │  │                         │  │
│  │  ┌────────────────────┐    │  │  ├─ 실행 ✓ (2.3초)        │  │
│  │  │  [차트 시각화]      │    │  │  │  → 1,247건 조회        │  │
│  │  │                    │    │  │  │                         │  │
│  │  └────────────────────┘    │  │  └─ 응답 생성 ✓           │  │
│  │                             │  │                           │  │
│  │  ┌────────────────────────┐│  │  ┌───────────────────────┐│  │
│  │  │ 질문을 입력하세요...    ││  │  │ 사용된 테이블:         ││  │
│  │  └────────────────────────┘│  │  │ • cln_m_cust_base_bank││  │
│  │                             │  │  │ • cln_m_cust_base_card││  │
│  └─────────────────────────────┘  │  │ • trs_m_cust_card_txn ││  │
│                                    │  └───────────────────────┘│  │
│                                    └───────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 핵심 UI 컴포넌트

#### 6.2.1 Reasoning Trace 컴포넌트

```typescript
// components/ReasoningTrace.tsx
interface ReasoningTraceProps {
  steps: ReasoningStep[];
  isStreaming: boolean;
}

/**
 * 추론 과정을 단계별로 시각화하는 컴포넌트.
 * scard-v1의 step-by-step 패턴을 차용하되,
 * 각 단계를 접고 펼 수 있는 아코디언 형태로 구현.
 * 
 * 특징:
 * - 실시간 스트리밍: SSE로 각 단계가 진행됨에 따라 업데이트
 * - 단계별 상태 표시: 진행중(spinner), 완료(check), 에러(x), 재시도(retry)
 * - SQL 하이라이팅: 생성된 SQL을 syntax highlighting으로 표시
 * - 테이블 관계 시각화: 사용된 테이블 간 관계를 미니 그래프로 표시
 */
```

#### 6.2.2 결과 시각화 컴포넌트

```typescript
// components/ResultVisualization.tsx

/**
 * 쿼리 결과를 적절한 형태로 시각화.
 * 자동 추천 또는 사용자 선택 가능.
 * 
 * 시각화 유형:
 * - 테이블: 기본 결과 표시
 * - 바 차트: 범주별 비교
 * - 라인 차트: 시계열 추이
 * - 파이 차트: 비율/구성
 * - 히트맵: 관계사별 교차 분석
 */
```

#### 6.2.3 온톨로지 탐색기

```typescript
// components/OntologyExplorer.tsx

/**
 * Neptune 온톨로지를 인터랙티브 그래프로 시각화.
 * React Flow 기반.
 * 
 * 기능:
 * - 도메인별 노드 색상 구분
 * - 관계사별 필터링
 * - 조인 경로 하이라이팅
 * - 테이블 상세 정보 팝업
 */
```

### 6.3 실시간 스트리밍 구현

```typescript
// hooks/useAgentStream.ts

/**
 * SSE 기반 에이전트 응답 스트리밍 훅.
 * 
 * 이벤트 타입:
 * - reasoning_step: 추론 단계 업데이트
 * - sql_generated: SQL 생성 완료
 * - execution_started: Athena 실행 시작
 * - result_ready: 결과 준비 완료
 * - answer_chunk: 응답 텍스트 청크 (스트리밍)
 * - error: 에러 발생
 * - done: 전체 처리 완료
 */

function useAgentStream(sessionId: string) {
  // EventSource를 활용한 SSE 연결
  // 각 이벤트에 따라 UI 상태 업데이트
}
```

### 6.4 UX 요구사항

| 요구사항 | 설명 | 우선순위 |
|---------|------|---------|
| 추론 과정 투명성 | 에이전트가 어떤 테이블을 선택했고 왜 그 조인을 했는지 보여줌 | P0 |
| SQL 확인 가능 | 생성된 SQL을 사용자가 직접 확인하고 수정 가능 | P0 |
| 결과 다운로드 | CSV/Excel 다운로드 | P1 |
| 대화 맥락 유지 | "그중에서 서울 거주자만"과 같은 후속 질문 지원 | P1 |
| 관계사 필터 | 분석 대상 관계사를 사전 지정 가능 | P1 |
| 즐겨찾기 질문 | 자주 사용하는 질문 저장 | P2 |
| 질문 추천 | 도메인별 예시 질문 제공 | P2 |
| 다크모드 | 시스템 설정 연동 | P2 |

---

## 7. 구현 단계

### Phase 1: 기반 구축 (4주)

**목표:** 핵심 인프라 구축 및 단일 도메인 PoC

| 주차 | 작업 항목 | 산출물 |
|------|-----------|--------|
| 1주 | AWS 인프라 프로비저닝 (CDK) | Neptune, OpenSearch, Athena 환경 |
| 1주 | 온톨로지 초기 설계 (TTL 작성) | 고객 마스터 도메인 온톨로지 |
| 2주 | BFF 기본 구조 (FastAPI) | API 스켈레톤, 세션 관리 |
| 2주 | OpenSearch 인덱스 설계 및 데이터 적재 | 53개 테이블 메타데이터 인덱싱 |
| 3주 | Neptune 온톨로지 적재 | 그래프 데이터 로드 |
| 3주 | LLM 연동 (Bedrock Claude) | SQL 생성 기본 파이프라인 |
| 4주 | 단일 도메인 E2E 테스트 | 고객 마스터 대상 Text-to-SQL 동작 확인 |

**Phase 1 성공 기준:**
- "30대 은행 고객 수를 알려줘" → 올바른 SQL 생성 및 실행 → 자연어 답변

### Phase 2: 에이전트 고도화 (4주)

**목표:** 그룹사 횡단 분석 지원 및 추론 과정 시각화

| 주차 | 작업 항목 | 산출물 |
|------|-----------|--------|
| 5주 | 전체 도메인 온톨로지 확장 | 10개 도메인 완전 커버리지 |
| 5주 | 조인 경로 탐색 로직 구현 | Neptune Gremlin 쿼리 |
| 6주 | 의도 분석기 고도화 | 복합 질문 분해, 횡단 분석 감지 |
| 6주 | SQL 검증/자기교정 로직 | 3회 재시도, 에러 메시지 분석 |
| 7주 | 프론트엔드 기본 UI | Chat Panel + Reasoning Panel |
| 7주 | SSE 스트리밍 구현 | 실시간 추론 과정 표시 |
| 8주 | 그룹사 횡단 E2E 테스트 | 4개 관계사 횡단 질의 동작 확인 |

**Phase 2 성공 기준:**
- "은행과 카드를 동시에 보유한 30대 고객의 월평균 카드 이용금액은?" → 올바른 크로스 조인 SQL 생성 → 결과 반환 + 추론 과정 표시

### Phase 3: 시각화 및 UX 완성 (3주)

**목표:** 프로덕션 레벨 UX 및 결과 시각화

| 주차 | 작업 항목 | 산출물 |
|------|-----------|--------|
| 9주 | 결과 시각화 (차트) | Recharts 기반 자동 시각화 |
| 9주 | 온톨로지 탐색기 | React Flow 기반 그래프 뷰 |
| 10주 | 대화 맥락 관리 | 후속 질문 지원, 세션 관리 |
| 10주 | SQL 수정 기능 | 사용자 SQL 직접 편집/재실행 |
| 11주 | UX 다듬기 및 성능 최적화 | 응답 시간 목표: 5초 이내 |

**Phase 3 성공 기준:**
- 전체 53개 테이블 대상 자연어 질의 가능
- 추론 과정 실시간 시각화
- 결과 차트 자동 생성
- 평균 응답 시간 5초 이내

### Phase 4: 안정화 및 확장 (3주)

**목표:** 운영 안정화, 성능 튜닝, 피드백 반영

| 주차 | 작업 항목 | 산출물 |
|------|-----------|--------|
| 12주 | SQL 정확도 개선 (Few-shot 예제 추가) | 도메인별 예제 쿼리 50건+ |
| 12주 | 동의어 사전 확장 | 금융 도메인 특화 사전 |
| 13주 | 성능 모니터링 및 튜닝 | CloudWatch 대시보드 |
| 13주 | 보안 강화 (WAF, 감사 로그) | 보안 체계 완성 |
| 14주 | 사용자 피드백 반영 | v1.0 릴리스 |
| 14주 | 운영 가이드 및 인수인계 | 운영 문서 |

### 7.1 리스크 및 대응 방안

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| SQL 정확도 부족 | 높음 | Few-shot 예제 지속 축적, 사용자 피드백 루프, Fallback 템플릿 |
| Athena 응답 지연 | 중간 | 파티션 키 조건 강제, 결과 캐싱, 비동기 실행 |
| 온톨로지 유지보수 비용 | 중간 | 반자동 온톨로지 업데이트 파이프라인 |
| LLM 환각 (잘못된 테이블/컬럼) | 높음 | 엄격한 검증 레이어, 화이트리스트 기반 SQL 검증 |
| 복합 질문 해석 실패 | 중간 | 질문 분해 전략, 사용자 확인 요청 |

### 7.2 성공 지표 (KPI)

| 지표 | 목표 | 측정 방법 |
|------|------|-----------|
| SQL 정확도 | 80% 이상 | 테스트 질의 세트 대비 정답률 |
| 평균 응답 시간 | 5초 이내 | P95 latency 측정 |
| 사용자 만족도 | 4.0/5.0 이상 | 응답 피드백 (좋아요/싫어요) |
| 일 활성 사용자 | 50명 이상 | DAU 추적 |
| 자기 교정 성공률 | 70% 이상 | 첫 실패 후 자동 수정 성공 비율 |

---

## 부록 A: 프로젝트 디렉토리 구조 (예시)

```
onedata-ai-agent/
├── frontend/                    # Next.js 프론트엔드
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── chat/
│   │       └── page.tsx
│   ├── components/
│   │   ├── ChatPanel.tsx
│   │   ├── ReasoningTrace.tsx
│   │   ├── ResultVisualization.tsx
│   │   ├── OntologyExplorer.tsx
│   │   └── SQLViewer.tsx
│   ├── hooks/
│   │   ├── useAgentStream.ts
│   │   └── useSession.ts
│   └── lib/
│       └── api.ts
├── bff/                         # FastAPI BFF
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── chat.py
│   │   │   ├── metadata.py
│   │   │   └── ontology.py
│   │   ├── services/
│   │   │   ├── agent_orchestrator.py
│   │   │   ├── intent_analyzer.py
│   │   │   ├── context_retriever.py
│   │   │   ├── sql_generator.py
│   │   │   ├── query_executor.py
│   │   │   └── safety_guard.py
│   │   ├── clients/
│   │   │   ├── neptune_client.py
│   │   │   ├── opensearch_client.py
│   │   │   ├── athena_client.py
│   │   │   └── bedrock_client.py
│   │   └── models/
│   │       ├── intent.py
│   │       ├── context.py
│   │       ├── sql_result.py
│   │       └── reasoning.py
│   ├── tests/
│   └── pyproject.toml
├── ontology/                    # 온톨로지 정의
│   ├── core.ttl                # 핵심 클래스/관계
│   ├── customer.ttl            # 고객 도메인
│   ├── transaction.ttl         # 거래 도메인
│   ├── product.ttl             # 상품 도메인
│   ├── merchant.ttl            # 가맹점 도메인
│   ├── rules.ttl               # 비즈니스 규칙
│   └── synonyms.yaml           # 동의어 사전
├── infra/                       # AWS CDK
│   ├── lib/
│   │   ├── neptune-stack.ts
│   │   ├── opensearch-stack.ts
│   │   ├── ecs-stack.ts
│   │   └── network-stack.ts
│   └── bin/
│       └── app.ts
├── scripts/                     # 유틸리티 스크립트
│   ├── load_ontology.py        # Neptune 온톨로지 적재
│   ├── index_metadata.py       # OpenSearch 메타데이터 인덱싱
│   └── generate_embeddings.py  # 임베딩 생성
└── docs/
    ├── architecture-design.md  # 본 문서
    └── api-spec.yaml           # OpenAPI 스펙
```

---

## 부록 B: 예시 질의 시나리오

### 시나리오 1: 단순 조회

**질문:** "2024년 6월 기준 30대 은행 고객은 몇 명인가요?"

**추론 과정:**
1. 의도: SIMPLE_QUERY, 도메인=고객, 관계사=은행, 시점=월별
2. 테이블: `cln_m_cust_base_bank` (연령대 + 기준년월)
3. SQL:
```sql
SELECT COUNT(*) as 고객수
FROM ai_ready_v2.cln_m_cust_base_bank
WHERE 기준년월 = '202406'
  AND 연령대코드 = '30'
```

### 시나리오 2: 관계사 횡단 분석

**질문:** "은행과 카드를 동시에 보유한 고객 중 월 카드 이용금액 상위 10명의 은행 자산 규모는?"

**추론 과정:**
1. 의도: CROSS_SUBSIDIARY + RANKING, 도메인=고객+거래+보유, 관계사=은행+카드
2. 테이블: `cln_m_cust_base_bank`, `cln_m_cust_base_card`, `trs_m_cust_card_txn_card`, `igd_m_cust_holding_base`
3. 조인 경로: 그룹md번호 + 기준년월
4. SQL:
```sql
WITH 동시보유고객 AS (
    SELECT b.그룹md번호
    FROM ai_ready_v2.cln_m_cust_base_bank b
    INNER JOIN ai_ready_v2.cln_m_cust_base_card c
        ON b.그룹md번호 = c.그룹md번호
        AND b.기준년월 = c.기준년월
    WHERE b.기준년월 = '202406'
),
카드이용상위 AS (
    SELECT t.그룹md번호, SUM(t.이용금액) as 총이용금액
    FROM ai_ready_v2.trs_m_cust_card_txn_card t
    INNER JOIN 동시보유고객 d ON t.그룹md번호 = d.그룹md번호
    WHERE t.기준년월 = '202406'
    GROUP BY t.그룹md번호
    ORDER BY 총이용금액 DESC
    LIMIT 10
)
SELECT 
    k.그룹md번호,
    k.총이용금액,
    h.총자산금액
FROM 카드이용상위 k
LEFT JOIN ai_ready_v2.igd_m_cust_holding_base h
    ON k.그룹md번호 = h.그룹md번호
    AND h.기준년월 = '202406'
ORDER BY k.총이용금액 DESC
```

### 시나리오 3: 개인사업자 분석

**질문:** "배달 매출이 있는 카드 가맹점 중 최근 3개월 매출 감소 사업자는?"

**추론 과정:**
1. 의도: TREND + AGGREGATION, 도메인=가맹점+개인사업자, 관계사=카드
2. 테이블: `trs_m_merchant_delivery`, `trs_m_soleprop_merchant_sales_card`
3. SQL:
```sql
WITH 월별매출 AS (
    SELECT 
        사업자등록번호,
        기준년월,
        SUM(배달매출금액) as 월매출
    FROM ai_ready_v2.trs_m_merchant_delivery
    WHERE 기준년월 BETWEEN '202404' AND '202406'
    GROUP BY 사업자등록번호, 기준년월
),
매출추이 AS (
    SELECT 
        사업자등록번호,
        MAX(CASE WHEN 기준년월 = '202404' THEN 월매출 END) as 월매출_4월,
        MAX(CASE WHEN 기준년월 = '202405' THEN 월매출 END) as 월매출_5월,
        MAX(CASE WHEN 기준년월 = '202406' THEN 월매출 END) as 월매출_6월
    FROM 월별매출
    GROUP BY 사업자등록번호
)
SELECT *
FROM 매출추이
WHERE 월매출_4월 > 월매출_5월
  AND 월매출_5월 > 월매출_6월
ORDER BY (월매출_4월 - 월매출_6월) DESC
LIMIT 100
```

---

## 부록 C: 참조 아키텍처 비교 (scard-v1 vs Onedata)

| 구분 | scard-v1 (참조) | Onedata AI Agent |
|------|-----------------|------------------|
| 쿼리 방식 | 템플릿 기반 (사전 정의) | LLM 생성 (동적) |
| 대상 범위 | 단일 관계사 (카드) | 4개 관계사 횡단 |
| 온톨로지 | 도메인 특화 (카드) | 그룹사 통합 온톨로지 |
| SQL 실행 | 단순 쿼리 | 복합 조인, CTE 활용 |
| 프론트엔드 | Next.js + 채팅 | Next.js + 채팅 + 추론 시각화 |
| BFF | FastAPI | FastAPI (동일) |
| 그래프 DB | Neptune (동일) | Neptune (동일) |
| 검색 | OpenSearch (동일) | OpenSearch (동일) + kNN |
| 시각화 | 기본 테이블 | 차트 + 그래프 + 테이블 |

**차용하는 패턴:**
- FastAPI BFF → Neptune/OpenSearch/Athena 프록시 구조
- 온톨로지 TTL 파일 기반 도메인 모델링
- Next.js 채팅 UI 컴포넌트 구조
- SSE 기반 스트리밍 응답

**확장하는 부분:**
- 템플릿 → LLM 동적 SQL 생성
- 단일 관계사 → 그룹사 횡단 조인 로직
- 기본 응답 → 추론 과정 전체 시각화
- 정적 결과 → 인터랙티브 차트/그래프

---

*문서 버전: v1.0*  
*작성일: 2026-08-10*  
*작성: Onedata AI Agent 설계팀*
