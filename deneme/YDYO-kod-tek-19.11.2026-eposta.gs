/** YDYO Sınav Sistemi – tek dosyalı paket (Motor.gs + Veri.gs + Portal.gs + Destek.gs + Sabit.gs + SabitPlan.gs + Duzeltme.gs + Birim.gs + Sinav.gs + HTML). Sürüm: 11 tablosu güncellemesi (17.11.2026) + Yeni sınav ve Derslikler (18.11.2026) + ortak şifre + sınav dokümanları + görevler ve e-postalar + sayfa içi onay (19.11.2026). */
/* ======================= Motor.gs ======================= */
/**
 * Motor.gs – konuşma sınavı yönlendirme ve notlandırma motoru.
 * Kurallar: konusma-sinavi-yonlendirme-kurallari.md ve claude/hoca-portali-ve-writing-grading.md (MehDer onaylı, 23–27.10.2026).
 * Deneme sürümüyle (02-Deneme Sistemi.html) aynı mantık; burada durum S sunucuda tutulur.
 * Global S (durum), S.day (bugünün sınav günü: 1, 2 ya da 0) ve S.T (dakika, İstanbul saati) her istekte Veri.gs tarafından kurulur.
 */
var SL = [810, 825, 840, 855, 885, 900, 915, 930, 945, 960]; // 13:30 … 16:00 (14:30–14:45 mola)
var GEC = 5, LASTPLAN = 8, RES = 9, LASTCALL = 945, MOLA = [870, 885];
/** S11 (MehDer 17.11.2026): 5–15 dk geç okutan boş jüri bekler (son çağrı LASTCALL); 15 dk'dan fazla geç okutan alınmaz (G);
 *  son planlı oturumda geç kalan yedek slotta girer. Yedek slotta, son oturumdaki her YEDEK_KISI öğrenci için o düzeyin 1 mevcut jürisi kalır (S18). */
var GEC_MAX = 15, YEDEK_KISI = 20;
/** Alternatif 3 ayarları (MehDer, 5.11.2026). Ayarlar › erkenGiris = HAYIR, gecKalanAl = HAYIR, ayniSinifOncelik = EVET.
 *  Boş bırakılırsa v9 davranışı (erken giriş açık, geç kalan boş jüri bekler, sınıf önceliği yok). */
var ERKEN_ACIK = true, GEC_AL = true, AYNI_SINIF = false, JURI_DK = 0;
function modAyarla_(a) { var h = function (v) { return /^(hay|h|no|false|0|kapal)/i.test(String(v || '').trim()); }, e = function (v) { return /^(evet|e|yes|true|1|açık|acik)/i.test(String(v || '').trim()); };
  ERKEN_ACIK = !h(a && a.erkenGiris); GEC_AL = !h(a && a.gecKalanAl); AYNI_SINIF = e(a && a.ayniSinifOncelik);
  var jd = Number(String((a && a.juriGosterDk) || '').replace(',', '.')); JURI_DK = jd > 0 ? jd : 0; }
/** Jüri ve derslik oturum saatinden JURI_DK dakika önce görünür (Ayarlar › juriGosterDk; boş/0 = eşleşir eşleşmez, v9). MehDer 6.11.2026. */
function juriAcik(k) { return !JURI_DK || S.T >= SL[k] - JURI_DK - 1e-9; }
/** Ayarlar › slotlar (ör. "13:00, 13:15, 13:30, 14:00") verilirse slot düzeni ondan kurulur: son slot yedek, ondan önceki son planlı slot ve son çağrı. Boşsa gerçek sınav düzeni (13:30–16:00) geçerlidir. */
function slotAyarla_(a) {
  modAyarla_(a);
  var t = String((a && a.slotlar) || '').split(/[,;\s]+/).filter(String);
  if (t.length < 2) { SL = [810, 825, 840, 855, 885, 900, 915, 930, 945, 960]; LASTPLAN = 8; RES = 9; LASTCALL = 945; MOLA = [870, 885]; return; }
  SL = t.map(function (x) { var p = x.split(':'); return Number(p[0]) * 60 + Number(p[1]); });
  RES = SL.length - 1; LASTPLAN = RES - 1; LASTCALL = SL[LASTPLAN]; MOLA = null;
}
var CRS = [['content', 'Content', 5], ['fluency', 'Fluency', 3], ['grammar', 'Grammatical Competence', 5], ['lexis', 'Lexical Competence', 5], ['inter', 'Interaction', 2]];
var CRW = [['content', 'Content', 5], ['org', 'Organization', 5], ['grammar', 'Grammatical Competence', 5], ['lexis', 'Lexical Competence', 5]];
// Özel durumlar – 13 Kasım 2026 birim toplantısı (MehDer 17.11.2026). [anahtar, ad, ölçekteki puan, 100'lük sabit (yoksa puan/ölçek×100)]
// "1 out of 20" A/B'de 20 üzerinden 1 (100'lük 5); C/D2/D1 speaking'de 18 üzerinden 1 (100'lük 6). "1 out of 100": 100'lük 1.
var OZS = [['G', 'Girmedi', null], ['ilgisiz', 'Tamamen ilgisiz konulardan konuştu', 1], ['az', 'Değerlendirilemeyecek kadar az dil üretti', 1], ['red', 'Konuşmayı reddetti, sorulara cevap vermedi (100 üzerinden 1)', 'Y']];
var OZW = [['G', 'Girmedi', null], ['ezber', 'Tamamen ezber cevap (konu soruyla ilgisiz ve/veya görevi yapmıyor)', 1], ['az', 'Çok az cümle (görevi gereklerine uygun denemiyor)', 1], ['bos', 'Boş kâğıt (yalnız ad ya da kelime/parça notlar) (100 üzerinden 1)', 'Y']];
var OZ_ESKI = { kisa: ['Değerlendirme yapamayacak kadar kısa (eski)', 4], hic: ['Hiç konuşmadı (eski)', 1], ilgisiz: ['Sorudaki konu ile tamamen ilgisiz (eski)', 5], bos: ['Boş kâğıt (eski)', 1] };
function ozBul_(OZ, k) { var o = OZ.filter(function (x) { return x[0] === k; })[0]; if (o) return o; var e = OZ_ESKI[k]; return e ? [k, e[0], e[1]] : null; }
function ozDeger_(o, max) { if (!o || o[2] == null) return null; if (o[2] === 'Y') return { fin: Math.round(max / 100 * 100) / 100, r100: 1 }; return { fin: o[2], r100: rnd(o[2] / max * 100) }; }
var UCUNCU_GRADER = true;   // writing: negotiation yok, fark > 2 ya da farklı özel durum → 3. grader (S19: koşul ve hesap sonra belirlenecek)
var S = null;

function slotEnd(k) { return SL[k] + 15; }
function crS(lv) { return (lv === 'A' || lv === 'B') ? CRS : CRS.slice(0, 4); }
function rnd(x) { return Math.floor(x + 0.5 + 1e-9); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function hhmm(m) { return pad2(Math.floor(m / 60 + 1e-9)) + ':' + pad2(Math.floor(m + 1e-9) % 60); }
function jName(j) { return j.lv + ' · Jüri ' + j.no; }
function initials(ad) { return ad.split(/\s+/).filter(String).map(function (w) { return w.charAt(0).toLocaleUpperCase('tr') + '.'; }).join(''); }
function tvTag(no) { return '…' + no.slice(-4) + ' ' + initials(S.stu[no].ad); }

var YON_AD = '';   // o anki yönetim işlemini yapan kişi (kişisel yönetim girişi, 17.11.2026)
function mlog(m) { S.log.unshift({ T: S.T, g: S.day, m: m + (YON_AD ? ' [' + YON_AD + ']' : '') }); if (S.log.length > 400) S.log.length = 400; }
function mtv(txt, late) { S.tv.unshift({ T: S.T, g: S.day, txt: txt, late: !!late }); if (S.tv.length > 60) S.tv.length = 60; }

function JD() { return S.juri.filter(function (j) { return j.gun === S.day; }); }
function jur(id) { for (var i = 0; i < S.juri.length; i++) if (S.juri[i].id === id) return S.juri[i]; return null; }
function dayStu() { return S.order.map(function (no) { return S.stu[no]; }).filter(function (s) { return s.gun === S.day; }); }
function pairsAt(jid, k) { var r = []; for (var id in S.pairs) { var p = S.pairs[id]; if (p.j === jid && p.k === k) r.push(p); } return r; }
function present(p) { return p.m.filter(function (x) { return x.g !== 'gelmedi' && !x.mv && !x.dv; }); }
/** Yer tutan üyeler: onay bekleyen erken davetliler (dv) dahil. */
function occ(p) { return p.m.filter(function (x) { return x.g !== 'gelmedi' && !x.mv; }).length; }
/** Tek başına sınav yok (MehDer): eşi henüz belli olmayan tek öğrencili çift – yedek slot ve yönetim ataması hariç. Jüri başlatamaz. */
function tekBekliyor_(p) {
  if (!p || p.bitti || p.k >= RES) return false;
  var uye = p.m.filter(function (x) { return x.g !== 'gelmedi' && !x.mv && !x.dv; });
  return uye.length === 1 && uye[0].src !== 'yönetim';
}
/** Öğrenci başka yoldan eşleşince bekleyen erken daveti sessizce düşer (2.11 denemesi: Hülya iki çifte birden girmişti). */
function davetIptal_(s, hedef) {
  if (!s.davet) return; var dp = S.pairs[s.davet]; s.davet = null; if (!dp) return;
  dp.m = dp.m.filter(function (x) { return !(x.no === s.no && x.dv); });
  if (dp !== hedef && !dp.m.length) delete S.pairs[dp.id];
  mlog(s.ad + ': kendi slotunda eşleşti – bekleyen erken daveti düştü.');
}
function occJ(jid, k) { return pairsAt(jid, k).reduce(function (a, p) { return a + occ(p); }, 0); }
function jOpen(j, k) { var c = S.closed[j.id]; return !(c && c.from <= k); }
function ekN(jid, k) { return S.ek[jid + '|' + k] || 0; }
function ekBlock(jid, k) { return k > 0 && ekN(jid, k - 1) > 0 && pairsAt(jid, k - 1).some(function (p) { return !p.bitti && occ(p) > 0; }); }
function loadJ(jid) { var n = 0; for (var id in S.pairs) { var p = S.pairs[id]; if (p.j === jid && (p.bitti || p.m.some(function (x) { return x.g === 'geldi'; }))) n++; } return n; }
function conflicts(j, nos) { return nos.filter(function (no) { return j.kacin.indexOf(S.stu[no].cls) >= 0; }).length; }
function curSlot() { var k = -1; for (var i = 0; i < SL.length; i++) if (S.T >= SL[i]) k = i; return k; }
function setName(lv, k) { return lv + ' – Set ' + (k + 1); }
function srcOf(s) { return s.st === 'gec' ? 'geç kaldı (' + Math.round(s.late) + ' dk)' : s.trans ? 'aktarıldı' : (s.early ? 'erken girdi' : ''); }
/** Erken girme düğmesi: öğrencinin kendi saatinden 15 dk öncesine kadar (MehDer, 31.10.2026). */
var ERKEN_SON = 15;
function erkenAcik(s) {
  if (typeof sabitMi_ === 'function' && sabitMi_(s)) { var p = S.pairs[s.pair]; return ERKEN_ACIK && s.st === 'atandi' && !!p && !s.trans && !s.erkenden && S.T < SL[p.k] - ERKEN_SON; }   // 2. kullanım (E2)
  return ERKEN_ACIK && s.st === 'bekle' && !s.trans && S.T < SL[s.eff] - ERKEN_SON; }

/* ---------------- eşleştirme ve jüri ---------------- */
function pickJury(lv, k, nos) {
  var c = JD().filter(function (j) { return j.lv === lv && jOpen(j, k) && occJ(j.id, k) === 0 && !ekBlock(j.id, k); });
  c.sort(function (a, b) { return conflicts(a, nos) - conflicts(b, nos) || loadJ(a.id) - loadJ(b.id) || a.no - b.no; });
  return c[0] || null;
}
function createPair(j, k, nos) {
  var p = { id: 'p' + (++S.pseq), sonEsT: S.T, j: j.id, k: k, gun: S.day, m: nos.map(function (no) { return { no: no, g: null, mv: null, src: srcOf(S.stu[no]) }; }), bitti: false, T: S.T };
  S.pairs[p.id] = p;
  nos.forEach(function (no) { davetIptal_(S.stu[no], p); });
  nos.forEach(function (no) { var s = S.stu[no]; s.st = 'atandi'; s.pair = p.id; s.eff = k; s.early = false; });
  mtv(nos.map(tvTag).join(' & ') + ' → ' + jName(j) + ' · Derslik ' + j.room + ' · ' + hhmm(SL[k]));
  mlog(nos.map(function (no) { return S.stu[no].ad; }).join(' & ') + ' → ' + jName(j) + ' (Derslik ' + j.room + '), ' + hhmm(SL[k]) + ' slotu' + (nos.length === 1 ? ' (tek başına)' : '') + '.');
  return p;
}
function makePair(nos, k0) {
  var lv = S.stu[nos[0]].lv;
  for (var k = k0; k <= RES; k++) { var j = pickJury(lv, k, nos); if (j) return createPair(j, k, nos); }
  mlog(nos.map(function (no) { return S.stu[no].ad; }).join(' & ') + ': uygun boş jüri bulunamadı, beklemede.');
  return null;
}
function byTrans(a, b) { return (b.trans - a.trans) || (a.scanT - b.scanT); }
function pairUp(s) {
  if (s.st !== 'bekle') return;
  var c = dayStu().filter(function (o) { return o !== s && o.lv === s.lv && o.st === 'bekle' && o.eff === s.eff; }).sort(byTrans);
  if (AYNI_SINIF) {   // önce sınıf arkadaşı; slot saatinden önce sınıf arkadaşı yoksa bekler (MehDer, 5.11.2026)
    var ayni = c.filter(function (o) { return o.cls === s.cls; });
    if (ayni.length) { makePair([ayni[0].no, s.no], s.eff); return; }
    if (S.T < SL[s.eff]) {
      for (var id0 in S.pairs) { var p0 = S.pairs[id0]; if (p0.k !== s.eff || p0.bitti || p0.gun !== S.day) continue; var j0 = jur(p0.j), pr = present(p0);
        if (j0.lv === s.lv && jOpen(j0, p0.k) && !ekBlock(j0.id, p0.k) && occ(p0) === 1 && pr.length === 1 && S.stu[pr[0].no].cls === s.cls) { addToPair(p0, s); return; } }
      return;
    }
  }
  if (c.length) { makePair([c[0].no, s.no], s.eff); return; }
  // eşi bekleyen biri yoksa: aynı slotta yarım kalmış bir çift (erken davetli ya da eşi gelmeyen) varsa ona katılır
  for (var id in S.pairs) { var p = S.pairs[id]; if (p.k !== s.eff || p.bitti || p.gun !== S.day) continue; var j = jur(p.j);
    if (j.lv === s.lv && jOpen(j, p.k) && !ekBlock(j.id, p.k) && occ(p) === 1 && present(p).length === 1) { addToPair(p, s); return; } }
}
function transfer(s, k) {
  s.eff = k + 1; s.trans = true; s.st = 'bekle'; s.pair = null; s.early = false;
  mlog(s.ad + ': eşleştirme yapılamadı; ' + hhmm(SL[k + 1]) + ' slotunda öncelikli.');
  pairUp(s);
}
/** Öğrenci QR okuttu. Dönüş: {err} | {wrong:true} | {} */
function scan(no) {
  var s = S.stu[no];
  if (!s) return { err: 'Bu numara sınav listesinde yok. Numaranı kontrol et ya da kayıt masasına git.' };
  if (s.gun !== S.day) return { wrong: true };
  if (sabitMi_(s)) return sabitScan_(s);   // Alternatif 5: sabit plan (MehDer 9.11.2026)
  if (s.st !== 'yok') return {};
  s.scanT = S.T; var k = s.plan;
  if (S.T > SL[k] + GEC) {
    s.late = S.T - SL[k];
    if (s.late > GEC_MAX + 1e-9) { s.st = 'red'; mlog(s.ad + ': ' + Math.round(s.late) + ' dk geç okuttu (' + GEC_MAX + " dk'dan fazla) – sınava alınmaz (G)."); mtv(tvTag(no) + ': Sınava geç kaldın', true); return {}; }
    if (k === LASTPLAN) { s.st = 'bekle'; s.eff = RES; s.trans = true; s.yedekSlot = true; mlog(s.ad + ': son oturuma ' + Math.round(s.late) + ' dk geç okuttu → ' + hhmm(SL[RES]) + ' yedek slotunda girecek.'); mtv(tvTag(no) + ': Sınava geç kaldın, cep telefonu sınav ekranını takip et', true); pairUp(s); return {}; }
    if (S.T >= LASTCALL) { s.st = 'red'; mlog(s.ad + ': ' + Math.round(s.late) + ' dk geç okuttu (' + hhmm(LASTCALL) + ' sonrası) – bugün sınava alınamaz.'); }
    else { s.st = 'gec'; mlog(s.ad + ': ' + Math.round(s.late) + ' dk geç okuttu – boş jüri bekliyor.'); }
    mtv(tvTag(no) + ': Sınava geç kaldın, cep telefonu sınav ekranını takip et', true);
  } else {
    s.st = 'bekle'; s.eff = k; mlog(s.ad + ' okuttu (grup ' + hhmm(SL[k]) + ').'); pairUp(s);
  }
  return {};
}
function toggleEarly(no) {
  var s = S.stu[no]; if (!s || !erkenAcik(s)) return;
  if (s.davet) davetBirak_(s, false);
  s.early = !s.early; s.earlyT = S.T; if (s.early) s.kayip = null;
  mlog(s.ad + ': "Erken girmeye hazırım" ' + (s.early ? 'işaretledi' : 'işaretini kaldırdı') + '.');
}
function pendingCount(lv, k) { return dayStu().filter(function (s) { return s.lv === lv && ((s.st === 'yok' && s.plan === k) || (s.st === 'bekle' && s.eff === k)); }).length; }
function candidates(lv, k, mode) {
  var all = dayStu().filter(function (s) { return s.lv === lv; });
  var A = (mode === 'start' && k !== RES) ? [] : all.filter(function (s) { return s.st === 'bekle' && (s.eff === k || (mode === 'gelmedi' && s.trans && s.eff === k + 1)); }).sort(byTrans);
  var B = erkenAdaylar_(lv, k);
  var C = (k <= LASTPLAN && S.T <= LASTCALL + 1e-9) ? all.filter(function (s) { return s.st === 'gec'; }).sort(function (a, b) { return a.late - b.late || a.scanT - b.scanT; }) : [];
  return A.map(function (s) { return { s: s, t: 'a' }; }).concat(B.map(function (s) { return { s: s, t: 'b' }; }), C.map(function (s) { return { s: s, t: 'c' }; }));
}
function addToPair(p, s) {
  davetIptal_(s, p);
  var j = jur(p.j), uye = { no: s.no, g: null, mv: null, src: srcOf(s) };
  for (var id in S.pairs) { var q = S.pairs[id]; if (q === p || q.k !== p.k) continue;   // aynı slotta başka jürinin kapısından geliyor (birleştirme)
    q.m.forEach(function (x) { if (x.no === s.no && x.mv) { var jq = jur(q.j); x.kapi = s.ad + "'yi Derslik " + j.room + ' (' + jName(j) + ') gönderin.'; x.mv = '→ ' + jName(j) + ' · Derslik ' + j.room; uye.src = 'birleştirme'; uye.kapi = s.ad + ' size geliyor (Derslik ' + jq.room + "'den)."; } }); }
  p.m.push(uye); p.sonEsT = S.T; s.st = 'atandi'; s.pair = p.id; s.eff = p.k; s.early = false; mtv(tvTag(s.no) + ' → ' + jName(j) + ' · Derslik ' + j.room + ' · şimdi');
  mlog(s.ad + ' (' + (srcOf(s) || 'zamanında') + ') boşalan yere çağrıldı → ' + jName(j) + ', ' + hhmm(SL[p.k]) + ' slotu.');
}
function fillSeats(lv, k, mode, onlyJ) {
  var js = JD().filter(function (j) { return j.lv === lv && jOpen(j, k) && !ekBlock(j.id, k); });
  if (onlyJ) js = js.filter(function (j) { return j.id === onlyJ; });
  var Q = candidates(lv, k, mode);
  js.forEach(function (j) {
    pairsAt(j.id, k).forEach(function (p) {
      if (p.bitti || occ(p) !== 1 || !Q.length) return;
      var i = -1; for (var x = 0; x < Q.length; x++) if (j.kacin.indexOf(Q[x].s.cls) < 0) { i = x; break; }
      if (i < 0) i = 0;
      var q = Q.splice(i, 1)[0];
      if (q.t === 'b') davetEt_(q.s, p, k); else addToPair(p, q.s);
    });
  });
  var empties = js.filter(function (j) { return occJ(j.id, k) === 0; }).sort(function (a, b) { return loadJ(a.id) - loadJ(b.id) || a.no - b.no; });
  if (mode === 'start' && k !== RES) { var avail = empties.length - Math.ceil(pendingCount(lv, k) / 2); empties = avail > 0 ? empties.slice(0, avail) : []; }
  var leftA = [];
  Q = Q.filter(function (t) { return t.t !== 'b'; });   // erken adaylar boş jüriye yalnız sınav saatinden önce (davetIsle_) davet edilir
  while (empties.length && Q.length) {
    var take = [Q.shift()]; if (Q.length) take.push(Q.shift());
    if (take.length === 1) {   // tek başına sınav yok (MehDer, 31.10.2026): yalnız yedek (son) slotta mecburen tek
      if (take[0].t === 'a' && k < RES) { leftA.push(take[0].s); break; }
      if (take[0].t !== 'a') break;
    }
    var nos = take.map(function (t) { return t.s.no; });
    empties.sort(function (a, b) { return conflicts(a, nos) - conflicts(b, nos) || loadJ(a.id) - loadJ(b.id) || a.no - b.no; });
    createPair(empties.shift(), k, nos);
  }
  if (mode === 'cut') {
    Q.filter(function (t) { return t.t === 'a'; }).forEach(function (t) { leftA.push(t.s); });
    leftA.forEach(function (s) { if (s.st === 'bekle' && s.eff === k) { if (k === LASTPLAN && ucuncuOgrenci_(s, k)) return; if (k < RES) transfer(s, k); else mlog(s.ad + ': yedek slotta jüri bulunamadı – yönetime bildirildi.'); } });
    js.forEach(function (j) { pairsAt(j.id, k).forEach(function (p) { yalnizKontrol_(p); }); });
  }
}
/** Aynı sınıf önceliği açıkken slot saatinde, sınıf arkadaşını bekleyen öğrenciler sınıfa bakılmadan eşleşir (aktarılan önce). */
function slotBasiEsle_(k) {
  if (!AYNI_SINIF) return;
  (S.cfg.gunler[S.day].lv || []).forEach(function (lv) {
    var L = dayStu().filter(function (s) { return s.lv === lv && s.st === 'bekle' && s.eff === k; }).sort(byTrans);
    while (L.length >= 2) { var a = L.shift(), b = L.shift(); if (!makePair([a.no, b.no], k)) break; }
    L.forEach(function (s) { if (s.st === 'bekle') pairUp(s); });
  });
}
function roundAll(k, mode) { (S.cfg.gunler[S.day].lv || []).forEach(function (lv) { fillSeats(lv, k, mode); }); }
function closeFrom(k) {
  (S.cfg.gunler[S.day].lv || []).forEach(function (lv) {
    var open = JD().filter(function (j) { return j.lv === lv && jOpen(j, k); });
    var keep = open.filter(function (j) { return occJ(j.id, k) > 0; });
    var pend = dayStu().filter(function (s) { return s.lv === lv && ((s.st === 'yok' && s.plan === k) || (s.st === 'bekle' && s.eff === k) || (k === LASTPLAN && s.st === 'gec')); }).length;
    var need = keep.length + Math.ceil(pend / 2);
    if (k === RES) need = Math.max(need, yedekJuriSayisi_(lv));   // S11/S18: son oturumdaki her 20 öğrenci için 1 jüri yedek slotta
    if (need >= open.length) return;
    var others = open.filter(function (j) { return keep.indexOf(j) < 0; }).sort(k === RES ? yedekSira_ : function (a, b) { return loadJ(a.id) - loadJ(b.id) || a.no - b.no; });
    others.slice(need - keep.length).forEach(function (j) { S.closed[j.id] = { from: k, T: S.T }; mlog(jName(j) + ': ' + hhmm(SL[k]) + ' slotu için gerek kalmadı – "Bu jüride sınavlar tamamlanmıştır" mesajı gönderildi.'); });
  });
}
/** Yedek slotta görev yapacak jüri sayısı: son planlı oturumdaki öğrenci sayısı / YEDEK_KISI (yukarı yuvarlanır, en az 1). */
function yedekJuriSayisi_(lv) { var n = dayStu().filter(function (s) { return s.lv === lv && s.plan === LASTPLAN; }).length; return Math.max(1, Math.ceil(n / YEDEK_KISI)); }
/** Yedek slot jürisi önerisi (S18): yönetimin işaretlediği (j.yedek) önce; sonra son oturumda çifti olmayan / son oturumu en erken biten; eşitlikte en az çift almış. */
function sonBitis_(j) { var t = -1; pairsAt(j.id, LASTPLAN).forEach(function (p) { t = Math.max(t, p.bitti ? (p.bittiT || p.bitisT || S.T) : 1e9); }); return t; }
function yedekSira_(a, b) { return (!!b.yedek - !!a.yedek) || sonBitis_(a) - sonBitis_(b) || loadJ(a.id) - loadJ(b.id) || a.no - b.no; }
function lastCall() { dayStu().filter(function (s) { return s.st === 'gec'; }).forEach(function (s) { s.st = 'alinamadi'; mlog(s.ad + ': ' + hhmm(LASTCALL) + "'e kadar boş jüri olmadı – sınava alınamadı."); }); }
function eventList() {
  if (sabitGun_()) return sabitOlaylar_();
  var E = [];
  for (var k = 0; k < SL.length; k++) {
    (function (k) { if (JURI_DK) E.push({ t: SL[k] - JURI_DK, o: -1, key: 'a' + k, f: function () {} });   // jüri/derslik açıklanır: ekran kopyaları yenilensin
      E.push({ t: SL[k], o: 0, key: 's' + k, f: function () { slotBasiEsle_(k); roundAll(k, 'start'); } }); E.push({ t: SL[k] + GEC, o: 1, key: 'c' + k, f: function () { roundAll(k, 'cut'); } }); })(k);
  }
  E.push({ t: SL[LASTPLAN - 1] + GEC, o: 2, key: 'close8', f: function () { closeFrom(LASTPLAN); } });
  E.push({ t: LASTCALL, o: 3, key: 'lastcall', f: lastCall });
  E.push({ t: SL[LASTPLAN] + GEC, o: 2, key: 'close9', f: function () { closeFrom(RES); } });
  return E.sort(function (a, b) { return a.t - b.t || a.o - b.o; });
}
/** Saati gelen olayları sırayla işler. Değişiklik olduysa true. */
function processEv() {
  if (!S.day) return false;
  if (typeof saatKilidi_ === 'function' && saatKilidi_()) return false;   // saat kilidi (11.11.2026)
  var now = S.T, ch = false, E = eventList();
  for (var i = 0; i < E.length; i++) {
    var e = E[i], key = 'g' + S.day + ':' + e.key;
    if (e.t <= now + 1e-9 && !S.done[key]) { S.done[key] = 1; S.T = e.t; davetIsle_(); e.f(); ch = true; }
  }
  S.T = now; if (davetIsle_()) ch = true; if (otoBitir_()) ch = true; return ch;
}
/* ---------------- otomatik SINAV BİTTİ (MehDer 7.11.2026) ----------------
   Çiftteki bütün öğrencilerin notu kesinleşince (canFinish boş) sistem bekler, hoca basmazsa kendisi bitirir:
   notlar slot bitiş saatinden önce kesinleştiyse 2 dk, slot saati sarkmışsa 1 dk. */
function otoBekle_(p) { return p.hazirT >= slotEnd(p.k) ? 1 : 2; }
function otoBitirSaati_(p) { return p.hazirT == null ? null : p.hazirT + otoBekle_(p); }
/** Çiftin jürisi ve öğrencileri durumda var mı (eski deneme/yük testi artığı çiftler atlanır; 7.11.2026 TV hatası). */
function ciftGecerli_(p) { return !!(p && !p.sabit && jur(p.j) && p.m.every(function (x) { return !!S.stu[x.no]; })); }
function otoBitir_() {
  if (!S.day) return false; var ch = false;
  for (var id in S.pairs) { var p = S.pairs[id]; if (p.gun !== S.day || p.bitti || !ciftGecerli_(p)) continue;
    if (canFinish(p).length) { if (p.hazirT != null) { delete p.hazirT; ch = true; } continue; }
    if (p.hazirT == null) { p.hazirT = S.T; ch = true; continue; }
    if (S.T >= otoBitirSaati_(p) - 1e-9 && !finish(p.id)) { p.oto = true; mlog(jName(jur(p.j)) + ': ' + hhmm(SL[p.k]) + ' çifti otomatik SINAV BİTTİ (notlar kesinleşti, hoca basmadı).'); ch = true; }
  }
  return ch;
}
/** Unutulan jüri işlemleri: oturum saatinden 5 dk sonra Geldi/Gelmedi işaretlenmemiş öğrenci (önceki çifti bitmiş jüride). */
var ISARET_DK = 5;
function isaretUnutuldu_(p) {
  if (p.bitti || S.T < SL[p.k] + ISARET_DK) return false;
  var onceki = Object.keys(S.pairs).some(function (id) { var q = S.pairs[id]; return q.j === p.j && q.gun === p.gun && q.k < p.k && !q.bitti && present(q).length; });
  return !onceki && p.m.some(function (x) { return !x.dv && !x.mv && x.g == null; });
}

/* ---------------- jüri işlemleri ---------------- */
function markGeldi(pid, no) {
  var p = S.pairs[pid], x = p && p.m.filter(function (x) { return x.no === no; })[0]; if (!x || x.mv || x.dv || p.bitti) return 'İşlem yapılamadı.';
  if (tekBekliyor_(p)) return 'Bu öğrencinin eşi henüz belli değil; tek öğrenciyle sınava başlamayın. Sistem eş atayınca "Geldi" açılır.';
  x.g = 'geldi';
  present(p).forEach(function (y) { if (y.g !== 'geldi') S.stu[y.no].cagri = S.T; });   // gelmeyen eşin telefonunda "Jürin seni bekliyor!"
  return '';
}
/** Çağırma anı: slot saati ya da jürinin önceki çiftinin SINAV BİTTİ anı (hangisi geçse). Önceki çift bitmediyse null. */
function cagirmaAni(p) {
  var t = SL[p.k], acik = true;
  for (var id in S.pairs) { var q = S.pairs[id]; if (q.j !== p.j || q.k >= p.k || !present(q).length) continue; if (!q.bitti) acik = false; else if (q.bittiT > t) t = q.bittiT; }
  return acik ? t : null;
}
function gelmediAcilis(p) { var c = cagirmaAni(p); return c == null ? null : c + GEC; }
function markGelmedi(pid, no) {
  var p = S.pairs[pid], x = p && p.m.filter(function (x) { return x.no === no; })[0];
  if (!x || x.mv || p.bitti) return 'İşlem yapılamadı.';
  var ac = gelmediAcilis(p);
  if (ac == null) return '"Gelmedi", önceki çiftin SINAV BİTTİ\'sinden 5 dakika sonra açılır.';
  if (S.T < ac - 1e-9) return '"Gelmedi" ' + hhmm(ac) + "'te açılır.";
  var s = S.stu[no], j = jur(p.j); x.g = 'gelmedi'; s.st = 'gelmedi'; var r = grec('S:' + no); r.fin = 'G'; r.abs = true;
  mlog(jName(j) + ': ' + s.ad + ' "Gelmedi" işaretlendi.');
  fillSeats(s.lv, p.k, 'gelmedi', p.j);
  yalnizKontrol_(p);
  return '';
}
/** Tek başına sınav yok (MehDer, 31.10.2026). Çiftte tek öğrenci kaldıysa (yanına davet beklenmiyorsa):
 *  1) aynı slotta aynı durumda başka bir tek öğrenci varsa ikisi bir jüride birleştirilir,
 *  2) erken davetle gelmiş öğrenci kendi saatine döner, 3) değilse bir sonraki slota aktarılır (orada ilk sırada),
 *  4) yedek (son) slotta mecburen tek girer. */
function yalnizKontrol_(p) {
  if (!p || p.bitti) return;
  var pres = present(p);
  if (pres.length !== 1 || p.m.some(function (x) { return x.dv && !x.mv; })) return;
  if (S.T < SL[p.k] + GEC - 1e-9) return;   // grubun geç kalma süresi dolmadan karar verilmez
  var y = pres[0], ys = S.stu[y.no], j = jur(p.j);
  if (p.k >= RES) { if (!y.tekNot) { y.tekNot = true; mlog(ys.ad + ': yedek slotta eş yok – mecburen tek başına sınava giriyor.'); } return; }
  var es = null;
  for (var id in S.pairs) { var q = S.pairs[id]; if (q === p || q.bitti || q.k !== p.k || jur(q.j).lv !== j.lv || !jOpen(jur(q.j), q.k)) continue; var qp = present(q); if (qp.length === 1 && occ(q) === 1) { es = q; break; } }
  if (es) {   // birleştirme: bu öğrenci diğer jüriye gider
    var j2 = jur(es.j);
    y.mv = '→ ' + jName(j2) + ' · Derslik ' + j2.room; y.kapi = ys.ad + "'yi Derslik " + j2.room + ' (' + jName(j2) + ') gönderin.';
    es.m.push({ no: y.no, g: null, mv: null, src: 'birleştirme', kapi: ys.ad + ' size geliyor (Derslik ' + j.room + "'den)." });
    ys.pair = es.id; ys.cagri = null;
    mtv(tvTag(y.no) + ' → ' + jName(j2) + ' · Derslik ' + j2.room + ' · şimdi');
    mlog(ys.ad + ': eşi yok – ' + jName(j) + "'den " + jName(j2) + ' (Derslik ' + j2.room + ') çiftine birleştirildi.');
    return;
  }
  if (ys.erkenden != null && ys.erkenden > p.k) {   // erken davetli: kendi saatine döner
    y.mv = '→ kendi saatine (' + hhmm(SL[ys.erkenden]) + ') döndü'; y.kapi = ys.ad + ' kendi saatine (' + hhmm(SL[ys.erkenden]) + ') döndü. Kapıdaki öğrenciye telefonunu takip etmesini söyleyin.';
    ys.st = 'bekle'; ys.eff = ys.erkenden; ys.erkenden = null; ys.pair = null; ys.early = false; ys.cagri = null; ys.donus = p.k;
    mlog(ys.ad + ': erken girdiği slotta eş yok – kendi saatine (' + hhmm(SL[ys.eff]) + ') döndü.'); pairUp(ys); return;
  }
  y.mv = '→ ' + hhmm(SL[p.k + 1]) + ' slotuna aktarıldı'; y.kapi = ys.ad + ' bir sonraki slota (' + hhmm(SL[p.k + 1]) + ') aktarıldı. Kapıdaki öğrenciye telefonunu takip etmesini söyleyin.';
  ys.cagri = null; transfer(ys, p.k);
}

/** Son planlı slotta (15:45) tek sayı (MehDer, 1.11.2026): eşsiz kalan öğrenci, yedek slotta (16:00) bekleyen biri yoksa
 *  aynı düzeyde bu slotun en son eşleşen çiftine 3. öğrenci olarak eklenir; yedekte bekleyen varsa yedeğe gider (false döner). */
function ucuncuOgrenci_(s, k) {
  var yedekte = dayStu().some(function (o) { return o !== s && o.lv === s.lv && o.st === 'bekle' && o.eff === RES; });
  if (yedekte) return false;
  var ps = []; for (var id in S.pairs) { var p = S.pairs[id]; if (p.k === k && !p.bitti && jur(p.j).lv === s.lv && jOpen(jur(p.j), k) && present(p).length === 2 && occ(p) === 2) ps.push(p); }
  if (!ps.length) return false;
  ps.sort(function (a, b) { return (b.sonEsT != null ? b.sonEsT : b.T) - (a.sonEsT != null ? a.sonEsT : a.T); });
  var p = ps[0], j = jur(p.j);
  p.m.push({ no: s.no, g: null, mv: null, src: '3. öğrenci', kapi: s.ad + ' son slotta tek kaldığı için çiftinize 3. öğrenci olarak eklendi. Sınavı üç öğrenciyle yapın; gerekirse "Ek süre" düğmesini kullanın.' });
  s.st = 'atandi'; s.pair = p.id; s.eff = k; s.early = false;
  mtv(tvTag(s.no) + ' → ' + jName(j) + ' · Derslik ' + j.room + ' · şimdi');
  mlog(s.ad + ': son slotta eşsiz – ' + jName(j) + ' (Derslik ' + j.room + ') çiftine 3. öğrenci olarak eklendi.');
  return true;
}

/* ---------------- erken giriş daveti (MehDer, 31.10.2026) ----------------
 * "Erken girmeye hazırım" diyen öğrenci, kendi saatinden önceki herhangi bir slotta yer olursa davet edilir.
 * Davet yer tutar ama öğrenci onaylayana kadar jüriye atanmaz (jüri görmez, davette jüri no yok).
 * Onay süresi: erken bekleyen başka aday varsa 1 dk; yoksa davet edilen slotun başlangıcına kadar
 * (slot başladıktan sonra yapılan davette 2 dk). Süre dolarsa davet sıradakine geçer; öğrenci kendi saatinde girer. */
var DAVET_DK = 1, DAVET_GEC_DK = 2;
function erkenAdaylar_(lv, k) {
  return dayStu().filter(function (s) { return s.lv === lv && s.early && !s.davet && s.eff > k && erkenAcik(s); })
    .sort(function (a, b) { return (a.earlyT || 0) - (b.earlyT || 0) || a.scanT - b.scanT; });
}
function davetEt_(s, p, k, j) {
  if (!p) { p = { id: 'p' + (++S.pseq), j: j.id, k: k, gun: S.day, m: [], bitti: false, T: S.T }; S.pairs[p.id] = p; }
  var son = S.T < SL[k] ? SL[k] : S.T + DAVET_GEC_DK;
  if (erkenAdaylar_(s.lv, k).filter(function (o) { return o !== s; }).length) son = Math.min(son, S.T + DAVET_DK);
  p.m.push({ no: s.no, g: null, mv: null, src: 'erken girdi', dv: true, dvT: S.T, dvSon: son });
  s.davet = p.id;
  mlog(s.ad + ': ' + hhmm(SL[k]) + ' slotuna erken davet edildi (onay bekleniyor, son ' + hhmm(son) + ').');
}
/** Davet süresi doldu ya da öğrenci vazgeçti: yer boşalır; kayip=true ise öğrenciye "hakkını kaybettin" mesajı. */
function davetBirak_(s, kayip) {
  var p = S.pairs[s.davet]; s.davet = null; if (!p) return;
  p.m = p.m.filter(function (x) { return !(x.no === s.no && x.dv); });
  if (kayip) { s.early = false; s.kayip = { k: p.k, T: S.T }; mlog(s.ad + ': ' + hhmm(SL[p.k]) + ' erken davetini onaylamadı – kendi saati (' + hhmm(SL[s.eff]) + ') geçerli.'); }
  if (!p.m.length) delete S.pairs[p.id];
}
function davetOnay(no) {
  var s = S.stu[no], p = s && s.davet && S.pairs[s.davet], x = p && p.m.filter(function (y) { return y.no === no && y.dv; })[0];
  if (!x) return 'Davetin süresi doldu.';
  if (p.sabit) return sabitDavetOnay_(s, p, x);
  if (s.st !== 'bekle') { davetIptal_(s, null); return 'Davetin süresi doldu.'; }
  x.dv = false; delete x.dvSon; s.davet = null; s.erkenden = s.eff; s.st = 'atandi'; s.pair = p.id; s.eff = p.k; s.early = false; s.kayip = null;
  var j = jur(p.j); mtv(tvTag(no) + ' → ' + jName(j) + ' · Derslik ' + j.room + ' · ' + hhmm(SL[p.k]));
  mlog(s.ad + ': erken daveti onayladı → ' + jName(j) + ' (Derslik ' + j.room + '), ' + hhmm(SL[p.k]) + ' slotu.');
  return '';
}
/** Her işlemde ve dakikalık tetikte: süresi dolan davetleri düşür, onay bekleyenlerin süresini kısalt, yeni davetler yap. */
function davetIsle_() {
  if (!S.day) return false;
  var ch = false;
  for (var id in S.pairs) { var p = S.pairs[id]; if (p.gun !== S.day) continue;
    p.m.slice().forEach(function (x) { if (!x.dv) return; var s = S.stu[x.no];
      if (x.dvSon > S.T + DAVET_DK && erkenAdaylar_(s.lv, p.k).length) { x.dvSon = S.T + DAVET_DK; ch = true; }
      if (S.T >= x.dvSon - 1e-9) { davetBirak_(s, true); ch = true;
        if (!p.sabit && S.T >= SL[p.k] && p.k <= RES) fillSeats(s.lv, p.k, 'gelmedi', p.j);   // başlamış slot: yer sıradakine
        if (S.pairs[p.id] && !p.sabit) yalnizKontrol_(p); } }); }
  if (typeof sabitGun_ === 'function' && sabitGun_()) { if (sabitErkenIsle_()) ch = true; return ch; }   // 2. kullanım: gönüllü çağrısı (E2)
  dayStu().forEach(function (s) {   // erken düğmesi kendi saatinden 15 dk önce kapanır: ekran güncellensin, istek düşsün
    if (s.st === 'bekle' && !s.trans && !s.erkenKapali && S.T >= SL[s.eff] - ERKEN_SON) { s.erkenKapali = true; if (s.early && !s.davet) s.early = false; ch = true; }
  });
  (S.cfg.gunler[S.day].lv || []).forEach(function (lv) {
    for (var k = 0; k <= LASTPLAN; k++) {
      if (S.T >= SL[k]) continue;   // başlamış slotların boş yerleri olaylarla (cut / Gelmedi) doldurulur
      var js = JD().filter(function (j) { return j.lv === lv && jOpen(j, k) && !ekBlock(j.id, k); });
      var guard = 0;
      while (guard++ < 60) {
        var A = erkenAdaylar_(lv, k); if (!A.length) break;
        var yarim = null; js.forEach(function (j) { pairsAt(j.id, k).forEach(function (p) { if (!yarim && !p.bitti && occ(p) === 1) yarim = p; }); });
        if (yarim) { davetEt_(A[0], yarim, k); ch = true; continue; }
        var bos = js.filter(function (j) { return occJ(j.id, k) === 0; }).sort(function (a, b) { return loadJ(a.id) - loadJ(b.id) || a.no - b.no; });
        var avail = bos.length - Math.ceil(pendingCount(lv, k) / 2);
        if (avail <= 0) break;
        davetEt_(A[0], null, k, bos[0]); ch = true;
      }
    }
  });
  return ch;
}
function canFinish(p) {
  var R = [], pres = present(p);
  if (!pres.length) R.push('Sınava giren öğrenci yok.');
  if (tekBekliyor_(p)) R.push('Eş bekleniyor – tek öğrenciyle sınav yapılmaz');
  pres.forEach(function (x) {
    var s = S.stu[x.no] || { ad: x.no }, r = S.gr['S:' + x.no];
    if (x.g !== 'geldi') R.push(s.ad + ' – "Geldi" işaretlenmedi');
    else if (!r || r.fin == null) {
      if (r && r.neg) R.push(s.ad + ' – yeniden değerlendirme gerekli (özel durum seçimleri farklı)');
      else if (r && r.tur > 1) R.push(s.ad + " – puan farkı 2'den fazla, yeniden değerlendirin");
      else if (r && (r.a.sub || r.b.sub)) R.push(s.ad + " – not bekleniyor (iki hocanın da HESAPLA'ya basması gerekir)");
      else R.push(s.ad + ' – not girilmedi');
    }
  });
  return R;
}
function finish(pid) {
  var p = S.pairs[pid]; if (!p || p.bitti) return 'İşlem yapılamadı.';
  var R = canFinish(p); if (R.length) return R.join('; ');
  p.bitti = true; p.bittiT = S.T; present(p).forEach(function (x) { S.stu[x.no].st = 'bitti'; });
  mlog(jName(jur(p.j)) + ': ' + hhmm(SL[p.k]) + ' çifti SINAV BİTTİ.'); return '';
}
function ekIste(jid, k) { var n = ekN(jid, k); if (n >= 2) return 'Ek süre en fazla iki kez istenebilir.'; S.ek[jid + '|' + k] = n + 1; mlog(jName(jur(jid)) + ': ' + (n ? 'ikinci kez ' : '') + 'ek süre (5 dk).'); return ''; }

/* ---------------- notlandırma (speaking + writing) ---------------- */
function grec(key) { return S.gr[key] || (S.gr[key] = { a: { c: {}, oz: null, sub: false }, b: { c: {}, oz: null, sub: false }, tur: 1, hl: [], neg: false, fin: null, avg: null, r100: null, abs: false, hist: [] }); }
function ctxS(no) { var C = crS(S.stu[no].lv); return { C: C, max: C.reduce(function (a, c) { return a + c[2]; }, 0), OZ: OZS }; }
var ctxW = { C: CRW, max: 20, OZ: OZW, w: true };
function totalOf(sd, C) { return C.reduce(function (a, c) { return a + (sd.c[c[0]] || 0); }, 0); }
function complete(sd, C) { return !!sd.oz || C.every(function (c) { return sd.c[c[0]] === Math.floor(sd.c[c[0]]) && sd.c[c[0]] != null; }); }
function canEditCrit(r, k, ctx) { return r.fin == null; }   // fark >2 ise bütün bentler yeniden açılır – speaking ve writing (MehDer, 2 Kasım denemesi; 7.11.2026); vurgulu bentler yine gösterilir
function setVal(r, side, k, val, ctx) {
  var sd = r[side]; if (sd.sub) return 'HESAPLA yapıldı; eşinizi bekleyin.';
  if (!canEditCrit(r, k, ctx)) return 'Bu bent kilitli.';
  if (val === '' || val == null) { delete sd.c[k]; return ''; }
  var c = ctx.C.filter(function (x) { return x[0] === k; })[0], v = Number(String(val).replace(',', '.'));
  if (!c) return 'Bilinmeyen bent.';
  if (v !== Math.floor(v) || v < 0 || v > c[2]) return c[1] + ': 0 ile ' + c[2] + ' arasında tam sayı girin (yarım puan yok).';
  sd.c[k] = v; return '';
}
function setOz(r, side, val) { var sd = r[side]; if (sd.sub || r.fin != null) return 'Kilitli.'; if (r.tur > 1 && !r.neg) return 'Kilitli.'; sd.oz = val || null; return ''; }
function submitGrade(r, side, ctx, by) {
  var sd = r[side]; if (r.fin != null || sd.sub) return '';
  if (!complete(sd, ctx.C)) return 'Tüm bentlere not girin ya da özel durum seçin.';
  sd.sub = true; r.hist.push({ T: S.T, at: new Date().toISOString(), side: side, by: by || '', oz: sd.oz, t: sd.oz ? null : totalOf(sd, ctx.C) });
  var o = side === 'a' ? 'b' : 'a'; if (r[o].sub) evaluate(r, ctx); return '';
}
function evaluate(r, ctx) {
  var a = r.a, b = r.b;
  if (!r.ilk) r.ilk = { a: { c: JSON.parse(JSON.stringify(a.c)), oz: a.oz }, b: { c: JSON.parse(JSON.stringify(b.c)), oz: b.oz } };   // ilk notlar (sonuç dosyası)
  var ucuncu = function () { r.ucuncu = true; r.neg = false; r.hl = []; };   // writing: 3. grader bekleniyor; bentler yeniden açılmaz
  if (a.oz || b.oz) {
    var oa = ozBul_(ctx.OZ, a.oz), ob = ozBul_(ctx.OZ, b.oz), va = ozDeger_(oa, ctx.max), vb = ozDeger_(ob, ctx.max);
    if (a.oz === 'G' && b.oz === 'G') { r.fin = 'G'; r.abs = true; r.neg = false; r.hl = []; return; }
    if (a.oz && b.oz && va && vb && va.r100 === vb.r100) { r.fin = va.fin; r.avg = va.fin; r.r100 = va.r100; r.neg = false; r.hl = []; return; }   // farklı ad ama aynı sonuç → anlaşma sayılır
    if (ctx.w && UCUNCU_GRADER) { ucuncu(); return; }
    r.neg = true; r.tur++; a.sub = b.sub = false; r.hl = []; return;
  }
  var ta = totalOf(a, ctx.C), tb = totalOf(b, ctx.C);
  if (Math.abs(ta - tb) <= 2) { r.avg = (ta + tb) / 2; r.fin = rnd(r.avg); r.r100 = rnd(r.fin / ctx.max * 100); r.neg = false; r.hl = []; r.ucuncu = false; }
  else if (ctx.w && UCUNCU_GRADER) { ucuncu(); }
  else { r.hl = ctx.C.filter(function (c) { return a.c[c[0]] !== b.c[c[0]]; }).map(function (c) { return c[0]; }); r.tur++; r.neg = false; a.sub = b.sub = false; }
}

/* ---------------- writing ---------------- */
function zarf(cls) { for (var i = 0; i < S.zarf.length; i++) if (S.zarf[i].cls === cls) return S.zarf[i]; return null; }
function wrDone(cls, side, by) {
  var z = zarf(cls); if (!z) return 'Zarf bulunamadı.';
  var miss = z.ogr.filter(function (no) { var r = grec('W:' + no); return !r.abs && !complete(r[side], CRW); });
  if (miss.length) return miss.length + ' öğrencinin notu eksik.';
  z.ogr.forEach(function (no) { var r = grec('W:' + no); if (!r.abs && !r[side].sub) { r[side].sub = true; r.hist.push({ T: S.T, at: new Date().toISOString(), side: side, by: by }); } });
  z[side === 'a' ? 'fDone' : 'sDone'] = true;
  if (z.fDone && z.sDone) z.ogr.forEach(function (no) { var r = grec('W:' + no); if (!r.abs && r.a.sub && r.b.sub && r.fin == null) evaluate(r, ctxW); });
  mlog('Writing ' + cls + ': ' + (side === 'a' ? 'first' : 'second') + ' grading tamamlandı (' + by + ').');
  return '';
}
function wrAbs(no, val, side) { var r = grec('W:' + no); if (val) { r.abs = true; r.fin = 'G'; r.absBy = side || null; } else { r.abs = false; r.fin = null; r.absBy = null; } return ''; }
/* ======================= Veri.gs ======================= */
/**
 * Veri.gs – durumun saklanması, kurulum, zaman bağlamı, sonuç ve bağlantı tabloları.
 * Durum (S) tek bir JSON belgesidir: önbellekte (CacheService, parçalı) ve gizli "_durum" sayfasında (parçalı) tutulur.
 * Her değişiklik LockService kilidi altında yapılır.
 */
var TZ = 'Europe/Istanbul';
var PARCA_ONBELLEK = 90000, PARCA_SAYFA = 45000;

function ss_() { return SpreadsheetApp.getActive(); }
function sayfa_(ad) { return ss_().getSheetByName(ad); }

/* ---------------- Ayarlar ---------------- */
function ayarlar_() {
  var c = CacheService.getScriptCache(), v = c.get('ayar');
  if (v) return JSON.parse(v);
  var sh = sayfa_('Ayarlar'), a = {};
  if (sh) sh.getDataRange().getDisplayValues().slice(1).forEach(function (r) { if (r[0]) a[String(r[0]).trim()] = String(r[1]).trim(); });
  c.put('ayar', JSON.stringify(a), 600);
  return a;
}
function ayarYaz_(anahtar, deger) {
  var sh = sayfa_('Ayarlar'), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === anahtar) { sh.getRange(i + 1, 2).setValue(deger); CacheService.getScriptCache().remove('ayar'); return; }
  sh.appendRow([anahtar, deger]); CacheService.getScriptCache().remove('ayar');
}

/* ---------------- zaman bağlamı ---------------- */
function baglam_() {
  var a = ayarlar_(), now = new Date(); slotAyarla_(a);
  var d = Utilities.formatDate(now, TZ, 'yyyy-MM-dd'), t = Utilities.formatDate(now, TZ, 'HH:mm:ss').split(':');
  var T = Number(t[0]) * 60 + Number(t[1]) + Number(t[2]) / 60, day = 0;
  if (d === a.gun1Tarih) day = 1; else if (d === a.gun2Tarih) day = 2; else if (a.gun3Tarih && d === a.gun3Tarih) day = 3;
  if (a.denemeGunu) {   // yalnızca denemede
    day = Number(a.denemeGunu); var ds = denemeSaat_();
    if (ds) T = ds.dk + (now.getTime() - ds.ms) / 60000 * ds.hiz; else T += Number(a.denemeSaatKaydirmaDk || 0);
  }
  S.saatFark = 0;
  if (!a.denemeGunu) {   // saat kilidi – ikinci okuma: ham milisaniyeden İstanbul saati (UTC+3, yaz saati yok) (11.11.2026)
    var T2 = ((now.getTime() / 60000 + 180) % 1440 + 1440) % 1440, f = T - T2;
    if (Math.abs(f) > 1 && Math.abs(f) < 1439) { S.saatFark = Math.round(f); T = Math.min(T, T2); }
  }
  S.day = day; S.T = T;
}

/* ---------------- deneme saati (yalnızca denemeGunu doluyken) ----------------
 * Saat, bir çapa anı (gerçek ms) + o andaki deneme dakikası + hız ile hesaplanır: T = dk + geçen gerçek dk × hız.
 * Hız 0 = durdur, 1 = normal, 5 = 1 gerçek dk 5 dk. Yönetim ekranından değiştirilir; Script Properties'te tutulur. */
function denemeSaat_() {
  var c = CacheService.getScriptCache(), v = c.get('dsaat');
  if (v == null) { v = PropertiesService.getScriptProperties().getProperty('denemeSaat') || ''; c.put('dsaat', v, 21600); }
  return v ? JSON.parse(v) : null;
}
function denemeSaatYaz_(o) { var v = o ? JSON.stringify(o) : ''; if (o) PropertiesService.getScriptProperties().setProperty('denemeSaat', v); else PropertiesService.getScriptProperties().deleteProperty('denemeSaat'); CacheService.getScriptCache().put('dsaat', v, 21600); }

/* ---------------- durum: okuma / yazma ---------------- */
/* Durum önbellekte iki parça halinde tutulur (yük testi 3.11):
 *  - SABİT: hocalar, jüriler, görevler, ayar özeti, öğrenci sırası ve öğrencilerin ad/sınıf/düzey/gün/grup bilgisi – yalnız kurulumda değişir;
 *  - DEĞİŞKEN: geri kalan her şey; öğrencilerde yalnız değişen alanlar, boş (null/false) alanlar yazılmaz.
 *  Değişken kısım iki tamponludur (A/B); her parçanın başında sürüm etiketi vardır, okuyan tek getAll ile ikisini de alır ve
 *  eksiksiz, aynı sürümlü en yeni tamponu seçer – yazma sırasında yarım okuma olmaz. Tek okuma, tek yazma çağrısı. */
var SABIT_ALAN = ['hoca', 'juri', 'gorev', 'cfg', 'order'], STU_SABIT = ['no', 'ad', 'cls', 'lv', 'gun', 'plan'],
  STU_VARSAYILAN = { scanT: null, early: false, eff: null, trans: false, late: null, pair: null }, DPARCA = 10, SPARCA = 3;   // dinamik durum en çok ~900 KB (MehDer 12.11 madde 5; eski sınır 5 parça ≈ 450 KB)
function durumOku_() {
  var c = CacheService.getScriptCache(), keys = ['S:sbm'];
  for (var i = 0; i < SPARCA; i++) keys.push('S:sb:' + i);
  ['A', 'B'].forEach(function (t) { keys.push('S:' + t + ':m'); for (var i = 0; i < DPARCA; i++) keys.push('S:' + t + ':' + i); });
  for (var deneme = 0; deneme < 3; deneme++) {
    var got = c.getAll(keys), sec = null;
    ['A', 'B'].forEach(function (t) {
      var m = String(got['S:' + t + ':m'] || '').split(':'); if (m.length !== 3) return;   // sürüm:parça:uzunluk
      var parca = []; for (var i = 0; i < Number(m[1]); i++) { var v = got['S:' + t + ':' + i]; if (v == null || v.slice(0, m[0].length + 1) !== m[0] + '|') return; parca.push(v.slice(m[0].length + 1)); }
      var js = parca.join(''); if (js.length !== Number(m[2])) return;
      if (!sec || m[0] > sec.v) sec = { v: m[0], t: t, js: js };
    });
    var sm = String(got['S:sbm'] || '').split(':'), sabit = null;
    if (sm.length === 3) { var sp = []; for (var k = 0; k < Number(sm[1]); k++) { var w = got['S:sb:' + k]; if (w == null) { sp = null; break; } sp.push(w); } if (sp && sp.join('').length === Number(sm[2])) sabit = { v: sm[0], js: sp.join('') }; }
    if (sec && sabit) { try { var d = JSON.parse(sec.js); if (d.sabitVer === sabit.v) { var r = durumBirlestir_(d, JSON.parse(sabit.js)); r._tampon = sec.t; return r; } } catch (e) { } }
    if (sec && !sabit && deneme === 2) break;
    if (!sec && !sabit) break;
    Utilities.sleep(150);
  }
  var sh = sayfa_('_durum');
  if (!sh || sh.getLastRow() < 1) throw new Error('Sistem kurulmamış. Menü: Sınav Sistemi › Kurulumu yap.');
  var tam = JSON.parse(sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return r[0]; }).join(''));
  // sabit kısım önbellekten düştüyse ama değişken kısım sağlamsa: değişken kısmı koru (tablo en çok 60 sn eski olabilir)
  if (sec) { try { var d2 = JSON.parse(sec.js), sb2 = { stu: {} }; if ((d2.rev || 0) < (tam.rev || 0) || (tam.kurulum && d2.kurulum && d2.kurulum !== tam.kurulum)) throw new Error('eski önbellek'); SABIT_ALAN.forEach(function (k) { sb2[k] = tam[k]; });
    tam.order.forEach(function (no) { var s = tam.stu[no]; sb2.stu[no] = [s.ad, s.cls, s.lv, s.gun, s.plan]; });
    tam = durumBirlestir_(d2, sb2); tam._tampon = sec.t; } catch (e) { } }
  if (typeof hocaEkUygula_ === 'function') hocaEkUygula_(tam);
  tam.sabitVer = null; var ksv = S; S = tam; try { onbellegeYaz_(); } finally { S = ksv; }   // önbelleği yeniden kur
  return tam;
}
function durumBirlestir_(d, sb) {
  SABIT_ALAN.forEach(function (k) { d[k] = sb[k]; });
  var stu = {};
  d.order.forEach(function (no) { var a = sb.stu[no], s = { no: no, ad: a[0], cls: a[1], lv: a[2], gun: a[3], plan: a[4] }, dv = (d.stu || {})[no] || {};
    for (var k in STU_VARSAYILAN) s[k] = STU_VARSAYILAN[k]; for (var k2 in dv) s[k2] = dv[k2]; stu[no] = s; });
  d.stu = stu; return typeof hocaEkUygula_ === 'function' ? hocaEkUygula_(d) : d;
}
/** Önbelleğe tek putAll ile yazar: değişken kısım (okunmayan tampona) + gerekirse sabit kısım + ek (ekran kopyaları). */
function onbellegeYaz_(ek) {
  var c = CacheService.getScriptCache(), o = ek || {}, kayit = [];
  if (!S.sabitVer) {
    S.sabitVer = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    var sb = { stu: {} }; SABIT_ALAN.forEach(function (k) { sb[k] = S[k]; });
    S.order.forEach(function (no) { var s = S.stu[no]; sb.stu[no] = [s.ad, s.cls, s.lv, s.gun, s.plan]; });
    var sjs = JSON.stringify(sb), n = 0;
    for (var i = 0; i < sjs.length; i += PARCA_ONBELLEK) o['S:sb:' + (n++)] = sjs.slice(i, i + PARCA_ONBELLEK);
    if (n > SPARCA) throw new Error('Sabit veri önbellek sınırını aşıyor.');
    o['S:sbm'] = S.sabitVer + ':' + n + ':' + sjs.length;
  }
  var d = {}; for (var k in S) if (SABIT_ALAN.indexOf(k) < 0 && k !== 'stu' && k !== '_tampon') d[k] = S[k];
  d.stu = {}; for (var no in S.stu) { var s = S.stu[no], x = {}, bos = true;
    for (var a in s) { if (STU_SABIT.indexOf(a) >= 0) continue; var v = s[a]; if (v === null || v === false || v === undefined) continue; x[a] = v; bos = false; }
    if (!bos) d.stu[no] = x; }
  S.rev = (S.rev || 0) + 1; d.rev = S.rev; d.dBoy = S.dBoy || 0;
  var js = JSON.stringify(d), t = S._tampon === 'A' ? 'B' : 'A', ver = ('00000000' + S.rev.toString(36)).slice(-8), m = 0;
  for (var j = 0; j < js.length; j += PARCA_ONBELLEK - 20) o['S:' + t + ':' + (m++)] = ver + '|' + js.slice(j, j + PARCA_ONBELLEK - 20);
  S.dBoy = js.length;   // doluluk göstergesi (yönetim › Sınav ayarları)
  if (m > DPARCA) throw new Error('Durum önbellek sınırını aşıyor.');
  o['S:' + t + ':m'] = ver + ':' + m + ':' + js.length;
  c.putAll(o, 21600); S._tampon = t;
}
/** Tabloya en çok dakikada bir yazılır (dakikalık tetikleyici de kirli kaydı yazar); önbellek her işlemde – tek çağrı. */
function durumYaz_(zorla, ek) {
  S.kayitZamani = new Date().toISOString();
  var simdi = Date.now(), tabloya = zorla || !S.sayfaT || simdi - S.sayfaT >= 60000;
  if (tabloya) S.sayfaT = simdi;
  ek = ek || {}; ek['S:kirli'] = tabloya ? '0' : '1';
  onbellegeYaz_(ek);
  if (tabloya) { var tb = S._tampon; delete S._tampon; try { sayfayaYaz_(JSON.stringify(S)); } finally { S._tampon = tb; } }
}
function sayfayaYaz_(json) {   // önce yaz, sonra fazla satırları sil (okuyan boş sayfa görmesin)
  var sh = sayfa_('_durum') || ss_().insertSheet('_durum'), rows = [];
  for (var i = 0; i < json.length; i += PARCA_SAYFA) rows.push([json.slice(i, i + PARCA_SAYFA)]);
  var eski = sh.getLastRow(); sh.getRange(1, 1, rows.length, 1).setValues(rows);
  if (eski > rows.length) sh.getRange(rows.length + 1, 1, eski - rows.length, 1).clearContent();
}
/** Değişiklik yapan her istek bu sarmalayıcıdan geçer. */
function islem_(fn) {
  var lock = LockService.getScriptLock(), t0 = Date.now();
  if (!lock.tryLock(28000)) throw new Error('MESGUL: Sistem şu an çok yoğun; işleminiz yapılmadı.');   // tarayıcı kendiliğinden yeniden dener
  var t1 = Date.now(), res, z = [];
  try {
    S = durumOku_(); baglam_(); if (typeof destekHazirla_ === 'function') destekHazirla_(); z.push(Date.now()); processEv(); z.push(Date.now());
    res = fn(); z.push(Date.now());
    var ekr = gorunumHazirla_(); z.push(Date.now()); durumYaz_(false, ekr); z.push(Date.now());
  } finally { lock.releaseLock(); }
  profilYaz_([t1 - t0, z[0] - t1, z[1] - z[0], z[2] - z[1], z[4] - z[3], z[3] - z[2]]);   // [bekleme, okuma, olaylar, işlem, kayıt, ekranlar]
  // yanıt görünümleri (jüri, yönetim ekranı) kilidi tutmadan hazırlanır: res.v bir işlevse burada çağrılır
  if (res && typeof res.v === 'function') res.v = res.v();
  return res;
}
/** Yük ölçümü: son 300 işlemin süreleri [bekleme, okuma, olaylar, işlem, kayıt, ekranlar] ms – yönetim › apiProfil. */
function profilYaz_(p) { try { var c = CacheService.getScriptCache(), a = JSON.parse(c.get('prof') || '[]'); a.push(p); if (a.length > 300) a = a.slice(-300); c.put('prof', JSON.stringify(a), 21600); } catch (e) { } }
/** Salt okuma; saati gelmiş olay varsa işleme dönüşür. */
function oku_(fn) {
  S = durumOku_(); baglam_();
  if (S.day && olayBekliyor_()) return islem_(fn);
  return fn();
}
function olayBekliyor_() {
  var E = eventList(); for (var i = 0; i < E.length; i++) if (E[i].t <= S.T && !S.done['g' + S.day + ':' + E[i].key]) return true;
  for (var id in S.pairs) { var p = S.pairs[id]; if (p.gun === S.day && p.m.some(function (x) { return x.dv && S.T >= x.dvSon - 1e-9; })) return true; }   // süresi dolan erken davet
  for (var id2 in S.pairs) { var q = S.pairs[id2]; if (q.gun !== S.day || q.bitti || !ciftGecerli_(q)) continue;   // otomatik SINAV BİTTİ
    if (q.hazirT == null ? !canFinish(q).length : (S.T >= otoBitirSaati_(q) - 1e-9 || canFinish(q).length)) return true; }
  return false;
}
/** Zaman tetikleyicisi (her dakika): olayları işler. */
function dakikalik() { var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return; try { S = durumOku_(); baglam_(); var kirli = CacheService.getScriptCache().get('S:kirli') === '1'; if (processEv() | gunSonuArsiv_() || SAAT_UYARI) { durumYaz_(true, gorunumHazirla_()); } else if (kirli) durumYaz_(true); } finally { lock.releaseLock(); } }

/* ---------------- önbellekteki hızlı görünümler (öğrenci telefonu, TV) ---------------- */
/** Öğrenci ekranlarının hazır kopyaları. Yalnız DEĞİŞEN ekranlar önbelleğe yazılır (3.11.2026: 700 öğrencide her işlemde
 *  bütün ekranları yeniden yazmak yükü öğrenci sayısıyla büyütüyordu). Kopya kaybolursa öğrenci ekranı canlı hesaplanır. */
function kisaOzet_(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length.toString(36); }
/** Değişen öğrenci ekranları + TV kopyası; özetler S.vh'de tutulur. Dönüş: önbelleğe yazılacak nesne (islem_ bunu durumla tek çağrıda yazar). */
function gorunumHazirla_() {
  var o = {}; if (!S.day) return o;
  if (!S.vh || S.vh.g !== S.day) S.vh = { g: S.day, h: {} };
  var eski = S.vh.h, yeni = {};
  dayStu().forEach(function (s) { if (s.st === 'yok') return; var v = JSON.stringify(ogrenciGorunum_(s)), h = kisaOzet_(v); yeni[s.no] = h; if (eski[s.no] !== h) o['o:' + s.no] = v; });
  S.vh.h = yeni;
  o['tv:' + S.day] = JSON.stringify(tvGorunum_());
  return o;
}
function gorunumleriYaz_() { var o = gorunumHazirla_(); if (Object.keys(o).length) { durumYaz_(false, o); } }

/* ---------------- kurulum ---------------- */
function tablo_(ad) {
  var sh = sayfa_(ad); if (!sh) throw new Error('"' + ad + '" sayfası yok.');
  var v = sh.getDataRange().getDisplayValues(), h = v[0].map(function (x) { return String(x).trim(); }); // görünen değerler: saat ve tarih metin olarak okunur
  return v.slice(1).filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = String(r[i]).trim(); }); return o; });
}
function rastgele_(n, alfabe) {
  alfabe = alfabe || 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var s = '', b = '';
  while (s.length < n) { if (b.length < 2) b = Utilities.getUuid().replace(/-/g, ''); s += alfabe.charAt(parseInt(b.substr(0, 2), 16) % alfabe.length); b = b.substr(2); }
  return s;
}
function ozet_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }

/** Menü: tablolardan durumu sıfırdan kurar. Hoca şifreleri ve bağlantıları korunur (korumak = true). */
function kurulumYap(korumaYok) { sahipKontrol_();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    CacheService.getScriptCache().remove('ayar');   // elle yazılan ayarlar (ör. yönetim şifresi) önbellek yüzünden kaçmasın
    var a = ayarlar_(), eski = null; slotAyarla_(a);
    try { eski = durumOku_(); } catch (e) { eski = null; }
    var H = tablo_('Hocalar'), O = tablo_('Ogrenciler'), J = tablo_('Juriler'), Z = tablo_('Zarflar'), G = tablo_('Gorevler');
    var hoca = {}, sinif = {};
    H.forEach(function (h) { hoca[h['HocaID']] = { ad: h['Ad Soyad'], eposta: h['E-posta'], tel: h['Telefon'], sonuc: (h['Sonuç listesi'] || '').split(/[,;]\s*/).filter(String), siniflar: (h['Sınıfları'] || '').split(/[,;]\s*/).filter(String) }; sinif[h['HocaID']] = (h['Sınıfları'] || '').split(/[,;]\s*/).filter(String); });
    var gunler = { 1: { tarih: a.gun1Tarih, ad: a.gun1Ad, lv: (a.gun1Duzeyler || '').split(/[,;]\s*/) }, 2: { tarih: a.gun2Tarih, ad: a.gun2Ad, lv: (a.gun2Duzeyler || '').split(/[,;]\s*/) } };
    if (a.gun3Tarih) gunler[3] = { tarih: a.gun3Tarih, ad: a.gun3Ad, lv: (a.gun3Duzeyler || '').split(/[,;]\s*/) };
    if (a.kagitDuzeyler) gunler.kagit = String(a.kagitDuzeyler).split(/[,;]\s*/).filter(String);
    var stu = {}, order = [];
    O.forEach(function (r) {
      var no = r['Öğrenci No'], gs = r['Grup saati'].slice(0, 5), m = Number(gs.split(':')[0]) * 60 + Number(gs.split(':')[1]), k = SL.indexOf(m);
      if (k < 0 || k > LASTPLAN) throw new Error(no + ': grup saati geçersiz (' + gs + ').');
      stu[no] = { no: no, ad: r['Ad Soyad'], cls: r['Sınıf'], lv: r['Düzey'], gun: Number(r['Gün']), plan: k, st: 'yok', scanT: null, early: false, eff: null, trans: false, late: null, pair: null };
      order.push(no);
    });
    var juri = J.map(function (r) {
      var h = [r['Hoca 1'], r['Hoca 2']], k = {};
      h.forEach(function (t) { if (!hoca[t]) throw new Error('Jüri ' + r['JüriID'] + ': hoca bulunamadı (' + t + ').'); (sinif[t] || []).forEach(function (c) { k[c] = 1; }); });
      return { id: r['JüriID'], gun: Number(r['Gün']), lv: r['Düzey'], no: Number(r['No']), room: r['Derslik'], h: h, kacin: Object.keys(k), yedek: /^(evet|e|x|1|yedek)/i.test(String(r['Yedek'] || '').trim()) };
    });
    var zarf = Z.map(function (r) { return { cls: r['Sınıf'], f: r['First'], s: r['Second'], fSon: r['First son'], sSon: r['Second son'], neg: r['Negotiation son'], ogr: order.filter(function (no) { return stu[no].cls === r['Sınıf']; }), fDone: false, sDone: false }; });
    var gorev = {}; G.forEach(function (r) { (gorev[r['HocaID']] = gorev[r['HocaID']] || []).push({ tarih: r['Tarih'], saat: r['Saat'], gorev: r['Görev'], yer: r['Yer / ayrıntı'] }); });
    var auth = (eski && !korumaYok && eski.auth) || {};
    Object.keys(hoca).forEach(function (t) { if (!auth[t]) auth[t] = { token: rastgele_(24), temp: rastgele_(8), salt: rastgele_(16), hash: null, fails: [], lockUntil: 0, firstAt: null, cihaz: [] }; });
    var yon = (eski && eski.yonetim) || null;
    if (a.yonetimSifresi) { var tuz = rastgele_(16); yon = { salt: tuz, hash: ozet_(tuz + '|' + a.yonetimSifresi) }; ayarYaz_('yonetimSifresi', ''); }
    if (!yon) throw new Error('Ayarlar › yonetimSifresi boş. Bir yönetim şifresi yazıp kurulumu tekrarlayın.');
    if (!a.gizli) ayarYaz_('gizli', rastgele_(32));
    S = { ver: 1, cfg: { sinav: a.sinavAdi, gunler: gunler }, hoca: hoca, juri: juri, stu: stu, order: order, pairs: {}, pseq: 0, gr: {}, done: {}, log: [], tv: [], ek: {}, closed: {},
      zarf: zarf, gorev: gorev, auth: auth, yonetim: yon, kurulum: new Date().toISOString(), hocaEk: (eski && eski.hocaEk) || {} };
    if (typeof hocaEkUygula_ === 'function') { for (var he in S.hocaEk) if (hoca[he] || Object.keys(hoca).some(function (t) { return String(hoca[t].eposta || '').toLowerCase() === String(S.hocaEk[he].eposta).toLowerCase(); })) delete S.hocaEk[he]; hocaEkUygula_(S); }   // Hocalar sayfasına eklenen birim üyesi ikinci kez eklenmez
    // önbellekteki eski durum yeni kurulumu ezmesin: sürüm sayacı eski durumdan devam eder, yazım öbür tampona yapılır (7.11.2026)
    if (eski) { S.rev = eski.rev || 0; S._tampon = eski._tampon; }
    var eskiEkran = ['tv:1', 'tv:2', 'tv:3']; order.concat(eski && eski.order || []).forEach(function (no) { eskiEkran.push('o:' + no); });
    CacheService.getScriptCache().removeAll(eskiEkran);   // TV ve öğrenci ekranlarının eski kopyaları
    S.day = 0; S.T = 0; mlog('Kurulum yapıldı: ' + order.length + ' öğrenci, ' + juri.length + ' jüri, ' + Object.keys(hoca).length + ' hoca, ' + zarf.length + ' zarf.');
    if (a.denemeGunu) denemeSaatYaz_({ ms: Date.now(), dk: SL[0] - 30, hiz: 0 });   // denemede saat ilk slottan 30 dk önce durur; yönetim başlatır
    durumYaz_(true);
    baglantiListesiYaz_();
    return 'Kurulum tamam: ' + order.length + ' öğrenci, ' + juri.length + ' jüri, ' + Object.keys(hoca).length + ' hoca.';
  } finally { lock.releaseLock(); }
}

/* ---------------- bağlantı listesi ve e-posta ---------------- */
/** Hoca/öğrenci/TV bağlantılarının adresi: Ayarlar › portalAdresi (GitHub Pages) doluysa o, değilse Google /exec adresi. */
function uygulamaAdresi_() { var a = ayarlar_(); return a.portalAdresi || a.uygulamaAdresi || ScriptApp.getService().getUrl(); }
function baglantiListesiYaz_() {
  var url = uygulamaAdresi_(), sh = sayfa_('Bağlantı Listesi') || ss_().insertSheet('Bağlantı Listesi');
  var rows = [['HocaID', 'Ad Soyad', 'E-posta', 'Kişisel bağlantı', 'Geçici şifre', 'İlk giriş']];
  Object.keys(S.hoca).sort(function (a, b) { return S.hoca[a].ad.localeCompare(S.hoca[b].ad, 'tr'); }).forEach(function (t) {
    var au = S.auth[t]; rows.push([t, S.hoca[t].ad, S.hoca[t].eposta, url + '?v=hoca&k=' + au.token, au.hash ? '(şifre belirlendi)' : au.temp, au.firstAt ? new Date(au.firstAt) : '']);
  });
  sh.clearContents(); sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}
/** Menü: e-posta önizlemesi (gönderMEZ). Alıcı listesi MehDer'in onayına sunulur. */
function epostaOnizleme() { sahipKontrol_();
  S = durumOku_(); var url = uygulamaAdresi_(), sh = sayfa_('E-posta Önizleme') || ss_().insertSheet('E-posta Önizleme');
  var rows = [['Alıcı', 'E-posta', 'Konu', 'Metin']];
  Object.keys(S.hoca).filter(epostaSecili_).forEach(function (t) { var m = epostaMetni_(t, url); rows.push([S.hoca[t].ad, S.hoca[t].eposta, m.konu, m.metin]); });
  sh.clearContents(); sh.getRange(1, 1, rows.length, 4).setValues(rows);
  return (rows.length - 1) + ' alıcı listelendi. Gönderim için Ayarlar › epostaOnay = EVET yazın (MehDer onayından sonra).';
}
/** Ayarlar › epostaSadece (HocaID listesi, virgülle) doluysa bağlantı e-postası yalnız bu hocalara gider (MehDer 8.11.2026: önce 10 portal hocası). */
function epostaSecili_(t) { var l = String(ayarlar_().epostaSadece || '').split(/[,;\s]+/).filter(String); return !l.length || l.indexOf(t) >= 0; }
function epostaMetni_(t, url) {   // ortak bağlantı + e-posta ile giriş (17.11.2026)
  var h = S.hoca[t], au = S.auth[t], a = ayarlar_();
  return { konu: (a.denemeGunu ? 'DENEME – ' : '') + 'YDYO Sınav Portalı – giriş bilgileriniz',
    metin: 'Sayın ' + h.ad + ',\n\nSpeaking not girişi, writing grading, yaklaşan sınav görevleriniz ve (birim üyeyseniz) birim çalışmaları YDYO Sınav Portalı üzerinden yürütülmektedir.' +
      '\n\nPortal adresi: ' + url + '\n"Hoca" düğmesine basın ve aşağıdaki bilgilerle giriş yapın.' +
      '\nKullanıcı adı: ' + h.eposta +
      '\nŞifre: ' + (au.hash ? 'daha önce belirlediğiniz şifre' : au.temp + ' (geçici şifre)') +
      (au.hash ? '' : '\n\nİlk girişte sistem sizden yeni bir şifre belirlemenizi isteyecektir (en az 6 karakter).') +
      (a.epostaEk ? '\n\n' + a.epostaEk : '') + '\n\nŞifrenizi unutursanız yönetimle görüşün; size yeni geçici şifre verilir.\n\nMehmet Duranlıoğlu\nMüdür Yardımcısı' };
}
/** Menü: e-postaları gönderir. Yalnızca Ayarlar › epostaOnay = EVET ise çalışır. */
/** Gönderen kişisel Google hesabı olduğunda günlük kota ~100 alıcı: Ayarlar › epostaGunlukSinir (varsayılan 80) kadar gönderir,
 *  gönderilenleri işaretler; kalan varsa ertesi gün aynı menüyle devam edilir. Yanıtlar Ayarlar › yanitAdresi'ne gider. */
function postaSecenek_() { var a = ayarlar_(), o = { name: 'YDYO Hazırlık – Sınav Sistemi' }; if (a.yanitAdresi) o.replyTo = a.yanitAdresi; return o; }
function epostalariGonder() { sahipKontrol_();
  var a = ayarlar_(); if (a.epostaOnay !== 'EVET') throw new Error('Gönderim için önce alıcı listesi onaylanmalı: Ayarlar › epostaOnay = EVET.');
  var sinir = Number(a.epostaGunlukSinir || 80), lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    S = durumOku_(); var url = uygulamaAdresi_(), n = 0, kalan = 0;
    try { var q = MailApp.getRemainingDailyQuota(); if (q < sinir) sinir = q; } catch (e) { }
    Object.keys(S.hoca).sort(function (x, y) { return S.hoca[x].ad.localeCompare(S.hoca[y].ad, 'tr'); }).forEach(function (t) {
      var au = S.auth[t]; if (!S.hoca[t].eposta || au.mailAt || !epostaSecili_(t)) return;
      if (n >= sinir) { kalan++; return; }
      var m = epostaMetni_(t, url); MailApp.sendEmail(S.hoca[t].eposta, m.konu, m.metin, postaSecenek_()); au.mailAt = Date.now(); n++; });
    mlog('Bağlantı e-postası: ' + n + ' gönderildi' + (kalan ? ', ' + kalan + ' kaldı.' : '.'));
    durumYaz_(true);
    if (!kalan) ayarYaz_('epostaOnay', 'gönderildi ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'));
    return n + ' e-posta gönderildi.' + (kalan ? ' ' + kalan + ' hoca kaldı (günlük sınır); yarın aynı menüyle devam edin.' : ' Tüm hocalara gönderildi.');
  } finally { lock.releaseLock(); }
}

/* ---------------- sonuçlar ---------------- */
/* ---------- Sonuç dosyaları (MehDer, 31.10.2026) ----------
 * Ayrıntılı (yönetim): uzlaşma öncesi alt bentler, bireysel toplamlar, ortalama; fark olanlarda uzlaşma sonrası alt bentler,
 * toplamlar, ortalama – uzlaşmada değişen hücreler SARI. BAUM: yalnız öğrenci no, ad soyad, nihai ortalama toplam not. */
var SARI = '#fff2a8';
function ayrintiliSatir_(r, C, OZ) {
  var ozAd = function (k) { var o = ozBul_(OZ, k); return o ? o[1] : k; };
  var taraf = function (sd) { if (!sd) return C.map(function () { return ''; }).concat(['']); if (sd.oz) return C.map(function () { return ''; }).concat([ozAd(sd.oz)]); return C.map(function (c) { return sd.c[c[0]] != null ? sd.c[c[0]] : ''; }).concat([totalOf(sd, C)]); };
  var ilk = r.ilk, son = { a: r.a, b: r.b };
  var ia = taraf(ilk && ilk.a), ib = taraf(ilk && ilk.b);
  var ort = function (x, y) { var a = x[x.length - 1], b = y[y.length - 1]; return (typeof a === 'number' && typeof b === 'number') ? (a + b) / 2 : ''; };
  var uz = !!ilk && (JSON.stringify(ilk.a) !== JSON.stringify({ c: r.a.c, oz: r.a.oz }) || JSON.stringify(ilk.b) !== JSON.stringify({ c: r.b.c, oz: r.b.oz }));
  var sa = uz ? taraf(son.a) : ia.map(function () { return ''; }), sb = uz ? taraf(son.b) : ib.map(function () { return ''; });
  var satir = ia.concat(ib, [ort(ia, ib), uz ? 'Evet' : (ilk ? 'Hayır' : '')], sa, sb, [uz ? ort(sa, sb) : '', r.fin == null ? '' : r.fin, r.fin == null || r.fin === 'G' ? (r.fin === 'G' ? 'G' : '') : r.r100]);
  var renk = satir.map(function () { return null; }), n = ia.length, bas = 2 * n + 2;
  if (uz) { for (var i = 0; i < n; i++) { if (String(sa[i]) !== String(ia[i])) renk[bas + i] = SARI; if (String(sb[i]) !== String(ib[i])) renk[bas + n + i] = SARI; }
    if (String(ort(sa, sb)) !== String(ort(ia, ib))) renk[bas + 2 * n] = SARI; }
  return { satir: satir, renk: renk };
}
function ayrintiliBaslik_(C, h1, h2) {
  var k = function (on) { return C.map(function (c) { return on + ' ' + c[1]; }).concat([on + ' toplam']); };
  return k(h1 + ' (ilk)').concat(k(h2 + ' (ilk)'), ['İlk ortalama', 'Uzlaşma'], k(h1 + ' (uzlaşma sonrası)'), k(h2 + ' (uzlaşma sonrası)'), ['Uzlaşma sonrası ortalama', 'Nihai not', "100'lük"]);
}
function sayfaYazRenkli_(ad, rows, renk) {
  var sh = sayfa_(ad) || ss_().insertSheet(ad); sh.clearContents();
  var rg = sh.getRange(1, 1, rows.length, rows[0].length); rg.setValues(rows); sh.setFrozenRows(1);
  if (rg.setBackgrounds) rg.setBackgrounds(renk.map(function (r) { return r.map(function (x) { return x || null; }); }));
  return sh;
}
function ayrintiliYaz_() {
  var spR = [['Sınıf', 'Öğrenci No', 'Ad Soyad', 'Düzey', 'Jüri', 'Hoca 1', 'Hoca 2'].concat(ayrintiliBaslik_(CRS, 'H1', 'H2'))], spC = [spR[0].map(function () { return null; })];
  var baumS = [['Öğrenci No', 'Ad Soyad', 'Not']];
  S.order.forEach(function (no) {
    var s = S.stu[no]; if (!s.gun) return;
    var r = S.gr['S:' + no] || grec('S:' + no), p = s.pair && S.pairs[s.pair], j = p && jur(p.j);
    var x = ayrintiliSatir_(r, CRS, OZS);
    spR.push([s.cls, no, s.ad, s.lv, j ? jName(j) : '', j ? S.hoca[j.h[0]].ad : '', j ? S.hoca[j.h[1]].ad : ''].concat(x.satir)); spC.push([null, null, null, null, null, null, null].concat(x.renk));
    var gelmedi = ['alinamadi', 'red', 'yok', 'gelmedi'].indexOf(s.st) >= 0;
    baumS.push([no, s.ad, r.fin != null ? r.fin : (gelmedi ? 'G' : '')]);
  });
  var wrR = [['Sınıf', 'Öğrenci No', 'Ad Soyad', 'First grader', 'Second grader'].concat(ayrintiliBaslik_(CRW, 'First', 'Second'))], wrC = [wrR[0].map(function () { return null; })];
  var baumW = [['Öğrenci No', 'Ad Soyad', 'Not']];
  S.zarf.forEach(function (z) { z.ogr.forEach(function (no) {
    var r = grec('W:' + no), x = ayrintiliSatir_(r, CRW, OZW);
    wrR.push([z.cls, no, S.stu[no].ad, S.hoca[z.f].ad, S.hoca[z.s].ad].concat(x.satir)); wrC.push([null, null, null, null, null].concat(x.renk));
    baumW.push([no, S.stu[no].ad, r.fin == null ? '' : r.fin]);
  }); });
  sayfaYazRenkli_('Speaking Ayrıntılı', spR, spC); sayfaYazRenkli_('Writing Ayrıntılı', wrR, wrC);
  [['BAUM Speaking', baumS], ['BAUM Writing', baumW]].forEach(function (x) { var sh = sayfa_(x[0]) || ss_().insertSheet(x[0]); sh.clearContents(); sh.getRange(1, 1, x[1].length, 3).setValues(x[1]); sh.setFrozenRows(1); });
}

/** Menü: sınıf not listelerini "Speaking Sonuçları" ve "Writing Sonuçları" sayfalarına yazar (Excel olarak indirilir). */
function sonuclariYaz() { sahipKontrol_(); return sonuclariYaz_(); }   // menü/editör
function sonuclariYaz_() {   // yönetim ekranı da bunu çağırır
  S = durumOku_();
  var sp = [['Sınıf', 'Öğrenci No', 'Ad Soyad', 'Düzey', 'Jüri', 'Not', 'Ölçek', "100'lük", 'Durum']];
  S.order.forEach(function (no) {
    if (!S.stu[no].gun) return;   // yalnızca writing'e giren (speaking günü olmayan) öğrenci
    var s = S.stu[no], r = S.gr['S:' + no], p = s.pair && S.pairs[s.pair], max = ctxS(no).max;
    var n = r && r.fin != null ? r.fin : ((s.st === 'alinamadi' || s.st === 'red' || s.st === 'yok' || s.st === 'gelmedi') ? 'G' : '');
    sp.push([s.cls, no, s.ad, s.lv, p ? jName(jur(p.j)) : '', n, max, n === 'G' ? 'G' : (r && r.r100 != null ? r.r100 : ''), s.st]);
  });
  var wr = [['Sınıf', 'Öğrenci No', 'Ad Soyad', 'First grader', 'Second grader', 'Not (20)', "100'lük", 'Durum']];
  S.zarf.forEach(function (z) { z.ogr.forEach(function (no) { var r = grec('W:' + no); wr.push([z.cls, no, S.stu[no].ad, S.hoca[z.f].ad, S.hoca[z.s].ad, r.fin == null ? '' : r.fin, r.fin == null ? '' : (r.fin === 'G' ? 'G' : r.r100), r.fin != null ? 'kesinleşti' : r.ucuncu ? '3. grader bekleniyor' : r.neg ? 'farklı özel durum' : r.tur > 1 ? 'puan farkı > 2' : 'bekliyor']); }); });
  [['Speaking Sonuçları', sp], ['Writing Sonuçları', wr]].forEach(function (x) { var sh = sayfa_(x[0]) || ss_().insertSheet(x[0]); sh.clearContents(); sh.getRange(1, 1, x[1].length, x[1][0].length).setValues(x[1]); sh.setFrozenRows(1); });
  ayrintiliYaz_();
  return 'Sonuç sayfaları güncellendi: Speaking/Writing Sonuçları, Speaking/Writing Ayrıntılı (uzlaşmada değişenler sarı), BAUM Speaking/Writing.';
}

/* ---------------- sonuç e-postaları (31 kodlu ders hocası gibi) ----------------
 * Hocalar › "Sonuç listesi" sütunu: sınıf kodları ya da düzey harfleri (ör. "A-05" ya da "A"). Hoca o sınıfların / düzeyin
 * speaking ve writing sonuçlarını e-postayla alır. Önce önizleme; gönderim yalnızca Ayarlar › sonucOnay = EVET iken. */
/* ---------- Not listesi e-postası (MehDer metni, 1.11.2026) ----------
 * Sınıf başına bir e-posta; alıcılar o sınıfın BÜTÜN hocaları ("Sınıf Hocaları" sayfası varsa oradan: Sınıf | Ad Soyad | E-posta;
 * yoksa Hocalar › Sınıfları / Sonuç listesi). Ek: sınıfın Excel not dosyası (öğrenci no, ad soyad, konuşma ve yazma nihai notu).
 * Önce önizleme; gönderim yalnızca Ayarlar › sonucOnay = EVET iken. Onay son tarihi: Ayarlar › anasisSonTarih. */
function sinifAliciları_() {
  var m = {}, ekle = function (cls, ad, ep) { if (!cls || !ep) return; m[cls] = m[cls] || []; if (!m[cls].some(function (x) { return x.eposta === ep; })) m[cls].push({ ad: ad, eposta: ep }); };
  var sh = sayfa_('Sınıf Hocaları');
  if (sh && sh.getLastRow() > 1) sh.getDataRange().getValues().slice(1).forEach(function (r) { ekle(String(r[0]).trim(), String(r[1]).trim(), String(r[2]).trim()); });
  else { var lvCls = {}; S.order.forEach(function (no) { var x = S.stu[no]; (lvCls[x.lv] = lvCls[x.lv] || {})[x.cls] = 1; });
    Object.keys(S.hoca).forEach(function (t) { var h = S.hoca[t]; (h.siniflar || []).concat(h.sonuc || []).forEach(function (c) { if (lvCls[c]) Object.keys(lvCls[c]).forEach(function (cc) { ekle(cc, h.ad, h.eposta); }); else ekle(c, h.ad, h.eposta); }); }); }
  return m;
}
function adListesi_(l) { var a = l.map(function (x) { return x.ad; }); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' ve ' + a[a.length - 1]; }
function sinifNotSatirlari_(cls) {
  var w = {}; S.zarf.forEach(function (z) { z.ogr.forEach(function (no) { var r = grec('W:' + no); w[no] = r.fin == null ? '' : r.fin; }); });
  return S.order.filter(function (no) { return S.stu[no].cls === cls; }).map(function (no) {
    var s = S.stu[no], r = S.gr['S:' + no], sp = r && r.fin != null ? r.fin : (s.gun > 0 && ['alinamadi', 'red', 'yok', 'gelmedi'].indexOf(s.st) >= 0 ? 'G' : '');
    return [no, s.ad, sp, w[no] != null ? w[no] : '']; });
}
function notEpostaMetni_(cls, alicilar) {
  var a = ayarlar_(), tarih = a.anasisSonTarih || '15 Kasım 2026 saat 23:59', d = a.denemeGunu ? 'DENEME – ' : '';
  var p = function (x) { return '<p style="font-family:Arial;font-size:14px">' + x + '</p>'; };
  return { konu: d + 'Birinci Arasınav – ' + cls + ' sınıfı konuşma ve yazma notları',
    html: p('Sayın ' + adListesi_(alicilar) + ',') + p('Sınıfınızın Birinci Arasınav Konuşma ve Yazma sınav notlarını ekteki dosyada bulabilirsiniz. Birinci Arasınav ANASİS not girişi ile ilgili olarak,')
      + '<ul style="font-family:Arial;font-size:14px"><li>Parça-1: Çoktan Seçmeli Test optikleri okundu ve ANASİS\'e girildi. Lütfen ONAYLAYINIZ.</li><li>Parça-2: Konuşma sınav sonuçları ANASİS\'e otomatik girilecektir. Lütfen ONAYLAYINIZ.</li><li>Parça-3: Yazma sınav sonuçları ANASİS\'e otomatik girilecektir. Lütfen ONAYLAYINIZ.</li></ul>'
      + p('Tüm parçaları onaylayınız. Yasal olarak öğrencilerin sınav notlarına itiraz süreci notların yayınlanmasından sonra başlamaktadır. Bu nedenle, ANASİS notlarını en geç <b>' + tarih + '</b>\'a kadar onaylayınız.')
      + p('Ekteki not dokümanı, sizleri bilgilendirmek için paylaşılmıştır. Öğrenciler ikinci parça notunu (konuşma sınavı) konuşma sınavından sonra cep telefonundan öğrendi. Birinci parça notunu (Çoktan Seçmeli Test) ve üçüncü parça notunu (yazma sınavı) siz ANASİS\'te onayladıktan sonra görebileceklerdir.')
      + p('<b>NOT:</b> Belirtilen tarihe kadar ANASİS notlarını onaylamayanlara, bir sonraki herhangi bir okul görevinde (çeviri, doküman hazırlama, ilk sınavda fazladan görev v.b.) öncelik verilerek görevlendirilecektir.')
      + p('Mehmet Duranlıoğlu<br>Müdür Yardımcısı') };
}
/** Sınıfın not dosyası (Excel): geçici bir e-tablo oluşturulur, xlsx olarak alınır, sonra çöp kutusuna taşınır. */
function sinifExcel_(cls) {
  var rows = [['Öğrenci No', 'Ad Soyad', 'Konuşma notu', 'Yazma notu']].concat(sinifNotSatirlari_(cls));
  var ss = SpreadsheetApp.create('gecici ' + cls), sh = ss.getSheets()[0]; sh.setName(cls);
  sh.getRange(1, 1, rows.length, 4).setNumberFormat('@').setValues(rows.map(function (r) { return r.map(String); })); sh.setFrozenRows(1); sh.getRange(1, 1, 1, 4).setFontWeight('bold'); SpreadsheetApp.flush();
  var b = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob().setName(cls + ' Birinci Arasınav notları.xlsx');
  DriveApp.getFileById(ss.getId()).setTrashed(true);
  return b;
}
function sonucEpostaOnizleme() { sahipKontrol_();
  S = durumOku_(); var al = sinifAliciları_(), sh = sayfa_('Sonuç E-posta Önizleme') || ss_().insertSheet('Sonuç E-posta Önizleme'), rows = [['Sınıf', 'Alıcılar', 'E-posta adresleri', 'Öğrenci', 'Konu', 'Hitap']];
  Object.keys(al).sort().forEach(function (cls) { var n = sinifNotSatirlari_(cls).length; if (!n) return; var m = notEpostaMetni_(cls, al[cls]); rows.push([cls, al[cls].map(function (x) { return x.ad; }).join(', '), al[cls].map(function (x) { return x.eposta; }).join(', '), n, m.konu, 'Sayın ' + adListesi_(al[cls]) + ',']); });
  sh.clearContents(); sh.getRange(1, 1, rows.length, 6).setValues(rows);
  return (rows.length - 1) + ' sınıf e-postası listelendi (Sonuç E-posta Önizleme sayfası). Gönderim için Ayarlar › sonucOnay = EVET yazın (MehDer onayından sonra).';
}
function sonucEpostalariGonder() { sahipKontrol_();
  var a = ayarlar_(); if (a.sonucOnay !== 'EVET') throw new Error('Gönderim için önce alıcı listesi onaylanmalı: Ayarlar › sonucOnay = EVET.');
  S = durumOku_(); var al = sinifAliciları_(), n = 0;
  Object.keys(al).sort().forEach(function (cls) { if (!sinifNotSatirlari_(cls).length) return; var m = notEpostaMetni_(cls, al[cls]);
    var op = postaSecenek_(); op.to = al[cls].map(function (x) { return x.eposta; }).join(','); op.subject = m.konu; op.htmlBody = m.html; op.attachments = [sinifExcel_(cls)]; MailApp.sendEmail(op); n++; });
  ayarYaz_('sonucOnay', 'gönderildi ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'));
  return n + ' sınıf not e-postası gönderildi.';
}

/** Yönetim komutları yalnızca tablo sahibi (menü/editör) tarafından çalıştırılabilir.
 *  Web uygulaması "Ben olarak / Herkes" yayımlandığından alt çizgisiz her işlev tarayıcıdan çağrılabilir; bu kontrol onu engeller. */
function sahipKontrol_() {
  var a = '', s = '';
  try { a = Session.getActiveUser().getEmail(); } catch (e) { }
  try { s = Session.getEffectiveUser().getEmail(); } catch (e) { }
  if (!a || a !== s) throw new Error('Bu işlem yalnızca tablo sahibi tarafından menüden yapılabilir.');
}

/* ---------------- menü ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Sınav Sistemi')
    .addItem('Kurulumu yap (tablolardan)', 'menuKurulum')
    .addItem('Bağlantı listesini güncelle', 'menuBaglanti')
    .addItem('E-posta önizlemesi (göndermez)', 'menuOnizleme')
    .addItem('E-postaları gönder (onaydan sonra)', 'menuGonder')
    .addSeparator()
    .addItem('Sonuç sayfalarını yaz', 'menuSonuc')
    .addItem('Sonuç e-postası önizlemesi (göndermez)', 'menuSonucOnizleme')
    .addItem('Sonuç e-postalarını gönder (onaydan sonra)', 'menuSonucGonder')
    .addItem('Dakikalık tetikleyiciyi kur', 'tetikleyiciKur')
    .addSeparator()
    .addItem('Anket raporu (Anket Özeti sayfası)', 'anketRaporu')
    .addToUi();
}
function bildir_(m) { try { SpreadsheetApp.getUi().alert(m); } catch (e) { Logger.log(m); } }   // editörden çalıştırınca kutu açılamaz, günlüğe yazar
function tazele_() { CacheService.getScriptCache().remove('ayar'); }   // menü komutları Ayarlar'ı her zaman taze okur
/** Basit tetikleyici: Ayarlar sayfasında elle yapılan değişiklik önbelleği hemen geçersiz kılar. */
function onEdit(e) { try { if (e && e.range && e.range.getSheet().getName() === 'Ayarlar') tazele_(); } catch (x) {} }
function menuKurulum() { tazele_(); bildir_(kurulumYap()); }
function menuBaglanti() { sahipKontrol_(); tazele_(); S = durumOku_(); baglantiListesiYaz_(); bildir_('Bağlantı listesi güncellendi.'); }
function menuOnizleme() { tazele_(); bildir_(epostaOnizleme()); }
function menuGonder() { tazele_(); bildir_(epostalariGonder()); }
function menuSonuc() { tazele_(); bildir_(sonuclariYaz()); }
function menuSonucOnizleme() { tazele_(); bildir_(sonucEpostaOnizleme()); }
function menuSonucGonder() { tazele_(); bildir_(sonucEpostalariGonder()); }
function tetikleyiciKur() { sahipKontrol_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dakikalik') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dakikalik').timeBased().everyMinutes(1).create();
  bildir_('Dakikalık tetikleyici kuruldu.');
}
/* ======================= Portal.gs ======================= */
/**
 * Portal.gs – web uygulaması: sayfalar (doGet) ve tarayıcıdan çağrılan işlevler (api…).
 * Görünümler sunucuda hazırlanır; kör değerlendirme sunucuda uygulanır (eşin notları HESAPLA'dan önce tarayıcıya hiç gönderilmez).
 */
var OTURUM_SN = 21600, KILIT_DK = 5, KILIT_DENEME = 7, HATIRLA_GUN = 30, KOD_PENCERE = 60000;

function doGet(e) {
  var p = (e && e.parameter) || {}, v = p.v || (p.c ? 'ogrenci' : 'giris');   // ortak bağlantı: ?v yoksa Hoca / Yönetim seçimi (17.11.2026)
  var dosya = { ogrenci: 'Ogrenci', tv: 'TV', hoca: 'Hoca', yonetim: 'Yonetim', giris: 'Giris' }[v] || 'Ogrenci';
  var t = typeof HTML_DOSYALARI !== 'undefined' ? HtmlService.createTemplate(HTML_DOSYALARI[dosya]) : HtmlService.createTemplateFromFile(dosya);   // tek dosyalı kurulumda HTML'ler gömülü
  t.k = p.k || ''; t.c = p.c || ''; t.o = p.o || ''; t.url = uygulamaAdresi_();
  return t.evaluate().setTitle({ ogrenci: 'Speaking Sınavı', tv: 'Speaking Sınavı – Giriş', hoca: 'Sınav Portalı', yonetim: 'Sınav Yönetimi', giris: 'Sınav Portalı' }[v] || 'Speaking Sınavı')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
/** Dış sayfalardan (GitHub Pages) çağrı: gövde {fn, a}. Yalnızca listedeki api işlevleri çağrılabilir.
 *  Sayfalar isteği çerezsiz (credentials:'omit') gönderir; tarayıcıda kaç Google hesabı açık olduğu önemsizleşir. */
var API_IZINLI = ['apiProfil', 'apiOgrenciGiris', 'apiOgrenciDurum', 'apiErken', 'apiTV', 'apiHocaGiris', 'apiSifreBelirle', 'apiHocaCihaz', 'apiCikis',
  'apiHocaBilgi', 'apiHoca', 'apiHocaIslem', 'apiYonetimGiris', 'apiYonetimSifreBelirle', 'apiYonetim', 'apiYonetimIslem',
  'apiOgrSorun', 'apiOgrMesajlar', 'apiOgrAnket', 'apiHocaSorun', 'apiHocaMesajlar', 'apiHocaAnket', 'apiOgrOto', 'apiErkenOnay', 'apiOgrOnay', 'apiBirim', 'apiBirimIslem', 'apiSinav', 'apiSinavIslem'];
/** İşlev tablosu çağrı anında kurulur (dosya yükleme sırasından bağımsız). */
function apiIslev_(fn) {
  return { apiProfil: apiProfil, apiOgrenciGiris: apiOgrenciGiris, apiOgrenciDurum: apiOgrenciDurum, apiErken: apiErken, apiTV: apiTV, apiHocaGiris: apiHocaGiris,
    apiSifreBelirle: apiSifreBelirle, apiHocaCihaz: apiHocaCihaz, apiCikis: apiCikis, apiHocaBilgi: apiHocaBilgi, apiHoca: apiHoca, apiHocaIslem: apiHocaIslem,
    apiYonetimGiris: apiYonetimGiris, apiYonetimSifreBelirle: apiYonetimSifreBelirle, apiYonetim: apiYonetim, apiYonetimIslem: apiYonetimIslem,
    apiOgrSorun: apiOgrSorun, apiOgrMesajlar: apiOgrMesajlar, apiOgrAnket: apiOgrAnket, apiHocaSorun: apiHocaSorun, apiHocaMesajlar: apiHocaMesajlar, apiHocaAnket: apiHocaAnket, apiOgrOto: apiOgrOto, apiErkenOnay: apiErkenOnay, apiOgrOnay: apiOgrOnay, apiBirim: apiBirim, apiBirimIslem: apiBirimIslem, apiSinav: apiSinav, apiSinavIslem: apiSinavIslem }[fn];
}
function doPost(e) {
  var cevap;
  try {
    var g = JSON.parse((e && e.postData && e.postData.contents) || '{}'), fn = g.fn, a = Array.isArray(g.a) ? g.a : [];
    var f = API_IZINLI.indexOf(fn) < 0 ? null : apiIslev_(fn);
    if (typeof f !== 'function') throw new Error('Geçersiz istek.');
    var r = f.apply(null, a);
    cevap = { ok: true, r: r === undefined ? null : r };
  } catch (err) { cevap = { ok: false, m: (err && err.message) || String(err) }; }
  return ContentService.createTextOutput(JSON.stringify(cevap)).setMimeType(ContentService.MimeType.JSON);
}
function include(f) { return typeof HTML_DOSYALARI !== 'undefined' ? HTML_DOSYALARI[f] : HtmlService.createHtmlOutputFromFile(f).getContent(); }

/* ---------------- yardımcılar ---------------- */
function onb_() { return CacheService.getScriptCache(); }
function kodFor_(w) { var g = ayarlar_().gizli || 'x'; var b = Utilities.computeHmacSha256Signature('kod|' + w, g); var n = ((b[0] & 255) << 16) | ((b[1] & 255) << 8) | (b[2] & 255); return String(n % 9000 + 1000); }
function kodGecerli_(c) { var w = Math.floor(Date.now() / KOD_PENCERE); return c === kodFor_(w) || c === kodFor_(w - 1); }
function ogrAnahtar_(no) { var b = Utilities.computeHmacSha256Signature('ogr|' + no, ayarlar_().gizli || 'x'); return b.slice(0, 8).map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join(''); }
function oturumAc_(o) { var id = rastgele_(32); onb_().put('ot:' + id, JSON.stringify(o), OTURUM_SN); return id; }
function oturum_(id) { var v = id && onb_().get('ot:' + id); if (!v) throw new Error('OTURUM'); return JSON.parse(v); }
function hocaByToken_(token) { for (var t in S.auth) if (S.auth[t].token === token) return t; return null; }
/** Ortak bağlantı (17.11.2026): hoca kişisel bağlantı anahtarıyla ya da kurumsal e-postasıyla tanınır. */
function epostaMi_(k) { return String(k || '').indexOf('@') > 0; }
function hocaByKey_(k) {
  if (!epostaMi_(k)) return hocaByToken_(k);
  k = String(k).trim().toLowerCase(); for (var t in S.hoca) if (S.auth[t] && String(S.hoca[t].eposta || '').trim().toLowerCase() === k) return t; return null;
}
function gunAdi_(g) { return (S.cfg.gunler[g] || {}).ad || ''; }
/** Öğrencinin sınav günü bugünden önce mi (tarihe göre; deneme gününde gün numarasına göre). */
function gunGecti_(g) {
  var gn = S.cfg.gunler[g] || {}; if (S.day) { var bt = (S.cfg.gunler[S.day] || {}).tarih; if (bt && gn.tarih) return gn.tarih < bt; return g < S.day; }
  var bugun = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); return !!gn.tarih && gn.tarih < bugun;
}
/** Kâğıtla notlanan düzey mi (Ayarlar › kagitDuzeyler; notlar sisteme girilmez). */
function saatYdi_(t) { var e = saatEki_(t); return t + e + (/a$/.test(e) ? 'ydı' : 'ydi'); }   // 13:30'daydı, 14:00'teydi
/** Kullanım şekli (MehDer 12.11.2026, tablo 11 A bölümü): 1 = portal notlu + canlı eşleştirme · 2 = kâğıt notlu + planlı (sabit plan) · 3 = kâğıt notlu + canlı.
 *  Gün bazında Yönetim › Sınav ayarları'ndan seçilir (o günün ilk QR okutmasına kadar). Seçilmemişse eski ayar: kagitDuzeyler + sabit plan. */
function gunOf_(lv) { for (var g = 1; g <= 9; g++) { var gn = S.cfg.gunler[g]; if (gn && (gn.lv || []).indexOf(lv) >= 0) return g; } return 0; }
function kulGun_(g) { var gn = S.cfg.gunler[g]; if (!gn) return 1; if (S.kul && S.kul[g]) return S.kul[g];   // S.kul dinamik durumda (cfg sabit alan)
  var kg = (gn.lv || []).filter(String).length && (gn.lv || []).filter(String).every(function (lv) { return (S.cfg.gunler.kagit || []).indexOf(lv) >= 0; });
  return kg ? (S.sabit ? 2 : 3) : 1; }
function kulOf_(lv) { var g = gunOf_(lv); if (!g) return (S.cfg.gunler.kagit || []).indexOf(lv) >= 0 ? 3 : 1; return kulGun_(g); }
function kagitDuzey_(lv) { return kulOf_(lv) !== 1; }
function gunBasladi_(g) { return S.order.some(function (no) { var s = S.stu[no]; return s.gun === g && s.scanT != null; }); }
function kullanimSec_(g, kul) {
  g = Number(g); kul = Number(kul); var gn = S.cfg.gunler[g];
  if (!gn || [1, 2, 3].indexOf(kul) < 0) return 'Geçersiz gün ya da kullanım şekli.';
  if (gunBasladi_(g)) return 'Bu günün ilk QR okutması yapıldı; kullanım şekli artık değiştirilemez.';
  if (kul === 2 && !S.sabit) return '2. kullanım için önce sabit plan (çiftler, jüriler, saatler) yüklenmelidir.';
  S.kul = S.kul || {}; S.kul[g] = kul; mlog((gn.ad || g + '. gün') + ': kullanım şekli ' + kul + ' seçildi (' + KUL_AD[kul] + ').');
  return '';
}
var KUL_AD = { 1: 'portal notlu, canlı eşleştirme', 2: 'kâğıt notlu, planlı eşleştirme', 3: 'kâğıt notlu, canlı eşleştirme' };

/* ================= ÖĞRENCİ ================= */
/** Öğrenci ekranı. baslik/metin Türkçe (eski sürüm ve testler için); kod + alanlar ekranın diline göre (TR/EN/RU) tarayıcıda yazılır. */
function ogrenciGorunum_(s) {
  destekHazirla_();
  var v = { no: s.no, ad: s.ad, lv: s.lv, cls: s.cls, grup: hhmm(SL[s.plan]), st: s.st, kod: s.st };
  if (gunGecti_(s.gun)) {   // sınav günü geçti (MehDer 7.11.2026): yeni sıra/eşleştirme yok; yalnız sonuç
    v.gecmis = { gun: gunAdi_(s.gun), tarih: (S.cfg.gunler[s.gun] || {}).tarih || '', saat: hhmm(SL[s.plan]), saatYdi: saatYdi_(hhmm(SL[s.plan])) };
    if (kagitDuzey_(s.lv)) { v.kod = 'kagitBitti'; v.renk = 'ok'; v.baslik = 'Sınavın sona erdi'; v.metin = "Notun AnaSİS'te duyurulacaktır."; }
    else if (s.st !== 'bitti') { v.kod = 'girmedi'; v.renk = 'bad'; v.baslik = 'Senin sınavın ' + v.gecmis.gun + ', saat ' + v.gecmis.saatYdi + '; sınava girmedin.'; }
    if (v.kod !== 'bitti') { v.sorunAcik = false; v.ymsj = ogrYonetimMesajlari_(s.no); return v; }
  }
  if (sabitMi_(s) && s.pair && (s.st === 'atandi' || s.st === 'bitti')) return sabitOgrGorunum_(s, v);
  if (s.st === 'bekle') {
    v.saat2 = hhmm(SL[s.eff]);
    if (s.yedekSlot) { v.kod = 'trans'; v.renk = 'warn'; v.baslik = 'Son oturuma geç kaldın'; v.metin = 'Sınava ' + hhmm(SL[s.eff]) + ' yedek oturumunda gireceksin. Telefon ekranını takip et; jürin ve dersliğin burada görünecek.'; }
    else if (s.trans) { v.kod = 'trans'; v.renk = 'warn'; v.baslik = 'Eşleştirme yapılamadı'; v.metin = 'Bir sonraki slotta (' + hhmm(SL[s.eff]) + ') gireceksin; o slotta eşleştirmede ilk sıradasın. Telefon ekranını takip et; eşin belirlenince jürin burada görünecek.'; }
    else { v.renk = 'acc'; v.baslik = 'Eşleştirme bekleniyor'; v.metin = 'Grup saatin: ' + hhmm(SL[s.eff]) + '. Eşin okuttuğunda jürin ve dersliğin burada görünecek.'; if (erkenAcik(s)) { v.erkenSon = SL[s.eff]; v.erken = s.early; } }
    var dp = s.davet && S.pairs[s.davet], dx = dp && dp.m.filter(function (x) { return x.no === s.no && x.dv; })[0];
    if (dx) v.davet = { id: dp.id, saat: hhmm(SL[dp.k]), son: hhmm(dx.dvSon) };   // jüri no yok (MehDer)
    if (s.kayip) v.kayip = { saat: hhmm(SL[s.kayip.k]), kendi: hhmm(SL[s.eff]) };
    if (s.donus != null) v.donus = { saat: hhmm(SL[s.donus]), kendi: hhmm(SL[s.eff]) };
  } else if (s.st === 'atandi') {
    var p = S.pairs[s.pair], j = jur(p.j), x = p.m.filter(function (m) { return m.no === s.no; })[0];
    var es = p.m.filter(function (m) { return m.no !== s.no && !m.mv && m.g !== 'gelmedi'; }).map(function (m) { return S.stu[m.no].ad; });
    v.j = { lv: j.lv, no: j.no, room: j.room }; v.saat = hhmm(SL[p.k]); v.esler = es;
    v.yedekTek = !es.length && p.k === RES;   // tek başına yalnız yedek slotta (MehDer)
    v.es = es.length ? es.join(', ') : (v.yedekTek ? 'Tek başına gireceksin' : 'Eşin henüz belli değil; sistem eşleştirecek');
    if (x && x.g === 'geldi') {
      v.kod = 'sinavda'; v.renk = 'ok'; v.hocalar = j.h.map(function (t) { return S.hoca[t].ad; });
      v.baslik = 'Sınavdasın · ' + jName(j) + ' · Derslik ' + j.room; v.metin = 'Jüri: ' + v.hocalar.join(' – ') + '.';
    } else if (!juriAcik(p.k) && s.cagri == null) {   // eş belli, jüri/derslik oturumdan JURI_DK dk önce görünür (MehDer 6.11.2026)
      delete v.j; v.kod = 'esbelli'; v.renk = 'acc'; v.acilis = hhmm(SL[p.k] - JURI_DK);
      v.baslik = 'Eşin belli oldu'; v.metin = 'Eşin: ' + v.es + '. Jüri numaran ve dersliğin sınavına ' + JURI_DK + ' dakika kala (saat ' + v.acilis + ') burada görünecek. Ekranını açık tut.';
    } else {
      v.renk = 'ok'; v.baslik = jName(j) + ' · Derslik ' + j.room; v.metin = 'Dersliğin önünde bekle; jüri seni çağıracak.';
      v.gecikme = p.k > 0 && ekBlock(j.id, p.k);
      if (s.cagri != null) v.cagri = { id: p.id + ':' + s.cagri, metin: 'Jürin seni bekliyor! ' + jName(j) + ' · Derslik ' + j.room };
      if (x && x.src === 'birleştirme') v.birlesme = true;
    }
  } else if (s.st === 'gec') { v.son = hhmm(LASTCALL); v.renk = 'hl'; v.baslik = 'Sınava geç kaldın'; v.metin = 'Bugün saat ' + hhmm(LASTCALL) + "'e kadar eğer boş jüri olursa sınava çağırılabilirsin. Bu nedenle cep telefonunda sınav ekranını takip et. Ancak boş jüri olmazsa sınava alınamazsın."; }
  else if (s.st === 'alinamadi') { v.renk = 'bad'; v.baslik = 'Bugün boş jüri olmadığı için sınava alınamadın'; }
  else if (s.st === 'red') { v.renk = 'bad'; v.baslik = s.late > GEC_MAX ? 'Sınav saatinden ' + GEC_MAX + ' dakikadan fazla geç kaldığın için bugün konuşma sınavına giremezsin' : 'Sınava geç kaldın; bugün sınava alınamazsın'; }
  else if (s.st === 'gelmedi') { v.renk = 'bad'; v.alarm = 'gelmedi:' + (s.pair || ''); v.baslik = 'Jüri seni "Gelmedi" olarak işaretledi'; v.metin = "Jüri seni 'Gelmedi' olarak işaretledi. Hemen kantin tarafındaki okul girişinin oradaki kayıt masasına git."; }
  else if (s.st === 'bitti') {
    v.renk = 'ok'; v.baslik = 'Sınavın tamamlandı';
    v.yayin = !!S.yayin[s.gun + ':' + s.lv]; v.anket = v.yayin && !S.ankO[s.no];   // anket not yayımlandıktan sonra (MehDer 7.11.2026)
    if (kagitDuzey_(s.lv)) { v.kod = 'kagitBitti'; v.anket = false; v.yayin = false; v.metin = "Notun AnaSİS'te duyurulacaktır."; }
    else if (!v.yayin) v.metin = 'Notun gün içinde bu sayfada yayımlanacak. Notunu görmek için bu sayfayı aynı telefonda ve aynı tarayıcıda tekrar aç.';
    else if (v.anket) v.metin = 'Notlar yayımlandı. Notunu görmeden önce anketi doldurman gerekiyor.';
    else { var r = S.gr['S:' + s.no] || {}, mx = ctxS(s.no).max; v.not = { fin: r.fin, max: mx, r100: r.r100 }; v.metin = 'Speaking notun: ' + r.fin + ' / ' + mx + ' (' + r.r100 + ' / 100). Kesin sonuç AnaSİS\'te duyurulacaktır. Notunuzu AnaSİS\'ten kontrol edin.'; }
  }
  v.sorunAcik = v.kod !== 'sinavda' && v.kod !== 'bitti';
  v.ymsj = ogrYonetimMesajlari_(s.no);
  return v;
}
function apiOgrenciGiris(no, kod) {
  no = String(no || '').replace(/\D/g, ''); kod = String(kod || '').trim();
  if (!kodGecerli_(kod)) return { errKod: 'kod', err: "Kod hatalı ya da süresi geçmiş. TV'deki QR kodunu yeniden okut ya da güncel kodu yaz." };
  return islem_(function () {
    var r = scan(no);
    if (r.err) return { errKod: 'liste', err: r.err };
    if (r.wrong && gunGecti_(S.stu[no].gun)) { var sg = S.stu[no], gk = kagitDuzey_(sg.lv);   // geçmiş gün: oturum açılmaz, not yalnız sınav günü kullanılan telefonda (MehDer 7.11.2026)
      return { wrong: 'Senin sınavın ' + gunAdi_(sg.gun) + ', saat ' + saatYdi_(hhmm(SL[sg.plan])) + ' ve sona erdi. ' + (gk ? "Notun AnaSİS'te duyurulacaktır." : "Notun bu cihazda görünmüyor; notunu AnaSİS'ten öğrenebilirsin."),
        wrongGecmis: true, wrongKagit: gk, wrongSaatYdi: saatYdi_(hhmm(SL[sg.plan])), wrongGun: gunAdi_(sg.gun), wrongTarih: (S.cfg.gunler[sg.gun] || {}).tarih || '', wrongSaat: hhmm(SL[sg.plan]) }; }
    if (r.wrong) { var s = S.stu[no]; return { wrong: 'Senin sınavın ' + gunAdi_(s.gun) + ', saat ' + hhmm(SL[s.plan]) + '. Bugün sınavın yok.', wrongGun: gunAdi_(s.gun), wrongTarih: (S.cfg.gunler[s.gun] || {}).tarih || '', wrongSaat: hhmm(SL[s.plan]) }; }
    if (!S.day) return { errKod: 'gunyok', err: 'Bugün speaking sınavı yok.' };
    return { no: no, anahtar: ogrAnahtar_(no), g: ogrenciGorunum_(S.stu[no]) };
  });
}
function apiOgrenciDurum(no, anahtar) {
  if (anahtar !== ogrAnahtar_(no)) return { err: 'Oturum geçersiz.' };
  var c = onb_().get('o:' + no); if (c && c.indexOf('"davet"') < 0) return { g: JSON.parse(c) };   // davetli öğrenci: süre kontrolü için durum işlenir
  return oku_(function () { var s = S.stu[no]; return s ? { g: ogrenciGorunum_(s) } : { err: 'Öğrenci bulunamadı.' }; });
}
function apiErkenOnay(no, anahtar) {
  if (anahtar !== ogrAnahtar_(no)) return { err: 'Oturum geçersiz.' };
  return islem_(function () { var e = davetOnay(no); var g = ogrenciGorunum_(S.stu[no]); return e ? { err: e, g: g } : { g: g }; });
}
function apiOgrOnay(no, anahtar, id) {
  if (anahtar !== ogrAnahtar_(no)) return { err: 'Oturum geçersiz.' };
  return islem_(function () { var m = (S.omsj || []).filter(function (x) { return x.id === id && x.no === no; })[0]; if (m && !m.onay) { m.onay = S.T; m.onayTs = Date.now(); mlog(S.stu[no].ad + ': yönetim mesajını onayladı ("Tamam, bana denileni yapıyorum").'); }
    var t = (S.otop || []).filter(function (x) { return x.id === id && x.nos.indexOf(no) >= 0; })[0]; if (t && t.onay[no] == null) t.onay[no] = S.T;
    return { g: ogrenciGorunum_(S.stu[no]) }; });
}
function apiErken(no, anahtar) {
  if (anahtar !== ogrAnahtar_(no)) return { err: 'Oturum geçersiz.' };
  return islem_(function () { toggleEarly(no); davetIsle_(); return { g: ogrenciGorunum_(S.stu[no]) }; });
}

/* ================= TV ================= */
function tvGorunum_() {
  var k = curSlot(), T = S.T, simdi;
  if (!S.day) simdi = 'Bugün speaking sınavı yok.';
  else if (k < 0) simdi = 'İlk oturum ' + hhmm(SL[0]) + "'da başlar.";
  else if (T >= slotEnd(RES)) simdi = 'Sınavlar sona erdi.';
  else if (MOLA && T >= MOLA[0] && T < MOLA[1]) simdi = 'Mola (' + hhmm(MOLA[0]) + '–' + hhmm(MOLA[1]) + '). Sıradaki oturum ' + hhmm(MOLA[1]) + '.';
  else simdi = 'Şu an ' + hhmm(SL[k]) + ' oturumu sınavda' + (k + 1 < SL.length ? ' · sıradaki oturum ' + hhmm(SL[k + 1]) : '') + '.';
  var d = S.tvd && S.tvd.bitis > Date.now() ? { metin: S.tvd.metin, en: S.tvd.en } : null, dz = null;
  if (sabitGun_()) { simdi = simdi.replace(' · sıradaki oturum ', '. Sıradaki oturum '); dz = (S.cfg.gunler[S.day].lv || []).join(' ve ') + ' Düzeyleri'; }
  return { duzeyMetni: dz, simdi: simdi, duyuru: d, tablolar: tvTablolar_(), satirlar: S.tv.filter(function (x) { return x.g === S.day; }).slice(0, 10).map(function (x) { return { saat: hhmm(x.T), txt: x.txt, late: x.late }; }) };
}
/** Ad soyadın her kelimesinin ilk 3 harfi + yıldız (ör. SEL** KIL**). */
function maskAd_(ad) { return String(ad || '').split(/\s+/).filter(String).map(function (w) { return w.length <= 3 ? w : w.slice(0, 3) + new Array(w.length - 2).join('*'); }).join(' '); }
/** "14:10" → "'da" gibi Türkçe bulunma eki (okunuşun son sözcüğüne göre). */
function saatEki_(t) { var hm = t.split(':'), n = Number(hm[1]) || Number(hm[0]), b = n % 10, o = Math.floor(n / 10) % 10;
  var e = b ? ['', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'][b] : ['', 'da', 'de', 'da', 'ta', 'de'][o] || 'da'; return "'" + e; }
/** TV tablosu (MehDer 6.11.2026): sıradaki oturum (ve okutan varsa bir sonraki); öğrenciler QR okutma sırasıyla, her öğrenci bir satır. */
function tvTablolar_() {
  if (!S.day) return [];
  if (sabitGun_()) return sabitTV_();
  var ks = []; for (var k = 0; k < SL.length && ks.length < 2; k++) if (S.T < SL[k] + GEC) ks.push(k);
  return ks.map(function (k, i) {
    var acik = juriAcik(k), ac = hhmm(SL[k] - JURI_DK);
    var L = dayStu().filter(function (s) { return s.eff === k && (s.st === 'bekle' || s.st === 'atandi' || s.st === 'bitti'); }).sort(function (a, b) { return a.scanT - b.scanT; });
    var rows = L.map(function (s) {
      var p = s.pair && S.pairs[s.pair], j = p && jur(p.j), r = { no: s.no.slice(-4), ad: maskAd_(s.ad), es: '', juri: '', derslik: '' };
      if (p) { r.es = p.m.filter(function (m) { return m.no !== s.no && !m.mv && m.g !== 'gelmedi'; }).map(function (m) { return maskAd_(S.stu[m.no].ad); }).join(', ');
        if (acik && j) { r.juri = j.lv + ' · Jüri ' + j.no; r.derslik = j.room; } }
      return r;
    });
    return { saat: hhmm(SL[k]), acik: acik, satir: rows, ikinci: i > 0,
      bilgi: acik ? 'Jüri ve derslikler belli oldu. Dersliğinin önünde jürinin seni çağırmasını bekle.' : 'Jüri ve derslik bilgisi saat ' + ac + saatEki_(ac) + ' belli olacaktır.',
      en: acik ? 'Juries and rooms are set. Wait in front of your room.' : 'Jury and room will be shown at ' + ac + '.' };
  }).filter(function (b, i) { return i === 0 || b.satir.length; });
}
function apiTV() {
  var w = Math.floor(Date.now() / KOD_PENCERE), kod = kodFor_(w), kalan = Math.ceil((KOD_PENCERE - Date.now() % KOD_PENCERE) / 1000);
  var c = onb_().getAll(['tv:1', 'tv:2', 'tv:3']), v = null;
  S = durumOku_(); baglam_();
  if (olayBekliyor_()) v = islem_(function () { return tvGorunum_(); });
  else v = c['tv:' + S.day] ? JSON.parse(c['tv:' + S.day]) : tvGorunum_();
  v.kod = kod; v.kalan = kalan; v.url = uygulamaAdresi_() + '?v=ogrenci&c=' + kod; v.gun = gunAdi_(S.day);
  v.denemeSaat = ayarlar_().denemeGunu ? hhmm(S.T) : null;
  return v;
}

/* ================= HOCA: giriş ================= */
function apiHocaGiris(token, sifre, hatirla) {
  return islem_(function () {
    var t = hocaByKey_(token); if (!t) return { err: epostaMi_(token) ? 'Bu e-posta adresi sistemde kayıtlı değil. Kurumsal e-postanızı (…@anadolu.edu.tr) yazın ya da yönetimle görüşün.' : 'Bağlantı geçersiz. Yönetimle görüşün.' };
    var a = S.auth[t], now = Date.now();
    if (a.lockUntil > now) return { err: 'Çok fazla yanlış deneme. ' + Math.ceil((a.lockUntil - now) / 60000) + ' dakika sonra tekrar deneyin.', kilit: a.lockUntil - now };
    var ok = a.hash ? ozet_(a.salt + '|' + sifre) === a.hash : (sifre === a.temp);
    if (!ok) {
      a.fails = (a.fails || []).filter(function (x) { return now - x < KILIT_DK * 60000; }); a.fails.push(now);
      if (a.fails.length >= KILIT_DENEME) { a.lockUntil = now + KILIT_DK * 60000; a.fails = []; mlog(S.hoca[t].ad + ': 7 yanlış deneme – giriş 5 dk kilitlendi.'); return { err: 'Çok fazla yanlış deneme. Giriş 5 dakika kilitlendi.', kilit: KILIT_DK * 60000 }; }
      return { err: 'Şifre yanlış. Kilitlenmeden önce kalan deneme: ' + (KILIT_DENEME - a.fails.length) + '.' };
    }
    a.fails = [];
    if (!a.hash) { var onay = rastgele_(24); onb_().put('ys:' + onay, t, 900); return { yeniSifre: true, onay: onay, ad: S.hoca[t].ad }; }
    return girisTamam_(t, hatirla, false);
  });
}
function girisTamam_(t, hatirla, adm) {
  var r = { oturum: oturumAc_({ hid: t, adm: !!adm }), ad: S.hoca[t].ad };
  if (hatirla) { var c = rastgele_(32), a = S.auth[t]; a.cihaz = (a.cihaz || []).filter(function (x) { return x.exp > Date.now(); }); a.cihaz.push({ h: ozet_(a.salt + '|c|' + c), exp: Date.now() + HATIRLA_GUN * 86400000 }); r.cihaz = c; }
  return r;
}
function apiSifreBelirle(token, onay, p1, p2, hatirla) {
  if (String(p1).length < 6) return { err: 'Şifre en az 6 karakter olmalı.' };
  if (p1 !== p2) return { err: 'Şifreler eşleşmiyor.' };
  var t0 = onb_().get('ys:' + onay); if (!t0) return { err: 'Süre doldu. Geçici şifrenizle yeniden giriş yapın.' };
  return islem_(function () {
    var t = hocaByKey_(token); if (t !== t0) return { err: 'Bağlantı geçersiz.' };
    var a = S.auth[t]; a.salt = rastgele_(16); a.hash = ozet_(a.salt + '|' + p1); a.temp = null; a.firstAt = a.firstAt || Date.now(); a.cihaz = [];
    onb_().remove('ys:' + onay); mlog(S.hoca[t].ad + ': ilk giriş yapıldı, şifre belirlendi.');
    return girisTamam_(t, hatirla, false);
  });
}
function apiHocaCihaz(token, cihaz) {
  return oku_(function () {
    var t = hocaByKey_(token); if (!t || !cihaz) return { err: 'yok' };
    var a = S.auth[t], h = ozet_(a.salt + '|c|' + cihaz);
    if ((a.cihaz || []).some(function (x) { return x.h === h && x.exp > Date.now(); })) return { oturum: oturumAc_({ hid: t, adm: false }), ad: S.hoca[t].ad };
    return { err: 'yok' };
  });
}
function apiCikis(oturum) { if (oturum) onb_().remove('ot:' + oturum); return true; }
function apiHocaBilgi(token) { return oku_(function () { var t = hocaByToken_(token); if (!t) return { err: 'Bağlantı geçersiz.' }; return { ad: S.hoca[t].ad, ilk: !S.auth[t].hash }; }); }

/* ================= HOCA: ekranlar ================= */
function notGorunum_(r, side, ctx) {
  var sd = r[side], o = r[side === 'a' ? 'b' : 'a'], acik = r.tur > 1 || r.neg;
  var v = { fin: r.fin, r100: r.r100, avg: r.avg, max: ctx.max, tur: r.tur, neg: r.neg, hl: r.hl, sub: sd.sub, c: sd.c, oz: sd.oz, top: sd.oz ? null : totalOf(sd, ctx.C),
    kr: ctx.C.map(function (c) { return { k: c[0], ad: c[1], max: c[2], acik: canEditCrit(r, c[0], ctx) && !sd.sub }; }),
    ozAcik: !(sd.sub || r.fin != null || (r.tur > 1 && !r.neg)), ozler: ctx.OZ.map(function (x) { return { k: x[0], ad: x[1], puan: x[2] }; }) };
  if (acik && r.fin == null) { // eşin notları yalnızca fark/negotiation aşamasında
    var pc = {}; r.hl.forEach(function (k) { pc[k] = o.c[k]; });
    v.es = { c: pc, oz: r.neg ? o.oz : null, top: o.oz ? null : totalOf(o, ctx.C) };
  }
  return v;
}
function juriGorunum_(t) {
  var j = JD().filter(function (j) { return j.h.indexOf(t) >= 0; })[0];
  if (!j) { var jj = S.juri.filter(function (j) { return j.h.indexOf(t) >= 0; })[0]; return { yok: true, mesaj: jj ? 'Bugün speaking jüri göreviniz yok. Jüri göreviniz: ' + gunAdi_(jj.gun) + ', ' + jName(jj) + ', Derslik ' + jj.room + '.' : 'Bu sınavda speaking jüri göreviniz yok.' }; }
  if (kagitDuzey_(j.lv)) return juriSaltGorunum_(j);   // 2. ve 3. kullanım: salt okunur jüri ekranı (tablo 11 K)
  var side = j.h.indexOf(t) === 0 ? 'a' : 'b', k = curSlot();
  var ps = []; for (var id in S.pairs) if (S.pairs[id].j === j.id) ps.push(S.pairs[id]);
  ps.sort(function (a, b) { return a.k - b.k || a.T - b.T; });
  var ek = [];
  ps.forEach(function (p) {
    if (p.bitti || !occ(p) || p.k >= RES || S.T < slotEnd(p.k) - 5) return;
    var n = ekN(j.id, p.k), end = slotEnd(p.k) + n * 5, e;
    if (n === 0) e = { tur: 1, k: p.k, kalan: Math.max(0, Math.ceil(slotEnd(p.k) - S.T)) };
    else if (n === 1 && S.T >= end) e = { tur: 2, k: p.k };
    else e = { tur: 0, bitis: hhmm(end) };
    var sonraki = ps.filter(function (q) { return q.k > p.k && !q.bitti && present(q).length; })[0];   // kapıda bekleyen çift
    if (sonraki && n === 1) e.kapi = 'Sıradaki çift kapıda bekliyor; ek süreniz ' + hhmm(end) + "'te bitiyor.";
    if (sonraki && n === 2) e.kapi = 'Kapıda bekleyen çifte birazdan sınava alacağınızı söyleyin.';
    ek.push(e);
  });
  return { yok: false, jid: j.id, ad: jName(j), room: j.room, lv: j.lv, jmsj: juriMesajlari_(j.id), max: crS(j.lv).reduce(function (a, c) { return a + c[2]; }, 0), es: S.hoca[j.h[side === 'a' ? 1 : 0]].ad,
    kapali: !!S.closed[j.id], ek: ek, gun: gunAdi_(S.day),
    ciftler: ps.map(function (p) {
      var ac = gelmediAcilis(p), cut = ac != null && S.T >= ac - 1e-9;
      return { id: p.id, k: p.k, saat: hhmm(SL[p.k]), set: setName(j.lv, p.k), yedek: p.k === RES, simdi: !p.bitti && p.k === k, bitti: p.bitti, cut: cut,
        acilis: ac == null ? 'önceki çift bitince (5 dk sonra)' : hhmm(ac), dolu: present(p).length > 0 || p.m.some(function (x) { return !x.dv; }),
        uyeler: p.m.filter(function (x) { return !x.dv; }).map(function (x) { var s = S.stu[x.no], ghost = !!x.mv || x.g === 'gelmedi';
          var kapi = x.kapi || (x.g === 'gelmedi' ? "Bu öğrenciyi 'Gelmedi' olarak işaretlediniz. Gelirse kantin tarafındaki okul girişinin oradaki kayıt masasına gitmesini söyleyin." : '') || (!ghost && tekBekliyor_(p) ? 'Bu öğrencinin eşi henüz belli değil. Sistem eş atayana kadar sınava başlamayın; öğrenci kapıda beklesin.' : '');
          return { no: x.no, ad: s.ad, cls: s.cls, src: x.src === 'erken girdi' ? '' : x.src, g: x.g, mv: x.mv, kapi: kapi, not: (!ghost && x.g === 'geldi') ? notGorunum_(grec('S:' + x.no), side, ctxS(x.no)) : null }; }),
        nedenler: p.bitti ? [] : canFinish(p), oto: p.bitti && !!p.oto, otoSaat: !p.bitti && p.hazirT != null ? hhmm(otoBitirSaati_(p)) : null, isaretUyari: isaretUnutuldu_(p) };
    }) };
}
function zarfGorunum_(t) {
  return S.zarf.filter(function (z) { return z.f === t || z.s === t; }).map(function (z) {
    var side = z.f === t ? 'a' : 'b', ben = side === 'a' ? z.fDone : z.sDone, ikisi = z.fDone && z.sDone, es = S.hoca[side === 'a' ? z.s : z.f];
    return { cls: z.cls, rol: side === 'a' ? 'First' : 'Second', side: side, fDone: z.fDone, sDone: z.sDone, ben: ben, ikisi: ikisi, son: side === 'a' ? z.fSon : z.sSon, neg: z.neg,
      // kör grading (MehDer 6.11.2026): partner adı ve telefonu yalnız iki değerlendirme bitip farkı 2'den fazla (ya da negotiation gereken) öğrenci varsa görünür
      es: (!UCUNCU_GRADER && ikisi && z.ogr.some(function (no) { var r = grec('W:' + no); return !r.abs && r.fin == null; })) ? { ad: es.ad } : null,   // 3. grader düzeninde partner adı hiç paylaşılmaz   // telefon paylaşılmaz (MehDer 7.11.2026)
      farkVardi: z.ogr.some(function (no) { var r = grec('W:' + no); return r.tur > 1 || r.neg || r.ucuncu; }),
      ucuncu: z.ogr.filter(function (no) { return grec('W:' + no).ucuncu; }).length,
      ogr: z.ogr.map(function (no) { var r = grec('W:' + no); return { no: no, ad: S.stu[no].ad, abs: r.abs, absBy: r.abs ? (r.absBy === 'b' ? 'Second' : r.absBy === 'a' ? 'First' : '') : '', not: notGorunum_(r, side, ctxW), kaydedildi: ben && !ikisi ? (r[side].oz ? r[side].oz : totalOf(r[side], CRW)) : null }; }) };
  });
}
/** Tarayıcıdaki taslak notları (bentler ve/veya özel durum) kayda geçirir. */
function notUygula_(r, side, ctx, a) {
  if (r.fin != null || r[side].sub) return '';
  if (a.oz !== undefined && (a.oz || null) !== r[side].oz) { var e0 = setOz(r, side, a.oz); if (e0) return e0; }
  var c = a.c || {}, ks = Object.keys(c);
  for (var i = 0; i < ks.length; i++) { if (r[side].c[ks[i]] === (c[ks[i]] === '' ? undefined : Number(c[ks[i]]))) continue; var e = setVal(r, side, ks[i], c[ks[i]], ctx); if (e) return e; }
  return '';
}
/** Yönetim › eşleşmeler (madde 4, MehDer 12.11.2026): bugünün bütün grupları; tam ad, no, sınıf, jüri, derslik, QR durumu. */
function eslesmeler_() {
  if (!S.day) return [];
  var out = [];
  for (var id in S.pairs) { var p = S.pairs[id]; if (p.gun !== S.day || !jur(p.j)) continue; var j = jur(p.j);
    var uye = p.m.filter(function (x) { return !x.mv && !x.dv; }); if (!uye.length) continue;
    out.push({ k: p.k, saat: hhmm(SL[p.k]), lv: j.lv, juri: j.no, derslik: j.room, bitti: !!p.bitti,
      uyeler: uye.map(function (x) { var s = S.stu[x.no]; return { ad: s.ad, no: x.no, cls: s.cls, qr: !!(x.qr || x.g === 'geldi' || (!p.sabit && s.scanT != null)), g: x.g || '', src: x.src || '' }; }) }); }
  return out.sort(function (a, b) { return a.k - b.k || a.lv.localeCompare(b.lv) || a.juri - b.juri; });
}
/** Salt okunur jüri ekranı (2. ve 3. kullanım; MehDer 12.11.2026): oturum oturum öğrenciler, QR durumu, 3'lü, aktarılan/erken/geç etiketleri,
 *  jüri değişikliği mesajları (okudum düğmesi yok – S9), yönetim mesajları. Not girişi ve SINAV BİTTİ yok. */
function juriSaltGorunum_(j) {
  var ps = []; for (var id in S.pairs) { var p = S.pairs[id]; if (p.gun === S.day && p.j === j.id) ps.push(p); }
  ps.sort(function (a, b) { return a.k - b.k || a.T - b.T; });
  var etiket = function (x) { return x.src === 'aktarma' ? hhmm(SL[x.from]) + ' oturumundan aktarıldı' : x.src === 'birlesim' ? 'Jüri ' + (jur(x.fromJ) || {}).no + "'ten birleştirildi"
    : x.src === 'erken' || x.src === 'erken girdi' ? 'ERKEN GELEN ÖĞRENCİ – öğrencinin onayıyla sistem erken gönderdi' : x.src === 'gec' ? 'Geç kaldı; boş yere çağrıldı' : x.src === 'yedek' ? 'Yedek oturum' : x.src || ''; };
  var deg = [];   // jüri değişikliği mesajları
  ps.forEach(function (p) { p.m.forEach(function (x) { if (x.dv) return; var s = S.stu[x.no];
    if (x.src && x.fromJ && x.fromJ !== j.id) deg.push({ T: x.qrT || p.T, metin: s.ad + ' Jüri ' + (jur(x.fromJ) || {}).no + "'den (" + hhmm(SL[x.from]) + ') size yönlendirildi.' });
    if (x.mv && s.pair && S.pairs[s.pair] && S.pairs[s.pair].j !== j.id) { var q = S.pairs[s.pair], jq = jur(q.j); deg.push({ T: S.T, metin: s.ad + ' sizin jürinizden Jüri ' + jq.no + "'ye (Derslik " + jq.room + ', ' + hhmm(SL[q.k]) + ') yönlendirildi.' }); }
    if (x.src === 'aktarma' && x.from != null && !x.fromJ) { var e0 = null; for (var id2 in S.pairs) { var r = S.pairs[id2]; if (r.k === x.from && r.j !== j.id && r.m.some(function (y) { return y.no === x.no && y.mv; })) e0 = r; }
      if (e0) deg.push({ T: x.qrT || p.T, metin: s.ad + ' Jüri ' + jur(e0.j).no + "'den (" + hhmm(SL[x.from]) + ') size yönlendirildi.' }); } }); });
  return { yok: false, salt: true, jid: j.id, ad: jName(j), room: j.room, lv: j.lv, gun: gunAdi_(S.day), jmsj: juriMesajlari_(j.id), kapali: !!S.closed[j.id],
    degisiklik: deg.sort(function (a, b) { return b.T - a.T; }).map(function (d) { return d.metin; }),
    oturumlar: ps.map(function (p) { var uye = p.m.filter(function (x) { return !x.mv && !x.dv; });
      return { saat: hhmm(SL[p.k]), yedek: p.k === RES, simdi: p.k === curSlot(), bitti: !!p.bitti, uclu: uye.length >= 3,
        uyeler: uye.map(function (x) { var s = S.stu[x.no]; return { ad: s.ad, cls: s.cls, no: x.no, qr: !!(x.qr || x.g === 'geldi'), etiket: etiket(x) }; }) }; }) };
}
function hocaGorunum_(o) {
  var t = o.hid;
  return { ad: S.hoca[t].ad, adm: !!o.adm, saat: hhmm(S.T), gorevler: S.gorev[t] || [], juri: juriGorunum_(t), zarflar: zarfGorunum_(t),
    msj: hocaMesajlari_(t), anket: hocaAnketDurum_(t), birimler: birimlerim_(S.hoca[t].eposta), anketler: { S: ANKET.S, W: ANKET.W, olcek: OLCEK }, sorunlar: SORUN.h };
}
function apiHoca(oturum) { var o; try { o = oturum_(oturum); } catch (e) { return { err: 'OTURUM' }; } return oku_(function () { return hocaGorunum_(o); }); }
function apiHocaIslem(oturum, islem, a) {
  var o; try { o = oturum_(oturum); } catch (e) { return { err: 'OTURUM' }; }
  return islem_(function () {
    var t = o.hid, by = o.adm ? (o.admAd ? o.admAd + ' – ' : '') + 'yönetim (' + S.hoca[t].ad + ' adına)' : S.hoca[t].ad, hata = '';
    var benimCift = function (pid) { var p = S.pairs[pid], j = p && jur(p.j); return p && j && j.h.indexOf(t) >= 0 && j.gun === S.day; };
    var side = function (no) { var p = null; for (var id in S.pairs) { var q = S.pairs[id]; if (q.m.some(function (x) { return x.no === no && x.g === 'geldi'; }) && jur(q.j).h.indexOf(t) >= 0 && jur(q.j).gun === S.day) p = q; } return p ? (jur(p.j).h.indexOf(t) === 0 ? 'a' : 'b') : null; };
    var zside = function (no) { var z = S.zarf.filter(function (z) { return z.ogr.indexOf(no) >= 0 && (z.f === t || z.s === t); })[0]; return z ? (z.f === t ? 'a' : 'b') : null; };
    switch (islem) {
      case 'geldi': hata = benimCift(a.p) ? markGeldi(a.p, a.no) : 'Yetki yok.'; break;
      case 'gelmedi': hata = benimCift(a.p) ? markGelmedi(a.p, a.no) : 'Yetki yok.'; break;
      case 'bitti': hata = benimCift(a.p) ? finish(a.p) : 'Yetki yok.'; break;
      case 'okudum': hata = juriOkudum_(t, a.id); break;
      case 'ek': { var jj = jur(a.j); hata = jj && jj.h.indexOf(t) >= 0 ? ekIste(a.j, Number(a.k)) : 'Yetki yok.'; break; }
      case 'hesapla': { var sd = side(a.no); if (!sd) { hata = 'Yetki yok.'; break; } var r = grec('S:' + a.no), cx = ctxS(a.no); hata = notUygula_(r, sd, cx, a) || submitGrade(r, sd, cx, by); break; }
      case 'wKaydet': { var zs = zside(a.no); if (!zs) { hata = 'Yetki yok.'; break; } var r2 = grec('W:' + a.no); hata = notUygula_(r2, zs, ctxW, a) || submitGrade(r2, zs, ctxW, by); break; }
      case 'wGirmedi': { var zs3 = zside(a.no); hata = zs3 ? wrAbs(a.no, !!a.v, zs3) : 'Yetki yok.'; break; }
      case 'wTamam': { var z = zarf(a.cls); if (!(z && (z.f === t || z.s === t))) { hata = 'Yetki yok.'; break; } var zsd = z.f === t ? 'a' : 'b', hl = [];
        Object.keys(a.notlar || {}).forEach(function (no) { if (z.ogr.indexOf(no) < 0) return; var e = notUygula_(grec('W:' + no), zsd, ctxW, a.notlar[no]); if (e) hl.push(S.stu[no].ad + ': ' + e); });
        hata = hl.length ? hl.join(' · ') : wrDone(a.cls, zsd, by); break; }
      default: hata = 'Bilinmeyen işlem.';
    }
    return { hata: hata, v: function () { return hocaGorunum_(o); } };   // görünüm kilit dışında hazırlanır (yük testi 3.11)
  });
}

/* ================= YÖNETİM ================= */
/* Kişisel yönetim girişleri (11 tablosu N, MehDer 12.11.2026): her yönetici kurumsal e-postası + kendi şifresiyle girer; kayıtta adı görünür.
 * İlk girişte (ya da şifresi sıfırlanınca) geçici şifre olarak eski ortak yönetim şifresi kullanılır, hemen kendi şifresini belirler.
 * Ortak şifreyle e-postasız giriş, ilk kişisel şifre belirlenince kapanır. rol: 'tam' = bütün yönetim; 'ogrenci' = yalnız Öğrenci Birimi (Faz 5). */
var YON_KUL = [['Mehmet Duranlıoğlu', 'mduranlioglu@anadolu.edu.tr', 'tam'], ['Mehmet Gönen', 'mgonen@anadolu.edu.tr', 'tam'],
  ['İlknur İstifçi', 'iistifci@anadolu.edu.tr', 'tam'], ['İnci Aras', 'incikarabacak@anadolu.edu.tr', 'ogrenci']];
var YON_SIFRE_MIN = 8;
function yonKul_(e) { e = String(e || '').trim().toLowerCase(); for (var i = 0; i < YON_KUL.length; i++) if (YON_KUL[i][1] === e) return { ad: YON_KUL[i][0], e: e, rol: YON_KUL[i][2] }; return null; }
function yonKayit_(e) { var y = S.yonetim; y.u = y.u || {}; return y.u[e] || (y.u[e] = { salt: null, hash: null, fails: [], lockUntil: 0, ilk: null, son: null }); }
function kisiselVar_() { var u = (S.yonetim && S.yonetim.u) || {}; return Object.keys(u).some(function (e) { return !!u[e].hash; }); }
function yanlis_(r, now) { r.fails = (r.fails || []).filter(function (x) { return now - x < KILIT_DK * 60000; }); r.fails.push(now); if (r.fails.length >= KILIT_DENEME) { r.lockUntil = now + KILIT_DK * 60000; r.fails = []; return true; } return false; }
function apiYonetimGiris(eposta, sifre) {
  if (arguments.length < 2) { sifre = eposta; eposta = ''; }   // eski ekran: yalnız şifre
  return islem_(function () {
    var y = S.yonetim, now = Date.now();
    if (!eposta) {   // e-postasız ortak şifre: yalnız hiçbir kişisel şifre belirlenmemişken (geçiş dönemi)
      if (kisiselVar_()) return { err: 'Ortak yönetim şifresi kaldırıldı. Kurumsal e-postanız ve kendi şifrenizle girin.' };
      if (y.lockUntil > now) return { err: 'Giriş kilitli. Biraz sonra tekrar deneyin.' };
      if (ozet_(y.salt + '|' + sifre) !== y.hash) { yanlis_(y, now); return { err: 'Şifre yanlış.' }; }
      y.fails = []; return { oturum: oturumAc_({ yon: true, rol: 'tam', ad: 'yönetim' }) };
    }
    var k = yonKul_(eposta); if (!k) return { err: 'Bu e-posta adresinin yönetim yetkisi yok.' };
    var r = yonKayit_(k.e);
    if (r.lockUntil > now) return { err: 'Çok fazla yanlış deneme. ' + Math.ceil((r.lockUntil - now) / 60000) + ' dakika sonra tekrar deneyin.' };
    var ok = r.hash ? ozet_(r.salt + '|' + sifre) === r.hash : ozet_(y.salt + '|' + sifre) === y.hash;
    if (!ok) { if (yanlis_(r, now)) { mlog(k.ad + ': yönetim girişinde 7 yanlış deneme – 5 dk kilitlendi.'); return { err: 'Çok fazla yanlış deneme. Giriş 5 dakika kilitlendi.' }; }
      return { err: (r.hash ? 'Şifre yanlış.' : 'İlk girişte geçici şifre olarak ortak yönetim şifresini yazın.') + ' Kilitlenmeden önce kalan deneme: ' + (KILIT_DENEME - r.fails.length) + '.' }; }
    r.fails = [];
    if (!r.hash) { var onay = rastgele_(24); onb_().put('yys:' + onay, k.e, 900); return { yeniSifre: true, onay: onay, ad: k.ad }; }
    r.son = now; return { oturum: oturumAc_({ yon: true, e: k.e, ad: k.ad, rol: k.rol }), ad: k.ad, rol: k.rol };
  });
}
function apiYonetimSifreBelirle(eposta, onay, p1, p2) {
  if (String(p1).length < YON_SIFRE_MIN) return { err: 'Yönetim şifresi en az ' + YON_SIFRE_MIN + ' karakter olmalı.' };
  if (p1 !== p2) return { err: 'Şifreler eşleşmiyor.' };
  var k = yonKul_(eposta), e0 = onb_().get('yys:' + onay); if (!k || e0 !== k.e) return { err: 'Süre doldu. Geçici şifreyle yeniden giriş yapın.' };
  return islem_(function () {
    var y = S.yonetim; if (ozet_(y.salt + '|' + p1) === y.hash) return { err: 'Ortak şifreden farklı bir şifre seçin.' };
    var r = yonKayit_(k.e); r.salt = rastgele_(16); r.hash = ozet_(r.salt + '|' + p1); r.ilk = r.ilk || Date.now(); r.son = Date.now();
    onb_().remove('yys:' + onay); mlog(k.ad + ': yönetim şifresi belirlendi.');
    return { oturum: oturumAc_({ yon: true, e: k.e, ad: k.ad, rol: k.rol }), ad: k.ad, rol: k.rol };
  });
}
/** Yönetim ekranındaki "Yönetim kullanıcıları" listesi (şifreler görünmez). */
function yonKullanicilari_() { return YON_KUL.map(function (x) { var r = ((S.yonetim || {}).u || {})[x[1]] || {}; return { ad: x[0], e: x[1], rol: x[2] === 'tam' ? 'Bütün yönetim' : 'Yalnız Öğrenci Birimi', sifre: !!r.hash, son: r.son ? Utilities.formatDate(new Date(r.son), TZ, 'dd.MM.yyyy HH:mm') : '', kilit: r.lockUntil > Date.now() }; }); }
/** Düzey bazlı öğrenci durumu tablosu (MehDer, 1.11.2026): her hücre sayı + tıklanınca açılan öğrenci listesi. */
function duzeyTablosu_(st) {
  var SIRA = ['A', 'B', 'C', 'D1', 'D2'], lvs = [];
  st.forEach(function (s) { if (lvs.indexOf(s.lv) < 0) lvs.push(s.lv); });
  lvs.sort(function (a, b) { var i = SIRA.indexOf(a), j = SIRA.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b); });
  var uyeOf = function (s) { var p = s.pair && S.pairs[s.pair]; return p ? { p: p, x: p.m.filter(function (m) { return m.no === s.no; })[0] } : null; };
  var sinavda = function (s) { var u = s.st === 'atandi' && uyeOf(s); return !!(u && u.x && u.x.g === 'geldi' && !u.p.bitti); };
  var juriSlot = function (s) { var u = uyeOf(s); return u ? jName(jur(u.p.j)) + ' · ' + hhmm(SL[u.p.k]) : ''; };
  var planJuri = function (s) { var p = s.p5 && S.pairs[s.p5]; return p ? ' · ' + jName(jur(p.j)) : ''; };
  var siraAnah = function (s) { var p = s.pair && S.pairs[s.pair] || s.p5 && S.pairs[s.p5], j = p && jur(p.j); return [p ? p.k : s.plan, j ? j.no : 99]; };   // oturum, sonra jüri (MehDer 11.11.2026)
  var gelmediYer = function (s) { for (var id in S.pairs) { var p = S.pairs[id]; if (p.gun === S.day && p.m.some(function (m) { return m.no === s.no && m.g === 'gelmedi'; })) return jName(jur(p.j)) + ' · ' + hhmm(SL[p.k]); } return ''; };
  var R = [
    ['Toplam öğrenci', function () { return true; }, function (s) { return 'grup ' + hhmm(SL[s.plan]) + planJuri(s); }],
    ['QR okutmayan', function (s) { return s.st === 'yok'; }, function (s) { return 'grup ' + hhmm(SL[s.plan]) + planJuri(s); }],
    ['QR okutan', function (s) { return s.st !== 'yok'; }, function (s) { return (sabitMi_(s) ? (s.st === 'red' ? 'G – geç okuttu' : s.st === 'bitti' ? 'oturumu bitti' : 'QR okuttu') + ' · ' + (s.st === 'red' ? hhmm(SL[s.plan]) + planJuri(s) : juriSlot(s)) : null) || ({ bekle: s.trans ? 'aktarıldı' : 'eş bekliyor', atandi: sinavda(s) ? 'sınavda' : 'jüriye atandı', bitti: 'sınavı bitti', gec: 'geç – bekliyor', gelmedi: 'gelmedi', alinamadi: 'alınamadı', red: 'alınamadı' })[s.st] || s.st; }],
    ['Eş bekleyen', function (s) { return s.st === 'bekle' && !s.trans; }, function (s) { return hhmm(SL[s.eff]) + (s.early ? ' · erken hazır' : ''); }],
    ['Aktarılan', function (s) { return s.trans && (s.st === 'bekle' || sabitMi_(s)); }, function (s) { return sabitMi_(s) ? hhmm(SL[s.transFrom]) + ' → ' + juriSlot(s) : hhmm(SL[s.eff]) + ' slotunda öncelikli'; }],
    ['Jüriye atandı – sırada', function (s) { return s.st === 'atandi' && !sinavda(s); }, juriSlot],
    ['Sınavı devam eden', sinavda, juriSlot],
    ['Sınavı biten', function (s) { return s.st === 'bitti'; }, juriSlot],
    ['Geç – bekliyor', function (s) { return s.st === 'gec'; }, function (s) { return Math.round(s.late) + ' dk geç'; }, true],
    ['Gelmedi', function (s) { return s.st === 'gelmedi'; }, gelmediYer, true],
    ['Alınamadı', function (s) { return s.st === 'alinamadi' || s.st === 'red'; }, function (s) { return s.st === 'red' ? (GEC_AL ? hhmm(LASTCALL) + ' sonrası okuttu' : Math.round(s.late || 0) + ' dk geç okuttu (G)') : 'son çağrıya kadar yer açılmadı'; }, true]
  ];
  return { duzeyler: lvs, satirlar: R.map(function (r) {
    var hucre = lvs.concat(['*']).map(function (lv) {
      var l = st.filter(function (s) { return (lv === '*' || s.lv === lv) && r[1](s); }).sort(function (a, b) { var x = siraAnah(a), y = siraAnah(b); return x[0] - y[0] || x[1] - y[1]; });
      return { n: l.length, l: l.map(function (s) { return [s.ad, s.no, s.cls || '', s.lv, r[2](s) || '']; }) };
    });
    return { ad: r[0], kritik: !!r[3], hucre: hucre };
  }) };
}
function yonetimGorunum_() {
  var st = dayStu(), say = function (f) { return st.filter(f).length; };
  var k = curSlot();
  return {
    gun: gunAdi_(S.day) || 'Bugün speaking sınavı yok', saat: hhmm(S.T), slotlar: SL.map(hhmm), simdi: k,
    doluluk: { kb: Math.round((S.dBoy || 0) / 1024), sinirKb: Math.round(DPARCA * (PARCA_ONBELLEK - 20) / 1024), yuzde: Math.round((S.dBoy || 0) / (DPARCA * (PARCA_ONBELLEK - 20)) * 100) },
    gunlerKul: [1, 2, 3, 4, 5].filter(function (g) { return S.cfg.gunler[g] && (S.cfg.gunler[g].lv || []).filter(String).length; }).map(function (g) { var gn = S.cfg.gunler[g];
      return { g: g, ad: gn.ad || '', lv: (gn.lv || []).filter(String).join(', '), kul: kulGun_(g), secili: !!(S.kul && S.kul[g]), kilit: gunBasladi_(g), sabit: !!S.sabit }; }),
    deneme: ayarlar_().denemeGunu ? { gun: Number(ayarlar_().denemeGunu), gunler: [1, 2, 3].filter(function (g) { return S.cfg.gunler[g] && S.cfg.gunler[g].tarih !== undefined && (g < 3 || S.cfg.gunler[3]); }), hiz: (denemeSaat_() || {}).hiz, saat: hhmm(S.T) } : null,
    sayilar: [['Okutan', say(function (s) { return s.st !== 'yok'; })], ['Eş bekleyen', say(function (s) { return s.st === 'bekle' && !s.trans; })], ['Aktarılan', say(function (s) { return s.trans && (s.st === 'bekle' || sabitMi_(s)); })],
      ['Geç – bekliyor', say(function (s) { return s.st === 'gec'; })], ['Sınavı biten', say(function (s) { return s.st === 'bitti'; })], ['Gelmedi', say(function (s) { return s.st === 'gelmedi'; })], ['Alınamadı', say(function (s) { return s.st === 'alinamadi' || s.st === 'red'; })]],
    tablo: JD().map(function (j) {
      return { ad: jName(j), room: j.room, kapali: S.closed[j.id] ? hhmm(SL[S.closed[j.id].from]) : null, hocalar: j.h.map(function (t) { return S.hoca[t].ad; }),
        hucre: SL.map(function (m, i) { return { kapali: !jOpen(j, i), cips: pairsAt(j.id, i).reduce(function (a, p) { return a.concat(p.m.map(function (x) { var s = S.stu[x.no]; return { t: initials(s.ad) + ' …' + s.no.slice(-4) + (x.dv ? ' · erken davet – onay bekleniyor (' + hhmm(x.dvSon) + '\'e kadar)' : x.src ? ' · ' + x.src : ''), ad: s.ad, c: x.g === 'gelmedi' ? 'bad' : (x.mv || x.dv) ? 'cl' : p.bitti ? 'ok' : 'run' }; })); }, []) }; }) };
    }),
    bekleyen: st.filter(function (s) { return s.st === 'bekle' && !s.trans; }).map(function (s) { return s.ad + ' · ' + s.lv + ' · ' + hhmm(SL[s.eff]) + (s.early ? ' · erken hazır' : ''); }),
    aktarilan: st.filter(function (s) { return s.trans && (s.st === 'bekle' || sabitMi_(s)); }).sort(function (a, b) { return (a.transFrom != null ? a.transFrom : a.eff) - (b.transFrom != null ? b.transFrom : b.eff); }).map(function (s) { return s.ad + ' · ' + s.lv + ' · ' + hhmm(SL[s.eff]) + (sabitMi_(s) ? ' çiftine eklendi' : ' slotunda öncelikli'); }),
    gec: st.filter(function (s) { return s.st === 'gec'; }).sort(function (a, b) { return a.late - b.late; }).map(function (s) { return s.ad + ' · ' + s.lv + ' · ' + Math.round(s.late) + ' dk geç'; }),
    alinamadi: st.filter(function (s) { return s.st === 'alinamadi' || s.st === 'red'; }).map(function (s) { return s.ad + ' · ' + s.lv + (s.st === 'red' ? ' · ' + (GEC_AL ? hhmm(LASTCALL) + ' sonrası okuttu' : Math.round(s.late || 0) + ' dk geç okuttu (G)') : ''); }),
    unutulan: unutulanIslemler_(),
    uyarilar: Object.keys(S.gr).filter(function (key) { var r = S.gr[key]; return key.charAt(0) === 'S' && r.fin == null && (r.neg || r.tur > 1); }).map(function (key) { var s = S.stu[key.slice(2)], r = S.gr[key]; return s.ad + ' (' + s.lv + ') – ' + (r.neg ? 'negotiation gerekli' : "puan farkı 2'den fazla"); }),
    yonKul: yonKullanicilari_(),
    hocalar: Object.keys(S.hoca).sort(function (a, b) { return S.hoca[a].ad.localeCompare(S.hoca[b].ad, 'tr'); }).map(function (t) { var a = S.auth[t]; return { id: t, ad: S.hoca[t].ad, ilk: !!a.hash, temp: a.hash ? null : a.temp, kilit: a.lockUntil > Date.now() }; }),
    zarflar: S.zarf.map(function (z) { var n = z.ogr.filter(function (no) { return grec('W:' + no).fin != null; }).length; return { cls: z.cls, f: S.hoca[z.f].ad, s: S.hoca[z.s].ad, fDone: z.fDone, sDone: z.sDone, kesin: n, toplam: z.ogr.length }; }),
    kayit: S.log.slice(0, 200).map(function (l) { return (l.g ? 'G' + l.g + ' ' : '') + hhmm(l.T) + '  ' + l.m; }),
    eslesmeler: eslesmeler_(), simdiK: k,
    dt: duzeyTablosu_(st), msj: yonetimMesajlari_(), duzeyler: duzeyDurumlari_(), anket: anketOzet_(), araclar: araclarGorunum_()
  };
}
/** Yük ölçümü (yalnız yönetim): son işlemlerin kilit bekleme ve iç süreleri. */
function apiProfil(oturum) { var o; try { o = oturum_(oturum); } catch (e) { return { err: 'OTURUM' }; } if (!o.yon) return { err: 'OTURUM' }; try { return { p: JSON.parse(CacheService.getScriptCache().get('prof') || '[]') }; } catch (e) { return { p: [] }; } }
function apiYonetim(oturum) { var o; try { o = oturum_(oturum); } catch (e) { return { err: 'OTURUM' }; } if (!o.yon) return { err: 'OTURUM' };
  if (o.rol && o.rol !== 'tam') return { rol: o.rol, ben: o.ad };   // İnci Aras: yalnız Öğrenci Birimi (Faz 5)
  return oku_(function () { var v = yonetimGorunum_(); v.ben = o.ad || 'yönetim'; v.benE = o.e || ''; v.rol = 'tam'; return v; }); }
function apiYonetimIslem(oturum, islem, a) {
  var o; try { o = oturum_(oturum); } catch (e) { return { err: 'OTURUM' }; } if (!o.yon) return { err: 'OTURUM' };
  if (o.rol && o.rol !== 'tam') return { err: 'Bu işlem için yetkiniz yok.' };
  YON_AD = o.ad && o.ad !== 'yönetim' ? o.ad : '';
  try { return yonetimIslem_(o, islem, a || {}); } finally { YON_AD = ''; }
}
function yonetimIslem_(o, islem, a) {
  if (islem === 'kendiSifre') return yonKendiSifre_(o, a);
  if (islem === 'ortakSifre') return yonOrtakSifre_(o, a);
  if (islem === 'sonuc') return { mesaj: sonuclariYaz_() };
  if (islem === 'anketVeri') { S = durumOku_(); return { veri: anketVeri_() }; }
  if (islem === 'arsivVeri') { S = durumOku_(); baglam_(); return { veri: arsivVeri_(a.gun, a.lv || '') }; }
  var ceviri = '';
  if (islem === 'cevap') { S = durumOku_(); destekHazirla_(); var mm = S.msj.filter(function (x) { return x.id === a.id; })[0]; if (mm && mm.dil && mm.dil !== 'tr') ceviri = cevir_(kirp_(a.metin, MESAJ_UZUNLUK), mm.dil, 'tr'); }
  var c2 = {};   // çeviriler kilit dışında (yavaş)
  if (islem === 'tv' || islem === 'omesaj') c2.en = cevir_(kirp_(a.metin, MESAJ_UZUNLUK), 'en', 'tr');
  if (islem === 'omesaj') c2.ru = cevir_(kirp_(a.metin, MESAJ_UZUNLUK), 'ru', 'tr');
  return islem_(function () {
    var mesaj = '';
    if (islem === 'cevap') { var e1 = mesajCevapla_(a.id, a.metin, ceviri); return { mesaj: e1 || 'Cevap gönderildi.', hata: !!e1, v: yonetimGorunum_ }; }
    if (islem === 'cozuldu') { var e2 = mesajCozuldu_(a.id); return { mesaj: e2 || '', v: yonetimGorunum_ }; }
    if (islem === 'yayinla') { return { mesaj: notYayinla_(a.key, !!a.zorla), v: yonetimGorunum_ }; }
    if (islem === 'sifirla') { var au = S.auth[a.id]; au.hash = null; au.temp = rastgele_(8); au.fails = []; au.lockUntil = 0; au.cihaz = []; mlog(S.hoca[a.id].ad + ': şifre sıfırlandı.'); baglantiListesiYaz_(); var hh = S.hoca[a.id], gitti = false;
      if (a.eposta && hh.eposta) { var m = epostaMetni_(a.id, uygulamaAdresi_()); MailApp.sendEmail(hh.eposta, 'Sınav portalı – yeni geçici şifreniz', m.metin.replace(/^(Sayın [^\n]*\n\n)/, '$1Şifreniz yönetim tarafından sıfırlandı; yeni geçici şifreniz aşağıdadır.\n\n'), postaSecenek_()); gitti = true; }
      mesaj = hh.ad + ': yeni geçici şifre ' + au.temp + (gitti ? ' – bağlantı ve yeni geçici şifre e-postayla gönderildi.' : ' (hocaya iletin; Bağlantı Listesi sayfası güncellendi).'); }
    else if (islem === 'saat') { var ay = ayarlar_(); if (!ay.denemeGunu) mesaj = 'Deneme saati yalnızca denemede (Ayarlar › denemeGunu dolu) kullanılır.';
      else { var dk = a.saat ? Number(a.saat.split(':')[0]) * 60 + Number(a.saat.split(':')[1]) : S.T, hz = a.hiz != null ? Number(a.hiz) : (function (d) { return d && d.hiz != null ? d.hiz : 1; })(denemeSaat_());   // durdurulmuşken saate atlamak saati başlatmaz (prova 1.11)
        denemeSaatYaz_({ ms: Date.now(), dk: dk, hiz: hz });
        if (dk < S.T) { eventList().forEach(function (e) { if (e.t > dk) delete S.done['g' + S.day + ':' + e.key]; });   // geri alınan saatin olayları yeniden işlenebilsin
          Object.keys(S.closed).forEach(function (id) { var j = jur(id); if (j && j.gun === S.day && S.closed[id].T > dk) delete S.closed[id]; }); }
        S.T = dk; mlog('Deneme saati: ' + hhmm(dk) + ', hız ×' + hz + '.'); mesaj = 'Deneme saati ' + hhmm(dk) + ', hız ×' + hz + '.'; } }
    else if (islem === 'kullanim') mesaj = kullanimSec_(a.gun, a.kul) || 'Kullanım şekli kaydedildi.';
    else if (islem === 'gun') { if (!ayarlar_().denemeGunu) mesaj = 'Yalnızca denemede.'; else { ayarYaz_('denemeGunu', String(a.gun)); mesaj = 'Deneme günü: ' + a.gun + '. Saat ayarını yeniden yapın.'; } }
    else if (islem === 'ata') mesaj = yonetimAta_(String(a.no || '').replace(/\D/g, ''), a.jid, a.k) || 'Öğrenci jüriye atandı; öğrenci ve jüri ekranında görünüyor.';
    else if (islem === 'yeniden') mesaj = yenidenAl_(String(a.no || '').replace(/\D/g, '')) || 'Öğrenci yeniden sınava alındı (öncelikli bekliyor).';
    else if (islem === 'jmesaj') mesaj = juriMesajGonder_(a.jids, !!a.hepsi, a.metin) || 'Mesaj jüri ekranlarına gönderildi.';
    else if (islem === 'tv') { var mt = kirp_(a.metin, 300), dk = Math.max(1, Math.min(120, Number(a.dk) || 10)); if (!mt) mesaj = 'Duyuru boş.'; else { S.tvd = { metin: mt, en: c2.en || '', bitis: Date.now() + dk * 60000, T: S.T }; mlog('TV duyurusu (' + dk + ' dk): ' + mt.slice(0, 80)); mesaj = 'Duyuru TV ekranında ' + dk + ' dakika görünecek.'; } }
    else if (islem === 'tvkaldir') { S.tvd = null; mesaj = 'TV duyurusu kaldırıldı.'; }
    else if (islem === 'omesaj' && a.hedef && a.hedef !== 'tek') mesaj = ogrTopluMesaj_(a.hedef, a.metin, c2.en, c2.ru);
    else if (islem === 'omesaj') mesaj = ogrMesajGonder_(String(a.no || '').replace(/\D/g, ''), a.metin, c2.en, c2.ru) || 'Mesaj öğrencinin ekranına gönderildi.';
    else if (islem === 'yerine') { mlog(S.hoca[a.id].ad + ' adına işlem açıldı.'); return { hocaOturum: oturumAc_({ hid: a.id, adm: true, admAd: YON_AD }), token: S.auth[a.id].token, v: yonetimGorunum_ }; }
    else if (islem === 'birimUyeEkle') { var ek = birimUyeEkle_(); mesaj = ek.length ? ek.length + ' birim üyesi sisteme eklendi: ' + ek.join(', ') + '. Giriş bilgileri için: Hocalar ve şifreler (geçici şifre) ya da E-posta önizleme (MehDer onayıyla gönderim).' : 'Bütün birim üyeleri zaten sistemde.'; }
    else if (islem === 'yonSifirla') { var yk = yonKul_(a.e); if (!yk) return { mesaj: 'Kullanıcı bulunamadı.', v: yonetimGorunum_ };
      if (yk.e === o.e) return { mesaj: 'Kendi şifrenizi "Şifremi değiştir" ile değiştirin.', v: yonetimGorunum_ };
      var yr = yonKayit_(yk.e); yr.hash = null; yr.salt = null; yr.fails = []; yr.lockUntil = 0; mlog(yk.ad + ': yönetim şifresi sıfırlandı (ilk girişte ortak şifreyle yeni şifre belirleyecek).');
      return { mesaj: yk.ad + ' şifresi sıfırlandı. İlk girişte geçici şifre olarak ortak yönetim şifresini yazacak.', v: yonetimGorunum_ }; }
    return { mesaj: mesaj, v: yonetimGorunum_ };
  });
}

/** Yönetim › Unutulan işlemler (MehDer 7.11.2026): Geldi/Gelmedi işaretlenmemiş ya da slot bitişinden 10 dk sonra hâlâ bitmemiş çiftler. */
function unutulanIslemler_() {
  if (!S.day) return [];
  var out = [];
  for (var id in S.pairs) { var p = S.pairs[id]; if (p.gun !== S.day || p.bitti || !ciftGecerli_(p) || !present(p).length) continue;
    var j = jur(p.j), ad = jName(j) + ' · Derslik ' + j.room + ' · ' + hhmm(SL[p.k]) + ' çifti';
    if (isaretUnutuldu_(p)) out.push({ jid: j.id, h: j.h.map(function (t) { return { id: t, ad: S.hoca[t].ad }; }), ad: ad, neden: 'Geldi/Gelmedi işaretlenmedi (oturum ' + hhmm(SL[p.k]) + "'te başladı)" });
    else if (S.T >= slotEnd(p.k) + 10) { var R = canFinish(p); out.push({ jid: j.id, h: j.h.map(function (t) { return { id: t, ad: S.hoca[t].ad }; }), ad: ad, neden: 'SINAV BİTTİ yapılmadı' + (R.length ? ': ' + R.join('; ') : '') }); }
  }
  return out;
}
/** Yöneticinin kendi şifresini değiştirmesi: eski şifre + yeni şifre iki kez. */
/** Ortak yönetim şifresi (ilk giriş ve sıfırlamada geçici şifre) değiştirilir; kişisel şifreler korunur (MehDer 19.11.2026). Yalnız rol 'tam', kendi şifresiyle onay. */
function yonOrtakSifre_(o, a) {
  if (!o.e) return { mesaj: 'Önce kurumsal e-postanız ve kendi şifrenizle giriş yapın.' };
  if (String(a.p1 || '').length < YON_SIFRE_MIN) return { mesaj: 'Yeni ortak şifre en az ' + YON_SIFRE_MIN + ' karakter olmalı.' };
  if (a.p1 !== a.p2) return { mesaj: 'Yeni ortak şifreler eşleşmiyor.' };
  return islem_(function () {
    var r = yonKayit_(o.e); if (!r.hash || ozet_(r.salt + '|' + a.eski) !== r.hash) return { mesaj: 'Kendi şifreniz yanlış.', v: yonetimGorunum_ };
    if (ozet_(r.salt + '|' + a.p1) === r.hash) return { mesaj: 'Ortak şifre kendi şifrenizle aynı olamaz.', v: yonetimGorunum_ };
    S.yonetim.salt = rastgele_(16); S.yonetim.hash = ozet_(S.yonetim.salt + '|' + a.p1);
    mlog(o.ad + ': ortak yönetim şifresini (ilk giriş / sıfırlama için geçici şifre) değiştirdi.');
    return { mesaj: 'Ortak yönetim şifresi değiştirildi. İlk girişi bekleyenler ve şifresi sıfırlananlar bu şifreyle girip kendi şifresini belirleyecek.', v: yonetimGorunum_ };
  });
}
function yonKendiSifre_(o, a) {
  if (!o.e) return { mesaj: 'Ortak şifreyle girdiniz; önce kurumsal e-postanızla giriş yapın.' };
  if (String(a.p1 || '').length < YON_SIFRE_MIN) return { mesaj: 'Yeni şifre en az ' + YON_SIFRE_MIN + ' karakter olmalı.' };
  if (a.p1 !== a.p2) return { mesaj: 'Yeni şifreler eşleşmiyor.' };
  return islem_(function () {
    var r = yonKayit_(o.e); if (!r.hash || ozet_(r.salt + '|' + a.eski) !== r.hash) return { mesaj: 'Mevcut şifre yanlış.', v: yonetimGorunum_ };
    r.salt = rastgele_(16); r.hash = ozet_(r.salt + '|' + a.p1); mlog(o.ad + ': yönetim şifresini değiştirdi.'); return { mesaj: 'Şifreniz değiştirildi.', v: yonetimGorunum_ };
  });
}
/* ======================= Destek.gs ======================= */
/**
 * Destek.gs – sorun bildirme (mesajlar), sınav sonu anketleri ve düzey notlarının yayımlanması (30.10.2026, MehDer onaylı).
 * - Öğrenci "Sorun yaşıyorum / Yardım istiyorum": giriş ekranından "Geldi"ye kadar; en fazla MESAJ_ACIK_SINIR cevaplanmamış mesaj.
 * - Hoca "Sorun yaşıyorum": portalın her yerinde (giriş ekranı dahil).
 * - Yönetim: mesaj paneli, cevap (öğrencinin diline çevrilir), "çözüldü".
 * - Anketler: öğrenci (speaking, zorunlu – notu görmeden önce), hoca speaking, hoca writing. Puanlı cevaplar isimsiz kaydedilir;
 *   yazılar isim izni "Evet" ise adla, "Hayır" ise yalnızca düzey ve jüriyle kaydedilir.
 * - Not yayımı: gün + düzey bazında yönetim düğmesiyle.
 */
var MESAJ_ACIK_SINIR = 3, MESAJ_UZUNLUK = 600, ANKET_METIN = 1000;
var SORUN = {
  o: [['kod', 'Kodu girdim, kabul edilmiyor'], ['numara', 'Numaram listede görünmüyor'], ['gun', 'Ekranda yanlış gün ya da düzey görünüyor'],
    ['bekleme', 'Uzun süredir bekliyorum, jüri bilgisi gelmedi'], ['derslik', 'Dersliği bulamıyorum'], ['es', 'Eşim gelmedi ya da eşimi bulamıyorum'],
    ['acil', 'Acil durum / sağlık sorunu'], ['diger', 'Diğer']],
  h: [['giris', 'Giriş / şifre sorunu'], ['liste', 'Gelen öğrenci listemde yok ya da yanlış öğrenci geldi'], ['hesapla', 'Not girişi veya HESAPLA çalışmıyor'],
    ['fark', 'Fark / negotiation ekranında sorun'], ['gelmedi', 'Öğrenci gelmedi ama "Gelmedi" düğmesi açılmadı'], ['teknik', 'Derslik / teknik sorun (kamera, ses, internet)'],
    ['kagit', 'Zarftaki kâğıtlar listeyle uyuşmuyor (eksik ya da fazla)'], ['tamam', 'Not girişi veya "Tamamlandı" çalışmıyor'],
    ['acil', 'Acil durum / sağlık sorunu'], ['diger', 'Diğer']]
};
var ANKET = {
  O: { ad: 'Öğrenci (speaking)', madde: ['Sınav günü yönlendirmeler (QR, telefon ekranı, TV) anlaşılırdı.', 'Bekleme sürem makuldü.',
    'Jüri ve sınav ortamı düzenli ve sınav için uygundu.', 'Sınav sırasında hocalar yardımcı ve güler yüzlüydü.',
    'Sınav sırasında hocaların tavırları motivasyonumu olumsuz etkiledi.', 'Sınav soruları/görevleri derste çalıştıklarıma uygundu.',
    'Konuşmalarımın kamera kaydına alınması strese girmeme neden oldu.', 'Konuşmalarımın kamera kaydına alınması beni olumsuz etkilemedi.'],
    sorun: 'Bazı sorunlar yaşadım.', diger: 'Diğer görüş ve önerilerim' },
  S: { ad: 'Hoca (speaking)', madde: ['Portalı kullanmak kolaydı.', 'Not girişi ve HESAPLA süreci anlaşılırdı.', 'Fark ve negotiation adımları sorunsuz işledi.',
    'Öğrenci akışı (çağrı, bekleme, eşleştirme) düzenliydi.', 'Kâğıt-kalemle notlandırmak yerine bu sistemi tercih ederim.',
    "Sistem, 3'lü öğrenci kabulü ve öğrencisiz kalıp boşuna bekleme sorunlarını istisnalar hariç ortadan kaldırdı.", 'Sistem, not hesaplama hatası yapma ihtimalini ortadan kaldırdı.',
    'Not girişini elektronik ortamda yapmak zor oldu.', 'Sistemi kör notlama açısından faydalı buldum.',
    'Sonraki sınavlarda speaking sorularının da dijital ortama aktarılması faydalı olur.', 'Tüm hocaların sınav görev yüklerini takip edebilmeyi olumlu buldum.'],
    sorun: 'Sınav sırasında sistemle ilgili sorun yaşadım.', diger: 'Diğer görüş ve önerilerim' },
  W: { ad: 'Hoca (writing)', madde: ['Portalı kullanmak kolaydı.', 'Not girişi ve "Tamamlandı" süreci anlaşılırdı.', 'Fark ve negotiation adımları sorunsuz işledi.',
    'Google Sheets / Excel tabloları yerine bu sistemi tercih ederim.', 'Sistem, not hesaplama hatası yapma ihtimalini ortadan kaldırdı.',
    'Not girişini elektronik ortamda yapmak zor oldu.', 'Sistemi kör notlama açısından faydalı buldum.', 'Tüm hocaların sınav görev yüklerini takip edebilmeyi olumlu buldum.',
    'Gelecek sınavlarda notlandırmada bir yapay zekâ ve bir insan değerlendirici olmasını isterim.'],
    sorun: 'Notlandırma sırasında sistemle ilgili sorun yaşadım.', diger: 'Diğer görüş ve önerilerim' }
};
var OLCEK = ['Katılıyorum', 'Kısmen katılıyorum', 'Katılmıyorum'];

/* ---------------- yardımcılar ---------------- */
function destekHazirla_() { S.msj = S.msj || []; S.mseq = S.mseq || 0; S.ank = S.ank || {}; S.ankO = S.ankO || {}; S.ankH = S.ankH || {}; S.yayin = S.yayin || {}; }
function sorunAd_(kim, k) { var l = SORUN[kim === 'o' ? 'o' : 'h']; for (var i = 0; i < l.length; i++) if (l[i][0] === k) return l[i][1]; return null; }
function kirp_(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
/** Google çevirisi; hata ya da aynı metin dönerse ''. kaynak boşsa dil otomatik algılanır. */
function cevir_(metin, hedef, kaynak) {
  if (!metin) return '';
  try { var r = LanguageApp.translate(metin, kaynak || '', hedef); return r && r.trim().toLowerCase() !== metin.trim().toLowerCase() ? r : ''; } catch (e) { return ''; }
}
function dilGecerli_(d) { return d === 'en' || d === 'ru' ? d : 'tr'; }
function ogrJuri_(s) { var p = s.pair && S.pairs[s.pair], j = p && jur(p.j); return j || null; }
function acikSay_(f) { return S.msj.filter(function (m) { return m.durum === 'acik' && f(m); }).length; }

/* ---------------- Mesajlar sayfası ---------------- */
function mesajSayfasiYaz_() {
  var sh = sayfa_('Mesajlar') || ss_().insertSheet('Mesajlar');
  var rows = [['No', 'Zaman', 'Sınav saati', 'Kim', 'Ad', 'Öğrenci no', 'Düzey / jüri', 'Konu', 'Mesaj', 'Dil', 'Türkçe çeviri', 'Durum', 'Yönetim cevapları']];
  S.msj.forEach(function (m) {
    rows.push([m.id, Utilities.formatDate(new Date(m.ts), TZ, 'dd.MM.yyyy HH:mm'), (m.g ? 'G' + m.g + ' ' : '') + hhmm(m.T), m.kim === 'o' ? 'Öğrenci' : 'Hoca', m.ad, m.no || '', m.yer || '',
      m.katAd, m.metin, m.dil, m.ceviri || '', { acik: 'Açık', cevap: 'Cevaplandı', cozuldu: 'Çözüldü' }[m.durum] || m.durum,
      (m.cev || []).map(function (c) { return (c.T != null ? hhmm(c.T) : Utilities.formatDate(new Date(c.ts), TZ, 'HH:mm')) + ' ' + c.metin; }).join(' | ')]);
  });
  sh.clearContents(); sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}
function mesajEkle_(m) {
  destekHazirla_();
  m.id = 'm' + (++S.mseq); m.ts = Date.now(); m.T = S.T; m.g = S.day; m.durum = 'acik'; m.cev = [];
  m.acil = m.kat === 'acil'; m.katAd = sorunAd_(m.kim, m.kat);
  S.msj.push(m); if (S.msj.length > 400) S.msj = S.msj.slice(-400);
  mlog((m.acil ? 'ACİL – ' : '') + (m.kim === 'o' ? 'Öğrenci ' : 'Hoca ') + m.ad + ' sorun bildirdi: ' + m.katAd + (m.metin ? ' – ' + m.metin.slice(0, 80) : ''));
  mesajSayfasiYaz_();
  return m;
}
function mesajGorunum_(m, dil) {
  return { id: m.id, ts: m.ts, saat: hhmm(m.T), kat: m.kat, katAd: m.katAd, metin: m.metin, durum: m.durum, acil: m.acil,
    cev: (m.cev || []).map(function (c) { return { saat: c.T != null ? hhmm(c.T) : Utilities.formatDate(new Date(c.ts), TZ, 'HH:mm'), metin: c.metin, ceviri: dil && dil !== 'tr' ? (c.ceviri || '') : '' }; }) };
}

/* ---------------- öğrenci: sorun ---------------- */
/** no: öğrenci numarası (giriş ekranından gelenler için zorunlu). anahtar: oturum anahtarı (girişten sonra). */
function apiOgrSorun(no, anahtar, kat, metin, dil) {
  no = String(no || '').replace(/\D/g, ''); dil = dilGecerli_(dil); metin = kirp_(metin, MESAJ_UZUNLUK);
  if (!no || no.length < 5 || no.length > 15) return { errKod: 'numara', err: 'Öğrenci numaranı yaz.' };
  if (!sorunAd_('o', kat)) return { err: 'Geçersiz konu.' };
  if (kat === 'diger' && !metin) return { errKod: 'aciklama', err: 'Kısa bir açıklama yaz.' };
  var girisli = !!anahtar && anahtar === ogrAnahtar_(no);
  if (!girisli) {   // girişsiz bildirimlere genel hız sınırı
    var c = onb_(), n = Number(c.get('ogrsorun:dk') || 0); if (n > 40) return { errKod: 'yogun', err: 'Çok fazla bildirim var. Kayıt masasına git.' };
    c.put('ogrsorun:dk', String(n + 1), 120);
  }
  var ceviri = cevir_(metin, 'tr');
  return islem_(function () {
    destekHazirla_();
    var s = S.stu[no];
    if (s && girisli && s.st === 'atandi') { var p = S.pairs[s.pair], x = p && p.m.filter(function (y) { return y.no === no; })[0]; if (x && x.g === 'geldi') return { errKod: 'sinavda', err: 'Sınavdasın; bildirim kapalı.' }; }
    if (acikSay_(function (m) { return m.kim === 'o' && m.no === no; }) >= MESAJ_ACIK_SINIR) return { errKod: 'sinir', err: 'Cevap bekleyen ' + MESAJ_ACIK_SINIR + ' mesajın var.' };
    var j = s ? ogrJuri_(s) : null;
    var m = mesajEkle_({ kim: 'o', no: no, ad: s ? s.ad : '(listede yok) ' + no, yer: s ? s.lv + (j ? ' · ' + jName(j) + ' · Derslik ' + j.room : '') + (girisli ? '' : ' · giriş ekranından') : 'numara listede yok',
      kat: kat, metin: metin, ceviri: ceviri, dil: dil, k: rastgele_(12) });
    return { id: m.id, k: m.k, acil: m.acil };
  });
}
/** liste: [{id, k}] – öğrencinin telefonunda saklanan mesaj anahtarları. */
function apiOgrMesajlar(liste, dil) {
  liste = Array.isArray(liste) ? liste.slice(0, 10) : []; dil = dilGecerli_(dil);
  S = durumOku_(); destekHazirla_();
  return { m: liste.map(function (x) { var m = S.msj.filter(function (y) { return y.id === x.id && y.k === x.k; })[0]; return m ? mesajGorunum_(m, dil) : null; }).filter(Boolean) };
}

/* ---------------- öğrenci: otomatik cevap kaydı (MehDer, 31.10.2026) ----------------
   Öğrenci bir sorun seçip ekranda otomatik cevabı görünce (ve "çözülmedi, yönetime yaz" deyince) arka planda
   "Otomatik Cevaplar" sayfasına bir satır yazılır. Yönetim ekranında gösterilmez, bildirim gitmez; sınavdan sonra incelenir. */
var OTO_SUTUN = ['Tarih', 'Sınav saati', 'Gün', 'Olay', 'Öğrenci no', 'Ad', 'Düzey', 'Sınıf', 'Giriş', 'Ekrandaki durum', 'Konu', 'Gösterilen cevap (Türkçe)', 'Ekran dili'];
function apiOgrOto(no, anahtar, kat, cevap, dil, durum, olay) {
  no = String(no || '').replace(/\D/g, '').slice(0, 15); dil = dilGecerli_(dil);
  if (!sorunAd_('o', kat)) return { ok: false };
  var c = onb_(), n = Number(c.get('ogroto:dk') || 0); if (n > 300) return { ok: false };   // kötüye kullanıma karşı genel sınır
  c.put('ogroto:dk', String(n + 1), 60);
  var girisli = !!no && !!anahtar && anahtar === ogrAnahtar_(no);
  S = durumOku_(); var s = no && S.stu[no];
  var sh = sayfa_('Otomatik Cevaplar') || ss_().insertSheet('Otomatik Cevaplar');
  if (sh.getLastRow() < 1) { sh.appendRow(OTO_SUTUN); sh.setFrozenRows(1); }
  sh.appendRow([Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), hhmm(S.T), S.day || '', olay === 'yaz' ? 'Çözülmedi – yönetime yazmaya geçti' : 'Otomatik cevap gösterildi',
    no, s ? s.ad : (no ? '(listede yok)' : ''), s ? s.lv : '', s ? s.cls : '', girisli ? 'Evet' : 'Hayır', kirp_(durum, 40), sorunAd_('o', kat), kirp_(cevap, 600), dil]);
  return { ok: true };
}

/* ---------------- yönetim araçları (MehDer, 1.11.2026) ----------------
   1) öğrenciyi jüriye ata (kurallar devre dışı), 2) "Gelmedi"/alınamadı öğrenciyi yeniden sınava al,
   3) jüri(ler)e mesaj (tek, çok ya da tümü; hoca "Okudum" der), 4) TV duyurusu (süreli, otomatik İngilizce satır),
   5) öğrenciye mesaj (TR + otomatik EN/RU; öğrenci "Tamam, bana denileni yapıyorum" der). */
function aracHazirla_() { S.jmsj = S.jmsj || []; S.omsj = S.omsj || []; S.aseq = S.aseq || 0; }
function juriMesajlari_(jid) { aracHazirla_(); return S.jmsj.filter(function (m) { return m.hepsi || m.jids.indexOf(jid) >= 0; }).slice(-10).reverse().map(function (m) { return { id: m.id, saat: hhmm(m.T), metin: m.metin, okundu: m.oku[jid] != null }; }); }
function ogrYonetimMesajlari_(no) { aracHazirla_();
  var tek = S.omsj.filter(function (m) { return m.no === no; }).map(function (m) { return { id: m.id, T: m.T, metin: m.metin, en: m.en, ru: m.ru, onay: m.onay != null }; });
  var top = (S.otop || []).filter(function (m) { return m.nos.indexOf(no) >= 0; }).map(function (m) { return { id: m.id, T: m.T, metin: m.metin, en: m.en, ru: m.ru, onay: m.onay[no] != null }; });
  return tek.concat(top).sort(function (a, b) { return a.T - b.T; }).slice(-5).reverse().map(function (m) { return { id: m.id, saat: hhmm(m.T), metin: m.metin, en: m.en, ru: m.ru, onay: m.onay }; }); }
function gBosalt_(no) { var r = S.gr['S:' + no]; if (r && r.fin === 'G') { r.fin = null; r.abs = false; } }
function yonetimAta_(no, jid, k) {
  var s = S.stu[no], j = jur(jid); k = Number(k);
  if (!s) return 'Öğrenci bulunamadı.'; if (s.gun !== S.day) return 'Bu öğrencinin sınavı bugün değil.';
  if (!j || j.gun !== S.day) return 'Jüri bulunamadı.'; if (!(k >= 0 && k < SL.length)) return 'Slot geçersiz.';
  if (s.st === 'bitti') return 'Bu öğrencinin sınavı bitti.';
  if (s.davet) davetBirak_(s, false);
  var eski = (s.pair && S.pairs[s.pair]) || (s.p5 && S.pairs[s.p5]);
  if (eski) eski.m.forEach(function (x) { if (x.no === no && !x.mv) x.mv = '→ yönetim: ' + jName(j) + ' · ' + hhmm(SL[k]); });
  gBosalt_(no);
  var sabit = sabitMi_(s) || kagitDuzey_(j.lv) && sabitGun_();
  var p = pairsAt(j.id, k).filter(function (q) { return !q.bitti && (!sabit || q.sabit); })[0];
  // 2. kullanım (MehDer 12.11 M bölümü): atanan öğrenci QR okutmuş sayılır, TV'de görünür, anketi açılır; grup en çok 3 kişi
  if (sabit && p && p.m.filter(function (x) { return !x.mv && !x.dv; }).length >= 3) { if (eski) eski.m.forEach(function (x) { if (x.no === no && typeof x.mv === 'string') x.mv = null; }); return 'Bu jürinin ' + hhmm(SL[k]) + ' grubu dolu (3 kişi). Başka bir jüri ya da oturum seçin.'; }
  if (sabit && eski) eski.m.forEach(function (x) { if (x.no === no) x.mv = true; });
  var uye = { no: no, g: null, mv: null, src: 'yönetim', kapi: 'Yönetim bu öğrenciyi jürinize ' + hhmm(SL[k]) + ' için ekledi.' };
  if (sabit) { uye.qr = true; uye.qrT = S.T; s.scanT = s.scanT || S.T; }
  if (p) p.m.push(uye); else { p = { id: (sabit ? 'f' : 'p') + (++S.pseq), j: j.id, k: k, gun: S.day, m: [uye], bitti: false, T: S.T, sabit: sabit || undefined }; S.pairs[p.id] = p; }
  s.st = 'atandi'; s.pair = p.id; s.eff = k; s.trans = false; s.early = false; s.cagri = null; s.kayip = null; s.donus = null; s.erkenden = null;
  if (S.closed[j.id] && S.closed[j.id].from <= k) delete S.closed[j.id];
  mtv(tvTag(no) + ' → ' + jName(j) + ' · Derslik ' + j.room + ' · ' + hhmm(SL[k]));
  mlog('Yönetim: ' + s.ad + ' → ' + jName(j) + ' (Derslik ' + j.room + '), ' + hhmm(SL[k]) + ' slotu.');
  return '';
}
function yenidenAl_(no) {
  var s = S.stu[no]; if (!s || s.gun !== S.day) return 'Öğrenci bulunamadı.';
  if (['gelmedi', 'alinamadi', 'red'].indexOf(s.st) < 0) return 'Bu öğrenci "Gelmedi" ya da "alınamadı" durumunda değil.';
  var eski = s.pair && S.pairs[s.pair]; if (eski) eski.m.forEach(function (x) { if (x.no === no && !x.mv) x.mv = '→ yönetim yeniden sıraya aldı'; });
  gBosalt_(no);
  var k = Math.max(curSlot(), 0); if (S.T >= SL[k] + GEC) k = Math.min(k + 1, RES);
  s.st = 'bekle'; s.eff = k; s.trans = true; s.pair = null; s.cagri = null; s.early = false;
  mlog('Yönetim: ' + s.ad + ' yeniden sınava alındı – ' + hhmm(SL[k]) + ' slotunda öncelikli.');
  pairUp(s); if (s.st === 'bekle' && S.T >= SL[k]) fillSeats(s.lv, k, 'gelmedi');
  return '';
}
function juriMesajGonder_(jids, hepsi, metin) {
  aracHazirla_(); metin = kirp_(metin, MESAJ_UZUNLUK); if (!metin) return 'Mesaj boş.';
  var gecerli = JD().map(function (j) { return j.id; }); jids = (jids || []).filter(function (x) { return gecerli.indexOf(x) >= 0; });
  if (!hepsi && !jids.length) return 'Jüri seçin.';
  S.jmsj.push({ id: 'j' + (++S.aseq), jids: hepsi ? gecerli : jids, hepsi: !!hepsi, metin: metin, T: S.T, ts: Date.now(), oku: {} });
  mlog('Yönetim → ' + (hepsi ? 'tüm jüriler' : jids.map(function (x) { return jName(jur(x)); }).join(', ')) + ': ' + metin.slice(0, 80));
  return '';
}
function juriOkudum_(t, id) { aracHazirla_(); var j = JD().filter(function (x) { return x.h.indexOf(t) >= 0; })[0], m = S.jmsj.filter(function (x) { return x.id === id; })[0]; if (!j || !m) return 'Mesaj bulunamadı.'; if (m.oku[j.id] == null) m.oku[j.id] = S.T; return ''; }
function ogrMesajGonder_(no, metin, en, ru) {
  aracHazirla_(); var s = S.stu[no]; if (!s) return 'Öğrenci bulunamadı.'; metin = kirp_(metin, MESAJ_UZUNLUK); if (!metin) return 'Mesaj boş.';
  S.omsj.push({ id: 'o' + (++S.aseq), no: no, metin: metin, en: en || '', ru: ru || '', T: S.T, ts: Date.now(), onay: null });
  mlog('Yönetim → öğrenci ' + s.ad + ': ' + metin.slice(0, 80)); return '';
}
function araclarGorunum_() {
  aracHazirla_();
  var jAd = function (id) { var j = jur(id); return j ? jName(j) : id; };
  return {
    juriler: JD().map(function (j) { return { jid: j.id, ad: jName(j), room: j.room, lv: j.lv }; }), slotlar: SL.map(hhmm), simdi: curSlot(),
    jmsj: S.jmsj.slice(-15).reverse().map(function (m) { var ok = m.jids.filter(function (x) { return m.oku[x] != null; }); return { saat: hhmm(m.T), metin: m.metin, kime: m.hepsi ? 'Tüm jüriler' : m.jids.map(jAd).join(', '), okuyan: ok.length, toplam: m.jids.length, okumayan: m.jids.filter(function (x) { return m.oku[x] == null; }).map(jAd) }; }),
    omsj: S.omsj.map(function (m) { return { T: m.T, saat: hhmm(m.T), ad: (S.stu[m.no] || {}).ad || m.no, no: m.no, metin: m.metin, onay: m.onay != null ? hhmm(m.onay) : null }; })
      .concat((S.otop || []).map(function (m) { var n = Object.keys(m.onay).length; return { T: m.T, saat: hhmm(m.T), ad: 'Toplu: ' + m.hedef.replace('duzey:', 'düzey ').replace('oturum:', 'oturum ') + ' (' + m.nos.length + ' öğrenci)', no: '', metin: m.metin, onay: n + ' / ' + m.nos.length + ' onayladı' }; }))
      .sort(function (a, b) { return b.T - a.T; }).slice(0, 15),
    tvd: S.tvd && S.tvd.bitis > Date.now() ? { metin: S.tvd.metin, en: S.tvd.en, kalan: Math.ceil((S.tvd.bitis - Date.now()) / 60000) } : null,
    geriAlinabilir: dayStu().filter(function (s) { return ['gelmedi', 'alinamadi', 'red'].indexOf(s.st) >= 0; }).map(function (s) { return { no: s.no, ad: s.ad, lv: s.lv, st: s.st }; })
  };
}

/* ---------------- hoca: sorun ---------------- */
function apiHocaSorun(oturum, token, kat, metin) {
  metin = kirp_(metin, MESAJ_UZUNLUK);
  if (!sorunAd_('h', kat)) return { err: 'Geçersiz konu.' };
  if (kat === 'diger' && !metin) return { err: 'Kısa bir açıklama yazın.' };
  var o = null; try { o = oturum ? oturum_(oturum) : null; } catch (e) { o = null; }
  return islem_(function () {
    destekHazirla_();
    var t = o && o.hid ? o.hid : hocaByKey_(token); if (!t) return { err: epostaMi_(token) ? 'Bu e-posta adresi sistemde kayıtlı değil.' : 'Bağlantı geçersiz.' };
    var gizle = !o && epostaMi_(token);   // ortak bağlantıda girişsiz: önceki mesajlar gösterilmez
    if (acikSay_(function (m) { return m.kim === 'h' && m.hid === t; }) >= MESAJ_ACIK_SINIR * 2) return { err: 'Cevap bekleyen mesajlarınız var; yönetim kısa sürede dönecek.' };
    var j = S.juri.filter(function (x) { return x.h.indexOf(t) >= 0 && x.gun === S.day; })[0];
    var zs = S.zarf.filter(function (z) { return z.f === t || z.s === t; }).map(function (z) { return z.cls; });
    var m = mesajEkle_({ kim: 'h', hid: t, ad: S.hoca[t].ad + (o && o.adm ? ' (yönetim adına)' : ''), yer: (j ? jName(j) + ' · Derslik ' + j.room : '') + (zs.length ? (j ? ' · ' : '') + 'Writing: ' + zs.join(', ') : '') + (o ? '' : ' · giriş ekranından'),
      kat: kat, metin: metin, ceviri: '', dil: 'tr' });
    return { ok: true, id: m.id, m: gizle ? [mesajGorunum_(m, 'tr')] : hocaMesajlari_(t) };
  });
}
function hocaMesajlari_(t) { destekHazirla_(); return S.msj.filter(function (m) { return m.kim === 'h' && m.hid === t; }).slice(-10).reverse().map(function (m) { return mesajGorunum_(m, 'tr'); }); }
function apiHocaMesajlar(token) { return oku_(function () { var t = hocaByToken_(token); return t ? { m: hocaMesajlari_(t) } : { m: [] }; }); }

/* ---------------- yönetim: mesajlar ---------------- */
function yonetimMesajlari_() {
  destekHazirla_();
  var l = S.msj.slice().sort(function (a, b) { var ra = a.durum === 'acik' ? (a.acil ? 0 : 1) : 2, rb = b.durum === 'acik' ? (b.acil ? 0 : 1) : 2; return ra - rb || b.ts - a.ts; });
  return l.slice(0, 120).map(function (m) { var v = mesajGorunum_(m, 'tr'); v.kim = m.kim; v.ad = m.ad; v.no = m.no || ''; v.yer = m.yer; v.dil = m.dil; v.ceviri = m.ceviri || '';
    v.cev = (m.cev || []).map(function (c) { return { saat: c.T != null ? hhmm(c.T) : Utilities.formatDate(new Date(c.ts), TZ, 'HH:mm'), metin: c.metin, ceviri: c.ceviri || '' }; }); return v; });
}
function mesajCevapla_(id, metin, ceviri) {
  destekHazirla_();
  var m = S.msj.filter(function (x) { return x.id === id; })[0]; if (!m) return 'Mesaj bulunamadı.';
  metin = kirp_(metin, MESAJ_UZUNLUK); if (!metin) return 'Cevap boş.';
  m.cev.push({ ts: Date.now(), T: S.T, metin: metin, ceviri: ceviri || '' }); m.durum = 'cevap';
  mlog('Yönetim cevapladı (' + m.ad + '): ' + metin.slice(0, 80)); mesajSayfasiYaz_(); return '';
}
function mesajCozuldu_(id) { destekHazirla_(); var m = S.msj.filter(function (x) { return x.id === id; })[0]; if (!m) return 'Mesaj bulunamadı.'; m.durum = 'cozuldu'; mesajSayfasiYaz_(); return ''; }

/* ---------------- not yayımı ---------------- */
var SON_DURUM = { bitti: 1, gelmedi: 1, alinamadi: 1, red: 1 };
function duzeyDurumlari_() {
  destekHazirla_();
  var out = [];
  [1, 2, 3].forEach(function (g) {
    var gn = S.cfg.gunler[g]; if (!gn) return;
    (gn.lv || []).filter(String).forEach(function (lv) {
      var st = S.order.map(function (no) { return S.stu[no]; }).filter(function (s) { return s.gun === g && s.lv === lv; }); if (!st.length) return;
      var bitti = st.filter(function (s) { return s.st === 'bitti'; }), aktif = st.filter(function (s) { return s.st === 'bekle' || s.st === 'atandi' || s.st === 'gec'; }).length;
      var yok = st.filter(function (s) { return s.st === 'yok'; }).length, kesin = bitti.filter(function (s) { var r = S.gr['S:' + s.no]; return r && r.fin != null; }).length;
      var gunBitti = g !== S.day || S.T >= LASTCALL, key = g + ':' + lv;
      out.push({ key: key, ad: (gunAdi_(g) || 'Gün ' + g) + ' · ' + lv + ' düzeyi', gun: g, lv: lv, toplam: st.length, bitti: bitti.length, kesin: kesin, aktif: aktif, okutmayan: yok,
        hazir: bitti.length > 0 && aktif === 0 && kesin === bitti.length && (yok === 0 || gunBitti), yayinda: !!S.yayin[key] });
    });
  });
  return out;
}
function notYayinla_(key, zorla) {
  var d = duzeyDurumlari_().filter(function (x) { return x.key === key; })[0]; if (!d) return 'Düzey bulunamadı.';
  if (d.yayinda) return d.ad + ' zaten yayımlandı.';
  if (!d.hazir && !zorla) return d.ad + ' henüz hazır değil.';
  S.yayin[key] = Date.now(); mlog(d.ad + ': notlar öğrencilere yayımlandı' + (d.hazir ? '' : ' (hazır olmadan, yönetim kararıyla)') + '.');
  ogrOnbellekYaz_(S.order.filter(function (no) { var s = S.stu[no]; return s.gun === d.gun && s.lv === d.lv && s.st !== 'yok'; }));
  return d.ad + ': notlar yayımlandı (' + d.kesin + ' öğrenci).';
}
function ogrOnbellekYaz_(nos) { var o = {}; nos.forEach(function (no) { o['o:' + no] = JSON.stringify(ogrenciGorunum_(S.stu[no])); }); if (nos.length) onb_().putAll(o, 21600); }

/* ---------------- anket Excel (madde 6) ve sınav arşivi (madde 7) – MehDer 12.11.2026 ---------------- */
/** Anket ham verisi: "Anket" ve "Anket Yazıları" sayfaları (isimler yalnız izin verenlerde). Excel tarayıcıda üretilir. */
function anketVeri_() {
  var oku = function (ad) { var sh = sayfa_(ad); if (!sh || sh.getLastRow() < 1) return []; return sh.getDataRange().getDisplayValues(); };
  var M = {}; Object.keys(ANKET).forEach(function (t) { M[ANKET[t].ad] = ANKET[t].madde; });
  return { madde: M, olcek: OLCEK, anket: oku('Anket'), yazi: oku('Anket Yazıları') };
}
/** Sınav arşivi: seçilen günün (ve isteğe bağlı düzeyin) bütün kayıtları – özet, oturumlar, jüriler, öğrenci listesi, olay kaydı. */
function arsivVeri_(g, lv) {
  g = Number(g); var gn = S.cfg.gunler[g]; if (!gn) return { hata: 'Gün bulunamadı.' };
  var ST = S.order.map(function (no) { return S.stu[no]; }).filter(function (s) { return s.gun === g && (!lv || s.lv === lv); });
  var P = []; for (var id in S.pairs) { var p = S.pairs[id], j = jur(p.j); if (p.gun === g && j && (!lv || j.lv === lv)) P.push(p); }
  var uye = function (p) { return p.m.filter(function (x) { return !x.mv && !x.dv; }); };
  var durumAd = { yok: 'gelmedi (QR yok)', bekle: 'bekliyor', atandi: 'atandı', bitti: 'sınavı bitti', gec: 'geç – bekliyor', red: 'G (geç okuttu)', alinamadi: 'alınamadı (boş jüri yok)', gelmedi: 'gelmedi (jüri işaretledi)' };
  var ogr = ST.map(function (s) { var p = s.pair && S.pairs[s.pair], j = p && jur(p.j), r = S.gr['S:' + s.no];
    return [s.no, s.ad, s.cls, s.lv, hhmm(SL[s.plan]), durumAd[s.st] || s.st, p ? hhmm(SL[p.k]) : '', j ? jName(j) : '', j ? j.room : '', s.scanT != null ? hhmm(s.scanT) : '', s.late ? Math.round(s.late) : '', s.trans ? 'evet' : '', s.erkenden != null ? 'evet' : '', r && r.fin != null ? r.fin : '', r && r.r100 != null ? r.r100 : '']; });
  var say = function (f) { return ST.filter(f).length; };
  var ozet = [['Gün', gn.ad || ''], ['Düzey', lv || (gn.lv || []).filter(String).join(', ')], ['Kullanım şekli', kulGun_(g) + ' · ' + KUL_AD[kulGun_(g)]],
    ['Planlanan öğrenci', ST.length], ['QR okutan', say(function (s) { return s.scanT != null; })], ['Hiç gelmeyen', say(function (s) { return s.st === 'yok'; })],
    ['Geç – G', say(function (s) { return s.st === 'red'; })], ['Geç – boş jüri bulunamadı', say(function (s) { return s.st === 'alinamadi'; })], ['Aktarılan', say(function (s) { return s.trans; })],
    ['Erken çağrılan', say(function (s) { return s.erkenden != null; })], ['Sınavı biten', say(function (s) { return s.st === 'bitti'; })],
    ["3'lü grup", P.filter(function (p) { return uye(p).length === 3; }).length], ["4'lü grup", P.filter(function (p) { return uye(p).length >= 4; }).length],
    ['Birleştirme', say(function (s) { return s.birlesim; })], ['Kayıt masasına çağrılan', say(function (s) { return s.masa; })],
    ['Anket dolduran öğrenci', say(function (s) { return !!(S.ankO || {})[s.no]; })]];
  if (kulGun_(g) === 1) { var not = ST.map(function (s) { var r = S.gr['S:' + s.no]; return r && typeof r.r100 === 'number' && r.fin !== 'G' ? r.r100 : null; }).filter(function (x) { return x != null; });
    ozet.push(['Not girilen', not.length], ['Ortalama (100)', not.length ? Math.round(not.reduce(function (a, b) { return a + b; }, 0) / not.length * 10) / 10 : ''],
      ['Yeniden değerlendirme (2. tur)', ST.filter(function (s) { var r = S.gr['S:' + s.no]; return r && r.tur > 1; }).length]); }
  var ks = []; P.forEach(function (p) { if (ks.indexOf(p.k) < 0) ks.push(p.k); }); ks.sort(function (a, b) { return a - b; });
  var oturum = ks.map(function (k) { var L = P.filter(function (p) { return p.k === k; }), u = [].concat.apply([], L.map(uye));
    return [hhmm(SL[k]) + (k === RES ? ' (yedek)' : ''), L.length, u.length, u.filter(function (x) { var s = S.stu[x.no]; return x.qr || x.g === 'geldi' || s.scanT != null; }).length, L.filter(function (p) { return uye(p).length === 3; }).length]; });
  var jlist = S.juri.filter(function (j) { return j.gun === g && (!lv || j.lv === lv); }).map(function (j) { var L = P.filter(function (p) { return p.j === j.id; });
    return [jName(j), j.room, j.h.map(function (t) { return S.hoca[t].ad; }).join(' – '), L.length, [].concat.apply([], L.map(uye)).length, j.yedek ? 'yedek' : '']; });
  var olay = arsivOlaylari_(g).map(function (l) { return [hhmm(l.T), l.m]; });
  return { baslik: (S.cfg.sinav || 'Sınav') + ' – ' + (gn.ad || '') + (lv ? ' – ' + lv + ' düzeyi' : ''), ozet: ozet,
    oturum: [['Oturum', 'Grup', 'Planlanan', 'Gelen', "3'lü"]].concat(oturum), juri: [['Jüri', 'Derslik', 'Hocalar', 'Grup', 'Öğrenci', '']].concat(jlist),
    ogr: [['Öğrenci No', 'Ad Soyad', 'Sınıf', 'Düzey', 'Planlanan oturum', 'Durum', 'Sınava girdiği oturum', 'Jüri', 'Derslik', 'QR saati', 'Geç (dk)', 'Aktarıldı', 'Erken girdi', 'Not', "100'lük"]].concat(ogr),
    olay: [['Saat', 'Kayıt']].concat(olay) };
}

/** Gün sonu arşivi (17.11.2026): S.log 400 kayıtla sınırlı olduğu için biten günün olay kaydı bir kez "Olay Arşivi" sayfasına yazılır.
 *  Gün biter: o gün 17:00'yi geçtiyse ya da başka bir güne geçildiyse. */
function gunSonuArsiv_() {
  S.arsivli = S.arsivli || {}; var yaz = false;
  Object.keys(S.cfg.gunler || {}).forEach(function (g) { g = Number(g); if (!g || S.arsivli[g]) return;
    var L = S.log.filter(function (l) { return l.g === g; }); if (!L.length) return;
    if (S.day === g && S.T < 17 * 60) return;
    var sh = sayfa_('Olay Arşivi') || ss_().insertSheet('Olay Arşivi'); if (sh.getLastRow() < 1) sh.appendRow(['Gün', 'Saat', 'Dakika', 'Kayıt']);
    var rows = L.slice().reverse().map(function (l) { return [g, hhmm(l.T), l.T, l.m]; });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows); S.arsivli[g] = Date.now(); yaz = true; });
  return yaz;
}
function arsivOlaylari_(g) {
  var sh = sayfa_('Olay Arşivi'), A = [];
  if (sh && sh.getLastRow() > 1) A = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().filter(function (r) { return Number(r[0]) === g; }).map(function (r) { return { T: Number(r[2]), m: String(r[3]) }; });
  var gor = {}; A.forEach(function (l) { gor[l.T + '|' + l.m] = 1; });
  S.log.filter(function (l) { return l.g === g && !gor[l.T + '|' + l.m]; }).forEach(function (l) { A.push({ T: l.T, m: l.m }); });
  return A.sort(function (a, b) { return a.T - b.T; });
}

/* ---------------- anketler ---------------- */
function ankGrup_(tur, gruplar, l, sorun) {
  destekHazirla_(); var A = S.ank[tur] = S.ank[tur] || {};
  gruplar.forEach(function (gk) {
    var x = A[gk] = A[gk] || { n: 0, l: ANKET[tur].madde.map(function () { return [0, 0, 0]; }), sorun: [0, 0] };
    x.n++; l.forEach(function (v, i) { x.l[i][v]++; }); x.sorun[sorun ? 0 : 1]++;
  });
}
function ankKaydet_(tur, gruplar, lv, juriAd, l, c, kisi) {
  var tarih = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy');
  var sh = sayfa_('Anket') || ss_().insertSheet('Anket');
  if (sh.getLastRow() < 1) sh.appendRow(['Tarih', 'Anket', 'Düzey', 'Jüri'].concat(Array.apply(null, { length: 11 }).map(function (_, i) { return 'M' + (i + 1); }), ['Sorun yaşadı']));
  var satir = [tarih, ANKET[tur].ad, lv || '', juriAd || ''], m = l.map(function (v) { return OLCEK[v]; });
  while (m.length < 11) m.push('');
  sh.appendRow(satir.concat(m, [c.sorun ? 'Evet' : 'Hayır']));
  var yaz = [];
  if (c.sorun && c.sorunMetin) yaz.push([ANKET[tur].sorun, c.sorunMetin, c.sorunCeviri, c.sorunIzin]);
  if (c.diger) yaz.push([ANKET[tur].diger, c.diger, c.digerCeviri, c.digerIzin]);
  if (yaz.length) {
    var sy = sayfa_('Anket Yazıları') || ss_().insertSheet('Anket Yazıları');
    if (sy.getLastRow() < 1) sy.appendRow(['Tarih', 'Anket', 'Düzey', 'Jüri', 'Alan', 'Yazı', 'Dil', 'Türkçe çeviri', 'İsim izni', 'Ad (izin verdiyse)', 'No (izin verdiyse)']);
    yaz.forEach(function (y) { sy.appendRow([tarih, ANKET[tur].ad, lv || '', juriAd || '', y[0], y[1], c.dil || 'tr', y[2] || '', y[3] ? 'Evet' : 'Hayır', y[3] ? kisi.ad : '', y[3] ? (kisi.no || '') : '']); });
  }
  ankGrup_(tur, gruplar, l, c.sorun);
}
/** cevap: {l:[0|1|2 …], sorun:bool, sorunMetin, sorunIzin:bool, diger, digerIzin:bool, dil} */
function ankDogrula_(tur, c) {
  if (!c || !Array.isArray(c.l) || c.l.length !== ANKET[tur].madde.length) return null;
  for (var i = 0; i < c.l.length; i++) if ([0, 1, 2].indexOf(Number(c.l[i])) < 0) return null;
  if (typeof c.sorun !== 'boolean') return null;
  var d = { l: c.l.map(Number), sorun: c.sorun, sorunMetin: c.sorun ? kirp_(c.sorunMetin, ANKET_METIN) : '', sorunIzin: !!c.sorunIzin, diger: kirp_(c.diger, ANKET_METIN), digerIzin: !!c.digerIzin, dil: dilGecerli_(c.dil) };
  d.sorunCeviri = cevir_(d.sorunMetin, 'tr'); d.digerCeviri = cevir_(d.diger, 'tr');
  return d;
}
function apiOgrAnket(no, anahtar, cevap) {
  if (anahtar !== ogrAnahtar_(no)) return { err: 'Oturum geçersiz.' };
  var c = ankDogrula_('O', cevap); if (!c) return { errKod: 'eksik', err: 'Lütfen bütün maddeleri cevapla.' };
  return islem_(function () {
    destekHazirla_();
    var s = S.stu[no]; if (!s || s.st !== 'bitti') return { err: 'Anket sınavdan sonra açılır.' };
    if (S.ankO[no]) return { g: ogrenciGorunum_(s) };
    var j = ogrJuri_(s), ja = j ? jName(j) : '';
    ankKaydet_('O', ['Tümü', s.lv, ja ? ja + ' (' + j.h.map(function (t) { return S.hoca[t].ad; }).join(' – ') + ')' : s.lv + ' · jüri yok'], s.lv, ja, c.l, c, { ad: s.ad, no: s.no });
    S.ankO[no] = Date.now(); mlog(s.ad + ': öğrenci anketi dolduruldu.');
    return { g: ogrenciGorunum_(s) };
  });
}
/** Hoca anketinin açılma durumu: speaking jürisi bitince, writing zarfları tamamlanınca. */
function hocaAnketDurum_(t) {
  destekHazirla_();
  var r = {};
  var js = S.juri.filter(function (j) { return j.h.indexOf(t) >= 0; });
  var jBitti = js.some(function (j) {
    var ps = []; for (var id in S.pairs) if (S.pairs[id].j === j.id) ps.push(S.pairs[id]);
    var dolu = ps.filter(function (p) { return occ(p) > 0; });
    return dolu.length > 0 && dolu.every(function (p) { return p.bitti; }) && (!!S.closed[j.id] || j.gun !== S.day || S.T >= LASTCALL);
  });
  r.S = js.length ? (S.ankH[t + '|S'] ? 'tamam' : jBitti ? 'acik' : 'bekle') : null;
  var zs = S.zarf.filter(function (z) { return z.f === t || z.s === t; });
  var wBitti = zs.length > 0 && zs.every(function (z) { var ben = z.f === t ? z.fDone : z.sDone; if (!ben) return false; if (!(z.fDone && z.sDone)) return true; return z.ogr.every(function (no) { var g = S.gr['W:' + no]; return g && (g.fin != null || g.abs); }); });
  r.W = zs.length ? (S.ankH[t + '|W'] ? 'tamam' : wBitti ? 'acik' : 'bekle') : null;
  return r;
}
function apiHocaAnket(oturum, tur, cevap) {
  var o; try { o = oturum_(oturum); } catch (e) { return { err: 'OTURUM' }; }
  if (tur !== 'S' && tur !== 'W') return { err: 'Geçersiz anket.' };
  if (o.adm) return { err: 'Anketi hocanın kendisi doldurur.' };
  var c = ankDogrula_(tur, cevap); if (!c) return { err: 'Lütfen bütün maddeleri cevaplayın.' };
  return islem_(function () {
    destekHazirla_();
    var t = o.hid, d = hocaAnketDurum_(t);
    if (d[tur] === 'tamam') return { ok: true, v: hocaGorunum_(o) };
    if (d[tur] !== 'acik') return { err: 'Anket görevleriniz tamamlanınca açılır.' };
    var lv = '', ja = '', gr = ['Tümü'];
    if (tur === 'S') { var j = S.juri.filter(function (x) { return x.h.indexOf(t) >= 0; })[0]; lv = j.lv; ja = jName(j); gr.push(lv, ja + ' (' + j.h.map(function (h) { return S.hoca[h].ad; }).join(' – ') + ')'); }
    ankKaydet_(tur, gr, lv, ja, c.l, c, { ad: S.hoca[t].ad, no: '' });
    S.ankH[t + '|' + tur] = Date.now(); mlog(S.hoca[t].ad + ': ' + ANKET[tur].ad + ' anketi dolduruldu.');
    return { ok: true, v: hocaGorunum_(o) };
  });
}
/** Yönetim ekranı ve rapor için özet: yüzdeler. */
function anketOzet_() {
  destekHazirla_();
  var out = {};
  Object.keys(ANKET).forEach(function (tur) {
    var A = S.ank[tur] || {};
    out[tur] = { ad: ANKET[tur].ad, madde: ANKET[tur].madde, olcek: OLCEK, sorunAd: ANKET[tur].sorun,
      gruplar: Object.keys(A).sort(function (a, b) { return (a === 'Tümü' ? '0' : a.length < 3 ? '1' + a : '2' + a).localeCompare(b === 'Tümü' ? '0' : b.length < 3 ? '1' + b : '2' + b, 'tr'); })
        .map(function (gk) { var x = A[gk]; return { ad: gk, n: x.n, yuzde: x.l.map(function (v) { var s = v[0] + v[1] + v[2] || 1; return [Math.round(v[0] * 100 / s), Math.round(v[1] * 100 / s), Math.round(v[2] * 100 / s)]; }), sorun: x.sorun[0] }; }) };
  });
  return out;
}
/** Menü: "Anket Özeti" sayfasını yazar (düzey ve jüri bazında yüzdeler). */
function anketRaporu() {
  sahipKontrol_(); S = durumOku_(); baglam_(); var O = anketOzet_();
  var sh = sayfa_('Anket Özeti') || ss_().insertSheet('Anket Özeti'), rows = [];
  Object.keys(O).forEach(function (tur) {
    var a = O[tur]; if (!a.gruplar.length) return;
    rows.push([a.ad + ' anketi', '', '', '', '']);
    rows.push(['Madde'].concat(a.gruplar.map(function (g) { return g.ad + ' (n=' + g.n + ')'; })));
    a.madde.forEach(function (m, i) { rows.push([(i + 1) + '. ' + m].concat(a.gruplar.map(function (g) { return '%' + g.yuzde[i][0] + ' katılıyorum · %' + g.yuzde[i][1] + ' kısmen · %' + g.yuzde[i][2] + ' katılmıyorum'; }))); });
    rows.push([a.sorunAd + ' (Evet)'].concat(a.gruplar.map(function (g) { return g.sorun + ' kişi'; })));
    rows.push(['']);
  });
  if (!rows.length) rows.push(['Henüz anket cevabı yok.']);
  var w = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  rows = rows.map(function (r) { while (r.length < w) r.push(''); return r; });
  sh.clearContents(); sh.getRange(1, 1, rows.length, w).setValues(rows);
  var msg = 'Anket Özeti sayfası yazıldı. Yazılı görüşler "Anket Yazıları" sayfasında (isim yalnızca izin verilenlerde).';
  bildir_(msg); return msg;
}
/* ======================= Sabit.gs ======================= */
/* ================= SABİT PLAN – Alternatif 5 (A, B, C, D2) – MehDer 9.11.2026 =================
 * Kâğıtla notlanan düzeylerde çiftler, jüriler ve saatler önceden belli (duyuru listeleri). Sistem:
 *  - QR okutma = geldi kaydı; 5 dk'dan fazla geç okutan G (red).
 *  - Öğrenci okutunca eşi QR okutmuşsa eşin adı görünür; jüri/derslik oturumdan JURI_DK dk önce görünür.
 *  - Oturum saati + 6 dk'da çiftinde tek kalan öğrenci aynı jürinin bir sonraki çiftine (yoksa aynı düzeyde
 *    bir sonraki oturumdaki bir çifte) eklenir. Telefonunda "Eşin gelmedi … hazır ol" yazar.
 *  - Oturum bitince (slot + 15 dk) gelen öğrencinin sınavı biter; anket açılır.
 *  - Not girişi, jüri ekranı, otomatik bitiş, unutulan işlem uyarıları yok.
 * Plan, D1 verisine dokunmadan mevcut duruma eklenir (sabitPlanYukle). */
var SABIT_AKTAR_DK = 6;
function sabitMi_(s) { return !!(s && s.p5 && S.sabit && kulOf_(s.lv) === 2); }
function sabitGun_() { if (!S.day || !S.sabit) return false; var g = S.cfg.gunler[S.day]; return !!(g && (g.lv || []).length && kulGun_(S.day) === 2); }
function sabitUye_(p, no) { return p.m.filter(function (x) { return x.no === no && !x.mv; })[0] || null; }
function sabitGelen_(p) { return p.m.filter(function (x) { return !x.mv && x.qr; }); }

/** QR okutma (sabit plan). */
function sabitScan_(s) {
  if (s.st !== 'yok') return {};
  var p = S.pairs[s.p5]; s.scanT = S.T;
  if (S.T > SL[p.k] + GEC) {   // S11 (MehDer 17.11.2026)
    s.late = S.T - SL[p.k];
    if (s.late > GEC_MAX + 1e-9) { s.st = 'red'; mlog(s.ad + ': ' + Math.round(s.late) + ' dk geç okuttu (' + GEC_MAX + " dk'dan fazla) – sınava alınmaz (G)."); return {}; }
    var x0 = sabitUye_(p, s.no); if (x0) x0.mv = true;   // planlı grubundan çıkar
    if (p.k === LASTPLAN) { sabitYedekSlota_(s); return {}; }
    s.st = 'gec'; mlog(s.ad + ': ' + Math.round(s.late) + ' dk geç okuttu – boş yer bekliyor (son çağrı ' + hhmm(LASTCALL) + ').');
    return {};
  }
  if (p.m.some(function (y) { return y.erkenAlindi && !y.mv; }) && sabitGelen_(p).length >= 2) {   // yeri gönüllü aldı: G sayılmaz, aktarılır (S16)
    var y0 = sabitUye_(p, s.no); if (y0) y0.mv = true; var h = sabitHedef_(p, s); s.scanT = S.T;
    if (h) { h.m.push({ no: s.no, g: null, mv: null, qr: true, qrT: S.T, src: 'aktarma', from: p.k }); s.st = 'atandi'; s.pair = h.id; s.eff = h.k; s.trans = true; s.transFrom = p.k;
      mlog(s.ad + ': okuttu; yeri gönüllüye verilmişti → ' + jName(jur(h.j)) + ', ' + hhmm(SL[h.k]) + ' grubuna aktarıldı.'); return {}; }
  }
  var x = sabitUye_(p, s.no); x.qr = true; x.qrT = S.T;
  s.st = 'atandi'; s.pair = p.id; s.eff = p.k;
  mlog(s.ad + ' okuttu (' + jName(jur(p.j)) + ', ' + hhmm(SL[p.k]) + ').');
  return {};
}

/** Grubun mevcut (taşınmamış) üye sayısı. */
function sabitBoy_(q) { return q.m.filter(function (x) { return !x.mv; }).length; }
/** Oturum + 6 dk: çiftinde tek kalan öğrencinin gideceği grup (S15, MehDer 12.11.2026; 4'lü HİÇBİR ZAMAN):
 *  (1) aynı jürinin sonraki grubu 2 kişiyse ona; (2) değilse aynı jürinin sonraki oturumlarındaki ilk 2'li grup;
 *  (3) yoksa başka bir jürinin SON oturumundaki 2'li grubu; (4) o da yoksa sondan bir önceki oturumdaki 2'li grup. */
function sabitHedef_(p, s) {
  var j = jur(p.j), ayni = [], diger = [];
  for (var id in S.pairs) { var q = S.pairs[id]; if (!q.sabit || q.gun !== p.gun || q.bitti || q === p) continue; var jq = jur(q.j); if (!jq || jq.lv !== j.lv) continue;
    if (q.j === p.j && q.k > p.k) ayni.push(q); else if (q.j !== p.j && q.k > p.k) diger.push(q); }
  ayni.sort(function (a, b) { return a.k - b.k; });
  var a2 = ayni.filter(function (q) { return sabitBoy_(q) <= 2; })[0];
  if (a2) return a2;
  var sonK = {}; diger.forEach(function (q) { sonK[q.j] = Math.max(sonK[q.j] || 0, q.k); });
  var uygun = function (fark) { return diger.filter(function (q) { return q.k === sonK[q.j] - fark && sabitBoy_(q) <= 2; }).sort(function (a, b) { return loadJ(a.j) - loadJ(b.j) || a.k - b.k; })[0]; };
  return uygun(0) || uygun(1) || null;
}
/** Son oturuma geç kalan (5–15 dk) ya da yedek slota aktarılan öğrenci yedek slottaki (RES) bir yedek jüri grubuna girer. */
function sabitYedekSlota_(s) {
  var lv = s.lv, n = yedekJuriSayisi_(lv), aday = JD().filter(function (j) { return j.lv === lv; }).sort(yedekSira_).slice(0, n), g = null;
  for (var id in S.pairs) { var q = S.pairs[id]; if (q.gun === S.day && q.k === RES && q.yedek && jur(q.j).lv === lv && sabitBoy_(q) < 2) { g = q; break; } }
  if (!g) {
    var j = aday.sort(function (a, b) { return occJ(a.id, RES) - occJ(b.id, RES) || 0; })[0];
    if (!j) { s.masa = true; s.st = 'red'; mlog(s.ad + ': yedek slot jürisi bulunamadı – kayıt masasına çağrıldı.'); return; }
    g = { id: 'f' + (++S.pseq), j: j.id, k: RES, gun: S.day, m: [], bitti: false, T: S.T, sabit: true, yedek: true }; S.pairs[g.id] = g;
  }
  g.m.push({ no: s.no, g: null, mv: null, qr: true, qrT: S.T, src: 'yedek' });
  s.st = 'atandi'; s.pair = g.id; s.eff = RES; s.trans = true; s.yedekSlot = true;
  mlog(s.ad + ': son oturuma geç kaldı → ' + jName(jur(g.j)) + ', ' + hhmm(SL[RES]) + ' yedek slotu.');
}
/* ---------- E2: erken girmeye gönüllü (2. kullanım; MehDer 12.11.2026) ----------
 * 2'li planlı grupta eş oturum saatine kadar gelmezse, oturum saatinde (oturum + 6 dk'ya kadar) gönüllüye çağrı gider.
 * Sıra: bir sonraki oturumun öğrencisi önce; eşitlikte önce QR okutan. Onay süresi DAVET_GEC_DK; dolarsa sıradakine geçer.
 * Onaylayan kendi grubundan çıkar (o gruptaki eşi kendi oturumunda tek kalırsa aktarma kurallarına girer). */
function sabitGonulluler_(lv, k) {
  return dayStu().filter(function (s) { if (s.lv !== lv || !s.early || s.davet || !sabitMi_(s) || s.st !== 'atandi') return false; var q = S.pairs[s.pair]; return q && q.k > k && erkenAcik(s); })
    .sort(function (a, b) { return S.pairs[a.pair].k - S.pairs[b.pair].k || a.scanT - b.scanT; });
}
function sabitErkenIsle_() {
  var ch = false;
  for (var id in S.pairs) { var p = S.pairs[id]; if (!p.sabit || p.gun !== S.day || p.bitti) continue;
    if (!(S.T >= SL[p.k] - 1e-9 && S.T < SL[p.k] + SABIT_AKTAR_DK)) continue;
    var uye = p.m.filter(function (x) { return !x.mv; });
    if (uye.length !== 2 || uye.filter(function (x) { return x.qr; }).length !== 1 || uye.some(function (x) { return x.dv; })) continue;
    if (p.m.some(function (x) { return x.erkenAlindi; })) continue;
    var A = sabitGonulluler_(jur(p.j).lv, p.k); if (!A.length) continue;
    var s = A[0], son = S.T + DAVET_GEC_DK;
    p.m.push({ no: s.no, g: null, mv: true, dv: true, dvT: S.T, dvSon: son, src: 'erken' }); s.davet = p.id;
    mlog(s.ad + ': ' + hhmm(SL[p.k]) + ' oturumundaki boş yere erken çağrıldı (' + jName(jur(p.j)) + '; onay bekleniyor, son ' + hhmm(son) + ').'); ch = true;
  }
  return ch;
}
function sabitDavetOnay_(s, p, x) {
  var eski = S.pairs[s.pair], x0 = eski && sabitUye_(eski, s.no); if (x0) x0.mv = true;
  x.dv = false; x.mv = null; delete x.dvSon; x.qr = true; x.qrT = S.T; x.erkenAlindi = true; x.kendi = eski ? eski.k : null;
  s.davet = null; s.erkenden = eski ? eski.k : null; s.pair = p.id; s.eff = p.k; s.early = false; s.kayip = null;
  var j = jur(p.j); mlog(s.ad + ': erken çağrıyı onayladı → ' + jName(j) + ' (Derslik ' + j.room + '), ' + hhmm(SL[p.k]) + ' oturumu (kendi oturumu ' + (eski ? hhmm(SL[eski.k]) : '?') + ').');
  return '';
}

/** Oturum + 6 dk: tek kalan öğrencinin yanına 5–15 dk geç kalmış (boş yer bekleyen) bir öğrenci çağrılır (S11). */
function sabitGecCagir_(p) {
  var lv = jur(p.j).lv, g = dayStu().filter(function (o) { return o.lv === lv && o.st === 'gec'; }).sort(function (a, b) { return a.scanT - b.scanT; })[0];
  if (!g || S.T > LASTCALL + 1e-9) return false;
  p.m.push({ no: g.no, g: null, mv: null, qr: true, qrT: S.T, src: 'gec' });
  g.st = 'atandi'; g.pair = p.id; g.eff = p.k;
  mlog(g.ad + ' (geç kalan) boş yere çağrıldı → ' + jName(jur(p.j)) + ', ' + hhmm(SL[p.k]) + ' oturumu.');
  return true;
}
function sabitAktar_(k) {
  var tek = [];
  for (var id in S.pairs) { var p = S.pairs[id]; if (!p.sabit || p.gun !== S.day || p.k !== k) continue;
    var g = sabitGelen_(p); if (g.length !== 1) continue;
    if (sabitGecCagir_(p)) continue;
    var s = S.stu[g[0].no], hedef = sabitHedef_(p, s);
    if (!hedef) { tek.push({ p: p, x: g[0], s: s }); continue; }
    g[0].mv = true;
    hedef.m.push({ no: s.no, g: null, mv: null, qr: true, qrT: S.T, src: 'aktarma', from: p.k });
    s.pair = hedef.id; s.eff = hedef.k; s.trans = true; s.transFrom = p.k;
    var jh = jur(hedef.j);
    mlog(s.ad + ': ' + hhmm(SL[p.k]) + ' oturumunda eşi gelmedi → ' + jName(jh) + ', ' + hhmm(SL[hedef.k]) + ' çiftine eklendi.');
  }
  if (tek.length) sabitBirlestir_(tek);
}
/** Aktarılacak çift yoksa (son oturum): aynı düzeyde tek kalanlar birleştirilir – 2→2, 3→3, 4→2+2, 5→2+3…;
 *  jüri: grubun ilk QR okutanının jürisi; tek bir öğrenci kalırsa kayıt masasına çağrılır (MehDer 10.11.2026). */
function sabitBirlestir_(tek) {
  var D = {}; tek.forEach(function (t) { var lv = jur(t.p.j).lv; (D[lv] = D[lv] || []).push(t); });
  Object.keys(D).forEach(function (lv) {
    var L = D[lv].sort(function (a, b) { return a.x.qrT - b.x.qrT; });
    if (L.length === 1) {   // tek kalan: son oturumdaki bir 2'li gruba 3. olarak (MehDer 12.11.2026 S3); yoksa kayıt masası
      var t0 = L[0], g2 = null; for (var id in S.pairs) { var q = S.pairs[id]; if (q.sabit && q.gun === S.day && q.k === t0.p.k && q !== t0.p && !q.bitti && jur(q.j).lv === lv && sabitBoy_(q) === 2 && sabitGelen_(q).length === 2) { g2 = q; break; } }
      if (g2) { t0.x.mv = true; g2.m.push({ no: t0.s.no, g: null, mv: null, qr: true, qrT: t0.x.qrT, src: 'birlesim', fromJ: t0.p.j, from: t0.p.k }); t0.s.pair = g2.id; t0.s.eff = g2.k; t0.s.birlesim = true;
        mlog(t0.s.ad + ': son oturumda tek kaldı → ' + jName(jur(g2.j)) + ' grubuna 3. öğrenci olarak eklendi.'); return; }
      t0.s.masa = true; mlog(t0.s.ad + ': eşi gelmedi; birleştirilecek başka öğrenci yok – kayıt masasına çağrıldı.'); return; }
    var G = []; for (var i = 0; i < L.length; i += 2) G.push(L.slice(i, i + 2));
    if (G.length > 1 && G[G.length - 1].length === 1) G[G.length - 2].push(G.pop()[0]);
    G.forEach(function (grup) { var hedef = grup[0].p;
      grup.slice(1).forEach(function (t) { t.x.mv = true; hedef.m.push({ no: t.s.no, g: null, mv: null, qr: true, qrT: t.x.qrT, src: 'birlesim', fromJ: t.p.j, from: t.p.k }); t.s.pair = hedef.id; t.s.eff = hedef.k; });
      grup.forEach(function (t) { t.s.birlesim = true; });
      mlog('Eşi gelmeyenler birleştirildi → ' + jName(jur(hedef.j)) + ', ' + hhmm(SL[hedef.k]) + ': ' + grup.map(function (t) { return t.s.ad; }).join(', ') + '.');
    });
  });
}
/** Oturum bitti: gelen öğrencilerin sınavı biter (anket açılır). */
function sabitBitir_(k) {
  for (var id in S.pairs) { var p = S.pairs[id]; if (!p.sabit || p.gun !== S.day || p.k !== k || p.bitti) continue;
    sabitGelen_(p).forEach(function (x) { var s = S.stu[x.no]; if (s.st === 'atandi' && s.pair === p.id) s.st = 'bitti'; });
    p.bitti = true; p.bitisT = S.T;
  }
}
function sabitOlaylar_() {
  var E = [];
  for (var k = 0; k < SL.length; k++) (function (k) {
    if (JURI_DK) E.push({ t: SL[k] - JURI_DK, o: -1, key: 'a' + k, f: function () {} });
    E.push({ t: SL[k] + GEC, o: 0, key: 'g' + k, f: function () {} });   // geç kalma sınırı: ekranlar yenilensin
    E.push({ t: SL[k] + SABIT_AKTAR_DK, o: 1, key: 't' + k, f: function () { sabitAktar_(k); } });
    E.push({ t: slotEnd(k), o: 2, key: 'b' + k, f: function () { sabitBitir_(k); } });
  })(k);
  E.push({ t: LASTCALL, o: 3, key: 'lastcall', f: lastCall });   // boş yer bulamayan geç kalanlar: alınamadı
  return E.sort(function (a, b) { return a.t - b.t || a.o - b.o; });
}

/** Öğrenci ekranı (sabit plan) – MehDer 10–11.11.2026 tasarımı. kod 'sabit', durum: bekle | esbelli | trans | esYok | juri | masa | bitti. */
function sabitNot_(x) { return x.src === 'aktarma' ? { t: 'akt', s: hhmm(SL[x.from]) } : x.src === 'birlesim' ? { t: 'bir', j: 'Jüri ' + jur(x.fromJ).no } : null; }
function sabitOgrGorunum_(s, v) {
  var p = S.pairs[s.pair], j = jur(p.j), k = p.k, sinir = SL[k] + GEC;
  var diger = p.m.filter(function (x) { return !x.mv && x.no !== s.no; }).sort(function (a, b) { return (a.qr ? a.qrT : 1e9) - (b.qr ? b.qrT : 1e9); });
  v.esler = diger.map(function (x) { return { ad: x.qr ? S.stu[x.no].ad : '', d: x.qr ? 'ok' : (S.T > sinir ? 'gelmedi' : 'bekle'), n: sabitNot_(x) }; });
  var gelen = v.esler.filter(function (e) { return e.d === 'ok'; }).length;
  v.kisi = v.esler.filter(function (e) { return e.d !== 'gelmedi'; }).length + 1;
  v.kod = 'sabit'; v.sabit = true; v.saat = hhmm(SL[k]); v.saatEk = saatEki_(v.saat); v.acilis = hhmm(SL[k] - JURI_DK); v.acilisEk = saatEki_(v.acilis);
  v.j = { lv: j.lv, no: j.no, room: j.room, kat: katAdi_(j.room) }; v.birlesim = !!s.birlesim;
  v.mola = MOLA && SL[k] === MOLA[1] && S.T >= MOLA[0] && S.T < MOLA[1] ? { a: hhmm(MOLA[0]), b: hhmm(MOLA[1]), ek: saatEki_(hhmm(MOLA[1])) } : null;
  if (erkenAcik(s)) { v.erkenSon = SL[k]; v.erken = s.early; }
  var dp = s.davet && S.pairs[s.davet], dx = dp && dp.m.filter(function (y) { return y.no === s.no && y.dv; })[0];
  if (dx) v.davet = { id: dp.id, saat: hhmm(SL[dp.k]), son: hhmm(dx.dvSon) };
  if (s.st === 'bitti') { v.durum = 'bitti'; v.anket = !S.ankO[s.no]; v.sorunAcik = false; return v; }
  if (s.masa) v.durum = 'masa';
  else if (!juriAcik(k)) v.durum = s.trans ? 'trans' : (gelen ? 'esbelli' : 'bekle');
  else if (s.birlesim || gelen + 1 >= v.esler.length + 1) v.durum = 'juri';   // grup tamam (madde 1)
  else if (v.esler.length >= 2 && gelen >= 1) {   // 3'lüde 2 geldi: jüri/derslik TAM oturum saatinde (madde 2)
    if (S.T < SL[k] - 1e-9) { v.durum = 'ucluBekle'; v.ucluSaat = hhmm(SL[k]); } else { v.durum = 'juri'; v.ucluEksik = S.T <= sinir + 1e-9; } }
  else { var h = sabitHedef_(p, s); v.durum = 'esYok'; v.sinir = hhmm(sinir); v.sinirEk = saatYonelme_(v.sinir); v.sonraki = h ? hhmm(SL[h.k]) : ''; }
  v.sorunAcik = true; v.ymsj = ogrYonetimMesajlari_(s.no);
  return v;
}

/** TV (sabit plan): her satır bir çift; düzeyler yan yana (MehDer 9.11.2026, öneri 4 + 3'lü turuncu). */
function sabitTV_() {
  var lvs = (S.cfg.gunler[S.day] || {}).lv || [];
  var ks = []; for (var k = 0; k < SL.length && ks.length < 2; k++) if (S.T < SL[k] + GEC) ks.push(k);
  return ks.map(function (k, i) {
    var acik = juriAcik(k), ac = hhmm(SL[k] - JURI_DK);
    var bloklar = lvs.map(function (lv) {
      var C = [];
      for (var id in S.pairs) { var p = S.pairs[id]; if (!p.sabit || p.gun !== S.day || p.k !== k) continue; var j = jur(p.j); if (j.lv !== lv) continue;
        var uye = p.m.filter(function (x) { return !x.mv; }), gelen = uye.filter(function (x) { return x.qr; });
        if (!gelen.length) continue;
        var asil = uye.filter(function (x) { return !x.src; }), asilGelen = asil.filter(function (x) { return x.qr; }).sort(function (a, b) { return a.qrT - b.qrT; });
        var kisi = function (x) { return { no: x.no.slice(-4), ad: maskAd_(S.stu[x.no].ad) }; };
        var hucre = asilGelen.slice(0, 2).map(kisi); while (hucre.length < 2) hucre.push(null);
        // 3. öğrenci (planda 3'lü ya da aktarılan) yalnızca QR okuttuysa görünür; renk/çerçeve yalnızca 3 kişi gerçekten geldiyse (MehDer 11.11.2026)
        var ek = asilGelen.slice(2).map(function (x) { var o = kisi(x); o.not = ''; return o; })
          .concat(uye.filter(function (x) { return x.src && x.qr; }).map(function (x) { var o = kisi(x); o.not = x.src === 'aktarma' ? hhmm(SL[x.from]) + ' oturumundan aktarıldı' : x.src === 'gec' ? 'geç kaldı, boş yere çağrıldı' : x.src === 'yedek' ? 'yedek oturum' : x.src === 'erken' ? (x.kendi != null ? hhmm(SL[x.kendi]) + ' oturumundan erken girdi' : 'erken girdi') : x.src === 'yönetim' ? 'yönetim atadı' : 'Jüri ' + (jur(x.fromJ) || {}).no + "'ten birleştirildi"; return o; }));
        // Madde 1–2 (MehDer 12.11.2026): jüri/derslik yalnız grup tamamsa (2/2, 3/3) oturumdan JURI_DK dk önce; 3'lüde 2 gelmişse TAM oturum saatinde; eşi bekleniyorsa hiç
        var tamam = gelen.length >= uye.length, goster = (acik && tamam) || (uye.length >= 3 && gelen.length >= 2 && S.T >= SL[k] - 1e-9);
        C.push({ t: Math.min.apply(null, gelen.map(function (x) { return x.qrT; })), m: hucre, ek: ek, uclu: gelen.length >= 3, renk: !tamam ? '' : gelen.length >= 3 ? 'u3' : 'u2',
          juri: goster ? 'Jüri ' + j.no : '', derslik: goster ? j.room : '', kat: goster ? katAdi_(j.room) : '' });
      }
      C.sort(function (a, b) { return a.t - b.t; }); C.forEach(function (c) { delete c.t; });
      return { lv: lv, ciftler: C };
    });
    var molaSonrasi = MOLA && SL[k] === MOLA[1] && S.T >= MOLA[0] && S.T < MOLA[1];   // molanın hemen ardından gelen oturum
    return { sabit: true, saat: hhmm(SL[k]), acik: acik, ikinci: i > 0, mola: molaSonrasi ? 'Jüriler ' + hhmm(MOLA[0]) + '–' + hhmm(MOLA[1]) + ' arasında moladadır. Bu oturumun sınavları ' + hhmm(MOLA[1]) + saatEki_(hhmm(MOLA[1])) + ' başlayacaktır.' : '',
      molaEn: molaSonrasi ? 'Juries are on break ' + hhmm(MOLA[0]) + '–' + hhmm(MOLA[1]) + '. Exams in this session start at ' + hhmm(MOLA[1]) + '.' : '', bloklar: bloklar, satir: [].concat.apply([], bloklar.map(function (b) { return b.ciftler; })),
      bilgi: acik ? 'Jüri ve derslikler belli oldu. Dersliğinin önünde jürinin seni çağırmasını bekle.' : 'Jüri ve derslik bilgisi saat ' + ac + saatEki_(ac) + ' belli olacaktır.',
      en: acik ? 'Juries and rooms are set. Wait in front of your room.' : 'Jury and room will be shown at ' + ac + '.' };
  }).filter(function (b, i) { return i === 0 || b.satir.length; });
}

/** Sabit planı mevcut duruma ekler (yeniden kurulum YOK; D1 notları, writing, şifreler korunur). Editörden: sabitPlanYukle(). */
function sabitPlanYukle(zorla) { sahipKontrol_(); return sabitPlanEkle_(SABIT_PLAN, zorla); }
function sabitPlanEkle_(PL, zorla) {
  return islem_(function () {
    if (S.sabit && !zorla) throw new Error('Sabit plan zaten yüklü (' + S.sabit.at + ').');
    // jüri hocaları ve derslikler Gorevler'den ("A Jüri 3 – Derslik 116 · Jüri eşi: …") – 7 Kasım görev değişiklikleri dahil
    var gj = {};
    Object.keys(S.gorev || {}).forEach(function (t) { (S.gorev[t] || []).forEach(function (g) {
      if (!/^Konuşma sınavı jürisi/.test(g.gorev || '')) return;
      var m = /^(A|B|C|D2) Jüri (\d+) – Derslik (\S+)/.exec(g.yer || ''); if (!m) return;
      var id = m[1] + '-J' + m[2]; (gj[id] = gj[id] || { lv: m[1], no: Number(m[2]), room: m[3], h: [] }).h.push(t); }); });
    var hata = [], yeniJ = [], gunOf = {};
    PL.forEach(function (r) { var lv = r[0], id = lv + '-J' + r[1], s0 = S.stu[r[3][0]]; if (!s0) { hata.push('öğrenci yok: ' + r[3][0]); return; } gunOf[id] = s0.gun;
      if (!gj[id]) hata.push(id + ': Gorevler sayfasında jüri yok'); else if (gj[id].h.length !== 2) hata.push(id + ': ' + gj[id].h.length + ' hoca'); });
    var planda = {};
    PL.forEach(function (r) { r[3].forEach(function (no) { var s = S.stu[no]; if (!s) { hata.push('öğrenci yok: ' + no); return; }
      if (planda[no]) hata.push('iki kez: ' + no); planda[no] = 1;
      if (s.lv !== r[0]) hata.push(no + ': düzey ' + s.lv + ' ≠ ' + r[0]); if (s.plan !== r[2]) hata.push(no + ': grup saati ' + hhmm(SL[s.plan]) + ' ≠ ' + hhmm(SL[r[2]])); }); });
    S.order.forEach(function (no) { var s = S.stu[no]; if (kagitDuzey_(s.lv) && !planda[no]) hata.push('planda yok: ' + no + ' ' + s.ad); });
    if (hata.length) throw new Error('Sabit plan yüklenmedi: ' + hata.slice(0, 15).join(' | ') + (hata.length > 15 ? ' … (' + hata.length + ')' : ''));
    Object.keys(gunOf).forEach(function (id) { if (jur(id)) return; var g = gj[id]; var j = { id: id, gun: gunOf[id], lv: g.lv, no: g.no, room: g.room, h: g.h, kacin: [], sabit: true }; S.juri.push(j); yeniJ.push(id); });
    var n = 0;
    PL.forEach(function (r) { var id = 'f' + (++n), jid = r[0] + '-J' + r[1];
      S.pairs[id] = { id: id, j: jid, k: r[2], gun: gunOf[jid], m: r[3].map(function (no) { return { no: no, g: null, mv: null, qr: false }; }), bitti: false, T: SL[r[2]], sabit: true };
      r[3].forEach(function (no) { S.stu[no].p5 = id; }); });
    S.sabit = { at: new Date().toISOString(), cift: n, juri: yeniJ.length };
    S.sabitVer = null; S.sayfaT = 0;   // jüriler önbellekte "sabit" kısımda: yeniden yazılsın; tabloya hemen yazılsın
    mlog('Sabit plan (Alternatif 5) yüklendi: ' + n + ' çift, ' + yeniJ.length + ' jüri (A, B, C, D2). D1 verisi korundu.');
    return 'Sabit plan yüklendi: ' + n + ' çift, ' + yeniJ.length + ' jüri.';
  });
}
/** Yedek (MehDer 9.11.2026): sabit plan eklenmeden önce durum tablosunun (_durum) kopyası alınır. Editörden: durumYedekle(). */
function durumYedekle() { sahipKontrol_();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { S = durumOku_(); durumYaz_(true); var ad = '_durum yedek ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH.mm'); sayfa_('_durum').copyTo(ss_()).setName(ad); return 'Yedek alındı: ' + ad; }
  finally { lock.releaseLock(); }
}

/** Derslik → kat (MehDer 10.11.2026): Z… zemin kat, 1xx 1. kat, 2xx 2. kat. */
function katAdi_(room) { var r = String(room || '').trim(); if (/^Z/i.test(r)) return 'Zemin kat'; var m = /^(\d)\d\d/.exec(r); return m ? m[1] + '. kat' : ''; }

/* ---------- Saat kilidi (MehDer 10.11.2026; 10 Kasım 14:52 erken işleme olayından sonra) ----------
 * 1) Çift okuma: baglam_ saati iki yoldan okur (saat dilimi çevirisi + ham milisaniye); fark >1 dk → küçük olan kullanılır, olaylar ertelenir.
 * 2) Sıçrama: aynı gün içinde saat son kabul edilen okumadan 3 dk'dan fazla ileri atlarsa olaylar ertelenir, saat son kabul edilene çekilir;
 *    bir sonraki okuma sıçranan saatin devamıysa kabul edilir, eski çizgiye dönerse sıçrama yok sayılır.
 * 3) Ertelenen olay kaybolmaz: "yapıldı" işaretlenmez, sonraki dakikada yeniden denenir. Kayda uyarı satırı düşer. */
var SAAT_KILIDI = true;
function saatKilidi_() {
  if (!SAAT_KILIDI || !S.day) return false;
  if (S.saatFark) { saatUyar_('Saat tutarsızlığı: iki okuma ' + S.saatFark + ' dk farklı; olaylar ertelendi.'); return true; }
  var c = CacheService.getScriptCache(), o = {}; try { o = JSON.parse(c.get('saatK') || '{}') || {}; } catch (e) { o = {}; }
  var son = o.g === S.day ? o.T : null, sup = o.sg === S.day ? o.sT : null, kilit = false;
  if (son != null && S.T - son > 3) {
    if (sup != null && S.T >= sup && S.T - sup <= 3) sup = null;   // sıçrama tutarlı: saat gerçekten ilerlemiş
    else { saatUyar_('Saat sıçraması: ' + hhmm(son) + ' → ' + hhmm(S.T) + '; olaylar ertelendi.'); sup = S.T; S.T = son; kilit = true; }
  } else if (!kilit) sup = null;
  if (!kilit) son = Math.max(S.T, son || 0);
  c.put('saatK', JSON.stringify({ g: S.day, T: son, sg: sup != null ? S.day : null, sT: sup }), 21600);
  return kilit;
}
var SAAT_UYARI = false;
function saatUyar_(m) { var l = S.log[0]; if (!(l && l.m === m)) { mlog(m); SAAT_UYARI = true; } }

/** 10 Kasım kayıt notu (MehDer 10.11.2026): erken aktarılan öğrenciler. Editörden bir kez: kayitNotu10Kasim(). */
function kayitNotu10Kasim() { sahipKontrol_(); return islem_(function () {
  S.log.unshift({ T: 931, g: 2, m: 'YÖNETİM NOTU (10.11.2026): 14:51–14:52 arasında sistem saati yanlış okuyup 15:00 ve 15:15 oturumlarının aktarmalarını ve 14:45/15:00 oturumlarının "bitti" işaretini erken yaptı. Erken aktarılanlar: Azra Kolay, Nurefşan Çoker, Darina Issımbayeva (15:00); Fidan Su Kızılkan (15:00 ve 15:15); Rabia Ünaldı, İlke Ecrin Şenel, Cemre Kaya, Nurseli Demir, Sude Mehmetalioğlu (15:15). Sistemdeki aktarma kayıtları gerçeği yansıtmayabilir; esas olan jüri kâğıtlarıdır. 11.11.2026\'da saat kilidi eklendi.' });
  return 'Not düşüldü.'; }); }

/** Toplu öğrenci mesajı (MehDer 11.11.2026): hedef 'gun' | 'duzey:C' | 'oturum:3' (oturum = öğrencinin şu anki çiftinin oturumu). */
function ogrTopluMesaj_(hedef, metin, en, ru) {
  metin = String(metin || '').trim(); if (!metin) return 'Mesaj boş.';
  var L = dayStu().filter(function (s) {
    if (hedef === 'gun') return true;
    var m = /^duzey:(.+)$/.exec(hedef); if (m) return s.lv === m[1];
    m = /^oturum:(\d+)$/.exec(hedef); if (m) { var p = s.pair && S.pairs[s.pair] || s.p5 && S.pairs[s.p5]; return (p ? p.k : s.plan) === Number(m[1]); }
    return false; });
  if (!L.length) return 'Bu seçime uyan öğrenci yok.';
  aracHazirla_();
  // Toplu mesaj TEK kayıt (MehDer 12.11 madde 5; 11 Kasım'da öğrenci başına kayıt sınırı aşmıştı)
  S.otop = S.otop || []; S.otop.push({ id: 't' + (++S.aseq), hedef: hedef, nos: L.map(function (s) { return s.no; }), metin: metin, en: en || '', ru: ru || '', T: S.T, ts: Date.now(), onay: {} });
  mlog('Toplu öğrenci mesajı (' + hedef + ', ' + L.length + ' öğrenci): ' + metin.slice(0, 80));
  return 'Mesaj ' + L.length + ' öğrencinin ekranına gönderildi.';
}

/** Saat + yönelme eki ("14:05'e", "14:10'a", "15:00'e") – Türkçe okunuşa göre. */
function saatYonelme_(t) { var hm = t.split(':'), n = Number(hm[1]) || Number(hm[0]), b = n % 10, o = Math.floor(n / 10) % 10;
  var e = b ? ['', 'e', 'ye', 'e', 'e', 'e', 'ya', 'ye', 'e', 'a'][b] : ['', 'a', 'ye', 'a', 'a', 'ye'][o] || 'a'; return "'" + e; }
/* ======================= SabitPlan.gs ======================= */
/* Sabit plan (plan5 + 7.11 değişiklikleri: Anar D2 Jüri 7 15:30, Nisa C Jüri 4 15:00, Aıym C Jüri 11 15:30) – [düzey, jüri no, slot, öğrenciler] */
var SABIT_PLAN = [["A",1,0,["20250179064","20250926015"]],["A",1,1,["20251553082","20260154041"]],["A",1,2,["20260157022","20260179055"]],["A",1,3,["20260180056","20260897034"]],["A",1,4,["20260926036","20261553064"]],["A",1,5,["20261735071","20262005017"]],["A",1,6,["20262005062","20262037024"]],["A",1,7,["20262038031","20262081006"]],["A",2,0,["20250154078","20250154108"]],["A",2,1,["20252005061","20260154032"]],["A",2,2,["20250180007","20250926033"]],["A",2,3,["20252038014","20260154058"]],["A",2,4,["20260179013","20260179071"]],["A",2,5,["20260180064","20260920072"]],["A",2,6,["20261322020","20261735013"]],["A",2,7,["20261930019","20262005021"]],["A",2,8,["20262037033","20262038044","20262081015"]],["A",3,0,["20260157016","20260179039"]],["A",3,1,["20250926023","20251735008"]],["A",3,2,["20260154057","20260179059"]],["A",3,3,["20260180057","20260917088"]],["A",3,4,["20260926040","20260926065"]],["A",3,5,["20261553087","20261553100"]],["A",3,6,["20261735082","20261930012"]],["A",3,7,["20262005018","20262008020"]],["A",3,8,["20262037029","20262038037","20262081014"]],["A",4,0,["20250180027","20250926045"]],["A",4,1,["20252038033","20260154081"]],["A",4,2,["20260179014","20260180009"]],["A",4,3,["20260180065","20260840005"]],["A",4,4,["20260923023","20261553013"]],["A",4,5,["20261930030","20262005026"]],["A",4,6,["20262009037","20262037042"]],["A",4,7,["20262038048","20262081031"]],["A",4,8,["20260180042","20260181021"]],["A",5,0,["20250154064","20260157002"]],["A",5,1,["20260179015","20260180012"]],["A",5,2,["20260180070","20260180104"]],["A",5,3,["20260923030","20261553046"]],["A",5,4,["20261735021","20261930036"]],["A",5,5,["20262005029","20262037012"]],["A",5,6,["20262037053","20262061018"]],["A",5,7,["20260926027","20261553060"]],["A",5,8,["20261553082","20261735068"]],["A",6,0,["20250923027","20251553006"]],["A",6,1,["20260139029","20260157009"]],["A",6,2,["20260179036","20260180035"]],["A",6,3,["20260181005","20260923043"]],["A",6,4,["20260926070","20261553054"]],["A",6,5,["20261735043","20261930063"]],["A",6,6,["20262005038","20262037015"]],["A",6,7,["20262038011","20262061028"]],["A",6,8,["20262005048","20262037022"]],["A",7,0,["20252005036","20252005097"]],["A",7,1,["20260138018","20260157007"]],["A",7,2,["20260179023","20260180031"]],["A",7,3,["20260180072","20260923033"]],["A",7,4,["20261553009","20261553052"]],["A",7,5,["20261735038","20261930058"]],["A",7,6,["20262005030","20262037013"]],["A",7,7,["20262037055","20262061024"]],["A",7,8,["20262038026","20262061030"]],["A",8,0,["20252005057","20260154031"]],["A",8,1,["20260157014","20260179038"]],["A",8,2,["20260179099","20260180038"]],["A",8,3,["20260181019","20260840006"]],["A",8,4,["20260926006","20261553055"]],["A",8,5,["20261735054","20262005012"]],["A",8,6,["20262005039","20262037017"]],["A",8,7,["20262038024","20262061029"]],["B",1,0,["20250179009","20250180065"]],["B",1,1,["20251735030","20252005065"]],["B",1,2,["20260154006","20260179062"]],["B",1,3,["20260180059","20260181022"]],["B",1,4,["20260908004","20260923058"]],["B",1,5,["20260926069","20261735008"]],["B",1,6,["20261930029","20262005041"]],["B",1,7,["20262038034","20262061013"]],["B",2,0,["20250926082","20251735040"]],["B",2,1,["20260154013","20260154074"]],["B",2,2,["20260179067","20260180061"]],["B",2,3,["20260180093","20260917047"]],["B",2,4,["20260926008","20260926072"]],["B",2,5,["20261294056","20261735011"]],["B",2,6,["20261930034","20262007011"]],["B",2,7,["20262038036","20262081016"]],["B",3,0,["20250179015","20250923029"]],["B",3,1,["20250948001","20260157021"]],["B",3,2,["20260180062","20260918083"]],["B",3,3,["20260926013","20261294135"]],["B",3,4,["20261553039","20261735024"]],["B",3,5,["20261930042","20262037018"]],["B",3,6,["20262038038","20262081021"]],["B",3,7,["20250180036","20250926048"]],["B",3,8,["20252005029","20252038031"]],["B",4,0,["20250179019","20250923036"]],["B",4,1,["20251930002","20252005092"]],["B",4,2,["20260177013","20260180011"]],["B",4,3,["20260180073","20260919021"]],["B",4,4,["20260926014","20260926073"]],["B",4,5,["20261553006","20261735067"]],["B",4,6,["20261930044","20262037027"]],["B",4,7,["20262038039","20262081024"]],["B",5,0,["20250923041","20260179002"]],["B",5,1,["20260179018","20260180014"]],["B",5,2,["20260181004","20260923018"]],["B",5,3,["20260926017","20260926058"]],["B",5,4,["20261553019","20261930013"]],["B",5,5,["20261930060","20262037037"]],["B",5,6,["20262041010","20262081041"]],["B",5,7,["20250923073","20250926069"]],["B",5,8,["20260138048","20260154009"]],["B",6,0,["20260179050","20260180051"]],["B",6,1,["20260840001","20260923042"]],["B",6,2,["20250923038","20251930077"]],["B",6,3,["20260179012","20260180013"]],["B",6,4,["20260180078","20260180095"]],["B",6,5,["20260923009","20260926015"]],["B",6,6,["20261553015","20261735069"]],["B",6,7,["20261930008","20261930045"]],["B",6,8,["20262037030","20262038045","20262081033"]],["B",7,0,["20260179061","20260180005"]],["B",7,1,["20260180058","20260896020"]],["B",7,2,["20250923050","20250926002"]],["B",7,3,["20251553050","20252005014"]],["B",7,4,["20260179021","20260180015"]],["B",7,5,["20260181009","20260923019"]],["B",7,6,["20260926023","20261553024"]],["B",7,7,["20261735060","20261930014"]],["B",7,8,["20261930080","20262037039","20262041012"]],["B",8,0,["20251553065","20251553072"]],["B",8,1,["20260179029","20260179090"]],["B",8,2,["20260180032","20260181010"]],["B",8,3,["20260923020","20260926024"]],["B",8,4,["20261553027","20261735080"]],["B",8,5,["20261930015","20262005001"]],["B",8,6,["20262037040","20262045006"]],["B",8,7,["20260926059","20261553047"]],["B",8,8,["20260926062","20261553091"]],["B",9,0,["20261930027","20262005032"]],["B",9,1,["20262038030","20262061010"]],["B",9,2,["20250926026","20251735002"]],["B",9,3,["20252038029","20260179048"]],["B",9,4,["20260180047","20260779027"]],["B",9,5,["20260923031","20260923034"]],["B",9,6,["20260923076","20260926032"]],["B",9,7,["20261553035","20261930020"]],["B",9,8,["20262005023","20262037045","20262061014"]],["B",10,0,["20261930023","20262005027"]],["B",10,1,["20262038027","20262061008"]],["B",10,2,["20250154067","20250180021"]],["B",10,3,["20250926020","20252005024"]],["B",10,4,["20260179047","20260180033"]],["B",10,5,["20260181016","20260923028"]],["B",10,6,["20260926025","20261553034"]],["B",10,7,["20261735072","20261930017"]],["B",10,8,["20262005007","20262037043","20262061002"]],["C",1,0,["20250923051","20260177017"]],["C",1,1,["20250179060","20250926021"]],["C",1,2,["20260154008","20260179025"]],["C",1,3,["20260179086","20260180043"]],["C",1,4,["20260906009","20260923025"]],["C",1,5,["20261553025","20261553085"]],["C",1,6,["20261735041","20261930049"]],["C",1,7,["20262005013","20262009016"]],["C",1,8,["20262038019","20262061019","20262081038"]],["C",2,0,["20250180100","20260179030"]],["C",2,1,["20260180016","20260180044"]],["C",2,2,["20260180097","20260917020"]],["C",2,3,["20260923027","20261553028"]],["C",2,4,["20261553075","20261646040"]],["C",2,5,["20261735045","20261930051"]],["C",2,6,["20262005024","20262037020"]],["C",2,7,["20262038021","20262061022"]],["C",2,8,["20260179073","20260180040"]],["C",3,0,["20250923056","20251553060"]],["C",3,1,["20260179034","20260180018"]],["C",3,2,["20260180049","20260917049"]],["C",3,3,["20260923040","20260926067"]],["C",3,4,["20261553032","20261735005"]],["C",3,5,["20261735056","20261930053"]],["C",3,6,["20262005036","20262037023"]],["C",3,7,["20262038022","20262081001"]],["C",3,8,["20260896041","20260923016"]],["C",4,0,["20252005044","20260179035"]],["C",4,1,["20260179103","20260180020"]],["C",4,2,["20260180052","20260917062"]],["C",4,3,["20260923057","20261553037"]],["C",4,5,["20261930001","20261930054","20261735010"]],["C",4,6,["20262005040","20262037028"]],["C",4,7,["20262038028","20262081008"]],["C",5,0,["20261553014","20261553076"]],["C",5,1,["20250923002","20251735003"]],["C",5,2,["20252005046","20260179042"]],["C",5,3,["20260180021","20260180063"]],["C",5,4,["20260917067","20260923060"]],["C",5,5,["20261553008","20261553038"]],["C",5,6,["20261735012","20261930009"]],["C",5,7,["20261930056","20262005043"]],["C",5,8,["20262037032","20262038029","20262081012"]],["C",6,0,["20252005086","20260154072"]],["C",6,1,["20260179044","20260180022"]],["C",6,2,["20260180071","20260180094"]],["C",6,3,["20260917137","20260926005"]],["C",6,4,["20261553040","20261735014"]],["C",6,5,["20261930018","20261930067"]],["C",6,6,["20262005045","20262037034"]],["C",6,7,["20262038041","20262081017"]],["C",6,8,["20261735040","20261930048"]],["C",7,0,["20261930082","20262008014"]],["C",7,1,["20250923008","20260179045"]],["C",7,2,["20260180026","20260180085"]],["C",7,3,["20260918038","20260923069"]],["C",7,4,["20260926009","20261553049"]],["C",7,5,["20261735015","20261735078"]],["C",7,6,["20261930022","20261930068"]],["C",7,7,["20262005046","20262005071"]],["C",7,8,["20262037035","20262038042","20262081018"]],["C",8,0,["20262038015","20262038056"]],["C",8,1,["20250923009","20251735033"]],["C",8,2,["20260179046","20260180028"]],["C",8,3,["20260180096","20260181002"]],["C",8,4,["20260918073","20260926018"]],["C",8,5,["20260926054","20261553053"]],["C",8,6,["20261735019","20261930026"]],["C",8,7,["20261930069","20262005047"]],["C",8,8,["20262037047","20262038046","20262081023"]],["C",9,0,["20262061011","20262081036"]],["C",9,1,["20250923019","20251735055"]],["C",9,2,["20252038003","20260179049"]],["C",9,3,["20260180029","20260181020"]],["C",9,4,["20260838027","20260918099"]],["C",9,5,["20260923071","20260926037"]],["C",9,6,["20261553062","20261735027"]],["C",9,7,["20261930028","20261930070"]],["C",9,8,["20262008004","20262037051","20262081027"]],["C",10,0,["20251735066","20260138052"]],["C",10,1,["20260179063","20260180036"]],["C",10,2,["20260839023","20260919043"]],["C",10,3,["20260926042","20261553065"]],["C",10,4,["20261735034","20261735061"]],["C",10,5,["20261930038","20261930072"]],["C",10,6,["20262008006","20262037058"]],["C",10,7,["20262061003","20262081028"]],["C",11,0,["20251735068","20260154014"]],["C",11,1,["20260179066","20260180037"]],["C",11,2,["20260839036","20260923011"]],["C",11,3,["20261294054","20261553066"]],["C",11,4,["20261735035","20261735055"]],["C",11,5,["20261930041","20261930074"]],["C",11,6,["20262008012","20262038014"]],["C",11,7,["20262061007","20262081035","20252005098"]],["D2",1,0,["20250179049","20252005068"]],["D2",1,1,["20260179028","20260180017"]],["D2",1,2,["20260180090","20260917060"]],["D2",1,3,["20260926002","20260926033"]],["D2",1,4,["20261553020","20261735006"]],["D2",1,5,["20261735046","20261930071"]],["D2",1,6,["20262005049","20262005056"]],["D2",1,7,["20262037041","20262038050"]],["D2",1,8,["20262081002","20262081030"]],["D2",2,0,["20250923057","20252005021"]],["D2",2,1,["20260154019","20260179027"]],["D2",2,2,["20260179088","20260180086"]],["D2",2,3,["20260180089","20260908003"]],["D2",2,4,["20260923038","20260926030"]],["D2",2,5,["20261663001","20261735044"]],["D2",2,6,["20261930066","20262005050"]],["D2",2,7,["20262037038","20262038049"]],["D2",2,8,["20262061020","20262061021","20262081025"]],["D2",3,0,["20260179031","20260180023"]],["D2",3,1,["20260181001","20260917065"]],["D2",3,2,["20260926004","20260926035"]],["D2",3,3,["20261553031","20261735007"]],["D2",3,4,["20261735023","20261930039"]],["D2",3,5,["20261930075","20262007026"]],["D2",3,6,["20262038010","20262038058"]],["D2",3,7,["20262081003","20262081034"]],["D2",4,0,["20251553040","20260138034"]],["D2",4,1,["20260179041","20260180024"]],["D2",4,2,["20260181003","20260917083"]],["D2",4,3,["20260926007","20261294060"]],["D2",4,4,["20261553043","20261735017"]],["D2",4,5,["20261930043","20262005010"]],["D2",4,6,["20262009008","20262038016"]],["D2",4,7,["20262045027","20262081004","20262081020"]],["D2",5,0,["20260154005","20260179051"]],["D2",5,1,["20260180053","20260181006"]],["D2",5,2,["20260918061","20260926011"]],["D2",5,3,["20261322021","20261553045"]],["D2",5,4,["20261735026","20261930050"]],["D2",5,5,["20262005011","20262037004"]],["D2",5,6,["20262038023","20262061001"]],["D2",5,7,["20262081009","20262081042"]],["D2",6,0,["20260179020","20260179054"]],["D2",6,1,["20260180054","20260839004"]],["D2",6,2,["20260920023","20260926016"]],["D2",6,3,["20261553012","20261553057"]],["D2",6,4,["20261735032","20261735076"]],["D2",6,5,["20261930052","20262005020"]],["D2",6,6,["20262037016","20262038025"]],["D2",6,7,["20262061005","20262081013"]],["D2",7,0,["20251735076","20260179022"]],["D2",7,1,["20260179060","20260180055"]],["D2",7,2,["20260920052","20260926019"]],["D2",7,3,["20261553016","20261553058"]],["D2",7,4,["20261553093","20261735033"]],["D2",7,5,["20261930061","20262005034"]],["D2",7,6,["20262037031","20262038033"]],["D2",7,7,["20262061009","20262081037","20261553102"]],["D2",8,0,["20252005017","20260179024"]],["D2",8,1,["20260179074","20260180066"]],["D2",8,2,["20260897036","20260923012"]],["D2",8,3,["20260926026","20260926074"]],["D2",8,4,["20261553017","20261553072"]],["D2",8,5,["20261735039","20261930064"]],["D2",8,6,["20262005037","20262037036"]],["D2",8,7,["20262038040","20262061012","20262081026"]]];
/* ======================= Duzeltme.gs ======================= */
/* ---------- Yönetim düzeltmesi (MehDer, 9.11.2026) ----------
 * Kesinleşmiş speaking notunun bentlerini jüri talebiyle düzeltir; kayda ve Kayıt sayfasına satır ekler.
 * Editörden çalıştırılır (yalnız sahip). hocaA/hocaB jürideki 1./2. hoca adıyla eşleşmezse hiçbir şey değişmez. */
function notDuzelt_(no, hocaA, notA, hocaB, notB) {
  return islem_(function () {
    var s = S.stu[no]; if (!s) throw new Error('Öğrenci yok: ' + no);
    var r = S.gr['S:' + no], p = s.pair && S.pairs[s.pair], j = p && jur(p.j);
    if (!r || r.fin == null) throw new Error('Not kesinleşmemiş; düzeltme yapılmadı.');
    if (!j || S.hoca[j.h[0]].ad !== hocaA || S.hoca[j.h[1]].ad !== hocaB) throw new Error('Jüri hocaları eşleşmiyor: ' + (j ? S.hoca[j.h[0]].ad + ' / ' + S.hoca[j.h[1]].ad : '-'));
    var cx = ctxS(no);
    var yap = function (arr) {
      if (arr.length !== cx.C.length) throw new Error(cx.C.length + ' bent notu gerekli.');
      var c = {}; cx.C.forEach(function (k, i) { var v = Number(arr[i]); if (!(v >= 0 && v <= k[2] && v === Math.floor(v))) throw new Error(k[1] + ' 0–' + k[2] + ' arası olmalı.'); c[k[0]] = v; });
      return c;
    };
    var ca = yap(notA), cb = yap(notB);
    var eski = { a: r.a.oz || totalOf(r.a, cx.C), b: r.b.oz || totalOf(r.b, cx.C), fin: r.fin, r100: r.r100 };
    var uzlasmaYok = !r.ilk || (JSON.stringify(r.ilk.a) === JSON.stringify({ c: r.a.c, oz: r.a.oz }) && JSON.stringify(r.ilk.b) === JSON.stringify({ c: r.b.c, oz: r.b.oz }));
    r.a.c = ca; r.b.c = cb; r.a.oz = null; r.b.oz = null; r.abs = false;
    if (uzlasmaYok) r.ilk = { a: { c: JSON.parse(JSON.stringify(ca)), oz: null }, b: { c: JSON.parse(JSON.stringify(cb)), oz: null } };
    var ta = totalOf(r.a, cx.C), tb = totalOf(r.b, cx.C);
    r.avg = (ta + tb) / 2; r.fin = rnd(r.avg); r.r100 = rnd(r.fin / cx.max * 100); r.neg = false; r.hl = [];
    r.hist.push({ T: S.T, at: new Date().toISOString(), side: 'duzeltme', by: 'yönetim düzeltmesi (jüri talebi)', eski: eski, yeni: { a: ta, b: tb, fin: r.fin, r100: r.r100 } });
    var m = 'Yönetim düzeltmesi (jüri talebi) – ' + s.ad + ' (' + no + ') speaking: ' + hocaA + ' ' + eski.a + '→' + ta + ', ' + hocaB + ' ' + eski.b + '→' + tb +
      '; nihai ' + eski.fin + '→' + r.fin + ' / ' + cx.max + ' (100\'lük ' + eski.r100 + '→' + r.r100 + ').';
    mlog(m);
    return { mesaj: m };
  });
}
function duzeltHusnaDemir() {
  sahipKontrol_();
  var r = notDuzelt_('20261553010', 'Gül Uzuner', [3, 2, 2, 3], 'Neşe Ayşin Siyli', [3, 2, 3, 3]);
  Logger.log(r.mesaj);
  return r.mesaj;
}
/* ======================= Birim.gs ======================= */
/* =====================================================================================
 * Birim Çalışmaları sekmesi (11 tablosu bölüm O; MehDer 12.11.2026 ve 17.11.2026)
 * - Altı birim; dosyalar sistemin Google hesabındaki paylaşılmamış Drive klasörlerinde.
 * - İndirme sistem üzerinden, yetki kontrolüyle (Google hesabı gerekmez).
 * - Kayıtlar tablo sayfalarında: "Birim Dosyaları", "Birim Mesajları", "Birim İndirmeleri" (sınav günü kaydından ayrı).
 * ===================================================================================== */
var BIRIM_ALAN = '@anadolu.edu.tr', BIRIM_MAX_MB = 20;
var BIRIM_DUZEYLER = ['A', 'B', 'C', 'D2', 'D1'];
var BIRIMLER = [
  { id: 'yet', ad: 'Yeterlik Sınav Birimi', duzeyli: false,
    etiket: ['Yeterlik Konuşma', 'Yeterlik Yazma', 'Yeterlik Çoktan Seçmeli Test', 'YDS Konuşma', 'YDS Yazma', 'YDS Çoktan Seçmeli Test', 'YDS Büt Konuşma', 'YDS Büt Yazma', 'YDS Büt Çoktan Seçmeli Test', 'Erasmus Konuşma', 'Erasmus Yazma', 'Erasmus Çoktan Seçmeli Test', 'Yeterlik Birimi Genel'],
    uye: [['Taner Sofracı', 'tsofraci'], ['Erkin Özdemir', 'erkino'], ['Serkan Geridönmez', 'sgeridon'], ['Çağdaş Delibaş', 'cdelibas'], ['Gülden Kılıçaslan', 'guldenefe'], ['Nazmi Taslacı', 'ntaslaci'], ['Eylem Koral Gümüşoğlu', 'ekoral']] },
  { id: 'disb', ad: 'Dönem İçi Sınav Birimi', duzeyli: true,
    etiket: ['Quiz', 'Arasınav Konuşma', 'Arasınav Yazma', 'Arasınav Çoktan Seçmeli Test', 'Dönem Sonu Konuşma', 'Dönem Sonu Yazma', 'Dönem Sonu Çoktan Seçmeli Test', 'Dönem İçi Sınav Birimi Genel'],
    uye: [['Güven Çağdaş Gündoğdu', 'gcgundogdu', 'C'], ['Hülya Sezer', 'hulyasezer', 'C'], ['Gözem Çeçen', 'gozemcelfis', 'A'], ['R. Güleç Sabuncu', 'rgyilmazlar', 'A'],
      ['Fatma Özcan', 'fatmaerdem', 'B'], ['Eda Atasoy', 'ekaypak', 'B'], ['Merve Diyarbakırlı', 'mervebakkal', 'D2'], ['Ayşe Nur Sünnetçi', 'aysenursunnetci', 'D2'],
      ['Alper Topbaş', 'atopbas', 'D1'], ['M. Yiğit Boyer', 'myboyer', 'D1']] },
  { id: 'prog', ad: 'Program Geliştirme Birimi', duzeyli: false, etiket: ['Genel'],
    uye: [['Ersin Ateş', 'e_ates'], ['Yasemin Açıkgöz', 'yasemingoren'], ['Barış Özdemir', 'bariskasap'], ['Sedef Sezgin', 'sedefsezgin'], ['Dilek Çanakçı', 'dilekk'],
      ['Gamze Eren', 'gamzeeren'], ['Zeynep Berber', 'zoncel'], ['Ayşenur Derinöz', 'akaracan'], ['Filiz Karabulut', 'fikarabulut'], ['Neşe Ayşin Siyli', 'nasiyli']] },
  { id: 'mat', ad: 'Materyal Geliştirme Birimi', duzeyli: false, etiket: ['Genel'],
    uye: [['Özge Özsoy', 'ozgeozaydin'], ['Berrin Karasaç Horkel', 'berrinkarasac'], ['Numan Aydın', 'numanaydin'], ['Ömür Belce', 'obelce'], ['Sevgi Elibol', 'sevgi_sahin']] },
  { id: 'mes', ad: 'Mesleki Gelişim Birimi', duzeyli: false, etiket: ['Genel'],
    uye: [['Başak Erol', 'basakerol'], ['Kadir Özsoy', 'kozsoy'], ['Aslı Karabıyık Kımav', 'akarabiyik'], ['M. Gökhan Gök', 'mggok'], ['Hilal Sarıkaya Aslantaş', 'hilalarslantas']] },
  { id: 'ogr', ad: 'Öğrenci Birimi', duzeyli: false, etiket: ['Genel'],
    uye: [['Gülşah Demirci', 'gulsahdemirci'], ['Gürkan Turhan', 'gurkanturhan'], ['Özlem Uzun', 'ouzun1'], ['Gözde Şener', 'gsener'], ['Sema Kaplan Karabina', 'semakaplan']] }
];
/** Üye dosya yükleyince / yanıt verince bildirim gidecek yönetim adresleri. */
function birimYonetimAlicilari_(bid) { return (bid === 'ogr' ? ['incikarabacak', 'mgonen', 'mduranlioglu'] : ['mduranlioglu', 'mgonen']).map(function (x) { return x + BIRIM_ALAN; }); }
function birimBul_(id) { for (var i = 0; i < BIRIMLER.length; i++) if (BIRIMLER[i].id === id) return BIRIMLER[i]; return null; }
function birimUyeleri_(b) { return b.uye.map(function (u) { return { ad: u[0], e: u[1] + BIRIM_ALAN, lv: u[2] || '' }; }); }
function epN_(e) { return String(e || '').trim().toLowerCase(); }

/* ---------- dönem: Eylül–Ocak Güz, Şubat–Ağustos Bahar ---------- */
function donemOf_(ms) {
  var d = new Date(ms), y = Number(Utilities.formatDate(d, TZ, 'yyyy')), m = Number(Utilities.formatDate(d, TZ, 'MM'));
  var bas = m >= 9 ? y : y - 1; return bas + '-' + String(bas + 1).slice(2) + ' ' + (m >= 9 || m === 1 ? 'Güz' : 'Bahar');
}

/* ---------- kimlik ve yetki ---------- */
/** Oturumdan kişi: yönetim (rol tam / ogrenci) ya da hoca (birim üyesi olabilir). */
function birimKim_(oturum) {
  var o = oturum_(oturum);
  if (o.yon) return { yon: true, rol: o.rol || 'tam', ad: o.ad || 'yönetim', e: o.e || '' };
  if (!o.hid || !S.hoca[o.hid]) throw new Error('OTURUM');
  return { yon: false, ad: S.hoca[o.hid].ad + (o.adm ? ' (yönetim adına)' : ''), e: epN_(S.hoca[o.hid].eposta), hid: o.hid };
}
/** Bir birimde erişim: gor, yonetici (yönetim ya da İnci Aras/Öğrenci Birimi), lv (DİSB üyesinin düzeyi). */
function birimErisim_(kim, b) {
  if (kim.yon) { var y = kim.rol === 'tam' || (kim.rol === 'ogrenci' && b.id === 'ogr'); return { gor: y, yonetici: y, lv: '' }; }
  var u = birimUyeleri_(b).filter(function (x) { return x.e === kim.e; })[0];
  return u ? { gor: true, yonetici: false, lv: u.lv } : { gor: false, yonetici: false, lv: '' };
}
/** Hocanın üyesi olduğu birimler (hoca menüsünde sekmenin görünmesi için). */
function birimlerim_(eposta) { var e = epN_(eposta); return BIRIMLER.filter(function (b) { return b.uye.some(function (u) { return u[1] + BIRIM_ALAN === e; }); }).map(function (b) { return b.ad; }); }

/* ---------- tablolar ---------- */
var BS_DOSYA = ['Kimlik', 'Birim', 'Düzey', 'Etiket', 'Dosya adı', 'Tür', 'Boyut (KB)', 'Yükleyen', 'Yükleyen e-posta', 'Zaman', 'Tarih', 'Dönem', 'Durum', 'Kaldıran', 'Kaldırma tarihi'];
var BS_MESAJ = ['Kimlik', 'Birim', 'Zaman', 'Tarih', 'Gönderen', 'Gönderen e-posta', 'Yönetim', 'Hedef', 'Üst', 'Metin'];
var BS_INDIR = ['Zaman', 'Tarih', 'Ad', 'E-posta', 'Birim', 'Dosya kimliği', 'Dosya adı'];
function bSayfa_(ad, bas) { var sh = sayfa_(ad) || ss_().insertSheet(ad); if (sh.getLastRow() < 1) sh.appendRow(bas); return sh; }
function bOku_(ad, bas) {
  var sh = bSayfa_(ad, bas), v = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, bas.length).getValues() : [];
  return v.map(function (r, i) { var o = { _satir: i + 2 }; bas.forEach(function (h, j) { o[h] = r[j]; }); return o; });
}
function bTarih_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'dd.MM.yyyy HH:mm'); }
function bKilit_(fn) { var l = LockService.getScriptLock(); if (!l.tryLock(25000)) throw new Error('MESGUL: Sistem şu an yoğun; tekrar deneyin.'); try { return fn(); } finally { l.releaseLock(); } }

/* ---------- Drive ---------- */
function bKokKlasor_() {
  var P = PropertiesService.getScriptProperties(), id = P.getProperty('birimKlasor');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var k = DriveApp.createFolder('YDYO Birim Çalışmaları (sistem – paylaşmayın)'); P.setProperty('birimKlasor', k.getId()); return k;
}
function bAltKlasor_(ust, ad) { var it = ust.getFoldersByName(ad); return it.hasNext() ? it.next() : ust.createFolder(ad); }
function bBirimKlasor_(b) { return bAltKlasor_(bKokKlasor_(), b.ad); }

/* ---------- görünüm ---------- */
function bDosyaGorur_(er, b, d) { return er.yonetici || !b.duzeyli || d['Düzey'] === 'Ortak' || d['Düzey'] === er.lv; }
function bMesajGorur_(er, kim, m) {
  if (er.yonetici) return true; var h = String(m['Hedef']);
  return h === 'birim' || (er.lv && h === 'duzey:' + er.lv) || h === 'hoca:' + kim.e || epN_(m['Gönderen e-posta']) === kim.e;
}
function bDosyaV_(d, kim, er) {
  return { id: d['Kimlik'], lv: d['Düzey'], etiket: d['Etiket'], ad: d['Dosya adı'], kb: d['Boyut (KB)'], kim: d['Yükleyen'], tarih: d['Tarih'], donem: d['Dönem'],
    kaldirabilir: er.yonetici || epN_(d['Yükleyen e-posta']) === kim.e, ortakYap: er.yonetici && b_duzeyli_(d['Birim']) };
}
function b_duzeyli_(bid) { var b = birimBul_(bid); return !!(b && b.duzeyli); }
function hedefAd_(b, h) { h = String(h); if (h === 'birim') return 'Tüm ' + b.ad; if (h.indexOf('duzey:') === 0) return h.slice(6) + ' düzeyi'; if (h.indexOf('hoca:') === 0) { var u = birimUyeleri_(b).filter(function (x) { return x.e === h.slice(5); })[0]; return u ? u.ad : h.slice(5); } return h; }

/** Bir kişinin gördüğü birim çalışmaları ekranı. */
function birimGorunum_(kim) {
  var simdi = donemOf_(Date.now()), D = bOku_('Birim Dosyaları', BS_DOSYA), M = bOku_('Birim Mesajları', BS_MESAJ), I = null;
  var out = [];
  BIRIMLER.forEach(function (b) {
    var er = birimErisim_(kim, b); if (!er.gor) return;
    var bd = D.filter(function (d) { return d['Birim'] === b.id && bDosyaGorur_(er, b, d); });
    var aktif = bd.filter(function (d) { return d['Durum'] === 'aktif'; }).sort(function (x, y) { return y['Zaman'] - x['Zaman']; });
    var bm = M.filter(function (m) { return m['Birim'] === b.id && bMesajGorur_(er, kim, m); });
    var kok = bm.filter(function (m) { return !m['Üst']; }).sort(function (x, y) { return y['Zaman'] - x['Zaman']; }).map(function (m) {
      return { id: m['Kimlik'], tarih: m['Tarih'], kim: m['Gönderen'], hedef: hedefAd_(b, m['Hedef']), hedefKod: er.yonetici ? String(m['Hedef']) : '', metin: m['Metin'], yon: m['Yönetim'] === 'evet',
        yanit: bm.filter(function (y) { return y['Üst'] === m['Kimlik']; }).sort(function (x, y) { return x['Zaman'] - y['Zaman']; })
          .map(function (y) { return { tarih: y['Tarih'], kim: y['Gönderen'], ke: epN_(y['Gönderen e-posta']), metin: y['Metin'], yon: y['Yönetim'] === 'evet', hedef: hedefAd_(b, y['Hedef']) }; }) }; });
    var v = { id: b.id, ad: b.ad, duzeyli: b.duzeyli, etiket: b.etiket, lv: er.lv, yonetici: er.yonetici, donem: simdi,
      dosyalar: aktif.filter(function (d) { return d['Dönem'] === simdi; }).map(function (d) { return bDosyaV_(d, kim, er); }),
      arsiv: aktif.filter(function (d) { return d['Dönem'] !== simdi; }).map(function (d) { return bDosyaV_(d, kim, er); }),
      mesajlar: kok, uyeler: er.yonetici ? birimUyeleri_(b).map(function (u) { return { ad: u.ad, e: u.e, lv: u.lv, sistemde: !!hocaByKey_(u.e) }; }) : [] };
    if (er.yonetici) {
      if (!I) I = bOku_('Birim İndirmeleri', BS_INDIR);
      v.kaldirilan = bd.filter(function (d) { return d['Durum'] !== 'aktif'; }).map(function (d) { return { ad: d['Dosya adı'], lv: d['Düzey'], etiket: d['Etiket'], kim: d['Yükleyen'], kaldiran: d['Kaldıran'], tarih: d['Kaldırma tarihi'] }; });
      v.indirmeler = I.filter(function (x) { return x['Birim'] === b.id; }).sort(function (x, y) { return y['Zaman'] - x['Zaman']; }).slice(0, 200)
        .map(function (x) { return { tarih: x['Tarih'], ad: x['Ad'], dosya: x['Dosya adı'] }; });
    }
    out.push(v);
  });
  return { birimler: out, ben: kim.ad, benE: kim.e, maxMb: BIRIM_MAX_MB, duzeyler: BIRIM_DUZEYLER, tam: !!(kim.yon && kim.rol === 'tam') };
}

/* ---------- bildirim ---------- */
/** Yönetim dosya/mesaj → ilgili üyeler; üye dosya/yanıt → yönetim adresleri. */
function bAlicilar_(kim, b, er, hedef) {
  if (!er.yonetici) return birimYonetimAlicilari_(b.id).filter(function (e) { return e !== kim.e; });
  return birimUyeleri_(b).filter(function (u) {
    if (hedef === 'birim' || hedef === 'Ortak' || hedef === '' || hedef == null) return true;
    if (hedef.indexOf('duzey:') === 0) return u.lv === hedef.slice(6);
    if (hedef.indexOf('hoca:') === 0) return u.e === hedef.slice(5);
    return u.lv === hedef;   // DİSB dosyası: düzey adı
  }).map(function (u) { return u.e; }).filter(function (e) { return e !== kim.e; });
}
function bBildir_(alicilar, konu, metin) {
  var n = 0, a = ayarlar_(), url = uygulamaAdresi_();
  alicilar.forEach(function (e) { try { if (MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail(e, konu, metin + '\n\nSınav Portalı: ' + url + ' ("Hoca" düğmesi › Birim çalışmaları)\n\nBu ileti otomatik gönderilmiştir.', postaSecenek_()); n++; } catch (x) { } });
  return n;
}
function bAdlar_(alicilar) { return alicilar.map(function (e) { var t = hocaByKey_(e); if (t) return S.hoca[t].ad; var yk = typeof yonKul_ === 'function' ? yonKul_(e) : null; return yk ? yk.ad : e; }); }

/* ---------- API ---------- */
function apiBirim(oturum) {
  try { S = durumOku_(); var kim = birimKim_(oturum); return birimGorunum_(kim); }
  catch (e) { if (/OTURUM/.test(e.message)) return { err: 'OTURUM' }; throw e; }
}
function apiBirimIslem(oturum, islem, a) {
  a = a || {}; var kim;
  try { S = durumOku_(); kim = birimKim_(oturum); } catch (e) { return { err: 'OTURUM' }; }
  var b = birimBul_(a.birim); if (!b) return { hata: 'Birim bulunamadı.' };
  var er = birimErisim_(kim, b); if (!er.gor) return { hata: 'Bu birime erişiminiz yok.' };
  var sonuc = function (mesaj, ek) { var r = { mesaj: mesaj || '', v: birimGorunum_(kim) }; for (var k in ek || {}) r[k] = ek[k]; return r; };

  if (islem === 'bildirimOnizle') {   // yönetim: bildirimin kime gideceği (gönderimden önce onay için)
    if (!er.yonetici) return { hata: 'Yetkiniz yok.' };
    var al = bAlicilar_(kim, b, er, a.hedef || 'birim'); return { alicilar: bAdlar_(al), n: al.length };
  }
  if (islem === 'yukle') {
    var ad = String(a.ad || '').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 150), et = String(a.etiket || '');
    if (!ad || !a.b64) return { hata: 'Dosya seçin.' };
    if (b.etiket.indexOf(et) < 0) return { hata: 'Etiket seçmek zorunludur.' };
    var bayt = Math.floor(String(a.b64).length * 3 / 4); if (bayt > BIRIM_MAX_MB * 1048576) return { hata: 'Dosya ' + BIRIM_MAX_MB + ' MB\'tan büyük olamaz.' };
    var lv = '';
    if (b.duzeyli) { lv = er.yonetici ? String(a.lv || '') : er.lv; if (!er.yonetici && !lv) return { hata: 'Düzeyiniz tanımlı değil.' };
      if (er.yonetici && lv !== 'Ortak' && BIRIM_DUZEYLER.indexOf(lv) < 0) return { hata: 'Düzey seçin (ya da Ortak).' }; }
    var blob = Utilities.newBlob(Utilities.base64Decode(a.b64), a.tur || 'application/octet-stream', ad), f = bBirimKlasor_(b).createFile(blob);
    var now = Date.now(), satir = [f.getId(), b.id, lv, et, ad, a.tur || '', Math.max(1, Math.round(bayt / 1024)), kim.ad, kim.e, now, bTarih_(now), donemOf_(now), 'aktif', '', ''];
    bKilit_(function () { bSayfa_('Birim Dosyaları', BS_DOSYA).appendRow(satir); });
    var al2 = er.yonetici ? (a.bildir ? bAlicilar_(kim, b, er, b.duzeyli ? lv : 'birim') : []) : bAlicilar_(kim, b, er);
    var n = al2.length ? bBildir_(al2, 'Birim çalışmaları – yeni dosya (' + b.ad + ')', kim.ad + ', ' + b.ad + (lv ? ' (' + lv + ')' : '') + ' bölümüne yeni bir dosya yükledi: ' + ad + ' [' + et + '].') : 0;
    return sonuc(ad + ' yüklendi.' + (n ? ' Bildirim: ' + n + ' kişi.' : ''));
  }
  var D = function () { return bOku_('Birim Dosyaları', BS_DOSYA).filter(function (d) { return d['Kimlik'] === a.id && d['Birim'] === b.id; })[0]; };
  if (islem === 'indir') {
    var d = D(); if (!d || d['Durum'] !== 'aktif' || !bDosyaGorur_(er, b, d)) return { hata: 'Dosya bulunamadı ya da erişiminiz yok.' };
    var fb = DriveApp.getFileById(d['Kimlik']).getBlob(), now2 = Date.now();
    bKilit_(function () { bSayfa_('Birim İndirmeleri', BS_INDIR).appendRow([now2, bTarih_(now2), kim.ad, kim.e, b.id, d['Kimlik'], d['Dosya adı']]); });
    return { ad: d['Dosya adı'], tur: d['Tür'] || fb.getContentType(), b64: Utilities.base64Encode(fb.getBytes()) };
  }
  if (islem === 'kaldir') {
    var d2 = D(); if (!d2 || d2['Durum'] !== 'aktif' || !bDosyaGorur_(er, b, d2)) return { hata: 'Dosya bulunamadı.' };
    if (!er.yonetici && epN_(d2['Yükleyen e-posta']) !== kim.e) return { hata: 'Dosyayı yalnız yükleyen ve yönetim kaldırabilir.' };
    try { var fl = DriveApp.getFileById(d2['Kimlik']); fl.moveTo(bAltKlasor_(bBirimKlasor_(b), 'eski versiyonlar')); } catch (x) { }
    var now3 = Date.now();
    bKilit_(function () { var sh = bSayfa_('Birim Dosyaları', BS_DOSYA); sh.getRange(d2._satir, 13, 1, 3).setValues([['kaldırıldı', kim.ad, bTarih_(now3)]]); });
    return sonuc(d2['Dosya adı'] + ' kaldırıldı ("eski versiyonlar" klasörüne taşındı).');
  }
  if (islem === 'ortak') {   // yalnız yönetim: DİSB dosyasını Ortak yap / düzeyine geri al
    if (!er.yonetici || !b.duzeyli) return { hata: 'Yetkiniz yok.' };
    var d3 = D(); if (!d3) return { hata: 'Dosya bulunamadı.' };
    var yeni = a.lv === 'Ortak' ? 'Ortak' : (BIRIM_DUZEYLER.indexOf(a.lv) >= 0 ? a.lv : null); if (!yeni) return { hata: 'Düzey seçin.' };
    bKilit_(function () { bSayfa_('Birim Dosyaları', BS_DOSYA).getRange(d3._satir, 3).setValue(yeni); });
    return sonuc(d3['Dosya adı'] + ': ' + (yeni === 'Ortak' ? 'Ortak yapıldı.' : yeni + ' düzeyine alındı.'));
  }
  if (islem === 'mesaj' || islem === 'yanit') {
    var metin = String(a.metin || '').trim().slice(0, 4000); if (!metin) return { hata: 'Mesaj yazın.' };
    var hedef = 'birim', ust = '';
    if (islem === 'mesaj') {
      if (!er.yonetici) return { hata: 'Yeni mesajı yönetim gönderir; siz gelen mesajlara yanıt verebilirsiniz.' };
      hedef = String(a.hedef || 'birim');
      if (hedef !== 'birim' && !(b.duzeyli && /^duzey:(A|B|C|D2|D1)$/.test(hedef)) && !(hedef.indexOf('hoca:') === 0 && birimUyeleri_(b).some(function (u) { return 'hoca:' + u.e === hedef; }))) return { hata: 'Alıcı seçin.' };
    } else {
      var M = bOku_('Birim Mesajları', BS_MESAJ), kok = M.filter(function (m) { return m['Kimlik'] === a.ust && m['Birim'] === b.id && !m['Üst']; })[0];
      if (!kok || !bMesajGorur_(er, kim, kok)) return { hata: 'Mesaj bulunamadı.' };
      ust = kok['Kimlik'];
      hedef = er.yonetici ? (a.kime ? 'hoca:' + epN_(a.kime) : String(kok['Hedef'])) : 'yonetim';
    }
    var now4 = Date.now(), id = 'm' + now4.toString(36) + Math.floor(Math.random() * 1296).toString(36);
    bKilit_(function () { bSayfa_('Birim Mesajları', BS_MESAJ).appendRow([id, b.id, now4, bTarih_(now4), kim.ad, kim.e, er.yonetici ? 'evet' : '', hedef, ust, metin]); });
    var al3 = er.yonetici ? (a.bildir ? bAlicilar_(kim, b, er, hedef) : []) : bAlicilar_(kim, b, er);
    var n2 = al3.length ? bBildir_(al3, 'Birim çalışmaları – ' + (er.yonetici ? 'yeni mesaj' : 'yanıt') + ' (' + b.ad + ')', kim.ad + ' ' + (er.yonetici ? 'birim çalışmaları sekmesinde size bir mesaj gönderdi' : 'bir mesaja yanıt verdi') + ':\n\n' + metin) : 0;
    return sonuc((islem === 'mesaj' ? 'Mesaj gönderildi.' : 'Yanıtınız gönderildi.') + (n2 ? ' Bildirim: ' + n2 + ' kişi.' : ''));
  }
  return { hata: 'Bilinmeyen işlem.' };
}

/* ---------- birim üyelerini sisteme ekleme (yönetim) ---------- */
/** Hocalar listesinde olmayan birim üyelerini (ör. Dönem İçi Sınav Birimi'nin 10 üyesi) sisteme ekler: S.hocaEk + geçici şifre.
 *  Hocalar sayfasına ve sınav görevlerine dokunmaz; giriş bilgileri "E-posta önizleme" ile (MehDer onayıyla) gönderilir. */
function birimUyeEkle_() {
  S.hocaEk = S.hocaEk || {}; var eklenen = [];
  BIRIMLER.forEach(function (b) { birimUyeleri_(b).forEach(function (u) {
    if (hocaByKey_(u.e)) return;
    var n = 1; while (S.hoca['BU' + n] || S.hocaEk['BU' + n]) n++; var id = 'BU' + n;
    S.hocaEk[id] = { ad: u.ad, eposta: u.e, tel: '', sonuc: [], siniflar: [], birim: true };
    S.hoca[id] = S.hocaEk[id]; S.gorev[id] = S.gorev[id] || [];
    S.auth[id] = { token: rastgele_(24), temp: rastgele_(8), salt: rastgele_(16), hash: null, fails: [], lockUntil: 0, firstAt: null, cihaz: [] };
    eklenen.push(u.ad);
  }); });
  if (eklenen.length) { mlog('Birim üyeleri sisteme eklendi: ' + eklenen.join(', ') + '.'); baglantiListesiYaz_(); }
  return eklenen;
}
/** durumOku_ sonrası: yalnız birim için eklenen hocalar (değişken kısımda) hoca listesine katılır. */
function hocaEkUygula_(d) { if (d && d.hocaEk && d.hoca) for (var id in d.hocaEk) { d.hoca[id] = d.hocaEk[id]; if (d.gorev && !d.gorev[id]) d.gorev[id] = []; } return d; }
/* ======================= Sinav.gs ======================= */
/* =====================================================================================
 * Yeni sınav: ayarlar, öğrenci/aday listesi ve derslikler (12 tablosu bölüm Q–R; MehDer 17.11.2026)
 * - Yalnız "bütün yönetim" rolü (Mehmet Duranlıoğlu, Mehmet Gönen, İlknur İstifçi) görür ve düzenler.
 * - Kayıtlar sınav günü durumundan (S) ayrı tablo sayfalarında: "Sınavlar", "Sınav Adayları", "Derslikler".
 * - Yönetim ayarları yapar ve "Sınav hazır, Claude'a gönder" der; görev dağılımı, kurulum ve dosyaları Claude yapar.
 * ===================================================================================== */
var SINAV_TURLER = [
  { id: 'ara1', ad: 'Birinci Ara Sınav', birim: 'disb', hazirlik: true },
  { id: 'donemsonu', ad: 'Dönem Sonu Sınavı', birim: 'disb', hazirlik: true },
  { id: 'yds', ad: 'Yabancı Dil Sınavı (YDS)', birim: 'yet', hazirlik: false },
  { id: 'ydsbut', ad: 'YDS Bütünleme Sınavı', birim: 'yet', hazirlik: false },
  { id: 'yeterlik', ad: 'Yeterlik Sınavı', birim: 'yet', hazirlik: false },
  { id: 'erasmus', ad: 'Erasmus Sınavı', birim: 'yet', hazirlik: false }
];
var SINAV_BOLUM = [['cs', 'Çoktan seçmeli test'], ['yazma', 'Yazma'], ['konusma', 'Konuşma'], ['grading', 'Writing grading']];
var SINAV_DUZEY = ['A', 'B', 'C', 'D2', 'D1'];
var SS_SINAV = ['Kimlik', 'Ad', 'Tür', 'Birim', 'Dönem', 'Durum', 'Oluşturan', 'Oluşturma', 'Güncelleyen', 'Güncelleme', 'Hazır bildiren', 'Hazır tarihi', 'Ayarlar (JSON)', 'Geçmiş (JSON)'];
var SS_ADAY = ['Sınav', 'No', 'Ad Soyad', 'Sınıf', 'Düzey'];
var SS_DERSLIK = ['Derslik', 'Bina', 'Kat', 'Normal kapasite', 'Sınav kapasitesi', 'Ders yapan sınıf', 'Not', 'Durum'];
var TERCIH_AD = { yok: 'Görev verme', az: 'Az', normal: 'Normal', cok: 'Çok', yalniz: 'Yalnız şu görev', gunyok: 'O gün yok' };

function turBul_(id) { for (var i = 0; i < SINAV_TURLER.length; i++) if (SINAV_TURLER[i].id === id) return SINAV_TURLER[i]; return null; }
function sTarih_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'dd.MM.yyyy HH:mm'); }
function sBugun_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function gunFark_(a, b) { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000); }
function tarihMi_(t) { return /^\d{4}-\d{2}-\d{2}$/.test(String(t || '')); }
function saatMi_(t) { return /^\d{2}:\d{2}$/.test(String(t || '')); }
function trTarih_(t) { return tarihMi_(t) ? t.slice(8, 10) + '.' + t.slice(5, 7) + '.' + t.slice(0, 4) : ''; }
function sKim_(oturum) {
  var o = oturum_(oturum); if (!o.yon) throw new Error('OTURUM');
  if (o.rol && o.rol !== 'tam') throw new Error('YETKI');
  return { ad: o.ad && o.ad !== 'yönetim' ? o.ad : 'yönetim', e: o.e || '' };
}

/* ---------- varsayılan ayarlar ---------- */
function sinavVarsayilan_(tur) {
  var t = turBul_(tur), h = t.hazirlik, saat = h ? '' : '10:00';
  var bol = function () { return { var: true, oturum: [{ tarih: '', saat: saat, lv: h ? [] : ['Tek'] }] }; };
  return {
    duzeyler: h ? SINAV_DUZEY.slice() : [],
    bolum: { cs: bol(), yazma: bol(), konusma: { var: true, oturum: [{ tarih: '', saat: h ? '13:30' : '10:00', lv: h ? [] : ['Tek'], kul: 1 }] },
      grading: { var: true, first: '', second: '', ucuncu: '' } },
    konusma: { kendiHoca: h ? 'bos' : 'fark', es: h ? 'ayni' : 'fark', erken: false, anket: true, yedekOran: 20 },
    yazma: { dinlemeDk: 15, gozetmenFirst: true, secondSali: h, capraz: true },
    gorev: { gunluk: 2, yedekYuzde: 4, yedekMin: 4, juriAyniDuzey: h, tercih: {} },
    derslik: { sira: 'no', cs: [], yazma: [], konusma: [] }
  };
}

/* ---------- tablolar ---------- */
function sinavSatirlari_() { return bOku_('Sınavlar', SS_SINAV); }
function sinavOku_(id) {
  var r = sinavSatirlari_().filter(function (x) { return x['Kimlik'] === id; })[0]; if (!r) return null;
  var cfg = {}, gec = []; try { cfg = JSON.parse(r['Ayarlar (JSON)'] || '{}'); } catch (e) { } try { gec = JSON.parse(r['Geçmiş (JSON)'] || '[]'); } catch (e) { }
  var rev = Number(cfg._rev) || 0; delete cfg._rev;
  return { rev: rev, satir: r._satir, id: r['Kimlik'], ad: r['Ad'], tur: r['Tür'], birim: r['Birim'], donem: r['Dönem'], durum: r['Durum'], olusturan: r['Oluşturan'], olusturma: r['Oluşturma'],
    guncelleyen: r['Güncelleyen'], guncelleme: r['Güncelleme'], hazirKim: r['Hazır bildiren'], hazirT: r['Hazır tarihi'], cfg: cfg, gecmis: gec };
}
function sinavYaz_(s) {
  var sh = bSayfa_('Sınavlar', SS_SINAV);
  s.rev = (Number(s.rev) || 0) + 1; var c = JSON.parse(JSON.stringify(s.cfg)); c._rev = s.rev;
  var row = [s.id, s.ad, s.tur, s.birim, s.donem, s.durum, s.olusturan, s.olusturma, s.guncelleyen, s.guncelleme, s.hazirKim || '', s.hazirT || '', JSON.stringify(c), JSON.stringify(s.gecmis.slice(-60))];
  if (s.satir) sh.getRange(s.satir, 1, 1, row.length).setValues([row]); else { sh.appendRow(row); s.satir = sh.getLastRow(); }
}
function sGecmis_(s, kim, metin) { s.gecmis.push([sTarih_(Date.now()), kim.ad, metin]); s.guncelleyen = kim.ad; s.guncelleme = sTarih_(Date.now()); }
function adaylarOku_(id) { return bOku_('Sınav Adayları', SS_ADAY).filter(function (r) { return r['Sınav'] === id; }).map(function (r) { return { no: String(r['No']), ad: r['Ad Soyad'], cls: r['Sınıf'] || '', lv: r['Düzey'] || '' }; }); }
function adaylarYaz_(id, L) {
  var sh = bSayfa_('Sınav Adayları', SS_ADAY), digerleri = bOku_('Sınav Adayları', SS_ADAY).filter(function (r) { return r['Sınav'] !== id; })
    .map(function (r) { return SS_ADAY.map(function (h) { return r[h]; }); });
  var rows = digerleri.concat(L.map(function (a) { return [id, a.no, a.ad, a.cls, a.lv]; }));
  sh.clearContents(); sh.appendRow(SS_ADAY); if (rows.length) sh.getRange(2, 1, rows.length, SS_ADAY.length).setValues(rows);
}
function derslikHavuzu_() {
  return bOku_('Derslikler', SS_DERSLIK).map(function (r) { return { ad: String(r['Derslik']).trim(), bina: r['Bina'] || '', kat: r['Kat'] === '' || r['Kat'] == null ? '' : String(r['Kat']),
    kap: Number(r['Normal kapasite']) || 0, skap: Number(r['Sınav kapasitesi']) || 0, sinif: String(r['Ders yapan sınıf'] || ''), not: r['Not'] || '', durum: r['Durum'] || 'aktif' }; })
    .filter(function (d) { return d.ad; });
}
function derslikYaz_(L) {
  var sh = bSayfa_('Derslikler', SS_DERSLIK), rows = L.map(function (d) { return [d.ad, d.bina, d.kat, d.kap || '', d.skap || '', d.sinif, d.not, d.durum || 'aktif']; });
  sh.clearContents(); sh.appendRow(SS_DERSLIK); if (rows.length) sh.getRange(2, 1, rows.length, SS_DERSLIK.length).setValues(rows);
}
/** Varsayılan kat: Z-01 → Zemin, 1xx → 1, 2xx → 2. */
function katTahmin_(ad) { ad = String(ad); if (/^Z/i.test(ad)) return 'Zemin'; var m = ad.match(/^(\d)\d\d/); return m ? m[1] : ''; }

/* ---------- ayarların temizlenmesi (istemciden gelen her şey doğrulanır) ---------- */
function sTemizle_(tur, c) {
  var t = turBul_(tur), v = sinavVarsayilan_(tur), out = v; c = c || {};
  var lvOk = function (L) { return (L || []).filter(function (x) { return t.hazirlik ? SINAV_DUZEY.indexOf(x) >= 0 : x === 'Tek'; }); };
  if (t.hazirlik) out.duzeyler = lvOk(c.duzeyler);
  ['cs', 'yazma', 'konusma'].forEach(function (k) {
    var b = (c.bolum || {})[k]; if (!b) return;
    out.bolum[k].var = !!b.var;
    out.bolum[k].oturum = (b.oturum || []).slice(0, 12).map(function (o) { var r = { tarih: tarihMi_(o.tarih) ? o.tarih : '', saat: saatMi_(o.saat) ? o.saat : '', lv: t.hazirlik ? lvOk(o.lv) : ['Tek'] };
      if (k === 'konusma') r.kul = [1, 2, 3].indexOf(Number(o.kul)) >= 0 ? Number(o.kul) : 1; return r; });
    if (!out.bolum[k].oturum.length) out.bolum[k].oturum = v.bolum[k].oturum;
  });
  var g = (c.bolum || {}).grading || {}; out.bolum.grading = { var: g.var !== false, first: tarihMi_(g.first) ? g.first : '', second: tarihMi_(g.second) ? g.second : '', ucuncu: tarihMi_(g.ucuncu) ? g.ucuncu : '' };
  var k = c.konusma || {};
  out.konusma = { kendiHoca: ['asla', 'bos', 'fark'].indexOf(k.kendiHoca) >= 0 ? k.kendiHoca : v.konusma.kendiHoca, es: ['ayni', 'fark', 'farkli'].indexOf(k.es) >= 0 ? k.es : v.konusma.es,
    erken: !!k.erken, anket: k.anket !== false, yedekOran: Math.max(5, Math.min(60, Number(k.yedekOran) || 20)) };
  if (!t.hazirlik) { out.konusma.kendiHoca = 'fark'; out.konusma.es = 'fark'; }
  var y = c.yazma || {};
  out.yazma = { dinlemeDk: Math.max(0, Math.min(60, Number(y.dinlemeDk) || 0)), gozetmenFirst: y.gozetmenFirst !== false, secondSali: t.hazirlik && y.secondSali !== false, capraz: y.capraz !== false };
  var gr = c.gorev || {}, tr = {};
  for (var hid in gr.tercih || {}) { var x = gr.tercih[hid] || {}; if (!S.hoca[hid] || !TERCIH_AD[x.t] || x.t === 'normal') continue; tr[hid] = { t: x.t, not: String(x.not || '').slice(0, 120) }; }
  out.gorev = { gunluk: Math.max(1, Math.min(6, Number(gr.gunluk) || 2)), yedekYuzde: Math.max(0, Math.min(30, Number(gr.yedekYuzde) || 0)), yedekMin: Math.max(0, Math.min(30, Number(gr.yedekMin) || 0)),
    juriAyniDuzey: t.hazirlik && gr.juriAyniDuzey !== false, tercih: tr };
  var d = c.derslik || {}, adlar = {}; derslikHavuzu_().forEach(function (x) { adlar[x.ad] = 1; });
  var dOk = function (x) { return adlar[x] ? x : ''; };
  out.derslik = { sira: d.sira === 'alfabe' ? 'alfabe' : 'no', cs: [], yazma: [], konusma: [] };
  ['cs', 'yazma'].forEach(function (b) { out.derslik[b] = out.bolum[b].oturum.map(function (o, i) { var e = (d[b] || [])[i] || {}, at = {};
    for (var gk in e.atama || {}) { var dv = dOk(e.atama[gk]); if (dv) at[String(gk).slice(0, 20)] = dv; }
    return { atama: at, secili: (e.secili || []).map(dOk).filter(String).filter(function (x, j, A) { return A.indexOf(x) === j; }) }; }); });
  out.derslik.konusma = (d.konusma || []).slice(0, 40).map(function (e) { var oi = Number(e.oi) || 0; if (!out.bolum.konusma.oturum[oi]) return null;
    var lv = t.hazirlik ? (SINAV_DUZEY.indexOf(e.lv) >= 0 ? e.lv : '') : 'Tek'; if (!lv) return null;
    var n = Math.max(0, Math.min(40, Number(e.juri) || 0));
    return { oi: oi, lv: lv, juri: n, derslikler: (e.derslikler || []).slice(0, 40).map(dOk), bekleme: String(e.bekleme || '').slice(0, 60), kayit: String(e.kayit || '').slice(0, 60), tv: String(e.tv || '').slice(0, 60) }; })
    .filter(Boolean);
  return out;
}

/* ---------- gruplar ve dağılım ---------- */
/** Bir yazma/ÇS oturumundaki gruplar: hazırlıkta sınıflar (düzeyi oturumda olan), Yeterlik sınavlarında tek grup "Adaylar". */
function oturumGruplari_(t, o, adaylar) {
  if (!t.hazirlik) return [{ g: 'Adaylar', n: adaylar.length, lv: 'Tek' }];
  var m = {}; adaylar.forEach(function (a) { if ((o.lv || []).indexOf(a.lv) < 0 || !a.cls) return; (m[a.cls] = m[a.cls] || { g: a.cls, n: 0, lv: a.lv }).n++; });
  return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, 'tr', { numeric: true }); }).map(function (k) { return m[k]; });
}
/** Yeterlik sınavları: adaylar seçili dersliklere sınav kapasitesine göre (numara ya da alfabe sırasıyla) bölünür. */
function yeterlikDagilim_(adaylar, secili, havuz, sira) {
  var H = {}; havuz.forEach(function (d) { H[d.ad] = d; });
  var L = adaylar.slice().sort(function (a, b) { return sira === 'alfabe' ? String(a.ad).localeCompare(String(b.ad), 'tr') : String(a.no).localeCompare(String(b.no), 'tr', { numeric: true }); });
  var kap = secili.map(function (d) { return (H[d] && (H[d].skap || H[d].kap)) || 0; }), top = kap.reduce(function (a, b) { return a + b; }, 0);
  var n = L.length, pay;
  if (!secili.length) return { dagilim: [], kalan: n };
  if (top <= 0) { var q = Math.floor(n / secili.length), r = n % secili.length; pay = secili.map(function (x, i) { return q + (i < r ? 1 : 0); }); }
  else if (top >= n) {   // kapasite yeterliyse dersliklere kapasiteleri oranında, dengeli
    pay = kap.map(function (k) { return Math.floor(n * k / top); }); var art = n - pay.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; art > 0; i = (i + 1) % pay.length) if (pay[i] < kap[i]) { pay[i]++; art--; }
  } else pay = kap.slice();
  var out = [], p = 0;
  secili.forEach(function (d, i) { var dil = L.slice(p, p + pay[i]); p += pay[i];
    out.push({ derslik: d, kap: kap[i], n: dil.length, ilk: dil.length ? (sira === 'alfabe' ? dil[0].ad : dil[0].no) : '', son: dil.length ? (sira === 'alfabe' ? dil[dil.length - 1].ad : dil[dil.length - 1].no) : '' }); });
  return { dagilim: out, kalan: n - p };
}

/* ---------- kontroller ---------- */
function sinavKontrol_(s, adaylar, havuz) {
  var t = turBul_(s.tur), c = s.cfg, H = {}, hata = [], uyari = [];
  havuz.forEach(function (d) { H[d.ad] = d; });
  var kap = function (d) { return H[d] ? (H[d].skap || H[d].kap || 0) : 0; };
  // ayarlar
  var tarihli = [];
  ['cs', 'yazma', 'konusma'].forEach(function (b) { var B = c.bolum[b]; if (!B.var) return; var ad = SINAV_BOLUM.filter(function (x) { return x[0] === b; })[0][1];
    B.oturum.forEach(function (o, i) { var e = ad + (B.oturum.length > 1 ? ' ' + (i + 1) + '. oturum' : '');
      if (!o.tarih) hata.push(e + ': tarih girilmedi.'); else tarihli.push(o.tarih);
      if (!o.saat) hata.push(e + ': başlama saati girilmedi.');
      if (t.hazirlik && !o.lv.length) hata.push(e + ': düzey seçilmedi.'); }); });
  if (t.hazirlik) { var kapsam = {}; ['cs', 'yazma', 'konusma'].forEach(function (b) { if (c.bolum[b].var) c.bolum[b].oturum.forEach(function (o) { o.lv.forEach(function (l) { kapsam[b + l] = 1; }); }); });
    c.duzeyler.forEach(function (l) { ['cs', 'yazma', 'konusma'].forEach(function (b) { if (c.bolum[b].var && !kapsam[b + l]) uyari.push(l + ' düzeyi ' + SINAV_BOLUM.filter(function (x) { return x[0] === b; })[0][1].toLowerCase() + ' oturumlarının hiçbirinde yok.'); }); }); }
  if (c.bolum.grading.var && !c.bolum.grading.first) uyari.push('Writing grading: first grader teslim tarihi girilmedi.');
  // liste
  if (!adaylar.length) hata.push(t.hazirlik ? 'Öğrenci listesi yüklenmedi.' : 'Aday listesi yüklenmedi.');
  if (t.hazirlik) { var lvYok = adaylar.filter(function (a) { return c.duzeyler.indexOf(a.lv) < 0; }).length; if (lvYok) uyari.push(lvYok + ' öğrencinin düzeyi sınavın düzeyleri arasında değil (sınava alınmaz).');
    var sinifsiz = adaylar.filter(function (a) { return !a.cls; }).length; if (sinifsiz) hata.push(sinifsiz + ' öğrencinin sınıfı yok.'); }
  // derslikler
  var kullanim = {};   // tarih|saat|derslik → [kim]
  var kullan = function (tarih, saat, d, kim) { if (!tarih || !d) return; var k = tarih + '|' + saat + '|' + d; (kullanim[k] = kullanim[k] || []).push(kim); };
  ['cs', 'yazma'].forEach(function (b) { var B = c.bolum[b]; if (!B.var) return; var ad = SINAV_BOLUM.filter(function (x) { return x[0] === b; })[0][1];
    B.oturum.forEach(function (o, i) { var e = ad + (B.oturum.length > 1 ? ' ' + (i + 1) + '. oturum' : ''), D = c.derslik[b][i] || { atama: {}, secili: [] };
      if (t.hazirlik) {
        var gr = oturumGruplari_(t, o, adaylar), yuk = {};
        gr.forEach(function (g) { var d = D.atama[g.g]; if (!d) { hata.push(e + ': ' + g.g + ' grubuna derslik atanmadı.'); return; }
          yuk[d] = (yuk[d] || 0) + g.n; kullan(o.tarih, o.saat, d, e + ' ' + g.g); if (H[d] && H[d].durum !== 'aktif') hata.push(e + ': ' + d + ' dersliği pasif.'); });
        Object.keys(yuk).forEach(function (d) { var k = kap(d); if (k && yuk[d] > k) hata.push(e + ': ' + d + ' kapasite aşımı (' + yuk[d] + ' öğrenci / ' + k + ').');
          if (!k) uyari.push(e + ': ' + d + ' dersliğinin kapasitesi girilmemiş.'); });
      } else {
        if (!D.secili.length) { hata.push(e + ': derslik seçilmedi.'); return; }
        D.secili.forEach(function (d) { kullan(o.tarih, o.saat, d, e); if (!kap(d)) uyari.push(e + ': ' + d + ' dersliğinin sınav kapasitesi girilmemiş (adaylar eşit bölündü).'); });
        var dg = yeterlikDagilim_(adaylar, D.secili, havuz, c.derslik.sira); if (dg.kalan > 0) hata.push(e + ': kapasite yetmiyor, ' + dg.kalan + ' aday yerleşmedi.');
      } }); });
  if (c.bolum.konusma.var) {
    c.bolum.konusma.oturum.forEach(function (o, i) {
      var lvler = t.hazirlik ? o.lv : ['Tek'];
      lvler.forEach(function (lv) { var e = 'Konuşma ' + trTarih_(o.tarih) + (t.hazirlik ? ' ' + lv : '');
        var K = c.derslik.konusma.filter(function (x) { return x.oi === i && x.lv === lv; })[0];
        if (!K || !K.juri) { hata.push(e + ': jüri sayısı girilmedi.'); return; }
        var dl = K.derslikler.filter(String);
        if (dl.length !== K.juri) hata.push(e + ': jüri sayısı (' + K.juri + ') ile derslik sayısı (' + dl.length + ') farklı.');
        dl.forEach(function (d, j) { if (dl.indexOf(d) !== j) hata.push(e + ': ' + d + ' iki jüriye verildi.'); kullan(o.tarih, 'gün', d, e + ' jüri ' + (j + 1)); });
        if (!K.bekleme) uyari.push(e + ': bekleme alanı girilmedi.'); if (!K.kayit) uyari.push(e + ': kayıt masası girilmedi.'); });
    });
  }
  // aynı derslik aynı tarih ve saatte (konuşma bütün gün sayılır); diğer sınavlarla da
  sinavSatirlari_().forEach(function (r) { if (r['Kimlik'] === s.id || r['Durum'] === 'iptal') return; var o2 = sinavOku_(r['Kimlik']); if (!o2 || !o2.cfg.bolum) return;
    ['cs', 'yazma'].forEach(function (b) { var B = o2.cfg.bolum[b]; if (!B || !B.var) return; B.oturum.forEach(function (o, i) { var D = (o2.cfg.derslik[b] || [])[i] || {};
      var dl = []; for (var g in D.atama || {}) dl.push(D.atama[g]); (D.secili || []).forEach(function (x) { dl.push(x); });
      dl.filter(function (x, j, A) { return A.indexOf(x) === j; }).forEach(function (d) { kullan(o.tarih, o.saat, d, o2.ad); }); }); });
    ((o2.cfg.derslik || {}).konusma || []).forEach(function (K) { var o = ((o2.cfg.bolum.konusma || {}).oturum || [])[K.oi]; if (o) K.derslikler.forEach(function (d) { kullan(o.tarih, 'gün', d, o2.ad + ' konuşma'); }); });
  });
  var gunluk = {}; Object.keys(kullanim).forEach(function (k) { var p = k.split('|'); (gunluk[p[0] + '|' + p[2]] = gunluk[p[0] + '|' + p[2]] || []).push([p[1], kullanim[k]]); });
  Object.keys(gunluk).forEach(function (k) { var p = k.split('|'), L = gunluk[k];
    L.forEach(function (x) { if (x[1].length > 1) { var kimler = x[1].filter(function (y, j, A) { return A.indexOf(y) === j; });
      if (kimler.length > 1 || x[0] === 'gün') uyari.push(p[1] + ' dersliği ' + trTarih_(p[0]) + (x[0] === 'gün' ? '' : ' ' + x[0]) + ' saatinde birden çok yerde: ' + kimler.join(', ') + '.'); } });
    var gunKul = L.filter(function (x) { return x[0] === 'gün'; }), saatli = L.filter(function (x) { return x[0] !== 'gün'; });
    if (gunKul.length && saatli.length) uyari.push(p[1] + ' dersliği ' + trTarih_(p[0]) + ' günü konuşmada ve ' + saatli.map(function (x) { return x[1].join(', ') + ' ' + x[0]; }).join('; ') + ' için kullanılıyor.'); });
  return { hata: hata.filter(function (x, j, A) { return A.indexOf(x) === j; }), uyari: uyari.filter(function (x, j, A) { return A.indexOf(x) === j; }), tarihler: tarihli.sort() };
}

/* ---------- boş eşlemelerin önerisi (yönetim onaylar ya da değiştirir) ---------- */
function sinavOner_(s, adaylar, havuz) {
  var t = turBul_(s.tur), c = JSON.parse(JSON.stringify(s.cfg)), onerilen = [];
  var aktif = havuz.filter(function (d) { return d.durum === 'aktif'; }), kap = function (d) { return d.skap || d.kap || 0; };
  ['cs', 'yazma'].forEach(function (b) { var B = c.bolum[b]; if (!B.var) return;
    B.oturum.forEach(function (o, i) { var D = c.derslik[b][i] = c.derslik[b][i] || { atama: {}, secili: [] };
      if (t.hazirlik) {
        var gr = oturumGruplari_(t, o, adaylar), dolu = {}; for (var g in D.atama) dolu[D.atama[g]] = 1;
        gr.forEach(function (g) { if (D.atama[g.g]) return;   // 1) sınıfın kendi dersliği  2) en küçük yeterli boş derslik
          var kendi = aktif.filter(function (d) { return d.sinif.split(/[,;\s]+/).indexOf(g.g) >= 0 && !dolu[d.ad]; })[0];
          var bos = kendi || aktif.filter(function (d) { return !dolu[d.ad] && (!kap(d) || kap(d) >= g.n); }).sort(function (x, y) { return (kap(x) || 999) - (kap(y) || 999) || x.ad.localeCompare(y.ad, 'tr', { numeric: true }); })[0];
          if (bos) { D.atama[g.g] = bos.ad; dolu[bos.ad] = 1; onerilen.push(b + ':' + i + ':' + g.g); } });
      } else if (!D.secili.length) {
        var L = aktif.slice().sort(function (x, y) { return kap(y) - kap(x) || x.ad.localeCompare(y.ad, 'tr', { numeric: true }); }), top = 0;
        for (var j = 0; j < L.length && top < adaylar.length; j++) { D.secili.push(L[j].ad); top += kap(L[j]) || adaylar.length; }
        D.secili.sort(function (x, y) { return x.localeCompare(y, 'tr', { numeric: true }); }); onerilen.push(b + ':' + i);
      } }); });
  if (c.bolum.konusma.var) c.bolum.konusma.oturum.forEach(function (o, i) { (t.hazirlik ? o.lv : ['Tek']).forEach(function (lv) {
    var K = c.derslik.konusma.filter(function (x) { return x.oi === i && x.lv === lv; })[0]; if (!K || !K.juri) return;
    var gunde = {}; c.derslik.konusma.forEach(function (x) { if (c.bolum.konusma.oturum[x.oi] && c.bolum.konusma.oturum[x.oi].tarih === o.tarih) x.derslikler.forEach(function (d) { if (d) gunde[d] = 1; }); });
    while (K.derslikler.length < K.juri) K.derslikler.push('');
    K.derslikler = K.derslikler.slice(0, K.juri).map(function (d, j) { if (d) return d;
      var bos = aktif.filter(function (x) { return !gunde[x.ad]; })[0]; if (!bos) return ''; gunde[bos.ad] = 1; onerilen.push('k:' + i + ':' + lv + ':' + j); return bos.ad; }); }); });
  return { cfg: c, onerilen: onerilen };
}

/* ---------- görünüm ---------- */
function sinavOzet_(s) {
  var t = turBul_(s.tur) || {}, tar = [];
  ['cs', 'yazma', 'konusma'].forEach(function (b) { var B = (s.cfg.bolum || {})[b]; if (B && B.var) B.oturum.forEach(function (o) { if (o.tarih) tar.push(o.tarih); }); });
  tar.sort(); var bugun = sBugun_();
  return { id: s.id, ad: s.ad, tur: t.ad || s.tur, durum: s.durum, ilk: tar[0] ? trTarih_(tar[0]) : '', kalan: tar[0] ? gunFark_(tar[0], bugun) : null, guncelleme: s.guncelleme, guncelleyen: s.guncelleyen };
}
function sinavDetay_(s, ek) {
  var t = turBul_(s.tur), adaylar = adaylarOku_(s.id), havuz = derslikHavuzu_(), K = sinavKontrol_(s, adaylar, havuz);
  var gruplar = {}; ['cs', 'yazma'].forEach(function (b) { gruplar[b] = s.cfg.bolum[b].oturum.map(function (o) { return oturumGruplari_(t, o, adaylar); }); });
  var dagilim = {}; if (!t.hazirlik) ['cs', 'yazma'].forEach(function (b) { dagilim[b] = s.cfg.bolum[b].oturum.map(function (o, i) { var D = s.cfg.derslik[b][i] || { secili: [] }; return yeterlikDagilim_(adaylar, D.secili, havuz, s.cfg.derslik.sira); }); });
  var lvSay = {}; adaylar.forEach(function (a) { lvSay[a.lv || 'Tek'] = (lvSay[a.lv || 'Tek'] || 0) + 1; });
  var dk = dokOku_(s.id).filter(function (d) { return d['Durum'] === 'güncel'; }), epK = epKayit_(s.id);
  var adimlar = [
    ['Sınav bilgileri ve tarihler', !K.hata.some(function (h) { return /tarih|saat|düzey seçilmedi/.test(h); })],
    [t.hazirlik ? 'Öğrenci listesi' : 'Aday listesi', adaylar.length > 0],
    ['Derslikler', adaylar.length > 0 && !K.hata.some(function (h) { return /derslik|Derslik|jüri|kapasite/.test(h); })],
    ['Sınav hazır, Claude\'a gönderildi', s.durum === 'hazir' || s.durum === 'kuruldu'],
    ['Görevler (Claude)', s.durum === 'kuruldu', true], ['Sınav dokümanları (Claude)', dk.length > 0, true], ['Birime açıldı', dk.some(function (d) { return !!d['Birim dosyası']; }), true],
    ['Öğrenci işlerine gitti', epK.some(function (r) { return r['Tür'] === 'ogris' && r['Durum'] === 'gönderildi'; }), true], ['Hoca e-postaları', epK.some(function (r) { return r['Tür'] === 'gorev' && r['Durum'] === 'gönderildi'; }), true], ['TV / QR denendi', false, true]];
  var ozet = sinavOzet_(s);
  var v = { rev: s.rev || 0, id: s.id, ad: s.ad, tur: s.tur, turAd: t.ad, hazirlik: t.hazirlik, birim: (birimBul_(t.birim) || {}).ad, donem: s.donem, durum: s.durum, cfg: s.cfg,
    olusturan: s.olusturan, olusturma: s.olusturma, guncelleyen: s.guncelleyen, guncelleme: s.guncelleme, hazirKim: s.hazirKim, hazirT: s.hazirT,
    gecmis: s.gecmis.slice(-20).reverse(), adaySay: adaylar.length, lvSay: lvSay, gruplar: gruplar, dagilim: dagilim, kontrol: K, adimlar: adimlar, kalan: ozet.kalan, ilk: ozet.ilk,
    muaf: birimUyeleri_(birimBul_(t.birim)).map(function (u) { return u.e; }) };
  v.dok = dokGorunum_(s);
  var GL = gorevOku_(s.id); v.gorevOzet = { satir: GL.length, kisi: GL.map(function (g) { return g.e; }).filter(function (e, i, A) { return A.indexOf(e) === i; }).length,
    gunler: GL.map(function (g) { return g.tarih; }).filter(function (t, i, A) { return t && A.indexOf(t) === i; }).sort().map(function (t) { return { tarih: t, tr: trTarih_(t) }; }) };
  v.epTur = EP_TUR; v.epYonlendir = epYonlendir_({ e: '' }) || (ayarlar_().denemeGunu ? 'gönderen yönetici' : '');
  for (var k in ek || {}) v[k] = ek[k];
  return v;
}
function sinavGenel_(kim) {
  var L = sinavSatirlari_().filter(function (r) { return r['Durum'] !== 'iptal'; }).map(function (r) { return sinavOzet_(sinavOku_(r['Kimlik'])); });
  var hoca = Object.keys(S.hoca).sort(function (a, b) { return S.hoca[a].ad.localeCompare(S.hoca[b].ad, 'tr'); })
    .map(function (h) { return { id: h, ad: S.hoca[h].ad, e: epN_(S.hoca[h].eposta) }; });
  return { turler: SINAV_TURLER, bolumler: SINAV_BOLUM, duzeyler: SINAV_DUZEY, tercihAd: TERCIH_AD, sinavlar: L, havuz: derslikHavuzu_(), hocalar: hoca, ben: kim.ad, bugun: sBugun_() };
}

/* ---------- öğrenci/aday listesi ---------- */
function listeTemizle_(t, satirlar) {
  var gor = {}, L = [], hata = [];
  (satirlar || []).slice(0, 5000).forEach(function (r, i) {
    var no = String(r.no == null ? '' : r.no).replace(/\s/g, ''), ad = String(r.ad || '').replace(/\s+/g, ' ').trim();
    if (!no && !ad) return;
    if (!/^\d{5,12}$/.test(no)) { hata.push((i + 2) + '. satır: öğrenci numarası geçersiz (' + no + ').'); return; }
    if (!ad) { hata.push((i + 2) + '. satır: ad soyad yok.'); return; }
    if (gor[no]) { hata.push(no + ' numarası iki kez var (yalnız ilki alındı).'); return; } gor[no] = 1;
    var cls = t.hazirlik ? String(r.cls || '').trim().toUpperCase() : '', lv = t.hazirlik ? String(r.lv || '').trim().toUpperCase() : 'Tek';
    if (t.hazirlik && !lv && /^(D1|D2|A|B|C)-/.test(cls)) lv = cls.split('-')[0];
    L.push({ no: no, ad: ad.slice(0, 80), cls: cls.slice(0, 20), lv: lv });
  });
  return { L: L, hata: hata };
}
/** Önceki listeyle karşılaştırma: aynı türdeki (hazırlık / Yeterlik) en son başka sınavın listesi; yoksa (hazırlıkta) sistemdeki öğrenci listesi. */
function listeKarsilastir_(s, L) {
  var t = turBul_(s.tur), onceki = null, kaynak = '';
  var digerleri = sinavSatirlari_().filter(function (r) { var tt = turBul_(r['Tür']); return r['Kimlik'] !== s.id && r['Durum'] !== 'iptal' && tt && tt.hazirlik === t.hazirlik; }).reverse();
  for (var i = 0; i < digerleri.length && !onceki; i++) { var a = adaylarOku_(digerleri[i]['Kimlik']); if (a.length) { onceki = a; kaynak = digerleri[i]['Ad']; } }
  if (!onceki && t.hazirlik && S.order && S.order.length) { onceki = S.order.map(function (no) { var x = S.stu[no]; return { no: String(no), ad: x.ad, cls: x.cls || '', lv: x.lv || '' }; }); kaynak = 'sistemdeki öğrenci listesi (son kurulan sınav)'; }
  if (!onceki) return null;
  var E = {}; onceki.forEach(function (a) { E[a.no] = a; }); var Y = {}; L.forEach(function (a) { Y[a.no] = a; });
  return { kaynak: kaynak, onceki: onceki.length,
    yeni: L.filter(function (a) { return !E[a.no]; }).map(function (a) { return [a.no, a.ad, a.cls]; }),
    ayrilan: onceki.filter(function (a) { return !Y[a.no]; }).map(function (a) { return [a.no, a.ad, a.cls]; }),
    sinif: t.hazirlik ? L.filter(function (a) { return E[a.no] && E[a.no].cls && E[a.no].cls !== a.cls; }).map(function (a) { return [a.no, a.ad, E[a.no].cls, a.cls]; }) : [] };
}

/* ---------- API ---------- */
function apiSinav(oturum) {
  var kim; try { S = durumOku_(); kim = sKim_(oturum); } catch (e) { return { err: /YETKI/.test(e.message) ? 'Bu bölüm için yetkiniz yok.' : 'OTURUM' }; }
  return sinavGenel_(kim);
}
function apiSinavIslem(oturum, islem, a) {
  a = a || {}; var kim;
  try { S = durumOku_(); kim = sKim_(oturum); } catch (e) { return { err: /YETKI/.test(e.message) ? 'Bu bölüm için yetkiniz yok.' : 'OTURUM' }; }
  var genel = function (mesaj, ek) { var r = sinavGenel_(kim); r.mesaj = mesaj || ''; for (var k in ek || {}) r[k] = ek[k]; return r; };
  if (islem === 'derslikKaydet') {
    var gor = {}, L = [], hata = [];
    (a.liste || []).slice(0, 500).forEach(function (d) { var ad = String(d.ad || '').trim().toUpperCase().replace(/\s+/g, ''); if (!ad) return; if (gor[ad]) { hata.push(ad + ' iki kez yazılmış.'); return; } gor[ad] = 1;
      L.push({ ad: ad.slice(0, 20), bina: String(d.bina || '').slice(0, 40), kat: String(d.kat == null ? '' : d.kat).slice(0, 10), kap: Math.max(0, Math.min(500, Math.round(Number(d.kap) || 0))),
        skap: Math.max(0, Math.min(500, Math.round(Number(d.skap) || 0))), sinif: String(d.sinif || '').toUpperCase().slice(0, 60), not: String(d.not || '').slice(0, 120), durum: d.durum === 'pasif' ? 'pasif' : 'aktif' }); });
    var once = derslikHavuzu_();   // listeden çıkarılan derslik silinmez, pasif olur
    once.forEach(function (d) { if (!gor[d.ad]) L.push({ ad: d.ad, bina: d.bina, kat: d.kat, kap: d.kap, skap: d.skap, sinif: d.sinif, not: d.not, durum: 'pasif' }); });
    L.sort(function (x, y) { return x.ad.localeCompare(y.ad, 'tr', { numeric: true }); });
    bKilit_(function () { derslikYaz_(L); });
    return genel(L.filter(function (d) { return d.durum === 'aktif'; }).length + ' aktif derslik kaydedildi.' + (hata.length ? ' Uyarı: ' + hata.join(' ') : ''));
  }
  if (islem === 'derslikIceAktar') {   // 00-Derslik Listeleri.xlsx: Derslik + Sınıf + Öğrenci sayısı (istemcide okunur); var olanların kapasitesine dokunulmaz
    var H = {}; derslikHavuzu_().forEach(function (d) { H[d.ad] = d; }); var yeni = 0, guncel = 0;
    (a.satirlar || []).slice(0, 1000).forEach(function (r) { var ad = String(r.ad || '').trim().toUpperCase().replace(/\s+/g, ''); if (!ad || /TOPLAM/.test(ad)) return;
      var d = H[ad]; if (!d) { d = H[ad] = { ad: ad, bina: '', kat: katTahmin_(ad), kap: 0, skap: 0, sinif: '', not: '', durum: 'aktif' }; yeni++; } else guncel++;
      var cls = String(r.sinif || '').trim().toUpperCase(); if (cls && d.sinif.split(/[,;\s]+/).indexOf(cls) < 0) d.sinif = d.sinif ? d.sinif + ', ' + cls : cls;
      var n = Number(r.kap) || 0; if (n && !d.kap) d.kap = n; if (r.bina && !d.bina) d.bina = String(r.bina); if (r.kat && !d.kat) d.kat = String(r.kat); });
    var L2 = Object.keys(H).map(function (k) { return H[k]; }).sort(function (x, y) { return x.ad.localeCompare(y.ad, 'tr', { numeric: true }); });
    bKilit_(function () { derslikYaz_(L2); });
    return genel('İçe aktarıldı: ' + yeni + ' yeni derslik, ' + guncel + ' satır var olan dersliklere eklendi. Kapasiteleri kontrol edin (öğrenci sayısı normal kapasite olarak alındı; sınav kapasitesi boş).');
  }
  if (islem === 'yeni') {
    var t = turBul_(a.tur); if (!t) return { hata: 'Sınav türü seçin.' };
    var now = Date.now(), donem = donemOf_(now), ad = String(a.ad || '').trim().slice(0, 100) || donem + ' ' + t.ad;
    if (sinavSatirlari_().some(function (r) { return r['Ad'] === ad && r['Durum'] !== 'iptal'; })) return { hata: '"' + ad + '" adlı bir sınav zaten var.' };
    var s = { id: 'SN' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36), ad: ad, tur: t.id, birim: t.birim, donem: donem, durum: 'taslak', olusturan: kim.ad, olusturma: sTarih_(now),
      guncelleyen: kim.ad, guncelleme: sTarih_(now), cfg: sinavVarsayilan_(t.id), gecmis: [] };
    sGecmis_(s, kim, 'Sınav oluşturuldu (' + t.ad + ').');
    bKilit_(function () { sinavYaz_(s); });
    return genel(ad + ' oluşturuldu.', { sinav: sinavDetay_(s) });
  }
  var s2 = sinavOku_(String(a.id || '')); if (!s2 || s2.durum === 'iptal') return { hata: 'Sınav bulunamadı.' };
  s2.cfg = sTemizle_(s2.tur, s2.cfg);
  var t2 = turBul_(s2.tur);
  if (islem === 'ac') return { sinav: sinavDetay_(s2) };
  var kilitli = s2.durum === 'hazir' || s2.durum === 'kuruldu';
  if (islem === 'kaydet' || islem === 'liste' || islem === 'oner') { if (kilitli && islem !== 'oner') return { hata: 'Sınav "hazır" olarak Claude\'a gönderildi; değişiklik için önce "Düzenlemeye geri aç".' }; }
  if ((islem === 'kaydet' || islem === 'liste' || islem === 'hazir') && a.rev != null && Number(a.rev) !== (s2.rev || 0))
    return { hata: 'Bu sınav siz açtıktan sonra ' + (s2.guncelleyen || 'başka biri') + ' tarafından değiştirildi (' + (s2.guncelleme || '') + '). Değişiklikleriniz kaydedilmedi. Sınavı listeden yeniden açıp tekrar deneyin.', cakisma: true };
  if (islem.indexOf('dok') === 0) return dokIslem_(kim, s2, islem, a);
  if (islem.indexOf('ep') === 0 || islem.indexOf('gorev') === 0) return epIslem_(kim, s2, islem, a);
  if (islem === 'kaydet') {
    var yeniAd = String(a.ad || s2.ad).trim().slice(0, 100) || s2.ad;
    if (yeniAd !== s2.ad && sinavSatirlari_().some(function (r) { return r['Ad'] === yeniAd && r['Kimlik'] !== s2.id && r['Durum'] !== 'iptal'; })) return { hata: '"' + yeniAd + '" adlı bir sınav zaten var.' };
    s2.ad = yeniAd; s2.cfg = sTemizle_(s2.tur, a.cfg); sGecmis_(s2, kim, String(a.not || 'Ayarlar kaydedildi.').slice(0, 120));
    bKilit_(function () { sinavYaz_(s2); });
    return genel('Kaydedildi.', { sinav: sinavDetay_(s2) });
  }
  if (islem === 'oner') { var cfgO = a.cfg ? sTemizle_(s2.tur, a.cfg) : s2.cfg, so = { id: s2.id, tur: s2.tur, cfg: cfgO }, r = sinavOner_(so, adaylarOku_(s2.id), derslikHavuzu_());
    return { cfg: r.cfg, onerilen: r.onerilen, mesaj: r.onerilen.length ? r.onerilen.length + ' boş eşleme önerildi (sarı). Kontrol edip "Kaydet"e basın.' : 'Önerilecek boş eşleme yok (ya da uygun boş derslik kalmadı).' }; }
  if (islem === 'liste') {
    var T = listeTemizle_(t2, a.satirlar); if (!T.L.length) return { hata: 'Listede geçerli satır bulunamadı.' + (T.hata.length ? ' ' + T.hata.slice(0, 5).join(' ') : '') };
    var fark = listeKarsilastir_(s2, T.L);
    bKilit_(function () { adaylarYaz_(s2.id, T.L); sGecmis_(s2, kim, (t2.hazirlik ? 'Öğrenci' : 'Aday') + ' listesi yüklendi: ' + T.L.length + ' kişi' + (a.dosya ? ' (' + String(a.dosya).slice(0, 80) + ')' : '') + '.'); sinavYaz_(s2); });
    return genel(T.L.length + ' kişilik liste kaydedildi.', { sinav: sinavDetay_(s2, { fark: fark, listeHata: T.hata.slice(0, 30) }) });
  }
  if (islem === 'hazir') {
    if (a.geri) { if (!kilitli) return { hata: 'Sınav zaten düzenlenebilir.' }; if (s2.durum === 'kuruldu') return { hata: 'Sınav kuruldu; değişiklik için Claude\'a yazın.' };
      s2.durum = 'taslak'; sGecmis_(s2, kim, 'Düzenlemeye geri açıldı.'); bKilit_(function () { sinavYaz_(s2); }); return genel('Sınav yeniden düzenlenebilir.', { sinav: sinavDetay_(s2) }); }
    var K = sinavKontrol_(s2, adaylarOku_(s2.id), derslikHavuzu_());
    if (K.hata.length) return { hata: 'Önce şu eksikler giderilmeli:\n- ' + K.hata.slice(0, 15).join('\n- ') };
    s2.durum = 'hazir'; s2.hazirKim = kim.ad; s2.hazirT = sTarih_(Date.now()); sGecmis_(s2, kim, 'Sınav hazır olarak Claude\'a gönderildi.' + (K.uyari.length ? ' (' + K.uyari.length + ' uyarıyla)' : ''));
    bKilit_(function () { sinavYaz_(s2); });
    return genel('Sınav hazır olarak işaretlendi. Claude ayarları okuyup görev dağılımı, kurulum ve dosyaları hazırlayacak; onayınıza sunacak.', { sinav: sinavDetay_(s2) });
  }
  if (islem === 'iptal') {
    if (s2.durum === 'kuruldu') return { hata: 'Kurulmuş sınav iptal edilemez.' };
    s2.durum = 'iptal'; sGecmis_(s2, kim, 'Sınav listeden kaldırıldı (silinmedi; tabloda "iptal" olarak duruyor).'); bKilit_(function () { sinavYaz_(s2); });
    return genel(s2.ad + ' listeden kaldırıldı (kayıt silinmedi).');
  }
  return { hata: 'Bilinmeyen işlem.' };
}

/* =====================================================================================
 * Sınav dokümanları (12 tablosu bölüm S; 19.11.2026)
 * - Claude'un ürettiği dosyalar sınavın altında tek yerde: bölüm × düzey × kime; sürüm (aynı ad → yeni sürüm, eskisi "eski versiyonlar"a).
 * - "Birime aç": Birinci Ara / Dönem Sonu → Dönem İçi Sınav Birimi (düzey ya da Ortak), YDS / Bütünleme / Yeterlik / Erasmus → Yeterlik Sınav Birimi; etiketli.
 * - Kör grading koruması: "gizli" işaretli dosya (partner, gözetmen, second grader bilgisi) yalnız yönetimde kalır, birime açılamaz.
 * - Bu bölüm e-posta göndermez.
 * ===================================================================================== */
var SS_DOK = ['Kimlik', 'Sınav', 'Dosya adı', 'Bölüm', 'Düzey', 'Kime', 'Gizli', 'Sürüm', 'Durum', 'Tür', 'Boyut (KB)', 'Yükleyen', 'Zaman', 'Tarih', 'Birim dosyası', 'Birim sürümü', 'Birime açan', 'Birime açma tarihi', 'Not'];
var DOK_BOLUM = [['genel', 'Genel'], ['cs', 'Çoktan seçmeli test'], ['yazma', 'Yazma'], ['konusma', 'Konuşma'], ['grading', 'Writing grading']];
var DOK_KIME = [['ogris', 'Öğrenci işleri'], ['birim', 'Sınav birimi'], ['yonetim', 'Yönetim'], ['hoca', 'Hocalar']];
var DOK_ETIKET_ON = { ara1: 'Arasınav', donemsonu: 'Dönem Sonu', yds: 'YDS', ydsbut: 'YDS Büt', yeterlik: 'Yeterlik', erasmus: 'Erasmus' };
var DOK_GIZLI_RE = /e[şs]le[şs]me|grader|grading|partner|g[öo]zetmen|g[öo]rev/i;
function dokKlasor_(s) {
  var P = PropertiesService.getScriptProperties(), id = P.getProperty('sinavKlasor'), k = null;
  if (id) { try { k = DriveApp.getFolderById(id); } catch (e) { } }
  if (!k) { k = DriveApp.createFolder('YDYO Sınav Dokümanları (sistem – paylaşmayın)'); P.setProperty('sinavKlasor', k.getId()); }
  return bAltKlasor_(k, String(s.ad).replace(/[\\\/:*?"<>|]/g, '_'));
}
function dokOku_(sid) { return bOku_('Sınav Dokümanları', SS_DOK).filter(function (d) { return d['Sınav'] === sid; }); }
function dokYaz_(d) { var sh = bSayfa_('Sınav Dokümanları', SS_DOK), row = SS_DOK.map(function (h) { return d[h] == null ? '' : d[h]; });
  if (d._satir) sh.getRange(d._satir, 1, 1, row.length).setValues([row]); else sh.appendRow(row); }
function dokEtiket_(s, bolum) {
  var on = DOK_ETIKET_ON[s.tur], t = turBul_(s.tur);
  if (bolum === 'cs') return on + ' Çoktan Seçmeli Test'; if (bolum === 'konusma') return on + ' Konuşma'; if (bolum === 'yazma' || bolum === 'grading') return on + ' Yazma';
  return t.birim === 'disb' ? 'Dönem İçi Sınav Birimi Genel' : 'Yeterlik Birimi Genel';
}
function dokV_(d) {
  return { id: d['Kimlik'], ad: d['Dosya adı'], bolum: d['Bölüm'], lv: d['Düzey'], kime: String(d['Kime'] || '').split(',').filter(String), gizli: d['Gizli'] === 'EVET', surum: Number(d['Sürüm']) || 1,
    durum: d['Durum'], kb: d['Boyut (KB)'], yukleyen: d['Yükleyen'], tarih: d['Tarih'], birimde: !!d['Birim dosyası'], birimSurum: Number(d['Birim sürümü']) || 0,
    birimeAcan: d['Birime açan'], birimeTarih: d['Birime açma tarihi'], not: d['Not'] };
}
function dokGorunum_(s) {
  var L = dokOku_(s.id), g = L.filter(function (d) { return d['Durum'] === 'güncel'; }).map(dokV_), e = L.filter(function (d) { return d['Durum'] === 'eski'; }).map(dokV_);
  g.sort(function (a, b) { return DOK_BOLUM.map(function (x) { return x[0]; }).indexOf(a.bolum) - DOK_BOLUM.map(function (x) { return x[0]; }).indexOf(b.bolum) || String(a.ad).localeCompare(String(b.ad), 'tr', { numeric: true }); });
  var b = birimBul_(turBul_(s.tur).birim);
  return { guncel: g, eski: e, birimAd: b ? b.ad : '', duzeyli: !!(b && b.duzeyli), bolumler: DOK_BOLUM, kime: DOK_KIME };
}
function dokTemizle_(s, a, eski) {
  var t = turBul_(s.tur), bol = DOK_BOLUM.some(function (x) { return x[0] === a.bolum; }) ? a.bolum : (eski ? eski['Bölüm'] : 'genel');
  var lv = t.hazirlik ? (a.lv === 'Ortak' || SINAV_DUZEY.indexOf(a.lv) >= 0 ? a.lv : (eski ? eski['Düzey'] : 'Ortak')) : '';
  var gizli = a.gizli == null ? (eski ? eski['Gizli'] === 'EVET' : DOK_GIZLI_RE.test(String(a.ad || ''))) : !!a.gizli;
  var kime = (a.kime || (eski ? String(eski['Kime']).split(',') : ['yonetim'])).filter(function (k) { return DOK_KIME.some(function (x) { return x[0] === k; }); });
  if (gizli) kime = kime.filter(function (k) { return k === 'yonetim'; });
  if (!kime.length) kime = ['yonetim'];
  return { bolum: bol, lv: lv, gizli: gizli, kime: kime, not: String(a.not == null ? (eski ? eski['Not'] : '') : a.not).slice(0, 200) };
}
function dokIslem_(kim, s, islem, a) {
  var don = function (mesaj) { return { dok: dokGorunum_(s), mesaj: mesaj || '' }; };
  var bul = function (did) { return dokOku_(s.id).filter(function (d) { return d['Kimlik'] === did; })[0]; };
  if (islem === 'dokListe') return don();
  if (islem === 'dokYukle') {
    var ad = String(a.ad || '').replace(/[\\\/:*?"<>|]/g, '_').trim().slice(0, 150); if (!ad || !a.b64) return { hata: 'Dosya seçin.' };
    var bayt = Math.floor(String(a.b64).length * 3 / 4); if (bayt > BIRIM_MAX_MB * 1048576) return { hata: 'Dosya ' + BIRIM_MAX_MB + ' MB\'tan büyük olamaz.' };
    var once = dokOku_(s.id).filter(function (d) { return d['Durum'] === 'güncel' && d['Dosya adı'] === ad; })[0];
    var m = dokTemizle_(s, a, once), kl = dokKlasor_(s), f = kl.createFile(Utilities.newBlob(Utilities.base64Decode(a.b64), a.tur || 'application/octet-stream', ad)), now = Date.now();
    var d = { 'Kimlik': f.getId(), 'Sınav': s.id, 'Dosya adı': ad, 'Bölüm': m.bolum, 'Düzey': m.lv, 'Kime': m.kime.join(','), 'Gizli': m.gizli ? 'EVET' : '', 'Sürüm': once ? (Number(once['Sürüm']) || 1) + 1 : 1,
      'Durum': 'güncel', 'Tür': a.tur || '', 'Boyut (KB)': Math.max(1, Math.round(bayt / 1024)), 'Yükleyen': kim.ad, 'Zaman': now, 'Tarih': sTarih_(now), 'Not': m.not };
    bKilit_(function () {
      if (once) { once['Durum'] = 'eski'; dokYaz_(once); try { DriveApp.getFileById(once['Kimlik']).moveTo(bAltKlasor_(kl, 'eski versiyonlar')); } catch (x) { } }
      dokYaz_(d);
    });
    var uyar = once && once['Birim dosyası'] ? ' Önceki sürüm birimde açıktı; yeni sürümü birime yeniden açın.' : '';
    return don(ad + (once ? ' – ' + d['Sürüm'] + '. sürüm yüklendi (öncekisi eski sürümlere taşındı).' : ' yüklendi.') + (m.gizli ? ' Kör grading koruması: yalnız yönetimde.' : '') + uyar);
  }
  if (islem === 'dokGuncelle') {
    var d2 = bul(a.did); if (!d2 || d2['Durum'] !== 'güncel') return { hata: 'Dosya bulunamadı.' };
    var m2 = dokTemizle_(s, a, d2);
    if (m2.gizli && d2['Birim dosyası']) return { hata: 'Bu dosya birimde açık. Önce birimden kaldırın ("Birimden kaldır"), sonra gizli yapın.' };
    d2['Bölüm'] = m2.bolum; d2['Düzey'] = m2.lv; d2['Kime'] = m2.kime.join(','); d2['Gizli'] = m2.gizli ? 'EVET' : ''; d2['Not'] = m2.not;
    bKilit_(function () { dokYaz_(d2); }); return don('Kaydedildi.');
  }
  if (islem === 'dokIndir') {
    var d3 = bul(a.did); if (!d3 || d3['Durum'] === 'kaldırıldı') return { hata: 'Dosya bulunamadı.' };
    var fb = DriveApp.getFileById(d3['Kimlik']).getBlob(), now3 = Date.now();
    bKilit_(function () { bSayfa_('Birim İndirmeleri', BS_INDIR).appendRow([now3, bTarih_(now3), kim.ad, kim.e, 'sınav:' + s.id, d3['Kimlik'], d3['Dosya adı']]); });
    return { ad: d3['Dosya adı'], tur: d3['Tür'] || fb.getContentType(), b64: Utilities.base64Encode(fb.getBytes()) };
  }
  if (islem === 'dokZip') {
    var G = dokOku_(s.id).filter(function (d) { return d['Durum'] === 'güncel' && (!a.dids || a.dids.indexOf(d['Kimlik']) >= 0); });
    if (!G.length) return { hata: 'İndirilecek dosya yok.' };
    var top = G.reduce(function (t, d) { return t + (Number(d['Boyut (KB)']) || 0); }, 0); if (top > 30 * 1024) return { hata: 'Seçilen dosyalar 30 MB\'ı geçiyor; daha az dosya seçin.' };
    var adlar = {}, blobs = G.map(function (d) { var bl = DriveApp.getFileById(d['Kimlik']).getBlob(), n = d['Dosya adı'], k = 2; while (adlar[n]) n = d['Dosya adı'].replace(/(\.[^.]*)?$/, ' (' + (k++) + ')$1'); adlar[n] = 1; return bl.setName(n); });
    var z = Utilities.zip(blobs, String(s.ad).replace(/[\\\/:*?"<>|]/g, '_') + ' – dokümanlar.zip'), now4 = Date.now();
    bKilit_(function () { bSayfa_('Birim İndirmeleri', BS_INDIR).appendRow([now4, bTarih_(now4), kim.ad, kim.e, 'sınav:' + s.id, 'ZIP', G.length + ' dosya']); });
    return { ad: z.getName(), tur: 'application/zip', b64: Utilities.base64Encode(z.getBytes()) };
  }
  if (islem === 'dokKaldir') {
    var d5 = bul(a.did); if (!d5 || d5['Durum'] !== 'güncel') return { hata: 'Dosya bulunamadı.' };
    if (d5['Birim dosyası']) return { hata: 'Bu dosya birimde açık. Önce "Birimden kaldır".' };
    d5['Durum'] = 'kaldırıldı'; d5['Not'] = String(d5['Not'] || '') + ' [kaldıran: ' + kim.ad + ', ' + sTarih_(Date.now()) + ']';
    bKilit_(function () { dokYaz_(d5); try { DriveApp.getFileById(d5['Kimlik']).moveTo(bAltKlasor_(dokKlasor_(s), 'eski versiyonlar')); } catch (x) { } });
    return don(d5['Dosya adı'] + ' kaldırıldı (silinmedi; Drive\'da "eski versiyonlar" klasöründe).');
  }
  var t = turBul_(s.tur), b = birimBul_(t.birim);
  var birimSatiri = function (fid) { return bOku_('Birim Dosyaları', BS_DOSYA).filter(function (x) { return x['Kimlik'] === fid; })[0]; };
  var birimdenKaldir = function (d) {
    var r = birimSatiri(d['Birim dosyası']); if (r && r['Durum'] === 'aktif') { r['Durum'] = 'kaldırıldı'; r['Kaldıran'] = kim.ad; r['Kaldırma tarihi'] = sTarih_(Date.now());
      bSayfa_('Birim Dosyaları', BS_DOSYA).getRange(r._satir, 1, 1, BS_DOSYA.length).setValues([BS_DOSYA.map(function (h) { return r[h] == null ? '' : r[h]; })]);
      try { DriveApp.getFileById(r['Kimlik']).moveTo(bAltKlasor_(bBirimKlasor_(b), 'eski versiyonlar')); } catch (x) { } }
    d['Birim dosyası'] = ''; d['Birim sürümü'] = ''; d['Birime açan'] = ''; d['Birime açma tarihi'] = '';
  };
  if (islem === 'dokBirimeAc') {
    var ids = a.dids || [], acilan = [], atlanan = [];
    bKilit_(function () {
      dokOku_(s.id).filter(function (d) { return ids.indexOf(d['Kimlik']) >= 0 && d['Durum'] === 'güncel'; }).forEach(function (d) {
        if (d['Gizli'] === 'EVET') { atlanan.push(d['Dosya adı'] + ' (kör grading koruması)'); return; }
        if (d['Birim dosyası'] && Number(d['Birim sürümü']) === Number(d['Sürüm'])) { atlanan.push(d['Dosya adı'] + ' (zaten açık)'); return; }
        var eskiBirim = dokOku_(s.id).filter(function (x) { return x['Dosya adı'] === d['Dosya adı'] && x['Birim dosyası']; });
        eskiBirim.forEach(function (x) { birimdenKaldir(x); dokYaz_(x); });
        var bl = DriveApp.getFileById(d['Kimlik']).getBlob().setName(d['Dosya adı']), f = bBirimKlasor_(b).createFile(bl), now = Date.now();
        var lv = b.duzeyli ? (d['Düzey'] || 'Ortak') : '';
        bSayfa_('Birim Dosyaları', BS_DOSYA).appendRow([f.getId(), b.id, lv, dokEtiket_(s, d['Bölüm']), d['Dosya adı'], d['Tür'] || '', d['Boyut (KB)'], kim.ad + ' (sınav dokümanı)', kim.e, now, bTarih_(now), donemOf_(now), 'aktif', '', '']);
        d['Birim dosyası'] = f.getId(); d['Birim sürümü'] = d['Sürüm']; d['Birime açan'] = kim.ad; d['Birime açma tarihi'] = bTarih_(now);
        var kl = String(d['Kime']).split(','); if (kl.indexOf('birim') < 0) { kl.push('birim'); d['Kime'] = kl.filter(String).join(','); }
        dokYaz_(d); acilan.push(d['Dosya adı']);
      });
    });
    return don((acilan.length ? acilan.length + ' dosya ' + b.ad + '\'nin "Birim çalışmaları" ekranına açıldı (e-posta gitmedi).' : 'Açılan dosya yok.') + (atlanan.length ? ' Açılmayan: ' + atlanan.join('; ') + '.' : ''));
  }
  if (islem === 'dokBirimdenKaldir') {
    var d6 = bul(a.did); if (!d6 || !d6['Birim dosyası']) return { hata: 'Dosya birimde açık değil.' };
    bKilit_(function () { birimdenKaldir(d6); d6['Kime'] = String(d6['Kime']).split(',').filter(function (k) { return k && k !== 'birim'; }).join(',') || 'yonetim'; dokYaz_(d6); });
    return don(d6['Dosya adı'] + ' birimden kaldırıldı.');
  }
  return { hata: 'Bilinmeyen işlem.' };
}

/* =====================================================================================
 * Sınav görevleri ve e-postalar (12 tablosu S–T; 19.11.2026)
 * - "Sınav Görevleri" sayfası: Claude'un görev dağılımı (Excel olarak yüklenir): e-posta, ad, tarih, saat, görev, yer.
 * - E-posta türleri: öğrenci işleri paketi (ydyogr@), bireysel görev e-postası, hatırlatma (bir günün görevlileri), birim bilgilendirmesi.
 * - Her gönderim: önizleme (alıcılar, konu, örnek metin, ekler, kota) → kişi seçimi → onay → gönderim → "E-posta Kaydı".
 * - DENEME'de (Ayarlar › denemeGunu dolu) ya da Ayarlar › epostaYonlendir doluysa bütün e-postalar o adrese / gönderen yöneticiye gider.
 * ===================================================================================== */
var SS_GOREV = ['Sınav', 'E-posta', 'Ad Soyad', 'Tarih', 'Saat', 'Görev', 'Yer / ayrıntı', 'Not'];
var SS_EPK = ['Zaman', 'Tarih', 'Sınav', 'Tür', 'Alıcı', 'Ad', 'Asıl alıcı', 'Konu', 'Ekler', 'Durum', 'Gönderen'];
var EP_TUR = [['ogris', 'Öğrenci işleri paketi'], ['gorev', 'Bireysel görev e-postası'], ['hatirlatma', 'Hatırlatma (bir günün görevlileri)'], ['birim', 'Sınav birimi bilgilendirmesi']];
var EP_OGRIS = 'ydyogr@anadolu.edu.tr', EP_MAX_EK_MB = 20;
function gorevOku_(sid) { return bOku_('Sınav Görevleri', SS_GOREV).filter(function (r) { return r['Sınav'] === sid; }).map(function (r) {
  var t = r['Tarih']; if (t instanceof Date) t = Utilities.formatDate(t, TZ, 'yyyy-MM-dd');
  return { e: epN_(r['E-posta']), ad: String(r['Ad Soyad'] || ''), tarih: String(t || ''), saat: String(r['Saat'] || ''), gorev: String(r['Görev'] || ''), yer: String(r['Yer / ayrıntı'] || ''), not: String(r['Not'] || '') }; }); }
function epKayit_(sid) { return bOku_('E-posta Kaydı', SS_EPK).filter(function (r) { return r['Sınav'] === sid; }); }
function epYonlendir_(kim) { var a = ayarlar_(); if (a.epostaYonlendir) return epN_(a.epostaYonlendir); if (a.denemeGunu) return kim.e || ''; return ''; }
function epHtml_(m) { return String(m).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
function epTablo_(L) { if (!L.length) return { txt: '', html: '' };
  var txt = L.map(function (g) { return '- ' + trTarih_(g.tarih) + ' ' + g.saat + ' · ' + g.gorev + (g.yer ? ' · ' + g.yer : ''); }).join('\n');
  var html = '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">' + '<tr>' + ['Tarih', 'Saat', 'Görev', 'Yer / ayrıntı'].map(function (h) { return '<th style="border:1px solid #bbb;padding:4px 8px;background:#eef3f3;text-align:left">' + h + '</th>'; }).join('') + '</tr>' +
    L.map(function (g) { return '<tr>' + [trTarih_(g.tarih), g.saat, g.gorev, g.yer].map(function (x) { return '<td style="border:1px solid #bbb;padding:4px 8px">' + epHtml_(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
  return { txt: txt, html: html }; }
function epPortal_() { try { return uygulamaAdresi_(); } catch (e) { return ''; } }
/** Bir tür için alıcılar ve varsayılan metin. */
function epHazirla_(s, tur, a) {
  var G = gorevOku_(s.id), alicilar = [], konu = '', metin = '', kisisel = null;
  var bas = s.ad;
  if (tur === 'ogris') {
    alicilar = [{ e: EP_OGRIS, ad: 'Öğrenci İşleri' }];
    konu = bas + ' – öğrenci duyuru listeleri';
    metin = 'Merhaba,\n\n' + bas + ' için öğrencilere duyurulacak listeler ektedir. Listelerde öğrenci adları ve numaraları maskelidir.\n\nBilgilerinize sunarız.\n\nYDYO Hazırlık Okulu Yönetimi';
  } else if (tur === 'gorev' || tur === 'hatirlatma') {
    var L = tur === 'hatirlatma' ? G.filter(function (g) { return g.tarih === a.tarih; }) : G, M = {};
    L.forEach(function (g) { if (!g.e) return; (M[g.e] = M[g.e] || { e: g.e, ad: g.ad, L: [] }).L.push(g); });
    alicilar = Object.keys(M).sort(function (x, y) { return M[x].ad.localeCompare(M[y].ad, 'tr'); }).map(function (k) { return M[k]; });
    konu = tur === 'gorev' ? bas + ' – görevleriniz' : bas + ' – ' + trTarih_(a.tarih) + ' görev hatırlatması';
    metin = tur === 'gorev'
      ? 'Sayın {AD},\n\n' + bas + ' kapsamındaki görevleriniz aşağıdadır:\n\n{GOREVLER}\n\nGörevlerinizi ve yönergeleri Sınav Portalı\'nda ("Hoca" düğmesi) da görebilirsiniz: {PORTAL}\nMazeretiniz olursa portal üzerinden ya da bu e-postayı yanıtlayarak bildirebilirsiniz.\n\nİyi çalışmalar dileriz.\nYDYO Hazırlık Okulu Yönetimi'
      : 'Sayın {AD},\n\nHatırlatma: ' + trTarih_(a.tarih) + ' tarihindeki görevleriniz aşağıdadır:\n\n{GOREVLER}\n\nSınav Portalı: {PORTAL}\n\nİyi çalışmalar dileriz.\nYDYO Hazırlık Okulu Yönetimi';
    kisisel = true;
  } else if (tur === 'birim') {
    var b = birimBul_(turBul_(s.tur).birim); alicilar = b ? birimUyeleri_(b).map(function (u) { return { e: epN_(u.e), ad: u.ad }; }) : [];
    konu = bas + ' – sınav dokümanları';
    metin = 'Sayın {AD},\n\n' + bas + ' dokümanları Sınav Portalı\'nda, ' + (b ? b.ad : 'biriminiz') + ' › "Birim çalışmaları" ekranında açılmıştır.\n\nSınav Portalı: {PORTAL} ("Hoca" düğmesi › Birim çalışmaları)\n\nİyi çalışmalar dileriz.\nYDYO Hazırlık Okulu Yönetimi';
    kisisel = true;
  }
  return { alicilar: alicilar, konu: konu, metin: metin, kisisel: !!kisisel };
}
function epKisiMetni_(sablon, x) {
  var t = epTablo_(x.L || []), p = epPortal_();
  var txt = String(sablon).replace(/\{AD\}/g, x.ad || '').replace(/\{PORTAL\}/g, p).replace(/\{GOREVLER\}/g, t.txt || '(görev bulunamadı)');
  var html = epHtml_(String(sablon).replace(/\{GOREVLER\}/g, '\u0001')).replace(/\{AD\}/g, epHtml_(x.ad || '')).replace(/\{PORTAL\}/g, '<a href="' + p + '">' + epHtml_(p) + '</a>').replace('\u0001', t.html || '(görev bulunamadı)');
  return { txt: txt, html: '<div style="font-family:Arial,sans-serif;font-size:14px">' + html + '</div>' };
}
function epEkVars_(s, tur) { var k = tur === 'ogris' ? 'ogris' : tur === 'birim' ? '' : 'hoca';
  return dokOku_(s.id).filter(function (d) { return d['Durum'] === 'güncel' && d['Gizli'] !== 'EVET' && k && String(d['Kime']).split(',').indexOf(k) >= 0; }).map(function (d) { return d['Kimlik']; }); }
function epIslem_(kim, s, islem, a) {
  var G = function () { var L = gorevOku_(s.id), say = {}; L.forEach(function (g) { say[g.e] = (say[g.e] || 0) + 1; });
    var gunler = {}; L.forEach(function (g) { if (g.tarih) gunler[g.tarih] = (gunler[g.tarih] || 0) + 1; });
    return { liste: L, kisi: Object.keys(say).length, gunler: Object.keys(gunler).sort().map(function (t) { return { tarih: t, tr: trTarih_(t), n: gunler[t] }; }) }; };
  if (islem === 'gorevListe') return { gorev: G() };
  if (islem === 'gorevYukle') {
    var hata = [], L = [];
    (a.satirlar || []).slice(0, 3000).forEach(function (r, i) {
      var e = epN_(r.e), t = String(r.tarih || '').trim(), m;
      if ((m = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/))) t = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      if (!e && !r.ad) return;
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) { hata.push((i + 2) + '. satır: e-posta geçersiz (' + (r.e || '') + ').'); return; }
      if (!tarihMi_(t)) { hata.push((i + 2) + '. satır: tarih okunamadı (' + (r.tarih || '') + ').'); return; }
      L.push([s.id, e, String(r.ad || '').slice(0, 80), t, String(r.saat || '').slice(0, 20), String(r.gorev || '').slice(0, 120), String(r.yer || '').slice(0, 160), String(r.not || '').slice(0, 160)]);
    });
    if (!L.length) return { hata: 'Geçerli görev satırı yok.' + (hata.length ? ' ' + hata.slice(0, 5).join(' ') : '') };
    bKilit_(function () {
      var sh = bSayfa_('Sınav Görevleri', SS_GOREV), diger = bOku_('Sınav Görevleri', SS_GOREV).filter(function (r) { return r['Sınav'] !== s.id; }).map(function (r) { return SS_GOREV.map(function (h) { return r[h]; }); });
      var rows = diger.concat(L); sh.clearContents(); sh.appendRow(SS_GOREV); if (rows.length) sh.getRange(2, 1, rows.length, SS_GOREV.length).setValues(rows);
    });
    return { gorev: G(), mesaj: L.length + ' görev satırı kaydedildi (önceki görev listesi bu sınav için değiştirildi).' + (hata.length ? ' Atlanan: ' + hata.slice(0, 10).join(' ') : '') };
  }
  if (islem === 'epKayit') return { kayit: epKayit_(s.id).slice(-200).reverse().map(function (r) { return { tarih: r['Tarih'], tur: r['Tür'], alici: r['Asıl alıcı'] || r['Alıcı'], ad: r['Ad'], konu: r['Konu'], durum: r['Durum'], gonderen: r['Gönderen'] }; }) };
  var tur = String(a.tur || ''); if (!EP_TUR.some(function (x) { return x[0] === tur; })) return { hata: 'E-posta türü seçin.' };
  if (tur === 'hatirlatma' && !tarihMi_(a.tarih)) return { hata: 'Hatırlatma için görev günü seçin.' };
  var H = epHazirla_(s, tur, a), K = epKayit_(s.id), yon = epYonlendir_(kim);
  var once = {}; K.forEach(function (r) { if (r['Tür'] === tur + (tur === 'hatirlatma' ? ':' + a.tarih : '') && r['Durum'] === 'gönderildi') once[epN_(r['Asıl alıcı'] || r['Alıcı'])] = r['Tarih']; });
  var D = dokOku_(s.id).filter(function (d) { return d['Durum'] === 'güncel' && d['Gizli'] !== 'EVET'; });
  if (islem === 'epOnizle') {
    var ilk = H.alicilar[0] || { ad: 'Örnek Hoca', L: [] }, ornek = H.kisisel ? epKisiMetni_(H.metin, ilk).txt : epKisiMetni_(H.metin, {}).txt;
    var kota = 0; try { kota = MailApp.getRemainingDailyQuota(); } catch (e) { }
    return { onizleme: { tur: tur, tarih: a.tarih || '', konu: H.konu, metin: H.metin, ornek: ornek, kisisel: H.kisisel,
      alicilar: H.alicilar.map(function (x) { return { e: x.e, ad: x.ad, n: (x.L || []).length, once: once[x.e] || '' }; }),
      ekler: D.map(function (d) { return { id: d['Kimlik'], ad: d['Dosya adı'], kb: Number(d['Boyut (KB)']) || 0, kime: String(d['Kime']) }; }), ekVars: epEkVars_(s, tur),
      kota: kota, yonlendir: yon, gorev: tur === 'gorev' || tur === 'hatirlatma' ? G() : null } };
  }
  if (islem === 'epGonder') {
    var izin = {}; H.alicilar.forEach(function (x) { izin[x.e] = x; });
    var sec = (a.alicilar || []).map(epN_).filter(function (e, i, A) { return izin[e] && A.indexOf(e) === i; });
    if (!sec.length) return { hata: 'Alıcı seçilmedi.' };
    var ekId = (a.ekler || []).filter(function (id) { return D.some(function (d) { return d['Kimlik'] === id; }); });
    var ekKb = D.filter(function (d) { return ekId.indexOf(d['Kimlik']) >= 0; }).reduce(function (t, d) { return t + (Number(d['Boyut (KB)']) || 0); }, 0);
    if (ekKb > EP_MAX_EK_MB * 1024) return { hata: 'Ekler toplamı ' + EP_MAX_EK_MB + ' MB\'ı geçiyor; daha az ek seçin.' };
    var konu = String(a.konu || H.konu).slice(0, 200), sablon = String(a.metin || H.metin).slice(0, 8000);
    var ekler = ekId.map(function (id) { var d = D.filter(function (x) { return x['Kimlik'] === id; })[0]; return DriveApp.getFileById(id).getBlob().setName(d['Dosya adı']); });
    var ekAd = D.filter(function (d) { return ekId.indexOf(d['Kimlik']) >= 0; }).map(function (d) { return d['Dosya adı']; }).join('; ');
    var kota = 100; try { kota = MailApp.getRemainingDailyQuota(); } catch (e) { }
    var gonder = sec.slice(0, Math.max(0, kota)), kalan = sec.slice(gonder.length), satirlar = [], n = 0, hatalar = [];
    gonder.forEach(function (e) {
      var x = izin[e], m = epKisiMetni_(sablon, x), hedef = yon || e, op = postaSecenek_(), now = Date.now();
      op.to = hedef; op.subject = (yon ? '[DENEME → ' + e + '] ' : '') + konu; op.htmlBody = m.html; op.body = m.txt; if (ekler.length) op.attachments = ekler;
      var durum = 'gönderildi'; try { MailApp.sendEmail(op); n++; } catch (err) { durum = 'hata: ' + String(err.message || err).slice(0, 120); hatalar.push(e); }
      satirlar.push([now, sTarih_(now), s.id, tur + (tur === 'hatirlatma' ? ':' + a.tarih : ''), hedef, x.ad || '', e, konu, ekAd, yon ? (durum === 'gönderildi' ? 'deneme' : durum) : durum, kim.ad]);
    });
    bKilit_(function () { var sh = bSayfa_('E-posta Kaydı', SS_EPK); satirlar.forEach(function (r) { sh.appendRow(r); }); });
    var tAd = EP_TUR.filter(function (x) { return x[0] === tur; })[0][1];
    return { mesaj: tAd + ': ' + n + ' e-posta gönderildi' + (yon ? ' (DENEME: hepsi ' + yon + ' adresine)' : '') + '.' + (kalan.length ? ' Günlük kota doldu; ' + kalan.length + ' kişiye gönderilemedi, yarın "daha önce gönderilenleri atla" ile tamamlayın.' : '') + (hatalar.length ? ' Hata: ' + hatalar.join(', ') + '.' : ''),
      gonderildi: n, kalan: kalan };
  }
  return { hata: 'Bilinmeyen işlem.' };
}
/* ======================= HTML ======================= */
var HTML_DOSYALARI = {"Stil": "<meta charset=\"utf-8\">\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@500;600&display=swap\">\n<style>\n[hidden]{display:none!important}  /* gizli öğeler (ör. TV duyurusu) display kurallarına rağmen görünmesin – 6.11.2026 */\n/* Layout: üstte kimlik bandı + deneme saati şeridi; altında seçilen görünüm (başlangıç, TV, öğrenci telefonu, hoca portalı, yönetim) */\n:root{\n  --bg:#EDF3F3; --surface:#FFFFFF; --ink:#0F2529; --muted:#55696C; --line:#CDDADB;\n  --accent:#0B6E7E; --accent-ink:#FFFFFF; --accent-soft:#DAEDEF;\n  --hl:#B86A00; --hl-soft:#FCEBCF;\n  --ok:#1B6E43; --ok-soft:#DDF0E4; --warn:#9A5800; --warn-soft:#FBEDD5; --bad:#AE2A20; --bad-soft:#F8E0DC;\n  --f-body:\"Atkinson Hyperlegible\",system-ui,-apple-system,\"Segoe UI\",sans-serif;\n  --f-mono:\"IBM Plex Mono\",ui-monospace,Menlo,Consolas,monospace;\n}\n@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){\n  --bg:#0B1618; --surface:#122226; --ink:#E2EDEE; --muted:#94AAAD; --line:#25393D;\n  --accent:#5EC2D1; --accent-ink:#06191C; --accent-soft:#14343A;\n  --hl:#F2B260; --hl-soft:#3A2A12;\n  --ok:#63C28E; --ok-soft:#15301F; --warn:#E3AA4F; --warn-soft:#382A12; --bad:#EF8C82; --bad-soft:#3B1C19; color-scheme:dark}}\n:root[data-theme=\"dark\"]{\n  --bg:#0B1618; --surface:#122226; --ink:#E2EDEE; --muted:#94AAAD; --line:#25393D;\n  --accent:#5EC2D1; --accent-ink:#06191C; --accent-soft:#14343A;\n  --hl:#F2B260; --hl-soft:#3A2A12;\n  --ok:#63C28E; --ok-soft:#15301F; --warn:#E3AA4F; --warn-soft:#382A12; --bad:#EF8C82; --bad-soft:#3B1C19; color-scheme:dark}\n*{box-sizing:border-box}\nbody{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.45;\n  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 40px}\n.wrap{max-width:1200px;margin:0 auto}\n.band{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding-block:14px 10px}\n.band .eyebrow{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}\n.band h1{font-size:20px;margin:0;text-wrap:balance}\n.band nav{display:flex;flex-wrap:wrap;gap:6px}\n.band nav a{font-size:13px;color:var(--accent);text-decoration:none;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface)}\n.band nav a.on{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}\n.clockbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);margin-bottom:18px}\n.clockbar .t{font-family:var(--f-mono);font-variant-numeric:tabular-nums;font-size:20px;font-weight:600}\n.clockbar .d{font-size:13px;color:var(--muted)}\n.clockbar .sp{flex:1 1 auto}\n.clockbar select,.clockbar .btn{width:auto}\nh2{font-size:18px;margin:0 0 10px;text-wrap:balance}\nh3{font-size:15px;margin:0 0 8px}\np{margin:0 0 8px}\n.muted{color:var(--muted)}\n.mono{font-family:var(--f-mono);font-variant-numeric:tabular-nums}\n.small{font-size:13px}\n.panel{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;min-width:0}\n.stack{display:flex;flex-direction:column;gap:16px}\n.grid{display:grid;gap:16px}\n.g2{grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))}\n.g3{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}\n.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}\n.row.end{align-items:flex-end}\n.btn{font:inherit;font-weight:700;font-size:14px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);padding:9px 14px;cursor:pointer;line-height:1.2}\n.btn.ghost{background:transparent;color:var(--accent)}\n.btn.sm{padding:5px 9px;font-size:13px;font-weight:600}\n.btn.bad{background:var(--bad);border-color:var(--bad);color:var(--surface)}\n.btn.bad.ghost{background:transparent;color:var(--bad)}\n.btn.big{font-size:16px;padding:12px 18px}\n.btn[disabled]{opacity:.42;cursor:not-allowed}\nbutton{transition:transform .08s ease,filter .15s ease}\nbutton:active:not([disabled]):not(.mesgul){transform:scale(.96)}\nbutton.mesgul{position:relative;pointer-events:none;cursor:progress;filter:grayscale(.6);opacity:.7;padding-right:30px!important}\nbutton.mesgul::after{content:\"\";position:absolute;right:9px;top:50%;width:13px;height:13px;margin-top:-7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:dondur .7s linear infinite}\n@keyframes dondur{to{transform:rotate(360deg)}}\n@media (prefers-reduced-motion:reduce){button.mesgul::after{animation-duration:2s}}\n.btn:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}\ninput,select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;width:100%}\ninput[type=checkbox]{width:auto}\nlabel.f{font-size:13px;color:var(--muted);display:flex;flex-direction:column;gap:4px;min-width:0}\nlabel.ck{display:inline-flex;align-items:center;gap:6px;font-size:14px}\n.pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;white-space:nowrap}\n.p-ok{background:var(--ok-soft);color:var(--ok)} .p-warn{background:var(--warn-soft);color:var(--warn)} .p-bad{background:var(--bad-soft);color:var(--bad)} .p-acc{background:var(--accent-soft);color:var(--accent)} .p-mut{background:var(--bg);color:var(--muted);border:1px solid var(--line)} .p-hl{background:var(--hl-soft);color:var(--hl)}\ntable{border-collapse:collapse;width:100%}\nth,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:14px}\nth{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:700}\ntd.num,th.num{text-align:right;font-variant-numeric:tabular-nums}\n.scroll{overflow-x:auto}\n.note{padding:12px 14px;border-radius:9px;font-weight:700}\n.n-warn{background:var(--warn-soft);color:var(--warn)} .n-bad{background:var(--bad-soft);color:var(--bad)} .n-ok{background:var(--ok-soft);color:var(--ok)} .n-acc{background:var(--accent-soft);color:var(--accent)} .n-hl{background:var(--hl-soft);color:var(--hl)}\n.note p{margin:4px 0 0;font-weight:400;color:var(--ink)}\n.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}\n.tabs button{font:inherit;font-size:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:7px 12px;border-radius:8px;cursor:pointer}\n.tabs button.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);font-weight:700}\n/* başlangıç */\n.scn{display:flex;flex-direction:column;gap:8px}\n.scn .exp{font-size:13px;color:var(--muted)}\n.scn .no{font-family:var(--f-mono);font-size:12px;color:var(--accent);font-weight:600}\n/* TV */\n.tv{display:grid;gap:20px;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)}\n@media (max-width:860px){.tv{grid-template-columns:1fr}}\n.qrbox{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}\n#qr{background:#FFFFFF;padding:14px;border-radius:10px;line-height:0;min-height:40px}\n#qr img,#qr canvas{max-width:100%;height:auto}\n.code{font-family:var(--f-mono);font-size:58px;font-weight:600;letter-spacing:.12em;line-height:1}\n.bar{height:6px;width:240px;max-width:100%;background:var(--line);border-radius:3px;overflow:hidden}\n.bar i{display:block;height:100%;background:var(--accent)}\n.calls{list-style:none;margin:0;padding:0}\n.calls li{display:grid;grid-template-columns:56px minmax(0,1fr);gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line)}\n.calls li.late{color:var(--hl)}\n.calls .tm{font-family:var(--f-mono);color:var(--muted);font-size:13px}\n.calls b{font-size:17px}\n/* telefon */\n.phone{max-width:430px;margin:0 auto;border:1px solid var(--line);border-radius:26px;padding:22px 18px;background:var(--surface)}\n.phone .big{font-size:26px;font-weight:700;line-height:1.2;text-wrap:balance}\n.res{border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:8px}\n.r-ok{background:var(--ok-soft);color:var(--ok)} .r-acc{background:var(--accent-soft);color:var(--accent)} .r-bad{background:var(--bad-soft);color:var(--bad)} .r-warn{background:var(--warn-soft);color:var(--warn)} .r-hl{background:var(--hl-soft);color:var(--hl)}\n.res p{margin:0;color:var(--ink)}\n.kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 14px;font-size:14px}\n.kv dt{color:var(--muted)} .kv dd{margin:0;font-weight:700}\n/* portal */\n.menu{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}\n.menu button{font:inherit;text-align:left;display:flex;flex-direction:column;gap:4px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;cursor:pointer}\n.menu button b{color:var(--accent);font-size:17px}\n.menu button span{font-size:13px;color:var(--muted)}\n.login{max-width:440px;margin:0 auto}\n/* jüri */\n.jhead{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:baseline;justify-content:space-between}\n.pair{border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--surface)}\n.pair.now{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}\n.pair.done{background:var(--bg)}\n.pair .ph{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;justify-content:space-between}\n.pair .ph b{font-size:16px}\n.mem{border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:8px}\n.mem .nm{font-size:17px;font-weight:700}\n.mem.ghost .nm{text-decoration:line-through;color:var(--muted)}\n.crit{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}\n.crit label{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px}\n.crit input{font-family:var(--f-mono);font-size:16px;padding:7px 9px}\n.crit .hlb input{border-color:var(--hl);background:var(--hl-soft)}\n.crit .pv{font-size:12px;color:var(--hl);font-weight:700}\n.tot{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;font-size:14px}\n.tot .n{font-family:var(--f-mono);font-size:18px;font-weight:600}\n.reasons{font-size:13px;color:var(--bad)}\n.reasons li{margin:2px 0}\n/* yönetim */\n.board th,.board td{font-size:12px;padding:5px 6px;white-space:nowrap}\n.chip{display:block;font-size:12px;padding:3px 6px;border-radius:6px;margin:2px 0;background:var(--bg);border:1px solid var(--line);white-space:nowrap}\n.chip.ok{background:var(--ok-soft);border-color:transparent;color:var(--ok)}\n.chip.run{background:var(--accent-soft);border-color:transparent;color:var(--accent)}\n.chip.bad{background:var(--bad-soft);border-color:transparent;color:var(--bad)}\n.chip.cl{color:var(--muted);border-style:dashed}\n.stats{display:flex;flex-wrap:wrap;gap:8px}\n.dztab{border-collapse:collapse;width:100%;font-size:14px}\n.dztab th,.dztab td{border:1px solid var(--line,#d7e0e0);padding:6px 10px;text-align:center}\n.dztab tr>th:first-child{text-align:left;font-weight:600;white-space:nowrap}\n.dztab tr:first-child th{background:var(--bg)}\n.dztab td:last-child,.dztab tr:first-child th:last-child{font-weight:700;background:var(--bg)}\n.dztab tr.kritik>th:first-child{color:#b3261e}\n.dzn{font:inherit;font-family:var(--f-mono);font-size:16px;font-weight:700;border:1px solid transparent;background:none;cursor:pointer;padding:2px 10px;border-radius:8px;color:inherit;text-decoration:underline dotted}\n.dzn:hover,.dzn.sec{border-color:currentColor}\n.dzn.kr{color:#b3261e;background:#fdecea}\n.dzliste{margin-top:10px}\n.stat{border:1px solid var(--line);border-radius:9px;padding:8px 12px;background:var(--surface);min-width:120px}\n.stat b{display:block;font-family:var(--f-mono);font-size:22px}\n.stat span{font-size:12px;color:var(--muted)}\n.lists{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}\n.lists ul{margin:0;padding-left:18px;font-size:14px}\n.log{max-height:360px;overflow:auto;font-size:13px}\n.log div{padding:4px 0;border-bottom:1px solid var(--line)}\n.proj .jn{font-size:40px;font-weight:700;line-height:1.1}\n.proj .cur{font-size:28px;font-weight:700}\n.inline-confirm{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;padding:4px 8px;border-radius:8px;background:var(--bad-soft);color:var(--bad);font-size:13px;font-weight:700}\n@media (prefers-reduced-motion:reduce){*{transition:none!important}}\n</style>\n<style>body{margin:0}.tvpage .code{font-size:96px}.tvpage .calls b{font-size:22px}.tvpage h2{font-size:28px}</style>\n<style>\n/* 30.10.2026: dil seçimi, sorun bildirme, anket, mesajlar */\ntextarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;width:100%;resize:vertical}\ntextarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px}\n.dil{display:grid;gap:10px}.dil .btn{font-size:20px;padding:14px}\n.secim{display:grid;gap:6px}.secim .ck{padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);justify-content:flex-start;text-align:left;cursor:pointer}\n.ck input[type=radio],.ck input[type=checkbox]{width:auto;flex:0 0 auto;margin:0}\n.secim .ck:has(input:checked){border-color:var(--accent);background:var(--accent-soft);font-weight:600}\n.note.oto{display:flex;flex-direction:column;gap:4px}\n.tvduyuru{margin-bottom:16px;text-align:center}.tvduyuru #duyuruTr{font-size:46px;font-weight:800;line-height:1.15;color:var(--ink)}.tvduyuru .en{font-size:26px;color:var(--ink);opacity:.85}\n.q{padding:10px 0;border-top:1px solid var(--line)}\n.lik{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}\n.lik label{flex:1 1 90px;border:1px solid var(--line);border-radius:8px;padding:8px 6px;cursor:pointer;text-align:center;font-size:14px;background:var(--surface);position:relative}\n.lik label input{position:absolute;opacity:0;pointer-events:none}\n.lik label.sec{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:700}\n.msg{border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface);display:grid;gap:4px}\n.msg.acil{border:2px solid var(--bad);background:var(--bad-soft)}\n.msg .cv{margin-top:4px;padding:8px;border-radius:6px;background:var(--accent-soft)}\n.msg.kapali{opacity:.65}\n.tvpage .en{font-size:15px;opacity:.8;margin-top:-6px}\n.ozet td,.ozet th{font-size:13px;white-space:nowrap}.ozet td.m{white-space:normal;min-width:260px}\n.bar3{display:flex;height:10px;border-radius:5px;overflow:hidden;min-width:90px;background:var(--line)}.bar3 i{display:block}\n.bar3 .a{background:var(--ok)}.bar3 .b{background:var(--warn)}.bar3 .c{background:var(--bad)}\n</style>\n", "Ortak": "<script>\n/* Ortak.html – tüm sayfalarda kullanılan yardımcılar */\nconst $ = s => document.querySelector(s);\nconst esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));\n/* Sunucu çağrısı: Google adresinden açılınca google.script.run; dış sayfadan (GitHub Pages) açılınca çerezsiz fetch.\n   Çerezsiz istek, tarayıcıda birden fazla Google hesabı açık olduğunda Google'ın verdiği \"dosya açılamıyor\" hatasını önler. */\nconst DIS_SAYFA = !(window.google && google.script && google.script.run);\n/* Çift gönderim kilidi (MehDer, 30.10.2026): sunucuya giden bir işlemi başlatan düğme, işlem bitene kadar\n   (en az 0,8 sn) \"işleniyor\" görünür ve yeniden basılamaz. Kilit düğmenin kimliğine (data-… / form) bağlıdır;\n   ekran yeniden çizilse de aynı düğme kilitli kalır. Yalnızca sunucuya gitmeyen düğmeler (sekme, dil, menü) etkilenmez. */\nconst MESGUL = new Map(); let sonBasilan = null;\nfunction dugmeAnahtar(b) {\n  if (!b) return null;\n  const f = b.closest('form');\n  if (f && (b.type === 'submit' || b.tagName === 'FORM')) return 'f:' + (f.dataset.f || f.id || '');\n  const d = Object.entries(b.dataset || {}).filter(([k]) => k !== 'mesgul').sort().map(([k, v]) => k + '=' + v).join('&');\n  return d ? 'a:' + d : null;\n}\nfunction mesgulBoya() { document.querySelectorAll('button').forEach(b => { const k = dugmeAnahtar(b); const m = k && MESGUL.has(k); b.classList.toggle('mesgul', !!m); if (m) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); }); }\nfunction dugmeEngel(e, b) {\n  const k = dugmeAnahtar(b); if (!k) return;\n  if (MESGUL.has(k)) { e.preventDefault(); e.stopImmediatePropagation(); return; }\n  sonBasilan = { k, t: Date.now() }; const sb = sonBasilan; setTimeout(() => { if (sonBasilan === sb) sonBasilan = null; }, 0);   // sunucuya gitmeyen düğme kilit almaz\n}\ndocument.addEventListener('click', e => { const b = e.target.closest('button'); if (b && !(b.type === 'submit' && b.closest('form'))) dugmeEngel(e, b); }, true);\ndocument.addEventListener('submit', e => dugmeEngel(e, e.target), true);\nnew MutationObserver(() => { if (MESGUL.size) mesgulBoya(); }).observe(document.documentElement, { childList: true, subtree: true });\nfunction run(fn, ...a) {\n  const s = sonBasilan && Date.now() - sonBasilan.t < 2000 ? sonBasilan : null; sonBasilan = null;\n  const p = run0(fn, ...a);\n  if (s && !MESGUL.has(s.k)) {\n    const bas = Date.now(); MESGUL.set(s.k, bas); mesgulBoya();\n    const birak = () => setTimeout(() => { if (MESGUL.get(s.k) === bas) { MESGUL.delete(s.k); mesgulBoya(); } }, Math.max(0, 800 - (Date.now() - bas)));\n    p.then(birak, birak);\n  }\n  return p;\n}\n/* Sunucu \"MESGUL\" derse (kilit beklemesi doldu, işlem YAPILMADI) aynı istek 3 kez daha, 1–4 sn arayla gönderilir (yük testi 3.11). */\nasync function run0(fn, ...a) {\n  for (let i = 0; ; i++) {\n    try { return await run1(fn, ...a); }\n    catch (e) { if (!/^MESGUL/.test(String(e && e.message)) || i >= 3) { if (/^MESGUL/.test(String(e && e.message))) throw new Error('Sistem şu an çok yoğun; lütfen birkaç saniye sonra yeniden deneyin.'); throw e; }\n      await new Promise(r => setTimeout(r, 1000 + Math.random() * 3000)); }\n  }\n}\nfunction run1(fn, ...a) {\n  if (!DIS_SAYFA) return new Promise((ok, no) => google.script.run.withSuccessHandler(ok).withFailureHandler(no)[fn](...a));\n  // Otomatik yeniden deneme yok: not gönderme ve şifre denemesi iki kez işlenmesin.\n  return fetch(window.API_ADRESI, { method: 'POST', credentials: 'omit', redirect: 'follow', cache: 'no-store',\n      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, a }) })\n    .then(r => { if (!r.ok) throw new Error('Sunucu yanıt vermedi (' + r.status + ').'); return r.json(); })\n    .then(j => { if (j && j.ok) return j.r; throw new Error((j && j.m) || 'Bilinmeyen hata.'); });\n}\n/* Dış sayfada şablon değerleri (k, c, o, url) adres satırından okunur. */\n(function () {\n  const app = document.getElementById('app'); if (!app || !DIS_SAYFA) return;\n  const p = new URLSearchParams(location.search);\n  ['k', 'c', 'o'].forEach(x => { if (!app.dataset[x] && p.get(x)) app.dataset[x] = p.get(x); });\n  if ('url' in app.dataset && !app.dataset.url) app.dataset.url = new URL('./', location.href).href;\n})();\nconst store = {\n  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }, del(k) { try { localStorage.removeItem(k); } catch (e) { } },\n  sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }, sdel(k) { try { sessionStorage.removeItem(k); } catch (e) { } }\n};\nconst fmt = v => String(v).replace('.', ',');\nfunction editing() { const a = document.activeElement; return a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && $('#app').contains(a); }\n/* Dokunuş/tıklama sürerken ekran yeniden çizilmez: yazı kutusundan düğmeye basınca bekleyen yenileme düğmeyi\n   tıklama tamamlanmadan silmesin (30.10.2026 prova hatası). Tuş bırakıldıktan sonra bekleyen çizim yapılır. */\nlet basili = false;\ndocument.addEventListener('pointerdown', () => { basili = true; }, true);\n['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => setTimeout(() => { basili = false; document.dispatchEvent(new Event('focusout')); }, 60), true));\n/* Sayfa içi onay / bilgi kutusu (tarayıcı confirm/alert yerine; Claude uygulamasının paneli bunları engelliyor – 19.11.2026). */\nfunction sayfaKutusu_(metin, iki, evet, hayir) {\n  return new Promise(ok => {\n    const o = document.createElement('div'); o.className = 'skutu-ort';\n    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';\n    o.innerHTML = '<div role=\"dialog\" aria-modal=\"true\" style=\"background:var(--card,#fff);color:inherit;max-width:520px;width:100%;border-radius:12px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.25)\">'\n      + '<div class=\"skutu-metin\" style=\"white-space:pre-wrap;line-height:1.45;margin-bottom:14px\"></div><div style=\"display:flex;gap:8px;justify-content:flex-end\">'\n      + (iki ? '<button class=\"btn ghost\" data-k=\"0\"></button>' : '') + '<button class=\"btn\" data-k=\"1\"></button></div></div>';\n    o.querySelector('.skutu-metin').textContent = metin;\n    const b1 = o.querySelector('[data-k=\"1\"]'); b1.textContent = evet || (iki ? 'Evet' : 'Tamam');\n    if (iki) o.querySelector('[data-k=\"0\"]').textContent = hayir || 'Vazgeç';\n    const bitir = v => { document.removeEventListener('keydown', tus, true); o.remove(); ok(v); };\n    const tus = e => { if (e.key === 'Escape') { e.preventDefault(); bitir(false); } if (e.key === 'Enter') { e.preventDefault(); bitir(true); } };\n    o.addEventListener('click', e => { const k = e.target.closest && e.target.closest('[data-k]'); if (k) { e.stopPropagation(); bitir(k.dataset.k === '1'); } });\n    document.addEventListener('keydown', tus, true); document.body.appendChild(o); b1.focus();\n  });\n}\nfunction onayla(metin, evet, hayir) { return sayfaKutusu_(String(metin), true, evet, hayir); }\nfunction bilgi(metin) { return sayfaKutusu_(String(metin), false); }\nfunction hataGoster(e) { const m = (e && e.message) || String(e); const el = $('#hata'); if (el) { el.textContent = 'Bağlantı hatası: ' + m + ' Sayfayı yenileyin.'; el.hidden = false; } }\n\n/* Taslak notlar: HESAPLA'ya (writing'de \"tamamlandı\"ya) kadar yalnızca bu tarayıcıda tutulur, sonra tek seferde gönderilir. */\nconst TASLAK = {};\ntry { Object.assign(TASLAK, JSON.parse(store.sget('taslak') || '{}')); } catch (e) { }\nfunction taslakKaydet() { store.sset('taslak', JSON.stringify(TASLAK)); }\nfunction taslak(g, no) { return TASLAK[g + no] || (TASLAK[g + no] = { c: {} }); }\nfunction taslakSil(g, no) { delete TASLAK[g + no]; taslakKaydet(); }\n/** Sunucu görünümü + taslak birleşimi (yalnızca açık bentler ve açık özel durum için taslak geçerli). */\nfunction birlesik(v, g, no) {\n  const t = TASLAK[g + no], c = Object.assign({}, v.c); let oz = v.oz;\n  if (t && !v.sub && v.fin == null) { v.kr.forEach(k => { if (k.acik && t.c[k.k] !== undefined) c[k.k] = t.c[k.k] === '' ? undefined : Number(t.c[k.k]); }); if (v.ozAcik && t.oz !== undefined) oz = t.oz || null; }\n  const top = v.kr.reduce((a, k) => a + (Number.isInteger(c[k.k]) ? c[k.k] : 0), 0);\n  return { c, oz, top };\n}\n/** Not bloğu (speaking: g='S', writing: g='W'). v sunucudaki notGorunum_ çıktısıdır; eşin notları yalnızca fark/negotiation aşamasında gelir. */\nfunction notBlok(v, g, no, butonAd) {\n  if (v.fin != null) return `<div class=\"note n-ok\">Not kesinleşti: ${v.fin === 'G' ? 'G (girmedi)' : `${v.fin} / ${v.max} · ${v.r100} / 100`}${v.avg != null && v.fin !== 'G' && v.avg !== v.fin ? ` <span class=\"small\">(ortalama ${fmt(v.avg)} → ${v.fin})</span>` : ''}</div>`;\n  const ozAd = k => (v.ozler.find(o => o.k === k) || {}).ad || '';\n  const B = birlesik(v, g, no);\n  let durum = '';\n  if (v.neg && v.es) durum = `<div class=\"note n-hl\">Yeniden değerlendirme gerekli: iki hoca farklı özel durum seçti ya da biri özel durum, diğeri bent notu girdi.<p>Sizin seçiminiz: ${v.oz ? esc(ozAd(v.oz)) : 'bent notları'} · Eşiniz: ${v.es.oz ? esc(ozAd(v.es.oz)) : `bent notları (toplam ${v.es.top})`}. Eşinizle görüşüp aynı seçimi yapın.</p></div>`;\n  else if (v.tur > 1 && v.hl.length && v.es) durum = `<div class=\"note n-hl\">Toplam notlarınız arasında 2 puandan fazla fark var, öğrencinin performansını yeniden değerlendirin.<p>Sizin toplamınız: <b>${v.top}</b> · Eşinizin toplamı: <b>${v.es.top}</b>. Turuncu bentlerde notlarınız farklı; gerekirse bütün bentleri değiştirebilirsiniz.</p></div>`;\n  const kr = B.oz ? '' : `<div class=\"crit\">${v.kr.map(c => { const hl = v.hl.includes(c.k); return `<label class=\"${hl ? 'hlb' : ''}\">${esc(c.ad)} (0–${c.max})<input id=\"${g}-${no}-${c.k}\" type=\"number\" min=\"0\" max=\"${c.max}\" step=\"1\" inputmode=\"numeric\" value=\"${B.c[c.k] ?? ''}\" ${c.acik ? '' : 'disabled'} data-not=\"${g}\" data-no=\"${no}\" data-k=\"${c.k}\">${hl && v.es ? `<span class=\"pv\">Eşiniz: ${v.es.c[c.k] ?? '—'}</span>` : ''}</label>`; }).join('')}</div>`;\n  const buton = butonAd ? `<button class=\"btn sm\" data-act=\"${g === 'S' ? 'hesapla' : 'wKaydet'}\" data-no=\"${no}\" ${v.sub ? 'disabled' : ''}>${butonAd}</button>` : '';\n  return `<div class=\"stack\" style=\"gap:8px\">${durum}\n    <label class=\"f\">Özel durum<select id=\"${g}-${no}-oz\" data-not=\"${g}\" data-no=\"${no}\" data-oz=\"1\" ${v.ozAcik ? '' : 'disabled'}><option value=\"\">— yok (bent notu girilecek) —</option>${v.ozler.map(o => `<option value=\"${o.k}\" ${B.oz === o.k ? 'selected' : ''}>${esc(o.ad)}${o.puan == null ? ' (G)' : ` (${o.puan})`}</option>`).join('')}</select></label>\n    ${kr}<div class=\"tot\"><span>Sizin toplamınız: <span class=\"n\" id=\"top-${g}-${no}\">${B.oz ? '—' : B.top}</span> / ${v.max}</span>${v.sub ? '<span class=\"pill p-acc\">Eşinizin notu bekleniyor</span>' : ''}${buton}<span class=\"reasons\" id=\"msg-${g}-${no}\"></span></div></div>`;\n}\n</script>\n", "Ogrenci": "<!DOCTYPE html>\n<html lang=\"tr\"><head><base target=\"_top\"><?!= include('Stil'); ?></head>\n<body>\n<div class=\"wrap\" lang=\"tr\" style=\"max-width:520px\">\n  <header class=\"band\"><div><div class=\"eyebrow\" id=\"eyebrow\">Anadolu Üniversitesi YDYO Hazırlık</div><h1 id=\"baslik\">Speaking Sınavı</h1></div></header>\n  <div class=\"note n-bad\" id=\"hata\" hidden></div>\n  <main id=\"app\" data-c=\"<?= c ?>\"><div class=\"phone muted\">Yükleniyor…</div></main>\n</div>\n<?!= include('Ortak'); ?>\n<?!= include('OgrenciDil'); ?>\n<script>\nconst KOD = $('#app').dataset.c || '';\nlet oturum = null, sonG = null, mesaj = '', yanlis = '', timer = null;\nlet dil = store.get('dil'), dilEkrani = !dil;            // ilk açılışta dil seçimi\nlet skat = null, yazAcik = false, sorunNo = '', sorunMetin = '', sonHata = '', sonNo = '';\nlet sorunAcik = false, sorunMesaj = '', sorunTamam = null, mesajlar = [], anket = { l: [] }, anketMesaj = '';\ntry { oturum = JSON.parse(store.get('ogr') || 'null'); } catch (e) { oturum = null; }\nlet mKey = []; try { mKey = JSON.parse(store.get('ogrmsj') || '[]'); } catch (e) { mKey = []; }\nconst L = () => DIL[dil] || DIL.tr;\n\nfunction ust() { const t = L(); $('#eyebrow').textContent = t.eyebrow; $('#baslik').textContent = t.baslik; document.documentElement.lang = dil || 'tr'; document.title = t.baslik; }\nfunction vDil() {\n  return `<div class=\"phone stack\"><div class=\"big\">Dil seçin · Choose language · Выберите язык</div><div class=\"dil\">\n    ${['tr', 'en', 'ru'].map(d => `<button class=\"btn big\" data-act=\"dil\" data-v=\"${d}\">${DIL[d].ad}</button>`).join('')}</div></div>`;\n}\nfunction dilLink() { return `<button class=\"btn sm ghost\" data-act=\"dilEkrani\">Dil · Language · Язык</button>`; }\n\n/* ---------- sorun bildirme ---------- */\n/* Otomatik cevap arka planda kaydedilir (yönetimde görünmez; sınav sonrası inceleme için). Hata olursa öğrenci etkilenmez. */\nfunction otoKaydet(olay) {\n  const f = skat && OTO.tr[skat]; if (!f) return;\n  const c = { g: oturum ? sonG : null, hata: sonHata, yanlis, no: sorunNo };\n  const durum = c.g ? c.g.kod : (sonHata ? 'giriş hatası: ' + sonHata : (yanlis ? 'yanlış gün' : 'giriş yapılmadı'));\n  try { run('apiOgrOto', oturum ? oturum.no : sorunNo, oturum ? oturum.anahtar : null, skat, f(c), dil || 'tr', durum, olay).catch(() => { }); } catch (e) { }\n}\nfunction vSorunBtn() { return `<button class=\"btn bad ghost\" data-act=\"sorunAc\">${esc(L().sorunBtn)}</button>`; }\nfunction vSorun(girissiz) {\n  const t = L(), O = OTO[dil || 'tr'] || OTO.tr;\n  if (sorunTamam) return `<div class=\"panel stack\"><div class=\"note ${sorunTamam.acil ? 'n-bad' : 'n-ok'}\">${esc(t.gonderildi)}${sorunTamam.acil ? `<br><b>${esc(t.acilNot)}</b>` : ''}</div><div><button class=\"btn sm ghost\" data-act=\"sorunKapat\">OK</button></div></div>`;\n  /* MehDer (30.10.2026, prova): seçilen soruna sistem ekrandaki duruma göre hemen cevap verir; çözülmezse yönetime yazılır.\n     Acil ve Diğer doğrudan yönetime gider. */\n  if (!sorunNo) sorunNo = sonNo || (($('#no') || {}).value || '').replace(/\\D/g, '');\n  const oto = skat && O[skat] ? O[skat]({ g: oturum ? sonG : null, hata: sonHata, yanlis, no: sorunNo }) : '';\n  const yaz = skat && (!oto || yazAcik);\n  return `<form class=\"panel stack\" data-f=\"sorun\"><div class=\"big\">${esc(t.sorunBaslik)}</div>\n    ${girissiz ? `<label class=\"f\">${esc(t.no)}<input id=\"sno\" inputmode=\"numeric\" autocomplete=\"off\" value=\"${esc(sorunNo)}\"></label>` : ''}\n    <div class=\"secim\">${SORUN_SIRA.map(k => `<label class=\"ck\"><input type=\"radio\" name=\"skat\" value=\"${k}\" ${skat === k ? 'checked' : ''}> <span>${esc(t.sorun[k])}</span></label>`).join('')}</div>\n    ${oto && !yazAcik ? `<div class=\"note n-hl oto\"><b>${esc(O.baslik)}</b><div>${esc(oto)}</div></div>\n      <div class=\"row\"><button class=\"btn\" type=\"button\" data-act=\"sorunKapat\">${esc(O.anladim)}</button><button class=\"btn ghost\" type=\"button\" data-act=\"yineYaz\">${esc(O.yineYaz)}</button></div>` : ''}\n    ${yaz ? `<label class=\"f\" id=\"saciklama\">${esc(skat === 'diger' ? t.aciklamaZ : t.aciklama)}<textarea id=\"smetin\" rows=\"3\" maxlength=\"600\">${esc(sorunMetin)}</textarea></label><p class=\"small muted\">${esc(t.yazDil)}</p>` : ''}\n    ${sorunMesaj ? `<div class=\"note n-bad\">${esc(sorunMesaj)}</div>` : ''}\n    ${yaz ? `<div class=\"row\"><button class=\"btn\" type=\"submit\">${esc(t.gonder)}</button><button class=\"btn ghost\" type=\"button\" data-act=\"sorunKapat\">${esc(t.vazgec)}</button></div>`\n      : !skat ? `<div class=\"row\"><button class=\"btn ghost\" type=\"button\" data-act=\"sorunKapat\">${esc(t.vazgec)}</button></div>` : ''}</form>`;\n}\nfunction vMesajlar() {\n  if (!mesajlar.length) return '';\n  const t = L(), dd = { acik: t.d_acik, cevap: t.d_cevap, cozuldu: t.d_cozuldu };\n  return `<div class=\"panel stack\"><h3 style=\"margin:0\">${esc(t.mesajlar)}</h3>${mesajlar.map(m => `<div class=\"msg ${m.acil ? 'acil' : ''}\">\n    <div class=\"small muted\">${esc(m.saat)} · ${esc(t.sorun[m.kat] || m.katAd)} · <b>${esc(dd[m.durum] || m.durum)}</b></div>${m.metin ? `<div>${esc(m.metin)}</div>` : ''}\n    ${m.cev.map(c => `<div class=\"cv\"><div class=\"small muted\">${esc(t.yonetim)} · ${esc(c.saat)}</div><div>${esc(c.ceviri || c.metin)}</div>${c.ceviri ? `<div class=\"small muted\">${esc(c.metin)}</div>` : ''}</div>`).join('')}</div>`).join('')}</div>`;\n}\nfunction vSorunAlani(girissiz, acik) {\n  if (sorunAcik) return vSorun(girissiz);\n  return (acik ? `<div>${vSorunBtn()}</div>` : '') + vMesajlar();\n}\n\n/* ---------- giriş ---------- */\nfunction form() {\n  const t = L();\n  return `<form class=\"phone stack\" id=\"f\" data-f=\"giris\"><div class=\"big\">${esc(t.girisBaslik)}</div>\n    <label class=\"f\">${esc(t.no)}<input id=\"no\" inputmode=\"numeric\" autocomplete=\"off\" required></label>\n    <label class=\"f\">${esc(t.kod)}<input id=\"kod\" inputmode=\"numeric\" autocomplete=\"off\" maxlength=\"4\" value=\"${esc(KOD)}\" required></label>\n    ${mesaj ? `<div class=\"note n-bad\">${esc(mesaj)}</div>` : ''}${yanlis ? `<div class=\"note n-warn\">${esc(yanlis)}</div>` : ''}\n    <button class=\"btn big\" type=\"submit\">${esc(t.giris)}</button>\n    <p class=\"small muted\">${esc(t.telefonYok)}</p></form>\n    <div class=\"stack\" style=\"margin-top:12px\">${vSorunAlani(true, true)}<div>${dilLink()}</div></div>`;\n}\n\n/* ---------- durum ---------- */\nfunction kutu(renk, baslik, ic) { return `<div class=\"res r-${renk}\"><div class=\"big\">${esc(baslik)}</div>${ic || ''}</div>`; }\n/* Uyarılar (MehDer, 31.10–1.11.2026): erken davet, \"Jürin seni bekliyor\", \"Gelmedi\", yönetim mesajı → titreşim + kısa ses (bir kez). */\nlet ALARM = []; try { ALARM = JSON.parse(store.sget('alarm') || '[]'); } catch (e) { ALARM = []; }\nlet bekleyenAlarm = [];\nfunction alarmIste(k) { if (k && ALARM.indexOf(k) < 0) bekleyenAlarm.push(k); }\nfunction alarmCal() {\n  if (!bekleyenAlarm.length) return;\n  if (document.hidden) return;   // ekran kapalıyken titreşim/ses çalmaz: ekran açılınca çalınır (MehDer provası 1.11)\n  bekleyenAlarm.forEach(k => ALARM.push(k)); bekleyenAlarm = []; ALARM = ALARM.slice(-60); store.sset('alarm', JSON.stringify(ALARM));\n  try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) { }\n  try { const A = window.AudioContext || window.webkitAudioContext; if (A) { const c = new A(); [0, 0.3].forEach(d => { const o = c.createOscillator(), gn = c.createGain(); o.frequency.value = 880; gn.gain.value = 0.25; o.connect(gn); gn.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.2); }); } } catch (e) { }\n}\n/* Ekran açık kalsın (Screen Wake Lock): giriş yapmış öğrencinin telefonu sınav bitene kadar kararmasın; destekleyen tarayıcılarda. */\nlet ekranKilidi = null;\nasync function ekranAcikTut() {\n  try { if (!('wakeLock' in navigator) || document.hidden || ekranKilidi) return;\n    const durumKod = sonG && sonG.kod; if (!oturum || durumKod === 'bitti' || durumKod === 'gelmedi') return;\n    ekranKilidi = await navigator.wakeLock.request('screen'); ekranKilidi.addEventListener('release', () => { ekranKilidi = null; }); } catch (e) { ekranKilidi = null; }\n}\ndocument.addEventListener('visibilitychange', () => { if (!document.hidden) { alarmCal(); ekranAcikTut(); } });\ndocument.addEventListener('click', () => { ekranAcikTut(); }, true);\nfunction vYonetimMsj(g) {\n  if (!g.ymsj || !g.ymsj.length) return '';\n  const t = L();\n  return g.ymsj.map(m => { if (!m.onay) alarmIste('ymsj:' + m.id); const ceviri = dil === 'en' && m.en ? m.en : dil === 'ru' && m.ru ? m.ru : '';\n    return `<div class=\"res ${m.onay ? 'r-ok' : 'r-hl'}\"><div class=\"big\">${esc(t.ymsj_b)} · ${esc(m.saat)}</div><p><b>${esc(ceviri || m.metin)}</b></p>${ceviri ? `<p class=\"small muted\">${esc(m.metin)}</p>` : ''}\n      ${m.onay ? `<p class=\"small\">✓ ${esc(t.ymsjOk)}</p>` : `<button class=\"btn big\" data-act=\"ymsjOnay\" data-id=\"${esc(m.id)}\">${esc(t.ymsjOnay)}</button>`}</div>`; }).join('');\n}\nfunction durum(g) {\n  const t = L(); let ana = '', ek = '', ust = vYonetimMsj(g);\n  const p = x => x ? `<p>${esc(x)}</p>` : '';\n  if (g.davet) { alarmIste('davet:' + g.davet.id); ust += `<div class=\"res r-hl\"><div class=\"big\" style=\"font-size:24px\">${esc(t.davet_b(g.davet.saat))}</div>${p(t.davet_m(g.davet.son))}<button class=\"btn big\" data-act=\"davetOnay\">${esc(t.davetOnay)}</button></div>`; }\n  if (g.kayip) ust += `<div class=\"note n-warn\">${esc(t.kayip(g.kayip.saat, g.kayip.kendi))}</div>`;\n  if (g.donus) ust += `<div class=\"note n-warn\">${esc(t.donus(g.donus.saat, g.donus.kendi))}</div>`;\n  /* Ekranı kapatma uyarısı yalnız sıra dışı öğrencilere (erken hazır, davetli, aktarılan, geç kalan, daveti kaçıran) – MehDer 1.11.2026 */\n  const siraDisi = (g.kod === 'bekle' && g.erken) || g.davet || g.kod === 'trans' || g.kod === 'gec' || g.kayip || g.donus;\n  const ekranNotu = siraDisi ? `<div class=\"note n-warn\"><b>${esc(t.ekranAcik)}</b></div>` : '';\n  switch (g.kod) {\n    case 'bekle':\n      ana = kutu('acc', t.bekle_b, p(t.bekle_m(g.saat2)));\n      if (g.erkenSon != null) ek = `<button class=\"btn big ${g.erken ? 'ghost' : ''}\" data-act=\"erken\">${esc(g.erken ? t.erkenKaldir : t.erken)}</button><p class=\"small muted\">${esc(t.erkenNot)}</p>`;\n      break;\n    case 'trans': ana = kutu('warn', t.trans_b, p(t.trans_m(g.saat2))); break;\n    case 'esBekle': ana = kutu('acc', t.esBekle_b, p(t.esBekle_m(g.saat2, g.acilis, g.saatEk, g.acilisEk))); break;\n    case 'trans5': ana = kutu('warn', t.trans5_b, `<dl class=\"kv\"><dt>${esc(t.saat)}</dt><dd>${esc(g.saat)}</dd><dt>${esc(t.es)}</dt><dd>${esc(g.esler.length ? g.esler.join(', ') : t.esQr)}</dd></dl>${p(t.trans5_m(g.saat2, g.acilis, g.saatEk, g.acilisEk))}`); break;\n    case 'esbelli': ana = kutu('acc', t.esbelli_b, `<dl class=\"kv\"><dt>${esc(t.saat)}</dt><dd>${esc(g.saat)}</dd><dt>${esc(t.es)}</dt><dd>${esc(g.esler.length ? g.esler.join(', ') : (g.sabit ? t.esQr : t.esYok))}</dd></dl>${p(t.esbelli_m(g.acilis))}`); break;\n    case 'atandi':\n      ana = kutu('ok', t.juri(g.j.lv, g.j.no, g.j.room), `<dl class=\"kv\"><dt>${esc(t.saat)}</dt><dd>${esc(g.saat)}</dd><dt>${esc(t.es)}</dt><dd>${esc(g.esler.length ? g.esler.join(', ') : (g.sabit ? t.esQr : g.yedekTek ? t.tek : t.esYok))}</dd></dl>${p(t.atandi_m)}`);\n      if (g.gecikme) ek = `<div class=\"note n-warn\">${esc(t.gecikme)}</div>`;\n      if (g.cagri) { alarmIste('cagri:' + g.cagri.id); ust += `<div class=\"res r-bad\"><div class=\"big\" style=\"font-size:26px\">${esc(t.cagri)}</div><p><b>${esc(t.juri(g.j.lv, g.j.no, g.j.room))}</b></p></div>`; }\n      if (g.birlesme) ek += `<div class=\"note n-warn\">${esc(t.birlesme)}</div>`;\n      break;\n    case 'sinavda':\n      ana = kutu('ok', t.sinavda_b, `<p><b>${esc(t.juri(g.j.lv, g.j.no, g.j.room))}</b></p><dl class=\"kv\"><dt>${esc(t.juriHocalari)}</dt><dd>${esc(g.hocalar.join(' – '))}</dd><dt>${esc(t.es)}</dt><dd>${esc(g.esler.length ? g.esler.join(', ') : (g.yedekTek ? t.tek : t.esYok))}</dd></dl>`);\n      break;\n    case 'gec': ana = kutu('hl', t.gec_b, p(t.gec_m(g.son))); break;\n    case 'alinamadi': ana = kutu('bad', t.alinamadi_b); break;\n    case 'red': ana = kutu('bad', t.red_b); break;\n    case 'gelmedi': alarmIste(g.alarm || 'gelmedi'); ana = kutu('bad', t.gelmedi_b, `<p><b>${esc(t.gelmedi_m)}</b></p>`); break;\n    case 'girmedi': ana = kutu('bad', t.girmedi_b(g.gecmis.gun, (dil === 'tr' || !dil) ? g.gecmis.saatYdi : g.gecmis.saat)); break;\n    case 'sabit':\n      if (g.durum === 'bitti') return bas(g) + `<div class=\"phone stack\">${ust}${sabitIcerik(g, t)}</div>` + (g.anket ? `<div style=\"margin-top:10px\">${vAnket(t.s_anketGonder)}</div>` : '') + alt(g);\n      ana = sabitIcerik(g, t); if (g.erkenSon != null) ek = `<button class=\"btn big ${g.erken ? 'ghost' : ''}\" data-act=\"erken\">${esc(g.erken ? t.erkenKaldir : t.erken)}</button><p class=\"small muted\">${esc(t.erkenNot)}</p>`; break;\n    case 'kagitBitti':\n      if (g.anket) return bas(g) + ust + `<div class=\"note n-ok\"><b>${esc(t.bitti_b)}</b> ${esc(t.kagit_m)}</div><div class=\"note n-warn\"><b>${esc(t.anketKagit)}</b></div>` + vAnket() + alt(g);\n      ana = kutu('ok', g.gecmis ? t.gecmis_b(g.gecmis.gun, '', (dil === 'tr' || !dil) ? g.gecmis.saatYdi : g.gecmis.saat) : t.bitti_b, p(t.kagit_m)); break;\n    case 'bitti':\n      if (g.gecmis) ust += `<div class=\"note n-acc\">${esc(t.gecmis_b(g.gecmis.gun, '', (dil === 'tr' || !dil) ? g.gecmis.saatYdi : g.gecmis.saat))}</div>`;\n      if (g.anket) return bas(g) + ust + `<div class=\"note n-warn\"><b>${esc(t.anketOnce)}</b></div>` + vAnket() + alt(g);\n      if (!g.yayin) ana = kutu('ok', t.bitti_b, p(t.bitti_bekle));\n      else ana = kutu('ok', t.not_b, `<div style=\"font-size:44px;font-weight:700;line-height:1.1;margin:6px 0\">${esc(g.not.fin)} / ${esc(g.not.max)}</div><div class=\"big\">${esc(g.not.r100)} / 100</div><p>${esc(t.anasis)}</p>`);\n      break;\n    default: ana = g.baslik ? kutu(g.renk || 'acc', g.baslik, p(g.metin)) : '';\n  }\n  return bas(g) + `<div class=\"phone stack\">${ust}${ana}${ek}${ekranNotu}<p class=\"small muted\">${esc(t.yenilenir)}</p></div>` + `<div class=\"stack\" style=\"margin-top:12px\">${vSorunAlani(false, g.sorunAcik)}</div>` + alt(g);\n}\nfunction bas(g) { return `<div class=\"phone\" style=\"margin-bottom:10px\"><div class=\"small muted\">${esc(g.no)}</div><div class=\"big\">${esc(g.ad)}</div><div class=\"small muted\">${esc(g.lv)} · ${esc(g.cls)} · ${esc(L().grup)} ${esc(g.grup)}</div></div>`; }\nfunction alt() { return `<div class=\"row\" style=\"margin-top:12px;justify-content:space-between\">${dilLink()}<button class=\"btn sm ghost\" data-act=\"cik\">${esc(L().baskaOgr)}</button></div>`; }\n\n/* ---------- anket ---------- */\nfunction rad(ad, v, etiket, sec) { return `<label class=\"${sec ? 'sec' : ''}\"><input type=\"radio\" name=\"${ad}\" value=\"${v}\" ${sec ? 'checked' : ''}>${esc(etiket)}</label>`; }\nfunction vIzin(ad, val) { const t = L(); return `<div class=\"small\" style=\"margin-top:6px\">${esc(t.isimSor)}</div><div class=\"lik\">${rad(ad, '1', t.evet, val === true)}${rad(ad, '0', t.hayir, val === false)}</div>`; }\n/* Alternatif 5 (sabit plan) öğrenci ekranı – MehDer 10–11.11.2026 */\nfunction sabitIcerik(g, t) {\n  const p = x => x ? `<p>${esc(x)}</p>` : '';\n  const katY = k => !k ? '' : dil === 'en' ? (/^Zemin/.test(k) ? 'Ground floor' : 'Floor ' + k.split('.')[0]) : dil === 'ru' ? (/^Zemin/.test(k) ? 'Цокольный этаж' : k.split('.')[0] + '-й этаж') : k;\n  const notY = n => !n ? '' : n.t === 'akt' ? t.s_akt(n.s) : t.s_bir(n.j);\n  const etik = g.esler.length > 1 ? [t.s_es1, t.s_es2, t.s_es3] : [t.s_es];\n  const esSat = () => g.esler.map((e, i) => `<dt>${esc(etik[i] || t.s_es)}</dt><dd>${e.d === 'ok' ? `<b>${esc(e.ad)}</b>` : `<i class=\"muted\">${esc(e.d === 'gelmedi' ? t.s_gelmedi : t.s_bekleniyor)}</i>`}${e.n ? ` <span class=\"small muted\">(${esc(notY(e.n))})</span>` : ''}</dd>`).join('');\n  const kv = (saatli) => `<dl class=\"kv\">${saatli ? `<dt>${esc(t.saat)}</dt><dd>${esc(g.saat)}</dd>` : ''}${esSat()}</dl>`;\n  const kisi = g.esler.length > 1 ? `<p><b>${esc(g.kisi === 3 ? t.s_kisi3 : t.s_kisi2)}</b></p>` : '';\n  const mola = g.mola ? `<div class=\"note n-warn\"><b>${esc(t.s_mola(g.mola.a, g.mola.b, g.mola.ek))}</b></div>` : '';\n  const ank = `<p class=\"small muted\">${esc(t.s_anketNot)}</p>`;\n  const takip = p(t.s_acilis(g.acilis, g.acilisEk));\n  const juriKutu = () => kutu('ok', t.juri(g.j.lv, g.j.no, g.j.room) + (g.j.kat ? ' · ' + katY(g.j.kat) : ''), kv(true) + kisi);\n  switch (g.durum) {\n    case 'bekle': return mola + kutu('acc', t.esBekle_b, kv(true) + kisi + p(t.s_bekle_m) + takip) + ank;\n    case 'esbelli': return mola + kutu('acc', t.esbelli_b, kv(true) + kisi + takip) + ank;\n    case 'trans': return mola + kutu('warn', t.s_trans_b(g.saat), kv(false) + takip) + ank;\n    case 'esYok': return kutu('warn', t.s_esYok_b, p(g.sonraki ? t.s_esYok_m(g.sinir, g.sinirEk, g.sonraki) : t.s_esYok_son(g.sinir, g.sinirEk)) + `<p><b>${esc(t.s_takip)}</b></p>`) + ank;\n    case 'ucluBekle': return mola + kutu('acc', t.s_ucluBekle_b, kv(true) + kisi + p(t.s_ucluBekle_m(g.ucluSaat))) + ank;\n    case 'juri': return mola + (g.ucluEksik ? `<div class=\"note n-warn\">${esc(t.s_ucluEksik)}<p><b>${esc(t.s_ucluSoz)}</b></p></div>` : '') + (g.birlesim ? `<div class=\"note n-warn\"><b>${esc(t.s_birlesim)}</b></div>` : '') + juriKutu() + p(t.atandi_m) + ank;\n    case 'masa': return kutu('bad', t.s_masa_b, `<p><b>${esc(t.s_masa_m)}</b></p>`);\n    case 'bitti': return g.anket ? juriKutu() + `<div class=\"note n-warn\"><b>${esc(t.s_bittiNot)}</b></div>` : kutu('ok', t.s_tesekkur, '');\n  }\n  return '';\n}\nfunction vAnket(gonderEtiket) {\n  const t = L(), a = anket;\n  const maddeler = t.madde.map((m, i) => `<div class=\"q\"><div>${i + 1}. ${esc(m)}</div><div class=\"lik\">${t.olcek.map((o, v) => rad('m' + i, v, o, a.l[i] === v)).join('')}</div></div>`).join('');\n  const sorun = `<div class=\"q\"><div>9. ${esc(t.a_sorun)}</div><div class=\"lik\">${rad('sorun', '1', t.evet, a.sorun === true)}${rad('sorun', '0', t.hayir, a.sorun === false)}</div>\n    ${a.sorun ? `<label class=\"f\" style=\"margin-top:6px\">${esc(t.a_sorunAcikla)}<textarea id=\"aSorun\" rows=\"3\" maxlength=\"1000\">${esc(a.sorunMetin || '')}</textarea></label>${vIzin('sIzin', a.sorunIzin)}` : ''}</div>`;\n  const diger = `<div class=\"q\"><div>10. ${esc(t.a_diger)} <span class=\"small muted\">(${esc(t.istege)})</span></div><textarea id=\"aDiger\" rows=\"3\" maxlength=\"1000\">${esc(a.diger || '')}</textarea>\n    ${(a.diger || '').trim() ? vIzin('dIzin', a.digerIzin) : ''}<p class=\"small muted\">${esc(t.yazDil)}</p></div>`;\n  return `<form class=\"phone stack\" data-f=\"anket\"><div class=\"big\">${esc(t.anketBaslik)}</div><div class=\"note n-acc\">${esc(t.anketUst1)}</div><p class=\"small muted\">${esc(t.anketUst2)}</p>\n    ${maddeler}${sorun}${diger}${anketMesaj ? `<div class=\"note n-bad\">${esc(anketMesaj)}</div>` : ''}<button class=\"btn big\" type=\"submit\">${esc(gonderEtiket || t.anketGonder)}</button></form>`;\n}\n\n/* ---------- çizim ve sunucu ---------- */\nfunction render() {\n  ust();\n  if (dilEkrani) { $('#app').innerHTML = vDil(); return; }\n  $('#app').innerHTML = oturum && sonG ? durum(sonG) : form();\n  alarmCal(); ekranAcikTut();\n}\nfunction errMetin(r) { const t = L(); return ({ kod: t.e_kod, liste: t.e_liste, gunyok: t.e_gunyok, sinir: t.e_sinir, numara: t.e_numara, aciklama: t.e_aciklama, sinavda: t.e_sinavda, yogun: t.e_yogun, eksik: t.e_anket })[r.errKod] || r.err; }\nasync function mesajYenile() {\n  if (!mKey.length) return;\n  try { const r = await run('apiOgrMesajlar', mKey, dil || 'tr'); mesajlar = (r.m || []).sort((a, b) => b.ts - a.ts); } catch (e) { }\n}\nasync function yenile() {\n  await mesajYenile();\n  if (oturum) {\n    try { const r = await run('apiOgrenciDurum', oturum.no, oturum.anahtar); if (r.err) { store.del('ogr'); oturum = null; } else sonG = r.g; $('#hata').hidden = true; } catch (e) { hataGoster(e); }\n  }\n  if (!editing() && !basili && !dilEkrani) render();\n}\ndocument.addEventListener('submit', async e => {\n  e.preventDefault(); const f = e.target.dataset.f, t = L();\n  const b = e.target.querySelector('button[type=submit]'); b.disabled = true; const eski = b.textContent; b.textContent = t.bekleyin;\n  try {\n    if (f === 'giris') {\n      mesaj = ''; yanlis = '';\n      sonNo = $('#no').value.replace(/\\D/g, ''); const r = await run('apiOgrenciGiris', $('#no').value, $('#kod').value);\n      sonHata = r.errKod || (r.err ? 'diger' : ''); if (r.err) mesaj = errMetin(r); else if (r.wrong) yanlis = r.wrongGecmis ? t.gecmisGun(r.wrongGun, '', dil === 'tr' || !dil ? r.wrongSaatYdi : r.wrongSaat, r.wrongKagit) : t.yanlisGun(r.wrongGun, '', r.wrongSaat);\n      else { oturum = { no: r.no, anahtar: r.anahtar }; store.set('ogr', JSON.stringify(oturum)); sonG = r.g; }\n    } else if (f === 'sorun') {\n      sorunMesaj = '';\n      const kat = skat, metin = ($('#smetin') ? $('#smetin').value : sorunMetin).trim();\n      const no = oturum ? oturum.no : ($('#sno') ? $('#sno').value.replace(/\\D/g, '') : '');\n      if (!no) sorunMesaj = t.e_numara; else if (!kat) sorunMesaj = t.e_sec; else if (kat === 'diger' && !metin) sorunMesaj = t.e_aciklama;\n      else {\n        const r = await run('apiOgrSorun', no, oturum ? oturum.anahtar : null, kat, metin, dil || 'tr');\n        if (r.err) sorunMesaj = errMetin(r);\n        else { mKey.push({ id: r.id, k: r.k }); mKey = mKey.slice(-10); store.set('ogrmsj', JSON.stringify(mKey)); sorunTamam = { acil: r.acil }; await mesajYenile(); }\n      }\n    } else if (f === 'anket') {\n      anketOku(); anketMesaj = '';\n      const a = anket;\n      if (a.l.filter(x => x != null).length !== 8 || a.sorun == null) anketMesaj = t.e_anket;\n      else if (a.sorun && !(a.sorunMetin || '').trim()) anketMesaj = t.e_sorunMetin;\n      else if ((a.sorun && a.sorunIzin == null) || ((a.diger || '').trim() && a.digerIzin == null)) anketMesaj = t.e_izin;\n      else {\n        const r = await run('apiOgrAnket', oturum.no, oturum.anahtar, { l: a.l, sorun: a.sorun, sorunMetin: a.sorunMetin || '', sorunIzin: !!a.sorunIzin, diger: a.diger || '', digerIzin: !!a.digerIzin, dil: dil || 'tr' });\n        if (r.err) anketMesaj = errMetin(r); else { sonG = r.g; anket = { l: [] }; }\n      }\n    }\n  } catch (err) { hataGoster(err); }\n  b.disabled = false; b.textContent = eski;\n  render();\n});\nfunction anketOku() {\n  const sec = n => { const x = document.querySelector(`input[name=\"${n}\"]:checked`); return x ? Number(x.value) : null; };\n  for (let i = 0; i < 8; i++) { const v = sec('m' + i); if (v != null) anket.l[i] = v; }\n  const s = sec('sorun'); if (s != null) anket.sorun = s === 1;\n  if ($('#aSorun')) anket.sorunMetin = $('#aSorun').value;\n  if ($('#aDiger')) anket.diger = $('#aDiger').value;\n  const si = sec('sIzin'); if (si != null) anket.sorunIzin = si === 1;\n  const di = sec('dIzin'); if (di != null) anket.digerIzin = di === 1;\n}\ndocument.addEventListener('change', e => {\n  if (e.target.closest('form[data-f=anket]')) { anketOku(); if (e.target.tagName === 'TEXTAREA') return; render(); return; }   // yazı kutusundan çıkınca yeniden çizme: aynı anda yapılan dokunuş kaybolmasın\n  if (e.target.name === 'skat') { if ($('#smetin')) sorunMetin = $('#smetin').value; skat = e.target.value; yazAcik = false; sorunMesaj = ''; render(); otoKaydet('goster'); }\n});\ndocument.addEventListener('input', e => {\n  if (e.target.id === 'sno') sorunNo = e.target.value.replace(/\\D/g, '');\n  if (e.target.id === 'smetin') sorunMetin = e.target.value;\n  if (e.target.id === 'aDiger') { const vardi = !!(anket.diger || '').trim(); anket.diger = e.target.value; if (vardi !== !!anket.diger.trim()) { anketOku(); render(); const el = $('#aDiger'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }\n});\ndocument.addEventListener('click', async e => {\n  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;\n  if (a === 'dil') { dil = b.dataset.v; store.set('dil', dil); dilEkrani = false; return render(); }\n  if (a === 'dilEkrani') { dilEkrani = true; return render(); }\n  if (a === 'sorunAc') { sorunNo = ''; sorunAcik = true; sorunTamam = null; sorunMesaj = ''; skat = null; yazAcik = false; sorunMetin = ''; return render(); }\n  if (a === 'yineYaz') { otoKaydet('yaz'); yazAcik = true; render(); const el = $('#smetin'); if (el) el.focus(); return; }\n  if (a === 'sorunKapat') { sorunAcik = false; sorunTamam = null; sorunMesaj = ''; skat = null; yazAcik = false; sorunMetin = ''; return render(); }\n  if (a === 'cik') { store.del('ogr'); oturum = null; sonG = null; anket = { l: [] }; return render(); }\n  if (a === 'davetOnay') { b.disabled = true; try { const r = await run('apiErkenOnay', oturum.no, oturum.anahtar); if (r.g) sonG = r.g; if (r.err) mesaj = r.err; } catch (err) { hataGoster(err); } return render(); }\n  if (a === 'ymsjOnay') { b.disabled = true; try { const r = await run('apiOgrOnay', oturum.no, oturum.anahtar, b.dataset.id); if (r.g) sonG = r.g; } catch (err) { hataGoster(err); } return render(); }\n  if (a === 'erken') { b.disabled = true; try { const r = await run('apiErken', oturum.no, oturum.anahtar); if (r.g) sonG = r.g; } catch (err) { hataGoster(err); } render(); }\n});\nrender(); yenile(); timer = setInterval(yenile, 12000);\n</script>\n</body></html>\n", "OgrenciDil": "<script>\n/* OgrenciDil.html – öğrenci ekranı metinleri: Türkçe, İngilizce, Rusça (30.10.2026).\n   Rusça metinler gerçek sınavdan önce Rusça hocası tarafından kontrol edilecek (Word dosyası: Öğrenci Ekranı ve Anket Metinleri TR-EN-RU). */\nconst DIL = {\n  tr: {\n    ad: 'Türkçe', eyebrow: 'Anadolu Üniversitesi YDYO Hazırlık', baslik: 'Speaking Sınavı', dilSec: 'Dil seçin',\n    girisBaslik: 'Speaking sınavına giriş', no: 'Öğrenci numarası', kod: \"TV'deki 4 haneli kod\", giris: 'Giriş yap', bekleyin: 'Bekleyin…',\n    telefonYok: \"Telefonun yoksa ya da giriş yapamıyorsan kantin tarafındaki TV'nin önündeki kayıt masasına git.\",\n    e_kod: \"Kod hatalı ya da süresi geçmiş. TV'deki QR kodunu yeniden okut ya da güncel kodu yaz.\",\n    e_liste: 'Bu numara sınav listesinde yok. Numaranı kontrol et ya da kayıt masasına git.', e_gunyok: 'Bugün speaking sınavı yok.',\n    yanlisGun: (g, t, s) => `Senin sınavın: ${g}${t ? ' (' + t + ')' : ''}, saat ${s}. Bugün sınavın yok.`,\n    gecmisGun: (g, t, s, kagit) => `Senin sınavın ${g}${t ? ' (' + t + ')' : ''}, saat ${s} ve sona erdi. ` + (kagit ? \"Notun AnaSİS'te duyurulacaktır.\" : \"Notun bu cihazda görünmüyor; notunu AnaSİS'ten öğrenebilirsin.\"),\n    gecmis_b: (g, t, s) => `Senin sınavın ${g}${t ? ' (' + t + ')' : ''}, saat ${s} ve sona erdi.`,\n    girmedi_b: (g, s) => `Senin sınavın ${g}, saat ${s}; sınava girmedin.`,\n    kagit_b: 'Sınavın sona erdi', kagit_m: \"Notun AnaSİS'te duyurulacaktır.\",\n    anketOnce: 'Notlar yayımlandı. Notunu görmeden önce anketi doldurman gerekiyor.',\n    grup: 'grup', bekle_b: 'Eşleştirme bekleniyor', bekle_m: s => `Sınav saatin: ${s}. Eşin belli olunca burada görünecek. Ekranını açık tut.`,\n    esbelli_b: 'Eşin belli oldu', esbelli_m: s => `Jüri numaran ve dersliğin sınavına 5 dakika kala (saat ${s}) burada görünecek. Ekranını açık tut.`,\n    erken: 'Erken girmeye hazırım', erkenKaldir: '\"Erken girmeye hazırım\" işaretini kaldır', erkenNot: 'Erken girmeye hazırsan, daha önceki bir grupta yer açılırsa davet edilirsin. Davet gelince telefonun titrer; onaylarsan o saatte girersin.',\n    davet_b: s => `${s}'te sınava girebilirsin!`, davet_m: son => `Girmek istiyorsan ${son}'e kadar onayla. Onaylamazsan kendi saatinde girersin.`, davetOnay: 'Onaylıyorum, geliyorum',\n    kayip: (s, k) => `${s}'te girme hakkını kaybettin; şu an senin için ilan edilen kendi saatin (${k}) geçerli.`,\n    donus: (s, k) => `${s} slotunda eşin olmadığı için kendi saatine (${k}) döndün. Telefon ekranını takip et.`,\n    cagri: 'Jürin seni bekliyor!', birlesme: 'Eşin değişti; jürin ve dersliğin yukarıda. Hemen o dersliğe git.',\n    ymsj_b: 'Yönetimden mesaj', ymsjOnay: 'Tamam, bana denileni yapıyorum', ymsjOk: 'Onayladın – teşekkürler',\n    esBekle_b: 'Eşin bekleniyor', esBekle_m: (s, a, se, ae) => `Sınav saatin: ${s}. Eşin QR kodunu okuttuğunda adı burada görünecek. Jüri ve derslik saat ${a}${ae} burada görünecek. Ekranını açık tut.`,\n    trans5_b: 'Eşin gelmedi', trans5_m: (s, a, se, ae) => `Saat ${s} oturumunda başka bir çiftle sınava gireceksin; ${s}${se} hazır ol. Yeni eşlerin QR okuttuğunda adları burada görünecek. Jüri ve derslik saat ${a}${ae} görünecek.`,\n    esQr: 'Henüz QR okutmadı', anketKagit: 'Lütfen kısa anketi doldur.',\n    s_es: 'Eşin', s_es1: 'Birinci eşin', s_es2: 'İkinci eşin', s_es3: 'Üçüncü eşin', s_bekleniyor: 'bekleniyor', s_gelmedi: 'gelmedi',\n    s_akt: s => `${s} oturumundan aktarıldı`, s_bir: j => `${j} jürisinden alındı`,\n    s_kisi3: 'Sınava 3 kişi gireceksiniz.', s_kisi2: 'Sınava 2 kişi gireceksiniz.',\n    s_mola: (a, b, be) => `Jüriler ${a}–${b} arasında moladadır. Sınavların ${b}${be} başlayacak.`,\n    s_anketNot: 'Sınavından çıkınca bu sayfaya dön ve kısa anketi doldur.',\n    s_bekle_m: 'Eşin QR kodunu okuttuğunda adı burada görünecek.',\n    s_acilis: (a, ae) => `Jüri ve derslik saat ${a}${ae} burada ve TV'de görünecek; telefonunu ve TV'yi takip et.`,\n    s_trans_b: s => `Eşin gelmedi. Saat ${s} oturumunda başka bir çiftle 3 kişi gireceksin.`,\n    s_esYok_b: 'Eşin henüz QR okutmadı',\n    s_esYok_m: (l, le, n) => `Eşin ${l}${le} kadar gelmezse ${n} oturumunda başka bir çiftle sınava gireceksin.`,\n    s_esYok_son: (l, le) => `Eşin ${l}${le} kadar gelmezse seni başka öğrencilerle birleştireceğiz.`,\n    s_takip: \"Telefonunu ve TV'yi takip etmeye devam et.\",\n    s_birlesim: 'Eşin gelmedi; seni başka öğrencilerle birleştirdik.',\n    s_ucluBekle_b: '3. öğrenci bekleniyor', s_ucluBekle_m: s => `Jüri ve derslik ${s}'de burada görünecek.`,\n    s_ucluEksik: 'Sınava normalde 3\\'lü gireceksiniz. Şimdi dersliğinize gidin ve jürinize şunu söyleyin:', s_ucluSoz: '\"Sınava normalde 3\\'lü gireceğiz, ama 3. öğrenci henüz gelmedi. Sınav saatini 5 dakika geçene kadar beklememiz söylendi.\"',\n    s_masa_b: 'Eşin gelmedi', s_masa_m: 'Lütfen hemen kayıt masasına gel.',\n    s_bittiNot: 'Sınavın bittiyse lütfen aşağıdaki kısa anketi doldur. Sınavın henüz başlamadıysa dersliğin önünde sıranı bekle; anketi sınavdan sonra doldurabilirsin.',\n    s_tesekkur: \"Teşekkürler. Notun AnaSİS'te duyurulacaktır.\", s_anketGonder: 'Anketi gönder',\n    trans_b: 'Eşleştirme yapılamadı', trans_m: s => `Bir sonraki slotta (${s}) gireceksin; o slotta eşleştirmede ilk sıradasın. Telefon ekranını takip et; eşin belirlenince jürin burada görünecek.`,\n    juri: (lv, n, r) => `${lv} · Jüri ${n} · Derslik ${r}`, saat: 'Saat', es: 'Eşin', tek: 'Tek başına gireceksin', esYok: 'Henüz belli değil; sistem eşleştirecek', ekranAcik: 'Telefonunun ekranını kapatma: sistem seni bu ekrandan çağıracak.',\n    atandi_m: 'Dersliğin önünde bekle; jüri seni çağıracak.', gecikme: 'Jüriniz birkaç dakika gecikecek, kapıda bekleyin.',\n    sinavda_b: 'Sınavdasın', juriHocalari: 'Jüri hocaları',\n    gec_b: 'Sınava geç kaldın', gec_m: s => `Bugün saat ${s}'e kadar eğer boş jüri olursa sınava çağırılabilirsin. Bu nedenle cep telefonunda sınav ekranını takip et. Ancak boş jüri olmazsa sınava alınamazsın.`,\n    alinamadi_b: 'Bugün boş jüri olmadığı için sınava alınamadın', red_b: 'Sınav saatinden 5 dakikadan fazla geç kaldığın için konuşma sınavına giremezsin',\n    gelmedi_b: 'Jüri seni \"Gelmedi\" olarak işaretledi', gelmedi_m: 'Hemen kantin tarafındaki okul girişinin oradaki kayıt masasına git.',\n    bitti_b: 'Sınavın tamamlandı', bitti_bekle: 'Notun gün içinde bu sayfada yayımlanacak. Notunu görmek için bu sayfayı aynı telefonda ve aynı tarayıcıda tekrar aç. Sayfayı yer imlerine ekleyebilirsin.',\n    not_b: 'Speaking notun', anasis: \"Kesin sonuç AnaSİS'te duyurulacaktır. Notunuzu AnaSİS'ten kontrol edin.\",\n    yenilenir: 'Bu ekran kendiliğinden yenilenir; kapatma.', baskaOgr: 'Bu telefonda başka öğrenci',\n    sorunBtn: 'Sorun yaşıyorum / Yardım istiyorum', sorunBaslik: 'Sorununu seç', aciklama: 'Kısa açıklama (isteğe bağlı)', aciklamaZ: 'Kısa açıklama (zorunlu)',\n    yazDil: 'Türkçe, İngilizce ya da Rusça yazabilirsin.', gonder: 'Gönder', vazgec: 'Vazgeç',\n    gonderildi: 'Mesajın yönetime iletildi. Cevap bu ekranda görünecek.', acilNot: 'Hemen kayıt masasına git.',\n    mesajlar: 'Mesajların', d_acik: 'Cevap bekleniyor', d_cevap: 'Cevaplandı', d_cozuldu: 'Çözüldü', yonetim: 'Yönetim',\n    e_sinir: 'Cevap bekleyen 3 mesajın var. Cevap gelince yeni mesaj gönderebilirsin.', e_numara: 'Önce öğrenci numaranı yaz.',\n    e_aciklama: 'Kısa bir açıklama yaz.', e_sec: 'Bir seçenek seç.', e_sinavda: 'Sınavdasın; bildirim kapalı.', e_yogun: 'Çok fazla bildirim var. Kayıt masasına git.',\n    sorun: { kod: 'Kodu girdim, kabul edilmiyor', numara: 'Numaram listede görünmüyor', gun: 'Ekranda yanlış gün ya da düzey görünüyor',\n      bekleme: 'Uzun süredir bekliyorum, jüri bilgisi gelmedi', derslik: 'Dersliği bulamıyorum', es: 'Eşim gelmedi ya da eşimi bulamıyorum',\n      acil: 'Acil durum / sağlık sorunu', diger: 'Diğer' },\n    anketBaslik: 'Sınav sonu anketi',\n    anketUst1: 'Anketi tamamladıktan sonra konuşma sınavı notunu görebilirsin. Vereceğin cevaplar konuşma sınavı notunu etkilemez.',\n    anketUst2: 'Cevapların özet olarak raporlanır. Yazdığın görüşlerde isminin okul yönetimine iletilip iletilmeyeceğini sen seçersin.',\n    olcek: ['Katılıyorum', 'Kısmen katılıyorum', 'Katılmıyorum'], evet: 'Evet', hayir: 'Hayır',\n    madde: ['Sınav günü yönlendirmeler (QR, telefon ekranı, TV) anlaşılırdı.', 'Bekleme sürem makuldü.', 'Jüri ve sınav ortamı düzenli ve sınav için uygundu.',\n      'Sınav sırasında hocalar yardımcı ve güler yüzlüydü.', 'Sınav sırasında hocaların tavırları motivasyonumu olumsuz etkiledi.',\n      'Sınav soruları/görevleri derste çalıştıklarıma uygundu.', 'Konuşmalarımın kamera kaydına alınması strese girmeme neden oldu.',\n      'Konuşmalarımın kamera kaydına alınması beni olumsuz etkilemedi.'],\n    a_sorun: 'Bazı sorunlar yaşadım.', a_sorunAcikla: 'Kısaca açıkla', a_diger: 'Diğer görüş ve önerilerim', istege: 'isteğe bağlı',\n    isimSor: 'Bu konuda isminizi okul yönetimine iletelim mi?', anketGonder: 'Anketi gönder ve notumu göster',\n    e_anket: 'Lütfen bütün maddeleri cevapla.', e_izin: 'İsim sorusunu da cevapla.', e_sorunMetin: 'Yaşadığın sorunu kısaca açıkla.'\n  },\n  en: {\n    ad: 'English', eyebrow: 'Anadolu University · Preparatory Programme', baslik: 'Speaking Exam', dilSec: 'Choose language',\n    girisBaslik: 'Speaking exam check-in', no: 'Student number', kod: '4-digit code on the TV screen', giris: 'Check in', bekleyin: 'Please wait…',\n    telefonYok: 'If you have no phone or cannot check in, go to the registration desk in front of the TV near the canteen.',\n    e_kod: 'The code is wrong or has expired. Scan the QR code on the TV again or type the current code.',\n    e_liste: 'This number is not on the exam list. Check your number or go to the registration desk.', e_gunyok: 'There is no speaking exam today.',\n    yanlisGun: (g, t, s) => `Your exam is on: ${g}${t ? ' (' + t + ')' : ''}, at ${s}. You do not have an exam today.`,\n    gecmisGun: (g, t, s, kagit) => `Your exam was on ${g}${t ? ' (' + t + ')' : ''} at ${s} and it is over. ` + (kagit ? 'Your score will be announced on AnaSİS.' : 'Your score is not shown on this device; you can see it on AnaSİS.'),\n    gecmis_b: (g, t, s) => `Your exam was on ${g}${t ? ' (' + t + ')' : ''} at ${s} and it is over.`,\n    girmedi_b: (g, s) => `Your exam was on ${g} at ${s}; you did not take the exam.`,\n    kagit_b: 'Your exam is over', kagit_m: 'Your score will be announced on AnaSİS.',\n    anketOnce: 'Scores have been published. You need to complete the survey before you can see your score.',\n    grup: 'group', bekle_b: 'Waiting for a partner', bekle_m: s => `Your exam time: ${s}. Your partner will appear here once matched. Keep this screen open.`,\n    esbelli_b: 'Your partner is set', esbelli_m: s => `Your jury number and classroom will appear here 5 minutes before your exam (at ${s}). Keep this screen open.`,\n    erken: \"I'm ready to go in early\", erkenKaldir: 'Cancel \"ready to go in early\"', erkenNot: 'If you are ready early, you will be invited when a place opens in an earlier group. Your phone will vibrate; if you confirm, you take the exam at that time.',\n    davet_b: s => `You can take the exam at ${s}!`, davet_m: son => `If you want to go in, confirm before ${son}. If you do not confirm, you take the exam at your own time.`, davetOnay: 'I confirm, I am coming',\n    kayip: (s, k) => `You lost your place at ${s}; your own announced time (${k}) is still valid.`,\n    donus: (s, k) => `You had no partner in the ${s} slot, so you are back to your own time (${k}). Keep watching your phone.`,\n    cagri: 'Your jury is waiting for you!', birlesme: 'Your partner has changed; your jury and room are shown above. Go to that room now.',\n    ymsj_b: 'Message from the administration', ymsjOnay: 'OK, I am doing what I was told', ymsjOk: 'Confirmed – thank you',\n    esBekle_b: 'Waiting for your partner', esBekle_m: (s, a) => `Your exam time: ${s}. Your partner's name will appear here once they scan the QR code. Your jury and room will appear here at ${a}. Keep this screen open.`,\n    trans5_b: 'Your partner did not come', trans5_m: (s, a) => `You will take the exam at ${s} with another pair; be ready at ${s}. Your new partners' names will appear here when they scan the QR code. Your jury and room will appear at ${a}.`,\n    esQr: 'Has not scanned yet', anketKagit: 'Please fill in the short survey.',\n    s_es: 'Your partner', s_es1: 'First partner', s_es2: 'Second partner', s_es3: 'Third partner', s_bekleniyor: 'waiting', s_gelmedi: 'did not come',\n    s_akt: s => `moved from the ${s} session`, s_bir: j => `moved from ${j.replace('Jüri', 'Jury')}`,\n    s_kisi3: 'You will take the exam as a group of 3.', s_kisi2: 'You will take the exam as a pair.',\n    s_mola: (a, b) => `The juries are on break ${a}–${b}. Your exams start at ${b}.`,\n    s_anketNot: 'After your exam, come back to this page and fill in the short survey.',\n    s_bekle_m: \"Your partner's name will appear here when they scan the QR code.\",\n    s_acilis: a => `Your jury and room will appear here and on the TV at ${a}; keep watching your phone and the TV.`,\n    s_trans_b: s => `Your partner did not come. You will take the exam at ${s} with another pair, as a group of 3.`,\n    s_esYok_b: 'Your partner has not scanned yet',\n    s_esYok_m: (l, le, n) => `If your partner does not arrive by ${l}, you will take the exam in the ${n} session with another pair.`,\n    s_esYok_son: l => `If your partner does not arrive by ${l}, we will group you with other students.`,\n    s_takip: 'Keep watching your phone and the TV.',\n    s_birlesim: 'Your partner did not come; we have grouped you with other students.',\n    s_ucluBekle_b: 'Waiting for the 3rd student', s_ucluBekle_m: s => `Your jury and room will appear here at ${s}.`,\n    s_ucluEksik: 'You are scheduled as a group of 3. Go to your room now and tell your jury:', s_ucluSoz: '\"We are a group of 3, but the 3rd student has not arrived yet. We were told to wait until 5 minutes past the exam time.\"',\n    s_masa_b: 'Your partner did not come', s_masa_m: 'Please come to the registration desk now.',\n    s_bittiNot: 'If your exam is over, please fill in the short survey below. If your exam has not started yet, wait in front of your room; you can fill in the survey after your exam.',\n    s_tesekkur: 'Thank you. Your score will be announced on AnaSİS.', s_anketGonder: 'Submit the survey',\n    trans_b: 'No partner could be matched', trans_m: s => `You will take the exam in the next slot (${s}); you are first in line for matching there. Keep watching your phone; your jury will appear here once your partner is set.`,\n    juri: (lv, n, r) => `${lv} · Jury ${n} · Room ${r}`, saat: 'Time', es: 'Your partner', tek: 'You will go in alone', esYok: 'Not yet known; the system will match you', ekranAcik: 'Keep your phone screen on: the system will call you on this screen.',\n    atandi_m: 'Wait in front of the classroom; the jury will call you.', gecikme: 'Your jury will be a few minutes late; please wait at the door.',\n    sinavda_b: 'You are in the exam', juriHocalari: 'Jury teachers',\n    gec_b: 'You are late for the exam', gec_m: s => `If a jury becomes free before ${s} today, you may still be called. Keep following this screen on your phone. If no jury becomes free, you cannot take the exam today.`,\n    alinamadi_b: 'No jury was free today, so you could not take the exam', red_b: 'You scanned more than 5 minutes after your exam time, so you cannot take the speaking exam',\n    gelmedi_b: 'The jury marked you as \"absent\"', gelmedi_m: 'Go immediately to the registration desk at the school entrance on the cafeteria side.',\n    bitti_b: 'Your exam is complete', bitti_bekle: 'Your score will be published on this page later today. To see it, open this page again on the same phone and in the same browser. You can bookmark this page.',\n    not_b: 'Your speaking score', anasis: 'The official result will be announced on AnaSİS. Please check your score on AnaSİS.',\n    yenilenir: 'This screen refreshes automatically; do not close it.', baskaOgr: 'Another student on this phone',\n    sorunBtn: 'I have a problem / I need help', sorunBaslik: 'Choose your problem', aciklama: 'Short description (optional)', aciklamaZ: 'Short description (required)',\n    yazDil: 'You can write in Turkish, English or Russian.', gonder: 'Send', vazgec: 'Cancel',\n    gonderildi: 'Your message has been sent to the administration. The reply will appear on this screen.', acilNot: 'Go to the registration desk immediately.',\n    mesajlar: 'Your messages', d_acik: 'Waiting for reply', d_cevap: 'Answered', d_cozuldu: 'Resolved', yonetim: 'Administration',\n    e_sinir: 'You have 3 messages waiting for a reply. You can send a new one when you get a reply.', e_numara: 'First enter your student number.',\n    e_aciklama: 'Please write a short description.', e_sec: 'Please choose an option.', e_sinavda: 'You are in the exam; reporting is closed.', e_yogun: 'There are too many reports right now. Go to the registration desk.',\n    sorun: { kod: 'I entered the code but it is not accepted', numara: 'My student number is not on the list', gun: 'The screen shows the wrong day or level',\n      bekleme: 'I have been waiting for a long time and have not received jury information', derslik: 'I cannot find the classroom', es: 'My partner has not come or I cannot find my partner',\n      acil: 'Emergency / health problem', diger: 'Other' },\n    anketBaslik: 'End-of-exam survey',\n    anketUst1: 'After completing the survey you can see your speaking exam score. Your answers will not affect your speaking exam score.',\n    anketUst2: 'Your answers are reported only as a summary. For anything you write, you choose whether your name is shared with the school administration.',\n    olcek: ['Agree', 'Partly agree', 'Disagree'], evet: 'Yes', hayir: 'No',\n    madde: ['The instructions on exam day (QR code, phone screen, TV) were clear.', 'My waiting time was reasonable.', 'The jury and the exam setting were well organised and suitable for the exam.',\n      'During the exam, the teachers were helpful and friendly.', \"During the exam, the teachers' attitude affected my motivation negatively.\",\n      'The exam questions/tasks matched what we studied in class.', 'Having my speaking recorded on camera made me stressed.',\n      'Having my speaking recorded on camera did not affect me negatively.'],\n    a_sorun: 'I had some problems.', a_sorunAcikla: 'Please explain briefly', a_diger: 'Other comments and suggestions', istege: 'optional',\n    isimSor: 'Shall we share your name with the school administration about this?', anketGonder: 'Submit the survey and show my score',\n    e_anket: 'Please answer all items.', e_izin: 'Please also answer the name question.', e_sorunMetin: 'Please briefly describe the problem you had.'\n  },\n  ru: {\n    ad: 'Русский', eyebrow: 'Университет Анадолу · Подготовительная программа', baslik: 'Экзамен по говорению', dilSec: 'Выберите язык',\n    girisBaslik: 'Регистрация на экзамен по говорению', no: 'Номер студента', kod: '4-значный код на экране телевизора', giris: 'Войти', bekleyin: 'Подождите…',\n    telefonYok: 'Если у вас нет телефона или не получается войти, подойдите к столу регистрации перед телевизором у столовой.',\n    e_kod: 'Код неверный или устарел. Снова отсканируйте QR-код на телевизоре или введите текущий код.',\n    e_liste: 'Этого номера нет в списке экзамена. Проверьте номер или подойдите к столу регистрации.', e_gunyok: 'Сегодня экзамена по говорению нет.',\n    yanlisGun: (g, t, s) => `Ваш экзамен: ${g}${t ? ' (' + t + ')' : ''}, в ${s}. Сегодня у вас нет экзамена.`,\n    gecmisGun: (g, t, s, kagit) => `Ваш экзамен был: ${g}${t ? ' (' + t + ')' : ''}, в ${s}, и он завершён. ` + (kagit ? 'Ваша оценка будет объявлена в AnaSİS.' : 'Ваша оценка не отображается на этом устройстве; её можно узнать в AnaSİS.'),\n    gecmis_b: (g, t, s) => `Ваш экзамен был: ${g}${t ? ' (' + t + ')' : ''}, в ${s}, и он завершён.`,\n    girmedi_b: (g, s) => `Ваш экзамен был: ${g}, в ${s}; вы не сдавали экзамен.`,\n    kagit_b: 'Ваш экзамен завершён', kagit_m: 'Ваша оценка будет объявлена в AnaSİS.',\n    anketOnce: 'Оценки опубликованы. Чтобы увидеть свою оценку, сначала заполните анкету.',\n    grup: 'группа', bekle_b: 'Ожидание партнёра', bekle_m: s => `Время вашего экзамена: ${s}. Ваш партнёр появится здесь, когда будет определён. Не закрывайте этот экран.`,\n    esbelli_b: 'Ваш партнёр определён', esbelli_m: s => `Номер комиссии и аудитория появятся здесь за 5 минут до экзамена (в ${s}). Не закрывайте этот экран.`,\n    erken: 'Я готов(а) войти раньше', erkenKaldir: 'Отменить «готов(а) войти раньше»', erkenNot: 'Если вы готовы раньше, вас пригласят, когда в одной из более ранних групп освободится место. Телефон завибрирует; если вы подтвердите, вы сдаёте экзамен в это время.',\n    davet_b: s => `Вы можете сдать экзамен в ${s}!`, davet_m: son => `Если хотите, подтвердите до ${son}. Если не подтвердите, вы сдаёте экзамен в своё время.`, davetOnay: 'Подтверждаю, иду',\n    kayip: (s, k) => `Вы потеряли место в ${s}; ваше объявленное время (${k}) остаётся в силе.`,\n    donus: (s, k) => `В слоте ${s} у вас не было партнёра, поэтому вы возвращены к своему времени (${k}). Следите за телефоном.`,\n    cagri: 'Комиссия ждёт вас!', birlesme: 'Ваш партнёр изменился; комиссия и аудитория указаны выше. Сразу идите в эту аудиторию.',\n    ymsj_b: 'Сообщение от администрации', ymsjOnay: 'Хорошо, я делаю то, что мне сказали', ymsjOk: 'Подтверждено – спасибо',\n    esBekle_b: 'Ожидание партнёра', esBekle_m: (s, a) => `Время вашего экзамена: ${s}. Имя партнёра появится здесь, когда он(а) отсканирует QR-код. Комиссия и аудитория появятся здесь в ${a}. Не закрывайте этот экран.`,\n    trans5_b: 'Ваш партнёр не пришёл', trans5_m: (s, a) => `Вы будете сдавать экзамен в ${s} с другой парой; будьте готовы к ${s}. Имена новых партнёров появятся здесь, когда они отсканируют QR-код. Комиссия и аудитория появятся в ${a}.`,\n    esQr: 'Ещё не отсканировал(а)', anketKagit: 'Пожалуйста, заполните короткую анкету.',\n    s_es: 'Ваш партнёр', s_es1: 'Первый партнёр', s_es2: 'Второй партнёр', s_es3: 'Третий партнёр', s_bekleniyor: 'ожидается', s_gelmedi: 'не пришёл(-ла)',\n    s_akt: s => `переведён(а) из сессии ${s}`, s_bir: j => `переведён(а) из ${j.replace('Jüri', 'комиссии')}`,\n    s_kisi3: 'Вы будете сдавать экзамен втроём.', s_kisi2: 'Вы будете сдавать экзамен вдвоём.',\n    s_mola: (a, b) => `У комиссий перерыв ${a}–${b}. Ваши экзамены начнутся в ${b}.`,\n    s_anketNot: 'После экзамена вернитесь на эту страницу и заполните короткую анкету.',\n    s_bekle_m: 'Имя партнёра появится здесь, когда он(а) отсканирует QR-код.',\n    s_acilis: a => `Комиссия и аудитория появятся здесь и на экране в ${a}; следите за телефоном и экраном.`,\n    s_trans_b: s => `Ваш партнёр не пришёл. Вы будете сдавать экзамен в ${s} с другой парой, втроём.`,\n    s_esYok_b: 'Ваш партнёр ещё не отсканировал QR-код',\n    s_esYok_m: (l, le, n) => `Если партнёр не придёт до ${l}, вы будете сдавать экзамен в сессии ${n} с другой парой.`,\n    s_esYok_son: l => `Если партнёр не придёт до ${l}, мы объединим вас с другими студентами.`,\n    s_takip: 'Продолжайте следить за телефоном и экраном.',\n    s_birlesim: 'Ваш партнёр не пришёл; мы объединили вас с другими студентами.',\n    s_ucluBekle_b: 'Ожидается 3-й студент', s_ucluBekle_m: s => `Комиссия и аудитория появятся здесь в ${s}.`,\n    s_ucluEksik: 'Вы сдаёте экзамен в группе из 3 человек. Идите в аудиторию и скажите комиссии:', s_ucluSoz: '«Мы группа из 3 человек, но 3-й студент ещё не пришёл. Нам сказали ждать 5 минут после начала экзамена.»',\n    s_masa_b: 'Ваш партнёр не пришёл', s_masa_m: 'Пожалуйста, сразу подойдите к столу регистрации.',\n    s_bittiNot: 'Если ваш экзамен закончился, заполните короткую анкету ниже. Если экзамен ещё не начался, ждите у аудитории; анкету можно заполнить после экзамена.',\n    s_tesekkur: 'Спасибо. Ваша оценка будет объявлена в AnaSİS.', s_anketGonder: 'Отправить анкету',\n    trans_b: 'Не удалось подобрать партнёра', trans_m: s => `Вы будете сдавать экзамен в следующем слоте (${s}); там вы первым(-ой) в очереди на подбор партнёра. Следите за телефоном; когда партнёр будет определён, здесь появится ваша комиссия.`,\n    juri: (lv, n, r) => `${lv} · Комиссия ${n} · Аудитория ${r}`, saat: 'Время', es: 'Ваш партнёр', tek: 'Вы будете сдавать один (одна)', esYok: 'Пока не определён; система подберёт партнёра', ekranAcik: 'Не выключайте экран телефона: система вызовет вас через этот экран.',\n    atandi_m: 'Ждите у аудитории; комиссия вас вызовет.', gecikme: 'Ваша комиссия задержится на несколько минут; подождите у двери.',\n    sinavda_b: 'Вы на экзамене', juriHocalari: 'Преподаватели комиссии',\n    gec_b: 'Вы опоздали на экзамен', gec_m: s => `Если сегодня до ${s} освободится комиссия, вас могут вызвать. Следите за этим экраном на телефоне. Если комиссия не освободится, сегодня вы не сможете сдать экзамен.`,\n    alinamadi_b: 'Сегодня не было свободной комиссии, поэтому вы не смогли сдать экзамен', red_b: 'Вы отсканировали код более чем через 5 минут после своего времени, поэтому не можете сдать экзамен по говорению',\n    gelmedi_b: 'Комиссия отметила вас как «не явился(-ась)»', gelmedi_m: 'Немедленно подойдите к столу регистрации у входа в здание со стороны столовой.',\n    bitti_b: 'Ваш экзамен завершён', bitti_bekle: 'Ваша оценка будет опубликована на этой странице сегодня. Чтобы её увидеть, снова откройте эту страницу на том же телефоне и в том же браузере. Можно добавить страницу в закладки.',\n    not_b: 'Ваша оценка за говорение', anasis: 'Официальный результат будет объявлен в системе AnaSİS. Проверьте свою оценку в AnaSİS.',\n    yenilenir: 'Этот экран обновляется автоматически; не закрывайте его.', baskaOgr: 'Другой студент на этом телефоне',\n    sorunBtn: 'У меня проблема / Мне нужна помощь', sorunBaslik: 'Выберите проблему', aciklama: 'Краткое описание (необязательно)', aciklamaZ: 'Краткое описание (обязательно)',\n    yazDil: 'Можно писать на турецком, английском или русском языке.', gonder: 'Отправить', vazgec: 'Отмена',\n    gonderildi: 'Ваше сообщение отправлено администрации. Ответ появится на этом экране.', acilNot: 'Немедленно подойдите к столу регистрации.',\n    mesajlar: 'Ваши сообщения', d_acik: 'Ожидает ответа', d_cevap: 'Получен ответ', d_cozuldu: 'Решено', yonetim: 'Администрация',\n    e_sinir: 'У вас 3 сообщения без ответа. Новое сообщение можно отправить после получения ответа.', e_numara: 'Сначала введите номер студента.',\n    e_aciklama: 'Пожалуйста, напишите краткое описание.', e_sec: 'Пожалуйста, выберите вариант.', e_sinavda: 'Вы на экзамене; отправка сообщений закрыта.', e_yogun: 'Сейчас слишком много сообщений. Подойдите к столу регистрации.',\n    sorun: { kod: 'Я ввёл(а) код, но он не принимается', numara: 'Моего номера нет в списке', gun: 'На экране указан неверный день или уровень',\n      bekleme: 'Я долго жду, а информации о комиссии нет', derslik: 'Я не могу найти аудиторию', es: 'Мой партнёр не пришёл или я не могу его найти',\n      acil: 'Срочная ситуация / проблема со здоровьем', diger: 'Другое' },\n    anketBaslik: 'Анкета после экзамена',\n    anketUst1: 'После заполнения анкеты вы сможете увидеть свою оценку за экзамен по говорению. Ваши ответы не повлияют на эту оценку.',\n    anketUst2: 'Ваши ответы попадают только в сводный отчёт. Для письменных комментариев вы сами решаете, сообщать ли ваше имя администрации школы.',\n    olcek: ['Согласен(на)', 'Частично согласен(на)', 'Не согласен(на)'], evet: 'Да', hayir: 'Нет',\n    madde: ['Инструкции в день экзамена (QR-код, экран телефона, телевизор) были понятными.', 'Время ожидания было разумным.',\n      'Работа комиссии и условия экзамена были хорошо организованы и подходили для экзамена.', 'Во время экзамена преподаватели были доброжелательными и готовыми помочь.',\n      'Во время экзамена поведение преподавателей негативно повлияло на мою мотивацию.', 'Экзаменационные вопросы/задания соответствовали тому, что мы изучали на занятиях.',\n      'Видеозапись моих ответов вызвала у меня стресс.', 'Видеозапись моих ответов не повлияла на меня негативно.'],\n    a_sorun: 'У меня возникли некоторые проблемы.', a_sorunAcikla: 'Кратко опишите', a_diger: 'Другие мнения и предложения', istege: 'необязательно',\n    isimSor: 'Сообщить ли ваше имя администрации школы по этому вопросу?', anketGonder: 'Отправить анкету и показать оценку',\n    e_anket: 'Пожалуйста, ответьте на все пункты.', e_izin: 'Ответьте также на вопрос об имени.', e_sorunMetin: 'Кратко опишите возникшую проблему.'\n  }\n};\nconst SORUN_SIRA = ['kod', 'numara', 'gun', 'bekleme', 'derslik', 'es', 'acil', 'diger'];\n/* Otomatik cevaplar (MehDer, 30.10.2026 prova): öğrenci bir sorun seçince sistem, telefondaki güncel duruma\n   bakarak hemen cevap verir. Çözülmezse \"yönetime yaz\" ile mesaj gönderilir. Acil ve Diğer doğrudan yönetime gider.\n   c = { g: giriş yapıldıysa durum, hata: son giriş hatası (kod/liste/gunyok), yanlis: yanlış gün metni, no } */\nconst katAdi = { tr: r => /^Z/i.test(r) ? 'zemin kat' : /^1/.test(r) ? '1. kat' : /^2/.test(r) ? '2. kat' : '',\n  en: r => /^Z/i.test(r) ? 'ground floor' : /^1/.test(r) ? '1st floor' : /^2/.test(r) ? '2nd floor' : '',\n  ru: r => /^Z/i.test(r) ? 'цокольный этаж' : /^1/.test(r) ? '1-й этаж' : /^2/.test(r) ? '2-й этаж' : '' };\nconst OTO = {\n  tr: {\n    baslik: 'Sistemin cevabı', anladim: 'Tamam, anladım', yineYaz: 'Sorunum çözülmedi, yönetime yaz',\n    kod: c => c.g ? 'Girişin zaten yapıldı; artık kod gerekmiyor. Bu ekranı açık tut.'\n      : \"Kod 60 saniyede bir değişir. TV'deki QR kodunu telefonunla yeniden okut (kod kendiliğinden dolar) ya da TV'de o an görünen 4 haneli kodu yaz. Numaranı da eksiksiz yazdığından emin ol.\",\n    numara: c => c.g ? `Numaran listede ve girişin yapıldı: ${c.g.ad} · ${c.g.lv} · ${c.g.cls}.`\n      : c.hata === 'liste' ? `Yazdığın numara${c.no ? ' (' + c.no + ')' : ''} bu sınavın listesinde yok. Numaranı rakam rakam kontrol et. Doğruysa kayıt masasına git; görevli kontrol edecek.`\n      : \"Önce numaranı ve TV'deki kodu yazıp giriş yap. Sistem 'listede yok' derse numaranı kontrol et; numaran doğruysa kayıt masasına git.\",\n    gun: c => c.g ? `Sistemdeki bilgilerin: ${c.g.lv} düzeyi, ${c.g.cls} sınıfı, grup saatin ${c.g.grup}. Bu bilgiler AnaSİS sınıf listesine göre hazırlandı. Yanlışsa kayıt masasına git.`\n      : c.yanlis ? c.yanlis + ' Bu bilgi AnaSİS sınıf listesine göredir. Yanlış olduğunu düşünüyorsan kayıt masasına git.'\n      : 'Önce numaran ve kodla giriş yap; sınav günün, düzeyin ve saatin ekranda görünür.',\n    bekleme: c => { const g = c.g; if (!g) return \"Jüri bilgisi giriş yaptıktan sonra görünür. Önce numaranı ve TV'deki kodu yazıp giriş yap.\";\n      switch (g.kod) {\n        case 'bekle': return `Grup saatin ${g.saat2}. Jüriler sırayla doldurulur; jüri bilgin grup saatinde ya da eşin okutunca burada görünür. Grup saatinden önce beklemen normal.` + (g.erkenSon != null ? ' Daha erken girmek istersen \"Erken girmeye hazırım\" düğmesine bas.' : '');\n        case 'trans': return `Kendi grubunda sana eş bulunamadı, bu yüzden bir sonraki slota (${g.saat2}) aktarıldın. O saatte jüri bilgin burada görünecek. Bu durum notunu etkilemez.`;\n        case 'atandi': return `Jüri bilgin geldi: ${g.j.lv} · Jüri ${g.j.no} · Derslik ${g.j.room}, saat ${g.saat}. Dersliğin önünde bekle; jüri seni çağıracak.` + (g.gecikme ? ' Jürin birkaç dakika gecikiyor.' : '');\n        case 'gec': return `Geç okuttuğun için boş bir jüri bekleniyor. Saat ${g.son}'e kadar boş jüri olursa jüri bilgin burada görünür. Ekranı kapatma.`;\n        default: return 'Ekranındaki duruma göre bugün sınava alınamadın. Kayıt masasına git.'; } },\n    derslik: c => { const g = c.g; if (g && g.j && g.j.room) { const k = katAdi.tr(g.j.room); return `Dersliğin: ${g.j.room}${k ? ' (' + k + ')' : ''}, ${g.j.lv} · Jüri ${g.j.no}. Bulamazsan koridordaki görevliye sor ya da kayıt masasına git.`; }\n      return 'Dersliğin, jüri bilgin gelince bu ekranda görünür. Şimdilik ekranı izle.'; },\n    es: c => { const g = c.g; if (!g) return 'Eşleştirme giriş yaptıktan sonra yapılır. Önce giriş yap.';\n      if (g.kod === 'atandi') return g.esler && g.esler.length ? `Eşin: ${g.esler.join(', ')}. Eşini aramana gerek yok; dersliğin önünde bekle. Eşin gelmezse sistem seni başka bir öğrenciyle eşleştirir ya da bir sonraki slota aktarır.` : (g.yedekTek ? 'Bu sınava tek başına gireceksin; eş beklemene gerek yok.' : 'Eşin henüz belli değil. Dersliğin önünde bekle; sistem seni bir öğrenciyle eşleştirir, kimse gelmezse bir sonraki slota aktarır. Tek başına sınava girmezsin.');\n      return 'Eşini aramana gerek yok. Eşin gelmezse sistem seni başka bir öğrenciyle eşleştirir ya da bir sonraki slota aktarır; notun etkilenmez. Ekranı izle.'; }\n  },\n  en: {\n    baslik: 'Automatic answer', anladim: 'OK, I understand', yineYaz: 'My problem is not solved – write to the administration',\n    kod: c => c.g ? 'You are already checked in; you no longer need a code. Keep this screen open.'\n      : 'The code changes every 60 seconds. Scan the QR code on the TV again with your phone (the code fills in automatically) or type the 4-digit code shown on the TV right now. Also make sure your student number is complete.',\n    numara: c => c.g ? `Your number is on the list and you are checked in: ${c.g.ad} · ${c.g.lv} · ${c.g.cls}.`\n      : c.hata === 'liste' ? `The number you entered${c.no ? ' (' + c.no + ')' : ''} is not on the list for this exam. Check it digit by digit. If it is correct, go to the registration desk.`\n      : \"First enter your number and the code on the TV and check in. If the system says 'not on the list', check your number; if it is correct, go to the registration desk.\",\n    gun: c => c.g ? `Your details in the system: level ${c.g.lv}, class ${c.g.cls}, group time ${c.g.grup}. These come from the AnaSİS class list. If they are wrong, go to the registration desk.`\n      : c.yanlis ? c.yanlis + ' This comes from the AnaSİS class list. If you think it is wrong, go to the registration desk.'\n      : 'First check in with your number and the code; your exam day, level and time will appear on the screen.',\n    bekleme: c => { const g = c.g; if (!g) return 'Jury information appears after you check in. First enter your number and the code on the TV.';\n      switch (g.kod) {\n        case 'bekle': return `Your group time is ${g.saat2}. Juries are filled in order; your jury will appear here at your group time or when your partner checks in. Waiting before your group time is normal.` + (g.erkenSon != null ? ' If you want to go in earlier, press \"I\\'m ready to go in early\".' : '');\n        case 'trans': return `No partner was found in your group, so you were moved to the next slot (${g.saat2}). Your jury will appear here at that time. This does not affect your score.`;\n        case 'atandi': return `Your jury is set: ${g.j.lv} · Jury ${g.j.no} · Room ${g.j.room}, at ${g.saat}. Wait in front of the classroom; the jury will call you.` + (g.gecikme ? ' Your jury is running a few minutes late.' : '');\n        case 'gec': return `Because you checked in late, you are waiting for a free jury. If a jury becomes free before ${g.son}, it will appear here. Do not close this screen.`;\n        default: return 'According to your screen, you could not take the exam today. Go to the registration desk.'; } },\n    derslik: c => { const g = c.g; if (g && g.j && g.j.room) { const k = katAdi.en(g.j.room); return `Your room: ${g.j.room}${k ? ' (' + k + ')' : ''}, ${g.j.lv} · Jury ${g.j.no}. If you cannot find it, ask a staff member in the corridor or go to the registration desk.`; }\n      return 'Your room will appear on this screen when your jury is set. Keep watching the screen.'; },\n    es: c => { const g = c.g; if (!g) return 'Partners are matched after you check in. Please check in first.';\n      if (g.kod === 'atandi') return g.esler && g.esler.length ? `Your partner: ${g.esler.join(', ')}. You do not need to look for your partner; wait in front of the classroom. If your partner does not come, the system will match you with another student or move you to the next slot.` : (g.yedekTek ? 'You will take this exam alone; you do not need to wait for a partner.' : 'Your partner is not known yet. Wait in front of the classroom; the system will match you with a student, or move you to the next slot if nobody comes. You will not take the exam alone.');\n      return 'You do not need to look for your partner. If your partner does not come, the system will match you with another student or move you to the next slot; your score is not affected. Keep watching the screen.'; }\n  },\n  ru: {\n    baslik: 'Автоматический ответ', anladim: 'Понятно', yineYaz: 'Проблема не решена – написать администрации',\n    kod: c => c.g ? 'Вы уже зарегистрировались, код больше не нужен. Не закрывайте этот экран.'\n      : 'Код меняется каждые 60 секунд. Отсканируйте QR-код на телевизоре ещё раз (код заполнится автоматически) или введите 4-значный код, который сейчас на экране. Проверьте также, что номер студента введён полностью.',\n    numara: c => c.g ? `Ваш номер есть в списке, вы зарегистрированы: ${c.g.ad} · ${c.g.lv} · ${c.g.cls}.`\n      : c.hata === 'liste' ? `Введённого номера${c.no ? ' (' + c.no + ')' : ''} нет в списке этого экзамена. Проверьте каждую цифру. Если номер верный, подойдите к столу регистрации.`\n      : 'Сначала введите номер и код с телевизора и зарегистрируйтесь. Если система ответит «нет в списке», проверьте номер; если он верный, подойдите к столу регистрации.',\n    gun: c => c.g ? `Ваши данные в системе: уровень ${c.g.lv}, группа ${c.g.cls}, время ${c.g.grup}. Они взяты из списка AnaSİS. Если данные неверны, подойдите к столу регистрации.`\n      : c.yanlis ? c.yanlis + ' Эти данные взяты из списка AnaSİS. Если вы считаете, что это ошибка, подойдите к столу регистрации.'\n      : 'Сначала зарегистрируйтесь с номером и кодом; день, уровень и время экзамена появятся на экране.',\n    bekleme: c => { const g = c.g; if (!g) return 'Информация о комиссии появится после регистрации. Сначала введите номер и код с телевизора.';\n      switch (g.kod) {\n        case 'bekle': return `Время вашей группы: ${g.saat2}. Комиссии заполняются по очереди; ваша комиссия появится здесь в это время или когда зарегистрируется ваш партнёр. Ждать до времени группы — нормально.` + (g.erkenSon != null ? ' Если хотите пройти раньше, нажмите «Готов(а) пройти раньше».' : '');\n        case 'trans': return `В вашей группе не нашлось партнёра, поэтому вы перенесены на следующее время (${g.saat2}). Тогда здесь появится ваша комиссия. На оценку это не влияет.`;\n        case 'atandi': return `Ваша комиссия назначена: ${g.j.lv} · Комиссия ${g.j.no} · Аудитория ${g.j.room}, время ${g.saat}. Ждите у аудитории; вас вызовут.` + (g.gecikme ? ' Комиссия задерживается на несколько минут.' : '');\n        case 'gec': return `Вы зарегистрировались поздно, поэтому ожидается свободная комиссия. Если до ${g.son} освободится комиссия, она появится здесь. Не закрывайте экран.`;\n        default: return 'Судя по экрану, сегодня вы не можете сдать экзамен. Подойдите к столу регистрации.'; } },\n    derslik: c => { const g = c.g; if (g && g.j && g.j.room) { const k = katAdi.ru(g.j.room); return `Ваша аудитория: ${g.j.room}${k ? ' (' + k + ')' : ''}, ${g.j.lv} · Комиссия ${g.j.no}. Если не можете найти, спросите дежурного в коридоре или подойдите к столу регистрации.`; }\n      return 'Аудитория появится на этом экране, когда будет назначена комиссия. Следите за экраном.'; },\n    es: c => { const g = c.g; if (!g) return 'Партнёр назначается после регистрации. Сначала зарегистрируйтесь.';\n      if (g.kod === 'atandi') return g.esler && g.esler.length ? `Ваш партнёр: ${g.esler.join(', ')}. Искать партнёра не нужно; ждите у аудитории. Если партнёр не придёт, система назначит вам другого студента или перенесёт на следующее время.` : (g.yedekTek ? 'Вы сдаёте экзамен один (одна); ждать партнёра не нужно.' : 'Ваш партнёр пока не определён. Ждите у аудитории; система подберёт вам студента, а если никто не придёт, перенесёт вас на следующее время. Один (одна) вы сдавать не будете.');\n      return 'Искать партнёра не нужно. Если партнёр не придёт, система назначит вам другого студента или перенесёт на следующее время; на оценку это не влияет. Следите за экраном.'; }\n  }\n};\n\n</script>\n", "TV": "<!DOCTYPE html>\n<html lang=\"tr\"><head><base target=\"_top\"><?!= include('Stil'); ?>\n<script src=\"https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js\"></script>\n<style>\n.ot{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px 20px;margin-bottom:16px}\n.ot .oh{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap}\n.ot .oh b{font-size:34px}\n.ot .ob{font-size:21px;font-weight:700;color:var(--accent)} .ot.acik .ob{color:var(--ok)}\n.ot .oe{font-size:15px;color:var(--muted);margin:2px 0 10px}\n.ot.ikinci{opacity:.85} .ot.ikinci .oh b{font-size:24px}\n.tgrid{display:grid;gap:16px}\n.tt{width:100%;border-collapse:collapse;font-size:22px}\n.tt th{text-align:left;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:6px 8px;border-bottom:2px solid var(--line)}\n.tt td{padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}\n.tt td.no{font-family:var(--f-mono);color:var(--muted)} .tt td.ad{font-weight:700}\n.tt td.bk{color:var(--muted);font-size:16px;font-style:italic}\n.tt.kucuk{font-size:18px}\n/* Alternatif 5 – sabit plan: her satır bir çift, düzeyler yan yana, dijital saat (MehDer 9.11.2026) */\n.wrap.genis{max-width:1900px!important;padding-left:16px;padding-right:16px}\n.tv.sabit{grid-template-columns:400px minmax(0,1fr)}\n#saat{font:700 64px/1 var(--f-mono,monospace);border:2px solid var(--line);border-radius:14px;padding:8px 18px;margin-bottom:6px;font-variant-numeric:tabular-nums}\n.ot .ob.b2{font-size:29px}\n.dzb{font-size:26px;font-weight:800;background:var(--accent-soft,#e3f1f3);border-radius:8px;padding:4px 12px;margin:6px 0 2px} .dzb span{font-weight:500;font-size:16px;color:var(--muted)}\n.tt.pt{font-size:23px;table-layout:fixed;border-collapse:collapse} .tt.pt td{padding:8px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .tt.pt th{font-size:13px}\n.eh{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;text-align:center} .eh .es{color:var(--accent);font-weight:800;font-size:15px;padding:0 6px}\n.pno{display:inline-block;width:58px;font-family:var(--f-mono);color:var(--muted);font-size:17px} .nm{font-size:24px}\n.bk2{color:var(--muted);font-style:italic;font-size:20px} .tt.pt td.jd{font-size:21px;padding-left:4px;padding-right:4px} .tt.pt td.jd b{font-size:22px} .kat{font-size:15px;color:var(--muted);font-weight:600} .tt.pt td.jd .bk2{font-size:16px}\n.tt.pt tbody.u3 td{background:#fdebd3} .tt.pt tbody.u3{outline:3px solid #d9780f;outline-offset:-2px} .tt.pt tbody.u3 tr:first-child td{border-bottom:none}\n.tt.pt tr.ek td{padding-top:0} .o3{font-size:16px;font-weight:800;color:#a35a00;margin-left:6px} .eknot{font-size:15px;color:#a35a00;font-weight:600;margin-left:6px}\n.u3e{display:inline-block;background:#e98a15;color:#fff;font-size:15px;font-weight:800;border-radius:6px;padding:2px 9px}\n.ot.kisa{padding-top:10px;padding-bottom:10px} .ot.kisa .oh b{font-size:22px!important} .ot.kisa .ob{font-size:17px!important}\n.kdzb{font-size:17px;font-weight:800;color:var(--muted);margin:4px 0 2px} .kdzb span{font-weight:500}\n.kc{display:grid;grid-template-columns:minmax(0,28fr) 34px minmax(0,30fr) 26px minmax(0,33fr);align-items:baseline;font-size:17px;padding:2px 0;border-bottom:1px solid var(--line);white-space:nowrap;overflow:hidden} .kc .pno{width:auto;font-size:14px;margin-right:4px} .kc .es{color:var(--accent);font-weight:800;text-align:center} .kc>span{overflow:hidden;text-overflow:ellipsis} .kc .es+span{padding-left:16px} .kc .bk2{font-size:15px} .kc.u3k{background:#fdebd3}\n#simdi{font-size:22px!important;font-weight:700}\n.molab{margin:6px 0 4px;padding:8px 12px;border-radius:10px;background:#fff4d6;font-size:24px;font-weight:800} .molab .en{font-size:15px;font-weight:500}\n/* Madde 8 (MehDer 12.11.2026): yeni ad 5 sn açık gri ↔ koyu siyah, sonunda siyah; 2'li tamam açık mavi zemin + çerçeve, 3'lü turuncu, bekleniyor renksiz */\n@keyframes yanipA{0%,100%{color:#000}50%{color:#c4c4c4}} .yanip{animation:yanipA 1s linear 5}\n.tt.pt tbody.u2 td{background:#e3effc} .tt.pt tbody.u2{outline:2px solid #6b9fd6;outline-offset:-2px} .tt.pt tbody.u2 tr:first-child td{border-bottom:none}\n.kc.u2k{background:#e3effc;outline:1px solid #6b9fd6} .kc.u3k{background:#fdebd3;outline:2px solid #d9780f}\n@keyframes nefesA{0%,55%{color:var(--ink);opacity:1}78%{color:#8f8f8f;opacity:.75}100%{color:var(--ink);opacity:1}}\n.nefes{animation:nefesA 2.4s ease-in-out infinite} .nefes5{animation:nefesA 2.4s ease-in-out 2}\n.tvduyuru #duyuruTr{font-size:36px!important}\n</style></head>\n<body class=\"tvpage\">\n<div class=\"wrap\" lang=\"tr\" style=\"max-width:1600px;padding-top:20px\">\n  <div class=\"note n-bad\" id=\"hata\" hidden></div>\n  <main id=\"app\" class=\"tv\">\n    <div class=\"panel qrbox\"><div id=\"saat\" hidden>--:--:--</div><h2>İngilizce Konuşma Sınavı</h2><p class=\"muted\">QR kodunu okut, açılan sayfaya öğrenci numaranı yaz. QR açılmazsa aşağıdaki kodu kullan.</p><p class=\"muted en\" lang=\"en\">Scan the QR code and enter your student number. If it does not open, use the code below.</p>\n      <div id=\"qr\"></div><div class=\"code\" id=\"kod\">----</div><div class=\"bar\"><i id=\"bar\" style=\"width:100%\"></i></div>\n      <p class=\"small muted\">Kod 60 saniyede bir değişir. Telefonunda sorun yaşayan öğrenciler kantin tarafındaki kayıt masasına başvursun.</p></div>\n    <div class=\"stack\"><div class=\"res r-hl tvduyuru\" id=\"duyuru\" hidden><div id=\"duyuruTr\"></div><div class=\"en\" id=\"duyuruEn\" lang=\"en\"></div></div><div class=\"note n-acc\" id=\"simdi\">—</div><div id=\"tablolar\"></div></div>\n  </main>\n</div>\n<?!= include('Ortak'); ?>\n<script>\nlet qr = null, sonUrl = '', bitis = 0;\nfunction ciz(v) {\n  const sb = (v.tablolar || []).some(b => b.sabit) || !!v.duzeyMetni;\n  $('.wrap').classList.toggle('genis', sb); $('#app').classList.toggle('sabit', sb); $('#saat').hidden = !sb;\n  $('#kod').textContent = v.kod; $('#simdi').textContent = (v.denemeSaat ? 'DENEME SAATİ ' + v.denemeSaat + ' · ' : '') + (v.gun ? v.gun + ' · ' : '') + (v.duzeyMetni ? v.duzeyMetni + ' · ' : '') + v.simdi;\n  $('#tablolar').innerHTML = (v.tablolar || []).map(tablo).join('');\n  ilkCizim = false;\n  sigdir();\n  /* GitHub Pages'te açılan TV, QR'ı kendi klasöründeki öğrenci sayfasına verir (script.google.com çok hesaplı telefonlarda açılmıyor – 6.11.2026 okul denemesi) */\n  const qUrl = /\\.github\\.io$/.test(location.hostname) && v.kod ? location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + '?v=ogrenci&c=' + v.kod : v.url;\n  if (qUrl !== sonUrl && typeof QRCode === 'function') { sonUrl = qUrl; $('#qr').innerHTML = ''; qr = new QRCode($('#qr'), { text: qUrl, width: 340, height: 340, correctLevel: QRCode.CorrectLevel.M }); }\n  bitis = Date.now() + v.kalan * 1000;\n  const d = v.duyuru; $('#duyuru').hidden = !d; if (d) { $('#duyuruTr').textContent = d.metin; $('#duyuruEn').textContent = d.en || ''; }\n}\nconst bk = '<td class=\"bk\">bekleniyor</td>';\nfunction tabloSabitKisa(b) {   // alttaki (sonraki) oturum: sade, küçük (MehDer 11.11.2026)\n  const ki = x => x ? `<span class=\"pno\">…${esc(x.no)}</span><b ${yanip(x.no)}>${esc(x.ad)}</b>` : '<span class=\"bk2\">bekleniyor</span>';\n  const blok = d => `<div class=\"kdz\"><div class=\"kdzb\">${esc(d.lv)} Düzeyi <span>· ${d.ciftler.length} çift</span></div>${d.ciftler.map(c => `<div class=\"kc${c.renk ? ' ' + c.renk + 'k' : ''}\"><span>${ki(c.m[0])}</span><span class=\"es\">↔</span><span>${ki(c.m[1])}</span><span class=\"es\">${c.ek.length ? '+' : ''}</span><span>${c.ek.map(ki).join(', ')}</span></div>`).join('')}</div>`;\n  return `<div class=\"ot kisa\"><div class=\"oh\"><b>Sonraki: Oturum ${esc(b.saat)}</b><span class=\"ob\">${esc(b.bilgi)}</span></div>`\n    + `<div class=\"tgrid\" style=\"grid-template-columns:repeat(${b.bloklar.length},minmax(0,1fr));align-items:start\">${b.bloklar.map(blok).join('')}</div></div>`;\n}\nfunction tabloSabit(b) {\n  if (b.ikinci) return tabloSabitKisa(b);\n  const bk2 = '<span class=\"bk2\">bekleniyor</span>', ki = x => x ? `<span class=\"pno\">…${esc(x.no)}</span><b ${yanip(x.no, 'nm')}>${esc(x.ad)}</b>` : `<span class=\"pno\"></span>${bk2}`;\n  const jd = (c, a) => c[a] ? `<td class=\"jd\"><b>${esc(c[a])}</b>${a === 'derslik' && c.kat ? `<div class=\"kat\">${esc(c.kat)}</div>` : ''}</td>` : `<td class=\"jd\">${bk2}</td>`;\n  const cift = c => `<tbody class=\"${c.renk || ''}\"><tr><td>${ki(c.m[0])}</td><td>${ki(c.m[1])}</td>${jd(c, 'juri')}${jd(c, 'derslik')}</tr>`\n    + c.ek.map(e => `<tr class=\"ek\"><td colspan=\"4\">${ki(e)} <span class=\"o3\">→ Öğrenci-3</span>${c.uclu ? ' <span class=\"u3e\">3\\'LÜ</span>' : ''}${e.not ? ` <span class=\"eknot\">${esc(e.not)}</span>` : ''}</td></tr>`).join('') + '</tbody>';\n  const blok = d => `<div class=\"dz\"><div class=\"dzb\">${esc(d.lv)} Düzeyi <span>· ${d.ciftler.length} çift</span></div><table class=\"tt pt\"><colgroup><col style=\"width:35.5%\"><col style=\"width:35.5%\"><col style=\"width:15%\"><col style=\"width:14%\"></colgroup><thead><tr><th colspan=\"2\"><div class=\"eh\"><span>Öğrenci-1</span><span class=\"es\">←&nbsp;EŞİ&nbsp;→</span><span>Öğrenci-2</span></div></th><th>Jüri</th><th>Derslik</th></tr></thead>`\n    + d.ciftler.map(cift).join('') + '</table></div>';\n  const ac = b.acik && nefesBilgi(b.saat);\n  return `<div class=\"ot${b.acik ? ' acik' : ''}${b.ikinci ? ' ikinci' : ''}\"><div class=\"oh\"><b>Oturum ${esc(b.saat)}</b><span class=\"ob b2${ac ? ' nefes' : ''}\">${esc(b.bilgi)}</span></div><div class=\"oe\" lang=\"en\">Session ${esc(b.saat)} · ${esc(b.en)}</div>`\n    + (b.mola ? `<div class=\"molab nefes\">${esc(b.mola)}<div class=\"en\" lang=\"en\">${esc(b.molaEn)}</div></div>` : '')\n    + (b.satir.length ? `<div class=\"tgrid\" style=\"grid-template-columns:repeat(${b.bloklar.length},minmax(0,1fr));align-items:start\">${b.bloklar.map(blok).join('')}</div>` : '<p class=\"muted\">Henüz QR okutan öğrenci yok.</p>') + '</div>';\n}\n/* yeni görünen öğrenci adı 5 sn \"nefes\" alır; jüri/derslik açılınca bilgi satırı 2 dk \"nefes\" alır (MehDer 11.11.2026) */\nconst gorulen = {}, acilisGorulen = {}; let ilkCizim = true;\n/* yanıp sönme her 5 sn'lik yenilemede baştan başlamasın: geçen süre kadar negatif gecikme verilir */\nfunction yanip(no, base) { const t = Date.now(); if (!(no in gorulen)) gorulen[no] = ilkCizim ? 0 : t; const g = t - gorulen[no]; return g < 5000 ? `class=\"${base || ''} yanip\" style=\"animation-delay:-${g}ms\"` : `class=\"${base || ''}\"`; }\nfunction yeniMi(no) { const t = Date.now(); if (!(no in gorulen)) gorulen[no] = ilkCizim ? 0 : t; return t - gorulen[no] < 5000; }\nfunction nefesBilgi(saat) { const t = Date.now(); if (!(saat in acilisGorulen)) acilisGorulen[saat] = t; return t - acilisGorulen[saat] < 120000; }\nfunction tablo(b) {\n  if (b.sabit) return tabloSabit(b);\n  const n = b.satir.length, parca = n > 20 ? Math.ceil(n / 2) : n || 1, gruplar = [];\n  for (let i = 0; i < n; i += parca) gruplar.push(b.satir.slice(i, i + parca));\n  const tbl = rows => `<table class=\"tt${n > 12 ? ' kucuk' : ''}\"><thead><tr><th>No</th><th>Ad Soyad</th><th>Eşi</th><th>Jüri</th><th>Derslik</th></tr></thead><tbody>${rows.map(r => `<tr><td class=\"no\">…${esc(r.no)}</td><td class=\"ad\">${esc(r.ad)}</td>${r.es ? `<td>${esc(r.es)}</td>` : bk}${r.juri ? `<td><b>${esc(r.juri)}</b></td>` : bk}${r.derslik ? `<td><b>${esc(r.derslik)}</b></td>` : bk}</tr>`).join('')}</tbody></table>`;\n  return `<div class=\"ot${b.acik ? ' acik' : ''}${b.ikinci ? ' ikinci' : ''}\"><div class=\"oh\"><b>Oturum ${esc(b.saat)}</b><span class=\"ob\">${esc(b.bilgi)}</span></div><div class=\"oe\" lang=\"en\">Session ${esc(b.saat)} · ${esc(b.en)}</div>`\n    + (n ? `<div class=\"tgrid\" style=\"grid-template-columns:repeat(${gruplar.length},minmax(0,1fr))\">${gruplar.map(tbl).join('')}</div>` : '<p class=\"muted\">Henüz QR okutan öğrenci yok.</p>') + '</div>';\n}\n/* tablo ekrana sığmazsa küçült (sabit planda kalabalık oturum – MehDer 9.11.2026) */\nfunction sigdir() { const tb = $('#tablolar'); tb.style.zoom = 1; const ust = tb.getBoundingClientRect().top + window.scrollY, h = tb.scrollHeight, bos = window.innerHeight - ust - 12;\n  if (h > bos && bos > 100) tb.style.zoom = Math.max(0.55, bos / h).toFixed(3); }\nwindow.addEventListener('resize', sigdir);\nasync function yenile() { try { ciz(await run('apiTV')); $('#hata').hidden = true; } catch (e) { hataGoster(e); } sigdir(); }\nsetInterval(() => { const k = Math.max(0, bitis - Date.now()); $('#bar').style.width = (k / 600) + '%'; if (k <= 0) yenile(); }, 500);\nsetInterval(yenile, 5000); yenile();\n/* dijital saat (İstanbul saati) */\nconst saatYaz = () => { try { $('#saat').textContent = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour12: false }); } catch (e) { } };\nsetInterval(saatYaz, 250); saatYaz();\n</script>\n</body></html>\n", "Hoca": "<!DOCTYPE html>\n<html lang=\"tr\"><head><base target=\"_top\"><?!= include('Stil'); ?></head>\n<body>\n<div class=\"wrap\" lang=\"tr\">\n  <header class=\"band\"><div><div class=\"eyebrow\">Anadolu Üniversitesi YDYO Hazırlık · Sınav Portalı</div><h1 id=\"baslik\">Kişisel portal</h1></div>\n    <div class=\"row\" id=\"ust\" hidden><button class=\"btn sm bad ghost\" data-act=\"sorunAc\">Sorun yaşıyorum</button><button class=\"btn sm ghost\" data-act=\"pv\" data-v=\"menu\">Ana menü</button><button class=\"btn sm ghost\" data-act=\"cikis\">Çıkış</button></div></header>\n  <div class=\"note n-bad\" id=\"hata\" hidden></div>\n  <main id=\"app\" data-k=\"<?= k ?>\" data-o=\"<?= o ?>\"><div class=\"panel muted\">Yükleniyor…</div></main>\n</div>\n<?!= include('Ortak'); ?>\n<?!= include('BirimUI'); ?>\n<script>\nconst EP = !$('#app').dataset.k;   // ortak bağlantı: e-posta + şifre ile giriş (17.11.2026)\nlet K = $('#app').dataset.k || store.get('hocaE') || '';\nlet ot = $('#app').dataset.o || store.sget('ot:' + K), V = null, pv = 'menu', zarfAcik = null, giris = { asama: 'sifre', mesaj: '', onay: null, ad: '' }, armed = null, bekle = false;\nlet sorun = { acik: false, mesaj: '', tamam: false }, girisMsj = [], hA = { l: [] }, hAMesaj = '';\nconst SORUN_ADLARI = { giris: 'Giriş / şifre sorunu', liste: 'Gelen öğrenci listemde yok ya da yanlış öğrenci geldi', hesapla: 'Not girişi veya HESAPLA çalışmıyor',\n  fark: 'Fark / negotiation ekranında sorun', gelmedi: 'Öğrenci gelmedi ama \"Gelmedi\" düğmesi açılmadı', teknik: 'Derslik / teknik sorun (kamera, ses, internet)',\n  kagit: 'Zarftaki kâğıtlar listeyle uyuşmuyor (eksik ya da fazla)', tamam: 'Not girişi veya \"Tamamlandı\" çalışmıyor', acil: 'Acil durum / sağlık sorunu', diger: 'Diğer' };\nconst OLCEK3 = ['Katılıyorum', 'Kısmen katılıyorum', 'Katılmıyorum'];\nconst ckey = () => 'cihaz:' + K;\n\n/* ---------- giriş ---------- */\nfunction vGiris() {\n  if (giris.asama === 'yeni') return `<form class=\"panel login stack\" data-f=\"yeni\"><h2>Yeni şifrenizi belirleyin</h2><p class=\"small muted\">${esc(giris.ad)} · ilk giriş. En az 6 karakter.</p>\n    <label class=\"f\">Yeni şifre<input id=\"p1\" type=\"password\" autocomplete=\"new-password\" required></label><label class=\"f\">Yeni şifre (tekrar)<input id=\"p2\" type=\"password\" autocomplete=\"new-password\" required></label>\n    ${giris.mesaj ? `<div class=\"note n-bad\">${esc(giris.mesaj)}</div>` : ''}<button class=\"btn\" type=\"submit\">Şifreyi kaydet ve devam et</button></form>`;\n  return `<form class=\"panel login stack\" data-f=\"giris\">${EP ? `<div><div class=\"small muted\">Sınav Portalı</div><h2 style=\"margin:0\">Hoca girişi</h2></div>\n    <label class=\"f\">Kurumsal e-posta<input id=\"ep\" type=\"email\" autocomplete=\"username\" placeholder=\"…@anadolu.edu.tr\" value=\"${esc(K)}\" required></label>`\n    : `<div><div class=\"small muted\">Kişisel bağlantı</div><h2 style=\"margin:0\">${esc(giris.ad || '')}</h2></div>`}\n    <label class=\"f\">${EP ? 'Şifre <span class=\"small muted\">(ilk girişte e-postanızdaki geçici şifre)</span>' : giris.ilk ? 'Geçici şifre (e-postanızda)' : 'Şifre'}<input id=\"pw\" type=\"password\" autocomplete=\"current-password\" required></label>\n    <label class=\"ck\"><input type=\"checkbox\" id=\"rem\"> Bu cihazı hatırla (30 gün)</label>\n    ${giris.mesaj ? `<div class=\"note n-bad\">${esc(giris.mesaj)}</div>` : ''}<button class=\"btn\" type=\"submit\">Giriş</button>\n    <p class=\"small muted\">Şifrenizi unuttuysanız yönetimle görüşün; size yeni geçici şifre verilir.</p></form>\n    <div class=\"stack\" style=\"max-width:420px;margin:14px auto 0\">${sorun.acik ? vSorun() : `<div><button class=\"btn sm bad ghost\" data-act=\"sorunAc\">Sorun yaşıyorum</button></div>`}${vMesajlar(girisMsj)}</div>`;\n}\n/* ---------- sorun bildirme ---------- */\nfunction sorunListesi() {\n  if (!V) return ['giris', 'acil', 'diger'];\n  if (pv === 'speaking' || pv === 'proj') return ['giris', 'liste', 'hesapla', 'fark', 'gelmedi', 'teknik', 'acil', 'diger'];\n  if (pv === 'writing') return ['giris', 'kagit', 'tamam', 'fark', 'diger'];\n  return ['giris', 'liste', 'hesapla', 'fark', 'gelmedi', 'teknik', 'kagit', 'tamam', 'acil', 'diger'];\n}\nfunction vSorun() {\n  if (sorun.tamam) return `<div class=\"panel stack\"><div class=\"note ${sorun.acil ? 'n-bad' : 'n-ok'}\">Mesajınız yönetime iletildi. Cevap bu ekranda görünecek.${sorun.acil ? '<br><b>Acil durumda kayıt masasına da haber verin.</b>' : ''}</div><div><button class=\"btn sm ghost\" data-act=\"sorunKapat\">Tamam</button></div></div>`;\n  // MehDer (30.10.2026, prova): hocalar seçenek listesi yerine sorunu doğrudan yazar; yalnızca isteğe bağlı \"Acil\" işareti\n  return `<form class=\"panel stack\" data-f=\"sorun\"><h3 style=\"margin:0\">Sorun yaşıyorum</h3>\n    <label class=\"f\">Sorununuzu kısaca yazın<textarea id=\"hmetin\" rows=\"4\" maxlength=\"600\" placeholder=\"Ör. A Jüri 3, derslik 116: kamera kayıt almıyor.\"></textarea></label>\n    <label class=\"ck\"><input type=\"checkbox\" id=\"hacil\"> Acil durum (sağlık / güvenlik)</label>\n    ${sorun.mesaj ? `<div class=\"note n-bad\">${esc(sorun.mesaj)}</div>` : ''}<div class=\"row\"><button class=\"btn\" type=\"submit\">Gönder</button><button class=\"btn ghost\" type=\"button\" data-act=\"sorunKapat\">Vazgeç</button></div></form>`;\n}\nfunction vMesajlar(L, hepsi) {\n  const l = (L || []).filter(m => hepsi || m.durum !== 'cozuldu'); if (!l.length) return '';\n  const dd = { acik: 'Cevap bekleniyor', cevap: 'Cevaplandı', cozuldu: 'Çözüldü' };\n  return `<div class=\"panel stack\"><h3 style=\"margin:0\">Mesajlarım</h3>${l.map(m => `<div class=\"msg ${m.acil ? 'acil' : ''}\"><div class=\"small muted\">${esc(m.saat)}${m.kat === 'diger' ? '' : ' · ' + esc(m.kat === 'acil' ? 'Acil' : m.katAd)} · <b>${dd[m.durum] || m.durum}</b></div>${m.metin ? `<div>${esc(m.metin)}</div>` : ''}\n    ${m.cev.map(c => `<div class=\"cv\"><div class=\"small muted\">Yönetim · ${esc(c.saat)}</div><div>${esc(c.metin)}</div></div>`).join('')}</div>`).join('')}</div>`;\n}\n/* ---------- görüş ve öneri anketi ---------- */\nfunction anketKarti(tur) {\n  if (!V.anket || V.anket[tur] !== 'acik') return V.anket && V.anket[tur] === 'tamam' ? `<div class=\"note n-ok\">${tur === 'S' ? 'Speaking' : 'Writing'} görüş ve öneri anketini doldurdunuz. Teşekkürler.</div>` : '';\n  return `<div class=\"note n-hl\">${tur === 'S' ? 'Jürinizdeki sınavlar tamamlandı.' : 'Writing grading göreviniz tamamlandı.'} Lütfen kısa görüş ve öneri anketini doldurun.<div class=\"row\" style=\"margin-top:8px\"><button class=\"btn sm\" data-act=\"pv\" data-v=\"anket${tur}\">Anketi doldur</button></div></div>`;\n}\nfunction hRad(ad, v, etiket, sec) { return `<label class=\"${sec ? 'sec' : ''}\"><input type=\"radio\" name=\"${ad}\" value=\"${v}\" ${sec ? 'checked' : ''}>${esc(etiket)}</label>`; }\nfunction hIzin(ad, val) { return `<div class=\"small\" style=\"margin-top:6px\">Bu konuda isminizi okul yönetimine iletelim mi?</div><div class=\"lik\">${hRad(ad, '1', 'Evet', val === true)}${hRad(ad, '0', 'Hayır', val === false)}</div>`; }\nfunction vAnket(tur) {\n  const A = V.anketler[tur], a = hA, n = A.madde.length;\n  if (V.anket[tur] === 'tamam') return `<div class=\"panel\">${anketKarti(tur)}</div>`;\n  if (V.anket[tur] !== 'acik') return '<div class=\"panel\">Anket, görevleriniz tamamlanınca açılır.</div>';\n  return `<form class=\"panel stack\" data-f=\"hanket\" data-tur=\"${tur}\"><h2 style=\"margin:0\">${tur === 'S' ? 'Speaking' : 'Writing'} · görüş ve öneri anketi</h2>\n    <p class=\"small muted\">Cevaplarınız özet olarak raporlanır. Yazdığınız görüşlerde isminizin okul yönetimine iletilip iletilmeyeceğini siz seçersiniz.</p>\n    ${A.madde.map((m, i) => `<div class=\"q\"><div>${i + 1}. ${esc(m)}</div><div class=\"lik\">${OLCEK3.map((o, v) => hRad('hm' + i, v, o, a.l[i] === v)).join('')}</div></div>`).join('')}\n    <div class=\"q\"><div>${n + 1}. ${esc(A.sorun)}</div><div class=\"lik\">${hRad('hsorun', '1', 'Evet', a.sorun === true)}${hRad('hsorun', '0', 'Hayır', a.sorun === false)}</div>\n      ${a.sorun ? `<label class=\"f\" style=\"margin-top:6px\">Kısaca açıklayın<textarea id=\"haSorun\" rows=\"3\" maxlength=\"1000\">${esc(a.sorunMetin || '')}</textarea></label>${hIzin('hsIzin', a.sorunIzin)}` : ''}</div>\n    <div class=\"q\"><div>${n + 2}. ${esc(A.diger)} <span class=\"small muted\">(isteğe bağlı)</span></div><textarea id=\"haDiger\" rows=\"3\" maxlength=\"1000\">${esc(a.diger || '')}</textarea>${(a.diger || '').trim() ? hIzin('hdIzin', a.digerIzin) : ''}</div>\n    ${hAMesaj ? `<div class=\"note n-bad\">${esc(hAMesaj)}</div>` : ''}<div><button class=\"btn\" type=\"submit\">Anketi gönder</button></div></form>`;\n}\nfunction hAnketOku(n) {\n  const sec = k => { const x = document.querySelector(`input[name=\"${k}\"]:checked`); return x ? Number(x.value) : null; };\n  for (let i = 0; i < n; i++) { const v = sec('hm' + i); if (v != null) hA.l[i] = v; }\n  const s = sec('hsorun'); if (s != null) hA.sorun = s === 1;\n  if ($('#haSorun')) hA.sorunMetin = $('#haSorun').value;\n  if ($('#haDiger')) hA.diger = $('#haDiger').value;\n  const si = sec('hsIzin'); if (si != null) hA.sorunIzin = si === 1;\n  const di = sec('hdIzin'); if (di != null) hA.digerIzin = di === 1;\n}\n/* ---------- portal ---------- */\nfunction vMenu() {\n  return `<div class=\"menu\">\n    <button data-act=\"pv\" data-v=\"gorev\"><b>Yaklaşan görevlerim</b><span>Gözetmenlik, jüri, writing grading ve yedeklik; tarih, saat, derslik</span></button>\n    <button data-act=\"pv\" data-v=\"speaking\"><b>Speaking not girişi</b><span>Sınav günü jüri ekranı ve not girişi</span></button>\n    <button data-act=\"pv\" data-v=\"writing\"><b>Writing grading</b><span>Değerlendireceğiniz zarflar (first / second)</span></button>\n    <button data-act=\"pv\" data-v=\"gecmis\"><b>Geçmiş görevler</b><span>Salt okunur</span></button>\n    ${V.birimler && V.birimler.length ? `<button data-act=\"pv\" data-v=\"birim\"><b>Birim çalışmaları</b><span>${esc(V.birimler.join(', '))} – dosyalar ve mesajlar</span></button>` : ''}\n    ${V.anket && V.anket.S && V.anket.S !== 'bekle' ? `<button data-act=\"pv\" data-v=\"anketS\"><b>Speaking görüş ve öneri anketi</b><span>${V.anket.S === 'tamam' ? 'Dolduruldu – teşekkürler' : 'Jüri göreviniz tamamlandı; lütfen doldurun'}</span></button>` : ''}\n    ${V.anket && V.anket.W && V.anket.W !== 'bekle' ? `<button data-act=\"pv\" data-v=\"anketW\"><b>Writing görüş ve öneri anketi</b><span>${V.anket.W === 'tamam' ? 'Dolduruldu – teşekkürler' : 'Writing göreviniz tamamlandı; lütfen doldurun'}</span></button>` : ''}</div>`;\n}\nfunction vGorev() {\n  const G = V.gorevler;\n  return `<div class=\"panel\"><h3>Yaklaşan görevlerim</h3>${G.length ? `<div class=\"scroll\"><table><thead><tr><th>Tarih</th><th>Saat</th><th>Görev</th><th>Yer / ayrıntı</th></tr></thead><tbody>${G.map(t => `<tr><td>${esc(t.tarih)}</td><td class=\"mono\">${esc(t.saat)}</td><td><b>${esc(t.gorev)}</b></td><td>${esc(t.yer)}</td></tr>`).join('')}</tbody></table></div>` : '<p class=\"muted\">Tanımlı görev yok.</p>'}</div>`;\n}\n/** Salt okunur jüri ekranı (2. ve 3. kullanım): notlar kâğıda yazılır. */\nfunction vJuriSalt(J) {\n  const msj = (J.jmsj || []).map(m => `<div class=\"note n-acc\"><b>Yönetim · ${esc(m.saat || '')}</b><p>${esc(m.metin)}</p></div>`).join('');\n  const deg = (J.degisiklik || []).map(d => `<div class=\"note n-hl\" style=\"font-size:18px\"><b>${esc(d)}</b></div>`).join('');\n  const ot = J.oturumlar.map(o => `<div class=\"panel stack\" style=\"gap:6px${o.simdi ? ';outline:2px solid var(--accent)' : ''}\"><div class=\"row\" style=\"justify-content:space-between\"><h3 style=\"margin:0\">${o.yedek ? 'Yedek oturum ' : 'Oturum '}${esc(o.saat)}${o.uclu ? ' <span class=\"pill p-warn\">3\\'LÜ</span>' : ''}</h3>${o.bitti ? '<span class=\"pill p-mut\">Bitti</span>' : ''}</div>\n    ${o.uyeler.map(u => `<div class=\"mem\"><span class=\"nm\">${esc(u.ad)}</span> <span class=\"small muted mono\">${esc(u.cls)} · ${esc(u.no)}</span> ${u.qr ? '<span class=\"pill p-ok\">✓ QR okuttu</span>' : '<span class=\"pill p-mut\">bekleniyor</span>'}${u.etiket ? `<div class=\"small\" style=\"color:#a35a00;font-weight:700\">${esc(u.etiket)}</div>` : ''}</div>`).join('')}</div>`).join('');\n  return `<div class=\"stack\"><div class=\"panel jhead\"><div><div class=\"small muted\">${esc(J.gun)} · ${esc(J.lv)} düzeyi · notlar kâğıda yazılır</div><h2 style=\"margin:0\">${esc(J.ad)} · Derslik ${esc(J.room)}</h2></div></div>${deg}${msj}${ot || '<div class=\"panel\">Bu jüriye bugün öğrenci planlanmamış.</div>'}</div>`;\n}\nfunction vJuri(proj) {\n  const J = V.juri;\n  if (J.yok) return `<div class=\"panel\">${esc(J.mesaj)}</div>`;\n  if (J.salt) return vJuriSalt(J);\n  if (proj) {\n    const ps = J.ciftler.filter(p => !p.bitti && p.dolu), nm = p => p ? p.uyeler.filter(u => !u.mv && u.g !== 'gelmedi').map(u => esc(u.ad)).join(' & ') : '—';\n    return `<div class=\"panel proj stack\"><div class=\"row\" style=\"justify-content:space-between\"><div class=\"jn\">${esc(J.ad)} · Derslik ${esc(J.room)}</div><button class=\"btn sm ghost\" data-act=\"pv\" data-v=\"speaking\">Jüri ekranına dön</button></div>\n      ${J.kapali ? '<div class=\"note n-acc\">Bu jüride sınavlar tamamlanmıştır.</div>' : ''}\n      <div class=\"muted\">Şimdi${ps[0] ? ` · ${ps[0].saat} · ${esc(ps[0].set)}` : ''}</div><div class=\"cur\">${nm(ps[0])}</div>\n      <div class=\"muted\">Sıradaki${ps[1] ? ` · ${ps[1].saat}` : ''}</div><div style=\"font-size:22px;font-weight:700\">${nm(ps[1])}</div></div>`;\n  }\n  const ek = J.ek.map(e => e.tur === 1 ? `<div class=\"note n-warn\">Yeni çiftin gelmesine ${e.kalan} dakikanız kalmıştır.<div class=\"row\" style=\"margin-top:8px\"><button class=\"btn sm\" data-act=\"ek\" data-k=\"${e.k}\">Ek süre istiyorum (Sınavınız bitince SINAV BİTTİ butonuna basabilirsiniz)</button></div></div>`\n    : e.tur === 2 ? `<div class=\"note n-warn\">Ek süre doldu.<div class=\"row\" style=\"margin-top:8px\"><button class=\"btn sm\" data-act=\"ek\" data-k=\"${e.k}\">İkinci kez ek süre istiyorum (Sınavınız bitince SINAV BİTTİ butonuna basabilirsiniz)</button></div></div>`\n    : `<div class=\"note n-acc\">Ek süre: ${esc(e.bitis)}'e kadar. Bu sürede size yeni çift gönderilmez.</div>`).join('')\n    + J.ek.filter(e => e.kapi).map(e => `<div class=\"note n-hl\"><b>Kapı:</b> ${esc(e.kapi)}</div>`).join('');\n\n  const kart = J.ciftler.map(p => {\n    const uy = p.uyeler.map(u => {\n      const ghost = u.mv || u.g === 'gelmedi', key = `gm|${p.id}|${u.no}`;\n      const acts = p.bitti || ghost ? '' : `<div class=\"row\"><button class=\"btn sm ${u.g === 'geldi' ? '' : 'ghost'}\" data-act=\"geldi\" data-p=\"${p.id}\" data-no=\"${u.no}\">Geldi</button>\n        ${armed === key ? `<span class=\"inline-confirm\">\"Gelmedi\" kesin mi? <button class=\"btn sm bad\" data-act=\"gelmedi\" data-p=\"${p.id}\" data-no=\"${u.no}\">Evet</button><button class=\"btn sm ghost\" data-act=\"vazgec\">Vazgeç</button></span>`\n          : `<button class=\"btn sm bad ghost\" data-act=\"arm\" data-key=\"${key}\" ${p.cut ? '' : 'disabled'}>Gelmedi</button>`}${p.cut ? '' : `<span class=\"small muted\">\"Gelmedi\" ${/^\\d/.test(p.acilis) ? p.acilis + \"'te\" : p.acilis} açılır</span>`}</div>`;\n      return `<div class=\"mem ${ghost ? 'ghost' : ''}\"><div class=\"row\" style=\"justify-content:space-between\"><div><span class=\"nm\">${esc(u.ad)}</span> <span class=\"small muted mono\">${u.no}</span> <span class=\"small muted\">${esc(u.cls)}</span> ${u.src ? `<span class=\"pill p-hl\">${esc(u.src)}</span>` : ''}</div>\n        <div>${u.g === 'gelmedi' ? '<span class=\"pill p-bad\">Gelmedi</span>' : u.mv ? `<span class=\"pill p-warn\">${esc(u.mv)}</span>` : u.g === 'geldi' ? '<span class=\"pill p-ok\">Geldi</span>' : ''}</div></div>${u.kapi && !p.bitti ? `<div class=\"note n-hl small\" style=\"margin:6px 0\"><b>Kapı:</b> ${esc(u.kapi)}</div>` : ''}${acts}${u.not ? notBlok(u.not, 'S', u.no, 'HESAPLA') : ''}</div>`;\n    }).join('');\n    if (p.isaretUyari) uyar('isaret|' + p.id);\n    const uyariK = p.isaretUyari ? `<div class=\"note n-bad\"><b>Oturum saati geçti: \"Geldi\" ya da \"Gelmedi\" işaretlemediğiniz öğrenci var.</b> Öğrenci geldiyse \"Geldi\"ye, gelmediyse \"Gelmedi\"ye basın.</div>` : '';\n    const otoK = p.otoSaat ? `<div class=\"note n-acc small\">Notlar kesinleşti. SINAV BİTTİ'ye basmazsanız sistem ${esc(p.otoSaat)}'de sınavı otomatik bitirecek.</div>` : '';\n    const foot = p.bitti ? `<div><span class=\"pill p-ok\">SINAV BİTTİ${p.oto ? ' (otomatik)' : ''}</span></div>` : p.dolu ? `<div class=\"row\"><button class=\"btn\" data-act=\"bitti\" data-p=\"${p.id}\" ${p.nedenler.length ? 'disabled' : ''}>SINAV BİTTİ</button></div>${p.nedenler.length ? `<ul class=\"reasons\">${p.nedenler.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}` : '';\n    return `<div class=\"pair ${p.simdi ? 'now' : ''} ${p.bitti ? 'done' : ''}\"><div class=\"ph\"><b>${p.saat}${p.yedek ? ' (yedek slot)' : ''}</b><span class=\"pill p-acc\">Bu slot: ${esc(p.set)}</span></div>${uyariK}${uy}${otoK}${foot}</div>`;\n  }).join('') || '<div class=\"panel muted\">Henüz bu jüriye çift atanmadı.</div>';\n  return `<div class=\"stack\"><div class=\"panel jhead\"><div><div class=\"small muted\">${esc(J.gun)} · ${esc(J.lv)} düzeyi (${J.max} puan) · saat ${esc(V.saat)}</div><h2 style=\"margin:0\">${esc(J.ad)} · Derslik ${esc(J.room)}</h2><div class=\"small muted\">Eşiniz: ${esc(J.es)}. Not girişi kör yapılır: HESAPLA'ya kadar eşinizin notlarını görmezsiniz.</div></div>\n    <div class=\"row\"><button class=\"btn sm ghost\" data-act=\"pv\" data-v=\"proj\">Projeksiyon ekranını aç</button></div></div>\n    ${J.kapali ? `<div class=\"note n-acc\">Bu jüride sınavlar tamamlanmıştır; size yeni öğrenci gönderilmeyecektir. Mevcut çiftinizin sınavını ve not girişini bitirip SINAV BİTTİ'ye bastıktan sonra ayrılabilirsiniz.</div>` : ''}${ek}\n    ${anketKarti('S')}<div class=\"grid g2\">${kart}</div>\n    <p class=\"small muted\">Listenizde olmayan bir öğrenci kapıya gelirse: \"Sorun yaşıyorum\" düğmesine basın ve öğrencinin adını yazın. Öğrenciyi de kantin tarafındaki okul girişinin oradaki kayıt masasına yönlendirin.</p></div>`;\n}\n/* Jüri ekranında kısa ses (yönetim mesajı geldiğinde, bir kez) */\nlet HUYAR = []; function uyar(k) { if (HUYAR.indexOf(k) >= 0) return; HUYAR.push(k); try { const A = window.AudioContext || window.webkitAudioContext; if (A) { const c = new A(); [0, 0.3].forEach(d => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 760; g.gain.value = 0.2; o.connect(g); g.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.2); }); } } catch (e) { } }\nfunction vWriting() {\n  const Z = V.zarflar;\n  if (!Z.length) return '<div class=\"panel\">Bu sınavda writing grading göreviniz yok.</div>';\n  const z = Z.find(x => x.cls === zarfAcik);\n  if (!z) return anketKarti('W') + `<div class=\"grid g2\">${Z.map(z => { const st = z.ikisi ? '<span class=\"pill p-ok\">İki değerlendirme tamamlandı</span>' : z.ben ? `<span class=\"pill p-ok\">${z.rol} grading tamamlandı</span>` : (z.side === 'b' && !z.fDone ? '<span class=\"pill p-mut\">First grading sürüyor</span>' : `<span class=\"pill p-warn\">${z.rol} grading bekliyor</span>`);\n    return `<div class=\"panel stack\" style=\"gap:8px\"><div class=\"row\" style=\"justify-content:space-between\"><h3 style=\"margin:0\">${esc(z.cls)} · ${z.rol} grading</h3>${st}</div><p class=\"small muted\">Son: ${esc(z.son || '')}${z.neg ? ` · negotiation ${esc(z.neg)}'e kadar` : ''}</p><div><button class=\"btn sm\" data-act=\"zarf\" data-c=\"${esc(z.cls)}\">Zarfı aç</button></div></div>`; }).join('')}</div>`;\n  const kesin = z.ogr.filter(o => o.not.fin != null || o.abs).length, hepsi = z.ikisi && kesin === z.ogr.length;\n  const info = z.es ? `<div class=\"note n-hl\">Farkı 2 puandan fazla olan öğrenci var. Partneriniz: <b>${esc(z.es.ad)}</b><p>Partnerinizle görüşerek turuncu bentleri birlikte değerlendirin (negotiation). Son: ${esc(z.neg || '')}.</p></div>`\n    : z.ikisi && z.ucuncu ? `<div class=\"note n-hl\">${z.ucuncu} öğrencide iki değerlendirme arasında 2 puandan fazla fark (ya da farklı özel durum) var. Bu kâğıtlar 3. grader'a gönderilecek; sizin bir şey yapmanıza gerek yoktur.</div>`\n    : z.ikisi && !z.farkVardi ? `<div class=\"note n-ok\">İki değerlendirme arasında fark çıkmadı; bütün notlar kesinleşti.</div>`\n    : `<p class=\"small muted\">Son: ${esc(z.son || '')}.</p>`;\n  const kagit = hepsi && z.side === 'b' ? `<div class=\"note n-acc\">Kesinleşen notları öğrenci kâğıtlarına <b>20 üzerinden ve 100 üzerinden</b> yazınız.</div>` : '';\n  const ozet = z.ikisi ? `<div class=\"note ${kesin === z.ogr.length ? 'n-ok' : 'n-hl'}\">Karşılaştırma: ${kesin} / ${z.ogr.length} öğrencinin notu kesinleşti.${kesin < z.ogr.length ? ' Farkı 2 puandan fazla olanlar 3. grader\\'a gidecek.' : ''}</div>` : '';\n  const rows = z.ogr.map(o => `<div class=\"mem\"><div class=\"row\" style=\"justify-content:space-between\"><div><span class=\"nm\">${esc(o.ad)}</span> <span class=\"small muted mono\">${o.no}</span></div>\n      <label class=\"ck small\"><input type=\"checkbox\" data-wabs=\"${o.no}\" ${o.abs ? 'checked' : ''} ${z.ikisi || (o.not.fin != null && !o.abs) ? 'disabled' : ''}> Girmedi (gözetmen tutanağı)</label></div>\n      ${o.abs ? `<span class=\"pill p-mut\">Girmedi – G${o.absBy ? ` (${o.absBy} grader işaretledi)` : ''}</span>` : o.kaydedildi != null ? `<span class=\"pill p-ok\">Notunuz kaydedildi: ${esc(o.kaydedildi)}${typeof o.kaydedildi === 'number' ? ' / 20' : ''}</span>` : notBlok(o.not, 'W', o.no, (o.not.tur > 1 || o.not.neg) ? 'Kaydet ve karşılaştır' : null)}</div>`).join('');\n  const btn = !z.ben ? `<div class=\"row\"><button class=\"btn\" data-act=\"wTamam\" data-c=\"${esc(z.cls)}\">${z.rol} grading tamamlandı</button><span class=\"reasons\" id=\"msg-zarf\"></span></div>` : '';\n  return `<div class=\"stack\"><div class=\"panel stack\" style=\"gap:8px\"><div class=\"row\" style=\"justify-content:space-between\"><h2 style=\"margin:0\">${esc(z.cls)} · ${z.rol} grading</h2><button class=\"btn sm ghost\" data-act=\"zarf\" data-c=\"\">Zarflara dön</button></div>${info}${ozet}${kagit}\n    <p class=\"small muted\">Kriterler: Content 5 · Organization 5 · Grammatical Competence 5 · Lexical Competence 5. Özel durumlar: ilgisiz yazı 5, kısa yazı 4, boş kâğıt 1, girmedi G.</p></div><div class=\"panel stack\">${rows}${btn}</div></div>`;\n}\nfunction render(force) {\n  if (!force && (editing() || basili)) { bekle = true; return; }\n  bekle = false;\n  if (!V) { $('#ust').hidden = true; $('#app').innerHTML = vGiris(); return; }\n  $('#ust').hidden = false; $('#baslik').textContent = V.ad;\n  let b = '';\n  if (pv === 'gorev') b = vGorev(); else if (pv === 'speaking') b = vJuri(false); else if (pv === 'proj') b = vJuri(true); else if (pv === 'writing') b = vWriting();\n  else if (pv === 'birim') b = vBirim();\n  else if (pv === 'gecmis') b = '<div class=\"panel\"><h3>Geçmiş görevler</h3><p class=\"muted\">Tamamlanan sınav görevleriniz sınav döneminden sonra burada salt okunur olarak listelenir.</p></div>';\n  else if (pv === 'anketS' || pv === 'anketW') b = vAnket(pv.slice(-1));\n  else b = vMenu();\n  /* Yönetimden jüriye mesaj (MehDer, 1.11.2026): her ekranda en üstte, \"Okudum\" ile kapanır */\n  const jmL = (V.juri && V.juri.jmsj || []).filter(m => !m.okundu);\n  const jm = jmL.map(m => `<div class=\"res r-hl\" style=\"margin-bottom:10px\"><div class=\"big\">Yönetimden mesaj · ${esc(m.saat)}</div><p><b>${esc(m.metin)}</b></p><div><button class=\"btn\" data-act=\"okudum\" data-id=\"${esc(m.id)}\">Okudum</button></div></div>`).join('');\n  if (jm) uyar('jm:' + jmL.map(m => m.id).join(','));\n  const ust = jm + (sorun.acik ? vSorun() : '') + vMesajlar(V.msj, pv === 'menu');\n  $('#app').innerHTML = (V.adm ? '<div class=\"note n-hl\" style=\"margin-bottom:14px\">Yönetim adına işlem yapıyorsunuz. Girilen notlar kayıtta \"yönetim\" olarak görünür.</div>' : '') + (ust ? `<div class=\"stack\" style=\"margin-bottom:14px\">${ust}</div>` : '') + b;\n}\n/* ---------- sunucu ---------- */\nasync function yukle() {\n  try {\n    if (ot) { const r = await run('apiHoca', ot); if (!r.err) { V = r; store.sset('ot:' + K, ot); render(); return; } ot = null; store.sdel('ot:' + K); }\n    const c = K && store.get(ckey());\n    if (c) { const r = await run('apiHocaCihaz', K, c); if (r.oturum) { ot = r.oturum; store.sset('ot:' + K, ot); return yukle(); } store.del(ckey()); }\n    if (EP) { giris.ad = ''; giris.ilk = false; V = null; render(true); return; }\n    const b = await run('apiHocaBilgi', K); if (b.err) { $('#app').innerHTML = `<div class=\"panel\">${esc(b.err)}</div>`; return; }\n    giris.ad = b.ad; giris.ilk = b.ilk; V = null;\n    try { girisMsj = (await run('apiHocaMesajlar', K)).m || []; } catch (e) { }\n    render(true);\n  } catch (e) { hataGoster(e); }\n}\nasync function islem(ad, a, msgId, basarili) {\n  try { const r = await run('apiHocaIslem', ot, ad, a); if (r.err === 'OTURUM') { ot = null; return yukle(); } if (!r.hata && basarili) basarili(); V = r.v; render(true); if (r.hata && msgId) { const m = document.getElementById(msgId); if (m) m.textContent = r.hata; } else if (r.hata) alertKutusu(r.hata); }\n  catch (e) { hataGoster(e); }\n}\nfunction alertKutusu(m) { const h = $('#hata'); h.textContent = m; h.hidden = false; setTimeout(() => h.hidden = true, 6000); }\ndocument.addEventListener('submit', async e => {\n  e.preventDefault(); const f = e.target.dataset.f; giris.mesaj = '';\n  if (f === 'sorun') {\n    const kat = $('#hacil') && $('#hacil').checked ? 'acil' : 'diger', metin = $('#hmetin').value.trim(); sorun.mesaj = '';\n    if (!metin) sorun.mesaj = 'Sorununuzu kısaca yazın.';\n    else if (EP && !ot && !K && !($('#ep') && $('#ep').value.trim())) sorun.mesaj = 'Önce e-posta adresinizi yazın.';\n    else { if (EP && !ot && $('#ep') && $('#ep').value.trim()) K = $('#ep').value.trim().toLowerCase(); try { const r = await run('apiHocaSorun', ot || null, K, kat, metin); if (r.err) sorun.mesaj = r.err; else { sorun.tamam = true; sorun.acil = kat === 'acil'; if (V) V.msj = r.m; else girisMsj = r.m; } } catch (err) { hataGoster(err); } }\n    return render(true);\n  }\n  if (f === 'hanket') {\n    const tur = e.target.dataset.tur, A = V.anketler[tur], n = A.madde.length; hAnketOku(n); hAMesaj = '';\n    if (hA.l.filter(x => x != null).length !== n || hA.sorun == null) hAMesaj = 'Lütfen bütün maddeleri cevaplayın.';\n    else if (hA.sorun && !(hA.sorunMetin || '').trim()) hAMesaj = 'Yaşadığınız sorunu kısaca açıklayın.';\n    else if ((hA.sorun && hA.sorunIzin == null) || ((hA.diger || '').trim() && hA.digerIzin == null)) hAMesaj = 'İsim sorusunu da cevaplayın.';\n    else { try { const r = await run('apiHocaAnket', ot, tur, { l: hA.l, sorun: hA.sorun, sorunMetin: hA.sorunMetin || '', sorunIzin: !!hA.sorunIzin, diger: hA.diger || '', digerIzin: !!hA.digerIzin, dil: 'tr' });\n      if (r.err === 'OTURUM') { ot = null; return yukle(); } if (r.err) hAMesaj = r.err; else { V = r.v; hA = { l: [] }; } } catch (err) { hataGoster(err); } }\n    return render(true);\n  }\n  try {\n    if (f === 'giris') {\n      if (EP) { K = $('#ep').value.trim().toLowerCase(); store.set('hocaE', K); }\n      const r = await run('apiHocaGiris', K, $('#pw').value, $('#rem').checked); giris.rem = $('#rem').checked;\n      if (r.err) giris.mesaj = r.err; else if (r.yeniSifre) { giris.asama = 'yeni'; giris.onay = r.onay; giris.ad = r.ad || giris.ad; }\n      else { ot = r.oturum; if (r.cihaz) store.set(ckey(), r.cihaz); try { document.activeElement.blur(); } catch (x) { } return yukle(); }   // Enter ile girişte ekran şifre kutusunda takılı kalmasın\n    } else if (f === 'yeni') {\n      const r = await run('apiSifreBelirle', K, giris.onay, $('#p1').value, $('#p2').value, !!giris.rem);\n      if (r.err) giris.mesaj = r.err; else { ot = r.oturum; if (r.cihaz) store.set(ckey(), r.cihaz); giris.asama = 'sifre'; try { document.activeElement.blur(); } catch (x) { } return yukle(); }\n    }\n  } catch (err) { hataGoster(err); }\n  render(true);\n});\ndocument.addEventListener('click', async e => {\n  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; const d = b.dataset;\n  if (d.act !== 'arm' && d.act !== 'gelmedi') armed = null;\n  switch (d.act) {\n    case 'pv': pv = d.v; zarfAcik = null; hAMesaj = ''; if (pv === 'birim') { bMsg = ''; birimYukle(); } if (pv !== 'anketS' && pv !== 'anketW') hA = { l: [] }; return render(true);\n    case 'sorunAc': sorun = { acik: true, mesaj: '', tamam: false }; window.scrollTo(0, 0); return render(true);\n    case 'sorunKapat': sorun = { acik: false, mesaj: '', tamam: false }; return render(true);\n    case 'cikis': await run('apiCikis', ot).catch(() => { }); store.sdel('ot:' + K); store.del(ckey()); ot = null; V = null; pv = 'menu'; return yukle();\n    case 'arm': armed = d.key; return render(true);\n    case 'vazgec': return render(true);\n    case 'zarf': zarfAcik = d.c || null; return render(true);\n    case 'geldi': case 'gelmedi': case 'bitti': b.disabled = true; armed = null; return islem(d.act, { p: d.p, no: d.no });\n    case 'okudum': b.disabled = true; return islem('okudum', { id: d.id });\n    case 'ek': b.disabled = true; return islem('ek', { j: V.juri.jid, k: Number(d.k) });\n    case 'hesapla': b.disabled = true; return islem('hesapla', gonderilecek('S', d.no), 'msg-S-' + d.no, () => taslakSil('S', d.no));\n    case 'wKaydet': b.disabled = true; return islem('wKaydet', gonderilecek('W', d.no), 'msg-W-' + d.no, () => taslakSil('W', d.no));\n    case 'wTamam': { b.disabled = true; const z = V.zarflar.find(x => x.cls === d.c), notlar = {}; z.ogr.forEach(o => { const t = TASLAK['W' + o.no]; if (t) notlar[o.no] = { c: t.c, oz: t.oz }; });\n      return islem('wTamam', { cls: d.c, notlar }, 'msg-zarf', () => z.ogr.forEach(o => taslakSil('W', o.no))); }\n  }\n});\ndocument.addEventListener('change', e => {\n  const el = e.target, d = el.dataset;\n  const hf = el.closest('form[data-f=hanket]'); if (hf) { hAnketOku(V.anketler[hf.dataset.tur].madde.length); if (el.tagName === 'TEXTAREA') return; return render(true); }\n  if (d.not) {\n    const t = taslak(d.not, d.no);\n    if (d.oz) { t.oz = el.value; taslakKaydet(); return render(true); }\n    const max = Number(el.max), v = el.value.trim(), n = Number(v.replace(',', '.'));\n    const m = document.getElementById(`msg-${d.not}-${d.no}`);\n    if (v !== '' && (!Number.isInteger(n) || n < 0 || n > max)) { if (m) m.textContent = `0 ile ${max} arasında tam sayı girin (yarım puan yok).`; el.value = ''; t.c[d.k] = ''; }\n    else { if (m) m.textContent = ''; t.c[d.k] = v; }\n    taslakKaydet();\n    const top = document.getElementById(`top-${d.not}-${d.no}`); if (top) { let s = 0; document.querySelectorAll(`input[data-not=\"${d.not}\"][data-no=\"${d.no}\"]`).forEach(i => { const x = Number(i.value); if (i.value !== '' && Number.isInteger(x)) s += x; }); top.textContent = s; }\n    return;\n  }\n  if (d.wabs) return islem('wGirmedi', { no: d.wabs, v: el.checked });\n});\nfunction gonderilecek(g, no) { const t = TASLAK[g + no]; return t ? { no, c: t.c, oz: t.oz } : { no }; }\ndocument.addEventListener('input', e => {\n  if (e.target.id === 'haDiger') { const vardi = !!(hA.diger || '').trim(); hA.diger = e.target.value; if (vardi !== !!hA.diger.trim()) { const f = e.target.closest('form'); hAnketOku(V.anketler[f.dataset.tur].madde.length); render(true); const el = $('#haDiger'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }\n});\ndocument.addEventListener('focusout', () => setTimeout(() => { if (bekle && !basili && !editing()) render(); }, 0));\nlet hTik = 0;\nsetInterval(async () => {\n  hTik++;\n  if (!V) { if (!EP && girisMsj.some(m => m.durum === 'acik') && hTik % 3 === 0) { try { girisMsj = (await run('apiHocaMesajlar', K)).m || []; render(); } catch (e) { } } return; }\n  if (pv === 'birim') return;   // birim ekranı canlı değil; dosya seçimi kaybolmasın\n  const canli = pv === 'speaking' || pv === 'proj', bekleyen = (V.msj || []).some(m => m.durum === 'acik');\n  const juriGunu = V.juri && !V.juri.yok;   // jüri günü: yönetim mesajları için 15 sn'de bir\n  if (!ot || !(canli || ((bekleyen || juriGunu) && hTik % 3 === 0) || hTik % 12 === 0)) return;\n  try { const r = await run('apiHoca', ot); if (!r.err) { V = r; render(); } } catch (e) { }\n}, 5000);\nyukle();\n</script>\n</body></html>\n", "Yonetim": "<!DOCTYPE html>\n<html lang=\"tr\"><head><base target=\"_top\"><?!= include('Stil'); ?><script src=\"https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js\"></script></head>\n<body>\n<div class=\"wrap\" lang=\"tr\">\n  <header class=\"band\"><div><div class=\"eyebrow\">Anadolu Üniversitesi YDYO Hazırlık</div><h1>Sınav Yönetimi</h1></div><div class=\"row\" id=\"ust\" hidden><span class=\"small muted\" id=\"benAd\" style=\"align-self:center\"></span><button class=\"btn sm ghost\" data-act=\"cikis\">Çıkış</button></div></header>\n  <div class=\"note n-bad\" id=\"hata\" hidden></div>\n  <main id=\"app\" data-url=\"<?= url ?>\"><div class=\"panel muted\">Yükleniyor…</div></main>\n</div>\n<?!= include('Ortak'); ?>\n<?!= include('BirimUI'); ?>\n<?!= include('SinavUI'); ?>\n<script>\nconst URL0 = $('#app').dataset.url;\nlet dzSec = null;   /* düzey tablosunda açık hücre: 'satır|sütun' */\nlet ot = store.sget('yon'), V = null, tab = 'canli', mesaj = '', gmesaj = '', dsv = '', tik = 0, sonAcik = null, bekleyenCizim = false;\nfunction acikSay() { return V && V.msj ? V.msj.filter(m => m.durum === 'acik').length : 0; }\nfunction bip(acil) { try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.25, acil ? 0.5 : null].filter(x => x != null).forEach(t0 => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = acil ? 880 : 660; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.2, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + 0.2); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + 0.22); }); } catch (e) { } }\ndocument.addEventListener('input', e => { if (e.target.id === 'dsaat') dsv = e.target.value; });\n/* Kişisel yönetim girişi (17.11.2026): kurumsal e-posta + kendi şifresi; ilk girişte geçici şifre = ortak yönetim şifresi */\nlet BEN = null, yg = { asama: 'giris', onay: null, ad: '', e: '' };\nfunction vGiris() {\n  const hm = gmesaj ? `<div class=\"note n-bad\">${esc(gmesaj)}</div>` : '';\n  if (yg.asama === 'yeni') return `<form class=\"panel login stack\" data-f=\"yyeni\"><h2>Yönetim şifrenizi belirleyin</h2><p class=\"small muted\">${esc(yg.ad)} · ilk giriş. En az 8 karakter; ortak şifreden farklı olmalı.</p>\n    <label class=\"f\">Yeni şifre<input id=\"p1\" type=\"password\" autocomplete=\"new-password\" required></label><label class=\"f\">Yeni şifre (tekrar)<input id=\"p2\" type=\"password\" autocomplete=\"new-password\" required></label>${hm}<button class=\"btn\" type=\"submit\">Şifreyi kaydet ve devam et</button></form>`;\n  return `<form class=\"panel login stack\" data-f=\"ygiris\"><h2>Yönetim girişi</h2>\n    <label class=\"f\">Kurumsal e-posta<input id=\"ye\" type=\"email\" autocomplete=\"username\" placeholder=\"…@anadolu.edu.tr\" value=\"${esc(store.get('yonE') || '')}\" required></label>\n    <label class=\"f\">Şifre<input id=\"pw\" type=\"password\" autocomplete=\"current-password\" required></label>${hm}<button class=\"btn\" type=\"submit\">Giriş</button>\n    <p class=\"small muted\">İlk girişte şifre yerine ortak yönetim şifresini yazın; ardından kendi şifrenizi belirlersiniz.</p></form>`;\n}\nfunction vYonKul() {\n  const L = V.yonKul || [];\n  return `<div class=\"panel stack\"><h3 style=\"margin:0\">Yönetim kullanıcıları</h3><p class=\"small muted\">Her yönetici kurumsal e-postası ve kendi şifresiyle girer; kayıtta adı görünür. Sıfırlanan kişi ilk girişte geçici şifre olarak ortak yönetim şifresini yazar.</p>\n    <div class=\"scroll\"><table><thead><tr><th>Ad</th><th>E-posta</th><th>Yetki</th><th>Şifre</th><th>Son giriş</th><th></th></tr></thead><tbody>${L.map(u => `<tr><td><b>${esc(u.ad)}</b>${u.ad === BEN ? ' <span class=\"pill p-acc\">siz</span>' : ''}</td><td class=\"mono\">${esc(u.e)}</td><td>${esc(u.rol)}</td>\n      <td>${u.sifre ? '<span class=\"pill p-ok\">Belirlendi</span>' : '<span class=\"pill p-warn\">İlk giriş bekleniyor</span>'}${u.kilit ? ' <span class=\"pill p-bad\">Kilitli</span>' : ''}</td><td class=\"small\">${esc(u.son || '—')}</td>\n      <td>${u.ad !== BEN && u.sifre ? `<button class=\"btn sm ghost\" data-act=\"yonSifirla\" data-e=\"${esc(u.e)}\">Şifre sıfırla</button>` : ''}</td></tr>`).join('')}</tbody></table></div>\n    ${BEN && BEN !== 'yönetim' ? `<details><summary class=\"small\"><b>Şifremi değiştir</b></summary><div class=\"row\" style=\"gap:8px;flex-wrap:wrap;margin-top:8px\"><input id=\"ks0\" type=\"password\" placeholder=\"Mevcut şifre\" autocomplete=\"current-password\"><input id=\"ks1\" type=\"password\" placeholder=\"Yeni şifre (en az 8)\" autocomplete=\"new-password\"><input id=\"ks2\" type=\"password\" placeholder=\"Yeni şifre (tekrar)\" autocomplete=\"new-password\"><button class=\"btn sm\" data-act=\"kendiSifre\">Değiştir</button></div></details>\n    <details><summary class=\"small\"><b>Ortak şifreyi değiştir</b> <span class=\"muted\">(ilk giriş ve sıfırlamada kullanılan geçici şifre)</span></summary><div class=\"row\" style=\"gap:8px;flex-wrap:wrap;margin-top:8px\"><input id=\"os0\" type=\"password\" placeholder=\"Kendi şifreniz\" autocomplete=\"current-password\"><input id=\"os1\" type=\"password\" placeholder=\"Yeni ortak şifre (en az 8)\" autocomplete=\"new-password\"><input id=\"os2\" type=\"password\" placeholder=\"Yeni ortak şifre (tekrar)\" autocomplete=\"new-password\"><button class=\"btn sm\" data-act=\"ortakSifre\">Değiştir</button></div></details>` : ''}</div>`;\n}\nfunction vCanli() {\n  const head = `<tr><th>Jüri</th>${V.slotlar.map((s, i) => `<th>${s}${i === V.slotlar.length - 1 ? ' y' : ''}</th>`).join('')}</tr>`;\n  const rows = V.tablo.map(j => `<tr><td><b>${esc(j.ad)}</b><br><span class=\"muted\">${esc(j.room)} · ${j.hocalar.map(esc).join(', ')}</span>${j.kapali ? `<br><span class=\"pill p-mut\">${j.kapali}'den itibaren kapandı</span>` : ''}</td>${j.hucre.map(h => `<td>${h.cips.length ? h.cips.map(c => `<span class=\"chip ${c.c}\" title=\"${esc(c.ad)}\">${esc(c.t)}</span>`).join('') : (h.kapali ? '<span class=\"chip cl\">kapalı</span>' : '')}</td>`).join('')}</tr>`).join('');\n  const L = (t, a) => `<div><h3>${t} (${a.length})</h3>${a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class=\"small muted\">Yok.</p>'}</div>`;\n  const DS = V.deneme ? `<div class=\"panel row\" style=\"align-items:center;gap:10px;flex-wrap:wrap\"><div style=\"font-size:42px;font-weight:700;letter-spacing:1px\">DENEME SAATİ ${esc(V.deneme.saat)}</div>\n      <span class=\"pill p-acc\">Gün ${V.deneme.gun} · hız ×${V.deneme.hiz == null ? 1 : V.deneme.hiz}</span>\n      ${[0, 1, 2, 5].map(h => `<button class=\"btn sm ${V.deneme.hiz === h ? '' : 'ghost'}\" data-act=\"hiz\" data-v=\"${h}\">${h === 0 ? 'Durdur' : '×' + h}</button>`).join('')}\n      <input id=\"dsaat\" placeholder=\"12:50\" size=\"5\" style=\"width:70px\" value=\"${esc(dsv)}\"><button class=\"btn sm ghost\" data-act=\"saatAyarla\">Saate atla</button>\n      ${(V.deneme.gunler || [1, 2]).filter(g => g !== V.deneme.gun).map(g => `<button class=\"btn sm ghost\" data-act=\"gun\" data-v=\"${g}\">Gün ${g}'e geç</button>`).join('')}</div>` : '';\n  const DT = V.dt ? (() => { const cols = V.dt.duzeyler.concat(['*']);\n    const th = `<tr><th></th>${cols.map(c => `<th>${c === '*' ? 'Toplam' : esc(c) + ' düzeyi'}</th>`).join('')}</tr>`;\n    const tr = V.dt.satirlar.map((r, i) => `<tr class=\"${r.kritik ? 'kritik' : ''}\"><th>${esc(r.ad)}</th>${r.hucre.map((h, j) => { const sec = dzSec === i + '|' + j;\n      return `<td>${h.n ? `<button class=\"dzn ${sec ? 'sec' : ''} ${r.kritik ? 'kr' : ''}\" data-act=\"dz\" data-v=\"${i}|${j}\" title=\"Listeyi göster\">${h.n}</button>` : '<span class=\"muted\">0</span>'}</td>`; }).join('')}</tr>`).join('');\n    let liste = '';\n    if (dzSec) { const [i, j] = dzSec.split('|').map(Number), r = V.dt.satirlar[i], h = r && r.hucre[j];\n      if (h && h.n) liste = `<div class=\"dzliste\"><div class=\"row\" style=\"justify-content:space-between;align-items:center\"><h3>${esc(r.ad)} · ${cols[j] === '*' ? 'tüm düzeyler' : esc(cols[j]) + ' düzeyi'} (${h.n})</h3><button class=\"btn sm ghost\" data-act=\"dz\" data-v=\"\">Kapat</button></div>\n        <div class=\"scroll\"><table class=\"ozet\"><thead><tr><th>Ad Soyad</th><th>No</th><th>Sınıf</th><th>Düzey</th><th>Ayrıntı</th></tr></thead><tbody>${h.l.map(x => `<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td><td>${esc(x[2])}</td><td>${esc(x[3])}</td><td>${esc(x[4])}</td></tr>`).join('')}</tbody></table></div></div>`;\n      else dzSec = null; }\n    return `<div class=\"panel\"><h3>Öğrenci durumu (düzey bazında) · rakama tıklayınca liste açılır</h3><div class=\"scroll\"><table class=\"dztab\">${th}${tr}</table></div>${liste}</div>`; })()\n    : `<div class=\"stats\">${V.sayilar.map(([l, n]) => `<div class=\"stat\"><b>${n}</b><span>${l}</span></div>`).join('')}</div>`;\n  return `<div class=\"stack\">${DS}${DT}\n    <div class=\"panel\"><h3>Jüri ve slot tablosu · ${esc(V.gun)} · ${esc(V.saat)}</h3><div class=\"scroll\"><table class=\"board\">${head}${rows}</table></div>\n    <p class=\"small muted\" style=\"margin-top:6px\">Mavi: sınavda/sırada · yeşil: SINAV BİTTİ · kırmızı: gelmedi · kesikli: aktarıldı ya da jüri kapandı.</p></div>\n    <div class=\"panel lists\">${L('Eş bekleyen', V.bekleyen)}${L('Aktarılan', V.aktarilan)}${L('Geç kalan – bekliyor (en az geç kalan üstte)', V.gec)}${L('Geç kaldı – sınava alınamadı', V.alinamadi)}</div>\n    ${(V.unutulan || []).length ? `<div class=\"panel\" style=\"border:2px solid var(--bad,#c62828)\"><h3>Unutulan işlemler</h3><ul>${V.unutulan.map(u => `<li><b>${esc(u.ad)}</b> – ${esc(u.neden)}<div class=\"row\" style=\"margin:4px 0 8px\"><button class=\"btn sm\" data-act=\"hatirlat\" data-jid=\"${esc(u.jid)}\" data-neden=\"${esc(u.neden)}\">Jüriye hatırlat</button>${u.h.map(h => `<button class=\"btn sm ghost\" data-act=\"yerine\" data-id=\"${esc(h.id)}\">${esc(h.ad)} yerine işlem</button>`).join('')}</div></li>`).join('')}</ul></div>` : ''}\n    ${V.uyarilar.length ? `<div class=\"panel\"><h3>Not uyarıları</h3><ul>${V.uyarilar.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${vEslesme(true)}</div>`;\n}\nfunction vUyari() {\n  if (!V) return '';\n  const acil = (V.msj || []).filter(m => m.durum === 'acik' && m.acil), acik = acikSay(), hazir = (V.duzeyler || []).filter(d => d.hazir && !d.yayinda);\n  return (acil.length ? `<div class=\"note n-bad\" style=\"margin-bottom:10px\"><b>ACİL:</b> ${acil.map(m => esc(m.ad + ' – ' + m.katAd)).join(' · ')} <button class=\"btn sm bad\" data-act=\"tab\" data-v=\"mesaj\">Mesajlara git</button></div>` : '')\n    + (acik && tab !== 'mesaj' ? `<div class=\"note n-hl\" style=\"margin-bottom:10px\">${acik} cevap bekleyen mesaj var. <button class=\"btn sm\" data-act=\"tab\" data-v=\"mesaj\">Mesajlar</button></div>` : '')\n    + (hazir.length && tab !== 'yayin' ? `<div class=\"note n-ok\" style=\"margin-bottom:10px\">${hazir.map(d => esc(d.ad) + ' tamamlandı, yayıma hazır').join(' · ')}. <button class=\"btn sm\" data-act=\"tab\" data-v=\"yayin\">Not yayımı</button></div>` : '');\n}\nfunction vMesaj() {\n  const L = V.msj || [], dd = { acik: ['p-warn', 'Cevap bekliyor'], cevap: ['p-acc', 'Cevaplandı'], cozuldu: ['p-ok', 'Çözüldü'] };\n  if (!L.length) return '<div class=\"panel muted\">Henüz mesaj yok.</div>';\n  return `<div class=\"stack\">${mesaj ? `<div class=\"note n-ok\">${esc(mesaj)}</div>` : ''}${L.map(m => `<div class=\"msg ${m.acil ? 'acil' : ''} ${m.durum === 'cozuldu' ? 'kapali' : ''}\">\n    <div class=\"row\" style=\"justify-content:space-between\"><div><b>${m.kim === 'o' ? 'Öğrenci' : 'Hoca'}: ${esc(m.ad)}</b> ${m.no && !m.ad.includes(m.no) ? `<span class=\"mono small\">${esc(m.no)}</span>` : ''} <span class=\"small muted\">${esc(m.yer || '')}</span></div>\n      <div><span class=\"small muted\">${esc(m.saat)}</span> <span class=\"pill ${dd[m.durum][0]}\">${dd[m.durum][1]}</span>${m.dil && m.dil !== 'tr' ? ` <span class=\"pill p-mut\">${m.dil.toUpperCase()}</span>` : ''}</div></div>\n    ${m.kim === 'h' && m.kat === 'diger' ? '' : `<div><b>${esc(m.kat === 'acil' && m.kim === 'h' ? 'ACİL' : m.katAd)}</b></div>`}${m.metin ? `<div>${esc(m.metin)}</div>` : ''}${m.ceviri ? `<div class=\"small\"><i>Türkçe çeviri:</i> ${esc(m.ceviri)}</div>` : ''}\n    ${m.cev.map(c => `<div class=\"cv\"><div class=\"small muted\">Yönetim · ${esc(c.saat)}</div><div>${esc(c.metin)}</div>${c.ceviri ? `<div class=\"small muted\">Öğrenciye giden çeviri: ${esc(c.ceviri)}</div>` : ''}</div>`).join('')}\n    ${m.durum !== 'cozuldu' ? `<div class=\"row\" style=\"align-items:flex-end\"><textarea id=\"cv-${m.id}\" rows=\"2\" placeholder=\"Cevabınız${m.dil && m.dil !== 'tr' ? ' (Türkçe yazın; öğrencinin diline çevrilir)' : ''}\" style=\"flex:1 1 260px\">${esc(cvTaslak[m.id] || '')}</textarea>\n      <button class=\"btn sm\" data-act=\"cevap\" data-id=\"${m.id}\">Cevap gönder</button><button class=\"btn sm ghost\" data-act=\"cozuldu\" data-id=\"${m.id}\">Çözüldü</button></div>` : ''}</div>`).join('')}</div>`;\n}\n/* Araçlar (MehDer, 1.11.2026): öğrenciyi jüriye ata · yeniden sınava al · jüriye mesaj · TV duyurusu · öğrenciye mesaj */\nconst arac = { no: '', jid: '', k: '', jsec: [], jhepsi: false, jmetin: '', tvmetin: '', tvdk: '10', ono: '', ometin: '', ohedef: 'tek' };\nfunction vAraclar() {\n  const A = V.araclar || { juriler: [], slotlar: [], jmsj: [], omsj: [], geriAlinabilir: [] };\n  if (!arac.k && A.simdi != null) arac.k = String(Math.max(0, A.simdi + 1 < A.slotlar.length ? A.simdi + 1 : A.simdi));\n  const jOpt = A.juriler.map(j => `<option value=\"${esc(j.jid)}\" ${arac.jid === j.jid ? 'selected' : ''}>${esc(j.ad)} · Derslik ${esc(j.room)}</option>`).join('');\n  const kOpt = A.slotlar.map((x, i) => `<option value=\"${i}\" ${String(arac.k) === String(i) ? 'selected' : ''}>${esc(x)}${i === A.slotlar.length - 1 ? ' (yedek)' : ''}</option>`).join('');\n  return `<div class=\"stack\">${mesaj ? `<div class=\"note n-ok\">${esc(mesaj)}</div>` : ''}\n  <div class=\"panel stack\"><h3 style=\"margin:0\">1. Öğrenciyi jüriye ata</h3><p class=\"small muted\">Sistemin kuralları bu atamada devre dışıdır; karar yönetimindir. Öğrencinin, jürinin ve TV'nin ekranında görünür.</p>\n    <div class=\"row\" style=\"align-items:flex-end;flex-wrap:wrap\"><label class=\"f\">Öğrenci no<input data-a=\"no\" value=\"${esc(arac.no)}\" inputmode=\"numeric\" style=\"width:150px\"></label>\n    <label class=\"f\">Jüri<select data-a=\"jid\"><option value=\"\">Seçin</option>${jOpt}</select></label><label class=\"f\">Slot<select data-a=\"k\">${kOpt}</select></label>\n    <button class=\"btn\" data-act=\"aAta\">Ata</button></div></div>\n  <div class=\"panel stack\"><h3 style=\"margin:0\">2. Yeniden sınava al</h3><p class=\"small muted\">\"Gelmedi\" ya da \"alınamadı\" olan öğrenci kayıt masasına gelirse: G kalkar, öğrenci öncelikli olarak beklemeye döner (isterseniz sonra 1. araçla doğrudan jüriye atayın).</p>\n    ${A.geriAlinabilir.length ? `<div class=\"scroll\"><table><tbody>${A.geriAlinabilir.map(o => `<tr><td><b>${esc(o.ad)}</b> <span class=\"mono small\">${esc(o.no)}</span></td><td>${esc(o.lv)}</td><td>${o.st === 'gelmedi' ? 'Gelmedi' : 'Alınamadı'}</td><td><button class=\"btn sm\" data-act=\"aYeniden\" data-no=\"${esc(o.no)}\">Yeniden sınava al</button></td></tr>`).join('')}</tbody></table></div>` : '<p class=\"small muted\">Şu an \"Gelmedi\" ya da \"alınamadı\" öğrenci yok.</p>'}</div>\n  <div class=\"panel stack\"><h3 style=\"margin:0\">3. Jüriye mesaj</h3>\n    <label class=\"ck\"><input type=\"checkbox\" data-a=\"jhepsi\" ${arac.jhepsi ? 'checked' : ''}> <b>Tüm jüriler</b></label>\n    ${arac.jhepsi ? '' : `<div class=\"row\" style=\"flex-wrap:wrap;gap:6px\">${A.juriler.map(j => `<label class=\"ck\" style=\"border:1px solid var(--line);border-radius:8px;padding:6px 9px\"><input type=\"checkbox\" data-jsec=\"${esc(j.jid)}\" ${arac.jsec.indexOf(j.jid) >= 0 ? 'checked' : ''}> ${esc(j.ad)}</label>`).join('')}</div>`}\n    <label class=\"f\">Mesaj<textarea data-a=\"jmetin\" rows=\"2\" maxlength=\"600\">${esc(arac.jmetin)}</textarea></label><div><button class=\"btn\" data-act=\"aJmesaj\">Jüri ekranına gönder</button></div>\n    ${A.jmsj.length ? `<div class=\"scroll\"><table><thead><tr><th>Saat</th><th>Kime</th><th>Mesaj</th><th>Okuyan</th></tr></thead><tbody>${A.jmsj.map(m => `<tr><td class=\"mono\">${esc(m.saat)}</td><td>${esc(m.kime)}</td><td>${esc(m.metin)}</td><td>${m.okuyan} / ${m.toplam}${m.okumayan.length && m.okumayan.length <= 6 ? `<br><span class=\"small muted\">Okumayan: ${esc(m.okumayan.join(', '))}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>\n  <div class=\"panel stack\"><h3 style=\"margin:0\">4. TV duyurusu</h3><p class=\"small muted\">TV'de QR'ın üstünde büyük harflerle görünür; altına otomatik İngilizce çevirisi eklenir.</p>\n    ${A.tvd ? `<div class=\"note n-hl\"><b>Şu an TV'de (${A.tvd.kalan} dk kaldı):</b> ${esc(A.tvd.metin)}${A.tvd.en ? `<br><span class=\"small\">${esc(A.tvd.en)}</span>` : ''} <button class=\"btn sm ghost\" data-act=\"aTvKaldir\">Kaldır</button></div>` : ''}\n    <div class=\"row\" style=\"align-items:flex-end;flex-wrap:wrap\"><label class=\"f\" style=\"flex:1 1 300px\">Duyuru<input data-a=\"tvmetin\" value=\"${esc(arac.tvmetin)}\" maxlength=\"300\"></label><label class=\"f\">Süre (dk)<input data-a=\"tvdk\" value=\"${esc(arac.tvdk)}\" inputmode=\"numeric\" style=\"width:70px\"></label><button class=\"btn\" data-act=\"aTv\">TV'de göster</button></div></div>\n  <div class=\"panel stack\"><h3 style=\"margin:0\">5. Öğrenciye mesaj</h3><p class=\"small muted\">Öğrencinin telefonunda kendi dilinde (otomatik çeviri) ve titreşimle görünür; öğrenci \"Tamam, bana denileni yapıyorum\" düğmesine basar.</p>\n    <div class=\"row\" style=\"align-items:flex-end;flex-wrap:wrap\"><label class=\"f\">Kime<select data-a=\"ohedef\">${[['tek', 'Tek öğrenci (numara)'], ['gun', 'Bugün sınava giren tüm öğrenciler']].concat(((V.dt && V.dt.duzeyler) || []).map(l => ['duzey:' + l, 'Düzey: ' + l])).concat((V.slotlar || []).map((s, i) => ['oturum:' + i, 'Oturum: ' + s])).map(([v, t]) => `<option value=\"${v}\" ${arac.ohedef === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>${arac.ohedef === 'tek' ? `<label class=\"f\">Öğrenci no<input data-a=\"ono\" value=\"${esc(arac.ono)}\" inputmode=\"numeric\" style=\"width:150px\"></label>` : ''}<label class=\"f\" style=\"flex:1 1 300px\">Mesaj<input data-a=\"ometin\" value=\"${esc(arac.ometin)}\" maxlength=\"600\"></label><button class=\"btn\" data-act=\"aOmesaj\">Gönder</button></div>\n    ${A.omsj.length ? `<div class=\"scroll\"><table><thead><tr><th>Saat</th><th>Öğrenci</th><th>Mesaj</th><th>Durum</th></tr></thead><tbody>${A.omsj.map(m => `<tr><td class=\"mono\">${esc(m.saat)}</td><td>${esc(m.ad)} <span class=\"mono small\">${esc(m.no)}</span></td><td>${esc(m.metin)}</td><td>${m.onay ? `<span class=\"pill p-ok\">Onayladı ${esc(m.onay)}</span>` : '<span class=\"pill p-warn\">Onay bekleniyor</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}</div></div>`;\n}\ndocument.addEventListener('input', e => { const a = e.target.dataset && e.target.dataset.a; if (a && a !== 'jhepsi') arac[a] = e.target.value; });\ndocument.addEventListener('change', e => {\n  const d = e.target.dataset || {};\n  if (d.a === 'jhepsi') { arac.jhepsi = e.target.checked; render(); }\n  else if (d.a === 'ohedef') { arac.ohedef = e.target.value; render(); }\n  else if (d.a) arac[d.a] = e.target.value;\n  if (d.jsec) { arac.jsec = arac.jsec.filter(x => x !== d.jsec); if (e.target.checked) arac.jsec.push(d.jsec); }\n});\nfunction vYayin() {\n  const D = V.duzeyler || [];\n  return `<div class=\"panel stack\"><h3 style=\"margin:0\">Speaking notlarının öğrencilere yayımlanması</h3>\n    <p class=\"small muted\">Düzeydeki bütün sınavlar bitip notlar kesinleşince \"yayıma hazır\" olur. Yayımlanan notları öğrenciler, anketi doldurduktan sonra telefonlarında görür. Ekranda \"Kesin sonuç AnaSİS'te duyurulacaktır\" notu yer alır. Writing notları yalnızca AnaSİS'ten duyurulur.</p>\n    ${mesaj ? `<div class=\"note n-ok\">${esc(mesaj)}</div>` : ''}\n    <div class=\"scroll\"><table><thead><tr><th>Gün · düzey</th><th>Öğrenci</th><th>Sınavı biten</th><th>Not kesinleşen</th><th>Süren</th><th>Okutmayan</th><th>Durum</th><th></th></tr></thead><tbody>\n    ${D.map(d => `<tr><td><b>${esc(d.ad)}</b></td><td>${d.toplam}</td><td>${d.bitti}</td><td>${d.kesin}</td><td>${d.aktif}</td><td>${d.okutmayan}</td>\n      <td>${d.yayinda ? '<span class=\"pill p-ok\">Yayımlandı</span>' : d.hazir ? '<span class=\"pill p-acc\">Yayıma hazır</span>' : '<span class=\"pill p-mut\">Devam ediyor</span>'}</td>\n      <td>${d.yayinda ? '' : d.hazir ? `<button class=\"btn sm\" data-act=\"yayinla\" data-key=\"${esc(d.key)}\">${esc(d.lv)} düzeyi notlarını yayımla</button>` : `<button class=\"btn sm ghost\" data-act=\"yayinla\" data-key=\"${esc(d.key)}\" data-zorla=\"1\">Yine de yayımla</button>`}</td></tr>`).join('') || '<tr><td colspan=\"8\" class=\"muted\">Düzey yok.</td></tr>'}\n    </tbody></table></div></div>`;\n}\nfunction vAnket() {\n  const A = V.anket || {};\n  const blok = tur => { const a = A[tur]; if (!a || !a.gruplar.length) return `<div class=\"panel\"><h3>${esc(a ? a.ad : tur)} anketi</h3><p class=\"muted\">Henüz cevap yok.</p></div>`;\n    return `<div class=\"panel\"><h3>${esc(a.ad)} anketi</h3><div class=\"scroll\"><table class=\"ozet\"><thead><tr><th>Madde</th>${a.gruplar.map(g => `<th>${esc(g.ad)}<br><span class=\"muted\">n=${g.n}</span></th>`).join('')}</tr></thead><tbody>\n      ${a.madde.map((m, i) => `<tr><td class=\"m\">${i + 1}. ${esc(m)}</td>${a.gruplar.map(g => { const y = g.yuzde[i]; return `<td><div class=\"bar3\"><i class=\"a\" style=\"width:${y[0]}%\"></i><i class=\"b\" style=\"width:${y[1]}%\"></i><i class=\"c\" style=\"width:${y[2]}%\"></i></div><span class=\"small\">%${y[0]} · %${y[1]} · %${y[2]}</span></td>`; }).join('')}</tr>`).join('')}\n      <tr><td class=\"m\">${esc(a.sorunAd)} (Evet)</td>${a.gruplar.map(g => `<td>${g.sorun} kişi</td>`).join('')}</tr></tbody></table></div></div>`; };\n  return `<div class=\"stack\"><p class=\"small muted\">Yüzdeler: katılıyorum · kısmen katılıyorum · katılmıyorum. Yazılı görüşler tablo dosyasındaki \"Anket Yazıları\" sayfasındadır; isim yalnızca kişi izin verdiyse yazılır.</p>\n   <div class=\"row\" style=\"gap:8px;flex-wrap:wrap\"><b class=\"small\">Excel indir:</b><button class=\"btn sm ghost\" data-act=\"ankXls\" data-v=\"Öğrenci (speaking)\">Öğrenci anketi</button><button class=\"btn sm ghost\" data-act=\"ankXls\" data-v=\"Hoca (speaking)\">Hoca (speaking)</button><button class=\"btn sm ghost\" data-act=\"ankXls\" data-v=\"Hoca (writing)\">Hoca (writing)</button><button class=\"btn sm\" data-act=\"ankXls\" data-v=\"\">Hepsi</button></div>${blok('O')}${blok('S')}${blok('W')}</div>`;\n}\nfunction vHocalar() { return vYonKul() + vHocaListe(); }\nfunction vHocaListe() {\n  const ilk = V.hocalar.filter(h => h.ilk).length;\n  return `<div class=\"panel\"><h3>Hocalar ve şifreler · ilk giriş yapan ${ilk} / ${V.hocalar.length}</h3><p class=\"small muted\">Şifreler tuzlu özet olarak saklanır; kimse göremez. Geçici şifre, hoca ilk girişini yapana kadar görünür.</p>\n   ${mesaj ? `<div class=\"note n-ok\">${esc(mesaj)}</div>` : ''}\n   <div class=\"scroll\"><table><thead><tr><th>Hoca</th><th>İlk giriş</th><th>Geçici şifre</th><th>Durum</th><th></th></tr></thead><tbody>${V.hocalar.map(h => `<tr><td><b>${esc(h.ad)}</b></td><td>${h.ilk ? '<span class=\"pill p-ok\">Yapıldı</span>' : '<span class=\"pill p-warn\">Bekleniyor</span>'}</td><td class=\"mono\">${h.temp ? esc(h.temp) : '—'}</td><td>${h.kilit ? '<span class=\"pill p-bad\">Kilitli</span>' : ''}</td>\n   <td><div class=\"row\"><button class=\"btn sm ghost\" data-act=\"sifirla\" data-id=\"${h.id}\">Şifre sıfırla</button><button class=\"btn sm ghost\" data-act=\"yerine\" data-id=\"${h.id}\">Hoca yerine işlem</button></div></td></tr>`).join('')}</tbody></table></div></div>`;\n}\nfunction vWriting() {\n  return `<div class=\"panel\"><h3>Writing zarfları</h3><div class=\"scroll\"><table><thead><tr><th>Sınıf</th><th>First</th><th>Second</th><th>Kesinleşen</th></tr></thead><tbody>${V.zarflar.map(z => `<tr><td><b>${esc(z.cls)}</b></td><td>${esc(z.f)} ${z.fDone ? '✓' : ''}</td><td>${esc(z.s)} ${z.sDone ? '✓' : ''}</td><td class=\"mono\">${z.kesin} / ${z.toplam}</td></tr>`).join('')}</tbody></table></div></div>`;\n}\n/** Eşleşmeler (madde 4): canlı durumda önceki / şimdiki / sonraki oturum; \"Tüm eşleşmeler\" sekmesinde hepsi. */\nfunction vEslesme(kisa) {\n  const E = (V.eslesmeler || []).filter(e => !kisa || Math.abs(e.k - Math.max(0, V.simdiK)) <= 1);\n  const ks = [...new Set(E.map(e => e.k))];\n  const satir = e => `<tr><td>${esc(e.lv)} · Jüri ${e.juri}</td><td>${esc(e.derslik)}</td><td>${e.uyeler.map(u => `${esc(u.ad)} <span class=\"small muted mono\">${esc(u.no)} · ${esc(u.cls)}</span> ${u.qr ? '✓' : '<span class=\"small muted\">bekleniyor</span>'}${u.src ? ` <span class=\"small\" style=\"color:#a35a00\">(${esc(u.src)})</span>` : ''}`).join('<br>')}</td><td>${e.bitti ? 'bitti' : ''}</td></tr>`;\n  return `<div class=\"panel stack\"><h3 style=\"margin:0\">${kisa ? 'Eşleşmeler – önceki, şimdiki ve sonraki oturum' : 'Tüm eşleşmeler'}</h3>${ks.map(k => { const L = E.filter(e => e.k === k);\n    return `<h4 style=\"margin:6px 0 0\">Oturum ${esc(L[0].saat)} (${L.length} grup)</h4><table class=\"tt\"><thead><tr><th>Jüri</th><th>Derslik</th><th>Öğrenciler</th><th></th></tr></thead><tbody>${L.map(satir).join('')}</tbody></table>`; }).join('') || '<p class=\"small muted\">Bugün eşleşme yok.</p>'}</div>`;\n}\n/* ---------- Anket Excel (madde 6) ve sınav arşivi (madde 7): dosyalar tarayıcıda üretilir ---------- */\nlet arsVeri = null, arsSec = { g: '', lv: '' };\nfunction xlsxIndir(ad, sayfalar) {\n  if (typeof XLSX === 'undefined') { alert('Excel kütüphanesi yüklenemedi; sayfayı yenileyin.'); return; }\n  const wb = XLSX.utils.book_new(); sayfalar.forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n.slice(0, 31))); XLSX.writeFile(wb, ad);\n}\nfunction anketExcel(v, hangi) {\n  const A = v.anket.slice(1), Y = v.yazi.slice(1), tur = hangi;   // 'Öğrenci (speaking)' | 'Hoca (speaking)' | 'Hoca (writing)' | '' (hepsi)\n  const sec = A.filter(r => !tur || r[1] === tur), ys = Y.filter(r => !tur || r[1] === tur), ol = v.olcek;\n  const turler = tur ? [tur] : Object.keys(v.madde);\n  const soru = [['Anket', 'Madde', ol[0], ol[1], ol[2], 'n', '%' + ol[0]]]; turler.forEach(t => (v.madde[t] || []).forEach((m, i) => { const L = sec.filter(r => r[1] === t).map(r => r[4 + i]).filter(String);\n    const c = ol.map(o => L.filter(x => x === o).length); soru.push([t, m, c[0], c[1], c[2], L.length, L.length ? Math.round(c[0] / L.length * 100) : '']); }));\n  const grup = (col, ad) => { const out = [['Anket', ad, 'Madde', ol[0], ol[1], ol[2], 'n']]; turler.forEach(t => { const R = sec.filter(r => r[1] === t); [...new Set(R.map(r => r[col]))].sort().forEach(gv => (v.madde[t] || []).forEach((m, i) => {\n    const L = R.filter(r => r[col] === gv).map(r => r[4 + i]).filter(String); out.push([t, gv, m].concat(ol.map(o => L.filter(x => x === o).length), [L.length])); })); }); return out; };\n  xlsxIndir('Anket raporu' + (tur ? ' – ' + tur : '') + '.xlsx', [['Soru bazında', soru], ['Düzey bazında', grup(2, 'Düzey')], ['Jüri bazında', grup(3, 'Jüri')], ['Yazılı görüşler', [v.yazi[0] || []].concat(ys)], ['Ham veri', [v.anket[0] || []].concat(sec)]]);\n}\nfunction arsivExcel(v) { xlsxIndir(v.baslik + '.xlsx', [['Özet', [['Alan', 'Değer']].concat(v.ozet)], ['Oturumlar', v.oturum], ['Jüriler', v.juri], ['Öğrenci listesi', v.ogr], ['Olay kaydı', v.olay]]); }\nfunction arsivWord(v) {\n  const tb = rows => `<table border=\"1\" cellspacing=\"0\" cellpadding=\"4\" style=\"border-collapse:collapse;font-size:10pt\">${rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${esc(String(c))}</td>` : `<th style=\"background:#ddd\">${esc(String(c))}</th>`).join('')}</tr>`).join('')}</table>`;\n  const html = `<html><head><meta charset=\"utf-8\"><title>${esc(v.baslik)}</title></head><body style=\"font-family:Calibri,Arial\"><h1 style=\"font-size:16pt\">${esc(v.baslik)}</h1><h2 style=\"font-size:13pt\">Özet</h2>${tb([['Alan', 'Değer']].concat(v.ozet))}<h2 style=\"font-size:13pt\">Oturumlar</h2>${tb(v.oturum)}<h2 style=\"font-size:13pt\">Jüriler</h2>${tb(v.juri)}</body></html>`;\n  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\\ufeff' + html], { type: 'application/msword' })); a.download = v.baslik + '.doc'; document.body.appendChild(a); a.click(); a.remove();\n}\nfunction vArsiv() {\n  const G = V.gunlerKul || [];\n  const sec = `<div class=\"row\" style=\"gap:8px;flex-wrap:wrap;align-items:center\"><select id=\"arsGun\">${G.map(g => `<option value=\"${g.g}\" ${String(arsSec.g) === String(g.g) ? 'selected' : ''}>${esc(g.ad)} (${esc(g.lv)})</option>`).join('')}</select>\n    <select id=\"arsLv\"><option value=\"\">Bütün düzeyler</option>${['D1', 'D2', 'C', 'B', 'A'].map(l => `<option ${arsSec.lv === l ? 'selected' : ''}>${l}</option>`).join('')}</select>\n    <button class=\"btn sm\" data-act=\"arsivGoster\">Göster</button><button class=\"btn sm ghost\" data-act=\"arsivXls\">Excel indir</button><button class=\"btn sm ghost\" data-act=\"arsivDoc\">Word indir</button></div>`;\n  const oz = arsVeri && !arsVeri.hata ? `<h3 style=\"margin:8px 0 0\">${esc(arsVeri.baslik)}</h3><div class=\"grid g3\">${arsVeri.ozet.map(([k, v]) => `<div class=\"panel\"><div class=\"small muted\">${esc(k)}</div><div style=\"font-size:22px;font-weight:700\">${esc(String(v))}</div></div>`).join('')}</div>` : arsVeri && arsVeri.hata ? `<p class=\"note n-bad\">${esc(arsVeri.hata)}</p>` : '';\n  return `<div class=\"panel stack\"><h3 style=\"margin:0\">Sınav arşivi</h3><p class=\"small muted\">Sınav günü ve düzey seçin; özet ekranda görünür, Excel (Özet, Oturumlar, Jüriler, Öğrenci listesi, Olay kaydı) ve Word rapor indirilebilir.</p>${sec}${oz}</div>`;\n}\nconst KUL_AD = { 1: '1 · Portal notlu, canlı eşleştirme', 2: '2 · Kâğıt notlu, planlı eşleştirme (sabit plan)', 3: '3 · Kâğıt notlu, canlı eşleştirme' };\nfunction vAyar() {\n  const G = V.gunlerKul || [];\n  return `<div class=\"panel stack\"><h3 style=\"margin:0\">Kullanım şekli (gün bazında)</h3><p class=\"small muted\">Her sınav günü için kullanım şekli o günün ilk QR okutmasına kadar değiştirilebilir. 2. kullanım için sabit plan yüklenmiş olmalıdır.</p>\n  ${G.map(g => `<div class=\"row\" style=\"gap:10px;align-items:center;flex-wrap:wrap\"><b>${esc(g.ad)}</b><span class=\"small muted\">${esc(g.lv)}</span>\n    <select id=\"kul-${g.g}\" ${g.kilit ? 'disabled' : ''}>${[1, 2, 3].map(k => `<option value=\"${k}\" ${g.kul === k ? 'selected' : ''} ${k === 2 && !g.sabit ? 'disabled' : ''}>${KUL_AD[k]}</option>`).join('')}</select>\n    ${g.kilit ? '<span class=\"pill p-mut\">İlk okutma yapıldı – kilitli</span>' : `<button class=\"btn sm\" data-act=\"kul\" data-g=\"${g.g}\">Kaydet</button>`}${g.secili ? '' : ' <span class=\"small muted\">(seçilmedi: eski ayara göre)</span>'}</div>`).join('') || '<p>Sınav günü tanımlı değil.</p>'}\n  ${V.doluluk ? `<h3 style=\"margin:8px 0 0\">Kayıt doluluğu</h3><p class=\"${V.doluluk.yuzde >= 80 ? 'note n-hl' : 'small muted'}\">Sınav durumu kaydı: ${V.doluluk.kb} KB / ${V.doluluk.sinirKb} KB (%${V.doluluk.yuzde}).${V.doluluk.yuzde >= 80 ? ' Sınıra yaklaşıldı: gün sonu arşivi alınmalı.' : ''}</p>` : ''}\n  ${mesaj ? `<div class=\"note n-ok\">${esc(mesaj)}</div>` : ''}</div>`;\n}\nfunction render() {\n  if (!V) { $('#ust').hidden = true; $('#app').innerHTML = vGiris(); return; }\n  $('#ust').hidden = false; const bb = document.getElementById('benAd'); if (bb) bb.textContent = BEN && BEN !== 'yönetim' ? BEN : '';\n  if (V.rol && V.rol !== 'tam') { if (!BV && !bYukleniyor && !bHata) birimYukle(); $('#app').innerHTML = vBirim(); return; }   // İnci Aras: yalnız Öğrenci Birimi\n  const ac = acikSay();\n  const T = [['canli', 'Canlı durum'], ['mesaj', 'Mesajlar' + (ac ? ` (${ac})` : '')], ['yayin', 'Not yayımı'], ['anket', 'Anket'], ['hocalar', 'Hocalar ve şifreler'], ['araclar', 'Araçlar'], ['writing', 'Writing'], ['sonuc', 'Sonuçlar'], ['eslesme', 'Tüm eşleşmeler'], ['birim', 'Birim çalışmaları'], ['arsiv', 'Sınav arşivi'], ['sinav', 'Yeni sınav'], ['ayar', 'Sınav ayarları'], ['derslik', 'Derslikler'], ['kayit', 'Kayıt']];\n  let b = tab === 'canli' ? vCanli() : tab === 'mesaj' ? vMesaj() : tab === 'yayin' ? vYayin() : tab === 'anket' ? vAnket() : tab === 'araclar' ? vAraclar() : tab === 'hocalar' ? vHocalar() : tab === 'writing' ? vWriting()\n    : tab === 'ayar' ? vAyar()\n    : tab === 'eslesme' ? vEslesme(false)\n    : tab === 'arsiv' ? vArsiv()\n    : tab === 'birim' ? vBirim()\n    : tab === 'sinav' ? vSinav()\n    : tab === 'derslik' ? vDerslik()\n    : tab === 'sonuc' ? `<div class=\"panel stack\"><p>Sınıf not listeleri tablo dosyasındaki \"Speaking Sonuçları\" ve \"Writing Sonuçları\" sayfalarına yazılır; oradan Excel olarak indirilir. Önce MehDer'in bilgisayarına kaydedilir, onaydan sonra AnaSİS hocalarına gönderilir.</p><div><button class=\"btn\" data-act=\"sonuc\">Sonuç sayfalarını şimdi yaz</button></div>${mesaj ? `<div class=\"note n-ok\">${esc(mesaj)}</div>` : ''}</div>`\n    : `<div class=\"panel log\">${V.kayit.map(x => `<div>${esc(x)}</div>`).join('')}</div>`;\n  $('#app').innerHTML = `<div class=\"tabs\">${T.map(([k, l]) => `<button class=\"${tab === k ? 'on' : ''}\" data-act=\"tab\" data-v=\"${k}\">${l}</button>`).join('')}</div>` + vUyari() + b;\n}\nasync function yukle(zorla) {\n  if (!ot) { V = null; return render(); }\n  try {\n    const r = await run('apiYonetim', ot); if (r.err) { ot = null; store.sdel('yon'); V = null; } else { V = r; BEN = r.ben || BEN; }\n    const ac = acikSay(); if (sonAcik != null && ac > sonAcik) bip((V.msj || []).some(m => m.durum === 'acik' && m.acil)); sonAcik = ac;\n    if (!zorla && (editing() || basili)) { bekleyenCizim = true; return; } render();\n  } catch (e) { hataGoster(e); }\n}\ndocument.addEventListener('focusout', () => setTimeout(() => { if (bekleyenCizim && !basili && !editing()) { bekleyenCizim = false; render(); } }, 0));\n/* Cevap taslakları yeniden çizimde kaybolmasın */\nconst cvTaslak = {};\ndocument.addEventListener('input', e => { if (e.target.id && e.target.id.startsWith('cv-')) cvTaslak[e.target.id.slice(3)] = e.target.value; });\ndocument.addEventListener('submit', async e => { e.preventDefault(); gmesaj = ''; const f = e.target.dataset.f;\n  try {\n    let r;\n    if (f === 'yyeni') r = await run('apiYonetimSifreBelirle', yg.e, yg.onay, $('#p1').value, $('#p2').value);\n    else { yg.e = $('#ye').value.trim().toLowerCase(); store.set('yonE', yg.e); r = await run('apiYonetimGiris', yg.e, $('#pw').value); }\n    if (r.err) gmesaj = r.err; else if (r.yeniSifre) { yg.asama = 'yeni'; yg.onay = r.onay; yg.ad = r.ad; } else { yg.asama = 'giris'; ot = r.oturum; BEN = r.ad || null; store.sset('yon', ot); }\n  } catch (err) { hataGoster(err); } yukle(true); });\ndocument.addEventListener('click', async e => {\n  const b = e.target.closest('[data-act]'); if (!b) return; const d = b.dataset;\n  if (d.act === 'tab') { tab = d.v; mesaj = ''; if (tab === 'birim') { bMsg = ''; birimYukle(); } if (tab === 'sinav' || tab === 'derslik') { sMsg = ''; if (!sYuk) sinavYukle(); } return render(); }\n  if (d.act === 'dz') { dzSec = (d.v && dzSec !== d.v) ? d.v : null; return render(); }\n  if (d.act === 'cikis') { await run('apiCikis', ot).catch(() => { }); store.sdel('yon'); ot = null; V = null; BV = null; bHata = ''; SG = null; SD = null; SX = null; DH = null; sDegisti = false; dhDegisti = false; return render(); }\n  b.disabled = true;\n  try {\n    if (d.act === 'sifirla') { const ep = confirm('Yeni geçici şifre hocaya e-postayla da gönderilsin mi? (İptal: yalnızca ekranda göster)'); const r = await run('apiYonetimIslem', ot, 'sifirla', { id: d.id, eposta: ep }); mesaj = r.mesaj || ''; if (r.v) V = r.v; }\n    if (d.act === 'yonSifirla') { if (confirm('Bu yöneticinin şifresi sıfırlansın mı? İlk girişte ortak yönetim şifresiyle yeni şifre belirleyecek.')) { const r = await run('apiYonetimIslem', ot, 'yonSifirla', { e: d.e }); mesaj = r.mesaj || ''; if (r.v) V = r.v; } }\n    if (d.act === 'ortakSifre') { const r = await run('apiYonetimIslem', ot, 'ortakSifre', { eski: $('#os0').value, p1: $('#os1').value, p2: $('#os2').value }); mesaj = r.mesaj || ''; if (r.v) V = r.v; }\n    if (d.act === 'kendiSifre') { const r = await run('apiYonetimIslem', ot, 'kendiSifre', { eski: $('#ks0').value, p1: $('#ks1').value, p2: $('#ks2').value }); mesaj = r.mesaj || ''; if (r.v) V = r.v; }\n    if (d.act === 'hiz') { const r = await run('apiYonetimIslem', ot, 'saat', { hiz: Number(d.v) }); mesaj = r.mesaj || ''; if (r.v) V = r.v; }\n    if (d.act === 'saatAyarla') { const s = ($('#dsaat') || {}).value || ''; if (/^\\d{1,2}:\\d{2}$/.test(s)) { const r = await run('apiYonetimIslem', ot, 'saat', { saat: s }); mesaj = r.mesaj || ''; if (r.v) V = r.v; } }\n    if (d.act === 'gun') { const r = await run('apiYonetimIslem', ot, 'gun', { gun: Number(d.v) }); mesaj = r.mesaj || ''; if (r.v) V = r.v; }\n    if (d.act === 'yerine') { const r = await run('apiYonetimIslem', ot, 'yerine', { id: d.id }); if (r.hocaOturum) { window.open(`${URL0}?v=hoca&k=${encodeURIComponent(r.token)}&o=${encodeURIComponent(r.hocaOturum)}`, '_blank'); } }\n    if (d.act === 'sonuc') { const r = await run('apiYonetimIslem', ot, 'sonuc', {}); mesaj = r.mesaj || ''; }\n    if (d.act === 'cevap') { const el = document.getElementById('cv-' + d.id), m = ((el ? el.value : '') || cvTaslak[d.id] || '').trim(); if (m) { const r = await run('apiYonetimIslem', ot, 'cevap', { id: d.id, metin: m }); mesaj = r.mesaj || ''; if (r.v) V = r.v; if (!r.hata) delete cvTaslak[d.id]; } else mesaj = 'Önce cevabı yazın.'; }\n    const yi = (islem, a) => run('apiYonetimIslem', ot, islem, a).then(r => { mesaj = r.mesaj || ''; if (r.v) V = r.v; return r; });\n    if (d.act === 'aAta') { if (!arac.no || !arac.jid) mesaj = 'Öğrenci no ve jüri seçin.'; else { const r = await yi('ata', { no: arac.no, jid: arac.jid, k: Number(arac.k) }); if (/atandı/.test(r.mesaj || '')) arac.no = ''; } }\n    if (d.act === 'aYeniden') await yi('yeniden', { no: d.no });\n    if (d.act === 'aJmesaj') { if (!arac.jmetin.trim()) mesaj = 'Mesajı yazın.'; else { const r = await yi('jmesaj', { jids: arac.jsec, hepsi: arac.jhepsi, metin: arac.jmetin }); if (/gönderildi/.test(r.mesaj || '')) arac.jmetin = ''; } }\n    if (d.act === 'aTv') { const r = await yi('tv', { metin: arac.tvmetin, dk: Number(arac.tvdk) || 10 }); if (/görünecek/.test(r.mesaj || '')) arac.tvmetin = ''; }\n    if (d.act === 'aTvKaldir') await yi('tvkaldir', {});\n    if (d.act === 'ankXls') { const r = await run('apiYonetimIslem', ot, 'anketVeri', {}); anketExcel(r.veri, d.v); }\n    if (d.act === 'arsivGoster' || d.act === 'arsivXls' || d.act === 'arsivDoc') { const g = $('#arsGun').value, lv = $('#arsLv').value; arsSec = { g, lv };\n      const r = await run('apiYonetimIslem', ot, 'arsivVeri', { gun: Number(g), lv }); arsVeri = r.veri;\n      if (d.act === 'arsivXls') arsivExcel(arsVeri); if (d.act === 'arsivDoc') arsivWord(arsVeri); }\n    if (d.act === 'kul') { const sel = document.getElementById('kul-' + d.g); if (sel) await yi('kullanim', { gun: Number(d.g), kul: Number(sel.value) }); }\n    if (d.act === 'hatirlat') await yi('jmesaj', { jids: [d.jid], hepsi: false, metin: 'Hatırlatma: ' + d.neden + '. Lütfen jüri ekranınızdan ilgili düğmeye basın (Geldi / Gelmedi / SINAV BİTTİ).' });\n    if (d.act === 'aOmesaj') { const tek = arac.ohedef === 'tek'; if ((tek && !arac.ono) || !arac.ometin.trim()) mesaj = tek ? 'Öğrenci no ve mesajı yazın.' : 'Mesajı yazın.'; else if (!tek && !confirm('Bu mesaj seçtiğiniz gruptaki bütün öğrencilere gidecek. Gönderilsin mi?')) { } else { const r = await yi('omesaj', { no: arac.ono, metin: arac.ometin, hedef: arac.ohedef }); if (/gönderildi/.test(r.mesaj || '')) { arac.ometin = ''; } } }\n    if (d.act === 'cozuldu') { const r = await run('apiYonetimIslem', ot, 'cozuldu', { id: d.id }); if (r.v) V = r.v; mesaj = ''; }\n    if (d.act === 'yayinla') { if (!d.zorla || confirm('Düzey henüz \"hazır\" değil (süren sınav ya da kesinleşmemiş not olabilir). Yine de yayımlansın mı?')) { const r = await run('apiYonetimIslem', ot, 'yayinla', { key: d.key, zorla: !!d.zorla }); mesaj = r.mesaj || ''; if (r.v) V = r.v; } }\n    sonAcik = acikSay();\n  } catch (err) { hataGoster(err); }\n  render();\n});\nsetInterval(() => { tik++; if (V && (!V.rol || V.rol === 'tam') && tab !== 'birim' && tab !== 'sinav' && tab !== 'derslik' && (V.deneme || tik % 2 === 0)) yukle(); }, 5000);   // birim ekranı canlı değil (dosya seçimi kaybolmasın)\nyukle();\n</script>\n</body></html>\n", "Giris": "<!DOCTYPE html>\n<html lang=\"tr\"><head><base target=\"_top\"><?!= include('Stil'); ?></head>\n<body>\n<div class=\"wrap\" lang=\"tr\">\n  <header class=\"band\"><div><div class=\"eyebrow\">Anadolu Üniversitesi YDYO Hazırlık</div><h1>Sınav Portalı</h1></div></header>\n  <main id=\"app\" data-url=\"<?= url ?>\">\n    <div class=\"panel stack login\" style=\"text-align:center\">\n      <p class=\"muted\" style=\"margin:0\">Giriş türünü seçin</p>\n      <a class=\"btn\" id=\"gHoca\" style=\"font-size:20px;padding:16px;text-decoration:none\" href=\"hoca.html\">Hoca</a>\n      <a class=\"btn ghost\" id=\"gYon\" style=\"font-size:20px;padding:16px;text-decoration:none\" href=\"yonetim.html\">Yönetim</a>\n      <p class=\"small muted\" style=\"margin:0\">Kurumsal e-postanız (…@anadolu.edu.tr) ve şifrenizle girersiniz.</p>\n    </div>\n  </main>\n</div>\n<script>\n(function () { var u = document.getElementById('app').dataset.url || ''; if (u && !window.API_ADRESI) { document.getElementById('gHoca').href = u + '?v=hoca'; document.getElementById('gYon').href = u + '?v=yonetim'; } })();\n</script>\n</body></html>\n", "BirimUI": "<script>\n/* BirimUI.html – Birim çalışmaları ekranı (hoca ve yönetim sayfalarında ortak; 17.11.2026).\n   Sayfanın global `ot` oturumunu ve `render(true)` işlevini kullanır. */\nlet BV = null, bSec = null, bMsg = '', bHata = '', bTaslak = {}, bYukleniyor = false;\nconst bEsc = esc;\nasync function birimYukle() {\n  bYukleniyor = true;\n  try { const r = await run('apiBirim', ot); if (r.err) { bHata = r.err === 'OTURUM' ? 'Oturum sona erdi; yeniden giriş yapın.' : r.err; BV = null; } else { BV = r; bHata = ''; if (!bSec || !BV.birimler.some(b => b.id === bSec)) bSec = (BV.birimler[0] || {}).id || null; } }\n  catch (e) { bHata = (e && e.message) || String(e); }\n  bYukleniyor = false; render(true);\n}\nfunction bDosyaTablo(b, L, arsiv) {\n  if (!L.length) return `<p class=\"small muted\">${arsiv ? 'Arşivde dosya yok.' : 'Bu dönem yüklenmiş dosya yok.'}</p>`;\n  return `<div class=\"scroll\"><table><thead><tr><th>Dosya</th><th>Etiket</th>${b.duzeyli ? '<th>Düzey</th>' : ''}<th>Yükleyen</th><th>Tarih</th>${arsiv ? '<th>Dönem</th>' : ''}<th></th></tr></thead><tbody>\n    ${L.map(d => `<tr><td><b>${bEsc(d.ad)}</b> <span class=\"small muted\">${d.kb} KB</span></td><td><span class=\"pill p-acc\">${bEsc(d.etiket)}</span></td>${b.duzeyli ? `<td>${d.lv === 'Ortak' ? '<span class=\"pill p-ok\">Ortak</span>' : bEsc(d.lv)}</td>` : ''}\n      <td>${bEsc(d.kim)}</td><td class=\"small\">${bEsc(d.tarih)}</td>${arsiv ? `<td class=\"small\">${bEsc(d.donem)}</td>` : ''}\n      <td><div class=\"row\"><button class=\"btn sm\" data-bact=\"indir\" data-id=\"${bEsc(d.id)}\">İndir</button>\n        ${d.ortakYap ? (d.lv === 'Ortak' ? `<select class=\"sm\" data-bact-sel=\"ortak\" data-id=\"${bEsc(d.id)}\" style=\"width:auto\"><option value=\"\">Düzeye al…</option>${BV.duzeyler.map(l => `<option>${l}</option>`).join('')}</select>` : `<button class=\"btn sm ghost\" data-bact=\"ortak\" data-id=\"${bEsc(d.id)}\" data-lv=\"Ortak\">Ortak yap</button>`) : ''}\n        ${d.kaldirabilir ? `<button class=\"btn sm bad ghost\" data-bact=\"kaldir\" data-id=\"${bEsc(d.id)}\">Kaldır</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;\n}\nfunction bArsiv(b) {\n  if (!b.arsiv.length) return '';\n  const gr = {}; b.arsiv.forEach(d => (gr[d.donem] = gr[d.donem] || []).push(d));\n  return `<details class=\"panel\"><summary><b>Arşiv – önceki dönemler ve yıllar</b> <span class=\"small muted\">(${b.arsiv.length} dosya)</span></summary>\n    ${Object.keys(gr).sort().reverse().map(k => `<h4 style=\"margin:12px 0 6px\">${bEsc(k)}</h4>${bDosyaTablo(b, gr[k], false)}`).join('')}</details>`;\n}\nfunction bHedefSec(b, id) {\n  return `<select id=\"${id}\" style=\"width:auto\"><option value=\"birim\">Tüm birim</option>${b.duzeyli ? BV.duzeyler.map(l => `<option value=\"duzey:${l}\">${l} düzeyi</option>`).join('') : ''}\n    ${b.uyeler.map(u => `<option value=\"hoca:${bEsc(u.e)}\">${bEsc(u.ad)}${u.lv ? ' (' + u.lv + ')' : ''}</option>`).join('')}</select>`;\n}\nfunction bMesajlar(b) {\n  const yeni = b.yonetici ? `<div class=\"panel stack\"><h4 style=\"margin:0\">Yeni mesaj</h4>\n    <div class=\"row\" style=\"gap:8px;flex-wrap:wrap\"><label class=\"small\">Alıcı ${bHedefSec(b, 'bmHedef')}</label><label class=\"ck small\"><input type=\"checkbox\" id=\"bmBildir\" checked> Bildirim e-postası gönder</label></div>\n    <textarea id=\"bmMetin\" rows=\"3\" maxlength=\"4000\" data-btaslak=\"yeni:${b.id}\" style=\"width:100%\">${bEsc(bTaslak['yeni:' + b.id] || '')}</textarea>\n    <div><button class=\"btn sm\" data-bact=\"mesaj\">Gönder</button></div></div>` : '';\n  const L = b.mesajlar.map(m => {\n    const kisiler = [...new Map(m.yanit.filter(y => !y.yon).map(y => [y.ke, y.kim])).entries()];\n    return `<div class=\"panel stack\" style=\"gap:8px\"><div class=\"small muted\">${bEsc(m.tarih)} · ${bEsc(m.kim)} → ${bEsc(m.hedef)}</div><div style=\"white-space:pre-wrap\">${bEsc(m.metin)}</div>\n      ${m.yanit.map(y => `<div style=\"border-left:3px solid var(--line);padding-left:10px\"><div class=\"small muted\">${bEsc(y.tarih)} · ${bEsc(y.kim)}${y.yon && b.yonetici ? ' → ' + bEsc(y.hedef) : ''}</div><div style=\"white-space:pre-wrap\">${bEsc(y.metin)}</div></div>`).join('')}\n      <details><summary class=\"small\"><b>Yanıtla</b></summary><div class=\"stack\" style=\"gap:6px;margin-top:6px\">\n        ${b.yonetici ? `<div class=\"row\" style=\"gap:8px;flex-wrap:wrap\"><label class=\"small\">Kime <select id=\"bk-${m.id}\" style=\"width:auto\"><option value=\"\">Mesajın alıcıları</option>${kisiler.map(([e, ad]) => `<option value=\"${bEsc(e)}\">${bEsc(ad)}</option>`).join('')}</select></label><label class=\"ck small\"><input type=\"checkbox\" id=\"bb-${m.id}\"> Bildirim e-postası</label></div>` : ''}\n        <textarea id=\"by-${m.id}\" rows=\"2\" maxlength=\"4000\" data-btaslak=\"y:${m.id}\" style=\"width:100%\">${bEsc(bTaslak['y:' + m.id] || '')}</textarea>\n        <div><button class=\"btn sm\" data-bact=\"yanit\" data-id=\"${m.id}\">Yanıtı gönder</button></div></div></details></div>`;\n  }).join('');\n  return `<h3 style=\"margin:8px 0 0\">Mesajlar</h3>${yeni}${L || '<p class=\"small muted\">Mesaj yok.</p>'}`;\n}\nfunction vBirim() {\n  if (bHata) return `<div class=\"note n-bad\">${bEsc(bHata)}</div>`;\n  if (!BV) return '<div class=\"panel muted\">Birim çalışmaları yükleniyor…</div>';\n  if (!BV.birimler.length) return '<div class=\"panel\">Görebileceğiniz bir birim yok.</div>';\n  const b = BV.birimler.find(x => x.id === bSec) || BV.birimler[0];\n  const sekme = BV.birimler.length > 1 ? `<div class=\"tabs\">${BV.birimler.map(x => `<button class=\"${x.id === b.id ? 'on' : ''}\" data-bact=\"sec\" data-id=\"${x.id}\">${bEsc(x.ad)}</button>`).join('')}</div>` : '';\n  const yukle = `<div class=\"panel stack\"><h4 style=\"margin:0\">Dosya yükle</h4>\n    <div class=\"row\" style=\"gap:8px;flex-wrap:wrap;align-items:flex-end\">\n      <label class=\"f\" style=\"flex:1 1 240px\">Dosya (en çok ${BV.maxMb} MB)<input type=\"file\" id=\"bDosya\"></label>\n      <label class=\"f\">Etiket (zorunlu)<select id=\"bEtiket\" style=\"width:auto\"><option value=\"\">Seçin…</option>${b.etiket.map(e => `<option>${bEsc(e)}</option>`).join('')}</select></label>\n      ${b.duzeyli && b.yonetici ? `<label class=\"f\">Düzey<select id=\"bLv\" style=\"width:auto\"><option value=\"\">Seçin…</option><option>Ortak</option>${BV.duzeyler.map(l => `<option>${l}</option>`).join('')}</select></label>` : ''}\n      ${b.yonetici ? '<label class=\"ck small\"><input type=\"checkbox\" id=\"bBildir\" checked> Bildirim e-postası gönder</label>' : ''}\n      <button class=\"btn\" data-bact=\"yukle\">Yükle</button></div>\n    ${b.duzeyli && !b.yonetici ? `<p class=\"small muted\" style=\"margin:0\">Yüklediğiniz dosyayı ${bEsc(b.lv)} düzeyindeki üyeler ve yönetim görür. \"Ortak\" (bütün düzeyler) yapmayı yalnız yönetim seçebilir.</p>` : ''}</div>`;\n  const ek = b.yonetici ? `<details class=\"panel\"><summary><b>Üyeler</b> <span class=\"small muted\">(${b.uyeler.length})</span></summary><ul>${b.uyeler.map(u => `<li>${bEsc(u.ad)}${u.lv ? ' · ' + u.lv : ''} <span class=\"small muted\">${bEsc(u.e)}</span>${u.sistemde ? '' : ' <span class=\"pill p-warn\">sistemde değil</span>'}</li>`).join('')}</ul>\n      ${b.uyeler.some(u => !u.sistemde) && BV.tam ? '<button class=\"btn sm\" data-bact=\"uyeEkle\">Eksik üyeleri sisteme ekle</button>' : ''}</details>\n    <details class=\"panel\"><summary><b>Kaldırılan dosyalar</b> <span class=\"small muted\">(${b.kaldirilan.length}; \"eski versiyonlar\" klasöründe)</span></summary>${b.kaldirilan.length ? `<ul>${b.kaldirilan.map(k => `<li>${bEsc(k.ad)} · ${bEsc(k.etiket)}${k.lv ? ' · ' + bEsc(k.lv) : ''} – yükleyen ${bEsc(k.kim)}, kaldıran ${bEsc(k.kaldiran)} (${bEsc(k.tarih)})</li>`).join('')}</ul>` : '<p class=\"small muted\">Yok.</p>'}</details>\n    <details class=\"panel\"><summary><b>İndirme kaydı</b> <span class=\"small muted\">(${b.indirmeler.length})</span></summary>${b.indirmeler.length ? `<div class=\"scroll\"><table><thead><tr><th>Tarih</th><th>Kim</th><th>Dosya</th></tr></thead><tbody>${b.indirmeler.map(x => `<tr><td class=\"small\">${bEsc(x.tarih)}</td><td>${bEsc(x.ad)}</td><td>${bEsc(x.dosya)}</td></tr>`).join('')}</tbody></table></div>` : '<p class=\"small muted\">Henüz indirme yok.</p>'}</details>` : '';\n  return `<div class=\"stack\">${sekme}<div class=\"row\" style=\"justify-content:space-between;align-items:baseline\"><h2 style=\"margin:0\">${bEsc(b.ad)}${b.lv ? ` <span class=\"pill p-acc\">${bEsc(b.lv)} düzeyi</span>` : ''}</h2><span class=\"small muted\">Dönem: ${bEsc(b.donem)}</span></div>\n    ${bMsg ? `<div class=\"note n-ok\">${bEsc(bMsg)}</div>` : ''}${yukle}\n    <div class=\"panel\"><h3 style=\"margin:0 0 8px\">Dosyalar – ${bEsc(b.donem)}</h3>${bDosyaTablo(b, b.dosyalar, false)}</div>${bArsiv(b)}${bMesajlar(b)}${ek}</div>`;\n}\nasync function bOnay(b, hedef) {   // yönetim bildirimi: önce alıcı listesi gösterilir, onaylanırsa gider\n  const r = await run('apiBirimIslem', ot, 'bildirimOnizle', { birim: b.id, hedef });\n  if (r.hata) { bilgi(r.hata); return false; }\n  if (!r.n) return true;\n  return await onayla('Bildirim e-postası şu ' + r.n + ' kişiye gidecek:\\n\\n' + r.alicilar.join(', ') + '\\n\\nOnaylıyor musunuz?');\n}\nasync function bIslem(islem, a) {\n  const r = await run('apiBirimIslem', ot, islem, a);\n  if (r.err === 'OTURUM') { bHata = 'Oturum sona erdi; yeniden giriş yapın.'; return render(true); }\n  if (r.hata) { bilgi(r.hata); return; }\n  bMsg = r.mesaj || ''; if (r.v) BV = r.v; render(true); return r;\n}\ndocument.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.btaslak; if (k) bTaslak[k] = e.target.value; });\ndocument.addEventListener('change', async e => {\n  const el = e.target; if (!el.dataset || el.dataset.bactSel !== 'ortak' || !el.value) return;\n  const b = BV.birimler.find(x => x.id === bSec); await bIslem('ortak', { birim: b.id, id: el.dataset.id, lv: el.value });\n});\ndocument.addEventListener('click', async e => {\n  const el = e.target.closest('[data-bact]'); if (!el || !BV) return; const d = el.dataset, b = BV.birimler.find(x => x.id === bSec) || BV.birimler[0];\n  if (d.bact === 'sec') { bSec = d.id; bMsg = ''; return render(true); }\n  try {\n    el.disabled = true;\n    if (d.bact === 'yukle') {\n      const f = $('#bDosya').files[0], et = $('#bEtiket').value, lv = $('#bLv') ? $('#bLv').value : '', bildir = !!($('#bBildir') && $('#bBildir').checked);\n      if (!f) return bilgi('Dosya seçin.'); if (!et) return bilgi('Etiket seçmek zorunludur.'); if (b.duzeyli && b.yonetici && !lv) return bilgi('Düzey seçin (ya da Ortak).');\n      if (f.size > BV.maxMb * 1048576) return bilgi('Dosya ' + BV.maxMb + ' MB\\'tan büyük olamaz.');\n      if (b.yonetici && bildir && !(await bOnay(b, b.duzeyli ? lv : 'birim'))) return;\n      bMsg = 'Yükleniyor…'; render(true);\n      const b64 = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => no(fr.error); fr.readAsDataURL(f); });\n      await bIslem('yukle', { birim: b.id, ad: f.name, tur: f.type, etiket: et, lv, b64, bildir });\n    }\n    if (d.bact === 'indir') {\n      const r = await run('apiBirimIslem', ot, 'indir', { birim: b.id, id: d.id }); if (r.hata) return bilgi(r.hata);\n      const bin = atob(r.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);\n      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: r.tur || 'application/octet-stream' })); a.download = r.ad; document.body.appendChild(a); a.click(); a.remove();\n    }\n    if (d.bact === 'kaldir' && await onayla('Dosya kaldırılsın mı? (Silinmez, \"eski versiyonlar\" klasörüne taşınır.)')) await bIslem('kaldir', { birim: b.id, id: d.id });\n    if (d.bact === 'ortak') await bIslem('ortak', { birim: b.id, id: d.id, lv: d.lv });\n    if (d.bact === 'mesaj') {\n      const metin = ($('#bmMetin').value || '').trim(), hedef = $('#bmHedef').value, bildir = $('#bmBildir').checked; if (!metin) return bilgi('Mesaj yazın.');\n      if (bildir && !(await bOnay(b, hedef))) return;\n      if (await bIslem('mesaj', { birim: b.id, hedef, metin, bildir })) delete bTaslak['yeni:' + b.id];\n    }\n    if (d.bact === 'yanit') {\n      const metin = ($('#by-' + d.id).value || '').trim(); if (!metin) return bilgi('Yanıt yazın.');\n      const kime = $('#bk-' + d.id) ? $('#bk-' + d.id).value : '', bildir = !!($('#bb-' + d.id) && $('#bb-' + d.id).checked);\n      if (b.yonetici && bildir && !(await bOnay(b, kime ? 'hoca:' + kime : (b.mesajlar.find(m => m.id === d.id) || {}).hedefKod || 'birim'))) return;\n      if (await bIslem('yanit', { birim: b.id, ust: d.id, metin, kime, bildir })) delete bTaslak['y:' + d.id];\n    }\n    if (d.bact === 'uyeEkle') { const r = await run('apiYonetimIslem', ot, 'birimUyeEkle', {}); bMsg = r.mesaj || ''; await birimYukle(); }\n  } catch (err) { hataGoster(err); }\n  finally { el.disabled = false; }\n});\n</script>\n", "SinavUI": "<script>\n/* SinavUI.html – Yönetim › \"Yeni sınav\" ve \"Derslikler\" sekmeleri (12 tablosu Q–R; 18.11.2026).\n   Yonetim.html'in global `ot`, `render()` ve `tab` değişkenlerini kullanır. Ayarlar tarayıcıda taslak olarak tutulur; \"Kaydet\" ile sunucuya gider. */\nlet SG = null, SD = null, SX = null, sAd = '', sDegisti = false, sOner = new Set(), sMsg = '', sHata = '', sOnizle = null, sAra = '', DH = null, dhDegisti = false, sYuk = false;\nconst sE = esc, sDet = {};\nconst det = (k, vars) => `data-sdet=\"${k}\" ${(k in sDet ? sDet[k] : vars) ? 'open' : ''}`;\ndocument.addEventListener('toggle', e => { const k = e.target.dataset && e.target.dataset.sdet; if (k) sDet[k] = e.target.open; }, true);\nasync function sinavYukle() {\n  sYuk = true;\n  try { const r = await run('apiSinav', ot); if (r.err) { sHata = r.err === 'OTURUM' ? 'Oturum sona erdi; yeniden giriş yapın.' : r.err; SG = null; } else { SG = r; sHata = ''; if (!dhDegisti) DH = JSON.parse(JSON.stringify(r.havuz)); } }\n  catch (e) { sHata = (e && e.message) || String(e); }\n  sYuk = false; render();\n}\nfunction sAcik(s) { SD = s; SX = JSON.parse(JSON.stringify(s.cfg)); sAd = s.ad; sDegisti = false; sOner = new Set(); }\nasync function sIslem(islem, a) {\n  if (SD && ['kaydet', 'liste', 'hazir'].includes(islem) && a.rev == null) a.rev = SD.rev;\n  const r = await run('apiSinavIslem', ot, islem, a);\n  if (r.err) { sHata = r.err === 'OTURUM' ? 'Oturum sona erdi; yeniden giriş yapın.' : r.err; render(); return null; }\n  if (r.hata) { bilgi(r.hata); return null; }\n  if (r.turler) { SG = r; if (!dhDegisti) DH = JSON.parse(JSON.stringify(r.havuz)); }\n  if (r.sinav) sAcik(r.sinav);\n  sMsg = r.mesaj || ''; render(); return r;\n}\n/* ---------- yollar ---------- */\nfunction sGet(p) { return p.split('.').reduce((o, k) => o == null ? o : o[k], SX); }\nfunction sSet(p, v) { const k = p.split('.'), son = k.pop(); const o = k.reduce((o, x) => o[x] = o[x] == null ? (/^\\d+$/.test(x) ? [] : {}) : o[x], SX); o[son] = v; sDegisti = true; }\nconst BOL_AD = { cs: 'Çoktan seçmeli test', yazma: 'Yazma', konusma: 'Konuşma', grading: 'Writing grading' };\nconst KUL3 = { 1: '1 · Portal, canlı', 2: '2 · Kâğıt, planlı', 3: '3 · Kâğıt, canlı' };\nconst trT = t => /^\\d{4}-\\d{2}-\\d{2}$/.test(t || '') ? t.slice(8, 10) + '.' + t.slice(5, 7) + '.' + t.slice(0, 4) : '';\nconst DUR = { taslak: ['p-warn', 'Taslak'], hazir: ['p-acc', 'Hazır – Claude\\'a gönderildi'], kuruldu: ['p-ok', 'Kuruldu'] };\nconst inp = (p, tip, ek) => `<input type=\"${tip || 'text'}\" data-sx=\"${p}\" value=\"${sE(sGet(p) == null ? '' : sGet(p))}\" ${ek || ''}>`;\nconst ck = (p, etiket) => `<label class=\"ck small\"><input type=\"checkbox\" data-sxb=\"${p}\" ${sGet(p) ? 'checked' : ''}> ${etiket}</label>`;\nconst sel = (p, ops, ek) => `<select data-sx=\"${p}\" ${ek || ''} style=\"width:auto\">${ops.map(([v, t]) => `<option value=\"${sE(v)}\" ${String(sGet(p)) === String(v) ? 'selected' : ''}>${sE(t)}</option>`).join('')}</select>`;\nfunction dOps(secili, bos) {\n  const L = (DH || SG.havuz).filter(d => d.durum === 'aktif' || d.ad === secili);\n  return `<option value=\"\">${bos || '—'}</option>` + L.map(d => `<option value=\"${sE(d.ad)}\" ${d.ad === secili ? 'selected' : ''}>${sE(d.ad)}${d.skap || d.kap ? ' (' + (d.skap || d.kap) + ')' : ''}${d.durum !== 'aktif' ? ' – pasif' : ''}</option>`).join('');\n}\n/* ---------- sınav listesi ---------- */\nfunction vSinavListe() {\n  const L = SG.sinavlar;\n  return `<div class=\"panel stack\"><h3 style=\"margin:0\">Sınavlar</h3>\n    ${L.length ? `<div class=\"scroll\"><table><thead><tr><th>Sınav</th><th>Tür</th><th>İlk bölüm</th><th>Kalan</th><th>Durum</th><th>Son değişiklik</th><th></th></tr></thead><tbody>${L.map(s => `<tr class=\"${SD && SD.id === s.id ? 'sec' : ''}\"><td><b>${sE(s.ad)}</b></td><td>${sE(s.tur)}</td><td>${sE(s.ilk || '—')}</td>\n      <td>${s.kalan == null ? '—' : s.kalan >= 0 ? s.kalan + ' gün' : 'geçti'}</td><td><span class=\"pill ${(DUR[s.durum] || ['p-mut'])[0]}\">${sE((DUR[s.durum] || ['', s.durum])[1])}</span></td><td class=\"small\">${sE(s.guncelleme || '')} · ${sE(s.guncelleyen || '')}</td>\n      <td><button class=\"btn sm\" data-sact=\"ac\" data-id=\"${sE(s.id)}\">Aç</button></td></tr>`).join('')}</tbody></table></div>` : '<p class=\"small muted\">Henüz sınav oluşturulmadı.</p>'}\n    <div class=\"row\" style=\"gap:8px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">Yeni sınav türü<select id=\"sYeniTur\" style=\"width:auto\"><option value=\"\">Seçin…</option>${SG.turler.map(t => `<option value=\"${t.id}\">${sE(t.ad)}</option>`).join('')}</select></label>\n      <label class=\"f\" style=\"flex:1 1 260px\">Sınav adı (boş bırakılırsa dönem + tür)<input id=\"sYeniAd\" placeholder=\"ör. 2026-27 Güz Erasmus Sınavı\"></label><button class=\"btn\" data-sact=\"yeni\">Oluştur</button></div></div>`;\n}\n/* ---------- bölümler ---------- */\nfunction vBolumler() {\n  const h = SD.hazirlik, lvKutu = (p, L) => SG.duzeyler.filter(l => !h || SX.duzeyler.includes(l)).map(l => `<label class=\"ck small\"><input type=\"checkbox\" data-sxlv=\"${p}\" data-v=\"${l}\" ${L.includes(l) ? 'checked' : ''}> ${l}</label>`).join(' ');\n  const blok = b => { const B = SX.bolum[b];\n    return `<div class=\"panel stack\" style=\"gap:6px\"><div class=\"row\" style=\"justify-content:space-between;align-items:center\"><b>${BOL_AD[b]}</b>${ck('bolum.' + b + '.var', 'Bu sınavda var')}</div>\n      ${B.var ? `<div class=\"scroll\"><table class=\"tt\"><thead><tr><th>#</th><th>Tarih</th><th>Başlama</th>${h ? '<th>Düzeyler</th>' : ''}${b === 'konusma' ? '<th>Kullanım şekli</th>' : ''}<th></th></tr></thead><tbody>\n      ${B.oturum.map((o, i) => `<tr><td>${i + 1}</td><td>${inp(`bolum.${b}.oturum.${i}.tarih`, 'date')}</td><td>${inp(`bolum.${b}.oturum.${i}.saat`, 'time', 'style=\"width:110px\"')}</td>\n        ${h ? `<td>${lvKutu(`bolum.${b}.oturum.${i}.lv`, o.lv)}</td>` : ''}${b === 'konusma' ? `<td>${sel(`bolum.${b}.oturum.${i}.kul`, [1, 2, 3].map(k => [k, KUL3[k]]))}</td>` : ''}\n        <td>${B.oturum.length > 1 ? `<button class=\"btn sm ghost\" data-sact=\"otSil\" data-b=\"${b}\" data-i=\"${i}\">Sil</button>` : ''}</td></tr>`).join('')}</tbody></table></div>\n      <div><button class=\"btn sm ghost\" data-sact=\"otEkle\" data-b=\"${b}\">+ ${b === 'konusma' ? 'Gün' : 'Oturum'} ekle</button></div>` : ''}</div>`; };\n  const G = SX.bolum.grading;\n  return `<details class=\"panel\" ${det('bol', true)}><summary><b>1. Sınav bilgileri, bölümler ve tarihler</b></summary><div class=\"stack\" style=\"margin-top:8px\">\n    <div class=\"row\" style=\"gap:10px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\" style=\"flex:1 1 320px\">Sınav adı<input id=\"sAd\" value=\"${sE(sAd)}\"></label>\n      <div class=\"small\"><b>Tür:</b> ${sE(SD.turAd)} · <b>Sorumlu birim:</b> ${sE(SD.birim)} · <b>Dönem:</b> ${sE(SD.donem)}</div></div>\n    ${h ? `<div><b class=\"small\">Sınava giren düzeyler:</b> ${SG.duzeyler.map(l => `<label class=\"ck small\"><input type=\"checkbox\" data-sxlv=\"duzeyler\" data-v=\"${l}\" ${SX.duzeyler.includes(l) ? 'checked' : ''}> ${l}</label>`).join(' ')}</div>` : '<p class=\"small muted\" style=\"margin:0\">Yeterlik Sınav Birimi sınavı: tek düzey; sınıf ve \"kendi hocası\" kuralları yok.</p>'}\n    <div class=\"grid g2\">${['cs', 'yazma', 'konusma'].map(blok).join('')}\n    <div class=\"panel stack\" style=\"gap:6px\"><div class=\"row\" style=\"justify-content:space-between;align-items:center\"><b>Writing grading</b>${ck('bolum.grading.var', 'Bu sınavda var')}</div>\n      ${G.var ? `<div class=\"row\" style=\"gap:8px;flex-wrap:wrap\"><label class=\"f\">First grader son gün${inp('bolum.grading.first', 'date')}</label><label class=\"f\">Second grader son gün${inp('bolum.grading.second', 'date')}</label><label class=\"f\">3./4. grader son gün${inp('bolum.grading.ucuncu', 'date')}</label></div>\n      <p class=\"small muted\" style=\"margin:0\">Saatsiz; teslim tarihleriyle. 3. ve 4. grader kuralı S19'a göre (bir bentte fark ≥ 2).</p>` : ''}</div></div></div></details>`;\n}\nfunction vKurallar() {\n  const h = SD.hazirlik, K = 'konusma.';\n  return `<details class=\"panel\" ${det('kon', false)}><summary><b>2. Konuşma kuralları</b></summary><div class=\"stack\" style=\"margin-top:8px\">\n    ${h ? `<div class=\"row\" style=\"gap:12px;flex-wrap:wrap\"><label class=\"f\">Kendi hocasının jürisi${sel(K + 'kendiHoca', [['asla', 'Asla'], ['bos', 'Yalnız başka boş jüri yoksa'], ['fark', 'Fark etmez']])}</label>\n      <label class=\"f\">Eş seçimi${sel(K + 'es', [['ayni', 'Aynı sınıf öncelikli'], ['fark', 'Fark etmez'], ['farkli', 'Farklı sınıf öncelikli']])}</label></div>` : '<p class=\"small muted\" style=\"margin:0\">Hoca ve sınıf kuralları bu sınavda uygulanmaz; aday o oturumdaki başka bir adayla eşleşir.</p>'}\n    <div class=\"row\" style=\"gap:12px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">Yedek slotta jüri: son oturumdaki her … öğrenciye 1${inp(K + 'yedekOran', 'number', 'min=\"5\" max=\"60\" style=\"width:80px\"')}</label>${ck(K + 'erken', 'Erken girmeye gönüllü öğrenci düğmesi')}${ck(K + 'anket', 'Anket açık')}</div>\n    <p class=\"small muted\" style=\"margin:0\">Sabit kurallar (S11, S18): 5–15 dk geç kalan boş jüri bekler; 15 dk'dan fazla geç kalan alınmaz; son çağrı 15:45; son oturuma geç kalan 16:00 yedek slotta girer.</p></div></details>\n  <details class=\"panel\" ${det('yaz', false)}><summary><b>3. Yazma, çoktan seçmeli test ve grading kuralları</b></summary><div class=\"stack\" style=\"margin-top:8px\">\n    <div class=\"row\" style=\"gap:12px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">Dinleme başlangıcı (sınav başından … dk sonra)${inp('yazma.dinlemeDk', 'number', 'min=\"0\" max=\"60\" style=\"width:80px\"')}</label>\n      ${ck('yazma.gozetmenFirst', 'Gözetmen = first grader')}${h ? ck('yazma.secondSali', 'Second grader = sınıfın Salı öğleden sonra hocası') : ''}${ck('yazma.capraz', 'Çapraz eşleşme (iki grader aynı çiftte iki kez buluşmaz)')}</div>\n    <p class=\"small muted\" style=\"margin:0\">Bentler 1–5 (Content, Organization, Grammar, Lexical). Bir bentte fark ≥ 2 → yalnız o bent 3. grader'a; özel durum uyuşmazlığında uyarılı 3. grader, gerekirse 4. grader. Kâğıtlar taranır; grader yalnız rastgele kâğıt numarasını görür.</p></div></details>`;\n}\nfunction vGorev() {\n  const G = 'gorev.', T = SX.gorev.tercih || {}, muaf = new Set(SD.muaf || []), q = sAra.trim().toLocaleLowerCase('tr');\n  const L = SG.hocalar.filter(x => !q || x.ad.toLocaleLowerCase('tr').includes(q) || (T[x.id] && T[x.id].t !== 'normal'));\n  const n = Object.keys(T).filter(k => T[k] && T[k].t && T[k].t !== 'normal').length;\n  return `<details class=\"panel\" ${det('gor', false)}><summary><b>4. Görev kuralları ve hoca tercihleri</b> <span class=\"small muted\">(${n} hoca için tercih girildi)</span></summary><div class=\"stack\" style=\"margin-top:8px\">\n    <div class=\"row\" style=\"gap:12px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">Günlük görev sınırı${inp(G + 'gunluk', 'number', 'min=\"1\" max=\"6\" style=\"width:70px\"')}</label>\n      <label class=\"f\">Yedek oranı (%)${inp(G + 'yedekYuzde', 'number', 'min=\"0\" max=\"30\" style=\"width:70px\"')}</label><label class=\"f\">En az yedek${inp(G + 'yedekMin', 'number', 'min=\"0\" max=\"30\" style=\"width:70px\"')}</label>${SD.hazirlik ? ck(G + 'juriAyniDuzey', 'Jüride aynı düzeyin hocaları') : ''}</div>\n    <p class=\"small muted\" style=\"margin:0\">${sE(SD.birim)} üyeleri bu sınavda görev almaz (kendiliğinden). Görev dağılımını Claude yapar.</p>\n    <input id=\"sAra\" placeholder=\"Hoca ara…\" value=\"${sE(sAra)}\" style=\"max-width:260px\">\n    <div class=\"scroll\" style=\"max-height:420px\"><table><thead><tr><th>Hoca</th><th>Tercih</th><th>Not (ör. hangi görev / hangi gün)</th></tr></thead><tbody>\n    ${L.map(x => { const t = (T[x.id] || {}).t || 'normal';\n      return `<tr><td>${sE(x.ad)}${muaf.has(x.e) ? ' <span class=\"pill p-mut\">birim üyesi – görev yok</span>' : ''}</td><td><select data-sxt=\"${x.id}\" style=\"width:auto\">${Object.entries(SG.tercihAd).map(([k, v]) => `<option value=\"${k}\" ${k === t ? 'selected' : ''}>${sE(v)}</option>`).join('')}</select></td>\n        <td>${t === 'normal' ? '' : `<input data-sxtn=\"${x.id}\" value=\"${sE((T[x.id] || {}).not || '')}\" maxlength=\"120\" style=\"width:100%\">`}</td></tr>`; }).join('')}</tbody></table></div></div></details>`;\n}\n/* ---------- öğrenci / aday listesi ---------- */\nconst SUT = { no: /^(öğrenci\\s*no|ogrenci\\s*no|öğrenci\\s*numarası|numara|no|student\\s*(no|id|number))$/i, ad: /^(ad\\s*soyad|adı\\s*soyadı|ad-soyad|adsoyad|ad\\s*ve\\s*soyad|name|full\\s*name)$/i,\n  adi: /^(ad|adı|isim)$/i, soyadi: /^(soyad|soyadı)$/i, cls: /^(sınıf|sinif|şube|sube|grup|class)$/i, lv: /^(düzey|duzey|kur|seviye|level)$/i };\nfunction listeOku(rows) {\n  let bi = -1, kol = {};\n  for (let i = 0; i < Math.min(rows.length, 15) && bi < 0; i++) { const r = rows[i].map(x => String(x == null ? '' : x).trim()); const k = {};\n    r.forEach((h, j) => { for (const [ad, re] of Object.entries(SUT)) if (k[ad] == null && re.test(h)) k[ad] = j; });\n    if (k.no != null && (k.ad != null || k.adi != null)) { bi = i; kol = k; } }\n  if (bi < 0) return { hata: 'Başlık satırı bulunamadı. Sütunlardan biri \"Öğrenci No\", biri \"Ad Soyad\" (ya da \"Ad\" + \"Soyad\") olmalı.' };\n  const L = rows.slice(bi + 1).map(r => ({ no: String(r[kol.no] == null ? '' : r[kol.no]).trim(), ad: kol.ad != null ? String(r[kol.ad] || '') : (String(r[kol.adi] || '') + ' ' + String(kol.soyadi != null ? r[kol.soyadi] || '' : '')).trim(),\n    cls: kol.cls != null ? String(r[kol.cls] || '') : '', lv: kol.lv != null ? String(r[kol.lv] || '') : '' })).filter(x => x.no || x.ad);\n  return { L, kol: Object.keys(kol).join(', ') };\n}\nfunction vListe() {\n  const h = SD.hazirlik, F = SD.fark;\n  const lv = Object.entries(SD.lvSay || {}).map(([k, v]) => h ? `${k}: ${v}` : `${v} aday`).join(' · ');\n  const tb = (b, L, c) => L.length ? `<details><summary class=\"small\"><b>${b} (${L.length})</b></summary><div class=\"scroll\" style=\"max-height:240px\"><table class=\"ozet\"><thead><tr>${c.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${L.map(r => `<tr>${r.map(x => `<td>${sE(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : `<div class=\"small muted\">${b}: yok</div>`;\n  return `<details class=\"panel\" ${det('lst', !SD.adaySay)}><summary><b>5. ${h ? 'Öğrenci listesi (AnaSİS)' : 'Aday listesi'}</b> <span class=\"small muted\">${SD.adaySay ? '(' + lv + ')' : '(yüklenmedi)'}</span></summary><div class=\"stack\" style=\"margin-top:8px\">\n    <p class=\"small muted\" style=\"margin:0\">${h ? 'AnaSİS\\'ten alınan Excel: Öğrenci No, Ad Soyad, Sınıf (Düzey yoksa sınıftan çıkarılır). Yeni liste öncekinin yerine geçer; önceki listeyle karşılaştırılır.' : 'Birimin ya da Erasmus ofisinin gönderdiği Excel: Öğrenci No ve Ad Soyad. Sınıf ve düzey yok.'}</p>\n    <div class=\"row\" style=\"gap:8px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">Excel ya da CSV<input type=\"file\" id=\"sListe\" accept=\".xlsx,.xls,.csv\"></label></div>\n    ${sOnizle ? (sOnizle.hata ? `<div class=\"note n-bad\">${sE(sOnizle.hata)}</div>` : `<div class=\"note n-hl\">${sE(sOnizle.dosya)}: <b>${sOnizle.L.length}</b> satır okundu (sütunlar: ${sE(sOnizle.kol)}). İlk satırlar: ${sOnizle.L.slice(0, 3).map(x => sE(x.no + ' ' + x.ad + (x.cls ? ' ' + x.cls : ''))).join(' · ')}\n      <div style=\"margin-top:6px\"><button class=\"btn sm\" data-sact=\"listeKaydet\">Listeyi kaydet</button> <button class=\"btn sm ghost\" data-sact=\"listeVazgec\">Vazgeç</button></div></div>`) : ''}\n    ${(SD.listeHata || []).length ? `<div class=\"note n-bad small\">${SD.listeHata.map(sE).join('<br>')}</div>` : ''}\n    ${F ? `<div class=\"panel stack\" style=\"gap:4px\"><b class=\"small\">Önceki listeyle karşılaştırma – ${sE(F.kaynak)} (${F.onceki} kişi)</b>${tb('Yeni gelen', F.yeni, ['No', 'Ad Soyad', 'Sınıf'])}${tb('Listede olmayan (ayrılan)', F.ayrilan, ['No', 'Ad Soyad', 'Sınıf'])}${h ? tb('Sınıf değiştiren', F.sinif, ['No', 'Ad Soyad', 'Eski sınıf', 'Yeni sınıf']) : ''}</div>` : ''}</div></details>`;\n}\n/* ---------- derslikler ---------- */\nfunction vSinavDerslik() {\n  const h = SD.hazirlik, D = SX.derslik, oner = k => sOner.has(k) ? 'style=\"background:#fff3b0\"' : '';\n  const yz = b => { const B = SX.bolum[b]; if (!B.var) return '';\n    return B.oturum.map((o, i) => { const e = (D[b][i] = D[b][i] || { atama: {}, secili: [] }), bas = `${BOL_AD[b]}${B.oturum.length > 1 ? ' ' + (i + 1) + '. oturum' : ''} · ${trT(o.tarih) || 'tarih yok'} ${sE(o.saat || '')}`;\n      if (h) { const G = ((SD.gruplar || {})[b] || [])[i] || [];\n        return `<div class=\"panel stack\" style=\"gap:4px\"><b class=\"small\">${bas}</b>${G.length ? `<div class=\"scroll\"><table class=\"tt\"><thead><tr><th>Grup (sınıf)</th><th>Öğrenci</th><th>Derslik</th></tr></thead><tbody>${G.map(g => `<tr><td>${sE(g.g)}</td><td>${g.n}</td>\n          <td><select data-sxd=\"${b}.${i}.${sE(g.g)}\" ${oner(b + ':' + i + ':' + g.g)} style=\"width:auto\">${dOps(e.atama[g.g])}</select></td></tr>`).join('')}</tbody></table></div>` : '<p class=\"small muted\" style=\"margin:0\">Grup yok (liste yüklenmedi ya da oturumda düzey seçilmedi). Kaydettikten sonra gruplar görünür.</p>'}</div>`; }\n      const dg = ((SD.dagilim || {})[b] || [])[i];\n      return `<div class=\"panel stack\" style=\"gap:4px\" ${oner(b + ':' + i)}><b class=\"small\">${bas}</b><div class=\"row\" style=\"gap:6px;flex-wrap:wrap\">${(DH || SG.havuz).filter(d => d.durum === 'aktif').map(d => `<label class=\"ck small\" style=\"border:1px solid var(--line);border-radius:8px;padding:4px 8px\"><input type=\"checkbox\" data-sxsec=\"${b}.${i}\" data-v=\"${sE(d.ad)}\" ${e.secili.includes(d.ad) ? 'checked' : ''}> ${sE(d.ad)} <span class=\"muted\">${d.skap || d.kap || '?'}</span></label>`).join('')}</div>\n        ${dg && dg.dagilim.length ? `<table class=\"tt\"><thead><tr><th>Derslik</th><th>Kapasite</th><th>Aday</th><th>İlk – son (${D.sira === 'alfabe' ? 'ad' : 'no'})</th></tr></thead><tbody>${dg.dagilim.map(x => `<tr><td>${sE(x.derslik)}</td><td>${x.kap || '?'}</td><td>${x.n}</td><td class=\"small\">${sE(x.ilk)} – ${sE(x.son)}</td></tr>`).join('')}</tbody></table>${dg.kalan ? `<div class=\"note n-bad small\">${dg.kalan} aday yerleşmedi.</div>` : ''}` : ''}</div>`; }).join(''); };\n  const kon = () => { const B = SX.bolum.konusma; if (!B.var) return '';\n    return B.oturum.map((o, i) => (h ? o.lv : ['Tek']).map(lv => { let K = D.konusma.find(x => x.oi === i && x.lv === lv); const j = K ? D.konusma.indexOf(K) : -1;\n      const bas = `Konuşma · ${trT(o.tarih) || 'tarih yok'}${h ? ' · ' + lv + ' düzeyi' : ''}`;\n      if (!K) return `<div class=\"panel row\" style=\"gap:8px;align-items:center\"><b class=\"small\">${bas}</b><button class=\"btn sm ghost\" data-sact=\"konEkle\" data-oi=\"${i}\" data-lv=\"${lv}\">Jürileri gir</button></div>`;\n      const n = Number(K.juri) || 0;\n      return `<div class=\"panel stack\" style=\"gap:6px\"><b class=\"small\">${bas}</b><div class=\"row\" style=\"gap:10px;flex-wrap:wrap;align-items:flex-end\">\n        <label class=\"f\">Jüri sayısı<input type=\"number\" min=\"0\" max=\"40\" data-sxj=\"${j}\" value=\"${n}\" style=\"width:70px\"></label>\n        <label class=\"f\">Bekleme alanı${inp(`derslik.konusma.${j}.bekleme`)}</label><label class=\"f\">Kayıt masası${inp(`derslik.konusma.${j}.kayit`)}</label><label class=\"f\">TV yeri${inp(`derslik.konusma.${j}.tv`)}</label></div>\n        ${n ? `<div class=\"row\" style=\"gap:6px;flex-wrap:wrap\">${Array.from({ length: n }, (x, k) => `<label class=\"small\">Jüri ${k + 1} <select data-sx=\"derslik.konusma.${j}.derslikler.${k}\" ${oner('k:' + i + ':' + lv + ':' + k)} style=\"width:auto\">${dOps(K.derslikler[k])}</select></label>`).join('')}</div>` : ''}</div>`; }).join('')).join(''); };\n  return `<details class=\"panel\" ${det('drs', true)}><summary><b>6. Derslikler</b></summary><div class=\"stack\" style=\"margin-top:8px\">\n    <p class=\"small muted\" style=\"margin:0\">${h ? 'Her yazma/ÇS oturumunda sınıf → derslik. ' : 'Yazma/ÇS için kullanılacak derslikleri seçin; adaylar sınav kapasitesine göre bölünür. '}Konuşmada gün ve düzey başına jüri sayısı ve jüri dersliği. Derslik havuzu \"Derslikler\" sekmesinde. Boş bıraktıklarınızı \"Boşları öner\" doldurur (sarı); kontrol edip kaydedin.</p>\n    ${h ? '' : `<label class=\"f\" style=\"max-width:300px\">Adayların dersliklere sırası${sel('derslik.sira', [['no', 'Öğrenci numarasına göre'], ['alfabe', 'Ada göre (alfabe)']])}</label>`}\n    ${yz('cs')}${yz('yazma')}${kon()}<div><button class=\"btn sm\" data-sact=\"oner\">Boşları öner</button></div></div></details>`;\n}\nfunction vSinavDetay() {\n  const K = SD.kontrol, kil = SD.durum === 'hazir' || SD.durum === 'kuruldu';\n  const adim = `<div class=\"row\" style=\"gap:6px;flex-wrap:wrap\">${SD.adimlar.map(([ad, tamam, sonra]) => `<span class=\"pill ${tamam ? 'p-ok' : sonra ? 'p-mut' : 'p-warn'}\">${tamam ? '✓' : sonra ? '·' : '!'} ${sE(ad)}</span>`).join('')}</div>`;\n  const kont = `${K.hata.length ? `<div class=\"note n-bad small\"><b>Giderilmesi gereken (${K.hata.length}):</b><br>${K.hata.map(sE).join('<br>')}</div>` : '<div class=\"note n-ok small\">Eksik yok.</div>'}${K.uyari.length ? `<div class=\"note n-hl small\"><b>Uyarılar (${K.uyari.length}):</b><br>${K.uyari.map(sE).join('<br>')}</div>` : ''}`;\n  const alt = kil ? `<div class=\"note n-hl\">Bu sınav ${sE(SD.hazirT || '')} tarihinde ${sE(SD.hazirKim || '')} tarafından \"hazır\" olarak Claude'a gönderildi; ayarlar kilitli.</div>\n      <div class=\"row\" style=\"gap:8px\">${SD.durum === 'hazir' ? '<button class=\"btn ghost\" data-sact=\"geriAc\">Düzenlemeye geri aç</button>' : ''}</div>`\n    : `<div class=\"row\" style=\"gap:8px;flex-wrap:wrap;position:sticky;bottom:0;background:var(--bg,#fff);padding:8px 0;border-top:1px solid var(--line)\"><button class=\"btn\" data-sact=\"kaydet\">Kaydet</button>\n      <button class=\"btn ${K.hata.length ? 'ghost' : ''}\" data-sact=\"hazir\">Sınav hazır, Claude'a gönder</button>${sDegisti ? '<span class=\"pill p-warn\" style=\"align-self:center\">Kaydedilmemiş değişiklik var</span>' : ''}\n      <span style=\"flex:1\"></span><button class=\"btn sm ghost bad\" data-sact=\"iptal\">Listeden kaldır</button></div>`;\n  return `<div class=\"stack\"><div class=\"row\" style=\"justify-content:space-between;align-items:baseline;flex-wrap:wrap\"><h2 style=\"margin:0\">${sE(SD.ad)} <span class=\"pill ${(DUR[SD.durum] || ['p-mut'])[0]}\">${sE((DUR[SD.durum] || ['', SD.durum])[1])}</span></h2>\n      <span class=\"small muted\">${SD.kalan != null ? (SD.kalan >= 0 ? 'İlk bölüme ' + SD.kalan + ' gün (' + sE(SD.ilk) + ')' : 'İlk bölüm geçti') : 'Tarih girilmedi'} · son değişiklik ${sE(SD.guncelleme || '')} ${sE(SD.guncelleyen || '')}</span></div>\n    <div class=\"panel stack\" style=\"gap:6px\"><b class=\"small\">Sınav kontrol listesi</b>${adim}${kont}</div>\n    <fieldset ${kil ? 'disabled' : ''} style=\"border:0;padding:0;margin:0\" class=\"stack\">${vBolumler()}${vKurallar()}${vGorev()}${vListe()}${vSinavDerslik()}</fieldset>${alt}${vDok()}${vEposta()}\n    <details class=\"panel\" ${det('gec', false)}><summary><b>Geçmiş</b></summary><ul class=\"small\">${SD.gecmis.map(g => `<li>${sE(g[0])} · ${sE(g[1])} – ${sE(g[2])}</li>`).join('')}</ul></details></div>`;\n}\nfunction vSinav() {\n  if (sHata) return `<div class=\"note n-bad\">${sE(sHata)}</div>`;\n  if (!SG) return '<div class=\"panel muted\">Yükleniyor…</div>';\n  return `<div class=\"stack\">${sMsg ? `<div class=\"note n-ok\" style=\"white-space:pre-wrap\">${sE(sMsg)}</div>` : ''}${vSinavListe()}${SD ? vSinavDetay() : '<p class=\"small muted\">Bir sınavı açın ya da yeni sınav oluşturun. Ayarlar tamamlanınca \"Sınav hazır, Claude\\'a gönder\" deyin; görev dağılımı, kurulum ve dosyaları Claude hazırlar ve onayınıza sunar.</p>'}</div>`;\n}\n/* ---------- Derslikler sekmesi (havuz) ---------- */\nfunction vDerslik() {\n  if (sHata) return `<div class=\"note n-bad\">${sE(sHata)}</div>`;\n  if (!SG || !DH) return '<div class=\"panel muted\">Yükleniyor…</div>';\n  const f = (i, k, tip, w) => `<input ${tip ? 'type=\"' + tip + '\"' : ''} data-dh=\"${i}.${k}\" value=\"${sE(DH[i][k] == null || (tip === 'number' && !DH[i][k]) ? '' : DH[i][k])}\" style=\"width:${w || 90}px\">`;\n  return `<div class=\"stack\">${sMsg ? `<div class=\"note n-ok\">${sE(sMsg)}</div>` : ''}<div class=\"panel stack\"><h3 style=\"margin:0\">Derslik havuzu <span class=\"small muted\">(${DH.filter(d => d.durum === 'aktif').length} aktif)</span></h3>\n    <p class=\"small muted\" style=\"margin:0\">Bütün sınavlarda bu listeden seçilir. Normal kapasite: ders düzeni; sınav kapasitesi: sınav düzeni (boşsa normal kapasite kullanılır). \"Ders yapan sınıf\": hazırlık sınavlarında öneri için (her sınıf kendi dersliğinde). Pasif derslik önerilmez; kayıt silinmez.</p>\n    <div class=\"row\" style=\"gap:8px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">İçe aktar (00-Derslik Listeleri.xlsx: Derslik, Sınıf, Öğrenci sayısı)<input type=\"file\" id=\"dhDosya\" accept=\".xlsx,.xls,.csv\"></label><button class=\"btn sm ghost\" data-sact=\"dhIce\">İçe aktar</button></div>\n    <div class=\"scroll\"><table><thead><tr><th>Derslik</th><th>Bina</th><th>Kat</th><th>Normal kap.</th><th>Sınav kap.</th><th>Ders yapan sınıf</th><th>Not</th><th>Durum</th></tr></thead><tbody>\n    ${DH.map((d, i) => `<tr class=\"${d.durum === 'aktif' ? '' : 'muted'}\"><td>${f(i, 'ad', '', 80)}</td><td>${f(i, 'bina', '', 110)}</td><td>${f(i, 'kat', '', 60)}</td><td>${f(i, 'kap', 'number', 70)}</td><td>${f(i, 'skap', 'number', 70)}</td><td>${f(i, 'sinif', '', 120)}</td><td>${f(i, 'not', '', 160)}</td>\n      <td><select data-dh=\"${i}.durum\" style=\"width:auto\"><option value=\"aktif\" ${d.durum === 'aktif' ? 'selected' : ''}>aktif</option><option value=\"pasif\" ${d.durum !== 'aktif' ? 'selected' : ''}>pasif</option></select></td></tr>`).join('')}</tbody></table></div>\n    <div class=\"row\" style=\"gap:8px\"><button class=\"btn sm ghost\" data-sact=\"dhEkle\">+ Derslik ekle</button><button class=\"btn\" data-sact=\"dhKaydet\">Kaydet</button>${dhDegisti ? '<span class=\"pill p-warn\" style=\"align-self:center\">Kaydedilmemiş değişiklik var</span>' : ''}</div></div></div>`;\n}\n/* ---------- 7. Sınav dokümanları (19.11.2026) ---------- */\nlet dSec = new Set(), dVars = { bolum: 'genel', lv: 'Ortak', kime: ['yonetim'] }, dYukleniyor = '';\nfunction dIndir(r) { const bin = atob(r.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);\n  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: r.tur || 'application/octet-stream' })); a.download = r.ad; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }\nasync function dIslem(islem, a) {\n  const r = await run('apiSinavIslem', ot, islem, Object.assign({ id: SD.id }, a));\n  if (r.err) { sHata = r.err === 'OTURUM' ? 'Oturum sona erdi; yeniden giriş yapın.' : r.err; render(); return null; }\n  if (r.hata) { bilgi(r.hata); return null; }\n  if (r.dok) { SD.dok = r.dok; const ids = new Set(r.dok.guncel.map(x => x.id)); dSec = new Set([...dSec].filter(x => ids.has(x))); }\n  if (r.dok && SD.adimlar) SD.adimlar.forEach(x => { if (/dokümanları/.test(x[0])) x[1] = r.dok.guncel.length > 0; if (/Birime açıldı/.test(x[0])) x[1] = r.dok.guncel.some(y => y.birimde); });\n  if (r.mesaj != null && !r.b64) sMsg = r.mesaj; return r;\n}\nfunction vDok() {\n  const D = SD.dok || { guncel: [], eski: [] }, h = SD.hazirlik, BL = Object.fromEntries((D.bolumler || []).map(x => [x[0], x[1]])), KM = D.kime || [];\n  const lvOps = (v, ek) => `<select ${ek} style=\"width:auto\">${['Ortak'].concat(SG.duzeyler).map(l => `<option ${l === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;\n  const bolOps = (v, ek) => `<select ${ek} style=\"width:auto\">${(D.bolumler || []).map(([k, t]) => `<option value=\"${k}\" ${k === v ? 'selected' : ''}>${sE(t)}</option>`).join('')}</select>`;\n  const birim = x => x.gizli ? '<span class=\"pill p-mut\">kör grading – yalnız yönetim</span>' : x.birimde ? (x.birimSurum === x.surum ? `<span class=\"pill p-ok\">açık (v${x.birimSurum})</span>` : `<span class=\"pill p-warn\">birimde eski sürüm (v${x.birimSurum})</span>`) : '—';\n  const satir = x => `<tr><td><input type=\"checkbox\" data-dsec=\"${sE(x.id)}\" ${dSec.has(x.id) ? 'checked' : ''}></td>\n    <td><b>${sE(x.ad)}</b> <span class=\"small muted\">v${x.surum} · ${sE(x.kb)} KB</span>${x.not ? `<br><span class=\"small muted\">${sE(x.not)}</span>` : ''}</td>\n    <td>${bolOps(x.bolum, `data-dset=\"${sE(x.id)}\" data-k=\"bolum\"`)}</td>${h ? `<td>${lvOps(x.lv, `data-dset=\"${sE(x.id)}\" data-k=\"lv\"`)}</td>` : ''}\n    <td class=\"small\">${KM.map(([k, t]) => `<label class=\"ck\"><input type=\"checkbox\" data-dkime=\"${sE(x.id)}\" data-v=\"${k}\" ${x.kime.includes(k) ? 'checked' : ''} ${x.gizli && k !== 'yonetim' ? 'disabled' : ''}> ${sE(t)}</label>`).join('<br>')}</td>\n    <td><label class=\"ck small\"><input type=\"checkbox\" data-dgizli=\"${sE(x.id)}\" ${x.gizli ? 'checked' : ''}> gizli</label></td><td>${birim(x)}</td>\n    <td class=\"small\">${sE(x.yukleyen || '')}<br>${sE(x.tarih || '')}</td>\n    <td class=\"small\"><button class=\"btn sm ghost\" data-sact=\"dIndir\" data-did=\"${sE(x.id)}\">İndir</button>${x.birimde ? `<button class=\"btn sm ghost\" data-sact=\"dBirimdenKaldir\" data-did=\"${sE(x.id)}\">Birimden kaldır</button>` : ''}<button class=\"btn sm ghost bad\" data-sact=\"dKaldir\" data-did=\"${sE(x.id)}\">Kaldır</button></td></tr>`;\n  return `<details class=\"panel\" ${det('dok', true)}><summary><b>7. Sınav dokümanları</b> <span class=\"small muted\">(${D.guncel.length} dosya${D.guncel.filter(x => x.birimde).length ? ' · ' + D.guncel.filter(x => x.birimde).length + ' birimde' : ''})</span></summary><div class=\"stack\" style=\"margin-top:8px\">\n    <p class=\"small muted\" style=\"margin:0\">Claude'un ürettiği dosyalar burada tek yerde durur. Aynı adla yeniden yüklenen dosya yeni sürüm olur, öncekisi eski sürümlere geçer. \"Birime aç\" seçilen dosyaları ${sE(D.birimAd || 'sınav biriminin')} \"Birim çalışmaları\" ekranına etiketli olarak koyar. <b>Gizli</b> işaretli dosyalar (eşleşme, grader, gözetmen, görev bilgisi) kör grading için yalnız yönetimde kalır ve birime açılamaz. Bu bölüm e-posta göndermez.</p>\n    <div class=\"row\" style=\"gap:8px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">Dosyalar (birden çok seçilebilir)<input type=\"file\" id=\"dDosya\" multiple></label>\n      <label class=\"f\">Bölüm${bolOps(dVars.bolum, 'id=\"dVarBol\"')}</label>${h ? `<label class=\"f\">Düzey${lvOps(dVars.lv, 'id=\"dVarLv\"')}</label>` : ''}\n      <div class=\"small\">Kime: ${KM.map(([k, t]) => `<label class=\"ck\"><input type=\"checkbox\" data-dvkime=\"${k}\" ${dVars.kime.includes(k) ? 'checked' : ''}> ${sE(t)}</label>`).join(' ')}</div>\n      <button class=\"btn sm\" data-sact=\"dYukle\">Yükle</button>${dYukleniyor ? `<span class=\"pill p-warn\">${sE(dYukleniyor)}</span>` : ''}</div>\n    <p class=\"small muted\" style=\"margin:0\">Adında \"eşleşme, grader, grading, partner, gözetmen, görev\" geçen dosyalar kendiliğinden gizli işaretlenir; gerekirse tablodan değiştirin.</p>\n    ${D.guncel.length ? `<div class=\"scroll\"><table><thead><tr><th></th><th>Dosya</th><th>Bölüm</th>${h ? '<th>Düzey</th>' : ''}<th>Kime</th><th>Kör grading</th><th>Birim</th><th>Yükleyen</th><th></th></tr></thead><tbody>${D.guncel.map(satir).join('')}</tbody></table></div>\n    <div class=\"row\" style=\"gap:8px;flex-wrap:wrap\"><button class=\"btn sm\" data-sact=\"dBirimeAc\" ${dSec.size ? '' : 'disabled'}>Seçilenleri birime aç (${dSec.size})</button><button class=\"btn sm ghost\" data-sact=\"dZip\" data-hepsi=\"0\" ${dSec.size ? '' : 'disabled'}>Seçilenleri indir (ZIP)</button><button class=\"btn sm ghost\" data-sact=\"dZip\" data-hepsi=\"1\">Tümünü indir (ZIP)</button><button class=\"btn sm ghost\" data-sact=\"dHepsiSec\">${dSec.size === D.guncel.length ? 'Seçimi kaldır' : 'Tümünü seç'}</button></div>` : '<p class=\"small muted\">Henüz dosya yok.</p>'}\n    ${D.eski.length ? `<details><summary class=\"small\"><b>Eski sürümler (${D.eski.length})</b></summary><ul class=\"small\">${D.eski.map(x => `<li>${sE(x.ad)} v${x.surum} · ${sE(x.tarih)} · ${sE(x.yukleyen)} <button class=\"btn sm ghost\" data-sact=\"dIndir\" data-did=\"${sE(x.id)}\">İndir</button></li>`).join('')}</ul></details>` : ''}\n  </div></details>`;\n}\nfunction dosyaB64(f) { return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => no(fr.error); fr.readAsDataURL(f); }); }\ndocument.addEventListener('change', async e => {\n  const el = e.target, d = el.dataset || {};\n  if (d.dsec) { el.checked ? dSec.add(d.dsec) : dSec.delete(d.dsec); return render(); }\n  if (d.dvkime) { dVars.kime = el.checked ? dVars.kime.concat([d.dvkime]) : dVars.kime.filter(x => x !== d.dvkime); return; }\n  if (el.id === 'dVarBol') { dVars.bolum = el.value; return; }\n  if (el.id === 'dVarLv') { dVars.lv = el.value; return; }\n  const x = (SD && SD.dok ? SD.dok.guncel : []).find(y => y.id === (d.dset || d.dkime || d.dgizli)); if (!x) return;\n  try {\n    if (d.dset) await dIslem('dokGuncelle', { did: x.id, [d.k]: el.value });\n    if (d.dkime) await dIslem('dokGuncelle', { did: x.id, kime: el.checked ? x.kime.concat([d.v]) : x.kime.filter(k => k !== d.v) });\n    if (d.dgizli) { if (el.checked && !await onayla('\"' + x.ad + '\" gizli yapılsın mı? Yalnız yönetimde kalır, birime açılamaz.')) { el.checked = false; return; } await dIslem('dokGuncelle', { did: x.id, gizli: el.checked }); }\n  } catch (err) { hataGoster(err); }\n  render();\n});\n\n/* ---------- 8. Görevler ve e-postalar (19.11.2026) ---------- */\nlet eTur = 'ogris', eTarih = '', eOn = null, eSec = new Set(), eEk = new Set(), eKonu = '', eMetin = '', eKayit = null, gListe = null, gOnizle = null, eOnceDahil = false;\nconst GSUT = { e: /^(e-?posta|eposta|e-mail|email|mail)$/i, ad: /^(ad\\s*soyad|adı\\s*soyadı|hoca|öğretim elemanı|ad)$/i, tarih: /^tarih$/i, saat: /^saat$/i, gorev: /^(görev|gorev)$/i, yer: /^(yer|yer\\s*\\/\\s*ayrıntı|derslik|ayrıntı)$/i, not: /^not$/i };\nfunction gorevOku(rows) {\n  for (let i = 0; i < Math.min(rows.length, 15); i++) { const r = rows[i].map(x => String(x == null ? '' : x).trim()), k = {};\n    r.forEach((h, j) => { for (const [ad, re] of Object.entries(GSUT)) if (k[ad] == null && re.test(h)) k[ad] = j; });\n    if (k.e != null && k.tarih != null && k.gorev != null) return { L: rows.slice(i + 1).map(x => Object.fromEntries(Object.entries(k).map(([a, j]) => [a, String(x[j] == null ? '' : x[j]).trim()]))).filter(x => x.e || x.ad), kol: Object.keys(k).join(', ') }; }\n  return { hata: 'Başlık satırı bulunamadı. Sütunlar: E-posta, Ad Soyad, Tarih, Saat, Görev, Yer / ayrıntı.' };\n}\nasync function eIslem(islem, a) {\n  const r = await run('apiSinavIslem', ot, islem, Object.assign({ id: SD.id }, a));\n  if (r.err) { sHata = r.err === 'OTURUM' ? 'Oturum sona erdi; yeniden giriş yapın.' : r.err; render(); return null; }\n  if (r.hata) { bilgi(r.hata); return null; }\n  if (r.mesaj) sMsg = r.mesaj; return r;\n}\nfunction eOnizlemeKur(o) { eOn = o; eKonu = o.konu; eMetin = o.metin; eSec = new Set(o.alicilar.filter(x => eOnceDahil || !x.once).map(x => x.e)); eEk = new Set(o.ekVars); }\nfunction vEposta() {\n  const G = SD.gorevOzet || { satir: 0, kisi: 0, gunler: [] }, T = SD.epTur || [], o = eOn;\n  const gorevTablo = gListe ? `<div class=\"scroll\" style=\"max-height:300px\"><table class=\"tt\"><thead><tr><th>Hoca</th><th>Tarih</th><th>Saat</th><th>Görev</th><th>Yer</th></tr></thead><tbody>${gListe.map(g => `<tr><td>${sE(g.ad)}<br><span class=\"small muted\">${sE(g.e)}</span></td><td>${sE(trT(g.tarih))}</td><td>${sE(g.saat)}</td><td>${sE(g.gorev)}</td><td>${sE(g.yer)}</td></tr>`).join('')}</tbody></table></div>` : '';\n  const onz = !o ? '' : `<div class=\"panel stack\" style=\"gap:8px\">\n      ${o.yonlendir ? `<div class=\"note n-hl small\"><b>DENEME:</b> bütün e-postalar gerçek alıcıya değil <b>${sE(o.yonlendir)}</b> adresine gider; konuda asıl alıcı yazar.</div>` : ''}\n      <label class=\"f\">Konu<input id=\"eKonu\" value=\"${sE(eKonu)}\"></label>\n      <label class=\"f\">Metin ${o.kisisel ? '<span class=\"small muted\">({AD} = hocanın adı, {GOREVLER} = kişisel görev tablosu, {PORTAL} = portal adresi)</span>' : ''}<textarea id=\"eMetin\" rows=\"9\" style=\"width:100%\">${sE(eMetin)}</textarea></label>\n      <details><summary class=\"small\"><b>Örnek (ilk alıcı için)</b></summary><pre class=\"small\" style=\"white-space:pre-wrap\">${sE(o.ornek)}</pre></details>\n      <div><b class=\"small\">Alıcılar (${eSec.size} / ${o.alicilar.length})</b> <label class=\"ck small\"><input type=\"checkbox\" id=\"eOnce\" ${eOnceDahil ? 'checked' : ''}> daha önce gönderilenleri de seç</label>\n        <div class=\"scroll\" style=\"max-height:260px\"><table class=\"tt\"><thead><tr><th><input type=\"checkbox\" id=\"eHepsi\" ${eSec.size === o.alicilar.length && o.alicilar.length ? 'checked' : ''}></th><th>Ad</th><th>E-posta</th>${o.kisisel && o.gorev ? '<th>Görev</th>' : ''}<th>Daha önce</th></tr></thead><tbody>\n        ${o.alicilar.map(x => `<tr><td><input type=\"checkbox\" data-esec=\"${sE(x.e)}\" ${eSec.has(x.e) ? 'checked' : ''}></td><td>${sE(x.ad)}</td><td class=\"mono small\">${sE(x.e)}</td>${o.kisisel && o.gorev ? `<td>${x.n}</td>` : ''}<td class=\"small\">${x.once ? '<span class=\"pill p-warn\">gönderildi ' + sE(x.once) + '</span>' : '—'}</td></tr>`).join('')}</tbody></table></div></div>\n      <div><b class=\"small\">Ekler (${eEk.size})</b> ${o.ekler.length ? o.ekler.map(x => `<label class=\"ck small\" style=\"display:block\"><input type=\"checkbox\" data-eek=\"${sE(x.id)}\" ${eEk.has(x.id) ? 'checked' : ''}> ${sE(x.ad)} <span class=\"muted\">${x.kb} KB · kime: ${sE(x.kime)}</span></label>`).join('') : '<span class=\"small muted\">Sınav dokümanlarında eklenebilecek (gizli olmayan) dosya yok.</span>'}</div>\n      <div class=\"row\" style=\"gap:8px;align-items:center\"><button class=\"btn\" data-sact=\"eGonder\" ${eSec.size ? '' : 'disabled'}>Gönder (${eSec.size} kişi)</button><span class=\"small muted\">Bugün kalan gönderim kotası: ${o.kota}</span></div></div>`;\n  return `<details class=\"panel\" ${det('ep', false)}><summary><b>8. Görevler ve e-postalar</b> <span class=\"small muted\">(${G.satir ? G.kisi + ' hocaya ' + G.satir + ' görev' : 'görev listesi yok'})</span></summary><div class=\"stack\" style=\"margin-top:8px\">\n    <div class=\"panel stack\" style=\"gap:6px\"><b class=\"small\">Görev listesi</b>\n      <p class=\"small muted\" style=\"margin:0\">Görev dağılımını Claude hazırlar; Excel'i buradan yüklenir (sütunlar: E-posta, Ad Soyad, Tarih, Saat, Görev, Yer / ayrıntı). Yeni liste bu sınavın önceki görev listesinin yerine geçer.</p>\n      <div class=\"small\">${G.satir ? `${G.kisi} hoca · ${G.satir} görev · günler: ${G.gunler.map(g => sE(g.tr)).join(', ')}` : 'Henüz görev listesi yüklenmedi.'}</div>\n      <div class=\"row\" style=\"gap:8px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">Görev listesi (Excel)<input type=\"file\" id=\"gDosya\" accept=\".xlsx,.xls,.csv\"></label>${G.satir ? `<button class=\"btn sm ghost\" data-sact=\"gGoster\">${gListe ? 'Listeyi gizle' : 'Listeyi göster'}</button>` : ''}</div>\n      ${gOnizle ? (gOnizle.hata ? `<div class=\"note n-bad small\">${sE(gOnizle.hata)}</div>` : `<div class=\"note n-hl small\">${sE(gOnizle.dosya)}: <b>${gOnizle.L.length}</b> satır (sütunlar: ${sE(gOnizle.kol)}). <button class=\"btn sm\" data-sact=\"gKaydet\">Görev listesini kaydet</button> <button class=\"btn sm ghost\" data-sact=\"gVazgec\">Vazgeç</button></div>`) : ''}\n      ${gorevTablo}</div>\n    <div class=\"panel stack\" style=\"gap:6px\"><b class=\"small\">E-posta gönder</b>\n      <p class=\"small muted\" style=\"margin:0\">Önce \"Önizle\": alıcılar, konu, metin ve ekler gösterilir; istemediğiniz kişilerin işaretini kaldırın, sonra \"Gönder\" ve onay. Gönderen: sistemin Gmail adresi (yanıtlar Ayarlar › yanıt adresine). Her gönderim kayda geçer.</p>\n      <div class=\"row\" style=\"gap:8px;flex-wrap:wrap;align-items:flex-end\"><label class=\"f\">Tür<select id=\"eTur\" style=\"width:auto\">${T.map(([k, t]) => `<option value=\"${k}\" ${k === eTur ? 'selected' : ''}>${sE(t)}</option>`).join('')}</select></label>\n        ${eTur === 'hatirlatma' ? `<label class=\"f\">Görev günü<select id=\"eTarih\" style=\"width:auto\"><option value=\"\">Seçin…</option>${G.gunler.map(g => `<option value=\"${g.tarih}\" ${g.tarih === eTarih ? 'selected' : ''}>${sE(g.tr)}</option>`).join('')}</select></label>` : ''}\n        <button class=\"btn sm\" data-sact=\"eOnizle\">Önizle</button><button class=\"btn sm ghost\" data-sact=\"eKayit\">Gönderim kaydı</button></div>\n      ${onz}\n      ${eKayit ? `<div class=\"scroll\" style=\"max-height:260px\"><table class=\"tt\"><thead><tr><th>Tarih</th><th>Tür</th><th>Alıcı</th><th>Konu</th><th>Durum</th><th>Gönderen</th></tr></thead><tbody>${eKayit.length ? eKayit.map(k => `<tr><td class=\"small\">${sE(k.tarih)}</td><td class=\"small\">${sE(k.tur)}</td><td class=\"small\">${sE(k.ad)}<br><span class=\"muted\">${sE(k.alici)}</span></td><td class=\"small\">${sE(k.konu)}</td><td class=\"small\">${sE(k.durum)}</td><td class=\"small\">${sE(k.gonderen)}</td></tr>`).join('') : '<tr><td colspan=\"6\" class=\"small muted\">Kayıt yok.</td></tr>'}</tbody></table></div>` : ''}\n    </div></div></details>`;\n}\ndocument.addEventListener('input', e => { if (e.target.id === 'eKonu') eKonu = e.target.value; if (e.target.id === 'eMetin') eMetin = e.target.value; });\ndocument.addEventListener('change', async e => {\n  const el = e.target, d = el.dataset || {};\n  if (el.id === 'eTur') { eTur = el.value; eOn = null; return render(); }\n  if (el.id === 'eTarih') { eTarih = el.value; eOn = null; return render(); }\n  if (el.id === 'eOnce') { eOnceDahil = el.checked; if (eOn) eSec = new Set(eOn.alicilar.filter(x => eOnceDahil || !x.once).map(x => x.e)); return render(); }\n  if (el.id === 'eHepsi') { eSec = el.checked && eOn ? new Set(eOn.alicilar.map(x => x.e)) : new Set(); return render(); }\n  if (d.esec) { el.checked ? eSec.add(d.esec) : eSec.delete(d.esec); return render(); }\n  if (d.eek) { el.checked ? eEk.add(d.eek) : eEk.delete(d.eek); return render(); }\n  if (el.id === 'gDosya' && el.files[0]) { try { const f = el.files[0]; gOnizle = Object.assign(gorevOku(await excelSatirlari(f)), { dosya: f.name }); } catch (err) { gOnizle = { hata: 'Dosya okunamadı: ' + (err.message || err) }; } render(); }\n});\n\n/* ---------- olaylar ---------- */\nfunction excelSatirlari(f) {\n  return new Promise((ok, no) => { if (typeof XLSX === 'undefined') return no(new Error('Excel kütüphanesi yüklenemedi; sayfayı yenileyin.'));\n    const fr = new FileReader(); fr.onload = () => { try { const wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; ok(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })); } catch (e) { no(e); } };\n    fr.onerror = () => no(fr.error); fr.readAsArrayBuffer(f); });\n}\ndocument.addEventListener('input', e => {\n  const d = e.target.dataset || {};\n  if (d.sx) { const v = e.target.type === 'number' ? Number(e.target.value) : e.target.value; sSet(d.sx, /\\.kul$/.test(d.sx) ? Number(v) : v); }\n  if (e.target.id === 'sAd') { sAd = e.target.value; sDegisti = true; }\n  if (d.sxtn) { SX.gorev.tercih[d.sxtn] = Object.assign(SX.gorev.tercih[d.sxtn] || {}, { not: e.target.value }); sDegisti = true; }\n  if (d.dh) { const [i, k] = d.dh.split('.'); DH[i][k] = e.target.type === 'number' ? Number(e.target.value) : e.target.value; dhDegisti = true; }\n  if (e.target.id === 'sAra') { sAra = e.target.value; const p = e.target.selectionStart; render(); const el = document.getElementById('sAra'); if (el) { el.focus(); el.setSelectionRange(p, p); } }\n});\ndocument.addEventListener('change', async e => {\n  const el = e.target, d = el.dataset || {};\n  if (d.sxb) { sSet(d.sxb, el.checked); return render(); }\n  if (d.sxlv) { const L = sGet(d.sxlv) || []; sSet(d.sxlv, el.checked ? L.concat([d.v]).filter((x, i, A) => A.indexOf(x) === i) : L.filter(x => x !== d.v)); return render(); }\n  if (d.sxt) { if (el.value === 'normal') delete SX.gorev.tercih[d.sxt]; else SX.gorev.tercih[d.sxt] = Object.assign(SX.gorev.tercih[d.sxt] || {}, { t: el.value }); sDegisti = true; return render(); }\n  if (d.sxd) { const [b, i, ...g] = d.sxd.split('.'), gk = g.join('.'), D = SX.derslik[b][i] = SX.derslik[b][i] || { atama: {}, secili: [] }; if (el.value) D.atama[gk] = el.value; else delete D.atama[gk]; sOner.delete(b + ':' + i + ':' + gk); sDegisti = true; return; }\n  if (d.sxsec) { const [b, i] = d.sxsec.split('.'), D = SX.derslik[b][i] = SX.derslik[b][i] || { atama: {}, secili: [] }; D.secili = el.checked ? D.secili.concat([d.v]) : D.secili.filter(x => x !== d.v); sDegisti = true; return; }\n  if (d.sxj != null && d.sxj !== '') { const K = SX.derslik.konusma[Number(d.sxj)]; K.juri = Math.max(0, Math.min(40, Number(el.value) || 0)); K.derslikler = (K.derslikler || []).slice(0, K.juri); sDegisti = true; return render(); }\n  if (d.sx && el.tagName === 'SELECT') { if (/\\.derslikler\\.\\d+$/.test(d.sx)) { const m = d.sx.match(/konusma\\.(\\d+)\\.derslikler\\.(\\d+)/), K = SX.derslik.konusma[m[1]]; sOner.delete('k:' + K.oi + ':' + K.lv + ':' + m[2]); } return; }\n  if (el.id === 'sListe' && el.files[0]) { try { const f = el.files[0], r = listeOku(await excelSatirlari(f)); sOnizle = Object.assign(r, { dosya: f.name }); } catch (err) { sOnizle = { hata: 'Dosya okunamadı: ' + (err.message || err) }; } render(); }\n});\ndocument.addEventListener('click', async e => {\n  const el = e.target.closest('[data-sact]'); if (!el) return; const d = el.dataset;\n  const degisirse = async () => !sDegisti || await onayla('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?');\n  try {\n    el.disabled = true;\n    if (d.sact === 'ac') { if (!(await degisirse())) return; sMsg = ''; sOnizle = null; await sIslem('ac', { id: d.id }); }\n    if (d.sact === 'yeni') { const t = $('#sYeniTur').value; if (!t) return bilgi('Sınav türü seçin.'); if (!(await degisirse())) return; sOnizle = null; await sIslem('yeni', { tur: t, ad: $('#sYeniAd').value }); }\n    if (d.sact === 'otEkle') { const B = SX.bolum[d.b], son = B.oturum[B.oturum.length - 1] || {}; B.oturum.push(Object.assign({ tarih: '', saat: son.saat || '', lv: SD.hazirlik ? [] : ['Tek'] }, d.b === 'konusma' ? { kul: son.kul || 1 } : {})); sDegisti = true; render(); }\n    if (d.sact === 'otSil') { const i = Number(d.i); SX.bolum[d.b].oturum.splice(i, 1); if (SX.derslik[d.b] && d.b !== 'konusma') SX.derslik[d.b].splice(i, 1);\n      if (d.b === 'konusma') SX.derslik.konusma = SX.derslik.konusma.filter(k => k.oi !== i).map(k => (k.oi > i ? Object.assign(k, { oi: k.oi - 1 }) : k)); sDegisti = true; render(); }\n    if (d.sact === 'konEkle') { SX.derslik.konusma.push({ oi: Number(d.oi), lv: d.lv, juri: 0, derslikler: [], bekleme: '', kayit: '', tv: '' }); sDegisti = true; render(); }\n    if (d.sact === 'dYukle') { const F = Array.from(($('#dDosya') || {}).files || []); if (!F.length) return bilgi('Dosya seçin.');\n      for (let i = 0; i < F.length; i++) { dYukleniyor = (i + 1) + '/' + F.length + ': ' + F[i].name; render(); const b64 = await dosyaB64(F[i]);\n        if (!(await dIslem('dokYukle', { ad: F[i].name, tur: F[i].type, b64, bolum: dVars.bolum, lv: dVars.lv, kime: dVars.kime }))) break; }\n      dYukleniyor = ''; render(); }\n    if (d.sact === 'dIndir') { const r = await dIslem('dokIndir', { did: d.did }); if (r && r.b64) dIndir(r); }\n    if (d.sact === 'dZip') { const r = await dIslem('dokZip', d.hepsi === '1' ? {} : { dids: [...dSec] }); if (r && r.b64) dIndir(r); }\n    if (d.sact === 'dHepsiSec') { const G = SD.dok.guncel; dSec = dSec.size === G.length ? new Set() : new Set(G.map(x => x.id)); render(); }\n    if (d.sact === 'dBirimeAc') { const G = SD.dok.guncel.filter(x => dSec.has(x.id)), gz = G.filter(x => x.gizli);\n      if (await onayla(G.length + ' dosya ' + (SD.dok.birimAd || 'birime') + '\\'ne açılsın mı?' + (gz.length ? '\\n' + gz.length + ' gizli dosya açılmayacak (kör grading).' : '') + '\\nE-posta gitmez; birim üyeleri \"Birim çalışmaları\" ekranında görür.')) { await dIslem('dokBirimeAc', { dids: G.map(x => x.id) }); dSec = new Set(); render(); } }\n    if (d.sact === 'dBirimdenKaldir' && await onayla('Dosya birimden kaldırılsın mı? (Silinmez.)')) { await dIslem('dokBirimdenKaldir', { did: d.did }); render(); }\n    if (d.sact === 'dKaldir' && await onayla('Dosya listeden kaldırılsın mı? (Silinmez; Drive\\'da \"eski versiyonlar\" klasörüne taşınır.)')) { await dIslem('dokKaldir', { did: d.did }); render(); }\n    if (d.sact === 'gKaydet') { const r = await eIslem('gorevYukle', { satirlar: gOnizle.L }); if (r) { gOnizle = null; SD.gorevOzet = { satir: r.gorev.liste.length, kisi: r.gorev.kisi, gunler: r.gorev.gunler }; gListe = null; eOn = null; } render(); }\n    if (d.sact === 'gVazgec') { gOnizle = null; render(); }\n    if (d.sact === 'gGoster') { if (gListe) gListe = null; else { const r = await eIslem('gorevListe', {}); if (r) gListe = r.gorev.liste; } render(); }\n    if (d.sact === 'eOnizle') { const r = await eIslem('epOnizle', { tur: eTur, tarih: eTarih }); if (r) eOnizlemeKur(r.onizleme); render(); }\n    if (d.sact === 'eKayit') { if (eKayit) eKayit = null; else { const r = await eIslem('epKayit', {}); if (r) eKayit = r.kayit; } render(); }\n    if (d.sact === 'eGonder') { const o = eOn, L = o.alicilar.filter(x => eSec.has(x.e)), ek = o.ekler.filter(x => eEk.has(x.id));\n      const msj = L.length + ' kişiye e-posta gidecek' + (o.yonlendir ? ' (DENEME: hepsi ' + o.yonlendir + ' adresine)' : '') + ':\\n\\n' + L.slice(0, 40).map(x => '• ' + x.ad + ' <' + x.e + '>').join('\\n') + (L.length > 40 ? '\\n… ve ' + (L.length - 40) + ' kişi daha' : '') + '\\n\\nKonu: ' + eKonu + '\\nEkler: ' + (ek.length ? ek.map(x => x.ad).join(', ') : 'yok') + '\\n\\nGönderilsin mi?';\n      if (await onayla(msj, 'Gönder', 'Vazgeç')) { const r = await eIslem('epGonder', { tur: o.tur, tarih: o.tarih, alicilar: [...eSec], ekler: [...eEk], konu: eKonu, metin: eMetin });\n        if (r) { eOn = null; eKayit = null; const r2 = await run('apiSinavIslem', ot, 'ac', { id: SD.id }); if (r2.sinav) SD.adimlar = r2.sinav.adimlar; } render(); } }\n    if (d.sact === 'kaydet') await sIslem('kaydet', { id: SD.id, ad: sAd, cfg: SX });\n    if (d.sact === 'oner') { const r = await run('apiSinavIslem', ot, 'oner', { id: SD.id, cfg: SX }); if (r.hata) return bilgi(r.hata); SX = r.cfg; sOner = new Set(r.onerilen); if (r.onerilen.length) sDegisti = true; sMsg = r.mesaj; render(); }\n    if (d.sact === 'hazir') { if (sDegisti && !(await sIslem('kaydet', { id: SD.id, ad: sAd, cfg: SX }))) return;\n      if (SD.kontrol.hata.length) return bilgi('Önce şu eksikler giderilmeli:\\n- ' + SD.kontrol.hata.slice(0, 15).join('\\n- '));\n      if (await onayla((SD.kontrol.uyari.length ? SD.kontrol.uyari.length + ' uyarı var (kontrol listesinde). ' : '') + 'Sınav \"hazır\" olarak Claude\\'a gönderilsin mi? Ayarlar kilitlenir; gerekirse \"Düzenlemeye geri aç\" ile açılır.')) await sIslem('hazir', { id: SD.id }); }\n    if (d.sact === 'geriAc' && await onayla('Sınav yeniden düzenlemeye açılsın mı?')) await sIslem('hazir', { id: SD.id, geri: true });\n    if (d.sact === 'iptal' && await onayla('\"' + SD.ad + '\" listeden kaldırılsın mı? (Kayıt silinmez; tabloda \"iptal\" olarak durur.)')) { if (await sIslem('iptal', { id: SD.id })) { SD = null; SX = null; sDegisti = false; render(); } }\n    if (d.sact === 'listeKaydet') { const o = sOnizle; if (sDegisti && !(await sIslem('kaydet', { id: SD.id, ad: sAd, cfg: SX, not: 'Ayarlar kaydedildi (liste yüklemeden önce).' }))) return;\n      if (await sIslem('liste', { id: SD.id, satirlar: o.L, dosya: o.dosya })) { sOnizle = null; render(); } }\n    if (d.sact === 'listeVazgec') { sOnizle = null; render(); }\n    if (d.sact === 'dhEkle') { DH.push({ ad: '', bina: '', kat: '', kap: 0, skap: 0, sinif: '', not: '', durum: 'aktif' }); dhDegisti = true; render(); }\n    if (d.sact === 'dhKaydet') { const r = await run('apiSinavIslem', ot, 'derslikKaydet', { liste: DH.filter(x => String(x.ad || '').trim()) }); if (r.hata) return bilgi(r.hata); dhDegisti = false; SG = r; DH = JSON.parse(JSON.stringify(r.havuz)); sMsg = r.mesaj; render(); }\n    if (d.sact === 'dhIce') { const f = $('#dhDosya').files[0]; if (!f) return bilgi('Dosya seçin.'); if (dhDegisti && !await onayla('Kaydedilmemiş derslik değişiklikleri kaybolacak. Devam edilsin mi?')) return;\n      const rows = await excelSatirlari(f); let bi = rows.findIndex(r => r.some(x => /^derslik$/i.test(String(x).trim())));\n      if (bi < 0) return bilgi('\"Derslik\" başlıklı sütun bulunamadı.');\n      const H = rows[bi].map(x => String(x).trim().toLocaleLowerCase('tr')), k = re => H.findIndex(h => re.test(h));\n      const kd = k(/^derslik$/), ks = k(/^sınıf$/), kk = k(/kapasite|öğrenci sayısı/), kb = k(/^bina$/), kt = k(/^kat$/);\n      const sat = rows.slice(bi + 1).map(r => ({ ad: r[kd], sinif: ks >= 0 ? r[ks] : '', kap: kk >= 0 ? r[kk] : '', bina: kb >= 0 ? r[kb] : '', kat: kt >= 0 ? r[kt] : '' })).filter(x => String(x.ad || '').trim());\n      const r = await run('apiSinavIslem', ot, 'derslikIceAktar', { satirlar: sat }); if (r.hata) return bilgi(r.hata); dhDegisti = false; SG = r; DH = JSON.parse(JSON.stringify(r.havuz)); sMsg = r.mesaj; render(); }\n  } catch (err) { hataGoster(err); }\n  finally { el.disabled = false; }\n});\nwindow.addEventListener('beforeunload', e => { if ((sDegisti || dhDegisti) && (tab === 'sinav' || tab === 'derslik')) { e.preventDefault(); e.returnValue = ''; } });\n</script>\n"};
