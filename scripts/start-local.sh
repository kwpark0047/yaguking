#!/usr/bin/env bash
# 야구왕 로컬 개발 환경 시작 스크립트
#
# 사전 준비:
#   - Docker Desktop이 실행 중이어야 함
#   - .env.local 파일이 존재해야 함 (.env.example 참조)
#
# 사용법:
#   ./scripts/start-local.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo " 야구왕(YaguKing) 로컬 개발 환경 시작"
echo "========================================"

# 1. .env.local 확인
if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  echo "[WARN] .env.local 파일이 없습니다. .env.example에서 복사합니다."
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env.local"
  echo "[INFO] .env.local을 생성했습니다. 필요한 값을 수정한 후 다시 실행하세요."
  exit 1
fi

# 2. 의존성 설치 확인
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "[INFO] npm install 실행 중..."
  cd "$PROJECT_DIR"
  npm install
fi

# 3. Supabase 로컬 시작
echo "[INFO] Supabase 로컬 인스턴스 시작..."
cd "$PROJECT_DIR"
npm run db:start

# 4. DB 마이그레이션 및 시드 데이터 적용
echo "[INFO] DB 마이그레이션 적용 및 시드 데이터 추가..."
npm run db:reset
npm run seed:questions

# 5. 개발 서버 실행
echo "[INFO] Next.js 개발 서버 실행 (http://localhost:3000)..."
npm run dev

echo "========================================"
echo " 로컬 개발 환경 준비 완료"
echo " - 앱:          http://localhost:3000"
echo " - Supabase API: http://localhost:54321"
echo " - Supabase DB:  postgresql://postgres:postgres@localhost:54322/postgres"
echo " - Supabase Studio: http://localhost:54323"
echo "========================================"
