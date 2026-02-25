# crbuses.com 정적 사이트 생성 프로젝트

## 프로젝트 개요
도메인 crbuses.com에 Google AdSense 승인용 정보성 블로그 사이트를 만들어줘.
정적 HTML 사이트로, GitHub Pages 또는 Cloudflare Pages로 배포할 거야.
주제는 "버스" 하나로 통일. 카테고리도 1개만.

## 기술 스택
- 순수 HTML/CSS/JS 정적 사이트 (프레임워크 없음)
- 빌드 도구 불필요, public/ 폴더 그대로 배포
- SEO 최적화 필수 (sitemap.xml, robots.txt, 구조화 데이터, Open Graph)

## 사이트 구조

```
public/
├── index.html              # 메인 페이지 (글 목록)
├── about.html              # 소개 페이지 (애드센스 필수)
├── privacy.html            # 개인정보처리방침 (애드센스 필수)
├── contact.html            # 연락처 (애드센스 필수)
├── sitemap.xml             # 구글 SEO용
├── robots.txt              # 크롤러 안내
├── css/
│   └── style.css           # 전체 스타일
└── posts/
    ├── post-01.html ~ post-20.html   # 글 20개
```

## 디자인 요구사항
- 깔끔한 블로그 스타일, 모바일 반응형
- 최대 너비 768px 본문 영역
- 폰트: system-ui 기반 (Pretendard 웹폰트 CDN 사용)
- 색상: 파란 계열 포인트 (#2563eb)
- 헤더: 사이트명 "버스 가이드" + 네비게이션 (홈, 소개, 연락처)
- 푸터: 저작권 표시 + 개인정보처리방침 링크

## 카테고리: 버스 (1개만)

글 20개 전부 "버스" 관련 정보성 콘텐츠로 통일.
검색 수요가 있는 실용 정보 중심으로 작성.

## 글 20개 상세 사양

각 글은 최소 1,500자 이상 한국어 본문이어야 하며, 정보성 콘텐츠여야 함.
발행일은 오늘 날짜 기준으로 2시간씩 차이나게 설정.

### 글 목록 (2시간 간격 발행)

| # | 제목 |
|---|------|
| 1 | 시외버스 예매 방법 총정리 – 온라인 예매부터 현장 발권까지 |
| 2 | 고속버스와 시외버스의 차이점 완벽 비교 |
| 3 | 전국 고속버스 터미널 위치 및 이용 안내 |
| 4 | 버스 종류별 특징 – 일반, 우등, 프리미엄 좌석 차이 |
| 5 | 시내버스 환승 할인 제도 이용 방법과 조건 |
| 6 | 광역버스와 직행버스의 차이점 및 노선 특징 |
| 7 | 공항버스 이용 가이드 – 인천공항 리무진 노선과 요금 |
| 8 | 심야버스 운행 시간과 노선 확인하는 방법 |
| 9 | 버스 정기권 구매 방법과 절약 효과 비교 |
| 10 | 교통카드 종류별 비교 – 티머니, 캐시비, 레일플러스 |
| 11 | 어린이 및 청소년 버스 요금 할인 제도 안내 |
| 12 | 경로우대 무임승차 제도 – 나이 조건과 적용 범위 |
| 13 | 고속버스 모바일 앱 활용법 – 예매, 변경, 환불 방법 |
| 14 | 전세버스 대절 방법과 비용 산정 가이드 |
| 15 | 마을버스와 시내버스의 차이점 및 요금 체계 |
| 16 | 버스 분실물 찾는 방법 – 신고 절차와 조회 사이트 |
| 17 | 장애인 저상버스 이용 안내와 노선 확인 방법 |
| 18 | 통학버스 안전 규정과 학부모가 알아야 할 사항 |
| 19 | 전기버스와 수소버스 – 친환경 버스의 현재와 전망 |
| 20 | 시외버스 환불 규정과 수수료 총정리 |

### 각 글 작성 규칙
- 제목은 H1 태그, 소제목은 H2/H3 사용
- 본문 최소 1,500자 (한국어 기준)
- 자연스럽고 유익한 정보 전달 톤
- 각 글마다 고유한 meta description (150자 내외)
- 발행일시: 첫 글부터 2시간 간격 (08:00, 10:00, 12:00, ... 순서)
- 구조화 데이터 (Article schema JSON-LD) 각 페이지에 포함
- canonical URL 설정

## SEO 최적화 요구사항

### 각 HTML 페이지 head에 포함할 것
```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{글 제목} | 버스 가이드</title>
<meta name="description" content="{메타 설명}">
<link rel="canonical" href="https://crbuses.com/posts/{파일명}.html">
<meta property="og:type" content="article">
<meta property="og:title" content="{글 제목}">
<meta property="og:description" content="{메타 설명}">
<meta property="og:url" content="https://crbuses.com/posts/{파일명}.html">
<meta property="og:site_name" content="버스 가이드">
```

### JSON-LD 구조화 데이터 (각 글 페이지)
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{제목}",
  "description": "{메타 설명}",
  "datePublished": "{발행일시 ISO 8601}",
  "dateModified": "{발행일시 ISO 8601}",
  "author": {
    "@type": "Person",
    "name": "버스 가이드"
  },
  "publisher": {
    "@type": "Organization",
    "name": "버스 가이드"
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "{canonical URL}"
  }
}
```

### sitemap.xml
- 모든 페이지 URL 포함 (index, about, privacy, contact, 글 20개)
- lastmod는 각 글 발행일
- changefreq: weekly, priority: 글은 0.8, 기타 0.5

### robots.txt
```
User-agent: *
Allow: /
Sitemap: https://crbuses.com/sitemap.xml
```

## 애드센스 필수 페이지 내용

### about.html (소개)
- 사이트명: 버스 가이드
- 설명: 대한민국 버스 이용에 필요한 모든 정보를 알기 쉽게 전달하는 블로그. 시외버스, 고속버스, 시내버스, 공항버스 등 다양한 버스 정보를 다룹니다.
- 운영 목적, 콘텐츠 방향 등 300자 이상

### privacy.html (개인정보처리방침)
- Google AdSense 쿠키 사용 고지
- Google Analytics 사용 고지
- 수집하는 개인정보 항목
- 이용 목적, 보유 기간
- 한국어로 작성, 법적 형식에 맞게

### contact.html (연락처)
- 이메일 연락처 표시 (예: contact@crbuses.com)
- 간단한 문의 안내 문구

## 배포 계획
1. 코드 완성 후 GitHub 리포지토리에 push
2. Cloudflare Pages에서 해당 리포 연결
3. 빌드 설정: 빌드 명령 없음, 출력 디렉토리 = public
4. 커스텀 도메인: crbuses.com 연결

## 중요 참고사항
- 프레임워크 없이 순수 HTML로 만들 것
- 모든 내부 링크는 상대경로 사용
- 이미지 없이 텍스트 중심으로 (로딩 속도 최적화)
- 각 글 하단에 "관련 글 추천" 섹션 (다른 버스 관련 글 3개 링크)
- HTML 시맨틱 태그 사용 (header, nav, main, article, footer)
- 페이지 로딩 속도 최적화 (CSS 미니파이 불필요, 깔끔하게만)
- 카테고리는 "버스" 하나만. 절대 여러 카테고리로 나누지 말 것
