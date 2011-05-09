/**
 *	Script that drives the behaviour of the tbconf extension.
 *
 *	It executes before Thunderbird is launched. It connects to the TBMS server,
 *	downloads the .zip file containing the profile configuration settings
 *	for the corresponding client, unpacks them and starts up Thunderbird.
 *
 *	The URL of the server is specified in the preferences/prefs.js file.
 *
 *	authors: Bogdanovic Petar, Kraus Patrick, Rathgeb Thomas
 *
 *	https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsILocalFile
 *	https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIZipReader
 *	https://developer.mozilla.org/en/XMLHttpRequest
 *	https://developer.mozilla.org/en/PR_Open
 */
var i = 0;
var T = { /* global: object types */
	prof:		i++,
	path:		i++,
	zipr:		i++,
	fstr:		i++
}
var G = { /* global: shared strings */
	prefbranch:	"extensions.tbconf.",
	mimecs:		"text/plain; charset=x-user-defined",
	hupdate:	"", /* human readable last update */
	uri:		"",
	id:		""
}

function newb(type) { /* new object */
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

function newp(dest, basename) { /* new path */
	path = newb(T.path);
	path.initWithPath(dest.path);
	path.appendRelativePath(basename);
	return path;
}

function debug(msg, calo) { /* calo = caller override */
	var cal = arguments.callee.caller.name;
	dump("[tbconf."+(calo ? calo : cal)+"]");
	if (msg) {
		dump(" "+msg);
	}
	dump("\n");
}

function sdebug(msg) { /* debug & send status */
	var hdrn = "X-TBMS-Status";
	var hdrc = msg;
	var hreq = new XMLHttpRequest();

	hreq.open("GET", G.uri, false);
	hreq.setRequestHeader(hdrn, hdrc);
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
 *	get preference
 *
 *	key: string, name of key, absolute if prefixed with "^",
 *		relative to G.prefbranch otherwise
 */
function getp(key) {
	return setp(key);
}

/**
 *	set preference
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
	return s<10?'0'+s:s;
}

function hdate(msec) { /* HTTP-date */
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
		debug(e.message);
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

function msec(min) { /* milliseconds */
	return min*60000;
}

function sec(msec) { /* seconds */
	return parseInt(msec/1000);
}

function defacct() { /* default account */
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

	/* init global/shared strings */
	G.id = getp("id");
	if (!G.id) {
		debug("no ID in prefs found, using default account");
		G.id = defacct();
	}
	if (!G.id) {
		debug("no default account found, exiting");
		return;
	}
	G.uri = getp("source")+G.id;
	G.hupdate = hdate(lastupdate());

	if (diff < mindiff) {
		debug("too soon, "+sec(mindiff-diff)+" seconds left");
		return;
	}

	if (fetch(G.uri, dest, basename) == 200) {
		if (!extract(dest, basename)) {
			return;
		}
		lastupdate(now);
		restart();
	}
}

main();
