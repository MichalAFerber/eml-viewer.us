(function(){
  "use strict";
  var doc = document, root = doc.documentElement, body = doc.body;
  function id(x){ return doc.getElementById(x); }
  function el(tag, cls){ var e = doc.createElement(tag); if (cls) e.className = cls; return e; }

  var empty     = id("empty");
  var dataView  = id("dataView");
  var codeView  = id("codeView");
  var codeInner = id("codeInner");
  var gutter    = id("gutter");
  var fileInput = id("fileInput");
  var overlay   = id("dropOverlay");
  var toastEl   = id("toast");
  var docTitle  = id("docTitle");
  var hoverZone = id("hoverZone");
  var bgPicker  = id("bgPicker");
  var themeColor= id("themeColor");
  var btnView   = id("btnView");
  var btnFormat = id("btnFormat");
  var iconCode  = id("viewIconCode");
  var iconTree  = id("viewIconTree");
  var footerEl  = id("footer");
  var topbar    = doc.querySelector(".topbar");
  var brandIcon = id("brandIcon");

  var favLink = doc.querySelector('link[rel="icon"]');
  if (brandIcon && favLink) brandIcon.src = favLink.href;

  var BASE_TITLE = "EML Viewer";
  var MAX_HIGHLIGHT = 500000;    // skip source highlighting past ~500 KB
  var MAX_CHILDREN  = 1000;      // cap rendered siblings per tree node
  var MAX_ROWS      = 5000;      // cap rendered table rows

  var rawText = "", currentName = "", _renderKind = "", _parsed = null, parseErr = "";
  var hasRendered = false;       // does this file have a rendered plane?
  var mode = "source";           // "rendered" | "source"
  var codeBuiltFor = null, dataBuilt = false;
  var beautified = false, beautifyCache = null;
  var toastTimer = null;

  // Accepted data types (this viewer only).
  var ACCEPT_EXT = { eml:1, mbox:1, emlx:1, msg:1 };
  // highlight.js language per extension.
  var EXT_LANG = { eml:"http", mbox:"http", emlx:"http", msg:"plaintext" };
  // How each type is rendered: "tree" | "table" | "xml" | "" (source-only).
  var _RENDER_KIND = {
    json:"tree", jsonc:"tree", json5:"tree", jsonld:"tree", ndjson:"tree",
    yaml:"tree", yml:"tree",
    csv:"table", tsv:"table",
    xml:"xml", rss:"xml", atom:"xml"
    // toml, graphql, gql -> source-only
  };
  // Types the Format toggle can pretty-print in the source plane.
  var FORMAT_KIND = {
    json:"json", jsonc:"json", json5:"json", jsonld:"json", ndjson:"ndjson",
    yaml:"yaml", yml:"yaml", xml:"xml", rss:"xml", atom:"xml"
  };

  function extOf(name){ var m = /\.([a-z0-9_]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
  function isAccepted(name){
    if (!name) return true;
    var base = String(name).toLowerCase().split("/").pop().split("\\").pop();
    return ACCEPT_EXT[extOf(base)] === 1;
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>]/g, function(c){ return c==="&"?"&amp;":c==="<"?"&lt;":"&gt;"; });
  }
  function toast(msg){
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 2200);
  }

  // ---------- Parsing ----------
  function stripJsonc(t){ // remove // and /* */ comments (string-aware)
    return t.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n\r]*|\/\*[\s\S]*?\*\//g, function(m, str){ return str ? str : ""; });
  }
  function _parseFor(ext, text){
    if (ext === "json" || ext === "jsonld") return JSON.parse(text);
    if (ext === "jsonc") return JSON.parse(stripJsonc(text));
    if (ext === "json5") return JSON5.parse(text);
    if (ext === "ndjson"){
      var out = [], lines = text.split(/\r?\n/);
      for (var i=0;i<lines.length;i++){ var ln = lines[i].trim(); if (ln) out.push(JSON.parse(ln)); }
      return out;
    }
    if (ext === "yaml" || ext === "yml") return jsyaml.load(text);
    if (ext === ""){ // pasted or dropped text: no filename — try strict JSON, then lenient JSON5
      try { return JSON.parse(text); } catch (e){ return JSON5.parse(text); }
    }
    throw new Error("no parser");
  }
  function _parseCsv(text, sep){
    var rows = [], row = [], cur = "", q = false, i = 0, c, n = text.length;
    while (i < n){
      c = text[i];
      if (q){
        if (c === '"'){ if (text[i+1] === '"'){ cur += '"'; i++; } else q = false; }
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === sep){ row.push(cur); cur = ""; }
        else if (c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ""; }
        else if (c === '\r'){ /* skip */ }
        else cur += c;
      }
      i++;
    }
    if (cur.length || row.length){ row.push(cur); rows.push(row); }
    return rows;
  }

  // ---------- Rendered plane ----------
  function typeClass(v){
    if (v === null) return "nul";
    var t = typeof v;
    if (t === "string") return "s";
    if (t === "number") return "n";
    if (t === "boolean") return "bool";
    return "";
  }
  function primText(v){
    if (v === null) return "null";
    if (typeof v === "string") return JSON.stringify(v);   // quoted + escaped
    return String(v);
  }
  function treeNode(key, value, depth){
    var li = el("li");
    var isArr = Array.isArray(value);
    var isObj = value && typeof value === "object" && !isArr;
    var row = el("span", "row");
    var twist = el("span", "twist");
    row.appendChild(twist);
    if (key !== null){
      var ks = el("span", "k"); ks.textContent = key; row.appendChild(ks);
      var col = el("span", "punc"); col.textContent = ": "; row.appendChild(col);
    }
    if (isArr || isObj){
      var keys = isArr ? null : Object.keys(value);
      var len = isArr ? value.length : keys.length;
      var open = el("span", "punc"); open.textContent = isArr ? "[" : "{"; row.appendChild(open);
      var ell = el("span", "ellip"); ell.textContent = len ? " … " : ""; row.appendChild(ell);
      var closeInline = el("span", "punc"); closeInline.className = "punc ellip"; closeInline.textContent = isArr ? "]" : "}"; row.appendChild(closeInline);
      var cnt = el("span", "count"); cnt.textContent = len + (isArr ? (len===1?" item":" items") : (len===1?" key":" keys")); row.appendChild(cnt);
      li.appendChild(row);
      var ul = el("ul");
      var shown = Math.min(len, MAX_CHILDREN);
      for (var i=0;i<shown;i++){
        if (isArr) ul.appendChild(treeNode(String(i), value[i], depth+1));
        else ul.appendChild(treeNode(keys[i], value[keys[i]], depth+1));
      }
      if (len > shown){ var more = el("li","more"); more.textContent = "… " + (len - shown) + " more"; ul.appendChild(more); }
      var close = el("span", "punc"); close.textContent = isArr ? "]" : "}";
      var closeLi = el("li"); closeLi.appendChild(close); ul.appendChild(closeLi);
      li.appendChild(ul);
      twist.textContent = "▾";
      twist.setAttribute("role", "button");
      twist.setAttribute("tabindex", "0");
      twist.setAttribute("aria-label", "Toggle " + (key !== null ? key : (isArr ? "array" : "object")));
      twist.setAttribute("aria-expanded", "true");
      if (len === 0 || depth >= 2){ li.className = "collapsed"; twist.textContent = "▸"; twist.setAttribute("aria-expanded", "false"); }
      var toggle = function(){
        var c = li.className.indexOf("collapsed") >= 0;
        li.className = c ? "" : "collapsed";
        twist.textContent = c ? "▾" : "▸";
        twist.setAttribute("aria-expanded", c ? "true" : "false");
      };
      twist.addEventListener("click", toggle);
      twist.addEventListener("keydown", function(e){
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar"){ e.preventDefault(); toggle(); }
      });
    } else {
      li.className = "leaf";
      var pv = el("span", typeClass(value)); pv.textContent = primText(value); row.appendChild(pv);
      li.appendChild(row);
    }
    return li;
  }
  function _renderTree(value){
    var ul = el("ul", "tree");
    ul.appendChild(treeNode(null, value, 0));
    dataView.innerHTML = ""; dataView.appendChild(ul);
  }
  function _renderTable(rows){
    dataView.innerHTML = "";
    if (!rows.length){ dataView.textContent = "(empty)"; return; }
    var wrap = el("div"); wrap.style.width = "100%";
    var table = el("table", "data");
    var thead = el("thead"), htr = el("tr");
    var rn = el("th", "rownum"); rn.textContent = "#"; htr.appendChild(rn);
    var head = rows[0];
    for (var c=0;c<head.length;c++){ var th = el("th"); th.textContent = head[c]; htr.appendChild(th); }
    thead.appendChild(htr); table.appendChild(thead);
    var tbody = el("tbody");
    var shown = Math.min(rows.length - 1, MAX_ROWS);
    for (var r=1;r<=shown;r++){
      var tr = el("tr");
      var num = el("td", "rownum"); num.textContent = r; tr.appendChild(num);
      var cells = rows[r];
      for (var k=0;k<head.length;k++){ var td = el("td"); td.textContent = cells[k] != null ? cells[k] : ""; tr.appendChild(td); }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    dataView.appendChild(table);
    if (rows.length - 1 > shown){ var m = el("div","more"); m.textContent = "… " + (rows.length - 1 - shown) + " more rows"; dataView.appendChild(m); }
  }
  function xmlNodeToLi(node){
    var li = el("li");
    var row = el("span","row");
    var twist = el("span","twist"); row.appendChild(twist);
    var name = el("span","tag"); name.className = "k"; name.textContent = "<" + node.nodeName + ">"; row.appendChild(name);
    // attributes
    if (node.attributes && node.attributes.length){
      for (var a=0;a<node.attributes.length;a++){
        var at = node.attributes[a];
        var sp = el("span"); sp.textContent = " ";
        var an = el("span","attr"); an.className = "n"; an.textContent = at.name + "=";
        var av = el("span","s"); av.textContent = JSON.stringify(at.value);
        row.appendChild(sp); row.appendChild(an); row.appendChild(av);
      }
    }
    var elements = [];
    for (var i=0;i<node.childNodes.length;i++){ if (node.childNodes[i].nodeType === 1) elements.push(node.childNodes[i]); }
    var text = (node.textContent || "").trim();
    li.appendChild(row);
    if (elements.length){
      var ul = el("ul");
      var shown = Math.min(elements.length, MAX_CHILDREN);
      for (var e=0;e<shown;e++) ul.appendChild(xmlNodeToLi(elements[e]));
      if (elements.length > shown){ var more = el("li","more"); more.textContent = "… " + (elements.length - shown) + " more"; ul.appendChild(more); }
      li.appendChild(ul);
      twist.textContent = "▾";
      twist.setAttribute("role", "button");
      twist.setAttribute("tabindex", "0");
      twist.setAttribute("aria-label", "Toggle " + node.nodeName);
      twist.setAttribute("aria-expanded", "true");
      var xtoggle = function(){
        var c = li.className.indexOf("collapsed") >= 0;
        li.className = c ? "" : "collapsed";
        twist.textContent = c ? "▾" : "▸";
        twist.setAttribute("aria-expanded", c ? "true" : "false");
      };
      twist.addEventListener("click", xtoggle);
      twist.addEventListener("keydown", function(e){
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar"){ e.preventDefault(); xtoggle(); }
      });
    } else {
      li.className = "leaf";
      if (text){ var col = el("span","punc"); col.textContent = ": "; row.appendChild(col); var tv = el("span","s"); tv.textContent = text.length>200 ? text.slice(0,200)+"…" : text; row.appendChild(tv); }
    }
    return li;
  }
  function _renderXml(text){
    var d = new DOMParser().parseFromString(text, "application/xml");
    var perr = d.getElementsByTagName("parsererror");
    if (perr && perr.length) throw new Error("XML parse error");
    var ul = el("ul","tree");
    ul.appendChild(xmlNodeToLi(d.documentElement));
    dataView.innerHTML = ""; dataView.appendChild(ul);
  }

  /* buildRendered() provided by the EML adapter above */

  // ---------- Source plane ----------
  function doFormat(text, ext){
    var kind = FORMAT_KIND[ext];
      if (kind === "json")  return JSON.stringify(JSON.parse(extOf(currentName)==="jsonc"?stripJsonc(text):text), null, 2);
      if (kind === "ndjson") return text.split(/\r?\n/).filter(function(l){return l.trim();}).map(function(l){ return JSON.stringify(JSON.parse(l), null, 2); }).join("\n");
      if (kind === "yaml")  return jsyaml.dump(jsyaml.load(text), { indent: 2, lineWidth: 120 });
      if (kind === "xml")   return prettyXml(text);
    return text;
  }
  function prettyXml(text){
    var d = new DOMParser().parseFromString(text, "application/xml");
    if (d.getElementsByTagName("parsererror").length) throw new Error("XML parse error");
    var out = [];
    (function walk(node, depth){
      var pad = new Array(depth+1).join("  ");
      for (var i=0;i<node.childNodes.length;i++){
        var c = node.childNodes[i];
        if (c.nodeType === 1){
          var elChildren = [], txt = "";
          for (var j=0;j<c.childNodes.length;j++){ if (c.childNodes[j].nodeType===1) elChildren.push(c.childNodes[j]); else if (c.childNodes[j].nodeType===3) txt += c.childNodes[j].nodeValue; }
          var attrs = "";
          if (c.attributes) for (var a=0;a<c.attributes.length;a++) attrs += " " + c.attributes[a].name + "=\"" + c.attributes[a].value + "\"";
          txt = txt.trim();
          if (elChildren.length){
            out.push(pad + "<" + c.nodeName + attrs + ">");
            walk(c, depth+1);
            out.push(pad + "</" + c.nodeName + ">");
          } else if (txt){
            out.push(pad + "<" + c.nodeName + attrs + ">" + txt + "</" + c.nodeName + ">");
          } else {
            out.push(pad + "<" + c.nodeName + attrs + "/>");
          }
        }
      }
    })(d, 0);
    return out.join("\n");
  }
  function displayText(){
    if (beautified && beautifyCache && beautifyCache.src === rawText) return beautifyCache.out;
    return rawText;
  }
  function canFormatCurrent(){ return mode === "source" && !!FORMAT_KIND[extOf(currentName)]; }
  function updateFormatBtn(){
    btnFormat.hidden = !canFormatCurrent();
    btnFormat.classList.toggle("active", beautified);
    btnFormat.setAttribute("aria-pressed", beautified ? "true" : "false");
    btnFormat.setAttribute("data-tip", beautified ? "Show raw source" : "Format / beautify");
  }
  function buildCode(){
    var key = rawText + " " + beautified;
    if (codeBuiltFor === key) return;
    var text = String(displayText()).replace(/\n$/, "");
    var lang = EXT_LANG[extOf(currentName)] || "";
    var htmlOut, usedLang = "";
    if (window.hljs && text.length <= MAX_HIGHLIGHT){
      try {
        if (lang && hljs.getLanguage(lang)){ htmlOut = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; usedLang = lang; }
        else { var a = hljs.highlightAuto(text); htmlOut = a.value; usedLang = a.language || ""; }
      } catch (e){ htmlOut = escapeHtml(text); }
    } else { htmlOut = escapeHtml(text); }
    codeInner.innerHTML = htmlOut;
    codeInner.className = "hljs" + (usedLang ? " language-" + usedLang : "");
    var n = text.length ? text.split("\n").length : 1, g = "";
    for (var i=1;i<=n;i++) g += i + "\n";
    gutter.textContent = g;
    codeBuiltFor = key;
  }

  // ---------- View orchestration ----------
  var emlMsg = null;

  // Reflect the loaded file's name into the URL (?name=), so a bookmarked or
  // shared link says what was being viewed. history.replaceState only, and
  // URLSearchParams does its own percent-encoding — this never touches the
  // DOM, so it carries no XSS risk on its own. The value becomes untrusted
  // input again the moment it is read back (see the on-load block near the
  // bottom of this script), and that path must stay textContent-only.
  function syncQueryName(name){
    var url = new URL(location.href);
    if (name) url.searchParams.set("name", name);
    else url.searchParams.delete("name");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function show(text, name){
    currentName = name || "";
    syncQueryName(currentName);
    rawText = String(text || "");
    emlMsg = null; parseErr = ""; codeBuiltFor = null; dataBuilt = false;
    try { emlMsg = EMLCORE.parseEml(rawText); }
    catch (e){ parseErr = (e && e.message) || String(e); }
    hasRendered = !!emlMsg && !parseErr;

    empty.hidden = true;
    var ttl = (emlMsg && emlMsg.subject) ? emlMsg.subject : (name || BASE_TITLE);
    docTitle.textContent = ttl;
    doc.title = (ttl && ttl !== BASE_TITLE) ? ttl + " — " + BASE_TITLE : BASE_TITLE;
    body.classList.add("viewing");
    btnView.hidden = !hasRendered;
    btnFormat.hidden = true;
    setMode(hasRendered ? "rendered" : "source");
  }

  function fmtBytes(n){
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }
  function authClass(r){
    r = (r || "").toLowerCase();
    if (r === "pass") return "ok";
    if (r === "fail" || r === "softfail" || r === "permerror" || r === "temperror" || r === "reject") return "bad";
    if (r === "present") return "warn";
    return "na";
  }
  function authRow(label, res, detail){
    var row = el("div", "auth-row");
    var b = el("span", "auth-badge " + authClass(res)); b.textContent = (res || "none").toUpperCase();
    var l = el("span", "auth-label"); l.textContent = label;
    var d = el("span", "auth-detail"); d.textContent = detail || "";
    row.appendChild(b); row.appendChild(l); row.appendChild(d);
    return row;
  }
  function renderAuth(a){
    var box = el("div", "auth-panel");
    var h = el("div", "auth-head"); h.textContent = "Email authentication"; box.appendChild(h);
    box.appendChild(authRow("SPF", a.spf.result, a.spf.domain ? "mail-from " + a.spf.domain : ""));
    var dk = a.dkim.domain
      ? ("d=" + a.dkim.domain + (a.dkim.selector ? "   s=" + a.dkim.selector : ""))
      : (a.dkim.signatures ? a.dkim.signatures + " signature(s)" : "");
    box.appendChild(authRow("DKIM", a.dkim.result, dk));
    box.appendChild(authRow("DMARC", a.dmarc.result,
      a.dmarc.policy ? "p=" + a.dmarc.policy.toLowerCase() : (a.dmarc.domain ? "from " + a.dmarc.domain : "")));
    var note = el("div", "auth-note");
    note.textContent = a.raw
      ? "Read from the message’s Authentication-Results (added by the receiving mail server). No live DNS lookups are performed."
      : "No Authentication-Results header found — SPF/DKIM/DMARC status is unknown for this message.";
    box.appendChild(note);
    return box;
  }
  function hdrLine(label, value){
    if (!value) return null;
    var row = el("div", "hc-row");
    var l = el("span", "hc-label"); l.textContent = label;
    var v = el("span", "hc-val"); v.textContent = value;
    row.appendChild(l); row.appendChild(v); return row;
  }
  function renderHeaderCard(m){
    var card = el("div", "hdr-card");
    var rows = [["From", m.from], ["To", m.to], ["Cc", m.cc], ["Subject", m.subject], ["Date", m.date], ["Reply-To", m.replyTo]];
    for (var i = 0; i < rows.length; i++){ var r = hdrLine(rows[i][0], rows[i][1]); if (r) card.appendChild(r); }
    return card;
  }
  function linkify(text){
    var frag = doc.createDocumentFragment();
    var re = /(https?:\/\/[^\s<>()]+)/g, last = 0, m;
    while ((m = re.exec(text))){
      if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
      var a = doc.createElement("a"); a.href = m[1]; a.textContent = m[1];
      a.target = "_blank"; a.rel = "noopener noreferrer"; frag.appendChild(a);
      last = m.index + m[1].length;
    }
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
    return frag;
  }
  function renderBody(m){
    var wrap = el("div", "eml-body");
    if (m.html != null && m.html !== ""){
      var showRemote = false;
      var bar = el("div", "body-bar");
      var tag = el("span", "body-tag"); tag.textContent = "HTML"; bar.appendChild(tag);
      var btn = doc.createElement("button"); btn.className = "img-toggle"; btn.type = "button";
      btn.setAttribute("aria-pressed", "false");
      bar.appendChild(btn);
      var note = el("span", "body-note"); bar.appendChild(note);
      wrap.appendChild(bar);
      var frame = doc.createElement("iframe");
      frame.className = "eml-frame";
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.setAttribute("title", "Message body");
      var css = '<style>html,body{margin:0;padding:12px;font:15px/1.55 -apple-system,system-ui,Segoe UI,sans-serif;color:#111;background:#fff;word-wrap:break-word;overflow-wrap:break-word}img{max-width:100%;height:auto}a{color:#2563eb}table{max-width:100%}</style>';
      function paint(){
        var imgSrc = showRemote ? "data: https:" : "data:";
        var csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src ' + imgSrc + '; style-src \'unsafe-inline\' data:; font-src data:; media-src data:">';
        frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8">' + csp + css + '</head><body>' + m.html + '</body></html>';
        btn.textContent = showRemote ? "Blocking off" : "Load remote images";
        btn.setAttribute("aria-pressed", showRemote ? "true" : "false");
        note.textContent = showRemote ? "remote content allowed" : "remote images blocked for privacy";
      }
      frame.onload = function(){
        try { var d = frame.contentDocument; var hgt = (d && d.body ? d.body.scrollHeight : 420) + 30; frame.style.height = Math.min(hgt, 6000) + "px"; }
        catch (e){ frame.style.height = "70vh"; }
      };
      btn.addEventListener("click", function(){ showRemote = !showRemote; paint(); });
      paint();
      wrap.appendChild(frame);
    } else if (m.text != null && m.text !== ""){
      var t = el("div", "body-tag solo"); t.textContent = "Text"; wrap.appendChild(t);
      var pre = el("pre", "eml-text"); pre.appendChild(linkify(m.text)); wrap.appendChild(pre);
    } else {
      var none = el("div", "eml-none"); none.textContent = "(this message has no readable body)"; wrap.appendChild(none);
    }
    return wrap;
  }
  function bytesToDataUrl(bytes, type){
    var bin = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return "data:" + (type || "application/octet-stream") + ";base64," + btoa(bin);
  }
  function renderAttachments(list){
    var box = el("div", "att-panel");
    var h = el("div", "att-head"); h.textContent = "Attachments (" + list.length + ")"; box.appendChild(h);
    for (var i = 0; i < list.length; i++){
      var p = list[i];
      var row = el("div", "att-row");
      var ic = el("span", "att-ico"); ic.textContent = "📎";
      var nm = el("span", "att-name"); nm.textContent = p.name || "(unnamed)";
      var meta = el("span", "att-meta"); meta.textContent = (p.type || "application/octet-stream") + " · " + fmtBytes(p.bytes.length);
      var dl = doc.createElement("a"); dl.className = "att-dl"; dl.textContent = "Download";
      dl.setAttribute("download", p.name || "attachment");
      try { dl.href = bytesToDataUrl(p.bytes, p.type); } catch (e){ dl.href = "#"; }
      row.appendChild(ic); row.appendChild(nm); row.appendChild(meta); row.appendChild(dl);
      box.appendChild(row);
    }
    return box;
  }
  function buildRendered(){
    if (dataBuilt) return;
    dataView.innerHTML = ""; dataView.className = "dataview eml";
    if (!emlMsg){
      var pe = el("div", "parse-error"); pe.textContent = "Couldn’t parse this message — showing source instead.";
      dataView.appendChild(pe); parseErr = parseErr || "parse failed"; dataBuilt = true; return;
    }
    dataView.appendChild(renderAuth(emlMsg.auth));
    dataView.appendChild(renderHeaderCard(emlMsg));
    dataView.appendChild(renderBody(emlMsg));
    if (emlMsg.attachments.length) dataView.appendChild(renderAttachments(emlMsg.attachments));
    dataBuilt = true;
  }

  function bytesToText(buf){
    try { return new TextDecoder("utf-8").decode(buf); }
    catch (e){ var s = "", CH = 0x8000; for (var i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH)); return s; }
  }
  function showMsgNotice(name){
    currentName = name || ""; rawText = ""; emlMsg = null; hasRendered = false; dataBuilt = true;
    syncQueryName(currentName);
    empty.hidden = true; body.classList.add("viewing");
    docTitle.textContent = name || BASE_TITLE; doc.title = BASE_TITLE;
    btnView.hidden = true; btnFormat.hidden = true;
    codeView.hidden = true; dataView.hidden = false; dataView.innerHTML = ""; dataView.className = "dataview eml";
    var box = el("div", "msg-notice");
    var h = el("div", "msg-notice-title"); h.textContent = "Outlook “.msg” files aren’t supported yet";
    var pp = el("p"); pp.textContent = "This looks like an Outlook .msg (a compound-binary file). Open it in Outlook or your mail client and use “Save As → .eml”, or forward the message and download the .eml — then drop it here.";
    var q = el("p", "msg-notice-sub"); q.textContent = "Your file was not uploaded anywhere.";
    box.appendChild(h); box.appendChild(pp); box.appendChild(q); dataView.appendChild(box);
    if (typeof revealHeader === "function") revealHeader();
  }
  function readFile(file){
    if (!file) return;
    if (!isAccepted(file.name)){ if (!familyRoute(file)) toast("“" + file.name + "” isn’t a supported email file"); return; }
    var reader = new FileReader();
    reader.onload = function(e){
      var buf = new Uint8Array(e.target.result);
      if (buf.length > 8 && buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0){ showMsgNotice(file.name); return; }
      show(bytesToText(buf), file.name);
    };
    reader.onerror = function(){ toast("Could not read that file"); };
    reader.readAsArrayBuffer(file);
  }
  function _looksStructured(text){
    var t = String(text||"").replace(/^\uFEFF/,"").replace(/^\s+/,"").charAt(0);
    return t === "{" || t === "[";
  }
  function setMode(m){
    mode = m;
    clearTimeout(hdrIdleTimer);
    lastPos.win = lastPos.code = lastPos.data = 0;
    if (m === "rendered"){
      buildRendered();
      codeView.hidden = true; dataView.hidden = false;
      dataView.scrollTop = 0;
      // If parsing failed, fall back to source automatically.
      if (parseErr){ mode = "source"; dataView.hidden = true; }
    }
    if (mode === "source"){
      buildCode();
      dataView.hidden = true; codeView.hidden = false;
      codeView.scrollTop = 0; codeView.scrollLeft = 0;
    }
    if (mode === "rendered") revealHeader(); else { showHeader(); clearTimeout(hdrIdleTimer); }
    updateViewBtn(); updateFormatBtn();
  }
  function updateViewBtn(){
    var toCode = (mode === "rendered");
    iconCode.hidden = !toCode; iconTree.hidden = toCode;
    btnView.setAttribute("data-tip", toCode ? "View source" : "View data");
    btnView.setAttribute("aria-label", toCode ? "View source" : "View rendered data");
  }
  function clearAll(){
    rawText = ""; currentName = ""; _renderKind = ""; _parsed = null; parseErr = "";
    syncQueryName("");
    dataBuilt = false; codeBuiltFor = null; beautified = false; beautifyCache = null; hasRendered = false;
    dataView.hidden = true; dataView.innerHTML = "";
    codeView.hidden = true; codeInner.textContent = ""; codeInner.className = "hljs"; gutter.textContent = "";
    btnView.hidden = true; btnFormat.hidden = true;
    empty.hidden = false;
    docTitle.textContent = BASE_TITLE; doc.title = BASE_TITLE;
    body.classList.remove("viewing", "hdr-hidden");
    clearTimeout(hdrIdleTimer);
  }

  /* readFile() provided by the EML adapter above */
  function openDialog(){ fileInput.click(); }

  fileInput.addEventListener("change", function(e){ var f = e.target.files && e.target.files[0]; if (f) readFile(f); fileInput.value = ""; });
  btnView.addEventListener("click", function(){ if (!hasRendered) return; setMode(mode === "rendered" ? "source" : "rendered"); });
  btnFormat.addEventListener("click", function(){
    if (!canFormatCurrent()) return;
    if (!beautified){
      var out; try { out = doFormat(rawText, extOf(currentName)); } catch (e){ toast("Couldn’t format: " + (e && e.message || e)); return; }
      beautifyCache = { src: rawText, out: out }; beautified = true; toast("Formatted");
    } else { beautified = false; toast("Showing raw source"); }
    codeBuiltFor = null; buildCode(); codeView.scrollTop = 0; codeView.scrollLeft = 0; updateFormatBtn();
  });
  id("btnCopy").addEventListener("click", function(){
    if (!rawText){ toast("Nothing to copy yet"); return; }
    var t = displayText();
    if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){ toast("Source copied"); }, function(){ fallbackCopy(t); }); }
    else fallbackCopy(t);
  });
  function fallbackCopy(text){
    var ta = doc.createElement("textarea"); ta.value = text; ta.setAttribute("readonly","");
    ta.style.position = "fixed"; ta.style.opacity = "0"; doc.body.appendChild(ta); ta.select();
    try { doc.execCommand("copy"); toast("Source copied"); } catch (err){ toast("Copy not supported"); }
    doc.body.removeChild(ta);
  }
  id("btnClear").addEventListener("click", clearAll);
  empty.addEventListener("click", openDialog);
  empty.addEventListener("keydown", function(e){ if (e.key === "Enter" || e.key === " "){ e.preventDefault(); openDialog(); } });

  // ---------- Header: rendered views auto-hide after 3s (collapse to a handle); ----------
  // ---------- hover / touch / scroll-up brings it back. Source view keeps it. ------------
  var HDR_IDLE_MS = 3000, HDR_THRESH = 6, hdrIdleTimer = null;
  var lastPos = { win:0, code:0, data:0 };
  function showHeader(){ body.classList.remove("hdr-hidden"); }
  function hideHeader(){ if (body.classList.contains("viewing") && mode === "rendered") body.classList.add("hdr-hidden"); }
  function armIdleHide(){ clearTimeout(hdrIdleTimer); hdrIdleTimer = setTimeout(hideHeader, HDR_IDLE_MS); }
  function revealHeader(){ showHeader(); armIdleHide(); }
  function onScroll(k, pos){
    if (!body.classList.contains("viewing")) return;
    var d = pos - lastPos[k]; lastPos[k] = pos;
    if (d > HDR_THRESH){ hideHeader(); }
    else if (d < -HDR_THRESH){ revealHeader(); }
  }
  window.addEventListener("scroll", function(){ onScroll("win", window.pageYOffset || root.scrollTop || 0); }, { passive:true });
  codeView.addEventListener("scroll", function(){ onScroll("code", codeView.scrollTop); }, { passive:true });
  dataView.addEventListener("scroll", function(){ onScroll("data", dataView.scrollTop); }, { passive:true });
  hoverZone.addEventListener("mouseenter", revealHeader);
  hoverZone.addEventListener("click", revealHeader);
  hoverZone.addEventListener("touchstart", function(){ revealHeader(); }, { passive:true });
  topbar.addEventListener("mouseenter", function(){ showHeader(); clearTimeout(hdrIdleTimer); });
  topbar.addEventListener("mouseleave", function(){ armIdleHide(); });
  function measureHeader(){ root.style.setProperty("--hdr-h", (topbar ? topbar.offsetHeight : 56) + "px"); }
  measureHeader(); window.addEventListener("resize", measureHeader);
  id("btnHideFooter").addEventListener("click", function(){ if (footerEl) footerEl.hidden = true; });

  // ---------- Hamburger flyout nav ----------
  var btnMenu = id("btnMenu"), navBackdrop = id("navBackdrop");
  function setNav(open){ body.classList.toggle("nav-open", open); btnMenu.setAttribute("aria-expanded", open ? "true" : "false"); }
  btnMenu.addEventListener("click", function(){ setNav(!body.classList.contains("nav-open")); });
  navBackdrop.addEventListener("click", function(){ setNav(false); });
  doc.addEventListener("keydown", function(e){
    if (!id("routeCard").hidden){   // §6.10: the modal offer card claims Escape and Tab while open
      if (e.key === "Escape"){ hideRouteCard(); return; }
      if (e.key === "Tab"){
        e.preventDefault();
        var go = id("routeGo"), no = id("routeDismiss");
        (doc.activeElement === go || go.disabled ? no : go).focus();
      }
      return;
    }
    if (e.key === "Escape") setNav(false);
  });

  // ---------- Background color (remembered) ----------
  function setCookie(name, val){ doc.cookie = name + "=" + encodeURIComponent(val) + "; max-age=31536000; path=/; SameSite=Lax"; }
  function getCookie(name){ var m = doc.cookie.match("(?:^|; )" + name.replace(/([.*+?^${}()|[\]\\])/g, "\\$1") + "=([^;]*)"); return m ? decodeURIComponent(m[1]) : null; }
  function hexToRgb(h){ h = h.replace("#",""); if (h.length===3) h = h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2); var n = parseInt(h,16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
  function srgb(c){ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
  function luminance(rgb){ return 0.2126*srgb(rgb.r) + 0.7152*srgb(rgb.g) + 0.0722*srgb(rgb.b); }
  function mix(a, b, t){ return "rgb(" + Math.round(a.r+(b.r-a.r)*t) + "," + Math.round(a.g+(b.g-a.g)*t) + "," + Math.round(a.b+(b.b-a.b)*t) + ")"; }
  function rgbStr(c){ return "rgb(" + c.r + "," + c.g + "," + c.b + ")"; }
  var HL_LIGHT = { comment:"#6e7781", keyword:"#cf222e", tag:"#116329", attr:"#0550ae", string:"#0a3069", number:"#0550ae", title:"#8250df", built:"#953800" };
  var HL_DARK  = { comment:"#8b949e", keyword:"#ff7b72", tag:"#7ee787", attr:"#79c0ff", string:"#a5d6ff", number:"#79c0ff", title:"#d2a8ff", built:"#ffa657" };
  function applyColor(hex){
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) hex = "#ffffff";
    var bg = hexToRgb(hex);
    var lightText = luminance(bg) <= 0.179;
    var text = lightText ? { r:240, g:243, b:246 } : { r:31, g:35, b:40 };
    var accentHex = lightText ? "#8b93ff" : "#4f46e5";
    var ac = hexToRgb(accentHex), hl = lightText ? HL_DARK : HL_LIGHT, s = root.style;
    s.setProperty("--bg", hex); s.setProperty("--surface", hex);
    s.setProperty("--text", rgbStr(text)); s.setProperty("--code-text", rgbStr(text));
    s.setProperty("--muted", mix(bg, text, 0.45)); s.setProperty("--border", mix(bg, text, 0.24));
    s.setProperty("--border-soft", mix(bg, text, 0.13)); s.setProperty("--code-bg", mix(bg, text, 0.07));
    s.setProperty("--hover", mix(bg, text, 0.10)); s.setProperty("--accent", accentHex);
    s.setProperty("--accent-contrast", lightText ? "#0d1117" : "#ffffff");
    s.setProperty("--overlay", "rgba(" + ac.r + "," + ac.g + "," + ac.b + ",0.12)");
    s.setProperty("--shadow", lightText ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.12)");
    s.setProperty("--header-bg", "rgba(" + bg.r + "," + bg.g + "," + bg.b + ",0.9)");
    s.setProperty("--hl-comment", hl.comment); s.setProperty("--hl-keyword", hl.keyword);
    s.setProperty("--hl-tag", hl.tag); s.setProperty("--hl-attr", hl.attr);
    s.setProperty("--hl-string", hl.string); s.setProperty("--hl-number", hl.number);
    s.setProperty("--hl-title", hl.title); s.setProperty("--hl-built", hl.built);
    s.colorScheme = lightText ? "dark" : "light";
    themeColor.setAttribute("content", hex);
  }
  function isHex6(v){ return /^#([0-9a-f]{6})$/i.test(v || ""); }
  function saveColor(val){ setCookie("mykk-bg", val); try { localStorage.setItem("mykk-bg", val); } catch (e) {} }
  function loadColor(){ var v = getCookie("mykk-bg"); if (!isHex6(v)) { try { v = localStorage.getItem("mykk-bg"); } catch (e) { v = null; } } return isHex6(v) ? v : ((window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "#0d1117" : "#ffffff"); }
  var saved = loadColor(); bgPicker.value = saved; applyColor(saved);
  bgPicker.addEventListener("input", function(){ applyColor(bgPicker.value); saveColor(bgPicker.value); syncThemeToggle(); });
  var themeToggle=document.getElementById("themeToggle"),themeIconSun=document.getElementById("themeIconSun"),themeIconMoon=document.getElementById("themeIconMoon");
  function isDarkBg(){ try { return luminance(hexToRgb(bgPicker.value)) <= 0.179; } catch(e){ return false; } }
  function syncThemeToggle(){ if(!themeToggle) return; var dark=isDarkBg(); themeToggle.setAttribute("aria-pressed", dark?"true":"false"); themeToggle.setAttribute("aria-label", dark?"Switch to light theme":"Switch to dark theme"); if(themeIconSun){ if(dark) themeIconSun.setAttribute("hidden",""); else themeIconSun.removeAttribute("hidden"); } if(themeIconMoon){ if(dark) themeIconMoon.removeAttribute("hidden"); else themeIconMoon.setAttribute("hidden",""); } }
  if(themeToggle){ themeToggle.addEventListener("click", function(){ var next=isDarkBg()?"#ffffff":"#0d1117"; bgPicker.value=next; applyColor(next); saveColor(next); syncThemeToggle(); }); }
  syncThemeToggle();

  // ---------- Drag & drop / paste ----------
  var dragDepth = 0;
  function showOverlay(s){ overlay.classList.toggle("show", s); }
  window.addEventListener("dragenter", function(e){
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") === -1) return;
    e.preventDefault(); dragDepth++; showOverlay(true);
  });
  window.addEventListener("dragover", function(e){ e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; });
  window.addEventListener("dragleave", function(e){ e.preventDefault(); dragDepth--; if (dragDepth <= 0){ dragDepth = 0; showOverlay(false); } });
  window.addEventListener("drop", function(e){
    e.preventDefault(); dragDepth = 0; showOverlay(false);
    var dt = e.dataTransfer; if (!dt) return;
    if (dt.files && dt.files.length){ readFile(dt.files[0]); return; }
    var txt = dt.getData && dt.getData("text"); if (txt) show(txt, "");
  });
  window.addEventListener("paste", function(e){
    var cd = e.clipboardData || window.clipboardData; if (!cd) return;
    if (cd.files && cd.files.length){ e.preventDefault(); readFile(cd.files[0]); return; }
    var txt = cd.getData && cd.getData("text"); if (txt){ e.preventDefault(); show(txt, ""); }
  });

  // ---------- Family router (§6.10): sibling-viewer redirect offer + in-browser hand-off ----------
        /* FV-MAP-START — generated from family-map.json (canonical); deep-equality enforced by the harness */
    var FAMILY = {
      audio:    { domain:"audio-viewer.us"     , label:"Audio Viewer"     , kind:"an audio file" },
      cert:     { domain:"cert-viewer.us"      , label:"Cert Viewer"      , kind:"a certificate" },
      data:     { domain:"data-viewer.us"      , label:"Data Viewer"      , kind:"a data file" },
      docx:     { domain:"docx-viewer.us"      , label:"DOCX Viewer"      , kind:"a Word document" },
      eml:      { domain:"eml-viewer.us"       , label:"EML Viewer"       , kind:"an email file" },
      epub:     { domain:"epub-viewer.us"      , label:"EPUB Viewer"      , kind:"an e-book" },
      html:     { domain:"html-viewer.us"      , label:"HTML Viewer"      , kind:"a web or source-code file" },
      image:    { domain:"image-viewer.us"     , label:"Image Viewer"     , kind:"an image" },
      log:      { domain:"log-viewer.us"       , label:"Log Viewer"       , kind:"a log file" },
      markdown: { domain:"markdown-viewer.us"  , label:"Markdown Viewer"  , kind:"a Markdown or text file" },
      pdf:      { domain:"pdf-viewer.us"       , label:"PDF Viewer"       , kind:"a PDF" },
      pptx:     { domain:"pptx-viewer.us"      , label:"PPTX Viewer"      , kind:"a presentation" },
      pub:      { domain:"pub-viewer.us"       , label:"PUB Viewer"       , kind:"a Publisher file" },
      sheets:   { domain:"sheets-viewer.us"    , label:"Sheets Viewer"    , kind:"a spreadsheet" },
      video:    { domain:"video-viewer.us"     , label:"Video Viewer"     , kind:"a video" }
    };
    var FAMILY_HUB = "file-viewer.us";
    var FAMILY_NAMES = {"robots.txt":"html"};
    var FAMILY_MAP = {
      // sheets
      "123":"sheets", xlsx:"sheets", xlsm:"sheets", xlsb:"sheets", xls:"sheets", xlt:"sheets", xltx:"sheets", xltm:"sheets",
      xlam:"sheets", ods:"sheets", fods:"sheets", dif:"sheets", prn:"sheets", dbf:"sheets", numbers:"sheets", xlml:"sheets",
      wk1:"sheets", wk3:"sheets", wks:"sheets", et:"sheets", uos:"sheets",
      // cert
      pem:"cert", crt:"cert", cer:"cert", der:"cert", csr:"cert", cert:"cert", p7b:"cert", p12:"cert",
      pfx:"cert",
      // data
      json:"data", jsonc:"data", json5:"data", jsonld:"data", ndjson:"data", yaml:"data", yml:"data", toml:"data",
      csv:"data", tsv:"data", xml:"data", rss:"data", atom:"data", graphql:"data", gql:"data",
      // docx
      docx:"docx", docm:"docx", dotx:"docx", dotm:"docx", doc:"docx", dot:"docx", rtf:"docx", odt:"docx",
      // eml
      eml:"eml", mbox:"eml", emlx:"eml", msg:"eml",
      // epub
      epub:"epub",
      // html
      html:"html", htm:"html", xhtml:"html", xht:"html", shtml:"html", shtm:"html", stm:"html", hta:"html",
      mhtml:"html", mht:"html", css:"html", scss:"html", sass:"html", less:"html", styl:"html", pcss:"html",
      postcss:"html", js:"html", mjs:"html", cjs:"html", jsx:"html", ts:"html", mts:"html", cts:"html",
      tsx:"html", coffee:"html", htaccess:"html", htpasswd:"html", env:"html", ini:"html", conf:"html", webmanifest:"html",
      map:"html", php:"html", phtml:"html", asp:"html", aspx:"html", ascx:"html", cshtml:"html", vbhtml:"html",
      jsp:"html", jspx:"html", cfm:"html", erb:"html", rhtml:"html", ejs:"html", hbs:"html", handlebars:"html",
      mustache:"html", njk:"html", liquid:"html", jinja:"html", j2:"html", twig:"html", pug:"html", jade:"html",
      haml:"html", slim:"html", vue:"html", svelte:"html", astro:"html",
      // image
      png:"image", jpg:"image", jpeg:"image", jpe:"image", jfif:"image", gif:"image", webp:"image", avif:"image",
      svg:"image", svgz:"image", bmp:"image", dib:"image", ico:"image", cur:"image", tif:"image", tiff:"image",
      tga:"image", targa:"image", icb:"image", vda:"image", vst:"image", qoi:"image", pcx:"image", ppm:"image",
      pgm:"image", pbm:"image", pnm:"image", pam:"image", ff:"image", dds:"image", heic:"image", heif:"image",
      jxl:"image", psd:"image",
      // log
      log:"log", out:"log", err:"log", trace:"log", syslog:"log",
      // markdown
      md:"markdown", markdown:"markdown", mdx:"markdown", txt:"markdown", rst:"markdown", adoc:"markdown",
      // pdf
      pdf:"pdf",
      // pptx
      pptx:"pptx", pptm:"pptx", ppsx:"pptx", ppsm:"pptx", potx:"pptx", potm:"pptx", ppt:"pptx",
      // pub
      pub:"pub",
      // audio
      mp3:"audio", wav:"audio", flac:"audio", m4a:"audio", aac:"audio", ogg:"audio", oga:"audio", opus:"audio",
      weba:"audio", mka:"audio", aif:"audio", aiff:"audio", wma:"audio", mid:"audio", midi:"audio",
      // video
      webm:"video", mp4:"video", m4v:"video", ogv:"video", mov:"video", mkv:"video", avi:"video", wmv:"video"
    };
    /* FV-MAP-END */
    var FAMILY_ORIGINS = Object.keys(FAMILY).map(function (k) { return "https://" + FAMILY[k].domain; })
      .concat("https://" + FAMILY_HUB);
  var DOMAIN = "eml-viewer.us";

  function familyRoute(file){
    var n = String(file && file.name || "").toLowerCase();
    var key = FAMILY_NAMES[n];
    if (!key){
      var i = n.lastIndexOf(".");
      var ext = i >= 0 ? n.slice(i + 1) : "";
      key = FAMILY_MAP[ext];
    }
    if (!key || FAMILY[key].domain === DOMAIN) return false;  // unknown type, or our own → caller keeps its toast
    showRouteCard(file, key);
    return true;
  }

  var routeFile = null, routeKey = "", routePrevFocus = null, handoff = null;
  function cancelHandoff(){                    // tear down a pending hand-off (sender below)
    if (!handoff) return;
    window.removeEventListener("message", handoff.onMsg);
    clearTimeout(handoff.timer);
    handoff = null;
  }
  function showRouteCard(file, key){
    cancelHandoff();                           // a new offer aborts any pending hand-off
    if (id("routeCard").hidden) routePrevFocus = document.activeElement;  // don't capture our own button
    routeFile = file; routeKey = key;
    var t = FAMILY[key];
    // ⁨…⁩ (FSI…PDI) bidi-isolate the untrusted name so U+202E-style
    // overrides can't visually reorder the sentence.
    id("routeMsg").textContent = "“⁨" + file.name + "⁩” looks like " + t.kind + " — it belongs to " + t.label + ".";
    id("routeGo").textContent = "Open " + t.domain + " ↗";
    id("routeSub").textContent = "Your file stays on this device — nothing is uploaded.";
    id("routeGo").disabled = false;
    id("routeBackdrop").hidden = false; id("routeCard").hidden = false;
    id("routeGo").focus();
  }
  function hideRouteCard(){
    cancelHandoff();                           // dismissal aborts a pending hand-off
    id("routeBackdrop").hidden = true; id("routeCard").hidden = true;
    routeFile = null; routeKey = "";
    if (routePrevFocus && routePrevFocus.focus) routePrevFocus.focus();
  }

  id("routeGo").addEventListener("click", function(){
    if (!routeFile || id("routeGo").disabled) return;               // no double-fire
    cancelHandoff();
    var t = FAMILY[routeKey], origin = "https://" + t.domain, file = routeFile;
    var w = window.open(origin + "/#fvh=" + encodeURIComponent(file.name));
    if (!w){ id("routeSub").textContent = "Couldn’t open the tab — allow pop-ups for this site and try again."; return; }
    id("routeGo").disabled = true;
    var h = {};
    h.onMsg = function(e){
      if (e.source !== w || e.origin !== origin || !e.data) return;
      if (e.data.type === "fv-ready") w.postMessage({ type:"fv-file", file:file }, origin);
      else if (e.data.type === "fv-ack"){ hideRouteCard(); toast("Sent to " + t.label); }  // hideRouteCard tears the handshake down
    };
    h.timer = setTimeout(function(){
      if (handoff !== h) return;
      cancelHandoff();
      id("routeSub").textContent = "Tab opened — drop the file there.";   // Level-1 fallback
    }, 10000);
    handoff = h;
    window.addEventListener("message", h.onMsg);
  });
  id("routeDismiss").addEventListener("click", hideRouteCard);
  id("routeBackdrop").addEventListener("click", hideRouteCard);

  window.addEventListener("message", function(e){
    if (FAMILY_ORIGINS.indexOf(e.origin) === -1) return;      // family origins only
    var d = e.data;
    if (d && d.type === "fv-file" && d.file instanceof File){ // clone re-creates a real File in this realm
      readFile(d.file);
      e.source.postMessage({ type:"fv-ack" }, e.origin);      // ack = received and handed to the loader
    }
  });
  var fvh = /[#&]fvh=([^&]*)/.exec(location.hash);
  if (fvh){
    var fvhName = fvh[1];                                   // ⚠️ stranger-controlled — textContent only
    try { fvhName = decodeURIComponent(fvhName); } catch (_) {}  // malformed %-escapes must not abort the receiver
    history.replaceState(null, "", location.pathname + location.search);  // always clear, opener or not
    if (window.opener){
      try { window.opener.postMessage({ type:"fv-ready" }, "*"); } catch(_){}
      window.opener = null;    // sever the reverse-navigation channel once the ping is out
      var fvhSub = empty.querySelector(".empty-sub");   // SHOULD: show the pending hand-off; revert after ~10 s
      if (fvhSub){
        var fvhSubText = fvhSub.textContent;
        fvhSub.textContent = "Receiving \u201C\u2068" + fvhName + "\u2069\u201D\u2026";   // textContent only; FSI…PDI isolate the name
        setTimeout(function(){ fvhSub.textContent = fvhSubText; }, 10000);
      }
    }
  }

  // A bookmarked or shared link can carry the name of the file last viewed
  // (?name=, set by syncQueryName above). No content is ever recoverable
  // from a name alone — this only labels the empty state, and it never
  // fetches or renders anything on the strength of it. Skipped when an
  // #fvh hand-off is already customizing the same element.
  if (!fvh && !currentName){
    var qName = new URLSearchParams(location.search).get("name");
    if (qName){
      var lastSub = empty.querySelector(".empty-sub");
      if (lastSub){
        // Display-only, and it must stay that way: this string is read
        // straight from the URL, so it is exactly as stranger-controlled as
        // fvhName above. No fact is asserted about whether anyone actually
        // viewed it — only that the link names it.
        lastSub.textContent = "This link was shared for “⁨" + qName + "⁩”.";
      }
    }
  }
})();
