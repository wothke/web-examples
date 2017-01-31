This is a hack to compress arbitrary resource files to be used in some JavaScript 
based Web application (e.g. *.JSON, etc).

One may argue that a respective hack is unnecessary from the end-user perspective,
since a browser/proxy-server's built-in transmission compression is more 
effective/efficient.

Still there are two scenarios were the hack may be useful:

1) Supposing you have a limited bandwidth (e.g FTP) for *uploading* stuff to your 
web-server, then it helps if those files are already compressed.

2) Obfuscating your resource files.


approach:

Lossless PNG image compression is supported by practically all modern browsers.

When you put your arbitrary data into a bitmap and create a compressed PNG with it, 
the browser will be able to decompress it, and respective binary bitmap data can be 
accessed via JavaScript to retrieve the original data.

The genPNG.php script in this folder is invoked with the name of an arbitrary 
file. It will then generate an adequately sized bitmap and output 
a respective compressed PNG image that contains the original data (you can use any 
paint program that allows to store *.raw format to recover the original data). 
Note: The original data is padded with whitespace to match the dimensions of the 
bitmap - depending on the original file format you may need to remove this padding 
when interpreting the data.


Here the JavaScript logic that can be used to extract a respective ASCII file:


var oReq = new XMLHttpRequest();
oReq.open("GET", "/myfile.bin", true);
oReq.responseType = "arraybuffer";

oReq.onload = function(oEvent) {
	var image= new Blob([oReq.response], {type: "image/png"});

	URL.revokeObjectURL(image.currentSrc);
				
	var canvas = document.createElement("canvas");
	canvas.width = image.width; 
	canvas.height = image.height; 
	var ctx = canvas.getContext("2d"); 
	ctx.drawImage(image, 0, 0); 

	var imgData=ctx.getImageData(0,0,image.width,image.height).data;
	// alpha channel not used due to 7-bit limitations of GD lib
	var text = "";
	for (var i = 0; i < imgData.length; i++) {
		if (((i+1) % 4) > 0) {	// ignore alpha channel
			text += String.fromCharCode(imgData[i]);
		}
	}

	// .... the original file's data is now in "text"
...

};

oReq.send();

