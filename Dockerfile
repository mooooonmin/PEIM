FROM node:24-slim AS frontend
WORKDIR /frontend
COPY package.json package-lock.json ./
RUN npm ci
COPY app/frontend ./app/frontend
COPY scripts/build_frontend.mjs ./scripts/build_frontend.mjs
RUN npm run build

FROM python:3.12-slim AS seed
WORKDIR /source
COPY scripts ./scripts
COPY public/data ./public/data
COPY content ./content
COPY data ./data
COPY 정보관리기술사_기출문제 ./정보관리기술사_기출문제
RUN python scripts/export_dataset.py

FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=seed /source/scripts/out/dataset-v1.json ./seed.json
COPY app ./app
COPY --from=frontend /frontend/app/static/assets ./app/static/assets
COPY scripts/data_contract.py scripts/parse_questions.py ./scripts/
RUN useradd --uid 10001 --create-home peim
USER peim
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS test
USER root
COPY requirements-test.txt .
RUN pip install --no-cache-dir -r requirements-test.txt
COPY tests/test_app.py ./tests/test_app.py
USER peim
CMD ["python", "-m", "unittest", "discover", "-s", "tests", "-p", "test_app.py", "-v"]

FROM runtime AS final
