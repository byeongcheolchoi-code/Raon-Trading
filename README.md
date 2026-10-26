# 레버리지 매매일지

매수단가·매도단가·비중·배율(0~100배)·교차/격리 마진을 기록하고 승률·손익비·계좌손익을 추적하는 트레이딩 저널입니다. Supabase를 백엔드로 쓰는 설치 가능한 PWA(Progressive Web App)입니다.

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 프로젝트를 만듭니다 (이미 있다면 생략).
2. 프로젝트의 **SQL Editor**에서 `supabase/schema.sql` 파일 전체를 붙여넣고 실행합니다. `trades`, `settings` 테이블과 Row Level Security 정책이 생성됩니다.
3. **Project Settings → API**에서 `Project URL`과 `anon public` 키를 복사합니다. (`service_role` 키는 절대 프론트엔드에 넣지 마세요.)
4. **Authentication → Providers**에서 Email 로그인이 켜져 있는지 확인합니다 (기본값은 켜져 있음).
   - 테스트를 빨리 하려면 **Authentication → Settings**에서 "Confirm email"을 잠시 꺼도 됩니다 (가입 즉시 로그인).

## 2. 로컬 실행

```bash
cp .env.example .env
# .env 파일을 열어 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 채워넣기

npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 이메일/비밀번호로 회원가입 후 바로 사용할 수 있습니다.

## 3. Vercel 배포

1. 이 저장소를 GitHub에 푸시합니다.
2. [vercel.com](https://vercel.com) → **Add New → Project** → 이 GitHub 저장소를 선택(Import)합니다.
3. Framework Preset은 자동으로 **Vite**로 인식됩니다. Build Command/Output Directory는 기본값(`npm run build` / `dist`) 그대로 두면 됩니다.
4. **Environment Variables**에 아래 두 개를 추가합니다.
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploy**를 누르면 몇 분 안에 `https://프로젝트명.vercel.app` 주소로 배포됩니다.

## 4. 데스크톱/모바일에 설치 (진짜 PWA 설치)

Claude 아티팩트와 달리 이 버전은 실제 서비스 워커(Service Worker)가 동작하는 완전한 웹앱이라, 브라우저가 **네이티브 설치 프롬프트**를 띄워줍니다.

- **Chrome / Edge (Windows, Mac)**: 배포된 주소를 열면 주소창 오른쪽에 설치 아이콘이 나타나거나, 앱 안의 "⬇️ 앱 설치" 버튼이 활성화됩니다. 클릭하면 별도 창으로 설치됩니다.
- **Android (Chrome)**: 자동으로 "홈 화면에 추가" 배너가 뜨거나, 메뉴에서 선택할 수 있습니다.
- **iOS (Safari)**: Apple 정책상 자동 설치 프롬프트가 없습니다. 공유 버튼 → "홈 화면에 추가"를 수동으로 선택해주세요.
- 설치 후에는 오프라인에서도 마지막으로 불러온 화면이 열리고(서비스 워커 캐시), 네트워크가 연결되면 거래 저장이 다시 동작합니다.

## 구조

```
src/
  main.js            앱 전체 로직 (인증, 렌더링, Supabase CRUD)
  supabaseClient.js   Supabase 클라이언트 초기화
  style.css           디자인 토큰 + 컴포넌트 스타일
  lib/calc.js          손익/승률/손익비 계산 로직
supabase/schema.sql    DB 스키마 + RLS 정책
vite.config.js         PWA(매니페스트 + 서비스 워커) 설정
```

## 보안 메모

- `anon` 키는 공개되어도 안전하도록 설계된 키입니다. 실제 데이터 보호는 Supabase의 Row Level Security(RLS) 정책이 담당하며, 각 사용자는 자신의 `user_id`가 일치하는 행만 읽고 쓸 수 있습니다.
- `service_role` 키는 RLS를 완전히 우회하므로 절대 프론트엔드 코드나 `.env`(클라이언트에 번들되는 `VITE_` 접두사)에 넣지 마세요.
