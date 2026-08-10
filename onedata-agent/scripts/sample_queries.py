"""Sample Athena queries to verify data access for the Onedata AI Agent.

This script:
1. Connects to AWS Athena using the ai_ready_v2 database
2. Runs a set of representative queries across the 53 tables
3. Reports results and verifies data accessibility

Usage:
    python scripts/sample_queries.py [--database DATABASE] [--workgroup WORKGROUP]

Requirements:
    pip install boto3 tabulate
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Any

import boto3
from tabulate import tabulate


# Configuration
DEFAULT_DATABASE = os.environ.get("ATHENA_DATABASE", "ai_ready_v2")
DEFAULT_WORKGROUP = os.environ.get("ATHENA_WORKGROUP", "primary")
DEFAULT_OUTPUT_BUCKET = os.environ.get(
    "ATHENA_OUTPUT_BUCKET", "s3://onedata-athena-results/"
)
DEFAULT_REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
QUERY_TIMEOUT_SECONDS = 60


# Sample queries organized by category
SAMPLE_QUERIES = [
    # --- Category: Table Availability ---
    {
        "name": "List all tables in ai_ready_v2",
        "category": "availability",
        "sql": "SHOW TABLES IN ai_ready_v2",
        "expected_min_rows": 50,
    },
    # --- Category: Customer Data ---
    {
        "name": "Integrated customer master - sample",
        "category": "customer",
        "sql": """
            SELECT 그룹md번호, 고객명, 성별, 연령, 탑스클럽등급,
                   은행고객tf, 카드고객tf, 보험고객tf, 증권고객tf
            FROM igd_d_cust_mas
            WHERE 기준일자 = (SELECT MAX(기준일자) FROM igd_d_cust_mas)
            LIMIT 10
        """,
        "expected_min_rows": 1,
    },
    {
        "name": "Customer dimension lookup",
        "category": "customer",
        "sql": """
            SELECT 그룹md번호, 고객명, 연령대, 성별, 탑스클럽등급, 주거래계열사
            FROM m_cust_dim
            LIMIT 10
        """,
        "expected_min_rows": 1,
    },
    # --- Category: Cross-Subsidiary Join ---
    {
        "name": "Cross-subsidiary customer asset view",
        "category": "cross_subsidiary",
        "sql": """
            SELECT
                b.그룹md번호,
                b.기준년월,
                b.수신잔액 AS bank_deposit,
                c.이용금액 AS card_spending,
                l.유지계약건수 AS life_contracts,
                s.예탁자산 AS sec_assets
            FROM cln_m_cust_base_bank b
            LEFT JOIN cln_m_cust_base_card c
                ON b.그룹md번호 = c.그룹md번호 AND b.기준년월 = c.기준년월
            LEFT JOIN cln_m_cust_base_life l
                ON b.그룹md번호 = l.그룹md번호 AND b.기준년월 = l.기준년월
            LEFT JOIN cln_m_cust_base_sec s
                ON b.그룹md번호 = s.그룹md번호 AND b.기준년월 = s.기준년월
            WHERE b.기준년월 = (SELECT MAX(기준년월) FROM cln_m_cust_base_bank)
            LIMIT 10
        """,
        "expected_min_rows": 1,
    },
    # --- Category: Card Transactions ---
    {
        "name": "Monthly card transaction summary",
        "category": "transactions",
        "sql": """
            SELECT
                기준년월,
                COUNT(DISTINCT 그룹md번호) AS customer_count,
                SUM(이용건수) AS total_txn_count,
                SUM(이용금액) AS total_txn_amount,
                AVG(이용금액) AS avg_spending
            FROM trs_m_cust_card_txn_card
            WHERE 기준년월 >= '202401'
            GROUP BY 기준년월
            ORDER BY 기준년월 DESC
            LIMIT 12
        """,
        "expected_min_rows": 1,
    },
    # --- Category: Merchant / Sole Proprietor ---
    {
        "name": "Merchant franchise summary",
        "category": "merchant",
        "sql": """
            SELECT 프랜차이즈코드, 프랜차이즈명, 업종대분류, 가맹점수
            FROM com_m_merchant_franchise
            ORDER BY 가맹점수 DESC
            LIMIT 10
        """,
        "expected_min_rows": 1,
    },
    {
        "name": "Sole proprietor sales analysis",
        "category": "merchant",
        "sql": """
            SELECT
                sp.업종코드,
                COUNT(DISTINCT sp.개인사업자번호) AS biz_count,
                AVG(ms.매출금액) AS avg_sales
            FROM igd_m_soleprop_base sp
            JOIN trs_m_soleprop_merchant_sales_card ms
                ON sp.그룹md번호 = ms.그룹md번호
                AND sp.기준년월 = ms.기준년월
            WHERE sp.기준년월 = (SELECT MAX(기준년월) FROM igd_m_soleprop_base)
            GROUP BY sp.업종코드
            ORDER BY avg_sales DESC
            LIMIT 10
        """,
        "expected_min_rows": 1,
    },
    # --- Category: RFM Segmentation ---
    {
        "name": "RFM segment distribution",
        "category": "analytics",
        "sql": """
            SELECT
                rfm_segment,
                COUNT(*) AS customer_count,
                AVG(rfm_total_score) AS avg_score,
                AVG(거래규모) AS avg_monetary
            FROM igd_m_shg_rfm_base_ledger
            WHERE 기준년월 = (SELECT MAX(기준년월) FROM igd_m_shg_rfm_base_ledger)
            GROUP BY rfm_segment
            ORDER BY avg_score DESC
        """,
        "expected_min_rows": 1,
    },
    # --- Category: TOPS Club / Membership ---
    {
        "name": "TOPS Club tier distribution",
        "category": "membership",
        "sql": """
            SELECT
                탑스클럽등급,
                COUNT(*) AS customer_count
            FROM m_cust_dim
            WHERE 탑스클럽등급 IS NOT NULL
            GROUP BY 탑스클럽등급
            ORDER BY customer_count DESC
        """,
        "expected_min_rows": 1,
    },
    # --- Category: Product Holdings ---
    {
        "name": "Product holding distribution",
        "category": "products",
        "sql": """
            SELECT
                기준년월,
                SUM(CASE WHEN 은행수신보유tf = 1 THEN 1 ELSE 0 END) AS bank_deposit_holders,
                SUM(CASE WHEN 카드보유tf = 1 THEN 1 ELSE 0 END) AS card_holders,
                SUM(CASE WHEN 보험보유tf = 1 THEN 1 ELSE 0 END) AS insurance_holders,
                SUM(CASE WHEN 증권보유tf = 1 THEN 1 ELSE 0 END) AS securities_holders,
                AVG(보유상품수) AS avg_products
            FROM igd_m_cust_holding_base
            WHERE 기준년월 = (SELECT MAX(기준년월) FROM igd_m_cust_holding_base)
            GROUP BY 기준년월
        """,
        "expected_min_rows": 1,
    },
    # --- Category: Delivery Merchants ---
    {
        "name": "Delivery merchant trends",
        "category": "merchant",
        "sql": """
            SELECT
                기준년월,
                COUNT(*) AS merchant_count,
                SUM(배달매출금액) AS total_delivery_sales,
                SUM(일반매출금액) AS total_regular_sales,
                AVG(배달비중) AS avg_delivery_ratio
            FROM trs_m_merchant_delivery
            WHERE 기준년월 >= '202401'
            GROUP BY 기준년월
            ORDER BY 기준년월 DESC
            LIMIT 6
        """,
        "expected_min_rows": 1,
    },
]


class AthenaQueryRunner:
    """Runs queries against AWS Athena and collects results."""

    def __init__(
        self,
        database: str,
        workgroup: str,
        output_bucket: str,
        region: str,
    ):
        self.database = database
        self.workgroup = workgroup
        self.output_bucket = output_bucket
        self.client = boto3.client("athena", region_name=region)

    def execute_query(self, sql: str) -> dict[str, Any]:
        """Execute a query and wait for results."""
        start_time = time.time()

        # Start query execution
        response = self.client.start_query_execution(
            QueryString=sql.strip(),
            QueryExecutionContext={"Database": self.database},
            WorkGroup=self.workgroup,
            ResultConfiguration={"OutputLocation": self.output_bucket},
        )

        query_execution_id = response["QueryExecutionId"]

        # Wait for completion
        while True:
            elapsed = time.time() - start_time
            if elapsed > QUERY_TIMEOUT_SECONDS:
                self.client.stop_query_execution(
                    QueryExecutionId=query_execution_id
                )
                return {
                    "status": "TIMEOUT",
                    "elapsed_ms": int(elapsed * 1000),
                    "rows": [],
                    "columns": [],
                    "error": f"Query timed out after {QUERY_TIMEOUT_SECONDS}s",
                }

            status_response = self.client.get_query_execution(
                QueryExecutionId=query_execution_id
            )
            state = status_response["QueryExecution"]["Status"]["State"]

            if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
                break

            time.sleep(1)

        elapsed = time.time() - start_time

        if state != "SUCCEEDED":
            error_msg = (
                status_response["QueryExecution"]["Status"]
                .get("StateChangeReason", "Unknown error")
            )
            return {
                "status": state,
                "elapsed_ms": int(elapsed * 1000),
                "rows": [],
                "columns": [],
                "error": error_msg,
            }

        # Get results
        results_response = self.client.get_query_results(
            QueryExecutionId=query_execution_id,
            MaxResults=100,
        )

        # Parse columns and rows
        columns = [
            col["Label"] or col["Name"]
            for col in results_response["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]
        ]

        rows = []
        result_rows = results_response["ResultSet"]["Rows"]
        # Skip header row
        for row in result_rows[1:]:
            values = [field.get("VarCharValue", "") for field in row["Data"]]
            rows.append(values)

        # Get data scanned
        stats = status_response["QueryExecution"].get("Statistics", {})
        data_scanned_bytes = stats.get("DataScannedInBytes", 0)

        return {
            "status": "SUCCEEDED",
            "elapsed_ms": int(elapsed * 1000),
            "rows": rows,
            "columns": columns,
            "row_count": len(rows),
            "data_scanned_mb": round(data_scanned_bytes / (1024 * 1024), 2),
        }


def run_all_queries(runner: AthenaQueryRunner) -> list[dict[str, Any]]:
    """Run all sample queries and collect results."""
    results = []

    print("=" * 80)
    print("Onedata AI Agent - Sample Query Verification")
    print("=" * 80)
    print(f"Database: {runner.database}")
    print(f"Workgroup: {runner.workgroup}")
    print(f"Total queries: {len(SAMPLE_QUERIES)}")
    print("=" * 80)

    for i, query_def in enumerate(SAMPLE_QUERIES, 1):
        name = query_def["name"]
        category = query_def["category"]
        sql = query_def["sql"]
        expected_min = query_def.get("expected_min_rows", 0)

        print(f"\n[{i}/{len(SAMPLE_QUERIES)}] {name}")
        print(f"    Category: {category}")
        print(f"    SQL: {sql.strip()[:80]}...")

        result = runner.execute_query(sql)
        result["name"] = name
        result["category"] = category
        result["expected_min_rows"] = expected_min

        if result["status"] == "SUCCEEDED":
            row_count = result["row_count"]
            passed = row_count >= expected_min
            status_icon = "PASS" if passed else "WARN"
            print(
                f"    Result: [{status_icon}] {row_count} rows, "
                f"{result['elapsed_ms']}ms, "
                f"{result['data_scanned_mb']}MB scanned"
            )

            # Print sample data
            if result["rows"] and result["columns"]:
                sample_rows = result["rows"][:3]
                print(
                    f"    Sample:\n"
                    + tabulate(
                        sample_rows,
                        headers=result["columns"],
                        tablefmt="simple",
                        maxcolwidths=20,
                    ).replace("\n", "\n    ")
                )

            result["passed"] = passed
        else:
            print(f"    Result: [FAIL] {result['status']}: {result.get('error', '')}")
            result["passed"] = False

        results.append(result)

    return results


def print_summary(results: list[dict[str, Any]]) -> None:
    """Print a summary report of all query results."""
    print("\n" + "=" * 80)
    print("SUMMARY REPORT")
    print("=" * 80)

    total = len(results)
    passed = sum(1 for r in results if r.get("passed", False))
    failed = total - passed

    print(f"\nTotal queries: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Success rate: {passed/total*100:.1f}%")

    # Group by category
    categories: dict[str, list] = {}
    for r in results:
        cat = r.get("category", "other")
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(r)

    print("\nBy category:")
    for cat, cat_results in categories.items():
        cat_passed = sum(1 for r in cat_results if r.get("passed", False))
        print(f"  {cat}: {cat_passed}/{len(cat_results)} passed")

    # List failures
    failures = [r for r in results if not r.get("passed", False)]
    if failures:
        print("\nFailed queries:")
        for r in failures:
            print(f"  - {r['name']}: {r.get('error', 'Insufficient rows')}")

    # Performance stats
    succeeded = [r for r in results if r["status"] == "SUCCEEDED"]
    if succeeded:
        avg_time = sum(r["elapsed_ms"] for r in succeeded) / len(succeeded)
        total_scanned = sum(r.get("data_scanned_mb", 0) for r in succeeded)
        print(f"\nPerformance:")
        print(f"  Average query time: {avg_time:.0f}ms")
        print(f"  Total data scanned: {total_scanned:.1f}MB")

    print("\n" + "=" * 80)

    # Exit code based on results
    if failed > 0:
        print(f"\nWARNING: {failed} queries did not meet expectations.")
        return False
    else:
        print("\nAll queries passed successfully.")
        return True


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Run sample Athena queries to verify Onedata data access"
    )
    parser.add_argument(
        "--database",
        default=DEFAULT_DATABASE,
        help="Athena database name",
    )
    parser.add_argument(
        "--workgroup",
        default=DEFAULT_WORKGROUP,
        help="Athena workgroup",
    )
    parser.add_argument(
        "--output-bucket",
        default=DEFAULT_OUTPUT_BUCKET,
        help="S3 bucket for query results",
    )
    parser.add_argument(
        "--region",
        default=DEFAULT_REGION,
        help="AWS region",
    )
    parser.add_argument(
        "--category",
        help="Run only queries in this category",
    )

    args = parser.parse_args()

    # Filter queries by category if specified
    if args.category:
        global SAMPLE_QUERIES
        SAMPLE_QUERIES = [
            q for q in SAMPLE_QUERIES if q["category"] == args.category
        ]
        if not SAMPLE_QUERIES:
            print(f"ERROR: No queries found for category '{args.category}'")
            sys.exit(1)

    # Initialize runner
    runner = AthenaQueryRunner(
        database=args.database,
        workgroup=args.workgroup,
        output_bucket=args.output_bucket,
        region=args.region,
    )

    # Run queries
    results = run_all_queries(runner)

    # Print summary
    all_passed = print_summary(results)

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
