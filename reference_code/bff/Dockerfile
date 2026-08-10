FROM python:3.12-slim

WORKDIR /app

COPY bff/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bff/ /app/bff/

# U53: 데모 캐시 워밍(UI 버튼)이 에이전트의 SQL 계약(template_registry·athena_client·
# sql_cache·라우터)을 재사용한다 → 그 모듈과 라우팅에 필요한 데이터만 담는다.
# ⚠️ 빌드 컨텍스트는 **리포 루트**다: docker build -f bff/Dockerfile . (bff/ 아님)
COPY pipeline/agent/ /app/pipeline/agent/
COPY pipeline/domain/ /app/pipeline/domain/
COPY scripts/warm_sql_cache.py /app/scripts/warm_sql_cache.py
COPY data/ /app/data/
ENV PYTHONPATH=/app:/app/pipeline


EXPOSE 8000

CMD ["uvicorn", "bff.main:app", "--host", "0.0.0.0", "--port", "8000"]
