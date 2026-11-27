/* Редактор страниц Топтыжки. Работает на вашем ПК, ничего не отправляет в интернет. */
(function () {
  'use strict';
  var SKIP = {SCRIPT:1, STYLE:1, SVG:1, PATH:1, IMG:1, VIDEO:1, SOURCE:1, BR:1, IFRAME:1, INPUT:1, BUTTON:1, TEXTAREA:1, SELECT:1};
  var blocks = [].slice.call(document.querySelectorAll('.rb:not(.rb-style)'));
  var dirHandle = null;
  var originals = new Map();

  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.replace(/\s+/g, '') !== '') return true;
    }
    return false;
  }

  // автосохранение: черновик в браузере устройства + запись в папку, если она уже выбрана
  var DRAFT = 'toptyzhka-draft:';
  var origHtml = new Map();
  var restored = 0;
  blocks.forEach(function (rb) {
    origHtml.set(rb, rb.innerHTML);
    try {
      var d = localStorage.getItem(DRAFT + rb.getAttribute('data-file'));
      if (d && d !== rb.innerHTML) { rb.innerHTML = d; restored++; }
    } catch (e) {}
  });
  // на подстраницах пути к картинкам идут через ../ : в редакторе показываем их из соседней папки assets
  [].forEach.call(document.querySelectorAll('.rb [src], .rb [poster]'), function (el) {
    ['src', 'poster'].forEach(function (at) {
      var v = el.getAttribute(at);
      if (v && v.indexOf('../assets/') === 0) { el.setAttribute('data-ed-' + at, v); el.setAttribute(at, v.slice(3)); }
    });
  });
  blocks.forEach(function (rb) {
    // запомнить исходное состояние раскрывающихся вопросов, раскрыть для правки
    [].forEach.call(rb.querySelectorAll('details'), function (d) {
      d.setAttribute('data-ed-open', d.hasAttribute('open') ? '1' : '0');
      d.setAttribute('open', '');
    });
    [].forEach.call(rb.querySelectorAll('*'), function (el) {
      if (SKIP[el.tagName.toUpperCase()] || el.closest('svg')) return;
      if (hasOwnText(el)) el.setAttribute('contenteditable', 'true');
      // тексты, важные для продвижения: заголовки, вступление и всё, где названо место
      if (hasOwnText(el) && (/^H[12]$/.test(el.tagName) || el.classList.contains('lead') || /Ставрополь|Кубанск/.test(el.textContent)) && !/^(A|B|SPAN|STRONG|SMALL|CITE|FIGCAPTION|LI)$/.test(el.tagName)) {
        el.setAttribute('data-ed-seo', '1');
        var lupa = document.createElement('span');
        lupa.className = 'ed-lupa';
        lupa.setAttribute('contenteditable', 'false');
        lupa.setAttribute('data-ed-ui', '1');
        lupa.setAttribute('title', 'Этот текст важен для поиска в Яндексе. Лучше не менять.');
        lupa.innerHTML = '🔍<span class="ed-tip">Этот текст лучше не менять: он совпадает с запросами родителей в Яндексе и Google (например, «частный детский сад в Ставрополе»). Если замените, редактор сначала спросит, уверены ли вы.</span>';
        el.appendChild(lupa);
      }
    });
    var name = document.createElement('div');
    name.className = 'ed-name';
    name.setAttribute('contenteditable', 'false');
    name.textContent = rb.getAttribute('data-label') + '  ·  ' + rb.getAttribute('data-file');
    rb.appendChild(name);
    var btn = document.createElement('button');
    btn.className = 'ed-save';
    btn.setAttribute('contenteditable', 'false');
    btn.textContent = '💾 Сохранить блок';
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); saveBlock(rb); });
    rb.appendChild(btn);
    var tmp = document.createElement('div'); tmp.innerHTML = origHtml.get(rb);
    originals.set(rb, serialize(tmp));
    rb.addEventListener('input', function () { markChanged(rb); autosave(rb); });
  });

  // при входе в такой текст на правку сразу показываем подсказку у лупы
  function lupaOf(t) { var el = t.closest && t.closest('[data-ed-seo]'); return el ? el.querySelector(':scope > .ed-lupa') : null; }
  document.addEventListener('focusin', function (e) {
    [].forEach.call(document.querySelectorAll('.ed-lupa.auto'), function (x) { x.classList.remove('open', 'auto'); });
    var l = lupaOf(e.target);
    if (l && !e.target.closest('.ed-lupa')) { l.classList.add('open', 'auto'); }
  });
  document.addEventListener('focusout', function (e) {
    var l = lupaOf(e.target);
    if (l && l.classList.contains('auto')) setTimeout(function () {
      var ae = document.activeElement;
      if (!(ae && ae.closest && ae.closest('[data-ed-seo]') === e.target.closest('[data-ed-seo]'))) l.classList.remove('open', 'auto');
    }, 150);
  });
  // защита текстов для поиска: при первой правке спрашиваем
  document.addEventListener('beforeinput', function (e) {
    var el = e.target.closest && e.target.closest('[data-ed-seo]');
    if (!el || el.hasAttribute('data-ed-ok')) return;
    e.preventDefault();
    if (confirm('Этот текст нужен для продвижения сайта: по словам в нём (например «частный детский сад», «Ставрополь», «ясли») вас находят в Яндексе и Google.\n\nЕсли его изменить или убрать эти слова, сайт может хуже находиться.\n\nУверены, что хотите заменить? После «ОК» нажмите нужную клавишу ещё раз.')) {
      el.setAttribute('data-ed-ok', '1');
    }
  }, true);
  // ссылки и кнопки не уводят со страницы, пока правим
  var PAGES = {
    'glavnaya': 'Главная', 'yasli-stavropol': 'Ясли', 'podgotovka-k-shkole': 'Подготовка к школе',
    'sad-v-subbotu': 'Сад в субботу', 'tseny': 'Цены', 'voprosy': 'Вопросы и ответы',
    'politika': 'Политика конфиденциальности', 'soglasie': 'Согласие на обработку данных'
  };
  var chip = document.createElement('div');
  chip.className = 'ed-chip';
  chip.setAttribute('contenteditable', 'false');
  chip.style.display = 'none';
  document.body.appendChild(chip);
  var chipTimer = null;
  function hideChip() { chip.style.display = 'none'; }
  function showChip(a, html, actions) {
    chip.innerHTML = html;
    actions.forEach(function (ac) {
      var b = document.createElement('button');
      b.textContent = ac.label;
      b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); hideChip(); ac.run(); });
      chip.appendChild(b);
    });
    var x = document.createElement('button');
    x.textContent = '✕'; x.className = 'x';
    x.addEventListener('click', function (ev) { ev.stopPropagation(); hideChip(); });
    chip.appendChild(x);
    chip.style.display = 'flex';
    var r = a.getBoundingClientRect();
    var top = r.bottom + 6;
    if (top + 70 > window.innerHeight - 60) top = Math.max(8, r.top - 66);
    chip.style.top = top + 'px';
    chip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - chip.offsetWidth - 8)) + 'px';
    clearTimeout(chipTimer);
    chipTimer = setTimeout(hideChip, 12000);
  }
  function goPage(url) {
    var list = changedBlocks();
    if (!list.length) { location.href = url; return; }
    if (confirm('Есть несохранённые изменения (' + list.length + '). Сохранить их и перейти?\n\nОК: сохранить и перейти. Отмена: остаться здесь.')) {
      var p = Promise.resolve();
      list.forEach(function (rb) { p = p.then(function () { return saveBlock(rb); }); });
      p.then(function () { window.onbeforeunload = null; location.href = url; });
    }
  }
  function linkInfo(href) {
    if (!href) return null;
    if (/^(tel:|mailto:)/.test(href)) return {kind: 'other', text: 'Ссылка: ' + href.replace(/^(tel:|mailto:)/, '')};
    if (/^https?:/.test(href)) return {kind: 'ext', url: href, text: 'Внешняя ссылка: ' + href.replace(/^https?:\/\//, '').slice(0, 50)};
    if (href === '#x') return null;
    var path = href, hash = '';
    var i = href.indexOf('#');
    if (i >= 0) { path = href.slice(0, i); hash = href.slice(i); }
    path = path.replace(/^(\.\.\/)+/, '').replace(/^\//, '').replace(/\/$/, '');
    if (path === '' && (href.charAt(0) === '#' )) return {kind: 'anchor', hash: hash};
    var slug = path || 'glavnaya';
    if (!PAGES[slug]) return {kind: 'other', text: 'Ссылка: ' + href};
    var here = document.body.getAttribute('data-page');
    if (slug === here && hash) return {kind: 'anchor', hash: hash};
    return {kind: 'page', slug: slug, hash: hash, title: PAGES[slug]};
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.ed-chip')) return;
    var lp = e.target.closest && e.target.closest('.ed-lupa');
    if (lp) { e.preventDefault(); lp.classList.toggle('open'); return; }
    var im = e.target.closest && e.target.closest('img');
    if (im && im.closest('.rb') && !im.closest('.zb')) {
      e.preventDefault();
      lastBlock = im.closest('.rb');
      showChip(im, '<span>Фото: ' + (im.getAttribute('alt') || 'без подписи') + '</span>', TGC ? [
        {label: '✎ Хочу другое фото', run: function () { photoWish(im); }}
      ] : []);
      return;
    }
    var a = e.target.closest && e.target.closest('a');
    var s = e.target.closest && e.target.closest('summary');
    if (s) e.preventDefault();
    if (!(a && a.closest('.rb') && !a.closest('.ed-save'))) { hideChip(); return; }
    e.preventDefault();
    var info = linkInfo(a.getAttribute('href'));
    if (!info) return;
    if (e.ctrlKey || e.metaKey) {
      if (info.kind === 'page') goPage(info.slug + '.html' + info.hash);
      else if (info.kind === 'ext') window.open(info.url, '_blank');
      return;
    }
    if (info.kind === 'page') {
      showChip(a, '<span>Ведёт на страницу «' + info.title + '»</span>', [
        {label: '↗ Открыть эту страницу для правки', run: function () { goPage(info.slug + '.html' + info.hash); }}
      ]);
    } else if (info.kind === 'anchor') {
      showChip(a, '<span>Ведёт к разделу на этой странице</span>', [
        {label: '↓ Показать раздел', run: function () {
          var t = info.hash.length > 1 ? document.getElementById(info.hash.slice(1)) : document.body;
          if (t) t.scrollIntoView({behavior: 'smooth', block: 'start'}); else flash('Раздела с таким якорем на странице нет (форма находится в кабинете площадки)');
        }}
      ]);
    } else if (info.kind === 'ext') {
      showChip(a, '<span>' + info.text + '</span>', [
        {label: '↗ Открыть в новой вкладке', run: function () { window.open(info.url, '_blank'); }}
      ]);
    } else {
      showChip(a, '<span>' + info.text + '</span>', []);
    }
  }, true);
  document.addEventListener('keydown', function (e) {
    var s = e.target.closest && e.target.closest('summary');
    if (s && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      if (e.key === ' ') document.execCommand('insertText', false, ' ');
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'ы')) {
      e.preventDefault();
      var rb = document.activeElement && document.activeElement.closest && document.activeElement.closest('.rb');
      if (rb) saveBlock(rb); else saveAll();
    }
  }, true);
  // вставка только простого текста, без чужого оформления
  document.addEventListener('paste', function (e) {
    if (!(e.target.closest && e.target.closest('[contenteditable="true"]'))) return;
    e.preventDefault();
    var tx = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, tx);
  }, true);

  function serialize(rb) {
    var c = rb.cloneNode(true);
    [].forEach.call(c.querySelectorAll('.ed-save,.ed-name,.ed-lupa'), function (x) { x.remove(); });
    [].forEach.call(c.querySelectorAll('[contenteditable]'), function (x) { x.removeAttribute('contenteditable'); });
    [].forEach.call(c.querySelectorAll('[data-ed-seo],[data-ed-ok]'), function (x) { x.removeAttribute('data-ed-seo'); x.removeAttribute('data-ed-ok'); });
    [].forEach.call(c.querySelectorAll('[data-ed-src],[data-ed-poster]'), function (x) {
      ['src', 'poster'].forEach(function (at) {
        var o = x.getAttribute('data-ed-' + at);
        if (o) { x.setAttribute(at, o); x.removeAttribute('data-ed-' + at); }
      });
    });
    [].forEach.call(c.querySelectorAll('[style=""],[class=""]'), function (x) {
      if (x.getAttribute('style') === '') x.removeAttribute('style');
      if (x.getAttribute('class') === '') x.removeAttribute('class');
    });
    [].forEach.call(c.querySelectorAll('details'), function (d) {
      if (d.getAttribute('data-ed-open') === '0') d.removeAttribute('open');
      d.removeAttribute('data-ed-open');
    });
    return c.innerHTML;
  }

  var autoTimers = new Map();
  function autosave(rb) {
    clearTimeout(autoTimers.get(rb));
    autoTimers.set(rb, setTimeout(function () {
      var rel = rb.getAttribute('data-file'), text = serialize(rb);
      try {
        if (text === originals.get(rb)) localStorage.removeItem(DRAFT + rel);
        else localStorage.setItem(DRAFT + rel, text);
      } catch (e) {}
      var hhmm = new Date().toTimeString().slice(0, 5);
      if (dirHandle && text !== originals.get(rb)) {
        writeFile(dirHandle, rel, text).then(function () { originals.set(rb, text); rb.classList.remove('changed'); autoMsg('✓ Сохранено автоматически в файл ' + hhmm); })
          .catch(function () { autoMsg('✓ Черновик сохранён на этом устройстве ' + hhmm); });
      } else {
        autoMsg('✓ Черновик сохранён на этом устройстве ' + hhmm);
      }
      scheduleSend();
    }, 600));
  }
  function autoMsg(m) { var s = document.getElementById('ed-status'); if (s) { s.textContent = m; setTimeout(updateStatus, 3500); } }
  function markChanged(rb) {
    rb.classList.toggle('changed', serialize(rb) !== originals.get(rb));
    updateStatus();
  }
  function changedBlocks() { return blocks.filter(function (b) { return b.classList.contains('changed'); }); }
  function updateStatus() {
    var n = changedBlocks().length;
    document.getElementById('ed-status').textContent = n ? ('Изменено блоков: ' + n + ' (жёлтая рамка)') : 'Изменений нет';
  }

  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type: 'text/html;charset=utf-8'}));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function getDir() {
    if (dirHandle) return Promise.resolve(dirHandle);
    if (!window.showDirectoryPicker) return Promise.reject(new Error('no-api'));
    alert('Выберите папку «sait-redaktor» (ту, где лежит эта страница). Потом сохранение пойдёт в один клик.');
    return window.showDirectoryPicker({mode: 'readwrite'}).then(function (h) { dirHandle = h; return h; });
  }

  function writeFile(root, rel, text) {
    var parts = ['blocks'].concat(rel.split('/'));
    var fname = parts.pop();
    var p = Promise.resolve(root);
    parts.forEach(function (seg) { p = p.then(function (d) { return d.getDirectoryHandle(seg, {create: true}); }); });
    return p.then(function (d) { return d.getFileHandle(fname, {create: true}); })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(text).then(function () { return w.close(); }); });
  }

  function saveBlock(rb) {
    var rel = rb.getAttribute('data-file');
    var text = serialize(rb);
    return getDir().then(function (root) { return writeFile(root, rel, text); }).then(function () {
      originals.set(rb, text);
      rb.classList.remove('changed');
      try { localStorage.removeItem(DRAFT + rel); } catch (e) {}
      updateStatus();
      flash('Сохранено: blocks/' + rel);
    }).catch(function (err) {
      download(rel.split('/').pop(), text);
      flash('Скачан файл ' + rel.split('/').pop() + ' — положите его в blocks/' + rel.split('/')[0] + '/ с заменой');
    });
  }
  function saveAll() {
    var list = changedBlocks();
    if (!list.length) { flash('Нечего сохранять'); return; }
    var p = Promise.resolve();
    list.forEach(function (rb) { p = p.then(function () { return saveBlock(rb); }); });
  }
  function exportChanges() {
    var list = changedBlocks();
    if (!list.length) { flash('Вы пока ничего не изменили'); return; }
    var data = {format: 'toptyzhka-pravki-1', page: document.body.getAttribute('data-page'),
                revision: document.body.getAttribute('data-revision'), date: new Date().toISOString(),
                blocks: list.map(function (rb) { return {file: rb.getAttribute('data-file'), id: rb.getAttribute('data-id'), html: serialize(rb)}; })};
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], {type: 'application/json'}));
    a.download = 'pravki-' + data.page + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    flash('Файл с правками скачан. Отправьте его Александру в мессенджер.');
  }
  var TGC = window.TG_CONFIG && window.TG_CONFIG.token ? window.TG_CONFIG : null;
  var sentMap = new Map();
  var sendTimer = null;
  function scheduleSend() {
    if (!TGC) return;
    clearTimeout(sendTimer);
    sendTimer = setTimeout(sendNow, 12000);
  }
  function sendNow(manual) {
    if (!TGC) return;
    var list = blocks.filter(function (rb) { return serialize(rb) !== (sentMap.has(rb) ? sentMap.get(rb) : originals.get(rb)); });
    if (!list.length) { if (manual) flash('Всё уже отправлено'); return; }
    var data = {format: 'toptyzhka-pravki-1', page: document.body.getAttribute('data-page'),
                revision: document.body.getAttribute('data-revision'), date: new Date().toISOString(),
                blocks: list.map(function (rb) { return {file: rb.getAttribute('data-file'), id: rb.getAttribute('data-id'), html: serialize(rb)}; })};
    var snap = list.map(function (rb) { return [rb, data.blocks[list.indexOf(rb)].html]; });
    var fd = new FormData();
    fd.append('chat_id', TGC.chat);
    var seoN = 0; list.forEach(function (rb) { seoN += rb.querySelectorAll('[data-ed-ok]').length; });
    fd.append('caption', 'Правки Татьяны: страница «' + document.title.replace('Редактор: ', '') + '», блоков: ' + list.length +
      (seoN ? '. ВНИМАНИЕ: изменены тексты, важные для продвижения (' + seoN + ' шт.), Татьяна подтвердила замену' : ''));
    fd.append('document', new Blob([JSON.stringify(data, null, 1)], {type: 'application/json'}),
              'pravki-' + data.page + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json');
    var st = document.getElementById('ed-status');
    st.textContent = 'Отправляю правки…';
    return fetch('https://api.telegram.org/bot' + TGC.token + '/sendDocument', {method: 'POST', body: fd, keepalive: false})
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error('tg');
        snap.forEach(function (x) { sentMap.set(x[0], x[1]); });
        st.textContent = '✓ Правки отправлены ' + new Date().toTimeString().slice(0, 5) + '. Можно закрывать страницу.';
      })
      .catch(function () {
        st.textContent = 'Не удалось отправить (нет интернета?). Правки сохранены на этом телефоне, отправлю позже.';
        sendTimer = setTimeout(sendNow, 30000);
      });
  }
  var lastBlock = null;
  document.addEventListener('focusin', function (e) { var r = e.target.closest && e.target.closest('.rb'); if (r) lastBlock = r; });
  document.addEventListener('click', function (e) { var r = e.target.closest && e.target.closest('.rb'); if (r) lastBlock = r; }, true);
  function sendWish() {
    if (!TGC) { alert('Пожелание можно отправить из онлайн-версии редактора.'); return; }
    var where = lastBlock ? lastBlock.getAttribute('data-label') : 'без привязки к месту';
    var t = prompt('Что вы хотели бы изменить? Например: цвет кнопки, другое фото, поменять местами блоки, добавить раздел.\n\nМесто: ' + where);
    if (!t || !t.trim()) return;
    var st = document.getElementById('ed-status');
    st.textContent = 'Отправляю пожелание…';
    fetch('https://api.telegram.org/bot' + TGC.token + '/sendMessage', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({chat_id: TGC.chat, text: 'Пожелание Татьяны. Страница: ' + document.title.replace('Редактор: ', '') + '. Место: ' + where + '. Текст: ' + t.trim()})})
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error('tg'); st.textContent = '✓ Пожелание отправлено. Спасибо!'; })
      .catch(function () { st.textContent = 'Не удалось отправить пожелание. Попробуйте ещё раз.'; });
  }
  function photoWish(im) {
    var where = (lastBlock && lastBlock.getAttribute('data-label')) || '';
    var t = prompt('Какое фото вы хотели бы вместо этого? Опишите словами: что на нём должно быть, или напишите, что не нравится (тёмное, не видно лиц, повторяется и т.п.).');
    if (!t || !t.trim()) return;
    var st = document.getElementById('ed-status');
    st.textContent = 'Отправляю пожелание про фото…';
    var cap = ('Фото-пожелание Татьяны. Страница: ' + document.title.replace('Редактор: ', '') + '. Раздел: ' + where +
               '. Фото: ' + (im.getAttribute('alt') || im.getAttribute('src')) + ' (' + (im.getAttribute('src') || '').split('/').pop() + '). Пожелание: ' + t.trim()).slice(0, 1000);
    function post(method, body) {
      return fetch('https://api.telegram.org/bot' + TGC.token + '/' + method, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}).then(function (r) { return r.json(); });
    }
    var p = /^https?:/.test(im.src) ? post('sendPhoto', {chat_id: TGC.chat, photo: im.src, caption: cap}) : Promise.resolve({ok: false});
    p.then(function (j) { return j.ok ? j : post('sendMessage', {chat_id: TGC.chat, text: cap}); })
      .then(function (j) { if (!j.ok) throw new Error('tg'); st.textContent = '✓ Пожелание про фото отправлено. Спасибо!'; })
      .catch(function () { st.textContent = 'Не удалось отправить. Попробуйте ещё раз.'; });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sendNow(); });
  if (TGC) document.body.classList.add('online');
  function flash(msg) {
    var s = document.getElementById('ed-status');
    s.textContent = msg;
    setTimeout(updateStatus, 4000);
  }

  var bar = document.createElement('div');
  bar.className = 'ed-bar';
  bar.setAttribute('contenteditable', 'false');
  bar.innerHTML =
    '<button data-c="bold"><b>Ж</b></button><button data-c="italic"><i>К</i></button>' +
    '<button data-c="undo">↶ Отменить</button><button data-c="redo">↷ Вернуть</button>' +
    '<span class="ed-sp"></span><span id="ed-status">Изменений нет</span><span class="ed-sp"></span>' +
    '<button data-c="saveall" class="main">💾 Сохранить все изменённые</button>' +
    '<button data-c="send" class="main">📤 Отправить правки сейчас</button>' +
    '<button data-c="wish">✎ Написать пожелание</button>' +
    '<button data-c="export" class="main">⬇ Скачать правки файлом</button>' +
    '<button data-c="index">← Все страницы</button>';
  document.body.appendChild(bar);
  bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var c = b.getAttribute('data-c');
    if (c === 'bold' || c === 'italic' || c === 'undo' || c === 'redo') document.execCommand(c);
    else if (c === 'saveall') saveAll();
    else if (c === 'export') exportChanges();
    else if (c === 'send') sendNow(true);
    else if (c === 'wish') sendWish();
    else if (c === 'index') location.href = 'index.html';
    blocks.forEach(function (rb) { markChanged(rb); if (rb.classList.contains('changed')) autosave(rb); });
  });
  blocks.forEach(markChanged);
  if (restored) setTimeout(function () { flash('Восстановлены ваши правки, которые не были сохранены в файл (блоков: ' + restored + ')'); }, 400);
  window.onbeforeunload = function (e) {
    if (changedBlocks().length) { e.preventDefault(); e.returnValue = ''; return ''; }
  };
})();
