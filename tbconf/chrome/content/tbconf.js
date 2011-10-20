/*
 * Copyright (c) 2011, Petar Bogdanovic, Thomas Rathgeb, Patrick Kraus
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
/*
 * tbconf.js, Thunderbird Configuration Extension main component.
 *
 * When launched during the initialization phase of Thunderbird, tbconf
 * first tries to determine an identification of the current profile.
 * This identification is either the e-mail address of the default
 * account or an id received during a previous run.  On success, tbconf
 * tries to fetch the corresponding configuration archive from a central
 * repository, extracts its entire content into the current profile
 * directory and restarts Thunderbird.
 *
 * While tbconf reports most failures, it also passes copies of certain
 * messages to the same central repository mentioned above.
 */

/**
 *	T, the global object type container.  Belongs to newb, contains
 *	abbreviated names of all object types newb is able to return.
 */
var i = 0;
var T = {
	prof:		i++,
	path:		i++,
	zipr:		i++,
	fstr:		i++
}

/**
 *	G, the global string container.  Contains various commonly used
 *	strings.  Some are dynamic and need initialization first.
 */
var G = {
	prefbranch:	"extensions.tbconf.",
	mimecs:		"text/plain; charset=x-user-defined",
	hupdate:	"", /* human readable last update */
	suri:		"", /* status uri */
	uri:		"",
	id:		""
}

/**
 *	newb, create new object
 *
 *	Creates and returns object of type `type'.
 */
function newb(type) {
	if (type == T.prof) {
		return Components
			.classes["@mozilla.org/file/directory_service;1"]
			.getService(Components.interfaces.nsIProperties)
			.get("ProfD", Components.interfaces.nsIFile);
	}
	if (type == T.path) {
		return Components
			.classes["@mozilla.org/file/local;1"]
			.createInstance(Components.interfaces.nsILocalFile);
	}
	if (type == T.zipr) {
		return Components
			.classes["@mozilla.org/libjar/zip-reader;1"]
			.createInstance(Components.interfaces.nsIZipReader);
	}
	if (type == T.fstr) {
		return Components
			.classes["@mozilla.org/network/file-output-stream;1"]
			.createInstance(Components.interfaces.nsIFileOutputStream);
	}
}

/**
 *	newp, create new path
 *
 *	Creates and returns path to file `basename' in directory `dest'.
 */
function newp(dest, basename) {
	path = newb(T.path);
	path.initWithPath(dest.path);
	path.appendRelativePath(basename);
	return path;
}

/**
 *	debug, print message
 *
 *	Prints `msg' and prefixes it with the name of the caller.  If
 *	`calo' (caller override) is set, it will override the real
 *	caller.
 */
function debug(msg, calo) {
	var cal = arguments.callee.caller.name;
	dump("[tbconf."+(calo ? calo : cal)+"]");
	if (msg) {
		dump(" "+msg);
	}
	dump("\n");
}

/**
 *	sdebug, forward & print message
 *
 *	Simple debug wrapper, forwards `msg' to the central repository
 *	and passes it to debug afterwards.
 */
function sdebug(msg) {
	var id = getp("id_is_addr") ? null : G.id;
	var hreq = new XMLHttpRequest();

	hreq.open("GET", G.suri, false);
	hreq.setRequestHeader("X-TBMS-Profile-ID", id);
	hreq.setRequestHeader("X-TBMS-Status", msg);
	hreq.overrideMimeType(G.mimecs);
	try {
		hreq.send();
	}
	catch (e) {
		debug(e.message);
		return 0;
	}

	debug("status: "+hreq.status);
	debug(msg, arguments.callee.caller.name);
}

/**
 *	getp, get preference
 *
 *	key: string, name of key, absolute if prefixed with "^",
 *		relative to G.prefbranch otherwise
 */
function getp(key) {
	return setp(key);
}

/**
 *	setp, set preference
 *
 *	key: string, name of key, absolute if prefixed with "^",
 *		relative to G.prefbranch otherwise
 *	val: string, value of key
 */
function setp(key, val) {
	var b = G.prefbranch;
	if (key.charAt(0) == "^") {
		b = null;
		key = key.substring(1);
	}
	var p = Components
		.classes["@mozilla.org/preferences-service;1"]
		.getService(Components.interfaces.nsIPrefService)
		.getBranch(b);
	var t = p.getPrefType(key);

	if (t == p.PREF_INVALID) {
		sdebug("key: invalid: "+key);
		return;
	}
	if (t == p.PREF_STRING) {
		if (!val) {
			return p.getCharPref(key);
		}
		return p.setCharPref(key, val);
	}
	if (t == p.PREF_INT) {
		if (!val) {
			return p.getIntPref(key);
		}
		return p.setIntPref(key, val);
	}
	if (t == p.PREF_BOOL) {
		if (!val) {
			return p.getBoolPref(key);
		}
		return p.setBoolPref(key, val);
	}
}

function pad(s) {
	return s<10?'0'+s:s; /* %02d, see printf(3) */
}

/**
 *	hdate, HTTP-date
 *
 *	Converts milliseconds since 01.01.1970 to HTTP-date, see:
 *		http://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
 */
