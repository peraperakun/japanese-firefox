var jkotobabar = {
	
	_userEntryDelim: "\t",
	_userEntryFilename: "userentries.txt",
	
    onLoad: function(e) {
    	try
    	{
			var prefs = Components.classes['@mozilla.org/preferences-service;1']
				.getService(Components.interfaces.nsIPrefService)
				.getBranch('extensions.jperapera.');
				
	    	_userEntryFilename = "userentries.txt"; 
	    	_userEntryDelim = "\t";
	    	
	    	var dir = Components.classes["@mozilla.org/file/directory_service;1"]
		                         .getService(Components.interfaces.nsIProperties)
		                         .get("ProfD", Components.interfaces.nsILocalFile);
		    dir.append("jperapera");
		    if(dir.exists())
		    {
				var file = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsILocalFile);
				
				var sep = null;
		    	if (dir.path.search(/\\/) != -1)
					sep = "\\";
				else
					sep = "/";
				
				file.initWithPath(dir.path + sep + _userEntryFilename);
	
				if ( file.exists() == false ) {
					return;
				}
				var charset = "utf-8"; // Can be any character encoding name that Mozilla supports; // Can be any character encoding name that Mozilla supports
				
				const replacementChar = Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER;
				
				var fis = Components.classes["@mozilla.org/network/file-input-stream;1"]
					.createInstance( Components.interfaces.nsIFileInputStream );
				fis.init( file,0x01, 00004, null);
	
				var is = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
	                   .createInstance(Components.interfaces.nsIConverterInputStream);
				is.init(fis, charset, 1024, replacementChar);                   
				
				var str = {};
				var splitter = null;
				switch(prefs.getIntPref("snlf"))
				{
					case 0: //unix
					splitter = '\n';
					break;
					case 1: //windows
					splitter = '\r\n'
					break;
					case 2: //mac
					splitter = '\r';
					break;
				}
				while (is.readString(4096, str) != 0) {
					
					var lines = str.value.split(splitter);
					for(var ii = 0; ii < lines.length; ii++)
					{
						var temp = lines[ii].split(_userEntryDelim);
						if(temp.length != 3)
							continue;
						this.addEntry(temp[0],temp[1],temp[2])
					}
				}
				
				is.close();
				fis.close();
		    }
    	}
    	catch(ex)
    	{
    		alert("Error loading user entries, ex=" + ex);
    	}
    },
    
    onUnload: function(e) {
        this.saveUserEntries();
    },

	E: function(e) 
	{
		return document.getElementById(e);
	},
	
	removeAllEntries: function()
	{
		var listBox = this.E("entriesListbox");
		var listBoxChilds = listBox.childNodes;
		for(ii = 0; ii < listBoxChilds.length; ii++)
		{
			if(listBoxChilds[ii].nodeName != "listitem")
				continue;
			listBox.removeChild(listBoxChilds[ii]);
			ii--;
		}
	},
	
	removeSelectedEntries: function()
	{
		if(!this.atLeastOneChecked())
			return; 	

		//give user an option to bail 
		//var params = {inn:{name:"foo", description:"bar", enabled:true}, out:null};       
		var pb = Components
			.classes['@mozilla.org/preferences-service;1']
			.getService(Components.interfaces.nsIPrefService)
			.getBranch('extensions.jperapera.');
		
		if(pb.getBoolPref('show_warning_dlg') == true)
		{
			var params = {out:null};
		    window.openDialog("chrome://jperapera/content/jkotobabar/yesnodialog.xul", "",
		      "chrome, dialog, modal, centerscreen, resizable=no", params).focus();
		    if (!params.out) 
				return;
		}
		
		var listBox = this.E("entriesListbox");
		var listBoxChilds = listBox.childNodes;
		for(ii = 0; ii < listBoxChilds.length; ii++)
		{
			if( (listBoxChilds[ii].nodeName == "listitem") && 
				(listBoxChilds[ii].childNodes[0].childNodes[0].checked == true) )
			{
				listBox.removeChild(listBoxChilds[ii]);
				ii--;
			}
		}
	},
	
	fillListboxWithEntries: function()
	{
		//dump("begin: fillListboxWithEntries()\n");
		var entries = this.getEntries();
		//dump(entries.length + " entries passed.\n")
		var ii;
		
		this.removeAllEntries();
		var listBox = this.E("entriesListbox");
		
		//add all passed entries
		for(ii = 0; ii < entries.length; ii++)
		{
			var entry = entries[ii];
			if(entry.length != 3)
			{
				alert("Problem importing entries...died on #" + ii);
				return;
			}
			//should be in order: word, reading, meaning
			var newItem = document.createElement("listitem");
			newItem.addEventListener('click', function(){jkotobabar.toggleCheck('pera_sbcb' + ii);}, false);
			var newCell = document.createElement("listcell");
	
			
			var newCheckbox = document.createElement("checkbox");
			newCheckbox.id = "pera_sbcb" + ii;
			newCell.appendChild(newCheckbox);
			newItem.appendChild(newCell);
			
			newCell = document.createElement("listcell");
			newCell.setAttribute("label", entry[0]);
			newItem.appendChild(newCell);
			
			newCell = document.createElement("listcell");
			newCell.setAttribute("label", entry[1]);
			newItem.appendChild(newCell);
			
			newCell = document.createElement("listcell");
			newCell.setAttribute("label", entry[2]);
			newItem.appendChild(newCell);
			
			listBox.appendChild(newItem);
		}
		//dump("end: fillListboxWithEntries()\n");
	},
	
	addEntry: function(word, reading, meaning)
	{
		//dump("begin: addEntry()\n");
		var listBox = this.E("entriesListbox");
		var listBoxChilds = listBox.childNodes;
			
		var count = 0;
		var ii;
		for(ii = 0; ii < listBoxChilds.length; ii++)
		{
			if(listBoxChilds[ii].nodeName == "listitem")
			count++;
		}
		
		//dump("next checkbox#: "+count);
		//should be in order: word, reading, meaning
		var newItem = document.createElement("listitem");
		newItem.addEventListener('click', function() {jkotobabar.toggleCheck('pera_sbcb' + count);}, false);
		var newCell = document.createElement("listcell");
		
		var newCheckbox = document.createElement("checkbox");
		newCheckbox.id = "pera_sbcb" + count;
		newCell.appendChild(newCheckbox);
		newItem.appendChild(newCell);
		
		newCell = document.createElement("listcell");
		newCell.setAttribute("label", word);
		newItem.appendChild(newCell);
		
		newCell = document.createElement("listcell");
		newCell.setAttribute("label", reading);
		newItem.appendChild(newCell);
		
		newCell = document.createElement("listcell");
		newCell.setAttribute("label", meaning);
		newItem.appendChild(newCell);
		
		listBox.appendChild(newItem);
		
		//dump("end: addEntry()\n");
	},
	
	setAllCheckboxes:  function(setCheckedTo)
	{
		var listBoxChilds = this.E("entriesListbox").childNodes;
			
		var ii = 0;
		for(ii = 0; ii < listBoxChilds.length; ii++)
		{
			if(listBoxChilds[ii].nodeName != "listitem")
				continue;
			var theCheckBox = listBoxChilds[ii].childNodes[0].childNodes[0];
			theCheckBox.checked = setCheckedTo;
		}
		
	},
	
	toggleCheck: function(checkBoxID)
	{
		var theCheckBox = document.getElementById(checkBoxID);
		if (theCheckBox) theCheckBox.checked = !theCheckBox.checked;
	},
	
	atLeastOneChecked: function()
	{
		var listBoxChilds = this.E("entriesListbox").childNodes;
			
		var ii = 0;
		for(ii = 0; ii < listBoxChilds.length; ii++)
		{
			if(listBoxChilds[ii].nodeName != "listitem")
				continue;
			var theCheckBox = listBoxChilds[ii].childNodes[0].childNodes[0];
			if(theCheckBox.checked == true)
			{
				return true;
			}
		}
		return false;
	},
	
	grabEntries: function()
	{
		//dump("in testMe()\n");
		var mainWindow = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIWebNavigation)
                   .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                   .rootTreeItem
                   .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIDOMWindow); 
		var mainDoc = mainWindow.content.document; 
		var ii = 0;
		var word;
		var meaning;
		
		var allChecks = mainDoc.getElementsByClassName("ppk_check");
		
		for(var ii = 0; ii < allChecks.length; ii++)
		{
			if(allChecks[ii].checked)
			{
				var jword = allChecks[ii].getAttribute("ppk_jword");
				var eword = allChecks[ii].getAttribute("ppk_eword");
				
				this.addEntry(jword,"",eword);
				allChecks[ii].checked = false;
				//dump("saved: " + jword + ", " + eword);
			}
		}
		//dump("out testMe()\n");
	},
	saveUserEntries: function()
	{
		var dir = Components.classes["@mozilla.org/file/directory_service;1"]
			.getService(Components.interfaces.nsIProperties)
			.get("ProfD", Components.interfaces.nsILocalFile);
	    dir.append("jperapera");
		
	    if (!dir.exists()) 
	      dir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
	      
		var sep = null;
	    if (dir.path.search(/\\/) != -1)
			sep = "\\";
		else
			sep = "/";

		this.exportToFile(this._userEntryDelim, dir.path + sep + _userEntryFilename, true);
	},
	
	exportToFile: function(delim, filenameString, savingUserEntries)
	{
		var prefs = Components.classes['@mozilla.org/preferences-service;1']
			.getService(Components.interfaces.nsIPrefService)
			.getBranch('extensions.jperapera.');
		try
		{
			if( (savingUserEntries == null || savingUserEntries == false) && !this.atLeastOneChecked())
			{
				alert("No entries selected to export.");
				return; 	
			}
			
			var isEdictFormat = false;
			if(delim == null)
			{

				var ssep = prefs.getCharPref("ssep");
				switch(ssep.toLowerCase())
				{
					case "edict":
						isEdictFormat = true;
					break;
					case "comma":
						delim = ',';
					break;
					case "space":
						delim = ' ';
					break;
					case "tab":
						delim = '\t';
					break;
				}
				
			}
			
			var filename = null;
			if(filenameString == null)
			{
				var nsIFilePicker = Components.interfaces.nsIFilePicker;
				var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
				fp.init(window, "Select a Destination", nsIFilePicker.modeSave);
				fp.appendFilters(nsIFilePicker.filterText | nsIFilePicker.filterAll);
		
				var rv = fp.show();
				if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace)
				{
					filename = fp.file;
					//dump("user chose to save file: " + filename.path + "\n");
				}
				else
					return;
			}
			else
			{
				filename = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsILocalFile);
				filename.initWithPath(filenameString);
		
			}
			// Get the path as string. Note that you usually won't 
			// need to work with the string paths.
			//var path = fp.file.path;
			// work with returned nsILocalFile...
			
			//always save user entries in utf-8
			var charset;
			if(savingUserEntries == null || savingUserEntries == false)
				charset = prefs.getCharPref("sfcs");
			else
				charset = "utf-8";
	
			var os = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
			                   .createInstance(Components.interfaces.nsIConverterOutputStream);
	
			// file is nsIFile, data is a string
			var fos = Components.classes["@mozilla.org/network/file-output-stream;1"].
			                         createInstance(Components.interfaces.nsIFileOutputStream);
			
			// use 0x02 | 0x10 to open file for appending.
			fos.init(filename, 0x02 | 0x08 | 0x20, 0666, 0); 
			os.init(fos, charset, 0, 0x0000);
	
			// write, create, truncate
			// In a c file operation, we have no need to set file mode with or operation,
			// directly using "r" or "w" usually.
			//foStream.write(data, data.length);
			//foStream.close();
				// tis assumes that fos is the nsIOutputStream
			 //you want to write to
	
		
			//dump(isDelimited == true ? "outputting tab format\n" : "outputting edict format\n");
			
			var listBoxChilds = this.E("entriesListbox").childNodes;
			//dump(listBoxChilds.length + " entries found\n");
			var ii = 0;
			for(ii = 0; ii < listBoxChilds.length; ii++)
			{
				if(listBoxChilds[ii].nodeName != "listitem")
					continue;
					
				var listItemChilds = listBoxChilds[ii].childNodes;
				////dump("entry " + ii + ", nodeType: " + listItemChilds.nodeType + ", nodeName: " + listItemChilds.nodeName + "\n");
				
				var outputEntry = null;
				if(savingUserEntries == null || savingUserEntries == false)
					outputEntry = listItemChilds[0].childNodes[0].checked;
				else
					outputEntry = true;

				if(outputEntry)
				{
					var t = listItemChilds[1];

					var word = listItemChilds[1].getAttribute("label");
					var reading = listItemChilds[2].getAttribute("label");
					var meaning = listItemChilds[3].getAttribute("label");
					meaning = meaning.replace(/\r/g, ''); //cant kill this pesky carrige return any other way
					
					var strOut;
					if(isEdictFormat)
						strOut = word + " [" + reading + "] /" + meaning + "/";
					else //delimited
						strOut = word + delim + reading + delim + meaning;
					
					switch(prefs.getIntPref("snlf"))
					{
						case 0: //unix
						strOut += '\n';
						break;
						case 1: //windows
						strOut += '\r\n'
						break;
						case 2: //mac
						strOut += '\r';
						break;
					}
					os.writeString(strOut);
				}
			}
			os.close();
			fos.close();
		}
		catch(ex)
		{
			alert("Unable to export file, ex=" + ex);
		}
	},
	
	copyToClipboard: function()
	{
		if(!this.atLeastOneChecked())
		{
			alert("No entries selected to export.");
			return; 	
		}
		
		delim = "\t";
		var isDelimited = false;
		var isEdictFormat = false;
		
		if(delim != null)
			isDelimited = true;
		else{
			var params = {out:null};
			window.openDialog("chrome://jperapera/content/jkotobabar/exportdialog.xul", "",
		      "chrome, dialog, modal,centerscreen, resizable=no", params).focus();

		    if (!params.out) 
		    {
		    	//dump("noparams back \n");
				return;
		    }
		    else
		    {
		    	if(params.out.edict)
		    	{
		    		isEdictFormat = true;
		    		//dump("edict format");
		    	}
		    	else
		    	{
		    		isDelimited = true;
		    		delim = params.out.delimiter;
		    		//dump("delimited format with delimiter: " + delim);
		    	}
		    }
		}
	
		//dump(isDelimited == true ? "outputting tab format\n" : "outputting edict format\n");
		
		var listBoxChilds = this.E("entriesListbox").childNodes;
		//dump(listBoxChilds.length + " entries found\n");
		
		var ii = 0;
		var allEntriesString = "";
		for(ii = 0; ii < listBoxChilds.length; ii++)
		{
			if(listBoxChilds[ii].nodeName != "listitem")
				continue;
				
			var listItemChilds = listBoxChilds[ii].childNodes;
			////dump("entry " + ii + ", nodeType: " + listItemChilds.nodeType + ", nodeName: " + listItemChilds.nodeName + "\n");
			
			outputEntry = listItemChilds[0].childNodes[0].checked;

			//dump("output entry? " + (outputEntry == true ? "yes\n" : "no\n"));
			if(outputEntry)
			{
				var t = listItemChilds[1];
				//dump("nodeType: " + t.nodeType + ", nodeName: " + t.nodeName + "\n");
				var word = listItemChilds[1].getAttribute("label");
				var reading = listItemChilds[2].getAttribute("label");
				var meaning = listItemChilds[3].getAttribute("label");
				//dump("word: " + word + ", reading: " + reading + ", meaning: " + meaning + "\n");
				if(isDelimited)
				{
					var strOut = word + delim + reading + delim + meaning + "\n";
					allEntriesString += strOut;
				}
				else if(isEdictFormat)
				{
					var strOut = word + " [" + reading + "] /" + meaning + "/\n";
					//dump("output edict format: " + strOut);
					allEntriesString += strOut;
				}
			}
		}
		Components.classes['@mozilla.org/widget/clipboardhelper;1']
			.getService(Components.interfaces.nsIClipboardHelper)
			.copyString(allEntriesString);
	}
};

window.addEventListener("load", function(e) { jkotobabar.onLoad(e); }, false);
window.addEventListener("unload", function(e) { jkotobabar.onUnload(e); }, false);