import { i18n } from '@lingui/core';
import { zh, en } from 'make-plural/plurals';

i18n.loadLocaleData('zh-CN', { plurals: zh });
i18n.loadLocaleData('en', { plurals: en });

export async function activateLocale(locale: string) {
  const { messages } = await import(`./locales/${locale}.po`);
  i18n.load(locale, messages);
  i18n.activate(locale);
}

export { i18n };
