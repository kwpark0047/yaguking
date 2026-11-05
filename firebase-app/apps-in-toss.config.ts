import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 앱인토스 미니앱판 설정(docs/toss-miniapp.md) — `npm run toss:build`가 dist-toss를 yaguking.ait로 묶는다.
 * appName은 앱인토스 콘솔에 등록한 이름과 **정확히 같아야** 올라간다. 콘솔에서 다른 이름을 받으면 여기와
 * src/toss/share.ts의 APP_NAME을 함께 고친다(등록 뒤에는 바꿀 수 없다).
 */
export default defineConfig({
  appName: 'yaguking',
  brand: { primaryColor: '#7A5900' }, // 나이트 골드 밝은 판의 --accent
  permissions: [{ name: 'clipboard', access: 'write' }], // 대결 링크 복사
  navigationBar: { withBackButton: true, withHomeButton: true, withTitle: true, theme: 'light' },
  webView: {},
  webBundleDir: 'dist-toss',
});
