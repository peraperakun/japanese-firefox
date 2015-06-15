function onOK()
{
	var pb = Components
		.classes['@mozilla.org/preferences-service;1']
		.getService(Components.interfaces.nsIPrefService)
		.getBranch('jperapera.');
	if(document.getElementById('ppk-dontshow').checked)
			pb.setBoolPref('show_warning_dlg', false);
		
   	window.arguments[0].out = {proceed:true};
   	return true;
}