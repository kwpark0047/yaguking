# 야구왕 개발 문서 패키지

작성일: 2026-10-23

이 패키지는 개발 착수용 문서 5종입니다. 실제 코드 작성, DB 변경, 운영 배포는 하지 않았습니다.

## 읽는 순서
1. 01_KBO_야구왕_통합_PRD.md
2. 02_KBO_데이터베이스_설계.md
3. 03_KBO_API_게임로직.md
4. 04_KBO_UI_UX_화면설계.md
5. 05_KBO_개발실행계획.md

## Windows에 저장

PowerShell에서 다운로드된 ZIP 경로가 기본 다운로드 폴더라면:

```powershell
New-Item -ItemType Directory -Force -Path 'C:\kbo261023' | Out-Null
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\KBO_YaguKing_Docs_20261023.zip" -DestinationPath 'C:\kbo261023' -Force
Get-ChildItem 'C:\kbo261023' -Recurse -Filter '*.md'
```

압축 내부에는 Markdown 문서 5개와 이 안내 파일이 바로 들어 있습니다. 위 명령으로 `C:\kbo261023` 바로 아래에 저장됩니다.

## V2 고도화 문서 (2026-10-23 추가)

- 06_야구왕_V2_고도화_통합기획.md — 즉시 플레이·가입 전환·반응형·차별화 (V1 01/04/05 일부 대체)
- 07_야구왕_V2_데이터_API_델타.md — 신규 테이블·판정 엔진·엔드포인트 (V1 02/03 델타)
- 08_야구왕_V2_UI_UX_화면설계.md — 경기·결과·게이트 화면, 반응형 와이어프레임 (V1 04 대체)
- 09_야구왕_V2_개발실행계획_P1.md — P1 골격·구현 순서·파일 목록·테스트 계획 (V1 05 대체)

읽는 순서: 01~05로 배경 파악 → 06(결정) → 07(데이터·API) → 08(화면) → 09(P1 실행). 충돌 시 06 §11 대조표가 우선한다.
- 10_문항확보_및_P2_착수계획.md — 문항 필요량·권리 구간별 전략, P2 기능별 선행 조건과 순서
- 16_야구왕_무료플랜_Firebase_전환.md — Firebase Spark 무료 플랜 전환(2026-10-26). 01~15의 플랫폼 부분을 대체하고, 문서별로 바뀐 점을 §4에 정리
