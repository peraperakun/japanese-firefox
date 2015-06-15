/*

	Perapera Japanese
	Copyright (C) 2005-2011 Jonathan Zarate
	http://www.polarcloud.com/

	---

	This program is free software; you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation; either version 2 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program; if not, write to the Free Software
	Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA

	---

	Please do not change or remove any of the copyrights or links to web pages
	when modifying any of the files.

*/

var ppjData = {
	ready: false,
	kanjiPos: 0,
	dicList: [],

	loadConfig: function() {
		let reinit = false;

		if (this.ready) {
			this.done();
			reinit = true;
		}

		if (typeof(ppjDicList) == 'undefined') {
			ppjDicList = {};
			this.missing = true;
		}
		if (ppjDicList['kanji@local'] == null) {
			ppjDicList['kanji@local'] = {
				name: 'Kanji',
				id: 'kanji@local',
				isKanji: true
			};
		}

		//	ppjMain.global().ppjDicList = ppjDicList;

		let prefs = new ppjPrefs();
		let order = prefs.getString('dpriority');
		if (order == '') order = 'peraperakun@gmail.com#|japanese-german@perapera.org#|japanese-french@perapera.org#|japanese-russian@perapera.org#|peraperakun-names@gmail.com#|kanji@local#';

		this.dicList = [];
		this.kanjiPos = 0;

		let done = {};

		// arrange dicList based on user setting
		let oa = order.split('|');
		for (let i = 0; i < oa.length; ++i) {
			if (oa[i].match(/^(.+?)#/)) {
				let dic = ppjDicList[RegExp.$1];
				if (dic) {
					this.dicList.push(dic);
					done[dic.id] = true;
				}
			}
		}

		// anything new is added at the end
		let addedNew = false;
		for (let id in ppjDicList) {
			if (!done[id]) {
				this.dicList.push(ppjDicList[id]);
				addedNew = true;
			}
		}

		let ids = [];

		// rebuild dpriority string which is also used by Options
		let order2 = [];
		for (let i = 0; i < this.dicList.length; ++i) {
			let dic = this.dicList[i];
			let s = dic.id + '#' + dic.name;
			if (dic.version) s += ' v' + dic.version;
			order2.push(s)

			if (dic.isKanji) this.kanjiPos = i;	// keep track of position
				else ids.push(dic.id);
		}
		order2 = this.missing ? '' : order2.join('|');
		if (order != order2) prefs.setString('dpriority', order2);

		if (addedNew) {
			// show dictionary tab if we have a new dictionary
			window.openDialog('chrome://jperapera/content/options.xul', '', 'chrome,centerscreen', 'dic');
		}

		// FF 3.7a workaround; @@ revisit later
		if (!ppjData.dicPath) {
			ppjData.dicPath = { ready: false };
			try {
				Components.utils.import('resource://gre/modules/AddonManager.jsm');
				// ! asynchronous
				AddonManager.getAddonsByIDs(ids, function(addons) {
					for (let i = 0; i < addons.length; ++i) {
						if (addons[i] == null) continue;
						
						let a = addons[i];
						// URL->URI changed in 3.7a6?

						ppjData.dicPath[a.id] = a.getResourceURI('install.rdf')
								.QueryInterface(Components.interfaces.nsIFileURL)
								.file.parent.path;

						if (a.id === "peraperakun@gmail.com") {
							ppjData.dicPath["peraperakun-names@gmail.com"] = a.getResourceURI('install.rdf')
									.QueryInterface(Components.interfaces.nsIFileURL)
									.file.parent.path;
						}
						//	alert(a.id + ': path=' + ppjData.dicPath[a.id]);
					}
					ppjData.dicPath.ready = true;
					ppjMain.ppjObs.notifyState('dready');
				});
				return;
			}
			catch (ex) { }
			ppjData.dicPath.ready = true;
		}

		if (reinit) this.init();
	},

	init: function() {
		if (this.ready) return;

		this.kanjiShown = {};
		let a = ppjConfig.kindex.split(',');
		for (let i = a.length - 1; i >= 0; --i) {
			this.kanjiShown[a[i]] = 1;
		}

		for (let i = this.dicList.length - 1; i >= 0; --i) {
			let dic = this.dicList[i];
			if (dic.isKanji) continue;
			if ((!dic.findWord) || (!dic.findText)) this.dicList[i] = dic = new RcxDic(dic);
			if (dic.open) dic.open();
		}

		this.ready = true;
	},

	done: function() {
		this.ready = false;
		this.kanjiData = null;
		this.kanjiShown = null;
		this.radData = null;
		this.deinflect.done();

		for (let i = this.dicList.length - 1; i >= 0; --i) {
			try {
				let dic = this.dicList[i];
				if (dic.close) dic.close();
			}
			catch (ex) { }
		}
	},


	selected: 0,

	selectNext: function() {
		this.selected = (this.selected + this.searchSkipped + 1) % this.dicList.length;
		this.searchSkipped = 0;
	},

	select: function(n) {
		if ((n < 0) || (n >= this.dicList.length)) return;
		this.selected = n;
		this.searchSkipped = 0;
	},

	deinflect: {
		init: function() {
			this.reasons = [];
			this.rules = [];

			var buffer = ppjFile.readArray('chrome://jperapera/content/deinflect.dat');
			var ruleGroup = [];
			ruleGroup.fromLen = -1;

			// i = 1: skip header
			for (var i = 1; i < buffer.length; ++i) {
				var f = buffer[i].split('\t');

				if (f.length == 1) {
					this.reasons.push(f[0]);
				}
				else if (f.length == 4) {
					var r = { from: f[0], to: f[1], type: f[2], reason: f[3] };
					if (ruleGroup.fromLen != r.from.length) {
						ruleGroup = [];
						ruleGroup.fromLen = r.from.length;
						this.rules.push(ruleGroup);
					}
					ruleGroup.push(r);
				}
			}
			this.ready = true;
		},

		done: function() {
			this.reasons = null;
			this.rules = null;
			this.ready = false;
		},

		go: function(word) {
			if (!this.ready) this.init();

			var have = [];
			have[word] = 0;

			var r = [{ word: word, type: 0xFF, reason: '' }];
			var i = 0;
			do {
				word = r[i].word;
				var wordLen = word.length;
				var type = r[i].type;

				for (var j = 0; j < this.rules.length; ++j) {
					var ruleGroup = this.rules[j];
					if (ruleGroup.fromLen <= wordLen) {
						var end = word.substr(-ruleGroup.fromLen);
						for (var k = 0; k < ruleGroup.length; ++k) {
							var rule = ruleGroup[k];
							if ((type & rule.type) && (end == rule.from)) {
								var newWord = word.substr(0, word.length - rule.from.length) + rule.to;
								if (newWord.length <= 1) continue;
								var o = {};
								if (have[newWord] != undefined) {
									o = r[have[newWord]];
									o.type |= (rule.type >> 8);
									continue;
								}
								have[newWord] = r.length;
								if (r[i].reason.length) o.reason = this.reasons[rule.reason] + ' &lt; ' + r[i].reason;
									else o.reason = this.reasons[rule.reason];
								o.type = rule.type >> 8;
								o.word = newWord;
								r.push(o);
							}
						}
					}
				}
			} while (++i < r.length);

			return r;
		}
	},


	// katakana -> hiragana conversion tables
	ch:[0x3092,0x3041,0x3043,0x3045,0x3047,0x3049,0x3083,0x3085,0x3087,0x3063,0x30FC,0x3042,0x3044,0x3046,
		0x3048,0x304A,0x304B,0x304D,0x304F,0x3051,0x3053,0x3055,0x3057,0x3059,0x305B,0x305D,0x305F,0x3061,
		0x3064,0x3066,0x3068,0x306A,0x306B,0x306C,0x306D,0x306E,0x306F,0x3072,0x3075,0x3078,0x307B,0x307E,
		0x307F,0x3080,0x3081,0x3082,0x3084,0x3086,0x3088,0x3089,0x308A,0x308B,0x308C,0x308D,0x308F,0x3093],
	cv:[0x30F4,0xFF74,0xFF75,0x304C,0x304E,0x3050,0x3052,0x3054,0x3056,0x3058,0x305A,0x305C,0x305E,0x3060,
		0x3062,0x3065,0x3067,0x3069,0xFF85,0xFF86,0xFF87,0xFF88,0xFF89,0x3070,0x3073,0x3076,0x3079,0x307C],
	cs:[0x3071,0x3074,0x3077,0x307A,0x307D],

	_wordSearch: function(word, dic, max) {
		if (!this.ready) this.init();

		// half & full-width katakana to hiragana conversion
		// note: katakana vu is never converted to hiragana

		var trueLen = [0];
		var p = 0;
		var r = '';
		for (let i = 0; i < word.length; ++i) {
			let u = word.charCodeAt(i);
			let v = u;

			if (u <= 0x3000) break;

			// full-width katakana to hiragana
			if ((u >= 0x30A1) && (u <= 0x30F3)) {
				u -= 0x60;
			}
			// half-width katakana to hiragana
			else if ((u >= 0xFF66) && (u <= 0xFF9D)) {
				u = this.ch[u - 0xFF66];
			}
			// voiced (used in half-width katakana) to hiragana
			else if (u == 0xFF9E) {
				if ((p >= 0xFF73) && (p <= 0xFF8E)) {
					r = r.substr(0, r.length - 1);
					u = this.cv[p - 0xFF73];
				}
			}
			// semi-voiced (used in half-width katakana) to hiragana
			else if (u == 0xFF9F) {
				if ((p >= 0xFF8A) && (p <= 0xFF8E)) {
					r = r.substr(0, r.length - 1);
					u = this.cs[p - 0xFF8A];
				}
			}
			// ignore J~
			else if (u == 0xFF5E) {
				p = 0;
				continue;
			}

			r += String.fromCharCode(u);
			trueLen[r.length] = i + 1;	// need to keep real length because of the half-width semi/voiced conversion
			p = v;
		}
		word = r;


		var result = { data: [] };
		var maxTrim;

		if (dic.isName) {
			maxTrim = ppjConfig.namax;
			result.names = 1;
		}
		else {
			maxTrim = ppjConfig.wmax;
		}


		if (max != null) maxTrim = max;

		var have = [];
		var count = 0;
		var maxLen = 0;

		while (word.length > 0) {
			var showInf = (count != 0);
			var variants = dic.isName ? [{word: word, type: 0xFF, reason: null}] : this.deinflect.go(word);
			for (var i = 0; i < variants.length; i++) {
				var v = variants[i];
				var entries = dic.findWord(v.word);
				for (var j = 0; j < entries.length; ++j) {
					var dentry = entries[j];
					if (have[dentry]) continue;

					var ok = true;
					if ((dic.hasType) && (i > 0)) {
						// i > 0 a de-inflected word

						var gloss = dentry.split(/[,()]/);
						var y = v.type;
						var z;
						for (z = gloss.length - 1; z >= 0; --z) {
							var g = gloss[z];
							if ((y & 1) && (g == 'v1')) break;
							if ((y & 4) && (g == 'adj-i')) break;
							if ((y & 2) && (g.substr(0, 2) == 'v5')) break;
							if ((y & 16) && (g.substr(0, 3) == 'vs-')) break;
							if ((y & 8) && (g == 'vk')) break;
						}
						ok = (z != -1);
					}
					if ((ok) && (dic.hasType) && (ppjConfig.hidex)) {
						if (dentry.match(/\/\([^\)]*\bX\b.*?\)/)) ok = false;
					}
					if (ok) {
						if (count >= maxTrim) {
							result.more = 1;
							break;
						}

						have[dentry] = 1;
						++count;
						if (maxLen == 0) maxLen = trueLen[word.length];

						var r = null;
						if (v.reason) {
							if (showInf) r = '&lt; ' + v.reason + ' &lt; ' + word;
								else r = '&lt; ' + v.reason;
						}
						result.data.push([dentry, r]);
					}
				}	// for j < entries.length
				if (count >= maxTrim) break;
			}	// for i < variants.length
			if (count >= maxTrim) break;
			word = word.substr(0, word.length - 1);
		}	// while word.length > 0

		if (result.data.length == 0) return null;

		result.matchLen = maxLen;
		return result;
	},

	wordSearch: function(word, noKanji) {
		this.searchSkipped = 0;
		let ds = this.selected;
		do {
			let dic = this.dicList[ds];
			if ((!noKanji) || (!dic.isKanji)) {
				let e;
				if (dic.isKanji) e = this.kanjiSearch(word.charAt(0));
					else e = this._wordSearch(word, dic, null);
				if (e) {
					if (ds != 0) e.title = dic.name;
					return e;
				}
			}
			this.searchSkipped++;
			ds = (ds + 1) % this.dicList.length;
		} while (ds != this.selected);
		return null;
	},

	translate: function(text) {
		var result = { data: [], textLen: text.length };
		while (text.length > 0) {
			var e = null;
			var ds = this.selected;
			do {
				if (!this.dicList[ds].isKanji) {
					e = this._wordSearch(text, this.dicList[ds], 1);
					if (e != null) break;
				}
				ds = (ds + 1) % this.dicList.length;
			} while (ds != this.selected);

			if (e != null) {
				if (result.data.length >= ppjConfig.wmax) {
					result.more = 1;
					break;
				}
				result.data.push(e.data[0]);
				text = text.substr(e.matchLen);
			}
			else {
				text = text.substr(1);
			}
		}
		this.searchSkipped = (this.selected == this.kanjiPos) ? 1 : 0;
		if (result.data.length == 0) return null;
		result.textLen -= text.length;
		return result;
	},

	textSearch: function(text) {
		this.searchSkipped = 0;
		if (!this.ready) this.init();
		text = text.toLowerCase();
		let ds = this.selected;
		do {
			let dic = this.dicList[ds];
			if (!dic.isKanji) {
				let result = { data: [], reason: [], kanji: 0, more: 0, names: dic.isName };

				let r = dic.findText(text);

				// try priorizing
				let list = [];
				let sW = /[\sW]/;
				let slashText = '/' + text + '/';
				for (let i = 0; i < r.length; ++i) {
					let t = r[i].replace(/\(.+?\)/g, '').toLowerCase();

					// closer to the beginning = better
					let d = t.indexOf(text);
					if (d >= 0) {
						// the exact text within an entry = best
						if (t.replace(/\s+/g, '').indexOf(slashText) != -1) {
							d -= 100;
						}
						// a word within an entry = better
						else if (((d == 0) || (sW.test(t.substr(d - 1, 1)))) &&
								(((d + text.length) >= t.length) || (sW.test(t.substr(d + text.length, 1))))) {
							d -= 50;
						}
					}
					else d = 9999;
					list.push({ rank: d, text: r[i] });
				}

				let max = dic.isName ? ppjConfig.namax : ppjConfig.wmax;
				list.sort(function(a, b) { return a.rank - b.rank });
				for (let i = 0; i < list.length; ++i) {
					if (result.data.length >= max) {
						result.more = 1;
						break;
					}
					//	result.data.push([list[i].text + '[' + list[i].rank + ']/', null]);
					result.data.push([list[i].text, null]);
				}

				/*
				let j = (list.length > 100) ? 100 : list.length;
				for (let i = 0; i < j; ++i) {
					ppjDebug.echo(i + ': [' + list[i].rank + '] ' + list[i].text);
				}*/

				/*
				for (let i = 0; i < r.length; ++i) {
					if (result.data.length >= max) {
						result.more = 1;
						break;
					}
					result.data.push([r[i], null]);
				}
				*/

				if (result.data.length) {
					if (ds != 0) result.title = dic.name;
					return result;
				}
			}
			this.searchSkipped++;
			ds = (ds + 1) % this.dicList.length;
		} while (ds != this.selected);
		return null;
	},

	// @@@ todo later...
	kanjiSearch: function(kanji) {
		const hex = '0123456789ABCDEF';
		var kde;
		var result;
		var a, b;
		var i;

		i = kanji.charCodeAt(0);
		if (i < 0x3000) return null;

		if (!this.kanjiData) {
			this.kanjiData = ppjFile.read((typeof(ppjKanjiURI) == 'string') ? ppjKanjiURI : 'chrome://jperapera/content/kanji.dat');
		}

		kde = this.find(this.kanjiData, kanji);
		if (!kde) return null;

		a = kde.split('|');
		if (a.length != 6) return null;

		result = { };
		result.kanji = a[0];

		result.misc = {};
		result.misc['U'] = hex[(i >>> 12) & 15] + hex[(i >>> 8) & 15] + hex[(i >>> 4) & 15] + hex[i & 15];

		b = a[1].split(' ');
		for (i = 0; i < b.length; ++i) {
			if (b[i].match(/^([A-Z]+)(.*)/)) {
				if (!result.misc[RegExp.$1]) result.misc[RegExp.$1] = RegExp.$2;
					else result.misc[RegExp.$1] += ' ' + RegExp.$2;
			}
		}

		result.onkun = a[2].replace(/\s+/g, '\u3001 ');
		result.nanori = a[3].replace(/\s+/g, '\u3001 ');
		result.bushumei = a[4].replace(/\s+/g, '\u3001 ');
		result.eigo = a[5];

		return result;
	},

	// ---

	numList: [
/*
		'C', 	'Classical Radical',
		'DR',	'Father Joseph De Roo Index',
		'DO',	'P.G. O\'Neill Index',
		'O', 	'P.G. O\'Neill Japanese Names Index',
		'Q', 	'Four Corner Code',
		'MN',	'Morohashi Daikanwajiten Index',
		'MP',	'Morohashi Daikanwajiten Volume/Page',
		'K',	'Gakken Kanji Dictionary Index',
		'W',	'Korean Reading',
*/
		'H',	'Halpern',
		'L',	'Heisig',
		'E',	'Henshall',
		'DK',	'Kanji Learners Dictionary',
		'N',	'Nelson',
		'V',	'New Nelson',
		'Y',	'PinYin',
		'P',	'Skip Pattern',
		'IN',	'Tuttle Kanji &amp; Kana',
		'I',	'Tuttle Kanji Dictionary',
		'U',	'Unicode'
	],


	makeHtml: function(entry) {
		var e;
		var b;
		var c, s, t;
		var i, j, n;

		if (entry == null) return '';

		if (!this.ready) this.init();
		if (!this.radData) this.radData = ppjFile.readArray('chrome://jperapera/content/radicals.dat');

		b = [];

		if (entry.kanji) {
			var yomi;
			var box;
			var bn;
			var k;
			var nums;

			yomi = entry.onkun.replace(/\.([^\u3001]+)/g, '<span class="k-yomi-hi">$1</span>');
			if (entry.nanori.length) {
				yomi += '<br/><span class="k-yomi-ti">\u540D\u4E57\u308A</span> ' + entry.nanori;
			}
			if (entry.bushumei.length) {
				yomi += '<br/><span class="k-yomi-ti">\u90E8\u9996\u540D</span> ' + entry.bushumei;
			}

			bn = entry.misc['B'] - 1;
			k = entry.misc['G'];
			switch (k) {
			case 8:
				k = 'general<br/>use';
				break;
			case 9:
				k = 'name<br/>use';
				break;
			default:
				k = isNaN(k) ? '-' : ('grade<br/>' + k);
				break;
			}
			box = '<table class="k-abox-tb"><tr>' +
				'<td class="k-abox-r">radical<br/>' + this.radData[bn].charAt(0) + ' ' + (bn + 1) + '</td>' +
				'<td class="k-abox-g">' + k + '</td>' +
				'</tr><tr>' +
				'<td class="k-abox-f">freq<br/>' + (entry.misc['F'] ? entry.misc['F'] : '-') + '</td>' +
				'<td class="k-abox-s">strokes<br/>' + entry.misc['S'] + '</td>' +
				'</tr></table>';
			if (this.kanjiShown['COMP']) {
				k = this.radData[bn].split('\t');
				box += '<table class="k-bbox-tb">' +
						'<tr><td class="k-bbox-1a">' + k[0] + '</td>' +
						'<td class="k-bbox-1b">' + k[2] + '</td>' +
						'<td class="k-bbox-1b">' + k[3] + '</td></tr>';
				j = 1;
				for (i = 0; i < this.radData.length; ++i) {
					s = this.radData[i];
					if ((bn != i) && (s.indexOf(entry.kanji) != -1)) {
						k = s.split('\t');
						c = ' class="k-bbox-' + (j ^= 1);
						box += '<tr><td' + c + 'a">' + k[0] + '</td>' +
								'<td' + c + 'b">' + k[2] + '</td>' +
								'<td' + c + 'b">' + k[3] + '</td></tr>';
					}
				}
				box += '</table>';
			}

			nums = '';
			j = 0;

			for (i = 0; i < this.numList.length; i += 2) {
				c = this.numList[i];
				if (this.kanjiShown[c]) {
					s = entry.misc[c];
					c = ' class="k-mix-td' + (j ^= 1) + '"';
					nums += '<tr><td' + c + '>' + this.numList[i + 1] + '</td><td' + c + '>' + (s ? s : '-') + '</td></tr>';
				}
			}
			if (nums.length) nums = '<table class="k-mix-tb">' + nums + '</table>';

			b.push('<table class="k-main-tb"><tr><td valign="top">');
			b.push(box);
			b.push('<span class="k-kanji">' + entry.kanji + '</span><br/>');
			if (!ppjConfig.hidedef) b.push('<div class="k-eigo">' + entry.eigo + '</div>');
			b.push('<div class="k-yomi">' + yomi + '</div>');
			b.push('</td></tr><tr><td>' + nums + '</td></tr></table>');
			return b.join('');
		}

		s = t = '';

		if (entry.names) {
			c = [];

			b.push('<div class="w-title">Names Dictionary</div><table class="w-na-tb"><tr><td>');
			for (i = 0; i < entry.data.length; ++i) {
				e = entry.data[i][0].match(/^(.+?)\s+(?:\[(.*?)\])?\s*\/(.+)\//);
				if (!e) continue;

				if (s != e[3]) {
					c.push(t);
					t = '';
				}

				if (e[2]) {
					c.push('<span class="w-kanji" style="color:' + ppjConfig.ckanji + ';">' + e[1] + 
								 '</span> &#32; <span class="w-kana" style="color:' + ppjConfig.cyomi + ';">');
					if (ppjConfig.yomigana == "romaji")
						c.push(this.kanaToRomaji(e[2]) + '</span><br/> ');
					else if (ppjConfig.yomigana == "katakana") 
					 	c.push(this.hiraToKata(e[2])+ '</span><br/> ');
					else //hiragana
						c.push(e[2] + '</span><br/> ');
				} else {
					c.push('<span class="w-kana" style="color:' + ppjConfig.cyomi + ';">');
					 if (ppjConfig.yomigana == "romaji")
					 	c.push(this.kanaToRomaji(e[1]) + '</span><br/> ');
					 else if (ppjConfig.yomigana == "katakana") 
					 	c.push(this.hiraToKata(e[1])+ '</span><br/> ');
					 else //hiragana
					 	c.push(e[1] + '</span><br/> ');
				}

				s = e[3];
				if (ppjConfig.hidedef) t = '';
					else t = '<span class="w-def">' + s.replace(/\//g, '; ') + '</span><br/>';
			}
			c.push(t);
			if (c.length > 4) {
				n = (c.length >> 1) + 1;
				b.push(c.slice(0, n + 1).join(''));

				t = c[n];
				c = c.slice(n, c.length);
				for (i = 0; i < c.length; ++i) {
					if (c[i].indexOf('w-def') != -1) {
						if (t != c[i]) b.push(c[i]);
						if (i == 0) c.shift();
						break;
					}
				}

				b.push('</td><td>');
				b.push(c.join(''));
			}
			else {
				b.push(c.join(''));
			}
			if (entry.more) b.push('...<br/>');
			b.push('</td></tr></table>');
		}
		else {
			if (entry.title) {
				b.push('<div class="w-title">' + entry.title + '</div>');
			}

			var pK = '';
			var k;

			for (i = 0; i < entry.data.length; ++i) {
				e = entry.data[i][0].match(/^(.+?)\s+(?:\[(.*?)\])?\s*\/(.+)\//);
				if (!e) continue;

				/*
					e[1] = kanji/kana
					e[2] = kana
					e[3] = definition
				*/

				if (s != e[3]) {
					b.push(t);
					pK = k = '';
				}
				else {
					k = t.length ? '<br/>' : '';
				}

				if (e[2]) {
					if (pK == e[1]) {
						k = '\u3001 <span class="w-kana" style="color:' + ppjConfig.cyomi + ';">';
						if (ppjConfig.yomigana == "romaji")
							k += this.kanaToRomaji(e[2]) + '</span>';
						else if (ppjConfig.yomigana == "katakana") 
					 		k += this.hiraToKata(e[2]) + '</span>';
						else //hiragana
							k += e[2] + '</span>';
					} else {
						k += '<span class="w-kanji" style="color:' + ppjConfig.ckanji + ';">' + e[1] + 
								 '</span> &#32; <span class="w-kana" style="color:' + ppjConfig.cyomi + ';">';
						if (ppjConfig.yomigana == "romaji")
							k += this.kanaToRomaji(e[2]) + '</span>';
						else if (ppjConfig.yomigana == "katakana") 
					 		k += this.hiraToKata(e[2]) + '</span>';
						else //hiragana
							k += e[2] + '</span>';
					}
					pK = e[1];
				}
				else {
					k += '<span class="w-kana" style="color:' + ppjConfig.cyomi + ';">' + e[1] + '</span>';
					pK = '';
				}
				b.push(k);

				if (entry.data[i][1]) b.push(' <span class="w-conj">(' + entry.data[i][1] + ')</span>');

				s = e[3];
				if (ppjConfig.hidedef) {
					t = '<br/>';
				}
				else {
					t = s.replace(/\//g, '; ');
					if (!ppjConfig.wpos) t = t.replace(/^\([^)]+\)\s*/, '');
					if (!ppjConfig.wpop) t = t.replace('; (P)', '');
					t = '<br/><span class="w-def">' + t + '</span>';
				}
			}
			b.push(t);
			if (entry.more) b.push('...<br/>');
		}

		return b.join('');
	},

	makeText: function(entry, max) {
		var e;
		var b;
		var i, j;
		var t;

		if (entry == null) return '';
		if (!this.ready) this.init();

		b = [];

		if (entry.kanji) {
			b.push(entry.kanji + '\n');
			b.push((entry.eigo.length ? entry.eigo : '-') + '\n');

			b.push(entry.onkun.replace(/\.([^\u3001]+)/g, '\uFF08$1\uFF09') + '\n');
			if (entry.nanori.length) {
				b.push('\u540D\u4E57\u308A\t' + entry.nanori + '\n');
			}
			if (entry.bushumei.length) {
				b.push('\u90E8\u9996\u540D\t' + entry.bushumei + '\n');
			}

			for (i = 0; i < this.numList.length; i += 2) {
				e = this.numList[i];
				if (this.kanjiShown[e]) {
					j = entry.misc[e];
					b.push(this.numList[i + 1].replace('&amp;', '&') + '\t' + (j ? j : '-') + '\n');
				}
			}
		}
		else {
			if (max > entry.data.length) max = entry.data.length;
			for (i = 0; i < max; ++i) {
				e = entry.data[i][0].match(/^(.+?)\s+(?:\[(.*?)\])?\s*\/(.+)\//);
				if (!e) continue;
				
				var kana = "";
				if (e[2]) {
					b.push(e[1] + '\t');
					if (ppjConfig.yomigana == "romaji")
						kana = this.kanaToRomaji(e[2]);
					else if (ppjConfig.yomigana == "katakana")
					 	kana = this.hiraToKata(e[2]); 
					else //hiragana
					 	kana = e[2];
					b.push(kana);
				} else {
					if (ppjConfig.yomigana == "romaji")
						kana = this.kanaToRomaji(e[1]);
					else if (ppjConfig.yomigana == "katakana")
					 	kana = this.hiraToKata(e[1]); 
					else //hiragana
					 	kana = e[1];
					b.push(kana);
				}

				t = e[3].replace(/\//g, '; ');
				if (!ppjConfig.wpos) t = t.replace(/^\([^)]+\)\s*/, '');
				if (!ppjConfig.wpop) t = t.replace('; (P)', '');
				b.push('\t' + t + '\n');
			}
		}
		return b.join('');
	},

	// ---

	find: function(data, text) {
		const tlen = text.length;
		var beg = 0;
		var end = data.length - 1;
		var i;
		var mi;
		var mis;

		while (beg < end) {
			mi = (beg + end) >> 1;
			i = data.lastIndexOf('\n', mi) + 1;

			mis = data.substr(i, tlen);
			if (text < mis) end = i - 1;
				else if (text > mis) beg = data.indexOf('\n', mi + 1) + 1;
					else return data.substring(i, data.indexOf('\n', mi + 1));
		}
		return null;
	},
	
	hiraToKata: function(hira) {
		var i, u;
		var kata = "";
		for (i = 0; i < hira.length; i++) {
			u = hira.charCodeAt(i);
			u += 0x60;
			kata += String.fromCharCode(u);
		}
		return kata;
	},
	
	kanaToRomaji: function(kana) {
		var hash = new Object();
		maxlen = 0;
		for (i = 0; i < this.romajitable.length; i++) {
			hash[this.romajitable[i][0]] = this.romajitable[i][1];
		  	if (maxlen < this.romajitable[i][0].length) 
		    	maxlen = this.romajitable[i][0].length;
		}
		
	    var romaji = "";
	    var pos = 0;
	    while (pos < kana.length) {
  	    	len = maxlen;
	      	if (kana.length - pos < len) {
	      		len = kana.length - pos;
	   		}
	    	var found = false;
	    	while (len > 0 && !found) {
		      	if (hash[kana.substring(pos, pos + len)] != null) {
			        romaji += hash[kana.substring(pos, pos + len)];
			        pos += len;
			        found = true;
		      	}
		      	len--;
	    	}
	    	if (!found) {
	      		romaji += kana.charAt(pos);
	      		pos++;
	    	}
	    }
	  	return romaji;
	},
	
	romajitable: new Array(
		new Array("ぁ", "xa"),new Array("あ", "a"),new Array("ああ", "aa"),new Array("ぃ", "xi"),new Array("い", "i"),new Array("いぃ", "yi"),new Array("いぃい", "yii"),new Array("いい", "ii"),new Array("いぇ", "ye"),new Array("いぇえ", "yee"),
		new Array("ぅ", "xu"),new Array("う", "u"),new Array("うぁ", "w'a"),new Array("うぁあ", "w'aa"),new Array("うぃ", "w'i"),new Array("うぃい", "w'ii"),new Array("うぅ", "w'u"),new Array("うぅう", "w'uu"),new Array("うう", "uu"),new Array("うぇ", "w'e"),
		new Array("うぇえ", "w'ee"),new Array("うぉ", "w'o"),new Array("うぉう", "w'ou"),new Array("うぉお", "w'oo"),new Array("ぇ", "xe"),new Array("え", "e"),new Array("ええ", "ee"),new Array("ぉ", "xo"),new Array("お", "o"),new Array("おう", "ou"),
		new Array("おお", "oo"),new Array("か", "ka"),new Array("かあ", "kaa"),new Array("が", "ga"),new Array("があ", "gaa"),new Array("き", "ki"),new Array("きぃ", "kyi"),new Array("きぃい", "kyii"),new Array("きい", "kii"),new Array("きぇ", "kye"),
		new Array("きぇえ", "kyee"),new Array("きゃ", "kya"),new Array("きゃあ", "kyaa"),new Array("きゅ", "kyu"),new Array("きゅう", "kyuu"),new Array("きょ", "kyo"),new Array("きょう", "kyou"),new Array("きょお", "kyoo"),new Array("ぎ", "gi"),new Array("ぎぃ", "gyi"),
		new Array("ぎぃい", "gyii"),new Array("ぎい", "gii"),new Array("ぎぇ", "gye"),new Array("ぎぇえ", "gyee"),new Array("ぎゃ", "gya"),new Array("ぎゃあ", "gyaa"),new Array("ぎゅ", "gyu"),new Array("ぎゅう", "gyuu"),new Array("ぎょ", "gyo"),new Array("ぎょう", "gyou"),
		new Array("ぎょお", "gyoo"),new Array("く", "ku"),new Array("くぁ", "kwa"),new Array("くぁあ", "kwaa"),new Array("くぃ", "kwi"),new Array("くぃい", "kwii"),new Array("くぅ", "kwu"),new Array("くぅう", "kwuu"),new Array("くう", "kuu"),new Array("くぇ", "kwe"),
		new Array("くぇえ", "kwee"),new Array("くぉ", "kwo"),new Array("くぉう", "kwou"),new Array("くぉお", "kwoo"),new Array("ぐ", "gu"),new Array("ぐぁ", "gwa"),new Array("ぐぁあ", "gwaa"),new Array("ぐぃ", "gwi"),new Array("ぐぃい", "gwii"),new Array("ぐぅ", "gwu"),
		new Array("ぐぅう", "gwuu"),new Array("ぐう", "guu"),new Array("ぐぇ", "gwe"),new Array("ぐぇえ", "gwee"),new Array("ぐぉ", "gwo"),new Array("ぐぉう", "gwou"),new Array("ぐぉお", "gwoo"),new Array("け", "ke"),new Array("けえ", "kee"),new Array("げ", "ge"),
		new Array("げえ", "gee"),new Array("こ", "ko"),new Array("こう", "kou"),new Array("こお", "koo"),new Array("ご", "go"),new Array("ごう", "gou"),new Array("ごお", "goo"),new Array("さ", "sa"),new Array("さあ", "saa"),new Array("ざ", "za"),
		new Array("ざあ", "zaa"),new Array("し", "shi"),new Array("しい", "shii"),new Array("しぇ", "she"),new Array("しぇえ", "shee"),new Array("しゃ", "sha"),new Array("しゃあ", "shaa"),new Array("しゅ", "shu"),new Array("しゅう", "shuu"),new Array("しょ", "sho"),
		new Array("しょう", "shou"),new Array("しょお", "shoo"),new Array("じ", "ji"),new Array("じぃ", "jyi"),new Array("じぃい", "jyii"),new Array("じい", "jii"),new Array("じぇ", "je"),new Array("じぇえ", "jee"),new Array("じゃ", "ja"),new Array("じゃあ", "jaa"),
		new Array("じゅ", "ju"),new Array("じゅう", "juu"),new Array("じょ", "jo"),new Array("じょう", "jou"),new Array("じょお", "joo"),new Array("す", "su"),new Array("すぁ", "s'a"),new Array("すぁあ", "s'aa"),new Array("すぃ", "s'i"),new Array("すぃい", "s'ii"),
		new Array("すぅ", "s'u"),new Array("すぅう", "s'uu"),new Array("すう", "suu"),new Array("すぇ", "s'e"),new Array("すぇえ", "s'ee"),new Array("すぉ", "s'o"),new Array("すぉう", "s'ou"),new Array("すぉお", "s'oo"),new Array("ず", "zu"),new Array("ずう", "zuu"),
		new Array("せ", "se"),new Array("せえ", "see"),new Array("ぜ", "ze"),new Array("ぜえ", "zee"),new Array("そ", "so"),new Array("そう", "sou"),new Array("そお", "soo"),new Array("ぞ", "zo"),new Array("ぞう", "zou"),new Array("ぞお", "zoo"),
		new Array("た", "ta"),new Array("たあ", "taa"),new Array("だ", "da"),new Array("だあ", "daa"),new Array("ち", "chi"),new Array("ちい", "chii"),new Array("ちぇ", "che"),new Array("ちぇえ", "chee"),new Array("ちゃ", "cha"),new Array("ちゃあ", "chaa"),
		new Array("ちゅ", "chu"),new Array("ちゅう", "chuu"),new Array("ちょ", "cho"),new Array("ちょう", "chou"),new Array("ちょお", "choo"),new Array("ぢ", "dji"),new Array("ぢい", "djii"),new Array("ぢぇ", "dje"),new Array("ぢぇえ", "djee"),new Array("ぢゃ", "dja"),
		new Array("ぢゃあ", "djaa"),new Array("ぢゅ", "dju"),new Array("ぢゅう", "djuu"),new Array("ぢょ", "djo"),new Array("ぢょう", "djou"),new Array("ぢょお", "djoo"),new Array("っ", "xtsu"),new Array("っいぃ", "yyi"),new Array("っいぃい", "yyii"),new Array("っいぇ", "yye"),
		new Array("っいぇえ", "yyee"),new Array("っうぁ", "ww'a"),new Array("っうぁあ", "ww'aa"),new Array("っうぃ", "ww'i"),new Array("っうぃい", "ww'ii"),new Array("っうぅ", "ww'u"),new Array("っうぅう", "ww'uu"),new Array("っうぇ", "ww'e"),new Array("っうぇえ", "ww'ee"),new Array("っうぉ", "ww'o"),
		new Array("っうぉう", "ww'ou"),new Array("っうぉお", "ww'oo"),new Array("っか", "kka"),new Array("っかあ", "kkaa"),new Array("っが", "gga"),new Array("っがあ", "ggaa"),new Array("っき", "kki"),new Array("っきぃ", "kkyi"),new Array("っきぃい", "kkyii"),new Array("っきい", "kkii"),
		new Array("っきぇ", "kkye"),new Array("っきぇえ", "kkyee"),new Array("っきさ", "xx'a"),new Array("っきさあ", "xx'aa"),new Array("っきし", "xx'i"),new Array("っきしい", "xx'ii"),new Array("っきす", "xx'u"),new Array("っきすう", "xx'uu"),new Array("っきせ", "xx'e"),new Array("っきせえ", "xx'ee"),
		new Array("っきそ", "xx'o"),new Array("っきそう", "xx'ou"),new Array("っきそお", "xx'oo"),new Array("っきゃ", "kkya"),new Array("っきゃあ", "kkyaa"),new Array("っきゅ", "kkyu"),new Array("っきゅう", "kkyuu"),new Array("っきょ", "kkyo"),new Array("っきょう", "kkyou"),new Array("っきょお", "kkyoo"),
		new Array("っぎ", "ggi"),new Array("っぎぃ", "ggyi"),new Array("っぎぃい", "ggyii"),new Array("っぎい", "ggii"),new Array("っぎぇ", "ggye"),new Array("っぎぇえ", "ggyee"),new Array("っぎゃ", "ggya"),new Array("っぎゃあ", "ggyaa"),new Array("っぎゅ", "ggyu"),new Array("っぎゅう", "ggyuu"),
		new Array("っぎょ", "ggyo"),new Array("っぎょう", "ggyou"),new Array("っぎょお", "ggyoo"),new Array("っく", "kku"),new Array("っくぁ", "kkwa"),new Array("っくぁあ", "kkwaa"),new Array("っくぃ", "kkwi"),new Array("っくぃい", "kkwii"),new Array("っくぅ", "kkwu"),new Array("っくぅう", "kkwuu"),
		new Array("っくう", "kkuu"),new Array("っくぇ", "kkwe"),new Array("っくぇえ", "kkwee"),new Array("っくぉ", "kkwo"),new Array("っくぉう", "kkwou"),new Array("っくぉお", "kkwoo"),new Array("っぐ", "ggu"),new Array("っぐぁ", "ggwa"),new Array("っぐぁあ", "ggwaa"),new Array("っぐぃ", "ggwi"),
		new Array("っぐぃい", "ggwii"),new Array("っぐぅ", "ggwu"),new Array("っぐぅう", "ggwuu"),new Array("っぐう", "gguu"),new Array("っぐぇ", "ggwe"),new Array("っぐぇえ", "ggwee"),new Array("っぐぉ", "ggwo"),new Array("っぐぉう", "ggwou"),new Array("っぐぉお", "ggwoo"),new Array("っけ", "kke"),
		new Array("っけえ", "kkee"),new Array("っげ", "gge"),new Array("っげえ", "ggee"),new Array("っこ", "kko"),new Array("っこう", "kkou"),new Array("っこお", "kkoo"),new Array("っご", "ggo"),new Array("っごう", "ggou"),new Array("っごお", "ggoo"),new Array("っさ", "ssa"),
		new Array("っさあ", "ssaa"),new Array("っざ", "zza"),new Array("っざあ", "zzaa"),new Array("っし", "sshi"),new Array("っしい", "sshii"),new Array("っしぇ", "sshe"),new Array("っしぇえ", "sshee"),new Array("っしゃ", "ssha"),new Array("っしゃあ", "sshaa"),new Array("っしゅ", "sshu"),
		new Array("っしゅう", "sshuu"),new Array("っしょ", "ssho"),new Array("っしょう", "sshou"),new Array("っじ", "jji"),new Array("っじぃ", "jjyi"),new Array("っじぃい", "jjyii"),new Array("っじい", "jjii"),new Array("っじぇ", "jje"),new Array("っじぇえ", "jjee"),new Array("っじゃ", "jja"),
		new Array("っじゃあ", "jjaa"),new Array("っじゅ", "jju"),new Array("っじゅう", "jjuu"),new Array("っじょ", "jjo"),new Array("っじょう", "jjou"),new Array("っじょお", "jjoo"),new Array("っす", "ssu"),new Array("っすぁ", "ss'a"),new Array("っすぁあ", "ss'aa"),new Array("っすぃ", "ss'i"),
		new Array("っすぃい", "ss'ii"),new Array("っすぅ", "ss'u"),new Array("っすぅう", "ss'uu"),new Array("っすう", "ssuu"),new Array("っすぇ", "ss'e"),new Array("っすぇえ", "ss'ee"),new Array("っすぉ", "ss'o"),new Array("っすぉう", "ss'ou"),new Array("っすぉお", "ss'oo"),new Array("っず", "zzu"),
		new Array("っずう", "zzuu"),new Array("っせ", "sse"),new Array("っせえ", "ssee"),new Array("っぜ", "zze"),new Array("っぜえ", "zzee"),new Array("っそ", "sso"),new Array("っそう", "ssou"),new Array("っそお", "ssoo"),new Array("っぞ", "zzo"),new Array("っぞう", "zzou"),
		new Array("っぞお", "zzoo"),new Array("った", "tta"),new Array("ったあ", "ttaa"),new Array("っだ", "dda"),new Array("っだあ", "ddaa"),new Array("っち", "cchi"),new Array("っちい", "cchii"),new Array("っちぇ", "cche"),new Array("っちぇえ", "cchee"),new Array("っちゃ", "ccha"),
		new Array("っちゃあ", "cchaa"),new Array("っちゅ", "cchu"),new Array("っちゅう", "cchuu"),new Array("っちょ", "ccho"),new Array("っちょう", "cchou"),new Array("っちょお", "cchoo"),new Array("っぢ", "ddji"),new Array("っぢい", "ddjii"),new Array("っぢぇ", "ddje"),new Array("っぢぇえ", "ddjee"),
		new Array("っぢゃ", "ddja"),new Array("っぢゃあ", "ddjaa"),new Array("っぢゅ", "ddju"),new Array("っぢゅう", "ddjuu"),new Array("っぢょ", "ddjo"),new Array("っぢょう", "ddjou"),new Array("っぢょお", "ddjoo"),new Array("っつ", "ttsu"),new Array("っつぁ", "ttsa"),new Array("っつぁあ", "ttsaa"),
		new Array("っつぃ", "ttsi"),new Array("っつぃい", "ttsii"),new Array("っつう", "ttsuu"),new Array("っつぇ", "ttse"),new Array("っつぇえ", "ttsee"),new Array("っつぉ", "ttso"),new Array("っつぉう", "ttsou"),new Array("っつぉお", "ttsoo"),new Array("っづ", "ddzu"),new Array("って", "tte"),
		new Array("ってぃ", "tt'i"),new Array("ってぃい", "tt'ii"),new Array("ってえ", "ttee"),new Array("っで", "dde"),new Array("っでえ", "ddee"),new Array("っと", "tto"),new Array("っとぁ", "tt'a"),new Array("っとぁあ", "tt'aa"),new Array("っとぅ", "tt'u"),new Array("っとう", "ttou"),
		new Array("っとぇ", "tt'e"),new Array("っとぇえ", "tt'ee"),new Array("っとぉ", "tt'o"),new Array("っとぉう", "tt'ou"),new Array("っとぉお", "tt'oo"),new Array("っとお", "ttoo"),new Array("っど", "ddo"),new Array("っどう", "ddou"),new Array("っどお", "ddoo"),new Array("っは", "hha"),
		new Array("っはあ", "hhaa"),new Array("っば", "bba"),new Array("っばあ", "bbaa"),new Array("っぱ", "ppa"),new Array("っぱあ", "ppaa"),new Array("っひ", "hhi"),new Array("っひぃ", "hhyi"),new Array("っひぃい", "hhyii"),new Array("っひい", "hhii"),new Array("っひぇ", "hhye"),
		new Array("っひぇえ", "hhyee"),new Array("っひゃ", "hhya"),new Array("っひゃあ", "hhyaa"),new Array("っひゅ", "hhyu"),new Array("っひゅう", "hhyuu"),new Array("っひょ", "hhyo"),new Array("っひょう", "hhyou"),new Array("っひょお", "hhyoo"),new Array("っび", "bbi"),new Array("っびぃ", "bbyi"),
		new Array("っびぃい", "bbyii"),new Array("っびい", "bbii"),new Array("っびぇ", "bbye"),new Array("っびぇえ", "bbyee"),new Array("っびゃ", "bbya"),new Array("っびゃあ", "bbyaa"),new Array("っびゅ", "bbyu"),new Array("っびゅう", "bbyuu"),new Array("っびょ", "bbyo"),new Array("っびょう", "bbyou"),
		new Array("っびょお", "bbyoo"),new Array("っぴ", "ppi"),new Array("っぴぃ", "ppyi"),new Array("っぴぃい", "ppyii"),new Array("っぴい", "ppii"),new Array("っぴぇ", "ppye"),new Array("っぴぇえ", "ppyee"),new Array("っぴゃ", "ppya"),new Array("っぴゃあ", "ppyaa"),new Array("っぴゅ", "ppyu"),
		new Array("っぴゅう", "ppyuu"),new Array("っぴょ", "ppyo"),new Array("っぴょう", "ppyou"),new Array("っぴょお", "ppyoo"),new Array("っふ", "ffu"),new Array("っふぁ", "ffa"),new Array("っふぁあ", "ffaa"),new Array("っふぃ", "ffi"),new Array("っふぃい", "ffii"),new Array("っふう", "ffuu"),
		new Array("っふぇ", "ffe"),new Array("っふぇえ", "ffee"),new Array("っふぉ", "ffo"),new Array("っふぉう", "ffou"),new Array("っふぉお", "ffoo"),new Array("っふゃ", "ffya"),new Array("っふゃあ", "ffyaa"),new Array("っふゅ", "ffyu"),new Array("っふゅう", "ffyuu"),new Array("っふょ", "ffyo"),
		new Array("っふょう", "ffyou"),new Array("っふょお", "ffyoo"),new Array("っぶ", "bbu"),new Array("っぶう", "bbuu"),new Array("っぷ", "ppu"),new Array("っぷう", "ppuu"),new Array("っへ", "hhe"),new Array("っへえ", "hhee"),new Array("っべ", "bbe"),new Array("っべえ", "bbee"),
		new Array("っぺ", "ppe"),new Array("っぺえ", "ppee"),new Array("っほ", "hho"),new Array("っほう", "hhou"),new Array("っほお", "hhoo"),new Array("っぼ", "bbo"),new Array("っぼう", "bbou"),new Array("っぼお", "bboo"),new Array("っぽ", "ppo"),new Array("っぽう", "ppou"),
		new Array("っぽお", "ppoo"),new Array("っや", "yya"),new Array("っやあ", "yyaa"),new Array("っゆ", "yyu"),new Array("っゆう", "yyuu"),new Array("っよ", "yyo"),new Array("っよう", "yyou"),new Array("っよお", "yyoo"),new Array("っら", "rra"),new Array("っらあ", "rraa"),
		new Array("っり", "rri"),new Array("っりぃ", "rryi"),new Array("っりぃい", "rryii"),new Array("っりい", "rrii"),new Array("っりぇ", "rrye"),new Array("っりぇえ", "rryee"),new Array("っりゃ", "rrya"),new Array("っりゃあ", "rryaa"),new Array("っりゅ", "rryu"),new Array("っりゅう", "rryuu"),
		new Array("っりょ", "rryo"),new Array("っりょう", "rryou"),new Array("っりょお", "rryoo"),new Array("っる", "rru"),new Array("っるう", "rruu"),new Array("っれ", "rre"),new Array("っれえ", "rree"),new Array("っろ", "rro"),new Array("っろう", "rrou"),new Array("っろお", "rroo"),
		new Array("っわ", "wwa"),new Array("っわあ", "wwaa"),new Array("っゐ", "wwi"),new Array("っゐい", "wwii"),new Array("っゑ", "wwe"),new Array("っゑえ", "wwee"),new Array("っを", "wwo"),new Array("っをう", "wwou"),new Array("っをお", "wwoo"),new Array("っゔ", "vvu"),
		new Array("っゔぁ", "vva"),new Array("っゔぁあ", "vvaa"),new Array("っゔぃ", "vvi"),new Array("っゔぃい", "vvii"),new Array("っゔう", "vvuu"),new Array("っゔぇ", "vve"),new Array("っゔぇえ", "vvee"),new Array("っゔぉ", "vvo"),new Array("っゔぉう", "vvou"),new Array("っゔぉお", "vvoo"),
		new Array("つ", "tsu"),new Array("つぁ", "tsa"),new Array("つぁあ", "tsaa"),new Array("つぃ", "tsi"),new Array("つぃい", "tsii"),new Array("つう", "tsuu"),new Array("つぇ", "tse"),new Array("つぇえ", "tsee"),new Array("つぉ", "tso"),new Array("つぉう", "tsou"),
		new Array("つぉお", "tsoo"),new Array("づ", "dzu"),new Array("づう", "dzuu"),new Array("て", "te"),new Array("てぃ", "t'i"),new Array("てぃい", "t'ii"),new Array("てえ", "tee"),new Array("で", "de"),new Array("でぃ", "di"),new Array("でぃい", "dii"),
		new Array("でえ", "dee"),new Array("と", "to"),new Array("とぁ", "t'a"),new Array("とぁあ", "t'aa"),new Array("とぅ", "t'u"),new Array("とう", "tou"),new Array("とぇ", "t'e"),new Array("とぇえ", "t'ee"),new Array("とぉ", "t'o"),new Array("とぉう", "t'ou"),
		new Array("とぉお", "t'oo"),new Array("とお", "too"),new Array("ど", "do"),new Array("どぅ", "du"),new Array("どぅう", "duu"),new Array("どう", "dou"),new Array("どお", "doo"),new Array("な", "na"),new Array("なあ", "naa"),new Array("に", "ni"),
		new Array("にぃ", "nyi"),new Array("にぃい", "nyii"),new Array("にい", "nii"),new Array("にぇ", "nye"),new Array("にぇえ", "nyee"),new Array("にゃ", "nya"),new Array("にゃあ", "nyaa"),new Array("にゅ", "nyu"),new Array("にゅう", "nyuu"),new Array("にょ", "nyo"),
		new Array("にょう", "nyou"),new Array("にょお", "nyoo"),new Array("ぬ", "nu"),new Array("ぬう", "nuu"),new Array("ね", "ne"),new Array("ねえ", "nee"),new Array("の", "no"),new Array("のう", "nou"),new Array("のお", "noo"),new Array("は", "ha"),
		new Array("はあ", "haa"),new Array("ば", "ba"),new Array("ぱ", "pa"),new Array("ぱあ", "paa"),new Array("ひ", "hi"),new Array("ひぃ", "hyi"),new Array("ひぃい", "hyii"),new Array("ひい", "hii"),new Array("ひぇ", "hye"),new Array("ひぇえ", "hyee"),
		new Array("ひゃ", "hya"),new Array("ひゃあ", "hyaa"),new Array("ひゅ", "hyu"),new Array("ひゅう", "hyuu"),new Array("ひょ", "hyo"),new Array("ひょう", "hyou"),new Array("ひょお", "hyoo"),new Array("び", "bi"),new Array("びぃ", "byi"),new Array("びぃい", "byii"),
		new Array("びい", "bii"),new Array("びぇ", "bye"),new Array("びぇえ", "byee"),new Array("びゃ", "bya"),new Array("びゃあ", "byaa"),new Array("びゅ", "byu"),new Array("びゅう", "byuu"),new Array("びょ", "byo"),new Array("びょう", "byou"),new Array("びょお", "byoo"),
		new Array("ぴ", "pi"),new Array("ぴぃ", "pyi"),new Array("ぴぃい", "pyii"),new Array("ぴい", "pii"),new Array("ぴぇ", "pye"),new Array("ぴぇえ", "pyee"),new Array("ぴゃ", "pya"),new Array("ぴゃあ", "pyaa"),new Array("ぴゅ", "pyu"),new Array("ぴゅう", "pyuu"),
		new Array("ぴょ", "pyo"),new Array("ぴょう", "pyou"),new Array("ぴょお", "pyoo"),new Array("ふ", "fu"),new Array("ふぁ", "fa"),new Array("ふぁあ", "faa"),new Array("ふぃ", "fi"),new Array("ふぃい", "fii"),new Array("ふう", "fuu"),new Array("ふぇ", "fe"),
		new Array("ふぇえ", "fee"),new Array("ふぉ", "fo"),new Array("ふぉう", "fou"),new Array("ふぉお", "foo"),new Array("ふゃ", "fya"),new Array("ふゃあ", "fyaa"),new Array("ふゅ", "fyu"),new Array("ふゅう", "fyuu"),new Array("ふょ", "fyo"),new Array("ふょう", "fyou"),
		new Array("ふょお", "fyoo"),new Array("ぶ", "bu"),new Array("ぶう", "buu"),new Array("ぷ", "pu"),new Array("ぷう", "puu"),new Array("へ", "he"),new Array("へえ", "hee"),new Array("べ", "be"),new Array("べえ", "bee"),new Array("ぺ", "pe"),
		new Array("ぺえ", "pee"),new Array("ほ", "ho"),new Array("ほう", "hou"),new Array("ほお", "hoo"),new Array("ぼ", "bo"),new Array("ぼう", "bou"),new Array("ぼお", "boo"),new Array("ぽ", "po"),new Array("ぽう", "pou"),new Array("ぽお", "poo"),
		new Array("ま", "ma"),new Array("まあ", "maa"),new Array("み", "mi"),new Array("みぃ", "myi"),new Array("みぃい", "myii"),new Array("みい", "mii"),new Array("みぇ", "mye"),new Array("みぇえ", "myee"),new Array("みゃ", "mya"),new Array("みゃあ", "myaa"),
		new Array("みゅ", "myu"),new Array("みゅう", "myuu"),new Array("みょ", "myo"),new Array("みょう", "myou"),new Array("みょお", "myoo"),new Array("む", "mu"),new Array("むう", "muu"),new Array("め", "me"),new Array("めえ", "mee"),new Array("も", "mo"),
		new Array("もう", "mou"),new Array("もお", "moo"),new Array("ゃ", "xya"),new Array("や", "ya"),new Array("やあ", "yaa"),new Array("ゅ", "xyu"),new Array("ゆ", "yu"),new Array("ゆう", "yuu"),new Array("ょ", "xyo"),new Array("よ", "yo"),
		new Array("よう", "you"),new Array("よお", "yoo"),new Array("ら", "ra"),new Array("らあ", "raa"),new Array("り", "ri"),new Array("りぃ", "ryi"),new Array("りぃい", "ryii"),new Array("りい", "rii"),new Array("りぇ", "rye"),new Array("りぇえ", "ryee"),
		new Array("りゃ", "rya"),new Array("りゃあ", "ryaa"),new Array("りゅ", "ryu"),new Array("りゅう", "ryuu"),new Array("りょ", "ryo"),new Array("りょう", "ryou"),new Array("りょお", "ryoo"),new Array("る", "ru"),new Array("るう", "ruu"),new Array("れ", "re"),
		new Array("れえ", "ree"),new Array("ろ", "ro"),new Array("ろう", "rou"),new Array("ろお", "roo"),new Array("わ", "wa"),new Array("わあ", "waa"),new Array("ゐ", "wi"),new Array("ゐい", "wii"),new Array("ゑ", "we"),new Array("ゑえ", "wee"),
		new Array("を", "wo"),new Array("をう", "wou"),new Array("をお", "woo"),new Array("ん", "n"),new Array("んば", "mba"),new Array("んび", "mbi"),new Array("んびぃ", "mbyi"),new Array("んびぃい", "mbyii"),new Array("んびい", "mbii"),new Array("んびぇ", "mbye"),
		new Array("んびぇえ", "mbyee"),new Array("んびゃ", "mbya"),new Array("んびゃあ", "mbyaa"),new Array("んびゅ", "mbyu"),new Array("んびゅう", "mbyuu"),new Array("んびょ", "mbyo"),new Array("んびょう", "mbyou"),new Array("んびょお", "mbyoo"),new Array("んぶ", "mbu"),new Array("んぶう", "mbuu"),
		new Array("んべ", "mbe"),new Array("んべえ", "mbee"),new Array("んぼ", "mbo"),new Array("んぼう", "mbou"),new Array("んぼお", "mboo"),new Array("んま", "mma"),new Array("んまあ", "mmaa"),new Array("んみ", "mmi"),new Array("んみぃ", "mmyi"),new Array("んみぃい", "mmyii"),
		new Array("んみい", "mmii"),new Array("んみぇ", "mmye"),new Array("んみぇえ", "mmyee"),new Array("んみゃ", "mmya"),new Array("んみゃあ", "mmyaa"),new Array("んみゅ", "mmyu"),new Array("んみゅう", "mmyuu"),new Array("んみょ", "mmyo"),new Array("んみょう", "mmyou"),new Array("んみょお", "mmyoo"),
		new Array("んむ", "mmu"),new Array("んむう", "mmuu"),new Array("んめ", "mme"),new Array("んめえ", "mmee"),new Array("んも", "mmo"),new Array("んもう", "mmou"),new Array("んもお", "mmoo"),new Array("ゔ", "vu"),new Array("ゔぁ", "va"),new Array("ゔぁあ", "vaa"),
		new Array("ゔぃ", "vi"),new Array("ゔぃい", "vii"),new Array("ゔう", "vuu"),new Array("ゔぇ", "ve"),new Array("ゔぇえ", "vee"),new Array("ゔぉ", "vo"),new Array("ゔぉう", "vou"),new Array("ゔぉお", "voo"),new Array("ァ", "xa"),new Array("ア", "a"),
		new Array("ィ", "xi"),new Array("イ", "i"),new Array("イィ", "yi"),new Array("イイ", "ii"),new Array("イェ", "ye"),new Array("ゥ", "xu"),new Array("ウ", "u"),new Array("ウァ", "w'a"),new Array("ウィ", "w'i"),new Array("ウゥ", "w'u"),
		new Array("ウェ", "w'e"),new Array("ウォ", "w'o"),new Array("ェ", "xe"),new Array("エ", "e"),new Array("ォ", "xo"),new Array("オ", "o"),new Array("カ", "ka"),new Array("ガ", "ga"),new Array("キ", "ki"),new Array("キィ", "kyi"),
		new Array("キェ", "kye"),new Array("キャ", "kya"),new Array("キュ", "kyu"),new Array("キョ", "kyo"),new Array("ギ", "gi"),new Array("ギィ", "gyi"),new Array("ギェ", "gye"),new Array("ギャ", "gya"),new Array("ギュ", "gyu"),new Array("ギョ", "gyo"),
		new Array("ク", "ku"),new Array("クァ", "kwa"),new Array("クィ", "kwi"),new Array("クゥ", "kwu"),new Array("クェ", "kwe"),new Array("クォ", "kwo"),new Array("グ", "gu"),new Array("グァ", "gwa"),new Array("グィ", "gwi"),new Array("グゥ", "gwu"),
		new Array("グェ", "gwe"),new Array("グォ", "gwo"),new Array("ケ", "ke"),new Array("ゲ", "ge"),new Array("コ", "ko"),new Array("ゴ", "go"),new Array("サ", "sa"),new Array("ザ", "za"),new Array("シ", "shi"),new Array("シェ", "she"),
		new Array("シャ", "sha"),new Array("シュ", "shu"),new Array("ショ", "sho"),new Array("ジ", "ji"),new Array("ジィ", "jyi"),new Array("ジェ", "je"),new Array("ジャ", "ja"),new Array("ジュ", "ju"),new Array("ジョ", "jo"),new Array("ス", "su"),
		new Array("スァ", "s'a"),new Array("スィ", "s'i"),new Array("スゥ", "s'u"),new Array("スェ", "s'e"),new Array("スォ", "s'o"),new Array("ズ", "zu"),new Array("セ", "se"),new Array("ゼ", "ze"),new Array("ソ", "so"),new Array("ゾ", "zo"),
		new Array("タ", "ta"),new Array("ダ", "da"),new Array("チ", "chi"),new Array("チェ", "che"),new Array("チェエ", "chee"),new Array("チャ", "cha"),new Array("チュ", "chu"),new Array("チョ", "cho"),new Array("ヂ", "dji"),new Array("ヂェ", "dje"),
		new Array("ヂャ", "dja"),new Array("ヂャア", "djaa"),new Array("ヂュ", "dju"),new Array("ヂョ", "djo"),new Array("ッ", "xtsu"),new Array("ッイィ", "yyi"),new Array("ッイェ", "yye"),new Array("ッウァ", "ww'a"),new Array("ッウィ", "ww'i"),new Array("ッウゥ", "ww'u"),
		new Array("ッウェ", "ww'e"),new Array("ッウォ", "ww'o"),new Array("ッカ", "kka"),new Array("ッガ", "gga"),new Array("ッキ", "kki"),new Array("ッキィ", "kkyi"),new Array("ッキェ", "kkye"),new Array("ッキャ", "kkya"),new Array("ッキュ", "kkyu"),new Array("ッキョ", "kkyo"),
		new Array("ッギ", "ggi"),new Array("ッギィ", "ggyi"),new Array("ッギェ", "ggye"),new Array("ッギャ", "ggya"),new Array("ッギュ", "ggyu"),new Array("ッギョ", "ggyo"),new Array("ック", "kku"),new Array("ックァ", "kkwa"),new Array("ックィ", "kkwi"),new Array("ックゥ", "kkwu"),
		new Array("ックェ", "kkwe"),new Array("ックォ", "kkwo"),new Array("ッグ", "ggu"),new Array("ッグァ", "ggwa"),new Array("ッグィ", "ggwi"),new Array("ッグゥ", "ggwu"),new Array("ッグェ", "ggwe"),new Array("ッグォ", "ggwo"),new Array("ッケ", "kke"),new Array("ッゲ", "gge"),
		new Array("ッコ", "kko"),new Array("ッゴ", "ggo"),new Array("ッサ", "ssa"),new Array("ッザ", "zza"),new Array("ッシ", "sshi"),new Array("ッシェ", "sshe"),new Array("ッシャ", "ssha"),new Array("ッシュ", "sshu"),new Array("ッショ", "ssho"),new Array("ッジ", "jji"),
		new Array("ッジィ", "jjyi"),new Array("ッジェ", "jje"),new Array("ッジャ", "jja"),new Array("ッジュ", "jju"),new Array("ッジョ", "jjo"),new Array("ッス", "ssu"),new Array("ッスぃ", "ss'i"),new Array("ッスァ", "ss'a"),new Array("ッスゥ", "ss'u"),new Array("ッスェ", "ss'e"),
		new Array("ッスォ", "ss'o"),new Array("ッズ", "zzu"),new Array("ッセ", "sse"),new Array("ッゼ", "zze"),new Array("ッソ", "sso"),new Array("ッゾ", "zzo"),new Array("ッタ", "tta"),new Array("ッダ", "dda"),new Array("ッチ", "cchi"),new Array("ッチェ", "cche"),
		new Array("ッチェエ", "cchee"),new Array("ッチャ", "ccha"),new Array("ッチュ", "cchu"),new Array("ッチョ", "ccho"),new Array("ッヂ", "ddji"),new Array("ッヂェ", "ddje"),new Array("ッヂャ", "ddja"),new Array("ッヂュ", "ddju"),new Array("ッヂョ", "ddjo"),new Array("ッツ", "ttsu"),
		new Array("ッツァ", "ttsa"),new Array("ッツィ", "ttsi"),new Array("ッツェ", "ttse"),new Array("ッツォ", "ttso"),new Array("ッヅ", "ddzu"),new Array("ッテ", "tte"),new Array("ッティ", "tt'i"),new Array("ッデ", "dde"),new Array("ット", "tto"),new Array("ットァ", "tt'a"),
		new Array("ットゥ", "tt'u"),new Array("ットェ", "tt'e"),new Array("ットォ", "tt'o"),new Array("ッド", "ddo"),new Array("ッハ", "hha"),new Array("ッバ", "bba"),new Array("ッパ", "ppa"),new Array("ッヒ", "hhi"),new Array("ッヒィ", "hhyi"),new Array("ッヒェ", "hhye"),
		new Array("ッヒャ", "hhya"),new Array("ッヒュ", "hhyu"),new Array("ッヒョ", "hhyo"),new Array("ッビ", "bbi"),new Array("ッビィ", "bbyi"),new Array("ッビェ", "bbye"),new Array("ッビャ", "bbya"),new Array("ッビュ", "bbyu"),new Array("ッビョ", "bbyo"),new Array("ッピ", "ppi"),
		new Array("ッピィ", "ppyi"),new Array("ッピェ", "ppye"),new Array("ッピャ", "ppya"),new Array("ッピュ", "ppyu"),new Array("ッピョ", "ppyo"),new Array("ッフ", "ffu"),new Array("ッファ", "ffa"),new Array("ッフィ", "ffi"),new Array("ッフェ", "ffe"),new Array("ッフォ", "ffo"),
		new Array("ッフャ", "ffya"),new Array("ッフュ", "ffyu"),new Array("ッフョ", "ffyo"),new Array("ッブ", "bbu"),new Array("ップ", "ppu"),new Array("ッヘ", "hhe"),new Array("ッベ", "bbe"),new Array("ッペ", "ppe"),new Array("ッホ", "hho"),new Array("ッボ", "bbo"),
		new Array("ッポ", "ppo"),new Array("ッヤ", "yya"),new Array("ッユ", "yyu"),new Array("ッヨ", "yyo"),new Array("ッラ", "rra"),new Array("ッリ", "rri"),new Array("ッリィ", "rryi"),new Array("ッリェ", "rrye"),new Array("ッリャ", "rrya"),new Array("ッリュ", "rryu"),
		new Array("ッリョ", "rryo"),new Array("ッル", "rru"),new Array("ッレ", "rre"),new Array("ッロ", "rro"),new Array("ッワ", "wwa"),new Array("ッヰ", "wwi"),new Array("ッヱ", "wwe"),new Array("ッヲ", "wwo"),new Array("ッヴ", "vvu"),new Array("ッヴァ", "vva"),
		new Array("ッヴィ", "vvi"),new Array("ッヴェ", "vve"),new Array("ッヴォ", "vvo"),new Array("ツ", "tsu"),new Array("ツァ", "tsa"),new Array("ツィ", "tsi"),new Array("ツェ", "tse"),new Array("ツォ", "tso"),new Array("ヅ", "dzu"),new Array("テ", "te"),
		new Array("ティ", "t'i"),new Array("デ", "de"),new Array("ディ", "di"),new Array("ト", "to"),new Array("トァ", "t'a"),new Array("トゥ", "t'u"),new Array("トェ", "t'e"),new Array("トォ", "t'o"),new Array("ド", "do"),new Array("ドゥ", "du"),
		new Array("ナ", "na"),new Array("ニ", "ni"),new Array("ニィ", "nyi"),new Array("ニェ", "nye"),new Array("ニャ", "nya"),new Array("ニュ", "nyu"),new Array("ニョ", "nyo"),new Array("ヌ", "nu"),new Array("ネ", "ne"),new Array("ノ", "no"),
		new Array("ハ", "ha"),new Array("バ", "ba"),new Array("パ", "pa"),new Array("ヒ", "hi"),new Array("ヒィ", "hyi"),new Array("ヒェ", "hye"),new Array("ヒャ", "hya"),new Array("ヒュ", "hyu"),new Array("ヒョ", "hyo"),new Array("ビ", "bi"),
		new Array("ビィ", "byi"),new Array("ビェ", "bye"),new Array("ビャ", "bya"),new Array("ビュ", "byu"),new Array("ビョ", "byo"),new Array("ピ", "pi"),new Array("ピィ", "pyi"),new Array("ピェ", "pye"),new Array("ピャ", "pya"),new Array("ピュ", "pyu"),
		new Array("ピョ", "pyo"),new Array("フ", "fu"),new Array("ファ", "fa"),new Array("フィ", "fi"),new Array("フェ", "fe"),new Array("フォ", "fo"),new Array("フャ", "fya"),new Array("フュ", "fyu"),new Array("フョ", "fyo"),new Array("ブ", "bu"),
		new Array("プ", "pu"),new Array("ヘ", "he"),new Array("ベ", "be"),new Array("ペ", "pe"),new Array("ホ", "ho"),new Array("ボ", "bo"),new Array("ポ", "po"),new Array("マ", "ma"),new Array("ミ", "mi"),new Array("ミィ", "myi"),
		new Array("ミェ", "mye"),new Array("ミャ", "mya"),new Array("ミュ", "myu"),new Array("ミョ", "myo"),new Array("ム", "mu"),new Array("メ", "me"),new Array("モ", "mo"),new Array("ャ", "xya"),new Array("ヤ", "ya"),new Array("ュ", "xyu"),
		new Array("ユ", "yu"),new Array("ョ", "xyo"),new Array("ヨ", "yo"),new Array("ラ", "ra"),new Array("リ", "ri"),new Array("リィ", "ryi"),new Array("リェ", "rye"),new Array("リャ", "rya"),new Array("リュ", "ryu"),new Array("リョ", "ryo"),
		new Array("ル", "ru"),new Array("レ", "re"),new Array("ロ", "ro"),new Array("ワ", "wa"),new Array("ヰ", "wi"),new Array("ヱ", "we"),new Array("ヲ", "wo"),new Array("ン", "n"),new Array("ンバ", "mba"),new Array("ンビ", "mbi"),
		new Array("ンビィ", "mbyi"),new Array("ンビェ", "mbye"),new Array("ンビャ", "mbya"),new Array("ンビュ", "mbyu"),new Array("ンビョ", "mbyo"),new Array("ンブ", "mbu"),new Array("ンベ", "mbe"),new Array("ンボ", "mbo"),new Array("ンマ", "mma"),new Array("ンミ", "mmi"),
		new Array("ンミィ", "mmyi"),new Array("ンミェ", "mmye"),new Array("ンミャ", "mmya"),new Array("ンミュ", "mmyu"),new Array("ンミョ", "mmyo"),new Array("ンム", "mmu"),new Array("ンメ", "mme"),new Array("ンモ", "mmo"),new Array("ヴ", "vu"),new Array("ヴァ", "va"),
		new Array("ヴィ", "vi"),new Array("ヴェ", "ve"),new Array("ヴォ", "vo"),new Array("ヵ", "xka"),new Array("ヶ", "xke"),new Array("ー", "")
	)

};

var ppjFile = {
	read: function(uri) {
		var inp = Components.classes['@mozilla.org/network/io-service;1']
				.getService(Components.interfaces.nsIIOService)
				.newChannel(uri, null, null)
				.open();

		var is = Components.classes['@mozilla.org/intl/converter-input-stream;1']
					.createInstance(Components.interfaces.nsIConverterInputStream);
		is.init(inp, 'UTF-8', 4 * 1024 * 1024,
			Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

		var buffer = '';
		var s = {};
		while (is.readString(-1, s) > 0) {
			buffer += s.value;
		}
		is.close();

		return buffer;
	},

	readArray: function(name) {
		var a = this.read(name).split('\n');
		while ((a.length > 0) && (a[a.length - 1].length == 0)) a.pop();
		return a;
	}
};

function RcxDb(name)
{
	this.open = function() {
		var f;

		if (name.match(/(.+)\|(.+)/)) {
			let id = RegExp.$1;
			let nm = RegExp.$2;
			if (id === "peraperakun-names@gmail.com") {
				id = "peraperakun@gmail.com"
				nm = "names.sqlite"
			}

			try {
				f = Components.classes['@mozilla.org/extensions/manager;1']
					.getService(Components.interfaces.nsIExtensionManager)
					.getInstallLocation(id).getItemFile(id, nm);
			}
			catch (ex) {
				if ((ppjData.dicPath) && (ppjData.dicPath[id])) {
					f = Components.classes['@mozilla.org/file/local;1']
						.createInstance(Components.interfaces.nsILocalFile);
					f.initWithPath(ppjData.dicPath[id]);
					f.append(nm);
				}

				if (!f) throw 'Could not find or open ' + id + '/' + nm;

/*
				if (!f) {
					f = Components.classes['@mozilla.org/file/directory_service;1']
						.getService(Components.interfaces.nsIProperties)
						.get('ProfD', Components.interfaces.nsIFile);
					f.append('extensions');
					f.append(id);
					f.append(nm);
					if (!f.exists()) {
						f = Components.classes['@mozilla.org/file/directory_service;1']
							.getService(Components.interfaces.nsIProperties)
							.get('APlugns', Components.interfaces.nsIFile).parent;
						f.append('extensions');
						f.append(id);
						f.append(nm);
					}
				}
*/
			}
		}
		else {
			f = Components.classes['@mozilla.org/file/local;1']
				.createInstance(Components.interfaces.nsILocalFile);
			f.initWithPath(name);
		}

		// The files may get installed as read-only, breaking
		// index creation. Try changing the file permission.
		if (!f.isWritable()) f.permissions |= 0600;

		this.db = Components.classes['@mozilla.org/storage/service;1']
			.getService(Components.interfaces.mozIStorageService)
			.openDatabase(f);
	};

	this.close = function() {
		if (this.db) {
			try {
				this.db.close();
			}
			catch (ex) {
			}
			this.db = null;
		}
	};

	this.exec = function(stm) {
		var rows = [];
		if (!this.db) this.open();
		var st = this.db.createStatement(stm);
		for (var i = arguments.length - 1; i > 0; --i) {
			if (arguments[i] != null) st.bindUTF8StringParameter(i - 1, arguments[i]);
		}
		while (st.executeStep()) {
			var r = [];
			for (var i = st.columnCount - 1; i >= 0; --i) {
				r[st.getColumnName(i)] = st.getUTF8String(i);
			}
			rows.push(r);
		}
		return rows;
	};

	this.indexExists = function(index) {
		if (!this.db) this.open();
		return this.db.indexExists(index);
	};

	this.beginTransaction = function() {
		if (!this.db) this.open();
		this.db.beginTransaction();
	};

	this.commitTransaction = function() {
		this.db.commitTransaction();
	};

	this.rollbackTransaction = function() {
		this.db.rollbackTransaction();
	};

	return this;
}

function RcxDic(dic)
{
	this.name = dic.name;
	this.version = dic.version;
	this.id = dic.id;
	this.hasType = dic.hasType;
	this.isName = dic.isName;

	this.open = function() {
		try {
			if (this.rdb) return;

			this.rdb = new RcxDb(this.id + '|dict.sqlite');
			this.rdb.open();
			this.checkIndex('kanji');
			this.checkIndex('kana');
		}
		catch (ex) {
			this.close();
			throw ex;
		}
	};

	this.close = function() {
		if (this.rdb) {
			try {
				this.rdb.close();
			}
			catch (ex) {
			}
			this.rdb = null;
		}
	};

	this.checkIndex = function(name) {
		var ix = 'ix_' + name;
		if (this.rdb.indexExists(ix)) return;

		if (!ppjData.indexCreateNotice) {
			alert('A dictionary index needs to be created. This may take a while on some systems. Click OK to start.');
			ppjData.indexCreateNotice = true;
		}

		this.rdb.exec('CREATE INDEX ' + ix + ' ON dict (' + name + ' ASC)');
	};

	this.find = function(query, arg1) {
		if (!this.rdb) this.open();
		var r = this.rdb.exec(query, arg1);
		var entries = [];
		for (var i = 0; i < r.length; ++i) {
			var x = r[i];
			if (!x.entry.length) continue;
			// ppj currently expects an edict-like format
			if (x.entry[x.entry.length - 1] == '/') entries.push(x.entry);
				else entries.push((x.kanji ? (x.kanji + ' [' + x.kana + ']') : x.kana) + ' /' + x.entry + '/');
		}
		return entries;
	};

	this.findWord = function(word) {
		return this.find('SELECT * FROM dict WHERE kanji=?1 OR kana=?1 LIMIT 100', word);
	};

	this.findText = function(text) {
		return this.find('SELECT * FROM dict WHERE entry LIKE ?1 LIMIT 300', '%' + text + '%');
	};

	return this;
};
