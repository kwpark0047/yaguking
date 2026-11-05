# 야구왕(YaguKing) Next.js 프로덕션 빌드 Dockerfile
#
# 빌드:
#   docker build -t yaguking .
#
# 실행:
#   docker run -p 3000:3000 --env-file .env.local yaguking

FROM node:24-alpine

WORKDIR /app

# 의존성 설치
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# 프로덕션 서버 실행
ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
