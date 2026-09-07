/* eml-core — DOM-free .eml (MIME) parser + email-auth analysis.
   ES5-ish, no eval, browser+node. Exposed as global EMLCORE for testing. */
(function (root) {
  "use strict";

  function b64ToBytes(s) {
    s = s.replace(/[^A-Za-z0-9+/=]/g, "");
    var bin = (typeof atob === "function")
      ? atob(s)
      : Buffer.from(s, "base64").toString("binary");
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  function qpToBytes(s) {
    s = s.replace(/=\r?\n/g, "");                 // soft line breaks
    var out = [], i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === "=" && i + 2 < s.length && /[0-9A-Fa-f]{2}/.test(s.substr(i + 1, 2))) {
        out.push(parseInt(s.substr(i + 1, 2), 16)); i += 3;
      } else { out.push(s.charCodeAt(i) & 0xff); i += 1; }
    }
    return new Uint8Array(out);
  }
  function strToBytes(s) {                         // treat as raw 8-bit
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }
  function decodeText(bytes, charset) {
    charset = (charset || "utf-8").toLowerCase().replace(/^charset=/, "");
    if (typeof TextDecoder === "function") {
      try { return new TextDecoder(charset).decode(bytes); }
      catch (e) { try { return new TextDecoder("utf-8").decode(bytes); } catch (_) {} }
    }
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
  function decodeCTE(body, cte) {
    cte = (cte || "7bit").toLowerCase().trim();
    if (cte === "base64") return b64ToBytes(body);
    if (cte === "quoted-printable") return qpToBytes(body);
    return strToBytes(body);
  }

  // RFC 2047 encoded-words in headers:  =?charset?B?..?=  /  =?charset?Q?..?=
  function decodeWords(s) {
    if (!s || s.indexOf("=?") < 0) return s;
    return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+)(?==\?)/g, "=?$1?$2?$3?=")
            .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, function (_, cs, enc, txt) {
      var bytes;
      if (enc.toUpperCase() === "B") bytes = b64ToBytes(txt);
      else bytes = qpToBytes(txt.replace(/_/g, " "));
      return decodeText(bytes, cs);
    });
  }

  function splitMessage(text) {
    var i = text.indexOf("\n\n");
    if (i < 0) return { head: text, body: "" };
    return { head: text.slice(0, i), body: text.slice(i + 2) };
  }
  function parseHeaders(head) {
    var unfolded = head.replace(/\n[ \t]+/g, " ");
    var lines = unfolded.split("\n"), out = [];
    for (var i = 0; i < lines.length; i++) {
      var m = /^([!-9;-~]+):[ \t]?([\s\S]*)$/.exec(lines[i]);
      if (m) out.push({ name: m[1], value: m[2] });
    }
    return out;
  }
  function getH(headers, name) {
    name = name.toLowerCase();
    for (var i = 0; i < headers.length; i++)
      if (headers[i].name.toLowerCase() === name) return headers[i].value;
    return "";
  }
  function allH(headers, name) {
    name = name.toLowerCase(); var out = [];
    for (var i = 0; i < headers.length; i++)
      if (headers[i].name.toLowerCase() === name) out.push(headers[i].value);
    return out;
  }
  function parseCT(v) {
    v = v || "text/plain";
    var parts = v.split(";"), type = parts[0].trim().toLowerCase(), params = {};
    for (var i = 1; i < parts.length; i++) {
      var kv = /^\s*([^=]+)=\s*([\s\S]*)$/.exec(parts[i]);
      if (kv) params[kv[1].trim().toLowerCase()] = kv[2].trim().replace(/^"([\s\S]*)"$/, "$1");
    }
    return { type: type, params: params };
  }
  function cdInfo(v) {
    if (!v) return { kind: "", filename: "" };
    var p = parseCT(v);
    return { kind: p.type, filename: decodeWords(p.params.filename || p.params["filename*"] || "") };
  }
  function splitMultipart(body, boundary) {
    var marker = "--" + boundary;
    var lines = body.split("\n"), parts = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(/\r$/, "");
      if (ln === marker || ln === marker + "--") {
        if (cur !== null) parts.push(cur.join("\n"));
        if (ln === marker + "--") { cur = null; break; }
        cur = [];
      } else if (cur !== null) cur.push(lines[i]);
    }
    return parts;
  }

  function parsePart(head, body) {
    var headers = parseHeaders(head);
    var ct = parseCT(getH(headers, "content-type"));
    if (ct.type.indexOf("multipart/") === 0 && ct.params.boundary) {
      var raw = splitMultipart(body, ct.params.boundary), kids = [];
      for (var i = 0; i < raw.length; i++) {
        var s = splitMessage(raw[i]);
        kids.push(parsePart(s.head, s.body));
      }
      return { multipart: ct.type, children: kids, headers: headers };
    }
    var cte = getH(headers, "content-transfer-encoding");
    var cd = cdInfo(getH(headers, "content-disposition"));
    var bytes = decodeCTE(body, cte);
    return {
      type: ct.type, charset: ct.params.charset,
      name: decodeWords(ct.params.name || "") || cd.filename,
      disposition: cd.kind, cid: (getH(headers, "content-id") || "").replace(/[<>]/g, ""),
      bytes: bytes, headers: headers
    };
  }

  // walk the tree: pick display text/html + text/plain, collect attachments
  function collect(node, acc) {
    if (node.multipart) {
      for (var i = 0; i < node.children.length; i++) collect(node.children[i], acc);
      return acc;
    }
    var isAttach = node.disposition === "attachment" || (!!node.name && node.type.indexOf("text/") !== 0);
    if (!isAttach && node.type === "text/plain" && acc.text == null) acc.text = decodeText(node.bytes, node.charset);
    else if (!isAttach && node.type === "text/html" && acc.html == null) acc.html = decodeText(node.bytes, node.charset);
    else acc.attachments.push(node);
    return acc;
  }

  function parseEml(text) {
    text = String(text).replace(/\r\n/g, "\n");
    var top = splitMessage(text);
    var tree = parsePart(top.head, top.body);
    var headers = tree.headers;
    var acc = collect(tree, { text: null, html: null, attachments: [] });
    return {
      raw: text, headers: headers, tree: tree,
      subject: decodeWords(getH(headers, "subject")),
      from: decodeWords(getH(headers, "from")),
      to: decodeWords(getH(headers, "to")),
      cc: decodeWords(getH(headers, "cc")),
      date: getH(headers, "date"),
      replyTo: decodeWords(getH(headers, "reply-to")),
      messageId: getH(headers, "message-id"),
      text: acc.text, html: acc.html, attachments: acc.attachments,
      auth: analyzeAuth(headers)
    };
  }

  // ---- email authentication (from headers the receiving server added) ----
  function pick(re, s) { var m = re.exec(s); return m ? m[1] : ""; }
  function analyzeAuth(headers) {
    var ar = allH(headers, "authentication-results").concat(allH(headers, "arc-authentication-results")).join("\n");
    var recvSpf = getH(headers, "received-spf");
    var dkimSigs = allH(headers, "dkim-signature");

    var spfR = (pick(/\bspf=([a-z]+)/i, ar) || pick(/^\s*([a-z]+)\b/i, recvSpf)).toLowerCase();
    var spfDom = pick(/smtp\.mailfrom=([^\s;]+)/i, ar) || pick(/[?+~-]?all[^)]*\bdomain of[^@]*@?([^\s)]+)/i, recvSpf) || pick(/\bdesignates\b.*?\bfor\b\s+([^\s;]+)/i, recvSpf);

    var dkimR = pick(/\bdkim=([a-z]+)/i, ar).toLowerCase();
    var dkimDom = pick(/header\.d=([^\s;]+)/i, ar) || pick(/\bd=([^;\s]+)/i, dkimSigs[0] || "");
    var dkimSel = pick(/header\.s=([^\s;]+)/i, ar) || pick(/\bs=([^;\s]+)/i, dkimSigs[0] || "");
    if (!dkimR && dkimSigs.length) dkimR = "present";

    var dmarcR = pick(/\bdmarc=([a-z]+)/i, ar).toLowerCase();
    var dmarcPolicy = pick(/\bp=([a-z]+)/i, ar);
    var dmarcDom = pick(/header\.from=([^\s;]+)/i, ar);

    return {
      raw: ar,
      spf:  { result: spfR || "none", domain: spfDom },
      dkim: { result: dkimR || "none", domain: dkimDom, selector: dkimSel, signatures: dkimSigs.length },
      dmarc:{ result: dmarcR || "none", policy: dmarcPolicy, domain: dmarcDom }
    };
  }

  root.EMLCORE = {
    parseEml: parseEml, analyzeAuth: analyzeAuth, decodeWords: decodeWords,
    parseHeaders: parseHeaders, getH: getH, b64ToBytes: b64ToBytes
  };
})(typeof window !== "undefined" ? window : globalThis);