function hdate(msec) {
	var date = new Date(msec);
	days = [
		"Mon", "Tue", "Wed", "Thu",
		"Fri", "Sat", "Sun"
	];
	mons = [
		"Jan", "Feb", "Mar", "Apr",
		"May", "Jun", "Jul", "Aug",
		"Sep", "Oct", "Nov", "Dec"
	];

	D = days[date.getUTCDay()];
	d = pad(date.getUTCDate());
	M = mons[date.getUTCMonth()];
	y = date.getUTCFullYear();
	h = pad(date.getUTCHours());
	m = pad(date.getUTCMinutes());
	s = pad(date.getUTCSeconds());

	/* Sat, 02 Apr 1998 14:18:22 GMT */
	return D+", "+d+" "+M+" "+y+" "+h+":"+m+":"+s+" GMT";
}

function fetch(uri, dest, basename) {
	debug(uri);

	var hdrn = "If-Modified-Since";
	var hdrc = hdate(lastupdate());
	var path = newp(dest, basename);
	var hreq = new XMLHttpRequest();
	var fstr = newb(T.fstr);

	/* set up and run http-request */
	hreq.open("GET", uri, false);
	hreq.setRequestHeader(hdrn, hdrc);
	hreq.overrideMimeType(G.mimecs);
	try {
		hreq.send();
	}
	catch (e) {
		sdebug(e.message);
		return 0;
	}

	/* read & write response data */
	fstr.init(path, 0x02 | 0x08 | 0x20, 0644, 0);
	fstr.write(hreq.responseText, hreq.responseText.length);
	debug("status: "+hreq.status);

	/* process response headers */
	hdrn = "X-TBMS-Profile-ID";
	hdrc = hreq.getResponseHeader(hdrn);
	debug(hdrn+": "+hdrc);
	setp("id", hdrc ? hdrc : getp("id"));

	return hreq.status;
}

/**
 *	lastupdate, get/set time and date of last update
 */
function lastupdate(date) {
	var key = "update.last";
	if (!date) {
		return parseInt(getp(key));
	}
	return setp(key, date.getTime()+"");
}

function extract(dest, basename) {
	var path = newp(dest, basename);
	var zipr = newb(T.zipr);

	try {
		zipr.open(path);
		zipr.test(null);
	}
	catch (e) {
		sdebug(e.message);
		return false;
	}

	var dent = zipr.findEntries("*/");
	var fent = zipr.findEntries("*[^/]");

	while (dent.hasMore()) {
		var e = dent.getNext();
		var d = newp(dest, e);

		if (d.exists()) {
			debug("d: ="+d.path);
			continue;
		}
		debug("d: +"+d.path);
		d.create(0x01, 0755);
	}

	while (fent.hasMore()) {
		var e = fent.getNext();
		var f = newp(dest, e);

		if (f.exists()) {
			debug("f: -"+f.path);
			f.remove(false);
		}
		debug("f: +"+f.path);
		zipr.extract(e, f);
	}
	zipr.close();
	return true;
}

/**
 *	restart, quit & start Thunderbird
 */
function restart() {
	debug();

	var apps = Components.interfaces.nsIAppStartup;
	var flag = apps.eRestart | apps.eAttemptQuit;

	if (!canQuitApplication()) {
		return;
	}
	Components
		.classes["@mozilla.org/toolkit/app-startup;1"]
		.getService(apps)
		.quit(flag);
}

/**
 *	msec, convert minutes to milliseconds
 */
function msec(min) {
	return min*60000;
}

/**
 *	sec, convert milliseconds to seconds
 */
function sec(msec) {
	return parseInt(msec/1000);
}

/**
 *	defacct, determine default account
 */
function defacct() {
	var dac = getp("^mail.accountmanager.defaultaccount");
	var ids = getp("^mail.account."+dac+".identities").split(",");
	return getp("^mail.identity."+ids[0]+".useremail");
}

function main() {
	var now = new Date();
	var diff = now.getTime()-lastupdate();
	var mindiff = msec(getp("update.interval"));

	var dest = newb(T.prof);
	var basename = getp("basename");

	if (diff < mindiff) {
		debug("too soon, "+sec(mindiff-diff)+" seconds left");
		return;
	}

	/* init human readable last update */
	G.hupdate = hdate(lastupdate());

	/* init status source */
	if (!(G.suri = getp("source.status"))) {
		if (!(G.suri = getp("source.root"))) {
			debug("no status source found, exiting");
			return;
		}
		G.suri += "/status/";
	}

	/* init profile id */
	G.id = getp("id");
	if (!G.id) {
		debug("no ID in prefs found, using default account");
		setp("id_is_addr", true);
		G.id = defacct();
	}
	if (!G.id) {
		sdebug("no default account found, exiting");
		setp("id_is_addr", false);
		return;
	}

	/* init profile source */
	if (!(G.uri = getp("source.profile"))) {
		if (!(G.uri = getp("source.root"))) {
			sdebug("no profile source found, exiting");
			return;
		}
		G.uri += "/profile/";
	}
	G.uri += G.id;

	if (fetch(G.uri, dest, basename) == 200) {
		if (!extract(dest, basename)) {
			return;
		}
		lastupdate(now);
		sdebug(); /* it's all good */
		restart();
	}
}

main();
