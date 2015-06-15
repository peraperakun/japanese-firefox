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

// 0 = integer, 1 = string, 2 = checkbox/boolean 3 =colorpicker
var ppjConfigList = [
	[3, 'ckanji'],
	[3, 'cyomi'],
	[1, 'yomigana'],
	// general
	[1, 'flag'],
	[1, 'css'],
	[0, 'enmode'],
	[2, 'highlight'],
	[2, 'title'],
	[2, 'selinlb'],
	[2, 'bottomlb'],
	[2, 'resizedoc'],
	[2, 'sticon'],
	[2, 'minihelp'],

	// menus
	[2, 'tmtoggle'],
	[2, 'tmlbar'],
	[2, 'cmtoggle'],
	[2, 'cmlbar'],

	// keyboard
	[2, 'nopopkeys'],

	// dictionary
	[2, 'wpos'],					// ! this was an integer in 1.xx: 0=hide, 1=show entry type
	[2, 'wpop'],
	[0, 'wmax'],
	[0, 'namax'],
	[2, 'hidex'],
	
	// kanji
	[1, 'kindex'],

	// clipboard / save file
	[1, 'sfile'],
	[1, 'sfcs'],
	[0, 'smaxfe'],
	[0, 'smaxfk'],
	[0, 'smaxce'],
	[0, 'smaxck'],
	[0, 'snlf'],
	[1, 'ssep'],
	
	// not in GUI
	[0, 'popdelay'],
	[2, 'hidedef'],
	[2, 'checkversion']
//	[2, 'sticky']
];



function ppjPrefs() {
	this.branch = Components.classes['@mozilla.org/preferences-service;1']
		.getService(Components.interfaces.nsIPrefService)
		.getBranch('extensions.jperapera.');
}

ppjPrefs.prototype = {
	getString: function(key) {
		return this.branch.getComplexValue(key, Components.interfaces.nsISupportsString).data;
	},

	setString: function(key, value) {
		let s = Components.classes['@mozilla.org/supports-string;1']
			.createInstance(Components.interfaces.nsISupportsString);
		s.data = value;
		this.branch.setComplexValue(key, Components.interfaces.nsISupportsString, s);
	},

	getInt: function(key) {
		return this.branch.getIntPref(key)
	},

	setInt: function(key, value) {
		this.branch.setIntPref(key, value)
	},

	getBool: function(key) {
		return this.branch.getBoolPref(key)
	},

	setBool: function(key, value) {
		this.branch.setBoolPref(key, value)
	}
};
