This example shows how to play mp3 files from Soundcloud on your webpage.

	see: https://www.wothke.ch/ablaze/#/atomdelta/atom-delta-panda-cube

The implementation is purely HTML/Javascript - PHP based, i.e. no additional
infrastructure is required. A proxy script is used to avoid any cross domain
access issues.

	usage: 	copy this folder into some content folder of your webserver
		then call: 

		http://[PATH TO THIS FOLDER]/#/mastatron/mastatron-united

		(use whatever Soundcloud permalink you like after the #)
			
Precondition: You'll first need to configure a valid Soundcloud client-id 
in the proxy.php to get any data from Soundcloud.