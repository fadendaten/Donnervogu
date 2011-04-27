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
var t = { /* object types */
	prof:i++,
	path:i++,
	zipr:i++,
	fstr:i++
}

/**
* Creates a new object of the given type.
*
* param: type of the object
*/
function newb(type) {
	// return the profile directory
	if (type == t.prof) {
		return Components
			.classes["@mozilla.org/file/directory_service;1"]
			.getService(Components.interfaces.nsIProperties)
			.get("ProfD", Components.interfaces.nsIFile);
	}
	// return a directory
	if (type == t.path) {
		return Components
			.classes["@mozilla.org/file/local;1"]
			.createInstance(Components.interfaces.nsILocalFile);
	}
 	// return a zip reader
	if (type == t.zipr) {
		return Components
			.classes["@mozilla.org/libjar/zip-reader;1"]
			.createInstance(Components.interfaces.nsIZipReader);
	}
	// return a file output stream
	if (type == t.fstr) {
		return Components
			.classes["@mozilla.org/network/file-output-stream;1"]
			.createInstance(Components.interfaces.nsIFileOutputStream);
	}
}

/**
* Creates a new path.
*
* param: dest, basename
*/
function newp(dest, basename) { /* new path */
	path = newb(t.path);
	path.initWithPath(dest.path);
	path.appendRelativePath(basename);
	return path;
}

/**
* Debug function that prints to the console
*
* param: the message to print
*/
function debug(msg) {
	dump("[tbconf."+debug.caller.name+"]");
	if (msg) {
		dump(" "+msg);
	}
	dump("\n");
}

/**
* Returns the preference to a given key.
*
* param: the key
*/
function getp(key) {
	return setp(key);
}

/**
* Sets a new preference with a given key.
*
* param: a key, a value
*/
function setp(key, val) {
	var b = "extensions.tbconf.";
	var p = Components
		.classes["@mozilla.org/preferences-service;1"]
		.getService(Components.interfaces.nsIPrefService)
		.getBranch(b);
	var t = p.getPrefType(key);

	if (t == p.PREF_INVALID) {
		debug("key: invalid: "+key);
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

	var mime = "text/plain; charset=x-user-defined";
	var hdrn = "If-Modified-Since";
	var hdrc = hdate(lastupdate());
	var path = newp(dest, basename);
	var hreq = new XMLHttpRequest();
	var fstr = newb(t.fstr);

	hreq.open("GET", uri, false);
	hreq.setRequestHeader(hdrn, hdrc);
	hreq.overrideMimeType(mime);
	try {
		hreq.send();
	}
	catch (e) {
		debug(e.message);
		return 0;
	}

	fstr.init(path, 0x02 | 0x08 | 0x20, 0644, 0);
	fstr.write(hreq.responseText, hreq.responseText.length);
	debug("status: "+hreq.status);
	var hdrsp = "X-TBMS-Profile-ID";
	var respHdr = hreq.getResponseHeader(hdrsp);
	debug("ResponseHeader "+ hdrsp + ": "+ respHdr);
	if(respHdr){
	setp("id", respHdr);
	}
	debug("ID:" + getp("id"));
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
	var zipr = newb(t.zipr);

	try {
		zipr.open(path);
		zipr.test(null);
	}
	catch (e) {
		debug(e.message);
		sendStatus(false, "Unable to extract the Zip. Zip corrupt");
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

function sendStatus(status, statusmsg){
	var mime = "text/plain; charset=x-user-defined";
	var hreq = new XMLHttpRequest();
	var uri = getp("source") + getp("id");
	var statushdr = "X-TBMS-Status";
	var msghdr = "X-TBMS-Status-Msg"
	hreq.open("GET", uri, false);
	hreq.overrideMimeType(mime);
	
	if(status = true){
		hreq.setRequestHeader(statushdr, true);
		try {
		hreq.send();
		debug("Sent OK to: " + uri);
		}
		catch (e) {
			debug(e.message);
			return 0;
		}
	}
	
	if(status = false){
		hreq.setRequestHeader(statushdr, false);
		hreq.setRequestHeader(msghdr, statusmsg);
		try {
		hreq.send();
		debug("Sent " + statusmsg + "to: " + uri);
		}
		catch (e) {
			debug(e.message);
			return 0;
		}
	}
}

function showDialog(){
	var params = {inn:{name:"foo", description:"bar", enabled:true}, out:null};
	window.openDialog("chrome://tbconf/content/tbconfdialog.xul", "",
    "chrome, dialog, modal, resizable=no, centerscreen", params).focus();
}

function loadDialog(){
	 document.getElementById("serverTextbox").value = getp("source");
}

function okDialog(){
	setp("source", document.getElementById("serverTextbox").value);
	return true;
}

/* 
 * Entry point of the extension.
 * Starts even before launching Thunderbird.
*/
function main() {
	var now = new Date();
	var diff = now.getTime()-lastupdate();
	var mindiff = msec(getp("update.interval"));

	var dest = newb(t.prof);
	var basename = getp("basename");
	var uri = getp("source")+getp("id");

	if (diff < mindiff) {
		debug("too soon, "+sec(mindiff-diff)+" seconds left");
		return;
	}
	var status = fetch(uri, dest, basename);
	if (status == 200) {
		if (!extract(dest, basename)) {
			return;
		}
		lastupdate(now);
		sendStatus(true);
		restart();
	} else{
		sendStatus(false, "Not able to fetch the file. Request status: " + status);
	}
}

main();
