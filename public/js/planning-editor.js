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

  function renderInlineBold(rawText) {
    // Supports **bold**. Keeps output HTML-safe.
    var s = String(rawText || '');
    var parts = s.split('**');
    if (parts.length === 1) return escapeHtml(s);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var chunk = parts[i];
      if (i % 2 === 1) {
        // Only wrap non-empty bold chunks
        out += chunk ? '<strong>' + escapeHtml(chunk) + '</strong>' : '';
      } else {
        out += escapeHtml(chunk);
      }
    }
    return out;
  }

  function renderInlineWithLineBreaks(lines) {
    return lines
      .map(function (line) {
        return renderInlineBold(line);
      })
      .join('<br>');
  }

  function renderBlocks(raw) {
    var text = (raw || '').replace(/\r\n/g, '\n');
    var lines = text.split('\n');
    var out = [];

    function flushParagraph(buf) {
      if (!buf.length) return;
      out.push('<p>' + renderInlineWithLineBreaks(buf) + '</p>');
      buf.length = 0;
    }

    function flushList(items) {
      if (!items.length) return;
      out.push('<ul>' + items.map(function (i) {
        return '<li>' + renderInlineBold(i) + '</li>';
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
        out.push('<h' + level + '>' + renderInlineBold(content) + '</h' + level + '>');
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

  // Expose renderer for the view-only plan page.
  window.__planningRenderBlocks = renderBlocks;

  function getEditorBySelector(sel) {
    if (!sel) return null;
    try {
      return document.querySelector(sel);
    } catch (_e) {
      return null;
    }
  }

  function replaceSelection(textarea, insertText) {
    var start = textarea.selectionStart || 0;
    var end = textarea.selectionEnd || 0;
    var value = textarea.value || '';
    textarea.value = value.slice(0, start) + insertText + value.slice(end);
    var cursor = start + insertText.length;
    textarea.setSelectionRange(cursor, cursor);
    textarea.focus();
  }

  function prefixSelectedLines(textarea, prefix) {
    var start = textarea.selectionStart || 0;
    var end = textarea.selectionEnd || 0;
    var value = textarea.value || '';
    var before = value.slice(0, start);
    var selected = value.slice(start, end);
    var after = value.slice(end);

    // If nothing selected, prefix current line.
    if (!selected) {
      var lineStart = before.lastIndexOf('\n') + 1;
      textarea.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
      var cursor = start + prefix.length;
      textarea.setSelectionRange(cursor, cursor);
      textarea.focus();
      return;
    }

    var lines = selected.split('\n').map(function (l) {
      if (!l.trim()) return l;
      return prefix + l.replace(/^\s+/, '');
    });
    var next = lines.join('\n');
    textarea.value = before + next + after;
    textarea.setSelectionRange(start, start + next.length);
    textarea.focus();
  }

  function setupToolbar() {
    var tools = document.querySelectorAll('[data-format-action][data-format-target]');
    if (!tools.length) return;

    tools.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-format-action');
        var targetSel = btn.getAttribute('data-format-target');
        var ta = getEditorBySelector(targetSel);
        if (!ta) return;

        if (action === 'h1') {
          prefixSelectedLines(ta, '# ');
        } else if (action === 'h2') {
          prefixSelectedLines(ta, '## ');
        } else if (action === 'bullet') {
          prefixSelectedLines(ta, '- ');
        } else if (action === 'para') {
          replaceSelection(ta, '\n\n');
        } else if (action === 'br') {
          replaceSelection(ta, '\n');
        }

        // Trigger preview update
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  function syncPreview(key) {
    var editor = document.querySelector('[data-planning-editor=\"' + key + '\"]');
    var preview = document.querySelector('[data-planning-preview=\"' + key + '\"]');
    if (!editor || !preview) return;
    preview.innerHTML = renderBlocks(editor.value);
  }

  function renderViewBlocks() {
    var raws = document.querySelectorAll('[data-planning-raw]');
    if (!raws.length) return;
    raws.forEach(function (rawEl) {
      var key = rawEl.getAttribute('data-planning-raw');
      var preview = document.querySelector('[data-planning-preview=\"' + key + '\"]');
      if (!preview) return;
      var text = rawEl.textContent || '';
      preview.innerHTML = renderBlocks(text);
      rawEl.style.display = 'none';
    });
  }

  function setup() {
    setupToolbar();
    renderViewBlocks();
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

