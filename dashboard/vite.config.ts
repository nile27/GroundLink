import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // --mode profile: 프로덕션 빌드 + React Profiler 사용 가능 (5단계 측정용, npm run build:profile)
  // react-dom 19.3.1 package.json exports 의 "./profiling" (profiling.js → cjs/react-dom-profiling.profiling.js)
  // 가 createRoot 를 내보내므로 react-dom/client 를 그쪽으로 바꾼다
  const profile = mode === 'profile'
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: profile ? [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] : [],
    },
    build: profile
      ? {
          outDir: 'dist-profile',
          // Profiler 에 컴포넌트 이름이 보이도록 압축하지 않음
          minify: false,
        }
      : {},
  }
})
