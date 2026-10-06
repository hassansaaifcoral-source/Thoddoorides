/**
 * Minimal i18n layer for the public site.
 *
 * English is the source of truth and is read straight from the HTML, so every
 * key always has a value. `translations` below provides Chinese and Russian
 * for the most visible UI; any key without a translation falls back to the
 * English text already in the page. Drop more keys into the dictionaries to
 * extend coverage — no markup changes needed.
 *
 * Exposes window.i18n.setLang(lang) and remembers the choice in localStorage.
 */
(function () {
  'use strict';

  const translations = {
    zh: {
      'nav.explore': '探索', 'nav.availability': '可用车辆', 'nav.rates': '价格',
      'nav.reviews': '评价', 'nav.book': '预订', 'nav.faq': '常见问题',
      'nav.contact': '联系', 'nav.bookBtn': '预订电动车',
      'cta.book': '预订电动车', 'cta.avail': '查看可用车辆',
      'heroA.eyebrow': '电动自行车 · 索杜岛',
      'heroA.title': '轻松游览<em>索杜岛</em>。',
      'heroA.lead': '安静的电动自行车，带你探索海滩、西瓜农场和村庄。在港口附近取车，畅游一整天，再原地还车。无需驾照，毫无烦恼。',
      'heroA.fleetnow': '当前车队',
      'heroA.stat1': '辆电动车', 'heroA.stat2': '每天全包', 'heroA.stat3': '每次充电续航',
      'heroB.title': '索杜岛靠<em>两个轮子</em>。',
      'heroB.lead': '避开酷热和租车排队。骑上干净安静的电动车，自在穿梭于海滩、农场与住处之间。',
      'heroC.eyebrow': '电动自行车租赁 · 索杜岛',
      'heroC.title': '海岛，<em>从容自在</em>。',
      'heroC.lead': '四辆电动车，一座美丽小岛。按天租赁，以你的节奏探索索杜岛。',
      'explore.eyebrow': '为什么选自行车', 'explore.title': '骑车带你游遍索杜岛。',
      'avail.title': '现在有哪些车可用。', 'avail.btn': '预订可用车辆',
      'rates.eyebrow': '价格', 'rates.title': '一个简单价格，畅游一整天。',
      'rates.daily': '每日租金', 'rates.perday': '/ 天',
      'reviews.eyebrow': '骑行者与评价', 'reviews.title': '深受索杜岛旅客喜爱。',
      'book.eyebrow': '预订', 'book.title': '三种取车方式。',
      'form.title': '预订一辆车', 'form.submit': '提交预订', 'form.wasend': '通过 WhatsApp 发送',
      'form.name': '您的姓名', 'form.contact': 'WhatsApp / 电话',
      'faq.eyebrow': '须知', 'faq.title': '常见问题解答。',
      'contact.eyebrow': '联系我们', 'contact.title': '随时为您准备。',
      'footer.privacy': '隐私政策', 'footer.terms': '租赁条款',
    },
    ru: {
      'nav.explore': 'Обзор', 'nav.availability': 'Наличие', 'nav.rates': 'Цены',
      'nav.reviews': 'Отзывы', 'nav.book': 'Бронь', 'nav.faq': 'Вопросы',
      'nav.contact': 'Контакты', 'nav.bookBtn': 'Арендовать',
      'cta.book': 'Арендовать велосипед', 'cta.avail': 'Проверить наличие',
      'heroA.eyebrow': 'Электровелосипеды · остров Тодду',
      'heroA.title': 'Откройте <em>Тодду</em> легко.',
      'heroA.lead': 'Тихие электровелосипеды для прогулок по острову — пляжи, арбузные фермы и деревня. Заберите у гавани, катайтесь весь день, верните обратно. Без прав и хлопот.',
      'heroA.fleetnow': 'Парк сейчас',
      'heroA.stat1': 'электровелосипедов', 'heroA.stat2': 'в день, всё включено', 'heroA.stat3': 'запас хода на заряд',
      'heroB.title': 'Тодду — это <em>два колеса</em>.',
      'heroB.lead': 'Забудьте о жаре и очередях за прокатом авто. Перемещайтесь между пляжем, фермами и гостевым домом на чистом тихом электровелосипеде.',
      'heroC.eyebrow': 'Аренда электровелосипедов · Тодду',
      'heroC.title': 'Остров, <em>не спеша</em>.',
      'heroC.lead': 'Четыре электровелосипеда, один прекрасный остров. Арендуйте на день и исследуйте Тодду в своём темпе.',
      'explore.eyebrow': 'Почему велосипед', 'explore.title': 'Куда вас довезёт велосипед на Тодду.',
      'avail.title': 'Что свободно прямо сейчас.', 'avail.btn': 'Забронировать велосипед',
      'rates.eyebrow': 'Цены', 'rates.title': 'Одна простая цена. Весь день.',
      'rates.daily': 'Аренда на день', 'rates.perday': '/ день',
      'reviews.eyebrow': 'Отзывы гостей', 'reviews.title': 'Гости Тодду нас любят.',
      'book.eyebrow': 'Бронирование', 'book.title': 'Три способа взять велосипед.',
      'form.title': 'Забронировать велосипед', 'form.submit': 'Отправить запрос', 'form.wasend': 'Отправить в WhatsApp',
      'form.name': 'Ваше имя', 'form.contact': 'WhatsApp / телефон',
      'faq.eyebrow': 'Полезно знать', 'faq.title': 'Ответы на вопросы.',
      'contact.eyebrow': 'Связаться', 'contact.title': 'Мы готовы, когда вы.',
      'footer.privacy': 'Политика конфиденциальности', 'footer.terms': 'Условия аренды',
    },
  };

  const STORE_KEY = 'tr_lang';
  const en = {}; // captured English defaults, keyed by i18n key
  let current = 'en';

  function nodes() {
    return document.querySelectorAll('[data-i18n], [data-i18n-html]');
  }

  function captureEnglish() {
    nodes().forEach((el) => {
      const key = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-html');
      const html = el.hasAttribute('data-i18n-html');
      if (key && !(key in en)) en[key] = html ? el.innerHTML : el.textContent;
    });
  }

  function apply(lang) {
    const dict = translations[lang] || {};
    nodes().forEach((el) => {
      const html = el.hasAttribute('data-i18n-html');
      const key = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-html');
      if (!key) return;
      const value = dict[key] != null ? dict[key] : en[key];
      if (value == null) return;
      if (html) el.innerHTML = value;
      else el.textContent = value;
    });
  }

  function setLang(lang) {
    current = translations[lang] || lang === 'en' ? lang : 'en';
    document.documentElement.lang = current;
    apply(current);
    try {
      localStorage.setItem(STORE_KEY, current);
    } catch (e) { /* ignore */ }
    const label = document.querySelector('[data-lang-label]');
    if (label) label.textContent = current.toUpperCase();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: current } }));
  }

  function init() {
    captureEnglish();
    let saved = 'en';
    try {
      saved = localStorage.getItem(STORE_KEY) || 'en';
    } catch (e) { /* ignore */ }
    setLang(saved);
  }

  window.i18n = { setLang, get lang() { return current; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
