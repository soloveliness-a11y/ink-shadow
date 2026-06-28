import { defineConfig } from '@lingui/cli';

export default defineConfig({
  sourceLocale: 'zh-CN',
  locales: ['zh-CN', 'en'],
  catalogs: [
    {
      path: 'src/locales/{locale}',
      include: ['src'],
    },
  ],
  format: 'po',
});
