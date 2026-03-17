(function () {
  'use strict';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderBlocks(raw) {
    var text = (raw || '').replace(/\r\n/g, '\n');
    var lines = text.split('\n');
    var out = [];

    function flushParagraph(buf) {
      if (!buf.length) return;
      var html = escapeHtml(buf.join('\n')).replace(/\n/g, '<br>');
      out.push('<p>' + html + '</p>');
      buf.length = 0;
    }

    function flushList(items) {
      if (!items.length) return;
      out.push('<ul>' + items.map(function (i) {
        return '<li>' + escapeHtml(i) + '</li>';
      }).join('') + '</ul>');
      items.length = 0;
    }

    var paragraph = [];
    var listItems = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      // blank line => new block
      if (!trimmed) {
        flushList(listItems);
        flushParagraph(paragraph);
        continue;
      }

      // headings (#, ##, ###)
      var headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (headingMatch) {
        flushList(listItems);
        flushParagraph(paragraph);
        var level = headingMatch[1].length;
        var content = headingMatch[2] || '';
        out.push('<h' + level + '>' + escapeHtml(content) + '</h' + level + '>');
        continue;
      }

      // bullet list items (- or *)
      var bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        flushParagraph(paragraph);
        listItems.push(bulletMatch[1] || '');
        continue;
      }

      // normal paragraph line
      flushList(listItems);
      paragraph.push(line);
    }

    flushList(listItems);
    flushParagraph(paragraph);
    return out.join('');
  }

  function syncPreview(key) {
    var editor = document.querySelector('[data-planning-editor=\"' + key + '\"]');
    var preview = document.querySelector('[data-planning-preview=\"' + key + '\"]');
    if (!editor || !preview) return;
    preview.innerHTML = renderBlocks(editor.value);
  }

  function setup() {
    ['whatToBuy', 'details'].forEach(function (key) {
      var editor = document.querySelector('[data-planning-editor=\"' + key + '\"]');
      if (!editor) return;
      syncPreview(key);
      editor.addEventListener('input', function () {
        syncPreview(key);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

